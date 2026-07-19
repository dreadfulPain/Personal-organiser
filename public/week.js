// The Week room: the next seven days as a calm list — never a grid wall.
// Pure seeing + tick; everything else happens on Home.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];

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

  function row(it) {
    const el = document.createElement("div");
    el.className = "item wk-item";
    const t = fmtTime(it.time);
    el.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      ${t ? `<div class="tl-time">${escapeHtml(t)}</div>` : ""}
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>
          ${it.deadlineType === "hard" ? `<span class="when due">hard deadline</span>` : ""}
          ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(it.promisedTo)}</span>` : ""}
          ${it.openLoop ? `<span class="loop-chip">needs finishing</span>` : ""}
        </div>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => complete(it.id));
    return el;
  }

  function render() {
    const wrap = $("#weekList");
    wrap.innerHTML = "";
    const t = todayISO();
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(t, i);
      const day = items
        .filter((x) => !x.done && x.date === iso)
        .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
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
        day.forEach((it) => list.appendChild(row(it)));
        sec.appendChild(list);
      }
      wrap.appendChild(sec);
    }
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    render();
  }

  init();
})();
