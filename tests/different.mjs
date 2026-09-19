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
    kind: "teaching", skip: ["2026-09-22", "2026-10-13", "2026-10-27"] },
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
  // SOMETHING IN READ ALOUD'S PLACE. Tuesday 13 October has Read Aloud skipped
  // (see WEEK) and this on at the same twenty minutes — which is one event seen
  // from two sides, not two things to work out the connection between.
  { id: "ass", label: "Assembly", start: "08:15", end: "08:45", date: "2026-10-13" },
  // AND SOMETHING THAT MERELY CLASHES. Tuesday 20 October: P1 English is still
  // on, and this sits across it. Nobody has cancelled the lesson.
  { id: "obs", label: "Observation", start: "09:10", end: "10:10", date: "2026-10-20" },
  // AND A DAY THAT LOSES SOMETHING IN THE MORNING AND GAINS SOMETHING AT HALF
  // THREE. Tuesday 27 October also has Read Aloud skipped (see WEEK). The two
  // have nothing to do with each other and must not be joined up.
  { id: "stf", label: "Staff meeting", start: "15:30", end: "16:15", date: "2026-10-27" },
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
// AND A DATE THE CALENDAR NEVER TIMED SAYS SO, rather than saying midnight.
// The week reads this too, and "Parents' Meeting 12:00 AM" is a time nobody
// gave — which on a Week page is the only thing said about that day.
ok("a one-off with no hour on it says so rather than saying midnight",
   D.differsOn(WEEK.concat([{ id: "nt", label: "Report Distribution", date: "2026-09-16",
     start: "00:00", end: "23:59", days: [] }]), "2026-09-16", {})
     .map((x) => x.words).join() === "Report Distribution — sometime today",
   JSON.stringify(D.differsOn(WEEK.concat([{ id: "nt", label: "Report Distribution",
     date: "2026-09-16", start: "00:00", end: "23:59", days: [] }]), "2026-09-16", {})
     .map((x) => x.words)));

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

// ---------------------------------------------------------------------------
console.log("\nAnd whether a thing replaced something or was simply added");

