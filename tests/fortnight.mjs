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
const C = sb.OrganiserCalPlan;

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
console.log("\nAnd a page that has no rows on it at all");

// THE SHAPE THAT DEFEATED EVERYTHING ABOVE, and the fixtures above could not
// have found it, because they are built the way a tidy document is built.
//
// A real timetable draws every cell as four or five fragments scattered up and
// down inside its square, each in its own text object, with the period's own
// time sitting in the MIDDLE of them rather than at the top. There is no row to
// read. Lining the fragments up by height gives twenty rows per period,
// nineteen of which have no time in them, and every one of those was thrown out
// as a heading — so what was saved was eight blocks with no weekday on any of
// them and every subject cut off at its first fragment: "Science & So".
//
// Three things had to be true before any of it worked, and each is checked here
// because each one alone leaves the page unreadable.
{
  // Cells centred in their columns and drifting, as a real one does.
  const DAY_X = { 1: 222, 2: 377, 3: 521, 4: 699, 5: 874 };
  const CELL = [
    [0, { 1: ["English(G1", "\\N)", "Primary", "Section 111"],
            3: ["English(G1\\N)", "Primary", "Section 111"] }],
    [0, { 2: ["English(G1", "\\N)", "Primary", "Section 111"],
            4: ["Story Telling", "(G1\\N)", "Primary", "Section 111"],
            5: ["Science & So", "cial Studies", "(G1\\N)", "Primary", "Section 111"] }],
    // The tall one: two lessons taking turns, stacked, each followed by its own
    // department and room. This is the row that "halfway between two times"
    // gets wrong, because it is twice the height of the others.
    [0, { 2: ["Writing(E)(E)", "(G1\\N)", "Odd", "Primary", "Section 111",
                "Show &Tell", "(E)(E)(G1\\N)", "Even", "Primary", "Section 111"],
            3: ["Science & Soc", "ial Studies(G1", "\\N)", "Primary", "Section 111"] }],
    [0, { 1: ["Activity(G1", "\\N)", "Primary", "Section 111"] }],
  ];
  const scatter = [];
  // The title and the day names, each name its own text object — which is how
  // five day names became five rows and the table lost its header.
  scatter.push({ y: 52, cells: [{ x: 49, text: "Schedule" }] });
  scatter.push({ y: 146, cells: [{ x: 62, text: "Periods /" }] });
  scatter.push({ y: 170, cells: [{ x: 84, text: "Time" }] });
  [1, 2, 3, 4, 5].forEach((d) => scatter.push({ y: 158,
    cells: [{ x: DAY_X[d], text: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][d] }] }));
  const TIMES = ["08:40-09:25", "09:35-10:15", "10:30-11:05", "12:15-12:35"];
  // LAID OUT LIKE A TABLE: each row as tall as its fullest cell, a clear strip
  // between one row and the next, and the period's time centred in its row
  // rather than sitting at the top of it. All three are true of the real page
  // and each one of them is what broke a different attempt at reading it.
  const LINE = 30, STRIP = 49;
  let top = 210;
  const anchors = [];
  CELL.forEach(([, cells], i) => {
    const deep = Math.max(...Object.keys(cells).map((d) => cells[d].length));
    const at = Math.round(top + ((deep - 1) * LINE) / 2);
    anchors.push(at);
    scatter.push({ y: at - 20, cells: [{ x: 65, text: `Period ${i + 1}` }] });
    scatter.push({ y: at, cells: [{ x: 48, text: `G1(${TIMES[i]})` }] });
    Object.keys(cells).forEach((d) => cells[d].forEach((text, j) => scatter.push({
      y: top + j * LINE, cells: [{ x: DAY_X[d] - 12, text }] })));
    top += (deep - 1) * LINE + STRIP;
  });
  // BANDED BY HEIGHT FIRST, which is what the PDF reader now hands over: two
  // pieces of text at the same height are on the same line of the page, however
  // many text objects the document wrapped them in. Without that step the five
  // day names are five rows of one word and the table has no header at all —
  // which is exactly how this page used to arrive.
  const banded = [];
  const seen = new Map();
  scatter.forEach((r) => {
    const at = seen.get(r.y);
    if (at === undefined) { seen.set(r.y, banded.length); banded.push({ y: r.y, cells: r.cells.slice() }); return; }
    banded[at].cells = banded[at].cells.concat(r.cells).sort((a, b) => a.x - b.x);
  });
  const got = T.fromRows(banded, {});
  const say = (time, day) => got.blocks
    .filter((b) => `${b.start}-${b.end}` === time && b.days.indexOf(Number(day)) >= 0)
    .map((b) => (b.parity ? `(${b.parity}) ` : "") + b.label);

  ok("a page drawn in fragments is read at all", got.blocks.length > 0,
     JSON.stringify(got.blocks.map((b) => b.label)));
  // ONE: the rows are found by where the page is blank, not by nearest time.
  // Halfway between two times lands INSIDE the tall row, and its first lesson
  // is then filed under the period above it.
  ok("the tall row keeps its own lessons",
     say("10:30-11:05", 2).length === 2 && say("09:35-10:15", 2).join() === "English",
     JSON.stringify({ tall: say("10:30-11:05", 2), above: say("09:35-10:15", 2) }));
  // TWO: columns by the NEAREST day, not by the last edge before it. These
  // cells are centred and drift left of their own heading, so a left-edge rule
  // files Friday's lesson under Thursday.
  ok("a cell that drifts left of its heading stays in its own day",
     say("09:35-10:15", 5).join() === "Science & Social Studies",
     JSON.stringify({ fri: say("09:35-10:15", 5), thu: say("09:35-10:15", 4) }));
  // THREE: a subject broken across the column's edge is one word again.
  ok("and a subject broken mid-word is put back together",
     !got.blocks.some((b) => /\bSo cial\b|\bSoc ial\b|\bGro wth\b/.test(b.label)),
     JSON.stringify(got.blocks.map((b) => b.label).filter((l) => / (cial|ial|wth)/.test(l))));

  // AND THE FORTNIGHT, STACKED DOWN THE SQUARE INSTEAD OF WRITTEN ACROSS IT.
  // Split at the word alone, the second alternative begins with the first one's
  // department — "Primary Section 111 Show &Tell". The two halves are written
  // the same way, and that is enough to give each its own detail back.
  ok("a fortnight written down the square is still two lessons",
     say("10:30-11:05", 2).join(" | ") === "(odd) Writing(E)(E) | (even) Show &Tell (E)(E)",
     JSON.stringify(say("10:30-11:05", 2)));

  // AND WHAT EVERY SQUARE SAID IS NOT WHAT ANY LESSON IS CALLED. "Primary
  // Section 111" in all of them tells none of them apart; it is the heading of
  // the timetable reprinted in every square, and stored as the name it follows
  // the lesson into the day and the week and every list after.
  ok("what every square says is taken out of the names",
     !got.blocks.some((b) => /Primary|Section|111|G1/.test(b.label)),
     JSON.stringify(got.blocks.map((b) => b.label)));
  ok("  and kept — the room where a room goes, the rest as a note",
     got.blocks.every((b) => b.where === "111") && /Primary Section/.test(got.blocks[0].note || ""),
     JSON.stringify({ where: got.blocks[0].where, note: got.blocks[0].note }));
  ok("  and said once, rather than taken off eighteen lessons in silence",
     /Primary Section 111/.test(got.shared || ""), JSON.stringify(got.shared));
  // NEARLY EVERY SQUARE, NOT EVERY SQUARE. One cell of a real page was cut off
  // by the page edge; asked for what ALL of them share the answer is nothing,
  // and eighteen good cells keep their boilerplate because one is damaged.
  ok("and one damaged square does not stop the other seventeen being cleaned",
     T.sharedIn(["A x y", "B x y", "C x y", "D"]).clean.join(" | ") === "A | B | C | D",
     JSON.stringify(T.sharedIn(["A x y", "B x y", "C x y", "D"])));
  // AND A COLUMN WHERE EVERY LESSON HAS THE SAME NAME IS A COLUMN OF THAT
  // LESSON, not a column of blanks.
  ok("and a name every cell shares entirely is left alone",
     T.sharedIn(["Homework", "Homework", "Homework"]).clean.join() === "Homework,Homework,Homework",
     JSON.stringify(T.sharedIn(["Homework", "Homework", "Homework"])));
  ok("  and is not announced as boilerplate either",
     T.sharedIn(["Homework", "Homework", "Homework"]).common === "",
     JSON.stringify(T.sharedIn(["Homework", "Homework", "Homework"]).common));

  // AND EVERY SQUARE OF IT, WHICH IS THE COUNT THAT WAS WRONG.
  const cellsIn = CELL.reduce((n, [, c]) => n + Object.keys(c).length, 0);
  ok("every square of the page comes back",
     got.blocks.reduce((n, b) => n + b.days.length, 0) === cellsIn + 1,
     `${got.blocks.reduce((n, b) => n + b.days.length, 0)} of ${cellsIn + 1}`);
}

