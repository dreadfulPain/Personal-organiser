import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A TABLE WHERE THE ROW AND THE COLUMN BOTH MEAN SOMETHING.
//
// An assessment cycle is written as a grid, because a grid is the only honest
// shape for it — four deadlines that differ in two ways at once:
//
//     Cycle         | Paper / Task Due | Scores & Comments | Reports Released
//     Mid-Semester  | 23 Oct 2026      | 16 Nov 2026       | 20 Nov 2026
//                   | 16:30            | 17:00             |
//     Semester      | 18 Dec 2026      | 14 Jan 2027       | 21 Jan 2027
//                   | 16:30            | 17:00             |
//
// Six deadlines. What each one IS takes both headings: the 14th of January is
// not "Semester", it is the semester's scores and comments, and the 18th of
// December is the semester's papers. Read down the side only, five of the six
// are called "Semester" or "Mid-Semester" or nothing, and two of them turn up
// on a day that already has something on it and look like the same thing
// written twice.
//
// WHY IT WAS READ DOWN THE SIDE ONLY. The reader finds a table by finding a RUN
// of cells — dates one under another with a name above them — and this table
// puts a time between its dates. So the run was one cell long, one cell is not
// a table, and every rule that needs a table to be a table stopped there: the
// headings were never looked for, the row label was never found, and the time
// sitting in the next cell was never picked up either.
//
// A LINE THAT IS NOTHING BUT A CLOCK IS NOT A CELL OF ITS OWN. There is no day
// for it to be on. It belongs to the date above it, which is the whole of what
// this needed to know.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done: finish } = checker();

const PUB = path.join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DataView, TextDecoder,
  Error, DecompressionStream, Response, Blob, setTimeout };
