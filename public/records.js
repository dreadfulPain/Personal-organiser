// The record LOG (§10): what happened, stored exactly once, seen through
// filters. Records are a LOG; tasks stay the QUEUE — a record that needs
// chasing spawns a real linked task that rides the normal reminders and
// shortlist (s28: no separate place to check, memory out of the loop).
//
// GENERIC by design (§0.2, the no-hard-coding rule): this file knows only
// "one-line records about some ID, of some kind". Every domain word — the IDs,
// the note kinds, even the page title and the guidance note — is DATA in
// recordConfig, seeded once with safe defaults and editable on the page.
// Point it at anything; the code never knows the difference.
//
// Plain script (works under file://). Saves only the parts it owns via the
// merge-save: { records, recordConfig } — plus { items } when a follow-up
// task is spawned or reopened.

(() => {
  "use strict";

  let records = [];
  let config = null;
  let items = []; // the shared pool — follow-up tasks live here (the queue)
  const filters = { who: "", type: "", tag: "", range: "all", openOnly: false };
  let expandedId = null; // which record is showing its longer note

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const todayISO = () => isoOf(new Date());
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function friendlyDate(iso) {
    if (!iso) return "";
    if (iso === todayISO()) return "today";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  // Seeded ONCE if absent, then fully user-owned. These strings are data, not
  // behaviour — the guards (fake IDs, nothing sensitive) live here as words the
  // user sees and can edit, exactly as the spec locked them.
  const DEFAULT_CONFIG = {
    title: "Student records",
    whoIds: ["S01", "S02", "S03", "S04", "S05"],
    types: ["assessment", "parent", "behaviour", "pastoral", "academic"],
    note:
      "Fake IDs only for now — no real names, no medical or SEN detail, no sensitive parent notes. " +
      "Those live only in the school's official system. One line is enough.",
  };
  function normaliseConfig(c) {
    if (!c || typeof c !== "object") return null;
    const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    const out = {
      title: (c.title || "").toString().trim() || "Record log",
      whoIds: list(c.whoIds),
      types: list(c.types),
      note: (c.note || "").toString(),
    };
    if (!out.whoIds.length) out.whoIds = DEFAULT_CONFIG.whoIds.slice();
    if (!out.types.length) out.types = DEFAULT_CONFIG.types.slice();
    return out;
  }

  function persistRecords() {
    OrganiserStore.save({ records, recordConfig: config });
  }
  function persistAll() {
    OrganiserStore.save({ records, recordConfig: config, items });
  }

  // ----- the log ↔ queue link -----
  function taskById(id) {
    return id ? items.find((t) => t && t.id === id) : null;
  }
  // Open = flagged for follow-up and the linked task isn't done (a deleted task
  // counts as open — the chase hasn't happened).
  function isFollowUpOpen(rec) {
    if (!rec.followUp) return false;
    const t = taskById(rec.taskId);
    return !t || !t.done;
  }
  function tomorrowAt9() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${isoOf(d)}T09:00`;
  }
  // The killer integration: the follow-up becomes a REAL task in the normal
  // queue — dated tomorrow so it surfaces in the ordinary lists/shortlist, with
  // a morning reminder that comes and finds you (s28). No separate place to check.
  function spawnFollowUpTask(rec) {
    const t = {
      id: uid(),
      title: `Follow up: ${rec.summary}${rec.who ? ` (${rec.who})` : ""}`,
      type: "task",
      date: isoOf(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: "quick",
      tags: (rec.tags || []).slice(0, 4),
      whenText: "",
      goalId: "",
      openLoop: false,
      promisedTo: "",
      remindAt: tomorrowAt9(),
      remindedAt: null,
      done: false,
      createdAt: nowISO(),
      completedAt: null,
    };
    items.push(t);
    rec.taskId = t.id;
    return t;
  }
  function toggleFollowUp(rec) {
    if (rec.followUp) {
      // Un-flag the record; an already-spawned task stays in the queue — it's
      // yours to finish or remove there (the queue is never silently touched).
      rec.followUp = false;
      persistRecords();
    } else {
      rec.followUp = true;
      const existing = taskById(rec.taskId);
      if (!existing || existing.done) spawnFollowUpTask(rec);
      persistAll();
    }
    render();
  }

  // ----- mutations -----
  function addRecord() {
    const summary = $("#recSummary").value.trim();
    if (!summary) return;
    const rec = {
      id: uid(),
      who: $("#recWho").value,
      date: todayISO(),
      type: $("#recType").value,
      summary,
      detail: "",
      tags: $("#recTags").value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4),
      followUp: false,
      taskId: "",
      createdAt: nowISO(),
    };
    records.unshift(rec);
    if ($("#recFollowUp").checked) {
      rec.followUp = true;
      spawnFollowUpTask(rec);
      persistAll();
    } else {
      persistRecords();
    }
    $("#recSummary").value = "";
    $("#recTags").value = "";
    $("#recFollowUp").checked = false;
    $("#recSummary").focus();
    setStatus(rec.followUp ? "Logged — and a follow-up task with a morning reminder is in your list. ✓" : "Logged. ✓");
    render();
  }
  function deleteRecord(id) {
    if (!confirm("Delete this record? (A spawned follow-up task stays in your task list.)")) return;
    records = records.filter((r) => r.id !== id);
    persistRecords();
    render();
  }
  function setStatus(msg) {
    const s = $("#recStatus");
    s.textContent = msg || "";
    s.hidden = !msg;
    clearTimeout(setStatus._t);
    if (msg) setStatus._t = setTimeout(() => (s.hidden = true), 4000);
  }

  // ----- the views: filters over ONE store, never copies -----
  function withinRange(rec, days) {
    if (days === "all") return true;
    const base = rec.date || (rec.createdAt || "").slice(0, 10);
    if (!base) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));
    return base >= isoOf(cutoff);
  }
  function visibleRecords() {
    return records.filter((r) => {
      if (filters.who && r.who !== filters.who) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.tag && !(r.tags || []).some((t) => t.includes(filters.tag))) return false;
      if (!withinRange(r, filters.range)) return false;
      if (filters.openOnly && !isFollowUpOpen(r)) return false;
      return true;
    });
  }
  function newestFirst(a, b) {
    return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  }

  // ----- render -----
  function fillSelect(sel, values, allLabel) {
    const el = $(sel);
    const current = el.value;
    el.innerHTML = "";
    if (allLabel !== undefined) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = allLabel;
      el.appendChild(o);
    }
    values.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
    if ([...el.options].some((o) => o.value === current)) el.value = current;
  }

  function recordRow(rec) {
    const row = document.createElement("div");
    row.className = "rec-row";
    const open = isFollowUpOpen(rec);
    const task = taskById(rec.taskId);
    const fuLabel = rec.followUp ? (open ? "follow-up open" : "follow-up done ✓") : "";
    row.innerHTML = `
      <div class="rec-main">
        <div class="rec-line">
          <span class="rec-who">${escapeHtml(rec.who)}</span>
          <span class="rec-type">${escapeHtml(rec.type)}</span>
          <span class="rec-date">${escapeHtml(friendlyDate(rec.date))}</span>
          ${(rec.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          ${fuLabel ? `<span class="rec-fu-chip ${open ? "open" : "closed"}">${fuLabel}</span>` : ""}
        </div>
        <div class="rec-summary">${escapeHtml(rec.summary)}</div>
        ${expandedId === rec.id ? `<textarea class="rec-detail" rows="3" placeholder="longer note (optional)">${escapeHtml(rec.detail || "")}</textarea>` : ""}
      </div>
      <div class="rec-actions">
        <button class="link rec-note-btn" type="button">${expandedId === rec.id ? "hide note" : rec.detail ? "note" : "+ note"}</button>
        <button class="link rec-fu-btn" type="button">${rec.followUp ? "clear follow-up" : "needs follow-up"}</button>
        <button class="x-del" type="button" title="Delete record">×</button>
      </div>`;
    row.querySelector(".rec-note-btn").addEventListener("click", () => {
      expandedId = expandedId === rec.id ? null : rec.id;
      render();
    });
    const detail = row.querySelector(".rec-detail");
    if (detail)
      detail.addEventListener("change", (e) => {
        rec.detail = e.target.value;
        persistRecords();
      });
    row.querySelector(".rec-fu-btn").addEventListener("click", () => toggleFollowUp(rec));
    row.querySelector(".x-del").addEventListener("click", () => deleteRecord(rec.id));
    if (rec.followUp && task && !task.done) row.title = `Linked task: ${task.title}`;
    return row;
  }

  function render() {
    $("#recTitle").textContent = config.title;
    document.title = config.title;
    $("#recNote").textContent = config.note || "";
    fillSelect("#recWho", config.whoIds);
    fillSelect("#recType", config.types);
    fillSelect("#fWho", config.whoIds, "everyone");
    fillSelect("#fType", config.types, "every kind");

    const list = $("#recList");
    list.innerHTML = "";
    const visible = visibleRecords().sort(newestFirst);
    if (!visible.length) {
      list.innerHTML = `<p class="empty">${records.length ? "Nothing matches these filters." : "No records yet. One line up there is all it takes."}</p>`;
      return;
    }
    if (filters.who && !filters.type) {
      // one person's timeline, grouped by kind (the spec's per-ID view)
      config.types
        .concat(visible.map((r) => r.type).filter((t) => !config.types.includes(t)))
        .forEach((type) => {
          const group = visible.filter((r) => r.type === type);
          if (!group.length) return;
          const h = document.createElement("h2");
          h.className = "rec-group-title";
          h.textContent = `${type} (${group.length})`;
          list.appendChild(h);
          group.forEach((r) => list.appendChild(recordRow(r)));
        });
    } else {
      visible.forEach((r) => list.appendChild(recordRow(r)));
    }
  }

  // ----- set up (the words are data) -----
  function wireConfig() {
    $("#cfgTitle").value = config.title;
    $("#cfgWho").value = config.whoIds.join(", ");
    $("#cfgTypes").value = config.types.join(", ");
    $("#cfgTitle").addEventListener("change", (e) => {
      config.title = e.target.value.trim() || "Record log";
      persistRecords();
      render();
    });
    $("#cfgWho").addEventListener("change", (e) => {
      const v = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (v.length) config.whoIds = v;
      e.target.value = config.whoIds.join(", ");
      persistRecords();
      render();
    });
    $("#cfgTypes").addEventListener("change", (e) => {
      const v = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (v.length) config.types = v;
      e.target.value = config.types.join(", ");
      persistRecords();
      render();
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    records = Array.isArray(data.records) ? data.records : [];
    items = Array.isArray(data.items) ? data.items : [];
    config = normaliseConfig(data.recordConfig);
    if (!config) {
      config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      persistRecords(); // seed once; from here it's the user's data
    }

    $("#recAddBtn").addEventListener("click", addRecord);
    [$("#recSummary"), $("#recTags")].forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addRecord();
      })
    );
    $("#fWho").addEventListener("change", (e) => {
      filters.who = e.target.value;
      render();
    });
    $("#fType").addEventListener("change", (e) => {
      filters.type = e.target.value;
      render();
    });
    $("#fTag").addEventListener("input", (e) => {
      filters.tag = e.target.value.trim().toLowerCase();
      render();
    });
    $("#fRange").addEventListener("change", (e) => {
      filters.range = e.target.value;
      render();
    });
    $("#fOpen").addEventListener("change", (e) => {
      filters.openOnly = e.target.checked;
      render();
    });
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());

    wireConfig();
    render();
    $("#recSummary").focus();
  }

  init();
})();
