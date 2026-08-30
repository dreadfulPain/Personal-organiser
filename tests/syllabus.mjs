import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// IF I PASTE MY SYLLABUS IN, DOES IT LAND, AND IS IT WIRED EVERYWHERE?
//
// Asked of the app as it stands, not as it's meant to end up. There are two
// different things hiding under one word here and they are in very different
// states:
//
//   TAGGING A SKILL with framework codes — already built, already stored,
//   already has a box to type in. This checks it actually survives and shows up.
//
//   A SYLLABUS AS A DOCUMENT — the list of targets itself, pasted in whole, so
//   a lesson objective can be matched against it. This checks whether there is
//   anywhere for it to go, and answers honestly when there isn't.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { codeOf } from "./_check.mjs";

const REPO = REPO_ROOT;
let pass = 0, fail = 0, gaps = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 300) : "")); }
};
const gap = (what) => { gaps.push(what); console.log("  --  " + what); };
const sec = (s) => console.log("\n" + s);

const dir = path.join(REPO, "public");
const src = Object.fromEntries(
  fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])
);
const code = codeOf;

// A real syllabus fragment, in the shape they actually come in.
const SYLLABUS = [
  { code: "W.9-10.3.d", text: "Use precise words and phrases, telling details, and sensory language." },
  { code: "W.9-10.4", text: "Produce clear and coherent writing appropriate to task and audience." },
  { code: "RL.9-10.1", text: "Cite strong textual evidence to support analysis." },
];

// ---------------------------------------------------------------------------
sec("Tagging a skill with codes — the part that already exists");
{
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(dir, "levels.js"), "utf8"), sb);
  const L = sb.OrganiserLevels;

  const config = { levels: ["4","3","2","1"], topics: ["Descriptive writing", "Analysis"], targetLevel: "3" };
  L.setSkillTags(config, "Descriptive writing", ["W.9-10.3.d", "W.9-10.4"]);
  L.setSkillTags(config, "Analysis", ["RL.9-10.1"]);

  ok("codes attach to a skill", L.skillTags(config, "Descriptive writing").length === 2,
     JSON.stringify(L.skillTags(config, "Descriptive writing")));
  ok("dots and hyphens in a code survive untouched",
     L.skillTags(config, "Descriptive writing")[0] === "W.9-10.3.d");
  ok("every code in use can be listed", L.allTags(config).length === 3, JSON.stringify(L.allTags(config)));
  ok("normalising the config doesn't drop them",
     L.skillTags(L.normalise(config), "Analysis").join() === "RL.9-10.1");

  // Changing school: the skill statements stay, the codes are replaced.
  L.setSkillTags(config, "Descriptive writing", ["EN3.2a"]);
  ok("re-tagging for a new school keeps the skill itself",
     config.topics.includes("Descriptive writing") &&
     L.skillTags(config, "Descriptive writing").join() === "EN3.2a");
  ok("and everything judged against that skill is untouched",
     L.levels(config).join() === "4,3,2,1");

  // A cap exists, and a real syllabus can exceed it per skill.
  // A real syllabus hangs several codes off one statement — strands, year
  // groups, two frameworks side by side. Twenty has to fit.
  const many = {};
  L.setSkillTags(many, "x", Array.from({ length: 20 }, (_, i) => `C${i}`));
  ok("twenty codes on one skill all fit", L.skillTags(many, "x").length === 20,
     String(L.skillTags(many, "x").length));
  const tooMany = {};
  L.setSkillTags(tooMany, "x", Array.from({ length: 60 }, (_, i) => `C${i}`));
  ok("but it is still bounded rather than endless", L.skillTags(tooMany, "x").length === 24,
     String(L.skillTags(tooMany, "x").length));
}

