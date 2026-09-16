import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHAT IS DIFFERENT ABOUT TODAY.
//
// You know what a Tuesday looks like; you have taught it thirty times. What you
// do not know — and what costs you when you get it wrong — is the Tuesday that
// ISN'T one: the Saturday running Wednesday's lessons, the morning the parents
// are in, the week Read Aloud doesn't run because the class is out.
//
// Every one of those was already in the schedule and none of it was ever said.
// The app drew the day and left you to notice, which means reading the whole
// week and comparing it against a memory — the exact work this is supposed to
// take off you.
//
// AND AN ORDINARY DAY SAYS NOTHING. A week that reads "Monday — no changes,
// Tuesday — no changes, Wednesday — no changes" is four lines of reassurance to
// read before the one that matters, and after a fortnight of that nobody reads
// any of them. Silence is the useful answer for a normal day.
//
// AND WHAT EACH BLOCK IS. A block knew where it was, who it was about and
// whether you had to be in the room — and not whether it was a lesson. So "when
// am I teaching", "when am I on duty" and "when am I free" were three questions
// the app held all the data for and could not answer.

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
["dates.js", "schedule.js", "dayshape.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const S = sb.OrganiserSchedule, D = sb.OrganiserDayShape;

// A week: two lessons, a duty, a protected lunch. Tue 15 Sep 2026 is a Tuesday.
const WEEK = [
  { id: "eng", label: "P1 English", start: "09:00", end: "09:50", days: [2, 3], kind: "teaching" },
  { id: "read", label: "Read Aloud", start: "08:15", end: "08:35", days: [2],
    kind: "teaching", skip: ["2026-09-22"] },
  { id: "gate", label: "Gate duty", start: "08:00", end: "08:15", days: [3], kind: "duty" },
  { id: "lunch", label: "Lunch", start: "12:30", end: "13:15", days: [2, 3],
    kind: "break", protected: true },
];
const ALSO = [
  { id: "par", label: "Parents' Meeting", start: "08:30", end: "10:00", date: "2026-09-16" },
  { id: "pd", label: "Faculty Learning Day", start: "08:00", end: "16:00",
    date: "2026-09-17", noLessons: true },
  { id: "sat", label: "Make-up day", start: "00:00", end: "00:01",
    date: "2026-09-19", runsAs: 3 },
  // A TRAINING DAY ON A TEACHING DAY — Tuesday 29 September, which normally
  // carries Read Aloud and P1 English. One line explains why neither is on.
  { id: "pd2", label: "Professional Development Day", start: "08:00", end: "16:00",
    date: "2026-09-29", noLessons: true },
  // A TUESDAY RUNNING MONDAY'S TIMETABLE — 6 October. Tuesday's own two lessons
  // and its lunch all go; Monday has nothing. One line says why.
  { id: "mon", label: "Swap", start: "00:00", end: "00:01",
    date: "2026-10-06", runsAs: 1 },
];
const ALL = WEEK.concat(ALSO);
const words = (iso) => D.differsOn(ALL, iso, {}).map((x) => x.words);

// ---------------------------------------------------------------------------
console.log("\nWhat each block is");

{
  const tue = "2026-09-15";
  ok("teaching is teaching", S.teachingOn(ALL, tue).map((b) => b.label).join(", ") ===
     "Read Aloud, P1 English", JSON.stringify(S.teachingOn(ALL, tue).map((b) => b.label)));
  ok("and a duty is not", !S.dutyOn(ALL, tue).length,
     JSON.stringify(S.dutyOn(ALL, tue).map((b) => b.label)));
  const wed = "2026-09-16";
  ok("while Wednesday has one", S.dutyOn(ALL, wed).map((b) => b.label).join() === "Gate duty",
     JSON.stringify(S.dutyOn(ALL, wed).map((b) => b.label)));
  // AND A BLOCK WRITTEN BEFORE ANY OF THIS IS STILL A BLOCK. Every schedule
  // already saved has no kind on it, and a migration nobody asked for is a
  // morning somebody loses to the app.
  const old = S.normaliseBlock({ label: "Staff meeting", start: "15:45", end: "16:30", days: [5] });
  ok("a block saved before there were kinds still reads", !!old && old.label === "Staff meeting",
     JSON.stringify(old));
  ok("  with no kind, which is a valid answer", old.kind === "" && old.protected === false,
     JSON.stringify({ kind: old.kind, protected: old.protected }));
  ok("  and a kind nobody recognises is no kind at all",
     S.normaliseBlock({ label: "x", start: "09:00", end: "10:00", days: [1], kind: "nonsense" })
       .kind === "", "an unknown word got through");
}

// ---------------------------------------------------------------------------
console.log("\nAnd whether a planner may have the time");

{
  const tue = "2026-09-15";
  const busy = S.busyOn(ALL, tue).map((x) => `${S.toHM(x.start)}-${S.toHM(x.end)}`);
  ok("protected time is busy, so free time never includes it",
     busy.includes("12:30-13:15"), JSON.stringify(busy));
  // A GUESS YOU CHOSE TO KEEP IS NOT A GUESS ANY MORE. Soft blocks are left out
  // of busy time on purpose — the app guessing "you usually stop around five"
  // must never make somebody unavailable. Marking one protected is answering
  // that guess, and a planner filling it would be overruling a decision.
  const guess = [{ id: "g", label: "Wind down", start: "16:30", end: "17:00",
    days: [2], soft: true }];
  ok("a soft block the app guessed at is not busy",
     !S.busyOn(guess, tue).length, JSON.stringify(S.busyOn(guess, tue)));
  const kept = [{ ...guess[0], protected: true }];
  ok("  and the same block, protected, is",
     S.busyOn(kept, tue).length === 1, JSON.stringify(S.busyOn(kept, tue)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd what is different about today");

ok("an ordinary Tuesday is not remarked upon", words("2026-09-15").length === 0,
   JSON.stringify(words("2026-09-15")));
ok("a day with something extra on it says what",
   words("2026-09-16").join(" ").includes("Parents' Meeting"), JSON.stringify(words("2026-09-16")));
ok("a day with the teaching off says so, and says which day it is",
   words("2026-09-17").join(" ") === "no lessons — Faculty Learning Day",
   JSON.stringify(words("2026-09-17")));
ok("a day standing in for another says whose timetable it is running",
   words("2026-09-19").join(" ").includes("running Wednesday's timetable"),
   JSON.stringify(words("2026-09-19")));
// THE QUIET ONE. Nothing on the screen is wrong; something is simply absent,
// and absence is the one thing looking at a timetable cannot show you.
ok("and a week where something normally on is not on says that too",
   words("2026-09-22").join(" ") === "no Read Aloud", JSON.stringify(words("2026-09-22")));

// AND A DAY RUNNING ANOTHER DAY'S TIMETABLE DOES NOT LIST EVERY LESSON IT LOST.
// On that Saturday, all of Saturday's blocks are "missing" — there are none —
// and every one of Wednesday's is new. One line explains all of it; the rest
// would bury it.
ok("a substituted day explains itself once, not block by block",
   words("2026-09-19").length === 1, JSON.stringify(words("2026-09-19")));

// AND A TEACHING DAY THAT RUNS ANOTHER DAY'S TIMETABLE LOSES ITS OWN LESSONS —
// which is the whole of what "running Monday's timetable" means, and listing
// each of them underneath it is the same sentence three more times.
ok("a teaching day standing in for another says that, and only that",
   words("2026-10-06").join(" ") === "running Monday's timetable",
   JSON.stringify(words("2026-10-06")));

// AND A DAY WITH THE TEACHING OFF DOES NOT THEN LIST EVERY LESSON IT LOST.
// Tuesday normally carries two; "no lessons — Professional Development Day" is
// the whole of why neither is on, and "no Read Aloud, no P1 English" underneath
// it is the same fact said three times.
ok("a day with no lessons explains itself once, not lesson by lesson",
   words("2026-09-29").join(" ") === "no lessons — Professional Development Day",
   JSON.stringify(words("2026-09-29")));

// AND NOTHING IS INVENTED ON A DAY NOBODY HAS ANY BLOCKS FOR.
ok("a day with nothing on it at all is not a day full of differences",
   D.differsOn(ALL, "2026-09-20", {}).length === 0,
   JSON.stringify(D.differsOn(ALL, "2026-09-20", {}).map((x) => x.words)));

// AND A DATE THAT IS NOT A DATE IS NOT AN ERROR.
ok("and nonsense in, nothing out", D.differsOn(ALL, "", {}).length === 0 &&
   D.differsOn(ALL, "not a date", {}).length === 0, "differsOn threw or invented");

finish();
