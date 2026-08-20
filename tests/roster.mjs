import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// PASTING A CLASS IN, AND SAYING HOW OLD AN ABSENCE IS.
//
// The register was twenty-four of the thirty-seven actions needed to set this
// app up, and the data was already two clean columns. So: paste. What matters
// is that it handles what a spreadsheet actually produces, and that it never
// drops somebody quietly — a class that imports as twenty-two with no
// explanation is worse than one that doesn't import at all.

import fs from "node:fs";
import vm from "node:vm";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

function makeEl(tag, reg) {
  const el = {
    tagName: (tag || "div").toUpperCase(), className: "", id: "", textContent: "", innerHTML: "",
    value: "", checked: false, hidden: false, open: true, type: "", dataset: {}, style: {},
    children: [], options: [], _on: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    prepend(c) { this.children.unshift(c); }, removeChild() {}, remove() {},
    replaceChildren(...cs) { this.children = cs; },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; }, insertBefore(c) { return c; },
    addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
    removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, focus() {}, blur() {}, click() {}, scrollIntoView() {},
    closest(sel) { const w = String(sel).replace(/^\./, ""); return String(this.className).split(/\s+/).includes(w) ? this : null; },
    querySelector() { return makeEl("div", reg); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 600, height: 40 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains(c) { return String(el.className).split(/\s+/).includes(c); } },
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev || { target: this, preventDefault() {} })); },
  };
  if (reg) reg.push(el);
  return el;
}

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, parseInt, isNaN };
sb.window = sb; vm.createContext(sb);
["roster.js", "attend.js", "levels.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const R = sb.OrganiserRoster, A = sb.OrganiserAttend;

// ---------------------------------------------------------------------------
sec("What a spreadsheet actually pastes as");
{
  // Excel and Sheets both give tab-separated, one row per line.
  const excel = "Wang Wei\t9A\nLi Hua\t9A\nZhang Min\t9B";
  const r = R.read(excel, { existing: [] });
  ok("tab-separated goes in", r.adding.length === 3, JSON.stringify(r.adding));
  ok("names and classes land the right way round",
     r.adding[0].name === "Wang Wei" && r.adding[0].group === "9A", JSON.stringify(r.adding[0]));
  ok("and the repeated column is read as the class, not the name",
     r.pick.name === 0 && r.pick.group === 1, JSON.stringify(r.pick));

  // A saved file is comma-separated, and a name with a comma in it is quoted.
  const csv = 'Name,Class\n"Wang, Wei",9A\nLi Hua,9A';
  const c = R.read(csv, { existing: [] });
  ok("a header row is skipped, not imported as a person",
     !c.rows.some((x) => /^Name$/i.test(x.name)), JSON.stringify(c.rows.map((x) => x.name)));
  ok("a quoted name keeps its comma", c.adding[0].name === "Wang, Wei", JSON.stringify(c.adding[0]));

  // A printed list, numbered.
  const numbered = "1. Wang Wei\n2. Li Hua\n3) Zhang Min";
  const n = R.read(numbered, { existing: [] });
  ok("numbering is stripped", n.adding.map((x) => x.name).join("|") === "Wang Wei|Li Hua|Zhang Min",
     JSON.stringify(n.adding.map((x) => x.name)));
  ok("a one-column list has no class, rather than a wrong one",
     n.adding.every((x) => x.group === ""), JSON.stringify(n.adding));
  ok("and a fallback class can be given for one",
     R.read(numbered, { existing: [], fallbackGroup: "9A" }).adding.every((x) => x.group === "9A"));

  // Names with no spaces in them, which is most of the world.
  const cn = "王伟\t9A\n李华\t9A";
  ok("names without spaces are names", R.read(cn, { existing: [] }).adding.length === 2);
  ok("and are kept exactly as typed", R.read(cn, { existing: [] }).adding[0].name === "王伟");
}

sec("Which column is which is never guessed at your expense");
{
  // "Surname, Firstname" is the same shape as "Name, Class" and means something
  // completely different. The signal used is repetition, never the words.
  const surnames = "Wang, Wei\nLi, Hua\nZhang, Min";
  const r = R.read(surnames, { existing: [] });
  ok("a second column of all-different values is not treated as a class",
     r.pick.group === -1, JSON.stringify(r.pick));
  ok("so nobody ends up in a form group called Wei",
     r.adding.every((x) => x.group === ""), JSON.stringify(r.adding));

  // And you can say so yourself.
  const chosen = R.read("9A\tWang Wei\n9A\tLi Hua", { existing: [], name: 1, group: 0 });
  ok("choosing the columns yourself is honoured",
     chosen.adding[0].name === "Wang Wei" && chosen.adding[0].group === "9A",
     JSON.stringify(chosen.adding[0]));
}

sec("Nobody is dropped quietly");
{
  const existing = [{ id: "p1", name: "Wang Wei", group: "9A" }];
  const text = "Wang Wei\t9A\nLi Hua\t9A\nLi Hua\t9A\n\t9A";
  const r = R.read(text, { existing });
  ok("somebody already on your list isn't added twice", r.adding.length === 1, JSON.stringify(r.adding));
  ok("a repeat inside the paste is caught too",
     r.skipping.filter((x) => /twice/.test(x.skip)).length === 1, JSON.stringify(r.skipping));
  ok("and a row with no name is caught",
     r.skipping.filter((x) => /no name/.test(x.skip)).length === 1);
  // The point: every skipped row is still returned, with the reason.
  ok("every skipped row is shown with why", r.skipping.every((x) => x.skip), JSON.stringify(r.skipping));
  ok("the count says what will happen", /1 to add/.test(R.words(r)), R.words(r));
  ok("and names what it is leaving out",
     /already on your list/.test(R.words(r)) && /repeated/.test(R.words(r)), R.words(r));
  // Same person in a different class is a different row, not a duplicate.
  ok("the same name in another class is a different person",
     R.read("Wang Wei\t9B", { existing }).adding.length === 1);
}

sec("The page: paste, look, add");
{
  const els = {};
  const created = [];
  const el = (sel) => {
    const k = String(sel).replace(/^#/, "");
    if (!els[k]) { els[k] = makeEl("div", created); els[k].id = k; }
    return els[k];
  };
  const doc = { querySelector: el, getElementById: el, createElement: (t) => makeEl(t, created),
    querySelectorAll: () => [], addEventListener() {}, body: makeEl("body"), title: "" };
  const sb2 = { console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, Set, Map, Object,
    Number, String, Array, Boolean, RegExp, Error, Promise, setTimeout, clearTimeout,
    isNaN, parseInt, parseFloat, document: doc, location: { hash: "", search: "" },
    localStorage: { getItem: () => null, setItem() {} }, confirm: () => true, alert() {},
    Option: function (t, v) { const e = makeEl("option", created); e.textContent = t; e.value = v; return e; },
    URLSearchParams, navigator: { onLine: true } };
  sb2.window = sb2; sb2.addEventListener = () => {}; vm.createContext(sb2);
  ["roster.js", "names.js", "quickparse.js"].forEach((f) => {
    try { vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb2); } catch {}
  });
  const state = { contacts: [{ id: "p0", name: "Wang Wei", group: "9A" }], contactConfig: null,
    items: [], records: [], goals: [] };
  const saves = [];
  sb2.OrganiserStore = { load: async () => JSON.parse(JSON.stringify(state)),
    save(p) { saves.push(p); Object.assign(state, p); }, onStatus() {}, onExternalChange() {},
    flush: async () => {}, mode: "file" };
  vm.runInContext(fs.readFileSync(`${REPO}/public/people.js`, "utf8"), sb2);
  await new Promise((r) => setTimeout(r, 40));

  el("#pplPaste").value = "Wang Wei\t9A\nLi Hua\t9A\nZhang Min\t9B";
  el("#pplPaste").fire("input", {});
  ok("the preview appears before anything is kept", el("#pplPreview").hidden === false);
  ok("it shows who would be added", /Li Hua/.test(el("#pplPreview").innerHTML),
     el("#pplPreview").innerHTML.slice(0, 200));
  ok("and says the one you already have is already there",
     /already on your list/.test(el("#pplPreview").innerHTML + el("#pplPasteWords").textContent),
     el("#pplPasteWords").textContent);
  // The page normalises its config on load and saves that, which is nothing to
  // do with this — what must not happen is anybody being ADDED by looking.
  const before = saves.length;
  ok("nobody is added just by looking",
     !saves.some((x) => x.contacts && x.contacts.length > 1), JSON.stringify(saves).slice(0, 120));

  ok("the add button appears once there is something to add", el("#pplPasteAdd").hidden === false);
  el("#pplPasteAdd").fire("click", {});
  const saved = saves.filter((s) => s.contacts).pop();
  ok("adding them saves the list", !!saved, JSON.stringify(saves).slice(0, 150));
  ok("with the two new people", saved && saved.contacts.length === 3,
     JSON.stringify(saved && saved.contacts.map((c) => c.name)));
  ok("the one already there is untouched",
     saved && saved.contacts.filter((c) => c.name === "Wang Wei").length === 1);
  ok("each new person has an id, a class and a created date",
     saved && saved.contacts.filter((c) => c.id !== "p0").every((c) => c.id && c.group && c.createdAt),
     JSON.stringify(saved && saved.contacts));
  ok("and the box is emptied afterwards", el("#pplPaste").value === "");
}

sec("An absence that stopped being news");
{
  // Away three times running before a month off. The run is right; what was
  // wrong is that it read in the present tense forever.
  let list = [];
  ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"].forEach((d, i) => {
    list = A.take(list, { group: "9A", away: i >= 3 ? ["s1"] : [] }, d);
  });
  const fresh = A.pattern(list, "s1", "9A", "2026-11-14");
  ok("a run just after it happened says how long ago they were last in",
     /last in \d+ days ago/.test(A.words(fresh)), A.words(fresh));
  ok("and doesn't nag about the register being old", !/may have moved on/.test(A.words(fresh)),
     A.words(fresh));

  // Now look at the same data after the holiday.
  const stale = A.pattern(list, "s1", "9A", "2026-12-16");
  ok("the run itself is unchanged", stale.run === 3, JSON.stringify(stale.run));
  ok("but it now says how long ago they were last in, in weeks",
     /last in \d+ weeks ago/.test(A.words(stale)), A.words(stale));
  ok("and says the register itself is old",
     /may have moved on/.test(A.words(stale)), A.words(stale));
  ok("naming how long since one was taken",
     /last register for this class was \d+ weeks ago/.test(A.words(stale)), A.words(stale));
  ok("it is flagged as stale on the data too", stale.stale === true);
  ok("with the date of the last one carried out",
     stale.lastTaken === "2026-11-13", stale.lastTaken);
  // Still no blame anywhere.
  ok("and still nothing that blames anybody",
     !/should|truant|neglect|failed|poor/i.test(A.words(stale)), A.words(stale));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
