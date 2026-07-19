// The Month room: a real calendar grid — time given physical form, so the
// relation of things to each other in time is visible at a glance (the user's
// own accommodation: the spatial layout IS the help). Kept calm: generous
// cells, soft colours, neighbours faded, nothing red.

(() => {
  "use strict";

  let items = [];
  let offset = 0; // months from the current one

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const todayISO = () => isoOf(new Date());
  function monthStart(off) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + off, 1);
  }
  function shortTime(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const d = new Date();
    d.setHours(+m[1], +m[2], 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: m[2] === "00" ? undefined : "2-digit" });
  }

  // Monday-first cells covering the whole weeks the month touches; neighbour
  // days show faded WITH their items (the point is seeing time run on).
  function monthCells(list, off) {
    const start = monthStart(off);
    const y = start.getFullYear();
    const m = start.getMonth();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const lead = (start.getDay() + 6) % 7;
    const total = Math.ceil((lead + daysIn) / 7) * 7;
    const byIso = new Map();
    list.forEach((it) => {
      if (it.done || !it.date) return;
      if (!byIso.has(it.date)) byIso.set(it.date, []);
      byIso.get(it.date).push(it);
    });
    const cells = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m, 1 - lead + i);
      const iso = isoOf(d);
      cells.push({
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === m,
        items: (byIso.get(iso) || []).slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")),
      });
    }
    return { cells, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  }

  function weekdayNames() {
    const names = [];
    const monday = new Date(2024, 0, 1); // a known Monday
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      names.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    return names;
  }

  const SHOW = 3; // item lines per cell before "+N more"

  function render() {
    const { cells, label } = monthCells(items, offset);
    $("#moTitle").textContent = label;
    const wrap = $("#monthList");
    wrap.innerHTML = "";

    const head = document.createElement("div");
    head.className = "mo-grid mo-grid-head";
    weekdayNames().forEach((n) => {
      const c = document.createElement("div");
      c.className = "mo-dow";
      c.textContent = n;
      head.appendChild(c);
    });
    wrap.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "mo-grid";
    const today = todayISO();
    cells.forEach((cell) => {
      const el = document.createElement("div");
      el.className =
        "mo-cell" + (cell.inMonth ? "" : " faded") + (cell.iso === today ? " today" : "");
      const num = document.createElement("div");
      num.className = "mo-daynum";
      num.textContent = cell.day;
      el.appendChild(num);
      cell.items.slice(0, SHOW).forEach((it) => {
        const line = document.createElement("div");
        line.className = "mo-ev" + (it.deadlineType === "hard" ? " hard" : "");
        const t = shortTime(it.time);
        line.textContent = (t ? t + " " : "") + it.title;
        line.title = it.title;
        el.appendChild(line);
      });
      if (cell.items.length > SHOW) {
        const more = document.createElement("div");
        more.className = "mo-more";
        more.textContent = `+${cell.items.length - SHOW} more`;
        el.appendChild(more);
      }
      grid.appendChild(el);
    });
    wrap.appendChild(grid);
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    $("#moPrev").addEventListener("click", () => {
      offset--;
      render();
    });
    $("#moNext").addEventListener("click", () => {
      offset++;
      render();
    });
    render();
  }

  init();
})();
