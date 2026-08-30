import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A DAY OFF TEACHING IS NOT A DAY OFF.
//
// The app had one shape for every day: one start, one end, a grid — and when a
// day was marked off, nothing at all. So a month's holiday made it go dark, and
// a Sunday was planned 07:30 to 17:30 like a Tuesday.
//
// What's checked here is the distinction itself: that a day without lessons is
// still a day you can work, that it runs to different hours, and that a plan
// for it is an ORDER rather than a timetable — because you don't know when
// you'll get up and a plan that says 09:14 is a fiction.

import fs from "node:fs";
import vm from "node:vm";
import { codeOf } from "./_check.mjs";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, isNaN, parseInt };
sb.window = sb; vm.createContext(sb);
["schedule.js", "priority.js", "dayplan.js", "dayshape.js", "goalplan.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const D = sb.OrganiserDayShape, S = sb.OrganiserSchedule;

// A Tuesday in term, a Saturday, and a Tuesday in the holidays.
const TUE = "2026-09-08", SAT = "2026-09-12", HOL_TUE = "2026-11-17";
const SCHEDULE = [
  { id: "sl1", label: "9A English", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5],
    from: "2026-09-01", to: "2027-01-29" },
  // A school holiday: no lessons, and the day is still yours.
  { id: "hol", label: "Winter break", start: "00:00", end: "23:59", days: [0,1,2,3,4,5,6],
    from: "2026-11-16", to: "2026-12-13", noLessons: true },
];
const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };

sec("Which kind of day is it");
{
  ok("a teaching day is a working day", D.kindOf(SCHEDULE, TUE, CFG) === "work");
  ok("a weekend is your own", D.kindOf(SCHEDULE, SAT, CFG) === "own");
  // The one that matters: a holiday is not nothing, it is a day without lessons.
  ok("a day in the holidays is your own, not a void",
     D.kindOf(SCHEDULE, HOL_TUE, CFG) === "own", D.kindOf(SCHEDULE, HOL_TUE, CFG));
  ok("and the schedule still says there are no lessons",
     S.noTeachingOn(SCHEDULE, HOL_TUE) === true);
  // The distinction the whole change rests on.
  ok("but it is NOT a day you marked off", S.dayIsBlocked(SCHEDULE, HOL_TUE) === false);
  const off = SCHEDULE.concat([{ id: "away", label: "Away", start: "00:00", end: "23:59",
    date: HOL_TUE, blocksDay: true }]);
  ok("a day you did mark off is still off", S.dayIsBlocked(off, HOL_TUE) === true);
  ok("and nothing is planned into it", S.gapsOn(off, CFG, HOL_TUE).length === 0);

  // Whose week is Monday to Friday is not the app's business.
  const shifted = { ...CFG, workingDays: [0, 2, 4, 6] };
  ok("your own working days are honoured",
     D.kindOf([], SAT, shifted) === "work" && D.kindOf([], "2026-09-07", shifted) === "own",
     `${D.kindOf([], SAT, shifted)} / ${D.kindOf([], "2026-09-07", shifted)}`);
  ok("with Monday to Friday only as a starting point",
     D.workingDays(null).join() === "1,2,3,4,5");
  // A block on a Saturday makes it a working day whatever the list says.
  const satWork = SCHEDULE.concat([{ id: "s2", label: "Open day", start: "10:00", end: "12:00",
    date: SAT }]);
  ok("something actually in the diary makes a day a working one",
     D.kindOf(satWork, SAT, CFG) === "work");
}

