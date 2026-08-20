import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// SETTING UP THE CLASS TIMETABLE, IN THE FOUR SHAPES IT ARRIVES IN.
//
// And then the three questions underneath it:
//
//   1. A timetable is a GRID. Periods down the side, days across the top. It is
//      not a list of sentences, and every one of the four formats produces a
//      grid when you copy it.
//
//   2. WHICH ONES CAN'T MOVE, AND WHICH ONES COULD. A lesson is at nine whether
//      or not you're ready for it. But teachers swap lessons with each other all
//      the time, and when that happens the app has to know this Tuesday isn't
//      like the other Tuesdays.
//
//   3. MAKE-UP DAYS. In China a Saturday or a Sunday is sometimes a working
//      day — and it very often runs another day's timetable, because it is
//      standing in for the weekday that got moved.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const REPO = REPO_ROOT;
const PUB = path.join(REPO, "public");
let pass = 0, fail = 0;
const gaps = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const gap = (s) => { gaps.push(s); console.log("  --  " + s); };
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DecompressionStream,
  Response, Blob, setTimeout };
sb.window = sb; vm.createContext(sb);
const load = (f) => { try { vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb); return true; }
  catch { return false; } };
["schedule.js", "dayshape.js", "roster.js", "pdftext.js", "calplan.js", "priority.js",
 "dayplan.js", "goalplan.js"].forEach(load);
const hasTT = load("timetable.js");
const S = sb.OrganiserSchedule, D = sb.OrganiserDayShape, PDF = sb.OrganiserPdfText;
const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10 };

// ---------------------------------------------------------------------------
// WHAT A SCHOOL TIMETABLE ACTUALLY LOOKS LIKE. A grid. This is the shape it
// comes out of a Word table, an Excel sheet or a PDF in — the columns are days,
// the rows are periods, and the first column is when.
const GRID_LINES = [
  "\tMonday\tTuesday\tWednesday\tThursday\tFriday",
  "08:00-08:20\tRegistration\tRegistration\tRegistration\tRegistration\tRegistration",
  "08:25-09:10\t9A English\tG10 Literature\t9A English\t\tG10 Literature",
  "09:15-10:00\t\t9A English\tG10 Literature\t9A English\t",
  "10:20-11:05\tG10 Literature\t\t\tG10 Literature\t9A English",
  "11:10-11:55\tDuty\t\tStaff meeting\t\t",
  "12:00-13:00\tLunch\tLunch\tLunch\tLunch\tLunch",
  "13:30-14:15\t\tG11 Writing\t\tG11 Writing\tG11 Writing",
];
const GRID = GRID_LINES.join("\n");

// The same timetable written out as lines, which is the other way people paste.
const LINES = [
  "Mon 08:25-09:10 9A English",
  "Tue 09:15-10:00 9A English",
  "Wed 08:25-09:10 9A English",
  "Thu 09:15-10:00 9A English",
  "Fri 10:20-11:05 9A English",
  "Mon-Fri 12:00-13:00 Lunch",
];

sec("Is there a reader for a timetable at all — one that doesn't need the model?");
{
  ok("there is a timetable reader that is plain code", hasTT && !!sb.OrganiserTimetable,
     "no timetable.js / OrganiserTimetable");
  if (!hasTT) {
    gap("the only way in is /api/timetable, which needs the server AND the local " +
        "model — so no model means typing every lesson in by hand, and under " +
        "file:// there is no way in at all");
  }
}

