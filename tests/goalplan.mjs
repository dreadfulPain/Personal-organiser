import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A goal as work that actually gets done: progress in minutes, the rate it
// would now take, and the moment that stops being a nudge.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","priority.js","dayplan.js","weekplan.js","goalplan.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const S = sb.window.OrganiserSchedule, GP = sb.window.OrganiserGoalPlan, WP = sb.window.OrganiserWeekPlan;

const MON = "2026-09-14";
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
// Two hours free a day, weekdays only.
const SCHED = [{ id:"l", label:"Lessons", start:"10:00", end:"17:00", days:[1,2,3,4,5] },
               { id:"w", label:"Weekend",  start:"08:00", end:"16:55", days:[0,6], blocksDay:true }];
const mk = (o) => ({ type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal",
  effort:"medium", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false,
  notBefore:"", spentMinutes:0, ...o });

sec("Progress is measured in minutes, not in things ticked");
{
  const goal = { id:"g1", title:"Ready for the evening", date:"" };
  // Ten little jobs done, one big one untouched.
  const items = [
    ...Array.from({length:10},(_,i)=>mk({ id:"s"+i, goalId:"g1", effort:"quick", done:true })),
    mk({ id:"big", goalId:"g1", plannedMinutes: 8*60 }),
  ];
  const p = GP.progress(goal, items, CFG);
  ok("ten of eleven ticked is not ninety per cent", p.fraction < 0.3, p.fraction.toFixed(2));
  ok("the count is still available", p.piecesDone === 10 && p.pieces === 11);
  ok("total is real minutes", p.total === 10*10 + 8*60, p.total);
  ok("what's left is what's left", p.left === 8*60);
}

sec("Half-done work counts as half done");
{
  const goal = { id:"g2", title:"x", date:"" };
  const items = [mk({ id:"a", goalId:"g2", plannedMinutes: 600, spentMinutes: 150 })];
  const p = GP.progress(goal, items, CFG);
  ok("the minutes put in show on the bar", p.done === 150, p.done);
  ok("and it isn't counted as finished", p.fraction === 0.25, p.fraction);
  const doneItems = [mk({ id:"a", goalId:"g2", plannedMinutes: 600, spentMinutes: 150, done:true })];
  ok("ticking it counts the whole thing", GP.progress(goal, doneItems, CFG).fraction === 1);
  // A job that overran is bigger than it said it was; don't show >100%.
  const over = [mk({ id:"a", goalId:"g2", plannedMinutes: 100, spentMinutes: 300, done:true })];
  ok("an overrun never shows more than full", GP.progress(goal, over, CFG).fraction === 1);
  ok("and the total grows to the truth", GP.progress(goal, over, CFG).total === 300);
}

sec("The rate it would now take");
{
  const goal = { id:"g3", title:"Everything ready", date:"2026-09-25" };  // 2 weeks out
  const items = [mk({ id:"big", goalId:"g3", plannedMinutes: 10*60 })];
  const r = GP.rate(goal, items, SCHED, CFG, MON);
  ok("it counts only days with room in them", r.daysLeft === 10, r.daysLeft);
  ok("weekends aren't counted as working days", r.daysLeft < 12);
  ok("it says how much a day that means", r.needPerDay === 60, r.needPerDay);
  ok("and how much a day could actually hold", r.roomPerDay > 0);
  ok("nothing is short", r.short === 0);

  // The bands, deliberately. Three quarters of every scrap of free time, every
  // day, for a fortnight, with the rest of the job still to do, is NOT relaxed.
  const at = (hours) => GP.rate(goal, [mk({ id:"b", goalId:"g3", plannedMinutes: hours*60 })],
    SCHED, CFG, MON).verdict;
  ok("a comfortable one says so", at(4) === "on track", at(4));
  ok("most of the free time every day is called tight", at(10) === "tight", at(10));
  ok("more than the days hold is called that", at(20) === "more than the days can hold", at(20));
}

sec("When the sums stop working");
{
  const goal = { id:"g4", title:"Too much", date:"2026-09-18" };  // 5 days
  const items = [mk({ id:"big", goalId:"g4", plannedMinutes: 40*60 })];
  const r = GP.rate(goal, items, SCHED, CFG, MON);
  ok("it says plainly that it won't fit", r.verdict === "more than the days can hold", r.verdict);
  ok("and by how much", r.short > 0, r.short);
  ok("the shortfall is a real number you could act on", r.short < 40*60 && r.short > 0);
  const w = GP.words(r);
  ok("the words say what to do about it", /more time|fewer pieces|a hand with it/.test(w), w);
  ok("the words never blame the person", !/you should|you failed|behind|too slow/i.test(w), w);
}