sec("And there is somewhere to type them");
{
  ok("the students page has a box for codes", /setSkillTags/.test(code(src["records.js"])));
  ok("and they are shown back", /skillTags/.test(code(src["records.js"])) &&
     /skillTags/.test(code(src["class.js"])));
  // allTags exists to offer back the codes already in use. Nothing calls it, so
  // every code is retyped from scratch on every skill.
  const callers = Object.keys(src).filter((f) => f.endsWith(".js") && f !== "levels.js" &&
    /\ballTags\b/.test(code(src[f])));
  ok("codes you've used are offered back rather than retyped", callers.length > 0,
     "allTags() is called by nothing — every code is retyped by hand");
  // The one place in this app where a slip cannot be forgiven silently.
  ok("and a near-miss of an existing code is pointed out",
     /nearEnough/.test(code(src["records.js"])) &&
     /src="names.js"/.test(src["records.html"]),
     "records.js does not compare a new code against the ones already in use");
}

sec("Do the codes actually survive being saved?");
{
  const dataDir = path.join(REPO, "data");
  const port = 8000 + Math.floor(Math.random() * 900);
  const srv = spawn("node", [path.join(REPO, "server.js")],
    { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`http://127.0.0.1:${port}/api/data`); break; } catch { await wait(150); }
    }
    const get = async () => (await fetch(`http://127.0.0.1:${port}/api/data`)).json();
    const first = await get();
    await fetch(`http://127.0.0.1:${port}/api/data`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...first, recordConfig: {
        levels: ["4","3","2","1"], topics: ["Descriptive writing"], targetLevel: "3",
        skillTags: { "Descriptive writing": ["W.9-10.3.d", "W.9-10.4"] },
        descriptors: { "Descriptive writing": { "3": "Uses sensory detail deliberately." } },
      } }),
    });
    const back = await get();
    ok("codes come back off a real server",
       back.recordConfig.skillTags["Descriptive writing"].join() === "W.9-10.3.d,W.9-10.4",
       JSON.stringify(back.recordConfig));
    ok("and the wording you wrote for the level with them",
       back.recordConfig.descriptors["Descriptive writing"]["3"] === "Uses sensory detail deliberately.");
    fs.rmSync(dataDir, { recursive: true, force: true });
  } finally { srv.kill(); }
}

sec("A syllabus as a document — is there anywhere to put one?");
{
  // The thing actually asked about: paste the list of targets in whole.
  const store = code(src["store.js"]);
  const server = code(fs.readFileSync(path.join(REPO, "server.js"), "utf8"));
  const hasStore = /LS_SYLLABUS|syllabus:\s*get\(/i.test(store);
  const onServer = /\bsyllabus\b/i.test(server);
  const anyPage = Object.keys(src).filter((f) => /\bsyllabus\b/i.test(code(src[f])));

  if (!hasStore) gap("no store: nothing in store.js holds a syllabus, so a pasted one has nowhere to live");
  if (!onServer) gap("no server field: the server would drop it on the next save even if a page sent it");
  if (!anyPage.length) gap("no page: nothing in the app has a box to paste one into");

  // And the join it would need to be worth having.
  const LPsrc = code(src["lessonplan.js"]);
  if (!/\bsyllabus\b|\btarget\b/i.test(LPsrc))
    gap("no match: a lesson objective is stored as free text and is never compared to anything");
  if (!/syllabus/i.test(code(src["lessons.js"])))
    gap("no coverage: nothing can say which targets have been taught and which never have");

  // The thing that IS ready: the place it would attach.
  ok("the lesson record has a skill, which is what a target would hang off",
     /skill:/.test(LPsrc));
  ok("and skills already carry codes, so the link is one hop",
     /skillTags/.test(code(src["levels.js"])));
  ok("and the headings config is already a place for per-school settings",
     /headings/.test(LPsrc));
}

console.log("\nWhat is not there yet\n" + "-".repeat(21));
gaps.forEach((g) => console.log("  · " + g));
console.log(`\n${pass} passed, ${fail} failed, ${gaps.length} gap(s)`);
process.exit(fail ? 1 : 0);
