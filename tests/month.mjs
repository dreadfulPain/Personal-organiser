import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A MONTH. Four weeks, a weekly planning meeting that hands you work in uneven
// bursts, and a crisis in week two that takes a fortnight of meetings and
// paperwork to put right. Walks every working day the way the app would.
import { checker } from "./_check.mjs";
const { ok, done } = checker();
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","weekplan.js","names.js","quickparse.js"];
function load(DateImpl) {
  const sb = { window:{}, console, Date:DateImpl, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const START = "2026-09-14";                        // a Monday
const dISO = (n) => { const d = new Date(START+"T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const WORKDAYS = [];                               // 4 weeks, Mon–Fri
for (let w=0; w<4; w++) for (let d=0; d<5; d++) WORKDAYS.push(dISO(w*7+d));
const LAST = WORKDAYS[WORKDAYS.length-1];
const label = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short", day:"numeric", month:"short"});
const wkOf = (iso) => Math.floor((new Date(iso+"T12:00:00") - new Date(START+"T12:00:00"))/86400000/7) + 1;

// Clock frozen to the first Monday. Anything read from a sentence must be
// parsed with the clock of the day it arrives — see parseOn().
function clockAt(iso, hm) {
  const t = new Date(`${iso}T${hm}:00`).getTime();
  return class extends Date {
    constructor(...a){ if(!a.length) super(t); else super(...a); }
    static now(){ return t; }
  };
}
const W = load(clockAt(START,"08:00"));
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan, WP = W.OrganiserWeekPlan;
const HM = (m) => S.toHM(m);
const parseOn = (iso, hm, s, contacts) => load(clockAt(iso,hm)).OrganiserQuickParse.parse(s, { contacts });

// ---- the timetable. Thursday afternoon is the planning meeting. ------------
const SCHED = [
  { id:"reg",  label:"Registration",        start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"brk",  label:"Break",               start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"lun",  label:"Lunch",               start:"12:30", end:"13:15", days:[1,3,5] },
  { id:"duty", label:"Lunch duty",          start:"12:30", end:"13:15", days:[2,4] },
  { id:"m1", label:"P1 Year 7 English",     start:"09:00", end:"09:50", days:[1,3,5] },
  { id:"m2", label:"P2 Year 9 English",     start:"09:55", end:"10:45", days:[1,2,4] },
  { id:"m3", label:"P3 Year 11 Lit",        start:"11:05", end:"11:55", days:[1,2,3,4] },
  { id:"m4", label:"P4 Year 10 English",    start:"11:55", end:"12:30", days:[3] },
  { id:"m5", label:"P5 Year 8 English",     start:"14:10", end:"15:00", days:[1,2,3,4,5] },
  { id:"m6", label:"P6 Year 12 Lit",        start:"15:05", end:"15:55", days:[3] },
  { id:"plan", label:"Department planning", start:"15:10", end:"16:10", days:[4] },  // ← every Thursday
];
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
const CONTACTS = [{id:"c1",name:"Helen Zhou"},{id:"c2",name:"王伟"},{id:"c3",name:"Sarah Okonkwo"}];
const THURSDAYS = WORKDAYS.filter(iso => new Date(iso+"T12:00:00").getDay() === 4);

// ---- the ordinary background load ------------------------------------------
const BASE = [
  ["mark the year 9 essays by wednesday",                dISO(2)],
  ["email Helen about the trip money",                   ""],
  ["write the year 11 mock report by friday",            dISO(4)],
  ["order new whiteboard pens",                          ""],
  ["tidy the stockroom sometime",                        ""],
  ["print the year 7 knowledge organisers by tuesday",   dISO(1)],
];

// ---- what each planning meeting hands you. Uneven on purpose. --------------
// week 1: light. week 2: heavy. week 3: almost nothing. week 4: heavy again.
const FROM_MEETINGS = [
  [ ["write the year 8 scheme of work by friday", 8] ,
    ["book the theatre trip coach", 8] ],
  [ ["draft the parents evening letter by tuesday", 13],
    ["moderate the year 11 coursework by thursday", 15],
    ["update the department risk assessment by friday", 16],
    ["collect the year 7 reading data by wednesday", 14],
    ["chase Sarah Okonkwo about the exam entries", 15] ],
  [ ["order the exam stationery", 22] ],
  [ ["write the year 10 reports by friday", 30],
    ["plan out the year 12 revision programme by thursday", 29],
    ["review the year 9 setting by friday", 30],
    ["email 王伟 about the exchange visit", 26] ],
];

// ---- the crisis. Tuesday of week two, and a fortnight to put right. --------
// Real shape: an incident, then management, then parents, then paperwork that
// can only be written AFTER the meetings it reports on.
const CRISIS_DAY = dISO(8);   // Tuesday, week 2
const CRISIS_BLOCKS = [
  { label:"Incident — Year 9 (dealing with it)", date:CRISIS_DAY, start:"11:05", end:"12:40" },
  { label:"Meeting with SLT",                    date:dISO(9),    start:"08:00", end:"08:40" },
  { label:"Meeting with parents",                date:dISO(11),   start:"15:10", end:"16:10" },
  { label:"Follow-up meeting with SLT",          date:dISO(16),   start:"08:00", end:"08:40" },
];
// mustFollow = the date this genuinely cannot be done before. The app is not
// told about it — that's the point of the test.
// mustFollow is set ONLY where the step is genuinely impossible earlier — you
// cannot write up notes from a meeting that hasn't happened. Preparation for a
// meeting is deliberately left unconstrained: that one really can be done early.
const CRISIS = [
  ["write up the incident record today",             CRISIS_DAY, "hard","high",  "medium",   null],
  ["urgent: complete the safeguarding referral form by wednesday", dISO(9), "hard","high","medium", null],
  ["ring the parents to arrange a meeting",          dISO(9),  "hard","high",   "quick",    null],
  ["write the statement for SLT by thursday",        dISO(10), "hard","high",   "draining", null],
  ["write up the parent meeting notes after friday, by monday", dISO(14), "hard","normal","medium", dISO(11)],
  ["draft the support plan after the parent meeting on friday, by wednesday", dISO(16), "hard","high","draining", dISO(11)],
  ["update the behaviour log after friday's meeting", dISO(18), "hard","normal","quick", dISO(11)],
  ["check in with the student",                      dISO(19), "soft","normal", "quick",    null],
];

const mkItem = (o,i,pre) => ({ id:pre+i, type:"task", time:"", tags:[], whenText:"", goalId:"",
  openLoop:false, promisedTo:"", waitingOn:"", done:false, importance:"normal", effort:"medium",
  deadlineType:"soft", date:"", ...o });

// AI reading: dates and weights understood properly.
function aiSeed() {
  const out = [];
  BASE.forEach(([t,d],i)=>out.push(mkItem({ title:t.replace(/ by \w+$/,""), date:d,
    deadlineType: d?"hard":"soft", effort: /mark|write/.test(t)?"draining":"quick" },i,"b")));
  return out;
}
const aiFromMeeting = (wk) => FROM_MEETINGS[wk].map(([t,day],i)=>mkItem({
  title: t.replace(/ by \w+$/,""), date: dISO(day), deadlineType:"hard",
  effort: /write|plan|moderate|review/.test(t) ? "draining" : "quick" }, `${wk}_${i}`, "p"));
const aiCrisis = () => CRISIS.map(([t,d,dl,imp,eff,nb],i)=>mkItem({
  title:t.replace(/^urgent: /,"").replace(/,? (by|today|after)\b.*$/,""), date:d, deadlineType:dl,
  importance:imp, effort:eff, notBefore:nb||"", crisis:true }, i, "c"));

// Pattern reading: the same sentences, no model.
const qpSeed = () => BASE.map(([t],i)=>mkItem({ ...parseOn(START,"08:00",t,CONTACTS) },i,"b"));
const qpFromMeeting = (wk) => FROM_MEETINGS[wk].map(([t],i)=>mkItem({
  ...parseOn(THURSDAYS[wk],"16:10",t,CONTACTS) }, `${wk}_${i}`, "p"));
const qpCrisis = () => CRISIS.map(([t],i)=>mkItem({
  ...parseOn(CRISIS_DAY,"12:40",t,CONTACTS), crisis:true }, i, "c"));

// ---- run the month ---------------------------------------------------------
function runMonth(name, seed, meetingAdds, crisisAdds) {
  const items = seed();
  let sched = S.normalise(SCHED);
  const doneOn = new Map();
  const warned = new Map();
  console.log(`\n${"█".repeat(74)}\n${name}\n${"█".repeat(74)}`);

  WORKDAYS.forEach((iso) => {
    const ctx = { today: iso, goalTitle: () => "" };
    // Crisis blocks are fixed events that land on the calendar.
    CRISIS_BLOCKS.filter(b => b.date === iso).forEach(b => {
      const blk = S.normaliseBlock({ label:b.label, start:b.start, end:b.end, date:iso });
      if (blk) sched = sched.concat([blk]);
    });
    if (iso === CRISIS_DAY) crisisAdds().forEach(a => items.push(a));

    let plan = P.build(items, sched, CFG, iso, { ctx });

    // The incident eats the middle of the day it happens.
    if (iso === CRISIS_DAY) {
      plan.slots.forEach(s => { if (s.end <= S.toMin("11:05")) {
        const it = items.find(i=>i.id===s.itemId);
        if (it && !it.done) { it.done = true; doneOn.set(it.id, iso); } } });
      plan = P.build(items, sched, CFG, iso, { notBefore: S.toMin("12:40"), ctx });
    }

    // Do what the day says.
    plan.slots.forEach(s => { const it = items.find(i=>i.id===s.itemId);
      if (it && !it.done) { it.done = true; doneOn.set(it.id, iso); } });

    // Thursday's planning meeting hands you the next lot, after the meeting.
    const wk = THURSDAYS.indexOf(iso);
    if (wk >= 0) meetingAdds(wk).forEach(a => items.push(a));

    // What the Week tab would be warning about at the end of this day.
    const wf = WP.spread(items, sched, CFG, iso, 7, ctx).wontFit;
    wf.forEach(w => { if (!warned.has(w.itemId)) warned.set(w.itemId, iso); });

    const open = items.filter(i=>!i.done).length;
    const did = plan.slots.length;
    const pct = Math.round(100*plan.used/Math.max(1,plan.freeTotal));
    const flags = [];
    if (wk >= 0) flags.push(`+${FROM_MEETINGS[wk].length} from planning`);
    if (iso === CRISIS_DAY) flags.push(`⚡ CRISIS +${CRISIS.length}`);
    if (CRISIS_BLOCKS.some(b=>b.date===iso && b.date!==CRISIS_DAY)) flags.push("▣ " + CRISIS_BLOCKS.find(b=>b.date===iso).label);
    console.log(`  ${label(iso).padEnd(13)} did ${String(did).padStart(2)}  ${String(pct).padStart(3)}% of free  backlog ${String(open).padStart(2)}   ${flags.join("  ")}`);
    // An idle day with a backlog needs explaining, not glossing over.
    if (did === 0 && open > 0) {
      const wkp = WP.spread(items, sched, CFG, iso, 7, ctx);
      const where = items.filter(i=>!i.done).map(i => {
        const p = wkp.placements.find(p=>p.itemId===i.id);
        return `${i.title} → ${p ? label(p.iso) : (wkp.wontFit.some(w=>w.itemId===i.id) ? "WON'T FIT" : "unplaced")}`;
      });
      console.log(`      idle with ${open} open: ${where.join(" | ")}`);
    }
  });

  // ---- verdict -------------------------------------------------------------
  console.log(`\n  ${"═".repeat(66)}`);
  const open = items.filter(i=>!i.done);
  const missed = items.filter(i => i.date && i.date <= LAST &&
    (!i.done || (doneOn.get(i.id) || "9999") > i.date));
  console.log(`  finished ${items.length-open.length}/${items.length}   ·   deadlines missed ${missed.length}`);
  if (missed.length) missed.forEach(i => console.log(
    `     ✗ ${i.title} — due ${label(i.date)}, ${i.done ? "done "+label(doneOn.get(i.id)) : "NEVER DONE"}` +
    (warned.has(i.id) ? `   (warned ${label(warned.get(i.id))})` : "   (no warning)")));

  // Did the crisis run in a possible order?
  console.log(`\n  THE CRISIS, in the order it actually happened:`);
  const cr = items.filter(i=>i.crisis).sort((a,b)=>(doneOn.get(a.id)||"9999").localeCompare(doneOn.get(b.id)||"9999"));
  let impossible = 0;
  cr.forEach((i,n) => {
    const idx = items.filter(x=>x.crisis).indexOf(i);
    const notBefore = CRISIS[idx] && CRISIS[idx][5];
    const on = doneOn.get(i.id);
    const bad = on && notBefore && on < notBefore;
    if (bad) impossible++;
    console.log(`     ${on?label(on):"not done".padEnd(13)}  ${i.title}` +
      (bad ? `   ⚠ IMPOSSIBLE — can't happen before ${label(notBefore)}` : ""));
  });
  console.log(`  ${impossible ? `⚠ ${impossible} crisis step(s) planned before they could possibly happen` : "✓ every crisis step in a possible order"}`);
  return { items, missed, impossible, open };
}

const R1 = runMonth("A MONTH — WITH AI", aiSeed, aiFromMeeting, aiCrisis);
const R2 = runMonth("A MONTH — NO AI (patterns only)", qpSeed, qpFromMeeting, qpCrisis);

// ---- what the Month tab shows, on day one, for the whole month -------------
console.log(`\n${"═".repeat(74)}\nTHE MONTH TAB on Mon 14 Sept — a 28-day spread of everything known then`);
{
  const items = aiSeed().concat(aiFromMeeting(0));
  const p = WP.spread(items, S.normalise(SCHED), CFG, START, 28, { today:START, goalTitle:()=>"" });
  const days = p.dates.filter(d => (p.byDay[d]||[]).length);
  days.forEach(d => console.log(`  ${label(d).padEnd(13)} ${(p.byDay[d]||[]).map(x=>{
    const it = items.find(i=>i.id===x.itemId);
    return `${S.toHM(x.start)} ${it.title}${x.early?" (ahead of "+label(it.date)+")":""}`;
  }).join("  ·  ")}`));
  console.log(`  placed ${p.placements.length}/${items.filter(i=>i.date).length} dated  ·  won't fit: ${p.wontFit.length}`);
  const clash = [];
  Object.values(p.byDay).forEach(day => day.forEach((a,i)=>day.slice(i+1).forEach(b=>{
    if (a.start < b.start+b.minutes && b.start < a.start+a.minutes) clash.push([a.itemId,b.itemId]); })));
  console.log(`  overlaps: ${clash.length}`);

  // IT ALREADY COUNTED THIS AND THEN SAID NOTHING ABOUT IT. Two jobs booked
  // into the same minutes is the one thing a month's planning must never
  // produce: it is not a worse plan, it is a plan that is lying to you.
  ok("across a month, no two jobs are booked into the same minutes",
     clash.length === 0, JSON.stringify(clash.slice(0, 4)));
  // AND NOTHING FALLS DOWN THE BACK. Everything dated is either given a slot or
  // handed back as "won't fit" — the one outcome that must not exist is a job
  // that is neither.
  const dated = items.filter((i) => i.date && !i.done).length;
  ok("everything dated either got a slot or came back as won't-fit",
     p.placements.length + p.wontFit.length >= dated,
     `${p.placements.length} placed + ${p.wontFit.length} won't fit, of ${dated} dated`);
}

done();