sec("Time booked off, so the work can be placed around it");
{
  // The point of telling it in advance: five weeks to a deadline is not five
  // weeks if five of those days are a break already booked.
  const GP = sb.OrganiserGoalPlan;
  const bookOff = (from, days) => Array.from({ length: days }, (_, i) => {
    const d = new Date(from + "T12:00:00"); d.setDate(d.getDate() + i);
    return { id: "off" + i, label: "away", start: "00:00", end: "23:59",
      date: d.toISOString().slice(0, 10), days: [], blocksDay: true };
  });

  const clear = D.kindOf(SCHEDULE, TUE, CFG);
  ok("an ordinary teaching day is a working one", clear === "work");
  const withOff = SCHEDULE.concat(bookOff(TUE, 5));
  ok("a day you booked off is off, not merely lesson-free",
     D.kindOf(withOff, TUE, CFG) === "off", D.kindOf(withOff, TUE, CFG));
  ok("and it stays off even though lessons run that day",
     S.dayIsBlocked(withOff, TUE) === true);
  ok("with no hours to it at all", D.shapeOf(withOff, TUE, CFG).start === "");
  ok("and the page says the work was placed around it",
     /placed around it/.test(D.words(D.shapeOf(withOff, TUE, CFG))),
     D.words(D.shapeOf(withOff, TUE, CFG)));

  // THE ARITHMETIC, which is what this is actually for.
  const from = "2026-09-07", to = "2026-10-11";           // five weeks
  const plain = GP.madeOf(SCHEDULE, CFG, from, to);
  ok("five weeks is thirty-five days", plain.days === 35, String(plain.days));
  ok("split into working days and days of your own",
     plain.work === 25 && plain.own === 10, JSON.stringify(plain));
  ok("with nothing marked off yet", plain.off === 0);

  const booked = GP.madeOf(SCHEDULE.concat(bookOff("2026-09-14", 5)), CFG, from, to);
  ok("booking five days off takes them out of the working days",
     booked.work === 20 && booked.off === 5, JSON.stringify(booked));
  ok("the days of your own are untouched", booked.own === 10);
  ok("and the dates are named, not just counted",
     booked.offDates.length === 5 && booked.offDates[0] === "2026-09-14",
     JSON.stringify(booked.offDates));

  // And it changes what a day has to hold.
  const goal = { id: "g", title: "Reports", date: to };
  const work = [{ id: "w", goalId: "g", title: "write them", type: "task",
    plannedMinutes: 20 * 60, spentMinutes: 0, done: false, effort: "medium",
    deadlineType: "soft", importance: "normal", tags: [] }];
  const easy = GP.rate(goal, work, SCHEDULE, CFG, from);
  const tight = GP.rate(goal, work, SCHEDULE.concat(bookOff("2026-09-14", 5)), CFG, from);
  ok("fewer days means more per day",
     tight.needPerDay > easy.needPerDay, `${easy.needPerDay} → ${tight.needPerDay}`);
  ok("the days you booked off are counted", tight.offDays === 5, String(tight.offDays));
  ok("and said out loud rather than left to be noticed",
     /marked off/.test(GP.words(tight)), GP.words(tight));
  ok("with nothing said when nothing is booked",
     !/marked off/.test(GP.words(easy)), GP.words(easy));
}

sec("The hours are not the same hours");
{
  const work = D.shapeOf(SCHEDULE, TUE, CFG);
  const own = D.shapeOf(SCHEDULE, SAT, CFG);
  ok("a working day keeps the hours it always had",
     work.start === "07:30" && work.end === "17:30", JSON.stringify(work));
  ok("a day of your own starts later and runs longer",
     own.start === "09:00" && own.end === "21:00", JSON.stringify(own));
  ok("and they are yours to change",
     D.shapeOf(SCHEDULE, SAT, { ...CFG, ownDay: { start: "11:00", end: "23:00" } }).start === "11:00");
  // The planner needs no new idea: it is handed a config with the day's hours.
  ok("the planner gets the right hours without knowing about kinds",
     own.config.dayStart === "09:00" && own.config.dayEnd === "21:00", JSON.stringify(own.config));
  ok("and a working day's config is untouched",
     work.config.dayStart === "07:30" || work.config.dayStart === undefined, JSON.stringify(work.config));
}

