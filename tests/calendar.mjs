import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// SETTING UP THE SCHOOL CALENDAR, IN THE FOUR SHAPES IT ARRIVES IN.
//
// Typed out by hand, a PDF, a spreadsheet, a Word document. And then the
// question underneath all of them, which is the one that actually matters:
//
//   STAFF GO BACK BEFORE THE STUDENTS DO. You are at school on the 24th, in
//   meetings, setting up your room, planning. The lessons don't start until the
//   1st. Those are working days with no teaching in them — a third state the
//   app has to get right, or it will either think you're on holiday for a week
//   or think you have lessons that don't exist.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const REPO = REPO_ROOT;
const PUB = path.join(REPO, "public");
const SCRATCH = "/tmp/claude-0/-home-user-Personal-organiser/2a3fbe32-10e5-5444-988f-643a421d1a40/scratchpad";
let pass = 0, fail = 0;
const gaps = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const gap = (s) => { gaps.push(s); console.log("  --  " + s); };
const sec = (s) => console.log("\n" + s);
// A date written out for a person, in whatever order the locale puts it.
const hasDay = (text, mon, day, year) =>
  new RegExp(mon).test(text) && new RegExp(`\\b${day}\\b`).test(text) &&
  new RegExp(`\\b${year}\\b`).test(text);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DecompressionStream,
  Response, Blob, setTimeout };
