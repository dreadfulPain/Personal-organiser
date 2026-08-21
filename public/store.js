// The storage layer — the one place that knows WHERE your data lives.
//
// The rest of the app just calls Store.load() / Store.save(); it never touches
// storage directly. That's the seam that lets us change where data is kept
// (single file now, synced-across-devices later) without rewriting the app.
//
// Two modes, picked automatically:
//   "file"    — opened via the local server (Start Organiser). Saves to a real
//               file on your disk that you own; the safe, trustworthy path.
//   "preview" — opened by double-clicking the page (file://). No server, so it
//               can only keep changes in this browser. Clearly flagged as not
//               saved to your file, so you're never silently bitten.
//
// save() MERGES: pages save only the part they own (items, or goals) and the
// rest is preserved — so the goals page can't wipe your tasks, or vice-versa.
//
// Written as a plain script (no modules) so it also works under file://.

(function () {
  "use strict";

  const SERVER = location.protocol === "http:" || location.protocol === "https:";

  // ---- THE LIST OF STORES, WRITTEN ONCE ------------------------------------
  //
  // Everything below works from this table and nothing else: loading, saving,
  // the emergency mirror, a backup, a restore, and pulling in a change made on
  // another computer. That is the whole point of it being a table.
  //
  // It used to be a hand-copied list in nine separate places, and twelve of the
  // twenty-two stores had been added to some of them and forgotten in the
  // others. Nothing failed. load() simply handed the page ten stores, the page
  // read the missing ones as "nothing there", and the next save wrote that
  // nothing back over the file. A register, a term of pastoral notes and every
  // lesson plan could go that way without a single error anywhere.
  //
  // Adding a store now means adding ONE line here.
  //   name in the app · the key this browser keeps it under · what "none" is
  const STORES = [
    ["items", "organiser.items.v1", []],
    ["waiting", "organiser.waiting.v1", []],
    ["goals", "organiser.goals.v1", []],
    ["records", "organiser.records.v1", []],
    ["recordConfig", "organiser.recordconfig.v1", null],
    ["portfolio", "organiser.portfolio.v1", null],
    ["contacts", "organiser.contacts.v1", []],
    ["contactConfig", "organiser.contactconfig.v1", null],
    ["schedule", "organiser.schedule.v1", []],
    ["scheduleConfig", "organiser.scheduleconfig.v1", null],
    // What you know about people besides their marks, and what you've told whom.
    // Ordinary storage — the "never leaves" promise is enforced where the data is
    // USED (no export path, no fetch), not by hiding it from the save file, which
    // would only mean losing it.
    ["pastoralTopics", "organiser.pastoraltopics.v1", []],
    ["pastoralNotes", "organiser.pastoralnotes.v1", []],
    ["toldLog", "organiser.told.v1", []],
    // Minutes actually worked, per day. The only record of WHEN effort went in —
    // without it there's no telling a chosen Sunday from a habit.
    ["worked", "organiser.worked.v1", {}],
    // The parts of your life, as YOU name them, with the words each has learned.
    ["areas", "organiser.areas.v1", []],
    // Per group: who has already had something planned with them in mind. The
    // counterweight to always serving the biggest group.
    ["targeted", "organiser.targeted.v1", {}],
    // What you tried, so "did anything move afterwards" has something to join to.
    ["tried", "organiser.tried.v1", []],
    // Lesson plans written elsewhere and pasted in, plus the headings yours use.
    ["lessons", "organiser.lessons.v1", []],
    ["lessonConfig", "organiser.lessonconfig.v1", null],
    // Going round a list, one at a time — and the targets you teach against.
    ["rotas", "organiser.rotas.v1", []],
    ["syllabus", "organiser.syllabus.v1", null],
    // Who was actually in the room — see attend.js on why that matters twice.
    ["attendance", "organiser.attendance.v1", []],
  ];

  // A fresh copy of "nothing at all", every time — never the same array twice,
  // so one page's empty list can't turn into another's.
  const blankFor = (b) => (Array.isArray(b) ? [] : b && typeof b === "object" ? {} : null);
  function blank() {
    const o = {};
    STORES.forEach(([k, , b]) => { o[k] = blankFor(b); });
    return o;
  }

  // Keep a value only if it is the SHAPE that store is. Anything else becomes
  // "none" rather than being handed to a page that will try to loop over it.
  function keep(value, b) {
    if (Array.isArray(b)) return Array.isArray(value) ? value : [];
    const objish = value && typeof value === "object" && !Array.isArray(value);
    if (b && typeof b === "object") return objish ? value : {};
    return objish ? value : null;
  }

  // Take every store out of a document, whatever else it happens to carry.
  function take(d) {
    const o = {};
    const src = d || {};
    STORES.forEach(([k, , b]) => { o[k] = keep(src[k], b); });
    return o;
  }

  const hasAnything = (s) =>
    STORES.some(([k, , b]) => {
      const v = (s || {})[k];
      if (Array.isArray(b)) return Array.isArray(v) && v.length > 0;
      return !!v && (typeof v !== "object" || Object.keys(v).length > 0);
    });

  // MORE THAN ONE THING MAY WANT TO KNOW. This held a single callback, so the
  // second caller silently replaced the first — and what it replaced would have
  // been the thing telling you a save had failed.
  const statusCbs = [];
  let externalCb = null; // page refresh when the shared file changed elsewhere
  let saveTimer = null;
  let pollTimer = null;
  let dirty = false;
  // WHICH stores have changed since the last save that got through. Only the
  // beacon on the way out uses this, and it uses it because a beacon is capped
  // at about 64KB in every browser — the whole state passes that within a term,
  // so the one save that happens as you close the page was the one most likely
  // to be thrown away.
  const touched = new Set();
  let baseSavedAt = null; // the version we loaded — sent back to guard writes (shared folder)
  let lastState = blank();

  function emit(s) {
    statusCbs.forEach((cb) => {
      try {
        cb(s);
      } catch {
        /* one listener falling over must not stop the next being told */
      }
    });
  }

  function readLegacy() {
    const o = {};
    STORES.forEach(([k, ls, b]) => {
      try {
        const r = localStorage.getItem(ls);
        o[k] = r ? keep(JSON.parse(r), b) : blankFor(b);
      } catch {
        o[k] = blankFor(b);
      }
    });
    return o;
  }
  function writeLegacy(state) {
    try {
      STORES.forEach(([k, ls, b]) => {
        localStorage.setItem(ls, JSON.stringify(keep((state || {})[k], b)));
      });
    } catch {
      /* storage may be full or blocked; ignore */
    }
  }

  async function load() {
    if (!SERVER) {
      lastState = readLegacy();
      emit({ mode: "preview", state: "preview" });
      return { ...lastState, mode: "preview" };
    }

    let serverData = blank();
    let reachedFile = false;
    try {
      const r = await fetch("/api/data");
      if (r.ok) {
        const d = await r.json();
        serverData = take(d);
        baseSavedAt = d.savedAt || null; // the version we're now working from
        reachedFile = true;
      }
    } catch {
      /* fall through; we'll still mirror to localStorage below */
    }

    // Migration: if the owned file is empty but this browser has earlier preview
    // data, bring it in (and fix the old "double-click vs server are different
    // storage" gotcha).
    let migratedNote = "";
    const legacy = readLegacy();
    if (!hasAnything(serverData) && hasAnything(legacy)) {
      serverData = legacy;
      migratedNote = "Brought your earlier items into your saved data file.";
      try {
        await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serverData),
        });
      } catch {
        /* will be retried on next change */
      }
    }

    lastState = serverData;
    // ONLY MIRROR WHAT WE ACTUALLY READ. If the file couldn't be reached there
    // is nothing to mirror, and writing the blank state over this browser's copy
    // would destroy the one surviving copy at the exact moment it matters.
    if (reachedFile || migratedNote) writeLegacy(serverData);
    emit({ mode: "file", state: "saved", at: Date.now() });
    startPolling(); // watch the shared file for changes made on another computer
    return { ...serverData, mode: "file", migratedNote };
  }

  // ---- shared-folder awareness -------------------------------------------
  // When the app folder lives in OneDrive/Dropbox, another computer (or a sync)
  // can update the data file while this page is open. Poll the cheap version
  // stamp; when it moves and we've nothing unsaved, quietly pull the latest in.
  function startPolling() {
    if (!SERVER || pollTimer) return;
    pollTimer = setInterval(checkFresh, 20000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkFresh();
    });
  }
  async function checkFresh() {
    if (!SERVER || dirty || document.hidden) return; // don't yank away unsaved edits
    try {
      const r = await fetch("/api/data-version");
      if (!r.ok) return;
      const { savedAt } = await r.json();
      if (savedAt && savedAt !== baseSavedAt) await pullLatest("Updated from another device.");
    } catch {
      /* offline / server down — try again next tick */
    }
  }
  async function pullLatest(note) {
    try {
      const r = await fetch("/api/data");
      if (!r.ok) return;
      const d = await r.json();
      lastState = take(d);
      baseSavedAt = d.savedAt || null;
      writeLegacy(lastState);
      emit({ mode: "file", state: "saved", at: Date.now(), note });
      if (externalCb) externalCb(lastState);
    } catch {
      /* leave as-is */
    }
  }

  // Merge the given part(s) into the held state — keeps the keys you didn't pass.
  function save(part) {
    Object.keys(part || {}).forEach((k) => {
      if (STORES.some(([name]) => name === k)) touched.add(k);
    });
    lastState = { ...blank(), ...lastState, ...part };
    writeLegacy(lastState); // always keep the mirror current
    dirty = true;

    if (!SERVER) {
      emit({ mode: "preview", state: "preview" });
      return;
    }
    emit({ mode: "file", state: "saving" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => doSave(0), 500);
  }

  async function doSave(attempt) {
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lastState, baseSavedAt }),
      });
      if (r.status === 409) {
        // Another computer changed the shared file first. Our edit is safe in a
        // conflict copy on disk; pull in their latest so we're not stacking on a
        // stale base. (Rare for one person using one machine at a time.)
        dirty = false;
        const d = await r.json().catch(() => ({}));
        if (d.data) {
          lastState = take(d.data);
          baseSavedAt = d.data.savedAt || d.savedAt || baseSavedAt;
          writeLegacy(lastState);
          if (externalCb) externalCb(lastState);
        }
        emit({ mode: "file", state: "conflict", note: "Changed on another device — pulled in the latest (your edit was kept in data/backups)." });
        return;
      }
      if (!r.ok) {
        const said = await r.json().catch(() => ({}));
        const e = new Error("status " + r.status);
        // A REFUSAL WITH A REASON IS NOT WORTH REPEATING. Sending the same
        // too-big save four more times changes nothing, takes ten seconds, and
        // buries the one sentence that says what actually happened.
        e.said = said && said.message ? said.message : "";
        e.final = r.status >= 400 && r.status < 500;
        throw e;
      }
      const d = await r.json().catch(() => ({}));
      if (d.savedAt) baseSavedAt = d.savedAt;
      dirty = false;
      touched.clear();
      emit({ mode: "file", state: "saved", at: d.savedAt ? Date.parse(d.savedAt) : Date.now() });
    } catch (e) {
      const said = e && e.said ? e.said : "";
      if (!(e && e.final) && attempt < 4) {
        emit({ mode: "file", state: "saving" });
        setTimeout(() => doSave(attempt + 1), 1000 * (attempt + 1));
      } else {
        emit({ mode: "file", state: "error", note: said });
      }
    }
  }

  // Force any pending save out NOW and wait for it (used before a reload, so the
  // reload can never outrun the debounced write).
  async function flush() {
    clearTimeout(saveTimer);
    if (!SERVER || !dirty) return;
    await doSave(0);
  }

  // On the way out, flush any unsaved change with a beacon (survives the page
  // closing, where a normal fetch might be cut off).
  function flushBeacon() {
    if (!SERVER || !dirty) return;
    try {
      // Only the stores you actually changed. Leaving a store out means "I'm
      // not talking about this one" and it is kept as it is, so this is both
      // far smaller and exactly what a page saving its own part means.
      const part = { baseSavedAt };
      if (touched.size) touched.forEach((k) => { part[k] = lastState[k]; });
      else Object.assign(part, lastState);
      const blob = new Blob([JSON.stringify(part)], { type: "application/json" });
      // IT TELLS YOU WHETHER IT TOOK IT. Ignoring that was how a save could be
      // dropped and marked done in the same breath — and this is the save that
      // happens when there is no page left to try again on.
      if (navigator.sendBeacon("/api/data", blob)) {
        dirty = false;
        touched.clear();
      }
    } catch {
      /* best-effort */
    }
  }

  // Export the WHOLE owned state, so a backup is complete.
  function exportNow() {
    const doc = { version: 1, exportedAt: new Date().toISOString(), ...take(lastState) };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `organiser-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const d = JSON.parse(fr.result);
          // A BACKUP THAT ISN'T ONE MUST NOT COME BACK AS AN EMPTY APP. Valid
          // JSON with none of our stores in it — someone's shopping list, a
          // half-downloaded file — would otherwise restore cleanly as nothing
          // and overwrite everything you had.
          if (!d || typeof d !== "object" || Array.isArray(d) || !STORES.some(([k]) => k in d)) {
            reject(new Error("That file doesn't look like an organiser backup."));
            return;
          }
          resolve(take(d));
        } catch {
          reject(new Error("That file doesn't look like an organiser backup."));
        }
      };
      fr.onerror = () => reject(new Error("Couldn't read that file."));
      fr.readAsText(file);
    });
  }

  window.OrganiserStore = {
    load,
    save,
    flush,
    exportNow,
    importFile,
    flushBeacon,
    onStatus: (cb) => {
      if (typeof cb === "function") statusCbs.push(cb);
    },
    // Fires when the shared file changed on another computer and we pulled it in;
    // the page re-renders from the fresh state passed to the callback.
    onExternalChange: (cb) => {
      externalCb = cb;
    },
    get mode() {
      return SERVER ? "file" : "preview";
    },
  };
})();
