// The Week room: the next seven days as a calm list — never a grid wall.
// Pure seeing + tick; everything else happens on Home.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];
  let schedule = [];
  let cfg = null;

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const todayISO = () => isoOf(new Date());
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function dayHeading(iso, i) {
    if (i === 0) return "Today";
    if (i === 1) return "Tomorrow";
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "short",
    });
  }
  function fmtTime(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const d = new Date();
    d.setHours(+m[1], +m[2], 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function complete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = new Date().toISOString();
    OrganiserStore.save({ items });
    render();
  }

  function row(it, p) {
    const el = document.createElement("div");
    el.className = "item wk-item";
    // The time the week has set aside for it, or the time you set by hand.
    const t =
      p && !p.pinnedByHand && window.OrganiserSchedule
        ? fmtTime(OrganiserSchedule.toHM(p.start))
        : fmtTime(it.time);
    el.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      ${t ? `<div class="tl-time">${escapeHtml(t)}</div>` : ""}
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>
          ${p && p.early ? `<span class="when">ahead of ${escapeHtml(dayName(it.date))}</span>` : ""}
          ${it.deadlineType === "hard" ? `<span class="when due">hard deadline</span>` : ""}
          ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(it.promisedTo)}</span>` : ""}
          ${it.openLoop ? `<span class="loop-chip">needs finishing</span>` : ""}
        </div>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => complete(it.id));
    return el;
  }

  const DAYS = 7;

  // WHAT'S CHANGED HERE. This page used to list whatever carried the day's date
  // on it. That answered "when is this due", never "when am I going to do it" —
  // so a big job due Friday sat on Friday looking fine, right up until Friday
  // turned out to have no room in it. Now the week is planned: work is shown on
  // the day there is actually space for it, before it's due, and anything that
  // won't fit at all is said at the top on Monday rather than discovered later.
  function render() {
    const wrap = $("#weekList");
    wrap.innerHTML = "";
    const t = todayISO();
    const WP = window.OrganiserWeekPlan;
    const plan = WP ? WP.spread(items, schedule, cfg, t, DAYS, { today: t, goalTitle: () => "" }) : null;

    if (plan && plan.wontFit.length) wrap.appendChild(wontFitBox(plan));

    for (let i = 0; i < DAYS; i++) {
      const iso = addDaysISO(t, i);
      const placed = plan ? plan.byDay[iso] || [] : [];
      const seen = new Set(placed.map((p) => p.itemId));
      // Placed by the week, plus anything you pinned to a time on this day
      // yourself — your own decision is never quietly dropped from the picture.
      const pinned = items
        .filter((x) => !x.done && x.date === iso && x.time && !seen.has(x.id))
        .map((x) => ({ itemId: x.id, start: 0, pinnedByHand: true }));
      const day = placed
        .concat(pinned)
        .map((p) => ({ ...p, it: items.find((x) => x.id === p.itemId) }))
        .filter((p) => p.it && !p.it.done)
        .sort((a, b) => a.start - b.start);

      const sec = document.createElement("section");
      sec.className = "wk-day";
      const h = document.createElement("h2");
      h.className = "wk-heading" + (i === 0 ? " today" : "");
      h.textContent = dayHeading(iso, i);
      sec.appendChild(h);
      if (!day.length) {
        sec.insertAdjacentHTML("beforeend", `<p class="wk-free">free</p>`);
      } else {
        const list = document.createElement("div");
        list.className = "items";
        day.forEach((p) => list.appendChild(row(p.it, p)));
        sec.appendChild(list);
      }
      wrap.appendChild(sec);
    }
  }

  // Said now, while there's still a week left to do something about it.
  function wontFitBox(plan) {
    const box = document.createElement("div");
    box.className = "dp-flagged";
    const rows = plan.wontFit
      .map((w) => ({ w, it: items.find((x) => x.id === w.itemId) }))
      .filter((r) => r.it);
    if (!rows.length) return box;
    box.innerHTML =
      `<h3>Won't fit before ${rows.length === 1 ? "it's" : "they're"} due</h3>` +
      `<p class="muted">There isn't a long enough stretch left in the week for ${rows.length === 1 ? "this" : "these"}. ` +
      `Better said now than on the day. It may want breaking into smaller pieces, moving, or letting go of.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    rows.forEach(({ w, it }) => {
      const el = document.createElement("div");
      el.className = "dp-flagrow";
      el.innerHTML =
        `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>` +
        `<span class="when due">needs ${escapeHtml(mins(w.minutes))}${w.date ? ` by ${escapeHtml(dayName(w.date))}` : ""}</span>`;
      list.appendChild(el);
    });
    box.appendChild(list);
    return box;
  }

  function mins(n) {
    return window.OrganiserSchedule ? OrganiserSchedule.durationWords(n) : `${n} min`;
  }
  function dayName(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    schedule = data.schedule || [];
    cfg = data.scheduleConfig || null;
    OrganiserStore.onExternalChange((state) => {
      items = state.items || items;
      schedule = state.schedule || schedule;
      cfg = state.scheduleConfig || cfg;
      render();
    });
    render();
  }

  init();
})();
