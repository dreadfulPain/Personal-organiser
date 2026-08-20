import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// IS THERE ANYTHING NOTHING ASKS A QUESTION OF?
//
// Three modules had no test at all and nobody knew, because nothing counted.
// One of them was meeting.js — the module whose entire job is to stop "no
// warnings showing" reading the same as "nothing recorded", which is exactly
// what its own absence from the suite looked like.
//
// So this counts. Not coverage in the line-by-line sense — that measures how
// much code ran, and code running is not the same as anything checking what it
// did. This asks a blunter question: is each module NAMED by a test, is each
// page OPENED by one, is each endpoint CALLED by one.
//
// It fails on anything new that nobody has written a test for, and it lists
// what is knowingly left rather than hiding it in a number.

import fs from "node:fs";
import path from "node:path";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const HERE = join(REPO_ROOT, "tests");
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
const suites = fs.readdirSync(HERE).filter((f) => f.endsWith(".mjs") && f !== "covered.mjs");
const tests = suites.map((f) => read(HERE, f)).join("\n");

// ---------------------------------------------------------------------------
sec("Every module is asked something by somebody");
{
  const mods = fs
    .readdirSync(PUB)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ file: f, global: (read(PUB, f).match(/window\.(Organiser[A-Za-z]*)\s*=/) || [])[1] }))
    .filter((m) => m.global);
  ok("there are modules to check", mods.length >= 30, String(mods.length));
  mods.forEach((m) => {
    // Named by its global, or loaded by name. Either is somebody asking it a
    // question; neither is nobody.
    const asked = new RegExp(`\\b${m.global}\\b|["'\`]${m.file.replace(".", "\\.")}["'\`]`).test(tests);
    ok(`${m.file} is exercised by a test`, asked, "no test names it at all");
  });
}

// ---------------------------------------------------------------------------
sec("Every page is opened by somebody");
{
  // KNOWINGLY LEFT, and said out loud rather than quietly excluded. help.html
  // is a page of prose with no logic on it; compare.html is a measuring bench
  // for setting one number and is not part of using the app.
  const NOT_YET = { "help.html": "prose only, nothing to get wrong",
    "compare.html": "a measuring bench, not part of using the app" };
  const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
  pages.forEach((p) => {
    if (NOT_YET[p]) return;
    ok(`${p} is opened by a test`, tests.includes(`"${p}"`), "no test opens it");
  });
  const left = Object.keys(NOT_YET).filter((p) => pages.includes(p));
  console.log(`  -- knowingly not opened: ${left.map((p) => `${p} (${NOT_YET[p]})`).join(", ")}`);
}

// ---------------------------------------------------------------------------
sec("Every way in and out of the server is called by somebody");
{
  const srv = read(REPO_ROOT, "server.js");
  const eps = [...new Set([...srv.matchAll(/pathname === "(\/api\/[a-z-]+)"/g)].map((m) => m[1]))];
  ok("there are endpoints to check", eps.length >= 10, String(eps.length));
  const missing = eps.filter((e) => !tests.includes(e));
  missing.forEach((e) => ok(`${e} is called by a test`, false, "nothing calls it"));
  ok("every endpoint is called by something", missing.length === 0, JSON.stringify(missing));
}

done();
