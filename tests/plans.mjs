import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// PASTING IN A PLAN SOMEONE ELSE WROTE, then living an ordinary term with it.
//
// Two goals of the kind you'd actually ask a model for: long, multi-stage, with
// pieces that take hours. Written the way those tools really answer — one tidy
// and one messy — pasted in, and then run through eight ordinary weeks of
// teaching to see what the app does with them.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","weekplan.js","goalplan.js",
               "names.js","quickparse.js","planpaste.js"];
function load(t) {
  const D = class extends Date { constructor(...a){ if(!a.length) super(t); else super(...a); } static now(){ return t; } };
  const sb = { window:{}, console, Date:D, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const START = "2026-09-14";
const dISO = (n) => { const d=new Date(START+"T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const WORKDAYS = []; for (let w=0;w<8;w++) for (let d=0;d<5;d++) WORKDAYS.push(dISO(w*7+d));
const lab = (i) => new Date(i+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const W = load(new Date(START+"T08:00:00").getTime());
const S = W.OrganiserSchedule, DP = W.OrganiserDayPlan, WP = W.OrganiserWeekPlan,
      GP = W.OrganiserGoalPlan, PP = W.OrganiserPlanPaste;

// An ordinary teaching week: about two and a half hours free a day.
const SCHED = [
  { id:"reg", label:"Registration",     start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"brk", label:"Break",            start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"lun", label:"Lunch",            start:"12:30", end:"13:15", days:[1,2,3,4,5] },
  { id:"p1",  label:"P1",               start:"09:00", end:"09:50", days:[1,2,3,4,5] },
  { id:"p2",  label:"P2",               start:"09:55", end:"10:45", days:[1,3,5] },
  { id:"p3",  label:"P3",               start:"11:05", end:"11:55", days:[1,2,3,4] },
  { id:"p5",  label:"P5",               start:"14:10", end:"15:00", days:[1,2,3,4,5] },
  { id:"dep", label:"Department",       start:"15:10", end:"16:10", days:[4] },
];
const CFG = { dayStart:"08:00", dayEnd:"17:00" };

// ---- GOAL ONE: tidy output, the way a model answers when you ask nicely -----
const PLAN_A = `# Get the IB Category 2 certificate
Deadline: 4 December 2026

## Phase 1: Work out what's actually required
- Read the IB programme standards document (2 hours)
- List the evidence I need to produce (45 min)
- Email the coordinator to confirm the deadline (10 min)

## Phase 2: Gather the evidence
- Collect three annotated lesson plans (3 hours)
- Write the reflective commentary on unit design (4 hours)
- Get two lesson observations booked in (20 min)
- Write up the observation reflections (1h30)

## Phase 3: Put it together
- Assemble the portfolio document (2 hours)
- Proofread the whole thing (1 hour)
- Submit it (15 min)`;

// ---- GOAL TWO: the messy kind, which is what you usually get ---------------
const PLAN_B = `Rebuild the Year 9 scheme of work

**Stage 1 — audit what we have**
* go through last year's unit plans and note what didn't land ~90 mins
1. talk to the other Y9 teacher about what they'd change (30 minutes)
2. look at the assessment data from last year — 1h

**Stage 2 — redesign**
- draft the new unit sequence (2.5 hours)
- write the six lesson outlines for unit 1 (4 hours)
- build the end of unit assessment (2 hours)

Stage 3: share it
- put it to the department for comment (20 min)
- act on whatever comes back (1h30)
Needs to be done by 20 November`;

console.log("═".repeat(76));
console.log("WHAT THE APP MAKES OF A PASTED PLAN");
console.log("═".repeat(76));

const goals = [];
const items = [];
let n = 0;
[["A", PLAN_A], ["B", PLAN_B]].forEach(([tag, text]) => {
  const p = PP.parse(text, { today: START });
  console.log(`\n── PLAN ${tag}\n   title:    ${p.title}`);
  console.log(`   deadline: ${p.date ? lab(p.date) : "— none read —"}`);
  console.log(`   ${p.milestones.length} sections, ${PP.stepCount(p)} steps, ` +
    `${PP.sized(p)} of them with a time given · ${S.durationWords(PP.totalMinutes(p))} in total`);
  p.milestones.forEach((m) => {
    console.log(`     ${m.title}`);
    m.steps.forEach((s) => console.log(`        · ${s.title}${s.minutes ? `   [${S.durationWords(s.minutes)}]` : "   [no time given]"}`));
  });

  const goal = { id: "g" + tag, title: p.title, date: p.date, milestones: [] };
  goals.push(goal);
  p.milestones.forEach((m) =>
    m.steps.forEach((s) => items.push({ ...GP.taskFromStep(goal, s, CFG), id: "t" + (n++) })));
});

// ---- what the app says about them on day one -------------------------------
console.log(`\n${"═".repeat(76)}\nON DAY ONE`);
goals.forEach((g) => {
  const r = GP.rate(g, items, SCHED, CFG, START);
  console.log(`\n  ${g.title}`);
  console.log(`    ${GP.words(r)}`);
  console.log(`    ${r.daysLeft} working days · needs ${S.durationWords(r.needPerDay)}/day · a day can give about ${S.durationWords(r.roomPerDay)}`);
});
const both = WP.pressure(items, SCHED, CFG, START, 60, { today: START, goalTitle: () => "" });
console.log(`\n  BOTH AT ONCE: ${both.verdict} — ${both.because}`);
const tr = WP.trouble(items, SCHED, CFG, START, 60, { today: START, goalTitle: () => "" });
console.log(`  won't fit before it's due: ${tr.length ? tr.map(t=>`${t.title} (${S.durationWords(t.short)} short)`).join("; ") : "nothing"}`);

// ---- live eight ordinary weeks --------------------------------------------
console.log(`\n${"═".repeat(76)}\nEIGHT ORDINARY WEEKS`);
function hash(s){ let h=2166136261; for(const ch of String(s)) h=Math.imul(h^ch.charCodeAt(0),16777619);
  h=Math.imul(h^(h>>>15),h|1); h^=h+Math.imul(h^(h>>>7),h|61); return ((h^(h>>>14))>>>0)/4294967296; }
const FACTORS = [0.6,0.8,0.9,1.0,1.1,1.3,1.6,2.0];
const BASEMIN = S.normaliseConfig(CFG).effortMinutes;
const realOf = (it) => Math.max(5, Math.round(
  (Number(it.plannedMinutes) || BASEMIN[it.effort] || 30) * FACTORS[Math.floor(hash(it.id)*FACTORS.length)]));

// A steady drip of ordinary work, so the goals aren't the only thing competing.
let live = items.map(x => ({ ...x }));
let extra = 0;
const firstTouch = new Map();
const doneOn = new Map();

WORKDAYS.forEach((iso, di) => {
  if (di % 3 === 0) live.push({ id:"w"+(extra++), title:"ordinary job "+extra, type:"task", time:"", tags:[],
    date: WORKDAYS[Math.min(di+2, WORKDAYS.length-1)], deadlineType:"hard", importance:"normal",
    effort: di % 6 === 0 ? "draining" : "medium", goalId:"", openLoop:false, promisedTo:"", waitingOn:"",
    notBefore:"", spentMinutes:0, plannedMinutes:0, optional:false, done:false });

  const ctx = { today: iso, goalTitle: (id) => (goals.find(g=>g.id===id)||{}).title || "" };
  const plan = DP.build(live, SCHED, CFG, iso, { ctx });
  const free = S.gapsOn(SCHED, S.normaliseConfig(CFG), iso).reduce((n2,g)=>n2+(g.end-g.start),0);
  let budget = Math.floor(free * 0.66);

  plan.slots.forEach((s) => {
    const it = live.find(i => i.id === s.itemId);
    if (!it || it.done || budget <= 0) return;
    if (!firstTouch.has(it.id)) firstTouch.set(it.id, iso);
    const need = realOf(it) - (Number(it.spentMinutes) || 0);
    const got = Math.min(need, budget, s.end - s.start);
    budget -= got;
    it.spentMinutes = (Number(it.spentMinutes) || 0) + got;
    if (got >= need) { it.done = true; doneOn.set(it.id, iso); }
  });
});

goals.forEach((g) => {
  const mine = live.filter(i => i.goalId === g.id);
  const done = mine.filter(i => i.done);
  const started = mine.filter(i => firstTouch.has(i.id));
  const first = [...firstTouch.entries()].filter(([id]) => mine.some(m=>m.id===id))
    .map(([,d]) => d).sort()[0];
  const late = done.filter(i => g.date && doneOn.get(i.id) > g.date);
  console.log(`\n  ${g.title}`);
  console.log(`    due ${g.date ? lab(g.date) : "no date"} · ${done.length}/${mine.length} pieces done · started ${first ? lab(first) : "never"}`);
  console.log(`    ${started.length} of ${mine.length} pieces were touched at all`);
  if (late.length) console.log(`    ⚠ ${late.length} finished after the deadline`);
  const r = GP.rate(g, live, SCHED, CFG, WORKDAYS[WORKDAYS.length-1]);
  console.log(`    at the end: ${GP.words(r)}`);
});
const ord = live.filter(i => !i.goalId);
console.log(`\n  the ordinary work alongside: ${ord.filter(i=>i.done).length}/${ord.length} done`);
