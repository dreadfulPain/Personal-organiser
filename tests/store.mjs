import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// SAVING. The only part of this app whose mistakes are permanent.
//
// store.js had never been run by a test. Every page test swaps it for a stub
// that hands the data straight back, and the round-trip test talks to the
// server with its own fetch. The file that decides what survives was the one
// file nothing ever asked a question of — and the checks that looked like they
// covered it were reading its SOURCE for the right words, not running it.
//
// What that hid: load() handed a page ten of the twenty-two stores. The other
// twelve — the register, pastoral notes, what you'd told whom, minutes worked,
// your areas, what you'd tried, every lesson plan, the rotas, the syllabus —
// came back as nothing, and the next save wrote that nothing over your file.
// No error, no warning, nothing on screen out of place. Half the app quietly
// emptying itself.
//
// So this runs the real thing, in the smallest browser it will live in, and
// asks the questions that would have caught it:
//
//   · does everything you put in come back out
//   · does saving one thing leave the rest alone
//   · when the save doesn't get through, does it keep trying and then SAY SO
//   · when another computer changed the file first, is your edit kept
//   · is a backup complete, and does a restore refuse what isn't one

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
import { browser, STORES, fullDoc } from "./_store.mjs";
import { open } from "./_dom.mjs";
import { DATA as PAGE_DATA } from "./_data.mjs";
const { ok, done, sec } = checker();