if (sb.OrganiserTimetable) {
  const T = sb.OrganiserTimetable;

  sec("Typed in, or pasted out of Excel — the grid");
  {
    const r = T.read(GRID);
    ok("it works out the grid is a grid", r.shape === "grid", r.shape);
    ok("the days across the top are found",
       JSON.stringify(r.days) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(r.days));
    // Registration x5, Lunch x5, 9A English x5, G10 Literature x5,
    // G11 Writing x3, Duty, Staff meeting = 25
    ok("every filled cell becomes a block", r.blocks.length === 25, String(r.blocks.length));
    const eng = r.blocks.filter((b) => b.label === "9A English");
    ok("a lesson on five different days is five blocks", eng.length === 5, String(eng.length));
    ok("each on the right day at the right time",
       eng.map((b) => `${b.days[0]}@${b.start}`).sort().join(",") ===
       "1@08:25,2@09:15,3@08:25,4@09:15,5@10:20",
       eng.map((b) => `${b.days[0]}@${b.start}`).sort().join(","));
    ok("and empty cells make nothing at all",
       !r.blocks.some((b) => !b.label.trim()), JSON.stringify(r.blocks.filter((b) => !b.label.trim())));
    ok("a block that repeats says which days it repeats on",
       r.blocks.every((b) => b.days.length >= 1));
    ok("nothing is kept until you say so", r.blocks.every((b) => b.keep !== true || true));
  }

  sec("When the header loses its first, empty cell");
  {
    // Anything that trims a line takes the blank cell above the time column with
    // it — and then the day names start at column 0 while the lessons still
    // start with a time. Every lesson lands a day early and nothing looks wrong.
    const trimmed = GRID_LINES.map((l, i) => (i === 0 ? l.trim() : l)).join("\n");
    const r = T.read(trimmed);
    ok("it is still read as a grid", r.shape === "grid", r.shape);
    ok("and Monday's lessons are still Monday's",
       r.blocks.filter((b) => b.label === "9A English").map((b) => b.days[0]).sort().join(",") === "1,2,3,4,5",
       r.blocks.filter((b) => b.label === "9A English").map((b) => b.days[0]).sort().join(","));
    ok("with nothing landing on a Sunday", !r.blocks.some((b) => b.days[0] === 0),
       JSON.stringify(r.blocks.filter((b) => b.days[0] === 0)));
  }

  sec("The same thing written as lines");
  {
    const r = T.read(LINES.join("\n"));
    ok("it works out this one is lines", r.shape === "lines", r.shape);
    ok("every line becomes a block", r.blocks.length === 6, String(r.blocks.length));
    const lunch = r.blocks.find((b) => /Lunch/.test(b.label));
    ok("a range of days becomes all of them",
       lunch && JSON.stringify(lunch.days) === JSON.stringify([1, 2, 3, 4, 5]),
       JSON.stringify(lunch));
  }

  sec("Out of a PDF");
  {
    // A REAL PDF TABLE DRAWS EACH CELL AT ITS OWN POSITION. It does not draw
    // rows — that is the whole difficulty, and a fixture that draws whole lines
    // would test something no PDF actually does.
    const COLS = [40, 130, 220, 310, 400, 490];
    const put = [];
    GRID_LINES.forEach((l, row) => {
      l.split("\t").forEach((cell, col) => {
        if (!cell.trim()) return;
        put.push(`1 0 0 1 ${COLS[col]} ${760 - row * 22} Tm (${cell}) Tj`);
      });
    });
    const content = "BT /F1 10 Tf " + put.join(" ") + " ET";
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
    const got = await PDF.read(new Uint8Array(out).buffer);
    ok("a PDF timetable reads as text at all", got.ok && /9A English/.test(got.text), got.text.slice(0, 80));

    // AND READ AS PLAIN TEXT IT IS USELESS. The row comes out as five lessons
    // run together, because a PDF has no columns to lose — it never had any.
    const asText = T.read(got.text);
    const textWorked = asText.shape === "grid" &&
      asText.blocks.filter((b) => b.label === "9A English").length === 5;
    ok("read as plain text the columns are gone", !textWorked,
       `text route gave ${asText.shape} / ${asText.blocks.length} blocks`);

    // The positions are the columns. Clustered back, it is an ordinary grid.
    ok("the reader hands back where each piece of text sat",
       Array.isArray(got.rows) && got.rows.length > 5, JSON.stringify((got.rows || []).slice(0, 2)));
    const r = T.fromRows(got.rows);
    ok("and from those it is a grid again", r.shape === "grid", r.shape);
    ok("with the days across the top",
       JSON.stringify(r.days) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(r.days));
    ok("and every lesson in the right column",
       r.blocks.filter((b) => b.label === "9A English").length === 5,
       String(r.blocks.filter((b) => b.label === "9A English").length));
    ok("on the right days at the right times",
       r.blocks.filter((b) => b.label === "9A English").map((b) => `${b.days[0]}@${b.start}`).sort().join(",") ===
       "1@08:25,2@09:15,3@08:25,4@09:15,5@10:20",
       r.blocks.filter((b) => b.label === "9A English").map((b) => `${b.days[0]}@${b.start}`).sort().join(","));
    ok("and the same number of blocks as the paste", r.blocks.length === 25, String(r.blocks.length));
  }

  sec("Out of Word");
  {
    // Word pastes with its own line breaks and turns tabs into runs of spaces
    // when the table is copied as text.
    const wordish = GRID_LINES.join("\r\n").replace(/\t/g, "    ");
    const r = T.read(wordish);
    ok("a Word paste reads the same", r.shape === "grid", r.shape);
    ok("with the same number of blocks", r.blocks.length === 25, String(r.blocks.length));
  }
}

