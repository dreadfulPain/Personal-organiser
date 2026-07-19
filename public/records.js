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
  let expandedId = null; // which record is showing its details
  let profileEdit = false; // is the selected ID's profile open for editing

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
  // behaviour — the vocabulary, each kind's optional detail fields, the profile
  // fields, and even the guidance note are all yours to edit.
  const OLD_DEFAULT_NOTE =
    "Fake IDs only for now — no real names, no medical or SEN detail, no sensitive parent notes. " +
    "Those live only in the school's official system. One line is enough.";
  const DEFAULT_CONFIG = {
    title: "Student records",
    whoIds: ["S01", "S02", "S03", "S04", "S05"],
    types: ["assessment", "parent", "behaviour", "pastoral", "academic"],
    // Optional detail fields per kind — filled GRADUALLY, never at capture.
    fields: {
      assessment: ["subject", "result", "next step"],
      parent: ["who / how", "action needed"],
      behaviour: ["what led to it", "action taken", "shared with"],
      pastoral: ["action taken"],
      academic: ["next step"],
    },
    // The per-ID profile — a few labelled notes that grow as you learn a person.
    profileFields: ["reading level", "writing level", "maths", "learning needs (SEN / EAL)", "medical", "parent & home", "general notes"],
    profiles: {},
    note:
      "Practice with fake IDs first. Everything here stays on this computer — the AI is local and " +
      "nothing is sent anywhere. Two honest cautions: if this folder syncs to OneDrive/Dropbox, these " +
      "notes sync with it; and before real names or medical details go in, check what the school's " +
      "data policy allows outside their official system.",
  };
  function normaliseConfig(c) {
    if (!c || typeof c !== "object") return null;
    const list = (v, lower) =>
      Array.isArray(v)
        ? v.map((x) => String(x).trim()).filter(Boolean).map((x) => (lower ? x.toLowerCase() : x))
        : [];
    const out = {
      title: (c.title || "").toString().trim() || "Record log",
      whoIds: list(c.whoIds),
      types: list(c.types, true),
      fields: {},
      profileFields: list(c.profileFields),
      profiles: {},
      note: (c.note || "").toString(),
    };
    if (c.fields && typeof c.fields === "object") {
      Object.keys(c.fields).forEach((k) => {
        const l = list(c.fields[k]);
        if (l.length) out.fields[k] = l;
      });
    }
    if (c.profiles && typeof c.profiles === "object") {
      Object.keys(c.profiles).forEach((w) => {
        const p = c.profiles[w];
        if (!p || typeof p !== "object") return;
        const clean = {};
        Object.keys(p).forEach((f) => {
          const v = String(p[f] || "").trim();
          if (v) clean[f] = v;
        });
        if (Object.keys(clean).length) out.profiles[w] = clean;
      });
    }
    if (!out.whoIds.length) out.whoIds = DEFAULT_CONFIG.whoIds.slice();
    if (!out.types.length) out.types = DEFAULT_CONFIG.types.slice();
    // Configs saved before these existed grow them here (a quiet upgrade).
    if (!out.profileFields.length) out.profileFields = DEFAULT_CONFIG.profileFields.slice();
    if (!Object.keys(out.fields).length) out.fields = JSON.parse(JSON.stringify(DEFAULT_CONFIG.fields));
    if (out.note === OLD_DEFAULT_NOTE) out.note = DEFAULT_CONFIG.note; // factory text only — an edited note is never touched
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
      extra: {}, // per-kind detail fields — filled gradually, later, if ever
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
  // Who appears in a view, most-often first — so "who needs support with X?"
  // and "is a pattern forming?" are answered by the filter itself, no tally kept
  // anywhere (describes, never scores).
  function whoCounts(list) {
    const counts = new Map();
    list.forEach((r) => counts.set(r.who, (counts.get(r.who) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([who, n]) => (n > 1 ? `${who} ×${n}` : String(who)));
  }

  // ----- the per-ID profile: labelled notes that grow gradually -----
  // Shown only when one ID is selected. Read view first (just what's filled);
  // "edit" opens the full field set, blank-is-fine. Nothing is ever required.
  function renderProfile() {
    const box = $("#recProfile");
    if (!box) return;
    if (!filters.who) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const who = filters.who;
    const data = (config.profiles && config.profiles[who]) || {};
    const fields = config.profileFields || [];
    const filled = fields.filter((f) => (data[f] || "").trim());
    box.hidden = false;
    box.innerHTML = `<div class="rec-prof-head">
        <h2>${escapeHtml(who)} — profile</h2>
        <button class="link prof-toggle" type="button">${profileEdit ? "done" : filled.length ? "edit" : "+ add profile notes"}</button>
      </div>`;
    if (profileEdit) {
      const wrap = document.createElement("div");
      wrap.className = "rec-prof-fields";
      fields.forEach((f) => {
        const label = document.createElement("label");
        label.className = "cb-field rec-prof-field";
        label.innerHTML = `<span class="cb-lbl">${escapeHtml(f)}</span>`;
        const input = document.createElement("input");
        input.type = "text";
        input.value = data[f] || "";
        input.placeholder = "fine to leave blank";
        input.addEventListener("change", (e) => {
          const v = e.target.value.trim();
          if (!config.profiles) config.profiles = {};
          if (!config.profiles[who]) config.profiles[who] = {};
          if (v) config.profiles[who][f] = v;
          else delete config.profiles[who][f];
          if (!Object.keys(config.profiles[who]).length) delete config.profiles[who];
          persistRecords();
        });
        label.appendChild(input);
        wrap.appendChild(label);
      });
      box.appendChild(wrap);
    } else if (filled.length) {
      const wrap = document.createElement("div");
      wrap.className = "rec-prof-read";
      filled.forEach((f) => {
        const d = document.createElement("div");
        d.className = "rec-prof-line";
        d.innerHTML = `<span class="rec-extra-k">${escapeHtml(f)}:</span> ${escapeHtml(data[f])}`;
        wrap.appendChild(d);
      });
      box.appendChild(wrap);
    }
    box.querySelector(".prof-toggle").addEventListener("click", () => {
      profileEdit = !profileEdit;
      render();
    });
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

  // The gradual details area (open per record): the kind's optional fields —
  // pre-labelled, blank-is-fine, fill any time — plus the free longer note.
  function detailArea(rec) {
    const wrap = document.createElement("div");
    wrap.className = "rec-detail-area";
    const fields = (config.fields && config.fields[rec.type]) || [];
    if (fields.length) {
      const grid = document.createElement("div");
      grid.className = "rec-extra-fields";
      fields.forEach((f) => {
        const label = document.createElement("label");
        label.className = "cb-field";
        label.innerHTML = `<span class="cb-lbl">${escapeHtml(f)}</span>`;
        const input = document.createElement("input");
        input.type = "text";
        input.value = (rec.extra && rec.extra[f]) || "";
        input.placeholder = "fine to leave blank";
        input.addEventListener("change", (e) => {
          const v = e.target.value.trim();
          if (!rec.extra) rec.extra = {};
          if (v) rec.extra[f] = v;
          else delete rec.extra[f];
          persistRecords();
        });
        label.appendChild(input);
        grid.appendChild(label);
      });
      wrap.appendChild(grid);
    }
    const ta = document.createElement("textarea");
    ta.className = "rec-detail";
    ta.rows = 3;
    ta.placeholder = "longer note (optional)";
    ta.value = rec.detail || "";
    ta.addEventListener("change", (e) => {
      rec.detail = e.target.value;
      persistRecords();
    });
    wrap.appendChild(ta);
    return wrap;
  }

  function recordRow(rec) {
    const row = document.createElement("div");
    row.className = "rec-row";
    const open = isFollowUpOpen(rec);
    const task = taskById(rec.taskId);
    // the chase-by date lives on the linked task (the queue), shown here live
    const fuLabel = rec.followUp
      ? open
        ? `follow-up open${task && task.date ? ` · by ${friendlyDate(task.date)}` : ""}`
        : "follow-up done ✓"
      : "";
    const filledExtra = Object.entries(rec.extra || {}).filter(([, v]) => (v || "").toString().trim());
    const hasDetails = filledExtra.length || (rec.detail || "").trim();
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
        ${filledExtra.length ? `<div class="rec-extra-line">${filledExtra.map(([k, v]) => `<span class="rec-extra-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}`).join(" · ")}</div>` : ""}
      </div>
      <div class="rec-actions">
        <button class="link rec-note-btn" type="button">${expandedId === rec.id ? "hide details" : hasDetails ? "details" : "+ details"}</button>
        <button class="link rec-fu-btn" type="button">${rec.followUp ? "clear follow-up" : "needs follow-up"}</button>
        <button class="x-del" type="button" title="Delete record">×</button>
      </div>`;
    if (expandedId === rec.id) row.querySelector(".rec-main").appendChild(detailArea(rec));
    row.querySelector(".rec-note-btn").addEventListener("click", () => {
      expandedId = expandedId === rec.id ? null : rec.id;
      render();
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

    renderProfile();
    renderConfig();

    const list = $("#recList");
    list.innerHTML = "";
    const visible = visibleRecords().sort(newestFirst);

    // The whole-class half of the two views: with a filter on (a kind, a tag, a
    // window, open follow-ups), name WHO the view touches — most-often first.
    const line = $("#recViewLine");
    const filtering = filters.type || filters.tag || filters.openOnly || filters.range !== "all";
    if (line) {
      if (visible.length && !filters.who && filtering) {
        line.textContent = "In this view: " + whoCounts(visible).join(" · ");
        line.hidden = false;
      } else {
        line.hidden = true;
        line.textContent = "";
      }
    }

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

  // ----- set up (every word is data) -----
  // Rebuilt from config each render, so the per-kind field inputs always track
  // the current kinds. Each change saves and re-renders (change fires on blur).
  function renderConfig() {
    const area = $("#cfgArea");
    if (!area) return;
    area.innerHTML = "";
    const mk = (labelText, value, wide, apply) => {
      const label = document.createElement("label");
      label.className = "cb-field" + (wide ? " rec-cfg-wide" : "");
      label.innerHTML = `<span class="cb-lbl">${escapeHtml(labelText)}</span>`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.addEventListener("change", (e) => {
        apply(e.target.value);
        persistRecords();
        render();
      });
      label.appendChild(input);
      area.appendChild(label);
    };
    const parseList = (v, lower) =>
      v.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (lower ? s.toLowerCase() : s));
    mk("Page title", config.title, false, (v) => {
      config.title = v.trim() || "Record log";
    });
    mk("IDs (comma-separated)", config.whoIds.join(", "), true, (v) => {
      const l = parseList(v);
      if (l.length) config.whoIds = l;
    });
    mk("Note kinds (comma-separated)", config.types.join(", "), true, (v) => {
      const l = parseList(v, true);
      if (l.length) config.types = l;
    });
    config.types.forEach((t) =>
      mk(`Details for “${t}” (comma-separated)`, ((config.fields || {})[t] || []).join(", "), true, (v) => {
        const l = parseList(v);
        if (!config.fields) config.fields = {};
        if (l.length) config.fields[t] = l;
        else delete config.fields[t];
      })
    );
    mk("Profile fields (comma-separated)", (config.profileFields || []).join(", "), true, (v) => {
      const l = parseList(v);
      if (l.length) config.profileFields = l;
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
      profileEdit = false; // fresh person → read view first
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

    render();
    $("#recSummary").focus();
  }

  init();
})();
