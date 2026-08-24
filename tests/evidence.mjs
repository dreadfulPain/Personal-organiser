import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// "NO EVIDENCE YET", AFTER A TERM OF EVIDENCE.
//
// A week before a probation review. A term in the app behind you: a timetable,
// a class, plans written and taught, assessment logged, registers taken. Open
// the portfolio and every single standard says
//
//     no evidence yet
//
// including the two you had ticked BY HAND on the Lessons page — the check
// boxes under "the targets you teach against" — which is the app being told and
// then not looking.
//
// WHY IT COULD NOT SEE THEM. A portfolio point is { id: "ts4", code: "TS4" }.
// Tasks link to a standard by its ID. The Lessons page ticks by its CODE. One
// thing, two names, and whichever you match on you miss half the app.
//
// AND WHAT IT MUST NOT DO. Records, registers, turns and the rest are not
// dragged in on a resemblance. Nobody labelled them, and deciding for somebody
// which standard their register proves would be the app writing their
// portfolio for them. Only what was ticked.

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const L = (title, targets, date, objective) => ({
  id: title.replace(/\W/g, "").slice(0, 8), title, plan: "", group: "9A", skill: "",
  slotId: "", objective, ways: [], checks: [], itemId: "", targets, date, taught: true,
  createdAt: date + "T08:00:00Z",
});

// A term's work, with two plans labelled the way the Lessons page labels them.
const TERM = {
  ...DATA,
  portfolio: {
    title: "Standards portfolio",
    points: [
      { id: "ts4", code: "TS4", title: "Plan and teach well structured lessons" },
      { id: "ts6", code: "TS6", title: "Make accurate and productive use of assessment" },
      { id: "ts7", code: "TS7", title: "Manage behaviour effectively" },
    ],
    evidence: [],
  },
  lessons: [
    L("9A English — tension", ["TS4", "TS6"], "2026-08-24", "to explain how a writer builds tension"),
    L("9A English — paragraphs", ["TS4"], "2026-08-19", "to organise ideas into paragraphs"),
  ],
};

const words = (r) =>
  r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");

// ---------------------------------------------------------------------------
sec("Work you already labelled is evidence you already have");
{
  const r = await open("portfolio.html", TERM);
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const t = words(r);

  ok("a lesson ticked against a standard turns up under it",
     /9A English — tension/.test(t), "the portfolio never asked about lessons");
  ok("and so does the second one", /9A English — paragraphs/.test(t), t.slice(0, 300));
  ok("with what the lesson was for", /builds tension/.test(t), "only the title comes through");
  ok("said plainly as something already in the app",
     /Already in your app/i.test(t), "it reads as though you wrote it up here");

  // THE SENTENCE THAT WAS FALSE. A standard with two labelled lessons under it
  // is not "no evidence yet", and a week before a review that is the difference
  // between panicking and not.
  ok("and such a standard no longer claims to have nothing",
     /nothing written up yet/i.test(t), "it still says no evidence yet over the top of them");

  // BUT A STANDARD WITH GENUINELY NOTHING STILL SAYS SO. Softening that would
  // make the page useless for the thing it is for.
  ok("a standard with nothing against it still says so",
     /no evidence yet/i.test(t), "every standard now looks covered");
}

sec("And the two halves of the app agree what names a standard");
{
  // { id: "ts4", code: "TS4" } — tasks link by id, lessons tick by code.
  const src = read("portfolio.js");
  const fn = (src.match(/function taughtFor\([\s\S]*?\n  \}/) || [""])[0];
  ok("it looks for both", /point\.id/.test(fn) && /point\.code/.test(fn),
     "it matches one name and misses the other half of the app");
  ok("and doesn't care about capitals", /toLowerCase\(\)/.test(src), "TS4 and ts4 read as two standards");

  // AND THE CASE THAT REALLY MATTERS. A portfolio you paste in yourself — which
  // is the whole point of "the list of points below are yours to change" — gets
  // a RANDOM id per point and keeps whatever code you typed. So for anybody not
  // on the seeded English standards, the code is the only link there is, and
  // matching on the id finds nothing at all, for ever.
  const MINE = {
    ...TERM,
    portfolio: {
      title: "Our framework",
      points: [
        { id: "mt7q1a9zk3", code: "SHS-1", title: "Plans lessons that stretch everyone" },
        { id: "mt7q1a9zk4", code: "SHS-2", title: "Assesses and feeds back" },
      ],
      evidence: [],
    },
    lessons: [L("my own framework lesson", ["SHS-1"], "2026-08-24", "an objective")],
  };
  const r = await open("portfolio.html", MINE);
  ok("a portfolio you wrote yourself still finds its lessons",
     /my own framework lesson/.test(words(r)),
     "anybody not on the seeded standards gets nothing, for ever");
}

// ---------------------------------------------------------------------------
sec("And nothing is dragged in that nobody labelled");
{
  // Records, registers and turns are full of things that RESEMBLE evidence for
  // a standard. Deciding which would be the app writing somebody's portfolio.
  const src = read("portfolio.js");
  const fn = (src.match(/function taughtFor\([\s\S]*?\n  \}/) || [""])[0];
  ok("only what was ticked counts", /l\.targets/.test(fn), "it is inferring links");
  ok("and it doesn't go looking at records", !/records/.test(fn), "it reads the record log");
  ok("nor at the register", !/attendance/.test(fn), "it reads attendance");

  // A term of records and registers with nothing ticked stays a gap, honestly.
  const UNLABELLED = {
    ...TERM,
    lessons: [L("nothing ticked on it", [], "2026-08-24", "an objective")],
  };
  const r = await open("portfolio.html", UNLABELLED);
  const t = words(r);
  ok("an unlabelled lesson is not claimed as evidence",
     !/nothing ticked on it/.test(t), "it guessed which standard a lesson proves");
}

sec("And what counts as a gap is one answer, not two");
{
  // The filter asked only about written evidence, so once a taught lesson could
  // sit under a standard the list and the card disagreed on the same page:
  // "no evidence yet" in one, two lessons in the other.
  const src = read("portfolio.js");
  ok("the gaps filter uses the same test as the badge",
     /const bare = \(p\) =>[\s\S]{0,120}taughtFor\(p\)/.test(src),
     "the filter still counts only written evidence");
}

sec("And the export says the same thing the screen does");
{
  // A reviewer reading "No evidence yet" over a standard you taught two
  // labelled lessons against is the same false sentence, printed.
  const src = read("portfolio.js");
  const fn = (src.match(/async function exportPortfolio\([\s\S]*?\n  \}/) || [""])[0];
  ok("the export knows about them", /taughtFor\(point\)/.test(fn), "the file still says no evidence");
  ok("and keeps them separate from what you wrote",
     /Lessons taught against this standard/.test(fn), "they are counted as your own write-ups");
  ok("and only claims nothing when there is nothing",
     /!ev\.length && !taught\.length/.test(fn), "it still prints No evidence yet over them");
}

done();