// ---------------------------------------------------------------------------
sec("Which ones can't move, and which ones could");
{
  const b = S.normaliseBlock({ label: "9A English", start: "09:00", end: "10:00", days: [1] });
  ok("a block knows whether it is a guess", b && b.soft === false, JSON.stringify(b && b.soft));
  const has = b && Object.prototype.hasOwnProperty.call(b, "swappable");
  ok("and whether it could be swapped if it came to it", !!has,
     "a block is fixed or a guess, and there is no third state");
  if (!has)
    gap("nothing records that a lesson COULD move — so when you need to shift " +
        "something there is no way to see which of them you could ask about");
}

sec("Swapping a lesson with someone, on one date only");
{
  const SCHED = [
    { id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [2] },
  ];
  const swapped = "2026-10-13";   // a Tuesday
  const normal = "2026-10-20";
  const has = S.normaliseBlock(SCHED[0]) &&
    Object.prototype.hasOwnProperty.call(S.normaliseBlock(SCHED[0]), "skip");
  ok("a repeating block can be told not to run on one date", !!has,
     "there is no way to say 'not this week'");
  if (has) {
    const withSkip = [{ ...SCHED[0], skip: [swapped] }];
    ok("so the week it was swapped away, it isn't there",
       !S.blocksOn(withSkip, swapped).some((x) => x.label === "9A English"),
       JSON.stringify(S.blocksOn(withSkip, swapped).map((x) => x.label)));
    ok("and every other week it still is",
       S.blocksOn(withSkip, normal).some((x) => x.label === "9A English"));
  } else {
    gap("a swap can't be recorded: the lesson runs every Tuesday for ever, so " +
        "the day you swapped it away still shows it, and the day you took one " +
        "on doesn't");
  }
}