sec("The rate climbs as days go by without progress");
{
  const goal = { id:"g5", title:"Creeping", date:"2026-10-09" };
  const items = [mk({ id:"big", goalId:"g5", plannedMinutes: 10*60 })];
  const early = GP.rate(goal, items, SCHED, CFG, MON).needPerDay;
  const later = GP.rate(goal, items, SCHED, CFG, "2026-10-05").needPerDay;
  ok("leaving it makes the daily number rise", later > early, `${early} then ${later}`);
  ok("and it eventually says it can't be held", GP.rate(goal, items, SCHED, CFG, "2026-10-08").verdict
     === "more than the days can hold");
}

sec("A goal with no deadline still keeps score");
{
  const goal = { id:"g6", title:"Get better at marking", date:"" };
  const items = [mk({ id:"a", goalId:"g6", plannedMinutes: 120, spentMinutes: 60 })];
  const r = GP.rate(goal, items, SCHED, CFG, MON);
  ok("progress still works", r.fraction === 0.5);
  ok("no deadline means no rate", r.verdict === "no deadline" && r.daysLeft === 0);
  ok("and the words don't invent urgency", /no rush being measured/.test(GP.words(r)), GP.words(r));
}

sec("A step becomes real work, not a string in a list");
{
  const goal = { id:"g7", title:"Ready", date:"2026-10-09" };
  const t = GP.taskFromStep(goal, { title:"Pull the results together", minutes: 180 }, CFG);
  ok("it carries the goal's deadline", t.date === "2026-10-09");
  ok("a dated goal makes its work a hard deadline", t.deadlineType === "hard");
  ok("it carries its own size", t.plannedMinutes === 180);
  ok("it's linked back to the goal", t.goalId === "g7");
  ok("and the size means the spreader will chip at it",
     S.estimateMinutes(t, CFG).from === "yours" && S.estimateMinutes(t, CFG).minutes === 180);
  const open = GP.taskFromStep({ id:"g8", title:"x", date:"" }, { title:"whenever", minutes: 0 }, CFG);
  ok("an undated goal makes ordinary soft work", open.deadlineType === "soft" && open.date === "");
  ok("a step with no size falls back to a guess", open.plannedMinutes === 0);
}

sec("The rest of the app can then do its job on it");
{
  const goal = { id:"g9", title:"Ready for it", date:"2026-10-09" };
  const step = { ...GP.taskFromStep(goal, { title:"The big pile", minutes: 8*60 }, CFG), id:"w1" };
  const spread = WP.spread([step], SCHED, CFG, MON, 30, { today:MON, goalTitle:()=>"Ready for it" });
  ok("the week books it in sittings", spread.placements.length > 1, JSON.stringify(spread.placements.length));
  ok("all before the deadline", spread.placements.every(p => p.iso <= "2026-10-09"));
  ok("and it starts soon, not at the end", spread.placements[0].iso <= "2026-09-16", spread.placements[0].iso);
  const total = spread.placements.reduce((n,p)=>n+p.minutes,0);
  ok("the whole eight hours is accounted for", total === 8*60 || spread.wontFit.length > 0, total);
}

sec("Junk doesn't crash it");
{
  ok("no goal", GP.progress(null, [], CFG).total === 0);
  ok("no items", GP.progress({id:"z"}, null, CFG).total === 0);
  ok("rubbish items are skipped", GP.progress({id:"z"}, [null, undefined, {}], CFG).total === 0);
  ok("a nonsense deadline is treated as none",
     GP.rate({id:"z",date:"soon"}, [], SCHED, CFG, MON).verdict === "no deadline");
  ok("a deadline in the past means no days left",
     GP.rate({id:"z",date:"2020-01-01"}, [mk({id:"a",goalId:"z"})], SCHED, CFG, MON).daysLeft === 0);
  ok("words cope with an empty goal", typeof GP.words(GP.rate({id:"z"}, [], SCHED, CFG, MON)) === "string");
}

sec("Nothing here knows what a school is");
{
  const src = fs.readFileSync(`${REPO}/public/goalplan.js`,"utf8");
  const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("no school words in the code", !/lesson|pupil|student|teacher|parent|report|marking/i.test(code),
     (code.match(/lesson|pupil|student|teacher|parent|report|marking/i)||[])[0]);
}


