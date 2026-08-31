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

// ---------------------------------------------------------------------------
// THE GRID ITSELF: a whole term in one table, a week to a row, the week's
// number down the left and the day numbers running straight through the month
// ends. Flattened out of a PDF it is a stream of bare numbers with the odd
// symbol in it and not one date anywhere.
//
// Ten weeks of an invented autumn term. Sunday-first, starting on a Tuesday so
// the first row is short — which is what a term that begins mid-week looks like
// and what stops the first number saying anything about the columns.
const TERM = [
  "Example School Autumn Term",
  "Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
  "1", "9/1", "2", "3", "4", "Ý", "5",
  "2", "6", "7u", "8", "9", "10", "11", "Ý", "12",
  "3", "13", "14", "15", "16", "17", "18", "Ý", "19",
  "4", "20", "21", "22", "23", "24", "25", "26",
  "5", "27", "28", "!", "29", "30", "10/1", "2", "3",
  "6", "4", "5u", "6", "7", "8", "9", "Ý", "10",
  "7", "11", "12", "13", "14", "15", "16", "Ý", "17",
  "8", "18", "19", "20", "21", "22", "23", "Ý", "24",
  "9", "25", "26", "!", "27", "28", "29", "30", "Ý", "31",
  "10", "11/1", "2", "3", "4", "5", "6", "Ý", "7",
  "!", "\"", "Head of Year Meeting",
  "u", "\"", "Mentor Meeting",
  "Ý", "Staff Meeting",
  "Notes",
  "1. Sep. 1 Term begins",
  "2. Paper deadline: Oct. 12 16:00",
].join("\n");

sec("A whole term drawn as one grid is read");
{
  const g = C.weekGridIn(TERM);
  ok("it is recognised", !!g, "nothing found");
  ok("with a row per week", g && g.weeks.length === 10, g && String(g.weeks.length));
  ok("and the first column's weekday", g && g.startDow === 0, g && String(g.startDow));
  // A TERM THAT STARTS MID-WEEK has a short first row, and the numbers in it
  // could be sitting anywhere across the seven columns.
  ok("a short first week is still a week", g && g.weeks[0].days.length === 5,
     g && String(g.weeks[0].days.length));
  ok("and a full one has seven", g && g.weeks[1].days.length === 7,
     g && String(g.weeks[1].days.length));
  // THE WEEK NUMBERS ARE NOT DAYS. They break the run, which is the only thing
  // that says so — and a row holds at most seven days, which settles the rest.
  ok("no week number was read as a day",
     g && g.weeks.every((w) => w.days.length <= 7), g && JSON.stringify(g.weeks.map((w) => w.days.length)));
  ok("and the weeks are numbered as the grid numbers them",
     g && g.weeks.map((w) => w.n).join(",") === "1,2,3,4,5,6,7,8,9,10",
     g && g.weeks.map((w) => w.n).join(","));
  // THE MONTH ENDS ARE WALKED THROUGH, said by the squares that write one.
  const oct = g && g.weeks[4].days.find((d) => d.month === 10);
  ok("a month written into a square is taken", oct && oct.day === 1, JSON.stringify(oct));
  ok("and the days carry on from it",
     g && g.weeks[5].days[0].month === 10 && g.weeks[5].days[0].day === 4,
     g && JSON.stringify(g.weeks[5].days[0]));
}

sec("And a two-digit day is a day, not a day with a mark on it");
{
  // WRITTEN LOOSELY, "10" SPLITS into a day called 1 with a mark called 0, and
  // the grid falls over on the tenth of every month.
  const g = C.weekGridIn(TERM);
  const tenth = g && g.weeks[1].days.find((d) => d.day === 10);
  ok("the tenth is the tenth", !!tenth, JSON.stringify(g && g.weeks[1].days));
  ok("and carries no mark", tenth && !tenth.marks.length, tenth && JSON.stringify(tenth.marks));
  ok("while a real one glued to its number does",
     g && g.weeks[1].days[1].marks.join("") === "u", g && JSON.stringify(g.weeks[1].days[1]));
}

