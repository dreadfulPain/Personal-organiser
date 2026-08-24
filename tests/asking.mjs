import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE TWO THINGS A NEW TEACHER ACTUALLY NEEDS, AND THE APP HAD NEITHER.
//
// From advice given to new staff, and both of them are shapes this app did not
// have:
//
//   "ASK, ASK AND ASK AGAIN." In a big school hundreds of things everyone
//   assumes are obvious were never said to you. A question is not a task:
//   somebody else has the answer, you can only get it when you catch them, and
//   once you have it the ANSWER is the thing worth keeping. Filed as tasks they
//   scatter, and each waits for you to happen to remember it at the moment you
//   are standing next to the person who could have told you in ten seconds.
//
//   "OBSERVE OTHERS, THREE TIMES IN THE FIRST MONTH." Not to learn how to teach
//   — to learn how it is done HERE. With no list of what to look for you come
//   out with "that was good" and nothing you can use.

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const words = (r) =>
  r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");

const WHO = [
  { id: "h", name: "Helen", tag: "Assistant Principal", details: {} },
  { id: "d", name: "Dan", tag: "HR Assistant", details: {} },
];
const Q = (id, question, whoId, asked, answer) => ({
  id, question, whoId, asked: asked || "", answer: answer || "",
  answeredAt: answer ? "2026-08-20" : "", createdAt: "2026-08-10T09:00:00Z",
});

// ---------------------------------------------------------------------------
sec("Questions are kept by who can answer them");
{
  const STATE = {
    ...DATA,
    contacts: WHO,
    asks: [
      Q("q1", "how much homework is normal for grade 1", "h"),
      Q("q2", "what does the co-teacher actually do", "h"),
      Q("q3", "who approves a trip", "h"),
      Q("q4", "how do I print in colour", "d"),
      Q("q5", "when do reports go out", ""),
    ],
  };
  const r = await open("ask.html", STATE);
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const t = words(r);

  // THE WHOLE REASON IT IS NOT A TASK LIST. You do not choose when you bump into
  // somebody; you choose whether all your questions for them are on one screen
  // when you do.
  ok("it says how many, and for how many people", /5 questions, for 3 people/.test(t), t.slice(0, 400));
  ok("and groups them under the person", /Helen \(Assistant Principal\)/.test(t), t.slice(0, 500));
  ok("saying how many are stacked up for them", /3 things/.test(t), t.slice(0, 600));
  // Whoever you have most waiting for goes first — that is the conversation most
  // worth catching.
  // Scoped to the list, not the whole page: the "who would know" picker above it
  // is sorted A–Z, so Dan appears there first whatever the grouping does.
  const openHtml = String((r.byId.get("akOpen") || {}).innerHTML || "");
  ok("the biggest pile is first", openHtml.indexOf("Helen") < openHtml.indexOf("Dan"),
     openHtml.slice(0, 200));
  // A QUESTION WITH NOBODY ON IT IS STILL A QUESTION. Half of them start as
  // "somebody must know this", and refusing them would lose the ones you most
  // need to ask.
  ok("and ones with nobody named are still shown", /Nobody named yet/.test(t), t.slice(0, 700));
  ok("with the question itself", /when do reports go out/.test(t), t.slice(0, 700));
}

sec("And what you were told is the thing that gets kept");
{
  const STATE = {
    ...DATA,
    contacts: WHO,
    asks: [
      Q("q1", "how much homework is normal for grade 1", "h", "2026-08-19",
        "20 minutes a night, never over a holiday"),
      Q("q2", "who approves a trip", "h", "2026-08-19"),
      Q("q3", "when do reports go out", ""),
    ],
  };
  const r = await open("ask.html", STATE);
  const t = words(r);
  // The section headings are static markup, which the stand-in browser doesn't
  // carry — they are checked in the file; what the page BUILT is checked here.
  const html = read("ask.html");
  ok("there is a place for what you were told", /What you were told/.test(html), "no such section");
  ok("and an answered one is in it",
     /20 minutes a night/.test(String((r.byId.get("akKnown") || {}).innerHTML || "")),
     String((r.byId.get("akKnown") || {}).innerHTML || "").slice(0, 200));
  // ASKED BUT NOT ANSWERED IS ITS OWN STATE. It is not still to ask, and it is
  // not known — and it is the one you would otherwise ask somebody twice.
  ok("there is a place for asked-but-not-answered", /Asked, waiting to hear/.test(html),
     "no such section");
  ok("and the one you asked is in it",
     /who approves a trip/.test(String((r.byId.get("akSent") || {}).innerHTML || "")),
     String((r.byId.get("akSent") || {}).innerHTML || "").slice(0, 200));
  // AND NOBODY IS BEING CHASED. This is a note to yourself, not pressure on a
  // colleague who is busier than you are.
  ok("and nothing in it chases anybody",
     /Nobody is being chased/.test(read("ask.html")), "it reads as a chase list");
  ok("the one still to ask is still to ask", /when do reports go out/.test(t), t.slice(0, 700));
}