sb.window = sb;
vm.createContext(sb);
["dates.js", "schedule.js", "dayshape.js", "ics.js", "pdftext.js", "roster.js",
 "goalplan.js", "priority.js", "dayplan.js", "timetable.js", "calplan.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const CP = sb.OrganiserCalPlan;

const read = (rows, opts) => CP.read(rows.join("\n"), { year: 2026, ...(opts || {}) });
const show = (r) => JSON.stringify(r.rows.map((x) =>
  `${x.date} ${x.label}${x.start ? " @" + x.start : ""}`));
const at = (r, d) => (r.rows.filter((x) => x.date === d)[0] || {});

// The table as a flattened PDF gives it: one cell to a line, the heading row
// indented because those cells start further across the page.
const CYCLE = [
  "Assessment and reporting cycle",
  "\t\tCycle",
  "\tPaper / Task Due",
  "\tScores & Comments",
  "\tReports Released",
  "Mid-Semester",
  "23 Oct 2026",
  "16:30",
  "16 Nov 2026",
  "17:00",
  "20 Nov 2026",
  "Semester",
  "18 Dec 2026",
  "16:30",
  "14 Jan 2027",
  "17:00",
  "21 Jan 2027",
];

// ---------------------------------------------------------------------------
console.log("\nSix deadlines that differ in two ways at once");

{
  const r = read(CYCLE);
  ok("all six dates are read", r.rows.length === 6, show(r));
  // THE ROW HEADING AND THE COLUMN HEADING, BOTH. Either on its own names three
  // things the same.
  [["2026-10-23", "Mid-Semester", "Paper / Task Due"],
   ["2026-11-16", "Mid-Semester", "Scores & Comments"],
   ["2026-11-20", "Mid-Semester", "Reports Released"],
   ["2026-12-18", "Semester", "Paper / Task Due"],
   ["2027-01-14", "Semester", "Scores & Comments"],
   ["2027-01-21", "Semester", "Reports Released"]].forEach(([d, row, col]) => {
    const x = at(r, d);
    ok(`  ${d} is the ${row} row`, new RegExp(row).test(x.label || ""), x.label || "(missing)");
    ok(`    and the ${col} column`, new RegExp(col.replace(/[/&]/g, "\\$&")).test(x.label || ""),
       x.label || "(missing)");
  });
  // AND THE CLOCK IN THE CELL UNDER EACH DATE IS THAT DEADLINE'S TIME. Half
  // past four is the difference between a day you have to notice and an hour
  // you have to be at a desk for.
  ok("the time under a date belongs to it", at(r, "2026-10-23").start === "16:30" &&
     at(r, "2026-11-16").start === "17:00", show(r));
  ok("  and a date with no time under it has none",
     !at(r, "2026-11-20").start && !at(r, "2027-01-21").start, show(r));
  // AND NOTHING IS INVENTED. Six cells, six rows: no row for a clock, and no
  // row for the heading line above the table.
  ok("and the headings are headings, not entries",
     !r.rows.some((x) => /^Cycle$|^Assessment and reporting/.test(x.label)), show(r));
}

// ---------------------------------------------------------------------------
console.log("\nAnd the same document's chronological half agrees with it");

// THE POINT OF THE NAMES. Read down the side only, the 18th of December came
// out called "Semester" — which is close enough to "Semester Assessment Paper
// Upload" a page earlier to be flagged as a possible duplicate and put to you
// as a question. With the column heading on it, it says what it is, and the
// question it raises is a better one: is the semester's paper deadline the
// same thing as the semester assessment paper upload? It is — and now there is
// enough on the row to see that.
{
  const r = read([
    "DECEMBER 2026",
    "Fri 18 Dec, 16:30",
    "Semester Assessment Paper Upload",
    "Semester assessment papers due to the academic office.",
    ...CYCLE,
  ]);
  const on18 = r.rows.filter((x) => x.date === "2026-12-18");
  ok("both places the document says it are kept", on18.length === 2,
     JSON.stringify(on18.map((x) => x.label)));
  ok("  and the table one says which deadline it is",
     on18.some((x) => /Semester\b.*Paper \/ Task Due/.test(x.label)),
     JSON.stringify(on18.map((x) => x.label)));
  ok("  while the other keeps the calendar's own wording",
     on18.some((x) => /Semester Assessment Paper Upload/.test(x.label)),
     JSON.stringify(on18.map((x) => x.label)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a cell rests on its own column, not on the one beside it");

// WHAT AN ENTRY RESTS ON IS THE ONLY PLACE A CLAIM ABOUT IT MAY BE PROVED, so
// what goes in there decides what can be borrowed. Every heading of the table
// was handed to every cell of it — so the paper cell of a two-column deadline
// table could prove itself by quoting the scores column: a real phrase,
// genuinely in the table, and about the cell next to it. That is borrowing in
// the one place a borrowed phrase looks most like evidence, because it comes
// off the same row of the same table.
//
// A cell rests on the heading of its list, the row it is in, the column IT is
// in, and its own words. Which column that is, is known: the cells of a row are
// the dated ones, in order, and the headings line up with them.
{
  const r = read(CYCLE);
  const ctx = (d) => JSON.stringify((at(r, d).context || []));
  ok("the paper cell rests on its own column",
     /Paper \/ Task Due/.test(ctx("2026-10-23")), ctx("2026-10-23"));
  ok("  and not on the columns beside it",
     !/Scores & Comments|Reports Released/.test(ctx("2026-10-23")), ctx("2026-10-23"));
  ok("the scores cell rests on its own column",
     /Scores & Comments/.test(ctx("2026-11-16")), ctx("2026-11-16"));
  ok("  and not on the columns beside it",
     !/Paper \/ Task Due|Reports Released/.test(ctx("2026-11-16")), ctx("2026-11-16"));
  // AND ON THE ROW IT IS IN, which really is what it is in.
  ok("while the row it is in is still under it",
     /Mid-Semester/.test(ctx("2026-10-23")), ctx("2026-10-23"));
  // AND ON THE SECTION HEADING, where the document writes one as a heading —
  // words and then a colon, which is how a list says what it is a list of.
  // "Assessment and reporting cycle" on its own line is a title, not a heading,
  // and is not reached for: see HEADING.
  {
    const named = read(["Submission and scoring deadlines:", ...CYCLE.slice(1)]);
    ok("and on the heading its list is under, where the document writes one",
       /Submission and scoring deadlines/
         .test(JSON.stringify(at(named, "2026-10-23").context || [])),
       JSON.stringify(at(named, "2026-10-23").context || []));
  }
  // AND NEVER ANOTHER ROW'S CELL. The row below has the same three columns.
  ok("and never a different row's own words",
     !/18 Dec|14 Jan|21 Jan/.test(ctx("2026-10-23")), ctx("2026-10-23"));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a deadline written twice at the same hour is asked about");

// WHAT READING THE TABLE PROPERLY UNCOVERED. The four cells of it that used to
// be thrown away — a bare date on a day that already had something on it — now
// come back as rows, correctly named, and sit in the list beside the
// chronological entry for the same deadline. Nothing is lost any more, and six
// pairs of one-thing-written-twice are visible where four of them were not.
//
// SAME DAY IS NOT ENOUGH, and never will be: two different things happen on one
// day constantly. SAME DAY AND SAME HOUR is different. The document put two
// entries at half past four on the 23rd of October; either that is one deadline
// written in both halves of the page, or it is a genuine clash — and both of
// those are worth a moment of yours. It is a question, exactly like a near-name
// is a question: nothing merges, both rows stay, and "Keep both" costs one
// press.
//
// This is not fuzzy matching. It is two facts the document itself states.
{
  const r = read([
    "DECEMBER 2026",
    "Fri 18 Dec, 16:30",
    "Semester Assessment Paper Upload",
    "Semester assessment papers due to the academic office.",
    ...CYCLE,
  ]);
  const on18 = r.rows.filter((x) => x.date === "2026-12-18");
  ok("two entries at the same hour on one day are one question",
     on18.length === 2 && on18.every((x) => !!x.sameGroup) &&
     on18[0].sameGroup === on18[1].sameGroup,
     JSON.stringify(on18.map((x) => `${x.label} @${x.start} ${x.sameGroup || "-"}`)));
  ok("  and neither of them is merged away",
     new Set(on18.map((x) => x.label)).size === 2,
     JSON.stringify(on18.map((x) => x.label)));
  // AND TWO THINGS ON ONE DAY AT DIFFERENT HOURS ARE JUST TWO THINGS.
  const other = read([
    "Fri 6 Nov",
    "Lower School Family Conferences",
    "08:30-12:00. Grades 1-5 families.",
    "Staff Briefing 15:45; 6 Nov 2026",
  ]);
  ok("but two things at different hours are not asked about",
     !other.rows.some((x) => x.sameGroup),
     JSON.stringify(other.rows.map((x) => `${x.date} ${x.label} @${x.start || "-"}`)));
  // AND TWO THINGS ON ONE DAY WITH NO TIME AT ALL ARE NEVER ASKED ABOUT EITHER.
  // A shared date on its own is the one thing that must never raise this, or
  // every busy Friday in the year becomes a question.
  const plain = read([
    "Fri 20 Nov",
    "Progress Reports Released",
    "Fri 20 Nov",
    "Lower School Assembly",
  ]);
  ok("and two all-day things on one day are not either",
     !plain.rows.some((x) => x.sameGroup),
     JSON.stringify(plain.rows.map((x) => `${x.date} ${x.label}`)));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a table with no heading row is still read down the side");

// NOT EVERY TABLE HAS HEADINGS ALONG THE TOP. Where there are none, the row
// label is the whole of the name and always was — this is here so that looking
// for headings cannot cost anything when they are not there.
{
  const r = read([
    "Term blocks",
    "Autumn Recess",
    "26 October 2026",
    "30 October 2026",
    "Spring Recess",
    "24 May 2027",
    "28 May 2027",
  ]);
  ok("a table of plain rows keeps its row names",
     /Autumn Recess/.test(at(r, "2026-10-26").label || "") &&
     /Spring Recess/.test(at(r, "2027-05-24").label || ""), show(r));
}

// AND A TITLE IS STILL NOT A ROW LABEL.
//
// The first row of that table used to be refused a name because the only thing
// above it was the table's own heading — the bound that stops a page's own
// title naming the first dates under it. What earns a name now is that the
// SHAPE REPEATS: a label, its cells, another label, its cells. A title has
// nothing of the kind under it, and this is the case the bound was written for.
{
  const r = read([
    "Bramfield Academy — staff dates",
    "1 September 2026",
    "23 October 2026",
  ]);
  ok("a title over the first two dates on a page names neither",
     !/Bramfield/.test(JSON.stringify(r.rows.map((x) => x.label))), show(r));
}

// ---------------------------------------------------------------------------
console.log("\nAnd a clock is never mistaken for an entry");

// A LINE THAT IS NOTHING BUT A CLOCK belongs to the date above it. It must not
// become a row of its own, and it must not join two unrelated dates into one
// table row either.
{
  const r = read([
    "AUGUST 2026",
    "Thu 27 Aug",
    "Faculty Welcome Day",
    "Whole-staff orientation and department planning. 08:30-15:30.",
    "Mon 31 Aug",
    "New Student Orientation",
    "New students arrive from 10:00.",
  ]);
  ok("a detail sentence with a time in it is not a cell",
     /Faculty Welcome Day/.test(at(r, "2026-08-27").label || "") &&
     /New Student Orientation/.test(at(r, "2026-08-31").label || ""), show(r));
  ok("  and no row is called by a clock",
     !r.rows.some((x) => /^\d{1,2}[:.]\d{2}/.test(x.label || "")), show(r));
}

finish();