sb.window = sb; vm.createContext(sb);
["schedule.js", "dayshape.js", "ics.js", "pdftext.js", "roster.js", "goalplan.js",
 "priority.js", "dayplan.js", "calplan.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const S = sb.OrganiserSchedule, D = sb.OrganiserDayShape, PDF = sb.OrganiserPdfText;

// The calendar a school actually sends, as words.
const CAL_LINES = [
  "Academic Calendar 2026–27",
  "Staff return\t24 August 2026",
  "Students return\t1 September 2026",
  "INSET day\t25 September 2026",
  "Winter break begins\t16 November 2026",
  "Winter break ends\t13 December 2026",
  "Term ends\t29 January 2027",
];
const CAL_TEXT = CAL_LINES.join("\n");

// ---------------------------------------------------------------------------
sec("Typed out by hand");
{
  const CP = sb.OrganiserCalPlan;
  if (!CP) {
    ok("there is a reader for a pasted calendar", false, "no OrganiserCalPlan");
  } else {
    const r = CP.read(CAL_TEXT);
    ok("every dated line is read", r.rows.length === 6, JSON.stringify(r.rows.map((x) => x.label)));
    ok("the dates come out as real dates",
       r.rows[0].date === "2026-08-24", JSON.stringify(r.rows[0]));
    ok("and a heading with no date in it is not read as an event",
       !r.rows.some((x) => /Academic Calendar/.test(x.label)), JSON.stringify(r.rows.map((x) => x.label)));
  }
}

sec("The same thing as a PDF");
{
  const content = "BT /F1 11 Tf 60 760 Td " +
    CAL_LINES.map((l, i) => `${i ? "0 -18 Td " : ""}(${l.replace(/\t/g, "   ")}) Tj `).join("") + "ET";
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
  const read = await PDF.read(new Uint8Array(out).buffer);
  ok("a PDF calendar reads as text", read.ok && /Students return/.test(read.text), read.text.slice(0, 120));
  const CP = sb.OrganiserCalPlan;
  if (CP) {
    const r = CP.read(read.text);
    ok("and the text goes through the same reader", r.rows.length === 6,
       JSON.stringify(r.rows.map((x) => x.label)));
  }
}

sec("As a spreadsheet");
{
  // What a paste out of Excel looks like: tab-separated, one row a line. The
  // same shape the class register arrives in.
  const R = sb.OrganiserRoster;
  const g = R.grid(CAL_TEXT);
  ok("a pasted spreadsheet splits into two columns", g.columns === 2, String(g.columns));
  ok("with the label in one and the date in the other",
     g.rows[1][0] === "Staff return" && /24 August/.test(g.rows[1][1]), JSON.stringify(g.rows[1]));
  const xlsx = fs.existsSync(path.join(PUB, "xlsx.js"));
  if (!xlsx) gap("an .xlsx FILE cannot be opened — pasting the cells works, opening the file does not");
}

sec("As a Word document");
{
  const docx = fs.existsSync(path.join(PUB, "docx.js"));
  if (!docx) gap("a .docx FILE cannot be opened either — same as Word plans, " +
                 "pasting is the route and it is the better one");
  // What matters is that a Word paste — with its own separators — still reads.
  const wordish = CAL_LINES.join("\r\n").replace(/\t/g, "  ");
  const CP = sb.OrganiserCalPlan;
  if (CP) {
    const r = CP.read(wordish);
    ok("a Word paste, odd spacing and all, still reads", r.rows.length === 6,
       JSON.stringify(r.rows.map((x) => x.date)));
  }
}

// ---------------------------------------------------------------------------
sec("From the calendar to days the planner knows about");
{
  const CP = sb.OrganiserCalPlan;
  const r = CP.read(CAL_TEXT);
  // Nothing is guessed: every row starts undecided, which is the point.
  ok("nothing is decided for you", r.rows.every((x) => !x.kind),
     JSON.stringify(r.rows.map((x) => x.kind)));
  ok("and nothing goes in until you say", CP.toBlocks(r.rows).length === 0);

  // You label them. The break is two rows and becomes the whole stretch.
  // You label them. The break is two rows and you tick that the first runs on
  // to the second; the INSET day is one row and stays one day.
  const said = r.rows.map((x) =>
    /Winter break begins/.test(x.label) ? { ...x, kind: "noLessons", spans: true }
    : /Winter break ends/.test(x.label) ? { ...x, kind: "noLessons" }
    : /INSET/.test(x.label) ? { ...x, kind: "noLessons" }
    : x);
  const blocks = CP.toBlocks(said);
  ok("a break written as begins-and-ends becomes every day between",
     blocks.filter((b) => /Winter break/.test(b.label)).length === 28,
     String(blocks.filter((b) => /Winter break/.test(b.label)).length));
  ok("starting and finishing on the right days",
     blocks[0].date === "2026-09-25" && blocks[blocks.length - 1].date === "2026-12-13",
     `${blocks[0].date} … ${blocks[blocks.length - 1].date}`);
  // The bug this rule exists for: without an explicit tick, an INSET day
  // sitting before a break would be married to it and seven weeks written off.
  const unticked = said.map((x) => ({ ...x, spans: false }));
  ok("nothing runs on unless you say it does",
     CP.toBlocks(unticked).length === 3, String(CP.toBlocks(unticked).length));
  ok("a single INSET day is one day, not a range",
     blocks.filter((b) => /INSET/.test(b.label)).length === 1);
  ok("all of them say no lessons rather than marking you away",
     blocks.every((b) => b.noLessons === true && !b.blocksDay));

  // And a day off is a different choice with a different effect.
  const offRow = [{ date: "2026-10-05", label: "Away", kind: "off" }];
  const offBlocks = CP.toBlocks(offRow);
  ok("a day off blocks the day rather than the lessons",
     offBlocks[0].blocksDay === true && !offBlocks[0].noLessons, JSON.stringify(offBlocks[0]));

  // The whole way through: text in, day classification out.
  const sched = blocks.concat([{ id: "sl", label: "9A", start: "09:00", end: "10:00",
    days: [1,2,3,4,5], from: "2026-09-01", to: "2027-01-29" }]);
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };
  ok("a day inside the break is your own", D.kindOf(sched, "2026-11-17", CFG) === "own");
  ok("an ordinary term Tuesday is a working day", D.kindOf(sched, "2026-09-08", CFG) === "work");
  ok("and the INSET day is your own too", D.kindOf(sched, "2026-09-25", CFG) === "own");
}

