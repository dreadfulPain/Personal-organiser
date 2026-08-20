import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// DOES EVERYTHING ACTUALLY CONNECT TO EVERYTHING?
//
// The unit tests prove each piece works. The audit proves each module is loaded
// somewhere. Neither proves the app is JOINED UP — that a thing you type on one
// page reaches the page that needs it, that no feature is a cul-de-sac, and
// that nothing was built and then quietly left out of the wiring.
//
// So this walks the whole thing and reports orphans at four levels:
//
//   PAGES     — every page reachable from the tab bar, and loading what it uses.
//   MODULES   — every module loaded by a page, and called by something.
//   FUNCTIONS — every exported function called from somewhere outside its own
//               file. This is the sharpest of the four: a function that only
//               its own tests call is a feature nobody can reach.
//   STORES    — every store written, read, and carried by both save paths.
//   JOINS     — the specific chains this app is built out of, each walked end
//               to end rather than assumed.

import fs from "node:fs";
import path from "node:path";

const dir = join(REPO_ROOT, "public");
const src = Object.fromEntries(
  fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])
);
const server = fs.readFileSync(`${REPO_ROOT}/server.js`, "utf8");

let pass = 0, fail = 0, notes = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);
const code = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pages = Object.keys(src).filter((f) => f.endsWith(".html"));
const scripts = Object.keys(src).filter((f) => f.endsWith(".js"));
const loads = (pg) => new Set([...src[pg].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]));
const loadedBy = (js) => pages.filter((p) => loads(p).has(js));

