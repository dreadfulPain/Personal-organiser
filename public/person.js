// ONE PERSON, ON ONE SCREEN.
//
// The use this is built for is precise: someone is on the phone asking about
// their child, and you have a couple of seconds to find the answer without
// sounding like you're rummaging. That rules out most of how an app would
// normally lay this out.
//
// So the order is the order the questions actually come in:
//   1. The two or three facts that answer the first question. Not a chart — a
//      chart of one fact is a worse way of showing it than the fact.
//   2. How it's gone over time, as a picture, because "has he improved" is a
//      shape question and a shape answers it faster than a column of numbers.
//   3. What you know besides the marks — and, honestly, how old each bit is.
//   4. What you've already told people, so you don't contradict yourself.
//
// Everything on this page stays on this page. Nothing here builds a document.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let contacts = [], records = [], recordConfig = null;
  let pastoralNotes = [], pastoralTopics = [], toldLog = [], tried = [];
  let lessons = [], syllabus = null;
  let who = "";

  const $ = (s) => document.querySelector(s);
  const L = () => window.OrganiserLevels;
  const C = () => window.OrganiserChart;
  const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nameOf = (id) => {
    const c = contacts.find((x) => x && x.id === id);
    return (c && c.name) || id;
  };
  const ago = (iso) => {
    if (!iso) return "";
    const d = Math.round((new Date(todayISO() + "T12:00:00") - new Date(iso + "T12:00:00")) / 86400000);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.round(d / 7)} weeks ago`;
    return `${Math.round(d / 30)} months ago`;
  };

  function skills() {
    const cfg = L() ? L().normalise(recordConfig) : null;
    return (cfg && cfg.topics) || [];
  }

  // ---- 1. the facts, before any picture --------------------------------
  function renderTiles() {
    const el = $("#pTiles");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const lv = L();
    const ss = skills();
    // No skills set up at all is NOT a score of zero. "0 of 0" reads like a
    // result; it's an empty shelf, and the difference matters when someone is
    // on the phone.
    if (!ss.length) {
      el.innerHTML = `<p class="muted">No skills set up yet — nothing to show against them. Set them up on the Students page and this fills in.</p>`;
      return;
    }
    const current = ss
      .map((s) => ({ skill: s, rec: lv.currentFor(records, who, s) }))
      .filter((x) => x.rec);
    const target = lv.targetLevel(recordConfig);
    const atOrAbove = current.filter((x) => !lv.isStronger(recordConfig, target, x.rec.level)).length;
    const newest = current
      .map((x) => x.rec.date)
      .filter(Boolean)
      .sort()
      .pop();
    const told = window.OrganiserTold ? window.OrganiserTold.summary(toldLog, who) : { count: 0, last: "" };

    el.innerHTML =
      C().tile("skills with a level", `${current.length}`, ss.length ? `of ${ss.length}` : "") +
      C().tile(`at or above ${lv.levelName(recordConfig, target) || "target"}`, `${atOrAbove}`,
        current.length ? `of ${current.length} recorded` : "nothing recorded yet") +
      C().tile("last piece of evidence", newest ? ago(newest) : "none yet", newest || "") +
      C().tile("times you've told someone", `${told.count}`, told.last ? `last ${ago(told.last)}` : "");
  }

  // ---- 2. how it's gone -------------------------------------------------
  function renderChart() {
    const el = $("#pChart");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const lv = L();
    const asc = lv.ascending(recordConfig); // weakest → strongest
    const yTicks = asc.map((name, i) => ({ v: i + 1, label: name }));
    const series = skills()
      .map((s) => {
        const hist = lv.historyFor(records, who, s).slice().reverse(); // oldest first
        return {
          name: s,
          points: hist
            .map((r) => ({ x: r.date || "", y: asc.indexOf(r.level) + 1, label: r.level }))
            .filter((p) => p.x && p.y > 0),
        };
      })
      .filter((s) => s.points.length);

    if (!series.length) {
      el.innerHTML = `<p class="muted">No levels recorded yet. They'll draw themselves as you add them.</p>`;
      return;
    }
    el.innerHTML = C().overTime(series, {
      yMin: 1, yMax: Math.max(2, asc.length), yTicks,
      alt: `How ${nameOf(who)} has gone, by skill, over time`,
      valueLabel: "skill",
    });
  }

  // ---- 3. besides the marks --------------------------------------------
  function renderPastoral() {
    const el = $("#pPastoral");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const P = window.OrganiserPastoral;
    if (!P) { el.innerHTML = ""; return; }
    const rows = P.freshness(pastoralNotes, pastoralTopics, who, todayISO());
    if (!rows.length) {
      el.innerHTML = `<p class="muted">No topics set up yet. Add the handful of things you'd want to be able to answer — and how long each stays true for.</p>`;
      return;
    }
    // Up-front topics first, then the rest — that's what "front and centre"
    // means when the phone is already ringing.
    const sorted = rows.slice().sort((a, b) => (b.topic.upFront ? 1 : 0) - (a.topic.upFront ? 1 : 0));
    el.innerHTML = sorted
      .map((f) => {
        const note = f.latest ? esc(f.latest.said) : "";
        const when =
          f.state === "never asked"
            ? `<span class="p-state">never asked</span>`
            : f.state === "worth checking again"
              ? `<span class="p-state">from ${esc(ago(f.latest.date))} — worth checking again</span>`
              : `<span class="p-state">${esc(ago(f.latest.date))}</span>`;
        return (
          `<div class="p-topic${f.topic.upFront ? " up" : ""}">` +
          `<div class="p-thead"><strong>${esc(f.topic.label)}</strong>${when}</div>` +
          (note ? `<p class="p-said">${note}</p>` : `<p class="muted p-said">Nothing written down.</p>`) +
          writeIn(f) +
          `</div>`
        );
      })
      .join("");
  }

  // HOW YOU PUT SOMETHING IN, right where you read it.
  //
  // A separate "add a note" screen would be the obvious build and it would go
  // unused: you find these things out in the two seconds after someone tells
  // you, not later at a desk. So the box is under the heading it belongs to.
  //
  // A topic with set answers gets buttons — one tap, no typing, no spelling.
  // That's also the only kind that can be counted across a group later, so the
  // cheapest thing to record is the most useful thing to have.
  function writeIn(f) {
    const t = f.topic;
    if (t.options.length) {
      const now = f.latest && f.latest.choice ? f.latest.choice : "";
      return (
        `<div class="p-add">` +
        t.options
          .map(
            (o) =>
              `<button type="button" class="p-opt${o === now ? " on" : ""}" ` +
              `data-topic="${esc(t.id)}" data-choice="${esc(o)}"` +
              `${o === now ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${esc(o)}</button>`
          )
          .join("") +
        `</div>`
      );
    }
    return (
      `<div class="p-add">` +
      `<input type="text" class="p-write" maxlength="800" data-topic="${esc(t.id)}" ` +
      `value="${esc(drafts[t.id] || "")}" ` +
      `aria-label="What to write under ${esc(t.label)}" placeholder="what you noticed" />` +
      `<button type="button" class="p-save" data-topic="${esc(t.id)}">Save</button>` +
      `</div>`
    );
  }

  // HALF-TYPED SENTENCES SURVIVE A REDRAW.
  //
  // Saving one note redraws the whole block, and anything typed into another
  // box would go with it — start two, finish one, silently lose the other. So
  // what's in the boxes is held here rather than only in the DOM, and put back
  // every time. Losing a sentence you'd just written is the fastest way to stop
  // trusting a place to put things.
  let drafts = {};

  // One tap on an answer, or a sentence typed under a heading. Both land in the
  // same place: a note dated today, against this person and this heading.
  function wireWriting() {
    const el = $("#pPastoral");
    if (!el) return;
    el.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("p-write")) drafts[t.dataset.topic] = t.value;
    });
    el.addEventListener("click", (e) => {
      const opt = e.target.closest ? e.target.closest(".p-opt") : null;
      if (opt) return writeNote(opt.dataset.topic, { choice: opt.dataset.choice });
      const save = e.target.closest ? e.target.closest(".p-save") : null;
      if (save) saveDraft(save.dataset.topic);
    });
    // Enter saves too — reaching for the mouse to finish a sentence is the step
    // where it stops being worth writing down.
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.classList || !e.target.classList.contains("p-write")) return;
      e.preventDefault();
      drafts[e.target.dataset.topic] = e.target.value;
      saveDraft(e.target.dataset.topic);
    });
  }

  function saveDraft(topicId) {
    const said = String(drafts[topicId] || "").trim();
    if (!said) return;
    delete drafts[topicId];
    writeNote(topicId, { said });
  }

  function writeNote(topicId, what) {
    const P = window.OrganiserPastoral;
    if (!P || !who || !topicId) return;
    pastoralNotes = P.add(pastoralNotes, { who, topicId, ...what }, todayISO());
    OrganiserStore.save({ pastoralNotes });
    renderAll();
  }

  // ---- where they are against the syllabus -------------------------------
  //
  // Only targets their class was actually taught. Judging someone against
  // something never covered is a mark for the planning, not for them — and it
  // would put a wall of red on the page of a child who did nothing wrong.
  function renderSyllabus() {
    const A = window.OrganiserAttain;
    const block = $("#pSylBlock");
    const el = $("#pSyl");
    if (!A || !block || !el) return;
    const me = contacts.find((c) => c && c.id === who);
    const rows = who ? A.forPerson(records, recordConfig, lessons, syllabus, who, me && me.group) : [];
    block.hidden = !who || !rows.length;
    if (!rows.length) return;
    const w = $("#pSylWords");
    if (w) w.textContent = A.personWords(rows);
    el.innerHTML = rows
      .map(
        (r) =>
          `<div class="ro-row ls-att ${esc(r.state.replace(/\s+/g, "-"))}">` +
          `<span><strong>${esc(r.code)}</strong> ${esc(r.text)}</span>` +
          `<span class="p-state">` +
          (r.state === "not judged yet"
            ? `taught ${esc(ago(r.lastTaught))}, not judged yet`
            : `${esc(r.level)} · ${esc(ago(r.date))}`) +
          `</span></div>`
      )
      .join("");
  }

  // ---- 4. what you tried, and what moved afterwards ---------------------
  //
  // The trail, not a score. One student is never enough tries to count
  // anything, so this shows what happened each time rather than a percentage —
  // the counting only starts to mean something across a whole group, and that
  // lives on the planning page.
  function renderTried() {
    const el = $("#pTried");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const Y = window.OrganiserTried;
    if (!Y) { el.innerHTML = ""; return; }
    const list = Y.forPerson(tried, who, contacts);
    if (!list.length) {
      el.innerHTML = `<p class="muted">Nothing logged yet. Note what you did and which skill it was aimed at, and the app will tell you what their level did next time you judged it.</p>`;
      return;
    }
    el.innerHTML = list
      .map((t) => {
        const out = Y.outcome(records, recordConfig, who, t.skill, t.date);
        const also = Y.alsoInWindow(tried, contacts, who, t.skill, t.date, out);
        return (
          `<div class="p-tried"><div class="p-thead"><strong>${esc(t.what)}</strong>` +
          `<span class="p-state">${esc(t.skill || "no skill set")} · ${esc(ago(t.date))}</span></div>` +
          `<p class="p-said">${esc(outcomeWords(out))}</p>` +
          // Two things in the same gap means the movement belongs to both and
          // to neither. Said here rather than quietly counted twice.
          (also.length
            ? `<p class="muted p-also">You also tried ${esc(also.join(", "))} in the same gap — no way to tell them apart.</p>`
            : "") +
          `</div>`
        );
      })
      .join("");
  }

  function outcomeWords(out) {
    const lv = L();
    const nm = (l) => (lv ? lv.levelLabel(recordConfig, l) : l);
    switch (out.state) {
      case "moved up":
        return `Went from ${nm(out.before.level)} to ${nm(out.after.level)}${out.days ? `, ${out.days} days later` : ""}.`;
      case "moved down":
        return `Went from ${nm(out.before.level)} to ${nm(out.after.level)}${out.days ? `, ${out.days} days later` : ""}.`;
      case "stayed the same":
        return out.atCeiling
          ? `Stayed at ${nm(out.before.level)}, which is already the top — there was nowhere to move.`
          : `Stayed at ${nm(out.before.level)}.`;
      case "not followed up yet":
        return out.atCeiling
          ? `At ${nm(out.before.level)} and not judged again since — already at the top.`
          : `At ${nm(out.before.level)} beforehand, and not judged again since.`;
      case "no level beforehand":
        return `No level recorded before this, so there's nothing to compare with.`;
      case "no skill":
        return `No skill set on this one, so it can't be matched to a level.`;
      default:
        return `Nothing recorded against that skill yet.`;
    }
  }

  function renderTriedForm() {
    const Y = window.OrganiserTried;
    const sel = $("#ptrSkill");
    if (sel) {
      const ss = skills();
      sel.innerHTML = ss.length
        ? ss.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")
        : `<option value="">no skills set up yet</option>`;
    }
    // The words you've used before, offered back — so the same thing doesn't
    // end up counted separately under three spellings of itself.
    const dl = $("#ptrWords");
    if (dl && Y) {
      dl.innerHTML = Y.vocabulary(tried)
        .map((v) => `<option value="${esc(v.what)}"></option>`)
        .join("");
    }
    const d = $("#ptrDate");
    if (d && !d.value) d.value = todayISO();
  }

  function wireTried() {
    const form = $("#pTriedForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const Y = window.OrganiserTried;
      if (!Y || !who) return;
      const what = ($("#ptrWhat").value || "").trim();
      if (!what) return;
      tried = Y.add(
        tried,
        { what, skill: ($("#ptrSkill").value || "").trim(), whoIds: [who] },
        ($("#ptrDate").value || "").trim() || todayISO()
      );
      OrganiserStore.save({ tried });
      $("#ptrWhat").value = "";
      renderTriedForm();
      renderTried();
    });
  }

  // ---- 5. what you've already said -------------------------------------
  function renderTold() {
    const el = $("#pTold");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const T = window.OrganiserTold;
    if (!T) { el.innerHTML = ""; return; }
    const list = T.forPerson(toldLog, who);
    if (!list.length) {
      el.innerHTML = `<p class="muted">Nothing logged yet. Worth a line after a conversation — it's the thing you can't reconstruct later.</p>`;
      return;
    }
    el.innerHTML =
      `<p class="muted">On this screen only — this is never exported, printed or included in any report.</p>` +
      list
        .map(
          (e) =>
            `<div class="p-told"><div class="p-thead"><strong>${esc(e.to || "someone")}</strong>` +
            `<span class="p-state">${esc(ago(e.date))}${e.how ? ` · ${esc(e.how)}` : ""}</span></div>` +
            `<p class="p-said">${esc(e.said)}</p></div>`
        )
        .join("");
  }

  // ---- the headings themselves ------------------------------------------
  //
  // These belong to you, not to the app, and they're the same for everyone —
  // edited here because this is the page where you notice one is missing.
  function renderTopics() {
    const el = $("#pTopicList");
    if (!el) return;
    const P = window.OrganiserPastoral;
    if (!P) return;
    const list = (pastoralTopics || []).map((t) => P.normaliseTopic(t)).filter(Boolean);
    if (!list.length) {
      el.innerHTML = `<p class="muted">No headings yet. Two or three is plenty to start with.</p>`;
      return;
    }
    el.innerHTML = list
      .map(
        (t) =>
          `<div class="p-trow"><span><strong>${esc(t.label)}</strong> ` +
          `<span class="p-state">${t.staysFreshDays} days` +
          (t.essential ? " · must have" : "") +
          (t.upFront ? " · at the top" : "") +
          (t.options.length ? ` · ${esc(t.options.join(", "))}` : "") +
          `</span></span>` +
          `<button type="button" class="link p-tdel" data-topic="${esc(t.id)}">remove</button></div>`
      )
      .join("");
  }

  function wireTopics() {
    const form = $("#pTopicForm");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const P = window.OrganiserPastoral;
        const label = ($("#ptLabel").value || "").trim();
        if (!label) return;
        const t = P.normaliseTopic({
          label,
          staysFreshDays: Number($("#ptFresh").value) || 30,
          essential: $("#ptEssential").checked,
          upFront: $("#ptUpFront").checked,
          options: ($("#ptOptions").value || "").split(",").map((s) => s.trim()).filter(Boolean),
        });
        if (!t) return;
        // Same heading twice is a mistake every time, and it splits the count.
        if ((pastoralTopics || []).some((x) => P.normaliseTopic(x) && P.normaliseTopic(x).id === t.id)) {
          $("#ptLabel").value = "";
          return;
        }
        pastoralTopics = (pastoralTopics || []).concat([t]);
        OrganiserStore.save({ pastoralTopics });
        form.reset();
        $("#ptFresh").value = "30";
        renderTopics();
        renderPastoral();
      });
    }
    const list = $("#pTopicList");
    if (list) {
      list.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest(".p-tdel") : null;
        if (!b) return;
        const P = window.OrganiserPastoral;
        // The heading goes; anything written under it stays. Deleting a heading
        // is tidying, and tidying should never throw away what people said.
        pastoralTopics = (pastoralTopics || []).filter((x) => {
          const n = P.normaliseTopic(x);
          return !n || n.id !== b.dataset.topic;
        });
        OrganiserStore.save({ pastoralTopics });
        renderTopics();
        renderPastoral();
      });
    }
  }

  // ---- adding to the log -------------------------------------------------
  function wireTold() {
    const form = $("#pToldForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const T = window.OrganiserTold;
      if (!T || !who) return;
      const said = ($("#ptdSaid").value || "").trim();
      if (!said) return;
      toldLog = T.add(
        toldLog,
        { who, said, to: ($("#ptdTo").value || "").trim(), how: ($("#ptdHow").value || "").trim() },
        todayISO()
      );
      OrganiserStore.save({ toldLog });
      form.reset();
      renderTold();
    });
  }

  function renderAll() {
    const t = $("#pTitle");
    if (t) t.textContent = who ? nameOf(who) : "One person";
    // Nothing to write on until you've said who — writing a note against nobody
    // is the one way to lose one entirely.
    const forms = [$("#pToldForm"), $("#pTriedForm")];
    forms.forEach((f) => { if (f) f.hidden = !who; });
    renderTiles();
    renderChart();
    renderPastoral();
    renderTopics();
    renderSyllabus();
    renderTriedForm();
    renderTried();
    renderTold();
  }

  function renderPicker() {
    const sel = $("#pWho");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">choose…</option>` +
      contacts
        .filter((c) => c && c.id)
        .map((c) => `<option value="${esc(c.id)}"${c.id === who ? " selected" : ""}>${esc(c.name || c.id)}</option>`)
        .join("");
    sel.addEventListener("change", () => {
      who = sel.value;
      // A half-typed sentence belongs to the person you were looking at. It
      // must not follow you to the next one — that is the one mistake in here
      // you could not undo, because you wouldn't see it happen.
      drafts = {};
      renderAll();
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    records = Array.isArray(data.records) ? data.records : [];
    recordConfig = data.recordConfig || null;
    pastoralNotes = Array.isArray(data.pastoralNotes) ? data.pastoralNotes : [];
    pastoralTopics = Array.isArray(data.pastoralTopics) ? data.pastoralTopics : [];
    toldLog = Array.isArray(data.toldLog) ? data.toldLog : [];
    tried = Array.isArray(data.tried) ? data.tried : [];
    lessons = Array.isArray(data.lessons) ? data.lessons : [];
    syllabus = data.syllabus || null;
    // Deep-link straight to someone: person.html#id — so a shortcut can open on
    // the right person rather than on a chooser.
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash && contacts.some((c) => c && c.id === hash)) who = hash;
    renderPicker();
    wireWriting();
    wireTopics();
    wireTried();
    wireTold();
    renderAll();
  }

  init();
})();