sec("And a week number that looks exactly like the next day is still a week number");
{
  // THE ONE PLACE THE RUN OF NUMBERS ISN'T ENOUGH. Week 6 arrives right where
  // the sixth of the month would, and both readings fit — but a row holds seven
  // days and this one already has seven, so it cannot be a day. Without that,
  // week 6 becomes the 6th, its row grows to eight days, and every week after
  // it is numbered one out.
  const CLASH = [
    "Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "1", "3/2", "3", "4", "5", "6", "7", "8",
    "2", "9", "10", "11", "12", "13", "14", "15",
    "3", "16", "17", "18", "19", "20", "21", "22",
    "4", "23", "24", "25", "26", "27", "28", "29",
    "5", "30", "31", "4/1", "2", "3", "4", "5",
    "6", "6", "7", "8", "9", "10", "11", "12",
  ].join("\n");
  const g = C.weekGridIn(CLASH);
  ok("it reads", !!g, "not read");
  ok("with six weeks, not five", g && g.weeks.length === 6, g && String(g.weeks.length));
  ok("and none of them eight days long",
     g && g.weeks.every((w) => w.days.length === 7),
     g && JSON.stringify(g.weeks.map((w) => w.days.length)));
  ok("and the last week starts on the sixth",
     g && g.weeks[5].days[0].month === 4 && g.weeks[5].days[0].day === 6,
     g && JSON.stringify(g.weeks[5].days[0]));
}

sec("And which year it is comes out of the grid's own shape");
{
  const g = C.weekGridIn(TERM);
  // The second week is the first full one, so its first number is in the first
  // column — the only thing in the document that pins a weekday to a date.
  ok("the anchor is the first full week's first day",
     g && g.anchor && g.anchor.month === 9 && g.anchor.day === 6, JSON.stringify(g && g.anchor));
  // 6 September falls on a Sunday in 2026 and in no other year nearby.
  ok("one year fits", C.weekGridYears(g, 2026).join(",") === "2026",
     JSON.stringify(C.weekGridYears(g, 2026)));
  // AND IT IS FOUND FROM THE WRONG END TOO. The document's own most-mentioned
  // year is no use here, so the grid has to be able to correct it.
  ok("and is found even when the guess was a year out",
     C.weekGridYears(g, 2028).join(",") === "2026", JSON.stringify(C.weekGridYears(g, 2028)));
}

sec("And the symbols mean what the legend says");
{
  const g = C.weekGridIn(TERM);
  ok("every symbol used has a name", g && Object.keys(g.legend).length === 3,
     JSON.stringify(g && g.legend));
  ok("and they are the right way round",
     g && g.legend["Ý"] === "Staff Meeting" && g.legend["u"] === "Mentor Meeting" &&
     g.legend["!"] === "Head of Year Meeting", JSON.stringify(g && g.legend));

  const marks = C.weekGridMarks(g, 2026);
  const staff = marks.find((m) => m.name === "Staff Meeting");
  ok("the marked days are gathered under it", staff && staff.dates.length === 8,
     staff && String(staff.dates.length));
  ok("dated properly, across the month end",
     staff && staff.dates[0] === "2026-09-04" && staff.dates[staff.dates.length - 1] === "2026-11-06",
     staff && JSON.stringify([staff.dates[0], staff.dates[staff.dates.length - 1]]));
  // EVERY WEEK ON THE SAME DAY, which is what a staff meeting is — and worth
  // saying, because it is the difference between a pattern and a pile of dates.
  ok("and it knows they are all Fridays", staff && staff.weekday === 5 && staff.odd === 0,
     staff && `${staff.weekday}/${staff.odd}`);
}