sec("Staff back on the 24th, lessons from the 1st");
{
  const STAFF_BACK = "2026-08-24", LESSONS_FROM = "2026-09-01";
  // The timetable, limited to when the lessons actually run.
  const SCHED = [{ id: "sl1", label: "9A English", start: "09:00", end: "10:00",
    days: [1, 2, 3, 4, 5], from: LESSONS_FROM, to: "2027-01-29" }];
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };

  // A Tuesday in the staff-only week.
  const inSetUpWeek = "2026-08-25";
  ok("a staff-only day is a working day", D.kindOf(SCHED, inSetUpWeek, CFG) === "work",
     D.kindOf(SCHED, inSetUpWeek, CFG));
  ok("with the working day's hours", D.shapeOf(SCHED, inSetUpWeek, CFG).start === "07:30");
  ok("and it is not loose — you are at school", D.shapeOf(SCHED, inSetUpWeek, CFG).loose === false);
  // The part that has to be right: no lessons that day.
  ok("but there are no lessons in it", S.blocksOn(SCHED, inSetUpWeek).length === 0,
     JSON.stringify(S.blocksOn(SCHED, inSetUpWeek)));
  ok("while the same weekday once term starts does have one",
     S.blocksOn(SCHED, "2026-09-08").length === 1, JSON.stringify(S.blocksOn(SCHED, "2026-09-08")));
  ok("so the whole day is free to work in",
     S.gapsOn(SCHED, CFG, inSetUpWeek).reduce((n, g) => n + (g.end - g.start), 0) === 600,
     JSON.stringify(S.gapsOn(SCHED, CFG, inSetUpWeek)));

  // And a weekend inside that week is still your own.
  ok("the weekend before term is still your own", D.kindOf(SCHED, "2026-08-29", CFG) === "own");

  // THE THING THAT MAKES IT POSSIBLE: a slot that knows when it starts.
  ok("a timetable entry can be limited to when lessons run",
     S.normalise(SCHED)[0].from === LESSONS_FROM && S.normalise(SCHED)[0].to === "2027-01-29",
     JSON.stringify(S.normalise(SCHED)[0]));

  // Can that be said through the app, though?
  const ui = fs.readFileSync(path.join(PUB, "timeline.js"), "utf8");
  const hasFrom = /bf-from|class="bf-runs|runs from/i.test(ui);
  ok("and that can be set from the page rather than by editing the file", hasFrom,
     "the block editor offers days-of-week or a single date, and nothing else");
  if (!hasFrom)
    gap("a timetable entry has no 'runs from / until' in the editor, so a " +
        "timetable typed in applies from the day you type it, for ever — " +
        "including the staff-only week, and next July");
}

sec("What the app can say about the stretch");
{
  const GP = sb.OrganiserGoalPlan;
  const SCHED = [{ id: "sl1", label: "9A English", start: "09:00", end: "10:00",
    days: [1, 2, 3, 4, 5], from: "2026-09-01", to: "2027-01-29" }];
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };
  const made = GP.madeOf(SCHED, CFG, "2026-08-24", "2026-09-06");  // two weeks
  ok("a fortnight spanning the start of term is counted", made.days === 14, String(made.days));
  ok("with the working days separated from your own",
     made.work === 10 && made.own === 4, JSON.stringify(made));
  ok("and nothing marked off", made.off === 0);
}

