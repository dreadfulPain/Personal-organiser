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
  for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])) {
    if (f === "store.js") {
      sb.OrganiserStore = {
        load: async () => JSON.parse(JSON.stringify(state)),
        save(part) { saves.push(part); Object.assign(state, JSON.parse(JSON.stringify(part))); },
        flush: async () => {}, exportNow: async () => {}, importFile: async () => {},
        flushBeacon() {}, onStatus() {}, onExternalChange() {}, mode: "file",
      };
      continue;
    }
    let s;
    try { s = read(f); } catch { errs.push(`${pg} loads ${f}, which is missing`); continue; }
    try { vm.runInContext(s, sb, { filename: f }); } catch (e) { errs.push(`${f}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 60));
  const settle = () => new Promise((r) => setTimeout(r, 20));
  return { errs, byId, created, saves, state, sb, get, settle };
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
