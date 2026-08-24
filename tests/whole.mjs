import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE WHOLE APP: in, across, down, and back out.
//
// Four questions asked of everything at once, and nothing in here is listed by
// hand — the stores come out of store.js and the pages out of the folder, so a
// new one is covered the day it's added rather than the day somebody remembers
// to add it to a list. That is the failure this file exists to prevent: not a
// broken feature, a forgotten one.
//
//   IN      — every page loads and renders, with nothing and with everything.
//   ACROSS  — every store is written somewhere and read somewhere.
//   DOWN    — every store survives a real server, all of them at once.
//   OUT     — saving one thing never quietly wipes another.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
// The store list comes from one place for the whole suite. It used to be worked
// out here with a pattern of this file's own, and when store.js changed shape
// that pattern matched nothing: 157 checks became 47 and it still said
// "0 failed". A list that can empty itself is worse than one that is wrong.
import { STORES as TABLE } from "./_store.mjs";

const REPO = REPO_ROOT;
const PUB = path.join(REPO, "public");
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 500) : "")); }
};
const sec = (s) => console.log("\n" + s);

const src = Object.fromEntries(
  fs.readdirSync(PUB).filter((f) => /\.(js|html)$/.test(f)).map((f) => [f, fs.readFileSync(path.join(PUB, f), "utf8")])
);
const server = fs.readFileSync(path.join(REPO, "server.js"), "utf8");
const code = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pages = Object.keys(src).filter((f) => f.endsWith(".html")).sort();

const STORES = TABLE.map((s) => s.key);