sec("And the grid says which year each month is in");
{
  // THE THING NO AMOUNT OF STARING AT A LIST OF DATES CAN SETTLE. A term
  // calendar walks from one year into the next in front of you, so it knows —
  // and nothing here assumes anything about when a school year starts.
  const OVER = TERM
    .replace('"10", "11/1", "2", "3", "4", "5", "6", "Ý", "7",', "")
    .replace("Notes", "Notes");
  const g = C.weekGridIn(TERM);
  const map = C.weekGridMonths(g, 2026);
  ok("September is the year it started in", map.get(9) === 2026, String(map.get(9)));
  ok("and so is November", map.get(11) === 2026, String(map.get(11)));

  // A GRID THAT RUNS ON INTO JANUARY, which is where it earns its keep: the
  // months go 12 then 1, and the only way that happens is a new year.
  const CROSS = [
    "Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "1", "12/6", "7", "8", "9", "10", "11", "12",
    "2", "13", "14", "15", "16", "17", "18", "19",
    "3", "20", "21", "22", "23", "24", "25", "26",
    "4", "27", "28", "29", "30", "31", "1/1", "2",
    "5", "3", "4", "5", "6", "7", "Ý", "8", "9",
    "Ý", "Staff Meeting",
  ].join("\n");
  const g2 = C.weekGridIn(CROSS);
  ok("a grid that crosses New Year is still one grid", !!g2, "not read");
  const m2 = g2 ? C.weekGridMonths(g2, 2026) : new Map();
  ok("December is the old year", m2.get(12) === 2026, String(m2.get(12)));
  ok("and January is the new one", m2.get(1) === 2027, String(m2.get(1)));
  // AND THE MARK IN JANUARY IS DATED IN JANUARY'S YEAR.
  const late = g2 ? C.weekGridMarks(g2, 2026)[0] : null;
  ok("a day marked after the turn is in the new year",
     late && late.dates[0] === "2027-01-07", late && JSON.stringify(late.dates));
}

sec("And the whole document is dated by it");
{
  const r = C.read(TERM);
  // THE PROSE UNDER THE GRID gets its year from the grid rather than from a
  // count of which year the document mentions most.
  ok("the term is reported", r.term && r.term.weeks === 10, JSON.stringify(r.term && r.term.weeks));
  ok("with where it starts and stops", r.term && r.term.from === "2026-09-01" &&
     r.term.to === "2026-11-07", JSON.stringify(r.term && [r.term.from, r.term.to]));
  ok("and the year it settled on", r.year === 2026, String(r.year));
  const oct = r.rows.find((x) => /Oct/.test(x.line));
  ok("a line underneath is dated in the grid's year", oct && oct.date === "2026-10-12",
     oct && oct.date);
  ok("and the words say where the years came from",
     /which is where the years came from/.test(C.words(r)), C.words(r));
  ok("and how many things are marked on it", /3 things are marked/.test(C.words(r)), C.words(r));
}

sec("And a grid that crosses New Year settles the whole document");
{
  // THE CASE THAT HAS NO OTHER ANSWER. December and January in one term, a
  // handbook that mentions a different year twice in its own title and footer,
  // and two lines underneath with no year on them at all. Counting which year
  // the document says most often gets both of them wrong; the grid walked from
  // one year into the next in front of us and is simply right.
  const CROSS_DOC = [
    "Example School 2028 Handbook",
    "Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "1", "12/6", "7", "8", "9", "10", "11", "12",
    "2", "13", "14", "15", "16", "17", "18", "19",
    "3", "20", "21", "22", "23", "24", "25", "26",
    "4", "27", "28", "29", "30", "31", "1/1", "2",
    "5", "3", "4", "5", "6", "7", "Ý", "8", "9",
    "Ý", "Staff Meeting",
    "Notes",
    "Reports out: Dec. 18",
    "Term ends: Jan. 8",
    "Reviewed 2028",
  ].join("\n");
  const r = C.read(CROSS_DOC);
  ok("the year the document says most often is not the one used",
     C.docYear(CROSS_DOC) === 2028 && r.year === 2026, `${C.docYear(CROSS_DOC)} / ${r.year}`);
  const dec = r.rows.find((x) => /Reports out/.test(x.line));
  const jan = r.rows.find((x) => /Term ends/.test(x.line));
  ok("a December line is in the year the term started",
     dec && dec.date === "2026-12-18", dec && dec.date);
  // THE POINT OF ALL OF IT. Nothing here assumes a school year starts in the
  // autumn; the grid crossed the New Year and said so.
  ok("and a January line is in the year after it",
     jan && jan.date === "2027-01-08", jan && jan.date);
  ok("and neither is left looking like a choice",
     !/no single year is right/.test(C.words(r)), C.words(r));
}

