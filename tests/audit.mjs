import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A GOING-OVER. Not "do the units pass" — they do. This asks the questions
// units can't: is each thing actually REACHABLE, does it SAVE, is it wired to a
// page, and is there anything built that nobody can get to?
import fs from "node:fs"; import path from "node:path";
import { codeOf } from "./_check.mjs";
const REPO = REPO_ROOT;
const P = (f) => path.join(REPO, "public", f);
const read = (f) => fs.readFileSync(P(f), "utf8");
const pages = fs.readdirSync(path.join(REPO, "public")).filter((f) => f.endsWith(".html"));
const scripts = fs.readdirSync(path.join(REPO, "public")).filter((f) => f.endsWith(".js"));
let issues = [];
const bad = (area, msg) => issues.push({ area, msg });
const sec = (s) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

// ---- 1. every module a page's code uses must be LOADED by that page --------
sec("Modules used by a page but not loaded on it");
// EVERY MODULE, FOUND RATHER THAN LISTED.
//
// This was a map somebody had to remember to add to, and the cost of that was
// exactly what you would expect: six modules had never been added, so six
// modules were never checked by the very thing that exists to check them. A
// list you have to maintain by hand is a list that is wrong.
//
// A module is a file that ends by putting something on window. That is the
// whole definition, it is mechanical, and a new one cannot hide from it.
const GLOBALS = Object.fromEntries(
  scripts.flatMap((f) => {
    const m = read(f).match(/window\.(Organiser[A-Za-z]*)\s*=/);
    return m ? [[m[1], f]] : [];
  })
);
if (Object.keys(GLOBALS).length < 20)
  bad("audit", `only ${Object.keys(GLOBALS).length} modules found — the way they are counted has stopped working`);
pages.forEach((pg) => {
  const html = read(pg);
  const loaded = new Set([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]));
  // Which of this page's own scripts are loaded, and what do they reach for?
  [...loaded].filter((f) => scripts.includes(f)).forEach((f) => {
    const src = read(f);
    Object.entries(GLOBALS).forEach(([g, file]) => {
      // Uses it AND doesn't guard on its absence → it must be loaded.
      const uses = new RegExp(`\\b${g}\\b`).test(src);
      const guards = new RegExp(`(window\\.${g}\\s*(\\?|&&|\\|\\|)|!window\\.${g}|if \\(!${g}|typeof ${g})`).test(src);
      if (uses && !loaded.has(file) && !guards) bad("wiring", `${pg}: ${f} uses ${g} but ${file} isn't loaded`);
    });
  });
});
console.log(issues.filter((i) => i.area === "wiring").map((i) => "  ✗ " + i.msg).join("\n") || "  all pages load what their code reaches for");

