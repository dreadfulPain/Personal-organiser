import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A DEADLINE WRITTEN INSIDE A PLAN IS STILL A DEADLINE.
//
// Sunday night. The plan gets written in Word and pasted in, and near the
// bottom of it, the way it is on nearly every plan there has ever been:
//
//   Homework: finish the annotation, due Thursday
//
// This app reads "due Thursday" perfectly everywhere else. It read it nowhere
// here — the Lessons page never loaded the reader at all — so the line went in
// as a piece of the plan and Thursday arrived with nothing anywhere to say the
// work was owed. The teacher who has to hold that in their head is the same one
// whose student record already reads "third missed deadline this half term".
//
// OFFERED, NEVER TAKEN. The page's own promise is that it never writes a plan
// and never marks one; making a task out of somebody's plan unasked would be
// the same overreach pointing the other way. It reads the line, says which day
// it lands on, and waits to be pressed.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

// The rule the page uses, run against the real reader — so this cannot pass on
// a shape the app never actually produces.
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["names.js", "quickparse.js"].forEach((f) => vm.runInContext(read(f), sb));
const Q = sb.OrganiserQuickParse;

// Lifted from lessons.js by reading it, so a change there has to come through
// this rather than quietly leaving the test testing its own copy.
const src = read("lessons.js");
const SETS_WORK = (() => {
  const m = /const SETS_WORK = (\/.*\/[a-z]*);/.exec(src);
  if (!m) return null;
  return vm.runInContext(m[1], sb);
})();

const owedIn = (text) => {
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = SETS_WORK.exec(raw);
    if (!m) continue;
    const said = (m[1] || "").trim();
    if (!said) continue;
    const r = Q.parse(said, {});
    if (!r.date) continue;
    return { line: raw.trim(), title: r.title || said, date: r.date };
  }
  return null;
};

const TODAY = new Date();
const onDow = (dow) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

// ---------------------------------------------------------------------------
sec("The rule is still where the page keeps it");
ok("lessons.js has one", !!SETS_WORK, "SETS_WORK has gone or changed shape");
ok("and the page can read a date at all", /quickparse\.js/.test(read("lessons.html")),
   "the reader is not loaded on that page");

// ---------------------------------------------------------------------------
sec("Work a plan sets, with a day on it");
{
  const PLAN = [
    "9A English — Monday",
    "Learning objective: to explain how a writer builds tension",
    "",
    "Starter (5 min): read the opening paragraph",
    "Main (25 min): annotate the extract for short sentences",
    "",
    "Homework: finish the annotation, due Thursday",
    "Resources: extract sheet x30, highlighters",
  ].join("\n");
  const found = owedIn(PLAN);
  ok("it is found in the middle of a whole plan", !!found, "nothing found");
  ok("on the day it says", found && found.date === onDow(4), found && found.date);
  ok("called what the teacher called it", found && /finish the annotation/i.test(found.title),
     found && found.title);
  // YOUR WORDS ARE SHOWN BACK, so you can see it read the right line rather
  // than having to trust it.
  ok("and the line it read is kept to show you",
     found && /Homework: finish the annotation, due Thursday/.test(found.line), found && found.line);

  // EVERY WAY IT GETS WRITTEN, because half of them are what the department
  // down the corridor calls it.
  [
    "HW: read chapter 4 by friday",
    "Prep: learn the quotations for monday",
    "Assignment: draft the essay, due 10 September",
    "Independent study: finish the graph by wednesday",
    "Hand in: the annotated extract on thursday",
  ].forEach((line) =>
    ok(`"${line.slice(0, 34)}…" is heard`, !!owedIn(line), "not heard"));
}

sec("And every other date in a plan is left alone");
{
  // Every plan has dates in it. Offering the date at the top of the page, or
  // the lesson you taught last Tuesday, would put this on every single paste —
  // and a thing that fires every time is a thing people stop reading.
  [
    "9A English — Monday",
    "Learning objective: to explain how a writer builds tension",
    "Starter (5 min): recap what we did on Tuesday",
    "Main: annotate the extract for short sentences",
    "Plenary: one sentence each by the end of the lesson",
    "Resources: extract sheet x30",
    "We looked at this in September",
  ].forEach((line) => ok(`"${line.slice(0, 34)}…" is not a deadline`, !owedIn(line), JSON.stringify(owedIn(line))));

  // AND A HOMEWORK WITH NO DAY ON IT IS A NOTE, NOT A DEADLINE. There is
  // nothing for the app to add, so it says nothing.
  ok("homework with no day is left alone", !owedIn("Homework: finish the annotation"),
     JSON.stringify(owedIn("Homework: finish the annotation")));
}

// ---------------------------------------------------------------------------
sec("And what it makes is a deadline you gave, not one the app supplied");
{
  const js = read("lessons.js");
  const block = (js.match(/function renderOwed\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("there is an offer to make", block.length > 200, "renderOwed has gone");
  // A BUTTON, NOT A CONSEQUENCE. The page says it never writes a plan and never
  // marks one; writing your task for you unasked is the same overreach.
  ok("it is a button you press", /addEventListener\("click"/.test(block), "it happens on its own");
  ok("and nothing is saved until you do",
     block.indexOf('addEventListener("click"') < block.indexOf("OrganiserStore.save"),
     "it saves before you press anything");
  // datedBy: "you". The date came off the teacher's own plan, and anything
  // downstream that goes easy on an app-supplied date must not go easy on this.
  ok("the date counts as yours", /datedBy: "you"/.test(block), "it is filed as a date the app invented");
  ok("and it is a real deadline", /deadlineType: "hard"/.test(block), "it is filed as a soft wish");
  // The class goes in the title: "collect the annotations" a fortnight later
  // means nothing without knowing whose.
  ok("the class comes with it", /group \?/.test(block), "the title says nothing about which class");
}

done();
