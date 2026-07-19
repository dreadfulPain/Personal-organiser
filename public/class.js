// The Class room: the whole syllabus (your topics list) with the class picture
// per skill — each ID once, at their latest evidenced level, grouped in the
// scale's own order. Reads the same records the Students page writes; computed
// fresh every time, never stored, never a number.

(() => {
  "use strict";

  let records = [];
  let config = null;

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function latestByWho(topic) {
    const byWho = new Map();
    records.forEach((r) => {
      if (r.topic !== topic || !r.level || !r.who) return;
      const key = (r.date || "") + "|" + (r.createdAt || "");
      const cur = byWho.get(r.who);
      if (!cur || key > cur.key) byWho.set(r.who, { level: r.level, key });
    });
    return byWho;
  }

  function render() {
    const wrap = $("#classList");
    wrap.innerHTML = "";
    if (!config || !config.topics || !config.topics.length) {
      wrap.innerHTML = `<p class="empty">No skills to show yet. On the <a href="records.html">Students</a> page,
        open “Set up this log” and paste the year's skills/standards (one per line) — this page fills in
        from the evidence you log.</p>`;
      return;
    }
    const levels = config.levels || [];
    const evidenceCount = (topic) => records.filter((r) => r.topic === topic).length;

    config.topics.forEach((topic) => {
      const card = document.createElement("section");
      card.className = "cl-card";
      const byWho = latestByWho(topic);
      const n = evidenceCount(topic);
      const head = document.createElement("div");
      head.className = "cl-head";
      const a = document.createElement("a");
      a.className = "cl-topic";
      a.href = "records.html";
      a.title = "Open the evidence for this skill (pick it in the skill filter)";
      a.textContent = topic;
      head.appendChild(a);
      if (n) {
        const c = document.createElement("span");
        c.className = "cl-count";
        c.textContent = `${n} record${n === 1 ? "" : "s"}`;
        head.appendChild(c);
      }
      card.appendChild(head);

      if (!byWho.size) {
        card.insertAdjacentHTML("beforeend", `<p class="wk-free">no evidence yet</p>`);
      } else {
        const groups = new Map();
        [...byWho.entries()].forEach(([who, v]) => {
          if (!groups.has(v.level)) groups.set(v.level, []);
          groups.get(v.level).push(who);
        });
        const order = levels.concat([...groups.keys()].filter((l) => !levels.includes(l)));
        const lines = document.createElement("div");
        lines.className = "cl-lines";
        order
          .filter((l) => groups.has(l))
          .forEach((l) => {
            const line = document.createElement("div");
            line.className = "cl-line";
            line.innerHTML = `<span class="level-chip">${escapeHtml(l)}</span> <span class="cl-whos">${groups
              .get(l)
              .sort()
              .map((w) => escapeHtml(w))
              .join(", ")}</span>`;
            lines.appendChild(line);
          });
        card.appendChild(lines);
      }
      wrap.appendChild(card);
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    records = Array.isArray(data.records) ? data.records : [];
    config = data.recordConfig || null;
    if (config && config.title) $("#clTitle").textContent = "The class — " + config.title;
    render();
  }

  init();
})();