// ---------------------------------------------------------------------------
sec("What is NOT a date, however much it looks like one");
{
  const CP = sb.OrganiserCalPlan;
  // Every calendar has month headings, and read loosely "March 2026" comes out
  // as the twentieth of March — because "2026" splits into a day and a
  // two-digit year. A dozen invented events, all plausible.
  [["March 2026", "a month heading"], ["Sept 2026", "an abbreviated one"],
   ["August 2026", "the month this calendar starts in"],
   ["Nov 2026 - Jan 2027", "a range of months"],
   ["2026", "a bare year"], ["Saturday", "a day name"], ["2026-27", "an academic year"],
   ["Week 12", "a week number"], ["Page 3 of 7", "a footer"], ["room 204", "a room"],
   ["09:00-10:00", "a time"], ["Term 1 2026", "a term name"]]
    .forEach(([line, what]) => ok(`${what} is not a date`, CP.dateIn(line, 2026) === "", `${line} -> ${CP.dateIn(line, 2026)}`));
  // And the ones that are, still are.
  [["24 August 2026", "2026-08-24"], ["24 August", "2026-08-24"],
   ["August 24, 2026", "2026-08-24"], ["Aug 24", "2026-08-24"],
   ["24/08/2026", "2026-08-24"], ["2026-08-24", "2026-08-24"],
   ["24th Aug 26", "2026-08-24"], ["Mon 1 Sept 2026", "2026-09-01"]]
    .forEach(([line, want]) => ok(`“${line}” still reads`, CP.dateIn(line, 2026) === want, CP.dateIn(line, 2026)));
}

sec("The year, when the line doesn't carry one");
{
  const CP = sb.OrganiserCalPlan;
  // THE ONE THAT BIT ON A REAL DOCUMENT. A PDF table put "Saturday", "2026" and
  // "24 August" on three separate lines, so every date came out a year early —
  // silently, because they all looked perfectly reasonable.
  const split = "Summer Orientation 2026\nSaturday\n2026\n24 August\n25 August\nSummer Orientation 2026";
  ok("the year is taken from the document", CP.docYear(split) === 2026, String(CP.docYear(split)));
  const r = CP.read(split);
  ok("so the dates land in the right year",
     r.rows.length === 2 && r.rows[0].date === "2026-08-24", JSON.stringify(r.rows.map((x) => x.date)));
  ok("and it says which year it used", r.year === 2026 && r.borrowed === 2, JSON.stringify([r.year, r.borrowed]));
  ok("it says so in words, first, before anything else",
     /^2 of them had no year on the line — read as 2026/.test(CP.words(r, r.rows)), CP.words(r, r.rows));
  ok("you can overrule it", CP.read(split, { year: 2027 }).rows[0].date === "2027-08-24");
  // A line that says its own year is not borrowing one.
  const own = CP.read("Staff return\t24 August 2026");
  ok("a line with its own year borrows nothing", own.borrowed === 0 && own.rows[0].date === "2026-08-24",
     JSON.stringify([own.borrowed, own.rows[0].date]));
  ok("and nothing is said about a year when nothing was borrowed",
     !/no year on the line/.test(CP.words(own, own.rows)), CP.words(own, own.rows));
  // No year anywhere at all: falls back to now, and still says it borrowed.
  const none = CP.read("Staff return\t24 August");
  ok("with no year anywhere it still flags that it borrowed one",
     none.borrowed === 1 && none.yearFromDoc === 0, JSON.stringify([none.borrowed, none.yearFromDoc]));
}

sec("The real document the school actually sent");
{
  const f = path.join(SCRATCH, "school.pdf");
  if (!fs.existsSync(f)) {
    gap("school.pdf isn't here — the real-document check was skipped (it is never committed)");
  } else {
    const buf = fs.readFileSync(f);
    const got = await PDF.read(new Uint8Array(buf).buffer);
    ok("it opens", got.ok && got.text.length > 1000, `${got.ok} ${got.text.length}`);
    const CP = sb.OrganiserCalPlan;
    const r = CP.read(got.text);
    // Its table splits "Saturday / 2026 / 24 August" across three lines.
    ok("its dates come out in the year the document says", r.year === 2026, String(r.year));
    ok("and land on the right days",
       r.rows.map((x) => x.date).join(",") === "2026-08-24,2026-08-25",
       r.rows.map((x) => x.date).join(","));
    ok("its 157 lines of rooms, times and names produce no phantom dates",
       r.rows.length === 2, JSON.stringify(r.rows.map((x) => `${x.date} ${x.label}`)));
    ok("nothing is decided for you", r.rows.every((x) => !x.kind));
  }
}

