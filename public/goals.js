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

  function persist() {
    OrganiserStore.save({ goals });
  }

  // ----- model helpers -----
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
    goals = Array.isArray(data.goals) ? data.goals : [];
    items = Array.isArray(data.items) ? data.items : []; // shared pool, for tasks-under-goal
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
