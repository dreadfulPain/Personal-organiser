/* The SEEING half. Everything here runs in the browser, reads and writes the
   browser's own local storage, and works with no internet. The only time we
   reach the network is to ask the server to understand a fresh dump. */

(() => {
  "use strict";

  const LS_ITEMS = "organiser.items.v1";
  const LS_WAITING = "organiser.waiting.v1";

  const TYPE_LABEL = {
    task: "To do",
    appointment: "Event",
    reminder: "Reminder",
    note: "Note",
  };
  const TYPES = ["task", "appointment", "reminder", "note"];

  // ---------- storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  let items = load(LS_ITEMS, []); // everything filed
  let waiting = load(LS_WAITING, []); // dumps saved while offline
  let pending = null; // the batch currently shown in the check-back

  function persist() {
    save(LS_ITEMS, items);
    save(LS_WAITING, waiting);
  }

  // ---------- small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  const todayISO = () => isoOf(new Date());
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
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
  function friendlyDateFromStamp(stamp) {
    const d = new Date(stamp);
    return friendlyDate(isoOf(d));
  }

  function setStatus(msg) {
    const s = $("#status");
    s.textContent = msg || "";
    s.hidden = !msg;
  }
  function setBusy(b) {
    const btn = $("#sortBtn");
    btn.disabled = b;
    btn.textContent = b ? "Sorting…" : "Sort it";
    $("#dump").disabled = b;
  }

  // ---------- the online step: ask the server to understand a dump ----------
  async function understand(text) {
    const res = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, today: todayISO() }),
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
      whenText: (it.when_text || "").toString().trim(),
    };
  }

  async function onSort() {
    const text = $("#dump").value.trim();
    if (!text) return;
    setBusy(true);
    setStatus("Reading what you wrote…");
    try {
      const understood = await understand(text);
      if (!understood.length) {
        setStatus("I couldn't find anything to add there — try a few more words?");
        return;
      }
      pending = understood.map(normalise);
      renderCheckback();
      setStatus("");
    } catch (err) {
      // Offline / no key / failure: keep the dump safe to sort later (§0.1).
      waiting.unshift({ id: uid(), text, createdAt: new Date().toISOString() });
      persist();
      $("#dump").value = "";
      if (err.code === "no_key") {
        setStatus("Sorting is off (no API key yet) — I saved your note below to sort later.");
      } else {
        setStatus("I can't reach the sorter right now (offline?). Your note is saved below — sort it when you're back.");
      }
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
          <button class="cb-remove" type="button" aria-label="Remove this">remove</button>
        </div>
        ${it.whenText ? `<div class="cb-when">your words: “${escapeHtml(it.whenText)}”</div>` : ""}
      `;
      card.querySelector(".cb-title").addEventListener("input", (e) => (pending[i].title = e.target.value));
      card.querySelector(".cb-type").addEventListener("change", (e) => (pending[i].type = e.target.value));
      card.querySelector(".cb-date").addEventListener("change", (e) => (pending[i].date = e.target.value));
      card.querySelector(".cb-remove").addEventListener("click", () => {
        pending.splice(i, 1);
        renderCheckback();
      });
      list.appendChild(card);
    });

    if (pending.length === 0) {
      cancelCheckback();
    } else {
      $("#checkback").hidden = false;
    }
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
    const label = it.date ? friendlyDate(it.date) : it.whenText ? capitalize(it.whenText) : "";
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

    renderLookback();
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
  function uncomplete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = false;
    it.completedAt = null;
    persist();
    renderZones();
  }

  // ---------- looking back (the mirror, not a scoreboard) ----------
  function renderLookback() {
    const done = items
      .filter((i) => i.done)
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

    $("#lookbackCount").textContent = done.length ? `(${done.length})` : "";

    const el = $("#lookbackList");
    el.innerHTML = "";
    if (!done.length) {
      el.innerHTML = `<p class="empty">Things you finish gather here — a quiet record, not a scoreboard.</p>`;
      return;
    }
    done.forEach((it) => {
      const row = document.createElement("div");
      row.className = "item done";
      const when = it.completedAt ? friendlyDateFromStamp(it.completedAt) : "";
      row.innerHTML = `
        <span class="tick done" aria-hidden="true"></span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(it.title)}</div>
          <div class="item-meta">
            <span class="badge ${it.type}">${TYPE_LABEL[it.type]}</span>
            ${when ? `<span class="when">done ${escapeHtml(when)}</span>` : ""}
          </div>
        </div>
        <button class="putback" type="button">put back</button>`;
      row.querySelector(".putback").addEventListener("click", () => uncomplete(it.id));
      el.appendChild(row);
    });
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
        setStatus('Loaded it back up — press "Sort it".');
      });
      row.querySelector(".discard").addEventListener("click", () => {
        waiting = waiting.filter((x) => x.id !== w.id);
        persist();
        renderWaiting();
      });
      el.appendChild(row);
    });
  }

  // ---------- setup hint ----------
  async function checkHealth() {
    try {
      const r = await fetch("/api/health");
      const j = await r.json();
      $("#setup").hidden = !!j.hasKey;
    } catch {
      // server unreachable: leave the hint hidden, seeing still works
    }
  }

  // ---------- wire up ----------
  function init() {
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
    $("#lookbackToggle").addEventListener("click", () => {
      const lb = $("#lookback");
      lb.hidden = !lb.hidden;
      $("#lookbackToggle").setAttribute("aria-expanded", String(!lb.hidden));
    });

    renderZones();
    renderWaiting();
    checkHealth();
  }

  init();
})();
