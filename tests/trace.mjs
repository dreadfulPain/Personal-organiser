import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// DOES WHAT YOU TYPE ACTUALLY GET WHERE IT'S GOING?
//
// Two questions. One: for each kind of thing the front door can produce, does
// it land in a store, and is there a tab that shows that store? Two: when the
// thing is long-term, does the app do anything to PREPARE for it, or just file
// it somewhere and go quiet?
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
const REPO = REPO_ROOT;
const P = (f) => path.join(REPO, "public", f);
const read = (f) => fs.readFileSync(P(f), "utf8");
let pass = 0, fail = 0;
const ok = (n,c,e) => { if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,320):""));} };
const sec = (s) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

// ---- 1. every store has a tab that shows it -------------------------------
sec("Each store, and the tab that shows it");
const pages = fs.readdirSync(path.join(REPO, "public")).filter((f) => f.endsWith(".html"));
const TABS = read("nav.js");
const STORES = {
  items: "what you type that's a thing to do",
  waiting: "what you're waiting on someone for",
  goals: "goals",
  records: "notes about a person",
  contacts: "people",
  portfolio: "your own evidence",
  schedule: "your week",
  pastoralNotes: "what you know besides the marks",
  pastoralTopics: "the headings those notes sit under",
  toldLog: "what you told whom",
};
Object.entries(STORES).forEach(([key, what]) => {
  const shownBy = pages.filter((pg) => {
    const loaded = [...read(pg).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    return loaded.some((f) => {
      if (!f.endsWith(".js")) return false;
      try { return new RegExp(`data\\.${key}\\b|state\\.${key}\\b`).test(read(f)); } catch { return false; }
    });
  });
  const inNav = shownBy.some((pg) => TABS.includes(`"${pg}"`));
  ok(`${key} — ${what}`, shownBy.length > 0 && inNav,
     shownBy.length ? `read by ${shownBy.join(", ")} but none of those is in the tab bar` : "no page reads it");
});

// ---- 2. each kind the front door makes reaches a store --------------------
sec("Each kind the front door can produce");
const capture = read("capture.js");
[["task", "state.items.push"], ["record", "state.records.unshift"],
 ["goal", "state.goals.unshift"], ["handover", "state.contacts.unshift"]].forEach(([kind, lands]) => {
  ok(`a ${kind} lands somewhere`, capture.includes(lands), `expected ${lands}`);
});
ok("a follow-up spawned by a record becomes a real task", /spawnFollowUp\(rec, e\.record\.follow_up_date, state\.items\)/.test(capture));
ok("everything saved goes through one save", /OrganiserStore\.save/.test(capture));

// ---- 3. the whole trip, run for real --------------------------------------
sec("A sentence typed on Home, followed all the way to the day plan");
const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","priority.js","dayplan.js","weekplan.js","goalplan.js","names.js","quickparse.js","planpaste.js"]
  .forEach((f) => vm.runInContext(read(f), sb));
const S = sb.window.OrganiserSchedule, DP = sb.window.OrganiserDayPlan,
      WP = sb.window.OrganiserWeekPlan, GP = sb.window.OrganiserGoalPlan,
      Q = sb.window.OrganiserQuickParse, PP = sb.window.OrganiserPlanPaste;
// Anchor to a weekday. The real clock might be a Saturday, and the fixture
// blocks weekends — a day plan with no room proves nothing about the day plan.
const REAL = S.isoOf(new Date());
const TODAY = (() => {
  let d = REAL;
  for (let i = 0; i < 7; i++) {
    const dow = new Date(d + "T12:00:00").getDay();
    if (dow >= 1 && dow <= 5) return d;
    d = S.addDaysISO(d, 1);
  }
  return REAL;
})();
const plus = (n) => S.addDaysISO(TODAY, n);
const CFG = { dayStart: "08:00", dayEnd: "17:00" };
const SCHED = [{ id:"l", label:"Lessons", start:"09:00", end:"12:00", days:[1,2,3,4,5] },
               { id:"w", label:"Weekend", start:"08:00", end:"16:55", days:[0,6], blocksDay:true }];
const CTX = { today: TODAY, goalTitle: () => "" };

// The capture path's own field list, copied from capture.js — if that list ever
// drops a field again, this notices.
function throughCapture(parsed) {
  return {
    id: "x", title: parsed.title, type: parsed.type || "task", date: parsed.date || "",
    notBefore: /^\d{4}-\d{2}-\d{2}$/.test(parsed.notBefore || "") ? parsed.notBefore : "",
    time: parsed.time || "", deadlineType: parsed.deadlineType === "hard" ? "hard" : "soft",
    importance: parsed.importance || "normal", effort: parsed.effort || "medium",
    plannedMinutes: Math.max(0, Math.round(Number(parsed.plannedMinutes) || 0)),
    spentMinutes: 0, optional: parsed.optional === true, committed: parsed.committed === true,
    tags: [], whenText: "", goalId: "", openLoop: parsed.openLoop === true,
    promisedTo: parsed.promisedTo || "", waitingOn: parsed.waitingOn || "", done: false,
  };
}
const typed = throughCapture(Q.parse("urgent: send the safeguarding form today", { contacts: [] }));
ok("it read the urgency", typed.importance === "high");
// "today" means the real today, not the weekday this test plans on. If the
// real clock is a Saturday those differ, and the parser is right.
ok("it read the date", typed.date === REAL, `${typed.date} vs real ${REAL}`);
ok("the label came out of the title", !/urgent/i.test(typed.title), typed.title);
const dayPlan = DP.build([typed], SCHED, CFG, TODAY, { ctx: CTX });
ok("and it appears on the plan", dayPlan.slots.some((s) => s.itemId === "x"),
   JSON.stringify(dayPlan.slots));
ok("a hard deadline that's already passed is still planned, not abandoned",
   DP.build([{ ...typed, date: S.addDaysISO(REAL, -9), deadlineType: "hard" }], SCHED, CFG, TODAY, { ctx: CTX })
     .slots.length === 1);

sec("Something long-term, typed as one line");
const far = throughCapture(Q.parse("write the year 11 mock reports by " + plus(40).slice(8) + " december", { contacts: [] }));
far.date = plus(40); far.deadlineType = "hard"; far.id = "far";
ok("a job due in six weeks is on the day plan as filler, not invisible",
   DP.build([far], SCHED, CFG, TODAY, { ctx: CTX }).slots.some((s) => s.itemId === "far"));
ok("the week books it before it's due",
   WP.spread([far], SCHED, CFG, TODAY, 60, CTX).placements.some((p) => p.iso <= plus(40)));
ok("and it isn't reported as trouble when there's plenty of room",
   !WP.trouble([far], SCHED, CFG, TODAY, 60, CTX).some((t) => t.itemId === "far"));

sec("A GOAL typed as one line on Home");
// This is what capture.js actually does with kind:"goal".
const capturedGoal = { id: "g1", title: "Get the IB certificate", createdAt: "", milestones: [] };
const goalItems = [];  // nothing is created alongside it
ok("it becomes a goal", !!capturedGoal.title);
ok("with no milestones", capturedGoal.milestones.length === 0);
ok("and no work behind it", goalItems.length === 0);
const r = GP.rate(capturedGoal, goalItems, SCHED, CFG, TODAY);
ok("so there is nothing to measure", r.total === 0);
ok("and the app says so rather than pretending", /add the pieces/i.test(GP.words(r)), GP.words(r));
ok("nothing about it reaches the day plan",
   DP.build(goalItems, SCHED, CFG, TODAY, { ctx: CTX }).slots.length === 0);

sec("The same goal, PASTED as a plan");
const pasted = PP.parse(
  `Get the IB certificate\nDeadline: ${plus(60)}\n\n## Work out what's needed\n- Read the standards (2 hours)\n- List the evidence (45 min)\n\n## Gather it\n- Write the commentary (4 hours)`,
  { today: TODAY });
const g2 = { id: "g2", title: pasted.title, date: pasted.date };
const made = pasted.milestones.flatMap((m, mi) =>
  m.steps.map((st, i) => ({ ...GP.taskFromStep(g2, st, CFG), id: `p${mi}${i}` })));
ok("it becomes a goal WITH work behind it", made.length === 3);
ok("carrying the deadline", made.every((t) => t.date === pasted.date), pasted.date);
ok("and its own sizes", made.map((t) => t.plannedMinutes).join(",") === "120,45,240");
const r2 = GP.rate(g2, made, SCHED, CFG, TODAY);
ok("now there is something to measure", r2.total === 405);
ok("and a rate to keep to", r2.needPerDay > 0 && r2.daysLeft > 0);
const dp2 = DP.build(made, SCHED, CFG, TODAY, { ctx: CTX });
ok("the day plan offers a piece of it today", dp2.slots.length > 0,
   JSON.stringify(dp2.slots.map((s) => s.itemId)));
ok("the week books the big piece in sittings before the deadline",
   WP.spread(made, SCHED, CFG, TODAY, 90, CTX).placements.length >= 3);

sec("And the long-term thing is prepared for, not just filed");
{
  // Six hours of work, five weeks out, on a schedule with ~4h free a day.
  const big = { ...GP.taskFromStep({ id:"g3", title:"x", date: plus(35) },
    { title:"the big pile", minutes: 6*60 }, CFG), id:"big" };
  const spread = WP.spread([big], SCHED, CFG, TODAY, 60, CTX);
  ok("it's split into sittings, not left whole", spread.placements.length > 1, spread.placements.length);
  const firstDay = spread.placements.map((p) => p.iso).sort()[0];
  const daysUntilStart = Math.round((new Date(firstDay) - new Date(TODAY)) / 86400000);
  ok("and started soon, not saved up for the end", daysUntilStart <= 7, `${daysUntilStart} days`);
  const lastDay = spread.placements.map((p) => p.iso).sort().pop();
  ok("finishing before it's due", lastDay <= plus(35), lastDay);

  // The same pile with no time to do it in must be SAID, early.
  // Genuinely impossible: forty hours, due the day after tomorrow. Six hours in
  // three days is not a squeeze, it's a comfortable week — the earlier version
  // of this fixture proved nothing.
  const squeezed = { ...GP.taskFromStep({ id:"g4", title:"x", date: plus(2) },
    { title:"far too much", minutes: 40*60 }, CFG), id:"sq" };
  const t = WP.trouble([squeezed], SCHED, CFG, TODAY, 60, CTX);
  ok("an impossible one is named", t.some((x) => x.itemId === "sq"), JSON.stringify(t));
  ok("with how short it is", t[0] && t[0].short > 0);
  ok("and how many days are left", t[0] && t[0].daysLeft === 2, t[0] && t[0].daysLeft);
  ok("said while there is still time to ask someone", t[0] && t[0].daysLeft > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
