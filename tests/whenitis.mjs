import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A DATE IS NOT AN HOUR.
//
// A calendar saying "this happens on the sixteenth" is not the same sentence as
// "you are occupied from midnight until one minute to midnight" — and the app
// was writing the second when it was told the first. A source that gives a date
// and no time had nowhere else to put it, so every professional development
// day, exam week, report distribution and parents' meeting arrived as a
// twenty-four hour commitment that you also had to be present at.
//
// WHAT THAT COSTS IS NOT COSMETIC. Measured on a real day with two lessons on
// it and one such entry:
//
//     busy        00:00–23:59              the whole day
//     free        (nothing)                not one minute
//     leave by    00:00                    you are already late, at midnight
//
// Every one of the three things this app is being built to do runs through
// those numbers. It cannot say when you may leave, it cannot find anywhere to
// prepare anything, and it cannot say "enough has been done, stop" about a day
// it believes is entirely spoken for. One fabricated span poisons all three.
//
// So a block now says what the clock ON it means, and there are four kinds of
// thing a calendar can be telling you. Three are blocks and one is not:
//
//   a rule about the day   blocksDay / noLessons / runsAs — these change what
//                          the whole day IS, and they really do last all day.
//   a timed event          a real start and a real end.
//   an untimed event       it happens that day; nobody said when.
//   a deadline             it must be FINISHED by then. It does not occupy the
//                          day at all — and it is not a block. It is a task
//                          with a date, planned into the days BEFORE it.
//
// This file is the table of how each of those four resolves, kept as a test so
// that it goes on being true.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done: finish } = checker();

