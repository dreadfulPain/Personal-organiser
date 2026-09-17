import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A TIMETABLE IS A GRID, AND HALF OF IT WAS GOING MISSING.
//
// A real page — five days across, eight periods down, eighteen of the forty
// cells occupied — came back as eight blocks: one per period row, each one the
// first thing in it. Nothing looked broken. The times were right, the days were
// right, and a week with eighteen lessons in it read as a week with eight.
//
// It was two faults, and neither was the grid reader:
//
//   A CELL TOO LONG FOR ITS COLUMN IS DRAWN ON TWO LINES. The second line has
//   no time in it, so it arrived as a row with no period and was thrown out
//   with the headings and the page numbers. Every long subject came through cut
//   off at its first line — "Science &", "Writing – Odd /" — and on a page
//   where most cells are long that reads exactly like a reader that found one
//   thing per row and stopped.
//
//   AND A RUN IS NOT A CELL. Each positioned run of text was placed in a column
//   on its own, so a cell that spilled past its column edge was read as the
//   NEXT day's lesson, and that day's actual lesson was glued onto the end of
//   it. One wide cell, two cells lost.
//
// AND THE FORTNIGHT, WHICH THE DOCUMENT SAID AND THE APP DISCARDED. One slot
// carries Writing in odd weeks and Show & Tell in even ones. Read as a single
// lesson, that is its name — and half of every fortnight you are in the wrong
// room with the wrong books. A calendar that says "even week Tuesday schedule"
// is saying two things, and reduced to "Tuesday's timetable" it picks the wrong
// one of two lessons on the one day you most needed it to be right.

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
["dates.js", "schedule.js", "dayshape.js", "calplan.js", "timetable.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb, { filename: f }));
const T = sb.OrganiserTimetable, S = sb.OrganiserSchedule, D = sb.OrganiserDayShape;

// ---------------------------------------------------------------------------
// THE PAGE, AS A PDF ACTUALLY LAYS ONE OUT.
//
// Not a tidy table of strings — that shape was already read correctly and is
// not the one that failed. A glyph-positioned document hands over one run per
// word with an x for each, cells are left-aligned at their column, and a cell
// too long for its column WRAPS onto the next line at the same x rather than
// overprinting its neighbour. Every fault above lives in that shape and in no
// other, so the fixture has to be in it.
//
// The subjects are a primary timetable's: this is the shape of the document
// that failed, and the point is that the count comes out at eighteen.
const COL = { time: 60, 1: 170, 2: 265, 3: 360, 4: 455, 5: 550 };
const WIDE = 90;   // how much room a column has before its text wraps
const CW = 5.5;    // characters are about this wide at 11pt

const PAGE = [
  ["08:40-09:25", { 1: "English", 3: "English" }],
  ["09:35-10:15", { 2: "English", 4: "Story Telling", 5: "Science & Social Studies" }],
  ["10:30-11:05", { 2: "Writing - Odd / Show & Tell - Even", 3: "Science & Social Studies" }],
  ["12:15-12:35", { 1: "Activity", 4: "Reading", 5: "Personal Growth" }],
  ["12:45-13:20", { 4: "English" }],
  ["13:30-14:10", { 5: "English" }],
  ["14:25-15:00", { 2: "Science & Social Studies", 3: "Personal Growth" }],
  ["15:10-15:50", { 1: "Homework", 2: "Homework", 3: "Homework", 4: "Homework" }],
];
const OCCUPIED = PAGE.reduce((n, [, cells]) => n + Object.keys(cells).length, 0);

function wrapped(x, text) {
  const lines = [[]];
  let at = x;
  text.split(" ").forEach((w) => {
    const width = (w.length + 1) * CW;
    if (at + width > x + WIDE && lines[lines.length - 1].length) { lines.push([]); at = x; }
    lines[lines.length - 1].push({ x: at, text: w });
    at += width;
  });
  return lines;
}
function asPdfRows(grid) {
  const rows = [{ y: 700, cells: [
    { x: COL.time, text: "Period" }, { x: COL[1], text: "Monday" }, { x: COL[2], text: "Tuesday" },
    { x: COL[3], text: "Wednesday" }, { x: COL[4], text: "Thursday" }, { x: COL[5], text: "Friday" }] }];
  let y = 660;
  grid.forEach(([time, cells]) => {
    const lines = {};
    let deep = 1;
    [1, 2, 3, 4, 5].forEach((d) => {
      if (!cells[d]) return;
      lines[d] = wrapped(COL[d], cells[d]);
      deep = Math.max(deep, lines[d].length);
    });
    for (let i = 0; i < deep; i++) {
      const c = i === 0 ? [{ x: COL.time, text: time }] : [];
      [1, 2, 3, 4, 5].forEach((d) => { if (lines[d] && lines[d][i]) c.push(...lines[d][i]); });
      rows.push({ y, cells: c });
      y -= 14;
    }
    y -= 12;
  });
  return rows;
}

const ROWS = asPdfRows(PAGE);
const GOT = T.fromRows(ROWS, {});
const at = (time, day) => GOT.blocks
  .filter((b) => `${b.start}-${b.end}` === time && b.days.join() === String(day))
  .map((b) => b.label + (b.parity ? ` (${b.parity})` : ""));

// ---------------------------------------------------------------------------
console.log("\nEvery cell of the grid, not the first one in each row");

ok("the page has eighteen cells with something in them", OCCUPIED === 18, String(OCCUPIED));
// NINETEEN, NOT EIGHTEEN: the slot that takes turns is two lessons.
ok("and nineteen things come back out of it", GOT.blocks.length === 19,
   `${GOT.blocks.length}: ` + GOT.blocks.map((b) => `${b.start} ${b.label}`).join(" | "));
ok("across all five days", GOT.days.length === 5, JSON.stringify(GOT.days));

// A ROW WITH MORE THAN ONE THING IN IT. This is the whole complaint: the reader
// found Monday's English and stopped, and Wednesday's was simply not there.
ok("a period row with two lessons in it gives up both",
   at("08:40-09:25", 1).join() === "English" && at("08:40-09:25", 3).join() === "English",
   JSON.stringify({ mon: at("08:40-09:25", 1), wed: at("08:40-09:25", 3) }));
ok("  and one with three gives up all three",
   at("09:35-10:15", 2).join() === "English" &&
     at("09:35-10:15", 4).join() === "Story Telling" &&
     at("09:35-10:15", 5).join() === "Science & Social Studies",
   JSON.stringify([at("09:35-10:15", 2), at("09:35-10:15", 4), at("09:35-10:15", 5)]));

// THE TRUNCATION. A subject too long for its column was coming back as its
// first line — and "Science &" is not a lesson, it is the top half of one.
ok("a subject too long for its column is not cut off at the fold",
   at("14:25-15:00", 2).join() === "Science & Social Studies",
   JSON.stringify(at("14:25-15:00", 2)));
ok("  and nothing at all comes back ending in a dangling word",
   !GOT.blocks.some((b) => /[&/+,-]$/.test(b.label.trim())),
   JSON.stringify(GOT.blocks.map((b) => b.label).filter((l) => /[&/+,-]$/.test(l.trim()))));
// AND THE CELL NEXT DOOR SURVIVES IT. The half that spilled was being read as
// Wednesday's lesson with Wednesday's own lesson stuck on the end.
ok("and the day beside a long cell keeps its own lesson",
   at("10:30-11:05", 3).join() === "Science & Social Studies",
   JSON.stringify(at("10:30-11:05", 3)));

// AND THE OTHER WAY A WIDE CELL GETS AWAY. Not every long cell wraps: plenty
// of pages let one run straight on past its column and over the empty space
// where the next day would be. Placed run by run, the tail of it was read as
// THAT day's lesson — a Tuesday lesson invented out of the back half of
// Monday's, on a day that is actually free.
{
  const spill = [
    { y: 700, cells: [{ x: COL.time, text: "Period" }, { x: COL[1], text: "Monday" },
      { x: COL[2], text: "Tuesday" }, { x: COL[3], text: "Wednesday" }] },
    // Monday's cell runs on for 300 points, straight through Tuesday's column
    // and into Wednesday's — words at their own widths and a single space
    // between them, which is what "one cell, drawn long" actually looks like.
    // Tuesday and Wednesday have nothing of their own on this row.
    { y: 660, cells: [{ x: COL.time, text: "09:00-09:50" }].concat((() => {
      let at = COL[1];
      return "Science & Social Studies with the Primary Section".split(" ").map((w) => {
        const run = { x: at, text: w };
        at += (w.length + 1) * CW;
        return run;
      });
    })()) },
    { y: 630, cells: [{ x: COL.time, text: "10:00-10:50" }, { x: COL[2], text: "English" }] },
  ];
  const got = T.fromRows(spill, {});
  const on = (d) => got.blocks.filter((b) => b.days.join() === String(d)).map((b) => b.label);
  ok("a cell that runs straight past its column is still one cell",
     on(1).join() === "Science & Social Studies with the Primary Section",
     JSON.stringify(on(1)));
  ok("  and the day it ran across does not gain a lesson from it",
     on(2).join() === "English", JSON.stringify(on(2)));
  ok("  nor the one after that", on(3).length === 0, JSON.stringify(on(3)));
}

// AND PLENTY OF PDFS HAND BACK WHOLE CELLS, NOT WORDS. There is nothing to join
// on a page like that — every run already is a cell — and a reader that goes
// looking for where the words end will glue two real cells together instead.
// So it looks first at whether anything on the page sits close to anything
// else, and on a page of whole cells it leaves well alone.
{
  const whole = [
    { y: 700, cells: [{ x: 40, text: "Time" }, { x: 130, text: "Monday" },
      { x: 220, text: "Tuesday" }, { x: 310, text: "Wednesday" }] },
    { y: 670, cells: [{ x: 40, text: "09:00-09:50" }, { x: 130, text: "Grade 9 English" },
      { x: 220, text: "Grade 11 Literature" }, { x: 310, text: "Grade 8 English" }] },
  ];
  const got = T.fromRows(whole, {});
  ok("a page drawn cell by cell is left exactly as it is",
     got.blocks.map((b) => `${b.days[0]}:${b.label}`).join(" | ") ===
       "1:Grade 9 English | 2:Grade 11 Literature | 3:Grade 8 English",
     JSON.stringify(got.blocks.map((b) => `${b.days[0]}:${b.label}`)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a slot that takes turns is two lessons, not one long name");

ok("the fortnight slot comes back as two",
   at("10:30-11:05", 2).length === 2, JSON.stringify(at("10:30-11:05", 2)));
ok("  named without the week word in the name",
   at("10:30-11:05", 2).join(" | ") === "Writing (odd) | Show & Tell (even)",
   JSON.stringify(at("10:30-11:05", 2)));

// AND A SLASH IS USUALLY JUST A SLASH. Splitting every cell with one in it
// would invent a fortnight in half the timetables in the world.
ok("a lesson with a slash in its name is one lesson", T.takingTurns("PE / Games") === null,
   JSON.stringify(T.takingTurns("PE / Games")));
ok("  and so is one where only half of it names a week",
   T.takingTurns("Writing - Odd / Show & Tell") === null,
   JSON.stringify(T.takingTurns("Writing - Odd / Show & Tell")));
ok("  and so is one where both halves say the same week",
   T.takingTurns("Writing - Odd / Show & Tell - Odd") === null,
   JSON.stringify(T.takingTurns("Writing - Odd / Show & Tell - Odd")));
// THE WORD BEFORE THE WORD. "Even Numbers" is a lesson and "Odd Socks Day" is
// an event, and a reader that takes either for a fortnight has invented one.
ok("a lesson that merely contains the word is left alone",
   T.takingTurns("Even Numbers") === null && T.takingTurns("Odd Socks Day") === null,
   JSON.stringify([T.takingTurns("Even Numbers"), T.takingTurns("Odd Socks Day")]));
ok("  while a slot that says it runs every other week is kept",
   JSON.stringify(T.takingTurns("Assembly (odd weeks)")) ===
     JSON.stringify([{ parity: "odd", label: "Assembly" }]),
   JSON.stringify(T.takingTurns("Assembly (odd weeks)")));
ok("and it reads the week named first as happily as the week named last",
   JSON.stringify(T.takingTurns("Odd: Writing / Even: Show & Tell")) ===
     JSON.stringify([{ parity: "odd", label: "Writing" },
       { parity: "even", label: "Show & Tell" }]),
   JSON.stringify(T.takingTurns("Odd: Writing / Even: Show & Tell")));

// ---------------------------------------------------------------------------
console.log("\nAnd the fortnight survives being saved");

// A block that only runs every other week is no use unless the thing that says
// what is on today knows about it.
const WEEK = [
  { id: "eng", label: "P1 English", start: "09:00", end: "09:50", days: [2], kind: "teaching" },
  { id: "wri", label: "Writing", start: "10:30", end: "11:05", days: [2], parity: "odd" },
  { id: "sho", label: "Show & Tell", start: "10:30", end: "11:05", days: [2], parity: "even" },
];
ok("a block remembers which half of the fortnight it runs in",
   S.normaliseBlock(WEEK[1]).parity === "odd", JSON.stringify(S.normaliseBlock(WEEK[1]).parity));
ok("  and a word that is not one of the two halves is no answer at all",
   S.normaliseBlock({ ...WEEK[1], parity: "sometimes" }).parity === "", "nonsense got through");
// EVERY BLOCK WRITTEN BEFORE THIS EXISTED IS STILL A BLOCK.
ok("  and a block saved before there were fortnights runs every week",
   S.normaliseBlock(WEEK[0]).parity === "", JSON.stringify(S.normaliseBlock(WEEK[0]).parity));

// UNKNOWN IS NOT "NEITHER". Until somebody says which week is which, showing
// half the timetable would be worse than showing both and saying so.
{
  const tue = "2026-09-15";
  ok("with nobody having said which week is which, both halves are on",
     S.blocksOn(WEEK, tue).map((b) => b.label).join(" | ") === "P1 English | Writing | Show & Tell",
     JSON.stringify(S.blocksOn(WEEK, tue).map((b) => b.label)));
  ok("  and the app says plainly that it doesn't know",
     S.parityOn(WEEK, tue) === "", JSON.stringify(S.parityOn(WEEK, tue)));
}

// ONE DATE, MARKED, AND EVERY OTHER WEEK COUNTS FROM IT. Nobody agrees where a
// fortnight starts, so the app never decides — it is told once.
{
  const anchored = WEEK.concat([{ id: "w1", label: "Week 1", start: "00:00", end: "00:01",
    date: "2026-09-14", weekOne: true }]);
  ok("a date marked as an odd week makes that week odd",
     S.parityOn(anchored, "2026-09-15") === "odd", S.parityOn(anchored, "2026-09-15"));
  ok("  the week after it even", S.parityOn(anchored, "2026-09-22") === "even",
     S.parityOn(anchored, "2026-09-22"));
  ok("  and the week after that odd again", S.parityOn(anchored, "2026-09-29") === "odd",
     S.parityOn(anchored, "2026-09-29"));
  // AND BACKWARDS TOO. Term started before the date somebody happened to mark.
  ok("  and it counts backwards as well as forwards",
     S.parityOn(anchored, "2026-09-08") === "even" && S.parityOn(anchored, "2026-09-01") === "odd",
     JSON.stringify([S.parityOn(anchored, "2026-09-08"), S.parityOn(anchored, "2026-09-01")]));

  ok("an odd Tuesday has Writing on it and not Show & Tell",
     S.blocksOn(anchored, "2026-09-15").map((b) => b.label).join(" | ") === "P1 English | Writing",
     JSON.stringify(S.blocksOn(anchored, "2026-09-15").map((b) => b.label)));
  ok("  and an even Tuesday has Show & Tell and not Writing",
     S.blocksOn(anchored, "2026-09-22").map((b) => b.label).join(" | ") === "P1 English | Show & Tell",
     JSON.stringify(S.blocksOn(anchored, "2026-09-22").map((b) => b.label)));

  // AND THE OTHER HALF IS NOT A LESSON THAT WENT MISSING. "No Writing" said
  // every other Tuesday is the loudest line on the page and never once news.
  ok("and the half that isn't on this week is not reported as lost",
     D.differsOn(anchored, "2026-09-22", {}).length === 0,
     JSON.stringify(D.differsOn(anchored, "2026-09-22", {}).map((x) => x.words)));
}

// "EVEN WEEK TUESDAY SCHEDULE" IS TWO FACTS, NOT ONE.
//
// Which day's lessons are on, and which half of the fortnight to take them
// from. Reduced to "Tuesday's timetable" it puts you in the room for the wrong
// one of two lessons, on the one day you had no memory to fall back on.
{
  const made = WEEK.concat([
    { id: "w1", label: "Week 1", start: "00:00", end: "00:01", date: "2026-09-14", weekOne: true },
    // A Saturday running an EVEN-week Tuesday, in what is otherwise an odd week.
    { id: "mk", label: "Make-up day", start: "00:00", end: "00:01",
      date: "2026-09-19", runsAs: 2, parity: "even" },
  ]);
  ok("the count would have made that Saturday an odd week",
     S.parityOn(WEEK.concat([{ id: "w1", label: "Week 1", start: "00:00", end: "00:01",
       date: "2026-09-14", weekOne: true }]), "2026-09-19") === "odd", "the anchor moved");
  ok("but a day that says which week it runs as is believed",
     S.parityOn(made, "2026-09-19") === "even", S.parityOn(made, "2026-09-19"));
  ok("  so it carries the even-week lesson, not the odd one",
     S.blocksOn(made, "2026-09-19").map((b) => b.label).join(" | ") === "P1 English | Show & Tell",
     JSON.stringify(S.blocksOn(made, "2026-09-19").map((b) => b.label)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the twelve pages behind it are not more timetable");

// A TIMETABLE DOES NOT ARRIVE ON ITS OWN. It arrives at the front of a pack,
// and behind it are the class lists — and every row of all fourteen pages was
// being handed to the column reader as one table. So the timetable's columns
// were decided partly by pages that have no columns, and a child's name on page
// nine sat under Wednesday as far as the reader could tell.
{
  const roster = (grade, names) => {
    const rows = [
      { y: 740, cells: [{ x: 60, text: "Primary" }, { x: 130, text: "Section" },
        { x: 215, text: "Grade" }, { x: 265, text: String(grade) }] },
      { y: 710, cells: [{ x: 60, text: "No." }, { x: 140, text: "Name" },
        { x: 320, text: "Class" }, { x: 420, text: "Homework" }] },
    ];
    names.forEach((n, i) => rows.push({ y: 680 - i * 20, cells: [{ x: 60, text: String(i + 1) }]
      .concat(n.split(" ").map((w, j) => ({ x: 140 + j * 34, text: w })))
      .concat([{ x: 320, text: `${grade}A` }, { x: 420, text: "English" }]) }));
    return { page: grade + 1, text: names.join("\n"), rows };
  };
  // Invented children, as everything in this repo's fixtures is.
  const pack = {
    pages: [{ page: 1, text: "", rows: ROWS }]
      .concat([1, 2, 3].map((g) => roster(g, ["Ana Ruiz", "Bo Lindqvist", "Cai Meilin"]))),
    rows: [],
    text: "",
  };
  pack.rows = pack.pages.flatMap((p) => p.rows);
  const got = T.bestOf(pack);
  ok("a pack of a timetable and three class lists still reads as one week",
     got.days.join() === "1,2,3,4,5", JSON.stringify(got.days));
  // MERGED, so the four Homework blocks become one running on four days.
  ok("  and nothing from the class lists becomes a lesson",
     !got.blocks.some((b) => /Ruiz|Lindqvist|Meilin|Section|Class|No\./.test(b.label)),
     JSON.stringify(got.blocks.map((b) => b.label)));
  // COUNTED AS CELLS, not as rows: bestOf merges a lesson that runs at the same
  // hour on several days into one block that names all of them, which is the
  // right shape to save and the wrong thing to count.
  const cells = (label) => got.blocks
    .filter((b) => b.label === label).reduce((n, b) => n + b.days.length, 0);
  ok("  and the timetable itself is all still there",
     cells("English") === 5 && cells("Homework") === 4 &&
       got.blocks.some((b) => b.label === "Writing" && b.parity === "odd"),
     JSON.stringify(got.blocks.map((b) => `${b.label}${b.parity ? ":" + b.parity : ""}×${b.days.length}`)));

  // AND THE LAST PERIOD ON THE PAGE DOES NOT SWALLOW WHAT COMES AFTER IT.
  // Joining a wrapped cell back onto the row above is right; joining the next
  // page onto the row above is how a lesson ends up called "Homework Primary
  // Section Grade 1 No. Name Class".
  ok("and the last lesson of the day is not the rest of the document",
     got.blocks.every((b) => b.label.length <= 30),
     JSON.stringify(got.blocks.map((b) => b.label).filter((l) => l.length > 30)));

  // AND WHAT IS PRINTED UNDER THE GRID, ON THE SAME PAGE. A key, a footnote, a
  // note about the fire drill — it sits below the table with a line's clearance
  // and often starts in the margin. Joining a wrapped cell back onto the row
  // above it is right; joining the notes under the table onto the last lesson
  // of Thursday is how a lesson comes to be called "Homework Please note that".
  const footed = ROWS.concat([
    // A clear line, starting in the left margin: the table has ended.
    { y: 300, cells: [{ x: 60, text: "Key:" }] },
    { y: 286, cells: [{ x: 360, text: "SSS" }, { x: 390, text: "=" },
      { x: 405, text: "Science" }, { x: 450, text: "&" }, { x: 462, text: "Social" }] },
  ]);
  const under = T.fromRows(footed, {});
  ok("and a note printed under the grid does not join the last lesson",
     !under.blocks.some((b) => /Key|SSS|=/.test(b.label)),
     JSON.stringify(under.blocks.map((b) => b.label).filter((l) => /Key|SSS|=/.test(l))));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the week is shown as a week before it is saved");

// NINETEEN ROWS IN A LIST CANNOT BE CHECKED AGAINST A TIMETABLE.
//
// This is what the whole fault turned on: a reading that had lost eleven of its
// eighteen cells was saved, because eight right-looking rows and nineteen
// right-looking rows read exactly the same way down a list. The paper is a
// grid; the check has to be a grid.
{
  const { open, deep } = await import("./_dom.mjs");
  const r = await open("timeline.html", { schedule: [], scheduleConfig: {}, items: [], goals: [] });
  ok("the day page opens", r.errs.length === 0, r.errs.join("; "));
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  // The page, pasted in as a table — the ordinary way somebody brings one in.
  const paste = PAGE.map(([time, cells]) =>
    [time].concat([1, 2, 3, 4, 5].map((d) => cells[d] || "")).join("\t")).join("\n");
  r.get("#ttText").value = "Period\tMonday\tTuesday\tWednesday\tThursday\tFriday\n" + paste;
  r.get("#ttRead").fire("click", { target: r.get("#ttRead") });
  await r.settle();

  const all = deep(r.get("#ttReview"));
  const grid = all.filter((c) => String(c.className).split(/\s+/).includes("tt-grid-wrap"))[0];
  ok("the week it read is drawn as a week", !!grid,
     JSON.stringify(all.map((c) => c.className).filter(Boolean).slice(0, 12)));
  const said = grid ? String(grid.innerHTML) : "";
  // THE NUMBER YOU CAN CHECK WITHOUT READING A ROW.
  ok("  saying how many squares of it have something in them",
     /8 periods × 5 days, 18 squares/.test(said), said.slice(0, 260));
  ok("  with a column for every day of the week",
     ["Mon", "Tue", "Wed", "Thu", "Fri"].every((d) => said.includes(`<th>${d}</th>`)),
     said.slice(0, 300));
  // AND THE EMPTY SQUARES ARE THE POINT. A grid that only listed what it found
  // would be the flat list again with lines drawn round it.
  ok("  and empty squares where the week is free",
     (said.match(/<td><\/td>/g) || []).length === 8 * 5 - 18,
     String((said.match(/<td><\/td>/g) || []).length));
  ok("and a slot that takes turns is one square holding both",
     /Writing — odd weeks \/ Show &amp; Tell — even weeks/.test(said),
     (/<td>[^<]*Writing[^<]*<\/td>/.exec(said) || [""])[0]);
}

// ---------------------------------------------------------------------------
console.log("\nAnd a calendar that names a week is not reduced to a day");

// "EVEN WEEK TUESDAY SCHEDULE" IS TWO FACTS. The day was kept and the week was
// thrown away, and the week is the half you have no memory to fall back on: on
// a Saturday standing in for a Tuesday, the app is all you have.
ok("a line that names a week says which", T.weekIn("Even week Tuesday schedule") === "even" &&
   T.weekIn("Odd Week Wednesday schedule") === "odd",
   JSON.stringify([T.weekIn("Even week Tuesday schedule"), T.weekIn("Odd Week Wednesday schedule")]));
ok("  and a line that just says Tuesday names none",
   T.weekIn("Tuesday schedule") === "", JSON.stringify(T.weekIn("Tuesday schedule")));
// The word WEEK has to be there, or a dressing-up day becomes a fortnight.
ok("  and neither does a day that only sounds like one",
   T.weekIn("Odd Socks Day") === "" && T.weekIn("Evening concert") === "",
   JSON.stringify([T.weekIn("Odd Socks Day"), T.weekIn("Evening concert")]));

// AND IT IS ONLY ASKED OF A WEEK THAT HAS A FORTNIGHT IN IT. A control about
// odd and even weeks, on a timetable that runs the same every week, is a
// question with no meaning and one more thing to read past.
{
  const { open, deep, saying } = await import("./_dom.mjs");
  // A term grid with a repeated word on it, which is what makes a mark.
  const TERM = [
    "Wk", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "1", "9/6", "7", "8", "9", "10", "11", "12 Even week Tuesday schedule",
    "2", "13", "14", "15", "16", "17", "18", "19 Even week Tuesday schedule",
    "3", "20", "21", "22", "23", "24", "25", "26",
  ].join("\n");
  const picks = (r) => deep(r.get("#calMarks"))
    .filter((c) => String(c.className).split(/\s+/).includes("cal-mark-parity"));
  const runsAs = async (r) => {
    r.get("#calBox").open = true;
    const box = r.get("#calPaste");
    box.value = TERM;
    box.fire("input", { target: box });
    await r.settle();
    const pick = saying(r, /^runs another day$/)[0];
    if (pick) { pick.click(); await r.settle(); }
    return !!pick;
  };

  // A WEEK THAT RUNS THE SAME EVERY WEEK IS NOT ASKED ABOUT FORTNIGHTS.
  const plain = await open("timeline.html", {
    schedule: [{ id: "a", label: "P1 English", start: "09:00", end: "09:50", days: [2] }],
    scheduleConfig: {}, items: [], goals: [] });
  const asked = await runsAs(plain);
  ok("a make-up day can be set to run another day", asked, "the control was never offered");
  ok("and a timetable with no fortnight in it is not asked which week",
     picks(plain).length === 0,
     JSON.stringify(picks(plain).map((c) => c.className)));

  // AND ONE THAT DOES ALTERNATE IS ASKED — and starts on what the entry says.
  const cycle = await open("timeline.html", {
    schedule: [
      { id: "a", label: "Writing", start: "10:30", end: "11:05", days: [2], parity: "odd" },
      { id: "b", label: "Show & Tell", start: "10:30", end: "11:05", days: [2], parity: "even" }],
    scheduleConfig: {}, items: [], goals: [] });
  await runsAs(cycle);
  ok("while a fortnight timetable is asked which week these run as",
     picks(cycle).length === 1, JSON.stringify(picks(cycle).map((c) => c.className)));
  ok("  and it is started off on the one the calendar itself named",
     picks(cycle)[0] && picks(cycle)[0].value === "even",
     JSON.stringify(picks(cycle)[0] && picks(cycle)[0].value));
  ok("  with leaving it to the ordinary count still on offer",
     picks(cycle)[0] &&
       picks(cycle)[0].children.map((o) => o.value).join() === ",odd,even",
     JSON.stringify(picks(cycle)[0] && picks(cycle)[0].children.map((o) => o.value)));
}

finish();
