// A browser for store.js to live in.
//
// store.js is the only file in the app whose failures are permanent. Everything
// else can be wrong and cost you an afternoon; this one loses the afternoon.
//
// It had never been RUN by a test. The page tests all swap it for a stub that
// hands the data straight back, and the round-trip test talks to the server with
// its own fetch — so the file that decides what survives was the one file
// nothing ever asked a question of.
//
// This is the smallest browser it will run in: a real localStorage, a fetch you
// can point wherever you like or break on purpose, a clock you drive yourself,
// and a note of everything that went out.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SRC = fs.readFileSync(path.join(PUB, "store.js"), "utf8");

// THE STORES, OUT OF store.js ITSELF, ONCE, FOR THE WHOLE SUITE.
//
// Three separate suites used to work this out with three separate patterns of
// their own. When store.js changed shape, one of them quietly matched nothing,
// dropped from a hundred and fifty checks to none, and still printed "0 failed"
// — a list that empties itself is worse than a list that is wrong, because
// nothing about it looks like a problem.
//
// So it is derived in one place, and coming back empty is a hard stop rather
// than a quiet pass.
export const STORES = [...SRC.matchAll(/\["(\w+)",\s*"organiser\.[\w.]+",\s*(\[\]|\{\}|null)\]/g)]
  .map((m) => ({ key: m[1], ls: m[0].match(/"(organiser\.[\w.]+)"/)[1], blank: m[2] }));
if (STORES.length < 20) {
  throw new Error(
    `_store.mjs found ${STORES.length} stores in store.js, which cannot be right. ` +
    "The table it reads has moved or changed shape — fix this before trusting any suite that counts stores.");
}

// Something in every store, so "did it survive" is a question with an answer.
export function fullDoc(mark = "1") {
  const o = {};
  for (const { key, blank } of STORES) {
    o[key] = blank === "[]" ? [{ id: `${key}-${mark}` }]
      : blank === "{}" ? { [`${key}-${mark}`]: true }
      : { name: `${key}-${mark}` };
  }
  return o;
}

export function browser(opt = {}) {
  const o = { mode: "file", doc: {}, ...opt };
  const ls = new Map(Object.entries(o.storage || {}));
  const out = { puts: [], gets: [], beacons: [], status: [], external: [], downloads: [], timers: [], attempts: 0 };
  let fail = o.fail || null; // "network" | 409 | a status number
  let beaconRefuses = false;
  let served = { ...o.doc };

  const el = () => ({ href: "", download: "", click() {}, remove() {}, appendChild() {} });

  const sb = {
    console: { log() {}, warn() {}, error() {} },
    Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean, RegExp, Error, Promise,
    setTimeout, clearTimeout,
    // The poll is driven by hand — a test that waits twenty seconds is a test
    // nobody runs.
    setInterval: (f) => { out.timers.push(f); return out.timers.length; },
    clearInterval() {},
    location: { protocol: o.mode === "preview" ? "file:" : "http:" },
    document: {
      hidden: false,
      addEventListener(n, f) { (this._on = this._on || {})[n] = f; },
      body: { appendChild() {} },
      createElement: () => { const e = el(); out.downloads.push(e); return e; },
    },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, v),
      removeItem: (k) => ls.delete(k),
    },
    navigator: {
      // A REAL BEACON SAYS NO. Every browser caps it around 64KB and returns
      // false when the payload is over — so a stand-in that always says yes
      // would hide the exact failure this path has.
      sendBeacon: (url, blob) => {
        out.beacons.push({ url, text: blob && blob.__text });
        return !beaconRefuses;
      },
    },
    Blob: class { constructor(parts) { this.__text = (parts || []).join(""); } },
    URL: { createObjectURL: (b) => { out.blobs = (out.blobs || []).concat([b && b.__text]); return "blob:x"; },
      revokeObjectURL() {} },
    FileReader: class {
      readAsText(file) {
        setTimeout(() => {
          if (file && file.__broken) { if (this.onerror) this.onerror(); return; }
          this.result = file && file.__text;
          if (this.onload) this.onload();
        }, 0);
      }
    },
    fetch: async (url, init) => {
      // Pointed at a real server when there is one, so the last section can ask
      // the only question that finally matters: is it on the disk.
      if (o.base) {
        if (init && init.method === "PUT") out.puts.push(JSON.parse(init.body));
        else out.gets.push(String(url));
        return globalThis.fetch(o.base + url, init);
      }
      if (init && init.method === "PUT") {
        // Counted BEFORE it can fail: "did it keep trying" is a question about
        // attempts, and an attempt that never arrived is still an attempt.
        out.attempts++;
        if (fail === "network") throw new Error("offline");
        out.puts.push(JSON.parse(init.body));
        if (fail === 409) {
          return { ok: false, status: 409, json: async () => ({ data: { ...served, savedAt: "theirs" } }) };
        }
        if (typeof fail === "number") {
          return { ok: false, status: fail, json: async () => ({ message: o.says || "" }) };
        }
        served = { ...served, ...JSON.parse(init.body) };
        served.savedAt = "saved-" + out.puts.length;
        return { ok: true, status: 200, json: async () => ({ savedAt: served.savedAt }) };
      }
      out.gets.push(String(url));
      if (fail === "network") throw new Error("offline");
      if (String(url).includes("data-version")) {
        return { ok: true, status: 200, json: async () => ({ savedAt: served.savedAt || null }) };
      }
      return { ok: true, status: 200, json: async () => served };
    },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);

  const S = sb.OrganiserStore;
  S.onStatus((s) => out.status.push(s));
  S.onExternalChange((s) => out.external.push(s));

  return {
    S, out, ls,
    // What the fake file currently holds.
    file: () => served,
    setFile: (d) => { served = { ...d }; },
    breakWith: (how) => { fail = how; },
    // The payload is over what a beacon will carry.
    refuseBeacon: (v = true) => { beaconRefuses = v; },
    heal: () => { fail = null; },
    hide: (v) => { sb.document.hidden = v; },
    // Let the debounced save (500ms) and its retries actually happen.
    settle: (ms = 900) => new Promise((r) => setTimeout(r, ms)),
    poll: () => Promise.all(out.timers.map((f) => f())),
    lastPut: () => out.puts[out.puts.length - 1] || null,
    lastStatus: () => out.status[out.status.length - 1] || null,
    stored: (k) => { try { return JSON.parse(ls.get(k)); } catch { return undefined; } },
  };
}
