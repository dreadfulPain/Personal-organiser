// The Class room: the whole syllabus (your topics list) with the class picture
// per skill — each ID once, at their latest evidenced level, grouped in the
// scale's own order. Reads the same records the Students page writes; computed
// fresh every time, never stored, never a number.

(() => {
  "use strict";

  let records = [];
  let config = null;

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // This page used to be read-only. The marking session writes, so it saves the
  // one half it owns — the merge-save keeps everything else intact.
  // THE PEOPLE YOU ACTUALLY HAVE, when you have never filled in a marking list.
  //
  // This page marks whoever is in recordConfig.whoIds, which is a list of bare
  // ids kept only by the Students page. The People page keeps `contacts`, and
  // everything built since — the register, the turns, the pastoral notes, the
  // person page, before-you-plan — hangs off that instead. Nothing joins the
  // two, so somebody who has put their class into People and never opened the
  // Students page gets an empty marking grid and no hint as to why.
  //
  // Falling back only when the list is empty can't overwrite anybody's setup:
  // if you have a marking list, it is used exactly as before.
  function markable() {
    const own = (config && Array.isArray(config.whoIds) ? config.whoIds : []).filter(Boolean);
    if (own.length) return own;
    return contacts.filter((c) => c && c.id).map((c) => c.id);
  }
  // And a name to show for it, since a fallback list is full of ids nobody
  // recognises. Falls back to the id, which is what this page always showed.
  function nameOf(id) {
    const c = contacts.find((x) => x && x.id === id);
    return (c && c.name) || id;
  }

  function persist() {
    OrganiserStore.save({ records });
  }
  let contacts = []; // the People page's list — see markable()

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
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
    const L = OrganiserLevels;
    const evidenceCount = (topic) => records.filter((r) => r.topic === topic).length;

    config.topics.forEach((topic) => {
      const card = document.createElement("section");
      card.className = "cl-card";
      const byWho = L.classFor(records, topic);
      const n = evidenceCount(topic);
      const head = document.createElement("div");
      head.className = "cl-head";
      const a = document.createElement("a");
      a.className = "cl-topic";
      // Carries the skill through, so you land ON its evidence rather than at
      // the door being told to find it again in the filter.
      a.href = "records.html?topic=" + encodeURIComponent(topic);
      a.title = "Open the evidence behind this skill";
      a.textContent = topic;
      head.appendChild(a);
      L.skillTags(config, topic).forEach((t) => {
        const chip = document.createElement("span");
        chip.className = "sk-tag";
        chip.textContent = t;
        head.appendChild(chip);
      });
      if (n) {
        const c = document.createElement("span");
        c.className = "cl-count";
        c.textContent = `${n} record${n === 1 ? "" : "s"}`;
        head.appendChild(c);
      }
      card.appendChild(head);

      // ONE SKILL, THE WHOLE CLASS — the same row shape as a single student's,
      // but each box holds the people sitting in it. The target is marked; the
      // scale is never a red-to-green gradient, because the target usually
      // isn't the top and colouring it that way makes the goal read as a miss.
      const line = document.createElement("div");
      line.className = "cl-boxes";
      const target = L.targetLevel(config);
      L.ascending(config).forEach((lv) => {
        const cell = document.createElement("div");
        cell.className = "cl-cell" + (lv === target ? " target" : "");
        const whos = [...byWho.entries()].filter(([, r]) => String(r.level) === lv).map(([w]) => w).sort();
        const nm = L.levelName(config, lv);
        const top = document.createElement("div");
        top.className = "cl-celltop";
        top.innerHTML =
          escapeHtml(lv) +
          (nm ? `<span class="cl-cellname">${escapeHtml(nm)}</span>` : "") +
          (lv === target ? `<span class="cl-target">target</span>` : "");
        const body = document.createElement("div");
        body.className = "cl-cellwhos";
        body.innerHTML = whos.length
          ? whos.map((w) => `<span class="cl-who">${escapeHtml(w)}</span>`).join("")
          : `<span class="cl-cellempty">—</span>`;
        cell.append(top, body);
        line.appendChild(cell);
      });
      card.appendChild(line);

      // Empty and unrecorded must never look the same.
      const missing = markable().filter((w) => !byWho.has(w));
      const foot = document.createElement("p");
      foot.className = "cl-missing";
      foot.textContent = missing.length
        ? `${missing.length} with no record for this skill: ${missing.map(nameOf).join(", ")}`
        : "everyone has a record for this skill";
      card.appendChild(foot);
      wrap.appendChild(card);
    });
  }

  // ----- MARKING SESSION: 25 children in one pass, not 25 separate entries ---
  //
  // This is the feature everything else depends on. The cost of assessment was
  // never the judging — it's the re-entering. A system that needs a separate
  // trip through an add form per child does not survive a real week, and then
  // none of the levels, descriptors or visuals have anything to draw.
  //
  // The shape: pick the skill ONCE, it stays. The descriptor for it sits next to
  // the buttons and STAYS VISIBLE — that's the whole reason for writing one, and
  // putting it behind a tap wastes it. Then it's one tap per child.
  //
  // It saves as it goes. Closing the tab mid-way loses nothing.
  let session = null; // { skill }
  let sessionBusy = ""; // which student's photo is uploading
  let sessionNote = ""; // the last "✓" line — survives the re-render after it

  function startSession(skill) {
    session = { skill };
    sessionNote = "";
    renderSession();
  }
  function endSession() {
    session = null;
    renderSession();
    render();
  }

  // A record is only written when the JUDGEMENT MOVED. Recording the same level
  // again, with no new work attached, is a CONFIRMATION — it stamps the record
  // that's already there instead of adding another one.
  //
  // Six worksheets at an unchanged level are not six pieces of evidence. The
  // valuable piece is the one that moved them, and burying it under repeats
  // makes the real evidence harder to find, not easier. So a confirmation is
  // cheap, and it looks different.
  function markLevel(who, skill, level) {
    const L = OrganiserLevels;
    const current = L.currentFor(records, who, skill);
    const today = OrganiserExport.stamp();
    if (current && String(current.level) === String(level)) {
      L.addConfirmation(current, today);
      persist();
      renderSession();
      setSessionNote(`${who} — still ${L.levelLabel(config, level)}. Noted, no new record. ✓`);
      return;
    }
    const now = new Date().toISOString();
    const rec = {
      id: uid(),
      who,
      date: today,
      type: (config.types || [])[0] || "assessment",
      summary: current
        ? `${skill} — now ${L.levelLabel(config, level)} (was ${current.level})`
        : `${skill} — ${L.levelLabel(config, level)}`,
      detail: "",
      extra: {},
      topic: skill,
      level: String(level),
      tags: [],
      followUp: false,
      taskId: "",
      src: "hand", // you judged it in front of the work — nothing to double-check
      checkedAt: now,
      createdAt: now,
      files: [],
    };
    records.unshift(rec);
    persist();
    renderSession();
    setSessionNote(current ? `${who} — moved to ${L.levelLabel(config, level)}. ✓` : `${who} — ${L.levelLabel(config, level)}. ✓`);
  }

  // A photo is optional per student, never required, one tap away.
  //
  // BUT: A PHOTO IS ALWAYS NEW EVIDENCE, even at an unchanged level. If you
  // first judged a 3 from watching someone and now you're holding written work
  // at 3, that piece of work is exactly what a parent export needs — and the
  // "same level, no new record" rule would have swallowed it into a
  // confirmation stamp on an old record, which would also have mis-dated it
  // (September's record, November's photo).
  //
  // So the photo always lands on a record dated TODAY. If the newest record
  // isn't from today, one is created at the same level to hold it, and any
  // confirmation stamped today is removed — the same day must not be counted
  // both as a stamp and as a record.
  async function attachPhoto(who, skill, file) {
    const L = OrganiserLevels;
    const latest = L.currentFor(records, who, skill);
    if (!latest) {
      setSessionNote(`Give ${who} a level first — then the photo has something to sit under.`);
      return;
    }
    const today = OrganiserExport.stamp();
    let rec = latest;
    if (latest.date !== today) {
      const now = new Date().toISOString();
      L.removeConfirmation(latest, today); // it's a real record now, not a stamp
      rec = {
        id: uid(),
        who,
        date: today,
        type: (config.types || [])[0] || "assessment",
        summary: `${skill} — ${L.levelLabel(config, latest.level)}, with work`,
        detail: "",
        extra: {},
        topic: skill,
        level: String(latest.level),
        tags: [],
        followUp: false,
        taskId: "",
        src: "hand",
        checkedAt: now,
        createdAt: now,
        files: [],
      };
      records.unshift(rec);
    }
    sessionBusy = who;
    renderSession();
    try {
      const folder = "students/" + (who || "_unfiled");
      const r = await fetch("/api/upload?name=" + encodeURIComponent(file.name) + "&folder=" + encodeURIComponent(folder), {
        method: "POST",
        body: file,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSessionNote(d.message || "Couldn't save that file.");
        return;
      }
      if (!rec.files) rec.files = [];
      rec.files.push({ id: d.id, name: d.name, addedAt: new Date().toISOString() });
      persist();
      setSessionNote(`Work attached for ${who}. ✓`);
    } catch {
      setSessionNote("Couldn't save that file just now.");
    } finally {
      sessionBusy = "";
      renderSession();
    }
  }

  function setSessionNote(msg) {
    sessionNote = msg || "";
    const el = $("#msNote");
    if (!el) return;
    el.textContent = sessionNote;
    el.hidden = !sessionNote;
  }

  function renderSession() {
    const box = $("#marking");
    if (!box) return;
    if (!session) {
      box.hidden = true;
      box.innerHTML = "";
      $("#msBtn").hidden = !(config && (config.topics || []).length && (config.levels || []).length);
      return;
    }
    const L = OrganiserLevels;
    box.hidden = false;
    $("#msBtn").hidden = true;
    box.innerHTML = "";

    const head = document.createElement("div");
    head.className = "ms-head";
    const pick = document.createElement("select");
    pick.className = "ms-skill";
    pick.innerHTML = config.topics
      .map((t) => `<option value="${escapeHtml(t)}"${t === session.skill ? " selected" : ""}>${escapeHtml(t)}</option>`)
      .join("");
    pick.addEventListener("change", (e) => {
      session.skill = e.target.value;
      renderSession();
    });
    const done = document.createElement("button");
    done.type = "button";
    done.className = "btn ghost";
    done.textContent = "done";
    done.addEventListener("click", endSession);
    head.append(pick, done);
    box.appendChild(head);

    // THE DESCRIPTOR, VISIBLE. Not behind a tap — the point of writing it is
    // reading it at the moment of judgement.
    const jt = L.judgingText(config, session.skill);
    if (jt) {
      const d = document.createElement("div");
      d.className = "ms-desc";
      d.innerHTML = `<span class="ms-desclvl">${escapeHtml(jt.name || jt.level)} looks like</span> ${escapeHtml(jt.text)}`;
      box.appendChild(d);
    } else {
      const d = document.createElement("p");
      d.className = "ms-nodesc";
      d.innerHTML = `No description written for this skill yet — <a href="records.html">you can add one</a>, or just judge from the work.`;
      box.appendChild(d);
    }

    const target = L.targetLevel(config);
    const list = document.createElement("div");
    list.className = "ms-list";
    markable().forEach((who) => {
      const current = L.currentFor(records, who, session.skill);
      const row = document.createElement("div");
      row.className = "ms-row";
      const name = document.createElement("span");
      name.className = "ms-who";
      name.textContent = nameOf(who);
      const now = document.createElement("span");
      const work = L.workFor(records, who, session.skill);
      // "confirmed 3×" reads as strong. With no work behind it, it's the
      // thinnest thing in the folder — so the two are always shown together,
      // and this is the moment it's cheapest to fix: the book is in your hand.
      now.className = "ms-now" + (current ? (work ? "" : " nowork") : " none");
      const conf = current ? L.confirmations(current).length : 0;
      now.textContent = current
        ? `${current.level}${conf ? ` · confirmed ${conf}×` : ""}${work ? ` · ${work} on file` : " · nothing on file"}`
        : "no record";
      row.append(name, now);

      const btns = document.createElement("span");
      btns.className = "ms-btns";
      L.ascending(config).forEach((lv) => {
        const b = document.createElement("button");
        b.type = "button";
        const here = current && String(current.level) === lv;
        b.className = "ms-lvl" + (here ? " here" : "") + (lv === target ? " target" : "");
        b.textContent = lv;
        b.title = here ? "Same as before — records a check, not new evidence" : L.levelLabel(config, lv);
        b.addEventListener("click", () => markLevel(who, session.skill, lv));
        btns.appendChild(b);
      });
      row.appendChild(btns);

      if (OrganiserStore.mode === "file") {
        const lab = document.createElement("label");
        lab.className = "ms-photo" + (sessionBusy === who ? " busy" : "");
        lab.title = "Attach a photo of the work (optional)";
        lab.textContent = sessionBusy === who ? "…" : "photo";
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.hidden = true;
        inp.addEventListener("change", (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) attachPhoto(who, session.skill, f);
          e.target.value = "";
        });
        lab.appendChild(inp);
        row.appendChild(lab);
      }
      list.appendChild(row);
    });
    box.appendChild(list);

    // Show what's MISSING, not just what's there — the same principle as the
    // meeting panel. Nothing recorded and nothing wrong must never look alike.
    const byWho = L.classFor(records, session.skill);
    const missing = markable().filter((w) => !byWho.has(w));
    const foot = document.createElement("p");
    foot.className = "ms-missing";
    foot.textContent = missing.length
      ? `${missing.length} still with no record for this skill: ${missing.map(nameOf).join(", ")}`
      : "everyone has a record for this skill ✓";
    box.appendChild(foot);

    const note = document.createElement("p");
    note.className = "ms-note";
    note.id = "msNote";
    note.textContent = sessionNote;
    note.hidden = !sessionNote;
    box.appendChild(note);
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
    // Confidence is not evidence: a level confirmed five times by watching has
    // nothing to put on the table. Counted separately from "has a level".
    const work = mine.reduce((n, r) => n + OrganiserLevels.fileCount(r), 0);
    const noWork = OrganiserLevels.skillsWithoutWork(records, who, config.topics || []);
    return { who, hasAny: mine.length > 0, unchecked, stale, old, unassessed, assessed, work, noWork };
  }
  function renderChecklist() {
    const box = $("#checklist");
    box.hidden = false;
    box.innerHTML = "";
    markable().forEach((who) => {
      const s = studentReadiness(who);
      const row = document.createElement("div");
      row.className = "ck-row";
      const issues = [];
      if (!s.hasAny) issues.push("no evidence logged yet");
      if (s.unchecked) issues.push(`${s.unchecked} AI record${s.unchecked === 1 ? "" : "s"} to confirm`);
      if (s.stale.length)
        issues.push(`newest evidence unconfirmed for ${s.stale.length} skill${s.stale.length === 1 ? "" : "s"} (${s.stale.slice(0, 3).join("; ")}${s.stale.length > 3 ? "…" : ""})`);
      if (s.hasAny && s.unassessed) issues.push(`${s.unassessed} skill${s.unassessed === 1 ? "" : "s"} not assessed yet`);
      if (s.assessed && !s.work) issues.push("every level is from watching — no work attached to show");
      else if (s.noWork.length) issues.push(`${s.noWork.length} skill${s.noWork.length === 1 ? "" : "s"} judged with no work attached`);
      if (s.old.length)
        issues.push(`level getting old for ${s.old.length} skill${s.old.length === 1 ? "" : "s"} (${s.old.slice(0, 3).join("; ")}${s.old.length > 3 ? "…" : ""}) — worth fresh evidence`);
      // "Ready" now requires something to actually show, not just something
      // to say. A folder of confident levels with no work in it isn't ready.
      const ready = s.hasAny && !s.unchecked && !s.stale.length && !(s.assessed && !s.work);
      const readyNote = ready && s.old.length ? ` · some levels getting old (${s.old.length})` : "";
      row.innerHTML = `
        <span class="ck-who">${escapeHtml(who)}</span>
        <span class="ck-state ${ready ? "ready" : ""}">${ready ? "ready ✓" + escapeHtml(readyNote) : escapeHtml(issues.join(" · "))}</span>
        <a class="ck-review" href="records.html?who=${encodeURIComponent(who)}${s.unchecked ? "&unchecked=1" : ""}">review</a>`;
      box.appendChild(row);
    });
    $("#exportAllBtn").hidden = false;
    $("#folderBtn").hidden = false;
  }
  // One read before anything leaves the building. Not a new habit — the page
  // you were going to read anyway, at the moment it matters.
  function readFirst(students, then) {
    const box = $("#checklist");
    box.hidden = false;
    box.innerHTML = "";
    box.appendChild(
      OrganiserExport.reviewPanel(students, records, config, (go) => {
        box.innerHTML = "";
        if (go) then();
        else setClStatus("Left it for now — nothing was written.");
      })
    );
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function exportAll() {
    const withEvidence = markable().filter((w) => records.some((r) => r.who === w && r.topic && !OrganiserExport.needsCheck(r)));
    if (!withEvidence.length) {
      setClStatus("No confirmed evidence to export yet.");
      return;
    }
    readFirst(withEvidence, () => doExportAll(withEvidence));
  }

  async function doExportAll(withEvidence) {
    setClStatus("Preparing everyone's summaries — a moment…");
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
    const skipped = markable().length - withEvidence.length;
    setClStatus(
      `Exported ${withEvidence.length} student summar${withEvidence.length === 1 ? "y" : "ies"} — each starts on a fresh page when printed. ✓` +
        (skipped ? ` ${skipped} with no confirmed evidence were left out.` : "") +
        (excluded ? ` ${excluded} unconfirmed AI record${excluded === 1 ? "" : "s"} not included` : "") +
        (staleStudents ? ` (${staleStudents} student${staleStudents === 1 ? "'s" : "s'"} newest evidence is unconfirmed — see the checklist).` : excluded ? "." : "")
    );
  }

  // ----- into folders you can open without the app -----
  // Mirrors data/files/ so the shape is guessable: results at the top, a page
  // per student in the same folder their work samples already live in. Dated,
  // so nothing you've hand-edited in Excel is ever overwritten.
  function saveIntoFolders() {
    const X = OrganiserExport;
    const withEvidence = markable().filter((w) =>
      records.some((r) => r.who === w && r.topic && !X.needsCheck(r))
    );
    if (!withEvidence.length) {
      setClStatus("No confirmed evidence to write yet.");
      return;
    }
    readFirst(withEvidence, () => doSaveIntoFolders(withEvidence));
  }

  async function doSaveIntoFolders(withEvidence) {
    const X = OrganiserExport;
    setClStatus("Writing the files…");
    const day = X.stamp();
    const written = [];
    const failed = [];

    const csv = X.resultsCsv(records, config);
    const r1 = await X.saveToFolder(`results-${day}.csv`, csv, { bom: true });
    r1.ok ? written.push(r1.fallback ? "results (downloaded)" : r1.path) : failed.push(r1.message);

    for (const who of withEvidence) {
      const s = await X.studentSection(who, records, config);
      const html = X.docShell(`${who} — progress summary`, s.html);
      const r = await X.saveToFolder(`students/${who}/comments-${day}.html`, html);
      r.ok ? written.push(r.path || who) : failed.push(r.message);
    }

    const skipped = markable().length - withEvidence.length;
    setClStatus(
      `Wrote ${written.length} file${written.length === 1 ? "" : "s"} into your data folder ✓` +
        (skipped ? ` — ${skipped} student${skipped === 1 ? "" : "s"} had no confirmed evidence, so ${skipped === 1 ? "no page was" : "no pages were"} written.` : ".") +
        (failed.length ? ` ${failed.length} couldn't be written: ${failed[0]}` : "") +
        " Open data/exports/ to find them."
    );
  }

  async function init() {
    const data = await OrganiserStore.load();
    records = Array.isArray(data.records) ? data.records : [];
    config = data.recordConfig || null;
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    if (config && config.title) $("#clTitle").textContent = "The class — " + config.title;
    $("#ckBtn").addEventListener("click", renderChecklist);
    $("#exportAllBtn").addEventListener("click", exportAll);
    $("#folderBtn").addEventListener("click", saveIntoFolders);
    $("#msBtn").addEventListener("click", () => startSession((config.topics || [])[0] || ""));
    OrganiserStore.onExternalChange((state) => {
      records = Array.isArray(state.records) ? state.records : records;
      config = state.recordConfig || config;
      renderSession();
      render();
    });
    if (!config || !(config.topics || []).length || OrganiserStore.mode !== "file") {
      $("#ckBtn").hidden = true; // nothing to prepare until skills exist (and files need the server)
    }
    render();
    renderSession();
  }

  init();
})();