// ---------------------------------------------------------------------------
// HOW LONG A HOLIDAY RUNS, AND WHO GETS TO SAY.
//
// A calendar with both a term grid and a page of prose says some things twice,
// and the app believed the weaker of the two.
//
// A one-day Mid-Autumn Festival is one square on the grid. The prose lists it,
// and lists National Day after it, and the app offered — as the only edit
// available — to marry the two lines into a seven-day Mid-Autumn Festival. Yes
// or no, and no third answer, including the true one:
//
//     Fri, 25 Sept 2026 — Mid-Autumn Festival   [day off]
//        runs on to Thu, 1 Oct 2026 — 7 days?
//
// The grid in the same document draws 25 Sept as one marked square with an
// unmarked square after it, and 1-7 Oct as seven. Nothing needed guessing.
const RUNS = [
  "Example School Autumn Term",
  "Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
  "1", "9/20 Makeup", "21", "22", "23", "24", "25 Holiday", "26",
  "2", "27", "28", "29", "30", "10/1 Holiday", "2 Holiday", "3 Holiday",
  "3", "4 Holiday", "5 Holiday", "6 Holiday", "7 Holiday", "8", "9 Staff Mtg", "10 Makeup",
  // A SECOND STAFF MEETING, because one of anything is not a kind of day: a
  // mark with a single date is dropped as a one-off, so a fixture with one
  // would be testing the meeting case against nothing at all.
  "4", "11", "12", "13", "14", "15", "16 Staff Mtg", "17",
  "Notes",
  "Sep. 25 Mid-Autumn Festival",
  "Oct. 1 National Day",
].join("\n");

sec("A day the calendar draws as one square is one day");
{
  const r = C.read(RUNS, { year: 2026 });
  const mid = r.rows.find((x) => /Mid-Autumn/.test(x.label));
  const nat = r.rows.find((x) => /National Day/.test(x.label));
  ok("both lines are read", !!mid && !!nat, JSON.stringify(r.rows.map((x) => x.label)));
  ok("the one-day holiday ends the day it starts", mid && mid.endsOn === "2026-09-25",
     mid && JSON.stringify({ date: mid.date, endsOn: mid.endsOn }));
  ok("and says the calendar is where that came from", mid && mid.endFrom === "grid", mid && mid.endFrom);
  // AND THE SEVEN-DAY ONE IS SEVEN, off the same evidence.
  ok("the seven-day holiday runs seven days", nat && nat.endsOn === "2026-10-07",
     nat && JSON.stringify({ date: nat.date, endsOn: nat.endsOn }));

  // THE OFFER THAT WAS WRONG. A row the document has already answered must not
  // be asked about — and `canSpan` is the one flag the page reads to decide
  // whether to draw the tick at all.
  const chosen = r.rows.map((x) => (/Mid-Autumn|National/.test(x.label) ? { ...x, kind: "off" } : x));
  const plan = C.plan(chosen);
  const one = plan.find((p) => /Mid-Autumn/.test(p.label));
  ok("it covers one day", one && one.days === 1, one && String(one.days));
  ok("and is not offered a run-on to the next line", one && !one.canSpan,
     one && `offered ${one.wouldBe} days to ${one.wouldEnd}`);
  const seven = plan.find((p) => /National/.test(p.label));
  ok("and the week off is seven days", seven && seven.days === 7, seven && String(seven.days));
  ok("and not offered one either", seven && !seven.canSpan, "still guessing");
}

