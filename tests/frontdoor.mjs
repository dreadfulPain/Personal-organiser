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

// ---------------------------------------------------------------------------
sec("And the front door will take a document, not just typing");
{
  const r = await open("index.html", { ...DATA, items: [], schedule: [], contacts: [] });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const html = read("index.html");
  // THE THING THAT WAS MISSING. Every reader in this app sat behind a file
  // input on some other page — the timetable's three levels down, inside a
  // section you have to know to open — so somebody holding a school PDF found
  // no way to give it to the app at all, and reasonably concluded it couldn't
  // read one.
  ok("there is somewhere to open one", /id="dumpFile"[^>]*type="file"|type="file"[^>]*id="dumpFile"/.test(html),
     "no file input on the front page");
  ok("and it says so where the button is", /or open a file/.test(html), "nothing offers it");
  // AND THE READERS IT NOW ASKS FOR ARE ON THE PAGE. Without these it says
  // "this page can't open a PDF", which is true and useless.
  ["pdftext.js", "calplan.js", "timetable.js", "roster.js"].forEach((f) =>
    ok(`${f} is loaded`, new RegExp(`src="${f.replace(".", "\\.")}"`).test(html), `${f} is missing`));
}

sec("And a file it can't read says so rather than doing nothing");
{
  // A PHOTOGRAPH NOW GOES TO THE LOCAL MODEL, so this needs a stand-in for that
  // — and the one thing worth pinning about it is what happens when there ISN'T
  // one, which is the state most machines are in.
  const asked = [];
  const sbx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
    RegExp, isNaN, parseInt, parseFloat, Intl, setTimeout, btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    Uint8Array,
    fetch: async (url) => {
      asked.push(String(url));
      return { ok: true, json: async () => ({ ok: false, why: "no_vision_model", message: "No model that can see is installed. In a terminal, run:  ollama pull llava" }) };
    },
    document: { getElementById: () => null, querySelector: () => null } };
  sbx.window = sbx;
  vm.createContext(sbx);
  ["dates.js", "names.js", "roster.js", "quickparse.js", "capture.js"]
    .forEach((f) => vm.runInContext(read(f), sbx));
  const C = sbx.OrganiserCapture;
  const file = (name, type) => ({ name, type: type || "", text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) });

  // A WORD FILE IS A ZIP and unpacking one is a job of its own. Saying so is
  // the whole point: "nothing happened" is the worst possible answer to a file
  // somebody chose on purpose.
  const doc = await C.textOf(file("timetable.docx"));
  ok("a Word file is refused in words", /can't open docx/.test(doc.note), JSON.stringify(doc));
  ok("and it says what does work", /copying the text across/.test(doc.note), doc.note);
  const xls = await C.textOf(file("classes.xlsx"));
  ok("and so is a spreadsheet", /can't open xlsx/.test(xls.note), xls.note);
  // A PHOTOGRAPH GOES TO THE MODEL ON THIS MACHINE, and when there isn't one
  // that can see, what comes back is the sentence that says how to get one —
  // not silence, and not a shrug.
  const pic = await C.textOf(file("timetable.jpg", "image/jpeg"));
  ok("a picture is offered to the local model", asked.some((u) => /\/api\/look/.test(u)),
     JSON.stringify(asked));
  ok("and with none that can see, it says what to run", /ollama pull llava/.test(pic.note), pic.note);
  ok("and hands back no words it didn't get", pic.text === "", JSON.stringify(pic.text));
  // AND PLAIN TEXT JUST WORKS.
  const txt = await C.textOf({ name: "notes.txt", type: "text/plain", text: async () => "hello" });
  ok("a text file comes straight through", txt.text === "hello", JSON.stringify(txt));
}

sec("And it says what is in a document rather than picking for you");
{
  const sbx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
    RegExp, isNaN, parseInt, parseFloat, Intl, setTimeout,
    document: { getElementById: () => null, querySelector: () => null } };
  sbx.window = sbx;
  vm.createContext(sbx);
  ["dates.js", "calplan.js", "schedule.js", "timetable.js", "names.js", "roster.js",
   "quickparse.js", "capture.js"].forEach((f) => vm.runInContext(read(f), sbx));
  const C = sbx.OrganiserCapture;

  // ONE DOCUMENT IS SEVERAL THINGS AT ONCE. A school booklet holds a week of
  // sessions AND a page of contacts, and picking one silently would be wrong
  // twice over.
  const BOTH = [
    "Wednesday", "26th August",
    "09:00 - 10:15 Meet the leadership team",
    "11:00 - 12:00 Insurance meeting",
    "1:00 PM - 2:00 PM Semester planning",
    "Grades 1-3 Liaison Alex Sample a.sample@example.org asample",
    "Grade 4 Vice Head Chris Specimen c.specimen@example.org cspecimen",
  ].join("\n");
  const what = C.whatIsIt(BOTH);
  ok("it sees the people", what.people === 2, JSON.stringify(what));
  ok("and the things for the week too", what.blocks >= 3, JSON.stringify(what));

  // AND A DOCUMENT WITH NEITHER IN IT claims neither.
  const PROSE = "Welcome to the school. There will be a lot to learn this week, so make the most of it.";
  const none = C.whatIsIt(PROSE);
  ok("prose is not a timetable", none.blocks === 0, JSON.stringify(none));
  ok("nor a list of people", none.people === 0, JSON.stringify(none));
}

done();
