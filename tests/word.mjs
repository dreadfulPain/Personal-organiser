import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHAT ACTUALLY ARRIVES WHEN YOU PASTE OUT OF WORD.
//
// A textarea only ever receives text/plain, so the paste itself works and no
// file handling is needed. But "plain text out of Word" is not the same plain
// text a person types, and the differences are invisible on screen:
//
//   CRLF line endings, and a VERTICAL TAB (U+000B) wherever a soft return was
//   used — shift+enter, which is how most people end a line inside a bullet.
//   NON-BREAKING SPACES and tabs for indentation.
//   MIDDOT bullets, because Word's list formatting has no plain-text form.
//   TABS between cells when the plan is laid out as a table, which a great many
//   school templates are.
//   DOUBLE SPACES and smart punctuation after a heading.
//
// If any of those breaks the parse, the plan is kept but nothing is read out of
// it, and the only symptom is a count that stays low.

import fs from "node:fs";
import vm from "node:vm";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.window = sb; vm.createContext(sb);
["names.js", "lessonplan.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const LP = sb.OrganiserLessonPlan;

const CR = "\r\n";
const VT = "";      // soft return — shift+enter inside a bullet
const NB = " ";      // non-breaking space
const MIDDOT = "·";  // Word's plain-text bullet
const LSEP = " ";    // line separator, turns up in some exports

sec("A plan copied out of Word");
{
  const text =
    "Year 9 — settings" + CR + CR +
    "Learning Objective:" + NB + " To describe a setting using the five senses." + CR + CR +
    "Activities" + CR +
    MIDDOT + "\tModel a paragraph on the board" + CR +
    MIDDOT + "\tThey write their own" + VT + "then swap and read" + CR +
    MIDDOT + "\tShare two out loud" + CR + CR +
    "Assessment" + CR +
    MIDDOT + "\tExit ticket";
  const p = LP.parse(text, null);
  ok("the objective survives a non-breaking space after the colon",
     /five senses/.test(p.objective), JSON.stringify(p.objective));
  ok("and isn't left as a stray letter", p.objective.length > 10, JSON.stringify(p.objective));
  ok("Word's bullets are read as bullets", p.ways.length === 3, JSON.stringify(p.ways));
  ok("and stripped of the middot", !p.ways.some((w) => w.includes(MIDDOT)), JSON.stringify(p.ways));
  // A soft return inside a bullet is one activity written over two lines, not
  // two activities. Split, it turns up in the mirror as a method of its own.
  ok("a wrapped bullet comes back as one activity, rejoined",
     p.ways[1] === "They write their own then swap and read", JSON.stringify(p.ways));
  ok("with no stray control character left in it",
     !p.ways.some((w) => /[\u000b\u000c\u2028\u2029]/.test(w)), JSON.stringify(p.ways));
  ok("the checks are still separate", p.checks.length === 1, JSON.stringify(p.checks));
}

sec("A heading with the spacing Word leaves behind");
{
  // Two spaces, a non-breaking space, and a tab all appear after headings in
  // real templates. The text after the heading must come back whole.
  [
    "Learning Objective:  To describe a setting.",
    "Learning Objective:" + NB + NB + "To describe a setting.",
    "Learning  Objective: To describe a setting.",
    "Learning Objective\tTo describe a setting.",
    "LEARNING OBJECTIVE – To describe a setting.",
  ].forEach((line, i) => {
    const p = LP.parse(line, null);
    ok(`heading form ${i + 1} keeps the whole objective`,
       p.objective === "To describe a setting.", JSON.stringify(p.objective));
  });
}

sec("A plan laid out as a table, which most school templates are");
{
  // Word tables paste as tab-separated cells, one row per line.
  const text =
    "Class\t9A\tDate\tTuesday" + CR +
    "Learning Objective\tTo use connectives to join two ideas" + CR +
    "Activities\tRecap yesterday" + CR +
    "\tSort the connective cards" + CR +
    "Assessment\tThumbs up on three examples";
  const p = LP.parse(text, null);
  ok("the objective comes out of its cell",
     /connectives/.test(p.objective), JSON.stringify(p.objective));
  ok("and doesn't drag the heading with it",
     !/objective/i.test(p.objective), JSON.stringify(p.objective));
  ok("activities come out too", p.ways.length >= 1, JSON.stringify(p.ways));
  ok("and the check is separate", /Thumbs up/.test(p.checks.join(" ")), JSON.stringify(p.checks));
}

sec("Odd line breaks don't swallow the rest of the plan");
{
  const text = "Learning Objective" + VT + "to add fractions" + VT + VT +
               "Activities" + VT + "- watch me do one" + LSEP + "- then you do one";
  const p = LP.parse(text, null);
  ok("a plan written entirely with soft returns still parses",
     /fractions/.test(p.objective), JSON.stringify(p));
  ok("and its activities are separate lines", p.ways.length === 2, JSON.stringify(p.ways));
}

sec("Nothing about this needs a file");
{
  // The point worth being sure of: a textarea receives text/plain and nothing
  // else, so there is no .docx to open, no library, and no upload. If that ever
  // stops being true this test is the thing that should be revisited.
  const src = fs.readFileSync(`${REPO}/public/lessons.js`, "utf8");
  ok("the page reads a textarea, not a file", !/type="file"|FileReader|\.docx/i.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
