// The Month room: the chosen month's dated things, day by day — and the empty
// stretches folded into one quiet line each ("nothing 5th–11th"). A month grid
// is the wall this app exists to avoid; this is the calm version of the same
// answer.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];
  let offset = 0; // months from the current one

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  function monthStart(off) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + off, 1);
  }
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const todayISO = () => isoOf(new Date());

  // The month's days that hold something, plus the folded gaps between them.
  function monthShape(list, off, today) {
    const start = monthStart(off);
    const year = start.getFullYear();
    const month = start.getMonth();
    const daysIn = new Date(year, month + 1, 0).getDate();
    const byDay = new Map();
    list.forEach((it) => {
      if (it.done || !it.date) return;
      const d = new Date(it.date + "T12:00:00");
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(it);
    });
    const shape = [];
    let gapFrom = null;
    for (let day = 1; day <= daysIn; day++) {
      if (byDay.has(day)) {
        if (gapFrom !== null) {
          shape.push({ gap: [gapFrom, day - 1] });
          gapFrom = null;
        }
        const dayItems = byDay
          .get(day)
          .slice()
          .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
        shape.push({ day, iso: `${year}-${pad2(month + 1)}-${pad2(day)}`, items: dayItems });
      } else if (gapFrom === null) {
        gapFrom = day;
      }
    }
    if (gapFrom !== null) shape.push({ gap: [gapFrom, daysIn] });
    return { shape, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }), today };
  }
  function nth(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function render() {
    const { shape, label, today } = monthShape(items, offset, todayISO());
    $("#moTitle").textContent = label;
    const wrap = $("#monthList");
    wrap.innerHTML = "";
    const hasDays = shape.some((s) => s.day);
    if (!hasDays) {
      wrap.innerHTML = `<p class="empty">Nothing dated this month. Quiet is allowed.</p>`;
      return;
    }
    shape.forEach((s) => {
      if (s.gap) {
        const g = document.createElement("p");
        g.className = "mo-gap";
        g.textContent = s.gap[0] === s.gap[1] ? `nothing on the ${nth(s.gap[0])}` : `nothing ${nth(s.gap[0])}–${nth(s.gap[1])}`;
        wrap.appendChild(g);
        return;
      }
      const sec = document.createElement("section");
      sec.className = "wk-day";
      const h = document.createElement("h2");
      h.className = "wk-heading" + (s.iso === today ? " today" : "");
      h.textContent =
        new Date(s.iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric" }) +
        (s.iso === today ? " — today" : "");
      sec.appendChild(h);
      const list = document.createElement("div");
      list.className = "items";
      s.items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "item wk-item";
        row.innerHTML = `
          <div class="item-main">
            <div class="item-title">${escapeHtml(it.title)}</div>
            <div class="item-meta">
              <span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>
              ${it.deadlineType === "hard" ? `<span class="when due">hard deadline</span>` : ""}
            </div>
          </div>`;
        list.appendChild(row);
      });
      sec.appendChild(list);
      wrap.appendChild(sec);
    });
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
