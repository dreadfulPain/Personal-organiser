// Today's timeline — a calm way to SEE the day laid out: your fixed points, the
// gaps between them, and the floating "anytime" tasks you can drop into a gap.
// Pure seeing + you-decide time-setting. No auto-moving, no dense 24h grid.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];
  let waiting = [];
  let editingId = null; // which item's time is being set right now

  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const todayISO = () => isoOf(new Date());
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

  function persist() {
    OrganiserStore.save({ items, waiting });
  }
  function setTime(id, value) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.time = normaliseTime(value);
    editingId = null;
    persist();
    render();
  }
  function complete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = new Date().toISOString();
    persist();
    render();
  }

  // The "set / change time" control, or its open editor when this row is active.
  function timeControl(it) {
    const wrap = document.createElement("div");
    if (editingId === it.id) {
      wrap.className = "tl-timeedit";
      wrap.innerHTML = `
        <input type="time" value="${it.time || ""}" aria-label="Time" />
        <button class="link tl-save" type="button">save</button>
        ${it.time ? '<button class="link tl-clear" type="button">clear</button>' : ""}`;
      const input = wrap.querySelector("input");
      setTimeout(() => input.focus(), 0);
      wrap.querySelector(".tl-save").addEventListener("click", () => setTime(it.id, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setTime(it.id, input.value);
        if (e.key === "Escape") {
          editingId = null;
          render();
        }
      });
      const clear = wrap.querySelector(".tl-clear");
      if (clear) clear.addEventListener("click", () => setTime(it.id, ""));
    } else {
      wrap.className = "tl-settime-wrap";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-settime";
      btn.textContent = it.time ? "change time" : "set a time";
      btn.addEventListener("click", () => {
        editingId = it.id;
        render();
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function row(it, withTimeColumn) {
    const el = document.createElement("div");
    el.className = "item tl-item";
    const tick = document.createElement("button");
    tick.className = "tick";
    tick.setAttribute("aria-label", "Mark done");
    tick.title = "Mark done";
    tick.addEventListener("click", () => complete(it.id));
    el.appendChild(tick);

    if (withTimeColumn) {
      const time = document.createElement("div");
      time.className = "tl-time";
      time.textContent = fmtTime(it.time);
      el.appendChild(time);
    }

    const main = document.createElement("div");
    main.className = "item-main";
    main.innerHTML = `
      <div class="item-title">${escapeHtml(it.title)}</div>
      <div class="item-meta"><span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span></div>`;
    el.appendChild(main);

    el.appendChild(timeControl(it));
    return el;
  }

  function render() {
    const today = todayISO();
    const todays = items.filter((i) => !i.done && i.date === today);
    const timed = todays.filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time));
    const anytime = todays.filter((i) => !i.time);

    const tl = $("#timeline");
    tl.innerHTML = "";

    if (!todays.length) {
      tl.innerHTML =
        `<p class="empty">Nothing for today yet. Add something on the main screen — anything dated today shows up here.</p>`;
      return;
    }

    if (timed.length) {
      const list = document.createElement("div");
      list.className = "items";
      timed.forEach((it, idx) => {
        list.appendChild(row(it, true));
        if (idx < timed.length - 1) {
          const g = gapLabel(it.time, timed[idx + 1].time);
          if (g) {
            const gap = document.createElement("div");
            gap.className = "tl-gap";
            gap.textContent = g;
            list.appendChild(gap);
          }
        }
      });
      tl.appendChild(list);
    } else {
      const note = document.createElement("p");
      note.className = "empty";
      note.textContent = "Nothing has a set time yet — give something a time below to lay your day out.";
      tl.appendChild(note);
    }

    if (anytime.length) {
      const h = document.createElement("h2");
      h.className = "tl-section-title";
      h.textContent = "Anytime today";
      tl.appendChild(h);
      const list = document.createElement("div");
      list.className = "items";
      anytime.forEach((it) => list.appendChild(row(it, false)));
      tl.appendChild(list);
    }
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];
    $("#tlDate").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    render();
  }

  init();
})();