// AND A TIDY PAGE IS NOT READ THAT WAY. The scattered reader is for pages whose
// cells are drawn in pieces; turned loose on one whose cells are drawn whole it
// pulls them apart into more, smaller, wronger blocks — and "more blocks wins"
// would let it.
{
  const tidy = T.fromRows(ROWS, {});
  ok("a page whose cells are drawn whole is still read the ordinary way",
     tidy.blocks.length === 19, String(tidy.blocks.length));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the PDF reader handing the page over in one piece");

// THE TWO FAULTS UNDERNEATH ALL OF IT, and neither is in the grid reader. They
// are in what the grid reader is given, so they need a real PDF to find.
//
// A document may position every glyph itself, stepping sideways before each one
// by the width of the one before it. Measured against the point size alone that
// is a column break at every letter, and a whole timetable arrives as "S",
// "ch", "e", "d", "u", "le" — fragments the grid reader correctly refuses,
// which is how a table came to be read as a run of sentences.
//
// And a document may wrap every fragment in its own text object. A line ends
// wherever a text object does, so five day names at the same height arrive as
// five rows of one word, and the table has no header at all.
{
  const zlib = await import("node:zlib");
  // A page drawn the awkward way: each word placed with its own Tm, each glyph
  // cluster stepped over with Td, and every one of them in its own BT/ET.
  const draw = (x, y, bits) =>
    `BT /F1 20 Tf 1 0 0 1 ${x} ${y} Tm ` +
    bits.map(([dx, t], i) => `${i ? `${dx} 0 Td ` : ""}(${t}) Tj `).join("") + "ET ";
  const content =
    // "Schedule", one glyph cluster at a time, each step the width of the last.
    draw(49, 760, [[0, "S"], [14, "ch"], [26, "e"], [14, "d"], [14, "u"], [14, "le"]]) +
    // Five day names at the same height, each its own text object.
    // Drawn out of order on purpose: a document may put its marks on the page
    // in any order it likes, and only their positions say what the row reads.
    draw(874, 700, [[0, "Friday"]]) + draw(222, 700, [[0, "Monday"]]) +
    draw(521, 700, [[0, "W"], [21, "ednesday"]]) +
    draw(699, 700, [[0, "Thursday"]]) + draw(377, 700, [[0, "Tuesday"]]) +
    draw(48, 640, [[0, "G1(08:40-09:25)"]]) +
    draw(210, 640, [[0, "English"]]) + draw(513, 640, [[0, "English"]]) +
    draw(48, 560, [[0, "G1(09:35-10:15)"]]) + draw(367, 560, [[0, "Reading"]]);
  const comp = zlib.deflateSync(Buffer.from(content));
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = Buffer.from("%PDF-1.4\n");
  objs.forEach((o, i) => {
    const body = o === null
      ? Buffer.concat([Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\r\n`), comp, Buffer.from("\r\nendstream")])
      : Buffer.from(o);
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
  });
  out = Buffer.concat([out, Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF")]);

  const box = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Intl, Uint8Array, ArrayBuffer, TextDecoder, DecompressionStream, Response, Blob,
    Promise, Error, isNaN, parseInt, parseFloat, setTimeout };
  box.window = box; box.globalThis = box;
  vm.createContext(box);
  ["dates.js", "pdftext.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), box, { filename: f }));
  const read = await box.OrganiserPdfText.read(new Uint8Array(out).buffer);
  const rows = (read.pages[0] || {}).rows || [];
  const words = rows.flatMap((r) => r.cells.map((c) => c.text));

  ok("a page that positions every glyph still comes back as words",
     words.includes("Schedule"), JSON.stringify(words));
  ok("  and not as the letters it was drawn from",
     !words.some((w) => w.length <= 2 && /[A-Za-z]/.test(w)), JSON.stringify(words));
  // AND THE ROW OF DAY NAMES IS A ROW. Five text objects at one height are five
  // rows here and nowhere else; without this the table has no header, and every
  // lesson on it is placed by guesswork.
  const header = rows.find((r) => r.cells.filter((c) => /day$/i.test(c.text)).length >= 2);
  ok("five day names at one height are one row",
     !!header && header.cells.length === 5,
     JSON.stringify(rows.map((r) => r.cells.map((c) => c.text))));
  ok("  in the order they are written across the page, not the order they were drawn",
     !!header && header.cells.map((c) => c.text).join() === "Monday,Tuesday,Wednesday,Thursday,Friday",
     JSON.stringify(header && header.cells.map((c) => c.text)));
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

// ---------------------------------------------------------------------------
console.log("\nAnd a schedule shown as what it means, not as what it stores");

// SIXTY-TWO ROWS SAYING "SUMMER VACATION" IS THE APP SHOWING ITS WORKINGS.
//
// A person knows one fact — the first of July to the end of August — and the
// setup screen was listing every day of it, interleaved with Monday's English,
// because that is how the calendar importer stores a holiday. Reading the
// storage is not something anybody should have to do to set up a timetable.
{
  const day = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const run = (label, from, n, flags) => Array.from({ length: n }, (_, i) => ({
    id: `${label}-${i}`, label, date: day(from, i), start: "00:00", end: "23:59",
    days: [], ...flags }));
  const kept = [
    { id: "eng", label: "English", start: "08:40", end: "09:25", days: [1, 3] },
    { id: "hw", label: "Homework", start: "15:10", end: "15:50", days: [1, 2, 3, 4] },
    ...run("Summer Vacation", "2027-07-01", 62, { blocksDay: true }),
    ...run("National Day", "2026-10-01", 7, { blocksDay: true }),
    ...run("Midterm — Exam Time", "2026-11-10", 3, { noLessons: true }),
    { id: "obs", label: "Lesson observation", date: "2026-09-24",
      start: "10:30", end: "11:15", days: [] },
  ];
  const g = S.groupsOf(kept);
  ok("seventy-five stored rows are three things", kept.length === 75 &&
     g.week.length === 2 && g.overrides.length === 3 && g.oneOffs.length === 1,
     JSON.stringify({ week: g.week.length, overrides: g.overrides.length, oneOffs: g.oneOffs.length }));
  const summer = g.overrides.find((x) => x.label === "Summer Vacation");
  ok("  and a holiday is one run of days, not sixty-two rows",
     summer && summer.from === "2027-07-01" && summer.to === "2027-08-31" && summer.days === 62,
     JSON.stringify(summer && { from: summer.from, to: summer.to, days: summer.days }));
  ok("  which says it really is every day in between",
     summer && summer.solid === true, JSON.stringify(summer && summer.solid));
  // AND A NAME ON SCATTERED DAYS IS NOT DRAWN AS A SOLID FORTNIGHT.
  const gappy = S.spansOf(S.normalise(run("Study Leave", "2027-03-01", 1, { blocksDay: true })
    .concat(run("Study Leave", "2027-03-15", 1, { blocksDay: true }))));
  ok("and a name on two far-apart days says how many days it really covers",
     gappy[0].days === 2 && gappy[0].solid === false, JSON.stringify(gappy[0]));
  // A ONE-OFF EVENT IS NOT A CALENDAR RULE. An observation at half ten changes
  // nothing about what the week MEANS; a holiday changes all of it.
  ok("and an event on a date is not filed as a rule about the week",
     g.oneOffs[0].label === "Lesson observation", JSON.stringify(g.oneOffs.map((b) => b.label)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the wreckage of the last attempt at the same document");

// A timetable that failed to read as a week was saved as dated one-offs
// instead. Save the real recurring week on top and the day gets both: Monday's
// English AND the seventh of September's copy of it, at the same hour.
{
  const { open, deep, saveBlocks } = await import("./_dom.mjs");
  const OLD = [
    { id: "o1", label: "English(G1", date: "2026-09-07", start: "08:40", end: "09:25", days: [] },
    { id: "o2", label: "Writing(E)(E", date: "2026-09-08", start: "10:30", end: "11:05", days: [] },
    // AND A GENUINE ONE-OFF, at an hour no period of this timetable has. It is
    // not a copy of anything and must survive.
    { id: "keep", label: "Lesson observation", date: "2026-09-24",
      start: "10:30", end: "11:15", days: [] },
  ];
  const r = await open("timeline.html", { schedule: OLD, scheduleConfig: {}, items: [], goals: [] });
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  r.get("#ttText").value = "Period\tMonday\tTuesday\n08:40-09:25\tEnglish\t\n10:30-11:05\t\tWriting\n";
  r.get("#ttRead").fire("click", { target: r.get("#ttRead") });
  await r.settle();
  const box = deep(r.get("#ttReview"))
    .filter((c) => String(c.className).split(/\s+/).includes("su-old"))[0];
  ok("the leftovers are noticed before anything is saved", !!box && !box.hidden,
     JSON.stringify(deep(r.get("#ttReview")).map((c) => c.className).filter(Boolean).slice(0, 10)));
  ok("  and counted, rather than left to be found",
     /2 dated copies/.test(String(box.innerHTML)), String(box.innerHTML).slice(0, 200));
  saveBlocks(r);
  await r.settle();
  const after = (r.state.schedule || []).map((b) => b.label);
  ok("saving the week takes the copies of it out",
     !after.some((l) => /English\(G1|Writing\(E\)\(E/.test(l)), JSON.stringify(after));
  ok("  and leaves the one-off that was never a copy",
     after.includes("Lesson observation"), JSON.stringify(after));
  ok("  and the week itself goes in", after.includes("English") && after.includes("Writing"),
     JSON.stringify(after));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a lesson already in your week is brought up to date, not skipped");

// SKIPPING ALONE IS QUIETLY WRONG. Reading the same timetable in twice must not
// put a second copy of every lesson in the week — that part was right. But the
// copy that wins is the one already stored, which is the OLDER one: it does not
// have the term dates just answered for on this import, and it does not have
// the half of the fortnight the document just said it runs in.
//
// So pressing Save on a timetable that ends in January would have left the
// lessons you already had running for ever, and Writing showing every Tuesday —
// and the only thing on screen would have said they were "already in your week".
{
  const { open, deep, saveBlocks } = await import("./_dom.mjs");
  const HAVE = [
    // Already there, with no end date and no fortnight — as a week set up
    // before any of this existed looks. AND CARRYING THINGS YOU SAID: two weeks
    // this lesson doesn't run, and a note. The import matches this block, so
    // this is the one that proves the merge only takes what it is entitled to.
    { id: "e1", label: "English", start: "08:40", end: "09:25", days: [1, 3], kind: "teaching",
      skip: ["2026-10-08", "2026-11-05"], protected: true, note: "in the hall" },
    { id: "wr", label: "Writing", start: "10:30", end: "11:05", days: [2], kind: "teaching" },
    // And one the import does not mention at all.
    { id: "mine", label: "Prep", start: "15:10", end: "15:50", days: [4],
      workable: true, protected: false, skip: ["2026-10-08"] },
  ];
  const r = await open("timeline.html", { schedule: HAVE, scheduleConfig: {}, items: [], goals: [] });
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  r.get("#ttText").value =
    "Period\tMonday\tTuesday\tWednesday\n" +
    "08:40-09:25\tEnglish\t\tEnglish\n" +
    "10:30-11:05\t\tWriting odd week / Show & Tell even week\t\n";
  r.get("#ttRead").fire("click", { target: r.get("#ttRead") });
  await r.settle();
  // AND THE ROW SAYS WHICH HALF IT RUNS IN, BEFORE ANYTHING IS SAVED.
  //
  // The grid above showed the two lessons stacked in one Tuesday cell and the
  // rows underneath — the things actually about to be saved — said nothing at
  // all about odd and even. So the one fact that keeps you out of the wrong
  // room was the one fact you could not check before pressing Save.
  const halves = deep(r.get("#ttReview"))
    .filter((c) => String(c.className || "").split(/\s+/).includes("su-half"))
    .map((c) => String(c.textContent || ""));
  ok("the rows about to be saved say which half of the fortnight each runs in",
     halves.filter((w) => w === "odd weeks").length === 1 &&
       halves.filter((w) => w === "even weeks").length === 1 &&
       halves.filter((w) => w === "every week").length === 1,
     JSON.stringify(halves));
  saveBlocks(r, { from: "2026-09-01", to: "2027-01-22" });
  await r.settle();
  const week = (r.state.schedule || []).filter((b) => (b.days || []).length);
  const one = (name) => week.filter((b) => b.label === name);
  ok("reading the same lesson in again leaves one of it, not two",
     one("English").length === 1 && one("Writing").length === 1,
     JSON.stringify(week.map((b) => `${b.label}:${JSON.stringify(b.days)}`)));
  ok("  and the one already there now carries the dates you just gave",
     one("English")[0].from === "2026-09-01" && one("English")[0].to === "2027-01-22",
     JSON.stringify({ from: one("English")[0].from, to: one("English")[0].to }));
  // THE ONE THAT MATTERS MOST. A fortnight the document states, landing on a
  // block that was stored without one.
  ok("  and the half of the fortnight the document just said it runs in",
     one("Writing")[0].parity === "odd", JSON.stringify(one("Writing")[0].parity));
  ok("  while the other half goes in as a block of its own",
     one("Show & Tell").length === 1 && one("Show & Tell")[0].parity === "even",
     JSON.stringify(one("Show & Tell").map((b) => b.parity)));
  // AND NOTHING THIS IMPORT HAS NO BUSINESS WITH IS TOUCHED — on the block it
  // MATCHED, which is the one where it could do damage. The weeks you crossed
  // off, the protection you set and the note you wrote are yours; a timetable
  // read out of a PDF has no view on any of them.
  const eng = one("English")[0];
  ok("  and what you set yourself on it is left exactly as it was",
     (eng.skip || []).join() === "2026-10-08,2026-11-05" && eng.protected === true &&
       eng.note === "in the hall",
     JSON.stringify({ skip: eng.skip, protected: eng.protected, note: eng.note }));
  const mine = week.find((b) => b.label === "Prep");
  ok("  and a block the import never mentioned is untouched",
     mine && mine.workable === true && (mine.skip || []).join() === "2026-10-08" &&
       mine.from === "" && mine.to === "",
     JSON.stringify(mine && { workable: mine.workable, skip: mine.skip, from: mine.from }));
  // AND IT IS SAID, rather than reported as "already in your week" and left.
  ok("and the screen says what was brought up to date",
     /brought up to date/.test(String(r.get("#ttStatus").textContent || "")),
     String(r.get("#ttStatus").textContent || ""));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a fortnight nobody anchored is a fortnight that never resolves");

// THE FAULT THIS IS HERE TO STOP, AND IT WAS LIVE. The anchor had to be a block
// marked weekOne, and NOTHING IN THE APP EVER SET ONE — no importer, no screen,
// no button. So parity never resolved on a real file, and appliesOn's rule that
// an unknown fortnight shows both halves meant Writing and Show & Tell appeared
// together every single Tuesday. The timetable was read correctly, stored
// correctly, and then both lessons were put in the same slot for ever.
//
// The document had already said it, twice, in its own words.
{
  const FN = [
    { id: "w", label: "Writing", start: "10:30", end: "11:05", days: [2], parity: "odd" },
    { id: "s", label: "Show & Tell", start: "10:30", end: "11:05", days: [2], parity: "even" },
  ];
  // "Sep. 20 is a working day, even week Tuesday schedule" — and the same for
  // Oct. 10, a Wednesday schedule. Two dates, each saying which half it is in.
  const SAID = [
    { id: "c1", label: "is a working day, even week Tuesday schedule", date: "2026-09-20",
      start: "00:00", end: "00:01", days: [], runsAs: 2, parity: "even" },
    { id: "c2", label: "is a working day, even week Wednesday schedule", date: "2026-10-10",
      start: "00:00", end: "00:01", days: [], runsAs: 3, parity: "even" },
  ];
  ok("with no anchor at all, both halves are on and the app says it doesn't know",
     S.parityOn(FN, "2026-09-15") === "" && S.blocksOn(FN, "2026-09-15").length === 2,
     JSON.stringify(S.blocksOn(FN, "2026-09-15").map((b) => b.label)));
  ok("  and nothing in the app quietly invents one",
     S.paritySays(FN).known === false && S.paritySays(FN).sure === "nothing",
     JSON.stringify(S.paritySays(FN)));

  // A DATE THAT SAYS WHICH HALF IT IS IN *IS* AN ANCHOR, whatever else it is
  // doing. It did not used to count unless it also carried weekOne, which
  // nothing sets.
  const both = FN.concat(SAID);
  ok("a date the calendar said was an even week anchors the fortnight",
     S.parityOn(both, "2026-09-22") === "even" && S.parityOn(both, "2026-09-15") === "odd",
     JSON.stringify([S.parityOn(both, "2026-09-15"), S.parityOn(both, "2026-09-22")]));
  ok("  so a Tuesday carries one of the two, not both",
     S.blocksOn(both, "2026-09-15").map((b) => b.label).join() === "Writing" &&
       S.blocksOn(both, "2026-09-22").map((b) => b.label).join() === "Show & Tell",
     JSON.stringify([S.blocksOn(both, "2026-09-15").map((b) => b.label),
       S.blocksOn(both, "2026-09-22").map((b) => b.label)]));

  // AND THE DAY THE WEEK TURNS OVER ON IS WORKED OUT, NOT ASSUMED.
  //
  // This was Monday, written in. On a school whose weeks run Sunday to Saturday
  // that puts every date in the wrong half — the fortnight resolving perfectly
  // and being wrong by exactly one week, which is the hardest kind of wrong to
  // see. Two dates that each say which half they are in constrain it, and on
  // this calendar exactly one weekday survives: the document settles its own
  // school's week without the app knowing a thing about any school.
  const says = S.paritySays(both);
  ok("two dates that both say so settle which day the week turns over on",
     says.sure === "said" && says.turn === 0, JSON.stringify(says));
  // Checked against the school calendar's OWN week numbers: week 3 begins Sun 13
  // Sep and week 4 begins Sun 20 Sep, so Tue 15 Sep is week 3 and Tue 22 Sep is
  // week 4. Under a Monday week they come out one week apart from that.
  ok("  and the halves then line up with the week numbers the calendar prints",
     ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]
       .map((d) => S.parityOn(both, d)).join() === "even,odd,even,odd,even",
     JSON.stringify(["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]
       .map((d) => `${d}:${S.parityOn(both, d)}`)));
  // AND THE COUNT STARTS FROM THE ANCHOR'S OWN HALF. The old one read
  // "weeks % 2 === 0 ? odd : even", which is only right if every anchor is an
  // odd week — and the one this calendar gives is an even one.
  ok("  counting from what the anchor actually said, not from assuming it is odd",
     S.parityOn(both, "2026-09-20") === "even",
     S.parityOn(both, "2026-09-20"));

  // ONE DATE IS ENOUGH TO RESOLVE THE FORTNIGHT AND NOT ENOUGH TO SETTLE THE
  // WEEK. Said, rather than presented as the same kind of answer.
  const one = FN.concat([SAID[0]]);
  ok("one date resolves the fortnight but says the turn-over is only assumed",
     S.paritySays(one).known === true && S.paritySays(one).sure === "assumed",
     JSON.stringify(S.paritySays(one)));
  // AND TWO THAT CANNOT BOTH BE TRUE SAY SO rather than picking one.
  const clash = FN.concat([SAID[0],
    { ...SAID[1], id: "c3", date: "2026-10-10", parity: "odd" }]);
  ok("  and two that contradict each other are called what they are",
     S.paritySays(clash).sure === "muddled", JSON.stringify(S.paritySays(clash)));

  // ---- AND THE ANCHOR HAS TO COME OUT OF THE REAL DOCUMENT ----------------
  //
  // Everything above was true of hand-written blocks and false of a real file,
  // because the CALENDAR READER never carried the word. "Sep. 20 is a working
  // day, even week Tuesday schedule" is two facts; it read the weekday and
  // dropped EVEN on the floor — and that word is the only thing in the whole
  // document that says which weeks are which. weekIn existed for exactly this,
  // with a comment saying so, and nothing called it.
  //
  // Proved through the real reader on the real line, not through a fixture
  // somebody wrote the answer into.
  const LINE = "• National Day: Oct. 1-Oct. 7 (Sep. 20 is a working day, even week Tuesday " +
    "schedule; Oct. 10 is a working day, even week Wednesday schedule)";
  const read = C.read(LINE, { year: 2026 });
  const made = (read.rows || []).filter((r) => r.runsAsDay !== undefined);
  ok("the calendar reader keeps the half of the fortnight a make-up day names",
     made.length === 2 && made.every((r) => r.parity === "even"),
     JSON.stringify((read.rows || []).map((r) => `${r.date}:${r.runsAsDay}/${r.parity || "—"}`)));
  // AND IT REACHES THE BLOCK. A row that knows and a block that doesn't is the
  // same as not knowing.
  const asked = (read.rows || []).map((r) =>
    ({ ...r, kind: r.runsAsDay === undefined ? "noLessons" : "runsAs" }));
  const blocks = C.toBlocks(asked) || [];
  const marks = blocks.filter((b) => b.runsAs !== undefined && b.runsAs !== null);
  ok("  and it survives the trip into a stored block",
     marks.length === 2 && marks.every((b) => b.parity === "even"),
     JSON.stringify(marks.map((b) => `${b.date}:${b.parity || "—"}`)));
  // AND THAT IS ENOUGH, ON ITS OWN, TO PUT ONE LESSON IN THE SLOT.
  const real = FN.concat(marks);
  ok("  so a real file resolves the fortnight with nothing else added",
     S.paritySays(real).sure === "said" &&
       S.blocksOn(real, "2026-09-15").map((b) => b.label).join() === "Writing" &&
       S.blocksOn(real, "2026-09-22").map((b) => b.label).join() === "Show & Tell",
     JSON.stringify({ says: S.paritySays(real).sure,
       tue: S.blocksOn(real, "2026-09-15").map((b) => b.label) }));
}

// ---------------------------------------------------------------------------
console.log("\nAnd dated copies of your own timetable can be cleared at any time");

// THE IMPORT OFFERS THIS WHILE IT IS RUNNING, which is no help at all once the
// import is over — and a real file kept eight of them afterwards, to be deleted
// one at a time. The offer belongs where the rows are.
{
  const WEEK2 = [
    { id: "w1", label: "English", start: "08:40", end: "09:25", days: [1, 3], kind: "teaching" },
    { id: "w2", label: "Homework", start: "15:10", end: "15:50", days: [1, 2, 3, 4], kind: "teaching" },
  ];
  const COPIES = [
    // Same hours, same weekday, from a document: Mon 7 Sep 2026 is a Monday.
    { id: "c1", label: "English(G1", date: "2026-09-07", start: "08:40", end: "09:25",
      days: [], source: "paste" },
    { id: "c2", label: "Homework(G", date: "2026-09-07", start: "15:10", end: "15:50",
      days: [], source: "paste" },
  ];
  const SAFE = [
    // THE ONES THAT MUST SURVIVE, each failing exactly one condition:
    // an hour no lesson runs to;
    { id: "s1", label: "Lesson observation", date: "2026-09-07", start: "08:40", end: "09:40",
      days: [], source: "paste" },
    // a weekday that period is not taught on (Sat 12 Sep);
    { id: "s2", label: "English(G1", date: "2026-09-12", start: "08:40", end: "09:25",
      days: [], source: "paste" },
    // and one you typed yourself.
    { id: "s3", label: "Cover for a colleague", date: "2026-09-09", start: "08:40", end: "09:25",
      days: [], source: "hand" },
  ];
  const all = WEEK2.concat(COPIES, SAFE);
  const stray = S.strayCopies(all);
  ok("a dated entry at one of your week's own periods is offered as a copy",
     stray.length === 2 && stray.map((b) => b.id).sort().join() === "c1,c2",
     JSON.stringify(stray.map((b) => `${b.id}:${b.label}`)));
  ok("  while an hour no lesson runs to is not one",
     !stray.some((b) => b.id === "s1"), "an observation was offered for deletion");
  ok("  nor a day that period is not taught on",
     !stray.some((b) => b.id === "s2"), "a Saturday copy was offered");
  ok("  nor anything you typed yourself",
     !stray.some((b) => b.id === "s3"), "something hand-entered was offered for deletion");
  // AND DURING AN IMPORT the periods about to be saved count too, because they
  // are not in the week yet — and a row with no source recorded is fair game
  // there, because you have just said which document this is.
  const OLDER = [{ id: "o", label: "Writing(E)(E", date: "2026-09-08", start: "10:30",
    end: "11:05", days: [] }];
  const about = [{ start: "10:30", end: "11:05", days: [2] }];
  ok("and a period about to be saved counts while the import is running",
     S.strayCopies(WEEK2.concat(OLDER), about).map((b) => b.id).join() === "o",
     JSON.stringify(S.strayCopies(WEEK2.concat(OLDER), about).map((b) => b.id)));
  ok("  though not once the import is over and nothing has said which document",
     S.strayCopies(WEEK2.concat(OLDER)).length === 0,
     JSON.stringify(S.strayCopies(WEEK2.concat(OLDER)).map((b) => b.id)));

  // AND IT HAS TO BE ON THE SCREEN WHERE THE ROWS ARE. Knowing which rows are
  // copies is no use at all if the only place that says so is a flow that
  // finished last week.
  const { open, deep } = await import("./_dom.mjs");
  const r = await open("timeline.html", { schedule: all, scheduleConfig: {}, items: [], goals: [] });
  r.get("#setupToggle").fire("click", { target: r.get("#setupToggle") });
  await r.settle();
  const offer = () => deep(r.get("#blockList"))
    .find((c) => String(c.className || "").split(/\s+/).includes("su-stray"));
  ok("and the offer is on the one-off list itself, not only inside an import",
     !!offer() && /2 of these look like dated copies/.test(String(offer().innerHTML || "")),
     String(offer() && offer().innerHTML || "(nothing)").slice(0, 160));
  const press = deep(offer()).find((c) => String(c.tagName) === "BUTTON");
  ok("  with one press for all of them", !!press && /^remove all 2$/.test(String(press.textContent)),
     String(press && press.textContent));
  press.click();
  await r.settle();
  const after = (r.state.schedule || []).map((b) => b.id);
  ok("  and pressing it takes the copies out and nothing else",
     !after.includes("c1") && !after.includes("c2") &&
       ["w1", "w2", "s1", "s2", "s3"].every((id) => after.includes(id)),
     JSON.stringify(after));
}

finish();