const PUB = path.join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, Intl };
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
["dates.js", "schedule.js", "priority.js", "dayplan.js", "timetable.js", "calplan.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb, { filename: f }));
const S = sb.OrganiserSchedule, DP = sb.OrganiserDayPlan, C = sb.OrganiserCalPlan;

// A Tuesday with two lessons on it, and a working day of half seven to half
// five. Everything below is measured against this same day.
const DAY = "2026-11-10";
const WEEK = [
  { id: "p1", label: "P1 English", start: "09:00", end: "09:50", days: [2], kind: "teaching" },
  { id: "p5", label: "P5 English", start: "14:10", end: "15:00", days: [2], kind: "teaching" },
];
const CFG = { dayStart: "07:30", dayEnd: "17:30" };
const span = (x) => `${S.toHM(x.start)}–${S.toHM(x.end)}`;
const busy = (extra) => S.busyOn(WEEK.concat(extra || []), DAY).map(span);
const free = (extra) => S.gapsOn(WEEK.concat(extra || []), CFG, DAY).map(span);
const minutes = (extra) => S.gapsOn(WEEK.concat(extra || []), CFG, DAY)
  .reduce((n, g) => n + (g.end - g.start), 0);
const leave = (b) => {
  const at = S.leaveBy(S.normaliseBlock(b));
  return at === null ? "—" : S.toHM(at);
};

// The day with nothing added, so every row below can be read against it.
const PLAIN = { busy: busy(), free: free(), minutes: minutes() };
console.log(`\nThe day itself: busy ${PLAIN.busy.join(", ")} · ${PLAIN.minutes} minutes free`);

// ---------------------------------------------------------------------------
console.log("\nA rule about the day");

// These three change what the whole day IS rather than occupying an hour of it,
// and each already had an answer. They are here because a table with a hole in
// it is not a table — and because two of them are the reason the fourth was
// getting the wrong answer.
{
  const off = [{ id: "o", label: "Half term", date: DAY, start: "00:00", end: "23:59",
    days: [], blocksDay: true }];
  ok("a day off is busy all day, and that is correct — you are not there",
     busy(off).join() === "00:00–23:59", JSON.stringify(busy(off)));
  ok("  so nothing is planned into it", free(off).length === 0, JSON.stringify(free(off)));

  const none = [{ id: "n", label: "Professional Development Day", date: DAY,
    start: "00:00", end: "23:59", days: [], noLessons: true }];
  // A DAY OFF TEACHING IS NOT A DAY OFF. The lessons stop; the work does not,
  // and it is very often the best chance there is to get ahead.
  ok("a day with no lessons is not busy at all — you are still working",
     busy(none).join() === PLAIN.busy.join(), JSON.stringify(busy(none)));
  ok("  and the whole day is yours to plan into",
     minutes(none) === PLAIN.minutes, `${minutes(none)} vs ${PLAIN.minutes}`);
  // AND IT IS NOT DRAWN AS THE LONGEST MEETING IN THE WORLD. A rule runs the
  // length of the day because that is its SCOPE, not because anybody is
  // occupied from midnight.
  ok("  and a rule about the day says it is a day, not midnight to midnight",
     S.whenWords(S.normaliseBlock(none[0])) === "all day" &&
       S.whenWords(S.normaliseBlock(off[0])) === "all day",
     JSON.stringify([S.whenWords(S.normaliseBlock(none[0])), S.whenWords(S.normaliseBlock(off[0]))]));
  // AND IT IS NOT WHAT IS ON AT TEN IN THE MORNING. A rule covering every
  // minute of the day answered "what am I doing now" for all of them.
  ok("  nor is it what you are doing at ten o'clock",
     S.fixedBlockAt(WEEK.concat(none), new Date(DAY + "T10:00:00")) === null,
     JSON.stringify(S.fixedBlockAt(WEEK.concat(none), new Date(DAY + "T10:00:00"))));

  const as = [{ id: "r", label: "Make-up day", date: DAY, start: "00:00", end: "00:01",
    days: [], runsAs: 3 }];
  ok("and a day running another day's timetable is not a commitment either",
     !S.blocksOn(WEEK.concat(as), DAY).some((b) => b.label === "Make-up day"),
     JSON.stringify(S.blocksOn(WEEK.concat(as), DAY).map((b) => b.label)));
}

// ---------------------------------------------------------------------------
console.log("\nA timed event");

{
  const timed = [{ id: "t", label: "Lesson observation", date: DAY,
    start: "10:30", end: "11:15", days: [], beThere: true, getThere: 10, where: "B204" }];
  // 10:20, NOT 10:30: the ten minutes of getting there are busy too, which is
  // the whole point of asking how long it takes. Filled with work you arrive
  // late having done everything the app told you to.
  ok("a real hour is busy for that hour and the journey in front of it",
     busy(timed).join(", ") === "09:00–09:50, 10:20–11:15, 14:10–15:00",
     JSON.stringify(busy(timed)));
  ok("  and the free time around it is what is left",
     minutes(timed) === PLAIN.minutes - 45 - 10,
     `${minutes(timed)} vs ${PLAIN.minutes - 55}`);
  // The ten minutes are the journey, which is busy too — see busyOn.
  ok("and it says when to set off", leave(timed[0]) === "10:20", leave(timed[0]));
}

// ---------------------------------------------------------------------------
console.log("\nAn untimed event — the one this was all about");

{
  const bad = { id: "u", label: "Midterm — Exam Time", date: DAY,
    start: "00:00", end: "23:59", days: [], beThere: true, getThere: 20 };
  // MIGRATED, not merely defaulted: this is how it is already saved in a file
  // somewhere, written by an importer that had no way to say "no time given".
  ok("a dated entry that fills the whole day is read as one with no time on it",
     S.normaliseBlock(bad).timing === "sometime", S.normaliseBlock(bad).timing);
  ok("  and it is still on the day — it happens, and it is yours",
     S.blocksOn(WEEK.concat([bad]), DAY).some((b) => b.id === "u"),
     JSON.stringify(S.blocksOn(WEEK.concat([bad]), DAY).map((b) => b.label)));
  ok("  and it occupies no hour of it",
     busy([bad]).join() === PLAIN.busy.join(), JSON.stringify(busy([bad])));
  ok("  so the day has its free time back",
     minutes([bad]) === PLAIN.minutes && free([bad]).length === 3,
     `${minutes([bad])} minutes in ${free([bad]).length} stretches: ${free([bad]).join(", ")}`);
  ok("and there is no leaving time for a thing with no time",
     leave(bad) === "—", leave(bad));
  // AND IT IS NOT AN APPOINTMENT EITHER, which is a correction to what this
  // file used to claim. It said a thing with no hour was "still somewhere you
  // have to be" — keeping beThere while refusing to act on it. That is the same
  // conflation one layer down: the flag exists to drive a journey and a
  // departure, so a thing it cannot drive them for is not one. It is on the
  // day, it is yours, and it is not an appointment. See mustBeThere.
  ok("  and it is not an appointment either, because being there needs an hour",
     S.mustBeThere(S.normaliseBlock(bad)) === false,
     String(S.mustBeThere(S.normaliseBlock(bad))));
  ok("  while it is still on the day and still yours",
     S.blocksOn(WEEK.concat([bad]), DAY).some((b) => b.id === "u"),
     "it fell off the day");
  // AND IT SAYS SO IN WORDS. Drawn as a span it reads as a lesson that starts
  // before breakfast and ends after midnight.
  ok("and it is drawn as what it is, not as midnight to midnight",
     S.whenWords(S.normaliseBlock(bad)) === "sometime that day",
     S.whenWords(S.normaliseBlock(bad)));
  ok("  while a real hour is still drawn as an hour",
     S.whenWords(S.normaliseBlock(WEEK[0])) === S.fmtSpan("09:00", "09:50"),
     S.whenWords(S.normaliseBlock(WEEK[0])));

  // AND THE DAY RULES ARE NOT SWEPT UP WITH IT. They fill the day on purpose.
  ok("and a day off is not quietly turned into an event with no time",
     S.normaliseBlock({ label: "Half term", date: DAY, start: "00:00", end: "23:59",
       days: [], blocksDay: true }).timing === "at", "a day off lost its meaning");
  ok("  nor a day with no lessons",
     S.normaliseBlock({ label: "PD", date: DAY, start: "00:00", end: "23:59",
       days: [], noLessons: true }).timing === "at", "a no-lessons day lost its meaning");
}

// ---------------------------------------------------------------------------
console.log("\nA deadline, which is not a block at all");

// "Reports due on the second" does not occupy the second. It is work to be
// FINISHED by then, and the whole point of this app is that it gets planned
// into the days before. So the calendar reader makes those as tasks, never as
// blocks — which is why there is no third timing for them.
{
  const due = [{ id: "d", title: "Reports", type: "task", date: DAY, time: "",
    deadlineType: "hard", importance: "normal", effort: "draining",
    done: false, createdAt: "2026-11-01T09:00:00Z" }];
  ok("a deadline occupies none of the day it is due",
     busy().join() === PLAIN.busy.join() && minutes() === PLAIN.minutes,
     JSON.stringify(busy()));
  // AND IT IS PLANNED BEFORE IT, which is the behaviour that makes it a
  // deadline rather than an appointment.
  const before = DP.build(due, WEEK, CFG, "2026-11-09",
    { ctx: { today: "2026-11-09", goalTitle: () => "" } });
  ok("and the work for it is placed on the days before",
     before.slots.some((s) => s.itemId === "d"),
     JSON.stringify(before.slots.map((s) => s.itemId)));
}

// ---------------------------------------------------------------------------
// THE TABLE ITSELF, printed, because a rule you cannot read is a rule nobody
// can check against the app in front of them.
console.log("\n  how each one resolves, on a day with two lessons on it");
console.log("  " + "─".repeat(72));
console.log("  kind of thing          busyOn            free time   leave by");
console.log("  " + "─".repeat(72));
const rows = [
  ["a day off", [{ id: "a", label: "x", date: DAY, start: "00:00", end: "23:59", days: [], blocksDay: true }]],
  ["no lessons", [{ id: "b", label: "x", date: DAY, start: "00:00", end: "23:59", days: [], noLessons: true }]],
  ["a timed event", [{ id: "c", label: "x", date: DAY, start: "10:30", end: "11:15", days: [], beThere: true, getThere: 10 }]],
  ["an untimed event", [{ id: "d", label: "x", date: DAY, start: "00:00", end: "23:59", days: [], beThere: true, getThere: 20 }]],
  ["a deadline (a task)", []],
];
rows.forEach(([name, extra]) => {
  const b = busy(extra);
  console.log(`  ${name.padEnd(22)} ${(b.length === 1 && b[0] === "00:00–23:59" ? "all day" : `${b.length} span${b.length === 1 ? "" : "s"}`).padEnd(17)} ` +
    `${String(minutes(extra) + " min").padEnd(11)} ${extra.length ? leave(extra[0]) : "—"}`);
});
console.log("  " + "─".repeat(72));

// ---------------------------------------------------------------------------
console.log("\nAnd occupied is not the same thing as not-available-for-work");

// busyOn answers one question — which minutes may the planner not have — and it
// answers it correctly. What it cannot do is say WHY, and the two reasons are
// not the same:
//
//   OCCUPIED   something is actually using the time. You are in a room.
//   PROTECTED  nothing is using it and the planner still may not have it. A
//              Saturday in the holidays has no appointment on it anywhere.
//
// Two sentences this app exists to say need the difference — "you have 10:20 to
// 11:30 free at school, do the thing that can only be done here" and "you have
// done enough, the rest of tonight is protected". A busy/free binary can say
// neither, and the second would have to invent a six-hour appointment.
{
  const LUNCH = { id: "l", label: "Lunch", start: "12:30", end: "13:15", days: [2],
    kind: "break", protected: true };
  const hours = S.hoursOn(WEEK.concat([LUNCH]), CFG, DAY);
  const use = (from) => (hours.find((h) => S.toHM(h.from) === from) || {}).use;
  ok("a lesson is time something is using", use("09:00") === "occupied", JSON.stringify(hours.map((h) => `${S.toHM(h.from)}:${h.use}`)));
  ok("  and a lunch you keep is time nothing may be put into",
     use("12:30") === "protected", JSON.stringify(use("12:30")));
  // AND THE REST IS UNKNOWN, NOT USABLE — which is a correction to what this
  // file used to claim. Nothing scheduled is not the same as free: on a school
  // day that stretch is a break you are supervising at least as often as it is
  // an hour at your desk, and nobody has said which.
  ok("  and the rest is unknown until somebody says",
     use("09:50") === "unknown", JSON.stringify(use("09:50")));

  // THE SATURDAY. No appointment on it anywhere — you could be shopping, or
  // asleep — and it is still not the app's time to spend. Read as "occupied"
  // the arithmetic is right and the meaning is wrong, and the meaning is what
  // has to be said out loud later.
  const sat = S.hoursOn(WEEK.concat([{ id: "h", label: "Half term", date: DAY,
    start: "00:00", end: "23:59", days: [], blocksDay: true }]), CFG, DAY);
  ok("a holiday is protected and not occupied — nothing is happening on it",
     sat.length === 1 && sat[0].use === "protected",
     JSON.stringify(sat.map((h) => `${S.toHM(h.from)}-${S.toHM(h.to)}:${h.use}`)));

  // AND THE TWO ANSWERS STILL AGREE. gapsOn is every minute the planner MAY
  // have — occupied and protected taken out — and hoursOn splits exactly that
  // into the part somebody has vouched for and the part nobody has. Usable plus
  // unknown must be gapsOn to the minute, or one of them is lying.
  //
  // gapsOn is deliberately NOT narrowed to the confirmed part today: the day
  // planner already places work with it, and narrowing it would stop it placing
  // anything at all for anybody who has not yet classified their week. When the
  // planner is rebuilt (questions 4 to 6) it should ask hoursOn for "usable"
  // and take the narrower answer knowingly.
  const spare = hours.filter((h) => h.use === "usable" || h.use === "unknown")
    .filter((h) => h.to - h.from >= 10)
    .map((h) => `${S.toHM(h.from)}-${S.toHM(h.to)}`);
  const gaps = S.gapsOn(WEEK.concat([LUNCH]), CFG, DAY)
    .map((g) => `${S.toHM(g.start)}-${S.toHM(g.end)}`);
  ok("and usable plus unknown is exactly what the arithmetic calls free",
     spare.join() === gaps.join(), JSON.stringify({ spare, gaps }));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a thing with no hour cannot clash with anything");

// Read as midnight to a minute to midnight, an untimed event overlapped every
// job on the day — so every one of them came back "at the same time as Parents'
// Meeting", which is not known to be true. A warning that is wrong every day is
// a warning nobody reads.
{
  const pm = { id: "pm", label: "Parents' Meeting", date: DAY, start: "00:00",
    end: "23:59", days: [], beThere: true };
  const job = [{ id: "j", title: "Mark books", type: "task", date: DAY, time: "11:00",
    effort: "medium", importance: "normal", done: false, createdAt: "2026-11-01T09:00:00Z" }];
  const plan = DP.build(job, WEEK.concat([pm]), CFG, DAY,
    { ctx: { today: DAY, goalTitle: () => "" } });
  const slot = plan.slots.find((x) => x.itemId === "j");
  ok("a job at eleven does not clash with a thing that has no time",
     slot && (slot.clashWith || []).length === 0, JSON.stringify(slot && slot.clashWith));

  // AND A JOB MADE FOR A BLOCK DOES NOT CLASH WITH THAT BLOCK. "Leave for the
  // observation" overlaps the observation by construction; reported as a
  // double-booking it is the app warning you about itself.
  const obs = { id: "obs", label: "Observation", date: DAY, start: "10:30", end: "11:15",
    days: [], beThere: true, getThere: 10 };
  // 10:25, so the ten minutes of walking really do run into the observation —
  // ending exactly as it starts would overlap nothing and prove nothing.
  const leave = [{ id: "L", title: "Leave for Observation", type: "task", date: DAY,
    time: "10:25", prepFor: S.thereKey("obs", DAY), autoPrep: true, effort: "quick",
    importance: "normal", done: false, createdAt: "2026-11-01T09:00:00Z" }];
  const p2 = DP.build(leave, WEEK.concat([obs]), CFG, DAY,
    { ctx: { today: DAY, goalTitle: () => "" } });
  const s2 = p2.slots.find((x) => x.itemId === "L");
  ok("and the journey to a thing does not clash with the thing",
     s2 && !(s2.clashWith || []).includes("Observation"), JSON.stringify(s2 && s2.clashWith));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a day-level protection is a day, not a ten-hour appointment");

// hoursOn is asked for a WINDOW — the hours the day planner is allowed to use —
// and on a holiday it answers "07:30 to 17:30, protected". That is the window
// speaking, not the holiday: the protection has to remain a fact about the DAY,
// or the evening becomes schedulable at 17:31 the moment something asks about
// evenings.
{
  const hol = WEEK.concat([{ id: "h", label: "Half term", date: DAY,
    start: "00:00", end: "23:59", days: [], blocksDay: true }]);
  const inHours = S.hoursOn(hol, CFG, DAY);
  ok("asked about the working day, the whole of it is protected",
     inHours.length === 1 && inHours[0].use === "protected",
     JSON.stringify(inHours.map((h) => `${S.toHM(h.from)}-${S.toHM(h.to)}:${h.use}`)));
  // THE SAME DAY, ASKED ABOUT THE EVENING. If the protection ended with the
  // window, this is where the holiday would quietly become free time.
  const evening = S.hoursOn(hol, { dayStart: "17:30", dayEnd: "22:00" }, DAY);
  ok("  and asked about the evening, so is that",
     evening.length === 1 && evening[0].use === "protected" &&
       S.toHM(evening[0].to) === "22:00",
     JSON.stringify(evening.map((h) => `${S.toHM(h.from)}-${S.toHM(h.to)}:${h.use}`)));
  ok("  and the day itself still says it is a day off, whatever window is asked",
     S.dayIsBlocked(hol, DAY) === true, "the day-level answer was lost");
  ok("  with no free minute in either window",
     S.gapsOn(hol, CFG, DAY).length === 0 &&
       S.gapsOn(hol, { dayStart: "17:30", dayEnd: "22:00" }, DAY).length === 0,
     JSON.stringify(S.gapsOn(hol, { dayStart: "17:30", dayEnd: "22:00" }, DAY)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd in my week is not be there");

// The calendar panel has a button meaning "this is part of my week", and the
// importer wired it straight to beThere — so a report-distribution date, a term
// boundary and an exam period all became things you physically travel to and
// have to arrive at on time. Some calendar entries are attendance. Most are
// structure: they matter to the day without there being a room to be in.
{
  const rd = S.normaliseBlock({ id: "rd", label: "Report Distribution", date: DAY,
    start: "00:00", end: "23:59", days: [], beThere: true, getThere: 15 });
  // BEING SOMEWHERE ON TIME NEEDS A TIME. Not a policy — arithmetic: the flag
  // exists to drive a journey and a departure, and both are subtraction from a
  // start that nobody has given.
  ok("a thing with no hour on it is not somewhere you have to be on time",
     S.mustBeThere(rd) === false, String(S.mustBeThere(rd)));
  ok("  so it makes no journey to set off on", S.leaveBy(rd) === null, String(S.leaveBy(rd)));
  // THE ONE THAT WAS ACTUALLY HAPPENING: a job to leave at midnight, every day,
  // for an event with no time.
  const jobs = S.prepPlan([rd], { prepHorizonDays: 3 }, [], new Date(DAY + "T09:00:00"));
  ok("  and no job to set off for it at midnight",
     !(jobs.add || []).some((j) => /Leave for Report Distribution/.test(j.title)),
     JSON.stringify((jobs.add || []).map((j) => `${j.time} ${j.title}`)));
  // AND THE IMPORTER DOES NOT MAKE ANY MORE OF THEM. This is where the two
  // concepts were welded together: a button that means "this is part of my
  // week" wired straight to a flag that means "I travel to this and must arrive
  // on time".
  // BOTH WAYS IN: a line with a date on it, and a line that repeats on a
  // weekday. They are read by different halves of the importer and both halves
  // had the same weld in them.
  const made = C.toBlocks([
    { label: "Report Distribution", date: DAY, kind: "week", keep: true, said: true, start: "", end: "" },
    { label: "Staff briefing", date: DAY, kind: "week", keep: true, said: true, start: "08:00", end: "08:30" },
    { label: "Duty week", days: [1], kind: "week", keep: true, said: true, start: "", end: "" },
    { label: "Briefing", days: [1], kind: "week", keep: true, said: true, start: "07:45", end: "08:00" },
  ]).map((b) => S.normaliseBlock(b)).filter(Boolean);
  const got = (label) => made.find((b) => b.label === label);
  ok("and the importer does not call a line with no hour an appointment",
     got("Report Distribution") && got("Report Distribution").beThere === false &&
       got("Duty week") && got("Duty week").beThere === false,
     JSON.stringify(made.map((b) => `${b.label}:${b.beThere}`)));
  ok("  while a line that gave an hour still is one",
     got("Staff briefing") && got("Staff briefing").beThere === true &&
       got("Briefing") && got("Briefing").beThere === true,
     JSON.stringify(made.map((b) => `${b.label}:${b.beThere}`)));

  // AND A REAL APPOINTMENT IS UNTOUCHED.
  const meet = S.normaliseBlock({ id: "m", label: "Staff briefing", date: DAY,
    start: "08:00", end: "08:30", days: [], beThere: true, getThere: 10 });
  ok("while a thing with an hour on it is still somewhere you have to be",
     S.mustBeThere(meet) === true && S.toHM(S.leaveBy(meet)) === "07:50",
     JSON.stringify({ there: S.mustBeThere(meet), leave: S.leaveBy(meet) }));
}

// ---------------------------------------------------------------------------
console.log("\nAnd nothing scheduled is not the same as free");

// THE FOURTH STATE. On a school day the stretch between two lessons is a break
// you are supervising far more often than it is an hour at your desk, and an
// official timetable lists neither. Counted as free, a real Wednesday came out
// as "7h 25m in 5 stretches", one of them three hours and twenty minutes
// straight through the middle of lunch — a number that reads as a promise and
// is the app's own guess. So a gap is UNKNOWN until something says otherwise.
{
  const WED = "2026-11-18";
  const day = [
    { id: "a", label: "English", start: "08:40", end: "09:25", days: [3], kind: "teaching" },
    { id: "b", label: "On duty", start: "09:25", end: "09:35", days: [3], kind: "duty" },
    { id: "c", label: "Prep time", start: "09:35", end: "10:30", days: [3], kind: "other", workable: true },
    { id: "d", label: "Lunch", start: "12:15", end: "13:20", days: [3], kind: "break", protected: true },
  ];
  const at = (from) => (S.hoursOn(day, CFG, WED).find((h) => S.toHM(h.from) === from) || {}).use;
  ok("a lesson is occupied", at("08:40") === "occupied", String(at("08:40")));
  ok("  a break you supervise is occupied too", at("08:40") === "occupied" &&
     S.hoursOn(day, CFG, WED).find((h) => S.toHM(h.from) === "08:40").blocks.length === 2,
     JSON.stringify(S.hoursOn(day, CFG, WED).map((h) => `${S.toHM(h.from)}:${h.use}`)));
  ok("  a stretch you have said is yours is usable", at("09:35") === "usable", String(at("09:35")));
  ok("  lunch is protected", at("12:15") === "protected", String(at("12:15")));
  // AND THE ONE THAT WAS MISSING.
  ok("  and a stretch nobody has said anything about is unknown, not free",
     at("07:30") === "unknown" && at("10:30") === "unknown",
     JSON.stringify(S.hoursOn(day, CFG, WED).map((h) => `${S.toHM(h.from)}:${h.use}`)));

  // SAYING SO DOES NOT MAKE IT A COMMITMENT. The block exists only so that the
  // thing can be said at all.
  // MEASURED IN MINUTES, not by where a span starts: busyOn merges spans that
  // touch, so the workable stretch sits directly against the duty before it and
  // "does it start at 09:35" is answered no whether or not it is busy.
  const busyMins = (list) => S.busyOn(list, WED).reduce((n, x) => n + (x.end - x.start), 0);
  ok("and saying a stretch is yours does not make you busy in it",
     busyMins(day) === busyMins(day.filter((b) => b.id !== "c")),
     `${busyMins(day)} vs ${busyMins(day.filter((b) => b.id !== "c"))}`);

  // A DAY WITH NO TIMETABLE TO BE SILENT is different: an empty stretch there is
  // empty because there is nothing, not because nobody has said.
  ok("but on a day with no timetable at all, an empty stretch is genuinely yours",
     S.hoursOn([], CFG, "2026-11-21", { gapsAreYours: true })
       .every((h) => h.use === "usable"),
     JSON.stringify(S.hoursOn([], CFG, "2026-11-21", { gapsAreYours: true }).map((h) => h.use)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd leaving is a boundary, not an appointment");

// "Leave at 15:50" is not a thing you do for zero minutes at ten to four. It is
// the edge of the working day: school-only work has to fit in front of it, and
// the planner filling the hour after it is the app quietly extending the day —
// which is the exact thing it exists to protect against.
{
  const WED = "2026-11-18";
  const day = [{ id: "a", label: "English", start: "08:40", end: "09:25", days: [3], kind: "teaching" }];
  const bound = { dayStart: "07:30", dayEnd: "17:30", leaveAt: "15:50" };
  ok("nothing is planned after the time you leave",
     S.gapsOn(day, bound, WED).every((g) => g.end <= S.toMin("15:50")),
     JSON.stringify(S.gapsOn(day, bound, WED).map((g) => `${S.toHM(g.start)}-${S.toHM(g.end)}`)));
  ok("  and the day says that time is protected rather than empty",
     (S.hoursOn(day, bound, WED).find((h) => S.toHM(h.from) === "15:50") || {}).use === "protected",
     JSON.stringify(S.hoursOn(day, bound, WED).map((h) => `${S.toHM(h.from)}:${h.use}`)));
  // AND IT IS NOT A BLOCK. Written as one it would be a commitment with a
  // start, an end and a journey, none of which it has.
  ok("  and it is not an appointment — nothing is on the day at ten to four",
     !S.blocksOn(day, WED).some((b) => S.toMin(b.start) === S.toMin("15:50")),
     JSON.stringify(S.blocksOn(day, WED).map((b) => b.label)));
  ok("and with no boundary set the day simply runs to the end of the window",
     S.gapsOn(day, { dayStart: "07:30", dayEnd: "17:30" }, WED)
       .some((g) => g.end === S.toMin("17:30")),
     JSON.stringify(S.gapsOn(day, { dayStart: "07:30", dayEnd: "17:30" }, WED)
       .map((g) => `${S.toHM(g.start)}-${S.toHM(g.end)}`)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the week's own gaps are one question each, not one per day");

// These are properties of the WEEK — the same twenty minutes every Wednesday —
// so classifying them must not mean creating dozens of one-off blocks. That is
// the admin burden this app exists to remove.
{
  const week = [
    { id: "a", label: "English", start: "08:40", end: "09:25", days: [1, 2, 3, 4, 5], kind: "teaching" },
    { id: "b", label: "Science", start: "10:30", end: "11:05", days: [3], kind: "teaching" },
  ];
  const gaps = S.gapsInWeek(week, { dayStart: "07:30", dayEnd: "17:30", leaveAt: "15:50" });
  const shown = gaps.map((g) => `${S.toHM(g.from)}-${S.toHM(g.to)}:${g.days.join("")}`);
  ok("a gap that falls on all five days is one question, not five",
     shown.includes("07:30-08:40:12345"), JSON.stringify(shown));
  ok("  and a gap only one day has is its own question",
     shown.includes("09:25-10:30:3"), JSON.stringify(shown));
  ok("and nothing is looked for past the time you leave",
     gaps.every((g) => g.to <= S.toMin("15:50")), JSON.stringify(shown));
  // AND A STRETCH THAT HAS BEEN ANSWERED STOPS BEING A QUESTION.
  const answered = week.concat([{ id: "p", label: "Prep time", start: "09:25", end: "10:30",
    days: [3], kind: "other", workable: true }]);
  ok("and answering one takes it off the list",
     !S.gapsInWeek(answered, { dayStart: "07:30", dayEnd: "17:30", leaveAt: "15:50" })
       .some((g) => S.toHM(g.from) === "09:25" && g.days.join() === "3"),
     JSON.stringify(S.gapsInWeek(answered, { dayStart: "07:30", dayEnd: "17:30", leaveAt: "15:50" })
       .map((g) => `${S.toHM(g.from)}-${S.toHM(g.to)}:${g.days.join("")}`)));
}

finish();