// ---------------------------------------------------------------------------
sec("The preview and the days that get kept can't disagree");
{
  const CP = sb.OrganiserCalPlan;
  const rows = CP.read(CAL_TEXT).rows.map((x) =>
    /Winter break begins/.test(x.label) ? { ...x, kind: "noLessons", spans: true }
    : /Winter break ends|INSET/.test(x.label) ? { ...x, kind: "noLessons" }
    : x);
  const p = CP.plan(rows);
  ok("what the preview counts is what goes in",
     p.reduce((n, x) => n + x.days, 0) === CP.toBlocks(rows).length,
     `${p.reduce((n, x) => n + x.days, 0)} vs ${CP.toBlocks(rows).length}`);
  const stretch = p.find((x) => x.ranged);
  ok("the stretch says where it lands", stretch && stretch.to === "2026-12-13", JSON.stringify(stretch));
  ok("and how far that is", stretch && stretch.days === 28, stretch && String(stretch.days));
  ok("it names the second row as the far end",
     stretch && stretch.endRow && /ends/.test(stretch.endRow.label), JSON.stringify(stretch && stretch.endRow));
  ok("the word 'begins' is dropped once it covers the whole thing",
     stretch && !/begins/i.test(stretch.label), stretch && stretch.label);

  // A LINE LEFT AS "IGNORE" ISN'T THERE. So a tick reaches past it to the next
  // row that counts — which would be a nasty surprise if the tick didn't say
  // the date out loud. It does, and this is the case that proves it has to.
  const skipped = [
    { date: "2026-11-16", label: "Break begins", kind: "noLessons", spans: true },
    { date: "2026-11-20", label: "Something else", kind: "" },
    { date: "2026-12-13", label: "Break ends", kind: "noLessons" },
  ];
  ok("a tick reaches past an ignored line, and says so",
     CP.plan(skipped)[0].to === "2026-12-13" && CP.plan(skipped)[0].days === 28,
     JSON.stringify(CP.plan(skipped)[0]));

  // A mistyped year shouldn't cost you ten thousand entries.
  const silly = [{ date: "2026-11-16", label: "oops", kind: "off", spans: true },
                 { date: "2126-11-16", label: "end", kind: "off" }];
  ok("a wildly long stretch is capped rather than obeyed",
     CP.toBlocks(silly).length === 400, String(CP.toBlocks(silly).length));

  ok("the count in words is days, not lines",
     /days in all/.test(CP.words({ rows }, rows)), CP.words({ rows }, rows));
}

