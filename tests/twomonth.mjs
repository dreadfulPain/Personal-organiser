import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// TWO MONTHS, HOUR BY HOUR. Eight weeks of ordinary teaching with:
//   · a weekly planning meeting handing out work in uneven bursts
//   · a crisis in month one that eats a fortnight
//   · interruptions all the way through
//   · work that spawns follow-ups
//   · and in month two, PARENTS EVENING with a big pile of reports behind it
//
// The questions: does the big job get chipped away early or left to the end?
// Do month one's interruptions knock it off course? And above all — on what day
// could the app FIRST have known there was going to be trouble, and did it say?
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
const FILES = ["schedule.js","priority.js","dayplan.js","weekplan.js","names.js","quickparse.js"];
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
const lab = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const W = load(new Date(START+"T08:00:00").getTime());
const S = W.OrganiserSchedule, P = W.OrganiserDayPlan, WP = W.OrganiserWeekPlan;
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
  date:"", notBefore:"", spentMinutes:0, ...o });

// ---- THE BIG ONE: parents evening in week 7, reports due the day before -----
const PARENTS_EVENING = dISO(7*7 + 2);        // Wednesday of week 8
const REPORTS_DUE     = dISO(7*7 + 1);        // Tuesday — the day before
const BIG = mk({ title:"Write the year 10 progress reports", date:REPORTS_DUE,
  deadlineType:"hard", importance:"high", effort:"draining", plannedMinutes: 8*60 }, "BIG");
const BIG_REAL = 8 * 60;                       // eight hours of actual work
const EVENING_BLOCKS = [
  { label:"PARENTS EVENING", date:PARENTS_EVENING, start:"16:00", end:"19:00" },
  { label:"Parents evening briefing", date:dISO(7*7), start:"15:10", end:"16:10" },
];

const FOLLOWS = {
  "Mark the year 9 essays":           ["Enter the year 9 grades", 1, "medium"],
  "Email Helen about the trip money": ["Chase Helen — no reply", 3, "quick"],
  "Ring the parents":                 ["Send the parents a written summary", 1, "medium"],
  "Write the statement for SLT":      ["Amend the statement after SLT come back", 3, "medium"],
  "Moderate the year 11 coursework":  ["Re-mark the four that were out", 3, "draining"],
  "Write the year 10 progress reports":["Print and collate the reports", 1, "medium"],
};

const SEED = [
  ["Mark the year 9 essays",               dISO(2), "hard","normal","draining"],
  ["Email Helen about the trip money",     "",      "soft","normal","quick"],
  ["Write the year 11 mock report",        dISO(4), "hard","normal","draining"],
  ["Tidy the stockroom",                   "",      "soft","low",   "medium"],
  ["Print the year 7 knowledge organisers",dISO(1), "hard","normal","medium"],
].map(([title,date,deadlineType,importance,effort],i)=>mk({title,date,deadlineType,importance,effort},"s"+i));

