// Goals & milestones.
//
// A goal you name in a sentence → milestones → a bar that fills toward the
// NEXT milestone (never the whole goal). Tick a milestone's steps; when they're
// all done the milestone auto-completes and a small, upside-only celebration
// fires (with a one-tap "not done yet" undo).
//
// This is the BY-GOAL view of one shared pool (§s26): a goal also shows the
// daily tasks you've linked to it ("part of:"), tickable right here. It saves
// only the half it changed (goals, or items) via the merge-save, so the two
// views can't wipe each other.
//
// Plain script (works under file://). Reads/writes through OrganiserStore.

(() => {
  "use strict";

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let goals = [];
  let items = []; // the shared pool: tasks linked to a goal show under it here
  let celebrateTimer = null;
  let schedule = [];
  let scheduleConfig = null;
  let pendingPlan = null; // a pasted plan, read but not yet accepted
  let aiAvailable = false; // can the app propose milestones? (off in preview / no AI)
  const busyGoals = new Set(); // goals the AI is breaking down right now (transient)

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  const todayISO = () =>
    window.OrganiserSchedule ? OrganiserSchedule.isoOf(new Date()) : new Date().toISOString().slice(0, 10);

  function persist() {
    OrganiserStore.save({ goals });
  }

  // ----- model helpers -----
  //
  // EVERY GOAL HAS A LIST, even when the file says otherwise. Ten places in
  // here read goal.milestones and milestone.steps without checking, which is
  // fine while this page is the only thing that ever wrote them — and stops
  // being fine the moment a goal arrives from a hand-edited file, an older
  // version, or a half-finished import. One missing array then throws during
  // init and takes the whole page with it, rather than one goal. The home page
  // already guards the same field; this makes the two agree.
  function shaped(list) {
    return (Array.isArray(list) ? list : []).filter(Boolean).map((g) => ({
      ...g,
      milestones: (Array.isArray(g.milestones) ? g.milestones : []).filter(Boolean).map((m) => ({
        ...m,
        steps: Array.isArray(m.steps) ? m.steps.filter(Boolean) : [],
      })),
    }));
  }

  function currentIndex(goal) {
    return goal.milestones.findIndex((m) => !m.done);
  }
  function progress(ms) {
    const total = ms.steps.length;
    const done = ms.steps.filter((s) => s.done).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  // Returns "milestone" | "goal" | null if a completion just happened.
  function recompute(goal, ms) {
    const allDone = ms.steps.length > 0 && ms.steps.every((s) => s.done);
    let ev = null;
    if (allDone && !ms.done) {
      ms.done = true;
      ms.completedAt = now();
      ev = "milestone";
    } else if (!allDone && ms.done) {
      ms.done = false;
      ms.completedAt = null;
    }
    if (ev === "milestone" && goal.milestones.length && goal.milestones.every((m) => m.done)) ev = "goal";
    return ev;
  }

  // ----- mutations -----
  function addGoal(title) {
    title = (title || "").trim();
    if (!title) return;
    const goal = { id: uid(), title, createdAt: now(), milestones: [] };
    goals.unshift(goal);
    persist();
    render();
    if (aiAvailable) proposeMilestones(goal);
  }

  // §9 slice 2: the AI carves a freshly-named goal into small milestones — the
  // usable way in (manual add was only scaffolding). Best-effort: if the AI is
  // off or unreachable the goal just stays empty for hand-entry, and we never
  // clobber milestones the user started adding while the AI was thinking.
  async function proposeMilestones(goal) {
    busyGoals.add(goal.id);
    render();
    try {
      // Granularity signal: how big the user keeps their existing goals (§9 — the
      // AI learns preferred milestone size from what they keep after editing).
      const priorCounts = goals
        .filter((g) => g.id !== goal.id && g.milestones.length)
        .map((g) => g.milestones.length);
      const r = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: goal.title, priorCounts }),
      });
      if (r.ok) {
        const d = await r.json();
        const ms = (Array.isArray(d.milestones) ? d.milestones : []).map((m) => ({
          id: uid(),
          title: m.title,
          done: false,
          completedAt: null,
          steps: (Array.isArray(m.steps) ? m.steps : []).map((s) => ({
            id: uid(),
            title: s,
            done: false,
            completedAt: null,
          })),
        }));
        if (ms.length && goal.milestones.length === 0) {
          goal.milestones = ms;
          persist();
        }
      }
    } catch {
      /* unreachable — leave it empty, hand-entry still works */
    } finally {
      busyGoals.delete(goal.id);
      render();
    }
  }
  function deleteGoal(id) {
    if (!confirm("Delete this whole goal and its milestones?")) return;
    goals = goals.filter((g) => g.id !== id);
    persist();
    render();
  }
  function addMilestone(goal, title) {
    title = (title || "").trim();
    if (!title) return;
    goal.milestones.push({ id: uid(), title, done: false, completedAt: null, steps: [] });
    persist();
    render();
  }
  function deleteMilestone(goal, mId) {
    goal.milestones = goal.milestones.filter((m) => m.id !== mId);
    persist();
    render();
  }
  function addStep(goal, ms, title) {
    title = (title || "").trim();
    if (!title) return;
    ms.steps.push({ id: uid(), title, done: false, completedAt: null });
    recompute(goal, ms); // adding an undone step can reopen a milestone
    persist();
    render();
  }
  function deleteStep(goal, ms, stepId) {
    ms.steps = ms.steps.filter((s) => s.id !== stepId);
    const ev = recompute(goal, ms); // deleting the last undone step can complete it
    persist();
    render();
    if (ev) celebrate(ev, ev === "goal" ? goal.title : ms.title, { goalId: goal.id, msId: ms.id });
  }
  function toggleStep(goal, ms, step) {
    step.done = !step.done;
    step.completedAt = step.done ? now() : null;
    const ev = recompute(goal, ms);
    persist();
    render();
    if (ev) celebrate(ev, ev === "goal" ? goal.title : ms.title, { goalId: goal.id, msId: ms.id, stepId: step.id });
  }
  function setTitle(obj, value) {
    obj.title = value;
    persist(); // no re-render: don't yank focus mid-type
  }
  // Linked daily tasks live in the items pool; completing one here saves { items }
  // (the merge-save keeps goals intact). done = gone from active, kept in Looking back.
  function completeItem(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = now();
    OrganiserStore.save({ items });
    render();
  }
  function goalTasks(goalId) {
    return items.filter((i) => !i.done && i.goalId === goalId);
  }

  // ----- celebration (visual, upside-only, scaled, with undo) -----
  function celebrate(kind, title, ref) {
    const el = $("#celebrate");
    el.className = "celebrate " + kind;
    el.hidden = false;
    const msg =
      kind === "goal"
        ? `Goal complete — ${escapeHtml(title)}! Every milestone done. 🎉`
        : `Milestone done — ${escapeHtml(title)} 🎉`;
    el.innerHTML = `<span class="celebrate-msg">${msg}</span>
      <button class="celebrate-undo" type="button">not done yet</button>`;
    el.querySelector(".celebrate-undo").addEventListener("click", () => undoCompletion(ref));
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      el.hidden = true;
    }, 6000);
  }
  function undoCompletion(ref) {
    const goal = goals.find((g) => g.id === ref.goalId);
    if (!goal) return;
    const ms = goal.milestones.find((m) => m.id === ref.msId);
    if (!ms) return;
    // un-tick the step that triggered it (or the most recently completed one)
    let step = ref.stepId && ms.steps.find((s) => s.id === ref.stepId);
    if (!step) {
      step = ms.steps.filter((s) => s.done).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
    }
    if (step) {
      step.done = false;
      step.completedAt = null;
    }
    if (ms.done) {
      ms.done = false;
      ms.completedAt = null;
    }
    $("#celebrate").hidden = true;
    persist();
    render();
  }

  // ----- render -----
  function stepRow(goal, ms, step) {
    const row = document.createElement("div");
    row.className = "step";
    const tick = document.createElement("button");
    tick.className = "tick";
    tick.setAttribute("aria-label", "Mark step done");
    tick.title = "Mark done";
    tick.addEventListener("click", () => toggleStep(goal, ms, step));
    const input = document.createElement("input");
    input.className = "step-title";
    input.value = step.title;
    input.setAttribute("aria-label", "Step");
    input.addEventListener("change", (e) => setTitle(step, e.target.value));
    const del = document.createElement("button");
    del.className = "x-del";
    del.type = "button";
    del.title = "Remove step";
    del.textContent = "×";
    del.addEventListener("click", () => deleteStep(goal, ms, step.id));
    row.append(tick, input, del);
    return row;
  }

  function addLine(placeholder, onAdd) {
    const wrap = document.createElement("div");
    wrap.className = "add-line";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        onAdd(input.value);
        input.value = "";
      }
    });
    wrap.appendChild(input);
    return wrap;
  }

  function titleInput(obj, className, aria) {
    const input = document.createElement("input");
    input.className = className;
    input.value = obj.title;
    input.setAttribute("aria-label", aria);
    input.addEventListener("change", (e) => setTitle(obj, e.target.value));
    return input;
  }

  function shortDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  // A daily task that's linked to this goal — shown here, tickable, but it lives
  // in the shared items pool (the same task also appears in Today).
  function taskRow(it) {
    const row = document.createElement("div");
    row.className = "gt-row";
    const tick = document.createElement("button");
    tick.className = "tick";
    tick.setAttribute("aria-label", "Mark done");
    tick.title = "Mark done";
    tick.addEventListener("click", () => completeItem(it.id));
    const main = document.createElement("div");
    main.className = "gt-main";
    const dt = shortDate(it.date);
    main.innerHTML = `<span class="gt-title">${escapeHtml(it.title)}</span><span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>${dt ? `<span class="gt-when">${escapeHtml(dt)}</span>` : ""}`;
    row.append(tick, main);
    return row;
  }

  // THE WHOLE THING, AND WHETHER THE SUMS STILL WORK.
  //
  // The milestone bar below this one is deliberately short-range: the next small
  // finish, so there's always something reachable. This one answers the other
  // question — how much of the whole is actually done, how long is left, and
  // what that now works out at per day. That number climbing is the earliest
  // honest sign something is turning into a rush, and it's far better to see it
  // four weeks out than on the morning.
  //
  // Measured in MINUTES, not things ticked: ten small jobs done and one big one
  // untouched is not ninety per cent, and a bar that says it is would be lying
  // at exactly the moment it matters most.
  function overallBar(goal) {
    const wrap = document.createElement("div");
    wrap.className = "g-overall";
    const GP = window.OrganiserGoalPlan;
    if (!GP) return wrap;
    const r = GP.rate(goal, items, schedule, scheduleConfig, todayISO());
    // A GOAL WITH NOTHING BEHIND IT. Typing one on Home makes the goal and
    // nothing else — no pieces, no sizes, so the day plan never mentions it and
    // there is nothing to measure. That's fine as a first step, but the app used
    // to show literally nothing here, which reads as "all in hand" when it means
    // "not started". Say what's missing, and point at the way to fix it.
    if (!r.total) {
      wrap.innerHTML =
        `<p class="g-rate">Nothing behind this one yet, so there's nothing to plan or keep score of. ` +
        `Break it into pieces below — or ask something better at planning than this app, and paste the answer in at the top.</p>`;
      return wrap;
    }

    const pct = Math.round(r.fraction * 100);
    wrap.innerHTML =
      `<div class="g-bar" role="img" aria-label="${pct}% of the work done">` +
      `<span style="width:${pct}%"></span></div>` +
      `<p class="g-rate">${escapeHtml(GP.words(r))}</p>`;
    if (r.deadline && r.verdict === "more than the days can hold") wrap.classList.add("stretched");
    return wrap;
  }

  // ---- taking a plan someone else wrote ------------------------------------
  //
  // READ IT, SHOW IT, THEN ASK. Never straight in: a paste is the one moment
  // where a misread heading could quietly bury a step, so the whole thing is
  // laid out first — every section, every step, every time it read — and only
  // then does anything get made. Same rule as the check-back on Home.
  function readPastedPlan() {
    const box = $("#pasteText");
    const out = $("#pastePreview");
    if (!box || !out) return;
    const PP = window.OrganiserPlanPaste;
    if (!PP) return;
    const plan = PP.parse(box.value, { today: todayISO() });
    pendingPlan = plan;
    if (!plan.milestones.length) {
      out.hidden = false;
      out.innerHTML = `<p class="muted">Couldn't find any steps in that. Bullet points or numbered lines work best — but honestly, anything with one job per line should do it.</p>`;
      return;
    }
    const S = window.OrganiserSchedule;
    const mins = PP.totalMinutes(plan);
    const steps = PP.stepCount(plan);
    const sized = PP.sized(plan);
    out.hidden = false;
    out.innerHTML =
      `<h3>${escapeHtml(plan.title || "Untitled plan")}</h3>` +
      `<p class="muted">${plan.milestones.length} section${plan.milestones.length === 1 ? "" : "s"}, ` +
      `${steps} step${steps === 1 ? "" : "s"}` +
      (plan.date ? ` · due ${escapeHtml(OrganiserDates.dayWords(plan.date))}` : " · no deadline found") +
      (mins ? ` · ${escapeHtml(S ? S.durationWords(mins) : mins + " min")} in total` : "") +
      (sized < steps ? ` · ${steps - sized} with no time given, so the app will guess those` : "") +
      `</p>` +
      plan.milestones
        .map(
          (m) =>
            `<div class="pp-ms"><strong>${escapeHtml(m.title)}</strong>` +
            m.steps
              .map((st) => `<div class="pp-step">${escapeHtml(st.title)}` +
                `<span class="pp-mins">${st.minutes ? escapeHtml(S ? S.durationWords(st.minutes) : st.minutes + " min") : "a guess"}</span></div>`)
              .join("") +
            `</div>`
        )
        .join("");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn";
    go.textContent = "make this a goal";
    go.addEventListener("click", acceptPastedPlan);
    out.appendChild(go);
  }

  function acceptPastedPlan() {
    const plan = pendingPlan;
    if (!plan || !plan.milestones.length) return;
    const GP = window.OrganiserGoalPlan;
    const goal = {
      id: uid(),
      title: plan.title || "Pasted plan",
      date: plan.date || "",
      createdAt: now(),
      milestones: plan.milestones.map((m) => ({
        id: uid(), title: m.title, done: false, completedAt: null,
        steps: m.steps.map((st) => ({ id: uid(), title: st.title, done: false, completedAt: null })),
      })),
    };
    goals.unshift(goal);
    // AND the part that makes it real: each step becomes a piece of work the
    // day plan and the week spreader can actually see. The milestone list above
    // is for looking at; these are for doing.
    if (GP) {
      plan.milestones.forEach((m) =>
        m.steps.forEach((st) => items.push({ ...GP.taskFromStep(goal, st, scheduleConfig), id: uid(), createdAt: now() })));
    }
    OrganiserStore.save({ goals, items });
    pendingPlan = null;
    const box = $("#pasteText");
    if (box) box.value = "";
    const pb = $("#pasteBox");
    if (pb) pb.hidden = true;
    const pv = $("#pastePreview");
    if (pv) { pv.hidden = true; pv.innerHTML = ""; }
    render();
  }

  function renderGoal(goal) {
    const card = document.createElement("section");
    card.className = "goal-card";

    const head = document.createElement("div");
    head.className = "g-head";
    head.appendChild(titleInput(goal, "g-title", "Goal name"));
    const gdel = document.createElement("button");
    gdel.className = "x-del";
    gdel.type = "button";
    gdel.title = "Delete goal";
    gdel.textContent = "×";
    gdel.addEventListener("click", () => deleteGoal(goal.id));
    head.appendChild(gdel);
    card.appendChild(head);

    card.appendChild(overallBar(goal));

    const ci = currentIndex(goal);

    if (goal.milestones.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = busyGoals.has(goal.id)
        ? "Thinking up small milestones…"
        : "Add the first milestone — a small finish you'd be glad to reach.";
      card.appendChild(p);
    } else if (ci === -1) {
      const done = document.createElement("p");
      done.className = "goal-done";
      done.textContent = "✓ Goal complete — every milestone done.";
      card.appendChild(done);
    }

    goal.milestones.forEach((ms, idx) => {
      if (ms.done) {
        const row = document.createElement("div");
        row.className = "ms done";
        row.innerHTML = `<span class="ms-mark">✓</span><span class="ms-done-title">${escapeHtml(ms.title)}</span>`;
        card.appendChild(row);
        return;
      }
      if (idx === ci) {
        // the current milestone — the focus: title, bar, its steps, add-step
        const block = document.createElement("div");
        block.className = "ms current";
        const mhead = document.createElement("div");
        mhead.className = "ms-head";
        mhead.innerHTML = `<span class="ms-mark">●</span>`;
        mhead.appendChild(titleInput(ms, "ms-title", "Milestone name"));
        const mdel = document.createElement("button");
        mdel.className = "x-del";
        mdel.type = "button";
        mdel.title = "Remove milestone";
        mdel.textContent = "×";
        mdel.addEventListener("click", () => deleteMilestone(goal, ms.id));
        mhead.appendChild(mdel);
        block.appendChild(mhead);

        const pr = progress(ms);
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.innerHTML = `<div class="bar-fill" style="width:${pr.pct}%"></div>`;
        block.appendChild(bar);
        const label = document.createElement("div");
        label.className = "bar-label";
        label.textContent = pr.total ? `${pr.done} of ${pr.total} steps` : "no steps yet";
        block.appendChild(label);

        const steps = document.createElement("div");
        steps.className = "steps";
        ms.steps.filter((s) => !s.done).forEach((s) => steps.appendChild(stepRow(goal, ms, s)));
        block.appendChild(steps);
        block.appendChild(addLine("+ add a step", (v) => addStep(goal, ms, v)));
        card.appendChild(block);
        return;
      }
      // upcoming milestone — just a queued title
      const row = document.createElement("div");
      row.className = "ms upcoming";
      row.innerHTML = `<span class="ms-mark">○</span>`;
      row.appendChild(titleInput(ms, "ms-title", "Milestone name"));
      const mdel = document.createElement("button");
      mdel.className = "x-del";
      mdel.type = "button";
      mdel.title = "Remove milestone";
      mdel.textContent = "×";
      mdel.addEventListener("click", () => deleteMilestone(goal, ms.id));
      row.appendChild(mdel);
      card.appendChild(row);
    });

    card.appendChild(addLine("+ add a milestone", (v) => addMilestone(goal, v)));

    // The shared pool, by-goal: daily tasks you've linked to this goal show here too.
    const linked = goalTasks(goal.id);
    if (linked.length) {
      const h = document.createElement("p");
      h.className = "goal-tasks-title";
      h.textContent = "Tasks linked here";
      card.appendChild(h);
      const wrap = document.createElement("div");
      wrap.className = "goal-tasks";
      linked.forEach((it) => wrap.appendChild(taskRow(it)));
      card.appendChild(wrap);
    }

    return card;
  }

  function render() {
    const list = $("#goalsList");
    list.innerHTML = "";
    if (!goals.length) {
      list.innerHTML = `<p class="empty">No goals yet. Name one above — just a few words.</p>`;
      return;
    }
    goals.forEach((g) => list.appendChild(renderGoal(g)));
  }

  async function init() {
    const data = await OrganiserStore.load();
    goals = shaped(data.goals);
    items = Array.isArray(data.items) ? data.items : []; // shared pool, for tasks-under-goal
    schedule = Array.isArray(data.schedule) ? data.schedule : [];
    scheduleConfig = data.scheduleConfig || null;
    const pt = $("#pasteToggle"), pbx = $("#pasteBox");
    if (pt && pbx) pt.addEventListener("click", () => { pbx.hidden = !pbx.hidden; });
    const pr = $("#pasteRead");
    if (pr) pr.addEventListener("click", readPastedPlan);
    const pc = $("#pasteCancel");
    if (pc) pc.addEventListener("click", () => {
      pendingPlan = null;
      if (pbx) pbx.hidden = true;
      const pv = $("#pastePreview");
      if (pv) { pv.hidden = true; pv.innerHTML = ""; }
    });

    // Find out if the AI can propose milestones, and wake it so the first goal
    // isn't slow. Silent + best-effort; preview mode (file://) has no server.
    if (OrganiserStore.mode === "file") {
      try {
        const r = await fetch("/api/health");
        const j = await r.json();
        aiAvailable = !!j.hasAI;
        if (aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
      } catch {
        aiAvailable = false;
      }
    }
    $("#goalAddBtn").addEventListener("click", () => {
      const input = $("#goalInput");
      addGoal(input.value);
      input.value = "";
    });
    $("#goalInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addGoal(e.target.value);
        e.target.value = "";
      }
    });
    render();
  }

  init();
})();