sec("And you can say how long it runs when the app has it wrong");
{
  // THE WHOLE OF WHAT WAS MISSING. "so i either have the option to tell it to
  // put 7 days for a one day holiday or not" — two answers, neither correct.
  // An end date is a date, so it is a date box, and it wins over everything
  // the document said.
  const r = C.read(RUNS, { year: 2026 });
  // EVERY row is a day off here, so the row being edited always has a next one
  // to be offered. With only the edited row marked, `plan` sees a list of one,
  // there is nothing to run on to, and no rule about run-ons can fail.
  const say = (label, endsOn) =>
    C.plan(r.rows.map((x) => ({ ...x, kind: "off", endsOn: x.label.includes(label) ? endsOn : x.endsOn })))
      .find((p) => p.label.includes(label));

  const longer = say("Mid-Autumn", "2026-09-27");
  ok("a one-day holiday can be made three", longer && longer.days === 3, longer && String(longer.days));
  ok("and covers the days in between", longer && longer.to === "2026-09-27", longer && longer.to);
  // AND SHORTER, which no tick could ever have expressed.
  const shorter = say("National Day", "2026-10-03");
  ok("a week off can be cut to three days", shorter && shorter.days === 3, shorter && String(shorter.days));
  // AND BACK TO ONE. An end equal to the start is an answer, not a blank — read
  // as a blank it fell through to "no end given", and the offer to swallow the
  // next line came straight back. Said on the row that HAS a next line, because
  // on the last row of a document there is nothing to run on to and any rule
  // whatsoever passes.
  const back = say("Mid-Autumn", "2026-09-25");
  ok("and back to the single day it starts on", back && back.days === 1, back && String(back.days));
  ok("with no run-on offered on top of it", back && !back.canSpan,
     back && `offered ${back.wouldBe} days to ${back.wouldEnd}`);

  // AND THE DAYS THAT GET KEPT ARE THE DAYS THAT WERE SHOWN. The preview and
  // the save read the same plan for exactly this reason.
  const kept = C.toBlocks(r.rows.map((x) =>
    /Mid-Autumn/.test(x.label) ? { ...x, kind: "off", endsOn: "2026-09-27" } : x));
  ok("three days are kept, not one and not seven", kept.length === 3,
     JSON.stringify(kept.map((b) => b.date)));
  ok("and they are the three days named", kept.map((b) => b.date).join(",") ===
     "2026-09-25,2026-09-26,2026-09-27", JSON.stringify(kept.map((b) => b.date)));
}

sec("And a marked day says which days, not roughly when");
{
  // "Makeup — 2 days, no day in particular, Sun, 20 Sept 2026 to Sat, 10 Oct
  // 2026" is a sentence about two days the calendar names outright. It reads as
  // "two days somewhere in those three weeks", which is the opposite of what
  // the document says — and there was nothing else on offer.
  const r = C.read(RUNS, { year: 2026 });
  const marks = r.term.marks;
  const by = (n) => marks.find((m) => m.name === n);

  const makeup = by("Makeup");
  ok("the two makeup days are two separate days", makeup && makeup.runs.length === 2,
     makeup && JSON.stringify(makeup.runs));
  ok("and each is one day long", makeup && makeup.runs.every(([a, z]) => a === z),
     makeup && JSON.stringify(makeup.runs));
  // AND DAYS IN A ROW ARE ONE STRETCH, which is the other half of the same
  // question: eight holidays over two weeks are not eight things.
  const hol = by("Holiday");
  ok("the holidays are two stretches, not eight days", hol && hol.runs.length === 2,
     hol && JSON.stringify(hol.runs));
  ok("one of them a single day", hol && hol.runs.some(([a, z]) => a === z && a === "2026-09-25"),
     hol && JSON.stringify(hol.runs));
  ok("and one of them a week", hol && hol.runs.some(([a, z]) => a === "2026-10-01" && z === "2026-10-07"),
     hol && JSON.stringify(hol.runs));
}