// ---------------------------------------------------------------------------
sec("And the tick is on the page, not just in the model");
{
  const { open } = await import("./dom.mjs");
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  ok("the timeline page opens without error", r.errs.length === 0, r.errs.join("; "));

  // Paste the calendar in the way a person would.
  const paste = r.get("#calPaste");
  paste.value = CAL_TEXT;
  paste.fire("input", { target: paste });
  await r.settle();

  ok("every dated line comes up as a row to label",
     r.get("#calRows").children.length === 6, String(r.get("#calRows").children.length));
  // The year box fills itself in from what was pasted.
  const yearBox = r.get("#calYear");
  const firstDate = () => String(r.get("#calRows").children[0].children[0].textContent);
  ok("the year it used is filled in and visible", yearBox.value === "2026", yearBox.value);
  // A line that carries its own year is not the box's business, and correcting
  // the box must not drag it somewhere else.
  yearBox.value = "2027";
  yearBox.fire("input", { target: yearBox });
  await r.settle();
  ok("a line that says its own year is left where it is",
     /\b2026\b/.test(firstDate()), firstDate());

  // The case the box exists for: a table that put the year on its own line.
  paste.value = "Summer Orientation 2026\nSaturday\n2026\n24 August\n25 August";
  paste.fire("input", { target: paste });
  await r.settle();
  ok("a yearless line follows the box", /\b2027\b/.test(firstDate()), firstDate());
  yearBox.value = "2026";
  yearBox.fire("input", { target: yearBox });
  await r.settle();
  ok("and correcting the box moves it, without a re-paste",
     /\b2026\b/.test(firstDate()) && /Aug/.test(firstDate()) && /24/.test(firstDate()),
     firstDate());
  // WRITTEN OUT, not 2026-08-24 — half the rows on a real calendar have no name
  // on them, so the date is the only thing telling you which row is which.
  ok("and it is written out rather than left as digits",
     !/^\d{4}-\d{2}-\d{2}/.test(firstDate()), firstDate());

  // Back to the calendar the rest of this is about.
  paste.value = CAL_TEXT;
  paste.fire("input", { target: paste });
  await r.settle();
  ok("and the calendar reads back the same as before",
     r.get("#calRows").children.length === 6, String(r.get("#calRows").children.length));

  // Read live each time: every render replaces the rows, and holding on to an
  // old one is how a test comes to press a button that is no longer on screen.
  const rowNow = (i) => r.get("#calRows").children[i];
  const say = (i, label) => {
    const b = rowNow(i).children.find((c) => c.textContent === label);
    ok(`row ${i} offers “${label}”`, !!b, rowNow(i).children.map((c) => c.textContent).join(" | "));
    if (b) b.click();
  };
  // 0 staff return, 1 students return, 2 INSET, 3 break begins, 4 break ends, 5 term ends
  say(2, "no lessons");
  say(3, "no lessons");
  say(4, "no lessons");
  await r.settle();

  const rows2 = r.get("#calRows").children;
  const tickOn = (rs, i) => rs[i].children.find((c) => /runs on to|and stop on/.test(String(c.textContent)));
  ok("a labelled row with another after it offers a run-on", !!tickOn(rows2, 3),
     rows2[3].children.map((c) => c.textContent).join(" | "));
  ok("and the last labelled row does not — there is nothing to run on to",
     !tickOn(rows2, 5), rows2[5].children.map((c) => c.textContent).join(" | "));
  // BEFORE you press it, it already says what pressing it would cost.
  ok("untouched, it already says where it would land and how far",
     hasDay(tickOn(rows2, 3).textContent, "Dec", 13, 2026) && /28 days\?$/.test(tickOn(rows2, 3).textContent),
     tickOn(rows2, 3).textContent);
  ok("and the row after it isn't swallowed yet",
     !rows2[4].children.some((c) => /end of/.test(String(c.textContent))),
     rows2[4].children.map((c) => c.textContent).join(" | "));
  ok("the last labelled row offers none — nothing labelled comes after it",
     !tickOn(rows2, 4), rows2[4].children.map((c) => c.textContent).join(" | "));
  // THE BUG THIS WHOLE THING EXISTS FOR. The INSET day sits right before the
  // break and used to be married to it silently. The tick is still offered
  // there — it has to be, the app can't know — but it says 53 days out loud,
  // which is a number nobody ticks by accident.
  ok("the INSET day's run-on shows the seven weeks it would swallow",
     /Nov/.test(tickOn(rows2, 2).textContent) && /53 days/.test(tickOn(rows2, 2).textContent),
     tickOn(rows2, 2).textContent);

  tickOn(rows2, 3).click();
  await r.settle();
  const rows3 = r.get("#calRows").children;
  const tick3 = tickOn(rows3, 3);
  // THE WHOLE REASON THIS IS A TICK. Seven weeks is not something that should
  // happen to you quietly; it says the date and the number before you keep it.
  ok("ticked, the same words, now marked on",
     tick3 && hasDay(tick3.textContent, "Dec", 13, 2026) && /28 days ✓$/.test(tick3.textContent),
     tick3 && tick3.textContent);
  ok("and the far end says it has been swallowed",
     rows3[4].children.some((c) => /end of/.test(String(c.textContent))),
     rows3[4].children.map((c) => c.textContent).join(" | "));

  // The keep button lives in the page's own markup, so it is found by id — the
  // stub doesn't read the words out of the HTML the way a browser would.
  const put = r.get("#calAdd");
  ok("there is a way to keep them, and it is offered", !!(put._on.click) && put.hidden === false,
     `wired: ${!!put._on.click}, hidden: ${put.hidden}`);
  put.click();
  await r.settle();
  const kept = (r.state.schedule || []).filter((b) => b.source === "paste");
  ok("29 days go in — the INSET day and the whole break", kept.length === 29, String(kept.length));
  ok("all of them no-lessons rather than marking you away",
     kept.every((b) => b.noLessons && !b.blocksDay));
  ok("the break runs from the day it begins to the day it ends",
     kept.filter((b) => /Winter break/.test(b.label)).length === 28 &&
     kept.some((b) => b.date === "2026-11-16") && kept.some((b) => b.date === "2026-12-13"),
     String(kept.filter((b) => /Winter break/.test(b.label)).length));

  // Reading the same calendar in twice must not double the holiday.
  paste.value = CAL_TEXT;
  paste.fire("input", { target: paste });
  await r.settle();
  const again = r.get("#calRows").children;
  const inset = again[2].children.find((c) => c.textContent === "no lessons");
  if (inset) inset.click();
  await r.settle();
  r.get("#calAdd").click();
  await r.settle();
  ok("reading it in again doesn't duplicate a day",
     (r.state.schedule || []).filter((b) => b.date === "2026-09-25").length === 1,
     String((r.state.schedule || []).filter((b) => b.date === "2026-09-25").length));

  // And the day the app now believes in.
  ok("a day inside the imported break reads as your own",
     D.kindOf(r.state.schedule || [], "2026-11-17", { dayStart: "07:30", dayEnd: "17:30" }) === "own");
}

