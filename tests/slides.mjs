import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A NAME WITH THEIR JOB UNDERNEATH IT.
//
// You sit in a staff meeting, photograph the slides, and want those people in
// your app afterwards. That is the ordinary way anybody meets nine colleagues
// at once, and the app could not do it at all.
//
// Every reader here was built for a REGISTER: one person per line, or two
// columns. A slide is the other shape entirely —
//
//     Ms. A. Example:
//     - Principal of Somewhere High School
//     - Master Teacher of Mathematics
//     - Director of the County Mathematical Society
//
// — and read as a register that is FOUR PEOPLE, one of them called "- Master
// Teacher of Mathematics", with the app saying "4 to add." in full confidence.
//
// The names in this file are invented. The shapes are not: a title prefix, a
// trailing colon, an English name in brackets, somebody with only one name, and
// two people whose job titles start with the same word.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

const SLIDES = [
  "Ms. A. Example:",
  "- Principal of Somewhere High School",
  "- Principal of Somewhere High School International Division",
  "- Master Teacher of Mathematics",
  "",
  "Mr. B. Sample:",
  "- Deputy Principal of Somewhere High School",
  "- High School Master Maths Teacher",
  "",
  "Mr. C. Instance (Principal Robin):",
  "- Principal of Primary & Middle School",
  "- Master Teacher",
  "",
  "Dana:",
  "- Assistant Principal",
  "- Coordinator of HR",
].join("\n");

// ---------------------------------------------------------------------------
sec("A slide is read as people, not as a register");
{
  ok("the shape is recognised", R.looksLikeCards(SLIDES), "read as a register");
  const cards = R.cardsIn(SLIDES);
  ok("four people, not fourteen lines", cards.length === 4, String(cards.length));
  ok("and none of them is a job title",
     !cards.some((c) => /^-/.test(c.name) || /Master Teacher of/.test(c.name)),
     JSON.stringify(cards.map((c) => c.name)));

  // THE COLON IS PUNCTUATION, not part of anybody's name.
  ok("the colon comes off", cards.every((c) => !/[:：]$/.test(c.name)),
     JSON.stringify(cards.map((c) => c.name)));
  // The title stays, because it is how the slide wrote them and names.js already
  // knows to look past a Mr/Ms/Dr when matching.
  ok("but the title stays as written", cards[0].name === "Ms. A. Example", cards[0].name);

  // EVERYTHING THEY WROTE, in order.
  ok("all the roles come with them", cards[0].roles.length === 3, JSON.stringify(cards[0].roles));
  ok("in the order the slide had them",
     cards[0].roles[0] === "Principal of Somewhere High School", cards[0].roles[0]);
  ok("and one-line people work too", cards[3].roles.length === 2, JSON.stringify(cards[3].roles));
}

sec("And the shapes a real slide actually has");
{
  const cards = R.cardsIn(SLIDES);
  // TWO NAMES, ONE PERSON, said in brackets — the case the app already handles
  // once it is told, and here it is being told.
  const both = cards.find((c) => /Instance/.test(c.name));
  ok("an English name in brackets is a second name", both.aka[0] === "Principal Robin",
     JSON.stringify(both));
  ok("and not part of the first one", both.name === "Mr. C. Instance", both.name);

  // SOMEBODY WITH ONE NAME IS STILL SOMEBODY. Plenty of people are introduced
  // by a first name alone, and it must not read as a fragment.
  ok("a single name is a person", cards.some((c) => c.name === "Dana"),
     JSON.stringify(cards.map((c) => c.name)));
}

sec("And a register is still read as a register");
{
  // This must not quietly take over the job the other reader is better at.
  ok("a pasted class is not cards",
     !R.looksLikeCards("Li Wei\t9A\nZhang Min\t9A\nChen Hao\t9A"), "the class reader lost its job");
  ok("nor is a plain list of names",
     !R.looksLikeCards("Ali\nBen\nCara\nDev"), "a list of names became one person");
  // A single stray dash in a class list is not a slide.
  ok("nor a class with one note in it",
     !R.looksLikeCards("Li Wei\t9A\nZhang Min\t9A\n- moved to 9B\nChen Hao\t9A"),
     "one dash changed how the whole paste was read");
  ok("and nothing at all is nothing", !R.looksLikeCards("") && R.cardsIn("").length === 0);
}

