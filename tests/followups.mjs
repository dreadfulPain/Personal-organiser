import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A MONTH, LIVED — with the three things that actually make days messy:
//   1. work that spawns MORE work when you finish it
//   2. work that runs well over the guess
//   3. work that gets INTERRUPTED half way through
//
// The third is the one nothing has tested yet. An interrupted job isn't done
// and isn't untouched — it's half done, and the app has no word for that.
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
const START = "2026-09-14";
const dISO = (n) => { const d=new Date(START+"T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const WORKDAYS = []; for (let w=0;w<4;w++) for (let d=0;d<5;d++) WORKDAYS.push(dISO(w*7+d));
const lab = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const W = load(new Date(START+"T08:00:00").getTime());
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan;
const HM = (m) => S.toHM(m);

const SCHED = [
  { id:"reg", label:"Registration",       start:"08:40", end:"09:00", days:[1,2,3,4,5] },
  { id:"brk", label:"Break",              start:"10:45", end:"11:05", days:[1,2,3,4,5] },
  { id:"lun", label:"Lunch",              start:"12:30", end:"13:15", days:[1,3,5] },
  { id:"duty",label:"Lunch duty",         start:"12:30", end:"13:15", days:[2,4] },
  { id:"m1", label:"P1 Year 7 English",   start:"09:00", end:"09:50", days:[1,3,5] },
  { id:"m2", label:"P2 Year 9 English",   start:"09:55", end:"10:45", days:[1,2,4] },
  { id:"m3", label:"P3 Year 11 Lit",      start:"11:05", end:"11:55", days:[1,2,3,4] },
  { id:"m5", label:"P5 Year 8 English",   start:"14:10", end:"15:00", days:[1,2,3,4,5] },
  { id:"plan",label:"Department planning",start:"15:10", end:"16:10", days:[4] },
];
const CFG0 = { dayStart:"08:00", dayEnd:"17:00" };
const THURS = WORKDAYS.filter(i => new Date(i+"T12:00:00").getDay() === 4);
const mk = (o,id) => ({ id, type:"task", time:"", tags:[], whenText:"", goalId:"", openLoop:false,
  promisedTo:"", waitingOn:"", done:false, importance:"normal", effort:"medium", deadlineType:"soft",
  date:"", notBefore:"", ...o });

// ---- work that makes more work when you finish it --------------------------
// title of the follow-up, how many days later it's due, its size.
const FOLLOWS = {
  "Mark the year 9 essays":            ["Enter the year 9 grades", 1, "medium"],
  "Enter the year 9 grades":           ["Chase the three missing essays", 2, "quick"],
  "Email Helen about the trip money":  ["Chase Helen — no reply on the trip money", 3, "quick"],
  "Ring the parents":                  ["Send the parents a written summary", 1, "medium"],
  "Write the statement for SLT":       ["Amend the statement after SLT come back", 3, "medium"],
  "Write the year 11 mock report":     ["Sit down with the three who failed", 4, "draining"],
  "Moderate the year 11 coursework":   ["Re-mark the four that were out", 3, "draining"],
  "Draft the parents evening letter":  ["Chase the non-responders", 5, "quick"],
};

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
   ["Update the department risk assessment",dISO(16),"medium"],["Collect the year 7 reading data",dISO(14),"quick"]],
  [["Order the exam stationery",dISO(22),"quick"]],
  [["Write the year 10 reports",dISO(30),"draining"],["Review the year 9 setting",dISO(30),"medium"]],
];
const CRISIS_DAY = dISO(8);
const CRISIS_BLOCKS = [
  { label:"Incident — Year 9",    date:CRISIS_DAY, start:"11:05", end:"12:40" },
  { label:"Meeting with SLT",     date:dISO(9),    start:"08:00", end:"08:40" },
  { label:"Meeting with parents", date:dISO(11),   start:"15:10", end:"16:10" },
];
const CRISIS = [
  ["Write up the incident record",      CRISIS_DAY,"hard","high",  "medium",  ""],
  ["Ring the parents",                  dISO(9),  "hard","high",   "quick",   ""],
  ["Write the statement for SLT",       dISO(10), "hard","high",   "draining",""],
  ["Write up the parent meeting notes", dISO(14), "hard","normal", "medium",  dISO(11)],
  ["Draft the support plan",            dISO(16), "hard","high",   "draining",dISO(11)],
].map(([title,date,deadlineType,importance,effort,notBefore],i)=>
  mk({title,date,deadlineType,importance,effort,notBefore},"c"+i));