sec("And the page lets you say it, rather than only offering its guess");
{
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const paste = r.get("#calPaste");
  paste.value = RUNS;
  paste.fire("input", { target: paste });
  await r.settle();

  const rowFor = (t) => [...r.get("#calRows").children]
    .find((x) => new RegExp(t).test(String(x.children[0].textContent)));
  const kid = (row, cls) => row && [...(row.children || [])].find((c) => String(c.className || "").includes(cls));
  const press = (row, words) => {
    const b = [...row.children].find((c) => String(c.textContent || "") === words);
    if (b) b.fire("click", { target: b });
  };

  const mid = rowFor("Mid-Autumn");
  ok("the one-day holiday is on the page", !!mid,
     [...r.get("#calRows").children].map((x) => x.children[0].textContent).join(" | "));
  press(mid, "day off");
  await r.settle();

  // NOTHING TO SEE UNTIL IT IS GOING IN, and then the length is a box.
  const after = rowFor("Mid-Autumn");
  const until = kid(after, "cal-until");
  ok("how long it runs is shown", !!until,
     [...after.children].map((c) => c.className).join(" / "));
  // A missing box must FAIL a check, not throw and take the whole run down with
  // it — a suite that dies tells you far less than one that says which line.
  const box = until && [...until.children].find((c) => String(c.className || "").includes("cal-upto"));
  ok("as a date you can change", box && box.type === "date", box && box.type);
  ok("filled in with the day the calendar draws", box && box.value === "2026-09-25", box && box.value);
  // The words are on the piece that holds them, not on the wrapper: the stub
  // has no computed textContent, so reading the parent gets "" and any check
  // that a phrase is ABSENT passes without looking at anything.
  const howLong = (row) => String((kid(kid(row, "cal-until"), "cal-howlong") || {}).textContent || "");
  ok("saying how long that is", /one day/.test(howLong(after)), howLong(after));
  ok("and where it came from", /as the calendar draws it/.test(howLong(after)), howLong(after));
  // AND NO OFFER TO SWALLOW THE NEXT LINE, which was the only edit there was.
  const says = [...after.children].map((c) => String(c.textContent || "")).join(" ");
  ok("with no seven-day offer against a one-day holiday", !/runs on to/.test(says), says);

  // TYPING IN IT CHANGES WHAT IT COVERS.
  if (box) { box.value = "2026-09-27"; box.fire("change", { target: box }); }
  await r.settle();
  const grown = rowFor("Mid-Autumn");
  ok("and typing a later date makes it that long", /3 days/.test(howLong(grown)), howLong(grown));
  ok("and stops crediting the calendar for a date you typed",
     howLong(grown) !== "" && !/as the calendar draws it/.test(howLong(grown)), howLong(grown));
}