// ---------------------------------------------------------------------------
sec("What the page makes of them");
{
  const src = read("people.js");
  ok("the page reads the slide shape", /looksLikeCards\(/.test(src), "it only ever reads registers");

  // THE PREVIEW HAS TO BE ABOUT THE THING THAT WILL HAPPEN. It showed "18 to
  // add." from the register reader and then added 5 people from the card reader
  // — the count and the action were about two different readings of one paste.
  const render = (src.match(/function renderPaste\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("and the preview is about the same reading as the button",
     /asCards\(\)/.test(render), "the preview still counts rows the adder will never use");

  const add = (src.match(/function pasteAdd\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("what they do is kept", /role \/ year group/.test(add), "the roles are thrown away");
  ok("every line of it, not just the first", /roles\.join/.test(add), "only the first role survives");
  ok("and the other name comes with them", /aka/.test(add), "the bracketed name is dropped");
}

sec("And the brackets after a name still tell people apart");
{
  // "Principal of Somewhere High School" and "Principal of Primary & Middle
  // School" both shorten to "Principal", and then two people sit there in
  // identical brackets — worse than none, because the app now looks like it has
  // told them apart.
  const src = read("people.js");
  const add = (src.match(/function pasteAdd\(\)[\s\S]*?\n  \}/) || [""])[0];
  // The PROPERTY, not the variable's name — this pinned the word "clashes" and
  // broke when the rule got better.
  ok("a clash is noticed", /tagFor\(/.test(add) && /filter\(\(x\) => x === k\)/.test(add),
     "two people can come out identically tagged");
  ok("and more of the phrase is kept when it happens", /longerTag\(/.test(add),
     "a colliding short form is used anyway");
  // AND NEVER ENDING MID-THOUGHT. "Principal of Primary &" reads as a sentence
  // somebody stopped writing.
  const longer = (src.match(/function longerTag\([\s\S]*?\n  \}/) || [""])[0];
  ok("and it doesn't end on a dangling word", /&\|and\|of\|for/.test(longer),
     "a tag can end on \"of\" or \"&\"");
}

// ---------------------------------------------------------------------------
sec("A face, which is the thing you actually recognise");
{
  // There was no way to keep one at all — and a name and a job title are the
  // two things that do NOT help you recognise somebody in a corridor.
  const src = read("people.js");
  ok("a person can have a photo", /function photoLine\(/.test(src), "there is still nowhere to put one");
  ok("it goes through the upload the app already had",
     /\/api\/upload\?/.test(src), "it invents its own way of storing a file");
  ok("filed under that person", /people\/" \+ person\.id/.test(src), "it lands somewhere unfindable");
  // AN ORDINARY FILE IN YOUR OWN FOLDER, not a blob buried in the save file —
  // it backs up with everything else and opens without this app.
  ok("only a reference is kept on the contact", /photo: String\(c\.photo\)/.test(src),
     "the image itself is being stored in the data file");
  ok("and it can be taken off again", /remove the photo/.test(src), "a wrong photo is permanent");
  // NO SERVER, NO UPLOAD — and saying so beats a button that does nothing.
  ok("and with no server it says why not",
     /Photos need the app running/.test(src), "the control is offered where it cannot work");
  ok("the face is drawn where you look for it", /ppl-thumb/.test(src) && /ppl-face/.test(src),
     "it is stored and never shown");
  ok("with something for a screen reader", /alt=/.test(src), "the image has no alt text");
}

sec("And somebody you already have is not somebody new");
{
  // The register reader has always checked this. The card reader didn't — so
  // re-pasting a slide deck to fix one typo gave you every one of them twice.
  const src = read("people.js");
  const fn = (src.match(/const asCards = \(\) => \{[\s\S]*?\n  \};/) || [""])[0];
  ok("the card reader asks who you already have", /OrganiserNames\.look\(/.test(fn),
     "it adds everybody unconditionally");
  const add = (src.match(/function pasteAdd\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("and leaves them out", /filter\(\(c\) => !c\.already\)/.test(add), "duplicates still get added");
  ok("saying how many it left out", /already on your list/.test(add), "they vanish silently");
  // AND THE WHOLE-DECK CASE, which is what re-pasting actually is.
  ok("a deck you already have says so rather than doing nothing",
     /nothing to add/.test(add), "pressing Add appears to fail");

  // It goes through names.js, so a second name you have already taught it
  // counts as knowing them — the Caddy rule, applied here too.
  ok("and it is the one place that answers that question",
     !/toLowerCase\(\)\.includes/.test(fn), "it is matching names its own way again");
}

// ---------------------------------------------------------------------------
sec("A whole meeting's worth, including the ones who share a job");
{
  // A second set of slides: the office staff, three of whom have exactly the
  // same job title. Their NAMES are different, so nothing about that is
  // confusing — and cutting their tags to avoid a collision that was never
  // going to happen made the labels worse, not better.
  const OFFICE = [
    "Dana:", "- Assistant Principal", "- Coordinator of HR", "",
    "Erin:", "- HR Assistant", "- High School Maths Teacher", "",
    "Frank:", "- HR Assistant", "- Middle School Chinese Teacher", "",
    "Gus:", "- HR Assistant",
  ].join("\n");
  const cards = R.cardsIn(OFFICE);
  ok("four more people", cards.length === 4, String(cards.length));
  ok("including one with a single line", cards[3].roles.length === 1, JSON.stringify(cards[3]));
  ok("and the two-role ones keep both",
     cards[1].roles.length === 2 && /Maths/.test(cards[1].roles[1]), JSON.stringify(cards[1].roles));
}

sec("And a tag only has to separate people the name doesn't");
{
  // This cut on ANY shared tag, so two principals with completely different
  // names came out "(Principal of Shanghai)" and "(Principal of Primary)" —
  // both chopped mid-institution to dodge a collision that could not occur.
  const src = read("people.js");
  const add = (src.match(/function pasteAdd\(\)[\s\S]*?\n  \}/) || [""])[0];
  ok("a clash is about the name as well as the tag", /OrganiserNames\.norm\(cards\[i\]\.name\)/.test(add),
     "any shared job title still counts as a clash");
  ok("which is the same rule the People page warns by",
     /muddled/.test(read("names.js")), "the two definitions have come apart");
}

sec("And when names DO collide, it shows where they differ");
{
  // Two people called Wang Fang, one "Head of Year 7 at Somewhere High School"
  // and one "Head of Year 7 at Elsewhere Academy". Keeping more of the phrase
  // gave both of them "(Head of Year 7)" — more words, same label, because
  // everything separating them sits past the cut. This is the case the brackets
  // exist for: HR at this school and HR at the last one.
  const src = read("people.js");
  const fn = (src.match(/function differingPart\([\s\S]*?\n  \}/) || [""])[0];
  ok("there is a rule for it", fn.length > 100, "clashing tags still just get truncated");
  ok("it drops the part they share", /same\+\+/.test(fn) || /same \+= 1/.test(fn),
     "it doesn't compare the two phrases");
  ok("and nothing in it reads the words", !/principal|school|teacher|head/i.test(fn),
     "it has learned some job titles");
  // WHERE THERE IS GENUINELY NO DIFFERENCE it must not invent one — the People
  // page's own warning is the honest answer then.
  ok("and identical roles get no invented difference",
     /return ""/.test(fn), "it manufactures a distinction out of nothing");
}

sec("And two people you CAN tell apart are not called muddled");
{
  // norm() folds away the Mr/Ms/Dr on purpose, because "Dr Patel" and "Patel"
  // are one person to look up. But "Mr. Chen" and "Ms. Chen" are two people you
  // can tell apart at a glance, and warning that they read the same is untrue.
  const N = sb.OrganiserNames;
  const TWO = [
    { id: "a", name: "Mr. Chen", tag: "HR Assistant" },
    { id: "b", name: "Ms. Chen", tag: "HR Assistant" },
  ];
  ok("a different title is a visible difference", N.muddled(TWO).length === 0,
     JSON.stringify(N.muddled(TWO).map((g) => g.map((c) => c.name))));
  // AND THE REAL CASE STILL FIRES.
  const SAME = [
    { id: "a", name: "Gus", tag: "HR Assistant" },
    { id: "b", name: "Gus", tag: "HR Assistant" },
  ];
  ok("but two that really do read the same are flagged", N.muddled(SAME).length === 1,
     JSON.stringify(N.muddled(SAME)));
  // Still one person to LOOK UP, which is a different question and unchanged.
  ok("and looking one up still sees past the title",
     N.look("Chen", TWO).suggestions.length === 2, N.look("Chen", TWO).state);
}

// ---------------------------------------------------------------------------
sec("Three names for one person: characters, pinyin, and an English one");
{
  // In an international school somebody has their name in characters, the
  // pinyin of it, and an English name they picked — and every document writes
  // some different pair of those. All three have to reach the same person.
  const one = (head) => R.cardsIn(head + "\n- Head of Maths")[0];

  // A SLIDE PUTS TWO IN ONE BRACKET. Kept as one string that is neither of
  // them, "Jason" on its own then matched nobody.
  const both = one("Mr. Wang Wei (王伟 / Jason):");
  ok("two in a bracket become two names", both.aka.length === 2, JSON.stringify(both.aka));
  ok("the characters", both.aka.includes("王伟"), JSON.stringify(both.aka));
  ok("and the English one", both.aka.includes("Jason"), JSON.stringify(both.aka));
  // Commas and Chinese punctuation separate them just as well as a slash.
  ok("however the slide separated them",
     one("Mr. Wang Wei (王伟, Jason):").aka.length === 2 &&
     one("Mr. Wang Wei (王伟、Jason):").aka.length === 2,
     JSON.stringify(one("Mr. Wang Wei (王伟、Jason):").aka));

  // AND OFTEN THERE ARE NO BRACKETS AT ALL — "Wang Wei 王伟" is how most Chinese
  // school documents write it. Splitting on where the script changes needs no
  // vocabulary: it is the boundary between two writing systems.
  const side = one("Wang Wei 王伟:");
  ok("side by side is still two names", side.name === "Wang Wei" && side.aka[0] === "王伟",
     JSON.stringify(side));
  // Whichever the slide put first is the name. Nothing decides which is
  // somebody's "real" one.
  const other = one("王伟 Wang Wei:");
  ok("and the order is theirs, not the app's", other.name === "王伟" && other.aka[0] === "Wang Wei",
     JSON.stringify(other));
  ok("all three at once", (() => {
    const c = one("李梅 Li Mei (Mary):");
    return c.name === "李梅" && c.aka.includes("Li Mei") && c.aka.includes("Mary");
  })(), JSON.stringify(one("李梅 Li Mei (Mary):")));

  // A NAME WRITTEN SOLID IS ONE NAME. Cutting "李Anna" would be inventing.
  ok("but a name written solid is left alone", one("李Anna:").name === "李Anna", one("李Anna:").name);
  ok("and a plain English name gains nothing", one("Dana:").aka.length === 0, JSON.stringify(one("Dana:").aka));
}

sec("And every one of those forms finds the same person");
{
  const N = sb.OrganiserNames;
  const HE = [{ id: "w", name: "Mr. Wang Wei", aka: ["王伟", "Jason"] }];
  ["Wang Wei", "王伟", "Jason", "wangwei", "Wang", "wang wei"].forEach((q) =>
    ok(`"${q}" finds him`, N.look(q, HE).state === "matched", N.look(q, HE).state));

  // AND WITHOUT BEING TAUGHT, characters and pinyin are a QUESTION, not a
  // silent match — identifying somebody across two writing systems from a
  // surname is not something to decide on their behalf.
  const UNTAUGHT = [{ id: "w", name: "王伟" }];
  ok("untaught, pinyin asks rather than assumes",
     N.look("Wang Wei", UNTAUGHT).state === "nearly", N.look("Wang Wei", UNTAUGHT).state);
  ok("and once taught it is instant", (() => {
    const c = { id: "w", name: "王伟" };
    N.remember(c, "Wang Wei");
    return N.look("Wang Wei", [c]).state === "matched";
  })());
}

sec("And what they do is readable, not one run-on line");
{
  // Somebody imported off a slide arrives with every one of their jobs in the
  // notes, one per line — and a single-line input collapses those, so two jobs
  // came out as "Head of MathsHigh School Master Maths Teacher". Stored
  // perfectly, unreadable, and uneditable without breaking it further.
  const src = read("people.js");
  ok("a value with lines in it gets a box with lines in it",
     /document\.createElement\(many \? "textarea" : "input"\)/.test(src),
     "multi-line details are still shown in a one-line input");
  ok("decided by the value, not by which field it is",
     /const many = \/\\n\/\.test\(was\)/.test(src), "it knows which field is called notes");

  // AND EVERYBODY GETS A TITLE. "Middle School Chinese Teacher" has no joining
  // word to shorten at, so the head was the whole thing and this gave up —
  // leaving that one person the only name on the page with nothing beside it.
  const add = (src.match(/function tagFromRole\([\s\S]*?\n  \}/) || [""])[0];
  ok("a role with no \"of\" in it still gives a title", /return longerTag\(r\)/.test(add),
     "somebody whose job title has no joining word gets no title at all");
}

done();
