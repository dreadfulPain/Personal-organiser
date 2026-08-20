import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A MONTH, HOUR BY HOUR. Not a planning exercise — a use exercise.
//
// The plan is built in the morning and then you actually live the day: things
// take longer than the guess, things take less, and the clock does not care
// what the plan said. This walks the real clock through every working day and
// records what got done, what fell off the bottom, how far behind the day drifted,
// and what the app THOUGHT it was learning about how long your work takes.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","weekplan.js","names.js","quickparse.js"];
function load(t) {
  const D = class extends Date {
    constructor(...a){ if(!a.length) super(t); else super(...a); }
    static now(){ return t; }
  };
  const sb = { window:{}, console, Date:D, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const at = (iso, hm) => new Date(`${iso}T${hm}:00`).getTime();
const START = "2026-09-14";
const dISO = (n) => { const d=new Date(START+"T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const WORKDAYS = []; for (let w=0;w<4;w++) for (let d=0;d<5;d++) WORKDAYS.push(dISO(w*7+d));
const lab = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});

const W = load(at(START,"08:00"));
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan, WP = W.OrganiserWeekPlan;
const HM = (m) => S.toHM(m);

// ---- the same month as before ----------------------------------------------
const SCHED = [
  { id:"reg", label:"Registration",       start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"brk", label:"Break",              start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"lun", label:"Lunch",              start:"12:30", end:"13:15", days:[1,3,5] },
  { id:"duty",label:"Lunch duty",         start:"12:30", end:"13:15", days:[2,4] },
  { id:"m1", label:"P1 Year 7 English",   start:"09:00", end:"09:50", days:[1,3,5] },
  { id:"m2", label:"P2 Year 9 English",   start:"09:55", end:"10:45", days:[1,2,4] },
  { id:"m3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[1,2,3,4] },
  { id:"m4", label:"P4 Year 10 English",  start:"11:55", end:"12:30", days:[3] },
  { id:"m5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[1,2,3,4,5] },
  { id:"m6", label:"P6 Year 12 Lit",      start:"15:05", end:"15:55", days:[3] },
  { id:"plan",label:"Department planning",start:"15:10", end:"16:10", days:[4] },
];
const CFG0 = { dayStart:"08:00", dayEnd:"17:00" };
const THURS = WORKDAYS.filter(i => new Date(i+"T12:00:00").getDay() === 4);
const mk = (o,id) => ({ id, type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false,
  promisedTo:"", waitingOn:"", done:false, importance:"normal", effort:"medium", deadlineType:"soft",
  date:"", notBefore:"", ...o });

const SEED = [
  ["Mark the year 9 essays",              dISO(2),  "hard","normal","draining"],
  ["Email Helen about the trip money",    "",       "soft","normal","quick"],
  ["Write the year 11 mock report",       dISO(4),  "hard","normal","draining"],
  ["Order new whiteboard pens",           "",       "soft","low",   "quick"],
  ["Tidy the stockroom",                  "",       "soft","low",   "medium"],
  ["Print the year 7 knowledge organisers",dISO(1), "hard","normal","medium"],
].map(([title,date,deadlineType,importance,effort],i)=>mk({title,date,deadlineType,importance,effort},"s"+i));

const MEETING_WORK = [
  [["Write the year 8 scheme of work",dISO(8),"draining"],["Book the theatre trip coach",dISO(8),"quick"]],
  [["Draft the parents evening letter",dISO(13),"medium"],["Moderate the year 11 coursework",dISO(15),"draining"],
   ["Update the department risk assessment",dISO(16),"medium"],["Collect the year 7 reading data",dISO(14),"quick"],
   ["Chase Sarah about the exam entries",dISO(15),"quick"]],
  [["Order the exam stationery",dISO(22),"quick"]],
  [["Write the year 10 reports",dISO(30),"draining"],["Plan the year 12 revision programme",dISO(29),"draining"],
   ["Review the year 9 setting",dISO(30),"medium"],["Email Wang Wei about the exchange",dISO(26),"quick"]],
];
const CRISIS_DAY = dISO(8);
const CRISIS_BLOCKS = [
  { label:"Incident — Year 9",        date:CRISIS_DAY, start:"11:05", end:"12:40" },
  { label:"Meeting with SLT",         date:dISO(9),    start:"08:00", end:"08:40" },
  { label:"Meeting with parents",     date:dISO(11),   start:"15:10", end:"16:10" },
  { label:"Follow-up with SLT",       date:dISO(16),   start:"08:00", end:"08:40" },
];
const CRISIS = [
  ["Write up the incident record",      CRISIS_DAY,"hard","high",  "medium",  ""],
  ["Complete the safeguarding referral",dISO(9),  "hard","high",  "medium",  ""],
  ["Ring the parents",                  dISO(9),  "hard","high",  "quick",   ""],
  ["Write the statement for SLT",       dISO(10), "hard","high",  "draining",""],
  ["Write up the parent meeting notes", dISO(14), "hard","normal","medium",  dISO(11)],
  ["Draft the support plan",            dISO(16), "hard","high",  "draining",dISO(11)],
  ["Update the behaviour log",          dISO(18), "hard","normal","quick",   dISO(11)],
  ["Check in with the student",         dISO(19), "soft","normal","quick",   ""],
].map(([title,date,deadlineType,importance,effort,notBefore],i)=>
  mk({title,date,deadlineType,importance,effort,notBefore,crisis:true},"c"+i));

// ---- how long things REALLY take -------------------------------------------
// Deterministic, but spread the way real work is: mostly near the guess, a
// stubborn tail that runs well over, and a few that are done in a moment.
function hash(s){ let h=2166136261; for(const ch of String(s)) h=Math.imul(h^ch.charCodeAt(0),16777619); return (h>>>0)/4294967296; }
const FACTORS = [0.35,0.5,0.6,0.8,0.9,1.0,1.0,1.15,1.3,1.6,2.1,2.6];
const BASE = S.normaliseConfig(CFG0).effortMinutes;   // fixed, never learned
function trueMinutes(it) {
  const f = FACTORS[Math.floor(hash(it.id+it.title)*FACTORS.length)];
  return Math.max(3, Math.round((BASE[it.effort] || BASE.medium) * f));
}

// ---- live one day on the clock ---------------------------------------------
function liveDay(iso, items, sched, cfg, journal, opts) {
  const ctx = { today: iso, goalTitle: () => "" };
  const plan = P.build(items, sched, cfg, iso, { ctx });
  const dayEnd = S.toMin(S.normaliseConfig(cfg).dayEnd);
  const busy = S.busyOn(sched, iso);
  const freeAt = (m) => { // first minute >= m that isn't inside a fixed block
    let t = m;
    for (let i=0;i<busy.length;i++) if (t >= busy[i].start && t < busy[i].end) { t = busy[i].end; i = -1; }
    return t;
  };
  let clock = plan.slots.length ? Math.min(...plan.slots.map(s=>s.start)) : dayEnd;
  const rows = [];
  let drift = 0;

  for (const slot of plan.slots) {
    const it = items.find(i=>i.id===slot.itemId);
    if (!it || it.done) continue;
    const est = S.estimateMinutes(it, cfg).minutes;
    // You start when you're free, which is at or after the planned time.
    let began = freeAt(Math.max(clock, slot.start));
    const real = trueMinutes(it);   // how long it ACTUALLY takes, always
    // Working across a fixed block isn't possible; you stop and resume.
    let remaining = real, t = began, endedAt = null;
    while (remaining > 0) {
      t = freeAt(t);
      if (t >= dayEnd) break;
      const nextBusy = busy.find(b => b.start > t);
      const until = Math.min(dayEnd, nextBusy ? nextBusy.start : dayEnd);
      const chunk = Math.min(remaining, until - t);
      t += chunk; remaining -= chunk;
      if (remaining <= 0) endedAt = t;
    }
    if (endedAt === null) {                       // ran out of day
      rows.push({ it, slot, began, ended:null, real, est, fellThrough:true });
      journal.fellThrough.push({ iso, title: it.title, est, needed: real });
      continue;
    }
    clock = endedAt;
    drift = Math.max(drift, endedAt - slot.end);
    rows.push({ it, slot, began, ended:endedAt, real, est, fellThrough:false });

    // ---- exactly what completeFromPlan() does when you tick it -------------
    it.done = true;
    let elapsed, plausible;
    if (opts.oldWay) {
      elapsed = endedAt - slot.start;                       // from the PLANNED start
      plausible = elapsed > 0 && elapsed <= (slot.end - slot.start) * 2;
    } else {
      // The later of "when the plan said" and "when you last ticked something".
      const began2 = Math.max(slot.start, journal.lastTickMin ?? -1);
      elapsed = S.workingMinutesBetween(sched, iso, began2, endedAt);
      plausible = elapsed >= 1 && elapsed <= Math.max(4 * est, 120);
    }
    const before = S.normaliseConfig(cfg).learned[it.effort];
    if (plausible) cfg = S.learn(cfg, it, elapsed);
    const after = S.normaliseConfig(cfg).learned[it.effort];
    journal.lastTickMin = endedAt;
    journal.learned.push({ iso, title: it.title, effort: it.effort, real,
      taught: plausible ? elapsed : null, tookEffect: before !== after });
  }

  // Everything the plan listed but the day never reached.
  return { plan, rows, drift, cfg };
}

// ---- run the month ---------------------------------------------------------
function runMonth(showDays, opts) {
  opts = opts || {};
  let items = SEED.map(x=>({...x}));
  let sched = S.normalise(SCHED);
  let cfg = { ...CFG0 };
  const journal = { fellThrough: [], learned: [], days: [] };

  WORKDAYS.forEach((iso) => {
    CRISIS_BLOCKS.filter(b=>b.date===iso).forEach(b => {
      const blk = S.normaliseBlock({ label:b.label, start:b.start, end:b.end, date:iso });
      if (blk) sched = sched.concat([blk]);
    });
    if (iso === CRISIS_DAY) CRISIS.forEach(c => items.push({...c}));

    journal.lastTickMin = -1;   // a new day: nothing ticked yet
    const out = liveDay(iso, items, sched, cfg, journal, opts);
    cfg = out.cfg;
    journal.days.push({ iso, ...out });

    const wk = THURS.indexOf(iso);
    if (wk >= 0) MEETING_WORK[wk].forEach(([title,date,effort],i) =>
      items.push(mk({ title, date, deadlineType:"hard", effort }, `p${wk}_${i}`)));

    if (showDays.includes(iso)) {
      console.log(`\n── ${lab(iso)} ${"─".repeat(46)}`);
      S.blocksOn(sched, iso).forEach(b => console.log(`   ${S.fmtSpan(b.start,b.end).padEnd(17)} ▓ ${b.label}`));
      out.rows.forEach(r => {
        if (r.fellThrough) {
          console.log(`   ${"— never reached —".padEnd(17)} ✗ ${r.it.title}  (planned ${HM(r.slot.start)}, needed ${S.durationWords(r.real)})`);
          return;
        }
        const late = r.began - r.slot.start;
        const over = r.real - r.est;
        console.log(`   ${(HM(r.began)+"–"+HM(r.ended)).padEnd(17)} ${over>0?"▲":over<0?"▼":"="} ${r.it.title}` +
          `   planned ${HM(r.slot.start)} for ${S.durationWords(r.est)}, took ${S.durationWords(r.real)}` +
          (late>0?`, started ${S.durationWords(late)} late`:""));
      });
      console.log(`   worst drift past a planned finish: ${S.durationWords(out.drift)}`);
    }
  });
  return { items, cfg, journal };
}

console.log("═".repeat(76));
console.log("A MONTH, LIVED ON THE CLOCK — three days shown in full");
console.log("═".repeat(76));
const R = runMonth([WORKDAYS[0], CRISIS_DAY, dISO(11)]);

// ---- what it all added up to -----------------------------------------------
const J = R.journal;
console.log(`\n${"═".repeat(76)}\nOVER THE MONTH`);
const totalPlanned = J.days.reduce((n,d)=>n+d.rows.length,0);
console.log(`  jobs the plans put on a day: ${totalPlanned}`);
console.log(`  of those, never reached:     ${J.fellThrough.length}`);
const drifts = J.days.map(d=>d.drift).filter(d=>d>0);
console.log(`  days that ran over:          ${drifts.length}/${J.days.length}` +
  (drifts.length ? `   worst ${S.durationWords(Math.max(...drifts))}, typical ${S.durationWords(Math.round(drifts.reduce((a,b)=>a+b,0)/drifts.length))}` : ""));
if (J.fellThrough.length) {
  console.log(`\n  FELL THROUGH THE BOTTOM OF THE DAY:`);
  J.fellThrough.forEach(f => console.log(`     ${lab(f.iso)}  ${f.title}  (guessed ${S.durationWords(f.est)}, really needed ${S.durationWords(f.needed)})`));
}

console.log(`\n  WHAT IT LEARNED ABOUT HOW LONG YOUR WORK TAKES`);
const D = S.normaliseConfig(CFG0);
["quick","medium","draining"].forEach(e => {
  const seen = J.learned.filter(l=>l.effort===e);
  const realAvg = seen.length ? Math.round(seen.reduce((n,l)=>n+l.real,0)/seen.length) : 0;
  const taught = seen.filter(l=>l.taught !== null);
  const taughtAvg = taught.length ? Math.round(taught.reduce((n,l)=>n+l.taught,0)/taught.length) : 0;
  const ended = S.normaliseConfig(R.cfg).learned[e];
  console.log(`     ${e.padEnd(9)} started at ${String(D.effortMinutes[e]).padStart(3)} min · truth averaged ${String(realAvg).padStart(3)} min` +
    ` · it was told ${String(taughtAvg).padStart(3)} min (${taught.length}/${seen.length} believed) · now thinks ${ended || D.effortMinutes[e]} min`);
});
const wrong = J.learned.filter(l => l.taught !== null && Math.abs(l.taught - l.real) > 5);
console.log(`     measurements that were wrong by more than 5 min: ${wrong.length}/${J.learned.filter(l=>l.taught!==null).length}`);
if (wrong.length) wrong.slice(0,6).forEach(l =>
  console.log(`        ${lab(l.iso)}  ${l.title}: really ${l.real} min, recorded as ${l.taught} min`));

// ---- the same month, measured the old way, for comparison ------------------
console.log(`\n${"═".repeat(76)}\nTHE SAME MONTH, MEASURED THE OLD WAY (from the planned start, 2x-slot guard)`);
const OLD = runMonth([], { oldWay: true });
["quick","medium","draining"].forEach(e => {
  const mine = R.journal.learned.filter(l=>l.effort===e);
  const theirs = OLD.journal.learned.filter(l=>l.effort===e);
  const avg = (a,k)=> a.length ? Math.round(a.reduce((n,l)=>n+(k(l)||0),0)/a.length) : 0;
  const realAvg = avg(mine, l=>l.real);
  const oldEnd = S.normaliseConfig(OLD.cfg).learned[e] || S.normaliseConfig(CFG0).effortMinutes[e];
  const newEnd = S.normaliseConfig(R.cfg).learned[e] || S.normaliseConfig(CFG0).effortMinutes[e];
  const err = (v)=> (v-realAvg >= 0 ? "+" : "") + (v-realAvg);
  console.log(`  ${e.padEnd(9)} truth ${String(realAvg).padStart(3)} min  ·  old way ended at ${String(oldEnd).padStart(3)} (${err(oldEnd)})` +
    `  ·  now ends at ${String(newEnd).padStart(3)} (${err(newEnd)})` +
    `  ·  believed ${mine.filter(l=>l.taught!==null).length}/${mine.length} vs ${theirs.filter(l=>l.taught!==null).length}/${theirs.length}`);
});
