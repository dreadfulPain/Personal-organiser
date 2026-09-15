import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// SEVEN CALENDARS THIS READER HAS NEVER SEEN, READ ONCE.
//
// The question this file exists to answer is not "does the reader work" but
// "does it work on anything but the document it grew up on". A suite built
// around one file can pass five thousand times and say nothing about that.
//
// So: seven shapes, written before the reader was run on any of them, each one
// deliberately unlike the calendar the reader was fixed against — the date on
// the left instead of the right, sentences instead of a list, a table whose row
// and column headings both mean something, four ways of writing a span, a line
// the typesetter cut into six pieces, and a page with the office's own
// paperwork dated on it.
//
// AND IT IS A REGRESSION CORPUS NOW, NOT A HOLD-OUT. It was a hold-out for
// exactly one run — the first, which came to 63 of 68 and found two faults that
// were nothing to do with calendars. Mending those because of what these
// documents showed is what stopped them being evidence about anything unseen.
// A later claim about generality has to come from a set that has not yet
// changed a line of this code.
//
// A FAILURE HERE IS INFORMATION, NOT A FIRE. What it must not become is a list
// of rules invented one at a time to make each of these pass — that is the
// fault it is here to find, done deliberately. Anything mended because of this
// file has to make sense on all seven and on the suite besides.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { CORPUS } from "./_corpus.mjs";

const PUB = path.join(REPO_ROOT, "public");
let pass = 0, fail = 0;
const notes = [];
const gaps = [];
const okStrict = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 300) : "")); }
};

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DataView, TextDecoder,
  Error, DecompressionStream, Response, Blob, setTimeout };
sb.window = sb;
vm.createContext(sb);
["dates.js", "schedule.js", "dayshape.js", "ics.js", "pdftext.js", "roster.js",
 "goalplan.js", "priority.js", "dayplan.js", "timetable.js", "calplan.js"]
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const PDF = sb.OrganiserPdfText, CP = sb.OrganiserCalPlan;

for (const doc of CORPUS) {
  console.log(`\n${doc.name}`);
  // A SHAPE THIS READER IS KNOWN NOT TO MANAGE is reported and not failed —
  // the same way the missing spreadsheet reader is. What must never happen is
  // that it goes quiet: a gap nobody is told about is a gap nobody fixes.
  const ok = doc.known
    ? (n, c, e) => { if (!c) { gaps.push(`${doc.name}: ${n}`); console.log("  --  " + n); }
                     else { pass++; console.log("  ok  " + n); } }
    : okStrict;
  const read = await PDF.read(new Uint8Array(doc.build()).buffer);
  ok("it opens", read.ok && read.text.length > 20, `${read.ok} ${read.text.length}`);
  const r = CP.read(read.text, { year: doc.year });
  // A DAY CAN CARRY MORE THAN ONE ROW, now that a nameless entry no longer
  // loses its place to whatever else is on its date. So a wanted date is looked
  // for among ALL the rows on it, not in a map that keeps whichever came last.
  const on = (d) => r.rows.filter((x) => x.date === d);
  const seen = r.rows.map((x) => `${x.date}${x.endsOn && x.endsOn !== x.date ? "→" + x.endsOn : ""} ${x.label}`);
  doc.want.forEach(([date, name, endsOn]) => {
    const row = on(date).find((x) => name.test(x.label)) || on(date)[0];
    ok(`${date} is read`, !!row, JSON.stringify(seen));
    if (!row) return;
    ok(`  and called something like ${name}`, name.test(row.label), row.label);
    if (endsOn) ok(`  and runs to ${endsOn}`, row.endsOn === endsOn, row.endsOn || "(one day)");
  });
  // EVERY DATE IT FOUND THAT THE DOCUMENT DOES NOT HAVE AS AN ENTRY. Not
  // counted as a failure where the page really does carry that date — a reader
  // cannot know the office's paperwork from a teacher's — but said, because an
  // invented date is the one fault nobody would spot.
  const wanted = new Set(doc.want.map(([d]) => d));
  const allowed = new Set(doc.allow || []);
  const extra = r.rows.map((x) => x.date).filter((d) => d && !wanted.has(d) && !allowed.has(d));
  ok("and nothing it invented", extra.length === 0, JSON.stringify(seen));
  // TWO DIFFERENT THINGS ON ONE DAY ARE TWO THINGS. Merging on a shared date
  // alone would quietly throw one of them away.
  (doc.twoOn || []).forEach((d) => {
    const on = r.rows.filter((x) => x.date === d);
    ok(`two different things on ${d} are still two`, on.length === 2,
       JSON.stringify(on.map((x) => x.label)));
  });
  // AND ONE THING SAID TWICE IS ONE THING, which remembers both places.
  (doc.onceOnly || []).forEach((d) => {
    const on = r.rows.filter((x) => x.date === d);
    ok(`the same thing written twice on ${d} comes out once`, on.length === 1,
       JSON.stringify(on.map((x) => `${x.label} <- ${x.line}`)));
    ok("  and remembers where else it was written",
       !!(on[0] && (on[0].alsoFrom || []).length), JSON.stringify(on[0] && on[0].alsoFrom));
  });
  const spare = r.rows.map((x) => x.date).filter((d) => allowed.has(d));
  if (spare.length) notes.push(`${doc.name}: also read ${spare.join(", ")} — real dates on the page, not entries`);
}

if (gaps.length) {
  console.log("\nWhat this reader cannot do\n" + "-".repeat(26));
  CORPUS.filter((d) => d.known).forEach((d) => console.log(`  · ${d.known}`));
}
if (notes.length) {
  console.log("\nAlso read, without that being wrong\n" + "-".repeat(35));
  notes.forEach((n) => console.log("  · " + n));
}
console.log(`\n${pass} passed, ${fail} failed, ${gaps.length} known gap(s)`);
process.exit(fail ? 1 : 0);