sec("And a marked day is asked what it is, not assumed to be a meeting");
{
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  const paste = r.get("#calPaste");
  paste.value = RUNS;
  paste.fire("input", { target: paste });
  await r.settle();

  const marks = () => [...r.get("#calMarks").children]
    .filter((x) => String(x.className || "") === "cal-mark");
  const markFor = (t) => marks().find((x) => new RegExp(t).test(said(x)));
  // The stub keeps no computed textContent, so what a block SAYS is what its
  // pieces say — gathered here rather than in five places below.
  const said = (node) => {
    let out = String(node.textContent || "");
    (node.children || []).forEach((c) => { out += " " + said(c); });
    return out;
  };
  const kidsOf = (node, cls) =>
    (node.children || []).reduce((acc, c) =>
      acc.concat(String(c.className || "").includes(cls) ? [c] : kidsOf(c, cls)), []);

  ok("the marked days come up", marks().length >= 3, String(marks().length));

  // WHAT IT SAYS ABOUT THEM. Two makeup days three weeks apart were "2 days, no
  // day in particular, Sun 20 Sept to Sat 10 Oct" — a sentence that means "we
  // don't know" about two days the calendar names outright.
  const makeup = markFor("Makeup");
  ok("it names the days rather than the gap between them",
     makeup && !/no day in particular/.test(said(makeup)), makeup && said(makeup));
  ok("both of them", makeup && /Sep 20/.test(said(makeup)) && /Oct 10/.test(said(makeup)),
     makeup && said(makeup));

  // AND WHAT IT ASKS ABOUT THEM. Every kind of marked day used to arrive as an
  // hour in your week with "somewhere you have to be" already ticked — so a
  // calendar with fifteen holidays on it offered to book you in for all
  // fifteen, and there was no other answer anywhere on the page.
  const hol = markFor("Holiday");
  const opts = (m) => kidsOf(m, "cal-mark-kind").map((b) => String(b.textContent));
  ok("a holiday is offered as a day off", hol && opts(hol).includes("day off"), hol && opts(hol).join(" / "));
  ok("and as a day without lessons", hol && opts(hol).includes("no lessons"), hol && opts(hol).join(" / "));
  ok("and as something in your week", hol && opts(hol).includes("in my week"), hol && opts(hol).join(" / "));
  ok("and can be left alone", hol && opts(hol).includes("ignore"), hol && opts(hol).join(" / "));
  // NOT ASKED UNTIL IT IS THE QUESTION. A start time and "somewhere you have to
  // be" are questions about a block in your week; against a holiday they were
  // noise, and against fifteen of them they were alarming.
  ok("and is not asked what time a holiday starts",
     hol && kidsOf(hol, "cal-mark-time").length === 0, "still asking for a time");
  ok("nor whether you have to be at one",
     hol && kidsOf(hol, "cal-mark-be").length === 0, "still asking about attendance");
  ok("and nothing is offered to keep until one is chosen",
     hol && kidsOf(hol, "cal-mark-add").length === 0, "offering to keep an unanswered question");

  const off = kidsOf(hol, "cal-mark-kind").find((b) => String(b.textContent) === "day off");
  off.fire("click", { target: off });
  await r.settle();
  const hol2 = markFor("Holiday");
  const add = kidsOf(hol2, "cal-mark-add")[0];
  ok("once said, it offers to mark them off", add && /mark 8 days off/.test(String(add.textContent)),
     add && String(add.textContent));
  add.fire("click", { target: add });
  await r.settle();

  // AND THEY LAND AS DAYS OFF, not as eight one-hour meetings called Holiday.
  const sched = r.state.schedule || [];
  ok("the days go in", sched.length === 8, JSON.stringify(sched.map((b) => b.date)));
  ok("as days off", sched.every((b) => b.blocksDay), JSON.stringify(sched.map((b) => b.blocksDay)));
  ok("none of them as something to attend", !sched.some((b) => b.beThere),
     JSON.stringify(sched.filter((b) => b.beThere)));
  ok("and they are the days the calendar marked", sched[0] && sched[0].date === "2026-09-25",
     JSON.stringify(sched.map((b) => b.date)));

  // AND THE ONE THAT REALLY IS A MEETING still asks what it needs to.
  const stf = markFor("Staff Mtg");
  const wk = kidsOf(stf, "cal-mark-kind").find((b) => String(b.textContent) === "in my week");
  wk.fire("click", { target: wk });
  await r.settle();
  const stf2 = markFor("Staff Mtg");
  ok("a meeting is still asked what time it starts",
     kidsOf(stf2, "cal-mark-time").length === 1, "the time question went with it");
  ok("and whether you have to be there",
     kidsOf(stf2, "cal-mark-be").length === 1, "the attendance question went with it");
}

sec("And nothing else is read as a term grid");
{
  // A MONTH GRID HAS NO WEEK COLUMN, and reading one as a term would turn the
  // words in its squares into marks on its days.
  const MONTH = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "4", "Inset day", "5", "Inset day", "6", "OFF", "7", "OFF", "8", "9", "10"].join("\n");
  ok("a month grid is not a term grid", !C.weekGridIn(MONTH), JSON.stringify(C.weekGridIn(MONTH)));
  ok("and still reads as a month", !!C.gridIn(MONTH), "the month reader lost it");
  // THE HEADING IS WHAT SAYS THERE IS A COLUMN THAT ISN'T A DAY, and without
  // one the numbers down the left-hand side have nothing to be. The same grid
  // with its "Week" heading taken off is not a term grid.
  const NO_COLUMN = TERM.split("\n").filter((l) => l !== "Week").join("\n");
  ok("and a grid whose leading column has no heading is not one either",
     !C.weekGridIn(NO_COLUMN), JSON.stringify(C.weekGridIn(NO_COLUMN)));
  // A term-dates list has no day names above it at all.
  ok("a list of dates is not one either",
     !C.weekGridIn("Term starts 1 September 2026\nTerm ends 17 December 2026"), "read as a grid");
  // AND A TABLE OF NUMBERS UNDER SEVEN DAY NAMES has to run like days.
  const NOT = ["Group", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "1", "4", "9", "17", "22", "31", "40", "55",
    "2", "3", "8", "12", "19", "27", "33", "48"].join("\n");
  ok("numbers that don't run like days are not a term", !C.weekGridIn(NOT),
     JSON.stringify(C.weekGridIn(NOT)));
}

done();
