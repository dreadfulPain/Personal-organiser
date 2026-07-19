// The SEEING half. Renders the zones, ticks things off, and adds things.
// All storage goes through OrganiserStore (store.js) — this file never touches
// localStorage or the network directly for data.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };
  const TYPES = ["task", "appointment", "reminder", "note"];
  const IMPORTANCE = ["high", "normal", "low"];
  const EFFORT = ["quick", "medium", "draining"]; // §s21: how draining, not how important
  const SHORTLIST_CAP = 5; // "what matters today": keep it short — change here

  let items = []; // everything filed
  let waiting = []; // dumps saved while the AI sorter was unreachable
  let goals = []; // read-only here: the Goals page owns these; we only link/show them
  let pending = null; // the batch currently shown in the check-back
  let aiAvailable = false; // is AI sorting set up? (off during the storage phase)
  let clusterSuggestion = null; // a gentle "make this a goal?" offer, when the AI spots one
  const LS_DISMISSED_CLUSTERS = "organiser.dismissedClusters.v1"; // UI-only: don't re-nag
  let editingTimeId = null; // which Today item's time is being set right now (inline timeline)
  let editingItemId = null; // which item is open in the anywhere-editor (§s26: edit any task, anytime)

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
  function normaliseTags(t) {
    if (!Array.isArray(t)) return [];
    return t.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 4);
  }
  function importanceOf(it) {
    return IMPORTANCE.includes(it.importance) ? it.importance : "normal";
  }
  function effortOf(it) {
    return EFFORT.includes(it.effort) ? it.effort : "medium";
  }
  // Resolve a stored goalId to its current title. Returns "" if the goal was
  // deleted or never linked — so a stale link just shows nothing, never breaks.
  function goalTitleById(id) {
    if (!id) return "";
    const g = goals.find((x) => x && x.id === id);
    return g ? g.title || "" : "";
  }

  // ---------- open loops & reminders (§0.2 s28) ----------
  // remindAt is a local "YYYY-MM-DDTHH:MM" the server watches; when it arrives, a
  // real OS notification comes and finds you. The app proposes the time — earlier
  // than the deadline — so there's never date-math to do. remindedAt marks a
  // fired ping; changing the time clears it (re-arms).
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function fmtLocalDT(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function proposeRemindAt(it) {
    const now = new Date();
    // dated for a future day → the morning before it's due
    if (it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) && it.date > todayISO()) {
      const dayBefore = new Date(it.date + "T09:00:00");
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (dayBefore > now) return fmtLocalDT(dayBefore);
    }
    // due today / overdue / undated / morning-before already passed → nudge soon
    // (small things want closing in one sitting, not parking until tomorrow)
    const soon = new Date(now.getTime() + 60 * 60 * 1000);
    soon.setMinutes(soon.getMinutes() - (soon.getMinutes() % 15), 0, 0);
    return fmtLocalDT(soon);
  }
  function fmtRemind(it) {
    if (!it.remindAt) return "";
    const d = new Date(it.remindAt);
    if (isNaN(d)) return "";
    const when = `${friendlyDate(isoOf(d))} ${fmtTime(pad2(d.getHours()) + ":" + pad2(d.getMinutes()))}`;
    return it.remindedAt ? `pinged ${when}` : `pings ${when}`;
  }
  // s29: no deadline + no one waiting = nothing holding it — the ones that slip.
  function isFragile(it) {
    return it.type === "task" && !it.done && !it.date && !it.promisedTo;
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
        // §9 slice 2: let the AI confidently link a new item to an existing goal.
        goals: goals.map((g) => ({ id: g.id, title: g.title })),
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
    const out = {
      title: (it.title || "").toString().trim() || "Untitled",
      type,
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : "",
      time: normaliseTime(it.time),
      deadlineType: it.deadlineType === "hard" ? "hard" : "soft",
      importance: IMPORTANCE.includes(it.importance) ? it.importance : "normal",
      effort: EFFORT.includes(it.effort) ? it.effort : "medium",
      tags: normaliseTags(it.tags),
      whenText: (it.when_text || "").toString().trim(),
      // Only keep a link the AI was confident about AND that still exists.
      goalId: it.goalId && goalTitleById(it.goalId) ? it.goalId : "",
      openLoop: it.open_loop === true || it.openLoop === true,
      promisedTo: (it.promised_to || it.promisedTo || "").toString().trim().slice(0, 40),
      remindAt: typeof it.remindAt === "string" ? it.remindAt : "",
      remindedAt: null,
    };
    // s28: an open loop isn't properly logged until it has a trigger — and a hard
    // deadline deserves an early ping too. Proposed here, shown pre-filled in the
    // check-back, always yours to change.
    if (!out.remindAt && (out.openLoop || (out.deadlineType === "hard" && out.date))) {
      out.remindAt = proposeRemindAt(out);
    }
    return out;
  }

  async function onSort() {
    const text = $("#dump").value.trim();
    if (!text) return;

    // No AI yet (the storage phase): hand-entry. Take the line as one item and
    // let the user set the kind/date in the check-back. Still no fields to fill
    // before typing — you just type the thing.
    if (!aiAvailable) {
      pending = [{ title: text, type: "task", date: "", time: "", deadlineType: "soft", importance: "normal", effort: "medium", tags: [], whenText: "", goalId: "", openLoop: false, promisedTo: "", remindAt: "", remindedAt: null }];
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

  // ---------- the check-back: a glance, not a form ----------
  // Each card shows what was understood as one plain line. Everything is already
  // filled in, so the default is just: read it, add it. The controls live behind
  // a quiet "Adjust details" toggle — nothing is ever a required field (§ s23:
  // the confirm step must never feel like a form).
  function checkbackSummary(it) {
    const parts = [];
    parts.push(TYPE_LABEL[TYPES.includes(it.type) ? it.type : "task"]);
    let when = it.date ? friendlyDate(it.date) : "";
    const tl = fmtTime(it.time);
    if (tl) when = when ? `${when} · ${tl}` : tl;
    if (!when && it.whenText) when = capitalize(it.whenText);
    if (when) {
      const hard = it.deadlineType === "hard" && it.date;
      parts.push((hard ? "due " : "") + when);
    }
    const imp = importanceOf(it);
    if (imp === "high") parts.push("matters a lot");
    else if (imp === "low") parts.push("minor");
    const eff = effortOf(it);
    if (eff === "quick") parts.push("quick");
    else if (eff === "draining") parts.push("draining");
    if (it.openLoop) parts.push("needs finishing");
    if (it.promisedTo) parts.push("promised to " + it.promisedTo);
    const tags = Array.isArray(it.tags) ? it.tags : [];
    if (tags.length) parts.push(tags.join(", "));
    const gTitle = goalTitleById(it.goalId);
    if (gTitle) parts.push("part of " + gTitle);
    return parts.join(" · ");
  }

  // Shared by the check-back's Adjust panel and the anywhere-editor: the open-loop
  // / promise / reminder controls (§0.2 s28/s29). Mutates the passed item; the
  // caller decides what refresh/persist means.
  function loopRowHtml(it) {
    return `<div class="cb-row cb-row2">
        <label class="cb-field"><span class="cb-lbl">Needs finishing?</span>
          <select class="cb-loop" aria-label="Needs finishing (already started, not closed)">
            <option value="no" ${it.openLoop ? "" : "selected"}>No</option>
            <option value="yes" ${it.openLoop ? "selected" : ""}>Yes — prepped, not closed</option>
          </select>
        </label>
        <label class="cb-field cb-promise-field"><span class="cb-lbl">Promised to</span>
          <input class="cb-promise" type="text" value="${escapeHtml(it.promisedTo || "")}" placeholder="e.g. Sarah" aria-label="Promised to (someone waiting on it)" />
        </label>
        <label class="cb-field cb-remind-field"><span class="cb-lbl">Reminder</span>
          <input class="cb-remind" type="datetime-local" value="${escapeHtml(it.remindAt || "")}" aria-label="When the app should ping you" />
        </label>
      </div>`;
  }
  function wireLoopControls(card, it, onChange) {
    card.querySelector(".cb-loop").addEventListener("change", (e) => {
      it.openLoop = e.target.value === "yes";
      // s28: an open loop isn't properly logged until it has a trigger.
      if (it.openLoop && !it.remindAt) {
        it.remindAt = proposeRemindAt(it);
        it.remindedAt = null;
        card.querySelector(".cb-remind").value = it.remindAt;
      }
      onChange();
    });
    card.querySelector(".cb-promise").addEventListener("input", (e) => {
      it.promisedTo = e.target.value.trim().slice(0, 40);
      onChange();
    });
    card.querySelector(".cb-remind").addEventListener("change", (e) => {
      it.remindAt = e.target.value || "";
      it.remindedAt = null; // changing the time re-arms the ping
      onChange();
    });
  }

  function renderCheckback() {
    const list = $("#checkbackList");
    list.innerHTML = "";

    pending.forEach((it, i) => {
      const card = document.createElement("div");
      card.className = "cb-card";
      card.innerHTML = `
        <div class="cb-head">
          <input class="cb-title" type="text" value="${escapeHtml(it.title)}" aria-label="What it is" />
          <button class="cb-remove" type="button" aria-label="Remove this">remove</button>
        </div>
        <div class="cb-summary">${escapeHtml(checkbackSummary(it))}</div>
        <button class="cb-adjust" type="button" aria-expanded="false">Adjust details</button>
        <div class="cb-controls" hidden>
          <div class="cb-row">
            <select class="cb-type" aria-label="Kind">
              ${TYPES.map(
                (t) => `<option value="${t}" ${t === it.type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`
              ).join("")}
            </select>
            <input class="cb-date" type="date" value="${it.date}" aria-label="Date (optional)" />
            <input class="cb-time" type="time" value="${it.time || ""}" aria-label="Time (optional)" />
          </div>
          <div class="cb-row cb-row2">
            <label class="cb-field"><span class="cb-lbl">Importance</span>
              <select class="cb-importance" aria-label="Importance">
                <option value="high" ${it.importance === "high" ? "selected" : ""}>Matters a lot</option>
                <option value="normal" ${!it.importance || it.importance === "normal" ? "selected" : ""}>Normal</option>
                <option value="low" ${it.importance === "low" ? "selected" : ""}>Minor</option>
              </select>
            </label>
            <label class="cb-field"><span class="cb-lbl">Effort</span>
              <select class="cb-effort" aria-label="Effort">
                <option value="quick" ${it.effort === "quick" ? "selected" : ""}>Quick</option>
                <option value="medium" ${!it.effort || it.effort === "medium" ? "selected" : ""}>Medium</option>
                <option value="draining" ${it.effort === "draining" ? "selected" : ""}>Draining</option>
              </select>
            </label>
            <label class="cb-field cb-tags-field"><span class="cb-lbl">Tags</span>
              <input class="cb-tags" type="text" value="${escapeHtml((it.tags || []).join(", "))}" placeholder="e.g. work, family" aria-label="Tags (categories)" />
            </label>
            <label class="cb-field"><span class="cb-lbl">Deadline</span>
              <select class="cb-deadline" aria-label="Deadline type">
                <option value="soft" ${it.deadlineType !== "hard" ? "selected" : ""}>Soft / flexible</option>
                <option value="hard" ${it.deadlineType === "hard" ? "selected" : ""}>Hard (real)</option>
              </select>
            </label>
          </div>
          ${loopRowHtml(it)}
          ${
            goals.length
              ? `<div class="cb-row"><label class="cb-field cb-goal-field"><span class="cb-lbl">Part of a goal</span>
            <select class="cb-goal" aria-label="Part of a goal">
              <option value="">— none —</option>
              ${goals
                .map(
                  (g) =>
                    `<option value="${escapeHtml(g.id)}" ${g.id === it.goalId ? "selected" : ""}>${escapeHtml(g.title)}</option>`
                )
                .join("")}
            </select>
          </label></div>`
              : ""
          }
          ${it.whenText ? `<div class="cb-when">your words: “${escapeHtml(it.whenText)}”</div>` : ""}
        </div>
      `;
      const refreshSummary = () => {
        card.querySelector(".cb-summary").textContent = checkbackSummary(pending[i]);
      };
      card.querySelector(".cb-title").addEventListener("input", (e) => (pending[i].title = e.target.value));
      card.querySelector(".cb-type").addEventListener("change", (e) => {
        pending[i].type = e.target.value;
        refreshSummary();
      });
      card.querySelector(".cb-date").addEventListener("change", (e) => {
        pending[i].date = e.target.value;
        refreshSummary();
      });
      card.querySelector(".cb-time").addEventListener("change", (e) => {
        pending[i].time = e.target.value;
        refreshSummary();
      });
      card.querySelector(".cb-importance").addEventListener("change", (e) => {
        pending[i].importance = e.target.value;
        refreshSummary();
      });
      card.querySelector(".cb-effort").addEventListener("change", (e) => {
        pending[i].effort = e.target.value;
        refreshSummary();
      });
      card.querySelector(".cb-tags").addEventListener("input", (e) => {
        pending[i].tags = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4);
        refreshSummary();
      });
      card.querySelector(".cb-deadline").addEventListener("change", (e) => {
        pending[i].deadlineType = e.target.value;
        refreshSummary();
      });
      const goalSel = card.querySelector(".cb-goal");
      if (goalSel)
        goalSel.addEventListener("change", (e) => {
          pending[i].goalId = e.target.value;
          refreshSummary();
        });
      wireLoopControls(card, pending[i], refreshSummary);
      card.querySelector(".cb-remove").addEventListener("click", () => {
        pending.splice(i, 1);
        renderCheckback();
      });
      const adjustBtn = card.querySelector(".cb-adjust");
      const controls = card.querySelector(".cb-controls");
      adjustBtn.addEventListener("click", () => {
        const opening = controls.hidden;
        controls.hidden = !opening;
        adjustBtn.setAttribute("aria-expanded", String(opening));
        adjustBtn.textContent = opening ? "Hide details" : "Adjust details";
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
        deadlineType: it.deadlineType === "hard" ? "hard" : "soft",
        importance: IMPORTANCE.includes(it.importance) ? it.importance : "normal",
        effort: EFFORT.includes(it.effort) ? it.effort : "medium",
        tags: normaliseTags(it.tags),
        whenText: it.whenText || "",
        goalId: it.goalId && goalTitleById(it.goalId) ? it.goalId : "",
        openLoop: it.openLoop === true,
        promisedTo: (it.promisedTo || "").toString().trim().slice(0, 40),
        remindAt: typeof it.remindAt === "string" ? it.remindAt : "",
        remindedAt: null,
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
    checkForClusterGoal(); // the new items might complete a cluster worth offering
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

  // ---------- edit any task, anytime (§s26) ----------
  // The same not-a-form pattern as the check-back: everything pre-filled, nothing
  // required, blank is fine. Changes save as you make them (the store debounces);
  // "done" just closes the editor and re-files the item wherever it now belongs.
  // Works on any row — overdue or not.
  function itemEditor(it) {
    const card = document.createElement("div");
    card.className = "cb-card item-editor";
    card.innerHTML = `
      <div class="cb-head">
        <input class="cb-title" type="text" value="${escapeHtml(it.title)}" aria-label="What it is" />
        <button class="cb-remove" type="button" aria-label="Remove this completely">remove</button>
      </div>
      <div class="cb-row">
        <select class="cb-type" aria-label="Kind">
          ${TYPES.map((t) => `<option value="${t}" ${t === it.type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}
        </select>
        <input class="cb-date" type="date" value="${it.date || ""}" aria-label="Date (optional)" />
        <input class="cb-time" type="time" value="${it.time || ""}" aria-label="Time (optional)" />
      </div>
      <div class="cb-row cb-row2">
        <label class="cb-field"><span class="cb-lbl">Importance</span>
          <select class="cb-importance" aria-label="Importance">
            <option value="high" ${importanceOf(it) === "high" ? "selected" : ""}>Matters a lot</option>
            <option value="normal" ${importanceOf(it) === "normal" ? "selected" : ""}>Normal</option>
            <option value="low" ${importanceOf(it) === "low" ? "selected" : ""}>Minor</option>
          </select>
        </label>
        <label class="cb-field"><span class="cb-lbl">Effort</span>
          <select class="cb-effort" aria-label="Effort">
            <option value="quick" ${effortOf(it) === "quick" ? "selected" : ""}>Quick</option>
            <option value="medium" ${effortOf(it) === "medium" ? "selected" : ""}>Medium</option>
            <option value="draining" ${effortOf(it) === "draining" ? "selected" : ""}>Draining</option>
          </select>
        </label>
        <label class="cb-field cb-tags-field"><span class="cb-lbl">Tags</span>
          <input class="cb-tags" type="text" value="${escapeHtml((it.tags || []).join(", "))}" placeholder="e.g. work, family" aria-label="Tags (categories)" />
        </label>
        <label class="cb-field"><span class="cb-lbl">Deadline</span>
          <select class="cb-deadline" aria-label="Deadline type">
            <option value="soft" ${it.deadlineType !== "hard" ? "selected" : ""}>Soft / flexible</option>
            <option value="hard" ${it.deadlineType === "hard" ? "selected" : ""}>Hard (real)</option>
          </select>
        </label>
      </div>
      ${loopRowHtml(it)}
      ${
        goals.length
          ? `<div class="cb-row"><label class="cb-field cb-goal-field"><span class="cb-lbl">Part of a goal</span>
        <select class="cb-goal" aria-label="Part of a goal">
          <option value="">— none —</option>
          ${goals.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === it.goalId ? "selected" : ""}>${escapeHtml(g.title)}</option>`).join("")}
        </select>
      </label></div>`
          : ""
      }
      <div class="ed-actions"><button class="link ed-done" type="button">done editing</button></div>
    `;
    // Save as you go; don't re-render mid-edit (it would yank focus / jump zones).
    card.querySelector(".cb-title").addEventListener("change", (e) => {
      const v = e.target.value.trim();
      if (v) it.title = v;
      else e.target.value = it.title; // blank titles quietly revert
      persist();
    });
    card.querySelector(".cb-type").addEventListener("change", (e) => {
      it.type = TYPES.includes(e.target.value) ? e.target.value : it.type;
      persist();
    });
    card.querySelector(".cb-date").addEventListener("change", (e) => {
      it.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : "";
      persist();
    });
    card.querySelector(".cb-time").addEventListener("change", (e) => {
      it.time = normaliseTime(e.target.value);
      persist();
    });
    card.querySelector(".cb-importance").addEventListener("change", (e) => {
      it.importance = e.target.value;
      persist();
    });
    card.querySelector(".cb-effort").addEventListener("change", (e) => {
      it.effort = e.target.value;
      persist();
    });
    card.querySelector(".cb-tags").addEventListener("input", (e) => {
      it.tags = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4);
      persist();
    });
    card.querySelector(".cb-deadline").addEventListener("change", (e) => {
      it.deadlineType = e.target.value === "hard" ? "hard" : "soft";
      persist();
    });
    const goalSel = card.querySelector(".cb-goal");
    if (goalSel)
      goalSel.addEventListener("change", (e) => {
        it.goalId = e.target.value;
        persist();
      });
    wireLoopControls(card, it, persist);
    card.querySelector(".cb-remove").addEventListener("click", () => {
      if (!confirm("Remove this completely? It won't be kept in Looking back.")) return;
      items = items.filter((x) => x.id !== it.id);
      editingItemId = null;
      persist();
      renderZones();
    });
    card.querySelector(".ed-done").addEventListener("click", () => {
      editingItemId = null;
      renderZones(); // re-files the item wherever its edited date now puts it
    });
    return card;
  }
  function editLink(it) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-edit";
    btn.textContent = "edit";
    btn.setAttribute("aria-label", "Edit this");
    btn.addEventListener("click", () => {
      editingItemId = it.id;
      renderZones();
    });
    return btn;
  }

  function itemRow(it) {
    if (editingItemId === it.id) return itemEditor(it);
    const row = document.createElement("div");
    const imp = importanceOf(it);
    row.className = `item imp-${imp}`;
    const overdue = it.date && it.date < todayISO();
    let label = it.date ? friendlyDate(it.date) : it.whenText ? capitalize(it.whenText) : "";
    const tlabel = fmtTime(it.time);
    if (tlabel) label = label ? `${label} · ${tlabel}` : tlabel;
    const showDue = it.deadlineType === "hard" && it.date;
    const tags = Array.isArray(it.tags) ? it.tags : [];
    const impWord = imp === "high" ? "matters a lot" : imp === "low" ? "minor" : "";
    const eff = effortOf(it);
    const effWord = eff === "quick" ? "quick" : eff === "draining" ? "draining" : "";
    const part = goalTitleById(it.goalId);
    row.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type]}</span>
          ${it.openLoop ? `<span class="loop-chip">needs finishing</span>` : ""}
          ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(it.promisedTo)}</span>` : ""}
          ${impWord ? `<span class="imp-word imp-${imp}">${impWord}</span>` : ""}
          ${effWord ? `<span class="effort-word eff-${eff}">${effWord}</span>` : ""}
          ${label ? `<span class="when ${overdue ? "overdue" : ""}${showDue ? " due" : ""}">${showDue ? "due " : ""}${escapeHtml(label)}${overdue ? " · overdue" : ""}</span>` : ""}
          ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          ${part ? `<span class="part-of">part of: ${escapeHtml(part)}</span>` : ""}
          ${isFragile(it) ? `<span class="fragile-chip" title="No deadline and no one waiting — these slip easiest. A date or a promise gives it a hook.">nothing holding this</span>` : ""}
        </div>
      </div>`;
    row.querySelector(".tick").addEventListener("click", () => complete(it.id));
    row.appendChild(editLink(it));
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

  // ---------- Today as a timeline (folded onto the home, §s23 unified home) ----------
  // Today's section lays the day out: timed items in order with the gaps between
  // them called out, then an "anytime today" group — and you can give any task a
  // time right here. Pure seeing + you-decide; nothing auto-moves. (Coming up /
  // Someday stay simple lists.)
  function toMin(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    return m ? +m[1] * 60 + +m[2] : 0;
  }
  function gapLabel(a, b) {
    const mins = toMin(b) - toMin(a);
    if (mins <= 0) return "";
    if (mins < 60) return `~${mins} min until the next thing`;
    const h = Math.round(mins / 60);
    return `~${h} hour${h > 1 ? "s" : ""} until the next thing`;
  }
  function setItemTime(id, value) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.time = normaliseTime(value);
    editingTimeId = null;
    persist();
    renderZones();
  }
  function timeControl(it) {
    const wrap = document.createElement("div");
    if (editingTimeId === it.id) {
      wrap.className = "tl-timeedit";
      wrap.innerHTML = `
        <input type="time" value="${it.time || ""}" aria-label="Time" />
        <button class="link tl-save" type="button">save</button>
        ${it.time ? '<button class="link tl-clear" type="button">clear</button>' : ""}`;
      const input = wrap.querySelector("input");
      setTimeout(() => input.focus(), 0);
      wrap.querySelector(".tl-save").addEventListener("click", () => setItemTime(it.id, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setItemTime(it.id, input.value);
        if (e.key === "Escape") {
          editingTimeId = null;
          renderZones();
        }
      });
      const clear = wrap.querySelector(".tl-clear");
      if (clear) clear.addEventListener("click", () => setItemTime(it.id, ""));
    } else {
      wrap.className = "tl-settime-wrap";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-settime";
      btn.textContent = it.time ? "change time" : "set a time";
      btn.addEventListener("click", () => {
        editingTimeId = it.id;
        renderZones();
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }
  function timelineRow(it, withTimeColumn) {
    if (editingItemId === it.id) return itemEditor(it);
    const row = document.createElement("div");
    const imp = importanceOf(it);
    row.className = `item tl-item imp-${imp}`;
    const tick = document.createElement("button");
    tick.className = "tick";
    tick.setAttribute("aria-label", "Mark done");
    tick.title = "Mark done";
    tick.addEventListener("click", () => complete(it.id));
    row.appendChild(tick);
    if (withTimeColumn) {
      const time = document.createElement("div");
      time.className = "tl-time";
      time.textContent = fmtTime(it.time);
      row.appendChild(time);
    }
    const overdue = it.date && it.date < todayISO();
    const tags = Array.isArray(it.tags) ? it.tags : [];
    const impWord = imp === "high" ? "matters a lot" : imp === "low" ? "minor" : "";
    const eff = effortOf(it);
    const effWord = eff === "quick" ? "quick" : eff === "draining" ? "draining" : "";
    const part = goalTitleById(it.goalId);
    const main = document.createElement("div");
    main.className = "item-main";
    main.innerHTML = `
      <div class="item-title">${escapeHtml(it.title)}</div>
      <div class="item-meta">
        <span class="badge ${it.type}">${TYPE_LABEL[it.type]}</span>
        ${it.openLoop ? `<span class="loop-chip">needs finishing</span>` : ""}
        ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(it.promisedTo)}</span>` : ""}
        ${impWord ? `<span class="imp-word imp-${imp}">${impWord}</span>` : ""}
        ${effWord ? `<span class="effort-word eff-${eff}">${effWord}</span>` : ""}
        ${overdue ? `<span class="when overdue">overdue</span>` : ""}
        ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        ${part ? `<span class="part-of">part of: ${escapeHtml(part)}</span>` : ""}
        ${isFragile(it) ? `<span class="fragile-chip" title="No deadline and no one waiting — these slip easiest. A date or a promise gives it a hook.">nothing holding this</span>` : ""}
      </div>`;
    row.appendChild(main);
    row.appendChild(timeControl(it));
    row.appendChild(editLink(it));
    return row;
  }
  function renderTodayTimeline(list) {
    const el = $("#todayItems");
    el.innerHTML = "";
    if (!list.length) {
      el.innerHTML = `<p class="empty">Nothing for today. Enjoy the quiet.</p>`;
      return;
    }
    const timed = list.filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time));
    const anytime = list.filter((i) => !i.time);
    timed.forEach((it, idx) => {
      el.appendChild(timelineRow(it, true));
      if (idx < timed.length - 1) {
        const g = gapLabel(it.time, timed[idx + 1].time);
        if (g) {
          const gap = document.createElement("div");
          gap.className = "tl-gap";
          gap.textContent = g;
          el.appendChild(gap);
        }
      }
    });
    if (anytime.length) {
      if (timed.length) {
        const h = document.createElement("p");
        h.className = "tl-anytime-title";
        h.textContent = "Anytime today";
        el.appendChild(h);
      }
      anytime.forEach((it) => el.appendChild(timelineRow(it, false)));
    }
  }

  function renderZones() {
    const active = items.filter((i) => !i.done);
    const groups = { today: [], coming: [], someday: [] };
    active.forEach((i) => groups[zoneFor(i)].push(i));

    groups.today.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    groups.coming.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    groups.someday.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    renderTodayTimeline(groups.today);
    fillZone("#comingItems", groups.coming, "Nothing coming up yet.");
    fillZone("#somedayItems", groups.someday, "No parked ideas right now.");

    $("#todayCount").textContent = groups.today.length ? groups.today.length : "";
    $("#comingCount").textContent = groups.coming.length ? groups.coming.length : "";
    $("#somedayCount").textContent = groups.someday.length ? groups.someday.length : "";

    renderLoops();
    renderOverdue();
    renderShortlist();
    renderGoalsPanel();
    renderWeekStrip();
  }

  // ---------- the week at a glance (seven light chips; Week tab has the depth) ----------
  function renderWeekStrip() {
    const el = $("#weekStrip");
    if (!el) return;
    const t = todayISO();
    const active = items.filter((i) => !i.done && i.date);
    let any = false;
    const chips = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(t, i);
      const day = active.filter((x) => x.date === iso);
      if (day.length) any = true;
      const hard = day.some((x) => x.deadlineType === "hard");
      const label =
        i === 0 ? "Today" : new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
      chips.push(
        `<a class="ws-chip${i === 0 ? " today" : ""}" href="week.html" title="${day.length} thing${day.length === 1 ? "" : "s"}">` +
          `<span class="ws-day">${label}</span>` +
          `<span class="ws-n">${day.length || "·"}</span>${hard ? `<span class="ws-dot" title="hard deadline"></span>` : ""}</a>`
      );
    }
    el.hidden = !any; // an empty week stays invisible — no empty furniture
    el.innerHTML = any ? chips.join("") : "";
  }

  // ---------- "what matters today" shortlist ----------
  // A read-only highlight computed from the stored signals. No AI, instant,
  // offline. It never changes, reorders, or completes the stored items — the
  // full zones below are the source of truth and one glance away.
  //
  // Three signals feed it (§0.2): urgency (hard deadline due), importance (your
  // own "matters a lot"), and milestone-pull (§9 slice 3) — a task linked to a
  // goal you chose to finish. Milestone-pull is the ungameable one (your goals
  // can't be faked by others); it's a weighted boost, NEVER an override — it
  // can't jump ahead of a hard deadline due today.
  function shortlistEligible(it) {
    if (it.openLoop) return false; // open loops live in the louder "Needs finishing" — no double-shouting
    const t = todayISO();
    const dueNow = it.date && it.date <= t;
    if (it.deadlineType === "hard" && dueNow) return true; // hard deadline, can't wait
    if (importanceOf(it) === "high") return true; // you said it matters
    if (it.promisedTo) return true; // someone's waiting on it (s29 hook)
    if (goalTitleById(it.goalId)) return true; // moves you toward a chosen goal
    if (it.date) return true; // dated → can fill a slot by nearest date
    return false; // floaty, not important, not toward a goal → not a "today" thing
  }
  function shortlistRank(it) {
    const t = todayISO();
    const dueNow = it.date && it.date <= t;
    if (it.deadlineType === "hard" && dueNow) return 0; // always first — the guard
    if (importanceOf(it) === "high" || it.promisedTo) return 1; // your values + your word
    if (goalTitleById(it.goalId)) return 2; // then milestone-pull (toward a goal)
    if (dueNow) return 3; // then anything else due today/overdue
    return 4; // then upcoming, by nearest date
  }
  function shortlistReason(it) {
    const t = todayISO();
    if (it.date && it.date < t) return "overdue";
    if (it.date && it.date === t) return "due today";
    if (it.promisedTo) return "promised to " + it.promisedTo;
    if (importanceOf(it) === "high") return "matters a lot";
    const g = goalTitleById(it.goalId);
    if (g) return "toward " + g;
    if (it.date) return friendlyDate(it.date);
    return "";
  }
  function renderShortlist() {
    const listEl = $("#shortlistItems");
    const msgEl = $("#shortlistMsg");
    if (!listEl) return;
    // filter + sort work on a fresh array — the stored items are never touched
    const eligible = items.filter((i) => !i.done && shortlistEligible(i));
    eligible.sort(
      (a, b) =>
        shortlistRank(a) - shortlistRank(b) ||
        (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99")
    );
    const picks = eligible.slice(0, SHORTLIST_CAP);

    listEl.innerHTML = "";
    if (!picks.length) {
      msgEl.textContent = "";
      listEl.innerHTML = `<p class="empty">Nothing pressing today. Enjoy the quiet.</p>`;
      return;
    }
    // "name the load, not the person": gentle when there's more than fits
    msgEl.textContent =
      eligible.length > SHORTLIST_CAP ? "Today's looking full — here are the few that matter most." : "";
    picks.forEach((it) => {
      const reason = shortlistReason(it);
      const row = document.createElement("div");
      row.className = "sl-item";
      row.innerHTML = `
        <span class="sl-title">${escapeHtml(it.title)}</span>
        ${reason ? `<span class="sl-reason">${escapeHtml(reason)}</span>` : ""}`;
      listEl.appendChild(row);
    });
  }

  // ---------- "goals in motion" — the by-day window onto goals (§s26) ----------
  // Each active goal shows its current milestone, the bar toward it, and its NEXT
  // step(s) — tickable right here, so a goal's live steps live in your day (§6:
  // the next step, not the whole tree). Ticking advances the milestone and, when
  // one completes, fires the same upside-only celebration as the Goals page.
  function goalCurrentIndex(goal) {
    return (goal.milestones || []).findIndex((m) => !m.done);
  }
  function milestoneProgress(ms) {
    const steps = (ms && ms.steps) || [];
    const total = steps.length;
    const done = steps.filter((s) => s.done).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  // Mirrors the Goals page: returns "milestone" | "goal" | null on a completion.
  function recomputeMilestone(goal, ms) {
    const steps = ms.steps || [];
    const allDone = steps.length > 0 && steps.every((s) => s.done);
    let ev = null;
    if (allDone && !ms.done) {
      ms.done = true;
      ms.completedAt = new Date().toISOString();
      ev = "milestone";
    } else if (!allDone && ms.done) {
      ms.done = false;
      ms.completedAt = null;
    }
    if (ev === "milestone" && goal.milestones.length && goal.milestones.every((m) => m.done)) ev = "goal";
    return ev;
  }
  function toggleGoalStep(goalId, msId, stepId) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const ms = (goal.milestones || []).find((m) => m.id === msId);
    if (!ms) return;
    const step = (ms.steps || []).find((s) => s.id === stepId);
    if (!step) return;
    step.done = true; // from the home you only ever tick the next undone step
    step.completedAt = new Date().toISOString();
    const ev = recomputeMilestone(goal, ms);
    OrganiserStore.save({ goals });
    renderZones();
    if (ev) celebrateGoal(ev, ev === "goal" ? goal.title : ms.title, { goalId, msId, stepId });
  }

  // Compact upside-only celebration on the home, with the §9 one-tap undo. The
  // Goals page has its own; both share the .celebrate styles.
  let celebrateTimer = null;
  function celebrateGoal(kind, title, ref) {
    const el = $("#celebrate");
    if (!el) return;
    el.className = "celebrate " + kind;
    el.hidden = false;
    const msg =
      kind === "goal"
        ? `Goal complete — ${escapeHtml(title)}! Every milestone done. 🎉`
        : `Milestone done — ${escapeHtml(title)} 🎉`;
    el.innerHTML = `<span class="celebrate-msg">${msg}</span><button class="celebrate-undo" type="button">not done yet</button>`;
    el.querySelector(".celebrate-undo").addEventListener("click", () => undoGoalStep(ref));
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      el.hidden = true;
    }, 6000);
  }
  function undoGoalStep(ref) {
    const goal = goals.find((g) => g.id === ref.goalId);
    if (!goal) return;
    const ms = (goal.milestones || []).find((m) => m.id === ref.msId);
    if (!ms) return;
    const step = (ms.steps || []).find((s) => s.id === ref.stepId);
    if (step) {
      step.done = false;
      step.completedAt = null;
    }
    if (ms.done) {
      ms.done = false;
      ms.completedAt = null;
    }
    const el = $("#celebrate");
    if (el) el.hidden = true;
    OrganiserStore.save({ goals });
    renderZones();
  }

  function renderGoalsPanel() {
    const panel = $("#goalsPanel");
    const listEl = $("#goalsPanelList");
    if (!panel || !listEl) return;
    const active = goals.filter((g) => g.milestones && g.milestones.length && goalCurrentIndex(g) !== -1);
    if (!active.length) {
      panel.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    panel.hidden = false;
    const picks = active.slice(0, 3); // the important few — keep it calm
    listEl.innerHTML = "";
    picks.forEach((g) => {
      const ms = g.milestones[goalCurrentIndex(g)];
      const pr = milestoneProgress(ms);
      const item = document.createElement("div");
      item.className = "gp-item";
      item.innerHTML = `
        <div class="gp-head">
          <span class="gp-title">${escapeHtml(g.title)}</span>
          <span class="gp-ms">${escapeHtml(ms.title)}</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pr.pct}%"></div></div>
        <div class="gp-label">${pr.total ? `${pr.done} of ${pr.total} steps toward this milestone` : "no steps yet"}</div>`;
      // §6: surface only the next 1–2 undone steps, tickable — never the whole tree.
      const nextSteps = (ms.steps || []).filter((s) => !s.done).slice(0, 2);
      if (nextSteps.length) {
        const steps = document.createElement("div");
        steps.className = "gp-steps";
        nextSteps.forEach((s) => {
          const row = document.createElement("div");
          row.className = "gp-step";
          const tick = document.createElement("button");
          tick.className = "tick";
          tick.setAttribute("aria-label", "Mark step done");
          tick.title = "Mark done";
          tick.addEventListener("click", () => toggleGoalStep(g.id, ms.id, s.id));
          const t = document.createElement("span");
          t.className = "gp-step-title";
          t.textContent = s.title;
          row.append(tick, t);
          steps.appendChild(row);
        });
        item.appendChild(steps);
      }
      listEl.appendChild(item);
    });
    if (active.length > picks.length) {
      const more = document.createElement("p");
      more.className = "gp-more";
      more.textContent = `+${active.length - picks.length} more on the goals page`;
      listEl.appendChild(more);
    }
  }

  // ---------- "make this a goal?" — the AI spots a cluster (§9 slice 2c) ----------
  // Rare + gentle + conservative (don't over-goal). We ask the AI only when there
  // is a real pile of goal-less tasks, surface at most one suggestion, and never
  // re-offer one the user waved away (remembered in localStorage — a UI nicety,
  // not core data: if it's lost, the worst case is the suggestion shows once more).
  function clusterSignature(ids) {
    return ids.slice().sort().join(",");
  }
  function loadDismissedClusters() {
    try {
      return JSON.parse(localStorage.getItem(LS_DISMISSED_CLUSTERS) || "[]");
    } catch {
      return [];
    }
  }
  function rememberDismissedCluster(sig) {
    try {
      const a = loadDismissedClusters();
      if (!a.includes(sig)) localStorage.setItem(LS_DISMISSED_CLUSTERS, JSON.stringify(a.concat(sig).slice(-50)));
    } catch {
      /* best-effort */
    }
  }
  async function checkForClusterGoal() {
    if (!aiAvailable || clusterSuggestion) return;
    const linkless = items.filter((i) => !i.done && !goalTitleById(i.goalId));
    if (linkless.length < 4) return; // need a plausible pile before bothering
    try {
      const r = await fetch("/api/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: linkless.map((i) => ({ id: i.id, title: i.title })) }),
      });
      if (!r.ok) return;
      const sug = (await r.json()).suggestion;
      if (!sug || !sug.title || !Array.isArray(sug.taskIds) || sug.taskIds.length < 3) return;
      if (loadDismissedClusters().includes(clusterSignature(sug.taskIds))) return;
      clusterSuggestion = sug;
      showClusterOffer(sug);
    } catch {
      /* a suggestion is optional — stay quiet on failure */
    }
  }
  function showClusterOffer(sug) {
    const el = $("#clusterOffer");
    if (!el) return;
    el.querySelector(".co-msg").textContent =
      `A few of your tasks look like parts of one thing. Make a goal called “${sug.title}” and group ${sug.taskIds.length} of them under it?`;
    el.hidden = false;
  }
  async function acceptClusterGoal() {
    if (!clusterSuggestion) return;
    const { title, taskIds } = clusterSuggestion;
    const goal = { id: uid(), title, createdAt: new Date().toISOString(), milestones: [] };
    goals.unshift(goal);
    let linked = 0;
    taskIds.forEach((id) => {
      const it = items.find((x) => x.id === id);
      if (it) {
        it.goalId = goal.id;
        linked++;
      }
    });
    OrganiserStore.save({ items, goals });
    clusterSuggestion = null;
    $("#clusterOffer").hidden = true;
    renderZones();
    setStatus(`Made the goal “${title}” and grouped ${linked} task${linked === 1 ? "" : "s"} under it.`);
    // best-effort: let the AI propose milestones for the brand-new goal
    try {
      const priorCounts = goals.filter((g) => g.id !== goal.id && g.milestones.length).map((g) => g.milestones.length);
      const r = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priorCounts }),
      });
      if (r.ok) {
        const ms = ((await r.json()).milestones || []).map((m) => ({
          id: uid(),
          title: m.title,
          done: false,
          completedAt: null,
          steps: (m.steps || []).map((s) => ({ id: uid(), title: s, done: false, completedAt: null })),
        }));
        if (ms.length && goal.milestones.length === 0) {
          goal.milestones = ms;
          OrganiserStore.save({ items, goals });
          renderZones();
        }
      }
    } catch {
      /* the goal exists either way; milestones can be added by hand */
    }
  }
  function dismissClusterGoal() {
    if (clusterSuggestion) rememberDismissedCluster(clusterSignature(clusterSuggestion.taskIds));
    clusterSuggestion = null;
    $("#clusterOffer").hidden = true;
  }

  // ---------- "needs finishing": open loops, loudest on the page (§0.2 s28) ----------
  // Prepped-but-not-closed is the highest-risk state — the thing that slips when
  // memory is the only holder. These surface here (louder than the shortlist,
  // which skips them to avoid double-shouting), each showing when its reminder
  // will come find you.
  function renderLoops() {
    const section = $("#loops");
    const listEl = $("#loopsList");
    if (!section || !listEl) return;
    const loops = items
      .filter((i) => !i.done && i.openLoop)
      .sort((a, b) => (a.remindAt || "9999").localeCompare(b.remindAt || "9999"));
    if (!loops.length) {
      section.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    section.hidden = false;
    listEl.innerHTML = "";
    loops.forEach((it) => {
      if (editingItemId === it.id) {
        listEl.appendChild(itemEditor(it));
        return;
      }
      const row = document.createElement("div");
      row.className = "lp-row";
      const due = it.date ? friendlyDate(it.date) : "";
      const ping = fmtRemind(it);
      row.innerHTML = `
        <button class="tick" aria-label="Finished it" title="Finished it"></button>
        <div class="lp-main">
          <div class="lp-title">${escapeHtml(it.title)}</div>
          <div class="item-meta">
            ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(it.promisedTo)}</span>` : ""}
            ${due ? `<span class="when${it.deadlineType === "hard" ? " due" : ""}">${it.deadlineType === "hard" ? "due " : ""}${escapeHtml(due)}</span>` : ""}
            ${ping ? `<span class="ping-info">${escapeHtml(ping)}</span>` : ""}
          </div>
        </div>`;
      row.querySelector(".tick").addEventListener("click", () => complete(it.id));
      row.appendChild(editLink(it));
      listEl.appendChild(row);
    });
  }

  // ---------- past a deadline: recover gently (§s21 safety net) ----------
  // A rigid (hard-deadline) task whose date has passed. Silently dropping it
  // loses something real; pinning it red forever is a guilt monument (§0 forbids).
  // So: surface it ONCE, framed about the task, with release valves — then it
  // clears the moment the user makes any one choice (reschedule / soften / done).
  function isOverdueHard(it) {
    return !it.done && it.deadlineType === "hard" && it.date && it.date < todayISO();
  }
  function renderOverdue() {
    const section = $("#overdue");
    const listEl = $("#overdueList");
    if (!section || !listEl) return;
    const due = items.filter(isOverdueHard).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (!due.length) {
      section.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    section.hidden = false;
    listEl.innerHTML = "";
    const today = todayISO();
    // Restart guard (§0 s31): coming back after a bad week must never mean a wall
    // of accusations. Show ONE missed deadline at a time (oldest first); the rest
    // wait quietly and take its place as each gets its one calm decision.
    const showing = due.slice(0, 1);
    showing.forEach((it) => {
      const card = document.createElement("div");
      card.className = "od-card";
      card.innerHTML = `
        <div class="od-main">
          <div class="od-title">${escapeHtml(it.title)}</div>
          <div class="od-meta">was due ${escapeHtml(friendlyDate(it.date))} · past its deadline</div>
        </div>
        <div class="od-actions">
          <label class="od-redate">new date <input type="date" class="od-date" min="${today}" aria-label="Give it a new date" /></label>
          <button class="link od-soft" type="button">make it soft</button>
          <button class="link od-done" type="button">I’ve handled it</button>
        </div>`;
      card.querySelector(".od-date").addEventListener("change", (e) => {
        const v = e.target.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
        it.date = v; // a fresh date — no longer overdue, so it clears from here
        persist();
        renderZones();
        setStatus(`Gave “${it.title}” a new date. ✓`);
      });
      card.querySelector(".od-soft").addEventListener("click", () => {
        it.deadlineType = "soft"; // not a hard deadline anymore → stops being flagged
        persist();
        renderZones();
        setStatus(`“${it.title}” is a soft deadline now — no rush. ✓`);
      });
      card.querySelector(".od-done").addEventListener("click", () => complete(it.id));
      listEl.appendChild(card);
    });
    if (due.length > showing.length) {
      const more = document.createElement("p");
      more.className = "od-more";
      const n = due.length - showing.length;
      more.textContent = `${n} more waiting quietly — ${n === 1 ? "it" : "each one"} will show here after this one.`;
      listEl.appendChild(more);
    }
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
      // Wake the local model now (fire-and-forget) so the first sort isn't slow.
      if (aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
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
      goals = data.goals || [];
      OrganiserStore.save({ items, waiting, goals, records: data.records || [], recordConfig: data.recordConfig || null });
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
    goals = data.goals || [];

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
      OrganiserStore.exportNow();
      setStatus("Saved a backup copy to your Downloads.");
    });
    $("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
    $("#restoreInput").addEventListener("change", onRestore);
    $("#clusterMake").addEventListener("click", acceptClusterGoal);
    $("#clusterDismiss").addEventListener("click", dismissClusterGoal);
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());

    renderZones();
    renderWaiting();
    if (data.migratedNote) setStatus(data.migratedNote);
    await checkHealth();
    checkForClusterGoal(); // gentle, only if there's a real pile of loose tasks
  }

  init();
})();
