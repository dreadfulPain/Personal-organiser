import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE TWO THINGS THAT HAPPEN TO A TIMETABLE ONCE IT EXISTS.
//
// A timetable is not a fact, it is a starting point. Two things happen to it
// constantly and neither had a test:
//
//   A SWAP. You give a lesson away and teach it somewhere else, or somebody
//   covers it, or the class is out. Two halves, and the app has to hold both —
//   the day you lost it AND the day you teach it — or the week is wrong twice.
//
//   A MAKE-UP DAY. A Saturday standing in for a Monday, which is ordinary in
//   China and happens everywhere around a bank holiday. The whole day moves:
//   hours, lessons and all.
//
// What this caught: the half you teach was built from a hand-written list of
// fields to carry over, and the list had gone out of date. The new lesson came
// back as scenery — not a place you have to be, no journey time — so it read
// "ON" in the week where every other lesson read "BE THERE".

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["dates.js", "schedule.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const S = sb.OrganiserSchedule;

// A lesson with everything switched on, so anything dropped in a copy shows.
const LESSON = S.normaliseBlock({
  id: "L1", label: "9A English", start: "11:20", end: "12:20", days: [1],
  beThere: true, getThere: 15, swappable: true, about: ["p1"],
  prep: { on: true, leadDays: 2 },
});

// What timeline.js builds for the half you teach. Kept here in the same shape
// as the page so a change there has to come through this.
const swappedInto = (b, to, start, end) =>
  S.normaliseBlock({ ...b, id: "", days: [], skip: [], start: start || b.start, end: end || b.end, date: to, source: "hand" });

// ---------------------------------------------------------------------------
sec("A swap is two halves");
{
  const MON = "2026-08-24";
  const THU = "2026-08-27";
  const off = { ...LESSON, skip: [MON] };
  const moved = swappedInto(LESSON, THU, "14:20", "15:20");

  ok("it was made", !!moved, "normaliseBlock refused the swapped half");
  const week = [off, moved];
  const on = (iso) => S.blocksOn(week, iso).map((b) => b.label);
  ok("the day you gave it away has lost it", !on(MON).includes("9A English"), JSON.stringify(on(MON)));
  ok("the day you teach it has gained it", on(THU).includes("9A English"), JSON.stringify(on(THU)));
  ok("and at the time you said", S.blocksOn(week, THU).some((b) => b.start === "14:20"),
     JSON.stringify(S.blocksOn(week, THU).map((b) => b.start)));
  // ONE WEEK ONLY. A swap is a swap, not a change to the timetable — the
  // Monday after is a normal Monday.
  ok("but only that week", on("2026-08-31").includes("9A English"), JSON.stringify(on("2026-08-31")));
}

sec("And the half you teach is the same lesson you gave away");
{
  const moved = swappedInto(LESSON, "2026-08-27");
  // THE FAILURE THIS FILE EXISTS FOR. The copy used to name the fields to carry
  // over — label, about, prep, swappable — and quietly dropped everything else,
  // so the lesson came back as scenery: not somewhere you have to be, no
  // journey to protect, reading "ON" in the week where every other lesson read
  // "BE THERE". A list of fields to copy goes out of date the next time a block
  // learns something new; the whole block is carried and three things overridden.
  const CARRIED = ["label", "beThere", "getThere", "swappable", "soft", "about", "noLessons", "blocksDay"];
  const lost = CARRIED.filter((k) => JSON.stringify(moved[k]) !== JSON.stringify(LESSON[k]));
  ok("everything about it comes with it", lost.length === 0, `dropped: ${lost.join(", ")}`);
  ok("the work it owes comes too", JSON.stringify(moved.prep) === JSON.stringify(LESSON.prep),
     JSON.stringify(moved.prep));

  // AND THE THREE THINGS THAT MUST DIFFER.
  ok("it is a new block, not the same one twice", moved.id !== LESSON.id, moved.id);
  ok("it happens once, on a date", moved.date === "2026-08-27" && moved.days.length === 0,
     JSON.stringify({ date: moved.date, days: moved.days }));
  ok("and it carries none of the original's own swaps", moved.skip.length === 0, JSON.stringify(moved.skip));
}

// ---------------------------------------------------------------------------
sec("A Saturday that runs a Monday");
{
  const week = [
    S.normaliseBlock({ id: "a", label: "Form", start: "08:30", end: "08:50", days: [1] }),
    S.normaliseBlock({ id: "b", label: "7B English", start: "09:00", end: "10:00", days: [1] }),
    S.normaliseBlock({ id: "c", label: "Marker", start: "00:00", end: "23:59", date: "2026-08-29", runsAs: 1 }),
  ];
  const sat = S.blocksOn(week, "2026-08-29").map((b) => b.label);
  ok("the whole day moves onto it", sat.includes("Form") && sat.includes("7B English"), JSON.stringify(sat));
  // AND ONLY THAT SATURDAY. The one before and the one after are Saturdays.
  ok("an ordinary Saturday is still an ordinary Saturday",
     S.blocksOn(week, "2026-08-22").length === 0, JSON.stringify(S.blocksOn(week, "2026-08-22").map((b) => b.label)));
  ok("and so is the one after", S.blocksOn(week, "2026-09-05").length === 0,
     JSON.stringify(S.blocksOn(week, "2026-09-05").map((b) => b.label)));
  // THE MARKER IS NOT A LESSON. It says what kind of day it is; it is not
  // something you attend, and counting it as one puts a phantom all-day block
  // in your week.
  ok("the marker itself is never one of the day's blocks",
     !sat.includes("Marker"), JSON.stringify(sat));
  // AND THE DAY IS A WORKING DAY, which is the whole point — a Saturday
  // standing in for a Monday is a day you are at work.
  ok("the date is read as the day it stands in for", S.runsAsOn(week, "2026-08-29") === 1,
     String(S.runsAsOn(week, "2026-08-29")));
}

sec("And the page says what it did");
{
  // Every other action in that panel says what happened. This one changed the
  // whole shape of a day and said nothing at all, so the only feedback was a
  // row appearing somewhere below the button.
  const src = fs.readFileSync(path.join(PUB, "timeline.js"), "utf8");
  const handler = (src.match(/\.mu-add"\)\.addEventListener\([\s\S]*?\n    \}\);/) || [""])[0];
  ok("adding one says so", /setSuStatus\(/.test(handler), "nothing is said when a make-up day is added");
  ok("and pressing it with nothing filled in says why not",
     /Which date is it/.test(handler), "it just does nothing");
}

done();
