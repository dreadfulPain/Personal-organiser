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
  let schedule = [], items = [], tried = [], syllabus = null;
  let chosenTargets = []; // codes ticked for the plan currently in the box
  let editing = ""; // the id of the plan whose "afterwards" box is open

  const $ = (s) => document.querySelector(s);
  const LP = () => window.OrganiserLessonPlan;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
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
          `</div>` +
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
    if (sl)
      sl.innerHTML =
        `<option value="">not on the timetable</option>` +
        schedule
          .filter((x) => x && x.id)
          .map((x) => `<option value="${esc(x.id)}">${esc(x.label || x.id)}</option>`)
          .join("");
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
    const c = S.coverage(lessons, syllabus, {});
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
    if (box && !box.value && syllabus)
      box.value = syllabus.targets.map((t) => `${t.code}\t${t.text}`).join("\n");
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

  function renderAll() {
    renderPickers();
    renderList();
    renderMirror();
    renderCoverage();
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
    const paste = $("#lsPaste");
    if (paste) paste.addEventListener("input", () => { preview(); renderTargets(); });
    const btn = $("#lsSave");
    if (btn) btn.addEventListener("click", save);
    wireList();
    wireHeadings();
    wireSyllabus();
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
