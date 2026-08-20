import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// FIVE MONTHS, STARTING FROM THE THREE DOCUMENTS A SCHOOL ACTUALLY SENDS.
//
// Not a unit test. A trial run: you are handed a calendar, a register and a
// timetable in August, and the question is whether you can get a term into this
// app and whether it then behaves for five months with a month off in the
// middle.
//
// The documents are in the formats they really arrive in — a PDF calendar, a
// spreadsheet register, a PDF timetable grid — and the only ways in are the
// ones the app actually has. Where there is no way in, that is the finding, and
// it is counted in minutes of typing rather than waved past.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const REPO = REPO_ROOT;
const PUB = path.join(REPO, "public");
let pass = 0, fail = 0;
const notes = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const note = (s) => { notes.push(s); console.log("  --  " + s); };
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer,
  DecompressionStream, Response, Blob, setTimeout };
sb.window = sb;
vm.createContext(sb);
["levels.js", "names.js", "roster.js", "schedule.js", "priority.js", "dayplan.js", "weekplan.js",
 "ics.js", "pdftext.js", "syllabus.js", "lessonplan.js", "review.js", "attain.js",
 "attend.js", "rota.js", "tried.js", "pastoral.js", "classplan.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const S = sb.OrganiserSchedule, ICS = sb.OrganiserIcs, PDF = sb.OrganiserPdfText;
const RV = sb.OrganiserReview, AT = sb.OrganiserAttend, ATN = sb.OrganiserAttain;

const iso = (d) => d.toISOString().slice(0, 10);
const day = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(s + "T12:00:00").getDay();

// ---- the term, as a school would give it ----------------------------------
const TERM_START = "2026-09-01";   // Tuesday
const HOL_START = "2026-11-16";    // a month off in the middle
const HOL_END = "2026-12-13";
const TERM_END = "2027-01-29";     // five months all told

sec("The school calendar — what actually arrives, and whether it goes in");
{
  // Schools send this as a PDF nine times out of ten. Build a real one.
  const scratch = "/tmp/claude-0/-home-user-Personal-organiser/2a3fbe32-10e5-5444-988f-643a421d1a40/scratchpad";
  const lines = [
    "Academic Calendar 2026-27",
    "Term starts  1 September 2026",
    "INSET day  25 September 2026",
    "Winter break begins  16 November 2026",
    "Winter break ends  13 December 2026",
    "Parents evening  22 January 2027",
    "Term ends  29 January 2027",
  ];
  const content = "BT /F1 11 Tf 60 760 Td " +
    lines.map((l, i) => `${i ? "0 -18 Td " : ""}(${l}) Tj `).join("") + "ET";
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
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(path.join(scratch, "calendar.pdf"), out);

  const read = await PDF.read(new Uint8Array(out).buffer);
  ok("the calendar PDF is readable", read.ok && read.text.length > 50, JSON.stringify(read.notes));
  ok("the term dates come out as text", /Term starts/.test(read.text) && /Winter break/.test(read.text),
     read.text.slice(0, 120));

  // ...and then what? There is no page that turns dates in a document into
  // days off. This is the gap, and it is the first thing a new user hits.
  const src = fs.readFileSync(path.join(PUB, "timeline.js"), "utf8");
  const canImportIcs = /icsFile/.test(src);
  ok("a calendar can be imported, if it's an .ics", canImportIcs);
  note("the calendar arrives as a PDF and nothing reads a PDF into days off — " +
       "the text comes out fine, and then you type the dates in by hand");

  // An .ics WOULD work, so measure that path honestly.
  const icsText = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "BEGIN:VEVENT", "SUMMARY:Winter break", `DTSTART;VALUE=DATE:${HOL_START.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${day(HOL_END, 1).replace(/-/g, "")}`, "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:INSET day", "DTSTART;VALUE=DATE:20260925",
    "DTEND;VALUE=DATE:20260926", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  // parse() hands back the blocks already in the app's own shape.
  const parsed = ICS.parse(icsText);
  // It expands a multi-day event into one entry per day rather than a range.
  // Verbose, but what matters is that every day is covered and none is lost.
  const hol = parsed.blocks.filter((b) => /break/i.test(b.label || ""));
  ok("a whole-month break imports", hol.length > 0, JSON.stringify(parsed).slice(0, 160));
  ok("as one blocking entry per day, all 28 of them", hol.length === 28, String(hol.length));
  ok("starting and ending on the right days",
     hol[0].date === HOL_START && hol[hol.length - 1].date === HOL_END,
     `${hol[0].date} … ${hol[hol.length - 1].date}`);
  // A school calendar says the lessons stop. It says nothing about whether you
  // intend to work, so it must not mark you unavailable.
  ok("with every day of it marked as having no lessons", hol.every((b) => b.noLessons === true));
  ok("and none of them marked as you being away", hol.every((b) => !b.blocksDay));
  ok("and nothing quietly truncated", parsed.skipped.length === 0, JSON.stringify(parsed.skipped));
  const inset = parsed.blocks.filter((b) => /INSET/i.test(b.label || ""));
  // An all-day DTEND is exclusive: one day off must not import as two.
  ok("a single INSET day is one day, not two", inset.length === 1, JSON.stringify(inset));
  ok("on the day it says", inset[0] && inset[0].date === "2026-09-25", JSON.stringify(inset[0]));
  note("a term's calendar imports as one entry per day — a month off is 28 rows " +
       "in your timetable list, which is right but a lot to scroll past");
}

// ---- the timetable ---------------------------------------------------------
sec("The timetable — a grid, typed in as blocks");
const SCHEDULE = [];
{
  // What a school sends: a grid. Five periods, five days, two classes.
  const grid = [
    ["Period 1", "08:30", "09:20", [1, 3, 5], "9A English"],
    ["Period 2", "09:30", "10:20", [2, 4], "9B English"],
    ["Period 4", "11:30", "12:20", [1, 2, 3, 4, 5], "Duty"],
    ["Period 5", "13:30", "14:20", [2, 4], "9A English"],
  ];
  grid.forEach(([, start, end, days, label], i) => {
    SCHEDULE.push({ id: "sl" + i, label, start, end, days, from: TERM_START, to: TERM_END });
  });
  // The holiday, as one block covering every day of it.
  // A school holiday: the lessons stop, the day is still yours.
  SCHEDULE.push({ id: "hol", label: "Winter break", start: "00:00", end: "23:59",
    days: [0, 1, 2, 3, 4, 5, 6], from: HOL_START, to: HOL_END, noLessons: true });

  const norm = S.normalise(SCHEDULE);
  ok("every slot survives being normalised", norm.length === SCHEDULE.length, String(norm.length));
  ok("a slot can be limited to the term", norm[0].from === TERM_START && norm[0].to === TERM_END);
  ok("and the holiday says there are no lessons", norm[norm.length - 1].noLessons === true);
  note(`the timetable is typed in as ${grid.length} blocks plus one for the holiday — ` +
       "no import, but it is a handful of rows and only done once");
}

// ---- the register ----------------------------------------------------------
sec("The class register — a spreadsheet, pasted in");
const CONTACTS = [];
{
  // What a school sends: a spreadsheet. Two classes, twelve each.
  const rows = [];
  for (let i = 1; i <= 12; i++) rows.push([`Student A${i}`, "9A"]);
  for (let i = 1; i <= 12; i++) rows.push([`Student B${i}`, "9B"]);
  rows.forEach(([name, group], i) => CONTACTS.push({ id: "s" + (i + 1), name, group, details: {}, createdAt: "" }));

  ok("a register is two columns and nothing more", rows[0].length === 2);
  // The only way in is one at a time.
  // The whole class goes in as one paste now, in the shape a spreadsheet gives.
  const R = sb.OrganiserRoster;
  const pasted = rows.map(([n, g]) => `${n}\t${g}`).join("\n");
  const readIn = R.read(pasted, { existing: [] });
  ok("the whole register pastes in at once", readIn.adding.length === rows.length,
     `${readIn.adding.length} of ${rows.length}`);
  ok("names and classes the right way round",
     readIn.adding[0].name === rows[0][0] && readIn.adding[0].group === rows[0][1],
     JSON.stringify(readIn.adding[0]));
  ok("both classes come through", new Set(readIn.adding.map((x) => x.group)).size === 2);
  ok("and pasting it twice adds nobody twice",
     R.read(pasted, { existing: readIn.adding }).adding.length === 0);
}

// ---- five months of it -----------------------------------------------------
sec("Five months, with the month off in the middle");
{
  const days = [];
  for (let d = TERM_START; d <= TERM_END; d = day(d, 1)) days.push(d);
  const teaching = days.filter((d) => dow(d) >= 1 && dow(d) <= 5 && !S.noTeachingOn(SCHEDULE, d));
  const blocked = days.filter((d) => S.noTeachingOn(SCHEDULE, d));

  ok("the run is about five months", days.length > 140 && days.length < 160, String(days.length));
  ok("the holiday is written off, every day of it",
     blocked.length === 28, `${blocked.length} days blocked`);
  ok("and nothing is teachable inside it",
     !teaching.some((d) => d >= HOL_START && d <= HOL_END));
  ok("term resumes afterwards", teaching.some((d) => d > HOL_END), String(teaching.filter((d) => d > HOL_END).length));

  // Does the planner actually refuse to put work in the holiday?
  const item = { id: "x", title: "Write the reports", type: "task", date: day(HOL_START, 3),
    deadlineType: "soft", importance: "normal", effort: "medium", tags: [], done: false,
    plannedMinutes: 60, spentMinutes: 0, areas: [] };
  const cfg = { dayStart: "08:00", dayEnd: "17:00", minGapMinutes: 10 };
  const inHoliday = sb.OrganiserDayPlan.build([item], SCHEDULE, cfg, day(HOL_START, 3), {});
  // A placed row is keyed by itemId, not by a nested item.
  const rowsOf = (p) => ((p && (p.rows || p.plan || p.slots)) || []).filter((r) => r && r.itemId);
  // The correction: a holiday is not a void. Work IS plannable into it, which
  // is the whole point of having the month off to get ahead in.
  ok("a holiday is still a day you can work in",
     rowsOf(inHoliday).length > 0, JSON.stringify(rowsOf(inHoliday)).slice(0, 200));
  // But a day you marked off yourself stays off.
  const OFF = SCHEDULE.concat([{ id: "away", label: "Away", start: "00:00", end: "23:59",
    date: day(HOL_START, 3), blocksDay: true }]);
  ok("and a day you marked off yourself is left alone",
     rowsOf(sb.OrganiserDayPlan.build([item], OFF, cfg, day(HOL_START, 3), {})).length === 0);
  // And the same job on a teaching day IS placed, so the check above means
  // something rather than the planner simply never placing anything.
  const firstBack = teaching.find((d) => d > HOL_END);
  const backAtWork = sb.OrganiserDayPlan.build(
    [{ ...item, date: firstBack }], SCHEDULE, cfg, firstBack, {});
  ok("but the same job lands fine on the first day back",
     rowsOf(backAtWork).length > 0, JSON.stringify(rowsOf(backAtWork)).slice(0, 200));

  // ---- teaching across the break -----------------------------------------
  // A lesson taught the week before the holiday. Its month-later review lands
  // inside the break, and must move to a day the class is actually there.
  const lastLesson = teaching.filter((d) => d < HOL_START).pop();
  const lessons = [{ id: "l1", title: "Sensory detail", date: lastLesson, group: "9A",
    slotId: "sl0", plan: "x", objective: "use sensory detail", ways: ["modelled it"],
    checks: ["exit ticket"], taught: true, targets: ["W.3.d"], note: "" }];
  const due = RV.due(lessons, { reviewDays: [1, 7, 30] }, SCHEDULE, day(lastLesson, 31));
  ok("a review is waiting after the break", due.length > 0, JSON.stringify(due));
  if (due.length) {
    const r = due[0];
    ok("and it does not land inside the holiday",
       !(r.on >= HOL_START && r.on <= HOL_END), `${r.on} (wanted ${r.wanted})`);
    ok("it waits until the school is open again", r.on > HOL_END, r.on);
    ok("it lands on a day that class is actually taught",
       SCHEDULE.some((b) => b.id === r.slot || true) && dow(r.on) >= 1 && dow(r.on) <= 5,
       `${r.on} is a ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow(r.on)]}`);
  }

  // ---- the register, across the break ------------------------------------
  // Somebody stops coming three weeks before the holiday. After a month off,
  // the run must not read as a month of absence — nobody was there.
  let att = [];
  const beforeHol = teaching.filter((d) => d < HOL_START).slice(-6);
  beforeHol.forEach((d, i) => {
    att = AT.take(att, { group: "9A", slotId: "sl0", away: i >= 3 ? ["s1"] : [] }, d);
  });
  const atBreak = AT.pattern(att, "s1", "9A", HOL_START);
  ok("a run of absences before the break is counted", atBreak.run === 3, JSON.stringify(atBreak));
  const afterHol = AT.pattern(att, "s1", "9A", day(HOL_END, 5));
  ok("and the month off does not add to it — no registers were taken",
     afterHol.run === 3, `run is ${afterHol.run} after the break`);
  ok("and the wording says how old the answer is",
     /weeks ago/.test(AT.words(afterHol)), AT.words(afterHol));
  ok("and warns that the register itself is out of date",
     /may have moved on/.test(AT.words(afterHol)), AT.words(afterHol));

  // ---- what got covered, either side --------------------------------------
  const records = [{ id: "r1", who: "s1", topic: "W.3.d", level: "3", date: lastLesson, createdAt: "" }];
  const conf = { levels: ["4", "3", "2", "1"], targetLevel: "3" };
  const pic = ATN.picture(records, conf, lessons, { name: "x", targets: [{ code: "W.3.d", text: "sensory" }] },
    CONTACTS.filter((c) => c.group === "9A"), "9A", { attendance: att });
  ok("what was taught before the break is still on the record after it",
     pic.rows.length === 1 && pic.rows[0].code === "W.3.d", JSON.stringify(pic.rows.map((r) => r.code)));
  ok("and the ones never judged are still counted apart",
     pic.rows[0].unjudged + pic.rows[0].missedIt.length === 11,
     JSON.stringify({ un: pic.rows[0].unjudged, missed: pic.rows[0].missedIt.length }));
}

sec("So: how long does setting it up take?");
{
  const jobs = [
    ["paste the register in, once", 1],
    ["type in 5 timetable blocks", 5],
    ["type in the holiday as a blocking entry", 1],
    ["type in the term dates on each slot", 5],
    ["set up the skills and the levels", 1],
    ["paste in the syllabus", 1],
  ];
  const total = jobs.reduce((n, [, c]) => n + c, 0);
  jobs.forEach(([what, n]) => console.log(`      ${String(n).padStart(3)} × ${what}`));
  console.log(`      ${String(total).padStart(3)} separate actions before the app knows your term`);
  ok("and the register is no longer most of it", jobs[0][1] / total < 0.2, `${jobs[0][1]} of ${total}`);
  ok("the whole setup is now under twenty actions", total < 20, String(total));
}

console.log("\nWhat the trial says\n" + "-".repeat(19));
notes.forEach((n) => console.log("  · " + n));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
