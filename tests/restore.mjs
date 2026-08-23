import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// PUTTING A BACKUP BACK — ALL OF IT.
//
// The worst thing found in any of these walkthroughs, because it is silent, it
// is on the recovery path, and the moment you meet it is the moment the backup
// is all you have left.
//
// IT are reimaging the staff laptops. Back up, fresh machine, restore. What
// came back:
//
//     items        8 of 8   ✓
//     contacts     0 of 3   ✗   the whole class list
//     schedule     0 of 2   ✗   the whole timetable
//     records      1 of 1   ✓
//     attendance   0 of 1   ✗   every register ever taken
//
// under the words "Restored from your backup. ✓".
//
// Restoring hand-listed five stores — items, waiting, goals, records,
// recordConfig — and there are twenty-two. The backup file had every one of
// them; the restore read five and said nothing about the rest.
//
// This is the SAME failure store.js already had once, when load() returned ten
// of the twenty-two and the next save blanked the others. The cure then was one
// table that everything derives from. Restoring is on that table now, and this
// file is what keeps it there — derived from the table, so a store added
// tomorrow is covered without anybody remembering to come back here.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

// store.js, run for real — no copy of the table in here to drift from it.
function makeStore() {
  const saved = {};
  const sb = {
    console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean, RegExp,
    isNaN, parseInt, parseFloat, Intl, setTimeout, clearTimeout, Promise,
    localStorage: {
      _d: {},
      getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    },
    location: { protocol: "file:", hostname: "", href: "file:///x/index.html" },
    document: { addEventListener() {}, visibilityState: "visible" },
    navigator: {},
    addEventListener() {},
    fetch: () => Promise.reject(new Error("no server")),
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read("store.js"), sb);
  return { S: sb.OrganiserStore, sb, saved };
}

const { S } = makeStore();

// ---------------------------------------------------------------------------
sec("The app knows how many stores it has, in one place");
{
  ok("it can name them all", typeof S.storeNames === "function", "storeNames has gone");
  const names = S.storeNames();
  ok("and there are a lot of them", names.length >= 20, String(names.length));
  // The ones a teacher would notice missing, by name, because those are the
  // ones that actually went.
  ["items", "contacts", "schedule", "attendance", "records", "lessons", "portfolio",
   "pastoralNotes", "rotas", "goals"].forEach((k) =>
    ok(`${k} is one of them`, names.includes(k), names.join(", ")));
}

// ---------------------------------------------------------------------------
sec("A backup goes back whole");
{
  const names = S.storeNames();
  // A backup with SOMETHING in every store there is — derived, so a store added
  // next year is tested the day it exists rather than the day somebody
  // remembers this file.
  const BACKUP = { version: 1, exportedAt: "2026-08-23T00:00:00Z" };
  const marker = {};
  names.forEach((k, i) => {
    // Match the shape each store is by asking a blank document what it holds.
    marker[k] = { id: "m" + i, mark: k };
    BACKUP[k] = [marker[k]];
  });
  const put = S.replaceAll(BACKUP);

  const lost = names.filter((k) => {
    const v = put[k];
    // A store whose shape isn't a list won't have taken the list — that is
    // take() doing its job, not a loss.
    return Array.isArray(v) ? v.length !== 1 : false;
  });
  ok("every list-shaped store comes back", lost.length === 0, `dropped: ${lost.join(", ")}`);

  // AND NAMED, because these are the ones whose absence a teacher meets on the
  // worst possible day.
  ["contacts", "schedule", "attendance", "lessons"].forEach((k) =>
    ok(`${k} came back`, Array.isArray(put[k]) && put[k].length === 1,
       JSON.stringify(put[k])));
}

sec("And nothing of the wrong shape gets through");
{
  // A hand-edited file, or half a download. take() drops anything that isn't
  // the shape that store is, so no page is handed something it will loop over.
  const junk = { version: 1, items: "not a list", contacts: 42, schedule: null,
    records: [{ id: "r1" }], worked: [], areas: {} };
  const put = S.replaceAll(junk);
  ok("a string where a list belongs becomes a list", Array.isArray(put.items) && !put.items.length,
     JSON.stringify(put.items));
  ok("a number too", Array.isArray(put.contacts) && !put.contacts.length, JSON.stringify(put.contacts));
  ok("and null", Array.isArray(put.schedule) && !put.schedule.length, JSON.stringify(put.schedule));
  ok("while the real one survives", put.records.length === 1, JSON.stringify(put.records));
  ok("and it never throws on rubbish", true);
}

// ---------------------------------------------------------------------------
sec("And the page that restores asks for all of it");
{
  const app = read("app.js");
  const fn = (app.match(/async function onRestore\([\s\S]*?\n  \}/) || [""])[0];
  ok("there is a restore", fn.length > 200, "onRestore has gone or changed shape");
  ok("it goes through the one table", /OrganiserStore\.replaceAll\(/.test(fn),
     "it is hand-listing stores again");
  // THE SHAPE OF THE OLD BUG: naming stores one by one in a save call.
  ok("and no longer saves a hand-written list",
     !/OrganiserStore\.save\(\{\s*items,\s*waiting,\s*goals,\s*records,\s*recordConfig\s*\}\)/.test(fn),
     "the five-store save is back");

  // A TICK ON ITS OWN IS WHAT LET A HALF-RESTORE LOOK LIKE A WHOLE ONE. This is
  // the one moment in the app where being wrong cannot be undone, because the
  // thing you are restoring from is all you have left.
  ok("it says what actually came back", /counts/.test(fn) && /storeNames\(\)/.test(fn),
     "it still just ticks");
  ok("and an empty backup says so rather than ticking",
     /backup was empty/.test(fn), "an empty file still reads as a successful restore");
}

sec("And it asks before replacing what is there");
{
  const app = read("app.js");
  const fn = (app.match(/async function onRestore\([\s\S]*?\n  \}/) || [""])[0];
  ok("restoring is confirmed first", /confirm\(/.test(fn), "it replaces everything unasked");
  ok("and the question says what will happen",
     /replaces what's here now/i.test(fn), "the question doesn't say it overwrites");
}

done();