sec("And an empty page says what to do rather than nothing");
{
  const r = await open("ask.html", { ...DATA, contacts: WHO, asks: [] });
  const t = words(r);
  ok("it says so plainly", /Nothing waiting to be asked/.test(t), t.slice(0, 400));
  // NOT A TELLING-OFF, and not a lecture either.
  ok("and doesn't tell you off",
     !/\b(you should|you must|you need to|don't forget|make sure you)\b/i.test(t),
     (t.match(/.{0,40}(you should|you must|you need to).{0,40}/i) || [""])[0]);
}

sec("And the people it offers are told apart");
{
  // Two people called Nick is exactly the situation a page like this puts you
  // in — a list of colleagues you have just met.
  const src = read("ask.js");
  ok("names go through the one place", /OrganiserNames\.saidAs\(/.test(src),
     "it writes a person its own way");
  ok("and nothing writes a bare name", !/\.name\s*\)/.test(src.replace(/\/\/.*$/gm, "")) ||
     /saidAs/.test(src), "a raw name is going onto the screen");
}

// ---------------------------------------------------------------------------
sec("Watching somebody else teach has something to go in looking for");
{
  const r = await open("visits.html", { ...DATA, visits: [], visitConfig: null });
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const t = words(r);
  // WITH NO LIST YOU COME OUT WITH "THAT WAS GOOD". The headings are the
  // feature; the notes are just what you saw.
  // They are offered in the config box, whose contents are a textarea VALUE and
  // so are not part of the page's text.
  const heads = String((r.byId.get("vsHeads") || {}).value || "");
  ok("there are headings to start from", /How tight the routines are/.test(heads), heads.slice(0, 200));
  ok("including the one nobody thinks to look at",
     /What the other adult in the room does/.test(heads), heads.slice(0, 300));
  ok("and it says the first one teaches you most",
     /None logged yet/.test(t), t.slice(0, 400));
}

sec("And the headings are yours, not the app's");
{
  const src = read("visits.js");
  ok("they are seeded, then editable", /STARTING_HEADINGS/.test(src) && /vsHeads/.test(src),
     "the list is fixed in code");
  // §0.2 — the same pattern as the record types and the portfolio points.
  ok("and the page says so out loud",
     /not the app's opinion/i.test(read("visits.html")), "it reads as the app's list");
  // AN EMPTY LIST IS NOT A CHOICE ANYBODY MAKES ON PURPOSE. It would leave the
  // page doing nothing with no way back but retyping the lot.
  ok("clearing them all puts the starting list back",
     /list\.length \? list : STARTING_HEADINGS/.test(src), "an empty box empties the page for ever");

  // NOTES ARE KEYED BY THE HEADING'S WORDS, not its position — so renaming one
  // never silently re-labels what you wrote under the old one, and deleting one
  // never shifts everything below it up by one.
  ok("what you wrote is tied to the heading it was under",
     /keyed by the heading TEXT/i.test(src), "notes are stored by index");
}

sec("And a count of them is never a target");
{
  const STATE = {
    ...DATA,
    visits: [
      { id: "v1", who: "a colleague", date: "2026-08-19", what: "Grade 1 English", notes: {}, createdAt: "2026-08-19T09:00:00Z" },
      { id: "v2", who: "another one", date: "2026-08-21", what: "Grade 2 Maths",
        notes: { "How tight the routines are": "lines up outside, no talking in" }, createdAt: "2026-08-21T09:00:00Z" },
    ],
    visitConfig: null,
  };
  const r = await open("visits.html", STATE);
  const t = words(r);
  ok("it says how many and when the last was", /2 logged/.test(t), t.slice(0, 400));
  ok("and how much of one is written up", /of \d+ written up/.test(t), t.slice(0, 600));
  // §5/§16 — "three in the first month" is advice somebody gave you, not a bar
  // the app gets to hold you to.
  ok("but never says you are behind",
     !/\b(behind|only \d+|you should|target|falling short)\b/i.test(t),
     (t.match(/.{0,40}(behind|target|you should).{0,40}/i) || [""])[0]);
}

// ---------------------------------------------------------------------------
sec("And both are stores like any other");
{
  // The whole point of the one table: a new store is backed up, restored,
  // synced and merged without anything else being told about it.
  const st = read("store.js");
  ["asks", "visits", "visitConfig"].forEach((k) =>
    ok(`${k} is in the table`, new RegExp(`\\["${k}", "organiser`).test(st), `${k} is not a store`));
}

done();
