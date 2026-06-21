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

  let statusCb = null;
  let saveTimer = null;
  let dirty = false;
  let lastState = { items: [], waiting: [], goals: [] };

  function emit(s) {
    if (statusCb) statusCb(s);
  }

  function readLegacy() {
    function get(k) {
      try {
        const r = localStorage.getItem(k);
        return r ? JSON.parse(r) : [];
      } catch {
        return [];
      }
    }
    return { items: get(LS_ITEMS), waiting: get(LS_WAITING), goals: get(LS_GOALS) };
  }
  function writeLegacy(state) {
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(state.items || []));
      localStorage.setItem(LS_WAITING, JSON.stringify(state.waiting || []));
      localStorage.setItem(LS_GOALS, JSON.stringify(state.goals || []));
    } catch {
      /* storage may be full or blocked; ignore */
    }
  }

  async function load() {
    if (!SERVER) {
      const data = readLegacy();
      lastState = { items: data.items, waiting: data.waiting, goals: data.goals };
      emit({ mode: "preview", state: "preview" });
      return { ...lastState, mode: "preview" };
    }

    let serverData = { items: [], waiting: [], goals: [] };
    try {
      const r = await fetch("/api/data");
      if (r.ok) {
        const d = await r.json();
        serverData = { items: d.items || [], waiting: d.waiting || [], goals: d.goals || [] };
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
      serverData.items.length === 0 && serverData.waiting.length === 0 && serverData.goals.length === 0;
    const haveLegacy = legacy.items.length > 0 || legacy.waiting.length > 0 || legacy.goals.length > 0;
    if (serverEmpty && haveLegacy) {
      serverData = { items: legacy.items, waiting: legacy.waiting, goals: legacy.goals };
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
    return { ...serverData, mode: "file", migratedNote };
  }

  // Merge the given part(s) into the held state — keeps the keys you didn't pass.
  function save(part) {
    lastState = { items: [], waiting: [], goals: [], ...lastState, ...part };
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
        body: JSON.stringify(lastState),
      });
      if (!r.ok) throw new Error("status " + r.status);
      const d = await r.json().catch(() => ({}));
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

  // On the way out, flush any unsaved change with a beacon (survives the page
  // closing, where a normal fetch might be cut off).
  function flushBeacon() {
    if (!SERVER || !dirty) return;
    try {
      const blob = new Blob([JSON.stringify(lastState)], { type: "application/json" });
      navigator.sendBeacon("/api/data", blob);
      dirty = false;
    } catch {
      /* best-effort */
    }
  }

  // Export the WHOLE owned state (items + waiting + goals), so a backup is complete.
  function exportNow() {
    const doc = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: lastState.items || [],
      waiting: lastState.waiting || [],
      goals: lastState.goals || [],
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
    exportNow,
    importFile,
    flushBeacon,
    onStatus: (cb) => {
      statusCb = cb;
    },
    get mode() {
      return SERVER ? "file" : "preview";
    },
  };
})();