// ---- reality ---------------------------------------------------------------
// FNV alone clusters badly on near-identical strings — an earlier version gave
// one interruption in twenty days. Mix the bits properly (mulberry32 step).
function hash(s){
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
const FACTORS = [0.4,0.6,0.75,0.9,1.0,1.1,1.25,1.5,1.8,2.2,2.8];
const BASE = S.normaliseConfig(CFG0).effortMinutes;
const trueMinutes = (it) => Math.max(3, Math.round((BASE[it.effort]||BASE.medium) * FACTORS[Math.floor(hash(it.id+it.title)*FACTORS.length)]));

// Someone at the door, a phone call, a child in tears. Deterministic per day.
function interruptionsOn(iso) {
  const out = [];
  const n = hash("count"+iso);
  const many = n < 0.15 ? 0 : n < 0.55 ? 1 : n < 0.85 ? 2 : 3;
  for (let k = 0; k < many; k++) {
    const at = 8*60 + Math.floor(hash(`when${k}`+iso) * 8*60);
    const long = hash(`len${k}`+iso);
    out.push({ at, mins: long < 0.6 ? 4 + Math.floor(long*18) : 15 + Math.floor(long*35) });
  }
  return out.sort((a,b)=>a.at-b.at);
}

// ---- live a day ------------------------------------------------------------
function liveDay(iso, items, sched, cfg, J, opts) {
  const ctx = { today: iso, goalTitle: () => "" };
  const plan = P.build(items, sched, cfg, iso, { ctx });
  const dayEnd = S.toMin(S.normaliseConfig(cfg).dayEnd);
  const declaredBlocks = [];
  let busy = S.busyOn(sched, iso);
  const ints = interruptionsOn(iso).slice();
  const rows = [];
  let lastTick = -1;

  // Deal with an interruption at time t; returns the clock afterwards.
  function take(x, t) {
    const end = Math.min(t + x.mins, dayEnd - 1);
    if (x.mins >= 15) {
      // Long enough that you'd press "something's come up", so it gets written
      // down and the app knows that time went somewhere real.
      const b = S.normaliseBlock({ label:"Something came up", start:HM(t), end:HM(end), date:iso, source:"interruption" });
      if (b) { declaredBlocks.push(b); busy = S.busyOn(sched.concat(declaredBlocks), iso); }
      J.declared++; J.declaredMins += x.mins;
    } else {
      J.undeclared += x.mins;   // absorbed, the app never hears about it
    }
    return end;
  }
  // Advance to the next minute you could actually be working: past lessons, and
  // through any interruption that has landed by then.
  function workable(t) {
    for (let guard = 0; guard < 200; guard++) {
      const b = busy.find((x) => t >= x.start && t < x.end);
      if (b) { t = b.end; continue; }
      const i = ints.findIndex((x) => x.at <= t);
      if (i >= 0) { t = take(ints.splice(i, 1)[0], t); continue; }
      return t;
    }
    return t;
  }

  let clock = plan.slots.length ? Math.min(...plan.slots.map((s) => s.start)) : dayEnd;

  for (const slot of plan.slots) {
    const it = items.find((i) => i.id === slot.itemId);
    if (!it || it.done) continue;
    const alreadyDone = opts.rememberPartDone ? Math.round(Number(it.spentMinutes) || 0) : 0;
    const need = Math.max(1, trueMinutes(it) - alreadyDone);

    let t = workable(Math.max(clock, slot.start));
    let remaining = need, endedAt = null, spent = 0, breaks = 0;

    while (remaining > 0) {
      t = workable(t);
      if (t >= dayEnd) break;
      const nextBusy = busy.find((b) => b.start > t);
      const nextInt = ints.find((x) => x.at > t);
      const until = Math.min(dayEnd, nextBusy ? nextBusy.start : dayEnd, nextInt ? nextInt.at : dayEnd);
      const chunk = Math.min(remaining, Math.max(0, until - t));
      t += chunk; remaining -= chunk; spent += chunk;
      if (remaining <= 0) { endedAt = t; break; }
      if (nextInt && t >= nextInt.at) { breaks++; }   // workable() will consume it
      if (chunk === 0 && !nextBusy && !nextInt) break; // nothing left in the day
    }

    if (endedAt === null) {
      // You press "got part way" — the app keeps the minutes on the item, so
      // tomorrow's plan asks for what's LEFT.
      if (opts.rememberPartDone) it.spentMinutes = (Math.round(Number(it.spentMinutes) || 0)) + spent;
      else J.rework += spent;
      J.partDone.set(it.id, (J.partDone.get(it.id) || 0) + spent);
      rows.push({ it, slot, spent, need, unfinished: true, breaks });
      continue;
    }
    clock = endedAt;

    it.done = true;
    const began = Math.max(slot.start, lastTick);
    const elapsed = S.workingMinutesBetween(sched.concat(declaredBlocks), iso, began, endedAt);
    const est2 = S.estimateMinutes(it, cfg).minutes;
    if (elapsed >= 1 && elapsed <= Math.max(4 * est2, 120)) cfg = S.learn(cfg, it, elapsed);
    lastTick = endedAt;
    J.measured.push({ iso, title: it.title, effort: it.effort, truth: need, recorded: elapsed, breaks });
    rows.push({ it, slot, spent, need, endedAt, unfinished: false, breaks });

    const f = FOLLOWS[it.title];
    if (f) {
      const [title, days, effort] = f;
      const born = mk({ title, date: dISO(WORKDAYS.indexOf(iso) + days + Math.floor(WORKDAYS.indexOf(iso)/5)*2),
        deadlineType:"soft", effort, bornFrom: it.title, bornOn: iso }, "f"+J.spawned);
      items.push(born);
      J.spawned++;
      J.chain.push({ iso, from: it.title, to: title });
    }
  }
  return { plan, rows, cfg, declaredBlocks };
}

function runMonth(opts, showDays) {
  let items = SEED.map(x=>({...x}));
  let sched = S.normalise(SCHED);
  let cfg = { ...CFG0 };
  const J = { partDone:new Map(), rework:0, spawned:0, chain:[], measured:[], declared:0, declaredMins:0, undeclared:0, days:[] };

  WORKDAYS.forEach((iso) => {
    CRISIS_BLOCKS.filter(b=>b.date===iso).forEach(b => {
      const blk = S.normaliseBlock({ label:b.label, start:b.start, end:b.end, date:iso });
      if (blk) sched = sched.concat([blk]);
    });
    if (iso === CRISIS_DAY) CRISIS.forEach(c => items.push({...c}));

    const out = liveDay(iso, items, sched, cfg, J, opts);
    cfg = out.cfg;
    J.days.push({ iso, ...out });

    const wk = THURS.indexOf(iso);
    if (wk >= 0 && MEETING_WORK[wk]) MEETING_WORK[wk].forEach(([title,date,effort],i)=>
      items.push(mk({ title, date, deadlineType:"hard", effort }, `p${wk}_${i}`)));

    if (showDays.includes(iso)) {
      console.log(`\n── ${lab(iso)} ${"─".repeat(48)}`);
      S.blocksOn(sched.concat(out.declaredBlocks), iso).forEach(b =>
        console.log(`   ${S.fmtSpan(b.start,b.end).padEnd(17)} ▓ ${b.label}`));
      out.rows.forEach(r => {
        if (r.unfinished) {
          console.log(`   ${"— ran out of day —".padEnd(17)} ✗ ${r.it.title}   ${S.durationWords(r.spent)} put in, ${S.durationWords(r.need - r.spent)} still to go` +
            (r.breaks ? `, interrupted ${r.breaks}x` : "") + (opts.rememberPartDone ? "  (remembered)" : "  ← thrown away"));
          return;
        }
        console.log(`   ${(HM(r.endedAt - r.spent)+"–"+HM(r.endedAt)).padEnd(17)} ✓ ${r.it.title}   took ${S.durationWords(r.need)}` +
          (r.breaks ? `, interrupted ${r.breaks}x` : ""));
      });
    }
  });
  return { items, cfg, J };
}

console.log("═".repeat(78));
console.log("A MONTH WITH FOLLOW-UPS, OVERRUNS AND INTERRUPTIONS");
console.log("═".repeat(78));
const A = runMonth({ rememberPartDone:false }, [WORKDAYS[0], WORKDAYS[1], CRISIS_DAY]);

const J = A.J;
console.log(`\n${"═".repeat(78)}\nWORK THAT MADE MORE WORK`);
console.log(`  follow-ups the month generated: ${J.spawned}`);
J.chain.slice(0,10).forEach(c => console.log(`     ${lab(c.iso)}  ${c.from}  →  ${c.to}`));
const spawnedItems = A.items.filter(i=>i.bornFrom);
console.log(`  of those, still not done at the end of the month: ${spawnedItems.filter(i=>!i.done).length}/${spawnedItems.length}`);
spawnedItems.filter(i=>!i.done).forEach(i => console.log(`     ✗ ${i.title}  (from "${i.bornFrom}" on ${lab(i.bornOn)})`));

console.log(`\n  HALF-DONE WORK`);
const unfinished = J.days.flatMap(d=>d.rows.filter(r=>r.unfinished));
console.log(`  times a job ran out of day part way in: ${unfinished.length}`);
console.log(`  effort put in and then thrown away:     ${S.durationWords(J.rework)}`);
unfinished.slice(0,8).forEach(r => console.log(`     ${r.it.title}: ${S.durationWords(r.spent)} in, then gone`));

console.log(`\n  INTERRUPTIONS`);
console.log(`  long enough to declare (written down as a block): ${J.declared} totalling ${S.durationWords(J.declaredMins)}`);
console.log(`  short ones the app never heard about:             ${S.durationWords(J.undeclared)}`);
const bad = J.measured.filter(m => Math.abs(m.recorded - m.truth) > 5);
console.log(`  measurements thrown off by more than 5 min:       ${bad.length}/${J.measured.length}`);
bad.slice(0,6).forEach(m => console.log(`     ${lab(m.iso)}  ${m.title}: really ${m.truth} min, recorded ${m.recorded} min`));

// ---- the same month, if half-done work were remembered ---------------------
const B = runMonth({ rememberPartDone:true }, []);
console.log(`\n${"═".repeat(78)}\nIF HALF-DONE WORK WERE REMEMBERED`);
const openA = A.items.filter(i=>!i.done).length, openB = B.items.filter(i=>!i.done).length;
console.log(`  effort thrown away:   ${S.durationWords(J.rework)}  →  ${S.durationWords(B.J.rework)}`);
console.log(`  still open at month end: ${openA}  →  ${openB}`);
console.log(`  jobs finished:           ${A.items.length-openA}/${A.items.length}  →  ${B.items.length-openB}/${B.items.length}`);

// ---- the structural case: a job bigger than any one day ---------------------
// Does work larger than a day's free time EVER finish without part-done?
console.log(`\n${"═".repeat(78)}\nA JOB BIGGER THAN ANY SINGLE DAY (6 hours of marking, ~3h free a day)`);
{
  const sched = S.normalise([
    { id:"a", label:"Lessons AM", start:"09:00", end:"12:00", days:[1,2,3,4,5] },
    { id:"b", label:"Lessons PM", start:"14:00", end:"16:00", days:[1,2,3,4,5] },
  ]);
  const cfg = { dayStart:"08:00", dayEnd:"17:00" };   // free: 8-9, 12-14, 16-17 = 4h
  const REAL = 6 * 60;
  [false, true].forEach((remember) => {
    const it = mk({ title:"The big marking pile", effort:"draining", date: dISO(1), deadlineType:"hard" }, "big");
    let done = null, put = 0;
    for (let d = 0; d < 10 && !done; d++) {
      const iso = WORKDAYS[d];
      const gaps = S.gapsOn(sched, S.normaliseConfig(cfg), iso);
      const est = S.estimateMinutes(it, cfg);
      const roomToday = gaps.reduce((n,g)=>n+(g.end-g.start), 0);
      const need = REAL - (remember ? (Number(it.spentMinutes)||0) : 0);
      const didToday = Math.min(need, roomToday);
      put += didToday;
      if (didToday >= need) { done = iso; break; }
      if (remember) it.spentMinutes = (Number(it.spentMinutes)||0) + didToday;
    }
    console.log(`  ${remember ? "with " : "without"} part-done:  ` +
      (done ? `finished ${lab(done)} after ${S.durationWords(put)} at the desk`
            : `NEVER FINISHES — ${S.durationWords(put)} spent over 10 days and still nothing to show`));
  });
}
