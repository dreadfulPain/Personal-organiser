import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A LIST OF PEOPLE, PASTED INTO THE FRONT DOOR.
//
// The box says "type it however it comes out" and "I'll send it to the right
// place". Somebody typed "add these people" and pasted five colleagues with
// their email addresses, and got back:
//
//     I couldn't find anything to add there — try a few more words?
//
// Wrong twice. There was plenty there, and more words would not have helped —
// the sorter can only return a task, a record, a goal or a handover, and a list
// of colleagues is none of the four, so it came back empty and the front door
// read that as "nothing was written".
//
// AND THE SHAPE WAS NEW. Three readers for lists of people already existed —
// a table with a heading row, a slide with bullets, a two-column register — and
// none of them sees this one, which is what a contacts table becomes when it is
// copied out of a PDF into somewhere that doesn't keep columns:
//
//     Grades 1-3 Liaison  Alex Sample  a.sample@example.org  asample
//
// One person a line, everything on it, nothing lining up. The email address is
// what makes it readable: it is unmistakable, it sits between the name and the
// handle, and a line with one on it and words in front is a person however the
// rest is arranged.
//
// Every fixture here is invented.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["names.js", "roster.js"].forEach((f) => vm.runInContext(read(f), sb));
const R = sb.OrganiserRoster;

// The shape it arrives in, wrapped exactly where a paste out of a PDF wraps:
// an address cut in half, and one row whose job ran onto the line above.
const PASTED = [
  "add these people",
  "Grades 1-3 Liaison Alex Sample a.sample@example.org asample",
  "Grades 1-5 Riverside",
  "Liaison Blair Instance blair.instance@example.co",
  "m BlairI",
  "Grade 4 Vice Head Chris Specimen c.specimen@example.org cspecimen",
  "Grade 5 Vice Head Dana Placeholder d.placeholder@example.org danap",
  // A LINE ENDING IN A TWO-LETTER DOMAIN AND NOTHING AFTER IT, followed by
  // somebody whose own line starts with a short lowercase word. Both halves of
  // the "is this address cut in half?" question, in one place.
  "Grade 6 Lead Erin Mock e.mock@example.co",
  "mr Frank Dummy f.dummy@example.org fdummy",
].join("\n");

sec("A list of people typed out flat is a list of people");
{
  const got = R.looseIn(PASTED);
  ok("everybody in it is read", got.people.length === 6,
     `${got.people.length}: ` + got.people.map((p) => p.name).join(", "));
  const who = (n) => got.people.find((p) => p.name === n);
  ok("with what they do", who("Alex Sample") && who("Alex Sample").tag === "Grades 1-3 Liaison",
     JSON.stringify(who("Alex Sample")));
  ok("and how to reach them",
     who("Alex Sample") && who("Alex Sample").details.Email === "a.sample@example.org",
     JSON.stringify(who("Alex Sample") && who("Alex Sample").details));
  ok("and the handle after it", who("Alex Sample") && who("Alex Sample").details.handle === "asample",
     JSON.stringify(who("Alex Sample") && who("Alex Sample").details));

  // THE NAME IS THE END OF THE LINE AND THE JOB IS THE REST. Every other rule
  // tried needed to know which words are jobs and which are people, which is the
  // vocabulary this app deliberately hasn't got.
  ok("a three-word job keeps all three words",
     who("Chris Specimen") && who("Chris Specimen").tag === "Grade 4 Vice Head",
     who("Chris Specimen") && who("Chris Specimen").tag);

  // AN ADDRESS CUT IN HALF BY THE PASTE is one address. Read as written, that
  // person has no way to be reached.
  ok("a wrapped address goes back together",
     who("Blair Instance") && who("Blair Instance").details.Email === "blair.instance@example.com",
     who("Blair Instance") && JSON.stringify(who("Blair Instance").details));
  // AND A JOB THAT RAN ONTO THE LINE ABOVE belongs to the row below it.
  ok("and a wrapped job joins the row it belongs to",
     who("Blair Instance") && who("Blair Instance").tag === "Grades 1-5 Riverside Liaison",
     who("Blair Instance") && who("Blair Instance").tag);
}

sec("And the words in front of the list are not one of them");
{
  const got = R.looseIn(PASTED);
  // "add these people" comes BEFORE the first person, so it is a lead-in. The
  // same line after one would be the front of a wrapped row — which of the two
  // it is takes no vocabulary at all: a preamble comes before the list.
  ok("nobody is called 'add these people'",
     !got.people.some((p) => /add these/i.test(p.name + " " + p.tag)),
     JSON.stringify(got.people.map((p) => `${p.tag} | ${p.name}`)));
  ok("and it is handed back rather than swallowed", got.rest === "add these people",
     JSON.stringify(got.rest));
}