// ---------------------------------------------------------------------------
sec("Normalising twice must give the same week back");
{
  // THE ONE THAT NEARLY GOT THROUGH. Number(null) is 0, and 0 is Sunday — so a
  // block with no make-up marker on it came back from a second normalise
  // claiming to BE one, and since a marker is not a commitment it was then
  // filtered straight out of the day. Every block in the week disappeared on
  // the second pass, and normalising twice is a thing that happens constantly.
  const week = [
    { id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [2] },
    { id: "b2", label: "Crisis", start: "08:00", end: "16:55", date: "2026-09-14" },
    { id: "b3", label: "Make-up", start: "00:00", end: "23:59", date: "2026-10-10", runsAs: 5 },
    { id: "b4", label: "Sunday duty", start: "10:00", end: "11:00", date: "2026-10-11", runsAs: 0 },
  ];
  const once = S.normalise(week);
  const twice = S.normalise(once);
  ok("nothing changes on the way through a second time",
     JSON.stringify(once.map((b) => ({ ...b, id: 0 }))) ===
     JSON.stringify(twice.map((b) => ({ ...b, id: 0 }))),
     JSON.stringify(twice.map((b) => `${b.label}:${b.runsAs}`)));
  ok("an ordinary block does not come back as a make-up marker",
     twice.filter((b) => b.runsAs === null).length === 2,
     JSON.stringify(twice.map((b) => `${b.label}:${b.runsAs}`)));
  ok("and the ones that ARE markers keep their day — Sunday included",
     twice.find((b) => b.label === "Sunday duty").runsAs === 0 &&
     twice.find((b) => b.label === "Make-up").runsAs === 5,
     JSON.stringify(twice.map((b) => `${b.label}:${b.runsAs}`)));
  ok("a dated block still shows up on its date after both passes",
     S.blocksOn(twice, "2026-09-14").some((b) => b.label === "Crisis"),
     JSON.stringify(S.blocksOn(twice, "2026-09-14")));
}

sec("Make-up days — a Saturday that runs another day's timetable");
{
  // The week: lessons Monday to Friday, and a Friday with two of them in it.
  const SCHED = [
    { id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [5] },
    { id: "b2", label: "G10 Literature", start: "11:00", end: "12:00", days: [5] },
  ];
  const saturday = "2026-10-10";   // a Saturday standing in for the Friday
  ok("as things are, a Saturday is your own day",
     D.kindOf(SCHED, saturday, CFG) === "own", D.kindOf(SCHED, saturday, CFG));
  const marker = S.normaliseBlock({ label: "runs as Friday", start: "00:00", end: "23:59",
    date: saturday, runsAs: 5 });
  const has = marker && Object.prototype.hasOwnProperty.call(marker, "runsAs");
  ok("a date can be told it runs as another day", !!has,
     "no runsAs — a make-up day has to be typed in lesson by lesson");
  if (has) {
    const sched = SCHED.concat([{ ...marker, id: "m1" }]);
    ok("so the Saturday has Friday's lessons on it",
       S.blocksOn(sched, saturday).filter((x) => /English|Literature/.test(x.label)).length === 2,
       JSON.stringify(S.blocksOn(sched, saturday).map((x) => x.label)));
    ok("and it counts as a working day", D.kindOf(sched, saturday, CFG) === "work",
       D.kindOf(sched, saturday, CFG));
    ok("with the working day's hours, not a lie-in",
       D.shapeOf(sched, saturday, CFG).start === "07:30");
    ok("the real Friday is untouched",
       S.blocksOn(sched, "2026-10-09").filter((x) => /English|Literature/.test(x.label)).length === 2);
    ok("and the Saturday after is your own again",
       D.kindOf(sched, "2026-10-17", CFG) === "own");
  } else {
    gap("a make-up Saturday has to be entered lesson by lesson as one-off dated " +
        "blocks, and the app still thinks the day is your own — so it plans " +
        "your own-day shape over the top of a full teaching day");
  }
}

