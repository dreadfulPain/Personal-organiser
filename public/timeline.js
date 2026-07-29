// THE DAY — a plan that is already made when you get here.
//
// The old version of this page was an empty grid you had to fill in. That is
// backwards: laying out a day is exactly the job that costs the most and gets
// skipped first. So the shape is now: THE APP PROPOSES, YOU ADJUST, YOU ACCEPT.
//
//   1. Fixed blocks are laid down first — they're facts.
//   2. The gaps between them get filled from what already matters.
//   3. You move, remove, add anything.
//   4. You press accept. That's the day settled.
//
// Nothing locks after accepting. Things move all day, because days do.
//
// TWO HONESTIES that hold this together:
//   - Only about two thirds of the free time gets filled. A day packed wall to
//     wall collapses at the first interruption, and then the plan is a liar.
//   - Every time the app guessed — how long something takes, when you finish —
//     it is drawn dashed and says so. A guess must never look like a fact.

(() => {
  "use strict";

  const S = () => window.OrganiserSchedule;

  let items = [];
  let waiting = [];
  let goals = [];
  let schedule = [];
  let cfg = null;
  let setupOpen = false;
  let pastedBlocks = null; // AI-read timetable rows, waiting to be checked
  let addingBlock = false;
  let movingId = null; // which planned task is having its slot changed

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const todayISO = () => S().isoOf(new Date());

  function persist() {
    OrganiserStore.save({ items, waiting, schedule, scheduleConfig: cfg });
  }
  function goalTitleById(id) {
    const g = goals.find((x) => x.id === id);
    return g ? g.title : "";
  }
  function ctx() {
    return { today: todayISO(), goalTitle: goalTitleById };
  }

  // ---------- building the plan ----------
  // Order matters and is deliberate:
  //   1. A hard deadline due today goes in first, always. Nothing outranks it.
  //   2. Effort is matched to gap size — a draining thing needs a real stretch,
  //      and if today hasn't got one it is NOT crammed in. It's flagged as
  //      needing a proper slot, which is a true and useful thing to know.
  //   3. Whatever's left is filled from the shared "what matters" scoring.
  function planFor(iso) {
    const c = S().normaliseConfig(cfg);
    const store = c.plans[iso];
    if (store && store.acceptedAt) return { ...store, accepted: true };
    return buildPlan(iso, store);
  }

  function buildPlan(iso, previous) {
    const c = S().normaliseConfig(cfg);
    const dropped = new Set((previous && previous.dropped) || []);
    const gaps = S().gapsOn(schedule, c, iso).map((g) => ({ ...g }));
    const freeTotal = gaps.reduce((n, g) => n + (g.end - g.start), 0);
    const budget = Math.floor(freeTotal * c.fillFraction);

    // Anything already given a real time by hand keeps it — a decision you made
    // is never quietly overwritten by a plan the app made.
    const pinned = items.filter((i) => !i.done && i.date === iso && i.time);
    const slots = pinned.map((i) => {
      const start = S().toMin(i.time);
      const est = S().estimateMinutes(i, c);
      return { itemId: i.id, start, end: Math.min(start + est.minutes, 24 * 60 - 1), pinned: true, soft: false };
    });
    slots.forEach((s) => carve(gaps, s.start, s.end));

    const candidates = OrganiserPriority.ordered(items, ctx()).filter(
      (i) => !dropped.has(i.id) && !i.time && (!i.date || i.date <= iso) && !i.openLoop
    );

    let used = 0;
    const flagged = [];
    for (const it of candidates) {
      const est = S().estimateMinutes(it, c);
      const hardToday = it.deadlineType === "hard" && it.date && it.date <= iso;
      // The two-thirds rule — but a hard deadline that's due is never left out
      // of the day it's due. That would make the plan quietly wrong.
      if (used >= budget && !hardToday) break;
      const gap = fitIn(gaps, est.minutes);
      if (!gap) {
        // No stretch big enough. Say so rather than chopping it into a gap it
        // doesn't fit — "needs a proper slot" is real information.
        if (est.minutes > c.minGapMinutes) flagged.push({ itemId: it.id, minutes: est.minutes });
        continue;
      }
      slots.push({ itemId: it.id, start: gap.start, end: gap.start + est.minutes, soft: true, why: OrganiserPriority.reason(it, ctx()) });
      carve(gaps, gap.start, gap.start + est.minutes);
      used += est.minutes;
    }
    slots.sort((a, b) => a.start - b.start);
    return { builtAt: new Date().toISOString(), acceptedAt: null, slots, dropped: [...dropped], flagged, freeTotal, used, accepted: false };
  }

  // First gap this many minutes will fit into, earliest first.
  function fitIn(gaps, minutes) {
    return gaps.find((g) => g.end - g.start >= minutes) || null;
  }
  // Remove a used stretch from the remaining free space.
  function carve(gaps, start, end) {
    for (let i = gaps.length - 1; i >= 0; i--) {
      const g = gaps[i];
      if (end <= g.start || start >= g.end) continue;
      const left = { start: g.start, end: Math.max(g.start, start) };
      const right = { start: Math.min(g.end, end), end: g.end };
      gaps.splice(i, 1);
      if (right.end - right.start > 0) gaps.splice(i, 0, right);
      if (left.end - left.start > 0) gaps.splice(i, 0, left);
    }
  }

  function savePlan(iso, plan) {
    const c = S().normaliseConfig(cfg);
    c.plans[iso] = plan;
    // Keep a fortnight of plans and let the rest go — a plan is a working note,
    // not a record. (What actually happened lives in the tasks themselves.)
    const keep = Object.keys(c.plans).sort().slice(-14);
    c.plans = keep.reduce((o, k) => ((o[k] = c.plans[k]), o), {});
    cfg = c;
    persist();
  }

  // ---------- rendering ----------
  function itemById(id) {
    return items.find((i) => i.id === id);
  }

  function render() {
    const iso = todayISO();
    $("#tlDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    renderSetup();

    const wrap = $("#timeline");
    wrap.innerHTML = "";

    if (S().dayIsBlocked(schedule, iso)) {
      wrap.innerHTML = `<p class="empty">Today's marked as a whole-day block — nothing planned into it.</p>`;
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

    const plan = planFor(iso);
    const blocks = S().blocksOn(schedule, iso);

    if (!blocks.length && !plan.slots.length) {
      wrap.innerHTML = `<p class="empty">Nothing to lay out yet. Add your week's shape below, or add tasks on the
        <a href="index.html">main page</a> — this builds itself from both.</p>`;
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

    // One list, in time order: fixed blocks and planned tasks interleaved, so
    // the day reads top to bottom the way it will actually happen.
    const rows = [];
    blocks.forEach((b) => rows.push({ kind: "block", at: S().toMin(b.start), block: b }));
    plan.slots.forEach((s) => {
      const it = itemById(s.itemId);
      if (it && !it.done) rows.push({ kind: "task", at: s.start, slot: s, item: it });
    });
    rows.sort((a, b) => a.at - b.at || (a.kind === "block" ? -1 : 1));

    const list = document.createElement("div");
    list.className = "dp-list";
    let prevEnd = null;
    rows.forEach((r) => {
      const startsAt = r.kind === "block" ? S().toMin(r.block.start) : r.slot.start;
      if (prevEnd !== null && startsAt - prevEnd >= S().normaliseConfig(cfg).minGapMinutes) {
        list.appendChild(freeRow(prevEnd, startsAt));
      }
      list.appendChild(r.kind === "block" ? blockRow(r.block) : taskRow(r.slot, r.item, plan, iso));
      prevEnd = r.kind === "block" ? S().toMin(r.block.end) : r.slot.end;
    });
    wrap.appendChild(list);

    if (plan.flagged && plan.flagged.length) wrap.appendChild(flaggedBox(plan, iso));
    renderAccept(plan, iso);
    renderUnplanned(iso, plan);
  }

  function blockRow(b) {
    const el = document.createElement("div");
    // The solid/dashed difference is the most important thing on this page: a
    // fixed block is a fact, a soft one is the app guessing. If they looked the
    // same the whole plan would stop being trustworthy.
    el.className = "dp-row dp-block" + (b.soft ? " soft" : "");
    el.innerHTML = `
      <div class="dp-time">${escapeHtml(S().fmtSpan(b.start, b.end))}</div>
      <div class="dp-main">
        <div class="dp-title">${escapeHtml(b.label)}</div>
        ${b.soft ? `<div class="dp-guess">the app's guess — not a fixed thing</div>` : ""}
        ${b.about && b.about.length ? `<div class="dp-about">about ${b.about.map(escapeHtml).join(", ")}</div>` : ""}
      </div>`;
    return el;
  }

  function freeRow(from, to) {
    const el = document.createElement("div");
    el.className = "dp-free";
    el.textContent = `${S().durationWords(to - from)} free`;
    return el;
  }

  function taskRow(slot, it, plan, iso) {
    const el = document.createElement("div");
    el.className = "dp-row dp-task" + (slot.pinned ? "" : " soft");
    const est = S().estimateMinutes(it, cfg);
    el.innerHTML = `
      <div class="dp-time">${escapeHtml(S().fmtTime(S().toHM(slot.start)))}</div>
      <div class="dp-main">
        <div class="dp-title">${escapeHtml(it.title)}</div>
        <div class="dp-meta">
          <span class="dp-est${slot.pinned ? "" : " guess"}">${escapeHtml(S().durationWords(est.minutes))}${slot.pinned ? "" : " — a guess"}</span>
          ${slot.why ? `<span class="dp-why">${escapeHtml(slot.why)}</span>` : ""}
        </div>
      </div>
      <div class="dp-actions">
        <button type="button" class="tick" aria-label="Done" title="Done"></button>
        <button type="button" class="link dp-move">move</button>
        <button type="button" class="link dp-remove">not today</button>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => completeFromPlan(it, slot));
    el.querySelector(".dp-remove").addEventListener("click", () => {
      const p = planFor(iso);
      p.dropped = (p.dropped || []).concat([it.id]);
      p.slots = p.slots.filter((s) => s.itemId !== it.id);
      savePlan(iso, p);
      render();
    });
    el.querySelector(".dp-move").addEventListener("click", () => {
      movingId = movingId === it.id ? null : it.id;
      render();
    });
    if (movingId === it.id) el.appendChild(moveBox(it, slot, iso));
    return el;
  }

  function moveBox(it, slot, iso) {
    const box = document.createElement("div");
    box.className = "dp-movebox";
    box.innerHTML = `<label>start at <input type="time" class="dp-newtime" value="${S().toHM(slot.start)}" /></label>
      <button type="button" class="link dp-movesave">move it</button>`;
    box.querySelector(".dp-movesave").addEventListener("click", () => {
      const v = box.querySelector(".dp-newtime").value;
      const mins = S().toMin(v);
      if (mins === null) return;
      // Moving something by hand makes it YOURS — it gets a real time on the
      // task and stops being something the app can shuffle.
      it.time = S().toHM(mins);
      it.date = iso;
      movingId = null;
      const p = planFor(iso);
      p.slots = p.slots.filter((s) => s.itemId !== it.id);
      savePlan(iso, p);
      persist();
      render();
    });
    return box;
  }

  // Ticking something off is the only free measurement the app gets of how long
  // a thing actually took — so it learns from it, quietly, and never asks.
  function completeFromPlan(it, slot) {
    const now = new Date();
    it.done = true;
    it.completedAt = now.toISOString();
    const startedGuess = new Date();
    startedGuess.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0);
    const elapsed = Math.round((now - startedGuess) / 60000);
    // Only believe it if it's plausible: ticked inside the window it was given.
    if (elapsed > 0 && elapsed <= (slot.end - slot.start) * 2) cfg = S().learn(cfg, it, elapsed);
    persist();
    render();
  }

  function flaggedBox(plan, iso) {
    const box = document.createElement("div");
    box.className = "dp-flagged";
    const names = plan.flagged
      .map((f) => itemById(f.itemId))
      .filter((x) => x && !x.done)
      .slice(0, 4);
    if (!names.length) return box;
    box.innerHTML = `<h3>Needs a proper slot</h3>
      <p class="muted">Today hasn't got a long enough stretch for ${names.length === 1 ? "this" : "these"}. Not squeezed in on purpose — it wouldn't have fitted.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    names.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      row.innerHTML = `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link";
      btn.textContent = "find it a day";
      btn.addEventListener("click", () => findADay(it, iso));
      row.appendChild(btn);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  // Look forward for the first day with a stretch long enough, and offer it.
  function findADay(it, fromISO) {
    const c = S().normaliseConfig(cfg);
    const est = S().estimateMinutes(it, c);
    for (let i = 1; i <= 21; i++) {
      const iso = S().isoOf(new Date(new Date(fromISO + "T12:00:00").getTime() + i * 86400000));
      const gap = S().gapsOn(schedule, c, iso).find((g) => g.end - g.start >= est.minutes);
      if (!gap) continue;
      it.date = iso;
      it.time = S().toHM(gap.start);
      persist();
      render();
      setTlStatus(`Moved “${it.title}” to ${S().dayWord(new Date(iso + "T12:00:00"))} at ${S().fmtTime(it.time)} — the first real stretch it fits in. ✓`);
      return;
    }
    setTlStatus(`No day in the next three weeks has a ${S().durationWords(est.minutes)} stretch free. It may want breaking up.`);
  }

  function renderUnplanned(iso, plan) {
    const el = $("#unplanned");
    if (!el) return;
    const planned = new Set((plan && plan.slots ? plan.slots : []).map((s) => s.itemId));
    const left = items.filter((i) => !i.done && i.date === iso && !planned.has(i.id));
    if (!left.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<h2>Also today</h2><p class="muted">Dated today but left out of the plan — the day was full enough.</p>`;
    const list = document.createElement("div");
    list.className = "dp-alsolist";
    left.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dp-alsorow";
      row.textContent = it.title;
      list.appendChild(row);
    });
    el.appendChild(list);
  }

  function renderAccept(plan, iso) {
    const bar = $("#dpAccept");
    if (!bar) return;
    if (!plan) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.innerHTML = "";
    if (plan.accepted) {
      const p = document.createElement("p");
      p.className = "dp-settled";
      p.textContent = "That's the day settled. Move anything you like — nothing's locked.";
      bar.appendChild(p);
      const re = document.createElement("button");
      re.type = "button";
      re.className = "link";
      re.textContent = "rebuild it";
      re.addEventListener("click", () => {
        const c = S().normaliseConfig(cfg);
        delete c.plans[iso];
        cfg = c;
        persist();
        render();
      });
      bar.appendChild(re);
      return;
    }
    const note = document.createElement("p");
    note.className = "dp-note";
    const freeLeft = Math.max(0, (plan.freeTotal || 0) - (plan.used || 0));
    note.textContent = freeLeft
      ? `${S().durationWords(freeLeft)} left deliberately free — days don't survive being packed.`
      : "";
    bar.appendChild(note);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "That's my day";
    btn.addEventListener("click", () => {
      const p = planFor(iso);
      p.acceptedAt = new Date().toISOString();
      savePlan(iso, p);
      render();
      setTlStatus("Settled. ✓");
    });
    bar.appendChild(btn);
  }

  function setTlStatus(msg) {
    const el = $("#tlStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // ---------- the week's shape (a once-a-term job) ----------
  function renderSetup() {
    const panel = $("#setup");
    const toggle = $("#setupToggle");
    if (!panel || !toggle) return;
    const n = S().normalise(schedule).length;
    toggle.textContent = setupOpen ? "close" : n ? `my week (${n} block${n === 1 ? "" : "s"})` : "set up my week";
    panel.hidden = !setupOpen;
    if (!setupOpen) return;

    panel.innerHTML = `
      <p class="muted">Your week's shape. This is a once-a-term job — take your time over it, it's worth getting right.
      Blocks marked <em>fixed</em> are facts and hold reminders back; <em>soft</em> ones are guesses and never silence anything.</p>
      <div class="su-import">
        <label class="su-lab">Paste your timetable — any layout, it gets read into rows you check before saving.</label>
        <textarea id="ttText" rows="4" placeholder="Mon-Fri 08:40-09:00 Registration&#10;Mon 09:00-09:45 P1 Maths 7B&#10;…"></textarea>
        <div class="su-row">
          <button type="button" id="ttRead" class="btn">Read this</button>
          <label class="su-file">or import a calendar file (.ics)
            <input type="file" id="icsFile" accept=".ics,text/calendar" hidden />
          </label>
          <button type="button" id="addBlockBtn" class="link">add one by hand</button>
        </div>
        <p id="ttStatus" class="su-status" hidden></p>
      </div>
      <div id="ttReview"></div>
      <div id="blockAdd"></div>
      <div id="blockList" class="su-list"></div>`;

    $("#ttRead").addEventListener("click", readTimetable);
    $("#icsFile").addEventListener("change", readIcs);
    $("#addBlockBtn").addEventListener("click", () => {
      addingBlock = !addingBlock;
      renderSetup();
    });
    if (addingBlock) $("#blockAdd").appendChild(blockForm());
    if (pastedBlocks) $("#ttReview").appendChild(reviewTable());
    renderBlockList();
  }

  function setSuStatus(msg) {
    const el = $("#ttStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  async function readTimetable() {
    const text = ($("#ttText").value || "").trim();
    if (!text) return;
    setSuStatus("Reading it… this one's allowed to take a moment.");
    try {
      const r = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) {
        setSuStatus(d.message || "Couldn't read that — you can still add blocks by hand.");
        return;
      }
      if (!d.blocks || !d.blocks.length) {
        setSuStatus("Nothing in there looked like a timed block. Try adding one by hand to see the shape.");
        return;
      }
      pastedBlocks = d.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
      setSuStatus("");
      renderSetup();
    } catch {
      setSuStatus("Couldn't reach the reader just now — you can still add blocks by hand.");
    }
  }

  function readIcs(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      const out = OrganiserIcs.parse(fr.result);
      if (!out.blocks.length) {
        setSuStatus("No events found in that file.");
        return;
      }
      pastedBlocks = out.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
      setSuStatus(
        `Read ${out.blocks.length} entr${out.blocks.length === 1 ? "y" : "ies"}.` +
          (out.skipped.length ? ` ${out.skipped.length} couldn't be read and ${out.skipped.length === 1 ? "was" : "were"} left out: ${out.skipped.slice(0, 3).join(", ")}${out.skipped.length > 3 ? "…" : ""}` : "")
      );
      renderSetup();
    };
    fr.onerror = () => setSuStatus("Couldn't read that file.");
    fr.readAsText(file);
    e.target.value = "";
  }

  const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function daysWords(b) {
    if (b.date) return b.date;
    if (!b.days || !b.days.length) return "—";
    if (b.days.length === 5 && [1, 2, 3, 4, 5].every((d) => b.days.includes(d))) return "weekdays";
    return b.days.slice().sort().map((d) => DAY_NAMES[d]).join(" ");
  }

  // NOTHING SAVES UNTIL THIS IS CHECKED. The model read a wall of text; a person
  // reads the result. Every cell is editable and every row can be dropped.
  function reviewTable() {
    const box = document.createElement("div");
    box.className = "su-review";
    box.innerHTML = `<h3>Check these before they're saved</h3>
      <p class="muted">Fix anything that's wrong, untick anything that isn't a real block. Nothing is saved until you press save.</p>`;
    const table = document.createElement("div");
    table.className = "su-table";
    pastedBlocks.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "su-trow" + (b.keep ? "" : " dropped");
      row.innerHTML = `
        <input type="checkbox" class="su-keep" ${b.keep ? "checked" : ""} aria-label="Keep this row" />
        <input type="text" class="su-label" value="${escapeHtml(b.label)}" aria-label="Label" />
        <input type="time" class="su-start" value="${escapeHtml(b.start)}" aria-label="Start" />
        <input type="time" class="su-end" value="${escapeHtml(b.end)}" aria-label="End" />
        <span class="su-days">${escapeHtml(daysWords(b))}</span>`;
      row.querySelector(".su-keep").addEventListener("change", (e) => {
        pastedBlocks[i].keep = e.target.checked;
        row.classList.toggle("dropped", !e.target.checked);
      });
      row.querySelector(".su-label").addEventListener("input", (e) => (pastedBlocks[i].label = e.target.value));
      row.querySelector(".su-start").addEventListener("change", (e) => (pastedBlocks[i].start = e.target.value));
      row.querySelector(".su-end").addEventListener("change", (e) => (pastedBlocks[i].end = e.target.value));
      table.appendChild(row);
    });
    box.appendChild(table);
    const actions = document.createElement("div");
    actions.className = "su-row";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn";
    save.textContent = "Save these blocks";
    save.addEventListener("click", () => {
      const kept = pastedBlocks.filter((b) => b.keep).map((b) => S().normaliseBlock(b)).filter(Boolean);
      schedule = S().normalise(schedule).concat(kept);
      pastedBlocks = null;
      persist();
      renderSetup();
      render();
      setSuStatus(`Saved ${kept.length} block${kept.length === 1 ? "" : "s"}. ✓`);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link";
    cancel.textContent = "throw these away";
    cancel.addEventListener("click", () => {
      pastedBlocks = null;
      renderSetup();
    });
    actions.append(save, cancel);
    box.appendChild(actions);
    return box;
  }

  function blockForm(existing) {
    const b = existing || { label: "", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5], date: "", soft: false, about: [] };
    const form = document.createElement("div");
    form.className = "su-form";
    form.innerHTML = `
      <input type="text" class="bf-label" placeholder="what is it called?" value="${escapeHtml(b.label)}" aria-label="Label" />
      <label>from <input type="time" class="bf-start" value="${escapeHtml(b.start)}" /></label>
      <label>to <input type="time" class="bf-end" value="${escapeHtml(b.end)}" /></label>
      <div class="bf-days">${DAY_LETTERS.map((l, i) => `<label class="bf-day"><input type="checkbox" value="${i}" ${b.days.includes(i) ? "checked" : ""} /><span>${l}</span></label>`).join("")}</div>
      <label class="bf-onedate">or one date only <input type="date" class="bf-date" value="${escapeHtml(b.date || "")}" /></label>
      <label class="bf-soft"><input type="checkbox" class="bf-softbox" ${b.soft ? "checked" : ""} /> this one's a guess, not a fixed thing</label>
      <label class="bf-about">about (ids, comma separated — leave empty unless it's a meeting)
        <input type="text" class="bf-aboutbox" value="${escapeHtml((b.about || []).join(", "))}" /></label>
      <div class="su-row">
        <button type="button" class="btn bf-save">${existing ? "Save changes" : "Add this block"}</button>
        <button type="button" class="link bf-cancel">cancel</button>
      </div>`;
    form.querySelector(".bf-cancel").addEventListener("click", () => {
      addingBlock = false;
      editingBlockId = null;
      renderSetup();
    });
    form.querySelector(".bf-save").addEventListener("click", () => {
      const days = [...form.querySelectorAll(".bf-days input:checked")].map((x) => Number(x.value));
      const made = S().normaliseBlock({
        id: existing ? existing.id : uid(),
        label: form.querySelector(".bf-label").value,
        start: form.querySelector(".bf-start").value,
        end: form.querySelector(".bf-end").value,
        days,
        date: form.querySelector(".bf-date").value,
        soft: form.querySelector(".bf-softbox").checked,
        about: form.querySelector(".bf-aboutbox").value.split(",").map((s) => s.trim()).filter(Boolean),
        source: "hand",
      });
      if (!made) {
        setSuStatus("That needs a name, a start and an end — and at least one day (or a date).");
        return;
      }
      schedule = S().normalise(schedule).filter((x) => x.id !== made.id).concat([made]);
      addingBlock = false;
      editingBlockId = null;
      persist();
      renderSetup();
      render();
      setSuStatus("Saved. ✓");
    });
    return form;
  }

  let editingBlockId = null;
  function renderBlockList() {
    const el = $("#blockList");
    if (!el) return;
    const list = S().normalise(schedule).sort((a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || S().toMin(a.start) - S().toMin(b.start));
    el.innerHTML = "";
    if (!list.length) {
      el.innerHTML = `<p class="empty">No blocks yet.</p>`;
      return;
    }
    list.forEach((b) => {
      if (editingBlockId === b.id) {
        el.appendChild(blockForm(b));
        return;
      }
      const row = document.createElement("div");
      row.className = "su-brow" + (b.soft ? " soft" : "");
      row.innerHTML = `
        <span class="su-bwhen">${escapeHtml(daysWords(b))} ${escapeHtml(S().fmtSpan(b.start, b.end))}</span>
        <span class="su-blabel">${escapeHtml(b.label)}${b.soft ? ' <span class="su-softtag">guess</span>' : ""}</span>`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "link";
      edit.textContent = "edit";
      edit.addEventListener("click", () => {
        editingBlockId = b.id;
        renderSetup();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "link";
      del.textContent = "remove";
      del.addEventListener("click", () => {
        const kept = S().normalise(schedule).filter((x) => x.id !== b.id);
        const gone = b;
        schedule = kept;
        persist();
        renderSetup();
        render();
        setSuStatus(`Removed “${gone.label}”.`);
      });
      row.append(edit, del);
      el.appendChild(row);
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];
    goals = data.goals || [];
    schedule = data.schedule || [];
    cfg = data.scheduleConfig || null;
    $("#setupToggle").addEventListener("click", () => {
      setupOpen = !setupOpen;
      renderSetup();
    });
    OrganiserStore.onExternalChange((state) => {
      items = state.items || items;
      schedule = state.schedule || schedule;
      cfg = state.scheduleConfig || cfg;
      render();
    });
    render();
  }

  init();
})();
