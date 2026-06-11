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
  function friendlyDate(stamp) {
    if (!stamp) return "";
    const iso = isoOf(new Date(stamp));
    if (iso === isoOf(new Date())) return "today";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  function persist() {
    OrganiserStore.save({ items, waiting });
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

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];
    render();
  }

  init();
})();