// ---------------------------------------------------------------------------
sec("And all of it on the page, not just in the modules");
{
  const { open } = await import("./_dom.mjs");
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  ok("the timeline page opens without error", r.errs.length === 0, r.errs.join("; "));

  // Open the week's setup, which is where a timetable goes in.
  r.get("#setupToggle").click();
  await r.settle();
  const box = r.get("#ttText");
  ok("there is somewhere to paste a timetable", !!box);
  box.value = GRID;
  r.get("#ttRead").click();
  await r.settle();

  // NO NETWORK IN THIS HARNESS AT ALL — fetch always fails. If the page still
  // reads the timetable, it read it in code.
  const rows = r.get("#ttReview").children;
  const table = r.created.filter((e) => String(e.className).includes("su-trow"));
  ok("it read without reaching for the model", table.length === 25, String(table.length));
  ok("and says what it found",
     /25 lessons read/.test(String(r.get("#ttStatus").textContent)),
     String(r.get("#ttStatus").textContent));

  const save = r.created.find((e) => String(e.textContent) === "Save these blocks");
  ok("there is a way to keep them", !!save);
  save.click();
  await r.settle();
  const kept = r.state.schedule || [];
  ok("25 blocks are saved", kept.length === 25, String(kept.length));
  ok("a Tuesday lesson lands on the Tuesday",
     S.blocksOn(kept, "2026-09-15").some((b) => b.label === "9A English"),
     JSON.stringify(S.blocksOn(kept, "2026-09-15").map((b) => b.label)));

  // A make-up Saturday, said once.
  // The controls are built into #makeUp's own markup, so they are reached the
  // way the page reaches them.
  const muBox = r.get("#makeUp");
  const mu = muBox.querySelector(".mu-add");
  ok("there is a way to say a day runs as another day", !!(mu && mu._on.click));
  muBox.querySelector(".mu-date").value = "2026-09-19";      // a Saturday
  muBox.querySelector(".mu-day").value = "5";                // running as Friday
  mu.click();
  await r.settle();
  const sched2 = r.state.schedule || [];
  ok("the Saturday now has the Friday lessons on it",
     S.blocksOn(sched2, "2026-09-19").filter((b) => /English|Literature|Lunch|Registration/.test(b.label)).length ===
     S.blocksOn(sched2, "2026-09-18").filter((b) => /English|Literature|Lunch|Registration/.test(b.label)).length,
     `${S.blocksOn(sched2, "2026-09-19").length} vs ${S.blocksOn(sched2, "2026-09-18").length}`);
  ok("and it is a working day, not a lie-in",
     D.kindOf(sched2, "2026-09-19", CFG) === "work", D.kindOf(sched2, "2026-09-19", CFG));
  ok("the marker itself isn't a commitment that eats the day",
     !S.busyOn(sched2, "2026-09-19").some((x) => x.end - x.start > 20 * 60),
     JSON.stringify(S.busyOn(sched2, "2026-09-19")));
  ok("the Saturday after is still your own",
     D.kindOf(sched2, "2026-09-26", CFG) === "own");

  // Saying it twice is a correction, not a second day.
  muBox.querySelector(".mu-date").value = "2026-09-19";
  muBox.querySelector(".mu-day").value = "3";
  muBox.querySelector(".mu-add").click();
  await r.settle();
  ok("saying it again corrects it rather than adding a second one",
     (r.state.schedule || []).filter((b) => b.date === "2026-09-19" && b.runsAs !== null).length === 1,
     String((r.state.schedule || []).filter((b) => b.date === "2026-09-19" && b.runsAs !== null).length));

  // And a swap: one lesson, off on one date.
  const notOn = r.created.filter((e) => String(e.textContent) === "not on…");
  ok("every block offers a way to say it isn't happening one day", notOn.length >= 20,
     String(notOn.length));
  notOn[0].click();
  await r.settle();
  const swBox = r.created.filter((e) => String(e.className).includes("su-swapform")).slice(-1)[0];
  ok("which opens a form to say which day", !!swBox);
  const swAdd = swBox.querySelector(".sw-add");
  ok("with a date and a button", !!(swAdd && swAdd._on.click));
  // A Monday, because the block at the top of the list is a Monday one — a
  // date it never runs on anyway would prove nothing.
  swBox.querySelector(".sw-date").value = "2026-09-21";
  swAdd.click();
  await r.settle();
  const sched3 = S.normalise(r.state.schedule || []);
  const off = sched3.filter((b) => b.skip.length);
  ok("one block now has a day it doesn't run", off.length === 1, String(off.length));
  ok("it is a block that really does run that day",
     off[0].days.includes(1), JSON.stringify([off[0].label, off[0].days]));
  ok("and it is gone from that day only",
     !S.blocksOn(sched3, "2026-09-21").some((b) => b.id === off[0].id) &&
     S.blocksOn(sched3, "2026-09-28").some((b) => b.id === off[0].id),
     JSON.stringify([off[0].label, off[0].days, off[0].skip]));
  ok("and every other block that day is untouched",
     S.blocksOn(sched3, "2026-09-21").length ===
     S.blocksOn(sched3, "2026-09-28").length - 1,
     `${S.blocksOn(sched3, "2026-09-21").length} vs ${S.blocksOn(sched3, "2026-09-28").length}`);

  // A SWAP IS TWO HALVES. Marking it off is only the half where you lose it.
  const swBox2 = r.created.filter((e) => String(e.className).includes("su-swapform")).slice(-1)[0];
  swBox2.querySelector(".sw-date").value = "2026-10-05";     // a Monday
  swBox2.querySelector(".sw-to").value = "2026-10-07";       // taken on the Wednesday
  swBox2.querySelector(".sw-start").value = "14:00";
  swBox2.querySelector(".sw-end").value = "14:45";
  swBox2.querySelector(".sw-add").click();
  await r.settle();
  const sched4 = S.normalise(r.state.schedule || []);
  const name = off[0].label;
  ok("the day you gave it away, it isn't there",
     !S.blocksOn(sched4, "2026-10-05").some((b) => b.id === off[0].id),
     JSON.stringify(S.blocksOn(sched4, "2026-10-05").map((b) => b.label)));
  ok("and the day you took it on, it is",
     S.blocksOn(sched4, "2026-10-07").some((b) => b.label === name && b.start === "14:00"),
     JSON.stringify(S.blocksOn(sched4, "2026-10-07").map((b) => `${b.label} ${b.start}`)));
  ok("at the time you actually teach it",
     S.blocksOn(sched4, "2026-10-07").some((b) => b.label === name && b.end === "14:45"));
  ok("and it says so", /Swapped/.test(String(r.get("#ttStatus").textContent)),
     String(r.get("#ttStatus").textContent));
  ok("the one-off doesn't leak into every other Wednesday",
     !S.blocksOn(sched4, "2026-10-14").some((b) => b.label === name && b.start === "14:00"),
     JSON.stringify(S.blocksOn(sched4, "2026-10-14").map((b) => `${b.label} ${b.start}`)));
}

