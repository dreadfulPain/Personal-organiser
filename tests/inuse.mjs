import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Living a day, not planning one: measuring how long work took, and noticing
// work that keeps being planned and never reached.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","priority.js","dayplan.js","weekplan.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const S = sb.window.OrganiserSchedule, DP = sb.window.OrganiserDayPlan;
const ISO = "2026-09-14";
const M = (hm) => S.toMin(hm);

sec("Time you spent teaching a lesson isn't time you spent on the job");
{
  const sched = [{ id:"l", label:"Lesson", start:"09:00", end:"09:50", days:[1] }];
  ok("a clear run counts in full", S.workingMinutesBetween(sched, ISO, M("08:00"), M("08:30")) === 30);
  ok("a lesson in the middle is taken off",
     S.workingMinutesBetween(sched, ISO, M("08:30"), M("10:00")) === 40, // 90 wall, 50 lesson
     S.workingMinutesBetween(sched, ISO, M("08:30"), M("10:00")));
  ok("a span entirely inside a lesson is nothing", S.workingMinutesBetween(sched, ISO, M("09:10"), M("09:40")) === 0);
  ok("back-to-front arguments still answer", S.workingMinutesBetween(sched, ISO, M("10:00"), M("08:30")) === 40);
  ok("no schedule is just the wall clock", S.workingMinutesBetween([], ISO, M("08:00"), M("09:00")) === 60);
  ok("zero span is zero", S.workingMinutesBetween(sched, ISO, M("08:00"), M("08:00")) === 0);
  ok("overlapping blocks aren't double-counted",
     S.workingMinutesBetween([{id:"a",label:"A",start:"09:00",end:"10:00",days:[1]},
                              {id:"b",label:"B",start:"09:30",end:"10:00",days:[1]}], ISO, M("09:00"), M("10:00")) === 0);
}

sec("Learning from how long things really took");
{
  const item = { effort: "draining" };
  const base = S.normaliseConfig(null).effortMinutes.draining; // 75
  // The old code binned anything over four hours. Only overruns are ever that
  // long, so the estimate could only ever be dragged down.
  let c = S.learn({}, item, 5 * 60);
  ok("a very long job still moves the estimate UP", S.normaliseConfig(c).learned.draining > base,
     S.normaliseConfig(c).learned.draining);
  ok("but not all the way in one go", S.normaliseConfig(c).learned.draining < 5 * 60);

  let d = S.learn({}, item, 1);
  ok("an absurdly short one moves it down", S.normaliseConfig(d).learned.draining < base);
  ok("and also not all the way", S.normaliseConfig(d).learned.draining > 1);

  // The two directions have to pull equally hard, or the estimate wanders even
  // when the readings are balanced. Equal in PROPORTION, since that's what a
  // duration is.
  const hi = S.normaliseConfig(S.learn({}, item, 99999)).learned.draining;
  const lo2 = S.normaliseConfig(S.learn({}, item, 0.5)).learned.draining;
  ok("one extreme reading can't move it further than the other can",
     Math.abs((hi / base) - (base / lo2)) < 0.05, `up x${(hi/base).toFixed(3)}, down x${(base/lo2).toFixed(3)}`);
  // Balanced surprises in both directions must not walk the estimate anywhere.
  // Alternating readings make it oscillate, so what matters is that it's in the
  // same place after twenty as after sixty, and centred on the truth.
  const alternate = (n) => { let a = {};
    for (let i = 0; i < n; i++) a = S.learn(a, item, i % 2 ? base * 2 : base / 2);
    return S.normaliseConfig(a).learned.draining; };
  const at20 = alternate(20), at60 = alternate(60);
  ok("balanced surprises don't walk it anywhere", Math.abs(at20 - at60) <= 2, `${at20} then ${at60}`);
  ok("and it stays centred on the truth",
     Math.abs(Math.sqrt(alternate(20) * alternate(21)) - base) <= 3,
     Math.round(Math.sqrt(alternate(20) * alternate(21))));

  ok("nonsense is ignored", S.normaliseConfig(S.learn({}, item, 0)).learned.draining === undefined);
  ok("negative is ignored", S.normaliseConfig(S.learn({}, item, -30)).learned.draining === undefined);

  // Repeatedly seeing the truth should converge ON the truth, not below it.
  let e = {};
  for (let i = 0; i < 25; i++) e = S.learn(e, item, 110);
  const got = S.normaliseConfig(e).learned.draining;
  ok("seeing the same real duration converges to it", Math.abs(got - 110) <= 3, got);

  // The old bug, stated as a test: work that habitually overruns must not make
  // the app think the work is quicker.
  let f = {};
  const real = [70, 200, 80, 190, 75, 210, 85, 195];   // averages 138
  real.forEach(v => (f = S.learn(f, item, v)));
  ok("a month of overruns pushes the estimate up, not down",
     S.normaliseConfig(f).learned.draining > base, S.normaliseConfig(f).learned.draining);
}

