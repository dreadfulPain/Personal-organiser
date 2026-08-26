import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A SEMESTER CALENDAR, WHICH IS A DIFFERENT DOCUMENT AGAIN.
//
// Not a term-dates list and not a month grid: one page holding a whole semester
// as a week-numbered table, and under it a page of prose — deadlines, exam
// windows, PD days, holidays. The prose is where everything a teacher has to
// act on lives, and reading it went wrong in four ways, three of them silent:
//
//   1. A CLOCK TIME WAS READ AS A YEAR. "Nov. 2 16:00" is a deadline at four in
//      the afternoon; the year slot took the 16 and filed it under November
//      2016. Four dates — when papers are in, when marks are in, twice a
//      semester — landed ten years in the past looking perfectly ordinary.
//
//   2. HYPHENS CAME OUT ON LINES OF THEIR OWN. A school calendar is made of
//      them — "Mid-Autumn Festival", "Oct. 1 - Oct. 7", "Grade 11-12" — and
//      each arrived in three pieces, so the holiday was called "Autumn
//      Festival" and the week off was one day.
//
//   3. A NUMBER WAS CUT IN HALF BY THE COLUMN EDGE. "Dec. 2" / "2" / "-" /
//      "Dec. 25" is the twenty-second of December, and read as written it is
//      the second — three weeks of Christmas holiday in the wrong place.
//
//   4. A DOCUMENT WITH TWO YEARS IN IT GOT ONE. A first semester runs from
//      September to January and therefore spans a New Year. Whichever year is
//      filled in for the lines that don't say one, half the document comes out
//      twelve months wrong, and nothing about a date on the screen says which
//      half. That one has no right answer, so it is said rather than settled —
//      and each row can be moved across on its own.
//
// Every fixture here is invented. No school, date or event in it is real.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";
import { buildPdf } from "./_pdf.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl,
  Uint8Array, DecompressionStream, Response, Blob, ArrayBuffer, Promise };
sb.window = sb;
vm.createContext(sb);
["pdftext.js", "dates.js", "calplan.js", "schedule.js", "timetable.js"]
  .forEach((f) => vm.runInContext(read(f), sb));
const C = sb.OrganiserCalPlan;
const P = sb.OrganiserPdfText;

// ---------------------------------------------------------------------------
sec("A time on the line is a time, not a year");
{
  // THE DANGEROUS KIND OF WRONG: it reads, it looks like a date, and it is ten
  // years out. Nothing on the row would have shown it.
  ok("a deadline at four keeps its own day",
     C.dateIn("Nov. 2 16:00", 2026) === "2026-11-02", C.dateIn("Nov. 2 16:00", 2026));
  ok("and so does one written the other way round",
     C.dateIn("2 Nov 16:00", 2026) === "2026-11-02", C.dateIn("2 Nov 16:00", 2026));
  ok("and the time is what's left to call it by",
     /16:00/.test(C.labelOf("Nov. 2 16:00", "2026-11-02", 2026)),
     C.labelOf("Nov. 2 16:00", "2026-11-02", 2026));
  // AND A REAL YEAR IS STILL A YEAR — this must not have been bought by
  // refusing every two-digit year in existence.
  ok("a two-digit year still works", C.dateIn("Aug 24 26", 2020) === "2026-08-24",
     C.dateIn("Aug 24 26", 2020));
  ok("and a four-digit one", C.dateIn("Term starts 1 September 2027", 2026) === "2027-09-01",
     C.dateIn("Term starts 1 September 2027", 2026));
  ok("even at the end of a sentence", C.dateIn("INSET day 25 September 2026.", 2020) === "2026-09-25",
     C.dateIn("INSET day 25 September 2026.", 2020));
}

