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
  const filters = { who: "", type: "", topic: "", tag: "", range: "all", openOnly: false, unchecked: false };
  let expandedId = null; // which record is showing its details
  let confirmingId = null; // which AI-sorted record's check-me actions are open
  let profileEdit = false; // is the selected ID's profile open for editing
  let aiAvailable = false; // can the AI sort a messy note into records?
  let aiFallback = false; // AI unreachable just now → show the manual controls
  let pending = null; // AI-understood records awaiting the glance-and-tap
  let descSkill = ""; // which skill's descriptors are open in the config panel
  let openHistory = ""; // "<who>|<skill>" whose full level trail is showing
  let openSource = ""; // which record is showing what it was translated from

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
  // The first-seeded profile set (level/EAL-flavoured) — upgraded to the
  // standards-first set ONLY when still factory-fresh and nothing's been filled.
  const OLD_PROFILE_FIELDS = ["reading level", "writing level", "maths", "learning needs (SEN / EAL)", "medical", "parent & home", "general notes"];
  // The first-seeded word scale — upgraded to numbers ONLY when factory-fresh
  // and no record has ever used a level (else stored levels would orphan).
  const OLD_WORD_LEVELS = ["exceeding", "meeting", "developing", "beginning"];
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
    // Standards-first framing: strengths + targets per area (what they CAN do and
    // the next step), never deficit labels. All renameable — it's your list.
    profileFields: [
      "reading — strengths",
      "reading — targets",
      "writing — strengths",
      "writing — targets",
      "maths — strengths",
      "maths — targets",
      "speaking & listening",
      "access & support needs",
      "medical",
      "home & parent notes",
      "general notes",
    ],
    profiles: {},
    // Judgements decay: after this many days, a level counts as "getting old —
    // worth fresh evidence". A fact about the record, never about anyone.
    staleDays: 60,
    // Skills/standards to track evidence against — YOUR list (paste the school's
    // when you have it), one per line. Empty = the whole feature stays hidden.
    topics: [],
    // The working scale — numbers for YOUR quick read (strongest first). The
    // parent words below are what an export says instead; both editable.
    levels: ["4", "3", "2", "1"],
    // Names for those numbers, and WHICH ONE IS THE TARGET. On a four-point
    // standards scale the target is 3, not 4 — most people are meant to sit
    // there, and 4 means going beyond. Seeded onto the factory scale only;
    // a scale you've edited or already used is never renamed underneath you.
    levelNames: { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" },
    targetLevel: "3",
    // skill → { level → what that looks like }. Optional everywhere. Written
    // once per skill and reused for years; never a per-task rubric.
    descriptors: {},
    // skill → [framework codes]. One statement in your words, many frameworks.
    skillTags: {},
    levelParentWords: [
      "working beyond grade-level expectations",
      "meeting grade-level expectations",
      "developing towards grade-level expectations",
      "beginning — needs support with this skill",
    ],
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
      topics: list(c.topics),
      levels: list(c.levels, true),
      levelParentWords: list(c.levelParentWords),
      levelNames: c.levelNames && typeof c.levelNames === "object" ? { ...c.levelNames } : {},
      targetLevel: (c.targetLevel || "").toString().trim(),
      descriptors: c.descriptors && typeof c.descriptors === "object" ? JSON.parse(JSON.stringify(c.descriptors)) : {},
      skillTags: c.skillTags && typeof c.skillTags === "object" ? JSON.parse(JSON.stringify(c.skillTags)) : {},
      staleDays: Number(c.staleDays) > 0 ? Math.min(Math.round(Number(c.staleDays)), 365) : 60,
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
    if (!out.levels.length) out.levels = DEFAULT_CONFIG.levels.slice();
    if (!out.levelParentWords.length && JSON.stringify(out.levels) === JSON.stringify(DEFAULT_CONFIG.levels))
      out.levelParentWords = DEFAULT_CONFIG.levelParentWords.slice();
    if (!out.profileFields.length) out.profileFields = DEFAULT_CONFIG.profileFields.slice();
    // Factory-fresh old profile set + nothing filled yet → the standards-first
    // set. Any edit or any filled profile leaves the user's words alone.
    if (
      JSON.stringify(out.profileFields) === JSON.stringify(OLD_PROFILE_FIELDS) &&
      !Object.keys(out.profiles).length
    )
      out.profileFields = DEFAULT_CONFIG.profileFields.slice();
    if (!Object.keys(out.fields).length) out.fields = JSON.parse(JSON.stringify(DEFAULT_CONFIG.fields));
    if (out.note === OLD_DEFAULT_NOTE) out.note = DEFAULT_CONFIG.note; // factory text only — an edited note is never touched
    OrganiserLevels.normalise(out); // names, target, descriptors, framework tags
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
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function fmtLocalDT(d) {
    return `${isoOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // A reminder for a dated follow-up: the morning before it's due; the morning
  // itself when that's already gone; "in about an hour" when it's due today.
  function remindForDate(dateIso) {
    const today = todayISO();
    if (dateIso && dateIso > today) {
      const before = addDaysISO(dateIso, -1);
      const at9 = (iso) => `${iso}T09:00`;
      if (before > today) return at9(before);
      if (before === today && new Date() < new Date(at9(today))) return at9(today);
      return at9(dateIso);
    }
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    soon.setMinutes(soon.getMinutes() - (soon.getMinutes() % 15), 0, 0);
    return fmtLocalDT(soon);
  }
  // The killer integration: the follow-up becomes a REAL task in the normal
  // queue — dated tomorrow so it surfaces in the ordinary lists/shortlist, with
  // a morning reminder that comes and finds you (s28). No separate place to check.
  function spawnFollowUpTask(rec, dueDate) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dueDate || "") ? dueDate : isoOf(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const t = {
      id: uid(),
      title: `Follow up: ${rec.summary}${rec.who ? ` (${rec.who})` : ""}`,
      type: "task",
      date,
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: "quick",
      tags: (rec.tags || []).slice(0, 4),
      whenText: "",
      goalId: "",
      openLoop: false,
      promisedTo: "",
      remindAt: remindForDate(date),
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
      topic: $("#recTopic").value || "",
      level: $("#recLevel").value || "",
      tags: $("#recTags").value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4),
      followUp: false,
      taskId: "",
      src: "hand", // you typed it yourself — nothing to double-check
      checkedAt: nowISO(),
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

  // ----- evidence files: the actual work behind a judgement -----
  // Real files in data/files/ (owned, syncs with the folder); the record keeps
  // only small references. Needs the server, so preview mode hides the controls.
  async function uploadEvidence(rec, file) {
    try {
      // Filed into a plain, grabbable folder: data/files/students/<who>/…
      const folder = "students/" + (rec.who || "_unfiled");
      const r = await fetch(
        "/api/upload?name=" + encodeURIComponent(file.name) + "&folder=" + encodeURIComponent(folder),
        { method: "POST", body: file }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setStatus(j.message || "Couldn't save that file.");
        return;
      }
      const d = await r.json();
      if (!rec.files) rec.files = [];
      rec.files.push({ id: d.id, name: d.name, addedAt: nowISO() });
      persistRecords();
      setStatus("Work attached. ✓");
      render();
    } catch {
      setStatus("Couldn't save that file — is the app window still open?");
    }
  }
  function removeEvidence(rec, f) {
    if (!confirm(`Remove "${f.name}" from this record? The file is deleted too.`)) return;
    fetch("/files/" + String(f.id).split("/").map(encodeURIComponent).join("/"), { method: "DELETE" }).catch(() => {});
    rec.files = (rec.files || []).filter((x) => x.id !== f.id);
    persistRecords();
    render();
  }

  // ----- the AI way in: one messy line → understood records (core pillar) -----
  // The AI is handed ONLY the log's own vocabulary (IDs, kinds, fields — data),
  // and nothing files without the glance-and-tap below. AI off or unreachable →
  // the manual boxes are right there; nothing is lost.
  async function sortNote() {
    const text = $("#recSummary").value.trim();
    if (!text) return;
    const btn = $("#recAddBtn");
    btn.disabled = true;
    btn.textContent = "Sorting…";
    setStatus("Reading what you wrote…");
    try {
      const r = await fetch("/api/record-understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          today: todayISO(),
          now: new Date().toLocaleString(undefined, {
            weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
          }),
          config: {
            whoIds: config.whoIds,
            types: config.types,
            fields: config.fields || {},
            topics: config.topics || [],
            levels: config.topics.length ? config.levels || [] : [],
          },
        }),
      });
      if (!r.ok) throw new Error("http " + r.status);
      const d = await r.json();
      const recs = Array.isArray(d.records) ? d.records : [];
      if (!recs.length) {
        setStatus("I couldn't find a record in that — a few more words?");
        return;
      }
      pending = recs.map((x) => ({
        who: x.who || "", // unknown stays blank — you pick, it never guesses an ID
        type: x.type,
        summary: x.summary,
        tags: x.tags || [],
        extra: x.details || {},
        topic: x.topic || "",
        level: x.level || "",
        followUp: x.follow_up === true,
        fuDate: x.follow_up_date || "",
      }));
      $("#recSummary").value = "";
      setStatus("");
      render();
    } catch {
      aiFallback = true; // show the manual boxes for this one — nothing lost
      setStatus("Can't reach the AI right now — pick the boxes and add it by hand instead.");
      render();
    } finally {
      btn.disabled = false;
      applyAddMode();
    }
  }

  function addPendingAll() {
    if (!pending || !pending.length) return;
    if (pending.some((p) => !p.who)) {
      setStatus("One of them needs a who — pick the ID and add again.");
      return;
    }
    let spawned = 0;
    pending.forEach((p) => {
      const rec = {
        id: uid(),
        who: p.who,
        date: todayISO(),
        type: p.type,
        summary: p.summary,
        detail: "",
        extra: p.extra || {},
        topic: p.topic || "",
        level: p.level || "",
        tags: (p.tags || []).slice(0, 4),
        followUp: p.followUp === true,
        taskId: "",
        src: "ai", // heard by the AI — wears "check me" until you confirm it
        checkedAt: null,
        createdAt: nowISO(),
      };
      records.unshift(rec);
      if (rec.followUp) {
        spawnFollowUpTask(rec, p.fuDate);
        spawned++;
      }
    });
    const n = pending.length;
    pending = null;
    if (spawned) persistAll();
    else persistRecords();
    setStatus(
      `Logged ${n === 1 ? "it" : n + " records"}.` +
        (spawned ? ` ${spawned === 1 ? "A follow-up task is" : spawned + " follow-up tasks are"} in your list, reminder set. ✓` : " ✓")
    );
    render();
  }

  function renderPending() {
    const box = $("#recPending");
    const list = $("#recPendingList");
    if (!box || !list) return;
    if (!pending || !pending.length) {
      box.hidden = true;
      list.innerHTML = "";
      return;
    }
    box.hidden = false;
    list.innerHTML = "";
    pending.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "rec-pend-card";
      const filled = Object.entries(p.extra || {}).filter(([, v]) => (v || "").trim());
      card.innerHTML = `
        <div class="rec-add-row">
          <select class="rp-who" aria-label="Who"></select>
          <select class="rp-type" aria-label="Kind"></select>
          <input class="rp-summary" type="text" value="${escapeHtml(p.summary)}" aria-label="What happened" />
          <button class="x-del rp-remove" type="button" title="Remove this one">×</button>
        </div>
        <div class="rec-add-row rec-add-row2">
          <input class="rp-tags" type="text" value="${escapeHtml((p.tags || []).join(", "))}" placeholder="tags" aria-label="Tags" />
          <label class="rec-fu"><input class="rp-fu" type="checkbox" ${p.followUp ? "checked" : ""} /> needs a follow-up${p.fuDate ? ` (by ${escapeHtml(friendlyDate(p.fuDate))})` : ""}</label>
        </div>
        ${
          filled.length || p.topic || p.level
            ? `<div class="rec-extra-line">${p.topic ? `<span class="topic-chip">${escapeHtml(p.topic)}</span> ` : ""}${p.level ? `<span class="level-chip">${escapeHtml(p.level)}</span> ` : ""}${filled.map(([k, v]) => `<span class="rec-extra-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}`).join(" · ")} <span class="rec-extra-hint">— tweak after adding</span></div>`
            : ""
        }`;
      const whoSel = card.querySelector(".rp-who");
      const typeSel = card.querySelector(".rp-type");
      if (!p.who) whoSel.appendChild(new Option("— who? —", "")); // never guessed for you
      config.whoIds.forEach((w) => whoSel.appendChild(new Option(w, w)));
      config.types.forEach((t) => typeSel.appendChild(new Option(t, t)));
      whoSel.value = p.who;
      typeSel.value = p.type;
      whoSel.addEventListener("change", (e) => (p.who = e.target.value));
      typeSel.addEventListener("change", (e) => (p.type = e.target.value));
      card.querySelector(".rp-summary").addEventListener("input", (e) => (p.summary = e.target.value));
      card.querySelector(".rp-tags").addEventListener("input", (e) => {
        p.tags = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4);
      });
      card.querySelector(".rp-fu").addEventListener("change", (e) => (p.followUp = e.target.checked));
      card.querySelector(".rp-remove").addEventListener("click", () => {
        pending.splice(i, 1);
        render();
      });
      list.appendChild(card);
    });
  }

  // With AI on, the add bar is just the one box (the app sorts; you don't) —
  // the who/kind/tags/follow-up boxes reappear if the AI can't be reached.
  function applyAddMode() {
    const ai = aiAvailable && !aiFallback;
    $("#recWho").hidden = ai;
    $("#recType").hidden = ai;
    $("#recTags").hidden = ai;
    $("#recFollowUp").parentElement.hidden = ai;
    const showTL = !ai && config && config.topics.length > 0;
    $("#recTopic").hidden = !showTL;
    $("#recLevel").hidden = !showTL;
    $("#recAddBtn").textContent = ai ? "Sort it" : "Add";
    $("#recSummary").placeholder = ai
      ? "say it messily — who, what happened, what needs chasing"
      : "One line — what happened?";
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
  // AI-heard and not yet personally confirmed (§ trust): a record you typed
  // yourself, or one from before this existed, never wears the chip.
  function needsCheck(rec) {
    return rec.src === "ai" && !rec.checkedAt;
  }
  function visibleRecords() {
    return records.filter((r) => {
      if (filters.who && r.who !== filters.who) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.topic && r.topic !== filters.topic) return false;
      if (filters.tag && !(r.tags || []).some((t) => t.includes(filters.tag))) return false;
      if (!withinRange(r, filters.range)) return false;
      if (filters.openOnly && !isFollowUpOpen(r)) return false;
      if (filters.unchecked && !needsCheck(r)) return false;
      return true;
    });
  }
  function newestFirst(a, b) {
    return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  }
  // ----- evidence → level views (computed, never stored) -----
  // A judgement is only ever the LATEST evidenced record — update where you have
  // evidence, nothing else moves. Both views are derived fresh from the same
  // records each time (describes, never scores; no tally kept anywhere).
  // One topic across everyone: each ID appears once, at their latest level,
  // grouped in the scale's own order (unknown levels trail).
  function topicDistribution(topic) {
    const byWho = new Map();
    records.forEach((r) => {
      if (r.topic !== topic || !r.level || !r.who) return;
      const key = (r.date || "") + "|" + (r.createdAt || "");
      const cur = byWho.get(r.who);
      if (!cur || key > cur.key) byWho.set(r.who, { level: r.level, key });
    });
    const groups = new Map();
    [...byWho.entries()].forEach(([who, v]) => {
      if (!groups.has(v.level)) groups.set(v.level, []);
      groups.get(v.level).push(who);
    });
    // Weakest-first, matching every other place a scale is shown. Storage runs
    // strongest-first and always has; display must not, or two views of the same
    // scale read in opposite directions and you stop trusting either.
    const asc = OrganiserLevels.ascending(config);
    const order = asc.concat([...groups.keys()].filter((l) => !asc.includes(l)));
    return order
      .filter((l) => groups.has(l))
      .map((l) => `${l}: ${groups.get(l).sort().join(", ")}`)
      .join("  ·  ");
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

  // ----- the parent-meeting export (shared engine in export.js) -----
  // One student, one self-contained page: parent words only, confirmed evidence
  // only, work images embedded. The status tells the teacher what was left out
  // AND which skills' newest evidence is still unconfirmed (freshness honesty).
  // The single-student export goes through the same read as the class-wide
  // ones. It's the only text in this app that leaves the building with a
  // child's name on it, so it's the only place the cheap confirm isn't enough.
  function exportParentSummary() {
    const who = filters.who;
    if (!who) return;
    const host = $("#recStatus").parentElement || document.body;
    const panel = OrganiserExport.reviewPanel([who], records, config, (go) => {
      panel.remove();
      if (go) doExportParentSummary(who);
      else setStatus("Left it for now — nothing was written.");
    });
    host.insertBefore(panel, $("#recStatus").nextSibling);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function doExportParentSummary(who) {
    setStatus("Preparing the export…");
    const s = await OrganiserExport.studentSection(who, records, config);
    OrganiserExport.download(`${who}-progress-${todayISO()}.html`, OrganiserExport.docShell(`${who} — progress summary`, s.html));
    setStatus(
      `Exported ${who}'s summary. ✓` +
        (s.excluded ? ` ${s.excluded} AI-sorted record${s.excluded === 1 ? "" : "s"} left out — confirm to include.` : "") +
        (s.stale.length ? ` Newest evidence still unconfirmed for: ${s.stale.join(", ")}.` : "") +
        (s.old.length ? ` The level shown is getting old for: ${s.old.join(", ")} — worth fresh evidence.` : "")
    );
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
        <span class="rec-prof-actions">
          ${OrganiserStore.mode === "file" && (config.topics || []).length ? `<button class="link prof-export" type="button">export for a parent meeting</button>` : ""}
          <button class="link prof-toggle" type="button">${profileEdit ? "done" : filled.length ? "edit" : "+ add profile notes"}</button>
        </span>
      </div>`;
    const exp = box.querySelector(".prof-export");
    if (exp) exp.addEventListener("click", exportParentSummary);
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
    // WHERE THEY STAND — the skill as a line, the levels as boxes, the person
    // sitting in one of them. Every skill gets a row, including the ones with
    // nothing in them: a skill with no evidence and a skill they're doing fine
    // at must never look the same.
    if (config.topics.length && config.levels.length) {
      const extra = [...new Set(records.filter((r) => r.who === who && r.topic && r.level).map((r) => r.topic))].filter(
        (t) => !config.topics.includes(t)
      );
      const wrap = document.createElement("div");
      wrap.className = "sk-lines";
      config.topics.concat(extra).forEach((skill) => wrap.appendChild(skillLine(who, skill)));
      box.appendChild(wrap);
    }
    box.querySelector(".prof-toggle").addEventListener("click", () => {
      profileEdit = !profileEdit;
      render();
    });
  }

  // ONE SKILL, ONE PERSON — the row that the whole assessment layer is for.
  //
  // Drawn as a line of boxes with the person sitting in one, because a number in
  // a list doesn't answer "where are they, and where should they be?" at a
  // glance and a line does.
  //
  // Deliberately NOT a red-to-green gradient. The target is usually not the top
  // of the scale, and colouring it as a temperature makes reaching the goal look
  // like a near-miss. The target gets a quiet marker; the levels stay neutral.
  function skillLine(who, skill) {
    const L = OrganiserLevels;
    const row = document.createElement("div");
    row.className = "sk-row";
    const current = L.currentFor(records, who, skill);
    const history = L.historyFor(records, who, skill);
    const target = L.targetLevel(config);

    const head = document.createElement("div");
    head.className = "sk-head";
    const name = document.createElement("span");
    name.className = "sk-name";
    name.textContent = skill;
    head.appendChild(name);
    // One statement, many frameworks — the codes ride along on the skill.
    L.skillTags(config, skill).forEach((t) => {
      const chip = document.createElement("span");
      chip.className = "sk-tag";
      chip.textContent = t;
      head.appendChild(chip);
    });
    row.appendChild(head);

    const line = document.createElement("div");
    line.className = "sk-boxes";
    L.ascending(config).forEach((lv) => {
      const b = document.createElement("button");
      b.type = "button";
      const here = current && String(current.level) === lv;
      b.className = "sk-box" + (here ? " here" : "") + (lv === target ? " target" : "");
      b.textContent = lv;
      const nm = L.levelName(config, lv);
      const desc = L.descriptor(config, skill, lv);
      b.title =
        (nm ? `${lv} — ${nm}` : `Level ${lv}`) +
        (lv === target ? " (the target)" : "") +
        (desc ? `\n${desc}` : "") +
        (here ? "\n\nTap to see the evidence behind this" : "");
      if (here) {
        b.addEventListener("click", () => {
          filters.topic = filters.topic === skill ? "" : skill;
          render();
        });
      } else {
        b.disabled = true; // an empty box isn't a claim about anyone
      }
      line.appendChild(b);
    });
    row.appendChild(line);

    const foot = document.createElement("div");
    foot.className = "sk-foot";
    if (current) {
      // A level from four days ago and a level from four months ago are
      // different facts, so the date is part of the answer, not a footnote.
      const asOf = L.asOf(current);
      const old = asOf && asOf < OrganiserExport.oldCutoffISO(config);
      const when = document.createElement("span");
      when.className = "sk-when" + (old ? " old" : "");
      const conf = L.lastConfirmed(current);
      when.textContent =
        (L.levelName(config, current.level) ? L.levelName(config, current.level) + " · " : "") +
        friendlyDate(current.date) +
        (conf && conf > current.date ? ` · checked again ${friendlyDate(conf)}` : "") +
        (old ? " · getting old" : "");
      foot.appendChild(when);
      // Confidence is not evidence. A level held for months by observation has
      // nothing an export can show, so it says so rather than looking settled.
      const work = L.workFor(records, who, skill);
      const w = document.createElement("span");
      w.className = "sk-work" + (work ? "" : " none");
      w.textContent = work ? `${work} piece${work === 1 ? "" : "s"} of work on file` : "nothing on file to show";
      foot.appendChild(w);
      if (history.length > 1) {
        const h = document.createElement("button");
        h.type = "button";
        h.className = "link sk-hist";
        const key = who + "|" + skill;
        h.textContent = openHistory === key ? "hide the trail" : `${history.length} levels recorded`;
        h.addEventListener("click", () => {
          openHistory = openHistory === key ? "" : key;
          render();
        });
        foot.appendChild(h);
      }
    } else {
      const none = document.createElement("span");
      none.className = "sk-none";
      none.textContent = "no evidence yet";
      foot.appendChild(none);
    }
    row.appendChild(foot);

    if (openHistory === who + "|" + skill) row.appendChild(levelTrail(history));
    return row;
  }

  // THE TRAIL — every level ever recorded, oldest change visible, nothing
  // overwritten and nothing removable from here.
  //
  // Kept because the progression is the valuable part ("here's September, here's
  // now" beats one current number in front of a parent), and because a
  // questioned judgement needs the working, not just the conclusion. Storage is
  // a non-issue: a photo of a page is a few hundred KB.
  function levelTrail(history) {
    const L = OrganiserLevels;
    const box = document.createElement("div");
    box.className = "sk-trail";
    history.forEach((r, i) => {
      const line = document.createElement("div");
      line.className = "sk-trailrow";
      const prev = history[i + 1];
      const moved = prev && String(prev.level) !== String(r.level);
      line.innerHTML =
        `<span class="sk-tlvl">${escapeHtml(L.levelLabel(config, r.level))}</span>` +
        `<span class="sk-tdate">${escapeHtml(friendlyDate(r.date))}</span>` +
        (moved ? `<span class="sk-moved">moved from ${escapeHtml(String(prev.level))}</span>` : "") +
        (L.confirmations(r).length ? `<span class="sk-tconf">confirmed again ${L.confirmations(r).length}×</span>` : "") +
        `<span class="sk-tsum">${escapeHtml(r.summary || "")}</span>`;
      (r.files || []).forEach((f) => {
        const a = document.createElement("a");
        a.className = "sk-tfile";
        a.href = "/files/" + String(f.id).split("/").map(encodeURIComponent).join("/");
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = f.name;
        line.appendChild(a);
      });
      box.appendChild(line);
    });
    return box;
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

  // The gradual details area (open per record): who/kind/tags fixable any time
  // (completes confirm-or-edit), the kind's optional fields — pre-labelled,
  // blank-is-fine, fill any time — plus the free longer note.
  function detailArea(rec) {
    const wrap = document.createElement("div");
    wrap.className = "rec-detail-area";

    const head = document.createElement("div");
    head.className = "rec-extra-fields";
    const mkSel = (labelText, values, current, apply, allowEmpty) => {
      const label = document.createElement("label");
      label.className = "cb-field";
      label.innerHTML = `<span class="cb-lbl">${escapeHtml(labelText)}</span>`;
      const sel = document.createElement("select");
      if (allowEmpty) sel.appendChild(new Option("—", ""));
      values.forEach((v) => sel.appendChild(new Option(v, v)));
      if (![...sel.options].some((o) => o.value === current)) sel.appendChild(new Option(current, current));
      sel.value = current;
      sel.addEventListener("change", (e) => {
        apply(e.target.value);
        persistRecords();
        render();
      });
      label.appendChild(sel);
      head.appendChild(label);
    };
    mkSel("Who", config.whoIds, rec.who, (v) => (rec.who = v));
    mkSel("Kind", config.types, rec.type, (v) => (rec.type = v));
    if (config.topics.length) {
      mkSel("Skill / standard", config.topics, rec.topic || "", (v) => (rec.topic = v), true);
      mkSel("Level", config.levels, rec.level || "", (v) => (rec.level = v), true);
    }
    const tagLabel = document.createElement("label");
    tagLabel.className = "cb-field";
    tagLabel.innerHTML = `<span class="cb-lbl">Tags</span>`;
    const tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.value = (rec.tags || []).join(", ");
    tagInput.addEventListener("change", (e) => {
      rec.tags = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4);
      persistRecords();
      render();
    });
    tagLabel.appendChild(tagInput);
    head.appendChild(tagLabel);
    wrap.appendChild(head);

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

    // the work itself — proof you can open in a parent meeting
    if (OrganiserStore.mode === "file") {
      const fw = document.createElement("div");
      fw.className = "rec-files";
      (rec.files || []).forEach((f) => {
        const line = document.createElement("div");
        line.className = "rec-file-line";
        const a = document.createElement("a");
        a.href = "/files/" + String(f.id).split("/").map(encodeURIComponent).join("/");
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = f.name;
        const del = document.createElement("button");
        del.className = "x-del";
        del.type = "button";
        del.title = "Remove this file";
        del.textContent = "×";
        del.addEventListener("click", () => removeEvidence(rec, f));
        line.append(a, del);
        fw.appendChild(line);
      });
      const attach = document.createElement("label");
      attach.className = "rec-attach";
      attach.textContent = "+ attach a piece of work (photo / file)";
      const inp = document.createElement("input");
      inp.type = "file";
      inp.hidden = true;
      inp.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) uploadEvidence(rec, f);
        e.target.value = "";
      });
      attach.appendChild(inp);
      fw.appendChild(attach);
      wrap.appendChild(fw);
    }
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
    const fileCount = (rec.files || []).length;
    const hasDetails = filledExtra.length || (rec.detail || "").trim() || fileCount;
    const unchecked = needsCheck(rec);
    row.innerHTML = `
      <div class="rec-main">
        <div class="rec-line">
          <span class="rec-who">${escapeHtml(rec.who)}</span>
          <span class="rec-type">${escapeHtml(rec.type)}</span>
          <span class="rec-date">${escapeHtml(friendlyDate(rec.date))}</span>
          ${rec.topic ? `<span class="topic-chip">${escapeHtml(rec.topic)}</span>` : ""}
          ${rec.level ? `<span class="level-chip">${escapeHtml(rec.level)}</span>` : ""}
          ${fileCount ? `<span class="files-chip">${fileCount} piece${fileCount === 1 ? "" : "s"} of work</span>` : ""}
          ${(rec.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          ${fuLabel ? `<span class="rec-fu-chip ${open ? "open" : "closed"}">${fuLabel}</span>` : ""}
          ${
            unchecked
              ? (rec.ungrounded || []).length
                ? `<button class="ai-chip ungrounded" type="button" title="The ${escapeHtml((rec.ungrounded || []).join(" and "))} here isn't in the words you wrote — the AI produced it and I can't tell where from. Worth more than a glance.">check the ${escapeHtml((rec.ungrounded || []).join(" & "))} · not in your words</button>`
                : `<button class="ai-chip" type="button" title="The AI heard this from your words — worth a quick check">AI-sorted · check me</button>`
              : ""
          }
          ${rec.sourceText ? `<button class="src-chip" type="button" title="Show what this was translated from">original</button>` : ""}
        </div>
        <input class="rec-summary-input" type="text" value="${escapeHtml(rec.summary)}" aria-label="What happened (editable)" />
        ${filledExtra.length ? `<div class="rec-extra-line">${filledExtra.map(([k, v]) => `<span class="rec-extra-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}`).join(" · ")}</div>` : ""}
        ${
          confirmingId === rec.id && unchecked
            ? `<div class="ai-check-row">
                 <button class="link ai-ok" type="button">looks right ✓</button>
                 <button class="link ai-edit" type="button">let me fix it</button>
                 <button class="link ai-remove" type="button">remove it</button>
               </div>`
            : ""
        }
      </div>
      <div class="rec-actions">
        <button class="link rec-note-btn" type="button">${expandedId === rec.id ? "hide details" : hasDetails ? "details" : "+ details"}</button>
        <button class="link rec-fu-btn" type="button">${rec.followUp ? "clear follow-up" : "needs follow-up"}</button>
        <button class="x-del" type="button" title="Delete record">×</button>
      </div>`;
    const srcChip = row.querySelector(".src-chip");
    if (srcChip)
      srcChip.addEventListener("click", () => {
        openSource = openSource === rec.id ? "" : rec.id;
        render();
      });
    if (openSource === rec.id && rec.sourceText) {
      const orig = document.createElement("div");
      orig.className = "rec-source";
      orig.innerHTML = `<span class="rec-extra-k">it read this:</span> ${escapeHtml(rec.sourceText)}`;
      row.querySelector(".rec-main").appendChild(orig);
    }
    if (expandedId === rec.id) row.querySelector(".rec-main").appendChild(detailArea(rec));
    const summaryInput = row.querySelector(".rec-summary-input");
    summaryInput.addEventListener("change", (e) => {
      const v = e.target.value.trim();
      if (v) rec.summary = v;
      else e.target.value = rec.summary; // blank quietly reverts
      persistRecords();
    });
    const aiChip = row.querySelector(".ai-chip");
    if (aiChip)
      aiChip.addEventListener("click", () => {
        confirmingId = confirmingId === rec.id ? null : rec.id;
        render();
      });
    const aiOk = row.querySelector(".ai-ok");
    if (aiOk)
      aiOk.addEventListener("click", () => {
        rec.checkedAt = nowISO(); // your eyes on it — the chip retires for good
        confirmingId = null;
        persistRecords();
        render();
      });
    const aiEdit = row.querySelector(".ai-edit");
    if (aiEdit)
      aiEdit.addEventListener("click", () => {
        expandedId = rec.id; // open everything fixable; confirm when you're happy
        confirmingId = null;
        render();
      });
    const aiRemove = row.querySelector(".ai-remove");
    if (aiRemove) aiRemove.addEventListener("click", () => deleteRecord(rec.id));
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
    fillSelect("#recTopic", config.topics, "— skill —");
    fillSelect("#recLevel", config.levels, "— level —");
    fillSelect("#fTopic", config.topics, "every skill");
    $("#fTopic").hidden = !config.topics.length;
    $("#fTopic").value = filters.topic; // the levels-so-far buttons set this too
    $("#fWho").value = filters.who; // may arrive preset via ?who= from the Class page
    $("#fUnchecked").checked = filters.unchecked;
    applyAddMode();

    renderProfile();
    renderConfig();
    renderPending();

    const list = $("#recList");
    list.innerHTML = "";
    const visible = visibleRecords().sort(newestFirst);

    // The whole-class half of the two views: with a filter on (a kind, a tag, a
    // window, open follow-ups), name WHO the view touches — most-often first.
    // With a skill/standard picked, show where everyone stands on it instead
    // (each ID once, at their latest evidenced level).
    const line = $("#recViewLine");
    const filtering = filters.type || filters.tag || filters.topic || filters.openOnly || filters.range !== "all";
    if (line) {
      const dist = filters.topic && !filters.who ? topicDistribution(filters.topic) : "";
      if (dist) {
        line.textContent = dist;
        line.hidden = false;
      } else if (visible.length && !filters.who && filtering) {
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
    mk("Levels (comma-separated, strongest first)", (config.levels || []).join(", "), true, (v) => {
      const l = parseList(v, true);
      if (l.length) config.levels = l;
    });
    mk("Parent wording per level (comma-separated, same order — used by exports)", (config.levelParentWords || []).join(", "), true, (v) => {
      config.levelParentWords = parseList(v);
    });
    mk("A level counts as old after (days)", String(config.staleDays || 60), false, (v) => {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) config.staleDays = Math.min(n, 365);
    });
    // Skills/standards: one per line (these lists get long — paste and go).
    // Empty is fine: the whole levels feature stays out of the way until pasted.
    const areaLabel = document.createElement("label");
    areaLabel.className = "cb-field rec-cfg-wide";
    areaLabel.innerHTML = `<span class="cb-lbl">Skills / standards to track (one per line — paste your school's list; empty = feature off)</span>`;
    const ta = document.createElement("textarea");
    ta.className = "rec-topics-area";
    ta.rows = Math.min(10, Math.max(3, config.topics.length + 1));
    ta.value = config.topics.join("\n");
    ta.addEventListener("change", (e) => {
      config.topics = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 300);
      persistRecords();
      render();
    });
    areaLabel.appendChild(ta);
    area.appendChild(areaLabel);

    // Names for the levels, and which one is the TARGET. The target is not the
    // top: on a four-point scale most people are meant to sit at 3, and 4 means
    // beyond the standard. Without saying which is which, a scale silently
    // reads as "higher is better" and 3 looks like a near-miss.
    if ((config.levels || []).length) {
      const nameWrap = document.createElement("div");
      nameWrap.className = "cb-field rec-cfg-wide";
      nameWrap.innerHTML = `<span class="cb-lbl">Level names, and which level is the target (the one most people are meant to reach — usually not the top)</span>`;
      const rows = document.createElement("div");
      rows.className = "lvl-cfg";
      OrganiserLevels.ascending(config).forEach((lv) => {
        const row = document.createElement("label");
        row.className = "lvl-cfg-row";
        const tgt = document.createElement("input");
        tgt.type = "radio";
        tgt.name = "targetLevel";
        tgt.checked = OrganiserLevels.isTarget(config, lv);
        tgt.title = "Mark this level as the target";
        tgt.addEventListener("change", () => {
          config.targetLevel = lv;
          persistRecords();
          render();
        });
        const num = document.createElement("span");
        num.className = "lvl-cfg-num";
        num.textContent = lv;
        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "name (optional)";
        name.value = OrganiserLevels.levelName(config, lv);
        name.addEventListener("change", (e) => {
          if (!config.levelNames) config.levelNames = {};
          const v = e.target.value.trim();
          if (v) config.levelNames[lv] = v.slice(0, 40);
          else delete config.levelNames[lv];
          persistRecords();
          render();
        });
        row.append(tgt, num, name);
        rows.appendChild(row);
      });
      nameWrap.appendChild(rows);
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "link";
      clear.textContent = "no target level";
      clear.addEventListener("click", () => {
        config.targetLevel = "";
        persistRecords();
        render();
      });
      nameWrap.appendChild(clear);
      area.appendChild(nameWrap);
    }

    // Per-skill descriptors and framework codes. Both optional, both written
    // ONCE per skill and reused for years — these are not per-task rubrics.
    if ((config.topics || []).length && (config.levels || []).length) {
      const dWrap = document.createElement("div");
      dWrap.className = "cb-field rec-cfg-wide";
      dWrap.innerHTML =
        `<span class="cb-lbl">What each level looks like, per skill (optional)</span>` +
        `<p class="rec-cfg-hint">Writing only the <strong>target</strong> box is a complete approach in its own right — a third of the work, and it's the one you read while judging. The levels either side can stay blank on purpose. Write these once; they last for years.</p>`;
      const pick = document.createElement("select");
      pick.className = "desc-pick";
      pick.innerHTML =
        `<option value="">— pick a skill —</option>` +
        config.topics.map((t) => `<option value="${escapeHtml(t)}"${descSkill === t ? " selected" : ""}>${escapeHtml(t)}${OrganiserLevels.hasDescriptors(config, t) ? " ✓" : ""}</option>`).join("");
      pick.addEventListener("change", (e) => {
        descSkill = e.target.value;
        render();
      });
      dWrap.appendChild(pick);
      if (descSkill && config.topics.includes(descSkill)) dWrap.appendChild(descriptorEditor(descSkill));
      area.appendChild(dWrap);
    }
  }

  // One skill's descriptors + framework codes. Target level first and marked,
  // because that's the one worth writing if only one gets written.
  function descriptorEditor(skill) {
    const box = document.createElement("div");
    box.className = "desc-editor";
    const target = OrganiserLevels.targetLevel(config);
    const order = OrganiserLevels.ascending(config).slice().sort((a, b) => (a === target ? -1 : b === target ? 1 : 0));
    order.forEach((lv) => {
      const row = document.createElement("label");
      row.className = "desc-row" + (lv === target ? " target" : "");
      const head = document.createElement("span");
      head.className = "desc-lvl";
      head.textContent = OrganiserLevels.levelLabel(config, lv) + (lv === target ? "  ← the target" : "");
      const ta = document.createElement("textarea");
      ta.rows = lv === target ? 3 : 2;
      ta.placeholder = lv === target ? "what reaching this skill looks like" : "optional — can stay blank";
      ta.value = OrganiserLevels.descriptor(config, skill, lv);
      ta.addEventListener("change", (e) => {
        OrganiserLevels.setDescriptor(config, skill, lv, e.target.value);
        persistRecords();
        render();
      });
      row.append(head, ta);
      box.appendChild(row);
    });
    // Framework codes: one statement in your words, many frameworks on top.
    const tagRow = document.createElement("label");
    tagRow.className = "cb-field";
    tagRow.innerHTML = `<span class="cb-lbl">Also counts as (framework codes, comma-separated — a US standard, a national curriculum objective, an IB practice…)</span>`;
    const tagIn = document.createElement("input");
    tagIn.type = "text";
    tagIn.value = OrganiserLevels.skillTags(config, skill).join(", ");
    tagIn.addEventListener("change", (e) => {
      OrganiserLevels.setSkillTags(config, skill, e.target.value.split(",").map((x) => x.trim()));
      persistRecords();
      render();
    });
    tagRow.appendChild(tagIn);
    box.appendChild(tagRow);
    return box;
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
    // Numbers-for-your-eyes upgrade: a factory word scale that has never judged
    // anything becomes the numeric scale (+ parent words for exports). A scale
    // that's been used or edited is never touched.
    if (JSON.stringify(config.levels) === JSON.stringify(OLD_WORD_LEVELS) && !records.some((r) => r.level)) {
      config.levels = DEFAULT_CONFIG.levels.slice();
      config.levelParentWords = DEFAULT_CONFIG.levelParentWords.slice();
      persistRecords();
    }
    // Same guard, one step later: a factory numeric scale that has still never
    // judged anything gains names and a target. Anything edited or used is left
    // exactly as it is — renaming someone's levels underneath them would be
    // worse than having no names at all.
    if (OrganiserLevels.seedNames(config, records)) persistRecords();

    // Arriving from the Class checklist: ?who=S03&unchecked=1 lands filtered.
    const qs = new URLSearchParams(location.search);
    const qWho = qs.get("who");
    if (qWho && config.whoIds.includes(qWho)) filters.who = qWho;
    if (qs.get("unchecked") === "1") filters.unchecked = true;
    // Arriving from a skill on the Class page: land ON that skill's evidence
    // rather than at the door being told to find it again in the filter.
    const qTopic = qs.get("topic");
    if (qTopic && config.topics.includes(qTopic)) filters.topic = qTopic;

    // Can the AI sort a messy note? (And wake it, so the first sort isn't slow.)
    if (OrganiserStore.mode === "file") {
      try {
        const r = await fetch("/api/health");
        const j = await r.json();
        aiAvailable = !!j.hasAI;
        if (aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
      } catch {
        aiAvailable = false;
      }
    }

    const submit = () => (aiAvailable && !aiFallback ? sortNote() : addRecord());
    $("#recAddBtn").addEventListener("click", submit);
    [$("#recSummary"), $("#recTags")].forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      })
    );
    $("#recPendAdd").addEventListener("click", addPendingAll);
    $("#recPendCancel").addEventListener("click", () => {
      pending = null;
      setStatus("");
      render();
    });
    applyAddMode();
    $("#fWho").addEventListener("change", (e) => {
      filters.who = e.target.value;
      profileEdit = false; // fresh person → read view first
      render();
    });
    $("#fType").addEventListener("change", (e) => {
      filters.type = e.target.value;
      render();
    });
    $("#fTopic").addEventListener("change", (e) => {
      filters.topic = e.target.value;
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
    $("#fUnchecked").addEventListener("change", (e) => {
      filters.unchecked = e.target.checked;
      render();
    });
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());

    render();
    $("#recSummary").focus();
  }

  init();
})();
