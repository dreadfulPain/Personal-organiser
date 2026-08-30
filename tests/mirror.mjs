import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A BAR AT 100% IS NOT A PICTURE OF ANYTHING.
//
// Looking Back opens with "What you've finished, by area — a picture of where
// your effort's been going". A teacher walkthrough, Sunday night after a week
// that got away, found the picture was this:
//
//   3 things finished. Here's how that spread across areas:
//   (no category)                                     3 · 100%
//
// One bar. Full width. Telling you nothing, in the shape of an answer.
//
// TWO FAULTS BEHIND IT, and the second is the interesting one.
//
// It grouped by `tags`, while the parts of somebody's life are `areas` — which
// the rest of this same file already asks OrganiserAreas about. The same
// question answered two ways in one file.
//
// And even with the right field it would still have been one bar, because rule
// one of this whole app is that you never categorise anything before entering
// it. A breakdown that only works for people who sort their tasks up front is a
// breakdown that never works, by design.
//
// So: areas when there are any; otherwise a split the app already knows without
// being told anything — how heavy each thing was; and when neither
// distinguishes anything, a sentence instead of a bar.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker, codeOf } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
const F = (title, days, effort, areas) => ({
  id: title.replace(/\W/g, "").slice(0, 10) + days,
  title, type: "task", date: "", datedBy: "you", time: "", deadlineType: "soft",
  importance: "normal", effort, tags: [], whenText: "", goalId: "", standardId: "",
  openLoop: false, areas: areas || [], plannedMinutes: 0, spentMinutes: 0,
  promisedTo: "", waitingOn: "", contactId: "", remindAt: "", remindedAt: null,
  done: true, completedAt: ago(days), createdAt: ago(days + 3),
});

const words = (r) =>
  r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + " " + String(e.innerHTML || "")).join(" ");

// ---------------------------------------------------------------------------
sec("A week nobody sorted still shows you something true");
{
  // The ordinary case, and the one that was broken: nothing carries an area,
  // because nothing ever does unless somebody goes looking for the field.
  const MIX = {
    ...DATA,
    items: [
      F("photocopy the extract", 2, "quick"),
      F("order the exercise books", 3, "quick"),
      F("email the parents", 4, "quick"),
      F("book the minibus", 5, "quick"),
      F("mark 10B books", 6, "draining"),
      F("write the scheme of work", 8, "draining"),
      F("plan Monday's lesson", 1, "medium"),
      F("set up the display", 7, "medium"),
    ],
  };
  const r = await open("looking-back.html", MIX);
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const t = words(r);
  ok("it counts what was finished", /8 things finished/.test(t), t.slice(0, 200));
  // THE SENTENCE SAYS WHAT THE BARS ARE. A chart claiming to be about areas
  // when it is really about weight is a chart that lies quietly.
  ok("and says what it split by", /how heavy each one was/i.test(t), t.slice(0, 400));
  ok("the quick ones are counted", /quick things/.test(t), t.slice(0, 400));
  ok("and the draining ones", /draining things/.test(t), t.slice(0, 400));
  // NOTHING THAT ISN'T THERE. "(no category)" was the old answer and it named a
  // failure as though it were a category.
  ok("nothing is filed under a made-up heading", !/\(no category\)/.test(t), t.slice(0, 400));
}

sec("And once things belong somewhere, that is what it shows");
{
  const SORTED = {
    ...DATA,
    items: [
      F("mark 10B books", 2, "draining", ["work"]),
      F("write the scheme of work", 3, "draining", ["work"]),
      F("book the dentist", 4, "quick", ["home"]),
      F("ring the landlord", 5, "quick", ["home"]),
      F("read the new spec", 6, "medium", ["work"]),
    ],
  };
  const r = await open("looking-back.html", SORTED);
  const t = words(r);
  ok("it goes back to the parts of your life", /spread across areas/i.test(t), t.slice(0, 400));
  ok("naming them", /work/.test(t) && /home/.test(t), t.slice(0, 400));
  ok("and stops talking about weight", !/how heavy each one was/i.test(t), t.slice(0, 400));

  // ONE THING WITH AN AREA MEANS THE SPLIT IS REAL. The rest are unsorted, not
  // a reason to throw the whole split away.
  const MOSTLY = {
    ...DATA,
    items: [F("mark 10B books", 2, "draining", ["work"]), F("book the dentist", 3, "quick"),
            F("ring the landlord", 4, "quick")],
  };
  const r2 = await open("looking-back.html", MOSTLY);
  const t2 = words(r2);
  ok("a part-sorted week still splits by area", /spread across areas/i.test(t2), t2.slice(0, 400));
  ok("and says plainly which ones aren't sorted", /\(not sorted\)/.test(t2), t2.slice(0, 400));
}

// ---------------------------------------------------------------------------
sec("And where there is nothing to see, it says so instead of drawing a bar");
{
  // Three ordinary things really are one bar. Drawing it full-width dresses up
  // "no answer" as an answer.
  const FLAT = {
    ...DATA,
    items: [F("set up the display", 3, "medium"), F("email the parents", 3, "medium"),
            F("plan Monday's lesson", 3, "medium")],
  };
  const r = await open("looking-back.html", FLAT);
  const t = words(r);
  ok("it still says how many", /3 things finished/.test(t), t.slice(0, 300));
  ok("and what they were like", /all of them ordinary things/.test(t), t.slice(0, 300));
  ok("without a bar that means nothing", !/100%/.test(t), t.slice(0, 300));
  // AND IT POINTS AT THE BETTER SPLIT rather than leaving you wondering.
  ok("it says what would make it more useful",
     /once things are, this splits by those instead/i.test(t), t.slice(0, 400));
}

sec("And a mirror is still never a scoreboard");
{
  const r = await open("looking-back.html", {
    ...DATA,
    items: [F("mark 10B books", 2, "draining"), F("photocopy the extract", 3, "quick")],
  });
  const t = words(r);
  // §5/§16. Every one of these would turn a picture into a verdict.
  ok("no target", !/\btarget\b/i.test(t.replace(/not a target/gi, "")), t.slice(0, 300));
  ok("no score", !/\byour score\b|\bstreak\b|\bfell short\b|\bwell done\b/i.test(t), t.slice(0, 300));
  ok("and nothing telling you off",
     !/\b(you should|you must|you need to|don't forget|make sure you)\b/i.test(t),
     (t.match(/.{0,40}(you should|you must|you need to).{0,40}/i) || [""])[0]);
}

// ---------------------------------------------------------------------------
sec("And it asks one place which areas a thing is in");
{
  // The same question answered two ways in one file: this half read `tags` and
  // the weekly half read `areas`. areas.js is where that question lives.
  const src = codeOf(fs.readFileSync(path.join(PUB, "lookback.js"), "utf8"));
  // The PROPERTY, not the exact call text: the file aliases the module, and a
  // test that pins the spelling breaks on a correct change.
  ok("it goes through areas.js",
     /OrganiserAreas/.test(src) && /\.on\(it\)/.test(src), "it works areas out for itself");
  ok("and no longer groups finished work by tags",
     !/it\.tags[\s\S]{0,40}counts\.set/.test(src), "it is back on the wrong field");
  ok("and the page loads areas.js at all",
     /areas\.js/.test(fs.readFileSync(path.join(PUB, "looking-back.html"), "utf8")),
     "the module isn't there to ask");
}

done();
