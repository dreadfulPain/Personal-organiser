import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// OPENING IT FOR THE FIRST TIME.
//
// There was no way in. A new teacher got a box saying "what's on your mind?"
// and sixteen tabs in a row, four of which sounded like people and none of
// which was the list of their classes. The single most important thing the app
// can know — the timetable that governs the whole week — lived behind a
// collapsed "set up my week" at the bottom of the Day page, and was findable by
// reading the source and by very little else.
//
// So this asks the questions somebody arriving would ask:
//
//   · is there a page that says where to start
//   · does it know what I have actually done, from my data rather than from a
//     flag saying I did it
//   · does every link go somewhere real, and land on the thing it promised
//   · can any page in this app be unreachable from the tabs
//   · and does it stay describing rather than start nagging

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const NAV = read("nav.js");

// ---------------------------------------------------------------------------
sec("The tabs");
{
  const links = [...NAV.matchAll(/\["([\w-]+\.html)",\s*"([^"]+)"\]/g)].map((m) => ({ file: m[1], label: m[2] }));
  ok("there are tabs", links.length >= 15, String(links.length));
  // A TAB POINTING AT NOTHING is a dead end you only find by pressing it.
  const missing = links.filter((l) => !fs.existsSync(path.join(PUB, l.file)));
  ok("every tab opens a page that exists", missing.length === 0,
     missing.map((l) => `${l.label} → ${l.file}`).join(", "));

  // AND NO PAGE MAY BE UNREACHABLE. A page nothing links to is a feature that
  // exists and cannot be got to — the exact state the timetable was in.
  const NOT_IN_NAV = { "compare.html": "a measuring bench, not part of using the app" };
  const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
  const orphans = pages.filter((p) => !NOT_IN_NAV[p] && !links.some((l) => l.file === p));
  ok("and every page can be reached from them", orphans.length === 0, orphans.join(", "));
  console.log(`  -- deliberately not on the tabs: ${Object.keys(NOT_IN_NAV).join(", ")}`);

  // THE TAB AND THE PAGE MUST AGREE. "Class" opened a page headed "The class"
  // that was actually the year's skills; "Students" opened "Record log". A tab
  // that says one word and lands on another is the confusion, not the cure.
  const NAMED_DIFFERENTLY = {
    "index.html": "Home is the page you land on, not a heading",
    "timeline.html": "Day — the page is headed with the actual day",
    "help.html": "Working? asks the question you'd be asking",
    "before-planning.html": "the page says the same thing at greater length",
  };
  links.forEach(({ file, label }) => {
    if (NAMED_DIFFERENTLY[file]) return;
    const h1 = (read(file).match(/<h1[^>]*>([^<]*)</) || [])[1] || "";
    const title = (read(file).match(/<title>([^<]*)</) || [])[1] || "";
    const agrees =
      h1.toLowerCase().includes(label.toLowerCase()) || title.toLowerCase().includes(label.toLowerCase());
    ok(`the ${label} tab opens a page that calls itself that`, agrees, `<h1>${h1}</h1> / <title>${title}</title>`);
  });

  // Grouped, because sixteen links in a row is a wall rather than a menu.
  const groups = [...NAV.matchAll(/\["([A-Z][^"]*)",\s*\[/g)].map((m) => m[1]);
  ok("they are grouped", groups.length >= 4, JSON.stringify(groups));
  ok("and every group is named", groups.every((g) => g.trim().length > 1), JSON.stringify(groups));
}

// ---------------------------------------------------------------------------
sec("The page that says where to start");
{
  const html = read("setup.html");
  ok("it exists and is a real page", html.length > 400, String(html.length));

  const EMPTY = Object.fromEntries(
    Object.entries(DATA).map(([k, v]) => [k, Array.isArray(v) ? [] : v && typeof v === "object" ? {} : null]));
  const blank = await open("setup.html", EMPTY);
  ok("it opens on a brand-new app", blank.errs.length === 0, blank.errs.join("; "));
  const words = (r) => r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + String(e.innerHTML || "")).join(" ");
  const cold = words(blank);
  ok("and it names the timetable as the thing to do", /timetable/i.test(cold), cold.slice(0, 120));
  ok("with nothing pretending to be done", !/✓/.test(cold), cold.slice(0, 200));
  // NOT DONE IS NOT A TELLING-OFF. Somebody who has done none of this has done
  // nothing wrong, and the app genuinely works without any of it.
  ok("it says the app works without any of it", /works without/i.test(cold), cold.slice(0, 300));
  ok("and it never tells you off",
     !/\b(you must|you should|you need to|don't forget|make sure you)\b/i.test(cold),
     (cold.match(/.{0,40}(you must|you should|you need to|don't forget|make sure you).{0,40}/i) || [""])[0]);

  // WITH REAL DATA IT MUST KNOW. Read off the data itself, never off a flag
  // saying the step was done — a flag can be true of an empty result.
  const full = await open("setup.html", DATA);
  ok("it opens on a set-up app", full.errs.length === 0, full.errs.join("; "));
  const warm = words(full);
  ok("it counts what is actually there", /✓/.test(warm), warm.slice(0, 200));
  ok("and says how many", /\d+ block|\d+ (person|people)/i.test(warm), warm.slice(0, 300));
}

// ---------------------------------------------------------------------------
sec("And its links land on the thing they promised");
{
  const js = read("setup.js");
  const gos = [...js.matchAll(/go:\s*"([^"]+)"/g)].map((m) => m[1]);
  ok("every step has somewhere to go", gos.length >= 3, JSON.stringify(gos));
  gos.forEach((g) => {
    const [file, hash] = g.split("#");
    ok(`${g} is a page that exists`, fs.existsSync(path.join(PUB, file)), file);
    if (!hash) return;
    // A LINK WITH A #hash NOTHING READS is a link that dumps you on a page and
    // leaves you to find the panel yourself — which is how the timetable came
    // to be unfindable in the first place.
    const target = fs.readdirSync(PUB)
      .filter((f) => f.endsWith(".js"))
      .map((f) => read(f))
      .join("\n");
    ok(`something actually reads #${hash} and opens that panel`,
       new RegExp(`#${hash}\\\\b`).test(target), `nothing looks for #${hash}`);
  });
}

// ---------------------------------------------------------------------------
sec("The class you set up is the class every page knows about");
{
  // TWO PLACES HOLDING "WHO MY STUDENTS ARE", AND ONLY ONE OF THEM KNOWING.
  // You could paste seventeen students into People, open the record log, and be
  // offered five made-up placeholders — S01 to S05 — with nothing to say your
  // class existed.
  const rec = fs.readFileSync(path.join(PUB, "records.js"), "utf8");
  ok("the record log offers the people you actually have",
     /function whoOptions\(\)/.test(rec) && /contacts\s*\n?\s*\.filter/.test(rec),
     "the who picker is still a hand-typed list of ids");
  const pickers = [...rec.matchAll(/fillSelect\("#(?:recWho|fWho)",\s*(\w+\(\))/g)].map((m) => m[1]);
  ok("everywhere it asks who", pickers.length >= 2 && pickers.every((x) => x === "whoOptions()"),
     JSON.stringify(pickers));

  // AND THE SAME QUESTION GETS THE SAME ANSWER EVERYWHERE. "Which lesson" was
  // fixed on the register — that day's blocks, wearing their times — and left
  // as all twenty-one in no order on the lessons page, five of them identically
  // named. One question, two answers, on two pages you use in the same hour.
  for (const [file, what] of [["attendpage.js", "the register"], ["lessons.js", "the lessons page"]]) {
    const src = fs.readFileSync(path.join(PUB, file), "utf8");
    ok(`${what} offers the lessons that run that day`,
       /blocksOn\(schedule,/.test(src), "it lists every block on the timetable, whatever day it is");
    ok(`${what} says what time each one is`, /fmtTime\(/.test(src), "the entries carry no time to tell them apart");
  }
}

// ---------------------------------------------------------------------------
sec("And what you wrote about a class is there when you plan for it");
{
  // "Everything you already know about a class, laid out to plan against" —
  // which counted a level and a set answer, and nothing else. Write "kept
  // flipping the sign" about a student in the record log and the page said
  // "nothing recorded for this group yet" and hid every section on it.
  const cp = fs.readFileSync(path.join(PUB, "classplan.js"), "utf8");
  ok("a note without a level still counts as something recorded",
     /!notes\.length && !written\.length/.test(cp),
     "empty still means 'nobody has a level'");
  ok("and it is handed to the page to show",
     /notes: notes\.concat\(written\)/.test(cp), "what you wrote is never passed on");
}

done();
