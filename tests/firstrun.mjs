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
import vm from "node:vm";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker, codeOf } from "./_check.mjs";
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
sec("And it says the same number of things as it shows");
{
  // WRITTEN OUT BY HAND, IN TWO SENTENCES, ON TWO PAGES. The home page said
  // "Four things to set up" and then named three of them; the setup page said
  // "Four things, once" and showed four. A step had been added and neither
  // sentence had heard about it.
  //
  // Somebody who cannot hold a count in their head reads "four" against a list
  // of three and assumes they have missed something — which is the exact
  // feeling this app exists to remove. So both sentences are built from the
  // list now, and this is what stops them being written out again.
  const sctx = { console, document: null };
  sctx.window = sctx;
  const seen = { count: [], names: [] };
  sctx.document = {
    readyState: "complete",
    addEventListener() {},
    querySelectorAll: (sel) => {
      const key = sel === ".nh-count" ? "count" : sel === ".nh-names" ? "names" : null;
      if (!key) return [];
      const el = {};
      Object.defineProperty(el, "textContent", { set: (v) => seen[key].push(v), get: () => "" });
      return [el];
    },
  };
  vm.createContext(sctx);
  vm.runInContext(read("steps.js"), sctx);
  const S = sctx.OrganiserSteps;

  ok("there is one list of things to set up", S && Array.isArray(S.list) && S.list.length >= 3,
     JSON.stringify(S && S.names && S.names()));
  ok("the number it says is the number it has", seen.count[0] === S.countWord(),
     `${seen.count[0]} vs ${S.countWord()}`);
  // AND THE NAMES ARE ALL OF THEM. This is the half that was actually wrong:
  // the count was four and the naming stopped at three.
  const said = seen.names[0] || "";
  const missing = S.names().filter((n) => !said.toLowerCase().includes(n.toLowerCase()));
  ok("and it names every one of them", missing.length === 0, `never mentioned: ${missing.join(", ")}`);

  // NEITHER PAGE MAY GO BACK TO WRITING IT OUT. A number typed into the prose
  // is a copy of something that lives somewhere else, and it will drift again.
  ["index.html", "setup.html"].forEach((page) => {
    const words = read(page).replace(/<!--[\s\S]*?-->/g, "");
    const hard = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+things\b/i.exec(words);
    ok(`${page} doesn't write the number out itself`,
       !hard || /nh-count/.test(words.slice(Math.max(0, hard.index - 120), hard.index + 20)),
       hard ? hard[0] : "");
    ok(`and ${page} loads the list that knows it`, /steps\.js/.test(read(page)), "steps.js is not loaded");
  });
}

// ---------------------------------------------------------------------------
sec("And its links land on the thing they promised");
{
  // ASKED OF THE LIST, NOT OF A FILE. This read setup.js by name, so moving the
  // list into steps.js — which is what stopped the two "how many things"
  // sentences drifting apart — broke a test that had nothing to say about
  // where the list lives. What matters is that every step goes somewhere real,
  // wherever the steps are kept.
  const js = fs.readdirSync(PUB)
    .filter((f) => f.endsWith(".js"))
    .map((f) => read(f))
    .join("\n");
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
  // ASKED AS A PROPERTY, not as "is the code in this file". Three files each
  // decided who the log was about, and two were wrong the same way; the answer
  // moved into the one module all three load, which broke a test that had
  // pinned WHERE the code lived rather than what had to be true of it.
  const decide = ["records.js", "class.js", "export.js"];
  decide.forEach((f) => {
    const src = codeOf(fs.readFileSync(path.join(PUB, f), "utf8"));
    ok(`${f} doesn't work out who the log is about on its own`,
       !/config\.whoIds/.test(src) || /whoList|who\b/.test(src),
       "it reads config.whoIds directly, which starts as five placeholders");
  });
  const lv = fs.readFileSync(path.join(PUB, "levels.js"), "utf8");
  ok("one place answers it", /function whoList\(/.test(lv), "no shared answer exists");
  ok("and it prefers the people you actually have", /sort\(\(a, b\) =>/.test(lv) && /contacts/.test(lv),
     "it doesn't look at your contacts at all");
  // AND THE RULE ITSELF, run rather than read.
  {
    const ctx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, isNaN };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(PUB, "levels.js"), "utf8"), ctx);
    const L = ctx.OrganiserLevels;
    const SEED = { whoIds: ["S01", "S02", "S03", "S04", "S05"] };
    const CLASS = [{ id: "b", name: "Ben" }, { id: "a", name: "Amara" }];
    // The seed is not a list anybody chose — that is why "if the list is empty,
    // use your contacts" could never fire: it never is.
    ok("your class beats the placeholders", JSON.stringify(L.whoList(SEED, CLASS)) === '["a","b"]',
       JSON.stringify(L.whoList(SEED, CLASS)));
    ok("in the order you read a register", L.whoList(SEED, CLASS)[0] === "a");
    // BUT A LIST YOU TYPED WINS. You typed it to mark those people and not the
    // other twenty-eight; adding your whole register back would make it pointless.
    ok("a marking list you chose is used as you chose it",
       JSON.stringify(L.whoList({ whoIds: ["b"] }, CLASS)) === '["b"]',
       JSON.stringify(L.whoList({ whoIds: ["b"] }, CLASS)));
    // And with nobody real yet, the placeholders are the practice run the
    // record page asks you to do first.
    ok("with no class yet, the placeholders stay",
       L.whoList(SEED, []).length === 5, JSON.stringify(L.whoList(SEED, [])));
  }

  const rec = fs.readFileSync(path.join(PUB, "records.js"), "utf8");
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