sec("And one line with an address on it is a job, not a list");
{
  // "send the form to somebody@somewhere" is overwhelmingly a thing to do. Two
  // lines is the difference between a mention and a list.
  const one = "send the trip form to a.sample@example.org before Friday";
  ok("a single mention is not a list", !R.looksLikeLoose(one), JSON.stringify(R.looseIn(one)));
  ok("and neither is prose with no address in it at all",
     !R.looksLikeLoose("ring Alex Sample about the trip\nand chase Blair Instance"), "read as a list");
  ok("but two lines with addresses are", R.looksLikeLoose(PASTED));
}

sec("And the readers that already worked still get first refusal");
{
  // A TABLE WITH A HEADING ROW is a narrower claim than a flat list and says
  // more — the headings name the columns — so it is asked first.
  const TABLE = ["Section Leads", "Name", "Email", "WeChat ID",
    "Grades 1-3 Liaison", "Alex Sample", "a.sample@example.org", "asample",
    "Grade 4 Vice Head", "Chris Specimen", "c.specimen@example.org", "cspecimen"].join("\n");
  ok("a table is still read as a table", R.looksLikeContacts(TABLE) && R.contactsIn(TABLE).length === 2,
     String(R.contactsIn(TABLE).length));
  ok("and its column heading becomes the field name",
     R.contactsIn(TABLE)[0].details["WeChat ID"] === "asample",
     JSON.stringify(R.contactsIn(TABLE)[0].details));
  // A SLIDE is still a slide.
  const SLIDE = ["Ms. A. Example:", "- Head of Primary", "Mr. B. Sample:", "- Head of Maths"].join("\n");
  ok("a slide is still read as a slide", R.looksLikeCards(SLIDE) && R.cardsIn(SLIDE).length === 2,
     String(R.cardsIn(SLIDE).length));
  // AND A CLASS LIST IS NOT ANY OF THIS.
  const CLASS = ["Wang Wei\t9A", "Li Hua\t9A", "Sam Brown\t9B"].join("\n");
  ok("a register is not a list of colleagues", !R.looksLikeLoose(CLASS) && !R.looksLikeContacts(CLASS),
     JSON.stringify(R.looseIn(CLASS).people));
}

// ---------------------------------------------------------------------------
sec("And the front door sends them where they go");
{
  const r = await open("index.html", { ...DATA, items: [], schedule: [], contacts: [] });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const box = r.byId.get("dump");
  box.value = PASTED;
  const btn = r.byId.get("sortBtn");
  (btn._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  await r.settle();

  const said = String((r.byId.get("status") || {}).textContent || "");
  // THE SENTENCE THAT STARTED ALL THIS.
  ok("it does not say it couldn't find anything",
     !/couldn't find anything/i.test(said), said);
  ok("it says how many went in", /6 added to People/.test(said), said);
  // WHAT TO GO AND LOOK AT. The split between name and job is a reading of the
  // line, and a reading is worth saying out loud once.
  ok("and that the names were read rather than given", /read off the end of each line/.test(said), said);
}

sec("And the sorter finding nothing else does not wipe the news");
{
  // THE PATH THE REAL MACHINE IS ON. With the sorter answering, the leftover
  // words go to it — and when it shrugs at "add these people", as it should,
  // the front door used to replace everything on screen with "I couldn't find
  // anything to add there", including the fact that four people had just gone in.
  const r = await open("index.html", { ...DATA, items: [], schedule: [], contacts: [] }, {
    fetch: async (url) => {
      if (/\/api\/health/.test(url)) return { ok: true, json: async () => ({ hasAI: true }) };
      // The sorter, answering, and finding nothing — which is the truth about
      // a lead-in with no job in it.
      if (/\/api\/route/.test(url)) return { ok: true, json: async () => ({ entries: [] }) };
      return { ok: true, json: async () => ({}), text: async () => "" };
    },
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const box = r.byId.get("dump");
  box.value = PASTED;
  const btn = r.byId.get("sortBtn");
  (btn._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  await r.settle();
  const said = String((r.byId.get("status") || {}).textContent || "");
  ok("the people still went in", /6 added to People/.test(said), said);
  ok("and the sorter's shrug is said alongside, not instead",
     /Nothing else in there looked like a job/.test(said), said);
}

sec("And nothing that isn't people is caught up in it");
{
  const r = await open("index.html", { ...DATA, items: [], schedule: [], contacts: [] });
  const box = r.byId.get("dump");
  box.value = "mark the 3B books\nring the office about the trip form";
  const btn = r.byId.get("sortBtn");
  (btn._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  await r.settle();
  const drawn = r.created.concat([...r.byId.values()])
    .map((e) => String(e.innerHTML || "")).join(" ");
  // ORDINARY WORK STILL GOES TO THE CHECK-BACK, which is the whole front door.
  ok("two jobs still become two jobs", (drawn.match(/cb-title/g) || []).length === 2,
     String((drawn.match(/cb-title/g) || []).length));
  const said = String((r.byId.get("status") || {}).textContent || "");
  ok("and nothing was filed to People", !/added to People/.test(said), said);
}

done();
