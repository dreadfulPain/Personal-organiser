// The SEEING half. Renders the zones, ticks things off, and adds things.
// All storage goes through OrganiserStore (store.js) — this file never touches
// localStorage or the network directly for data.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };
  const TYPES = ["task", "appointment", "reminder", "note"];
  const IMPORTANCE = ["high", "normal", "low"];
  const SHORTLIST_CAP = 5; // "what matters today": keep it short — change here

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
  function normaliseTags(t) {
    if (!Array.isArray(t)) return [];
    return t.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 4);
  }
  function importanceOf(it) {
    return IMPORTANCE.includes(it.importance) ? it.importance : "normal";
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
      deadlineType: it.deadlineType === "hard" ? "hard" : "soft",
      importance: IMPORTANCE.includes(it.importance) ? it.importance : "normal",
      tags: normaliseTags(it.tags),
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
      pending = [{ title: text, type: "task", date: "", time: "", deadlineType: "soft", importance: "normal", tags: [], whenText: "" }];
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
    const tags = Array.isArray(it.tags) ? it.tags : [];
    if (tags.length) parts.push(tags.join(", "));
    return parts.join(" · ");
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
      card.querySelector(".cb-tags").addEventListener("input", (e) => {
        pending[i].tags = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 4);
        refreshSummary();
      });
      card.querySelector(".cb-deadline").addEventListener("change", (e) => {
        pending[i].deadlineType = e.target.value;
        refreshSummary();
      });
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
        tags: normaliseTags(it.tags),
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
    const imp = importanceOf(it);
    row.className = `item imp-${imp}`;
    const overdue = it.date && it.date < todayISO();
    let label = it.date ? friendlyDate(it.date) : it.whenText ? capitalize(it.whenText) : "";
    const tlabel = fmtTime(it.time);
    if (tlabel) label = label ? `${label} · ${tlabel}` : tlabel;
    const showDue = it.deadlineType === "hard" && it.date;
    const tags = Array.isArray(it.tags) ? it.tags : [];
    const impWord = imp === "high" ? "matters a lot" : imp === "low" ? "minor" : "";
    row.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type]}</span>
          ${impWord ? `<span class="imp-word imp-${imp}">${impWord}</span>` : ""}
          ${label ? `<span class="when ${overdue ? "overdue" : ""}${showDue ? " due" : ""}">${showDue ? "due " : ""}${escapeHtml(label)}${overdue ? " · overdue" : ""}</span>` : ""}
          ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
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

    renderShortlist();
  }

  // ---------- "what matters today" shortlist ----------
  // A read-only highlight computed from the stored signals. No AI, instant,
  // offline. It never changes, reorders, or completes the stored items — the
  // full zones below are the source of truth and one glance away.
  function shortlistEligible(it) {
    const t = todayISO();
    const dueNow = it.date && it.date <= t;
    if (it.deadlineType === "hard" && dueNow) return true; // hard deadline, can't wait
    if (importanceOf(it) === "high") return true; // you said it matters
    if (it.date) return true; // dated → can fill a slot by nearest date
    return false; // floaty and not important → not a "today" thing
  }
  function shortlistRank(it) {
    const t = todayISO();
    const dueNow = it.date && it.date <= t;
    if (it.deadlineType === "hard" && dueNow) return 0; // always first
    if (importanceOf(it) === "high") return 1; // then importance (high first)
    if (dueNow) return 2; // then anything else due today/overdue
    return 3; // then upcoming, by nearest date
  }
  function shortlistReason(it) {
    const t = todayISO();
    if (it.date && it.date < t) return "overdue";
    if (it.date && it.date === t) return "due today";
    if (importanceOf(it) === "high") return "matters a lot";
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
      OrganiserStore.save({ items, waiting, goals: data.goals || [] });
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
      OrganiserStore.exportNow();
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
