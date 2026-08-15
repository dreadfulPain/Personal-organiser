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
  let unreadableRows = []; // rows it couldn't make sense of — shown, never dropped
  let addingBlock = false;
  let movingId = null; // which planned task is having its slot changed
  let worked = {}; // minutes really put in, per day — see weekend.js

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const todayISO = () => S().isoOf(new Date());

  function persist() {
    OrganiserStore.save({ items, waiting, schedule, scheduleConfig: cfg, worked });
  }

  // Make the tasks a block owes, and let go of the ones whose moment has passed.
  // Idempotent: keyed to block+date, so running it on every open can't double up.
  function syncPrep() {
    const { add, drop } = S().prepPlan(schedule, cfg, items, new Date());
    if (!add.length && !drop.length) return false;
    const gone = new Set(drop.map((d) => d.id));
    items = items.filter((i) => !gone.has(i.id));
    add.forEach((t) => items.push({ ...t, id: uid(), createdAt: new Date().toISOString() }));
    persist();
    return true;
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

  // The planner itself lives in dayplan.js so it can be driven and tested
  // without a browser — this page just supplies the data and shows the result.
  function buildPlan(iso, previous, notBefore) {
    return window.OrganiserDayPlan.build(items, schedule, cfg, iso, { previous, notBefore, ctx: ctx() });
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


  // MINUTES ACTUALLY WORKED, AGAINST THE DAY THEY HAPPENED ON.
  //
  // Everything else the app knows is about intention — what was planned, what's
  // due. This is the only record of what really went in and WHEN, which is the
  // only way to tell a Sunday you chose from a Sunday that just filled up. See
  // weekend.js: it's the difference the app exists to help you notice.
  function logWorked(it, minutes) {
    const W = window.OrganiserWeekend;
    if (!W || !(minutes >= 1)) return;
    const c = S().normaliseConfig(cfg);
    worked = W.record(worked, todayISO(), minutes, (it && it.area) || "");
    cfg = c;
  }

  // ---------- when the day is taken away from you ----------
  //
  // A meeting appears. A child needs you. The plan you accepted this morning is
  // now fiction, and the worst thing an organiser can do at that moment is
  // nothing — you come back at two o'clock to a day that still claims you were
  // going to do all of it, and every single item silently becomes a small
  // failure.
  //
  // So: say it's happening, and the app steps back completely — no plan, no
  // pings. Say you're back, and it works out what's actually left and rebuilds
  // around it. What can't fit today is MOVED, not marked missed: the time went
  // somewhere real and the app knows where, because you told it.
  // itemId/slotStart: what was in your hands when it happened. Without them the
  // app knows the day stopped but not what it stopped in the middle of, so the
  // minutes already put into that job are lost — see partWayThrough.
  function startAway(label, itemId, slotStart) {
    const c = S().normaliseConfig(cfg);
    c.away = {
      label: (label || "").trim().slice(0, 80),
      startedAt: new Date().toISOString(),
      itemId: itemId || "",
      slotStart: Number.isFinite(slotStart) ? slotStart : null,
    };
    cfg = c;
    persist();
    render();
  }

  function comeBack() {
    const c = S().normaliseConfig(cfg);
    if (!c.away) return;
    const started = new Date(c.away.startedAt);
    const now = new Date();
    const iso = todayISO();
    const mins = S().awayMinutes(c, now);

    // Write down what actually happened. Not an estimate — the real span, kept
    // as a block, so the day is an honest record and tomorrow's planning knows
    // this time was genuinely gone.
    if (mins >= 2 && S().isoOf(started) === iso) {
      const b = S().normaliseBlock({
        label: c.away.label || "Something came up",
        start: S().toHM(started.getHours() * 60 + started.getMinutes()),
        end: S().toHM(Math.min(now.getHours() * 60 + now.getMinutes(), 24 * 60 - 1)),
        date: iso,
        source: "interruption",
      });
      if (b) schedule = S().normalise(schedule).concat([b]);
    }

    // WHATEVER YOU HAD IN YOUR HANDS. The minutes you'd put into it before the
    // door went are kept, so the job comes back smaller rather than starting
    // from nothing — the same reasoning as "got part way", except you shouldn't
    // have to remember to press anything while a child is crying at you.
    const paused = c.away.itemId ? items.find((i) => i.id === c.away.itemId) : null;
    let banked = 0;
    if (paused && !paused.done) {
      const plan = c.plans[iso] || {};
      const from = Math.max(
        Number.isFinite(c.away.slotStart) ? c.away.slotStart : 0,
        Number.isFinite(plan.lastTickMin) ? plan.lastTickMin : 0
      );
      const to = started.getHours() * 60 + started.getMinutes();
      banked = S().workingMinutesBetween(schedule, iso, from, to);
      if (banked >= 1) {
        paused.spentMinutes = Math.round(Number(paused.spentMinutes) || 0) + banked;
        logWorked(paused, banked);
      }
    }

    // What the day USED to say, so the rebuild can name what moved.
    const before = (c.plans[iso] && c.plans[iso].slots ? c.plans[iso].slots : []).map((s2) => s2.itemId);
    c.away = null;
    delete c.plans[iso]; // the old plan described a day that didn't happen
    cfg = c;

    const nowMins = now.getHours() * 60 + now.getMinutes();
    const rebuilt = buildPlan(iso, null, nowMins);
    rebuilt.rebuiltAt = now.toISOString();
    rebuilt.awayMinutes = mins;
    const nowIn = new Set(rebuilt.slots.map((s2) => s2.itemId));
    rebuilt.displaced = before.filter((id) => !nowIn.has(id) && !(items.find((i) => i.id === id) || {}).done);
    savePlan(iso, rebuilt);
    persist();
    render();
    setTlStatus(
      `Back after ${S().durationWords(mins)}.${
        banked >= 1 ? ` The ${S().durationWords(banked)} you'd put into “${paused.title}” is kept.` : ""
      } ${
        rebuilt.displaced.length
          ? `${rebuilt.displaced.length} thing${rebuilt.displaced.length === 1 ? "" : "s"} didn't fit what's left — ${rebuilt.displaced.length === 1 ? "it's" : "they're"} below.`
          : "Everything still fits."
      }`
    );
    // What happened, and whether it started something. Offered, never demanded:
    // ignore it and it's gone on the next render.
    if (paused || mins >= 5) offerFollowUp({ title: label || "what came up" }, "did anything come out of that?");
  }

  function renderAway() {
    const c = S().normaliseConfig(cfg);
    const bar = $("#awayBar");
    if (!bar) return false;
    if (!c.away) {
      bar.className = "away-bar";
      bar.hidden = false;
      bar.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link away-start";
      btn.textContent = "something's come up";
      btn.addEventListener("click", () => {
        bar.innerHTML = "";
        const form = document.createElement("div");
        form.className = "away-form";
        form.innerHTML = `<input type="text" class="away-what" placeholder="what is it? (optional)" aria-label="What's come up" />`;
        const go = document.createElement("button");
        go.type = "button";
        go.className = "btn";
        go.textContent = "I'm on it";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "link";
        cancel.textContent = "never mind";
        const input = form.querySelector(".away-what");
        go.addEventListener("click", () => startAway(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") startAway(input.value);
        });
        cancel.addEventListener("click", renderAway);
        form.append(go, cancel);
        bar.appendChild(form);
        setTimeout(() => input.focus(), 0);
      });
      bar.append(btn);
      return false;
    }

    // Away: the plan is deliberately gone from the screen. Looking at a list of
    // things you can't do, while dealing with something you must, is the exact
    // pressure this app exists to take off you.
    const since = new Date(c.away.startedAt);
    bar.className = "away-bar active";
    bar.hidden = false;
    bar.innerHTML = `
      <div class="away-main">
        <strong>${escapeHtml(c.away.label || "Something came up")}</strong>
        <span class="away-since">since ${escapeHtml(S().fmtTime(S().toHM(since.getHours() * 60 + since.getMinutes())))} · ${escapeHtml(S().durationWords(S().awayMinutes(c, new Date())))}</span>
        <span class="away-calm">Your day's on hold and nothing will ping you. Come back when you're done.</span>
      </div>`;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "I'm back";
    back.addEventListener("click", comeBack);
    bar.appendChild(back);
    return true;
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

    if (renderAway()) {
      // Nothing else on the page while you're in it. Come back and it rebuilds.
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

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

    const heads = troubleBox(iso);
    if (heads) wrap.appendChild(heads);
    if (plan.displaced && plan.displaced.length) wrap.appendChild(displacedBox(plan, iso));
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
    // Says it plainly and describes rather than judges: the job has been on the
    // plan and not got done, which is a fact about the job's size, not about you.
    const again = window.OrganiserDayPlan.carriedOver(cfg, it.id, iso);
    el.innerHTML = `
      <div class="dp-time">${escapeHtml(S().fmtTime(S().toHM(slot.start)))}</div>
      <div class="dp-main">
        <div class="dp-title">${escapeHtml(it.title)}</div>
        <div class="dp-meta">
          <span class="dp-est${slot.pinned ? "" : " guess"}">${escapeHtml(S().durationWords(est.minutes))}${est.spent ? " left" : ""}${slot.pinned ? "" : " — a guess"}</span>
          ${est.spent ? `<span class="dp-sofar">${escapeHtml(S().durationWords(est.spent))} already in</span>` : ""}
          ${slot.why ? `<span class="dp-why">${escapeHtml(slot.why)}</span>` : ""}
          ${again >= 2 ? `<span class="dp-again">on the plan ${again} days running — it may want a proper slot, or breaking up</span>` : ""}
        </div>
      </div>
      <div class="dp-actions">
        <button type="button" class="tick" aria-label="Done" title="Done"></button>
        <button type="button" class="link dp-part">got part way</button>
        <button type="button" class="link dp-stop">something's come up</button>
        <button type="button" class="link dp-move">move</button>
        <button type="button" class="link dp-remove">not today</button>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => completeFromPlan(it, slot));
    el.querySelector(".dp-part").addEventListener("click", () => partWayThrough(it, slot));
    // THE INTERRUPTION BUTTON, on the thing you were actually doing. One tap
    // when the door goes: the day goes quiet, and the minutes already in this
    // job are held rather than lost. Say what it was when you come back.
    el.querySelector(".dp-stop").addEventListener("click", () => startAway("", it.id, slot.start));
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
  //
  // WHEN DID IT ACTUALLY START? There's no start button on purpose: one more
  // thing to remember is one more thing to fail at. But the app does know when
  // you last ticked something off, and you cannot have begun this one before
  // that. So the start is the LATER of "when the plan said" and "when you
  // finished the last thing". On a day running two hours late those are wildly
  // different numbers, and using the plan's was the whole problem.
  //
  // WHY THAT MATTERED. The old guard accepted anything up to twice the slot and
  // threw the rest away. That is not a filter, it's a sieve with a bias: an
  // overrun gets discarded, an underrun always counts. Measured over a
  // simulated month, work that really averaged 89 minutes taught the app 51,
  // and its idea of "draining" fell from 75 minutes to 57 — so it packed more
  // in, so more overran, so more got thrown away. The app was teaching itself
  // that your work is quicker than it is BECAUSE it kept running over.
  //
  // Now the measurement is honest, so the guard only has to catch the absurd —
  // something ticked hours after it was really finished. Wide, and applied the
  // same to a fast day as a slow one.
  function completeFromPlan(it, slot) {
    const now = new Date();
    const iso = todayISO();
    const p = planFor(iso);
    it.done = true;
    it.completedAt = now.toISOString();

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const lastTick = Number.isFinite(p.lastTickMin) ? p.lastTickMin : -1;
    const began = Math.max(slot.start, lastTick);
    // Wall clock minus the lessons in between — the app knows the timetable, so
    // a lesson that happened mid-job is not counted as part of the job.
    const elapsed = S().workingMinutesBetween(schedule, iso, began, nowMin);
    // What the job cost ALTOGETHER, including the sittings before today —
    // otherwise a three-hour job done over three days teaches the app it takes
    // an hour, which is how the estimates drifted down in the first place.
    const est = S().estimateMinutes(it, cfg);
    const total = elapsed + (Math.round(Number(it.spentMinutes) || 0));
    if (total >= 1 && total <= Math.max(4 * est.full, 120)) cfg = S().learn(cfg, it, total);
    logWorked(it, elapsed);

    p.lastTickMin = nowMin;
    savePlan(iso, p);
    persist();
    render();
    offerFollowUp(it);
  }

  // GOT PART WAY. The middle state the app had no word for.
  //
  // A job you got half through isn't done and isn't untouched. With nowhere to
  // put that, the minutes vanished: the plan asked for the whole thing again
  // tomorrow. Over a test month that was four and a half hours of real work
  // thrown away — and a pile of marking bigger than one day's free time could
  // never be finished at all, forty hours at the desk over ten days with
  // nothing to show, because every morning it started again from nothing.
  //
  // Costs one tap, and only when you want it. Nothing is ever assumed.
  function partWayThrough(it, slot) {
    const now = new Date();
    const iso = todayISO();
    const p = planFor(iso);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const lastTick = Number.isFinite(p.lastTickMin) ? p.lastTickMin : -1;
    const began = Math.max(slot.start, lastTick);
    const mins = S().workingMinutesBetween(schedule, iso, began, nowMin);
    if (mins >= 1) it.spentMinutes = Math.round(Number(it.spentMinutes) || 0) + mins;
    logWorked(it, mins);

    // It's had its turn today; the rest of the day belongs to other things.
    p.dropped = (p.dropped || []).concat([it.id]);
    p.slots = (p.slots || []).filter((s2) => s2.itemId !== it.id);
    p.lastTickMin = nowMin;
    savePlan(iso, p);
    persist();
    render();
    const left = S().estimateMinutes(it, cfg).minutes;
    setTlStatus(
      mins >= 1
        ? `${S().durationWords(mins)} on “${it.title}” — kept. About ${S().durationWords(left)} left, and it'll come round again. ✓`
        : `“${it.title}” put down for today — it'll come round again.`
    );
  }

  // WORK THAT MAKES MORE WORK. Finishing something is exactly when you find out
  // it wasn't the end of it — and exactly when you're least likely to stop and
  // write the next bit down, because it feels finished. Offered, never asked:
  // ignore it and it goes on the next render. One tap if you need it.
  function offerFollowUp(it, wording) {
    const bar = $("#tlStatus");
    if (!bar) return;
    bar.hidden = false;
    if (!wording) bar.textContent = `Done: ${it.title}. `;
    else bar.textContent = bar.textContent ? bar.textContent + " " : "";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = wording || "anything follow from it?";
    link.addEventListener("click", () => {
      const box = document.querySelector("#capture textarea, #capture input[type=text]");
      if (box) {
        box.focus();
        box.scrollIntoView({ block: "center" });
      }
      bar.textContent = "Say it however it comes out — it'll be sorted.";
    });
    bar.appendChild(link);
  }

  // Pushed out by something that actually happened. The wording matters: these
  // did not slip and you did not fail to do them — the time went somewhere real,
  // and the app knows where because you told it.
  // HEADING FOR A CLASH — said while you can still do something about it.
  //
  // Everything else in this page is about today. This is the one thing that
  // isn't: it looks weeks out and reports work that will not fit before it's
  // due, and by how much. That number is the useful part — "two hours short" is
  // something you can take to someone and ask for help, or for more time, or
  // for permission to drop something else. "You've run out of time" on the
  // morning of is not.
  //
  // Deliberately unexcited. No red, no count-down, no exclamation marks. The
  // point is that you find out early, not that you feel bad early.
  function troubleBox(iso) {
    const WP = window.OrganiserWeekPlan;
    if (!WP || !WP.trouble) return null;
    const c = S().normaliseConfig(cfg);
    const rows = WP.trouble(items, schedule, c, iso, Math.max(c.planHorizonDays, 28), ctx())
      .filter((t) => t.short >= c.minSessionMinutes)
      .slice(0, 3);
    if (!rows.length) return null;

    const box = document.createElement("div");
    box.className = "dp-ahead";
    box.innerHTML =
      `<h3>Worth knowing now</h3>` +
      `<p class="muted">There isn't room for ${rows.length === 1 ? "this" : "these"} before ${rows.length === 1 ? "it's" : "they're"} due, on the time you've actually got. Said now rather than on the day, while there's still something you can do about it.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    rows.forEach((t) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      const when =
        t.daysLeft === null ? "" :
        t.daysLeft <= 0 ? "due today" :
        t.daysLeft === 1 ? "due tomorrow" :
        `${t.daysLeft} days away`;
      row.innerHTML =
        `<span class="dp-flagtitle">${escapeHtml(t.title)}</span>` +
        `<span class="dp-shortby">${escapeHtml(S().durationWords(t.short))} short${when ? ` · ${escapeHtml(when)}` : ""}</span>`;
      const a = document.createElement("button");
      a.type = "button";
      a.className = "link";
      a.textContent = "find it a day";
      const item = itemById(t.itemId);
      a.addEventListener("click", () => item && findADay(item, iso));
      row.appendChild(a);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function displacedBox(plan, iso) {
    const box = document.createElement("div");
    box.className = "dp-displaced";
    const names = plan.displaced.map((id) => itemById(id)).filter((x) => x && !x.done);
    if (!names.length) return box;
    box.innerHTML =
      `<h3>Pushed out by ${escapeHtml(plan.awayMinutes ? S().durationWords(plan.awayMinutes) : "what came up")}</h3>` +
      `<p class="muted">Not missed — there just isn't room left today. Move them, or leave them and they'll come round again.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    names.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      row.innerHTML = `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>`;
      const a = document.createElement("button");
      a.type = "button";
      a.className = "link";
      a.textContent = "find it a day";
      a.addEventListener("click", () => findADay(it, iso));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = "tomorrow";
      b.addEventListener("click", () => {
        it.date = S().addDaysISO(iso, 1);
        it.time = "";
        persist();
        render();
        setTlStatus(`Moved “${it.title}” to tomorrow. ✓`);
      });
      row.append(a, b);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function flaggedBox(plan, iso) {
    const box = document.createElement("div");
    box.className = "dp-flagged";
    // Never say the same thing twice. After a long interruption a big job is
    // both "pushed out" AND "wouldn't have fitted" — both true, but printing it
    // in two boxes with two explanations reads as two jobs, at the exact moment
    // you have least patience for working out that it's one. "Pushed out" wins:
    // it names the cause and it's the box with somewhere to put it.
    const alreadyShown = new Set(plan.displaced || []);
    const names = plan.flagged
      .map((f) => itemById(f.itemId))
      .filter((x) => x && !x.done && !alreadyShown.has(x.id))
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
  // Move one job to the next day that can genuinely hold it.
  //
  // This used to search the raw timetable — the lessons and nothing else — so it
  // was blind to every other thing already booked. Move three jobs after a bad
  // morning and all three landed on the same day at the same minute, on top of
  // each other, and the app looked like it had sorted you out. nextDayWithRoom
  // counts what's already committed, including what the week has planned.
  function findADay(it, fromISO) {
    const c = S().normaliseConfig(cfg);
    const est = S().estimateMinutes(it, c);
    const spot = window.OrganiserWeekPlan.nextDayWithRoom(it, items, schedule, c, fromISO, 21);
    if (!spot) {
      setTlStatus(`No day in the next three weeks has a ${S().durationWords(est.minutes)} stretch free. It may want breaking up.`);
      return;
    }
    it.date = spot.iso;
    it.time = S().toHM(spot.start);
    persist();
    render();
    setTlStatus(`Moved “${it.title}” to ${S().dayWord(new Date(spot.iso + "T12:00:00"))} at ${S().fmtTime(it.time)} — the first real stretch it fits in. ✓`);
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
    if (unreadableRows.length) $("#ttReview").appendChild(unreadableBox());
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
        unreadableRows = Array.isArray(d.unreadable) ? d.unreadable : [];
        pastedBlocks = null;
        renderSetup();
        setSuStatus(
          unreadableRows.length
            ? `Nothing came out whole — but ${unreadableRows.length} row${unreadableRows.length === 1 ? " is" : "s are"} listed below so you can see what it stumbled on.`
            : "Nothing in there looked like a timed block. Try adding one by hand to see the shape."
        );
        return;
      }
      pastedBlocks = d.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
      unreadableRows = Array.isArray(d.unreadable) ? d.unreadable : [];
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

  // A ROW THAT VANISHED IS INVISIBLE. You can check a table for what's WRONG,
  // but never for what ISN'T THERE — so a row the reader couldn't parse is
  // listed here rather than quietly dropped, with what tripped it up. Add it by
  // hand, or fix the paste and read it again; either way you know it existed.
  function unreadableBox() {
    const box = document.createElement("div");
    box.className = "su-unreadable";
    box.innerHTML =
      `<h3>${unreadableRows.length} row${unreadableRows.length === 1 ? "" : "s"} it couldn't read</h3>` +
      `<p class="muted">Not saved and not thrown away — here they are so nothing goes missing without you seeing it.</p>` +
      `<ul>${unreadableRows
        .map((r) => `<li><span class="su-badlabel">${escapeHtml(r.label)}</span> <span class="su-badwhy">${escapeHtml(r.why)}</span>${r.start || r.end ? ` <span class="su-badtime">${escapeHtml(String(r.start || "?"))}–${escapeHtml(String(r.end || "?"))}</span>` : ""}</li>`)
        .join("")}</ul>`;
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "link";
    hide.textContent = "I've dealt with these";
    hide.addEventListener("click", () => {
      unreadableRows = [];
      renderSetup();
    });
    box.appendChild(hide);
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
      <label class="bf-soft"><input type="checkbox" class="bf-prep" ${b.prep && b.prep.on ? "checked" : ""} /> I have to get something ready before this one</label>
      <label class="bf-lead">ready by <input type="number" class="bf-leaddays" min="0" max="14" value="${b.prep && b.prep.leadDays ? b.prep.leadDays : 1}" /> day(s) before
        <span class="bf-hint">A task appears for each time this comes round, a week ahead — not the whole term. Leave the box unticked for anything you don't prepare yourself.</span></label>
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
        prep: {
          on: form.querySelector(".bf-prep").checked,
          leadDays: Number(form.querySelector(".bf-leaddays").value) || 1,
        },
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
      syncPrep(); // switching it on should take effect now, not tomorrow
      renderSetup();
      render();
      setSuStatus(made.prep.on ? "Saved — its tasks are on your list. ✓" : "Saved. ✓");
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
        <span class="su-blabel">${escapeHtml(b.label)}${b.soft ? ' <span class="su-softtag">guess</span>' : ""}${b.prep && b.prep.on ? ` <span class="su-preptag">gets ready ${b.prep.leadDays === 0 ? "same day" : b.prep.leadDays + "d before"}</span>` : ""}</span>`;
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
    worked = data.worked || {};
    syncPrep();
    $("#setupToggle").addEventListener("click", () => {
      setupOpen = !setupOpen;
      renderSetup();
    });
    OrganiserStore.onExternalChange((state) => {
      items = state.items || items;
      schedule = state.schedule || schedule;
      cfg = state.scheduleConfig || cfg;
      worked = state.worked || worked;
      render();
    });
    render();
  }

  init();
})();
