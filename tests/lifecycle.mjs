import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// CAN IT BE COLLECTED, SORTED, STORED AND FOUND?
//
// Four questions, asked of every piece of data the newest features need. They
// are not the same question and a feature can pass three and be useless:
//
//   COLLECTED — is there anywhere in the app you can actually put it in? A
//               store nothing writes to is a beautifully tested empty box.
//   SORTED    — is there code that orders, counts or groups it? Otherwise it's
//               a pile, and a pile of twenty-four is the thing you can't hold.
//   STORED    — does it survive a save and a reload? (roundtrip.mjs proves this
//               against a real server; here we only check it's wired in.)
//   FOUND     — does it come back out onto a screen you'd go to looking for it?
//
// This reads the source rather than mocking it, deliberately: the failure this
// is built to catch is a field that exists in one file and is unknown to the
// next, and that only shows up when you look across all of them at once.

import fs from "node:fs";
import path from "node:path";
// One shared reading of store.js for the whole suite — see _store.mjs.
import { STORES as TABLE } from "./_store.mjs";

const dir = join(REPO_ROOT, "public");
const src = Object.fromEntries(
  fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])
);
const server = fs.readFileSync(`${REPO_ROOT}/server.js`, "utf8");
const store = src["store.js"];

let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 300) : "")); }
};

// Strip comments — a word in a comment is not a working code path, and reading
// one as if it were is how a gap hides behind its own explanation.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pages = Object.keys(src).filter((f) => f.endsWith(".html"));

// Every .js a page actually loads — a renderer in a file no page includes is
// not a screen you can get to.
const loadedBy = (js) => pages.filter((p) => src[p].includes(`src="${js}"`));

// ---- who writes each store ------------------------------------------------
// A save call naming the key. Only counts in a file a page loads.
function writers(key) {
  return Object.keys(src).filter((f) => f.endsWith(".js")).filter((f) => {
    const c = code(src[f]);
    const re = new RegExp(`OrganiserStore\\.save\\(\\s*\\{[^}]*\\b${key}\\b`);
    return re.test(c) && loadedBy(f).length > 0;
  });
}
function readers(key) {
  return Object.keys(src).filter((f) => f.endsWith(".js")).filter((f) => {
    const c = code(src[f]);
    return new RegExp(`data\\.${key}\\b`).test(c) && loadedBy(f).length > 0;
  });
}

console.log("\n--- can it be collected? (something writes it) ---");
// EVERY store, out of store.js, not the ten that were typed here. The ten were
// the newest features at the time; the other twelve went unasked for months,
// which is how the oldest and most-trusted ones stopped being checked at all.
const stores = TABLE.map((t) => t.key);
for (const k of stores) {
  const w = writers(k);
  ok(`${k}: something in the app writes it`, w.length > 0, `no page saves ${k} — the data can never get in`);
}

console.log("\n--- can it be found? (a page reads it back out) ---");
for (const k of stores) {
  const r = readers(k);
  ok(`${k}: a page loads it back`, r.length > 0, `nothing reads data.${k}`);
}

console.log("\n--- is it stored? (all the places a field gets silently dropped) ---");
// store.js used to copy this list into nine separate places and twelve stores
// had been missed out of some of them. It works from one table now, so the
// question is no longer "is it in all nine" but "is it in the table" — and
// tests/store.mjs runs the file to prove the table is really the only route.
for (const k of stores) {
  ok(`${k}: store.js has a store for it`, TABLE.some((t) => t.key === k));
  // server.js drops a field in three separate places if it isn't listed.
  ok(`${k}: the server keeps it`, (code(server).match(new RegExp(`\\b${k}\\b`, "g")) || []).length >= 3,
     `${k} appears fewer than 3 times in server.js — one of writeData's copies is missing it`);
}