const KEYS = STORES.map((s) => s.key);
// The key this browser keeps each store under, derived alongside the name so
// neither is guessed here.
const LS = Object.fromEntries(STORES.map((s) => [s.key, s.ls]));
const asStorage = (doc) => Object.fromEntries(STORES.map((s) => [s.ls, JSON.stringify(doc[s.key])]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Which stores came back differently from how they went in — named, because
// "something was lost" is not a thing you can act on.
const lost = (got, want, except = []) =>
  KEYS.filter((k) => !except.includes(k) && !same((got || {})[k], want[k]));

// ---------------------------------------------------------------------------
sec(`Everything you put in comes back out (${KEYS.length} stores)`);
{
  const want = fullDoc();
  const b = browser({ doc: { ...want, savedAt: "v1" } });
  const data = await b.S.load();
  const missing = KEYS.filter((k) => !(k in data));
  ok("nothing is missing from what the page is handed", missing.length === 0,
     `never came back: ${missing.join(", ")}`);
  ok("and every one of them is what was in the file", lost(data, want).length === 0,
     `came back changed: ${lost(data, want).join(", ")}`);
  ok("the page is told where it is saving", data.mode === "file", data.mode);
}

// ---------------------------------------------------------------------------
sec("Saving one thing never blanks another");
{
  const want = fullDoc();
  const b = browser({ doc: { ...want, savedAt: "v1" } });
  await b.S.load();
  // A page that owns tasks saves tasks. It says nothing about the register, and
  // saying nothing must never be read as "delete it".
  b.S.save({ items: [{ id: "just-this" }] });
  await b.settle();
  const put = b.lastPut();
  ok("the save actually went out", !!put, "nothing was sent");
  ok("and it still carries every other store",
     lost(put, want, ["items"]).length === 0,
     `wiped on the way out: ${lost(put, want, ["items"]).join(", ")}`);
  ok("with the one you did save changed", put && put.items[0].id === "just-this");
  // The version we loaded rides along, so the server can tell a first save from
  // one stacked on somebody else's.
  ok("and says which version it was working from", put && put.baseSavedAt === "v1", String(put && put.baseSavedAt));
}

// ---------------------------------------------------------------------------
sec("The copy kept in this browser");
{
  const want = fullDoc();
  const b = browser({ doc: { ...want, savedAt: "v1" } });
  await b.S.load();
  const blanked = KEYS.filter((k) => !same(b.stored(LS[k]), want[k]));
  ok("the emergency copy holds every store too", blanked.length === 0,
     `mirrored as blank: ${blanked.join(", ")}`);

  // AND IT MUST NOT BE WIPED WHEN THE FILE CAN'T BE REACHED. That is the exact
  // moment this copy is the only one left — mirroring "nothing" over it would
  // destroy the last surviving copy at the worst possible time.
  const off = browser({ doc: {}, storage: asStorage(want), fail: "network" });
  await off.S.load();
  const gone = KEYS.filter((k) => !same(off.stored(LS[k]), want[k]));
  ok("and a server that won't answer doesn't cost you the copy you had",
     gone.length === 0, `lost while offline: ${gone.join(", ")}`);
}

// ---------------------------------------------------------------------------
sec("Opened by double-clicking, with no server at all");
{
  const want = fullDoc();
  const b = browser({ mode: "preview", storage: asStorage(want) });
  const data = await b.S.load();
  ok("every store is still read", lost(data, want).length === 0, lost(data, want).join(", "));
  ok("and you are told it isn't your file", data.mode === "preview", data.mode);
  ok("the status says so as well", b.lastStatus() && b.lastStatus().state === "preview",
     JSON.stringify(b.lastStatus()));

  b.S.save({ items: [{ id: "new" }] });
  await b.settle(50);
  const after = KEYS.filter((k) => k !== "items" && !same(b.stored(LS[k]), want[k]));
  ok("and saving here keeps the rest as well", after.length === 0, `wiped: ${after.join(", ")}`);
  ok("nothing was sent to a server that isn't there", b.out.puts.length === 0, String(b.out.puts.length));
}

// ---------------------------------------------------------------------------
sec("Bringing across what you had before");
{
  // Somebody used it by double-clicking, then started the server properly. The
  // file is empty and the browser isn't — so what's in the browser is the real
  // data, and it must come across rather than be overwritten by the empty file.
  const want = fullDoc();
  const b = browser({ doc: {}, storage: asStorage(want) });
  const data = await b.S.load();
  ok("it says what it did, in a sentence", /brought/i.test(data.migratedNote || ""), data.migratedNote);
  ok("and every store came across", lost(data, want).length === 0, lost(data, want).join(", "));
  ok("and it was written to the file straight away", b.out.puts.length === 1, String(b.out.puts.length));

  // THE CASE THE OLD CHECK MISSED. "Is there anything here" used to mean "any
  // tasks, waiting, goals or records" — so a browser holding only a term of
  // pastoral notes looked empty, and they were left behind.
  const onlyNotes = browser({
    doc: {},
    storage: { "organiser.pastoralnotes.v1": JSON.stringify([{ id: "n1" }]) },
  });
  const got = await onlyNotes.S.load();
  ok("even when what you had wasn't tasks", same(got.pastoralNotes, [{ id: "n1" }]),
     JSON.stringify(got.pastoralNotes));

  // And an empty browser with a full file must NOT trigger it — that would push
  // blanks over good data.
  const fine = browser({ doc: { ...want, savedAt: "v1" } });
  const f = await fine.S.load();
  ok("and a file with data in it is never treated as empty", !f.migratedNote, f.migratedNote);
  ok("so nothing is written over it on the way in", fine.out.puts.length === 0, String(fine.out.puts.length));
}

// ---------------------------------------------------------------------------
sec("When the save doesn't get through");
{
  const b = browser({ doc: { savedAt: "v1" }, fail: "network" });
  await b.S.load();
  b.S.save({ items: [{ id: "x" }] });
  await b.settle(600);
  ok("it says it is saving, not that it saved",
     b.lastStatus().state === "saving", JSON.stringify(b.lastStatus()));
  // IT MUST END UP SAYING SO. A spinner that never resolves is how you find out
  // three weeks later, from the file, that nothing was ever written.
  await b.settle(11000);
  ok("and after trying and failing, it SAYS so rather than spinning for ever",
     b.lastStatus().state === "error", JSON.stringify(b.lastStatus()));
  ok("having genuinely tried more than once", b.out.attempts >= 4, String(b.out.attempts));

  // And nothing was thrown away while it was failing.
  b.heal();
  b.S.save({ waiting: [{ id: "w" }] });
  await b.settle();
  const put = b.lastPut();
  ok("what you typed while it was down is still there when it comes back",
     put && put.items && put.items[0] && put.items[0].id === "x", JSON.stringify(put && put.items));
  ok("and it says saved once it is", b.lastStatus().state === "saved", JSON.stringify(b.lastStatus()));
}

// ---------------------------------------------------------------------------
sec("Getting it out before the page goes");
{
  // A save waits half a second in case you type again. A reload doesn't wait.
  const b = browser({ doc: { savedAt: "v1" } });
  await b.S.load();
  b.S.save({ items: [{ id: "typed" }] });
  ok("nothing has gone out yet", b.out.puts.length === 0, String(b.out.puts.length));
  await b.S.flush();
  ok("flushing sends it straight away", b.out.puts.length === 1, String(b.out.puts.length));
  ok("and waits until it is actually saved",
     b.lastStatus().state === "saved", JSON.stringify(b.lastStatus()));
  await b.S.flush();
  ok("flushing again with nothing to save sends nothing", b.out.puts.length === 1, String(b.out.puts.length));

  // Closing the tab: a normal request can be cut off, so this one goes by beacon.
  const c = browser({ doc: { ...fullDoc(), savedAt: "v1" } });
  await c.S.load();
  c.S.flushBeacon();
  ok("with nothing unsaved, closing the tab sends nothing", c.out.beacons.length === 0,
     String(c.out.beacons.length));
  c.S.save({ items: [{ id: "unsaved" }] });
  c.S.flushBeacon();
  ok("with something unsaved, it goes out as you close", c.out.beacons.length === 1,
     String(c.out.beacons.length));
  const sent = JSON.parse(c.out.beacons[0].text || "{}");
  // ONLY WHAT CHANGED, and that is not a shortcut — a beacon is capped around
  // 64KB in every browser and returns false above it. Sending the whole state
  // meant the save that happens as you close the page was the one most likely
  // to be refused, and it was refused silently.
  ok("carrying the store you changed", same(sent.items, [{ id: "unsaved" }]), JSON.stringify(sent.items));
  ok("and not the twenty-one you didn't", !("attendance" in sent), Object.keys(sent).join(", "));
  ok("but still saying which version it was working from", sent.baseSavedAt === "v1", String(sent.baseSavedAt));
  // Leaving a store out means "not talking about this one", which the server
  // keeps — so this is smaller AND exactly what a partial save means.
  ok("which is what the server reads as leave-that-one-alone",
     Object.keys(sent).every((k) => k === "baseSavedAt" || KEYS.includes(k)), Object.keys(sent).join(", "));

  // AND IF IT IS STILL TOO BIG, IT MUST NOT SAY IT SAVED.
  const d = browser({ doc: { savedAt: "v1" } });
  await d.S.load();
  d.refuseBeacon();
  d.S.save({ items: [{ id: "big" }] });
  d.S.flushBeacon();
  ok("a beacon that was refused is not treated as saved", d.out.beacons.length === 1);
  d.refuseBeacon(false);
  d.S.flushBeacon();
  ok("so it is still there to send the next time there's a chance",
     d.out.beacons.length === 2, String(d.out.beacons.length));
}

// ---------------------------------------------------------------------------
sec("When the server says no, and says why");
{
  // A refusal with a reason is not worth repeating. Sending the same rejected
  // save four more times changes nothing, takes ten seconds, and buries the one
  // sentence that says what actually happened.
  const b = browser({ doc: { savedAt: "v1" }, fail: 413, says: "That save is 70.2MB, past the 64.0MB limit." });
  await b.S.load();
  b.S.save({ items: [{ id: "enormous" }] });
  await b.settle(2200);
  ok("it stops rather than trying the same thing five times", b.out.attempts === 1, String(b.out.attempts));
  ok("and passes on what the server said", /past the/.test((b.lastStatus() || {}).note || ""),
     JSON.stringify(b.lastStatus()));
  ok("as an error, not as saved", b.lastStatus().state === "error", JSON.stringify(b.lastStatus()));

  // A server that is merely down IS worth trying again — the difference matters.
  const c = browser({ doc: { savedAt: "v1" }, fail: 500 });
  await c.S.load();
  c.S.save({ items: [{ id: "x" }] });
  await c.settle(2200);
  ok("but something that might come back is tried again", c.out.attempts > 1, String(c.out.attempts));
}

// ---------------------------------------------------------------------------
sec("Changed on another computer");
{
  // The folder can live in OneDrive. Another machine writes the file while this
  // page is open; the page should quietly catch up rather than sit on a stale
  // copy and then overwrite it.
  const mine = fullDoc("mine");
  const theirs = fullDoc("theirs");
  const b = browser({ doc: { ...mine, savedAt: "v1" } });
  await b.S.load();
  b.setFile({ ...theirs, savedAt: "v2" });
  await b.poll();
  ok("the newer version is pulled in", b.out.external.length === 1, String(b.out.external.length));
  ok("with every store, not a tenth of them",
     lost(b.out.external[0], theirs).length === 0, lost(b.out.external[0], theirs).join(", "));
  ok("and it says where it came from", /another device/i.test((b.lastStatus() || {}).note || ""),
     JSON.stringify(b.lastStatus()));

  // NOT WHILE YOU ARE MID-SENTENCE. Pulling their version in over an unsaved
  // edit would take words off the screen as they were being typed.
  const c = browser({ doc: { ...mine, savedAt: "v1" }, fail: "network" });
  await c.S.load();
  c.S.save({ items: [{ id: "still typing" }] });
  c.heal();
  c.setFile({ ...theirs, savedAt: "v2" });
  await c.poll();
  ok("but never over something you haven't saved yet", c.out.external.length === 0,
     String(c.out.external.length));
}

// ---------------------------------------------------------------------------
sec("When you both saved at once");
{
  const theirs = fullDoc("theirs");
  const b = browser({ doc: { ...fullDoc("mine"), savedAt: "v1" } });
  await b.S.load();
  b.setFile({ ...theirs, savedAt: "v2" });
  b.breakWith(409);
  b.S.save({ items: [{ id: "mine" }] });
  await b.settle();
  ok("you are told, in words you can act on",
     /another device/i.test((b.lastStatus() || {}).note || ""), JSON.stringify(b.lastStatus()));
  ok("and told where your version was kept",
     /backup/i.test((b.lastStatus() || {}).note || ""), JSON.stringify(b.lastStatus()));
  ok("their version is taken up whole", lost(b.out.external[0] || {}, theirs).length === 0,
     lost(b.out.external[0] || {}, theirs).join(", "));

  // AND YOU MUST NOT BE LOCKED OUT. If the version we're working from didn't
  // move on, every save from here would hit the same conflict for ever.
  b.heal();
  b.S.save({ items: [{ id: "after" }] });
  await b.settle();
  ok("and the next save goes through rather than conflicting for ever",
     b.lastStatus().state === "saved", JSON.stringify(b.lastStatus()));
  ok("from their version, not the stale one we had",
     (b.lastPut() || {}).baseSavedAt === "theirs", String((b.lastPut() || {}).baseSavedAt));
}

// ---------------------------------------------------------------------------
sec("More than one thing can be told");
{
  // This held ONE callback, so a second listener silently replaced the first —
  // and the thing it would have replaced is whatever tells you a save failed.
  const b = browser({ doc: { savedAt: "v1" }, fail: 413, says: "That is too big." });
  const heard = [[], []];
  b.S.onStatus((s) => heard[0].push(s.state));
  b.S.onStatus((s) => heard[1].push(s.state));
  await b.S.load();
  b.S.save({ items: [{ id: "x" }] });
  await b.settle(1200);
  ok("the first thing to ask is still told", heard[0].includes("error"), JSON.stringify(heard[0]));
  ok("and so is the second", heard[1].includes("error"), JSON.stringify(heard[1]));

  // AND ONE OF THEM FALLING OVER MUST NOT SILENCE THE OTHERS.
  const c = browser({ doc: { savedAt: "v1" } });
  const after = [];
  c.S.onStatus(() => { throw new Error("this listener is broken"); });
  c.S.onStatus((s) => after.push(s.state));
  await c.S.load();
  ok("a broken listener doesn't stop the next one hearing", after.length > 0, JSON.stringify(after));
}

// ---------------------------------------------------------------------------
sec("A backup you could actually restore from");
{
  const want = fullDoc();
  const b = browser({ doc: { ...want, savedAt: "v1" } });
  await b.S.load();
  b.S.exportNow();
  const doc = JSON.parse((b.out.blobs || [])[0] || "{}");
  // A BACKUP MISSING HALF THE APP IS WORSE THAN NO BACKUP, because you will
  // restore from it believing you have everything.
  ok("it holds every store", lost(doc, want).length === 0, `not in the backup: ${lost(doc, want).join(", ")}`);
  ok("and says when it was taken", !!doc.exportedAt, JSON.stringify(doc).slice(0, 80));
  const a = b.out.downloads[b.out.downloads.length - 1];
  ok("with a filename that tells you which day it is",
     /^organiser-backup-\d{4}-\d{2}-\d{2}\.json$/.test(a.download), a.download);
}

sec("And a restore that refuses what isn't one");
{
  const b = browser({ doc: {} });
  const want = fullDoc();
  const got = await b.S.importFile({ __text: JSON.stringify({ version: 1, ...want }) });
  ok("a real backup comes back whole", lost(got, want).length === 0, lost(got, want).join(", "));

  // A backup from before a store existed. The missing one becomes empty — never
  // undefined, which a page would read as something to loop over.
  const older = await b.S.importFile({ __text: JSON.stringify({ items: [{ id: "a" }] }) });
  ok("an older backup still restores what it has", same(older.items, [{ id: "a" }]), JSON.stringify(older.items));
  ok("and what it hasn't got comes back as nothing, not as missing",
     KEYS.every((k) => k in older), KEYS.filter((k) => !(k in older)).join(", "));

  const say = async (file) => {
    try { await b.S.importFile(file); return null; } catch (e) { return e.message; }
  };
  ok("something that isn't a backup at all is refused in a sentence",
     /doesn't look like/i.test(await say({ __text: "not json at all" })), await say({ __text: "not json" }));
  // THE DANGEROUS ONE. Valid JSON with none of our stores in it would restore
  // perfectly cleanly as an empty app, over everything you had.
  ok("and so is a perfectly good file that simply isn't ours",
     /doesn't look like/i.test(await say({ __text: '{"shopping":["milk"]}' })),
     String(await say({ __text: '{"shopping":["milk"]}' })));
  ok("a list rather than a document is refused too",
     !!(await say({ __text: "[1,2,3]" })), String(await say({ __text: "[1,2,3]" })));
  ok("and a file that won't read says that instead",
     /couldn't read/i.test(await say({ __broken: true })), String(await say({ __broken: true })));
}

// ---------------------------------------------------------------------------
sec("And every page that writes anything down can say when it didn't");
{
  // Fifteen of the sixteen pages that save had no way to tell you a save had
  // failed. You would take a register, the write would fail, and the page would
  // look exactly as it looks when it worked. The store knew and said so; on
  // every page but the home one, nothing was listening.
  const pages = fs.readdirSync(path.join(REPO_ROOT, "public"))
    .filter((f) => f.endsWith(".html"))
    .filter((f) => /<script src="store\.js"/.test(fs.readFileSync(path.join(REPO_ROOT, "public", f), "utf8")))
    .sort();
  ok("there are pages that save", pages.length >= 15, String(pages.length));

  const words = (r) => r.created.concat([...r.byId.values()])
    .map((e) => String(e.textContent || "") + String(e.innerHTML || "")).join(" ");

  for (const p of pages) {
    const r = await open(p, PAGE_DATA);
    ok(`${p} is listening for whether its saves worked`, r.statusCbs.length > 0,
       "nothing on this page ever hears that a save failed");
    const before = words(r);
    r.tellStatus({ mode: "file", state: "error", note: "That is 70.2MB, past the 64.0MB limit." });
    await r.settle();
    const after = words(r);
    // IT HAS TO REACH THE SCREEN. A listener that quietly notes the failure and
    // draws nothing is the same page it was before.
    ok(`${p} puts it on screen`, after.length > before.length && /past the/.test(after),
       `nothing appeared: ${after.slice(0, 80)}`);
    // And it goes away again when a save gets through, so it can't sit there
    // frightening you about something that has already been fixed.
    r.tellStatus({ mode: "file", state: "saved", at: Date.now() });
    await r.settle();
    const done = words(r);
    ok(`${p} takes it back down once a save works`, !/past the/.test(done), done.slice(0, 100));
  }
}

// ---------------------------------------------------------------------------
sec("Through the real server, onto the real disk");
{
  const DATA = path.join(REPO_ROOT, "data");
  const FILE = path.join(DATA, "organiser-data.json");
  const BACKUPS = path.join(DATA, "backups");
  // Never destroy what was already there — somebody runs the tests on the
  // machine they use the app on.
  const aside = FILE + ".test-aside";
  const had = fs.existsSync(FILE);
  if (had) fs.renameSync(FILE, aside);
  const backupsBefore = fs.existsSync(BACKUPS) ? new Set(fs.readdirSync(BACKUPS)) : new Set();

  const port = 3970;
  const base = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_OPEN: "1", PORT: String(port), AI_ENGINE: "", AI_BASE_URL: "" },
    stdio: "ignore",
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${base}/api/data`); break; } catch { await wait(150); }
    }

    const want = fullDoc();
    const first = browser({ mode: "file", base });
    await first.S.load();
    first.S.save(want);
    await first.settle();
    ok("a full save goes through", first.lastStatus().state === "saved", JSON.stringify(first.lastStatus()));

    // A FRESH PAGE, a fresh store, reading the file off the disk. This is the
    // question: shut the laptop, open it tomorrow, is it all still there.
    const second = browser({ mode: "file", base });
    const back = await second.S.load();
    ok("and tomorrow it is all still there", lost(back, want).length === 0,
       `did not survive the disk: ${lost(back, want).join(", ")}`);

    // One page saving its own part, all the way to the file and back.
    second.S.save({ items: [{ id: "only-this" }] });
    await second.settle();
    const third = browser({ mode: "file", base });
    const after = await third.S.load();
    ok("saving one page's part leaves every other store on disk alone",
       lost(after, want, ["items"]).length === 0,
       `lost on disk: ${lost(after, want, ["items"]).join(", ")}`);
    ok("and the part you saved is the one that changed",
       after.items.length === 1 && after.items[0].id === "only-this", JSON.stringify(after.items));

    // The safety copies, which nothing had ever looked for.
    ok("the version before this one is kept", fs.existsSync(path.join(BACKUPS, "previous.json")),
       "no previous.json");
    const daily = fs.readdirSync(BACKUPS).filter((f) => /^organiser-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    ok("and one copy of today, to go back to", daily.length >= 1, fs.readdirSync(BACKUPS).join(", "));

    // A HALF-WRITTEN FILE. A crash, a sync, a full disk. The app must come back
    // with yesterday's data rather than with nothing — coming back empty looks
    // exactly like having lost it all, and is what you'd then save over.
    fs.writeFileSync(FILE, '{"items": [{"id": "cut off in the mi');
    const hurt = browser({ mode: "file", base });
    const rescued = await hurt.S.load();
    ok("a half-written file comes back as the last good one, not as nothing",
       rescued.items.length > 0 || KEYS.some((k) => (rescued[k] || []).length),
       JSON.stringify(rescued).slice(0, 120));

    // A FILE THAT SIMPLY GREW. Years of records, lesson plans and registers add
    // up; the day the document crosses a limit must not be the day saving
    // quietly stops working.
    {
      const heavy = { records: Array.from({ length: 12000 }, (_, i) =>
        ({ id: "r" + i, who: "p1", topic: "Reading", level: "3", date: "2026-01-01",
           detail: "x".repeat(700), summary: "a note about how the reading went" })) };
      const mbs = (JSON.stringify(heavy).length / 1048576).toFixed(1);
      const r = await fetch(`${base}/api/data`, { method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(heavy) })
        .catch((e) => ({ status: 0, why: e.message }));
      ok(`a ${mbs}MB save — far more than any paste — still goes through`, r.status === 200,
         `${r.status} ${r.why || ""}`);
      const kept = await (await fetch(`${base}/api/data`)).json();
      ok("and all of it is there", kept.records.length === 12000, String(kept.records.length));
    }

    // PAST THE LIMIT IT MUST ANSWER, IN WORDS. It used to destroy the connection
    // instead, so the browser got nothing at all: the save failed with no status
    // and no reason, and the app said "couldn't save, will keep trying" while
    // sending you off to check a window that was open the whole time.
    //
    // Asked at the ordinary limit rather than the data one, because it is the
    // same code and nine megabytes is a test that finishes.
    {
      const big = JSON.stringify({ text: "x".repeat(9 * 1024 * 1024) });
      const r = await Promise.race([
        fetch(`${base}/api/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: big })
          .catch((e) => ({ status: 0, why: e.message })),
        new Promise((res) => setTimeout(() => res({ status: -1, why: "no answer at all" }), 20000)),
      ]);
      ok("something too big is answered rather than dropped", r.status > 0, String(r.why));
      ok("with a status that says what it is", r.status === 413, String(r.status));
      const said = r.json ? await r.json().catch(() => ({})) : {};
      ok("and a sentence naming the size and the limit",
         /past the .*limit/i.test(said.message || ""), JSON.stringify(said));
      ok("and it says your file was left alone", /as it was|unchanged/i.test(said.message || ""),
         JSON.stringify(said));
      // AND THE DATA DOOR HAS A BIGGER LIMIT THAN THAT. The same nine megabytes
      // that is far too much to paste in is an ordinary size for a file that has
      // been filling up for two years.
      const still = await (await fetch(`${base}/api/data`)).json();
      ok("while the file that grew to that size saved perfectly well",
         still.records.length === 12000, String(still.records.length));
    }

    // Back to something small before the two-machine test below.
    await fetch(`${base}/api/data`, { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: [] }) });

    // TWO MACHINES, ONE FOLDER. Both loaded the same version; both save.
    const a = browser({ mode: "file", base });
    await a.S.load();
    const bb = browser({ mode: "file", base });
    await bb.S.load();
    a.S.save({ items: [{ id: "from-machine-a" }] });
    await a.settle();
    bb.S.save({ items: [{ id: "from-machine-b" }] });
    await bb.settle();
    ok("the second machine is told rather than silently losing its edit",
       bb.lastStatus().state === "conflict", JSON.stringify(bb.lastStatus()));
    const made = fs.readdirSync(BACKUPS).filter((f) => f.startsWith("conflict-") && !backupsBefore.has(f));
    ok("and its edit is kept on disk", made.length >= 1, fs.readdirSync(BACKUPS).join(", "));
    if (made.length) {
      const kept = JSON.parse(fs.readFileSync(path.join(BACKUPS, made[0]), "utf8"));
      ok("with the edit itself in it, not an empty shell",
         JSON.stringify(kept.items).includes("from-machine-b"), JSON.stringify(kept.items));
      ok("and everything else that machine held alongside it",
         KEYS.every((k) => k in kept), KEYS.filter((k) => !(k in kept)).join(", "));
    }
    // And it is not stuck: having caught up, it can save again.
    bb.S.save({ items: [{ id: "and-again" }] });
    await bb.settle();
    ok("and it can save again afterwards", bb.lastStatus().state === "saved", JSON.stringify(bb.lastStatus()));
  } finally {
    srv.kill();
    await wait(200);
    // Put the machine back as we found it.
    try {
      if (fs.existsSync(BACKUPS)) {
        fs.readdirSync(BACKUPS).filter((f) => !backupsBefore.has(f))
          .forEach((f) => { try { fs.unlinkSync(path.join(BACKUPS, f)); } catch { /* gone */ } });
      }
      if (had) { fs.rmSync(FILE, { force: true }); fs.renameSync(aside, FILE); }
      else fs.rmSync(FILE, { force: true });
    } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
sec("And running the tests doesn't cost you your own data");
{
  // Ten suites finish by deleting the app's data directory, because each was
  // written to tidy up after itself and the app has one place to put data. On
  // the machine somebody actually uses the organiser on — one person, one
  // laptop, the ordinary case — that is their timetable and their class lists.
  // It happened here mid-session to a real set-up week.
  const runner = fs.readFileSync(path.join(REPO_ROOT, "tests", "run.mjs"), "utf8");
  ok("the runner puts your saved file somewhere safe before it starts",
     /renameSync\(LIVE, ASIDE\)/.test(runner), "nothing moves the live data file out of the way");
  ok("and puts it back afterwards", /renameSync\(ASIDE, LIVE\)/.test(runner), "nothing restores it");
  // AND NOT INSIDE data/, which is the directory the suites delete — a copy in
  // there goes with the thing it was protecting.
  const aside = (runner.match(/const ASIDE = ([^;]+);/) || [])[1] || "";
  ok("somewhere the suites don't delete", !/"data"/.test(aside), aside.trim());
  ok("it happens whatever else goes wrong", /process\.on\("exit"/.test(runner),
     "nothing restores it if a suite crashes the run");
}

done();
