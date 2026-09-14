// SEVEN CALENDARS THIS READER HAS NEVER SEEN.
//
// THE WORRY THIS ANSWERS. A reader can be fixed until it works on the document
// in front of it and then fall apart on the next one, and a suite of five
// thousand checks built around one file proves nothing about that — five hundred
// checks on one line only tell you about that line.
//
// So these are written to be DIFFERENT from the document the reader grew up on,
// and they are written before it is run on them. Different layouts, different
// wording, different ways of writing a date, and nothing in common with any real
// school: invented names, invented terms, invented people.
//
// What each one is FOR is written above it, and what it should come to is
// declared beside it — so a failure here says which shape the reader cannot
// read, rather than "something is wrong".
//
// THESE ARE NOT FIXTURES TO TUNE AGAINST. A rule invented to make one of them
// pass, that makes no sense on the others, is the fault they exist to find.
//
// AND THIS IS NO LONGER A HOLD-OUT. It was one exactly once — the first run,
// which came to 63 of 68 and found two faults that had nothing to do with
// calendars: a compressed stream trimmed past its own end, and twenty-seven
// bytes of ordinary typography read as control codes. The moment those were
// mended because of what these documents showed, these documents stopped being
// evidence about anything unseen and became what they are now: a regression
// corpus, which is a different and also useful thing.
//
// So they stay here for ever, and the next time somebody wants to know whether
// this reader has been fitted to the documents in front of it, the answer is
// not in this file. It is a fresh set nobody has run yet, or better, a real
// calendar from a school nobody here has met.

import zlib from "node:zlib";
import { pdf } from "./_pdf.mjs";