sec("And a holiday written month-first is a stretch of days");
{
  // EVERY HOLIDAY ON THIS KIND OF CALENDAR IS WRITTEN THIS WAY, and every one
  // of them came out as its first day alone — so a week off showed as one day
  // off and six days of teaching.
  const r = C.read("• National Day: Oct. 1-Oct. 7", { year: 2026 });
  ok("both ends are read", r.rows.length === 1 && r.rows[0].endsOn === "2026-10-07",
     JSON.stringify(r.rows));
  ok("starting where it starts", r.rows[0].date === "2026-10-01", r.rows[0].date);
  ok("and called what it's called", /National Day/.test(r.rows[0].label), r.rows[0].label);

  // AND ONE THAT CROSSES NEW YEAR takes a year from each end.
  const over = C.read("Winter break: Dec. 20, 2026 - Jan. 5, 2027");
  ok("a stretch across New Year starts in the old year",
     over.rows[0] && over.rows[0].date === "2026-12-20", over.rows[0] && over.rows[0].date);
  ok("and ends in the new one", over.rows[0] && over.rows[0].endsOn === "2027-01-05",
     over.rows[0] && over.rows[0].endsOn);

  // AND THE ONES THAT ALREADY WORKED STILL DO.
  const dayFirst = C.read("Half term 25-27 September 2026");
  ok("day-first ranges are untouched",
     dayFirst.rows[0] && dayFirst.rows[0].endsOn === "2026-09-27",
     dayFirst.rows[0] && dayFirst.rows[0].endsOn);
  const same = C.read("Exams September 25-27, 2026");
  ok("and so are month-then-two-numbers ones",
     same.rows[0] && same.rows[0].endsOn === "2026-09-27",
     same.rows[0] && same.rows[0].endsOn);
}

// ---------------------------------------------------------------------------
sec("A hyphen on a line of its own is the middle of something");
{
  const got = await P.read(new Uint8Array(buildPdf([
    "Mid", "-", "Autumn Festival: Sep. 25",
    "National Day: Oct. 1", "-", "Oct. 7",
    "Grade 11", "-", "12 Director Meeting",
  ])).buffer);
  ok("it reads", got.ok, JSON.stringify(got.notes));
  ok("a hyphenated name goes back together", /Mid-Autumn Festival/.test(got.text),
     JSON.stringify(got.text));
  ok("and a range does too", /Oct\. 1-Oct\. 7/.test(got.text), JSON.stringify(got.text));
  ok("and so does a grade span", /Grade 11-12 Director Meeting/.test(got.text),
     JSON.stringify(got.text));

  // A BULLET IS NOT A HYPHEN. "- Head of Primary" under a name is the shape the
  // card reader lives on, and gluing it to the line above would take a page of
  // people away from it.
  const bullets = await P.read(new Uint8Array(buildPdf([
    "Ms. A. Example:", "- Head of Primary", "- Head of Maths",
  ])).buffer);
  ok("a dash with words after it starts its own line",
     /Ms\. A\. Example:\n- Head of Primary\n- Head of Maths/.test(bullets.text),
     JSON.stringify(bullets.text));
}

sec("And a number cut in half by the column edge goes back together");
{
  const got = await P.read(new Uint8Array(buildPdf([
    "Christmas Holiday: Dec. 2", "2", "-", "Dec. 25",
  ])).buffer);
  // THE WHOLE POINT: read as written this is the second of December, which is
  // three weeks early and looks entirely reasonable.
  ok("the number is whole again", /Dec\. 22-Dec\. 25/.test(got.text), JSON.stringify(got.text));
  const r = C.read(got.text, { year: 2026 });
  ok("and the holiday is the right four days",
     r.rows[0] && r.rows[0].date === "2026-12-22" && r.rows[0].endsOn === "2026-12-25",
     JSON.stringify(r.rows));

  // A BARE NUMBER IS USUALLY A SQUARE OF A CALENDAR, and joining those together
  // would destroy every grid this app can read. All three parts have to be
  // there before it touches one.
  // MOST SQUARES OF A MONTH ARE EMPTY, so most of a grid is bare numbers one
  // after another — a line ending in a digit followed by a line that is only
  // digits, over and over. Joining those turns the 11th and the 12th into the
  // one thousand one hundred and twelfth.
  const grid = await P.read(new Uint8Array(buildPdf([
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "4", "Inset day", "5", "Inset day", "6", "OFF", "7", "OFF",
    "8", "9", "10", "11", "12", "13", "14",
  ])).buffer);
  ok("a month grid is left completely alone",
     /\n4\nInset day\n5\nInset day\n6\nOFF/.test(grid.text), JSON.stringify(grid.text));
  ok("and a week of empty squares stays a week of squares",
     /\n8\n9\n10\n11\n12\n13\n14/.test(grid.text), JSON.stringify(grid.text));
  const month = C.gridIn(grid.text);
  ok("and still reads as a month", month && month.cells.length === 11,
     month ? String(month.cells.length) : "no grid");
}

