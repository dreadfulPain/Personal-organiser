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

  // Legacy / preview keys (also kept as an emergency mirror in file mode).
  const LS_ITEMS = "organiser.items.v1";
  const LS_WAITING = "organiser.waiting.v1";
  const LS_GOALS = "organiser.goals.v1";
  const LS_RECORDS = "organiser.records.v1";
  const LS_RECORDCONFIG = "organiser.recordconfig.v1";
  const LS_PORTFOLIO = "organiser.portfolio.v1";
  const LS_CONTACTS = "organiser.contacts.v1";
  const LS_CONTACTCONFIG = "organiser.contactconfig.v1";
  const LS_SCHEDULE = "organiser.schedule.v1";
  const LS_SCHEDULECONFIG = "organiser.scheduleconfig.v1";
  // What you know about people besides their marks, and what you've told whom.
  // Ordinary storage — the "never leaves" promise is enforced where the data is
  // USED (no export path, no fetch), not by hiding it from the save file, which
  // would only mean losing it.
  const LS_PASTORALTOPICS = "organiser.pastoraltopics.v1";
  const LS_PASTORALNOTES = "organiser.pastoralnotes.v1";
  const LS_TOLD = "organiser.told.v1";

  let statusCb = null;
  let externalCb = null; // page refresh when the shared file changed elsewhere
  let saveTimer = null;
  let pollTimer = null;
  let dirty = false;
  let baseSavedAt = null; // the version we loaded — sent back to guard writes (shared folder)
  let lastState = { items: [], waiting: [], goals: [], records: [], recordConfig: null, portfolio: null, contacts: [], contactConfig: null, schedule: [], scheduleConfig: null, pastoralTopics: [], pastoralNotes: [], toldLog: [] };

  function emit(s) {
    if (statusCb) statusCb(s);
  }

  function readLegacy() {
    function get(k, fallback) {
      try {
        const r = localStorage.getItem(k);
        return r ? JSON.parse(r) : fallback;
      } catch {
        return fallback;
      }
    }
    return {
      items: get(LS_ITEMS, []),
      waiting: get(LS_WAITING, []),
      goals: get(LS_GOALS, []),
      records: get(LS_RECORDS, []),
      recordConfig: get(LS_RECORDCONFIG, null),
      portfolio: get(LS_PORTFOLIO, null),
      contacts: get(LS_CONTACTS, []),
      contactConfig: get(LS_CONTACTCONFIG, null),
      schedule: get(LS_SCHEDULE, []),
      scheduleConfig: get(LS_SCHEDULECONFIG, null),
      pastoralTopics: get(LS_PASTORALTOPICS, []),
      pastoralNotes: get(LS_PASTORALNOTES, []),
      toldLog: get(LS_TOLD, []),
    };
  }
  function writeLegacy(state) {
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(state.items || []));
      localStorage.setItem(LS_WAITING, JSON.stringify(state.waiting || []));
      localStorage.setItem(LS_GOALS, JSON.stringify(state.goals || []));
      localStorage.setItem(LS_RECORDS, JSON.stringify(state.records || []));
      localStorage.setItem(LS_RECORDCONFIG, JSON.stringify(state.recordConfig || null));
      localStorage.setItem(LS_PORTFOLIO, JSON.stringify(state.portfolio || null));
      localStorage.setItem(LS_CONTACTS, JSON.stringify(state.contacts || []));
      localStorage.setItem(LS_CONTACTCONFIG, JSON.stringify(state.contactConfig || null));
      localStorage.setItem(LS_SCHEDULE, JSON.stringify(state.schedule || []));
      localStorage.setItem(LS_PASTORALTOPICS, JSON.stringify(state.pastoralTopics || []));
      localStorage.setItem(LS_PASTORALNOTES, JSON.stringify(state.pastoralNotes || []));
      localStorage.setItem(LS_TOLD, JSON.stringify(state.toldLog || []));
      localStorage.setItem(LS_SCHEDULECONFIG, JSON.stringify(state.scheduleConfig || null));
    } catch {
      /* storage may be full or blocked; ignore */
    }
  }

  async function load() {
    if (!SERVER) {
      const data = readLegacy();
      lastState = { items: data.items, waiting: data.waiting, goals: data.goals, records: data.records, recordConfig: data.recordConfig, portfolio: data.portfolio, contacts: data.contacts, contactConfig: data.contactConfig, schedule: data.schedule, scheduleConfig: data.scheduleConfig };
      emit({ mode: "preview", state: "preview" });
      return { ...lastState, mode: "preview" };
    }

    let serverData = { items: [], waiting: [], goals: [], records: [], recordConfig: null, portfolio: null, contacts: [], contactConfig: null, schedule: [], scheduleConfig: null, pastoralTopics: [], pastoralNotes: [], toldLog: [] };
    try {
      const r = await fetch("/api/data");
      if (r.ok) {
        const d = await r.json();
        serverData = {
          items: d.items || [],
          waiting: d.waiting || [],
          goals: d.goals || [],
          records: d.records || [],
          recordConfig: d.recordConfig || null,
          portfolio: d.portfolio || null,
          contacts: d.contacts || [],
          contactConfig: d.contactConfig || null,
          schedule: d.schedule || [],
          scheduleConfig: d.scheduleConfig || null,
        };
        baseSavedAt = d.savedAt || null; // the version we're now working from
      }
    } catch {
      /* fall through; we'll still mirror to localStorage below */
    }

    // Migration: if the owned file is empty but this browser has earlier preview
    // data, bring it in (and fix the old "double-click vs server are different
    // storage" gotcha).
    let migratedNote = "";
    const legacy = readLegacy();
    const serverEmpty =
      serverData.items.length === 0 &&
      serverData.waiting.length === 0 &&
      serverData.goals.length === 0 &&
      serverData.records.length === 0;
    const haveLegacy =
      legacy.items.length > 0 || legacy.waiting.length > 0 || legacy.goals.length > 0 || legacy.records.length > 0;
    if (serverEmpty && haveLegacy) {
      serverData = { items: legacy.items, waiting: legacy.waiting, goals: legacy.goals, records: legacy.records, recordConfig: legacy.recordConfig, portfolio: legacy.portfolio, contacts: legacy.contacts, contactConfig: legacy.contactConfig, schedule: legacy.schedule, scheduleConfig: legacy.scheduleConfig };
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
    writeLegacy(serverData); // emergency mirror
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
      lastState = {
        items: d.items || [],
        waiting: d.waiting || [],
        goals: d.goals || [],
        records: d.records || [],
        recordConfig: d.recordConfig || null,
        portfolio: d.portfolio || null,
        contacts: d.contacts || [],
        contactConfig: d.contactConfig || null,
        schedule: d.schedule || [],
        scheduleConfig: d.scheduleConfig || null,
      };
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
    lastState = { items: [], waiting: [], goals: [], records: [], recordConfig: null, portfolio: null, contacts: [], contactConfig: null, schedule: [], scheduleConfig: null, pastoralTopics: [], pastoralNotes: [], toldLog: [], ...lastState, ...part };
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
          lastState = {
            items: d.data.items || [],
            waiting: d.data.waiting || [],
            goals: d.data.goals || [],
            records: d.data.records || [],
            recordConfig: d.data.recordConfig || null,
            portfolio: d.data.portfolio || null,
            contacts: d.data.contacts || [],
            contactConfig: d.data.contactConfig || null,
            schedule: d.data.schedule || [],
            scheduleConfig: d.data.scheduleConfig || null,
          };
          baseSavedAt = d.data.savedAt || d.savedAt || baseSavedAt;
          writeLegacy(lastState);
          if (externalCb) externalCb(lastState);
        }
        emit({ mode: "file", state: "conflict", note: "Changed on another device — pulled in the latest (your edit was kept in data/backups)." });
        return;
      }
      if (!r.ok) throw new Error("status " + r.status);
      const d = await r.json().catch(() => ({}));
      if (d.savedAt) baseSavedAt = d.savedAt;
      dirty = false;
      emit({ mode: "file", state: "saved", at: d.savedAt ? Date.parse(d.savedAt) : Date.now() });
    } catch {
      if (attempt < 4) {
        emit({ mode: "file", state: "saving" });
        setTimeout(() => doSave(attempt + 1), 1000 * (attempt + 1));
      } else {
        emit({ mode: "file", state: "error" });
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
      const blob = new Blob([JSON.stringify({ ...lastState, baseSavedAt })], { type: "application/json" });
      navigator.sendBeacon("/api/data", blob);
      dirty = false;
    } catch {
      /* best-effort */
    }
  }

  // Export the WHOLE owned state, so a backup is complete.
  function exportNow() {
    const doc = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: lastState.items || [],
      waiting: lastState.waiting || [],
      goals: lastState.goals || [],
      records: lastState.records || [],
      recordConfig: lastState.recordConfig || null,
      portfolio: lastState.portfolio || null,
      contacts: lastState.contacts || [],
      contactConfig: lastState.contactConfig || null,
      schedule: lastState.schedule || [],
      scheduleConfig: lastState.scheduleConfig || null,
    };
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
          resolve({
            items: Array.isArray(d.items) ? d.items : [],
            waiting: Array.isArray(d.waiting) ? d.waiting : [],
            goals: Array.isArray(d.goals) ? d.goals : [],
            records: Array.isArray(d.records) ? d.records : [],
            recordConfig: d.recordConfig && typeof d.recordConfig === "object" ? d.recordConfig : null,
            portfolio: d.portfolio && typeof d.portfolio === "object" ? d.portfolio : null,
            contacts: Array.isArray(d.contacts) ? d.contacts : [],
            contactConfig: d.contactConfig && typeof d.contactConfig === "object" ? d.contactConfig : null,
            schedule: Array.isArray(d.schedule) ? d.schedule : [],
            scheduleConfig: d.scheduleConfig && typeof d.scheduleConfig === "object" ? d.scheduleConfig : null,
          });
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
      statusCb = cb;
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
