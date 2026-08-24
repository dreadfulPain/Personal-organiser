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
  ok("a clash is noticed", /clashes/.test(add), "two people can come out identically tagged");
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

done();
