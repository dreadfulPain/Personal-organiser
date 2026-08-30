import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A WORD DOCUMENT, DRAGGED ONTO THE BOX.
//
// Somebody dragged their school's calendar — a .docx, because that is what is
// on the staffroom computer — onto the paste box, and the browser did what
// browsers do with a file dropped on a textarea: it put the file's NAME in as
// text. The reader then said "No dates found in that", which was true of the
// sentence it had been handed and useless about the file it hadn't.
//
// Two separate faults in one gesture: a box that swallows a file as its name,
// and an app that couldn't have read the file anyway. The second had been said
// out loud three times — "I can't open docx files yet, copy the text across" —
// which is a chore nobody should do to use their own calendar.
//
// A .docx IS A ZIP with one XML file in it and needs no library at all.
//
// Every fixture here is built in the test. No school document is committed.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
import { docx, asFile, p, cell, row, table, doc } from "./_docx.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl,
  Uint8Array, DataView, TextDecoder, DecompressionStream, Response, Blob, ArrayBuffer, Promise };
sb.window = sb;
vm.createContext(sb);
["office.js", "dates.js", "calplan.js", "schedule.js", "timetable.js"]
  .forEach((f) => vm.runInContext(read(f), sb));
const O = sb.OrganiserOffice;
const C = sb.OrganiserCalPlan;

// ---------------------------------------------------------------------------
sec("A Word document is opened, not refused");
{
  const bytes = docx(doc(p("Example School") + p("Autumn term dates") +
    table(row(cell("Term starts"), cell("1 September 2026")),
          row(cell("Term ends"), cell("17 December 2026")))));
  const got = await O.readDocx(asFile(bytes));
  ok("it reads", !got.note && !!got.text, JSON.stringify(got.note));
  ok("the words come out", /Term starts/.test(got.text), JSON.stringify(got.text));
  ok("and the dates with them", /1 September 2026/.test(got.text), JSON.stringify(got.text));
  // AND THE READERS THAT ALREADY EXIST TAKE IT FROM THERE.
  const r = C.read(got.text);
  ok("the calendar reader gets its dates", r.rows.length === 2, JSON.stringify(r.rows.map((x) => x.date)));
}

sec("And a table comes out as a table");
{
  // A CALENDAR IN WORD IS A TABLE, and a table read as a paragraph is a wall of
  // numbers no reader here can do anything with. Each CELL on its own line is
  // what a table looks like after a PDF has flattened it — which every reader
  // in this app was already written for.
  const bytes = docx(doc(table(row(cell("Mon"), cell("Tue")), row(cell("P1"), cell("P2")))));
  const got = await O.readDocx(asFile(bytes));
  ok("one cell to a line", got.text === "Mon\nTue\nP1\nP2", JSON.stringify(got.text));
}

sec("And a paragraph means one thing in a table and another outside one");
{
  // THE FAULT THIS FOUND. Treating them the same joined a document's whole
  // title onto the first cell of its calendar — which then had no heading row
  // above it, and the grid read as nothing at all.
  const bytes = docx(doc(
    p("Example School") + p("2026 Calendar") + p("Wk") +
    table(row(cell("Sun"), cell("Mon")), row(cell("1"), cell("2 Staff Mtg")))));
  const got = await O.readDocx(asFile(bytes));
  const lines = got.text.split("\n");
  ok("a title outside a table is its own line", lines[0] === "Example School", JSON.stringify(lines));
  ok("and so is the line under it", lines[1] === "2026 Calendar", JSON.stringify(lines));
  ok("and the heading above the table is not glued to it", lines[2] === "Wk", JSON.stringify(lines));
  // AND INSIDE A CELL, a line break is a line break in somebody's typing — the
  // cell is the unit. "4" and "Staff Mtg" are one square, not two rows.
  const two = docx(doc(table(row(cell("4", "Staff Mtg"), cell("5")))));
  const g2 = await O.readDocx(asFile(two));
  ok("two paragraphs in one cell are one square", g2.text === "4 Staff Mtg\n5", JSON.stringify(g2.text));
}