// Eight planning meetings, uneven on purpose. Week 6 is deliberately heavy —
// right when the reports need chipping at.
const MEETING_WORK = [
  [["Write the year 8 scheme of work",8,"draining"],["Book the theatre trip coach",8,"quick"]],
  [["Draft the parents evening letter",13,"medium"],["Moderate the year 11 coursework",15,"draining"]],
  [["Order the exam stationery",22,"quick"]],
  [["Review the year 9 setting",30,"medium"],["Collect the year 7 reading data",29,"quick"]],
  [["Update the department risk assessment",37,"medium"]],
  [["Write the year 12 mock papers",44,"draining"],["Moderate the year 8 assessments",44,"draining"],
   ["Chase the exam entries",43,"quick"],["Update the reading lists",44,"medium"]],
  [["Book the parents evening rooms",51,"quick"],["Print the year 10 data sheets",51,"medium"]],
  [["Write the term summary",58,"medium"]],
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

function hash(s){ let h=2166136261; for(const ch of String(s)) h=Math.imul(h^ch.charCodeAt(0),16777619);
  h=Math.imul(h^(h>>>15),h|1); h^=h+Math.imul(h^(h>>>7),h|61); return ((h^(h>>>14))>>>0)/4294967296; }
const FACTORS = [0.4,0.6,0.75,0.9,1.0,1.1,1.25,1.5,1.8,2.2,2.8];
const BASEMIN = S.normaliseConfig(CFG0).effortMinutes;
const trueTotal = (it) => it.id === "BIG" ? BIG_REAL
  : Math.max(3, Math.round((BASEMIN[it.effort]||BASEMIN.medium) * FACTORS[Math.floor(hash(it.id+it.title)*FACTORS.length)]));

function interruptionsOn(iso) {
  const out = []; const n = hash("count"+iso);
  const many = n < 0.15 ? 0 : n < 0.55 ? 1 : n < 0.85 ? 2 : 3;
  for (let k = 0; k < many; k++) {
    const at = 8*60 + Math.floor(hash(`when${k}`+iso) * 8*60);
    const long = hash(`len${k}`+iso);
    out.push({ at, mins: long < 0.6 ? 4 + Math.floor(long*18) : 15 + Math.floor(long*35) });
  }
  return out.sort((a,b)=>a.at-b.at);
}

// ---- live a day -------------------------------------------------------------
function liveDay(iso, items, sched, cfg, J, opts) {
  const ctx = { today: iso, goalTitle: () => "" };
  const plan = P.build(items, sched, cfg, iso, { ctx });
  const dayEnd = S.toMin(S.normaliseConfig(cfg).dayEnd);
  const declared = [];
  let busy = S.busyOn(sched, iso);
  const ints = interruptionsOn(iso).slice();
  const rows = []; let lastTick = -1;

  function take(x, t, current) {
    const end = Math.min(t + x.mins, dayEnd - 1);
    if (x.mins >= 15) {
      const b = S.normaliseBlock({ label:"Something came up", start:HM(t), end:HM(end), date:iso, source:"interruption" });
      if (b) { declared.push(b); busy = S.busyOn(sched.concat(declared), iso); }
      J.declared++; J.declaredMins += x.mins;
      // THE BUTTON: pressing it pauses whatever was in your hands, so the
      // minutes already put in are kept instead of evaporating.
      if (opts.pauseButton && current && current.spent > 0) {
        current.it.spentMinutes = Math.round(Number(current.it.spentMinutes)||0) + current.spent;
        current.banked = true;
        J.bankedByButton += current.spent;
      }
    } else J.undeclared += x.mins;
    return end;
  }
  function workable(t, current) {
    for (let g = 0; g < 300; g++) {
      const b = busy.find((x) => t >= x.start && t < x.end);
      if (b) { t = b.end; continue; }
      const i = ints.findIndex((x) => x.at <= t);
      if (i >= 0) { t = take(ints.splice(i,1)[0], t, current); continue; }
      return t;
    }
    return t;
  }

  let clock = plan.slots.length ? Math.min(...plan.slots.map(s=>s.start)) : dayEnd;
  for (const slot of plan.slots) {
    const it = items.find(i=>i.id===slot.itemId);
    if (!it || it.done) continue;
    const already = Math.round(Number(it.spentMinutes)||0);
    const need = Math.max(1, trueTotal(it) - already);
    const current = { it, spent: 0, banked: false };

    let t = workable(Math.max(clock, slot.start), current);
    let remaining = need, endedAt = null;
    while (remaining > 0) {
      t = workable(t, current);
      if (t >= dayEnd) break;
      const nb = busy.find(b => b.start > t), ni = ints.find(x => x.at > t);
      const until = Math.min(dayEnd, nb ? nb.start : dayEnd, ni ? ni.at : dayEnd);
      const chunk = Math.min(remaining, Math.max(0, until - t));
      t += chunk; remaining -= chunk; current.spent += chunk;
      if (remaining <= 0) { endedAt = t; break; }
      if (chunk === 0 && !nb && !ni) break;
    }

    if (endedAt === null) {
      // Ran out of day. You'd press "got part way" — the minutes are kept.
      const newMins = current.banked ? 0 : current.spent;
      it.spentMinutes = Math.round(Number(it.spentMinutes)||0) + newMins;
      rows.push({ it, spent: current.spent, unfinished:true, slot });
      J.partWay++;
      continue;
    }
    clock = endedAt;
    it.done = true;
    const began = Math.max(slot.start, lastTick);
    const elapsed = S.workingMinutesBetween(sched.concat(declared), iso, began, endedAt);
    const est = S.estimateMinutes(it, cfg);
    const total = elapsed + already;
    if (total >= 1 && total <= Math.max(4*est.full, 120)) cfg = S.learn(cfg, it, total);
    lastTick = endedAt;
    rows.push({ it, spent: current.spent, endedAt, unfinished:false, slot, total });

    const f = FOLLOWS[it.title];
    if (f) {
      const [title, days, effort] = f;
      const d = WORKDAYS.indexOf(iso) + days;
      items.push(mk({ title, date: WORKDAYS[Math.min(d, WORKDAYS.length-1)], deadlineType:"soft",
        effort, bornFrom: it.title }, "f"+(J.spawned++)));
    }
  }
  return { plan, rows, cfg, declared };
}

// ---- run --------------------------------------------------------------------
function run(opts) {
  let items = SEED.map(x=>({...x}));
  let sched = S.normalise(SCHED);
  let cfg = { ...CFG0 };
  const J = { declared:0, declaredMins:0, undeclared:0, partWay:0, spawned:0,
    bankedByButton:0, bigProgress:[], firstWarning:null, shortAtFirst:0, warningDays:[], days:[] };

  EVENING_BLOCKS.forEach(b => { const x = S.normaliseBlock({ ...b, start:b.start, end:b.end });
    if (x) sched = sched.concat([x]); });

  WORKDAYS.forEach((iso, di) => {
    CRISIS_BLOCKS.filter(b=>b.date===iso).forEach(b => {
      const x = S.normaliseBlock({ label:b.label, start:b.start, end:b.end, date:iso });
      if (x) sched = sched.concat([x]);
    });
    if (iso === CRISIS_DAY) CRISIS.forEach(c => items.push({...c}));
    // The reports land four weeks before they're due — plenty of warning, in theory.
    if (iso === dISO(3*7)) items.push({ ...BIG });

    const out = liveDay(iso, items, sched, cfg, J, opts);
    cfg = out.cfg;
    sched = sched.concat(out.declared);
    J.days.push({ iso, ...out });

    const wk = THURS.indexOf(iso);
    if (wk >= 0 && MEETING_WORK[wk]) MEETING_WORK[wk].forEach(([title,day,effort],i)=>
      items.push(mk({ title, date: dISO(day), deadlineType:"hard", effort }, `p${wk}_${i}`)));

    // ---- WHAT COULD THE APP HAVE KNOWN TODAY? ------------------------------
    // The Week tab looks 7 days. Ask the same question over the whole horizon.
    const big = items.find(i=>i.id==="BIG");
    if (big && !big.done) {
      const tr = WP.trouble(items, sched, cfg, iso, 60, { today: iso, goalTitle: ()=>"" });
      const row = tr.find(w => w.itemId === "BIG");
      const stuck = !!row;
      if (row && !J.shortAtFirst) J.shortAtFirst = row.short;
      const wk7 = WP.spread(items, sched, cfg, iso, 7, { today: iso, goalTitle: ()=>"" });
      const stuck7 = wk7.wontFit.some(w => w.itemId === "BIG");
      if (stuck && !J.firstWarning) J.firstWarning = iso;
      if (stuck) J.warningDays.push({ iso, sevenDay: stuck7 });
      J.bigProgress.push({ iso, spent: Math.round(Number(big.spentMinutes)||0), stuck, stuck7 });
    }
  });
  return { items, cfg, J, sched };
}

function report(name, R) {
  const J = R.J;
  const big = R.items.find(i=>i.id==="BIG");
  console.log(`\n${"█".repeat(78)}\n${name}\n${"█".repeat(78)}`);
  console.log(`  interruptions: ${J.declared} declared (${S.durationWords(J.declaredMins)}), ` +
    `${S.durationWords(J.undeclared)} absorbed` + (J.bankedByButton ? `  ·  button saved ${S.durationWords(J.bankedByButton)}` : ""));
  console.log(`  jobs put down part way: ${J.partWay}   ·   follow-ups spawned: ${J.spawned}`);

  console.log(`\n  THE REPORTS (${S.durationWords(BIG_REAL)} of work, due ${lab(REPORTS_DUE)}, parents evening ${lab(PARENTS_EVENING)})`);
  const first = J.bigProgress.find(p=>p.spent>0);
  console.log(`    landed on the list:      ${lab(dISO(3*7))}  (${J.bigProgress.length} working days before it's due)`);
  console.log(`    first minute of work:    ${first ? lab(first.iso) : "NEVER STARTED"}`);
  console.log(`    finished:                ${big && big.done ? "yes" : "NO — still open when parents evening arrived"}`);
  const last = J.bigProgress[J.bigProgress.length-1];
  if (big && !big.done) console.log(`    got through:             ${S.durationWords(Math.round(Number(big.spentMinutes)||0))} of ${S.durationWords(BIG_REAL)}`);
  // How lumpy was the effort? Front-loaded or a panic at the end?
  const days = J.bigProgress.filter((p,i,a)=> i===0 || p.spent > a[i-1].spent);
  console.log(`    days it was worked on:   ${days.length}`);
  if (days.length) console.log(`      ${days.map(p=>`${lab(p.iso).slice(0,6)} ${Math.round(p.spent/60*10)/10}h`).join("  ")}`);

  console.log(`\n  COULD THE APP HAVE WARNED?`);
  if (!J.firstWarning) {
    console.log(`    it never saw a problem${big && big.done ? " — and there wasn't one" : " — BUT THERE WAS ONE"}`);
  } else {
    const daysLeft = J.bigProgress.findIndex(p=>p.iso===J.firstWarning);
    const total = J.bigProgress.length;
    console.log(`    a full-horizon check first says "won't fit": ${lab(J.firstWarning)}  (${total - daysLeft} working days before it's due)`);
    console.log(`    and by how much:                             ${S.durationWords(J.shortAtFirst)} short`);
    const sevenFirst = J.warningDays.find(w=>w.sevenDay);
    console.log(`    the SEVEN-DAY week tab first says it:        ${sevenFirst ? lab(sevenFirst.iso) : "never"}` +
      (sevenFirst ? `  (${total - J.bigProgress.findIndex(p=>p.iso===sevenFirst.iso)} working days before)` : ""));
  }
  return R;
}

const A = report("TWO MONTHS — as the app behaves now", run({ pauseButton:false }));
const B = report("TWO MONTHS — with an interruption button that banks the minutes", run({ pauseButton:true }));
