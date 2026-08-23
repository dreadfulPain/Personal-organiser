import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// GETTING IT IN — the half that was missing, driven end to end.
//
// The storage tests prove a note survives a save. They cannot prove there is
// any way to make one in the first place, and for three of these stores there
// wasn't: the code that counts, sorts and displays them was all written and all
// correct, against boxes with no lid.
//
// So this drives the actual page handlers: type a heading, tap an answer, write
// a sentence, log what you said — then take whatever came out and push it
// through the counting code, because "it saved something" and "the something it
// saved is countable" are different claims and only the second one matters.

import fs from "node:fs";
import vm from "node:vm";
import { everyModule } from "./_dom.mjs";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

// ---- a DOM stub that can actually be clicked ------------------------------
function makeEl(tag) {
  const el = {
    tagName: tag || "div", className: "", textContent: "", innerHTML: "", value: "",
    checked: false, hidden: false, type: "", dataset: {}, children: [],
    _on: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    addEventListener(name, fn) { (this._on[name] = this._on[name] || []).push(fn); },
    removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, focus() {},
    reset() { this._reset && this._reset(); },
    fire(name, ev) { (this._on[name] || []).forEach((fn) => fn(ev)); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  return el;
}

// A click on something with data attributes, shaped the way the handlers read
// it: e.target.closest(".p-opt") giving back the button itself.
function clickOn(cls, dataset) {
  const node = { className: cls, dataset, classList: { contains: (c) => c === cls } };
  return { target: { ...node, closest: (sel) => (sel === "." + cls ? node : null) } };
}

async function openPersonPage(data) {
  const els = {};
  const el = (sel) => (els[sel] = els[sel] || makeEl("div"));
  ["#ptLabel", "#ptOptions", "#ptdTo", "#ptdSaid", "#ptdHow", "#ptrWhat"].forEach((s) => (el(s).value = ""));
  el("#ptFresh").value = "30";
  const doc = { querySelector: (sel) => el(sel), createElement: makeEl };

  // Both forms reset by hand, the way a browser would.
  el("#pTopicForm")._reset = () => {
    ["#ptLabel", "#ptOptions"].forEach((s) => (el(s).value = ""));
    el("#ptEssential").checked = false;
    el("#ptUpFront").checked = false;
  };
  el("#pToldForm")._reset = () => ["#ptdTo", "#ptdSaid", "#ptdHow"].forEach((s) => (el(s).value = ""));

  const saved = [];
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "" } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  // EVERY module, derived — see everyModule() in _dom.mjs. This runs a whole
  // PAGE script, and a page loads all of them; naming a handful by hand went
  // stale the moment the page needed one more.
  everyModule(sb);
  const state = { ...data };
  sb.OrganiserStore = {
    load: async () => state,
    save(part) { saved.push(part); Object.assign(state, part); },
    onExternalChange() {},
  };
  vm.runInContext(fs.readFileSync(`${REPO}/public/person.js`, "utf8"), sb);
  await new Promise((r) => setTimeout(r, 20));
  return { el, saved, state, sb };
}

const TODAY = (() => {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();
const CLASS = [
  { id: "S01", name: "Student One", group: "5A" },
  { id: "S02", name: "Student Two", group: "5A" },
  { id: "S03", name: "Student Three", group: "5A" },
  { id: "S04", name: "Student Four", group: "5A" },
];
const FRESH = { contacts: CLASS, records: [], recordConfig: null,
  pastoralNotes: [], pastoralTopics: [], toldLog: [] };

// ---------------------------------------------------------------------------
sec("Making a heading — the thing that had no way in at all");
{
  const p = await openPersonPage({ ...FRESH });
  p.el("#ptLabel").value = "how they learn best";
  p.el("#ptFresh").value = "90";
  p.el("#ptOptions").value = "something to watch, reading it, doing it";
  p.el("#pTopicForm").fire("submit", { preventDefault() {} });

  const t = (p.state.pastoralTopics || [])[0];
  ok("a heading you typed gets saved", !!t, JSON.stringify(p.saved));
  ok("with the words you used", t && t.label === "how they learn best");
  ok("and how long it stays true for", t && t.staysFreshDays === 90);
  ok("its set answers are split on the commas", t && t.options.join("|") === "something to watch|reading it|doing it");
  ok("and it has an id, so notes can be filed under it", t && !!t.id, JSON.stringify(t));

  // A blank id would be far worse than an error: forPerson reads it as "any
  // topic", so every heading would show the same note.
  const P = p.sb.OrganiserPastoral;
  const two = P.normaliseTopic({ label: "how they get on socially" });
  ok("two different headings never share an id", two.id !== t.id, `${two.id} vs ${t.id}`);

  p.el("#ptLabel").value = "how they learn best";
  p.el("#pTopicForm").fire("submit", { preventDefault() {} });
  ok("the same heading twice is refused", (p.state.pastoralTopics || []).length === 1);

  p.el("#ptLabel").value = "";
  p.el("#pTopicForm").fire("submit", { preventDefault() {} });
  ok("and an empty one isn't saved either", (p.state.pastoralTopics || []).length === 1);
}

// ---------------------------------------------------------------------------
sec("Tapping an answer — one tap, nothing to spell");
{
  const topics = [{ id: "t:learn", label: "how they learn best", staysFreshDays: 90,
    options: ["something to watch", "reading it", "doing it"] }];
  const p = await openPersonPage({ ...FRESH, pastoralTopics: topics });
  p.el("#pWho").value = "S01";
  p.el("#pWho").fire("change", {});
  p.el("#pPastoral").fire("click", clickOn("p-opt", { topic: "t:learn", choice: "reading it" }));

  const n = (p.state.pastoralNotes || [])[0];
  ok("one tap writes a note", !!n, JSON.stringify(p.state.pastoralNotes));
  ok("against the right person", n && n.who === "S01");
  ok("under the right heading", n && n.topicId === "t:learn");
  ok("recording which answer", n && n.choice === "reading it");
  ok("dated today without being asked", n && n.date === TODAY);
  ok("and it reads as a sentence too", n && n.said === "reading it");

  // Changing your mind is one person who changed their mind, not two people.
  p.el("#pPastoral").fire("click", clickOn("p-opt", { topic: "t:learn", choice: "doing it" }));
  ok("changing the answer doesn't overwrite the old one", p.state.pastoralNotes.length === 2);
  const P = p.sb.OrganiserPastoral;
  // Same day, two answers — the second one is the one you meant. Sorting on
  // the date alone silently keeps the first.
  ok("the one you changed it to is the one that stands",
     P.forPerson(p.state.pastoralNotes, "S01", "t:learn")[0].choice === "doing it",
     JSON.stringify(P.forPerson(p.state.pastoralNotes, "S01", "t:learn").map((x) => x.choice)));
  const tal = P.tally(p.state.pastoralNotes, topics[0], ["S01"]);
  ok("and the count says one person, not two", tal.answered === 1, JSON.stringify(tal.counts));
  ok("counted under the answer that stands", tal.counts["doing it"] === 1 &&
     tal.counts["reading it"] === 0, JSON.stringify(tal.counts));

  // With nobody chosen there is nothing to write a note against.
  const q = await openPersonPage({ ...FRESH, pastoralTopics: topics });
  q.el("#pPastoral").fire("click", clickOn("p-opt", { topic: "t:learn", choice: "reading it" }));
  ok("a note against nobody is never written", !(q.state.pastoralNotes || []).length);
}

// ---------------------------------------------------------------------------
sec("Writing a sentence under a heading");
{
  const topics = [{ id: "t:social", label: "how they get on socially", staysFreshDays: 30 }];
  const p = await openPersonPage({ ...FRESH, pastoralTopics: topics });
  p.el("#pWho").value = "S02";
  p.el("#pWho").fire("change", {});

  // Typing, the way a browser reports it.
  const typing = (topic, value) => {
    const box = makeEl("input");
    box.value = value;
    box.dataset.topic = topic;
    box.classList = { contains: (c) => c === "p-write" };
    p.el("#pPastoral").fire("input", { target: box });
    return box;
  };
  typing("t:social", "  sits with the same two, happy enough  ");
  p.el("#pPastoral").fire("click", clickOn("p-save", { topic: "t:social" }));

  const n = (p.state.pastoralNotes || [])[0];
  ok("what you typed is saved", !!n && n.said === "sits with the same two, happy enough", JSON.stringify(n));
  ok("under the right heading", n && n.topicId === "t:social");
  ok("with no answer attached, because there aren't any", n && !n.choice);
  // The words appear once, in the saved note above — never still sitting in the
  // box as if they hadn't been saved.
  ok("and the box is emptied afterwards, not left holding it",
     !/value="sits with the same two/.test(p.el("#pPastoral").innerHTML) &&
     /class="p-write"[^>]*value=""/.test(p.el("#pPastoral").innerHTML.replace(/\s+/g, " ")),
     p.el("#pPastoral").innerHTML.slice(0, 500));

  typing("t:social", "   ");
  p.el("#pPastoral").fire("click", clickOn("p-save", { topic: "t:social" }));
  ok("an empty box saves nothing", p.state.pastoralNotes.length === 1);

  // Enter is the same as pressing Save.
  const typed = typing("t:social", "moved seats, better for it");
  p.el("#pPastoral").fire("keydown", { key: "Enter", target: typed, preventDefault() {} });
  ok("pressing Enter saves it too", p.state.pastoralNotes.length === 2 &&
     p.state.pastoralNotes[1].said === "moved seats, better for it");

  // Two started, one finished — the other must still be there afterwards.
  const second = [{ id: "t:social", label: "how they get on socially", staysFreshDays: 30 },
                  { id: "t:home", label: "anything from home", staysFreshDays: 30 }];
  const r = await openPersonPage({ ...FRESH, pastoralTopics: second });
  r.el("#pWho").value = "S02";
  r.el("#pWho").fire("change", {});
  const type2 = (topic, value) => {
    const box = makeEl("input");
    box.value = value; box.dataset.topic = topic;
    box.classList = { contains: (c) => c === "p-write" };
    r.el("#pPastoral").fire("input", { target: box });
  };
  type2("t:social", "started writing this one");
  type2("t:home", "and this one too");
  r.el("#pPastoral").fire("click", clickOn("p-save", { topic: "t:social" }));
  ok("saving one keeps the other half-written",
     /and this one too/.test(r.el("#pPastoral").innerHTML), r.el("#pPastoral").innerHTML.slice(0, 400));

  // And a half-typed sentence never follows you to the next child.
  r.el("#pWho").value = "S03";
  r.el("#pWho").fire("change", {});
  ok("but it does not follow you to someone else",
     !/and this one too/.test(r.el("#pPastoral").innerHTML), r.el("#pPastoral").innerHTML.slice(0, 400));
}

// ---------------------------------------------------------------------------
sec("Logging what you told someone");
{
  const p = await openPersonPage({ ...FRESH });
  p.el("#pWho").value = "S03";
  p.el("#pWho").fire("change", {});
  p.el("#ptdTo").value = "his mum";
  p.el("#ptdSaid").value = "reading is coming on, still quiet in class";
  p.el("#ptdHow").value = "phone call";
  p.el("#pToldForm").fire("submit", { preventDefault() {} });

  const e = (p.state.toldLog || [])[0];
  ok("the log entry is saved", !!e, JSON.stringify(p.saved));
  ok("about the right person", e && e.who === "S03");
  ok("saying who you told", e && e.to === "his mum");
  ok("what you said", e && /reading is coming on/.test(e.said));
  ok("and how", e && e.how === "phone call");
  ok("dated today", e && e.date === TODAY);

  p.el("#ptdSaid").value = "";
  p.el("#ptdTo").value = "someone";
  p.el("#pToldForm").fire("submit", { preventDefault() {} });
  ok("an entry saying nothing isn't logged", p.state.toldLog.length === 1);

  const q = await openPersonPage({ ...FRESH });
  q.el("#ptdSaid").value = "something";
  q.el("#pToldForm").fire("submit", { preventDefault() {} });
  ok("and nor is one about nobody", !(q.state.toldLog || []).length);

  // Two calls about the same child in one afternoon is an ordinary Tuesday, and
  // "what did I last tell them" has to answer with the second one.
  p.el("#ptdSaid").value = "spoke to dad as well, same message";
  p.el("#ptdTo").value = "his dad";
  p.el("#pToldForm").fire("submit", { preventDefault() {} });
  const T = p.sb.OrganiserTold;
  ok("two conversations in one day both stay", p.state.toldLog.length === 2);
  ok("and the last thing you said is the last thing you said",
     T.lastToldAbout(p.state.toldLog, "S03").to === "his dad",
     JSON.stringify(T.forPerson(p.state.toldLog, "S03").map((x) => x.to)));
}

// ---------------------------------------------------------------------------
sec("Logging what you tried, and reading back what moved");
{
  const CFG = { levels: ["4","3","2","1"], levelNames: { 3:"Proficient" }, targetLevel: "3",
                topics: ["Reading","Writing"] };
  const records = [
    { id:"r1", who:"S01", topic:"Reading", level:"2", date:"2026-09-01", createdAt:"" },
    { id:"r2", who:"S01", topic:"Reading", level:"3", date:"2026-10-01", createdAt:"" },
  ];
  const p = await openPersonPage({ ...FRESH, records, recordConfig: CFG, tried: [] });
  p.el("#pWho").value = "S01";
  p.el("#pWho").fire("change", {});

  ok("the skill picker offers the skills you set up",
     /Reading/.test(p.el("#ptrSkill").innerHTML), p.el("#ptrSkill").innerHTML);

  p.el("#ptrWhat").value = "watched it done first";
  p.el("#ptrSkill").value = "Reading";
  p.el("#ptrDate").value = "2026-09-15";
  p.el("#pTriedForm").fire("submit", { preventDefault() {} });

  const y = (p.state.tried || [])[0];
  ok("what you tried is saved", !!y, JSON.stringify(p.saved));
  ok("with the skill it was aimed at", y && y.skill === "Reading");
  ok("on the day you say, not today", y && y.date === "2026-09-15");
  ok("against the person you were looking at", y && y.whoIds.join() === "S01");

  // And the whole point: it comes back out joined to the levels.
  ok("the page reads back what moved",
     /Developing|2/.test(p.el("#pTried").innerHTML) && /3/.test(p.el("#pTried").innerHTML),
     p.el("#pTried").innerHTML.slice(0, 400));
  ok("saying it went up", /Went from/.test(p.el("#pTried").innerHTML),
     p.el("#pTried").innerHTML.slice(0, 400));
  ok("and never that it caused it",
     !/because|caused it|works|proves/i.test(p.el("#pTried").innerHTML),
     p.el("#pTried").innerHTML.slice(0, 400));

  // The words you used come back as suggestions, so the same thing isn't
  // counted twice under two spellings.
  ok("your own words are offered back next time",
     /watched it done first/.test(p.el("#ptrWords").innerHTML), p.el("#ptrWords").innerHTML);

  p.el("#ptrWhat").value = "";
  p.el("#pTriedForm").fire("submit", { preventDefault() {} });
  ok("an empty one isn't saved", p.state.tried.length === 1);

  const q = await openPersonPage({ ...FRESH, records, recordConfig: CFG, tried: [] });
  q.el("#ptrWhat").value = "something";
  q.el("#pTriedForm").fire("submit", { preventDefault() {} });
  ok("and nor is one against nobody", !(q.state.tried || []).length);
}

sec("Removing a heading keeps what people said");
{
  const topics = [{ id: "t:social", label: "how they get on socially", staysFreshDays: 30 }];
  const notes = [{ id: "n1", who: "S01", topicId: "t:social", said: "settled", date: TODAY }];
  const p = await openPersonPage({ ...FRESH, pastoralTopics: topics, pastoralNotes: notes });
  p.el("#pTopicList").fire("click", clickOn("p-tdel", { topic: "t:social" }));
  ok("the heading goes", !(p.state.pastoralTopics || []).length);
  ok("the note stays", (p.state.pastoralNotes || []).length === 1);
}

// ---------------------------------------------------------------------------
sec("All the way through: four taps become a class you can plan for");
{
  // The whole point of the countable half. Record four answers the way you
  // actually would — one tap each — then ask the planning page what it sees.
  const topics = [{ id: "t:learn", label: "how they learn best", staysFreshDays: 90,
    options: ["something to watch", "reading it", "doing it"] }];
  const answers = { S01: "something to watch", S02: "something to watch",
    S03: "something to watch", S04: "doing it" };
  let state = { ...FRESH, pastoralTopics: topics, pastoralNotes: [] };
  for (const [id, choice] of Object.entries(answers)) {
    const p = await openPersonPage(state);
    p.el("#pWho").value = id;
    p.el("#pWho").fire("change", {});
    p.el("#pPastoral").fire("click", clickOn("p-opt", { topic: "t:learn", choice }));
    state = { ...state, pastoralNotes: p.state.pastoralNotes };
  }
  ok("four taps, four notes", state.pastoralNotes.length === 4);

  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.window = sb; vm.createContext(sb);
  ["levels.js", "pastoral.js", "rota.js", "classplan.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
  const pic = sb.OrganiserClassPlan.picture({
    contacts: CLASS, records: [], recordConfig: null,
    pastoralNotes: state.pastoralNotes, pastoralTopics: topics, group: "5A", today: TODAY,
  });

  const tal = pic.tallies[0];
  ok("the planning page counts them", tal && tal.answered === 4, JSON.stringify(pic.tallies));
  ok("three of four watching", tal && tal.counts["something to watch"] === 3);
  ok("and it will give a share off four answers", tal && tal.share("something to watch") === 0.75);

  const ans = pic.answers[0];
  ok("the one on their own is named, not rounded away",
     ans && ans.smallest.some((s) => s.option === "doing it" && s.who.some((w) => w.id === "S04")),
     JSON.stringify(ans && ans.smallest));
  ok("and the majority is named too", ans && ans.groups[0][1].length === 3);
  ok("nobody is left unaccounted for", ans && ans.noAnswer.length === 0);
  ok("and everyone still shows as waiting for something aimed at them",
     pic.coverage.never.length === 4, JSON.stringify(pic.coverage.never));
}


// ---------------------------------------------------------------------------
sec("A lesson plan, pasted in and kept");
{
  const PLAN = `Year 9 — settings

Learning Objective:
To describe a setting using the five senses.

Activities:
- Model a paragraph on the board
- They write their own, then swap

Assessment:
- Exit ticket`;

  const els = {};
  const el = (sel) => (els[sel] = els[sel] || makeEl("div"));
  ["#lsPaste","#lsGroup","#lsDate","#lsItem"].forEach((s) => (el(s).value = ""));
  const doc = { querySelector: (sel) => el(sel), createElement: makeEl };
  const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "" } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  // EVERY module, derived — see everyModule() in _dom.mjs. This runs a whole
  // PAGE script, and a page loads all of them; naming a handful by hand went
  // stale the moment the page needed one more.
  everyModule(sb);
  const state = { lessons: [], lessonConfig: null, contacts: CLASS, records: [],
    recordConfig: { topics:["Reading","Writing"], levels:["4","3","2","1"], targetLevel:"3" },
    schedule: [{ id:"s1", label:"Period 3", start:"11:00", end:"12:00", days:[2] }],
    items: [{ id:"i1", title:"plan Tuesday's lesson", done:false }], tried: [] };
  sb.OrganiserStore = { load: async () => state, save(part) { Object.assign(state, part); },
    onExternalChange() {} };
  vm.runInContext(fs.readFileSync(`${REPO}/public/lessons.js`, "utf8"), sb);
  await new Promise((r) => setTimeout(r, 20));

  // What the app read is shown BEFORE anything is kept.
  el("#lsPaste").value = PLAN;
  el("#lsPaste").fire("input", {});
  ok("what it read is shown before it's kept", !el("#lsPreview").hidden);
  ok("with the objective it found", /five senses/.test(el("#lsPreview").innerHTML));
  ok("and the ways it found", /Model a paragraph/.test(el("#lsPreview").innerHTML));
  ok("and it never marks the plan",
     !/good|weak|improve|should have|missing a/i.test(el("#lsPreview").innerHTML),
     el("#lsPreview").innerHTML.slice(0, 300));

  el("#lsGroup").value = "5A";
  el("#lsSkill").value = "Reading";
  el("#lsDate").value = "2026-09-15";
  el("#lsSlot").value = "s1";
  el("#lsItem").value = "i1";
  el("#lsSave").fire("click", {});

  const l = (state.lessons || [])[0];
  ok("the plan is kept", !!l, JSON.stringify(state.lessons));
  ok("with the text exactly as pasted", l && /five senses/.test(l.plan));
  ok("and what was parsed out of it", l && l.ways.length === 2 && l.checks.length === 1,
     JSON.stringify(l));
  ok("against the class", l && l.group === "5A");
  ok("the skill", l && l.skill === "Reading");
  ok("the day", l && l.date === "2026-09-15");
  ok("and the slot on the timetable", l && l.slotId === "s1");

  // The job it settles — chosen by hand, never guessed.
  ok("the job you picked is ticked off", state.items[0].done === true, JSON.stringify(state.items));
  // The same fields the timeline writes. A job finished here has to be
  // indistinguishable from one finished there, or the week's tally loses it.
  ok("and stamped the way every other page stamps it",
     typeof state.items[0].completedAt === "string" &&
     /^\d{4}-\d{2}-\d{2}T/.test(state.items[0].completedAt),
     JSON.stringify(state.items[0]));
  ok("with no invented field beside it", !("doneOn" in state.items[0]), JSON.stringify(state.items[0]));

  // Not taught until you say so, and only then does it count as evidence.
  const LP = sb.OrganiserLessonPlan;
  ok("a kept plan is not yet evidence of teaching", LP.asTried(state.lessons).length === 0);
  el("#lsList").fire("click", { target: { closest: () => ({ dataset:{ id:l.id },
    classList:{ contains: (c) => c === "ls-taught" } }) } });
  ok("marking it taught sticks", state.lessons[0].taught === true);
  ok("and now it is a thing you tried", LP.asTried(state.lessons).length === 2,
     JSON.stringify(LP.asTried(state.lessons)));

  // Your own headings, saved and used.
  el("#lsHObjective").value = "walt";
  el("#lsHWays").value = "what we do";
  el("#lsHChecks").value = "how i check";
  el("#lsHeadForm").fire("submit", { preventDefault() {} });
  ok("your headings are saved", state.lessonConfig.headings.objective.join() === "walt",
     JSON.stringify(state.lessonConfig));
  el("#lsPaste").value = "WALT\nadd fractions";
  el("#lsPaste").fire("input", {});
  ok("and used on the next thing you paste", /add fractions/.test(el("#lsPreview").innerHTML),
     el("#lsPreview").innerHTML.slice(0, 300));

  ok("pasting nothing keeps nothing", (() => {
    const before = state.lessons.length;
    el("#lsPaste").value = ""; el("#lsGroup").value = "";
    el("#lsSave").fire("click", {});
    return state.lessons.length === before;
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
