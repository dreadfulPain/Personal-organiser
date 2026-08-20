import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import { checker } from "./_check.mjs";
const { ok, done: finish } = checker();
// A WHOLE WORKING WEEK. Uneven days, work due on different days, and two
// unscripted events. Walks Monday to Friday day by day, exactly as the app
// would: build the day, do what's planned, carry the rest into tomorrow.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","weekplan.js","names.js","quickparse.js"];
function load(DateImpl) {
  const sb = { window:{}, console, Date:DateImpl, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const MON = "2026-09-14";
const DAYS = ["2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18"];
const NAME = { "2026-09-14":"MONDAY", "2026-09-15":"TUESDAY", "2026-09-16":"WEDNESDAY",
               "2026-09-17":"THURSDAY", "2026-09-18":"FRIDAY" };
// The clock must sit on the simulated Monday or relative dates resolve to the
// real today and every result is quietly wrong. Learned that the hard way.
const FROZEN = new Date(`${MON}T08:00:00`).getTime();
class MonDate extends Date {
  constructor(...a) { if (!a.length) super(FROZEN); else super(...a); }
  static now() { return FROZEN; }
}
const W = load(MonDate);
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan, Q = W.OrganiserQuickParse;
const HM = (m) => S.toHM(m);

// ---- an uneven week. Wednesday is brutal, Friday is quiet. -----------------
const SCHED = [
  { id:"reg",  label:"Registration",      start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"brief",label:"Staff briefing",    start:"08:20", end:"08:40", days:[1] },
  // Monday: 3 lessons
  { id:"m1", label:"P1 Year 7 English",   start:"09:00", end:"09:50", days:[1] },
  { id:"m3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[1] },
  { id:"m5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[1] },
  // Tuesday: 4 lessons + duty + after school
  { id:"t1", label:"P1 Year 9 English",   start:"09:00", end:"09:50", days:[2] },
  { id:"t2", label:"P2 Year 7 English",   start:"09:55", end:"10:45", days:[2] },
  { id:"t3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[2] },
  { id:"t5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[2] },
  { id:"tdu",label:"Lunch duty",          start:"12:30", end:"13:15", days:[2,4] },
  { id:"tdp",label:"Department meeting",  start:"15:10", end:"16:10", days:[2] },
  // Wednesday: 6 lessons, barely a gap
  { id:"w1", label:"P1 Year 7 English",   start:"09:00", end:"09:50", days:[3] },
  { id:"w2", label:"P2 Year 9 English",   start:"09:55", end:"10:45", days:[3] },
  { id:"w3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[3] },
  { id:"w4", label:"P4 Year 10 English",  start:"11:55", end:"12:30", days:[3] },
  { id:"w5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[3] },
  { id:"w6", label:"P6 Year 12 Lit",      start:"15:05", end:"15:55", days:[3] },
  // Thursday: 3 lessons + duty
  { id:"h1", label:"P1 Year 9 English",   start:"09:00", end:"09:50", days:[4] },
  { id:"h3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[4] },
  { id:"h5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[4] },
  // Friday: 2 lessons. The quiet day.
  { id:"f2", label:"P2 Year 7 English",   start:"09:55", end:"10:45", days:[5] },
  { id:"f5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[5] },
  { id:"brk",label:"Break",               start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"lun",label:"Lunch",               start:"12:30", end:"13:15", days:[1,3,5] },
];
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
const CONTACTS = [{ id:"c1", name:"Helen Zhou" }, { id:"c2", name:"王伟" }];

// ---- the week's work, typed as sentences --------------------------------
// A spread: due-today, due-later, hard, high, promised, and floaty.
const SENTENCES = [
  "urgent: send the safeguarding form today",
  "email Helen about the trip money",
  "mark the year 9 essays by wednesday",
  "write the year 11 mock report by friday",
  "book the hall for the assembly",
  "order new whiteboard pens",
  "plan out the year 8 poetry unit by thursday",
  "reply to the parent email about homework",
  "important: finish the department budget by friday",
  "tidy the stockroom sometime",
  "print the year 7 knowledge organisers by tuesday",
  "chase 王伟 about the exchange forms",
];
// What a good extraction gives: same sentences, dates and weights read properly.
const AI = [
  ["Send the safeguarding form",              MON,          "hard","high",  "quick"],
  ["Email Helen about the trip money",         "",           "soft","normal","quick","Helen Zhou"],
  ["Mark the year 9 essays",                   DAYS[2],      "hard","normal","draining"],
  ["Write the year 11 mock report",            DAYS[4],      "hard","normal","draining"],
  ["Book the hall for the assembly",           "",           "soft","normal","quick"],
  ["Order new whiteboard pens",                "",           "soft","low",   "quick"],
  ["Plan the year 8 poetry unit",              DAYS[3],      "hard","normal","draining"],
  ["Reply to the parent email",                MON,          "soft","normal","medium"],
  ["Finish the department budget",             DAYS[4],      "hard","high",  "draining"],
  ["Tidy the stockroom",                       "",           "soft","low",   "medium"],
  ["Print the year 7 knowledge organisers",    DAYS[1],      "hard","normal","medium"],
  ["Chase 王伟 about the exchange forms",       "",          "soft","normal","quick","王伟"],
].map(([title,date,deadlineType,importance,effort,promisedTo],i)=>({
  id:"ai"+i, title, date, deadlineType, importance, effort, promisedTo: promisedTo||"",
  type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false, waitingOn:"", done:false }));

const QP = SENTENCES.map((s,i)=>({ id:"qp"+i, done:false, ...Q.parse(s,{ contacts: CONTACTS }) }));

// ---- walking the week ------------------------------------------------------
const pad = (s,n) => String(s).padEnd(n);
function runWeek(label, seed, events) {
  const items = seed.map(x=>({...x}));
  let sched = S.normalise(SCHED);
  const log = [];
  console.log(`\n${"█".repeat(72)}\n${label}\n${"█".repeat(72)}`);

  DAYS.forEach((iso, di) => {
    const ev = (events||[]).find(e => e.iso === iso);
    const ctx = { today: iso, goalTitle: () => "" };
    let notBefore;

    // Morning plan, before anything goes wrong.
    let plan = P.build(items, sched, CFG, iso, { ctx });
    const morning = plan.slots.map(s=>s.itemId);

    if (ev) {
      // Exactly what comeBack() does.
      const blk = S.normaliseBlock({ label: ev.label, start: HM(ev.from), end: HM(ev.to), date: iso });
      sched = sched.concat([blk]);
      // Anything finished before it happened is ticked off.
      plan.slots.forEach(s => { if (s.end <= ev.from) { const it = items.find(i=>i.id===s.itemId); if (it) it.done = true; } });
      (ev.adds||[]).forEach(a => items.push({...a}));
      notBefore = ev.to;
      plan = P.build(items, sched, CFG, iso, { notBefore, ctx });
      const nowIn = new Set(plan.slots.map(s=>s.itemId));
      plan.displaced = morning.filter(id => !nowIn.has(id) && !(items.find(i=>i.id===id)||{}).done);
      plan.awayMinutes = ev.to - ev.from;
    }

    // Print the day.
    console.log(`\n── ${NAME[iso]} ${ev?`  ⚡ ${ev.label} (${S.durationWords(ev.to-ev.from)})`:""}`);
    const rows = [];
    S.blocksOn(sched, iso).forEach(b => rows.push([S.toMin(b.start), `${pad(S.fmtSpan(b.start,b.end),17)} ▓ ${b.label}`]));
    plan.slots.forEach(sl => { const it = items.find(i=>i.id===sl.itemId); if (it)
      rows.push([sl.start, `${pad(S.fmtTime(HM(sl.start))+"–"+S.fmtTime(HM(sl.end)),17)} · ${it.title}${sl.why?`   (${sl.why})`:""}`]); });
    rows.sort((a,b)=>a[0]-b[0]).forEach(r=>console.log("   "+r[1]));
    console.log(`   ${"·".repeat(58)}`);
    console.log(`   free ${S.durationWords(plan.freeTotal)} · planned ${S.durationWords(plan.used)} (${Math.round(100*plan.used/Math.max(1,plan.freeTotal))}%)`);
    const shown = new Set(plan.displaced||[]);
    const flag = (plan.flagged||[]).filter(f=>!shown.has(f.itemId)).map(f=>items.find(i=>i.id===f.itemId)?.title).filter(Boolean);
    if (flag.length) console.log(`   needs a proper slot: ${flag.join(", ")}`);
    if (plan.displaced?.length) console.log(`   PUSHED OUT: ${plan.displaced.map(id=>items.find(i=>i.id===id)?.title).join(", ")}`);
    // What the Week tab would be saying at this point in the week.
    const wk = W.OrganiserWeekPlan.spread(items, sched, CFG, iso, 7, ctx);
    if (wk.wontFit.length) console.log(`   ⚠ WEEK TAB WARNS: ${wk.wontFit.map(w=>`${items.find(i=>i.id===w.itemId)?.title} needs ${S.durationWords(w.minutes)} by ${NAME[w.date]||w.date}`).join("; ")}`);
    // A WARNING ABOUT SOMETHING ALREADY PAST IS NOT A WARNING. Every one of
    // these has to arrive while the day it is about is still ahead, or the app
    // is just narrating the damage.
    wk.wontFit.forEach((w) =>
      ok(`${iso}: the warning about "${items.find((i) => i.id === w.itemId)?.title}" comes before it is due`,
         !w.date || w.date >= iso, `warned ${iso}, due ${w.date}`));
    // And nothing is planned on top of a lesson, on any day of the week.
    const busy = S.busyOn(sched, iso);
    const on = (plan.slots || []).filter((s2) => busy.some((b) => s2.start < b.end && b.start < s2.end));
    ok(`${iso}: nothing is planned on top of something fixed`, on.length === 0,
       JSON.stringify(on.slice(0, 3)));

    // You do what the day said. Everything else rolls into tomorrow untouched.
    plan.slots.forEach(s => { const it = items.find(i=>i.id===s.itemId); if (it) it.done = true; });
    log.push({ iso, done: plan.slots.map(s=>items.find(i=>i.id===s.itemId)?.title) });
  });

  // ---- the week's verdict --------------------------------------------------
  console.log(`\n   ${"═".repeat(58)}\n   END OF WEEK`);
  const missed = items.filter(i => !i.done);
  const late = [];
  items.forEach(it => {
    if (!it.date) return;
    const dayDone = log.find(l => l.done.includes(it.title));
    if (it.done && dayDone && dayDone.iso > it.date) late.push(`${it.title} (due ${NAME[it.date]||it.date}, done ${NAME[dayDone.iso]})`);
    if (!it.done && it.date <= DAYS[4]) late.push(`${it.title} (due ${NAME[it.date]||it.date}, NEVER DONE)`);
  });
  console.log(`   finished: ${items.filter(i=>i.done).length}/${items.length}`);
  if (late.length) console.log(`   ⚠ MISSED DEADLINES:\n${late.map(l=>"      "+l).join("\n")}`);
  else console.log(`   ✓ every deadline met`);
  if (missed.length) console.log(`   still open: ${missed.map(i=>i.title+(i.date?` [due ${NAME[i.date]||i.date}]`:" [no date]")).join(", ")}`);
  return items;
}

// Two unscripted events: a Tuesday crisis, and a Thursday meeting that adds work.
const addsAI = [
  { id:"x1", title:"Ring the year 9 parent back", date:DAYS[3], deadlineType:"hard", importance:"high", effort:"quick",
    type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false },
  { id:"x2", title:"Write the trip risk assessment", date:DAYS[4], deadlineType:"hard", importance:"normal", effort:"draining",
    type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false },
];
// These arrive on THURSDAY, so they must be read with Thursday's clock —
// otherwise "today" resolves to Monday and the result is my bug, not the app's.
const THU = new Date(`${DAYS[3]}T11:35:00`).getTime();
class ThuDate extends Date {
  constructor(...a) { if (!a.length) super(THU); else super(...a); }
  static now() { return THU; }
}
const QT = load(ThuDate).OrganiserQuickParse;
const addsQP = ["urgent: ring the year 9 parent back today","write the trip risk assessment by friday"]
  .map((s,i)=>({ id:"xq"+i, done:false, ...QT.parse(s,{contacts:CONTACTS}) }));

const EVENTS = (adds) => [
  { iso: DAYS[1], label:"Year 9 safeguarding — student", from:S.toMin("11:05"), to:S.toMin("12:35") },
  { iso: DAYS[3], label:"Unplanned meeting — Y9 detention", from:S.toMin("11:05"), to:S.toMin("11:35"), adds },
];

runWeek("THE WEEK — WITH AI", AI, EVENTS(addsAI));
runWeek("THE WEEK — NO AI (same sentences, patterns only)", QP, EVENTS(addsQP));

console.log("\n\n   what the patterns read from the sentences:");
SENTENCES.forEach((s,i)=>console.log(`     ${pad(JSON.stringify(s),52)} → ${pad(QP[i].date||"—",12)} ${pad(QP[i].importance,7)} ${pad(QP[i].effort,9)} ${QP[i].deadlineType}`));

finish();