// ---------------------------------------------------------------------------
sec("And the one that matters most: when do the lessons start");
{
  const CP = sb.OrganiserCalPlan;
  const rows = CP.read(CAL_TEXT).rows.map((x) =>
    /Students return/.test(x.label) ? { ...x, kind: "lessons" }
    : /Term ends/.test(x.label) ? { ...x, kind: "lessons" }
    : x);
  ok("with nothing ticked, the term has a start and no end",
     CP.term(rows).from === "2026-09-01" && CP.term(rows).to === "", JSON.stringify(CP.term(rows)));
  const both = rows.map((x) => (/Students return/.test(x.label) ? { ...x, spans: true } : x));
  ok("ticked, it runs to the end of term",
     CP.term(both).from === "2026-09-01" && CP.term(both).to === "2027-01-29",
     JSON.stringify(CP.term(both)));
  // A MARKER, NOT A DAY. Putting a block on the day the students come back
  // would be inventing an event out of a date.
  ok("and it doesn't put a day in the diary of its own",
     CP.toBlocks(both).length === 0, JSON.stringify(CP.toBlocks(both)));
  ok("no lessons row, no term", CP.term(CP.read(CAL_TEXT).rows) === null);
  ok("the words say when the lessons run",
     /Lessons run from 2026-09-01 to 2027-01-29/.test(CP.words({ rows: both }, both)),
     CP.words({ rows: both }, both));
  // The page writes dates its own way; the module doesn't pick one for it.
  const pretty = (x) => `<${x}>`;
  ok("and it will write them however the page writes dates",
     /Lessons run from <2026-09-01> to <2027-01-29>/.test(CP.words({ rows: both }, both, pretty)),
     CP.words({ rows: both }, both, pretty));
}

