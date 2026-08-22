// THE REGISTER PAGE.
//
// Taking it has to cost about four seconds or it won't happen on a bad day, and
// a bad day is exactly when the information turns out to matter. So: pick the
// class, tap the one or two who aren't there, keep it. Nobody is ticked present.
//
// Everything else on the page is what that costs buys you — a run of absences
// said out loud, and a list of what somebody was never in the room for.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let attendance = [], contacts = [], schedule = [], lessons = [], records = [], recordConfig = null;
  let group = "", slotId = "", when = "";
  let away = new Set(), late = new Set();
  let looking = ""; // whose "missed while away" list is open

  const $ = (s) => document.querySelector(s);
  const A = () => window.OrganiserAttend;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const groups = () =>
    [...new Set(contacts.map((c) => (c && c.group) || "").filter(Boolean))].sort();
  // IN THE ORDER YOU READ A REGISTER — by name. They came back in whatever order
  // they happened to be stored in, which for a pasted class list is backwards.
  // A register you have to hunt down is a register you take badly.
  const members = () =>
    contacts
      .filter((c) => c && c.id && (!group || c.group === group))
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  // The blocks that run on the day being taken, earliest first. Falls back to
  // the whole list only when there is no schedule module to ask.
  function daysBlocks() {
    const S = window.OrganiserSchedule;
    const list =
      S && S.blocksOn && when
        ? S.blocksOn(schedule, when).filter((b) => !b.blocksDay && !b.noLessons)
        : schedule.filter((x) => x && x.id);
    return list
      .filter((x) => x && x.id)
      .slice()
      .sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
  }

  // 09:30 → 9:30 AM, in whatever way this machine writes times.
  function fmtTime(hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ""));
    if (!m) return "";
    const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  const nameOf = (id) => {
    const c = contacts.find((x) => x && x.id === id);
    return (c && c.name) || id;
  };

  // ---- taking it ----------------------------------------------------------
  function renderTake() {
    const el = $("#atNames");
    const block = $("#atTakeBlock");
    if (!el || !block) return;
    const ms = members();
    block.hidden = !group;
    if (!group) return;
    if (!ms.length) {
      el.innerHTML = `<p class="muted">Nobody on your list is in ${esc(group)}.</p>`;
      return;
    }
    // Already taken for this class, day and lesson? Then this is a correction,
    // and it opens showing what you said last time rather than blank.
    const existing = A()
      .sessions(attendance, group)
      .find((s) => s.date === when && s.slotId === slotId);
    const words = $("#atTakenWords");
    if (words)
      words.textContent = existing
        ? `Already taken for this one — tapping changes it rather than adding a second.`
        : `Nobody is marked away until you tap them.`;
    el.innerHTML = ms
      .map(
        (m) =>
          `<div class="at-row"><span class="at-name">${esc(m.name || m.id)}</span>` +
          `<button type="button" class="p-opt at-away${away.has(m.id) ? " on" : ""}" ` +
          `data-id="${esc(m.id)}">away</button>` +
          `<button type="button" class="p-opt at-late${late.has(m.id) ? " on" : ""}" ` +
          `data-id="${esc(m.id)}">late</button></div>`
      )
      .join("");
  }

  function loadExisting() {
    away = new Set();
    late = new Set();
    if (!group || !when) return;
    const s = A().sessions(attendance, group).find((x) => x.date === when && x.slotId === slotId);
    if (!s) return;
    s.away.forEach((x) => away.add(x));
    s.late.forEach((x) => late.add(x));
  }

  function save() {
    if (!group || !when) return;
    attendance = A().take(
      attendance,
      { group, slotId, away: [...away], late: [...late] },
      when
    );
    OrganiserStore.save({ attendance });
    render();
  }

  // ---- who has stopped coming ---------------------------------------------
  function renderWatch() {
    const el = $("#atWatch");
    const block = $("#atWatchBlock");
    if (!el || !block) return;
    const ms = members();
    const rows = A().concerns(attendance, ms, group, todayISO(), {});
    block.hidden = !group;
    const w = $("#atWatchWords");
    if (w) w.textContent = A().summary(rows, ms.length);
    el.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="at-watch${r.missingNow ? " now" : r.oftenAway ? " often" : ""}">` +
              `<div class="p-thead"><strong>${esc(r.name)}</strong>` +
              `<span class="p-state">${esc(A().words(r))}</span></div>` +
              `<button type="button" class="link at-look" data-id="${esc(r.who)}">` +
              `${looking === r.who ? "close" : "what they missed"}</button>` +
              (looking === r.who ? missedList(r.who) : "") +
              `</div>`
          )
          .join("")
      : "";
  }

  // ---- what they weren't in the room for ----------------------------------
  function missedList(who) {
    const rows = A().missed(lessons, attendance, records, recordConfig, who, group);
    if (!rows.length)
      return `<p class="muted">Nothing outstanding — either they were in for it another time, or they've been judged at target on it since.</p>`;
    return (
      `<p class="muted">${esc(A().missedWords(rows))}</p>` +
      rows
        .map(
          (r) =>
            `<div class="ro-row"><span><strong>${esc(r.code)}</strong> ` +
            `${esc(r.lesson)}</span><span class="p-state">` +
            `away ${r.dates.length === 1 ? "on" : "for"} ${esc(window.OrganiserDates.daysWords(r.dates))}` +
            (r.caughtElsewhere ? " · came up again while they were in" : "") +
            (r.judged ? ` · judged ${esc(r.level)} since` : "") +
            `</span></div>`
        )
        .join("")
    );
  }

  function renderCatch() {
    // The same information the other way round: everyone in the class who has
    // something outstanding, so it can be seen without picking a name first.
    const el = $("#atCatch");
    const block = $("#atCatchBlock");
    if (!el || !block) return;
    const rows = members()
      .map((m) => ({ m, missed: A().missed(lessons, attendance, records, recordConfig, m.id, group) }))
      .filter((x) => x.missed.some((r) => !r.caughtElsewhere));
    block.hidden = !group || !rows.length;
    el.innerHTML = rows
      .map(
        (x) =>
          `<div class="ro-row"><span>${esc(x.m.name || x.m.id)}</span>` +
          `<span class="p-state">${esc(
            x.missed.filter((r) => !r.caughtElsewhere).map((r) => r.code).join(", ")
          )}</span></div>`
      )
      .join("");
  }

  function wire() {
    const names = $("#atNames");
    if (names)
      names.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest("button") : null;
        if (!b) return;
        const id = b.dataset.id;
        if (b.classList.contains("at-away")) {
          if (away.has(id)) away.delete(id);
          else { away.add(id); late.delete(id); }
        } else if (b.classList.contains("at-late")) {
          // Late is not a little bit absent. Marking one clears the other.
          if (late.has(id)) late.delete(id);
          else { late.add(id); away.delete(id); }
        }
        renderTake();
      });
    const watch = $("#atWatch");
    if (watch)
      watch.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest(".at-look") : null;
        if (!b) return;
        looking = looking === b.dataset.id ? "" : b.dataset.id;
        renderWatch();
      });
    const btn = $("#atSave");
    if (btn) btn.addEventListener("click", save);
    const g = $("#atGroup");
    if (g) g.addEventListener("change", () => { group = g.value; loadExisting(); render(); });
    const d = $("#atDate");
    if (d) d.addEventListener("change", () => { when = d.value; loadExisting(); render(); });
    const sl = $("#atSlot");
    if (sl) sl.addEventListener("change", () => { slotId = sl.value; loadExisting(); render(); });
  }

  function renderPickers() {
    const g = $("#atGroup");
    if (g) {
      const gs = groups();
      g.innerHTML =
        `<option value="">choose…</option>` +
        gs.map((x) => `<option value="${esc(x)}"${x === group ? " selected" : ""}>${esc(x)}</option>`).join("");
    }
    const d = $("#atDate");
    if (d && !d.value) { d.value = when || todayISO(); when = d.value; }
    const sl = $("#atSlot");
    if (sl) {
      // ONLY THE LESSONS THAT ACTUALLY RUN THAT DAY, and each one wearing its
      // time. A full timetable put all twenty-two blocks in here — including
      // five identical "Form time" entries and the canteen duty — so choosing
      // the right one meant counting down the list and hoping.
      const onDay = daysBlocks();
      sl.innerHTML =
        `<option value="">any slot</option>` +
        onDay
          .map((x) => {
            const t = x.start ? `${fmtTime(x.start)} ` : "";
            return `<option value="${esc(x.id)}"${x.id === slotId ? " selected" : ""}>${esc(t + (x.label || x.id))}</option>`;
          })
          .join("");
      // A lesson picked on Monday isn't on the list any more once you look at
      // Tuesday. Saying nothing and silently keeping it would file the register
      // against a lesson that didn't happen.
      if (slotId && !onDay.some((x) => x.id === slotId)) {
        slotId = "";
        sl.value = "";
      }
    }
  }

  function render() {
    renderPickers();
    renderTake();
    renderWatch();
    renderCatch();
  }

  async function init() {
    const data = await OrganiserStore.load();
    attendance = Array.isArray(data.attendance) ? data.attendance : [];
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    schedule = Array.isArray(data.schedule) ? data.schedule : [];
    lessons = Array.isArray(data.lessons) ? data.lessons : [];
    records = Array.isArray(data.records) ? data.records : [];
    recordConfig = data.recordConfig || null;
    when = todayISO();
    const gs = groups();
    if (gs.length === 1) group = gs[0];
    wire();
    loadExisting();
    render();
  }

  init();
})();