// ---------------------------------------------------------------------------
sec(`ACROSS — every store written and read (${STORES.length} of them)`);
{
  const jsOn = (pg) => [...src[pg].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const onAPage = new Set(pages.flatMap(jsOn));
  for (const k of STORES) {
    const writers = [...onAPage].filter(
      (f) => src[f] && new RegExp(`OrganiserStore\\.save\\(\\s*\\{[^}]*\\b${k}\\b`).test(code(src[f])));
    const readers = [...onAPage].filter((f) => src[f] && new RegExp(`data\\.${k}\\b`).test(code(src[f])));
    ok(`${k}: a page writes it`, writers.length > 0, `nothing on any page saves ${k}`);
    ok(`${k}: a page reads it`, readers.length > 0, `nothing reads data.${k}`);
  }
}

sec("DOWN — the places a field gets silently dropped");
{
  const st = code(src["store.js"]), sv = code(server);
  // store.js used to hand-copy this list in NINE places — loading, saving, the
  // mirror, a backup, a restore, the conflict answer — and twelve stores had
  // been added to some and forgotten in the others. It works from one table
  // now, so the thing worth checking is that the table is still the only way
  // to storage.
  const strays = [...st.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*["\x27`]/g)];
  ok("nothing in store.js goes round the table to reach storage", strays.length === 0,
     `${strays.length} place(s) name a storage key directly instead of using the table`);
  ok("and every store in the table has its own key",
     new Set(TABLE.map((s) => s.ls)).size === TABLE.length,
     "two stores share a key, so one writes over the other");
  // The blank state is BUILT from the table rather than written out again. A
  // literal here is how a store came to be missing from it in the first place.
  ok("store.js starts from the table rather than from a list of its own",
     /let lastState = blank\(\)/.test(st) && /STORES\.forEach\(\(\[k, , b\]\) => \{ o\[k\] = blankFor\(b\)/.test(st),
     "the blank state is written out by hand again");
  // AND THE SERVER STARTS FROM ITS OWN TABLE, NOT A LITERAL.
  //
  // This used to check two hand-written blank-state objects named every store,
  // and then that each store's name appeared in server.js at least FIVE times —
  // because there were five hand-copied lists in there. Which means it was
  // pinning the disease as the cure: the day those five became one table it went
  // red, having never caught the thing it existed for.
  //
  // It caught nothing when it mattered, either. A store added to store.js and
  // not to server.js was silently dropped on every save, and a whole page's
  // worth of data went that way before anybody noticed.
  const serverBlock = (sv.match(/const STORES = \[([\s\S]*?)\n\];/) || [])[1] || "";
  const serverStores = [...serverBlock.matchAll(/\[\s*"([^"]+)"/g)].map((m) => m[1]);
  ok("the server works from a table too", serverStores.length > 5, String(serverStores.length));
  ok("and the fresh document is built from it",
     /function emptyDoc\(\)[\s\S]{0,200}STORES\.forEach/.test(sv),
     "the empty document is written out by hand again");
  ok("and so is a partial save's merge",
     /function mergeDoc\([\s\S]{0,400}STORES\.forEach/.test(sv),
     "the merge names its stores one by one again");
  ok("and the fallback when the file won't read", /let current = emptyDoc\(\)/.test(sv),
     "the fallback is a literal again");
  ok("and a conflict copy keeps the same set", /const kept = mergeDoc\(/.test(sv),
     "the conflict copy has its own list again");

  // THE TWO TABLES MUST SAY THE SAME THING. One each is only half the cure if
  // they can drift: on the client and not the server is data thrown away; on the
  // server and not the client is a field nothing ever fills.
  const onlyClient = STORES.filter((k) => !serverStores.includes(k));
  const onlyServer = serverStores.filter((k) => !STORES.includes(k));
  ok("the two tables agree", !onlyClient.length && !onlyServer.length,
     `client only: ${onlyClient.join(", ") || "—"} · server only: ${onlyServer.join(", ") || "—"}`);
}

// ---------------------------------------------------------------------------
// IN — every page, rendered. The stub is deliberately forgiving: the question
// is "does this page throw", not "is every DOM method faithful".
function makeEl(tag) {
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
    setAttribute(k, v) { if (k === "id") this.id = v; }, getAttribute() { return null; },
    removeAttribute() {}, hasAttribute() { return false; }, focus() {}, blur() {}, click() {},
    scrollIntoView() {}, closest() { return null; }, contains() { return false; },
    querySelector() { return makeEl("div"); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 600, height: 40, bottom: 40, right: 600 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    getContext() { return null; },
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev || {})); },
  };
  // Walking upwards is as ordinary as walking down; a stub without parents
  // fails pages that reach for the label around an input.
  Object.defineProperty(el, "parentElement", { get() { return el._parent || (el._parent = makeEl("div")); } });
  Object.defineProperty(el, "parentNode", { get() { return el.parentElement; } });
  Object.defineProperty(el, "firstChild", { get() { return el.children[0] || null; } });
  Object.defineProperty(el, "lastChild", { get() { return el.children[el.children.length - 1] || null; } });
  Object.defineProperty(el, "nextElementSibling", { get() { return null; } });
  Object.defineProperty(el, "previousElementSibling", { get() { return null; } });
  return el;
}

function makeDoc(ids) {
  const byId = new Map();
  ids.forEach((i) => byId.set(i, makeEl("div")));
  const get = (sel) => {
    const key = String(sel).replace(/^#/, "");
    if (!byId.has(key)) byId.set(key, makeEl("div"));
    return byId.get(key);
  };
  return {
    _byId: byId,
    documentElement: makeEl("html"),
    body: makeEl("body"),
    head: makeEl("head"),
    title: "",
    readyState: "complete",
    createElement: makeEl,
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => makeEl("fragment"),
    getElementById: (id) => get(id),
    querySelector: (sel) => get(sel),
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {}, execCommand() { return true; },
  };
}

async function renderPage(pg, data) {
  const ids = [...src[pg].matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const doc = makeDoc(ids);
  const sb = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date, Math, JSON, Set, Map, WeakMap, Object, Number, String, Array, Boolean, RegExp, Error,
    Promise, Symbol, Intl, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: () => {},
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
    document: doc,
    location: { hash: "", href: "file:///x", search: "", pathname: "/", reload() {} },
    navigator: { onLine: true, userAgent: "test", clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    alert() {}, confirm: () => true, prompt: () => null, print() {}, open: () => null,
    fetch: async () => ({ ok: false, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: class { constructor() {} }, FileReader: class { readAsText() {} readAsDataURL() {} },
    // Browser constructors pages reach for directly.
    URLSearchParams, structuredClone,
    Option: function (text, value) { const o = makeEl("option"); o.textContent = text; o.value = value; return o; },
    Image: function () { return makeEl("img"); },
    Event: function (t) { return { type: t }; },
    CustomEvent: function (t, d) { return { type: t, detail: d && d.detail }; },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    Response: typeof Response !== "undefined" ? Response : class {},
    DecompressionStream: typeof DecompressionStream !== "undefined" ? DecompressionStream : undefined,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    scrollTo() {}, history: { replaceState() {}, pushState() {} },
    performance: { now: () => 0 },
  };
  // The window is the sandbox itself, so it needs the listener methods too —
  // pages hook pagehide and visibilitychange to flush before you close the tab.
  sb.addEventListener = () => {};
  sb.removeEventListener = () => {};
  sb.dispatchEvent = () => true;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);

  const scripts = [...src[pg].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const errs = [];
  for (const f of scripts) {
    if (f === "store.js") {
      // The real store talks to a server; swap in one that just hands the data
      // over, so the page under test is the only thing being tested.
      // The full surface the real store exposes. A stub missing one method
      // fails the page at load, which would look exactly like a broken page.
      sb.OrganiserStore = {
        load: async () => JSON.parse(JSON.stringify(data)),
        save() {}, flush: async () => {}, exportNow: async () => {},
        importFile: async () => {}, flushBeacon() {},
        onStatus() {}, onExternalChange() {}, mode: "file",
      };
      continue;
    }
    if (!src[f]) { errs.push(`${pg} loads ${f}, which doesn't exist`); continue; }
    try { vm.runInContext(src[f], sb, { filename: f }); }
    catch (e) { errs.push(`${f}: ${e.message}`); }
  }
  // Pages start their own work asynchronously; give it a moment to finish and
  // catch anything that throws after the script has returned.
  const late = [];
  sb.__late = late;
  await new Promise((r) => setTimeout(r, 60));
  // Text can be in innerHTML, in textContent, or in nodes built with
  // appendChild — a page that builds real elements would look empty to a
  // reader that only checks innerHTML.
  const deep = (e, d) =>
    !e || d > 6 ? "" :
    [e.textContent || "", e.innerHTML || "", e.value || "", e.title || ""]
      .concat((e.children || []).map((c) => deep(c, d + 1))).join(" ");
  return { errs, doc, sb, text: [...doc._byId.values()].map((e) => deep(e, 0)).join(" ") };
}

// A dataset with something in every store, so pages render their real branches
// rather than only their empty state.
const TODAY = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const FULL = {
  items: [{ id: "i1", title: "Mark the books", type: "task", date: TODAY, time: "", tags: [],
    deadlineType: "soft", importance: "normal", effort: "medium", goalId: "", openLoop: false,
    promisedTo: "", waitingOn: "", done: false, createdAt: TODAY + "T09:00:00Z", completedAt: null,
    plannedMinutes: 60, spentMinutes: 0, optional: false, committed: true, notBefore: "", areas: ["work"] }],
  waiting: [{ id: "w1", title: "reply from the office", who: "Dan", since: TODAY }],
  goals: [{ id: "g1", title: "Get better at questioning", areas: ["prof"],
    createdAt: TODAY + "T09:00:00Z", completedAt: null,
    milestones: [{ id: "m1", title: "Read up on it", done: false, completedAt: null,
      steps: [{ id: "s1", title: "read one chapter", done: false, completedAt: null }] }] }],
  records: [{ id: "r1", who: "p1", topic: "Reading", level: "3", date: TODAY, createdAt: TODAY + "T09:00:00Z",
    type: "assessment", summary: "Reading — 3", detail: "", extra: {}, tags: [], followUp: false,
    taskId: "", src: "hand", checkedAt: TODAY + "T09:00:00Z", files: [] },
    { id: "r2", who: "p1", topic: "W.3.d", level: "3", date: TODAY, createdAt: TODAY + "T09:00:00Z",
    type: "assessment", summary: "W.3.d — 3", detail: "", extra: {}, tags: [], followUp: false,
    taskId: "", src: "hand", checkedAt: TODAY + "T09:00:00Z", files: [] }],
  recordConfig: { levels: ["4", "3", "2", "1"], levelNames: { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" },
    targetLevel: "3", topics: ["Reading", "Writing"], types: ["assessment", "parent"],
    skillTags: { Reading: ["W.3.d"] }, descriptors: {}, standards: [] },
  portfolio: { entries: [] },
  contacts: [{ id: "p1", name: "Student One", group: "9A", details: {}, createdAt: TODAY + "T09:00:00Z" },
             { id: "p2", name: "Student Two", group: "9A", details: {}, createdAt: TODAY + "T09:00:00Z" }],
  contactConfig: { groups: ["9A"], fields: [] },
  schedule: [{ id: "sl1", label: "9A period 3", start: "11:00", end: "12:00", days: [1, 2, 3, 4, 5] }],
  scheduleConfig: { dayStart: "08:00", dayEnd: "17:00", minGapMinutes: 10 },
  pastoralTopics: [{ id: "t:soc", label: "how they get on socially", staysFreshDays: 30, options: [] },
    { id: "t:learn", label: "how they answer in class", staysFreshDays: 60, options: ["hand up", "if asked", "rarely"] }],
  pastoralNotes: [{ id: "n1", who: "p1", topicId: "t:soc", said: "settled", choice: "", date: TODAY, at: TODAY + "T09:00:00Z" },
    { id: "n2", who: "p1", topicId: "t:learn", said: "hand up", choice: "hand up", date: TODAY, at: TODAY + "T09:00:00Z" }],
  toldLog: [{ id: "tl1", who: "p1", to: "his mum", said: "coming on well", how: "call", date: TODAY, at: TODAY + "T09:00:00Z" }],
  worked: { [TODAY]: { total: 120, areas: { work: 120 } } },
  areas: [{ id: "work", name: "work", hints: ["marking"] }, { id: "prof", name: "professional", hints: [] }],
  targeted: { "9A": { id: "targeted:9A", everyDays: 21, lastDone: { p1: TODAY } } },
  tried: [{ id: "y1", what: "modelled it first", skill: "Reading", date: TODAY, group: "9A", whoIds: ["p1"], note: "" }],
  lessons: [{ id: "l1", title: "Settings", date: TODAY, slotId: "sl1", group: "9A", skill: "Reading",
    plan: "Learning Objective:\nsenses\n\nActivities\n- modelled it", objective: "senses",
    ways: ["modelled it"], checks: ["exit ticket"], taught: true, note: "went well",
    itemId: "", targets: ["W.3.d"], at: TODAY + "T09:00:00Z" }],
  lessonConfig: { headings: { objective: ["learning objective"], ways: ["activities"], checks: ["assessment"] }, reviewDays: [1, 7, 30] },
  rotas: [{ id: "ro1", title: "a few minutes each", memberIds: ["p1", "p2"], perDay: 1, minutes: 10,
    everyDays: 14, lastDone: { p1: TODAY }, tried: {}, optional: true }],
  syllabus: { name: "this year", targets: [{ code: "W.3.d", text: "Use sensory language.", strand: "Writing" }] },
  attendance: [{ id: "a1", group: "9A", date: TODAY, slotId: "sl1", away: ["p2"], late: [], note: "", at: TODAY + "T09:00:00Z" }],
  asks: [{ id: "q1", question: "how much homework is normal", whoId: "p1", asked: TODAY,
    answer: "20 minutes a night", answeredAt: TODAY, createdAt: TODAY + "T09:00:00Z" }],
  visits: [{ id: "v1", who: "a colleague", date: TODAY, what: "Grade 1 English",
    notes: { "Pacing — how long on each thing": "ten minutes a task, no longer" },
    createdAt: TODAY + "T09:00:00Z" }],
  visitConfig: { headings: ["How tight the routines are", "Pacing — how long on each thing"] },
};
const EMPTY = Object.fromEntries(
  Object.entries(FULL).map(([k, v]) => [k, Array.isArray(v) ? [] : v && typeof v === "object" ? {} : null]));

sec(`IN — every page renders with nothing at all (${pages.length} pages)`);
for (const pg of pages) {
  const r = await renderPage(pg, EMPTY);
  ok(`${pg} opens on an empty app`, r.errs.length === 0, r.errs.join(" | "));
}

sec("IN — and again with something in every store");
for (const pg of pages) {
  const r = await renderPage(pg, FULL);
  ok(`${pg} opens with real data`, r.errs.length === 0, r.errs.join(" | "));
}

sec("OUT — what a page with data actually shows");
{
  // Spot-checks that the data reached the screen, not merely that nothing threw.
  const checks = [
    ["person.html", /Student One/, "the person's name"],
    ["lessons.html", /Settings/, "a kept lesson"],
    ["attend.html", /Student Two|Student One/, "the class on the register"],
    ["rota.html", /Student One|Student Two/, "who's up next"],
    ["before-planning.html", /9A/, "the group picker"],
    ["records.html", /Reading/, "a skill"],
    ["week.html", /Mark the books/, "an item in the week"],
  ];
  for (const [pg, re, what] of checks) {
    const r = await renderPage(pg, FULL);
    ok(`${pg} shows ${what}`, re.test(r.text), r.text.slice(0, 200));
  }
}

// ---------------------------------------------------------------------------
sec("DOWN — all 22 stores through a real server, at once");
{
  const dataDir = path.join(REPO, "data");
  // NEVER DESTROY WHAT WAS ALREADY THERE. This used to delete the whole data
  // directory when it finished — on the machine somebody actually uses the app
  // on, that is their file. Running the tests wiped a timetable and a class
  // list mid-session, which is exactly the failure this suite exists to catch,
  // committed by the suite itself.
  const liveFile = path.join(dataDir, "organiser-data.json");
  const aside = liveFile + ".test-aside";
  const hadLive = fs.existsSync(liveFile);
  if (hadLive) fs.renameSync(liveFile, aside);
  const port = 8000 + Math.floor(Math.random() * 900);
  const srv = spawn("node", [path.join(REPO, "server.js")], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/api/data`); break; } catch { await wait(150); } }
    const get = async () => (await fetch(`http://127.0.0.1:${port}/api/data`)).json();
    const put = async (b) => (await fetch(`http://127.0.0.1:${port}/api/data`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();

    const first = await get();
    ok("a fresh file already knows every store", STORES.every((k) => k in first),
       STORES.filter((k) => !(k in first)).join(", "));

    await put({ ...first, ...FULL });
    const back = await get();
    for (const k of STORES) {
      const want = JSON.stringify(FULL[k]);
      ok(`${k} comes back exactly as it went in`, JSON.stringify(back[k]) === want,
         `sent ${want.slice(0, 90)}\n      got  ${JSON.stringify(back[k]).slice(0, 90)}`);
    }

    // THE MERGE PATH. Saving one page's data must not blank another page's.
    // This is how a whole feature disappears without an error anywhere.
    await put({ savedAt: back.savedAt, items: [{ id: "only", title: "just this" }] });
    const after = await get();
    ok("saving one store leaves the rest alone",
       STORES.filter((k) => k !== "items").every((k) => JSON.stringify(after[k]) === JSON.stringify(FULL[k])),
       STORES.filter((k) => k !== "items" && JSON.stringify(after[k]) !== JSON.stringify(FULL[k])).join(", "));
    ok("and the one you did save is changed", after.items.length === 1 && after.items[0].id === "only");

  } finally {
    srv.kill();
    // Put the machine back as we found it: our test file goes, theirs comes back.
    try {
      fs.rmSync(liveFile, { force: true });
      if (hadLive) fs.renameSync(aside, liveFile);
    } catch { /* best effort */ }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