function stream(text) {
  const comp = zlib.deflateSync(Buffer.from(text, "latin1"));
  return Buffer.concat([
    Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\r\n`),
    comp,
    Buffer.from("\r\nendstream"),
  ]);
}

// AN EN DASH AS A PDF REALLY CARRIES ONE. Written straight into the content
// stream it is not a character at all — the stream is bytes, and a document
// that wants a dash of that kind says so with byte 0x96 and a font declaring
// WinAnsiEncoding. Getting this wrong in the fixture would have tested the
// fixture rather than the reader.
const EN = "\u0096";
const WINANSI =
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

// Lines drawn one under another, plainly, at one position each.
const page = (content, font) => pdf([
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  stream(content),
  font || "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]);

const lines = (rows) =>
  "BT /F1 11 Tf 60 760 Td " +
  rows.map((l, i) => `${i ? "0 -18 Td " : ""}(${l.replace(/([()\\])/g, "\\$1")}) Tj `).join("") +
  "ET";

// Cells placed by coordinate, which is what a table really is.
const grid = (cells) =>
  cells.map(({ x, y, text }) =>
    `q BT 42 0 0 42 ${x} ${y} Tm /F1 1 Tf (${text.replace(/([()\\])/g, "\\$1")}) Tj ET Q `).join("");

// ---------------------------------------------------------------------------
export const CORPUS = [
  {
    // 1. THE DATE FIRST, THE NAME AFTER — the other way round from a calendar
    // that writes "Staff return 24 August". Half the schools in the world do it
    // this way and the reader has never been shown one.
    name: "dates down the left",
    year: 2026,
    build: () => page(lines([
      "Bramfield Academy — term dates",
      "1 September 2026    Term starts",
      "23 October 2026    Training day",
      "26 October 2026    Half term begins",
      "30 October 2026    Half term ends",
      "18 December 2026    Term ends",
    ])),
    want: [
      ["2026-09-01", /Term starts/],
      ["2026-10-23", /Training day/],
      ["2026-10-26", /Half term begins/],
      ["2026-10-30", /Half term ends/],
      ["2026-12-18", /Term ends/],
    ],
  },
  {
    // 2. A CALENDAR WRITTEN AS SENTENCES. No table, no columns, no list — the
    // shape a small school sends in an email.
    name: "prose, in sentences",
    year: 2026,
    // NOT MENDED, AND SAID SO. This reader works a line at a time, and a letter
    // does not: "…ends on Friday 18" / "December 2026." is one date cut in half
    // by nothing but the width of the page, and the names come out as pieces of
    // sentence. Making it pass would mean a rule about where a sentence wraps,
    // and a rule invented to make one document pass is the fault this whole file
    // exists to find. It is written down instead — and it is the one shape where
    // the model earns its place, because a document this reader finds nothing
    // clean in is what the model is asked to read from scratch.
    known: "a calendar written as wrapped sentences is read badly: a date split " +
      "across a line break is missed, and the names come out as fragments",
    build: () => page(lines([
      "Dear colleagues,",
      "The autumn term begins on Tuesday 1 September 2026 and ends on Friday 18",
      "December 2026. There is a half-term break from Monday 26 October to Friday",
      "30 October 2026. Training days are on 1 September 2026 and 4 January 2027.",
      "Best wishes, the office",
    ])),
    want: [
      ["2026-09-01", /./],
      ["2026-10-26", /./],
      ["2026-12-18", /./],
      ["2027-01-04", /./],
    ],
  },
  {
    // 3. A TABLE WHERE THE ROW AND THE COLUMN BOTH MEAN SOMETHING, and neither
    // heading is a word this reader has met. Four cells, four entries, and the
    // name of each is made of both headings.
    name: "a table with two headings",
    year: 2027,
    build: () => page(lines([
      "Trips and tests",
      "Year 7",
      "Year 8",
      "Museum trip",
      "12 May 2027",
      "19 May 2027",
      "Practice papers",
      "2 June 2027",
      "9 June 2027",
    ])),
    want: [
      ["2027-05-12", /Museum trip.*Year 7|Year 7.*Museum trip/],
      ["2027-05-19", /Museum trip.*Year 8|Year 8.*Museum trip/],
      ["2027-06-02", /Practice papers.*Year 7|Year 7.*Practice papers/],
      ["2027-06-09", /Practice papers.*Year 8|Year 8.*Practice papers/],
    ],
  },
  {
    // 4. EVERY WAY OF WRITING A SPAN that isn't the one this reader grew up on:
    // an en dash with spaces, a bare hyphen inside one month, the word "to",
    // and a range that crosses a month boundary.
    name: "ranges of four kinds",
    year: 2027,
    build: () => page(lines([
      "Closures",
      `Spring break 29 March ${EN} 10 April 2027`,
      "Field week 14-18 June 2027",
      "Assessment 4 to 8 May 2027",
      `Long weekend 30 April ${EN} 3 May 2027`,
    ]), WINANSI),
    want: [
      ["2027-03-29", /Spring break/, "2027-04-10"],
      ["2027-06-14", /Field week/, "2027-06-18"],
      ["2027-05-04", /Assessment/, "2027-05-08"],
      ["2027-04-30", /Long weekend/, "2027-05-03"],
    ],
  },
  {
    // 5. ONE HEADING OVER SEVERAL ROWS, and a second heading after it — so an
    // entry has to belong to the nearer one. Nothing here says "holidays": the
    // words are the document's own.
    name: "two headings, four entries",
    year: 2027,
    build: () => page(lines([
      "Days the school is shut:",
      "Founders Day: 4 May 2027",
      "Spring Fair: 22 May 2027",
      "Days staff are in and pupils are not:",
      "Planning day: 8 June 2027",
      "Records day: 19 June 2027",
    ])),
    want: [
      ["2027-05-04", /Founders Day/],
      ["2027-05-22", /Spring Fair/],
      ["2027-06-08", /Planning day/],
      ["2027-06-19", /Records day/],
    ],
  },
  {
    // 6. A LINE CUT INTO PIECES BY THE TYPESETTER, at coordinates — the fault
    // that made a real calendar unreadable, in a shape that is not that
    // calendar's. The name is split across two runs and the range across three.
    name: "a line drawn in six pieces",
    year: 2027,
    build: () => page(grid([
      { x: 100, y: -100, text: "Whole" },
      { x: 290, y: -100, text: " School" },
      { x: 520, y: -100, text: " Photograph: Sept. 1" },
      { x: 1000, y: -100, text: "4" },
      { x: 1040, y: -100, text: "-" },
      { x: 1070, y: -100, text: "Sept. 16, 2027" },
      { x: 100, y: -160, text: "Governors visit: Oct. 2, 2027" },
    ])),
    want: [
      ["2027-09-14", /Photograph/, "2027-09-16"],
      ["2027-10-02", /Governors visit/],
    ],
  },
  {
    // 7. A DATE THAT IS NOT AN ENTRY, sitting right next to ones that are: a
    // print date in the footer and a revision note. A reader that takes every
    // date it sees hands back a calendar with the office's paperwork in it.
    name: "dates that are not entries",
    year: 2026,
    build: () => page(lines([
      "Term dates 2026-27",
      "Printed 14 July 2026",
      "Version 2, revised 3 August 2026",
      "Term starts 3 September 2026",
      "Term ends 17 December 2026",
      "Page 1 of 2",
    ])),
    want: [
      ["2026-09-03", /Term starts/],
      ["2026-12-17", /Term ends/],
    ],
    // What it may ALSO find without that being wrong: the paperwork has real
    // dates on it, and a reader cannot know the office's business from a
    // teacher's. Noted rather than counted.
    allow: ["2026-07-14", "2026-08-03"],
  },
];
