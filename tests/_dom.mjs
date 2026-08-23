import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A PAGE, OPENED, WITH ENOUGH BROWSER AROUND IT TO PRESS THINGS.
//
// Not a browser. Enough of one that a page's own scripts run, build their
// controls, and can be found and clicked — which is the only way to tell the
// difference between a feature that exists and a feature that exists in the
// module but was never wired to anything on screen. That distinction is the
// one this app keeps losing.
//
// Two rules worth knowing:
//   * Every element the page creates is REGISTERED, so a control built with
//     createElement can be found afterwards by what it says.
//   * querySelector MEMOISES. Half this app writes a row as innerHTML and then
//     wires it with row.querySelector(".x"); handing back a fresh element each
//     call attaches the listener to nothing, and the control looks absent.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const PUB = join(REPO_ROOT, "public");
export const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");


// EVERY MODULE THE APP HAS, into a sandbox — derived, never listed.
//
// A module is a file that ends by putting something on window; that is
// mechanical, so a new one cannot be forgotten. Suites that run a whole PAGE
// script need all of them, because that is what a page loads — and every time
// one of them named a handful by hand instead, it went stale the moment a page
// needed one more. The failure then surfaced inside the page as "X is not
// defined", pointing at the page rather than at the list that forgot it.
//
// A suite testing ONE module in isolation should still name what it wants: that
// list is a deliberate statement about what the module depends on.
//
// Returns what failed rather than swallowing it: a file chosen for putting
// something on window IS a module, so one that throws on the way in is a real
// failure and not "probably a page script".
// NAMED, not quietly skipped. capture.js puts helpers on window like a module
// AND mounts itself onto the page at the bottom of the file, so loading it into
// a bare sandbox starts a page that isn't there — and its init is async, so the
// failure escapes any try around the load and lands somewhere unrelated. It is
// the only file in the app shaped like this; if another appears, somebody
// should have to think about it rather than find out this way.
const MOUNTS_ITSELF = { "capture.js": "puts a capture bar on the page as it loads" };

export function everyModule(sb) {
  const failed = [];
  fs.readdirSync(PUB)
    .filter((f) => f.endsWith(".js") && f !== "store.js" && !MOUNTS_ITSELF[f])
    .filter((f) => /window\.Organiser[A-Za-z]*\s*=/.test(read(f)))
    .forEach((f) => {
      try {
        vm.runInContext(read(f), sb, { filename: f });
      } catch (e) {
        failed.push(`${f}: ${e.message}`);
      }
    });
  return failed;
}