// ---------------------------------------------------------------------------
sec("Every page is reachable from the tab bar");
{
  const nav = code(src["nav.js"]);
  const tabs = [...nav.matchAll(/\["([\w-]+\.html)"/g)].map((m) => m[1]);
  ok("the tab bar names real pages", tabs.every((t) => pages.includes(t)),
     tabs.filter((t) => !pages.includes(t)).join(", "));
  // A page may deliberately stay off the tab bar — the AI comparison page is a
  // workbench, not somewhere you'd navigate to daily. It has to SAY so on
  // itself, though, so "not in the tab bar" is a decision on the page rather
  // than something you discover by failing to find it.
  const reachable = new Set(tabs);
  const optedOut = (p) => /isn't in the tab|not in the tab/i.test(src[p]);
  pages.forEach((p) => {
    if (p === "index.html") return;
    const linked = pages.some((q) => q !== p && new RegExp(`href="${p}"`).test(src[q]));
    ok(`${p} can be got to`, reachable.has(p) || linked || optedOut(p),
       `${p} is in no tab bar, nothing links to it, and it doesn't say it's deliberate`);
  });
  const noNav = pages.filter((p) => !loads(p).has("nav.js") && !optedOut(p));
  ok("every page that should draw the tab bar does", noNav.length === 0, noNav.join(", "));
}

// ---------------------------------------------------------------------------
sec("Every module is loaded somewhere, and called by something");
{
  const modules = scripts.filter((f) => /window\.Organiser\w+\s*=/.test(src[f]));
  modules.forEach((f) => {
    const g = (src[f].match(/window\.(Organiser\w+)\s*=/) || [])[1];
    ok(`${f} is on at least one page`, loadedBy(f).length > 0, `${f} is loaded by no page`);
    const callers = scripts.filter((o) => o !== f && new RegExp(`\\b${g}\\b`).test(code(src[o])));
    ok(`${f} is used by something else`, callers.length > 0, `nothing outside ${f} mentions ${g}`);
  });
}

// ---------------------------------------------------------------------------
sec("Every exported function is called from outside its own file");
{
  // The sharpest check here. A function that exists, is tested, and is called
  // by nothing is a feature that was built and never wired up — which has
  // happened in this project more than once.
  const modules = scripts.filter((f) => /window\.Organiser\w+\s*=\s*\{/.test(src[f]));
  const dead = [];
  modules.forEach((f) => {
    const g = (src[f].match(/window\.(Organiser\w+)\s*=/) || [])[1];
    const block = (src[f].match(/window\.Organiser\w+\s*=\s*\{([\s\S]*?)\};/) || [])[1] || "";
    const names = block
      .split(",")
      .map((x) => x.split(":")[0].trim())
      .filter((x) => /^[a-z]\w*$/.test(x));
    // Everywhere else, including the pages: called on the global, on an alias
    // of it, or destructured off it.
    const others = scripts.filter((o) => o !== f).map((o) => code(src[o])).join("\n");
    // Its own file, minus the export line — so a helper reached through the
    // module's public entry point counts as reached. That distinction is the
    // whole value of this check: `suggest()` called only by `areasFor()` is a
    // working feature, and `suggest()` called by nothing at all is dead code
    // wearing the same clothes.
    const own = code(src[f]).replace(/window\.Organiser\w+\s*=\s*\{[\s\S]*?\};/, "");
    names.forEach((n) => {
      const outside = new RegExp(`\\.${n}\\s*\\(|\\b${n}\\s*[,}]|\\b${n}\\s*:`).test(others);
      if (outside) return;
      // Referenced, not only called — `.map(normaliseArea)` hands the function
      // over without ever writing `normaliseArea(`. Its own definition is
      // removed first so it can't count as its own caller.
      const inside = new RegExp(`\\b${n}\\b`)
        .test(own.replace(new RegExp(`function\\s+${n}\\b`, "g"), ""));
      if (inside) notes.push(`${g}.${n} is only reached from inside ${f} — exported, but nothing else calls it`);
      else dead.push(`${g}.${n}`);
    });
  });
  // THE ONE-TO-ONE ROTA. Called out separately because it isn't a stray helper
  // — it is a whole feature with a module, tests and no way to reach it. Four
  // functions, and between them they are the entire specification: someone was
  // busy so swap with the next in line, a turn missed for reasons that weren't
  // theirs costs them nothing, make the missed one up as soon as possible, and
  // say so if somebody is never going to catch up. None of it is reachable, and
  // there is no store for a rota either — the only thing using rota.js is the
  // coverage block, which builds a throwaway one in memory to borrow the
  // queueing and throws it away again.
  const rotaGap = dead.filter((d) => d.startsWith("OrganiserRota."));
  ok("the one-to-one rota is wired up to something", rotaGap.length === 0,
     `built, tested, and reachable from nowhere: ${rotaGap.join(", ")} — and no rota is ever stored`);

  const rest = dead.filter((d) => !d.startsWith("OrganiserRota."));
  // The remainder are helpers with no consumer rather than features with no
  // door. Listed so they stay visible, not failed on.
  if (rest.length) notes.push(`exported and called by nothing: ${rest.join(", ")}`);
}

// ---------------------------------------------------------------------------
sec("Every store is written, read, and survives both save paths");
{
  const store = code(src["store.js"]);
  const keys = [...store.matchAll(/(\w+):\s*get\(LS_/g)].map((m) => m[1]);
  ok("there are stores to check", keys.length > 5, String(keys.length));
  keys.forEach((k) => {
    const writers = scripts.filter(
      (f) => loadedBy(f).length && new RegExp(`OrganiserStore\\.save\\(\\s*\\{[^}]*\\b${k}\\b`).test(code(src[f])));
    const readers = scripts.filter(
      (f) => loadedBy(f).length && new RegExp(`data\\.${k}\\b`).test(code(src[f])));
    ok(`${k}: written by a page`, writers.length > 0, `nothing writes ${k}`);
    ok(`${k}: read by a page`, readers.length > 0, `nothing reads ${k}`);
    // Written on one page and read on another is the interesting case; written
    // and read only in the same file is a local variable with extra steps.
    if (writers.length && readers.length && writers.join() === readers.join())
      notes.push(`${k} is only used by ${writers.join(", ")} — no other page sees it`);
    ok(`${k}: kept by the fallback copy`,
       new RegExp(`setItem\\(LS_\\w+,\\s*JSON\\.stringify\\(state\\.${k}\\b`).test(store));
    ok(`${k}: kept by the server`, (code(server).match(new RegExp(`\\b${k}\\b`, "g")) || []).length >= 4,
       `${k} appears fewer than 4 times in server.js — a copy in writeData is missing it`);
  });
}

// ---------------------------------------------------------------------------
sec("The joins this app is actually built out of");
{
  const has = (f, re) => new RegExp(re).test(code(src[f]));

  // What you type on the home page has to become a schedulable item.
  ok("capture → items → the planner",
     has("capture.js", "OrganiserStore\\.save") && has("dayplan.js", "\\bitems\\b"));

  // A goal has to turn into work that the week can place.
  ok("goals → items → the week",
     has("goals.js", "OrganiserStore\\.save\\(\\s*\\{[^}]*items") && has("weekplan.js", "\\bitems\\b"));

  // A level recorded on the students page has to reach the person page and the
  // planning page.
  ok("records → one person, and → before you plan",
     has("person.js", "data\\.records") && has("before-planning.js", "data\\.records"));

  // The newest chain, and the longest: a plan pasted in becomes a thing you
  // tried, which is joined to levels to say what moved.
  ok("lesson → what you tried",
     has("lessonplan.js", "function asTried") && has("before-planning.js", "asTried"));
  ok("what you tried → levels → what moved",
     has("tried.js", "OrganiserLevels") && has("tried.js", "function outcome"));
  ok("and the whole chain is on one page",
     loads("before-planning.html").has("lessonplan.js") &&
     loads("before-planning.html").has("tried.js") &&
     loads("before-planning.html").has("levels.js"));

  // A lesson that settles a job has to tick that job off the same way the
  // timeline does.
  ok("lesson → the job it settles",
     has("lessons.js", "done: true") && has("lessons.js", "completedAt"));

  // Pastoral answers have to become the group split on the planning page.
  ok("pastoral notes → the group split",
     has("person.js", "OrganiserStore\\.save\\(\\s*\\{[^}]*pastoralNotes") &&
     has("classplan.js", "tally"));

  // And who's been planned for has to come back as who's still waiting.
  ok("planned-for → who's still waiting",
     has("before-planning.js", "OrganiserStore\\.save\\(\\s*\\{[^}]*targeted") &&
     has("classplan.js", "function coverage"));

  // Time worked has to reach the weekend picture.
  ok("time worked → the weekend picture",
     has("timeline.js", "OrganiserStore\\.save\\(\\s*\\{[^}]*worked") && has("lookback.js", "data\\.worked"));

  // Areas learned on the timeline have to be readable back.
  ok("areas → learned and read back",
     has("timeline.js", "OrganiserStore\\.save\\(\\s*\\{[^}]*areas") && has("areas.js", "function learn"));
}

// ---------------------------------------------------------------------------
sec("Nothing that should never leave has grown a way out");
{
  ["told.js", "pastoral.js"].forEach((f) => {
    const leaks = ["download", "blob", "csv", "docShell", "fetch", "XMLHttpRequest", "navigator", "clipboard"]
      .filter((w) => new RegExp(w, "i").test(code(src[f])));
    ok(`${f} still has no way out`, leaks.length === 0, leaks.join(", "));
  });
  // And the newest stores must not have crept into the export either.
  const ex = code(src["export.js"]);
  ["pastoralNotes", "toldLog", "pastoralTopics"].forEach((k) =>
    ok(`${k} is not in the export`, !new RegExp(`\\b${k}\\b`).test(ex)));
}

if (notes.length) {
  console.log("\nWorth knowing (not failures)\n" + "-".repeat(28));
  notes.forEach((n) => console.log("  · " + n));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