sec("Work that keeps being planned and never done");
{
  const plans = {
    "2026-09-10": { slots: [{ itemId: "a" }, { itemId: "b" }] },
    "2026-09-11": { slots: [{ itemId: "a" }] },
    "2026-09-12": { slots: [{ itemId: "a" }] },
    "2026-09-14": { slots: [{ itemId: "a" }] },       // today — doesn't count itself
  };
  ok("it counts the days it was on the plan before", DP.carriedOver({ plans }, "a", ISO) === 3);
  ok("today isn't counted as a day it already slipped", DP.carriedOver({ plans }, "a", "2026-09-11") === 1);
  ok("something planned once isn't nagged about", DP.carriedOver({ plans }, "b", ISO) === 1);
  ok("something never planned is zero", DP.carriedOver({ plans }, "zzz", ISO) === 0);
  ok("no plans at all is zero", DP.carriedOver({}, "a", ISO) === 0);
  ok("junk plans don't crash it", DP.carriedOver({ plans: { "2026-09-10": null } }, "a", ISO) === 0);

  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  ok("the page actually says so", /on the plan \$\{again\} days running/.test(t));
  ok("only after it's happened more than once", /again >= 2/.test(t));
  ok("it describes the job, not the person", /it may want a proper slot, or breaking up/.test(t));
  const row = /function taskRow[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("nothing in that row scolds", !/fail|behind|overdue|should have|again\?|still not/i.test(row.replace(/dp-again|const again|again >= 2|\$\{again\}/g,"")),
     (row.match(/fail|behind|overdue|should have|still not/i)||[])[0]);
}

sec("Measuring from when you really started");
{
  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  const fn = /function completeFromPlan[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("it uses the later of the plan and your last tick", /Math\.max\(slot\.start, lastTick\)/.test(fn));
  ok("it remembers when you ticked, for the next one", /lastTickMin = nowMin/.test(fn));
  ok("and saves that so it survives a reload", /savePlan\(iso, p\)/.test(fn));
  ok("lessons in between are taken off", /workingMinutesBetween/.test(fn));
  ok("the old planned-start guess is gone", !/startedGuess/.test(t));
  ok("the old one-sided slot guard is gone", !/\(slot\.end - slot\.start\) \* 2/.test(t));
}


sec("A job you told the app how long it needs");
{
  const cfg = { dayStart:"08:00", dayEnd:"17:00" };
  const stated = S.estimateMinutes({ effort:"quick", plannedMinutes: 8*60 }, cfg);
  ok("your own number beats the effort guess", stated.minutes === 8*60);
  ok("and it says the number came from you", stated.from === "yours");
  ok("rubbish is ignored and the guess stands",
     S.estimateMinutes({ effort:"medium", plannedMinutes:"ages" }, cfg).from === "effort");
  ok("zero is ignored", S.estimateMinutes({ effort:"medium", plannedMinutes:0 }, cfg).from === "effort");
  ok("part-done still comes off a stated size",
     S.estimateMinutes({ effort:"quick", plannedMinutes: 480, spentMinutes: 120 }, cfg).minutes === 360);
}

sec("Work you got part way through");
{
  const cfg = { dayStart:"08:00", dayEnd:"17:00" };
  const base = S.normaliseConfig(cfg).effortMinutes.draining;
  const fresh = { effort:"draining" };
  const part  = { effort:"draining", spentMinutes: 40 };
  ok("a fresh job asks for the whole thing", S.estimateMinutes(fresh, cfg).minutes === base);
  ok("a part-done job asks for what's left", S.estimateMinutes(part, cfg).minutes === base - 40);
  ok("it says how much is already in", S.estimateMinutes(part, cfg).spent === 40);
  ok("and still reports the full size, for learning", S.estimateMinutes(part, cfg).full === base);
  // Past its own estimate and still not done: the app does NOT know how much
  // is left. Saying "5 minutes" would be a confident lie; it asks for another
  // proper sitting and says the guess was wrong.
  const over = S.estimateMinutes({ effort:"quick", spentMinutes: 9999 }, cfg);
  ok("never asks for nothing, however much is in", over.minutes >= S.normaliseConfig(cfg).effortMinutes.quick);
  ok("and says plainly that it has overrun", over.overrun === true);
  ok("a job still inside its estimate isn't called an overrun",
     S.estimateMinutes({ effort:"draining", spentMinutes: 10 }, cfg).overrun === false);
  ok("rubbish in that field is ignored", S.estimateMinutes({ effort:"medium", spentMinutes:"lots" }, cfg).minutes
     === S.normaliseConfig(cfg).effortMinutes.medium);
  ok("negative is ignored", S.estimateMinutes({ effort:"medium", spentMinutes:-50 }, cfg).minutes
     === S.normaliseConfig(cfg).effortMinutes.medium);

  // The whole point: a job bigger than a day must be able to finish.
  const sched = [{ id:"a", label:"Lessons", start:"09:00", end:"16:00", days:[0,1,2,3,4,5,6] }];
  const free = S.gapsOn(sched, S.normaliseConfig(cfg), "2026-09-14").reduce((n,g)=>n+(g.end-g.start),0);
  let it = { effort:"draining", spentMinutes: 0 };
  let days = 0;
  const REAL = free * 3 + 30;              // three days' worth and a bit
  while (S.estimateMinutes(it, cfg).spent < REAL && days < 20) {
    it.spentMinutes = (it.spentMinutes || 0) + free;
    days++;
  }
  ok("a job bigger than one day closes in a sane number of days", days > 1 && days <= 5, `${days} days`);

  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  ok("the page offers a way to say it", /got part way/.test(t));
  ok("which keeps the minutes on the job", /it\.spentMinutes = Math\.round\(Number\(it\.spentMinutes\) \|\| 0\) \+ mins/.test(t));
  ok("counts only real working minutes", /workingMinutesBetween\(schedule, iso, began, nowMin\)/.test(t));
  ok("and doesn't mark it done", !/function partWayThrough[\s\S]*?it\.done = true/.test(t));
  ok("finishing it teaches the app the TOTAL, not just the last sitting",
     /const total = elapsed \+ \(Math\.round\(Number\(it\.spentMinutes\) \|\| 0\)\)/.test(t));
  ok("the guard uses the full size, not what was left", /4 \* est\.full/.test(t));
}

sec("Finishing something is when you find out it wasn't finished");
{
  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  ok("ticking offers to catch what follows", /function offerFollowUp/.test(t));
  ok("it's offered after a tick, not before", /render\(\);\s*\n\s*offerFollowUp\(it\);/.test(t));
  const fn = /function offerFollowUp[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("it asks rather than assumes", /anything follow from it\?/.test(fn));
  ok("it makes nothing on its own", !/items\.push/.test(fn));
  ok("it points you at the ordinary way in", /#capture/.test(fn));
  ok("nothing about it scolds", !/should|must|don't forget|remember to/i.test(fn));
}


sec("Anything the readers produce has to survive being saved");
{
  // A field added to a parser and forgotten in the capture path is invisible:
  // the feature looks built, every test of the parser passes, and nothing ever
  // reaches storage. That is exactly what happened to notBefore.
  const qp = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  qp.globalThis = qp; vm.createContext(qp);
  ["names.js","quickparse.js"].forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), qp));
  const parsed = qp.window.OrganiserQuickParse.parse("write it up after friday", { contacts: [] });

  const cap = fs.readFileSync(`${REPO}/public/capture.js`,"utf8");
  const app = fs.readFileSync(`${REPO}/public/app.js`,"utf8");
  // Fields the reader fills that carry meaning downstream.
  const CARRIED = ["title","type","date","notBefore","time","deadlineType","importance","effort","promisedTo","waitingOn"];
  const missingCap = CARRIED.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(cap));
  const missingApp = CARRIED.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(app));
  ok("every carried field appears in the capture path", !missingCap.length, missingCap.join(", "));
  ok("and in the check-back commit path", !missingApp.length, missingApp.join(", "));
  ok("the reader really does produce notBefore", parsed.notBefore === undefined || typeof parsed.notBefore === "string");
  ok("and it read this one", !!parsed.notBefore, JSON.stringify(parsed));
  ok("capture validates it as a date rather than trusting it",
     /notBefore: \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test/.test(cap));

  // The AI half must agree with the pattern half, or the check-back can tell
  // them apart — which the design says it must not be able to.
  const pipe = fs.readFileSync(`${REPO}/pipeline.js`,"utf8");
  ok("the model is asked for it too", /not_before/.test(pipe));
  ok("and it lands on the same field name", /notBefore:/.test(pipe));
}


