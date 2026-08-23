import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHICH ONE? — TWO PEOPLE WITH THE SAME NAME.
//
// "I'm Nick, and the document the school sent says there's someone called Nick
// in charge of an event. I really hope that isn't me."
//
// That sentence is the whole file. A name is not an identifier: every staff
// list has two Nicks in it, every school has an HR and so does the last school
// you worked at, and half of 9A shares a surname with the other half. The app
// held bare names and printed them bare, so it could not tell you which one and
// did not admit it.
//
// WHAT THIS CAUGHT, and it is worse than the display problem it was written
// for: look() took the FIRST exact name match and linked it, silently — while
// the rule four lines below it, for people found by first name, already said
// two candidates must be asked about. So a paper naming the other Nick was
// filed against you, or your job was filed against him, and nothing anywhere
// would ever have said so.

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(PUB, "names.js"), "utf8"), sb);
const N = sb.OrganiserNames;

// A staff room and a form group, with the collisions a real one has in it.
const PEOPLE = [
  { id: "p1", name: "Nick", isMe: true },
  { id: "p2", name: "Nick", group: "colleague", tag: "Head of Y9" },
  { id: "p3", name: "HR", group: "colleague", tag: "SHSID" },
  { id: "p4", name: "HR", group: "colleague", tag: "Dulwich" },
  { id: "p5", name: "Sarah Kane", group: "colleague" },
  { id: "s1", name: "Li Wei", group: "9A" },
  { id: "s2", name: "Zhang Min", group: "9A" },
  { id: "s3", name: "Chen Hao", group: "9A" },
];

// ---------------------------------------------------------------------------
sec("A name on its own is never linked to one of two people");
{
  const two = N.look("Nick", PEOPLE);
  ok("two people called Nick is a question, not a match", two.state !== "matched", two.state);
  ok("and both of them are offered", two.suggestions.length === 2,
     JSON.stringify(two.suggestions.map((c) => c.id)));
  // THE ONE THAT COSTS SOMETHING. Linked silently, either a job you never
  // agreed to lands on your list or yours quietly becomes somebody else's.
  ok("neither of them is picked for you", !two.contact, two.contact && two.contact.id);

  const hr = N.look("HR", PEOPLE);
  ok("and the same for two HRs at two schools", hr.state !== "matched", hr.state);

  // AND IT STILL LINKS WHEN THERE IS ONLY ONE. Asking about everybody would be
  // as useless as asking about nobody.
  ok("one Sarah is still just linked", N.look("Sarah Kane", PEOPLE).state === "matched");
  ok("and so is one student", N.look("Li Wei", PEOPLE).state === "matched");
}

// ---------------------------------------------------------------------------
sec("Everyone is written with the thing that tells them apart");
{
  ok("the tag comes out in brackets", N.saidAs(PEOPLE, "p2") === "Nick (Head of Y9)", N.saidAs(PEOPLE, "p2"));
  ok("and a school separates two of the same job", N.saidAs(PEOPLE, "p3") === "HR (SHSID)", N.saidAs(PEOPLE, "p3"));
  ok("and the other one", N.saidAs(PEOPLE, "p4") === "HR (Dulwich)", N.saidAs(PEOPLE, "p4"));

  // NOBODY HAS TO TYPE ANYTHING FOR A STUDENT. The class they were pasted in
  // with is already the answer.
  ok("a class does it without anybody typing a tag",
     N.saidAs(PEOPLE, "s1") === "Li Wei (9A)", N.saidAs(PEOPLE, "s1"));
  // And a colleague with nothing filled in still gets what the app does know.
  ok("and so does a bare kind", N.saidAs(PEOPLE, "p5") === "Sarah Kane (colleague)", N.saidAs(PEOPLE, "p5"));
}

sec("And the one that matters most says you");
{
  // The sentence at the top of this file. A document names Nick; whether that
  // is you decides whether you have just been given a job.
  ok("you are written as you", N.saidAs(PEOPLE, "p1") === "Nick (you)", N.saidAs(PEOPLE, "p1"));
  ok("which beats anything else on the card",
     N.tagOf({ name: "Nick", isMe: true, tag: "Head of Y9", group: "colleague" }) === "you");
  // AND THE OTHER NICK IS VISIBLY NOT YOU, which is the half that lets you
  // breathe out.
  ok("and the other Nick is visibly not you", !/you/.test(N.saidAs(PEOPLE, "p2")), N.saidAs(PEOPLE, "p2"));
}

// ---------------------------------------------------------------------------
sec("A bare name off a task gets the same treatment");
{
  // A task holds four letters and nothing else — "promised to Nick". That is
  // the case the whole thing exists for, and it was the one printing raw.
  ok("a name that means one person is written as that person",
     N.saidAs(PEOPLE, "Sarah Kane") === "Sarah Kane (colleague)", N.saidAs(PEOPLE, "Sarah Kane"));
  // AND WHERE IT GENUINELY CANNOT TELL, IT SAYS SO rather than choosing. This
  // is the line that would have saved the open evening.
  const said = N.saidAs(PEOPLE, "Nick");
  ok("a name that means two people says which two", /which one/i.test(said), said);
  ok("and names them both", /you/.test(said) && /Head of Y9/.test(said), said);
  ok("without silently picking either", said !== "Nick (you)" && said !== "Nick (Head of Y9)", said);

  // Somebody who isn't on your list at all is left exactly as typed. Inventing
  // a bracket for them would be worse than the bare name.
  ok("a stranger is left alone", N.saidAs(PEOPLE, "Mr Whoever") === "Mr Whoever", N.saidAs(PEOPLE, "Mr Whoever"));
  ok("and nothing is still nothing", N.saidAs(PEOPLE, "") === "" && N.saidAs(PEOPLE, null) === "");
}

