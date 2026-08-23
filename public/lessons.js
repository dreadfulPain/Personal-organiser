// THE LESSONS TAB.
//
// Paste a plan, say which class and which day, keep it. That's the whole of the
// first job, and it's worth doing on its own: it's the only artefact this app
// has of what you actually did, as opposed to how long it took you.
//
// The second job is the join. A kept plan has a class, a date and a skill — the
// same three things "what you tried" needs — so a lesson you've marked as taught
// flows into that analysis without being copied into it. One record, one truth.
//
// WHAT THIS PAGE WILL NOT DO: mark your plan, rate your lesson, or tell you how
// to teach. It reads headings, counts what it read, and stops.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let lessons = [], lessonConfig = null, contacts = [], records = [], recordConfig = null;
  let schedule = [], items = [], tried = [], syllabus = null, attendance = [];
  let chosenTargets = []; // codes ticked for the plan currently in the box
  let where = "";         // which class the "where we are" half is about
  let grading = "";       // the id of the lesson whose marking grid is open
  let editing = ""; // the id of the plan whose "afterwards" box is open

  const $ = (s) => document.querySelector(s);
  const LP = () => window.OrganiserLessonPlan;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Asked of one place — see OrganiserDates.today(). Fourteen files worked this
  // out for themselves, in four spellings that all agreed. So did nameOf, once.
  const todayISO = () => OrganiserDates.today();

  const ago = (iso) => {
    if (!iso) return "";
    const d = Math.round((new Date(todayISO() + "T12:00:00") - new Date(iso + "T12:00:00")) / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "yesterday";
    if (d === -1) return "tomorrow";
    if (d < 0) return `in ${-d} days`;
    if (d < 14) return `${d} days ago`;
    return `${Math.round(d / 7)} weeks ago`;
  };

  const skills = () => {
    const L = window.OrganiserLevels;
    const cfg = L ? L.normalise(recordConfig) : null;
    return (cfg && cfg.topics) || [];
  };
  const groups = () =>
    [...new Set(contacts.map((c) => (c && c.group) || "").filter(Boolean))].sort();

  // ---- pasting ------------------------------------------------------------
  //
  // Show what the parse found BEFORE it's kept. This is the same rule the goal
  // paste box follows: never straight in. If the app read your plan wrongly you
  // need to see that now, while you still have the plan in front of you — not
  // in six weeks when a count looks odd.
  function preview() {
    const el = $("#lsPreview");
    if (!el) return;
    const text = ($("#lsPaste").value || "").trim();
    if (!text) { el.hidden = true; el.innerHTML = ""; return; }
    const p = LP().parse(text, lessonConfig);
    el.hidden = false;
    const part = (label, list) =>
      `<div class="ls-part"><h3>${esc(label)}</h3>` +
      (list.length
        ? `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : `<p class="muted">nothing found under this heading</p>`) +
      `</div>`;
    el.innerHTML =
      `<p class="muted">What the app read. Anything wrong here is a heading it
        doesn't know yet — fix that at the bottom of the page and it'll read
        every plan you paste from now on.</p>` +
      (p.title ? `<p class="ls-title">${esc(p.title)}</p>` : "") +
      `<div class="ls-part"><h3>What they should be able to do</h3>` +
      (p.objective ? `<p>${esc(p.objective)}</p>` : `<p class="muted">nothing found under this heading</p>`) +
      `</div>` +
      part("How you taught it", p.ways) +
      part("How you checked it", p.checks) +
      (p.missing.length
        ? `<p class="muted">Not everything was found, which is fine — a plan doesn't
           have to have all three. It only means there's less to count later.</p>`
        : "");
  }

  // ---- which targets this plan is against ---------------------------------
  //
  // Candidates in order, each with the words that overlapped so the reason is
  // visible rather than a score to be trusted. Ticking one is the judgement;
  // the app never makes it, because "these words overlap" and "this lesson
  // taught that" are not the same claim and only you can tell them apart.
  // 09:35 → 9:35 AM, however this machine writes times.
  // Asked of one place — see OrganiserDates.timeWords. Five files had their own
  // and no two were the same; the week's insisted on a two-digit hour, which
  // is the difference that has already cost this app once.
  const fmtTime = (t) => OrganiserDates.timeWords(t);

  function renderTargets() {
    const el = $("#lsTargets");
    if (!el) return;
    const S = window.OrganiserSyllabus;
    const text = ($("#lsPaste").value || "").trim();
    if (!S || !syllabus || !text) { el.hidden = true; el.innerHTML = ""; return; }
    const p = LP().parse(text, lessonConfig);
    const hits = S.match(p.objective, syllabus, 6);
    el.hidden = false;
    if (!p.objective) {
      el.innerHTML = `<p class="muted">No objective read out of the plan, so there's nothing to match against your targets. You can still tick any of them by hand once it's kept.</p>`;
      return;
    }
    el.innerHTML =
      `<h3>Which targets is this against?</h3>` +
      `<p class="muted">Suggested from the words in your objective — nothing is ticked for you.</p>` +
      (hits.length
        ? hits
            .map(
              (h) =>
                `<label class="ls-target"><input type="checkbox" class="ls-tbox" value="${esc(h.target.code)}"` +
                `${chosenTargets.includes(h.target.code) ? " checked" : ""} />` +
                `<span><strong>${esc(h.target.code || "no code")}</strong> ${esc(h.target.text)}` +
                `<span class="p-state"> shared: ${esc(h.shared.slice(0, 6).join(", "))}</span></span></label>`
            )
            .join("")
        : `<p class="muted">Nothing in your targets shares any words with that objective. That's worth a look either way — it may be worded differently, or it may genuinely not be on the syllabus.</p>`);
  }

  // ---- opening a file instead of pasting -----------------------------------
  //
  // The text lands in the same box a paste would, and goes through the same
  // preview, because a PDF read is a draft and nothing else in this app treats
  // it differently. Whatever the reader has to say about how well it went is
  // shown above the box rather than buried.
  function wireFile(inputSel, boxSel, noteSel, after) {
    const input = $(inputSel);
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      const note = $(noteSel);
      if (!file) return;
      const P = window.OrganiserPdfText;
      if (!P) return;
      if (note) { note.hidden = false; note.textContent = "Reading…"; }
      let r;
      try {
        r = await P.read(await file.arrayBuffer());
      } catch (e) {
        if (note) note.textContent = "That file couldn't be opened. Opening it yourself and copying the text across will work.";
        return;
      }
      if (!r.ok || !r.text.trim()) {
        if (note)
          note.textContent =
            (r.notes.join(" ") || "Nothing readable came out of that file.") +
            " Try opening it and copying the text across instead.";
        return;
      }
      const box = $(boxSel);
      if (box) box.value = r.text;
      if (note) note.textContent = [r.caution].concat(r.notes).join(" ");
      if (after) after();
    });
  }

  function save() {
    const L = LP();
    const text = ($("#lsPaste").value || "").trim();
    const group = ($("#lsGroup").value || "").trim();
    if (!text && !group) return;
    const p = L.parse(text, lessonConfig);
    lessons = L.add(
      lessons,
      {
        title: p.title || group || "Lesson",
        plan: text,
        group,
        skill: ($("#lsSkill").value || "").trim(),
        slotId: ($("#lsSlot").value || "").trim(),
        objective: p.objective,
        ways: p.ways,
        checks: p.checks,
        itemId: ($("#lsItem").value || "").trim(),
        targets: chosenTargets.slice(),
      },
      ($("#lsDate").value || "").trim() || todayISO()
    );
    // THE JOB IT SETTLES, if you picked one. Explicitly chosen, never guessed:
    // an app that decides for itself which of your tasks a plan finishes will
    // be wrong sometimes, and you'd never know which times.
    const itemId = ($("#lsItem").value || "").trim();
    if (itemId) {
      // `completedAt`, an ISO timestamp — the same field the timeline writes
      // when you tick something off there. A job finished from this page has to
      // look identical to one finished from that one, or Looking Back counts it
      // as done with no date and the week's tally quietly loses it.
      items = items.map((it) =>
        it && it.id === itemId ? { ...it, done: true, completedAt: new Date().toISOString() } : it
      );
    }
    OrganiserStore.save(itemId ? { lessons, items } : { lessons });
    $("#lsPaste").value = "";
    $("#lsItem").value = "";
    chosenTargets = [];
    preview();
    renderTargets();
    renderAll();
  }

  // ---- what's kept --------------------------------------------------------
  function renderList() {
    const el = $("#lsList");
    if (!el) return;
    const L = LP();
    const list = L.recent(lessons, {});
    const c = $("#lsCount");
    if (c)
      c.textContent = list.length
        ? `${list.length} kept · ${list.filter((x) => x.taught).length} marked as taught`
        : "";
    if (!list.length) {
      el.innerHTML = `<p class="muted">Nothing kept yet. Paste a plan above and it'll sit here against its class and its day.</p>`;
      return;
    }
    const slotName = (id) => {
      const s = schedule.find((x) => x && x.id === id);
      return s ? s.label : "";
    };
    el.innerHTML = list
      .map((l) => {
        const bits = [l.group, l.skill, slotName(l.slotId), ago(l.date)].filter(Boolean);
        return (
          `<div class="ls-item${l.taught ? " taught" : ""}">` +
          `<div class="p-thead"><strong>${esc(l.title)}</strong>` +
          `<span class="p-state">${esc(bits.join(" · "))}</span></div>` +
          (l.objective ? `<p class="p-said">${esc(l.objective)}</p>` : "") +
          `<p class="ls-meta">${l.ways.length} ${l.ways.length === 1 ? "way" : "ways"} of teaching · ` +
          `${l.checks.length} ${l.checks.length === 1 ? "way" : "ways"} of checking</p>` +
          (l.note ? `<p class="ls-note">${esc(l.note)}</p>` : "") +
          `<div class="ls-buttons">` +
          `<button type="button" class="link ls-taught" data-id="${esc(l.id)}">` +
          `${l.taught ? "taught" : "mark as taught"}</button>` +
          `<button type="button" class="link ls-after" data-id="${esc(l.id)}">` +
          `${l.note ? "change what you thought" : "how did it go"}</button>` +
          // Only once it's taught and pointed at something — marking a class
          // against a lesson you haven't given yet is a guess with a date on it.
          (l.taught && l.targets.length
            ? `<button type="button" class="link ls-mark" data-id="${esc(l.id)}">` +
              `${grading === l.id ? "close" : "how did they do"}</button>`
            : "") +
          `</div>` +
          (grading === l.id ? markingGrid(l) : "") +
          // The box only opens for the one you asked for. A textarea under every
          // lesson turns the page into a wall of empty boxes.
          (editing === l.id
            ? `<div class="ls-afterbox"><textarea class="ls-notebox" rows="3" ` +
              `data-id="${esc(l.id)}" placeholder="What actually happened. Only for you.">${esc(l.note)}</textarea>` +
              `<button type="button" class="btn ls-savenote" data-id="${esc(l.id)}">Keep it</button></div>`
            : "") +
          `</div>`
        );
      })
      .join("");
  }

  // ONE ROW PER PERSON, ONE COLUMN PER TARGET. Tap the level.
  //
  // Whoever you don't get to is left blank, which is its own answer — "not
  // judged" is a different fact from "didn't get it" and the app keeps them
  // apart everywhere. Nothing is pre-filled and nothing is assumed.
  function markingGrid(l) {
    const lv = window.OrganiserLevels;
    if (!lv) return "";
    const members = contacts.filter((c) => c && c.id && (!l.group || c.group === l.group));
    if (!members.length) return `<p class="muted">Nobody on your list is in ${esc(l.group || "this class")}.</p>`;
    const levels = lv.levels(recordConfig);
    if (!levels.length) return `<p class="muted">No scale set up yet — the Students page is where the levels are named.</p>`;
    return (
      `<div class="ls-grid"><p class="muted">Anyone you don't get to stays blank, which is not the same as not getting it.</p>` +
      l.targets
        .map((code) => {
          const rows = members
            .map((m) => {
              const cur = lv.currentFor(records, m.id, code);
              return (
                `<div class="ls-grow"><span class="ls-gname">${esc(m.name || m.id)}</span>` +
                levels
                  .map(
                    (lev) =>
                      `<button type="button" class="p-opt ls-lvl${cur && cur.level === lev ? " on" : ""}" ` +
                      `data-lesson="${esc(l.id)}" data-code="${esc(code)}" data-who="${esc(m.id)}" ` +
                      `data-level="${esc(lev)}">${esc(lev)}</button>`
                  )
                  .join("") +
                `</div>`
              );
            })
            .join("");
          return `<div class="ls-gtarget"><h4>${esc(code)} ${esc(targetText(code))}</h4>${rows}</div>`;
        })
        .join("") +
      `</div>`
    );
  }

  // The same record every other page writes — same fields, same shape. A
  // judgement made here has to be indistinguishable from one made on the
  // Students page, or half the app stops seeing it.
  function markLevel(who, code, level) {
    const lv = window.OrganiserLevels;
    if (!lv) return;
    const cur = lv.currentFor(records, who, code);
    const now = new Date().toISOString();
    if (cur && String(cur.level) === String(level)) {
      // Same judgement again is a confirmation, not a second piece of evidence.
      lv.addConfirmation(cur, todayISO());
    } else {
      records = [{
        id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        who, date: todayISO(),
        type: ((recordConfig || {}).types || [])[0] || "assessment",
        summary: cur ? `${code} — now ${level} (was ${cur.level})` : `${code} — ${level}`,
        detail: "", extra: {}, topic: code, level: String(level), tags: [],
        followUp: false, taskId: "", src: "hand", checkedAt: now, createdAt: now, files: [],
      }].concat(records);
    }
    OrganiserStore.save({ records });
    renderAll();
    renderList();
  }

  function wireList() {
    const el = $("#lsList");
    if (!el) return;
    el.addEventListener("click", (e) => {
      const L = LP();
      const t = e.target.closest ? e.target.closest("button") : null;
      if (!t) return;
      const id = t.dataset.id;
      if (t.classList.contains("ls-taught")) {
        const cur = lessons.find((x) => x && x.id === id);
        lessons = L.update(lessons, id, { taught: !(cur && cur.taught) });
        OrganiserStore.save({ lessons });
        renderAll();
      } else if (t.classList.contains("ls-after")) {
        editing = editing === id ? "" : id;
        renderList();
      } else if (t.classList.contains("ls-mark")) {
        grading = grading === id ? "" : id;
        renderList();
      } else if (t.classList.contains("ls-lvl")) {
        markLevel(t.dataset.who, t.dataset.code, t.dataset.level);
      } else if (t.classList.contains("ls-savenote")) {
        const box = el.querySelector(".ls-notebox");
        lessons = L.update(lessons, id, { note: box ? box.value : "" });
        editing = "";
        OrganiserStore.save({ lessons });
        renderAll();
      }
    });
  }

  // ---- the mirror ---------------------------------------------------------
  function renderMirror() {
    const el = $("#lsMirror");
    if (!el) return;
    const L = LP();
    const m = L.mirror(lessons, {});
    const w = $("#lsMirrorWords");
    if (w) w.textContent = L.mirrorWords(m);
    if (m.taught < 3) { el.innerHTML = ""; return; }
    const bar = (rows, label) =>
      rows.length
        ? `<div class="ls-mpart"><h3>${esc(label)}</h3>` +
          rows
            .slice(0, 8)
            .map(
              (r) =>
                `<div class="bp-row"><span class="bp-opt">${esc(r.what)}</span>` +
                `<span class="bp-bar"><i style="width:${Math.round((r.used / m.taught) * 100)}%"></i></span>` +
                `<span class="bp-n">${r.used} of ${m.taught}</span></div>`
            )
            .join("") +
          `</div>`
        : "";
    el.innerHTML =
      bar(m.ways, "Ways you taught") +
      bar(m.checks, "Ways you checked") +
      (m.groups.length > 1
        ? `<div class="ls-mpart"><h3>By class</h3>` +
          m.groups
            .map(
              (g) =>
                `<div class="bp-row"><span class="bp-opt">${esc(g.group)}</span>` +
                `<span class="bp-n">${g.planned} kept · ${g.taught} taught · ${g.noted} with a note</span></div>`
            )
            .join("") +
          `</div>`
        : "");
  }

  // ---- the pickers --------------------------------------------------------
  function renderPickers() {
    const g = $("#lsGroups");
    if (g) g.innerHTML = groups().map((x) => `<option value="${esc(x)}"></option>`).join("");
    const s = $("#lsSkill");
    if (s) {
      const ss = skills();
      s.innerHTML =
        `<option value="">not aimed at one skill</option>` +
        ss.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    }
    const sl = $("#lsSlot");
    if (sl) {
      // THAT DAY'S LESSONS, WEARING THEIR TIMES. A full timetable put all
      // twenty-one blocks in here, in no order, including five identical "Reg
      // 10F" entries — so picking the right one meant counting down the list
      // and hoping. The register had exactly this and was fixed; this is the
      // same question asked on a different page.
      const when = (($("#lsDate") || {}).value || "").trim() || todayISO();
      const S = window.OrganiserSchedule;
      const onDay =
        S && S.blocksOn
          ? S.blocksOn(schedule, when).filter((b) => b && b.id && !b.blocksDay && !b.noLessons)
          : schedule.filter((x) => x && x.id);
      const keep = sl.value;
      sl.innerHTML =
        `<option value="">not on the timetable</option>` +
        onDay
          .slice()
          .sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))
          .map((x) => `<option value="${esc(x.id)}">${esc((x.start ? fmtTime(x.start) + " " : "") + (x.label || x.id))}</option>`)
          .join("");
      // A slot chosen for Monday isn't on Tuesday's list. Quietly keeping it
      // would file the plan against a lesson that didn't happen.
      sl.value = onDay.some((x) => x.id === keep) ? keep : "";
    }
    // Only things still open, and only ones that look like work rather than
    // appointments — but the list is never filtered by guessing at titles.
    const it = $("#lsItem");
    if (it)
      it.innerHTML =
        `<option value="">nothing — just keep the plan</option>` +
        items
          .filter((x) => x && x.id && !x.done)
          .slice(0, 60)
          .map((x) => `<option value="${esc(x.id)}">${esc(x.title || x.id)}</option>`)
          .join("");
    const d = $("#lsDate");
    if (d && !d.value) d.value = todayISO();
    const wh = $("#lsWhich");
    if (wh) {
      const gs = groups();
      wh.innerHTML =
        `<option value="">every class</option>` +
        gs.map((x) => `<option value="${esc(x)}"${x === where ? " selected" : ""}>${esc(x)}</option>`).join("");
    }
  }

  function renderHeadings() {
    const L = LP();
    const hs = L.headings(lessonConfig);
    const set = (sel, list) => {
      const el = $(sel);
      if (el) el.value = list.join(", ");
    };
    set("#lsHObjective", hs.objective);
    set("#lsHWays", hs.ways);
    set("#lsHChecks", hs.checks);
    const RV = window.OrganiserReview;
    const g = $("#lsHGaps");
    if (g && RV) g.value = RV.gaps(lessonConfig).join(", ");
  }

  function wireHeadings() {
    const form = $("#lsHeadForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const split = (sel) =>
        ($(sel).value || "").split(",").map((x) => x.trim()).filter(Boolean);
      lessonConfig = {
        ...(lessonConfig || {}),
        headings: {
          objective: split("#lsHObjective"),
          ways: split("#lsHWays"),
          checks: split("#lsHChecks"),
        },
        // Empty is a deliberate "no reminders", and is kept as an empty list
        // rather than falling back to the starting values.
        reviewDays: ($("#lsHGaps").value || "")
          .split(",").map((x) => Math.round(Number(x.trim()))).filter((n) => n > 0),
      };
      OrganiserStore.save({ lessonConfig });
      renderHeadings();
      preview();
      renderAll();
    });
  }

  // ---- what's been taught against, and what hasn't ------------------------
  function renderCoverage() {
    const S = window.OrganiserSyllabus;
    const block = $("#lsCoverBlock");
    const el = $("#lsCover");
    if (!S || !block || !el) return;
    const c = S.coverage(lessons, syllabus, { group: where });
    block.hidden = !c.total;
    if (!c.total) return;
    const w = $("#lsCoverWords");
    if (w) w.textContent = S.words(c);
    el.innerHTML =
      (c.taught.length
        ? `<div class="ls-mpart"><h3>Taught against</h3>` +
          c.taught
            .map(
              (t) =>
                `<div class="ro-row"><span><strong>${esc(t.code)}</strong> ` +
                `${esc(t.target ? t.target.text : "")}</span>` +
                `<span class="p-state">${t.times} ${t.times === 1 ? "lesson" : "lessons"}</span></div>`
            )
            .join("") +
          `</div>`
        : "") +
      // Codes from a syllabus you have since replaced. Kept and named rather
      // than counted as covered — a row with a code and no words beside it
      // reads as a target you've met when it is nothing of the sort.
      (c.fromOther && c.fromOther.length
        ? `<div class="ls-mpart"><h3>From an earlier list</h3>` +
          c.fromOther
            .map(
              (t) =>
                `<div class="ro-row"><span><strong>${esc(t.code)}</strong></span>` +
                `<span class="p-state">${t.times} ${t.times === 1 ? "lesson" : "lessons"}, not on the list you use now</span></div>`
            )
            .join("") +
          `</div>`
        : "") +
      // The half you cannot notice by reading the other half.
      (c.untaught.length
        ? `<div class="ls-mpart"><h3>Nothing against these yet</h3>` +
          c.untaught
            .slice(0, 40)
            .map(
              (t) =>
                `<div class="ro-row"><span><strong>${esc(t.code)}</strong> ${esc(t.text)}</span>` +
                (t.strand ? `<span class="p-state">${esc(t.strand)}</span>` : "") +
                `</div>`
            )
            .join("") +
          (c.untaught.length > 40 ? `<p class="muted">and ${c.untaught.length - 40} more</p>` : "") +
          `</div>`
        : "");
  }

  function renderSyllabus() {
    const S = window.OrganiserSyllabus;
    if (!S) return;
    const n = $("#lsSylName");
    if (n && !n.value) n.value = (syllabus && syllabus.name) || "";
    const box = $("#lsSylPaste");
    // Through normalise, never straight at the object. A stored syllabus is
    // usually well formed because this page wrote it — but a hand-edited file,
    // a half-finished save or an older version can leave `{}` behind, and the
    // server passes any object through untouched. Reading .targets off that
    // throws during init, which kills the whole page rather than one block.
    const stored = window.OrganiserSyllabus && window.OrganiserSyllabus.normalise(syllabus);
    if (box && !box.value && stored)
      box.value = stored.targets.map((t) => `${t.code}\t${t.text}`).join("\n");
    readSyllabus();
  }

  // Say what was read out BEFORE it's kept — the same rule as the plan box.
  function readSyllabus() {
    const S = window.OrganiserSyllabus;
    const out = $("#lsSylRead");
    const box = $("#lsSylPaste");
    if (!S || !out || !box) return;
    const t = S.parse(box.value || "");
    const coded = t.filter((x) => x.code).length;
    out.textContent = t.length
      ? `${t.length} targets read, ${coded} of them with a code. ` +
        (coded < t.length ? "The ones without a code can't be counted as covered, only read." : "")
      : "";
  }

  function wireSyllabus() {
    const box = $("#lsSylPaste");
    if (box) box.addEventListener("input", readSyllabus);
    const btn = $("#lsSylSave");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const S = window.OrganiserSyllabus;
      if (!S) return;
      const targets = S.parse(($("#lsSylPaste").value || ""));
      // Replacing wholesale is the point — a new school, a new year group.
      // Lessons keep the codes they were given, so anything still on the new
      // syllabus stays joined up and anything dropped simply stops matching.
      syllabus = targets.length
        ? S.normalise({ name: ($("#lsSylName").value || "").trim(), targets })
        : null;
      OrganiserStore.save({ syllabus });
      renderTargets();
      renderAll();
    });
  }

  // ---- coming back to it --------------------------------------------------
  function renderReview() {
    const RV = window.OrganiserReview;
    const el = $("#lsReview");
    if (!RV || !el) return;
    const rows = RV.due(lessons, lessonConfig, schedule, todayISO(), { group: where });
    const w = $("#lsReviewWords");
    if (w) w.textContent = RV.summary(rows);
    el.innerHTML = rows.length
      ? rows
          .slice(0, 20)
          .map(
            (r) =>
              `<div class="ro-row ls-rev ${esc(r.state)}"><span><strong>${esc(r.code)}</strong> ` +
              `${esc(targetText(r.code))}</span>` +
              `<span class="p-state">${esc(RV.words(r))}</span></div>`
          )
          .join("") + (rows.length > 20 ? `<p class="muted">and ${rows.length - 20} more</p>` : "")
      : "";
  }

  const targetText = (code) => {
    const S = window.OrganiserSyllabus;
    const syl = S ? S.normalise(syllabus) : null;
    const t = syl && syl.targets.find((x) => x.code === code);
    return t ? t.text : "";
  };

  // ---- and whether it landed ----------------------------------------------
  function renderWhere() {
    const A = window.OrganiserAttain;
    const el = $("#lsWhere");
    if (!A || !el) return;
    const members = contacts.filter((c) => c && c.id && (!where || c.group === where));
    const pic = A.picture(records, recordConfig, lessons, syllabus, members, where, { attendance });
    if (!pic.rows.length) {
      el.innerHTML = `<p class="muted">Nothing taught against the syllabus for this class yet.</p>`;
      return;
    }
    if (!pic.anyJudged) {
      el.innerHTML = `<p class="muted">${pic.rows.length} targets taught, and nobody judged against any of them yet. That's a starting point, not a result — mark a taught lesson below to begin.</p>`;
      return;
    }
    el.innerHTML = pic.rows
      .map((r) => {
        const bar = r.ranked
          .map(
            ([lvl, n]) =>
              `<div class="bp-row"><span class="bp-opt">${esc(lvl)}</span>` +
              `<span class="bp-bar"><i style="width:${Math.round((n / Math.max(1, r.judged)) * 100)}%"></i></span>` +
              `<span class="bp-n">${n}</span></div>`
          )
          .join("");
        return (
          `<div class="ls-mpart"><h3>${esc(r.code)} ${esc(r.text)}</h3>` +
          `<p class="muted">${esc(A.classWords(r))}</p>${bar}` +
          // Names, not just counts — the same rule as the planning page. A
          // number tells you there's a problem; a name tells you whose.
          (r.namesBelow.length
            ? `<p class="bp-who">below: ${esc(r.namesBelow.map((x) => x.name).join(", "))}</p>`
            : "") +
          (r.namesUnjudged.length
            ? `<p class="bp-who">not judged: ${esc(r.namesUnjudged.map((x) => x.name).join(", "))}</p>`
            : "") +
          // Never in the room for it. A different problem with a different
          // answer, so it gets its own line rather than padding "not judged".
          (r.missedIt && r.missedIt.length
            ? `<p class="bp-who">weren't in for it: ${esc(r.missedIt.map((x) => x.name).join(", "))}</p>`
            : "") +
          `</div>`
        );
      })
      .join("");
  }

  function renderAll() {
    renderPickers();
    renderList();
    renderMirror();
    renderCoverage();
    const wb = $("#lsWhereBlock");
    if (wb) wb.hidden = !syllabus;
    renderReview();
    renderWhere();
  }

  async function init() {
    const data = await OrganiserStore.load();
    lessons = Array.isArray(data.lessons) ? data.lessons : [];
    lessonConfig = data.lessonConfig || null;
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    records = Array.isArray(data.records) ? data.records : [];
    recordConfig = data.recordConfig || null;
    schedule = Array.isArray(data.schedule) ? data.schedule : [];
    items = Array.isArray(data.items) ? data.items : [];
    tried = Array.isArray(data.tried) ? data.tried : [];
    syllabus = data.syllabus || null;
    attendance = Array.isArray(data.attendance) ? data.attendance : [];
    where = "";
    const paste = $("#lsPaste");
    if (paste) paste.addEventListener("input", () => { preview(); renderTargets(); });
    const btn = $("#lsSave");
    if (btn) btn.addEventListener("click", save);
    const wh = $("#lsWhich");
    if (wh) wh.addEventListener("change", () => { where = wh.value; renderAll(); });
    // WHICH LESSONS THERE ARE DEPENDS ON WHICH DAY IT IS. The list was built
    // once when the page opened and never again, so choosing a different day
    // left you picking from the first day's lessons — or, out of term, from
    // nothing at all with no way to tell why.
    const dd = $("#lsDate");
    if (dd) dd.addEventListener("change", renderPickers);
    wireList();
    wireHeadings();
    wireSyllabus();
    wireFile("#lsPlanFile", "#lsPaste", "#lsPlanFileNote", () => { preview(); renderTargets(); });
    wireFile("#lsSylFile", "#lsSylPaste", "#lsSylFileNote", readSyllabus);
    const tg = $("#lsTargets");
    if (tg)
      tg.addEventListener("change", (e) => {
        const b = e.target;
        if (!b || !b.classList || !b.classList.contains("ls-tbox")) return;
        chosenTargets = b.checked
          ? chosenTargets.concat([b.value])
          : chosenTargets.filter((x) => x !== b.value);
      });
    renderHeadings();
    renderSyllabus();
    renderAll();
  }

  init();
})();