sec("Warned weeks out, not on the day");
{
  const WPl = sb.window.OrganiserWeekPlan;
  const cfg = { dayStart:"08:00", dayEnd:"17:00" };
  const sched = [{ id:"l", label:"Lessons", start:"09:00", end:"16:00", days:[1,2,3,4,5] }];
  const MON = "2026-09-14", FAR = "2026-10-14";
  const mkT = (o) => ({ type:"task", time:"", tags:[], date:"", deadlineType:"hard", importance:"high",
    effort:"draining", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false, notBefore:"", ...o });

  // Eight hours of work, a month out, ~2h free a day. It CAN be done in sittings.
  const fits = WPl.trouble([mkT({ id:"ok", title:"the reports", date:FAR, plannedMinutes: 8*60 })],
    sched, cfg, MON, 60, { today:MON, goalTitle:()=>"" });
  ok("plenty of runway raises nothing", fits.length === 0, JSON.stringify(fits));

  // Same job, but due in three days.
  const tight = WPl.trouble([mkT({ id:"no", title:"the reports", date:"2026-09-17", plannedMinutes: 8*60 })],
    sched, cfg, MON, 60, { today:MON, goalTitle:()=>"" });
  ok("no runway raises it", tight.length === 1, JSON.stringify(tight));
  ok("it says how short, not just that it's stuck", tight[0].short > 0);
  ok("it says how much CAN be fitted in", tight[0].booked > 0);
  ok("short + booked adds up to the job", tight[0].short + tight[0].booked === 8*60);
  ok("it says how many days are left", tight[0].daysLeft === 3, tight[0].daysLeft);
  ok("it names the job", tight[0].title === "the reports");

  // Soonest first — that's the one you can least afford to hear about late.
  const two = WPl.trouble([
    mkT({ id:"late", title:"later one",  date:"2026-09-25", plannedMinutes: 40*60 }),
    mkT({ id:"soon", title:"sooner one", date:"2026-09-16", plannedMinutes: 40*60 }),
  ], sched, cfg, MON, 60, { today:MON, goalTitle:()=>"" });
  ok("the soonest trouble is listed first", two[0].itemId === "soon", JSON.stringify(two.map(t=>t.itemId)));
  ok("junk doesn't crash it", WPl.trouble(null, sched, cfg, MON, 60, { today:MON, goalTitle:()=>"" }).length === 0);

  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  ok("the Day page shows it", /function troubleBox/.test(t));
  const box = /function troubleBox[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("it looks further than a week", /planHorizonDays, 28/.test(box));
  ok("it leads with what you can do about it", /find it a day/.test(box));
  ok("trivial shortfalls don't nag", /short >= c\.minSessionMinutes/.test(box));
  // Check the WORDS THE USER READS, not the code around them — an earlier
  // version of this test flagged the "!" in `if (!WP)`.
  const words = (box.match(/`[^`]*`|"[^"]*"|'[^']*'/g) || []).join(" ");
  ok("nothing about it panics", !/urgent|warning|alert|!|too late|failing|behind|overdue/i.test(words),
     (words.match(/urgent|warning|alert|!|too late|failing|behind|overdue/i)||[])[0]);
  ok("and it does say something reassuring about timing", /while there's still something you can do/.test(words));
}

sec("The interruption button");
{
  const t = fs.readFileSync(`${REPO}/public/timeline.js`,"utf8");
  ok("there's one on the job you're actually doing", /dp-stop/.test(t));
  ok("it says what happened in your words", /startAway\(""\, it\.id, slot\.start\)/.test(t.replace(/\\/g,"")) ||
     /startAway\("", it\.id, slot\.start\)/.test(t));
  ok("the pause remembers which job", /itemId: itemId \|\| ""/.test(t));
  ok("and where that job had got to", /slotStart: Number\.isFinite\(slotStart\)/.test(t));
  const cb = /function comeBack[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("coming back banks the minutes you'd put in", /paused\.spentMinutes = Math\.round/.test(cb));
  ok("it only counts real working time", /workingMinutesBetween/.test(cb));
  ok("it tells you they were kept", /is kept/.test(cb));
  ok("it asks whether the interruption started something", /did anything come out of that\?/.test(cb));
  ok("a job already finished isn't credited twice", /paused && !paused\.done/.test(cb));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
