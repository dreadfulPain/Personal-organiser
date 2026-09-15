import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// ONE CELL, SEVERAL DATES, ONE THING.
//
// A staff calendar drawn as a table puts the recurring items in a single cell:
//
//     Parent Conferences | 21 Nov; 12 Mar; 14 May
//     Reports Due        | 6 Nov 16:00, 26 Mar 16:00, 25 Jun 16:00
//     Fire Drill         | 18 Sep
//                        | 22 Jan
//                        | 7 May
//
// That is ONE row of the document describing THREE occurrences of ONE thing.
// All three share a name, a time, whoever it is for, and the line they came
// off; what differs is the day. Read as three unrelated rows they arrive with
// three different names, three separate questions to answer, and — the one
// that actually loses a date — two of them called "(no name)".
//
// THE YEAR IS THE OTHER HALF OF IT. "21 Nov; 12 Mar; 14 May" on a 2026-27
// calendar is November 2026 and then March and May 2027, and the January line
// of the drill is 2027 too. Nothing on those clauses says so. Working it out
// from the order they are listed in is right for a sentence that runs forwards
// and wrong for a table cell, which is sorted by nothing in particular:
// "12 Mar, 21 Nov, 14 May" is one school year read three ways if you go by
// order and one school year full stop if you go by the year the document is
// about.
//
// WHAT MUST NOT HAPPEN, and is the reason none of this merges anything: two
// genuinely different things in one cell on one day stay two. A cell reading
// "Staff Briefing 08:00; Family Conferences 15:30" on a single date is two
// events, and the whole of this file would be a bad trade if it cost that.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done: finish } = checker();

import { dayPdf } from "./_pdf.mjs";

const PUB = path.join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DataView, TextDecoder,
  Error, DecompressionStream, Response, Blob, setTimeout };