// ---------------------------------------------------------------------------
sec("People are listed in the order you read a register, everywhere");
{
  // FOUR PAGES DECIDED THIS AND TWO GOT IT WRONG. A pasted class list comes
  // back in whatever order it was stored in, which is backwards — so the person
  // picker read "Xu Jing, Ma Lin, Lena Fischer, Kai Nakamura, Jodie Blake" while
  // the register two clicks away read them the other way up. A register you have
  // to hunt down is a register you take badly, and a picker you have to hunt
  // down is worse: you are on the phone to a parent.
  //
  // Checked as a property of every file that puts people on screen, so a fifth
  // page can't quietly join them.
  const LISTS_PEOPLE = ["person.js", "rotapage.js", "attendpage.js", "classplan.js", "levels.js", "people.js"];
  LISTS_PEOPLE.forEach((f) => {
    const src = fs.readFileSync(path.join(PUB, f), "utf8");
    // Any sort keyed on the name counts; what must not happen is no sort at all.
    ok(`${f} puts them in name order`, /\bname[^;]*\.localeCompare\(/.test(src),
       "it lists people in whatever order they happen to be stored in");
    // AND IT MUST SURVIVE SOMEBODY WITH NO NAME. One row without one throws
    // inside the comparator and takes the whole page down with it.
    const cmp = (src.match(/\bsort\(\([^)]*\)\s*=>[^\n]*name[^\n]*localeCompare[^\n]*/g) || []);
    cmp.forEach((line) =>
      ok(`${f}: and survives somebody with no name`, /String\(/.test(line), line.trim().slice(0, 110)));
  });
}

// ---------------------------------------------------------------------------
sec("What a person is called is worked out in one place");
{
  // SIX FILES EACH ANSWERED THIS, and by the time anybody counted they had
  // already drifted: five returned `c.name || id`, and the one on the Day page
  // returned `c.name` — so a contact saved without a name rendered the day as
  // "with undefined". Not a hypothetical: the copies were identical when I
  // first counted them and were not by the time I looked again.
  // What must live in one place is DERIVING A DISPLAY NAME — a lookup that
  // wants the whole contact (to check somebody exists before deleting them, say)
  // is a different job and stays where it is.
  const own = fs.readdirSync(PUB)
    .filter((f) => f.endsWith(".js") && f !== "names.js")
    .filter((f) => {
      const src = codeOf(fs.readFileSync(path.join(PUB, f), "utf8"));
      // The copied shape exactly: a lookup in CONTACTS whose result is then read
      // for a name. An area's name, or a module's own map of what it was handed,
      // is a different question and stays where it is.
      // Found BY ID and then read for a name: that is the shape all six copies
      // had. Searching contacts by name (does this person exist yet?) is the
      // opposite direction and a different job. The \\b after "name" matters —
      // without it this matches ".nameOf", the shared call itself.
      // [\\s\\S] rather than [^)]: the predicate opens with "((x) =>", so anything
      // stopping at the first bracket never reaches the ".id ===" it is looking
      // for — and the guard passed with a copy put back in front of it.
      return [...src.matchAll(/contacts\s*\.find\([\s\S]{0,60}?\.id\s*===/g)]
        .some((m) => /\.name\b/.test(src.slice(m.index, m.index + 160)));
    });
  ok("nothing works out a display name for itself any more", own.length === 0,
     `still has its own copy: ${own.join(", ")}`);

  const N = (() => {
    const ctx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, isNaN };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(PUB, "names.js"), "utf8"), ctx);
    return ctx.OrganiserNames;
  })();
  const CLASS = [{ id: "p1", name: "Ma Lin" }, { id: "p2", name: "" }, { id: "p3" }, null];
  ok("somebody on your list is called what you called them", N.nameOf(CLASS, "p1") === "Ma Lin");
  // THE ID IS THE HONEST FALLBACK EVERY TIME. Inventing a name would be worse
  // than a bare code, and a bare code at least says where to go and fix it.
  ok("somebody saved without one shows the id, never the word undefined",
     N.nameOf(CLASS, "p2") === "p2", JSON.stringify(N.nameOf(CLASS, "p2")));
  ok("and somebody with no name field at all is the same",
     N.nameOf(CLASS, "p3") === "p3", JSON.stringify(N.nameOf(CLASS, "p3")));
  ok("somebody not on your list is their id", N.nameOf(CLASS, "p9") === "p9");
  ok("a null row in the list doesn't take the page down", N.nameOf(CLASS, "p1") === "Ma Lin");
  ok("no id is nothing, not the word undefined", N.nameOf(CLASS, "") === "" && N.nameOf(CLASS, null) === "");
  ok("and no list at all still answers", N.nameOf(null, "p1") === "p1");
  ok("it never returns undefined", [undefined, null, "", "p1", "p2", "p3", "zz"]
     .every((x) => typeof N.nameOf(CLASS, x) === "string"));
}

done();