// ---------------------------------------------------------------------------
// A semester's worth of prose, of the shape the page under the grid has. It
// mentions two years, and most of its lines say neither.
const PROSE = [
  "Example School 2026 School Year First Semester Calendar",
  "1. Aug. 31 14:00 Students arrival",
  "2. Sep. 1 Semester begins",
  "3. Paper submission and score input deadlines:",
  "Midterm", "Nov. 2 16:00", "Nov. 17 16:00",
  "Final", "Dec. 31 16:00", "Jan. 15 16:00",
  "4. Holidays:",
  "• Mid-Autumn Festival: Sep. 25",
  "• National Day: Oct. 1-Oct. 7",
  "• Christmas Holiday: Dec. 22-Dec. 25",
  "• New Year's Day: Jan. 1-Jan. 3, 2027",
  "5. Semester ends: Jan. 22, 2027",
].join("\n");

sec("A document with two years in it says so");
{
  const r = C.read(PROSE);
  ok("every year it mentions is counted", r.years.join(",") === "2026,2027", JSON.stringify(r.years));
  // WHICHEVER IS PICKED, HALF OF IT IS WRONG. Saying that is the only honest
  // thing available: there is no reading of this document that is right
  // throughout, and a silent choice looks exactly like a correct one.
  ok("and it says no one year is right for all of it",
     /no single year is right for all of it/.test(C.words(r)), C.words(r));
  ok("naming them", /2026 and 2027/.test(C.words(r)), C.words(r));
  ok("and saying what to do about it", /move any row/.test(C.words(r)), C.words(r));

  // A DOCUMENT WITH ONE YEAR IN IT SAYS NOTHING OF THE KIND — this must not
  // start nagging about every ordinary calendar.
  const one = C.read("Term starts 1 September 2026\nTerm ends 17 December 2026\nINSET day 25 September");
  ok("a document inside one year is left alone",
     !/no single year/.test(C.words(one)), C.words(one));

  // AND NEITHER IS NAMING TWO YEARS, ON ITS OWN. A booklet for the 2026-27
  // school year writes both on its cover and then talks about one week in
  // August, and every date in it is right. The tell is not what the cover says:
  // it is that the dates, once a year has been filled in, have been spread
  // across a whole one.
  const cover = C.read(["Orientation 2026 - 2027", "Aug. 24", "Aug. 25", "Aug. 26"].join("\n"));
  ok("two years on a cover and one week of dates says nothing either",
     !/no single year/.test(C.words(cover)), C.words(cover));
  ok("and the rows are all in the same year",
     cover.rows.every((x) => x.date.slice(0, 4) === cover.rows[0].date.slice(0, 4)),
     JSON.stringify(cover.rows.map((x) => x.date)));
}

