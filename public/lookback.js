// Looking back — its own page (the mirror, not a scoreboard).
// Reads the same owned data through OrganiserStore, shows finished things, and
// lets you put one back. Done items live ONLY here, never on the main screen.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];
  let waiting = [];

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
  // ONE WAY OF WRITING A DATE, for the whole app — see dates.js. Six files
  // kept their own copy of this, each subtly different, and none of them said
  // which year a date was in. Fixing the shared one changed nothing on screen,
  // because almost nothing was using it.
  const friendlyDate = (stamp) =>
    stamp ? OrganiserDates.dayWords(isoOf(new Date(stamp)), { lower: true }) : "";

  function persist() {
    OrganiserStore.save({ items, waiting });
  }

  // ----- the mirror: what you've finished, by area -----
  // Hard guards (§5/§16/§17): describes, never judges. No targets, no "you fell
  // short", no score. It only shows the SHAPE of what you finished, by category
  // (tags), over a stretch you choose — for your own steering, no one else's. We
  // count finished things (not hours — the app can't see time), and say so.
  const RANGES = [
    { key: "month", label: "Past month", days: 28 },
    { key: "season", label: "Past few months", days: 90 },
    { key: "all", label: "All time", days: Infinity },
  ];
  const MIRROR_CAP = 8; // keep it calm — top areas, rest folded into "other areas"
  let range = "month";

  function withinRange(stamp, days) {
    if (days === Infinity) return true;
    if (!stamp) return false;
    const t = new Date(stamp).getTime();
    if (isNaN(t)) return false;
    return t >= Date.now() - days * 24 * 60 * 60 * 1000;
  }
  function computeBreakdown(done, days) {
    const counts = new Map(); // area -> count of finished things
    let n = 0;
    done.forEach((it) => {
      if (!withinRange(it.completedAt, days)) return;
      n++;
      const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
      if (!tags.length) counts.set("(no category)", (counts.get("(no category)") || 0) + 1);
      else tags.forEach((tg) => counts.set(tg, (counts.get(tg) || 0) + 1));
    });
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    let rows = [...counts.entries()]
      .map(([area, count]) => ({ area, count, pct: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    if (rows.length > MIRROR_CAP) {
      const head = rows.slice(0, MIRROR_CAP - 1);
      const tail = rows.slice(MIRROR_CAP - 1);
      const tailCount = tail.reduce((a, r) => a + r.count, 0);
      head.push({ area: "other areas", count: tailCount, pct: total ? Math.round((tailCount / total) * 100) : 0 });
      rows = head;
    }
    return { rows, n };
  }
  function renderMirror() {
    const section = $("#mirror");
    const body = $("#mirrorBody");
    if (!section || !body) return;
    const done = items.filter((i) => i.done);
    if (!done.length) {
      section.hidden = true; // nothing finished ever → no mirror at all
      return;
    }
    section.hidden = false;
    document.querySelectorAll(".mr-range").forEach((b) => b.classList.toggle("active", b.dataset.range === range));
    const days = (RANGES.find((r) => r.key === range) || RANGES[0]).days;
    const { rows, n } = computeBreakdown(done, days);
    body.innerHTML = "";
    if (!n) {
      body.innerHTML = `<p class="empty">Nothing finished in this stretch — that's fine.</p>`;
      return;
    }
    const intro = document.createElement("p");
    intro.className = "mr-intro";
    intro.textContent = `${n} thing${n === 1 ? "" : "s"} finished. Here's how that spread across areas:`;
    body.appendChild(intro);
    const max = rows[0] ? rows[0].count : 1; // bar relative to the top area (a comparison, not a goal)
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "mr-row";
      const width = Math.round((r.count / max) * 100);
      row.innerHTML = `
        <div class="mr-label">${escapeHtml(r.area)}</div>
        <div class="bar mr-bar"><div class="bar-fill" style="width:${width}%"></div></div>
        <div class="mr-count">${r.count} · ${r.pct}%</div>`;
      body.appendChild(row);
    });
  }

  function uncomplete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = false;
    it.completedAt = null;
    persist();
    render();
  }

  function render() {
    const done = items
      .filter((i) => i.done)
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

    renderMirror();
    const title = $("#finishedTitle");
    if (title) title.hidden = !done.length;

    const el = $("#lookbackList");
    el.innerHTML = "";
    if (!done.length) {
      el.innerHTML = `<p class="empty">Nothing here yet. Things you finish will gather here — quietly.</p>`;
      return;
    }
    done.forEach((it) => {
      const row = document.createElement("div");
      row.className = "item done";
      const when = it.completedAt ? friendlyDate(it.completedAt) : "";
      row.innerHTML = `
        <span class="tick done" aria-hidden="true"></span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(it.title)}</div>
          <div class="item-meta">
            <span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>
            ${when ? `<span class="when">done ${escapeHtml(when)}</span>` : ""}
          </div>
        </div>
        <button class="putback" type="button">put back</button>`;
      row.querySelector(".putback").addEventListener("click", () => uncomplete(it.id));
      el.appendChild(row);
    });
  }

  // WHERE THE WEEKENDS WENT.
  //
  // Shown here rather than on Home on purpose: this is a looking-back question,
  // and putting it in front of you on a Tuesday morning would make it a nag.
  // Counts and a split, never a verdict — whether five weekends running is too
  // many is your call, and the app's job is only to make sure you're the one
  // making it, with the number in front of you.
  function renderWeekends(worked) {
    const W = window.OrganiserWeekend;
    const S = window.OrganiserSchedule;
    const sec = document.querySelector("#weekends");
    if (!W || !S || !sec) return;
    const v = W.look(worked, S.isoOf(new Date()), 8);
    if (!v.total) { sec.hidden = true; return; }
    sec.hidden = false;
    const words = document.querySelector("#wkndWords");
    if (words) words.textContent = W.words(v);
    const bars = document.querySelector("#wkndBars");
    if (!bars) return;
    const most = Math.max(...v.list.map((x) => x.total), 1);
    bars.innerHTML = v.list
      .slice()
      .reverse()
      .map((x) => {
        const pct = Math.round((x.total / most) * 100);
        const when = OrganiserDates.dayWords(x.saturday, { weekday: false, relative: false });
        const split = Object.entries(x.areas)
          .sort((a, b) => b[1] - a[1])
          .map(([k, m]) => `${k} ${S.durationWords(m)}`)
          .join(" · ");
        return (
          `<div class="wk-row"><span class="wk-when">${when}</span>` +
          `<span class="wk-bar"><i style="width:${pct}%"></i></span>` +
          `<span class="wk-amt">${x.total ? S.durationWords(x.total) : "—"}</span>` +
          (split ? `<span class="wk-split">${split}</span>` : "") +
          `</div>`
        );
      })
      .join("");
  }

  async function init() {
    const data = await OrganiserStore.load();
    renderWeekends(data.worked || {});
    items = data.items || [];
    waiting = data.waiting || [];
    document.querySelectorAll(".mr-range").forEach((b) =>
      b.addEventListener("click", () => {
        range = b.dataset.range || "month";
        renderMirror();
      })
    );
    render();
  }

  init();
})();
