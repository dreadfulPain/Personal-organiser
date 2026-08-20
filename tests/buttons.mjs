import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE BUTTONS ON THE OLD PAGES.
//
// The newer pages were driven by hand as they were built. The oldest ones —
// home, the day, the students page, the class page, people, portfolio, looking
// back — never were: they were written before any of this existed and have only
// ever been checked by opening them. Between them they carry about a hundred
// and thirty controls, and most are built in javascript with no id at all, so
// nothing that looks up "#someButton" was ever going to reach them.
//
// So the stub keeps a register of every element the page creates, which makes
// a button findable by the words on it. Then:
//
//   1. PRESS EVERYTHING and see what throws. A handler that dies takes the rest
//      of the page's listeners with it, so this is worth knowing on its own.
//   2. THEN THE FLOWS THAT MATTER — does the thing you pressed actually write
//      what it claims to, in the shape the rest of the app expects.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const REPO = REPO_ROOT;
const PUB = path.join(REPO, "public");
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);
const src = Object.fromEntries(
  fs.readdirSync(PUB).filter((f) => /\.(js|html)$/.test(f)).map((f) => [f, fs.readFileSync(path.join(PUB, f), "utf8")])
);

// ---------------------------------------------------------------------------
function makeEl(tag, reg) {
  const el = {
    tagName: (tag || "div").toUpperCase(), className: "", id: "", textContent: "", innerHTML: "",
    value: "", checked: false, hidden: false, open: false, disabled: false, type: "", href: "",
    src: "", title: "", placeholder: "", selectedIndex: 0, scrollTop: 0, offsetWidth: 600,
    dataset: {}, style: {}, children: [], options: [], files: [], _on: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    prepend(c) { this.children.unshift(c); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    remove() {}, replaceChildren(...cs) { this.children = cs; },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
    removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute(k, v) { if (k === "id") this.id = v; if (k === "type") this.type = v; },
    getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    focus() {}, blur() {},
    click() { this.fire("click", { target: this, preventDefault() {}, stopPropagation() {} }); },
    scrollIntoView() {}, contains() { return false; },
    closest(sel) {
      // Enough for the delegation these pages use: match on class or tag.
      const want = String(sel).replace(/^[.#]/, "").toLowerCase();
      let n = this;
      for (let i = 0; i < 6 && n; i++) {
        if (String(n.className).split(/\s+/).includes(want) || n.tagName.toLowerCase() === want) return n;
        n = n._parent;
      }
      return null;
    },
    // REMEMBERED, NOT REBUILT. Half this app writes a row as innerHTML and then
    // wires it with row.querySelector(".putback"). Handing back a fresh throwaway
    // each call attaches the listener to nothing, so the control exists on screen
    // and is unreachable from a test — which looks exactly like a page that has
    // no such button. Same selector, same element, and registered so it can be
    // found and pressed.
    querySelector(sel) {
      this._q = this._q || new Map();
      if (!this._q.has(sel)) {
        const e = makeEl(/button/i.test(String(sel)) ? "button" : "div", reg);
        e.className = String(sel).replace(/^[.#]/, "");
        e._parent = this;
        this._q.set(sel, e);
      }
      return this._q.get(sel);
    },
    querySelectorAll(sel) { return [this.querySelector(sel)]; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 600, height: 40, bottom: 40, right: 600 }; },
    classList: {
      add() {}, remove() {}, toggle() {},
      contains(c) { return String(el.className).split(/\s+/).includes(c); },
    },
    getContext() { return null; },
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev || { target: this, preventDefault() {} })); },
  };
  Object.defineProperty(el, "parentElement", { get() { return el._parent || (el._parent = makeEl("div", reg)); } });
  Object.defineProperty(el, "parentNode", { get() { return el.parentElement; } });
  Object.defineProperty(el, "firstChild", { get() { return el.children[0] || null; } });
  Object.defineProperty(el, "lastChild", { get() { return el.children[el.children.length - 1] || null; } });
  Object.defineProperty(el, "nextElementSibling", { get() { return null; } });
  Object.defineProperty(el, "previousElementSibling", { get() { return null; } });
  if (reg) reg.push(el);
  return el;
}

async function open(pg, data, opts) {
  const o = opts || {};
  const created = [];            // EVERY element the page builds, in order
  const byId = new Map();
  // The id has to be ON the element, or a test that looks for "#pplAdd" quietly
  // matches something else with the right words on it — which is how the
  // capture bar's Add button came to stand in for the people page's.
  [...src[pg].matchAll(/\bid="([^"]+)"/g)].forEach((m) => {
    const e = makeEl("div", created);
    e.id = m[1];
    byId.set(m[1], e);
  });
  const get = (sel) => {
    const key = String(sel).replace(/^#/, "");
    if (!byId.has(key)) byId.set(key, makeEl("div", created));
    return byId.get(key);
  };
  const doc = {
    _byId: byId, documentElement: makeEl("html"), body: makeEl("body"), head: makeEl("head"),
    title: "", readyState: "complete",
    createElement: (t) => makeEl(t, created),
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => makeEl("fragment", created),
    getElementById: get, querySelector: get, querySelectorAll: () => [],
    getElementsByClassName: () => [], getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {}, execCommand() { return true; },
  };
  const saves = [];
  const state = JSON.parse(JSON.stringify(data));
  const sb = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date, Math, JSON, Set, Map, WeakMap, Object, Number, String, Array, Boolean, RegExp, Error,
    Promise, Symbol, Intl, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: () => {},
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, URLSearchParams, structuredClone,
    document: doc,
    location: { hash: "", href: "file:///x", search: "", pathname: "/", reload() {} },
    navigator: { onLine: true, userAgent: "test", clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    alert() {}, confirm: () => (o.confirm === undefined ? true : o.confirm),
    prompt: () => o.prompt ?? null, print() {}, open: () => null,
    fetch: async () => ({ ok: false, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: class {}, FileReader: class { readAsText() {} readAsDataURL() {} },
    Response: typeof Response !== "undefined" ? Response : class {},
    DecompressionStream: typeof DecompressionStream !== "undefined" ? DecompressionStream : undefined,
    Option: function (t, v) { const e = makeEl("option", created); e.textContent = t; e.value = v; return e; },
    Image: function () { return makeEl("img", created); },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    scrollTo() {}, history: { replaceState() {}, pushState() {} },
    performance: { now: () => 0 },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);

  const errs = [];
  for (const f of [...src[pg].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])) {
    if (f === "store.js") {
      sb.OrganiserStore = {
        load: async () => JSON.parse(JSON.stringify(state)),
        save(part) { saves.push(part); Object.assign(state, JSON.parse(JSON.stringify(part))); },
        flush: async () => {}, exportNow: async () => {}, importFile: async () => {},
        flushBeacon() {}, onStatus() {}, onExternalChange() {}, mode: "file",
      };
      continue;
    }
    if (!src[f]) { errs.push(`${pg} loads ${f}, which is missing`); continue; }
    try { vm.runInContext(src[f], sb, { filename: f }); } catch (e) { errs.push(`${f}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 60));
  return { errs, byId, created, saves, state, sb, get };
}

// Everything clickable the page put on screen, described by what it says.
// Anything with a click listener on it, wherever it came from — a <button>, an
// input, a row wired by delegation, or a div the page made clickable. Filtering
// on the tag name would miss most of this app, which is exactly how a hundred
// controls went untested.
const buttonsIn = (r) => {
  const seen = new Set();
  return r.created
    .concat([...r.byId.values()])
    .filter((e) => e && e._on && e._on.click && !seen.has(e) && seen.add(e));
};

const TODAY = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

const DATA = {
  items: [
    { id: "i1", title: "Mark the books", type: "task", date: TODAY, time: "", tags: [], deadlineType: "soft",
      importance: "normal", effort: "medium", goalId: "", openLoop: false, promisedTo: "", waitingOn: "",
      done: false, createdAt: TODAY + "T08:00:00Z", completedAt: null, plannedMinutes: 60, spentMinutes: 0,
      optional: false, committed: true, notBefore: "", areas: ["work"] },
    { id: "i2", title: "Already finished", type: "task", date: TODAY, time: "", tags: [], deadlineType: "soft",
      importance: "normal", effort: "quick", goalId: "", openLoop: false, promisedTo: "", waitingOn: "",
      done: true, createdAt: TODAY + "T08:00:00Z", completedAt: TODAY + "T10:00:00Z", plannedMinutes: 15,
      spentMinutes: 15, optional: false, committed: true, notBefore: "", areas: [] },
  ],
  waiting: [{ id: "w1", title: "reply from the office", who: "Dan", since: TODAY }],
  goals: [{ id: "g1", title: "Get better at questioning", areas: ["prof"], createdAt: TODAY + "T08:00:00Z",
    completedAt: null, milestones: [{ id: "m1", title: "Read up on it", done: false, completedAt: null,
      steps: [{ id: "s1", title: "read one chapter", done: false, completedAt: null }] }] }],
  records: [{ id: "r1", who: "p1", topic: "Reading", level: "3", date: TODAY, createdAt: TODAY + "T08:00:00Z",
    type: "assessment", summary: "Reading — 3", detail: "", extra: {}, tags: [], followUp: false,
    taskId: "", src: "hand", checkedAt: TODAY + "T08:00:00Z", files: [] }],
  recordConfig: { levels: ["4", "3", "2", "1"], levelNames: { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" },
    targetLevel: "3", topics: ["Reading", "Writing"], types: ["assessment", "parent"],
    skillTags: {}, descriptors: {}, standards: [], whoIds: ["p1", "p2"] },
  portfolio: { points: [{ id: "st1", code: "TS1", title: "Set high expectations" }], entries: [] },
  contacts: [{ id: "p1", name: "Student One", group: "9A", details: {}, createdAt: TODAY + "T08:00:00Z" },
             { id: "p2", name: "Student Two", group: "9A", details: {}, createdAt: TODAY + "T08:00:00Z" }],
  contactConfig: { groups: ["9A"], fields: [] },
  schedule: [{ id: "sl1", label: "9A period 3", start: "11:00", end: "12:00", days: [0, 1, 2, 3, 4, 5, 6] }],
  scheduleConfig: { dayStart: "08:00", dayEnd: "17:00", minGapMinutes: 10 },
  pastoralTopics: [], pastoralNotes: [], toldLog: [], worked: {}, areas: [{ id: "work", name: "work", hints: [] }],
  targeted: {}, tried: [], lessons: [], lessonConfig: null, rotas: [], syllabus: null, attendance: [],
};

const OLD = ["index.html", "timeline.html", "records.html", "class.html",
             "people.html", "portfolio.html", "looking-back.html"];

// ---------------------------------------------------------------------------
sec("Press everything, and see what dies");
for (const pg of OLD) {
  const r = await open(pg, DATA);
  if (r.errs.length) { ok(`${pg} loads`, false, r.errs.join(" | ")); continue; }
  const btns = buttonsIn(r);
  const broke = [];
  for (const b of btns) {
    try { b.fire("click", { target: b, preventDefault() {}, stopPropagation() {} }); }
    catch (e) { broke.push(`"${(b.textContent || b.id || b.className || "?").slice(0, 30)}": ${e.message}`); }
  }
  await new Promise((res) => setTimeout(res, 30));
  ok(`${pg}: all ${btns.length} controls survive being pressed`, broke.length === 0, broke.slice(0, 4).join(" | "));
}

sec("And every other control — typing, choosing, submitting");
for (const pg of OLD) {
  const r = await open(pg, DATA);
  if (r.errs.length) continue;
  const broke = [];
  for (const el of [...r.byId.values()]) {
    for (const ev of ["input", "change", "submit", "keydown"]) {
      if (!el._on[ev]) continue;
      try { el.fire(ev, { target: el, key: "Enter", preventDefault() {}, stopPropagation() {} }); }
      catch (e) { broke.push(`${el.id || "?"} on ${ev}: ${e.message}`); }
    }
  }
  await new Promise((res) => setTimeout(res, 30));
  ok(`${pg}: every input, select and form survives being used`, broke.length === 0, broke.slice(0, 4).join(" | "));
}

// ---------------------------------------------------------------------------
sec("People — adding and removing someone");
{
  const r = await open("people.html", DATA);
  r.get("#pplName").value = "Student Three";
  r.get("#pplGroup").value = "9A";
  // By id, not by the word "Add" — the capture bar sits on this page too and
  // has an Add of its own, which is what a text match finds first.
  const add = r.get("#pplAdd");
  ok("there is a way to add a person", !!add && !!add._on.click,
     [...r.byId.keys()].join(", ").slice(0, 200));
  if (add) {
    add.fire("click", { target: add, preventDefault() {} });
    const saved = r.saves.filter((s) => s.contacts).pop();
    ok("adding one saves the contact list", !!saved, JSON.stringify(r.saves).slice(0, 200));
    const added = saved && saved.contacts.find((c) => c.name === "Student Three");
    ok("with the new person in it", !!added, JSON.stringify(saved && saved.contacts.map((c) => c.name)));
    ok("carrying an id and a group", added && added.id && added.group === "9A", JSON.stringify(added));
    ok("and the ones already there are kept", saved && saved.contacts.length === 3);
  }
}

sec("The two student lists");
{
  // The People page keeps `contacts` — names, groups, and everything the
  // register, the rota, the pastoral notes and the person page hang off.
  // The Students and Class pages keep `recordConfig.whoIds` — bare id strings.
  // Nothing joins them, so the two halves of the app can be looking at
  // different classes.
  // Shaped like a real person's app rather than a tidy fixture: they have put
  // their class into the People page, and have never touched the marking list.
  const REAL = { ...DATA, recordConfig: { ...DATA.recordConfig, whoIds: [] } };
  const r = await open("people.html", REAL);
  r.get("#pplName").value = "Student Three";
  r.get("#pplGroup").value = "9A";
  r.get("#pplAdd").fire("click", { target: r.get("#pplAdd"), preventDefault() {} });
  const saved = r.saves.filter((x) => x.contacts).pop();
  ok("adding someone on the People page saves them", !!saved);
  ok("but it never touches the list the Class page marks from", !saved.recordConfig,
     "if this fails the two lists have been joined up, and this test should be rewritten to say so");

  const c = await open("class.html", REAL);
  // The fix: with no marking list of your own, the Class page marks the people
  // you actually have. It cannot overwrite a setup, because it only fires when
  // there is nothing there.
  const start = c.get("#msBtn");
  start.fire("click", { target: start, preventDefault() {} });
  await new Promise((res) => setTimeout(res, 20));
  const grid = c.created.map((e) => e.textContent || "").join(" ");
  ok("the Class page marks the people you actually have",
     /Student One/.test(grid) && /Student Two/.test(grid), grid.slice(0, 200));
  ok("and shows their names, not their ids", !/\bp1\b/.test(grid), grid.slice(0, 200));

  // And a marking list you HAVE set up is used exactly as before.
  const own = { ...DATA, recordConfig: { ...DATA.recordConfig, whoIds: ["S01", "S02"] },
    contacts: DATA.contacts };
  const o = await open("class.html", own);
  const ob = o.get("#msBtn");
  ob.fire("click", { target: ob, preventDefault() {} });
  await new Promise((res) => setTimeout(res, 20));
  const ogrid = o.created.map((e) => e.textContent || "").join(" ");
  ok("your own marking list still wins over your contacts",
     /S01/.test(ogrid) && !/Student One/.test(ogrid), ogrid.slice(0, 200));
}

sec("Class — marking a level for one student");
{
  const r = await open("class.html", DATA);
  const before = r.state.records.length;
  // The session is opened by the button on the page, which then draws a level
  // button per student. Reached by id, because its label is written into
  // innerHTML and a text search finds the capture bar first.
  const start = r.get("#msBtn");
  ok("the whole-class marking button is wired", !!start._on.click);
  start.fire("click", { target: start, preventDefault() {} });
  await new Promise((res) => setTimeout(res, 20));
  const lvl = buttonsIn(r).find((b) => /^(Exceeding|Proficient|Developing|Beginning|4|3|2|1)$/.test((b.textContent || "").trim()));
  ok("a level button is drawn for the class", !!lvl,
     buttonsIn(r).map((b) => (b.textContent || b.className || "?").slice(0, 18)).join(" / ").slice(0, 240));
  if (lvl) lvl.fire("click", { target: lvl, preventDefault() {} });
  const saved = r.saves.filter((s) => s.records).pop();
  // No "or nothing happened" escape hatch: either a level was recorded or this
  // did not test anything.
  ok("marking a level saves a record", !!saved && saved.records.length > before,
     `records went from ${before} to ${saved ? saved.records.length : "no save at all"}`);
  if (saved) {
    const rec = saved.records[0];
    ok("with a person, a topic and a level", rec && rec.who && rec.topic && rec.level, JSON.stringify(rec));
    ok("dated and stamped like every other record",
       rec && rec.date && rec.createdAt && Array.isArray(rec.files), JSON.stringify(rec));
  }
}

sec("Looking back — putting something back");
{
  const r = await open("looking-back.html", DATA);
  // Written into innerHTML, so it has no text of its own here — found by the
  // class the page wires it with.
  const un = buttonsIn(r).find(
    (b) => /putback/.test(b.className) || /not done|undo|put back|unfinish/i.test(b.textContent));
  if (un) {
    un.fire("click", { target: un, preventDefault() {} });
    const saved = r.saves.filter((s) => s.items).pop();
    ok("un-ticking something saves the items", !!saved, JSON.stringify(r.saves).slice(0, 150));
    const it = saved && saved.items.find((x) => x.id === "i2");
    ok("and it is no longer done", it && it.done === false, JSON.stringify(it));
  } else {
    ok("a finished item is listed to be put back", false,
       "no control offered to un-finish anything: " + buttonsIn(r).map((b) => b.textContent).join(" / ").slice(0, 200));
  }
}

sec("Home — the capture box is the way in");
{
  const r = await open("index.html", DATA);
  const box = r.get("#entry") || r.get("#capture");
  ok("there is a box to type into", !!box);
  // Whatever the button says, one of them must lead to a save.
  const btns = buttonsIn(r);
  ok("and something to press", btns.length > 0, String(btns.length));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