sec("And two days nobody could name are two days");
{
  // THE FIRST DAY OF THIS SCHOOL YEAR AND THE LAST DAY OF THE NEXT are written
  // at opposite ends of a calendar, and when one of them has to borrow a year
  // they land on the same date for that reason alone. Neither has a name the
  // reader could find, so there is nothing to say they are the same thing — and
  // one of them was disappearing with nothing on screen to show it.
  const TWO = ["Example School Calendar", "Aug. 31", "Aug. 31, 2027"].join("\n");
  const r = C.read(TWO, { year: 2027 });
  ok("both lines survive landing on one day", r.rows.length === 2, JSON.stringify(r.rows));
  ok("and each keeps the line it came off",
     r.rows.some((x) => x.line === "Aug. 31") && r.rows.some((x) => /2027/.test(x.line)),
     JSON.stringify(r.rows.map((x) => x.line)));

  // BUT A CALENDAR LISTING THE SAME THING TWICE IS STILL ONE THING. That is
  // what the merging is for and it has to keep working.
  const twice = C.read(["Term ends 17 December 2026", "Term ends 17 December 2026"].join("\n"));
  ok("a day written twice under one name is one row", twice.rows.length === 1,
     JSON.stringify(twice.rows));
}

sec("And a row can be moved across the New Year on its own");
{
  ok("there is a way to ask for the same day in another year",
     typeof C.atYear === "function", "no such thing");
  ok("and it moves the year and nothing else", C.atYear("2027-09-25", 2026) === "2026-09-25",
     C.atYear("2027-09-25", 2026));
  // A DAY THAT ISN'T THERE IN THE OTHER YEAR is refused rather than rounded to
  // the first of March, which is a different day and would be kept as one.
  ok("a leap day has nowhere to go in a common year", C.atYear("2028-02-29", 2027) === "",
     C.atYear("2028-02-29", 2027));
  ok("and is fine in another leap year", C.atYear("2028-02-29", 2032) === "2032-02-29",
     C.atYear("2028-02-29", 2032));
}

sec("And the switch is on the page, next to the row it moves");
{
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const paste = r.get("#calPaste");
  paste.value = PROSE;
  paste.fire("input", { target: paste });
  await r.settle();

  const rows = r.get("#calRows").children;
  ok("the prose comes up as rows", rows.length >= 10, String(rows.length));
  const text = (row) => String(row.children[0].textContent);
  const sept = [...rows].find((x) => /Sep 25/.test(text(x)));
  ok("the autumn dates are there", !!sept, [...rows].map(text).join(" | "));
  // Read as 2027, because that is the year the document says most often — and
  // the Mid-Autumn Festival of this school year was in 2026.
  ok("and start out in the wrong year", /2027/.test(text(sept)), text(sept));

  const swap = [...sept.children].find((c) => /move to 2026/.test(String(c.textContent || "")));
  ok("with a switch to the other one", !!swap,
     [...sept.children].map((c) => c.textContent).join(" / "));
  swap.fire("click", { target: swap });
  await r.settle();
  const after = [...r.get("#calRows").children].find((x) => /Sep 25/.test(text(x)));
  ok("and pressing it moves that row", /2026/.test(text(after)), text(after));
  // ONE ROW, NOT ALL OF THEM. Changing the year in the box moves everything,
  // which is exactly what is no use here.
  const jan = [...r.get("#calRows").children].find((x) => /Jan 15/.test(text(x)));
  ok("and leaves the others where they were", jan && /2027/.test(text(jan)), jan && text(jan));
}

sec("And a row that wrote its own year is not offered the choice");
{
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  const paste = r.get("#calPaste");
  paste.value = PROSE;
  paste.fire("input", { target: paste });
  await r.settle();
  const rows = [...r.get("#calRows").children];
  const said = rows.find((x) => /Jan 22/.test(String(x.children[0].textContent)));
  ok("the row that said 2027 itself is there", !!said,
     rows.map((x) => x.children[0].textContent).join(" | "));
  // NOTHING TO DECIDE. The document said which year this one is, so offering to
  // move it would be inviting somebody to break a line that was already right.
  ok("and has no year switch on it",
     !!said && ![...said.children].some((c) => /move to/.test(String(c.textContent || ""))),
     [...said.children].map((c) => c.textContent).join(" / "));
}

done();