// ---- 2. every store key a page READS must be one the store SAVES ----------
sec("Data a page reads that nothing ever saves");
const store = read("store.js");
const known = new Set([...store.matchAll(/(\w+):\s*get\(LS_/g)].map((m) => m[1]));
// The blank state, on any line that assigns it. `[^}]` used to stop dead at the
// first `worked: {}`, so everything after it looked unsaved.
[...store.matchAll(/lastState\s*=\s*\{(.+)$/gm)].forEach((m) =>
  m[1].split(",").forEach((k) => { const n = k.split(":")[0].trim(); if (n) known.add(n); }));
// The server sends more than the stores — a note about a migration it just did,
// when the file was last written. Those are read by pages and saved by nobody,
// correctly. Take the field list from the server's own blank document rather
// than keeping a hand-written list here that would drift.
const blank = fs.readFileSync(`${REPO_ROOT}/server.js`, "utf8")
  .match(/return \{ version: 1,(.+?)\};/s);
if (blank) blank[1].split(",").forEach((k) => { const n = k.split(":")[0].trim(); if (n) known.add(n); });
// And store.js adds a couple of its own on the way out — which mode it's in,
// whether it just moved your old data into the file. Same reasoning: read them
// off what load() actually returns rather than listing them by hand.
[...store.matchAll(/return \{ \.\.\.\w+,(.+?)\};/g)].forEach((m) =>
  m[1].split(",").forEach((k) => { const n = k.split(":")[0].trim(); if (n) known.add(n); }));
const reads = new Set();
scripts.forEach((f) => {
  // Comments are not code: a filename in a sentence is not a field being read.
  const body = codeOf(read(f));
  // `data` the loaded document, never `e.data.size` off a recorder event — the
  // lookbehind is what tells those two apart.
  [...body.matchAll(/(?<![.\w])data\.(\w+)/g)].forEach((m) => reads.add(m[1]));
});
[...reads].sort().forEach((k) => {
  if (!known.has(k)) bad("storage", `nothing saves "${k}" — a page reads it and it will always be empty`);
});
console.log(issues.filter((i) => i.area === "storage").map((i) => "  ✗ " + i.msg).join("\n") || "  every key read is a key saved");

// ---- 3. fields a planner depends on must survive being written -------------
sec("Item fields the planners rely on, that capture might drop");
const capture = read("capture.js"), app = read("app.js");
["optional", "committed", "plannedMinutes", "spentMinutes", "notBefore", "goalId"].forEach((f) => {
  const usedBy = ["priority.js","dayplan.js","weekplan.js","schedule.js","goalplan.js"]
    .filter((m) => new RegExp(`\\b${f}\\b`).test(read(m)));
  if (!usedBy.length) return;
  const inCapture = new RegExp(`\\b${f}\\s*:`).test(capture);
  const inApp = new RegExp(`\\b${f}\\s*:`).test(app);
  if (!inCapture && !inApp) bad("fields", `"${f}" drives ${usedBy.join(", ")} but neither capture.js nor app.js carries it`);
});
console.log(issues.filter((i) => i.area === "fields").map((i) => "  ✗ " + i.msg).join("\n") || "  every planner field survives capture");

// ---- 4. anything built that no page can reach -----------------------------
sec("Built but unreachable");
Object.entries(GLOBALS).forEach(([g, file]) => {
  if (!scripts.includes(file)) return;
  const onAPage = pages.some((pg) => read(pg).includes(`src="${file}"`));
  if (!onAPage) bad("dead", `${file} is loaded by no page at all`);
});
// A module that IS loaded but whose functions nothing calls.
// Which modules to check for a caller: all of them, for the same reason. The
// hand-kept version here had drifted too — a module missing from it was a
// module nobody would notice was unreachable.
Object.values(GLOBALS).filter((f) => f !== "store.js").forEach((file) => {
  const g = Object.entries(GLOBALS).find(([, f]) => f === file)[0];
  const callers = scripts.filter((f) => {
    if (f === file) return false;
    const src = read(f);
    if (new RegExp(`${g}\\.`).test(src)) return true;
    // const P = window.OrganiserX  /  const C = () => window.OrganiserX
    const alias = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*(?:\\(\\)\\s*=>\\s*)?window\\.${g}\\b`).exec(src);
    return !!(alias && new RegExp(`\\b${alias[1]}\\s*\\(?\\)?\\.`).test(src));
  });
  if (!callers.length) bad("dead", `${file}: nothing in the app calls ${g}.* — it exists but is never used`);
  else console.log(`  ${file} → used by ${callers.join(", ")}`);
});
console.log(issues.filter((i) => i.area === "dead").map((i) => "  ✗ " + i.msg).join("\n") || "");

// ---- 5. CSS classes the JS makes that the stylesheet doesn't know ---------
sec("Styled? classes rendered with no rule behind them");
const css = read("style.css");
const seen = new Set();
scripts.forEach((f) => {
  [...read(f).matchAll(/class="([a-z][a-z0-9 _-]*)"/gi)].forEach((m) =>
    m[1].split(/\s+/).forEach((c) => c && seen.add(c)));
  [...read(f).matchAll(/className\s*=\s*"([a-z][a-z0-9 _-]*)"/gi)].forEach((m) =>
    m[1].split(/\s+/).forEach((c) => c && seen.add(c)));
});
const pairs = new Set();
scripts.forEach((f) => {
  const src = read(f);
  [...src.matchAll(/class(?:Name)?\s*=\s*"([a-z][a-z0-9 _-]*)"/gi)].forEach((m) => {
    const cs = m[1].split(/\s+/).filter(Boolean);
    // If ANY class on the element has a rule, the element is styled; the others
    // are hooks for javascript and want no CSS.
    if (cs.some((c) => new RegExp(`\\.${c}\\b`).test(css))) cs.forEach((c) => pairs.add(c));
  });
});
const unstyled = [...seen].filter((c) => !new RegExp(`\\.${c}\\b`).test(css) && !pairs.has(c)).sort();
// NOT counted as a fault: most of these are inner wrappers inside a styled
// parent, which lay out fine as plain divs and want no rule of their own.
// Listed to be eyeballed when something new appears here, not to be chased.
if (unstyled.length) console.log("  no rule of their own (usually fine — inner wrappers):\n    " + unstyled.join(", "));
else console.log("  every class is either styled or sits on a styled element");

// ---- 6. the [hidden] trap, which bit once before -------------------------
sec("Elements that set display and could out-rank [hidden]");
const hasGlobal = /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css);
if (!hasGlobal) bad("visual", "the global [hidden] rule is gone — anything with a display rule can never hide");
console.log(hasGlobal ? "  the global [hidden] { display:none !important } rule is in place" : "  ✗ MISSING");

// ---- 7. tone, across everything the user actually reads ------------------
sec("Anything that scolds");
const HARSH = /\b(you failed|you should have|too slow|behind schedule|you didn't|lazy|no excuse)\b/i;
scripts.concat(pages).forEach((f) => {
  const src = f.endsWith(".html") ? read(f) : read(f);
  const strings = (src.match(/`[^`]*`|"[^"]*"|'[^']*'/g) || []).join(" ");
  const m = strings.match(HARSH);
  if (m) bad("tone", `${f}: "${m[0]}"`);
});
console.log(issues.filter((i) => i.area === "tone").map((i) => "  ✗ " + i.msg).join("\n") || "  nothing scolds");

console.log(`\n${"═".repeat(60)}`);
if (!issues.length) console.log("No issues found.");
else {
  console.log(`${issues.length} thing(s) to fix:\n`);
  issues.forEach((i) => console.log(`  [${i.area}] ${i.msg}`));
}
