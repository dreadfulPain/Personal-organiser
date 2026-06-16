// The SEEING half. Renders the zones, ticks things off, and adds things.
// All storage goes through OrganiserStore (store.js) — this file never touches
// localStorage or the network directly for data.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };
  const TYPES = ["task", "appointment", "reminder", "note"];

  let items = []; // everything filed
  let waiting = []; // dumps saved while the AI sorter was unreachable
  let pending = null; // the batch currently shown in the check-back
  let aiAvailable = false; // is AI sorting set up? (off during the storage phase)

  // ---------- small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const todayISO = () => isoOf(new Date());
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function normaliseTime(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").toString().trim());
    if (!m) return "";
    const h = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2], 10));
    return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }
  function fmtTime(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const d = new Date();
    d.setHours(+m[1], +m[2], 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function friendlyDate(iso) {
    if (!iso) return "";
    const t = todayISO();
    if (iso === t) return "Today";
    if (iso === addDaysISO(t, 1)) return "Tomorrow";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
  function setStatus(msg) {
    const s = $("#status");
    s.textContent = msg || "";
    s.hidden = !msg;
  }
  function setBusy(b) {
    const btn = $("#sortBtn");
    btn.disabled = b;
    btn.textContent = b ? (aiAvailable ? "Sorting…" : "Adding…") : aiAvailable ? "Sort it" : "Add";
    $("#dump").disabled = b;
  }

  function persist() {
    OrganiserStore.save({ items, waiting });
  }

  // ---------- adding things ----------
  async function understandViaAI(text) {
    const res = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        today: todayISO(),
        // Prompt rule 1: tell the model the real date AND time (it has no clock).
        now: new Date().toLocaleString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }),
    });
    if (!res.ok) {
      let info = {};
      try {
        info = await res.json();
      } catch {}
      const err = new Error(info.message || "Sort failed");
      err.code = info.error || "http_" + res.status;
      throw err;
    }
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  }

  function normalise(it) {
    const type = TYPES.includes(it.type) ? it.type : "task";
    return {
      title: (it.title || "").toString().trim() || "Untitled",
      type,
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : "",
      time: normaliseTime(it.time),
      whenText: (it.when_text || "").toString().trim(),
    };
  }

  async function onSort() {
    const text = $("#dump").value.trim();
    if (!text) return;

    // No AI yet (the storage phase): hand-entry. Take the line as one item and
    // let the user set the kind/date in the check-back. Still no fields to fill
    // before typing — you just type the thing.
    if (!aiAvailable) {
      pending = [{ title: text, type: "task", date: "", time: "", whenText: "" }];
      $("#dump").value = "";
      $("#checkbackHeading").textContent = "Add this — tweak anything, then add.";
      renderCheckback();
      setStatus("");
      return;
    }

    setBusy(true);
    setStatus("Reading what you wrote…");
    try {
      const understood = await understandViaAI(text);
      if (!understood.length) {
        setStatus("I couldn't find anything to add there — try a few more words?");
        return;
      }
      pending = understood.map(normalise);
      $("#checkbackHeading").textContent = "Here's what I understood — look right?";
      renderCheckback();
      setStatus("");
    } catch (err) {
      // AI is set up but unreachable: keep the dump safe to sort later (§0.1).
      waiting.unshift({ id: uid(), text, createdAt: new Date().toISOString() });
      persist();
      $("#dump").value = "";
      const msg = err && err.code ? err.message : "I can't reach the app right now.";
      setStatus(msg + " Saved below to sort later.");
      renderWaiting();
    } finally {
      setBusy(false);
    }
  }

  // ---------- the check-back: confirm or fix before filing ----------
  function renderCheckback() {
    const list = $("#checkbackList");
    list.innerHTML = "";

    pending.forEach((it, i) => {
      const card = document.createElement("div");
      card.className = "cb-card";
      card.innerHTML = `
        <input class="cb-title" type="text" value="${escapeHtml(it.title)}" aria-label="What it is" />
        <div class="cb-row">
          <select class="cb-type" aria-label="Kind">
            ${TYPES.map(
              (t) => `<option value="${t}" ${t === it.type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`
            ).join("")}
          </select>
          <input class="cb-date" type="date" value="${it.date}" aria-label="Date (optional)" />
          <input class="cb-time" type="time" value="${it.time || ""}" aria-label="Time (optional)" />
          <button class="cb-remove" type="button" aria-label="Remove this">remove</button>
        </div>
        ${it.whenText ? `<div class="cb-when">your words: “${escapeHtml(it.whenText)}”</div>` : ""}
      `;
      card.querySelector(".cb-title").addEventListener("input", (e) => (pending[i].title = e.target.value));
      card.querySelector(".cb-type").addEventListener("change", (e) => (pending[i].type = e.target.value));
      card.querySelector(".cb-date").addEventListener("change", (e) => (pending[i].date = e.target.value));
      card.querySelector(".cb-time").addEventListener("change", (e) => (pending[i].time = e.target.value));
      card.querySelector(".cb-remove").addEventListener("click", () => {
        pending.splice(i, 1);
        renderCheckback();
      });
      list.appendChild(card);
    });

    if (pending.length === 0) cancelCheckback();
    else $("#checkback").hidden = false;
  }

  function confirmCheckback() {
    if (!pending) return;
    const now = new Date().toISOString();
    let added = 0;
    pending.forEach((it) => {
      const title = (it.title || "").trim();
      if (!title) return;
      items.push({
        id: uid(),
        title,
        type: TYPES.includes(it.type) ? it.type : "task",
        date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : "",
        time: normaliseTime(it.time),
        whenText: it.whenText || "",
        done: false,
        createdAt: now,
        completedAt: null,
      });
      added++;
    });
    pending = null;
    persist();
    $("#dump").value = "";
    $("#checkback").hidden = true;
    $("#checkbackList").innerHTML = "";
    renderZones();
    setStatus(added === 1 ? "Added. ✓" : `Added ${added} things. ✓`);
  }

  function cancelCheckback() {
    pending = null;
    $("#checkback").hidden = true;
    $("#checkbackList").innerHTML = "";
  }

  // ---------- the zones ----------
  function zoneFor(it) {
    if (!it.date) return "someday";
    return it.date <= todayISO() ? "today" : "coming";
  }

  function itemRow(it) {
    const row = document.createElement("div");
    row.className = "item";
    const overdue = it.date && it.date < todayISO();
    let label = it.date ? friendlyDate(it.date) : it.whenText ? capitalize(it.whenText) : "";
    const tlabel = fmtTime(it.time);
    if (tlabel) label = label ? `${label} · ${tlabel}` : tlabel;
    row.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type]}</span>
          ${label ? `<span class="when ${overdue ? "overdue" : ""}">${escapeHtml(label)}${overdue ? " · overdue" : ""}</span>` : ""}
        </div>
      </div>`;
    row.querySelector(".tick").addEventListener("click", () => complete(it.id));
    return row;
  }

  function fillZone(sel, list, emptyMsg) {
    const el = $(sel);
    el.innerHTML = "";
    if (!list.length) {
      el.innerHTML = `<p class="empty">${emptyMsg}</p>`;
      return;
    }
    list.forEach((it) => el.appendChild(itemRow(it)));
  }

  function renderZones() {
    const active = items.filter((i) => !i.done);
    const groups = { today: [], coming: [], someday: [] };
    active.forEach((i) => groups[zoneFor(i)].push(i));

    groups.today.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    groups.coming.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    groups.someday.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    fillZone("#todayItems", groups.today, "Nothing for today. Enjoy the quiet.");
    fillZone("#comingItems", groups.coming, "Nothing coming up yet.");
    fillZone("#somedayItems", groups.someday, "No parked ideas right now.");

    $("#todayCount").textContent = groups.today.length ? groups.today.length : "";
    $("#comingCount").textContent = groups.coming.length ? groups.coming.length : "";
    $("#somedayCount").textContent = groups.someday.length ? groups.someday.length : "";
  }

  // done = gone from the active view, kept in the mirror
  function complete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = new Date().toISOString();
    persist();
    renderZones();
  }
  // ---------- waiting to be sorted ----------
  function renderWaiting() {
    const el = $("#waitingList");
    $("#waiting").hidden = waiting.length === 0;
    el.innerHTML = "";
    waiting.forEach((w) => {
      const row = document.createElement("div");
      row.className = "waiting-item";
      row.innerHTML = `
        <div class="waiting-text">${escapeHtml(w.text)}</div>
        <div class="waiting-actions">
          <button class="link sortnow" type="button">sort now</button>
          <button class="link discard" type="button">delete</button>
        </div>`;
      row.querySelector(".sortnow").addEventListener("click", () => {
        $("#dump").value = w.text;
        waiting = waiting.filter((x) => x.id !== w.id);
        persist();
        renderWaiting();
        $("#dump").focus();
        setStatus('Loaded it back up — press the button to add it.');
      });
      row.querySelector(".discard").addEventListener("click", () => {
        waiting = waiting.filter((x) => x.id !== w.id);
        persist();
        renderWaiting();
      });
      el.appendChild(row);
    });
  }

  // ---------- storage status + "your data" footer ----------
  function renderStorageStatus(s) {
    const el = $("#storageStatus");
    if (!el) return;
    el.className = "storage-status";
    if (s.mode === "preview") {
      el.textContent = "";
      return;
    }
    if (s.state === "saving") {
      el.classList.add("saving");
      el.textContent = "Saving…";
    } else if (s.state === "saved") {
      el.classList.add("saved");
      const t = s.at ? new Date(s.at) : new Date();
      el.textContent = `Saved ✓ ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } else if (s.state === "error") {
      el.classList.add("error");
      el.textContent = "Couldn't save — will keep trying. Make sure the app window is still open.";
    }
  }

  function applyMode() {
    const btn = $("#sortBtn");
    btn.textContent = aiAvailable ? "Sort it" : "Add";
    $("#dumpHint").textContent = aiAvailable
      ? "or press ⌘/Ctrl + Enter"
      : "Type one thing and add it — smart sorting is a later step.";
  }

  async function checkHealth() {
    if (OrganiserStore.mode !== "file") {
      aiAvailable = false;
      $("#previewBanner").hidden = false;
      $("#dataWhere").textContent =
        "Preview mode: changes stay only in this browser and are not saved to your data file. " +
        "Open with “Start Organiser” to save properly. You can still use “Back up now” to download a copy.";
      applyMode();
      return;
    }
    $("#previewBanner").hidden = true;
    try {
      const r = await fetch("/api/health");
      const j = await r.json();
      aiAvailable = !!j.hasAI;
      const where = j.dataFile || "your data file";
      $("#dataWhere").textContent =
        `Saved automatically to: ${where}. ` +
        "To back up, copy that file anywhere — or click “Back up now”. " +
        "Tip: keep the whole app folder inside OneDrive / Dropbox / Google Drive and your data " +
        "syncs across your devices, still fully owned by you.";
    } catch {
      aiAvailable = false;
    }
    applyMode();
  }

  async function onRestore(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm("Restoring replaces what's here now with the backup file. Continue?")) {
      e.target.value = "";
      return;
    }
    try {
      const data = await OrganiserStore.importFile(file);
      items = data.items || [];
      waiting = data.waiting || [];
      persist();
      renderZones();
      renderWaiting();
      setStatus("Restored from your backup. ✓");
    } catch (err) {
      setStatus(err.message || "Couldn't read that backup.");
    }
    e.target.value = "";
  }

  // ---------- wire up ----------
  async function init() {
    OrganiserStore.onStatus(renderStorageStatus);

    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];

    $("#sortBtn").addEventListener("click", onSort);
    $("#dump").addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSort();
      }
    });
    $("#addBtn").addEventListener("click", confirmCheckback);
    $("#cancelBtn").addEventListener("click", () => {
      cancelCheckback();
      setStatus("");
    });
    $("#backupBtn").addEventListener("click", () => {
      OrganiserStore.exportNow({ items, waiting });
      setStatus("Saved a backup copy to your Downloads.");
    });
    $("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
    $("#restoreInput").addEventListener("change", onRestore);
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());

    renderZones();
    renderWaiting();
    if (data.migratedNote) setStatus(data.migratedNote);
    await checkHealth();
  }

  init();
})();
