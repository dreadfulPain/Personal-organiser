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

  // ----- meeting prep: the readiness checklist + export-all -----
  // Before anything goes in front of parents: who has unchecked AI records, whose
  // NEWEST evidence on a skill is still unconfirmed (the export would say
  // something older — or nothing), and who has skills with no evidence at all.
  // One "review" click lands on that student, pre-filtered.
  function setClStatus(msg) {
    const el = $("#clStatus");
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  function studentReadiness(who) {
    const mine = records.filter((r) => r.who === who && r.topic);
    const unchecked = mine.filter(OrganiserExport.needsCheck).length;
    const stale = OrganiserExport.staleTopics(who, records, config);
    const old = OrganiserExport.oldTopics(who, records, config);
    const usable = mine.filter((r) => !OrganiserExport.needsCheck(r));
    const assessed = OrganiserExport.latestLevels(usable).size;
    const unassessed = (config.topics || []).length - assessed;
    return { who, hasAny: mine.length > 0, unchecked, stale, old, unassessed };
  }
  function renderChecklist() {
    const box = $("#checklist");
    box.hidden = false;
    box.innerHTML = "";
    (config.whoIds || []).forEach((who) => {
      const s = studentReadiness(who);
      const row = document.createElement("div");
      row.className = "ck-row";
      const issues = [];
      if (!s.hasAny) issues.push("no evidence logged yet");
      if (s.unchecked) issues.push(`${s.unchecked} AI record${s.unchecked === 1 ? "" : "s"} to confirm`);
      if (s.stale.length)
        issues.push(`newest evidence unconfirmed for ${s.stale.length} skill${s.stale.length === 1 ? "" : "s"} (${s.stale.slice(0, 3).join("; ")}${s.stale.length > 3 ? "…" : ""})`);
      if (s.hasAny && s.unassessed) issues.push(`${s.unassessed} skill${s.unassessed === 1 ? "" : "s"} not assessed yet`);
      if (s.old.length)
        issues.push(`level getting old for ${s.old.length} skill${s.old.length === 1 ? "" : "s"} (${s.old.slice(0, 3).join("; ")}${s.old.length > 3 ? "…" : ""}) — worth fresh evidence`);
      const ready = s.hasAny && !s.unchecked && !s.stale.length;
      const readyNote = ready && s.old.length ? ` · some levels getting old (${s.old.length})` : "";
      row.innerHTML = `
        <span class="ck-who">${escapeHtml(who)}</span>
        <span class="ck-state ${ready ? "ready" : ""}">${ready ? "ready ✓" + escapeHtml(readyNote) : escapeHtml(issues.join(" · "))}</span>
        <a class="ck-review" href="records.html?who=${encodeURIComponent(who)}${s.unchecked ? "&unchecked=1" : ""}">review</a>`;
      box.appendChild(row);
    });
    $("#exportAllBtn").hidden = false;
  }
  async function exportAll() {
    setClStatus("Preparing everyone's summaries — a moment…");
    const withEvidence = (config.whoIds || []).filter((w) => records.some((r) => r.who === w && r.topic && !OrganiserExport.needsCheck(r)));
    if (!withEvidence.length) {
      setClStatus("No confirmed evidence to export yet.");
      return;
    }
    let inner = "";
    let excluded = 0;
    let staleStudents = 0;
    for (const who of withEvidence) {
      const s = await OrganiserExport.studentSection(who, records, config);
      inner += s.html;
      excluded += s.excluded;
      if (s.stale.length) staleStudents++;
    }
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    OrganiserExport.download(`class-progress-${stamp}.html`, OrganiserExport.docShell("Class progress summaries", inner));
    const skipped = (config.whoIds || []).length - withEvidence.length;
    setClStatus(
      `Exported ${withEvidence.length} student summar${withEvidence.length === 1 ? "y" : "ies"} — each starts on a fresh page when printed. ✓` +
        (skipped ? ` ${skipped} with no confirmed evidence were left out.` : "") +
        (excluded ? ` ${excluded} unconfirmed AI record${excluded === 1 ? "" : "s"} not included` : "") +
        (staleStudents ? ` (${staleStudents} student${staleStudents === 1 ? "'s" : "s'"} newest evidence is unconfirmed — see the checklist).` : excluded ? "." : "")
    );
  }

  async function init() {
    const data = await OrganiserStore.load();
    records = Array.isArray(data.records) ? data.records : [];
    config = data.recordConfig || null;
    if (config && config.title) $("#clTitle").textContent = "The class — " + config.title;
    $("#ckBtn").addEventListener("click", renderChecklist);
    $("#exportAllBtn").addEventListener("click", exportAll);
    if (!config || !(config.topics || []).length || OrganiserStore.mode !== "file") {
      $("#ckBtn").hidden = true; // nothing to prepare until skills exist (and files need the server)
    }
    render();
  }

  init();
})();