// ---------------------------------------------------------------------------
sec("But a tag everybody in view shares is left off");
{
  // 9A's register would read "(9A)" on every single line — four more characters
  // per row on a page somebody scans down, telling them nothing. A tag is there
  // to separate people; one everybody shares separates nobody.
  const nineA = ["s1", "s2", "s3"];
  const shared = N.sharedTag(PEOPLE, nineA);
  ok("a whole class shares its class", shared === "9A", shared);
  ok("so the rows are just names",
     N.saidAs(PEOPLE, "s1", { sharedBy: shared }) === "Li Wei", N.saidAs(PEOPLE, "s1", { sharedBy: shared }));
  // AND THE MOMENT SOMEBODY FROM ELSEWHERE IS IN THE LIST, IT COMES BACK.
  const mixed = N.sharedTag(PEOPLE, ["s1", "s2", "p2"]);
  ok("a mixed list keeps them", mixed === "", mixed);
  ok("and then the class is said again",
     N.saidAs(PEOPLE, "s1", { sharedBy: mixed }) === "Li Wei (9A)", N.saidAs(PEOPLE, "s1", { sharedBy: mixed }));
  // One person is not a list, so there is nothing to be redundant against.
  ok("one person on their own always keeps theirs", N.sharedTag(PEOPLE, ["s1"]) === "");
  // "you" is never dropped, however short the list.
  ok("and you are never dropped", N.sharedTag(PEOPLE, ["p1", "p1"]) === "");
}

// ---------------------------------------------------------------------------
sec("And when the brackets don't help either, it says so");
{
  // TWO TAGS THE SAME IS WORSE THAN NO TAGS. The brackets now promise a
  // distinction that isn't there, so somebody trusts a difference they can't
  // actually see.
  const clash = PEOPLE.concat([{ id: "p6", name: "Nick", group: "colleague", tag: "Head of Y9" }]);
  const bad = N.muddled(clash);
  ok("two people who read identically are found", bad.length === 1, JSON.stringify(bad.map((g) => g.length)));
  ok("and it is the pair that clash", bad[0].length === 2 && bad[0].every((c) => c.name === "Nick"),
     JSON.stringify(bad[0].map((c) => c.id)));
  // The two Nicks in PEOPLE are told apart properly, so they are NOT muddled —
  // saying they were would train everybody to ignore this.
  ok("people who are told apart are left alone", N.muddled(PEOPLE).length === 0,
     JSON.stringify(N.muddled(PEOPLE).map((g) => g.map((c) => c.id))));
  ok("and an empty list is not a problem", N.muddled([]).length === 0);
}

// ---------------------------------------------------------------------------
sec("And nothing writes a person on screen its own way");
{
  // The bug class this app keeps finding. Six places printed a bare promisedTo
  // straight out, so half the app could tell two people apart and half could
  // not — and nothing said which half you were looking at.
  const offenders = fs
    .readdirSync(PUB)
    .filter((f) => f.endsWith(".js") && f !== "names.js")
    .filter((f) => {
      const src = fs.readFileSync(path.join(PUB, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // A person's name going onto the page without going through the one place
      // that knows which one they are.
      return /escapeHtml\(it\.(promisedTo|waitingOn)\)/.test(src) ||
             /"promised to " \+ it\.promisedTo/.test(src);
    });
  ok("a task's person always goes through one place", offenders.length === 0, offenders.join(", "));

  // AND THE ONE PLACE IS STILL TWO ANSWERS TO TWO QUESTIONS, on purpose: the
  // bare name for matching and for files, the written form for reading.
  ok("the bare name is still available", typeof N.nameOf === "function");
  ok("and it stays bare", N.nameOf(PEOPLE, "p2") === "Nick", N.nameOf(PEOPLE, "p2"));

  // A FILE IS NOT A SCREEN. The brackets stop YOU confusing two people while
  // you read; a spreadsheet gets sorted, matched and read back in, and a
  // bracket is not part of anybody's name.
  const cls = fs.readFileSync(path.join(PUB, "class.js"), "utf8");
  // [^)]* would stop at the ")" in "markable()" and pass on a line that had
  // been changed — the same trap the nameOf guard fell into once already.
  ok("an export still writes the plain name",
     /resultsCsv\([\s\S]{0,80}?OrganiserNames\.nameOf/.test(cls),
     (cls.match(/const csv = X\.resultsCsv\(.*/) || [""])[0]);
}

// ---------------------------------------------------------------------------
sec("And nobody works out for themselves whether a name means a person");
{
  // A FOURTH ANSWER TO THE SAME QUESTION, and a much looser one. people.js had
  // its own matcher — a.includes(b) || b.includes(a) — so a job promised to
  // "Nick" was counted against Nick, Nicky and Nicholas alike, and a job
  // promised to "Li" belonged to every Li on the roster.
  //
  // Worse, it never admitted a doubt: the card said "1 promised to them"
  // against BOTH people called Nick, definitively, twice, for one promise.
  const ppl = fs.readFileSync(path.join(PUB, "people.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("people.js asks names.js instead of guessing",
     !/includes\(b\)\s*\|\|\s*b\.includes\(a\)/.test(ppl), "its own loose matcher is back");
  ok("and it goes through look()", /OrganiserNames\.look\(/.test(ppl), "nothing asks look()");
  // SURE AND MAYBE ARE DIFFERENT FACTS. A promise the app cannot place is not
  // evidence about either person; it is a question, and it has to read as one.
  ok("a promise it cannot place is offered as a question",
     /might be theirs/i.test(ppl), "an unplaceable promise still reads as certain");
}

done();
