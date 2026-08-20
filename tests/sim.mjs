import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import { checker } from "./_check.mjs";
const { ok, done: finish } = checker();
// A WEEK IN THE LIFE. A real timetable, real tasks, and the four situations
// asked for — planned day, no-AI day, a 30-min interruption, and a 30-min
// meeting that hands you more work.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","names.js","quickparse.js"];
function load(DateImpl) {
  const sb = { window:{}, console, Date:DateImpl, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const W = load(Date);
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan, Q = W.OrganiserQuickParse;

const MON = "2026-09-14";
const HM = (m) => S.toHM(m);

// ---- the week: a fairly normal secondary timetable -------------------------
const WEEK = [
  { id:"reg",  label:"Registration",        start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"p1",   label:"P1 Year 7 English",   start:"09:00", end:"09:50", days:[1,2,3,4,5], prep:{on:true,leadDays:1} },
  { id:"p2",   label:"P2 Year 9 English",   start:"09:55", end:"10:45", days:[1,3,5] },
  { id:"brk",  label:"Break",               start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"p3",   label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[1,2,4] },
  { id:"lun",  label:"Lunch duty",          start:"12:30", end:"13:15", days:[2,4] },
  { id:"lun2", label:"Lunch",               start:"12:30", end:"13:15", days:[1,3,5] },
  { id:"p5",   label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[1,2,3,4,5] },
  { id:"brief",label:"Staff briefing",      start:"08:20", end:"08:40", days:[1] },
];
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
const CONTACTS = [{id:"c1",name:"Helen Zhou"},{id:"c2",name:"王伟"}];
const CTX = { today: MON, goalTitle: () => "" };

// ---- the tasks, as sentences you'd actually type ---------------------------
const SENTENCES = [
  "mark the year 9 essays by monday",              // hard-ish, big
  "email Helen about the trip money",              // person
  "write up the year 11 mock feedback",            // draining
  "book the hall for the assembly",                // quick
  "urgent: send the safeguarding form today",      // high + today
  "order new whiteboard pens",                     // low value, quick
  "plan the year 8 poetry unit",                   // draining
  "reply to the parent email about homework",      // medium
];

// AI path: what a good extraction would produce (dates/importance/deadline set).
const AI_ITEMS = [
  { title:"Mark the year 9 essays",              date:MON, deadlineType:"hard", importance:"normal", effort:"draining" },
  { title:"Email Helen about the trip money",    date:"",  deadlineType:"soft", importance:"normal", effort:"quick", promisedTo:"Helen Zhou" },
  { title:"Write up year 11 mock feedback",      date:MON, deadlineType:"soft", importance:"normal", effort:"draining" },
  { title:"Book the hall for the assembly",      date:"",  deadlineType:"soft", importance:"normal", effort:"quick" },
  { title:"Send the safeguarding form",          date:MON, deadlineType:"hard", importance:"high",   effort:"quick" },
  { title:"Order new whiteboard pens",           date:"",  deadlineType:"soft", importance:"low",    effort:"quick" },
  { title:"Plan the year 8 poetry unit",         date:"",  deadlineType:"soft", importance:"normal", effort:"draining" },
  { title:"Reply to the parent email",           date:MON, deadlineType:"soft", importance:"normal", effort:"medium" },
].map((t,i)=>({ id:"ai"+i, type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false, ...t }));

// No-AI path: the SAME sentences, read by patterns only.
const QP_ITEMS = SENTENCES.map((s,i)=>({ id:"qp"+i, done:false, ...Q.parse(s, { contacts: CONTACTS }) }));

function show(label, items, plan, sched) {
  const by = (id) => items.find(i=>i.id===id);
  console.log(`\n${"═".repeat(64)}\n${label}`);
  console.log(`${"─".repeat(64)}`);
  const rows = [];
  S.blocksOn(sched, MON).forEach(b => rows.push({ at:S.toMin(b.start), s:`${S.fmtSpan(b.start,b.end).padEnd(17)} ▓ ${b.label}` }));
  plan.slots.forEach(sl => { const it = by(sl.itemId); if (it) rows.push({ at:sl.start, s:`${(S.fmtTime(HM(sl.start))+"–"+S.fmtTime(HM(sl.end))).padEnd(17)} · ${it.title}${sl.why?`   (${sl.why})`:""}` }); });
  rows.sort((a,b)=>a.at-b.at).forEach(r=>console.log("  "+r.s));
  const free = plan.freeTotal - plan.used;
  console.log(`  ${"─".repeat(60)}`);
  console.log(`  free ${S.durationWords(plan.freeTotal)} · planned ${S.durationWords(plan.used)} · left deliberately free ${S.durationWords(free)} (${Math.round(100*plan.used/Math.max(1,plan.freeTotal))}% used)`);
  // Mirror the page: an item already named as pushed out is not repeated here.
  const shown = new Set(plan.displaced || []);
  const flag = (plan.flagged||[]).filter(f=>!shown.has(f.itemId)).map(f=>by(f.itemId)?.title).filter(Boolean);
  if (flag.length) console.log(`  needs a proper slot: ${flag.join(", ")}`);
  const unplanned = items.filter(i=>!i.done && !plan.slots.some(s2=>s2.itemId===i.id));
  if (unplanned.length) console.log(`  not today: ${unplanned.map(i=>i.title).join(", ")}`);
  if (plan.displaced?.length) console.log(`  PUSHED OUT: ${plan.displaced.map(id=>by(id)?.title).join(", ")}`);

  // WHAT A CRISIS MUST NOT DO IS LOSE ANYTHING. Work pushed out of a day is
  // fine and expected — that is what a crisis is. Work that stops existing is
  // not, and it is invisible from the inside, because a shorter list looks
  // exactly like a day that went well.
  ok(`${label}: everything pushed out is still a real job`,
     (plan.displaced || []).every((id) => !!by(id)),
     JSON.stringify((plan.displaced || []).filter((id) => !by(id))));
  ok(`${label}: and none of it was quietly ticked off`,
     (plan.displaced || []).every((id) => !by(id)?.done),
     JSON.stringify((plan.displaced || []).filter((id) => by(id)?.done)));
  // NOR MAY IT DOUBLE-BOOK. A day rebuilt round an interruption has to come
  // back as a day, not as two jobs in the same minutes.
  const over = (plan.slots || []).filter((a, i) =>
    (plan.slots || []).slice(i + 1).some((b) => a.start < b.end && b.start < a.end));
  ok(`${label}: nothing is booked over anything else`, over.length === 0,
     JSON.stringify(over.slice(0, 3)));
}

// ============ 1 & 2: the ordinary Monday, both ways =========================
const aiPlan = P.build(AI_ITEMS, WEEK, CFG, MON, { ctx: CTX });
show("MONDAY — WITH AI", AI_ITEMS, aiPlan, WEEK);
const qpPlan = P.build(QP_ITEMS, WEEK, CFG, MON, { ctx: CTX });
show("MONDAY — NO AI (same sentences, patterns only)", QP_ITEMS, qpPlan, WEEK);

console.log("\n  what the patterns got from the sentences:");
QP_ITEMS.forEach((t,i)=>console.log(`    "${SENTENCES[i]}"\n       → ${t.title} | date:${t.date||"—"} | ${t.importance} | ${t.effort} | ${t.deadlineType}${t.promisedTo?` | →${t.promisedTo}`:""}`));

// ============ 3 & 4: the day gets taken off you =============================
// Both scenarios run exactly what comeBack() runs, headlessly.

function interrupt({ label, from, to, items, sched, before }) {
  const b = S.normaliseBlock({ label, start:HM(from), end:HM(to), date:MON, source:"interruption" });
  const sched2 = S.normalise(sched).concat([b]);
  const rebuilt = P.build(items, sched2, CFG, MON, { notBefore: to, ctx: CTX });
  rebuilt.awayMinutes = to - from;
  const nowIn = new Set(rebuilt.slots.map(s2 => s2.itemId));
  rebuilt.displaced = before.filter(id => !nowIn.has(id) && !(items.find(i=>i.id===id)||{}).done);
  return { plan: rebuilt, sched: sched2 };
}
// Whatever the morning plan had already finished, you'd have ticked off.
function tickBefore(items, plan, atMin) {
  plan.slots.forEach(s2 => { if (s2.end <= atMin) { const it = items.find(i=>i.id===s2.itemId); if (it) it.done = true; } });
}
const AWAY_FROM = S.toMin("11:55"), AWAY_TO = S.toMin("12:25");

function runInterruption(tag, baseItems, basePlan) {
  const items = baseItems.map(x=>({...x}));
  tickBefore(items, basePlan, AWAY_FROM);
  const before = basePlan.slots.map(s2 => s2.itemId);
  const { plan, sched } = interrupt({
    label:"Year 9 student — pastoral", from:AWAY_FROM, to:AWAY_TO, items, sched:WEEK, before });
  show(`SCENARIO 3 — 30 MINS GONE (student) — ${tag}`, items, plan, sched);
  console.log(`  ticked off before it happened: ${items.filter(i=>i.done).map(i=>i.title).join(", ")||"—"}`);
  return { items, plan };
}

// A 30-minute meeting costs the SAME half hour — and hands you two more jobs.
const MEETING_SENTENCES = [
  "urgent: ring the year 9 parent back today about the detention",
  "write the trip risk assessment by friday",
];
const MEETING_AI = [
  { title:"Ring the year 9 parent back about the detention", date:MON,          deadlineType:"hard", importance:"high",   effort:"quick" },
  { title:"Write the trip risk assessment",                  date:"2026-09-18", deadlineType:"hard", importance:"normal", effort:"draining" },
].map((t,i)=>({ id:"mt"+i, type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false, ...t }));
const MEETING_QP = MEETING_SENTENCES.map((s,i)=>({ id:"mq"+i, done:false, ...Q.parse(s, { contacts: CONTACTS }) }));

function runMeeting(tag, baseItems, basePlan, added) {
  const items = baseItems.map(x=>({...x}));
  tickBefore(items, basePlan, AWAY_FROM);
  const before = basePlan.slots.map(s2 => s2.itemId);
  const withNew = items.concat(added.map(x=>({...x})));
  const { plan, sched } = interrupt({
    label:"Unplanned meeting — Y9 detention", from:AWAY_FROM, to:AWAY_TO, items:withNew, sched:WEEK, before });
  show(`SCENARIO 4 — SAME 30 MINS, PLUS TWO NEW JOBS — ${tag}`, withNew, plan, sched);
  const placed = new Set(plan.slots.map(s2=>s2.itemId));
  console.log(`  the meeting's own two jobs: ${added.map(a=>`${a.title} → ${placed.has(a.id)?"placed today":(a.date&&a.date>MON)?`held for ${a.date}`:"not today"}`).join(" | ")}`);
  return { items: withNew, plan };
}

runInterruption("WITH AI", AI_ITEMS, aiPlan);
runInterruption("NO AI",   QP_ITEMS, qpPlan);
runMeeting("WITH AI", AI_ITEMS, aiPlan, MEETING_AI);
runMeeting("NO AI",   QP_ITEMS, qpPlan, MEETING_QP);

console.log("\n  what the patterns got from the meeting's two new jobs:");
MEETING_QP.forEach((t,i)=>console.log(`    "${MEETING_SENTENCES[i]}"\n       → ${t.title} | date:${t.date||"—"} | ${t.importance} | ${t.effort} | ${t.deadlineType}`));

// ============ CONTROL: the same no-AI runs with the clock actually on Monday =
// Everything above ran a September Monday against a machine clock reading
// August. The app resolves "by friday" from the real clock, so some of those
// "(overdue)" tags are MY fault, not the app's. This isolates which.
const FROZEN = new Date(`${MON}T09:00:00`).getTime();
class MonDate extends Date {
  constructor(...a) { if (!a.length) super(FROZEN); else super(...a); }
  static now() { return FROZEN; }
}
const W2 = load(MonDate);
const S2 = W2.OrganiserSchedule, P2 = W2.OrganiserDayPlan, Q2 = W2.OrganiserQuickParse;
const mk = (pre) => (s,i) => ({ id:pre+i, done:false, ...Q2.parse(s, { contacts: CONTACTS }) });
const QP2 = SENTENCES.map(mk("qp"));
const MQ2 = MEETING_SENTENCES.map(mk("mq"));

console.log(`\n${"═".repeat(64)}\nCONTROL — the same patterns, read on the actual Monday\n${"─".repeat(64)}`);
[...SENTENCES.map((s,i)=>[s,QP2[i]]), ...MEETING_SENTENCES.map((s,i)=>[s,MQ2[i]])]
  .forEach(([s,t])=>console.log(`  "${s}"\n     → ${t.title} | date:${t.date||"—"} | ${t.importance} | ${t.effort} | ${t.deadlineType}`));

// Re-run the two no-AI days that mattered, with the honest clock.
const savedS = S, savedP = P; // show() closes over S; swap for the frozen build
const day2 = P2.build(QP2, WEEK, CFG, MON, { ctx: CTX });
show("CONTROL — MONDAY, NO AI (clock correct)", QP2, day2, WEEK);

const items2 = QP2.map(x=>({...x}));
tickBefore(items2, day2, AWAY_FROM);
const before2 = day2.slots.map(s2=>s2.itemId);
const with2 = items2.concat(MQ2.map(x=>({...x})));
const b2 = S2.normaliseBlock({ label:"Unplanned meeting — Y9 detention", start:HM(AWAY_FROM), end:HM(AWAY_TO), date:MON });
const sched2 = S2.normalise(WEEK).concat([b2]);
const reb2 = P2.build(with2, sched2, CFG, MON, { notBefore: AWAY_TO, ctx: CTX });
reb2.awayMinutes = AWAY_TO - AWAY_FROM;
const in2 = new Set(reb2.slots.map(s2=>s2.itemId));
reb2.displaced = before2.filter(id => !in2.has(id) && !(with2.find(i=>i.id===id)||{}).done);
show("CONTROL — SCENARIO 4, NO AI (clock correct)", with2, reb2, sched2);
console.log(`  the meeting's own two jobs: ${MQ2.map(a=>`${a.title} → ${in2.has(a.id)?"placed today":(a.date&&a.date>MON)?`held for ${a.date}`:"not today"}`).join(" | ")}`);

// ---- the safety net itself: does "pushed out" actually fire when it should? --
// Nothing was displaced in any honest run above, so that box is untested. Force
// it with a real crisis — gone from 11:55 until nearly the end of the day.
const LONG_TO = S.toMin("16:20");
[["WITH AI", AI_ITEMS, aiPlan, P, S], ["NO AI", QP2, day2, P2, S2]].forEach(([tag, base, basePlan, Pi, Si]) => {
  const items = base.map(x=>({...x}));
  tickBefore(items, basePlan, AWAY_FROM);
  const before = basePlan.slots.map(s2=>s2.itemId);
  const blk = Si.normaliseBlock({ label:"Safeguarding incident", start:HM(AWAY_FROM), end:HM(LONG_TO), date:MON });
  const sc = Si.normalise(WEEK).concat([blk]);
  const pl = Pi.build(items, sc, CFG, MON, { notBefore: LONG_TO, ctx: CTX });
  pl.awayMinutes = LONG_TO - AWAY_FROM;
  const nowIn = new Set(pl.slots.map(s2=>s2.itemId));
  pl.displaced = before.filter(id => !nowIn.has(id) && !(items.find(i=>i.id===id)||{}).done);
  show(`SAFETY NET — 4h25m CRISIS — ${tag}`, items, pl, sc);
});

finish();