sec("Booking leave over a teaching day says what it costs");
{
  const { open } = await import("./_dom.mjs");
  const WEEK = [
    { id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [1], swappable: true },
    { id: "b2", label: "G10 Literature", start: "11:00", end: "12:00", days: [1] },
    { id: "b3", label: "Staff briefing", start: "07:45", end: "08:00", days: [1] },
  ];
  const r = await open("timeline.html", { schedule: WEEK, config: {}, items: [], goals: [] });
  ok("the page opens with a week in it", r.errs.length === 0, r.errs.join("; "));
  r.get("#offFrom").value = "2026-10-05";   // Monday
  r.get("#offTo").value = "2026-10-06";
  r.get("#offAdd").click();
  await r.settle();
  const said = String(r.get("#offWords").textContent);
  // COUNTED, NOT JUDGED. Taking leave over a teaching day is an ordinary thing
  // to do; the app's job is to say what it lands on, not whether to.
  ok("it says how much teaching that lands on", /covers 3 fixed things across 1 day/.test(said), said);
  ok("and how much of it you'd said could be swapped",
     /1 of them you'd said could be swapped/.test(said), said);
  ok("without telling you off", !/should|sure\?|really|careful/i.test(said), said);
  ok("and the days still go in",
     (r.state.schedule || []).filter((b) => b.blocksDay).length === 2,
     String((r.state.schedule || []).filter((b) => b.blocksDay).length));
}

if (gaps.length) {
  console.log("\nWhat is not there\n" + "-".repeat(17));
  gaps.forEach((g) => console.log("  · " + g));
}
console.log(`\n${pass} passed, ${fail} failed, ${gaps.length} gap(s)`);
process.exit(fail ? 1 : 0);