sb.window = sb;
vm.createContext(sb);
["dates.js", "schedule.js", "dayshape.js", "ics.js", "pdftext.js", "roster.js",
 "goalplan.js", "priority.js", "dayplan.js", "timetable.js", "calplan.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const CP = sb.OrganiserCalPlan, PDF = sb.OrganiserPdfText;

// A 2026-27 school year, the way the reader is told about one: the year the
// document is about, which is what the page's year box holds.
const read = (text, opts) => CP.read(text, { year: 2026, ...(opts || {}) });
const show = (r) => JSON.stringify(r.rows.map((x) =>
  `${x.date}${x.endsOn && x.endsOn !== x.date ? "→" + x.endsOn : ""} ${x.label}` +
  `${x.start ? " @" + x.start : ""}${x.series ? " «" + x.series + "»" : ""}`));
const on = (r, d) => r.rows.filter((x) => x.date === d);

// ---------------------------------------------------------------------------
console.log("\nThree dates in one cell, however they are separated");

// SEMICOLONS. The commonest, and the one that already worked — here so that
// making commas and line breaks work cannot quietly stop it working.
{
  const r = read("Parent Conferences: 21 Nov; 12 Mar; 14 May");
  ok("semicolons: three days", r.rows.length === 3, show(r));
  ok("  on the days the cell names",
     ["2026-11-21", "2027-03-12", "2027-05-14"].every((d) => on(r, d).length === 1), show(r));
  ok("  all three called the same thing",
     r.rows.every((x) => x.label === "Parent Conferences"), show(r));
}

// COMMAS. A calendar separates a list of dates with a comma at least as often,
// and the comma was not a separator — so the second entry's name came out
// "Parent Conferences — , , 14 May": the third date, sitting inside the second
// one's name, and a pair of orphaned commas in front of it.
{
  const r = read("Parent Conferences: 21 Nov, 12 Mar, 14 May");
  ok("commas: three days", r.rows.length === 3, show(r));
  ok("  on the days the cell names",
     ["2026-11-21", "2027-03-12", "2027-05-14"].every((d) => on(r, d).length === 1), show(r));
  ok("  all three called the same thing, with no stray punctuation",
     r.rows.every((x) => x.label === "Parent Conferences"), show(r));
}

// AND THE SAME COMMA DIVIDING THREE DIFFERENT THINGS. The cell above is one
// event on three days; this is three events, and the comma is the only thing
// telling them apart. Read as part of the words, the second one came out
// called "Sports Day — Speech Day , Prize Giving": its own name, the name of
// the one after it, and the subject of the one before it, in one row.
{
  const r = read("Sports Day 14 May, Speech Day 21 May, Prize Giving 4 Jun");
  ok("three named things on one line keep their own names",
     on(r, "2026-05-14")[0] && /^Sports Day$/.test(on(r, "2026-05-14")[0].label) &&
     /Speech Day/.test((on(r, "2026-05-21")[0] || {}).label || "") &&
     !/Prize/.test((on(r, "2026-05-21")[0] || {}).label || ""), show(r));
  ok("  and are not one thing three times", !r.rows.some((x) => x.series), show(r));
}

// LINE BREAKS, THE WAY A PDF ACTUALLY MAKES THEM. A cell holding a term's
// worth of dates is wider than its column, so it wraps — and it wraps wherever
// it happens to reach the edge, which on a real staff calendar was in the
// middle of "15 Dec". Read as written that is a meeting in December lost
// outright, a row called "; ; ; ; 15", and a row called "Dec;" on a day nobody
// meets. Mending it is the extractor's job, so this one is a PDF: the fault
// does not exist in text somebody typed.
{
  const read0 = await PDF.read(new Uint8Array(dayPdf()).buffer);
  ok("a cell cut mid-date opens", read0.ok, String(read0.ok));
  const r = CP.read(read0.text, { year: 2026 });
  ok("a cell cut between a day and its month is put back together",
     r.rows.length === 6, show(r));
  ok("  including the day the break fell on",
     on(r, "2026-12-15").length === 1, show(r));
  ok("  all of them the meeting the cell before it names",
     r.rows.every((x) => x.label === "Lower School Team Meeting"), show(r));
  ok("  and none of them a row called by the half-date it was cut at",
     !r.rows.some((x) => /^Dec|^; /.test(x.label)), show(r));
  // AND THE TIME IS IN A CELL OF ITS OWN, TWO ALONG. Six meetings at twenty to
  // four, and the twenty to four is nowhere near the dates: a line that is
  // nothing but a clock cannot be an entry, so in this column it belongs to
  // this row. What is between them — who it is for — is stepped over, because
  // this app has no column headings to know what that line IS.
  ok("  at the time the cell further along the row gives",
     r.rows.every((x) => x.start === "15:40"), JSON.stringify(r.rows.map((x) => x.start)));
  ok("  and all one series", new Set(r.rows.map((x) => x.series)).size === 1 &&
     r.rows.every((x) => x.ofSeries === 6), show(r));
}

// AND WITH NO SEPARATOR AT ALL. A table's cells are divided by where they sit
// on the page, not by punctuation, so a row of them flattened into one line can
// arrive as dates with nothing but spaces between them. Nothing here can tell
// which of those is the entry — but a DATE IS NEVER PART OF A NAME, so what
// must not happen is the first one being labelled by the rest: "Autumn Term
// Meetings 9 Oct 6 Nov" put two more dates in the name of a third, and a name
// with a date in it is a name this app will hand back to you next term as
// though you had agreed to it.
{
  const r = read("Department Meetings\n18 Sep 9 Oct 6 Nov\nAll staff");
  ok("dates with nothing between them put none of themselves in a name",
     !r.rows.some((x) => /\b(?:Sep|Oct|Nov)\b/.test(x.label)), show(r));
}

// STACKED, ONE DATE TO A LINE. The same cell drawn tall instead of wide. The
// name is in the cell before it and the dates come down the page under it,
// which is a shape this reader already had a rule for — here so that none of
// the above quietly breaks it.
{
  const r = read([
    "Whole-school events",
    "Sports Day",
    "8 Jun 2026",
    "Parent Conferences",
    "21 Sep",
    "12 Nov",
    "14 Dec",
  ].join("\n"));
  ok("stacked in a cell: three days are named by the cell above them",
     ["2026-09-21", "2026-11-12", "2026-12-14"]
       .every((d) => on(r, d).length === 1 && on(r, d)[0].label === "Parent Conferences"),
     show(r));
}

// ---------------------------------------------------------------------------
console.log("\nThe year, read off the document rather than off the order");

// A calendar that writes SOME of its years out — and they all do: the line
// saying when it was issued, the term blocks at the back, the two or three
// entries somebody typed in full. Those say what stretch of time the document
// covers, and a date with no year on it belongs inside that stretch. Nothing
// here knows when a school year starts; it is read off the page.
const YEAR_DOC = (cell) => [
  "Issued 18 August 2026",
  "Term blocks",
  "Semester 1",
  "1 September 2026 - 22 January 2027",
  "Semester 2",
  "17 February 2027 - 30 June 2027",
  "Recurring",
  cell,
].join("\n");

// MIXED. The document writes the year on the first one and leaves it off the
// rest, which is how anybody writes a list.
{
  const r = read(YEAR_DOC("Parent Conferences: 21 Nov 2026, 12 Mar, 14 May"));
  ok("a year written once carries down the cell",
     ["2026-11-21", "2027-03-12", "2027-05-14"].every((d) => on(r, d).length === 1), show(r));
}

// OUT OF ORDER. A table cell is sorted by nothing in particular. Read by the
// order it is written in — which was the only thing available — "12 Mar" came
// out as March 2026, five months before the school year it is in, because
// nothing had yet been seen for it to be after.
{
  const r = read(YEAR_DOC("Parent Conferences: 12 Mar, 21 Nov, 14 May"));
  ok("a cell that is not in date order is still one school year",
     ["2026-11-21", "2027-03-12", "2027-05-14"].every((d) => on(r, d).length === 1), show(r));
}

// AND THE FIRST DATE IN A CELL IS NOT EXEMPT. It is the one the ordering rule
// could never reach, because there is nothing before it to be after.
{
  const r = read(YEAR_DOC("Reports Due: 26 Mar 16:00; 25 Jun 16:00"));
  ok("a cell whose every date is in the second half of the year",
     ["2027-03-26", "2027-06-25"].every((d) => on(r, d).length === 1), show(r));
  ok("  keeping the time each is due",
     ["2027-03-26", "2027-06-25"].every((d) => (on(r, d)[0] || {}).start === "16:00"), show(r));
  ok("  and not putting the clock in the name",
     ["2027-03-26", "2027-06-25"].every((d) => (on(r, d)[0] || {}).label === "Reports Due"), show(r));
}

// AND A YEAR THE DOCUMENT WROTE IS NEVER OVERRULED. A calendar mentions the
// year before and the year after — the last day of the old year on the front
// of the new one — and a rule that pulled every date into the school year
// would quietly move it by twelve months, which is the one fault on this page
// that looks like no fault at all.
{
  const r = read(YEAR_DOC("Handover: 28 August 2026; 30 June 2027"));
  ok("a year on the line beats anything worked out",
     on(r, "2026-08-28").length === 1 && on(r, "2027-06-30").length >= 1, show(r));
}

// AND A DOCUMENT THAT WRITES NO YEARS AT ALL IS LEFT ALONE. There is nothing
// to read, so nothing is read into it: the ordering rule stands, and the page
// says the year was borrowed.
{
  const r = read("Parent Conferences: 21 Nov; 12 Mar; 14 May");
  ok("with no written date anywhere, the order is still all there is",
     ["2026-11-21", "2027-03-12", "2027-05-14"].every((d) => on(r, d).length === 1), show(r));
  ok("  and every one of them says the year was borrowed",
     r.rows.every((x) => x.yearAssumed), JSON.stringify(r.rows.map((x) => x.yearAssumed)));
}

// ---------------------------------------------------------------------------
console.log("\nOne cell, one thing, several days");

// THE SERIES. Three occurrences of one thing, so they say they are one thing:
// same name, same time, same line, and a shared identity that says the
// document described them together. It is what lets the panel ask about a
// termly parents' evening once instead of three times.
{
  const r = read("Parent Conferences: 21 Nov; 12 Mar; 14 May");
  ok("the three occurrences share an identity",
     r.rows.every((x) => x.series) && new Set(r.rows.map((x) => x.series)).size === 1, show(r));
  ok("  and every one of them says how many there are",
     r.rows.every((x) => x.ofSeries === 3), JSON.stringify(r.rows.map((x) => x.ofSeries)));
  ok("  and they all point at the line they came off",
     new Set(r.rows.map((x) => x.line)).size === 1, JSON.stringify(r.rows.map((x) => x.line)));
}

// A ONE-OFF IS NOT A SERIES. A tag on every row would say nothing, and the
// panel would offer to answer one thing three times when there is one thing
// once.
{
  const r = read("Open Evening: 21 Nov");
  ok("one date on a line is not a series of one",
     r.rows.length === 1 && !r.rows[0].series, show(r));
}

// AND A SERIES KEEPS ITS TIME AND ITS SUBJECT ACROSS ALL OF IT. "Reports Due"
// at four o'clock three times is three deadlines at four o'clock, not one with
// a time and two without.
{
  const r = read("Reports Due: 6 Nov 16:00, 26 Mar 16:00, 25 Jun 16:00");
  ok("a series carries its time to every occurrence",
     r.rows.length === 3 && r.rows.every((x) => x.start === "16:00"), show(r));
  ok("  and its name", r.rows.every((x) => x.label === "Reports Due"), show(r));
  ok("  and is one identity", new Set(r.rows.map((x) => x.series)).size === 1, show(r));
}

// ---------------------------------------------------------------------------
console.log("\nAnd two things in one cell are still two things");

// THE TRADE THIS WOULD BE A BAD ONE FOR. A cell holding two different events
// on ONE day is two rows, and they are not a series: they share a date, which
// is the one thing a series does not.
{
  const r = read("Staff Briefing 08:00; Family Conferences 15:30\t21 Nov 2026");
  ok("two events in a cell on one day are two rows", on(r, "2026-11-21").length === 2, show(r));
  ok("  named apart", new Set(on(r, "2026-11-21").map((x) => x.label)).size === 2, show(r));
  ok("  and not called a series", on(r, "2026-11-21").every((x) => !x.series), show(r));
}

// AND A SPAN IN A LIST OF SINGLE DAYS STAYS A SPAN.
{
  const r = read("Exams: 16-20 Nov; 15 Mar; 12 Jun");
  ok("a range among single days keeps its end",
     (on(r, "2026-11-16")[0] || {}).endsOn === "2026-11-20", show(r));
  ok("  and the single days are single",
     !!on(r, "2027-03-15")[0] && !on(r, "2027-03-15")[0].endsOn, show(r));
}

finish();