sec("And a square with words in it is read as a day with something on it");
{
  // WHAT THE WORD ORIGINAL HAS THAT THE PDF DIDN'T. Out of a PDF a marked day
  // is a number and a symbol, and a legend at the bottom says what the symbol
  // means. In Word the square says it outright — "4 Ý Staff Mtg" — which is
  // better evidence and needs no legend. The reader used to stop dead at the
  // first one, so a term calendar came back as five weeks of twenty-one.
  const week = (n, ...days) => row(cell(String(n)), ...days.map((d) => cell(d)));
  const bytes = docx(doc(p("Example School term calendar") + p("Wk") + table(
    row(cell("Sun"), cell("Mon"), cell("Tue"), cell("Wed"), cell("Thu"), cell("Fri"), cell("Sat")),
    week(1, "9/6", "7", "8", "9", "10", "11 Staff Mtg", "12"),
    week(2, "13", "14", "15", "16", "17", "18 Staff Mtg", "19"),
    week(3, "20", "21", "22", "23", "24", "25 Staff Mtg", "26"),
    week(4, "27", "28", "29", "30", "10/1 Holiday", "2", "3"))));
  const got = await O.readDocx(asFile(bytes));
  const g = C.weekGridIn(got.text);
  ok("the term grid reads", !!g, "not read");
  ok("all of it, not the first month", g && g.weeks.length === 4, g && String(g.weeks.length));
  // A MONTH MARKER WITH WORDS BESIDE IT is where it used to stop: "10/1" alone
  // was a month, "10/1 Holiday" was nothing, so the grid ended at the month end.
  const oct = g && g.weeks[3].days.find((d) => d.month === 10);
  ok("and crosses the month end", !!oct, JSON.stringify(g && g.weeks[3].days));
  ok("keeping what was in that square", oct && oct.marks.join("") === "Holiday", oct && JSON.stringify(oct.marks));

  const marks = C.weekGridMarks(g, 2026);
  const staff = marks.find((m) => m.name === "Staff Mtg");
  ok("the marked days are gathered by what they say", staff && staff.dates.length === 3,
     JSON.stringify(marks.map((m) => `${m.name} x${m.dates.length}`)));
  ok("and named by the square, with no legend anywhere", staff && staff.name === "Staff Mtg",
     staff && staff.name);
  ok("all on the same weekday", staff && staff.weekday === 5, staff && String(staff.weekday));
}

sec("And a file it still cannot open says so, and what does work");
{
  // AN OLD .doc IS NOT A ZIP and never will be readable this way. Saying that,
  // with the way round it, is the whole of the job here.
  const old = await O.readDocx(asFile(Buffer.from("\xd0\xcf\x11\xe0 old word file", "binary")));
  ok("an old .doc is refused in words", /older Word file/.test(old.note), old.note);
  ok("with the way round it", /saving it as \.docx/.test(old.note), old.note);
  // AND A DOCUMENT THAT IS ALL PICTURE has no words to give.
  const empty = docx(doc(""));
  const none = await O.readDocx(asFile(empty));
  ok("a document with no words says that", /no words in that document/.test(none.note), none.note);
  ok("and points at what would work", /photo of it/.test(none.note), none.note);
}

sec("And the box you drop it on reads it rather than naming it");
{
  const tl = read("timeline.js");
  // THE GESTURE THAT STARTED THIS. A file dropped on a textarea becomes its
  // NAME, and the reader then honestly reports that a filename has no dates in
  // it — which is true, useless, and looks exactly like the app not working.
  ok("the calendar box takes a drop", /dropOnto\(calBox/.test(tl), "a dropped file is still its name");
  ok("and so does the timetable box", /dropOnto\(\$\("#ttText"\)/.test(tl), "only one box was fixed");
  ok("and a drop is read as a file", /dataTransfer[\s\S]{0,200}textOf/.test(tl),
     "the file is not being read");
  const cap = read("capture.js");
  ok("a Word file is offered in the picker", /\.docx/.test(cap), "docx isn't offered");
  ok("and handed to the reader", /readDocx/.test(cap), "docx isn't read");
}

done();
