import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE THREE THAT WERE MISSING: the picker, the rota, the syllabus.
//
// Each one is checked at the level it can actually go wrong. The picker is a
// spelling problem. The rota is four awkward cases that all happen in a
// corridor. The syllabus is a parsing problem plus a refusal to decide.

import fs from "node:fs";
import vm from "node:vm";
import { everyModule } from "./_dom.mjs";
import { codeOf } from "./_check.mjs";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

function makeEl(tag) {
  return {
    tagName: tag || "div", className: "", textContent: "", innerHTML: "", value: "",
    checked: false, hidden: false, open: true, type: "", dataset: {}, children: [], _on: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
    removeEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {}, reset() {},
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev)); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const clickOn = (cls, dataset) => {
  const node = { className: cls, dataset, classList: { contains: (c) => c === cls } };
  return { target: { ...node, closest: (sel) => (sel === "button" || sel === "." + cls ? node : null) } };
};

const TODAY = (() => {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();
const CLASS = ["S01","S02","S03","S04"].map((id) => ({ id, name: id, group: "9A" }));

async function openRota(data) {
  const els = {};
  const el = (sel) => (els[sel] = els[sel] || makeEl("div"));
  const doc = { querySelector: (s) => el(s), createElement: makeEl,
                querySelectorAll: () => [] };
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "" } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  // EVERY module, derived — see everyModule() in _dom.mjs. This runs a whole
  // PAGE script, and a page loads all of them; naming two by hand went stale
  // the moment rotapage.js needed a third.
  everyModule(sb);
  const state = { ...data };
  sb.OrganiserStore = { load: async () => state, save(p) { Object.assign(state, p); },
    onExternalChange() {} };
  vm.runInContext(fs.readFileSync(`${REPO}/public/rotapage.js`, "utf8"), sb);
  await new Promise((r) => setTimeout(r, 20));
  return { el, state, sb };
}

// ---------------------------------------------------------------------------
sec("The picker — the one place a slip cannot be forgiven");
{
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.window = sb; vm.createContext(sb);
  ["levels.js", "names.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
  const L = sb.OrganiserLevels, N = sb.OrganiserNames;
  const cfg = { levels: ["4","3","2","1"], topics: ["A","B"], targetLevel: "3" };
  L.setSkillTags(cfg, "A", ["W.9-10.3.d"]);

  ok("a code already used is offered back", L.allTags(cfg).includes("W.9-10.3.d"));
  // The exact failure this is for: one character out, two standards forever.
  ok("a near-miss of it is recognised",
     N.nearEnough("w.9-10.3.d", "w.9-10.3d"), "the two spellings read as unrelated");
  ok("but a genuinely different code is not flagged",
     !N.nearEnough("w.9-10.3.d", "rl.9-10.1"));
  ok("the page offers the list and compares against it",
     /allTags/.test(fs.readFileSync(`${REPO}/public/records.js`, "utf8")) &&
     /nearEnough/.test(fs.readFileSync(`${REPO}/public/records.js`, "utf8")));
  // Said, never corrected — sometimes two standards really are one apart.
  const rec = fs.readFileSync(`${REPO}/public/records.js`, "utf8");
  ok("and it warns rather than changing what you typed",
     /warn\.textContent/.test(rec) && !/setSkillTags\(config, skill, near/.test(rec));
}

// ---------------------------------------------------------------------------
sec("The rota — four awkward cases, one tap each");
{
  const rota = { id: "r1", title: "a few minutes each", memberIds: ["S01","S02","S03","S04"],
    perDay: 1, minutes: 10, everyDays: 14, lastDone: {}, optional: true };
  const p = await openRota({ rotas: [rota], contacts: CLASS, items: [], schedule: [] });

  ok("today's turn is shown", /S01/.test(p.el("#roToday").innerHTML), p.el("#roToday").innerHTML.slice(0,200));
  ok("and the whole queue", /S04/.test(p.el("#roQueue").innerHTML));

  // 1. It happened.
  p.el("#roToday").fire("click", clickOn("ro-did", { id: "S01" }));
  ok("a turn that happened is recorded", p.state.rotas[0].lastDone.S01 === TODAY,
     JSON.stringify(p.state.rotas[0]));
  ok("and they go to the back", !/^.*S01/.test(p.el("#roQueue").innerHTML.split("2.")[0].replace(/1\. /, "")) ||
     p.el("#roQueue").innerHTML.indexOf("S01") > p.el("#roQueue").innerHTML.indexOf("S02"),
     p.el("#roQueue").innerHTML);

  // 2. THEY weren't free — the attempt is remembered, the place is not lost.
  p.el("#roToday").fire("click", clickOn("ro-busy", { id: "S02" }));
  ok("an attempt that couldn't happen is remembered",
     (p.state.rotas[0].tried.S02 || []).length === 1, JSON.stringify(p.state.rotas[0].tried));
  ok("but their turn is NOT marked as done", !p.state.rotas[0].lastDone.S02,
     JSON.stringify(p.state.rotas[0].lastDone));
  ok("so they keep their place at the front",
     p.sb.OrganiserRota.queue(p.state.rotas[0], TODAY)[0].id === "S02",
     JSON.stringify(p.sb.OrganiserRota.queue(p.state.rotas[0], TODAY).map((x) => x.id)));

  // 3. MY day fell apart — there must be no button for it at all, because not
  //    marking someone is already the correct behaviour.
  const src = fs.readFileSync(`${REPO}/public/rotapage.js`, "utf8");
  ok("there is no way to record a turn missed through your own day",
     !/my day|i was busy|couldn't get to it/i.test(src.replace(/\/\/.*$/gm, "")));

  // 4. Who instead — and it costs the stand-in nothing.
  const R = p.sb.OrganiserRota;
  const next = R.insteadOf(p.state.rotas[0], "S02", TODAY);
  ok("the next in line is offered", next && next.id !== "S02", JSON.stringify(next));
  const after = R.mark(p.state.rotas[0], next.id, TODAY);
  ok("and the one who was busy is still first afterwards",
     R.queue(after, TODAY)[0].id === "S02", JSON.stringify(R.queue(after, TODAY).map((x) => x.id)));

  // A slot that never works for someone is a fact about the time.
  let stuck = { ...rota, tried: { S03: ["2026-09-01","2026-09-08","2026-09-15"] } };
  const q = await openRota({ rotas: [stuck], contacts: CLASS, items: [], schedule: [] });
  ok("three failed tries is surfaced", /S03/.test(q.el("#roStuck").innerHTML),
     q.el("#roStuck").innerHTML.slice(0, 200));
  ok("and worded as being about the time, not the person",
     /this time|the time/i.test(q.el("#roStuck").innerHTML + fs.readFileSync(`${REPO}/public/rota.html`, "utf8")));

  // The swap is offered where you can act on it, after the redraw rather than
  // before it — otherwise the box is rebuilt empty and the offer vanishes.
  const insteadBox = p.el('.ro-instead[data-for="S02"]').innerHTML;
  ok("who to ask instead appears once someone says no",
     /Next in line/.test(insteadBox), insteadBox.slice(0, 200));
  ok("and it says plainly that the one who was busy keeps their place",
     /keeps their place/.test(insteadBox), insteadBox.slice(0, 200));
  ok("and that standing in costs the other one nothing",
     /costs them nothing/.test(insteadBox), insteadBox.slice(0, 200));

  // A fresh app with no rounds set up must be quiet, not broken.
  const empty = await openRota({ rotas: [], contacts: CLASS, items: [], schedule: [] });
  ok("no rounds yet is quiet rather than broken", empty.el("#roTodayBlock").hidden === true);
  ok("and the setup form still offers your classes",
     /9A/.test(empty.el("#roGroup").innerHTML), empty.el("#roGroup").innerHTML);
  empty.el("#roTitle").value = "a few minutes each";
  empty.el("#roGroup").value = "9A";
  empty.el("#roForm").fire("submit", { preventDefault() {} });
  ok("starting a round puts everyone in that class in it",
     (empty.state.rotas[0] || {}).memberIds.length === 4, JSON.stringify(empty.state.rotas));
  ok("and it opens on the new one", empty.el("#roTodayBlock").hidden === false);

  // Putting it in the day, so the planner treats it like any other work.
  const t = await openRota({ rotas: [rota], contacts: CLASS, items: [], schedule: [] });
  t.el("#roAddTask").fire("click", {});
  const made = (t.state.items || [])[0];
  ok("today's turn becomes a real piece of work", !!made, JSON.stringify(t.state.items));
  ok("sized from the rota", made && made.plannedMinutes === 10);
  ok("optional, so it gives way when work is heavy", made && made.optional === true);
  ok("and carrying which round and who, so ticking it counts as the turn",
     made && made.rotaId === "r1" && made.rotaMemberId === "S01");
  ok("with the fields every other job has",
     made && made.id && made.createdAt && made.completedAt === null && made.done === false,
     JSON.stringify(made));
  t.el("#roAddTask").fire("click", {});
  ok("pressing it twice doesn't make two of the same job", t.state.items.length === 1);

  // The join back: ticking it off in the timeline marks the turn.
  const tl = fs.readFileSync(`${REPO}/public/timeline.js`, "utf8");
  ok("the timeline records the turn when the job is ticked off",
     /markRotaTurn/.test(tl) && /rotas/.test(tl));
  ok("and saves the rota when it does", /save\(\{[^}]*rotas/.test(tl.replace(/\s+/g, " ")));
}

// ---------------------------------------------------------------------------
sec("The syllabus — read it, offer it, refuse to decide");
{
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(`${REPO}/public/syllabus.js`, "utf8"), sb);
  const S = sb.OrganiserSyllabus;

  const doc = [
    "Writing",
    "W.9-10.3.d\tUse precise words and phrases, telling details, and sensory language.",
    "W.9-10.4 - Produce clear and coherent writing appropriate to task and audience.",
    "Reading",
    "RL.9-10.1: Cite strong textual evidence to support analysis.",
  ].join("\r\n");
  const t = S.parse(doc);
  ok("every target is read", t.length === 3, JSON.stringify(t.map((x) => x.code)));
  ok("codes survive their dots and hyphens", t[0].code === "W.9-10.3.d");
  ok("separated by a tab, a dash or a colon alike",
     t.map((x) => x.code).join() === "W.9-10.3.d,W.9-10.4,RL.9-10.1");
  ok("and the strand above them is carried down",
     t[0].strand === "Writing" && t[2].strand === "Reading", JSON.stringify(t.map((x) => x.strand)));
  ok("the words come through whole", /sensory language/.test(t[0].text));

  // A curriculum written as sentences with no codes at all.
  const plain = S.parse("Describe a setting in detail.\nUse evidence from the text.");
  ok("a syllabus with no codes still reads", plain.length === 2, JSON.stringify(plain));

  const syl = S.normalise({ name: "this year", targets: t });
  const hits = S.match("To describe a setting using precise sensory language", syl, 5);
  ok("the right target comes first", hits[0].target.code === "W.9-10.3.d", JSON.stringify(hits[0]));
  ok("and the words it matched on are shown, not just a score",
     hits[0].shared.length > 0 && hits[0].shared.includes("sensory"), JSON.stringify(hits[0].shared));
  ok("an unrelated objective matches nothing",
     S.match("Bake a Victoria sponge", syl, 5).length === 0);

  // The refusal that matters most.
  const src = fs.readFileSync(`${REPO}/public/syllabus.js`, "utf8");
  ok("nothing here asks a model to recall a standard",
     !/fetch|ollama|prompt|model/i.test(codeOf(src)));
  const page = fs.readFileSync(`${REPO}/public/lessons.js`, "utf8");
  ok("and the page ticks nothing for you",
     /nothing is ticked for you/.test(page) && !/checked = true/.test(page));

  // Coverage counts what you attached, never what merely matched.
  const lessons = [
    { id:"l1", taught:true, date:"2026-09-01", group:"9A", targets:["W.9-10.3.d"] },
    { id:"l2", taught:true, date:"2026-09-08", group:"9A", targets:["W.9-10.3.d","W.9-10.4"] },
    { id:"l3", taught:false, date:"2026-09-15", group:"9A", targets:["RL.9-10.1"] },
  ];
  const c = S.coverage(lessons, syl, {});
  ok("targets you attached are counted", c.taught.length === 2, JSON.stringify(c.taught.map((x) => x.code)));
  ok("the most-taught first", c.taught[0].code === "W.9-10.3.d" && c.taught[0].times === 2);
  ok("a lesson never taught doesn't count", !c.taught.some((x) => x.code === "RL.9-10.1"));
  ok("and what has had nothing is the half you can't see otherwise",
     c.untaught.length === 1 && c.untaught[0].code === "RL.9-10.1", JSON.stringify(c.untaught));
  ok("the words say how many it rests on", /2 taught lessons|across 2/.test(S.words(c)), S.words(c));

  // Changing school: paste the new one over the top.
  const newSyl = S.normalise({ name: "the new one",
    targets: S.parse("EN3.2a\tWrite with detail and precision.") });
  const c2 = S.coverage(lessons, newSyl, {});
  ok("old lesson codes simply stop matching, they aren't lost", lessons[0].targets[0] === "W.9-10.3.d");
  ok("and the new syllabus reads as untaught, not as covered",
     c2.untaught.length === 1 && !c2.taught.length, JSON.stringify(c2));
  // The old codes are neither counted as covered nor silently dropped: a code
  // with no words beside it on the coverage page would be worse than either.
  ok("the codes from the old list are kept and counted separately",
     c2.fromOther.length === 2, JSON.stringify(c2.fromOther.map((x) => x.code)));
  ok("and said out loud rather than left to be noticed",
     /from an earlier one/.test(S.words(c2)), S.words(c2));
  ok("no target on either side was edited by the swap", newSyl.targets[0].code === "EN3.2a");

  ok("nothing at all is not an error", S.coverage([], null, {}).total === 0);
  ok("and neither is rubbish", S.parse(null).length === 0 && S.normalise(null) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