sec("Reading a plan someone else wrote");
{
  vm.runInContext(fs.readFileSync(`${REPO}/public/names.js`,"utf8"), sb);
  vm.runInContext(fs.readFileSync(`${REPO}/public/quickparse.js`,"utf8"), sb);
  vm.runInContext(fs.readFileSync(`${REPO}/public/planpaste.js`,"utf8"), sb);
  const PP = sb.window.OrganiserPlanPaste;

  ok("hours", PP.minutesIn("Read the standards (2 hours)") === 120);
  ok("minutes", PP.minutesIn("List the evidence (45 min)") === 45);
  ok("hours and minutes", PP.minutesIn("write it up (1h30)") === 90);
  ok("a decimal hour", PP.minutesIn("draft it (2.5 hours)") === 150);
  ok("a squiggle", PP.minutesIn("audit the units ~90 mins") === 90);
  ok("words", PP.minutesIn("tidy up — half an hour") === 30);
  ok("no time is no time, not a guess", PP.minutesIn("do the thing") === 0);
  ok("a year in the title isn't a duration", PP.minutesIn("Rebuild the Year 9 scheme") === 0);

  ok("the time comes out of the title (brackets)", PP.stripTime("Read the standards (2 hours)") === "Read the standards");
  ok("and with a dash", PP.stripTime("Draft it — 45 min") === "Draft it");
  ok("and bare at the end", PP.stripTime("audit the units ~90 mins") === "audit the units");
  ok("but a real word isn't eaten", PP.stripTime("Book the 2 hour workshop slot") !== "");

  const tidy = PP.parse(`# The goal\nDeadline: 4 December 2026\n\n## First bit\n- one thing (30 min)\n- another (1 hour)\n\n## Second bit\n- a third (2 hours)`, { today: "2026-09-14" });
  ok("it finds the title", tidy.title === "The goal");
  ok("and the deadline", tidy.date === "2026-12-04", tidy.date);
  ok("and the sections", tidy.milestones.length === 2);
  ok("and every step", PP.stepCount(tidy) === 3);
  ok("and adds the time up", PP.totalMinutes(tidy) === 210);

  const messy = PP.parse(`Rebuild the thing\n\n**Stage one**\n* first ~90 mins\n1. second (30 minutes)\n\nStage 2: next\n- third — 1h\nNeeds to be done by 20 November`, { today: "2026-09-14" });
  ok("a bold heading works as a title", messy.title === "Rebuild the thing");
  ok("mixed bullet styles all count", PP.stepCount(messy) === 3, JSON.stringify(messy.milestones));
  ok("an unmarked section heading is read as one", messy.milestones.length === 2,
     JSON.stringify(messy.milestones.map(m=>m.title)));
  ok("a deadline in a sentence is found", messy.date === "2026-11-20", messy.date);
  ok("and it doesn't become a step", !JSON.stringify(messy).includes("Needs to be done"));

  ok("nothing is invented from nothing", PP.parse("", {}).milestones.length === 0);
  ok("junk doesn't crash it", PP.parse(null, null).title === "");
  const noBullets = PP.parse("Do a thing\nfirst part\nsecond part", {});
  ok("even unbulleted lines are kept, never dropped", PP.stepCount(noBullets) === 2,
     JSON.stringify(noBullets));

  // The bit that matters: it becomes work the rest of the app can see.
  const goal = { id:"gp", title: tidy.title, date: tidy.date };
  const made = tidy.milestones.flatMap((m) => m.steps.map((st, i) =>
    ({ ...GP.taskFromStep(goal, st, CFG), id: `${m.title}-${i}` })));
  ok("every step becomes a real piece of work", made.length === 3);
  ok("each carries the goal's deadline", made.every(t => t.date === "2026-12-04"));
  ok("and its own size", made.map(t=>t.plannedMinutes).join(",") === "30,60,120");
  ok("so the spreader chips at it", made.every(t => S.estimateMinutes(t, CFG).from === "yours"));
}

sec("Counting weekends is said out loud");
{
  const allWeek = [{ id:"l", label:"Lessons", start:"10:00", end:"17:00", days:[1,2,3,4,5] }];
  const r = GP.rate({ id:"w", title:"x", date:"2026-10-09" },
    [mk({ id:"a", goalId:"w", plannedMinutes: 120 })], allWeek, CFG, MON);
  ok("weekend days are counted and reported", r.weekendDays > 0, r.weekendDays);
  ok("and the words say so", /weekend day/.test(GP.words(r)), GP.words(r));
  ok("with a weekend blocked off, none are counted",
     GP.rate({ id:"w", title:"x", date:"2026-10-09" }, [mk({ id:"a", goalId:"w", plannedMinutes: 120 })],
       allWeek.concat([{ id:"we", label:"Weekend", start:"08:00", end:"16:55", days:[0,6], blocksDay:true }]),
       CFG, MON).weekendDays === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