sec("From that line to a timetable that knows when it applies");
{
  const { open } = await import("./dom.mjs");
  // A week already typed in: two lessons and a briefing that happens whether or
  // not the students are there. The app cannot tell which is which.
  const WEEK = [
    { id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [1, 3], date: "", from: "", to: "" },
    { id: "b2", label: "9B English", start: "11:00", end: "12:00", days: [2, 4], date: "", from: "", to: "" },
    { id: "b3", label: "Staff briefing", start: "07:45", end: "08:00", days: [1], date: "", from: "", to: "" },
  ];
  const r = await open("timeline.html", { schedule: WEEK, config: {}, items: [], goals: [] });
  ok("the page opens with a week already in it", r.errs.length === 0, r.errs.join("; "));

  const paste = r.get("#calPaste");
  paste.value = CAL_TEXT;
  paste.fire("input", { target: paste });
  await r.settle();
  const rows = r.get("#calRows").children;
  ok("nothing about the timetable is asked until you say lessons start",
     r.get("#calTerm").hidden === true, String(r.get("#calTerm").hidden));

  // Row 1 is "Students return".
  const lessons = rows[1].children.find((c) => c.textContent === "lessons start");
  ok("there is a way to say the lessons start here", !!lessons,
     rows[1].children.map((c) => c.textContent).join(" | "));
  lessons.click();
  await r.settle();

  const term = r.get("#calTerm");
  ok("now it asks which entries that applies to", term.hidden === false);
  const picks = term.children.filter((c) => c._on && c._on.click);
  ok("every repeating entry is offered", picks.length === 3,
     picks.map((c) => c.textContent).join(" | "));
  ok("and it says the dates plainly first",
     /Lessons run from /.test(String(term.children[0].textContent)) &&
     hasDay(String(term.children[0].textContent), "Sep", 1, 2026),
     String(term.children[0].textContent));

  // THE BRIEFING HAPPENS IN THE SET-UP WEEK. The app can't know that, so it
  // shows it ticked and you take the tick off.
  const briefing = picks.find((c) => /Staff briefing/.test(c.textContent));
  ok("all of them start ticked", picks.every((c) => /\bon\b/.test(c.className)),
     picks.map((c) => c.className).join(" | "));
  briefing.click();
  await r.settle();
  const picks2 = r.get("#calTerm").children.filter((c) => c._on && c._on.click);
  ok("and one can be taken off",
     !/\bon\b/.test(picks2.find((c) => /Staff briefing/.test(c.textContent)).className));

  r.get("#calAdd").click();
  await r.settle();
  const sched = r.state.schedule || [];
  const by = (l) => sched.find((b) => b.label === l);
  ok("the lessons now start when the students do",
     by("9A English").from === "2026-09-01" && by("9B English").from === "2026-09-01",
     JSON.stringify([by("9A English").from, by("9B English").from]));
  ok("and the briefing was left alone", by("Staff briefing").from === "",
     JSON.stringify(by("Staff briefing")));
  ok("it says what it did",
     /2 timetable entries now only run from /.test(String(r.get("#calWords").textContent)) &&
     hasDay(String(r.get("#calWords").textContent), "Sep", 1, 2026),
     String(r.get("#calWords").textContent));

  // AND NOW THE QUESTION THAT STARTED ALL OF THIS.
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };
  const setUpWeek = "2026-08-24";   // a Monday, staff back, students not
  const termMonday = "2026-09-07";
  ok("the set-up Monday is a working day", D.kindOf(sched, setUpWeek, CFG) === "work");
  ok("with no lessons in it", !S.blocksOn(sched, setUpWeek).some((b) => /English/.test(b.label)),
     JSON.stringify(S.blocksOn(sched, setUpWeek).map((b) => b.label)));
  ok("but the briefing still happens, because you said it does",
     S.blocksOn(sched, setUpWeek).some((b) => /briefing/.test(b.label)),
     JSON.stringify(S.blocksOn(sched, setUpWeek).map((b) => b.label)));
  ok("and once term starts, the lesson is there",
     S.blocksOn(sched, termMonday).some((b) => /9A English/.test(b.label)),
     JSON.stringify(S.blocksOn(sched, termMonday).map((b) => b.label)));
  ok("the Saturday before term is still your own", D.kindOf(sched, "2026-08-29", CFG) === "own");
}

if (gaps.length) {
  console.log("\nWhat is not there\n" + "-".repeat(17));
  gaps.forEach((g) => console.log("  · " + g));
}
console.log(`\n${pass} passed, ${fail} failed, ${gaps.length} gap(s)`);
process.exit(fail ? 1 : 0);