export function makeEl(tag, reg) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    _on: {}, children: [], style: {}, dataset: {}, className: "", id: "",
    textContent: "", value: "", checked: false, hidden: false, disabled: false,
    type: "", href: "", title: "", placeholder: "", files: [],
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html || ""; },
    appendChild(c) { this.children.push(c); if (c) c._parent = this; return c; },
    append(...cs) { cs.forEach((c) => this.appendChild(c)); },
    prepend(c) { this.children.unshift(c); if (c) c._parent = this; return c; },
    insertBefore(c) { return this.appendChild(c); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { if (this._parent) this._parent.removeChild(this); },
    replaceChildren(...cs) { this.children = []; cs.forEach((c) => this.appendChild(c)); },
    // A PAGE THAT HALF-RENDERS STILL PASSES. week.js builds part of itself with
    // insertAdjacentHTML; without it here the render threw, the page came out
    // with two controls instead of its real set, and "all 2 controls survive
    // being pressed" was true and meant nothing.
    insertAdjacentHTML(where, html) {
      this._html = where === "afterbegin" ? String(html) + (this._html || "") : (this._html || "") + String(html);
    },
    insertAdjacentElement(where, node) {
      if (where === "afterbegin") this.children.unshift(node);
      else this.children.push(node);
      if (node) node._parent = this;
      return node;
    },
    cloneNode() { return makeEl(this.tagName, reg); },
    getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    matches() { return false; },
    scrollTo() {},
    select() {},
    // A <select> has options, and code that fills one reads them back to keep
    // the current choice. Without this, people.js threw mid-render and the page
    // came out half-built — passing, and testing almost nothing.
    get options() { return this.children.filter((c) => c && c.tagName === "OPTION"); },
    get selectedOptions() { return this.options.filter((o) => o.selected); },
    get length() { return this.children.length; },
    addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
    removeEventListener(n, f) { this._on[n] = (this._on[n] || []).filter((x) => x !== f); },
    setAttribute(k, v) { if (k === "id") this.id = v; if (k === "type") this.type = v; },
    getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    focus() {}, blur() {}, scrollIntoView() {}, contains() { return false; },
    click() { this.fire("click", { target: this, preventDefault() {}, stopPropagation() {} }); },
    closest(sel) {
      const want = String(sel).replace(/^[.#]/, "").toLowerCase();
      let n = this;
      for (let i = 0; i < 6 && n; i++) {
        if (String(n.className).split(/\s+/).includes(want) || n.tagName.toLowerCase() === want) return n;
        n = n._parent;
      }
      return null;
    },
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
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 600, height: 40, bottom: 40, right: 600 }),
    classList: {
      add() {}, remove() {}, toggle() {},
      contains(c) { return String(el.className).split(/\s+/).includes(c); },
    },
    getContext: () => null,
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev || { target: this, preventDefault() {} })); },
  };
  Object.defineProperty(el, "parentElement", { get() { return el._parent || (el._parent = makeEl("div", reg)); } });
  Object.defineProperty(el, "parentNode", { get() { return el.parentElement; } });
  Object.defineProperty(el, "firstChild", { get() { return el.children[0] || null; } });
  Object.defineProperty(el, "lastChild", { get() { return el.children[el.children.length - 1] || null; } });
  Object.defineProperty(el, "nextElementSibling", { get: () => null });
  Object.defineProperty(el, "previousElementSibling", { get: () => null });
  if (reg) reg.push(el);
  return el;
}

// Open a page: run every script it loads, in order, with a store that hands
// back the data you gave it and remembers what got saved.
export async function open(pg, data, opts) {
  const o = opts || {};
  const html = read(pg);
  const created = [];
  const byId = new Map();
  [...html.matchAll(/\bid="([^"]+)"/g)].forEach((m) => {
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
    addEventListener() {}, removeEventListener() {}, execCommand: () => true,
  };
  const saves = [];
  const state = JSON.parse(JSON.stringify(data || {}));
  const sb = {
    console: o.loud ? console : { log() {}, warn() {}, error() {}, info() {} },
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
  const statusCbs = [];
  for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])) {
    if (f === "store.js") {
      sb.OrganiserStore = {
        load: async () => JSON.parse(JSON.stringify(state)),
        save(part) { saves.push(part); Object.assign(state, JSON.parse(JSON.stringify(part))); },
        flush: async () => {}, exportNow: async () => {}, importFile: async () => {},
        flushBeacon() {},
        // KEPT, NOT SWALLOWED. This threw the callback away, so anything whose
        // job is to react to a save going wrong looked identical on the page to
        // nothing being there at all — which is the bug it exists to prevent.
        onStatus(cb) { if (typeof cb === "function") statusCbs.push(cb); },
        onExternalChange() {}, mode: "file",
      };
      continue;
    }
    let s;
    try { s = read(f); } catch { errs.push(`${pg} loads ${f}, which is missing`); continue; }
    try { vm.runInContext(s, sb, { filename: f }); } catch (e) { errs.push(`${f}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 60));
  const settle = () => new Promise((r) => setTimeout(r, 20));
  // Tell the page what the store would have told it.
  const tellStatus = (st) => { statusCbs.forEach((cb) => cb(st)); };
  return { errs, byId, created, saves, state, sb, get, settle, tellStatus, statusCbs };
}

// Everything the page made clickable, whatever tag it is.
export const clickable = (r) => {
  const seen = new Set();
  return r.created.concat([...r.byId.values()])
    .filter((e) => e && e._on && e._on.click && !seen.has(e) && seen.add(e));
};

// Find a control by what it says on it.
export const saying = (r, re) =>
  clickable(r).filter((e) => re.test(String(e.textContent || "")));