// THE DIFFERENCE A PERSON ACTS ON. "No Read Aloud" and "Assembly 08:15" are
// two true lines that leave you to notice they are the same twenty minutes.
// One of them is the lesson going and one is what went in its place, and until
// you have put them together you have not been told what happened.
{
  const swap = D.differsOn(ALL, "2026-10-13", {});
  ok("a lesson off and something on at its hour is one change, not two",
     swap.length === 1, JSON.stringify(swap.map((x) => x.words)));
  ok("  and it says what stood in for what",
     swap[0].how === "swapped" && swap[0].words === "Read Aloud → Assembly",
     JSON.stringify({ how: swap[0].how, words: swap[0].words }));
  ok("  and keeps hold of the one that went, not only its name",
     swap[0].was && swap[0].was.id === "read" && swap[0].block.id === "ass",
     JSON.stringify({ was: swap[0].was && swap[0].was.id, block: swap[0].block.id }));

  // AND A CLASH IS NOT A REPLACEMENT. Something laid across a lesson that is
  // still running has not replaced it. Saying it did would be the app telling
  // you a lesson is cancelled when nobody has cancelled it — and you would find
  // that out standing outside a room with a class in it.
  const clash = D.differsOn(ALL, "2026-10-20", {}).map((x) => `${x.how}:${x.words}`);
  ok("something laid across a lesson still running is an addition",
     clash.join(" ") === "added:Observation 9:10 AM", JSON.stringify(clash));

  // AND TWO THINGS ON THE SAME DAY ARE NOT THE SAME THING. A lesson off at
  // quarter past eight and a meeting called for half three have nothing to do
  // with each other, and "Read Aloud → Staff meeting" would be the app making
  // up a story out of two facts that happen to share a date.
  const apart = D.differsOn(ALL, "2026-10-27", {}).map((x) => `${x.how}:${x.words}`);
  ok("a loss in the morning and a gain at half three are two changes",
     apart.join(" | ") === "added:Staff meeting 3:30 PM | gone:no Read Aloud",
     JSON.stringify(apart));

  // AND AN ADDITION AT AN HOUR NOTHING NORMALLY RUNS IS JUST AN ADDITION.
  const add = D.differsOn(ALL, "2026-09-16", {});
  ok("and a one-off on a day that lost nothing says only that",
     add.length === 1 && add[0].how === "added", JSON.stringify(add.map((x) => x.how)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd which layer each thing is on");

// A WALL TIMETABLE WITH PENCIL ON IT. The printed half is the same every week
// and you stopped reading it years ago; the pencil is the half you look for.
// Drawn in the same ink, finding the pencil becomes the work.
{
  const lay = (iso) => D.layersOn(ALL, iso, {});
  const tue = lay("2026-09-15").map((r) => `${r.layer}:${r.block.label}`);
  ok("an ordinary day is all printed timetable",
     tue.join(" | ") === "standing:Read Aloud | standing:P1 English | standing:Lunch",
     JSON.stringify(tue));
  // PROTECTED IS NOT A LAYER, which is the whole of the adjustment: a lunch you
  // keep is ordinary timetable that happens to be spoken for, and the day it
  // moves it is still spoken for. So it stays on the block and the row says
  // nothing about it — one fact, one place.
  ok("  and time you keep is ordinary timetable that happens to be kept",
     lay("2026-09-15").find((r) => r.block.label === "Lunch").layer === "standing" &&
       lay("2026-09-15").find((r) => r.block.label === "Lunch").block.protected === true,
     JSON.stringify(lay("2026-09-15").map((r) => `${r.layer}:${r.block.label}`)));
  ok("  and the row does not keep a second copy of it to disagree with",
     lay("2026-09-15").every((r) => !("held" in r)),
     JSON.stringify(Object.keys(lay("2026-09-15")[0])));

  const wed = lay("2026-09-16");
  ok("a one-off is pencil, and everything around it is still print",
     wed.filter((r) => r.layer === "change").map((r) => r.block.label).join() === "Parents' Meeting",
     JSON.stringify(wed.map((r) => `${r.layer}:${r.block.label}`)));
  ok("  and the pencil row carries what it is instead of just its name",
     wed.find((r) => r.layer === "change").how === "added",
     JSON.stringify(wed.map((r) => r.how)));

  const oct = lay("2026-10-13").find((r) => r.layer === "change");
  ok("a stand-in row says what it stood in for",
     oct && oct.how === "swapped" && oct.was.label === "Read Aloud" &&
       oct.block.label === "Assembly",
     JSON.stringify(oct && { how: oct.how, was: oct.was && oct.was.label }));

  // A DAY-WIDE FACT IS NOT A ROW. "No lessons — Faculty Learning Day" is true
  // of the whole day rather than of an hour in it, differsOn already says it,
  // and a view drawing both would say it twice.
  ok("a day marker is not a row in the day",
     !lay("2026-09-17").some((r) => r.block.id === "pd"),
     JSON.stringify(lay("2026-09-17").map((r) => r.block.label)));

  // AND A DAY STANDING IN FOR ANOTHER IS NOT A DAY OF CHANGES. Every block on
  // it belongs to the day it is running, and marking all of them as changes
  // makes the whole screen shout the one thing the top line already said.
  ok("a substituted day's lessons are the other day's ordinary ones",
     lay("2026-09-19").length > 0 && lay("2026-09-19").every((r) => r.layer === "standing"),
     JSON.stringify(lay("2026-09-19").map((r) => `${r.layer}:${r.block.label}`)));

  ok("and nonsense in, nothing out", D.layersOn(ALL, "", {}).length === 0 &&
     D.layersOn(ALL, "not a date", {}).length === 0, "layersOn threw or invented");
}

// ---------------------------------------------------------------------------
// AND ON THE PAGE, WHICH IS THE ONLY PLACE IT COUNTS.
//
// A module that knows which lesson was replaced and a Day page that still draws
// the lesson vanishing are indistinguishable from here unless the page is
// actually opened. That distinction is the one this app keeps losing.
const { open, deep } = await import("./_dom.mjs");

// Built around whatever day this is run on, because the Day page draws today
// and a fixture pinned to a Tuesday is a test that passes six days a week.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const ISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const EVERY = [0, 1, 2, 3, 4, 5, 6];
const PAGE = [
  { id: "eng", label: "P1 English", start: "09:00", end: "09:50", days: EVERY, kind: "teaching" },
  // Off today, and something on in its place at the same twenty minutes.
  { id: "read", label: "Read Aloud", start: "08:15", end: "08:35", days: EVERY,
    kind: "teaching", skip: [ISO] },
  { id: "ass", label: "Assembly", start: "08:15", end: "08:45", date: ISO },
  // And something simply added, at an hour nothing normally runs.
  { id: "stf", label: "Staff meeting", start: "15:30", end: "16:15", date: ISO },
  { id: "lunch", label: "Lunch", start: "12:30", end: "13:15", days: EVERY,
    kind: "break", protected: true },
];
// A job, placed by hand into an accepted plan so the row is there whatever time
// of day the suite is run at.
const ITEMS = [{ id: "t1", title: "Mark 7B books", type: "task", minutes: 30 }];
const CFG = {
  dayStart: "07:30", dayEnd: "17:30",
  plans: { [ISO]: { acceptedAt: new Date().toISOString(),
    slots: [{ itemId: "t1", start: 630, end: 660, pinned: true }] } },
};
const DATA = { schedule: PAGE, scheduleConfig: CFG, items: ITEMS, goals: [], contacts: [] };
const textOf = (el) => deep(el).map((c) => `${c.textContent || ""} ${c.innerHTML || ""}`).join(" ");
const classed = (el, cls) =>
  deep(el).filter((c) => String(c.className).split(/\s+/).includes(cls));

console.log("\nAnd on the Day page");
{
  const r = await open("timeline.html", DATA);
  ok("the day opens", r.errs.length === 0, r.errs.join("; "));
  const day = r.get("#timeline");
  const said = textOf(day);

  const strip = classed(day, "dp-diff")[0];
  ok("what is different about today is said before the day is drawn", !!strip, said.slice(0, 300));
  const lines = strip ? classed(strip, "dp-diffrow").map((c) => c.textContent) : [];
  ok("  and it is the differences, not a summary of the timetable",
     lines.join(" | ") === "Read Aloud → Assembly | Staff meeting 3:30 PM", JSON.stringify(lines));

  // THE LAYERS, ON THE ROWS. Class for the eye; words for everybody who can't
  // use it — a printout, a screen reader, two greens that look the same.
  const rows = classed(day, "dp-block");
  const find = (label) => rows.find((c) => String(c.innerHTML).includes(label));
  ok("the printed timetable is drawn as the printed timetable",
     find("P1 English") && find("P1 English").className.includes("dp-standing") &&
       !/Added today|Changed|Kept/.test(find("P1 English").innerHTML),
     find("P1 English") && find("P1 English").className);
  ok("a one-off stands out, and says in words that it is one",
     find("Staff meeting") && find("Staff meeting").className.includes("dp-changed") &&
       /Added today/.test(find("Staff meeting").innerHTML),
     find("Staff meeting") && find("Staff meeting").className);
  // THE WHOLE POINT OF THE SWAP. A lesson that simply disappears off the day is
  // the thing you find out about by turning up to an empty room.
  ok("and a lesson that was replaced is named, not quietly dropped",
     find("Assembly") && /Read Aloud(?:[\s\S]*?)→(?:[\s\S]*?)Assembly/.test(find("Assembly").innerHTML),
     find("Assembly") && find("Assembly").innerHTML);
  ok("  marked as changed rather than as something new",
     find("Assembly") && /Changed/.test(find("Assembly").innerHTML) &&
       !/Added today/.test(find("Assembly").innerHTML),
     find("Assembly") && find("Assembly").innerHTML);

  // UNAVAILABLE HAS TO LOOK LIKE SOMETHING. Time that is spoken for drawn as a
  // blank is time a planner — or a person at half past twelve — reads as spare.
  const lunch = find("Lunch");
  ok("time you keep looks kept rather than empty",
     lunch && lunch.className.includes("dp-held") && /Kept/.test(lunch.innerHTML),
     lunch && lunch.className);
  ok("  and says what that means, once, in plain words",
     lunch && /spoken for/.test(lunch.innerHTML), lunch && lunch.innerHTML);
  ok("  while still being the ordinary timetable, not a change",
     lunch && lunch.className.includes("dp-standing"), lunch && lunch.className);
  ok("and a break says it is one", lunch && lunch.className.includes("k-break"),
     lunch && lunch.className);

  // A JOB IS NOT AN APPOINTMENT. Fourteen appointments is a day you avoid
  // opening; fourteen ticks is a list.
  const task = classed(day, "dp-task")[0];
  ok("a job is drawn as a job", !!task && /Mark 7B books/.test(task.innerHTML), said.slice(0, 200));
  ok("  with a tick box where a lesson has its time",
     task && /class="dp-tick"/.test(task.innerHTML) && !/class="dp-time"/.test(task.innerHTML),
     task && task.innerHTML.slice(0, 220));
  ok("  and the hour it was put at said as a guess beside the estimate",
     task && /dp-at/.test(task.innerHTML), task && task.innerHTML.slice(0, 220));

  // AND AN ORDINARY DAY SAYS NOTHING AT ALL. A strip that appears every morning
  // saying "no changes" is a strip nobody reads by the second week.
  const plain = await open("timeline.html", {
    ...DATA, schedule: PAGE.filter((b) => b.days && !b.skip),
    scheduleConfig: { ...CFG, plans: {} },
  });
  ok("and an ordinary day is not remarked upon at all",
     classed(plain.get("#timeline"), "dp-diff").length === 0,
     textOf(plain.get("#timeline")).slice(0, 200));
}

console.log("\nAnd on the Week page");
{
  const r = await open("week.html", DATA);
  ok("the week opens", r.errs.length === 0, r.errs.join("; "));
  const wk = r.get("#weekList");
  const notes = classed(wk, "wk-note").map((c) => c.textContent);
  // THE WEEK YOU CAN READ DOWN THE LEFT IN FOUR SECONDS.
  ok("every day says in one word whether it is an ordinary one",
     notes.length === 7, JSON.stringify(notes));
  ok("  and six of the seven are ordinary and say so quietly",
     notes.filter((w) => w === " — normal").length === 6, JSON.stringify(notes));
  ok("  while the one that isn't says what, at the top rather than buried",
     notes[0] === " — Read Aloud → Assembly · and 1 more", JSON.stringify(notes[0]));
  ok("  and the day that differs is the only one marked as differing",
     classed(wk, "changed").length === 1,
     JSON.stringify(classed(wk, "changed").map((c) => c.textContent)));
  const kept = classed(wk, "wk-block").filter((c) => /Lunch/.test(c.innerHTML))[0];
  ok("and time you keep is kept here too", !!kept && /Kept/.test(kept.innerHTML),
     kept && kept.innerHTML);

  // AND THE ROWS UNDERNEATH ARE STILL PRINT AND PENCIL. A week of ordinary
  // lessons drawn at the weight of the one morning that isn't ordinary is a
  // week you have to read all of — which is the work this was meant to take off.
  const blocks = classed(wk, "wk-block");
  const on = (label) => blocks.find((c) => String(c.innerHTML).includes(label));
  ok("the one that changed is drawn as changed",
     on("Assembly") && on("Assembly").className.includes("dp-changed"),
     on("Assembly") && on("Assembly").className);
  ok("  and says what it replaced, the same way the day does",
     on("Assembly") && /Read Aloud(?:[\s\S]*?)→(?:[\s\S]*?)Assembly/.test(on("Assembly").innerHTML),
     on("Assembly") && on("Assembly").innerHTML);
  ok("  while an ordinary lesson stays quiet on every day of the week",
     blocks.filter((c) => /P1 English/.test(c.innerHTML)).length === 7 &&
       blocks.every((c) => !/P1 English/.test(c.innerHTML) || !c.className.includes("dp-changed")),
     JSON.stringify(blocks.filter((c) => /P1 English/.test(c.innerHTML)).map((c) => c.className)));
  ok("and kept time is kept every day it is kept, not only today",
     blocks.filter((c) => c.className.includes("dp-held")).length === 7,
     JSON.stringify(blocks.filter((c) => c.className.includes("dp-held")).length));

  // AND THE PRINTED TIMETABLE IS COUNTED, NOT LISTED. Nine rows of it under
  // each of seven days is a wall, and the one morning that isn't ordinary ends
  // up somewhere in the middle of it. The week has to be readable down the left
  // in four seconds or it is not doing the job it exists for.
  const folds = classed(wk, "wk-usual");
  ok("every day folds its ordinary timetable behind one line", folds.length === 7,
     JSON.stringify(folds.length));
  const line = (i) => (folds[i].children[0] || {}).textContent;
  // AND AN ORDINARY DAY IS STILL NOT AN EMPTY ONE. This page called a day with
  // four lessons on it "free" once, which is the exact sentence you plan
  // against — so the fold says how much of the day is already spoken for.
  ok("  saying how much of the day is already gone, not just that it is normal",
     line(1) === "2 lessons · 1 break · 1 kept", JSON.stringify(line(1)));
  ok("  and today counts the lesson that isn't running as not running",
     line(0) === "1 lesson · 1 break · 1 kept", JSON.stringify(line(0)));
  // AND WHAT IS DIFFERENT IS NEVER FOLDED AWAY. It is the whole reason for
  // opening the page.
  const foldedIn = folds.flatMap((f) => classed(f, "dp-changed"));
  ok("  while nothing that changed is ever hidden inside the fold",
     foldedIn.length === 0, JSON.stringify(foldedIn.map((c) => c.innerHTML.slice(0, 40))));
}

// AND A WEEK NOBODY HAS TOLD WHAT ANY OF IT IS. Every schedule saved before the
// app asked has no kind on a single block, and "9 more" is a worse answer than
// counting them.
{
  const r = await open("week.html", {
    schedule: [
      { id: "a", label: "First thing", start: "08:00", end: "09:00", days: EVERY },
      { id: "b", label: "Second", start: "09:00", end: "10:00", days: EVERY },
    ],
    scheduleConfig: {}, items: [], goals: [], contacts: [],
  });
  const fold = classed(r.get("#weekList"), "wk-usual")[0];
  ok("a week with no kinds on it still says how much is on",
     fold && (fold.children[0] || {}).textContent === "2 on the timetable",
     fold && JSON.stringify((fold.children[0] || {}).textContent));
}

// AND A DAY YOU MARKED OFF IS NOT A FREE DAY.
//
// Nothing resolves on one — the marker IS the day rather than a row in it — so
// this page printed "free" under it. That is the exact sentence you plan
// against, and it is the second time this page has said a day was free when it
// wasn't. The first time it was a day with four lessons on it.
{
  const then = new Date(now.getTime() + 86400000);
  const TOMORROW = `${then.getFullYear()}-${pad(then.getMonth() + 1)}-${pad(then.getDate())}`;
  const r = await open("week.html", {
    schedule: [
      { id: "eng", label: "P1 English", start: "09:00", end: "09:50", days: [now.getDay()] },
      { id: "off", label: "Half term", start: "00:00", end: "23:59",
        date: TOMORROW, blocksDay: true },
    ],
    scheduleConfig: {}, items: [], goals: [], contacts: [],
  });
  const wk = r.get("#weekList");
  const off = (wk.children || [])[1];
  ok("a day you marked off says so", !!off &&
     classed(off, "wk-note").map((c) => c.textContent).join() === " — a day off — Half term",
     JSON.stringify(classed(off, "wk-note").map((c) => c.textContent)));
  ok("  and is not also called free", !!off && !/wk-free/.test(String(off.innerHTML)),
     off && String(off.innerHTML));
  // AND A DAY THAT REALLY IS EMPTY STILL SAYS SO. The word "normal" is the
  // wrong one for an empty space, and "free" is the right one.
  const spare = (wk.children || []).find((s, i) => i > 1 && /wk-free/.test(String(s.innerHTML)));
  ok("while a day with nothing on it is free, and not called normal",
     !!spare && !classed(spare, "wk-note").length,
     JSON.stringify((wk.children || []).map((s) => String(s.innerHTML).slice(0, 40))));
}

// ---------------------------------------------------------------------------
console.log("\nAnd none of it done with colour alone");

// ABOUT ONE MAN IN TWELVE CANNOT SEPARATE TWO HUES, and nobody at all can on a
// photocopy. Every one of the four states says what it is in words — the page
// checks above are what prove that — and each also carries a shape: a rail, a
// hatch, a tick box where a time would be.
{
  const css = fs.readFileSync(path.join(PUB, "style.css"), "utf8");
  ok("a change is marked by more than its colour",
     /\.dp-changed\s*\{[^}]*border-left/.test(css), "colour is doing all the work");
  // UNAVAILABLE HAS TO LOOK LIKE SOMETHING. A tint reads as "a slightly
  // different kind of empty"; a hatch reads as taken.
  ok("and time you keep is a texture rather than a shade",
     /\.dp-held\s*\{[^}]*background-image:\s*repeating-linear-gradient/.test(css),
     "protected time is only tinted");
  ok("and a job carries a box where a lesson carries a time",
     /\.dp-tick\s*\{/.test(css) && /class="dp-tick"/.test(fs.readFileSync(path.join(PUB, "timeline.js"), "utf8")),
     "a job and an appointment are drawn the same");
  // AND THE COLOUR IT DOES USE IS WRITTEN DOWN ONCE. Five rules across two
  // pages read it; spelled out at each of them it is one colour until somebody
  // adjusts four of the five. This app's standing bug is the same question
  // answered in several places and then drifting.
  ok("and the colour a change is drawn in is settled in one place",
     (css.match(/#a8643c/g) || []).length === 1 &&
       (css.match(/var\(--changed\)/g) || []).length >= 3,
     JSON.stringify({ literal: (css.match(/#a8643c/g) || []).length,
       uses: (css.match(/var\(--changed\)/g) || []).length }));
  // AND NO DARK VARIANT WHILE THERE IS NO DARK PAGE. The surfaces are the same
  // cream whatever the browser prefers, so a paler value behind that query is
  // not read on a dark background — it is read on this one, at worse contrast.
  ok("and nothing is given a night colour the app has no night for",
     !/prefers-color-scheme: dark\s*\)\s*\{[\s\S]{0,300}--changed/.test(css),
     "a colour was given a dark value while the page stays light");
}

// ---------------------------------------------------------------------------
console.log("\nAnd the Day screen, in the order a day is asked about");

// A DAY HAS TO ANSWER THREE QUESTIONS BEFORE ANY WORK IS PLACED INTO IT, and
// they are asked in this order because that is the order a person asks them:
//
//   1. What is unusual about today?
//   2. What do I actually have to attend, in time order?
//   3. What time is genuinely usable?
//
// The third is the one a busy/free binary cannot answer — see hoursOn. Nothing
// here places any work; this is the day, not the plan.
{
  const { open, deep } = await import("./_dom.mjs");
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const TODAY = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const DOW = now.getDay();
  const DAY = [
    { id: "eng", label: "English", start: "08:40", end: "09:25", days: [DOW], kind: "teaching", where: "111" },
    { id: "lun", label: "Lunch", start: "12:30", end: "13:15", days: [DOW], kind: "break", protected: true },
    { id: "p5", label: "P5 English", start: "14:10", end: "15:00", days: [DOW], kind: "teaching" },
    // a one-off, which IS unusual about today
    { id: "obs", label: "Lesson observation", date: TODAY, start: "10:30", end: "11:05", days: [], where: "B204" },
    // and two the calendar dated and never timed
    // One you go to, and one that merely matters to the day — see mustBeThere.
    { id: "pm", label: "Parents' Meeting", date: TODAY, start: "00:00", end: "23:59", days: [], beThere: true },
    { id: "rd", label: "Report Distribution", date: TODAY, start: "00:00", end: "23:59", days: [], beThere: false },
  ];
  const r = await open("timeline.html", { schedule: DAY, items: [], goals: [],
    scheduleConfig: { dayStart: "07:30", dayEnd: "17:30" } });
  ok("the day opens", r.errs.length === 0, r.errs.join("; "));
  const day = r.get("#timeline");
  const has = (cls) => deep(day).filter((c) => String(c.className).split(/\s+/).includes(cls));
  const said = deep(day).map((c) => `${c.textContent || ""} ${c.innerHTML || ""}`).join(" ");

  // 1. WHAT IS UNUSUAL.
  ok("what is unusual about today is said first",
     has("dp-diff").length === 1 && /Lesson observation/.test(has("dp-diff")[0].innerHTML +
       deep(has("dp-diff")[0]).map((c) => c.textContent).join(" ")),
     JSON.stringify(deep(day).map((c) => c.className).filter(Boolean).slice(0, 8)));

  // 2. WHAT HAS NO HOUR ON IT — which is a question, not news, and is the one
  // thing nothing else on the day can be planned around.
  const nt = has("dp-notime")[0];
  const inside = (el) => String((el && el.innerHTML) || "") + " " +
    deep(el || {}).map((c) => `${c.innerHTML || ""} ${c.textContent || ""}`).join(" ");
  ok("and what has a date but no hour is asked about, not dropped",
     !!nt && /Parents.{0,6}Meeting/.test(inside(nt)), inside(nt).slice(0, 200));
  ok("  and there is somewhere to say when it is",
     !!nt && deep(nt).some((c) => c.type === "time"),
     JSON.stringify(deep(nt || {}).map((c) => c.tagName + ":" + c.type)));
  // AND "IN MY WEEK" IS NOT "BE THERE". A report-distribution date matters to
  // the day without there being a room to be in, and asking for a time on it is
  // asking a question with no answer, every day, until somebody invents one to
  // make it stop. Parents' Meeting is marked as somewhere you go; the other is
  // not, and they are named apart.
  ok("  and only the one you attend is said to need a time",
     /Needs a time/.test(inside(nt)) && /Also on today/.test(inside(nt)),
     inside(nt).slice(0, 320));
  ok("  with a way to say you don't attend it, since the importer used to assume you did",
     deep(nt || {}).some((c) => /don.t attend/.test(String(c.textContent || ""))),
     JSON.stringify(deep(nt || {}).map((c) => c.textContent).filter(Boolean).slice(0, 8)));
  // AND NOT TWICE. It is a difference and it is a question; the question says
  // more and can be answered, so it is asked once.
  ok("  and it is not also listed as a difference",
     !/Parents.{0,6}Meeting/.test(inside(has("dp-diff")[0])),
     inside(has("dp-diff")[0]).slice(0, 200));
  // NOR DRAWN AS MIDNIGHT. Sorted by its start it lands at the top of the
  // morning, reading like the first thing that happens.
  ok("  and nothing on the day is drawn as starting at midnight",
     !/12:00 AM/.test(said), (said.match(/.{30}12:00 AM.{20}/) || [""])[0]);
  // NOR AT THE TOP OF THE MORNING. Sorted by its start — which is midnight — an
  // untimed event is the first thing in a list that runs by the clock, reading
  // like the first thing that happens.
  const first = has("dp-block")[0];
  ok("  nor first in a list that runs by the clock",
     !!first && /English/.test(String(first.innerHTML)),
     String(first && first.innerHTML).slice(0, 120));

  // 3. WHAT IS GENUINELY USABLE. Not what is empty: lunch is empty of
  // appointments and none of it is time the app may have.
  const use = has("dp-usable")[0];
  ok("and the usable time is said as stretches you could actually work in",
     !!use && /7:30 AM–8:40 AM/.test(inside(use)), inside(use).slice(0, 220));
  ok("  with protected time counted apart from it, never added in",
     !!use && /kept/.test(inside(use)), inside(use).slice(0, 220));
  // THE LUNCH IS NOT IN IT. This is the whole of the distinction: 12:30 to 1:15
  // is empty of appointments and is not available.
  ok("  and the hour you keep is not offered as time to work in",
     !!use && !/12:30 PM–1:15 PM/.test(inside(use)), inside(use).slice(0, 260));
  // NOTHING SCHEDULED IS NOT FREE. The stretches between the lessons are
  // stretches the timetable says nothing about — a break you are supervising, a
  // free period, lunch — and "you have 3h 20m to work" is a promise the app
  // cannot keep when what it knows is "you do not teach a lesson then".
  ok("  and time the timetable says nothing about is listed, not counted",
     !!use && /says nothing about/.test(inside(use)) && /not said/.test(inside(use)),
     inside(use).slice(0, 400));
  ok("  with a way to say what those stretches are, once",
     !!use && /Say what they are, once/.test(inside(use)), inside(use).slice(0, 400));

  // AND A STRETCH THAT HAS BEEN ACCOUNTED FOR IS COUNTED. Said once on the
  // week, every day of it inherits the answer.
  const told = await open("timeline.html", {
    schedule: DAY.concat([{ id: "prep", label: "Prep time", start: "09:25", end: "10:30",
      days: [DOW], kind: "other", workable: true }]),
    items: [], goals: [], scheduleConfig: { dayStart: "07:30", dayEnd: "17:30" } });
  const toldUse = deep(told.get("#timeline"))
    .filter((c) => String(c.className).split(/\s+/).includes("dp-usable"))[0];
  ok("and a stretch you have said is yours to work in is counted",
     !!toldUse && /9:25 AM–10:30 AM/.test(inside(toldUse)) && /1h 5m in 1 stretch/.test(inside(toldUse)),
     inside(toldUse).slice(0, 300));
  // AND IT IS NOT BUSY EITHER. It is a block only so that it can be said at all.
  // Counted in minutes: busyOn merges spans that touch, so this stretch sitting
  // against the lesson before it would pass a check about where a span starts
  // whether or not it had been made busy.
  const mins = (list) => S.busyOn(list, TODAY).reduce((n, x) => n + (x.end - x.start), 0);
  ok("  and saying so does not make it a commitment",
     mins(DAY.concat([{ id: "prep", label: "Prep time", start: "09:25", end: "10:30",
       days: [DOW], kind: "other", workable: true }])) === mins(DAY),
     `${mins(DAY.concat([{ id: "prep", label: "Prep time", start: "09:25", end: "10:30",
       days: [DOW], kind: "other", workable: true }]))} vs ${mins(DAY)}`);
}

// ---------------------------------------------------------------------------
console.log("\nAnd saying what the rest of the week is, once");

// THE ADMIN BURDEN THIS APP EXISTS TO REMOVE. The stretches between the lessons
// are properties of the WEEK — the same twenty minutes every Wednesday — so
// classifying them must not mean creating dozens of one-off blocks. One press
// per stretch, however many days it falls on, and every week inherits it.
{
  const { open, deep, clickable } = await import("./_dom.mjs");
  const WEEK2 = [
    { id: "a", label: "English", start: "08:40", end: "09:25", days: [1, 2, 3, 4, 5], kind: "teaching" },
    { id: "b", label: "Science", start: "10:30", end: "11:05", days: [3], kind: "teaching" },
  ];
  const r = await open("timeline.html", { schedule: WEEK2, items: [], goals: [],
    scheduleConfig: { dayStart: "07:30", dayEnd: "17:30", leaveAt: "15:50" } });
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  const panel = r.get("#weekGaps");
  const said = deep(panel).map((c) => `${c.textContent || ""} ${c.innerHTML || ""}`).join(" ");
  ok("the week says which stretches it has been told nothing about",
     /unaccounted for/.test(said + String(panel.innerHTML)), said.slice(0, 200));
  // ONE QUESTION, NOT FIVE. The morning gap falls on every day of the week.
  ok("  with a stretch on five days asked about once",
     /Mon, Tue, Wed, Thu, Fri/.test(said), said.slice(0, 400));
  ok("  and three ways to answer it, none of them the default",
     ["on duty", "mine to work in", "kept"].every((w) =>
       clickable(r).some((c) => String(c.textContent) === w)),
     JSON.stringify(clickable(r).map((c) => c.textContent).filter(Boolean).slice(0, 14)));

  // ANSWERING ONE WRITES ONE REPEATING BLOCK, not five dated ones.
  const before = (r.state.schedule || []).length;
  const mine = clickable(r).find((c) => String(c.textContent) === "mine to work in");
  mine.click();
  await r.settle();
  const made = (r.state.schedule || []).filter((b) => b.workable);
  ok("answering one writes a single repeating block",
     (r.state.schedule || []).length === before + 1 && made.length === 1,
     JSON.stringify((r.state.schedule || []).map((b) => `${b.label}:${b.days}`)));
  ok("  covering every day the stretch falls on",
     made[0] && made[0].days.length === 5, JSON.stringify(made[0] && made[0].days));
  ok("  and it is time you may work in, not a commitment",
     made[0] && made[0].workable === true && made[0].protected === false,
     JSON.stringify(made[0] && { workable: made[0].workable, protected: made[0].protected }));

  // AND THE BOUNDARY IS ASKED FOR IN THE SAME PLACE, because it is the other
  // half of the same question — and it is not a block.
  const bound = deep(panel).find((c) => String(c.className).includes("su-leaveat"));
  ok("and the time you leave is asked for as a time, not as an event",
     !!bound && /type="time"/.test(String(bound.innerHTML)) &&
       !!(bound.querySelector(".su-leave")._on || {}).change,
     String(bound && bound.innerHTML).slice(0, 160));
  // AND ANSWERING IT CHANGES THE DAY RATHER THAN ADDING SOMETHING TO IT.
  const at = bound.querySelector(".su-leave");
  at.value = "15:50";
  at.fire("change", { target: at });
  await r.settle();
  ok("  and saying it puts no block on the day at ten to four",
     !(r.state.schedule || []).some((b) => b.start === "15:50"),
     JSON.stringify((r.state.schedule || []).map((b) => `${b.start} ${b.label}`)));
  ok("  it is kept as the edge of the working day",
     (r.state.scheduleConfig || {}).leaveAt === "15:50",
     JSON.stringify((r.state.scheduleConfig || {}).leaveAt));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the answers that were saved under the old meaning");

// A MIGRATION YOU CAN READ. Two of the answers this app stores meant something
// else when they were written, and both cost in the same direction — a
// fortnight or a day quietly taken off the calendar. Repairing that silently is
// indistinguishable from a bug, so it has to arrive as a list with a button on
// each row, and this is the test that it arrives at all.
{
  const { open, deep, clickable } = await import("./_dom.mjs");
  const day = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const run = (label, from, n, f) => Array.from({ length: n }, (_, i) => ({
    id: `${label}-${i}`, label, date: day(from, i), start: "00:00", end: "23:59",
    days: [], ...f }));
  const OLD = [].concat(
    run("Spring Break", "2027-04-05", 12, { blocksDay: true, source: "paste" }),
    run("Staff Development", "2026-11-20", 1, { noLessons: true, source: "paste" }),
    // AND ONE OF YOUR OWN, which no document ever read and which must not be
    // put on the list.
    run("Away — hospital", "2026-12-08", 1, { blocksDay: true, source: "hand" }));

  const r = await open("timeline.html", { schedule: OLD, items: [], goals: [],
    scheduleConfig: { dayStart: "07:30", dayEnd: "17:30" } });
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  const panel = r.get("#oldMeanings");
  const said = (c) => `${c.textContent || ""} ${c.innerHTML || ""}`;
  // THE QUESTIONS AND THE ACCOUNTING ARE READ SEPARATELY, because they are
  // different things: one is what is still open, the other is every day rule in
  // the file including the ones nobody needs to do anything about.
  const partOf = (cls) => {
    const box = deep(panel).find((c) => String(c.className || "").split(/\s+/).includes(cls));
    return box ? deep(box).map(said).join(" ") + String(box.innerHTML || "") : "";
  };
  const asking = () => deep(panel)
    .filter((c) => String(c.className || "").split(/\s+/).includes("su-moved"))
    .map((c) => deep(c).map(said).join(" ") + String(c.innerHTML || "")).join(" ");
  const audit = () => partOf("su-audit");
  ok("the setup screen says which saved answers no longer mean what they did",
     /said you were away/.test(asking()) && /the timetable stops/.test(asking()),
     asking().slice(0, 240));
  ok("  naming the days, as a range rather than twelve rows",
     /Spring Break/.test(asking()) && !/Spring Break[\s\S]*Spring Break/.test(asking()),
     asking().slice(0, 400));
  ok("  and not asking about the time you booked off yourself",
     !/hospital/.test(asking()), asking().slice(0, 400));
  // THOUGH THE ACCOUNTING SHOWS IT, because "what happened to the other four"
  // is a question a list of only the open ones cannot answer.
  ok("  while the accounting underneath shows every day rule, yours included",
     /hospital/.test(audit()) && /Spring Break/.test(audit()) &&
       /Staff Development/.test(audit()),
     audit().slice(0, 400));
  ok("  saying where each one stands",
     /needs an answer/.test(audit()) && /yours/.test(audit()),
     audit().slice(0, 500));
  // AND THE QUESTIONS ARE WRITTEN DOWN THE MOMENT THE FILE IS OPENED, before
  // anybody presses anything. Left until the first answer, somebody who opens
  // the app, reads the list and imports next term's calendar instead comes back
  // to a longer list — which is the failure this whole mechanism is for.
  const stamped = r.state.scheduleMeaning;
  ok("  and the file records the questions it is owed without being touched",
     !!stamped && stamped.wrote === 1 && stamped.ask.length === 13 &&
       (stamped.done || []).length === 0,
     JSON.stringify(stamped));
  // BOTH ANSWERS OFFERED, neither of them taken for you.
  const saying = (w) => clickable(r).find((c) => String(c.textContent) === w);
  ok("  with both readings offered and neither one already applied",
     !!saying("no timetable — the day is still yours") && !!saying("I really was away") &&
       (r.state.schedule || []).filter((b) => b.blocksDay).length === 13,
     JSON.stringify(clickable(r).map((c) => c.textContent).filter(Boolean).slice(0, 10)));

  // ONE PRESS, TWELVE DAYS. The holiday becomes a fortnight of time again.
  saying("no timetable — the day is still yours").click();
  await r.settle();
  const spring = (r.state.schedule || []).filter((b) => /Spring/.test(b.label));
  ok("answering the holiday gives all twelve days back in one press",
     spring.length === 12 && spring.every((b) => !b.blocksDay && b.noLessons),
     JSON.stringify(spring.map((b) => `${b.blocksDay}/${b.noLessons}`).slice(0, 4)));
  ok("  and it is your answer now, so it is never asked about again",
     !/Spring Break/.test(asking()) && spring.every((b) => b.source === "hand"),
     asking().slice(0, 240));
  // AND IT IS STILL ACCOUNTED FOR, as yours rather than as a question.
  ok("  though the accounting still lists it, now as yours",
     /Spring Break/.test(audit()), audit().slice(0, 400));
  // AND THE OTHER GROUP IS STILL THERE, because it is a different question.
  ok("  while the development day is still asked about separately",
     /Staff Development/.test(asking()), asking().slice(0, 240));

  // AND THE DEVELOPMENT DAY BECOMES A THING ON A NORMAL DAY — with no hour on
  // it, which is a thing to be given one rather than a day-long appointment.
  saying("something extra on a normal day").click();
  await r.settle();
  const pd = (r.state.schedule || []).find((b) => /Staff Development/.test(b.label));
  ok("answering the development day leaves it on top of a normal day",
     !!pd && !pd.blocksDay && !pd.noLessons && pd.timing === "sometime",
     JSON.stringify(pd && { blocksDay: pd.blocksDay, noLessons: pd.noLessons, timing: pd.timing }));
  ok("  and with nothing left to answer the questions go away",
     !asking().trim(), asking().slice(0, 160));
  ok("  leaving the accounting, with nothing on it still asking",
     /Spring Break/.test(audit()) && /Staff Development/.test(audit()) &&
       !/needs an answer/.test(audit()),
     audit().slice(0, 400));

  // AND IT STAYS GONE. The file now says which meaning it was written under, so
  // a calendar imported tomorrow — document-sourced, no timetable, exactly the
  // shape the old test looked for — is not put back on the list.
  const before = r.state.scheduleMeaning;
  r.state.schedule = (r.state.schedule || []).concat(
    run("Spring Festival", "2027-02-15", 7, { noLessons: true, source: "paste" }));
  const again = await open("timeline.html", { ...r.state });
  again.get("#setupToggle").fire("click", { target: again.get("#setupToggle") });
  await again.settle();
  const back = deep(again.get("#oldMeanings"))
    .filter((c) => String(c.className || "").split(/\s+/).includes("su-moved"))
    .map(said).join(" ");
  ok("a calendar imported afterwards is not put back on the list",
     !back.trim() && !!before && before.wrote >= 1,
     JSON.stringify({ asking: back.slice(0, 120), wrote: before && before.wrote }));

  // AND THE ANSWER CAN BE CHANGED AFTERWARDS, from the accounting.
  //
  // Answering used to be a one-way door — six presses, the questions gone, no
  // way back — so a press that landed on the wrong row of a list re-flowing
  // under the cursor was permanent and silent. Every row now carries all three
  // answers, with the current one showing, for as long as the row exists.
  // The row's own words are written as innerHTML, which this harness keeps as
  // text rather than parsing into elements — see tests/_dom.mjs. Its buttons
  // are real children, because they carry handlers.
  const auditRows = (r) => deep(r.get("#oldMeanings"))
    .filter((c) => String(c.className || "").split(/\s+/).includes("su-auditrow"));
  const rowFor = (name) => auditRows(again)
    .find((c) => new RegExp(name).test(String(c.innerHTML || "")));
  const springRow = rowFor("Spring Break");
  const chip = (row, word) => deep(row).find((c) =>
    String(c.tagName) === "BUTTON" && String(c.textContent) === word);
  ok("every row in the accounting offers all three answers",
     !!springRow && ["I'm away", "no timetable — the day is still yours",
       "something on an ordinary day"].every((w) => !!chip(springRow, w)),
     JSON.stringify(deep(springRow || { }).filter((c) => String(c.tagName) === "BUTTON")
       .map((c) => c.textContent)));
  ok("  with the one it is now already showing as chosen",
     !!chip(springRow, "no timetable — the day is still yours") &&
       String(chip(springRow, "no timetable — the day is still yours").className).includes("on") &&
       !String(chip(springRow, "I'm away").className).includes("on"),
     JSON.stringify([chip(springRow, "no timetable — the day is still yours").className,
       chip(springRow, "I'm away").className]));

  // AND PRESSING ANOTHER ONE CHANGES THE WHOLE GROUP BACK.
  chip(springRow, "I'm away").click();
  await again.settle();
  const back2 = (again.state.schedule || []).filter((x) => /Spring Break/.test(x.label));
  ok("changing your mind changes every day of it, in one press",
     back2.length === 12 && back2.every((x) => x.blocksDay && !x.noLessons),
     JSON.stringify(back2.map((x) => `${x.blocksDay}/${x.noLessons}`).slice(0, 3)));
  ok("  and it is still on the list, so it can be changed again",
     !!rowFor("Spring Break"),
     "the row left the accounting the moment it was changed");
}

finish();
