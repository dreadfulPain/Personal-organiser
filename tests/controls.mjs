import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE CONTROLS ON EVERY PAGE, ONE BY ONE.
//
// Pressing everything and seeing what dies was already here, for seven pages
// typed out by hand. This asks the questions that survived that:
//
//   · does every BUTTON on the page actually do something? A button with no
//     handler is the purest version of the failure this app keeps producing —
//     it looks finished, it is on screen, and nothing happens.
//   · does every page render far enough to be worth pressing at all? A page
//     that throws halfway through its first render still passes a
//     press-everything test, because there is almost nothing left to press.
//     That is how week.html came to be "all 2 controls survive" for months.
//   · is anything that carries data left unreachable?

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
// Named rather than quietly dropped: one is prose, one needs a model before it
// does anything at all.
const SKIP = { "help.html": "prose only", "compare.html": "needs an engine" };
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html") && !SKIP[f]).sort();

import { DATA } from "./_data.mjs";

// ---------------------------------------------------------------------------
sec("Every button on every page does something");
for (const p of pages) {
  const html = fs.readFileSync(path.join(PUB, p), "utf8");
  const btns = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const r = await open(p, DATA);
  ok(`${p} opens without error`, r.errs.length === 0, r.errs.join("; "));
  if (!btns.length) continue;
  const dead = btns.filter((id) => {
    const e = r.byId.get(id);
    return !(e && e._on && e._on.click);
  });
  ok(`${p}: all ${btns.length} buttons in its markup are wired to something`,
     dead.length === 0, `nothing happens when you press: ${dead.join(", ")}`);
}

// ---------------------------------------------------------------------------
sec("Every page renders far enough to be worth pressing");
for (const p of pages) {
  const r = await open(p, DATA);
  const drawn = r.created
    .map((e) => String(e.textContent || "") + String(e.innerHTML || ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // A PAGE THAT THREW HALFWAY THROUGH ITS FIRST RENDER still passes a
  // press-everything test, because there is nothing left to press. Two of them
  // were doing exactly that and nobody could tell.
  ok(`${p} draws a real page, not a stump`, drawn.length > 120, `${drawn.length} chars: ${drawn.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------
sec("And nothing on any page shows an id where a name belongs");
for (const p of pages) {
  const r = await open(p, DATA);
  const drawn = r.created.map((e) => String(e.textContent || "") + String(e.innerHTML || "")).join(" ");
  // The ids in this fixture are p1 and p2, and the people are Aisha and Ben.
  // An id on screen means a lookup that quietly failed — the row still renders,
  // so it never looks broken, it just stops meaning anything.
  const shows = /(^|[\s>(])p[12]([\s<),.]|$)/.test(drawn);
  ok(`${p} shows names, not ids`, !shows,
     (drawn.match(/.{0,30}\bp[12]\b.{0,30}/) || [""])[0]);
}

done();