sec("A plan for a day at home is an order, not a timetable");
{
  const own = D.shapeOf(SCHEDULE, SAT, CFG);
  ok("a day of your own is loose by default", own.loose === true);
  ok("a working day never is", D.shapeOf(SCHEDULE, TUE, CFG).loose === false);
  ok("and you can ask for the clock back",
     D.shapeOf(SCHEDULE, SAT, { ...CFG, ownDay: { loose: false } }).loose === false);

  const rows = [
    { itemId: "a", start: 9 * 60, end: 10 * 60 },
    { itemId: "b", start: 11 * 60, end: 12 * 60 },
    { itemId: "c", start: 15 * 60, end: 16 * 60 },
    { itemId: "d", start: 20 * 60, end: 21 * 60 },
  ];
  const parts = D.loosen(rows, own);
  ok("the day comes back in rough parts", parts.length === 4, JSON.stringify(parts.map((p) => p.part)));
  ok("every job is still in there",
     parts.flatMap((p) => p.rows).length === 4, JSON.stringify(parts.map((p) => p.rows.length)));
  // The sequence is the useful half and must survive.
  ok("in the order it was planned",
     parts.flatMap((p) => p.rows).map((r) => r.itemId).join("") === "abcd",
     JSON.stringify(parts.flatMap((p) => p.rows).map((r) => r.itemId)));
  ok("the first job is first thing", parts[0].rows[0].itemId === "a", JSON.stringify(parts[0]));
  ok("and the last one is in the evening",
     parts[parts.length - 1].rows.some((r) => r.itemId === "d"), JSON.stringify(parts[parts.length - 1]));
  ok("a job that overran is kept, not dropped",
     D.loosen([{ itemId: "late", start: 23 * 60 }], own).flatMap((p) => p.rows).length === 1);
  ok("an empty day is empty parts, not an error", D.loosen([], own).every((p) => !p.rows.length));
  ok("the parts are yours to name",
     D.loosen(rows, { ...own, parts: ["morning", "afternoon"] }).map((p) => p.part).join() === "morning,afternoon");
}

sec("What it says, and what it refuses to say");
{
  ok("a working day says nothing extra", D.words(D.shapeOf(SCHEDULE, TUE, CFG)) === "");
  const w = D.words(D.shapeOf(SCHEDULE, SAT, CFG));
  ok("a day of your own says why it looks different", /order rather than a timetable/.test(w), w);
  ok("and says plainly that there are no lessons", /no lessons/.test(w), w);
  // The thing it must never do is decide the day is empty.
  ok("it never says nothing is planned", !/nothing planned|nothing at all|day off/i.test(w), w);
  const src = codeOf(fs.readFileSync(`${REPO}/public/dayshape.js`, "utf8"));
  ok("and it never tells you to rest or to work",
     !/should|rest|relax|deserve|take a break|switch off/i.test(src),
     (src.match(/should|rest|relax|deserve/i) || [])[0]);
  ok("no weekend, term or holiday is named in the code",
     !/weekend|saturday|sunday|holiday|term|inset/i.test(src),
     (src.match(/weekend|saturday|sunday|holiday|term|inset/i) || [])[0]);
}

sec("And the planner actually fills a holiday now");
{
  // The whole point: work still happens on a day without lessons.
  const item = { id: "rep", title: "Start the reports", type: "task", date: HOL_TUE,
    deadlineType: "soft", importance: "normal", effort: "medium", tags: [], done: false,
    plannedMinutes: 60, spentMinutes: 0, areas: ["work"] };
  const shape = D.shapeOf(SCHEDULE, HOL_TUE, CFG);
  const plan = sb.OrganiserDayPlan.build([item], SCHEDULE, shape.config, HOL_TUE, {});
  const rows = ((plan && (plan.rows || plan.plan || plan.slots)) || []).filter((r) => r && r.itemId);
  ok("a job on a holiday day is planned, not refused",
     rows.length > 0, JSON.stringify(plan).slice(0, 200));
  ok("inside the hours you keep on a day of your own",
     rows.every((r) => r.start >= 9 * 60 && r.end <= 21 * 60), JSON.stringify(rows));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
