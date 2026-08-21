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
  let records = []; // the record log — the home only writes routed records to it
  let recordConfig = null; // the record vocabulary, for routing a dump to a student record
  let portfolio = null; // read-only here: to show which standard a task is "for"
  let contacts = []; // the People list — a routed handover can add to it
  let schedule = []; // the day's fixed blocks + soft assumptions (the Day tab owns these)
  let scheduleConfig = null; // day window, effort→minutes, learned durations, plans
  let pending = null; // the batch currently shown in the check-back
  let aiAvailable = false; // is AI sorting set up AND answering?
  let engineNote = ""; // set up but not answering — says which, so you can fix it
  let namePrompt = null; // {index, field, name, look} — a name worth asking about
  let proposed = []; // what the AI first suggested, to compare against what you accept
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
  // One or two digits for the hour, like everything else that reads a clock
  // time here. It used to insist on two, so a time written "9:05" simply
  // vanished off the row while the planner went on using it.
  function fmtTime(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").toString().trim());
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
  // A task can be "for" a portfolio standard — show its short code (or title).
  function standardLabelById(id) {
    if (!id || !portfolio || !Array.isArray(portfolio.points)) return "";
    const p = portfolio.points.find((x) => x && x.id === id);
    if (!p) return "";
    return p.code || (p.title || "").slice(0, 24);
  }
  function standardPoints() {
    return portfolio && Array.isArray(portfolio.points) ? portfolio.points : [];
  }
  // The "for a standard" picker — shown wherever a task is editable, so an
  // existing task can be attached to a standard any time (not just at capture).
  function standardSelectHtml(it) {
    const pts = standardPoints();
    if (!pts.length) return "";
    return `<div class="cb-row"><label class="cb-field cb-goal-field"><span class="cb-lbl">For a standard</span>
        <select class="cb-standard" aria-label="For a standard">
          <option value="">— none —</option>
          ${pts
            .map(
              (p) =>
                `<option value="${escapeHtml(p.id)}" ${p.id === it.standardId ? "selected" : ""}>${escapeHtml(
                  (p.code ? p.code + " — " : "") + (p.title || "")
                )}</option>`
            )
            .join("")}
        </select>
      </label></div>`;
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

  // A CHECK-BACK YOU CANNOT READ IS NOT A CHECK. The title sat in a one-line
  // input, so anything longer than the box was clipped mid-word with the rest
  // of the sentence out of sight — and this is the one moment the app asks you
  // to confirm it read you correctly.
  function growTitle(el) {
    if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight || 0;
    // A CARD THAT IS NOT ON THE PAGE YET HAS NO HEIGHT. scrollHeight comes back
    // 0 before it is laid out, and setting that collapses the box to nothing —
    // which made the whole title vanish and left a check-back card asking you
    // to confirm a blank line.
    el.style.height = h > 0 ? Math.min(h, 220) + "px" : "";
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
  // An optional "undo" rides along on the status line. Rule 4: small reversible
  // things just happen, and the way back is one tap — never an "are you sure?"
  // asked before the fact.
  function setStatus(msg, undo) {
    const s = $("#status");
    s.textContent = msg || "";
    s.hidden = !msg;
    if (msg && typeof undo === "function") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link status-undo";
      b.textContent = "undo";
      b.addEventListener("click", undo);
      s.append(" ", b);
    }
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

  // WHAT YOU CHANGED, NEVER WHAT YOU CHANGED IT TO. "the date was corrected"
  // is the single most useful thing anyone could know about how well the
  // sorting works, and it carries no date. Fire-and-forget: this must never
  // slow anything down or matter if it fails.
  function noteUse(what, field, value, n) {
    try {
      fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what, field: field || "", value: value || "", n: n || 0 }),
      }).catch(() => {});
    } catch {
      /* never worth interrupting anything for */
    }
  }

  // Blocks you marked as needing work get their tasks made here too. Keyed to
  // block+date, so Home and the Day tab both running this can't make two.
  function syncPrep() {
    if (!window.OrganiserSchedule) return;
    const { add, drop } = OrganiserSchedule.prepPlan(schedule, scheduleConfig, items, new Date());
    if (!add.length && !drop.length) return;
    const gone = new Set(drop.map((d) => d.id));
    items = items.filter((i) => !gone.has(i.id));
    add.forEach((t) => items.push({ ...t, id: uid(), createdAt: new Date().toISOString() }));
    persist();
  }

  // ---------- adding things ----------
  // A route-returned task item is already in the app's own shape; finish it for
  // the check-back (propose a reminder for open loops / hard deadlines).
  function fromRouteItem(it) {
    const out = {
      title: (it.title || "").toString().trim() || "Untitled",
      type: TYPES.includes(it.type) ? it.type : "task",
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : "",
      time: normaliseTime(it.time),
      deadlineType: it.deadlineType === "hard" ? "hard" : "soft",
      importance: IMPORTANCE.includes(it.importance) ? it.importance : "normal",
      effort: EFFORT.includes(it.effort) ? it.effort : "medium",
      tags: normaliseTags(it.tags),
      whenText: (it.whenText || "").toString().trim(),
      goalId: it.goalId && goalTitleById(it.goalId) ? it.goalId : "",
      standardId: standardLabelById(it.standardId) ? it.standardId : "",
      openLoop: it.openLoop === true,
      // WHICH PARTS OF YOUR LIFE THIS BELONGS TO — a list, because a training
      // session at school is work AND professional at once, and forcing a
      // choice makes the answer wrong whichever way you pick. Yours to name;
      // see areas.js, which has no idea what any of them mean.
      areas: window.OrganiserAreas ? OrganiserAreas.on(it) : [],
      // HOW BIG, and HOW MUCH OF IT IS DONE. Without these the planner sees a
      // guess where you gave it a number, and forgets every minute you ever put
      // in — which is how an eight-hour job got planned as an hour and a job
      // bigger than a day could never finish.
      plannedMinutes: Math.max(0, Math.round(Number(it.plannedMinutes) || 0)),
      spentMinutes: Math.max(0, Math.round(Number(it.spentMinutes) || 0)),
      // Where it came from, and whether you can still walk away from it. Two
      // separate facts — see priority.js.
      optional: it.optional === true,
      committed: it.committed === true,
      // Earliest this could possibly be done — NOT the same as when it's due.
      // Both readers produce it; it has to survive the trip into storage.
      notBefore: /^\d{4}-\d{2}-\d{2}$/.test(it.notBefore || "") ? it.notBefore : "",
      promisedTo: (it.promisedTo || "").toString().trim().slice(0, 40),
      remindAt: "",
      remindedAt: null,
    };
    if (out.openLoop || (out.deadlineType === "hard" && out.date)) out.remindAt = proposeRemindAt(out);
    // A thing you're waiting on starts its own rhythm rather than a deadline.
    if (out.waitingOn && !out.remindAt) {
      const d = new Date();
      d.setDate(d.getDate() + ASK_EVERY_DAYS);
      d.setHours(9, 0, 0, 0);
      out.remindAt = fmtLocalDT(d);
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
      await addWithoutAI(text);
      return;
    }

    setBusy(true);
    setStatus("Reading what you wrote…");
    try {
      // The dump is routed: tasks come to the check-back below; a clear student
      // record or a goal is filed straight to its tab (records wear the
      // "AI-sorted · check me" chip there, so nothing skips a confirm).
      const stds = portfolio && Array.isArray(portfolio.points) ? portfolio.points.map((p) => ({ id: p.id, code: p.code })) : [];
      const entries = await OrganiserCapture.route(text, { goals, config: recordConfig || {}, standards: stds });
      if (!entries.length) {
        setStatus("I couldn't find anything to add there — try a few more words?");
        return;
      }
      const taskEntries = entries.filter((e) => e.kind === "task");
      const others = entries.filter((e) => e.kind !== "task");
      let filed = "";
      if (others.length) {
        const state = { items, goals, records, contacts };
        const n = OrganiserCapture.applyEntries(others, state);
        contacts = state.contacts; // a handover may have added a new person
        OrganiserStore.save({ items, goals, records, contacts });
        renderZones(); // reflect any follow-up tasks + goals-in-motion
        const bits = [];
        if (n.records) bits.push(`${n.records} to Students →`);
        if (n.goals) bits.push(`${n.goals} to Goals →`);
        if (n.handovers) bits.push(`${n.handovers} logged to People →`);
        filed = "Filed " + bits.join(" · ");
      }
      if (taskEntries.length) {
        pending = taskEntries.map((e) => fromRouteItem(e.item));
      // Kept so that, at the moment you accept, the app can see WHICH fields
      // you altered. Never what you altered them to.
      proposed = pending.map((p) => JSON.parse(JSON.stringify(p)));
        $("#checkbackHeading").textContent = "Here's what I understood — look right?";
        renderCheckback();
        setStatus(filed);
      } else {
        $("#dump").value = "";
      $("#dump").style.height = "auto";
        setStatus(filed || "Added. ✓");
      }
    } catch (err) {
      // AI is set up but unreachable: keep the dump safe to sort later (§0.1).
      waiting.unshift({ id: uid(), text, createdAt: new Date().toISOString() });
      persist();
      $("#dump").value = "";
      $("#dump").style.height = "auto";
      // NOT "I can't reach the app" — the app is running; it just drew this
      // page and saved your words. Blaming itself sends you looking in the
      // wrong place. The server says what actually failed; pass that on.
      const msg = err && err.code ? err.message : "The sorter didn't answer.";
      setStatus(msg + " Saved below to sort later — nothing is lost.");
      renderWaiting();
    } finally {
      setBusy(false);
    }
  }

  // A NAME IS A FACT YOU CAN CHECK BY LOOKING. So this is code, not a call.
  // Matched → linked quietly, nothing asked. Nearly → the one worth asking
  // about, because a one-letter slip files work against the wrong person and
  // nobody ever finds out. New → offered, never added silently, because a typo
  // would otherwise become a permanent contact.
  function peopleRow(it, i) {
    if (!window.OrganiserNames) return null;
    const fields = [
      ["promisedTo", it.promisedTo, "promised to"],
      ["waitingOn", it.waitingOn, "waiting on"],
    ].filter(([, v]) => v);
    if (!fields.length) return null;

    const row = document.createElement("div");
    row.className = "cb-people";
    let shown = false;
    fields.forEach(([field, name, label]) => {
      const found = OrganiserNames.look(name, contacts);
      if (found.state === "matched") {
        it.contactId = found.contact.id || "";
        const chip = document.createElement("span");
        chip.className = "cb-known";
        chip.textContent = `${label} ${found.contact.name} · in People ✓`;
        row.appendChild(chip);
        shown = true;
        return;
      }
      shown = true;
      const wrap = document.createElement("span");
      wrap.className = "cb-newperson";
      wrap.textContent = `${label} ${name} — `;
      if (found.state === "nearly") {
        // The valuable question. Offer the candidates by name, and keep "no,
        // it's someone else" as a real answer. When the two are in different
        // scripts the question is a different one — not "did you misspell it"
        // but "are these the same person" — so it's worded that way.
        wrap.append(document.createTextNode(found.bridge ? "same person as " : "did you mean "));
        found.suggestions.forEach((c, n) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "link";
          b.textContent = c.name;
          b.addEventListener("click", () => {
            // You've just told it that this spelling means this person. Keep
            // that — it's how "Wang Wei" finds 王伟 instantly next time, and
            // it's knowledge no built-in table could have.
            noteUse("name-question", "", found.bridge ? "matched" : "accepted");
            const learned = OrganiserNames.remember(c, name);
            it[field] = c.name;
            it.contactId = c.id || "";
            if (learned) OrganiserStore.save({ contacts });
            renderCheckback();
            if (learned) setStatus(`Noted — “${name}” means ${c.name}. I'll know next time. ✓`);
          });
          wrap.append(n ? " / " : "", b);
        });
        wrap.append(document.createTextNode("? "));
      }
      const add = document.createElement("button");
      add.type = "button";
      add.className = "link";
      add.textContent = found.state === "nearly" ? `no — add ${name}` : `add ${name} to People`;
      add.addEventListener("click", () => {
        noteUse("name-question", "", found.state === "nearly" ? "rejected" : "added");
        contacts.push({ id: uid(), name, group: "", note: "", createdAt: new Date().toISOString(), workLog: [] });
        OrganiserStore.save({ contacts });
        renderCheckback();
        setStatus(`${name} is in People now. ✓`);
      });
      wrap.appendChild(add);
      row.appendChild(wrap);
    });
    return shown ? row : null;
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
    const std = standardLabelById(it.standardId);
    if (std) parts.push("for " + std);
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
      // (the People row is appended after the card is built, below)
      card.innerHTML = `
        <div class="cb-head">
          <textarea class="cb-title" rows="1" aria-label="What it is">${escapeHtml(it.title)}</textarea>
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
          ${standardSelectHtml(it)}
          ${it.whenText ? `<div class="cb-when">your words: “${escapeHtml(it.whenText)}”</div>` : ""}
        </div>
      `;
      const refreshSummary = () => {
        card.querySelector(".cb-summary").textContent = checkbackSummary(pending[i]);
      };
      const titleBox = card.querySelector(".cb-title");
      titleBox.addEventListener("input", (e) => {
        pending[i].title = e.target.value;
        growTitle(e.target);
      });
      growTitle(titleBox);
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
      const stdSel = card.querySelector(".cb-standard");
      if (stdSel)
        stdSel.addEventListener("change", (e) => {
          pending[i].standardId = e.target.value;
          refreshSummary();
        });
      wireLoopControls(card, pending[i], refreshSummary);
      card.querySelector(".cb-remove").addEventListener("click", () => {
        // Dropping an entry outright is the strongest "this was wrong" there is.
        noteUse("dropped", "", "dropped");
        pending.splice(i, 1);
        proposed.splice(i, 1);
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
      const people = peopleRow(it, i);
      if (people) card.appendChild(people);
      list.appendChild(card);
    });

    if (pending.length === 0) cancelCheckback();
    else $("#checkback").hidden = false;
  }

  // NO MODEL — but that's no reason to hand back one lump. The splitter is
  // plain code, so a pasted thread still becomes separate lines; then patterns
  // read the date, time, urgency and anyone already in People off each one.
  // What they can't see is left blank rather than guessed, and it all lands in
  // the same check-back — so the only real difference from the AI path is how
  // much arrives already filled in.
  async function addWithoutAI(text) {
    let parts = [text];
    if (/[\n。！？!?]/.test(text) && text.length > 40) {
      try {
        const r = await fetch("/api/split", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (r.ok) {
          const d = await r.json();
          const got = (d.fragments || []).map((f) => f.text).filter((t) => t && t.length > 1);
          if (got.length > 1) parts = got;
        }
      } catch {
        /* one lump is still better than nothing lost */
      }
    }
    // parseAll, not parse: a part can still be more than one job. The splitter
    // above cuts at line breaks and full stops, and "update the laptop and sign
    // into 365" has neither — one line, two jobs, and ticked off when half of
    // it is done. Everything lands in the check-back either way, so a split you
    // didn't want is one tap to undo.
    const made = parts.flatMap((t) =>
      window.OrganiserQuickParse
        ? OrganiserQuickParse.parseAll(t, { contacts })
        : [{ title: t, type: "task", date: "", time: "", deadlineType: "soft", importance: "normal", effort: "medium", tags: [], whenText: "", goalId: "", openLoop: false, promisedTo: "", remindAt: "", remindedAt: null }]
    );
    pending = made;
    proposed = made.map((m) => JSON.parse(JSON.stringify(m)));
    $("#dump").value = "";
    $("#dump").style.height = "auto";
    const readAny = window.OrganiserQuickParse && made.some((m) => OrganiserQuickParse.foundAnything(m));
    $("#checkbackHeading").textContent =
      made.length > 1
        ? `Split into ${made.length} — drop any that aren't things to do.`
        : readAny
          ? "Read what I could — check it and add."
          : "Add this — tweak anything, then add.";
    renderCheckback();
    setStatus(engineNote); // "" when AI was simply never switched on
  }

  const WATCHED = ["title", "date", "time", "importance", "effort", "deadlineType", "promisedTo", "waitingOn", "goalId", "standardId", "tags"];
  const FIELD_NAME = { deadlineType: "deadline", goalId: "goal", standardId: "standard" };
  function reportCorrections() {
    pending.forEach((it, i) => {
      const was = proposed[i];
      if (!was) return;
      WATCHED.forEach((f) => {
        const a = Array.isArray(was[f]) ? was[f].join(",") : String(was[f] ?? "");
        const b = Array.isArray(it[f]) ? it[f].join(",") : String(it[f] ?? "");
        if (a !== b) noteUse("corrected", FIELD_NAME[f] || f);
      });
    });
    noteUse("accepted", "", "accepted", pending.length);
  }

  function confirmCheckback() {
    if (!pending) return;
    reportCorrections();
    const now = new Date().toISOString();
    let added = 0;
    pending.forEach((it) => {
      const title = (it.title || "").trim();
      if (!title) return;
      items.push({
        id: uid(),
        title,
        type: TYPES.includes(it.type) ? it.type : "task",
        // Told today means today — see finishItem in capture.js for why. Soft,
        // always: a date the app supplied, rather than one you gave, must never
        // be able to turn into a missed deadline.
        date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : it.someday ? "" : todayISO(),
        time: normaliseTime(it.time),
        deadlineType: it.deadlineType === "hard" ? "hard" : "soft",
        importance: IMPORTANCE.includes(it.importance) ? it.importance : "normal",
        effort: EFFORT.includes(it.effort) ? it.effort : "medium",
        tags: normaliseTags(it.tags),
        whenText: it.whenText || "",
        goalId: it.goalId && goalTitleById(it.goalId) ? it.goalId : "",
        standardId: standardLabelById(it.standardId) ? it.standardId : "",
        openLoop: it.openLoop === true,
        // WHICH PARTS OF YOUR LIFE THIS BELONGS TO — a list, because a training
        // session at school is work AND professional at once, and forcing a
        // choice makes the answer wrong whichever way you pick. Yours to name;
        // see areas.js, which has no idea what any of them mean.
        areas: window.OrganiserAreas ? OrganiserAreas.on(it) : [],
        // HOW BIG, and HOW MUCH OF IT IS DONE. Without these the planner sees a
        // guess where you gave it a number, and forgets every minute you ever put
        // in — which is how an eight-hour job got planned as an hour and a job
        // bigger than a day could never finish.
        plannedMinutes: Math.max(0, Math.round(Number(it.plannedMinutes) || 0)),
        spentMinutes: Math.max(0, Math.round(Number(it.spentMinutes) || 0)),
        // Where it came from, and whether you can still walk away from it. Two
        // separate facts — see priority.js.
        optional: it.optional === true,
        committed: it.committed === true,
        // Earliest this could possibly be done — NOT the same as when it's due.
        // Both readers produce it; it has to survive the trip into storage.
        notBefore: /^\d{4}-\d{2}-\d{2}$/.test(it.notBefore || "") ? it.notBefore : "",
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
      $("#dump").style.height = "auto";
    $("#checkback").hidden = true;
    $("#checkbackList").innerHTML = "";
    renderZones();
    setStatus(added === 1 ? "Added. ✓" : `Added ${added} things. ✓`);
    checkForClusterGoal(); // the new items might complete a cluster worth offering
  }

  function cancelCheckback() {
    if (pending && pending.length) noteUse("cancelled", "", "", pending.length);
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
    // Opening the editor on an auto-made task makes it YOURS. That matters:
    // auto-made tasks whose moment has passed untouched are quietly let go, and
    // anything you actually engaged with must survive that.
    if (it.autoPrep && !it.edited) {
      it.edited = true;
      persist();
    }
    card.innerHTML = `
      <div class="cb-head">
        <textarea class="cb-title" rows="1" aria-label="What it is">${escapeHtml(it.title)}</textarea>
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
      ${standardSelectHtml(it)}
      <div class="ed-actions"><button class="link ed-done" type="button">done editing</button></div>
    `;
    // Save as you go; don't re-render mid-edit (it would yank focus / jump zones).
    growTitle(card.querySelector(".cb-title"));
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
    const stdSel = card.querySelector(".cb-standard");
    if (stdSel)
      stdSel.addEventListener("change", (e) => {
        it.standardId = e.target.value; // attach an existing task to a standard, any time
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
    // Overdue means a deadline you gave has passed. A soft date is a wish about
    // when — and since the app dates anything you mention today, most soft
    // dates were never typed by anyone. Calling those overdue tomorrow would
    // manufacture a pile of failures out of things you merely said.
    const overdue = it.date && it.date < todayISO() && it.deadlineType === "hard";
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
          ${standardLabelById(it.standardId) ? `<span class="standard-chip">for ${escapeHtml(standardLabelById(it.standardId))}</span>` : ""}
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
  // THE SCHEDULE'S READING, not a second one. This was a private copy that
  // wanted two digits for the hour and answered 0 — midnight — for anything it
  // couldn't read, which is exactly what schedule.js documents as the reason
  // not to do that. Two functions with the same name giving different answers
  // to the same question is how a page and its planner come to disagree.
  function toMin(t) {
    const v = OrganiserSchedule.toMin(t);
    return v === null ? null : v;
  }
  function gapLabel(a, b) {
    const from = toMin(a);
    const to = toMin(b);
    if (from === null || to === null) return "";
    const mins = to - from;
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
    // Same rule as the list rows: only a deadline you actually gave can be late.
    const overdue = it.date && it.date < todayISO() && it.deadlineType === "hard";
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
        ${standardLabelById(it.standardId) ? `<span class="standard-chip">for ${escapeHtml(standardLabelById(it.standardId))}</span>` : ""}
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
    renderWaitingOn();
    renderMeetings();
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
  // The scoring itself lives in priority.js, because the Day plan fills its gaps
  // from the same definition. One answer to "what matters", used twice — so the
  // two screens can never quietly start disagreeing with each other.
  function priorityCtx() {
    return { today: todayISO(), goalTitle: goalTitleById, tight: tightNow() };
  }

  // See timeline.js — the same question, asked the same way, so the two pages
  // cannot start disagreeing about what is pressing.
  function tightNow() {
    const WPx = window.OrganiserWeekPlan;
    if (!WPx || !WPx.tightIds) return null;
    try {
      const c = OrganiserSchedule.normaliseConfig(scheduleConfig);
      return WPx.tightIds(items, schedule, c, todayISO(), Math.max(c.planHorizonDays, 28));
    } catch {
      return null;
    }
  }
  function shortlistReason(it) {
    const r = OrganiserPriority.reason(it, priorityCtx());
    return r || (it.date ? friendlyDate(it.date) : "");
  }
  function renderShortlist() {
    const listEl = $("#shortlistItems");
    const msgEl = $("#shortlistMsg");
    if (!listEl) return;
    // works on a fresh array — the stored items are never touched
    const eligible = OrganiserPriority.ordered(items, priorityCtx());
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

  // ---------- SMART SNOOZE: one button, because you're busy ----------
  // Choosing between four options is itself work, and it always arrives at the
  // worst moment. So there is one button — "not now" — and the app works out
  // when you're actually free from your own schedule. No decision at the point
  // of interruption; that's the whole point.
  //
  // If no timetable has been loaded yet it falls back to a plain "in about two
  // hours", so the button behaves sensibly from the first day.
  function snoozeTo(it, when, label) {
    it.remindAt = when;
    it.remindedAt = null; // re-arm
    persist();
    renderZones();
    setStatus(`Back to you ${label}. ✓`);
  }
  function notNow(it) {
    const next = OrganiserSchedule.nextFreeMoment(schedule, scheduleConfig, new Date());
    // A task that exists FOR a block can't be pushed past that block — "later"
    // would land after the thing it was for. nextFreeMoment already returns the
    // EARLIEST free moment, so if even that is too late, there is no free time
    // left before it starts. Saying so is more use than quietly agreeing to a
    // "later" that can't happen.
    const lesson = OrganiserSchedule.lessonMomentOf(it);
    if (lesson && next.at >= lesson) {
      setStatus("No free time left before this one starts — worth cutting it down, or going with what you've got.");
      return; // no snooze recorded: you asked, the app said there's nowhere to put it
    }
    it.snoozes = (Number(it.snoozes) || 0) + 1; // a plain count, kept on the task
    snoozeTo(it, fmtLocalDT(next.at), next.why);
  }
  function stopAsking(it) {
    it.remindAt = "";
    it.remindedAt = null;
    persist();
    renderZones();
    setStatus("Won't remind you about that again — it's still on your list.");
  }

  // ---------- the snooze counter ----------
  // A number, and nothing else. Not "you keep avoiding this" — the app does not
  // get to have an opinion about that. The number is simply a fact you can see.
  //
  // What it's FOR: a task pushed three times is usually one of three things —
  // not actually important, blocked by something unnamed, or too big for the
  // gaps it keeps being offered. That last one matters most, and deleting would
  // be exactly the wrong move. So at three the exits come to the front.
  //
  // Deliberately NOT attached to the ageing nudge. That's a different situation:
  // there the app spoke first, once, and went quiet. Here you have answered and
  // pushed back — counting your own answers is fair; counting the app's own
  // unanswered nudges would just be a guilt tally.
  function snoozeCount(it) {
    return Math.max(0, Number(it.snoozes) || 0);
  }
  function dropTask(it) {
    const snapshot = { ...it };
    items = items.filter((x) => x.id !== it.id);
    persist();
    renderZones();
    setStatus(`Dropped “${snapshot.title}”.`, () => {
      items.push(snapshot); // control by undo, not by an "are you sure"
      persist();
      renderZones();
      setStatus("Put it back. ✓");
    });
  }
  function makeSoft(it) {
    it.remindAt = "";
    it.remindedAt = null;
    it.deadlineType = "soft";
    it.snoozes = 0; // it's no longer being pushed back — there's nothing to push
    persist();
    renderZones();
    setStatus(`“${it.title}” stays on your list, quietly. No more pings. ✓`);
  }
  // Break it up — the exit that's usually right and never offered. The pieces
  // inherit everything that made the original findable (date, tags, goal,
  // standard), so nothing is orphaned by splitting it.
  function breakUpBox(it) {
    const box = document.createElement("div");
    box.className = "breakup";
    box.innerHTML = `
      <p class="bu-hint">What are the actual pieces? One per line — the original closes when you save.</p>
      <textarea class="bu-text" rows="3" placeholder="first small piece&#10;next small piece"></textarea>
      <div class="bu-actions">
        <button type="button" class="btn bu-save">Save the pieces</button>
        <button type="button" class="link bu-cancel">cancel</button>
      </div>`;
    const ta = box.querySelector(".bu-text");
    setTimeout(() => ta.focus(), 0);
    box.querySelector(".bu-cancel").addEventListener("click", () => {
      openExits = null;
      renderZones();
    });
    box.querySelector(".bu-save").addEventListener("click", () => {
      const pieces = ta.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (!pieces.length) {
        ta.focus();
        return;
      }
      pieces.forEach((title) => {
        items.push({
          id: uid(),
          title,
          type: it.type || "task",
          date: it.date || "",
          time: "",
          deadlineType: it.deadlineType || "soft",
          importance: it.importance || "normal",
          effort: "quick", // a piece of a too-big thing is, by definition, smaller
          tags: Array.isArray(it.tags) ? it.tags.slice() : [],
          whenText: it.whenText || "",
          goalId: it.goalId || "",
          standardId: it.standardId || "",
          openLoop: false,
          promisedTo: it.promisedTo || "",
          remindAt: "",
          remindedAt: null,
          createdAt: new Date().toISOString(),
          done: false,
        });
      });
      it.done = true; // the original is finished — it has become its pieces
      it.completedAt = new Date().toISOString();
      it.brokenInto = pieces.length;
      openExits = null;
      persist();
      renderZones();
      setStatus(`Split into ${pieces.length} smaller piece${pieces.length === 1 ? "" : "s"}. ✓`);
    });
    return box;
  }

  let openExits = null; // which item's exits are showing
  let breakingUp = null; // which item's break-up box is open

  function snoozeRow(it) {
    const row = document.createElement("div");
    row.className = "snooze-row";
    const n = snoozeCount(it);
    const red = n >= 3;

    if (n > 0) {
      const chip = document.createElement("span");
      chip.className = "sn-count " + (n >= 3 ? "red" : n === 2 ? "amber" : "green");
      chip.textContent = n;
      chip.title = `Pushed back ${n} time${n === 1 ? "" : "s"}`;
      row.appendChild(chip);
    }

    const not = document.createElement("button");
    not.type = "button";
    not.className = "btn tiny sn-notnow";
    not.textContent = "not now";
    not.addEventListener("click", () => notNow(it));
    row.appendChild(not);

    // Below red the exits stay one tap away, out of the way. At red they open
    // themselves — three pushes means the plain "later" isn't working.
    const showExits = red || openExits === it.id;
    if (!showExits) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "link sn-more";
      more.textContent = "options";
      more.addEventListener("click", () => {
        openExits = it.id;
        renderZones();
      });
      row.appendChild(more);
    } else {
      const exits = document.createElement("span");
      exits.className = "sn-exits";
      const mk = (label, fn, cls) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "link " + (cls || "");
        b.textContent = label;
        b.addEventListener("click", fn);
        exits.appendChild(b);
      };
      mk("break it up", () => {
        breakingUp = breakingUp === it.id ? null : it.id;
        openExits = it.id;
        renderZones();
      });
      mk("make it soft", () => makeSoft(it));
      mk("drop it", () => dropTask(it));
      row.appendChild(exits);
    }

    if (breakingUp === it.id) {
      const wrap = document.createElement("div");
      wrap.className = "snooze-wrap";
      wrap.appendChild(row);
      wrap.appendChild(breakUpBox(it));
      return wrap;
    }
    return row;
  }

  // ---------- "needs finishing": open loops, loudest on the page (§0.2 s28) ----------
  // Prepped-but-not-closed is the highest-risk state — the thing that slips when
  // memory is the only holder. These surface here (louder than the shortlist,
  // which skips them to avoid double-shouting), each showing when its reminder
  // will come find you.
  // HOW LONG SOMETHING HAS BEEN OPEN. The list of things you are waiting on
  // other people for has always said this; the list of things YOU started and
  // left said nothing at all, which is the wrong way round — the one you can do
  // something about was the one going quiet.
  function openSince(it) {
    const s = OrganiserDates.agoWords(it.createdAt);
    if (!s) return "";
    return s === "today" ? "started today" : `open ${s}`;
  }

  function renderLoops() {
    const section = $("#loops");
    const listEl = $("#loopsList");
    if (!section || !listEl) return;
    const loops = items
      .filter((i) => !i.done && i.openLoop)
      // When it will next ask, then how long it has been sitting. Without the
      // second, a loop with no reminder on it sinks below every loop that has
      // one, however long ago you started it — and the ones nobody set a
      // reminder for are exactly the ones that go quiet for a term.
      .sort(
        (a, b) =>
          (a.remindAt || "9999").localeCompare(b.remindAt || "9999") ||
          String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
      );
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
            <span class="lp-since">${escapeHtml(openSince(it))}</span>
            ${due ? `<span class="when${it.deadlineType === "hard" ? " due" : ""}">${it.deadlineType === "hard" ? "due " : ""}${escapeHtml(due)}</span>` : ""}
            ${ping ? `<span class="ping-info">${escapeHtml(ping)}</span>` : ""}
          </div>
        </div>`;
      row.querySelector(".tick").addEventListener("click", () => complete(it.id));
      row.appendChild(editLink(it));
      listEl.appendChild(row);
      if (it.remindAt) listEl.appendChild(snoozeRow(it)); // move it, or stop it asking
    });
  }

  // ---------- before a meeting: what you ACTUALLY have ----------
  // This is the one panel that exists to stop a specific bad moment: walking
  // into a meeting believing you're prepared, and finding you have nothing.
  //
  // Three rules it follows:
  //   - It speaks first. You never have to remember to check.
  //   - It separates "here's what you have" from "here's what you haven't", so
  //     a green-looking screen can't quietly mean an empty folder.
  //   - Every gap it names has a one-tap way to become a real task, dated to
  //     land before the meeting — because naming a problem without offering the
  //     next step is just a nicer way of worrying.
  function renderMeetings() {
    const section = $("#meetings");
    const listEl = $("#meetingsList");
    if (!section || !listEl || !window.OrganiserMeeting || !window.OrganiserSchedule) return;
    const due = OrganiserMeeting.upcoming(schedule, scheduleConfig, new Date());
    if (!due.length) {
      section.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    section.hidden = false;
    listEl.innerHTML = "";
    const cfgR = recordConfig || { topics: [] };

    due.slice(0, 3).forEach((m) => {
      const card = document.createElement("div");
      card.className = "mt-card";
      const when =
        m.daysAway === 0 ? "today" : m.daysAway === 1 ? "tomorrow" : `in ${m.daysAway} days`;
      const readies = m.block.about.map((who) => OrganiserMeeting.readiness(who, records, cfgR));
      const verdict = OrganiserMeeting.verdict(readies, cfgR);
      const head = document.createElement("div");
      head.className = "mt-head";
      head.innerHTML = `
        <span class="mt-when ${verdict === "empty-handed" ? "urgent" : ""}">${escapeHtml(when)}</span>
        <span class="mt-label">${escapeHtml(m.block.label)}</span>
        <span class="mt-time">${escapeHtml(OrganiserSchedule.fmtSpan(m.block.start, m.block.end))}</span>`;
      card.appendChild(head);

      readies.forEach((r) => {
        const { have, missing } = OrganiserMeeting.lines(r, cfgR);
        const who = document.createElement("div");
        who.className = "mt-who";
        who.innerHTML = `<div class="mt-name">${escapeHtml(r.who)}</div>`;

        // What you have — stated plainly, even when it's zero.
        const haveEl = document.createElement("div");
        haveEl.className = "mt-have";
        haveEl.textContent = have.length ? have.map((h) => h.text).join(" · ") : "nothing written down yet";
        who.appendChild(haveEl);

        missing.forEach((g) => {
          const row = document.createElement("div");
          row.className = "mt-gap" + (g.blocking ? " blocking" : "");
          row.innerHTML = `<span class="mt-gaptext">${escapeHtml(g.text)}</span>`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "link mt-fix";
          const already = items.some((i) => !i.done && i.title === g.task);
          btn.textContent = already ? "on your list ✓" : "make it a task";
          btn.disabled = already;
          btn.addEventListener("click", () => makeMeetingTask(g.task, m));
          row.appendChild(btn);
          who.appendChild(row);
        });
        card.appendChild(who);
      });
      listEl.appendChild(card);
    });
  }

  // Working back from the meeting date: the task is due the day before, so it
  // lands while there's still time to do something about it.
  function makeMeetingTask(title, m) {
    const dayBefore = addDaysISO(m.date, -1);
    const today = todayISO();
    items.push({
      id: uid(),
      title,
      type: "task",
      date: dayBefore < today ? today : dayBefore,
      time: "",
      deadlineType: "hard", // it has a real, external date — the meeting happens regardless
      importance: "high",
      effort: "medium",
      tags: [],
      whenText: `before ${m.block.label}`,
      goalId: "",
      standardId: "",
      openLoop: false,
      promisedTo: "",
      remindAt: "",
      remindedAt: null,
      createdAt: new Date().toISOString(),
      done: false,
    });
    persist();
    renderZones();
    setStatus(`Added “${title}” for the day before. ✓`);
  }

  // ---------- waiting to hear back ----------
  //
  // "I've sent it, waiting for their reply" is a genuinely different shape from
  // everything else here. You can't finish it — the next move is theirs — so it
  // has no deadline you could meet, and putting it in "Needs finishing" would
  // blame you for someone else's silence.
  //
  // What it needs is a RHYTHM: come back every few days and ask. Which sounds
  // like nagging, and the rule against nagging is real — so the difference
  // matters. Nagging is the app deciding something should bother you. This is
  // the app holding a thing YOU said you were waiting for, and every single
  // time it comes back there are four answers, one of which ends it for good.
  // It also counts how many times it has asked, out loud, and stops on its own.
  const ASK_EVERY_DAYS = 5; // how long a silence sits before it's worth a nudge
  const ASK_AT_MOST = 6; // then it stops by itself and says so — never endless

  function waitingDays(it) {
    if (!it.waitingSince) return 0;
    return Math.max(0, Math.round((new Date() - new Date(it.waitingSince + "T12:00:00")) / 86400000));
  }
  // The same scale the loops list uses, so two lists about how long something
  // has been sitting cannot describe the same month differently.
  function sinceWords(it) {
    const s = OrganiserDates.agoWords(it.waitingSince ? it.waitingSince + "T12:00:00" : "");
    return s === "today" ? "since today" : s;
  }
  function armWaiting(it, days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    it.remindAt = fmtLocalDT(d);
    it.remindedAt = null;
  }
  function renderWaitingOn() {
    const section = $("#waitingOn");
    const listEl = $("#waitingOnList");
    if (!section || !listEl) return;
    const list = items
      .filter((i) => !i.done && i.waitingOn)
      .sort((a, b) => (a.waitingSince || "").localeCompare(b.waitingSince || ""));
    section.hidden = !list.length;
    listEl.innerHTML = "";
    if (!list.length) return;

    list.forEach((it) => {
      const days = waitingDays(it);
      const asked = Number(it.asked) || 0;
      const row = document.createElement("div");
      row.className = "wo-row";
      row.innerHTML = `
        <div class="wo-main">
          <div class="wo-title">${escapeHtml(it.title)}</div>
          <div class="wo-meta">
            <span class="wo-who">${escapeHtml(it.waitingOn)}</span>
            <span class="wo-since">${escapeHtml(sinceWords(it))}</span>
            ${asked ? `<span class="wo-asked">asked you ${asked}×</span>` : ""}
            ${it.remindAt && !it.remindedAt ? `<span class="ping-info">${escapeHtml(fmtRemind(it))}</span>` : ""}
          </div>
        </div>`;
      const acts = document.createElement("div");
      acts.className = "wo-acts";
      const mk = (label, fn, cls) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls || "link";
        b.textContent = label;
        b.addEventListener("click", fn);
        acts.appendChild(b);
      };
      mk("it came", () => complete(it.id), "btn tiny");
      mk("nudge them", () => nudge(it));
      mk("still waiting", () => {
        it.asked = 0; // you answered, so the count of unanswered asks resets
        armWaiting(it, ASK_EVERY_DAYS);
        persist();
        renderZones();
        setStatus(`Kept waiting on ${it.waitingOn} — back in ${ASK_EVERY_DAYS} days. ✓`);
      });
      mk("stop asking", () => {
        it.waitingOn = "";
        it.remindAt = "";
        it.remindedAt = null;
        persist();
        renderZones();
        setStatus("Won't ask about that again — the task is still on your list.");
      });
      row.appendChild(acts);
      listEl.appendChild(row);
      if (asked >= ASK_AT_MOST) {
        const done = document.createElement("p");
        done.className = "wo-stopped";
        done.textContent = `I've asked about this ${asked} times and I'll stop now. It stays here either way.`;
        listEl.appendChild(done);
      }
    });
  }

  // Chasing is a real, separate job — so it becomes a real, separate task
  // rather than a feeling. The waiting item stays waiting.
  function nudge(it) {
    items.push({
      id: uid(),
      title: `Nudge ${it.waitingOn} about ${it.title.replace(/^(waiting for|waiting on)\s+/i, "")}`,
      type: "task",
      date: todayISO(),
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: "quick",
      tags: [],
      whenText: "",
      goalId: "",
      standardId: "",
      openLoop: false,
      promisedTo: "",
      waitingOn: "",
      remindAt: "",
      remindedAt: null,
      createdAt: new Date().toISOString(),
      done: false,
    });
    it.asked = 0;
    armWaiting(it, ASK_EVERY_DAYS);
    persist();
    renderZones();
    setStatus(`Added a nudge to today's list. ✓`);
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
  // A SIGNPOST, ONLY WHILE IT IS ANY USE. There was nothing anywhere saying
  // where to start, and the timetable — the thing everything else fits around —
  // was behind a collapsed panel on another page. This says so once, on the
  // page you land on, and disappears the moment anything at all is set up.
  function renderNewHere() {
    const el = $("#newHere");
    if (!el) return;
    const nothingYet =
      !(schedule || []).length && !(contacts || []).length && !(items || []).length;
    el.hidden = !nothingYet;
  }

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
    } else if (s.state === "conflict") {
      // SAID BY saving.js, ON EVERY PAGE. This line keeps the everyday news —
      // saving, saved — and leaves anything that went wrong to the one place
      // that says it the same way wherever you happen to be standing.
      el.textContent = "";
    } else if (s.state === "saved") {
      el.classList.add("saved");
      const t = s.at ? new Date(s.at) : new Date();
      el.textContent = s.note || `Saved ✓ ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } else if (s.state === "error") {
      el.textContent = "";
    }
  }

  function applyMode() {
    const btn = $("#sortBtn");
    btn.textContent = aiAvailable ? "Sort it" : "Add";
    // Three states, three hints. "Never set up" and "set up but not running"
    // are different problems with different fixes, and until now the app said
    // the same thing for both — which is why it looked like it had simply
    // decided to stop sorting.
    $("#dumpHint").textContent = aiAvailable
      ? "or press ⌘/Ctrl + Enter"
      : engineNote
        ? "Saved as you typed it — sorting is unavailable just now."
        : "Type one thing and add it — smart sorting is a later step.";
    const banner = $("#aiBanner");
    if (!banner) return;
    banner.hidden = !engineNote;
    if (engineNote) $("#aiBannerWhy").textContent = engineNote;
  }

  // Once you've started Ollama you shouldn't have to work out that the page
  // needs reloading. Ask again, in place.
  async function recheckEngine() {
    const btn = $("#aiRecheck");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Checking…";
    }
    try {
      const j = await (await fetch("/api/health")).json();
      aiAvailable = !!j.hasAI;
      engineNote = j.configured && !j.hasAI ? j.engineNote || "" : "";
      applyMode();
      setStatus(aiAvailable ? "Sorting is back on. ✓" : engineNote || "Still not answering.");
      if (aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
    } catch {
      setStatus("Couldn't check just now.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Check again";
      }
    }
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
      records = data.records || [];
      recordConfig = data.recordConfig || null;
      OrganiserStore.save({ items, waiting, goals, records, recordConfig });
      renderZones();
      renderWaiting();
      setStatus("Restored from your backup. ✓");
    } catch (err) {
      setStatus(err.message || "Couldn't read that backup.");
    }
    e.target.value = "";
  }

  // ---------- wire up ----------
  // When another computer changes the shared file, the store pulls it in and
  // hands us the fresh state — re-render from it without a reload.
  function refreshFromExternal(state) {
    if (editingItemId || pending) return; // don't yank away an open edit / check-back
    items = state.items || [];
    waiting = state.waiting || [];
    goals = state.goals || [];
    records = state.records || [];
    recordConfig = state.recordConfig || recordConfig;
    portfolio = state.portfolio || portfolio;
    contacts = state.contacts || contacts;
    schedule = state.schedule || schedule;
    scheduleConfig = state.scheduleConfig || scheduleConfig;
    renderZones();
    renderWaiting();
    setStatus("Updated with changes from another device.");
  }

  async function init() {
    OrganiserStore.onStatus(renderStorageStatus);
    OrganiserStore.onExternalChange(refreshFromExternal);

    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];
    goals = data.goals || [];
    records = data.records || [];
    recordConfig = data.recordConfig || null;
    portfolio = data.portfolio || null;
    contacts = data.contacts || [];
    schedule = data.schedule || [];
    scheduleConfig = data.scheduleConfig || null;
    syncPrep(); // the tasks a block owes shouldn't wait for a visit to the Day tab

    $("#sortBtn").addEventListener("click", onSort);
    const recheck = $("#aiRecheck");
    if (recheck) recheck.addEventListener("click", recheckEngine);
    $("#dump").addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSort();
      }
    });
    // Grow to fit a pasted conversation, so you can see what you dropped in.
    const dumpBox = $("#dump");
    const growDump = () => {
      dumpBox.style.height = "auto";
      dumpBox.style.height = Math.min(dumpBox.scrollHeight, 260) + "px";
    };
    dumpBox.addEventListener("input", growDump);
    dumpBox.addEventListener("paste", () => setTimeout(growDump, 0));
    // Speak it instead of typing (the mic only appears if this machine can).
    if (window.OrganiserVoice) OrganiserVoice.attach(dumpBox, $(".dumprow"), setStatus);
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
    renderNewHere();
    if (data.migratedNote) setStatus(data.migratedNote);
    await checkHealth();
    checkForClusterGoal(); // gentle, only if there's a real pile of loose tasks
  }

  init();
})();