console.log("\n--- is it sorted? (code that orders, counts or groups it) ---");
const sorting = {
  pastoralNotes: ["pastoral.js", ["forPerson", "freshness", "gaps", "tally"]],
  pastoralTopics: ["pastoral.js", ["normaliseTopic", "freshness"]],
  toldLog: ["told.js", ["forPerson", "recent", "lastToldAbout"]],
  targeted: ["classplan.js", ["coverage", "coverageWords"]],
  worked: ["weekend.js", ["recent", "look", "weekendOf"]],
  areas: ["areas.js", ["areasFor", "suggest", "inherited"]],
  tried: ["tried.js", ["forPerson", "outcome", "byApproach", "vocabulary"]],
  lessons: ["lessonplan.js", ["parse", "recent", "asTried", "mirror"]],
  rotas: ["rota.js", ["queue", "due", "mark", "insteadOf", "taskFor"]],
  attendance: ["attend.js", ["take", "sessions", "pattern", "concerns", "missed"]],
};
// SAID OUT LOUD rather than quietly not checked: which stores have no module
// that orders them. Some genuinely need none — a config is a config — but the
// list has to be visible or a new store joins it in silence.
{
  const unsorted = stores.filter((k) => !sorting[k]);
  if (unsorted.length) console.log(`  -- no module orders these (they may not need one): ${unsorted.join(", ")}`);
}
for (const [k, [file, fns]] of Object.entries(sorting)) {
  const c = code(src[file] || "");
  const missing = fns.filter((f) => !new RegExp(`function ${f}\\b`).test(c));
  ok(`${k}: ${file} orders it (${fns.join(", ")})`, missing.length === 0, `missing: ${missing.join(", ")}`);
  // Exported, not just defined — a private helper is not a way in.
  const exported = fns.filter((f) => new RegExp(`window\\.Organiser\\w+\\s*=[\\s\\S]*?\\b${f}\\b`).test(c));
  ok(`${k}: and hands those out`, exported.length === fns.length, `not exported: ${fns.filter((f) => !exported.includes(f)).join(", ")}`);
}

console.log("\n--- the countable half specifically ---");
// The whole "something for everyone" feature rests on two fields that were
// added last and are the easiest to lose: a topic's set answers, and which one
// a person picked. Every percentage on the planning page is zero without them.
ok("a topic can carry set answers", /options:/.test(code(src["pastoral.js"])));
ok("a note can carry which one was picked", /choice:/.test(code(src["pastoral.js"])));
ok("something can write a choice", writers("pastoralNotes").length > 0);
ok("something can write a topic's options",
   Object.keys(src).some((f) => f.endsWith(".js") && loadedBy(f).length &&
     /options/.test(code(src[f])) && new RegExp(`OrganiserStore\\.save\\(\\s*\\{[^}]*pastoralTopics`).test(code(src[f]))),
   "no page can create a topic with set answers — so nothing is ever countable");

console.log("\n--- a page that uses a module must actually load it ---");
// A guard like `LP ? LP.asTried(x) : x` stops a missing script tag from
// throwing — which is the point of it, and also the danger: the feature just
// quietly isn't there, no error, no blank space, a count that's simply lower
// than it should be. The audit lets guarded uses through on purpose, so the
// modules that carry data get checked here instead, guard or no guard.
// FOUND, NOT LISTED. This was a hand-kept map and seventeen modules had never
// been added to it — so seventeen modules could be read by a page that doesn't
// load them and nothing would say a word. A module is a file that puts
// something on window; that is mechanical and a new one cannot be forgotten.
const MODULES = Object.fromEntries(
  Object.keys(src)
    .filter((f) => f.endsWith(".js"))
    .flatMap((f) => {
      const m = src[f].match(/window\.(Organiser[A-Za-z]*)\s*=/);
      return m ? [[m[1], f]] : [];
    })
);
ok("every module that exists is checked here",
   Object.keys(MODULES).length >= 30,
   `only ${Object.keys(MODULES).length} found — the way modules are counted has stopped working`);
for (const page of pages) {
  const loaded = new Set([...src[page].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]));
  for (const js of [...loaded].filter((f) => src[f] && f.endsWith(".js"))) {
    for (const [g, file] of Object.entries(MODULES)) {
      if (!new RegExp(`\\b${g}\\b`).test(code(src[js]))) continue;
      ok(`${page}: ${js} needs ${file}`, loaded.has(file),
         `${js} reads ${g} but ${page} never loads ${file} — the feature is silently absent`);
    }
  }
}

console.log("\n--- finishing a job looks the same from every page ---");
// `done: true` on its own is half a record. The timeline stamps completedAt
// alongside it and Looking Back counts by that stamp, so a page that ticks
// something off without one produces work that happened on no particular day.
for (const f of Object.keys(src).filter((x) => x.endsWith(".js"))) {
  const c = code(src[f]);
  if (!/\bdone:\s*true\b/.test(c)) continue;
  ok(`${f}: stamps completedAt when it finishes something`, /completedAt/.test(c),
     `${f} sets done: true with no completedAt — Looking Back will lose it`);
}

console.log("\n--- and it never leaves ---");
for (const f of ["told.js", "pastoral.js"]) {
  const c = src[f];
  const leaks = ["download", "blob", "csv", "docShell", "fetch", "XMLHttpRequest", "navigator", "clipboard"]
    .filter((w) => new RegExp(w, "i").test(code(c)));
  ok(`${f} still has no way out`, leaks.length === 0, `found: ${leaks.join(", ")}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
