import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE SENTENCE IS THE ANSWER. THE NUMBER IS NOT.
//
// The One Person page says at the top that it is "everything about one person on
// one screen — for when someone is on the phone and you have about two seconds
// to find the answer."
//
// A teacher walkthrough put a term of evidence against Li Wei — five things,
// written by hand, including "third missed deadline this half term, mum emailed"
// — opened his page, and found the tiles, the graph, and four empty sections.
// Not one of the five sentences was anywhere on it.
//
// On the phone to his mother, "2 skills with a level, of 5" tells you nothing.
// "Third missed deadline this half term, mum emailed" is the entire call. And a
// report is written out of the sentences, never out of the levels — which is the
// premise of this whole app: your own words are the thing worth keeping.
//
// The other half of the same walkthrough: the record form cleared the summary,
// the tags and the follow-up tick after each entry, and left the LEVEL set. So
// marking Sofia a 3 and then typing a behaviour note about Li Wei gave Li Wei a
// 3 as well, silently, in his record — a mark on a child that nobody gave them,
// feeding the skills page and every report that comes off it.

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

// A person with a term behind them, the way one actually looks: some levels,
// some words, and the one note that matters said in passing.
const WHO = "p1";
const SAID = [
  ["2026-06-02", "academic", "read the poem literally, needed a lot of prompting", "Reading", "2", false],
  ["2026-07-01", "academic", "got to the irony on his own this time", "Reading", "3", false],
  ["2026-08-10", "behaviour", "third missed deadline this half term, mum emailed", "", "", true],
  ["2026-08-14", "academic", "explained why the writer left the ending open", "Reading", "4", false],
];
const TERM = {
  ...DATA,
  records: SAID.map(([date, type, summary, topic, level, followUp], i) => ({
    id: "s" + i, who: WHO, date, type, summary, detail: "", extra: {}, topic, level,
    tags: [], followUp, taskId: "", src: "hand",
    checkedAt: date + "T08:00:00Z", createdAt: date + "T08:00:00Z", files: [],
  })),
};

// ---------------------------------------------------------------------------
sec("Everything about one person means the words too");
{
  const r = await open("person.html", TERM);
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const text = r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");

  // Selecting a person is what the page waits for; the harness has no user, so
  // this drives the picker the way the page's own code does.
  const sel = r.byId.get("pWho");
  ok("there is somebody to choose", !!sel, "no picker");
  if (sel) {
    sel.value = WHO;
    (sel._on && sel._on.change ? sel._on.change : []).forEach((f) => f({ target: sel }));
    await r.settle();
  }
  const after = r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");

  // EVERY ONE OF THEM. Not a sample, not the academic ones — the question a
  // parent asks does not arrive sorted into categories.
  SAID.forEach(([, , summary]) =>
    ok(`"${summary.slice(0, 44)}…" is on their page`, after.includes(summary),
       "the page shows the levels and not the words"));

  // THE ONE THAT MATTERS MOST is the one that isn't academic, and it is the one
  // a page built around levels would naturally leave out.
  ok("a behaviour note is there with the rest",
     after.includes("third missed deadline"), "only the marked work is shown");
  ok("and it says it needs following up", /needs a follow-up/i.test(after),
     "the flag that made it urgent is gone");

  // The date belongs to it. "Third missed deadline" means something different
  // in June and in August.
  ok("each one carries when it was", /Aug|Jul|Jun/.test(after), after.slice(0, 200));

  // AND IT MUST NOT BREAK THE PAGE'S PURPOSE. The graph and the tiles were the
  // whole page before; they are still on it.
  ok("the levels are still there too", after.includes("Reading"), "the skill has gone");
  ok("nothing was traded away for it", r.errs.length === 0, r.errs.join(" | "));
}

sec("And somebody with nothing written about them is not a blank page");
{
  const none = { ...DATA, records: [] };
  const r = await open("person.html", none);
  const sel = r.byId.get("pWho");
  if (sel) {
    sel.value = WHO;
    (sel._on && sel._on.change ? sel._on.change : []).forEach((f) => f({ target: sel }));
    await r.settle();
  }
  const text = r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");
  ok("it says so in words rather than showing nothing",
     /nothing written down yet/i.test(text), text.slice(0, 300));
  // NOT A TELLING-OFF. Somebody who has written nothing has done nothing wrong.
  ok("and it doesn't tell you off about it",
     !/\b(you should|you must|you need to|don't forget|make sure you)\b/i.test(text),
     (text.match(/.{0,40}(you should|you must|you need to).{0,40}/i) || [""])[0]);
}

// ---------------------------------------------------------------------------
sec("A level belongs to one piece of work and does not follow the next one");
{
  // The summary, the tags and the follow-up tick were cleared after each entry
  // and the level was not — so the next thing you typed, about anybody, quietly
  // arrived carrying the last mark you gave.
  const src = read("records.js");
  const add = (src.match(/function addRecord\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("there is an add", add.length > 200, "addRecord has gone or changed shape");
  ok("the words are cleared", /#recSummary"\)\.value = ""/.test(add), "the summary sticks");
  ok("and so is the level", /#recLevel"\)\.value = ""/.test(add),
     "a mark given to one child is still set for the next");

  // THE SKILL DELIBERATELY STAYS — working down a set of books against one skill
  // is the ordinary way this gets used, and re-picking it thirty times would be
  // its own kind of wrong. But it must be SAID, or it is the same silent carry
  // wearing a different hat.
  ok("the skill is kept on purpose", !/#recTopic"\)\.value = ""/.test(add),
     "marking a set now needs the skill re-picked every single time");
  ok("and the app says what it is still holding", /Still on/.test(add),
     "the skill carries over without a word");
}

done();
