// LAYING OUT A DAY — the algorithm, on its own.
//
// This lived inside the Day page, which meant the single most consequential
// piece of reasoning in the app — what you'll actually be looking at at nine in
// the morning — could not be run, inspected or tested without a browser. Same
// reasoning as priority.js: something this important belongs where it can be
// driven directly and where only one copy of it exists.
//
// THE ORDER IS THE DESIGN:
//   1. Fixed blocks are facts. They're laid down first and never moved.
//   2. Anything you gave a real time by hand keeps it. A decision you made is
//      never quietly overwritten by a plan the app made.
//   3. A hard deadline due today goes in NO MATTER WHAT — it's the one thing
//      allowed to break the fill limit, because leaving it out would make the
//      plan quietly wrong.
//   4. Everything else fills the gaps in "what matters" order, until about two
//      thirds of the free time is used. Then it stops. A day packed wall to
//      wall collapses at the first interruption, and then the plan is a liar.
//   5. Anything too big for the gaps left is FLAGGED, not crammed in. "Needs a
//      proper slot" is true and useful; a draining job chopped into fifteen
//      minutes is neither.
//
// Nothing here knows what a lesson is. It knows blocks, gaps and minutes.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // First gap this many minutes will fit into, earliest first.
  function fitIn(gaps, minutes) {
    return gaps.find((g) => g.end - g.start >= minutes) || null;
  }
  // LAST gap this many minutes will fit into. For work that's waiting on
  // something happening at an unknown point during the day: the app can't know
  // when the meeting is, but it knows that later in the day is likelier to be
  // after it than eight in the morning is.
  function fitLast(gaps, minutes) {
    for (let i = gaps.length - 1; i >= 0; i--) {
      if (gaps[i].end - gaps[i].start >= minutes) return gaps[i];
    }
    return null;
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

  // opts: { previous, notBefore, ctx } — ctx is the priority context
  // ({ today, goalTitle }), notBefore lets a rebuild plan only what's left.
  function build(items, schedule, cfg, iso, opts) {
    const S = window.OrganiserSchedule;
    const o = opts || {};
    const c = S.normaliseConfig(cfg);
    const ctx = o.ctx || { today: iso, goalTitle: () => "" };
    const dropped = new Set((o.previous && o.previous.dropped) || []);
    const gaps = S.gapsOn(schedule, c, iso, o.notBefore).map((g) => ({ ...g }));
    const freeTotal = gaps.reduce((n, g) => n + (g.end - g.start), 0);
    const budget = Math.floor(freeTotal * c.fillFraction);

    const pinned = items.filter((i) => !i.done && i.date === iso && i.time);
    const slots = pinned.map((i) => {
      const start = S.toMin(i.time);
      const est = S.estimateMinutes(i, c);
      return { itemId: i.id, start, end: Math.min(start + est.minutes, 24 * 60 - 1), pinned: true, soft: false };
    });
    slots.forEach((s) => carve(gaps, s.start, s.end));

    // What the week says to get on with today, including work not due until
    // later. Without this the day plan can only see work whose date has already
    // arrived, so a quiet Monday goes on the stockroom while the big thing due
    // Friday waits for a Friday that turns out to have no room in it.
    const WP = window.OrganiserWeekPlan;
    // itemId → minutes the week has set aside for it TODAY. For a big job
    // that's one sitting, not the whole thing.
    const startNow = WP ? WP.startToday(items, schedule, c, iso, ctx) : new Map();

    // forPlanning, not ordered: the pressing things first, then ordinary work to
    // fill what's left. See priority.js — the nag list makes a poor day plan.
    const candidates = window.OrganiserPriority.forPlanning(items, ctx).filter(
      (i) =>
        !dropped.has(i.id) &&
        !i.time &&
        !i.openLoop &&
        (!i.date || i.date <= iso || startNow.has(i.id))
    );

    let used = 0;
    const flagged = [];
    for (const it of candidates) {
      const full = S.estimateMinutes(it, c);
      // A sitting the week booked for today, if there is one — otherwise the
      // whole of what's left. Never smaller than a sitting is worth.
      const booked = startNow.get(it.id);
      const est = booked > 0 && booked < full.minutes
        ? { ...full, minutes: Math.max(c.minSessionMinutes, Math.round(booked)), sitting: true }
        : full;
      const hardToday = it.deadlineType === "hard" && it.date && it.date <= iso;
      if (used >= budget && !hardToday) break;
      // Today is the day the wait clears — put it as late as it will go. Same
      // reasoning as weekplan.js: the thing it's waiting on happens at some
      // unknown point today, and first thing this morning is the one time it
      // definitely hasn't happened yet.
      const waitClears = !!it.notBefore && it.notBefore === iso;
      const gap = waitClears ? fitLast(gaps, est.minutes) : fitIn(gaps, est.minutes);
      if (!gap) {
        if (est.minutes > c.minGapMinutes) flagged.push({ itemId: it.id, minutes: est.minutes });
        continue;
      }
      const at = waitClears ? gap.end - est.minutes : gap.start;
      slots.push({
        itemId: it.id,
        start: at,
        end: at + est.minutes,
        soft: true,
        why: window.OrganiserPriority.reason(it, ctx),
      });
      carve(gaps, at, at + est.minutes);
      used += est.minutes;
    }
    slots.sort((a, b) => a.start - b.start);
    return {
      builtAt: new Date().toISOString(),
      acceptedAt: null,
      slots,
      dropped: [...dropped],
      flagged,
      freeTotal,
      used,
      accepted: false,
    };
  }

  // HOW MANY DAYS RUNNING HAS THIS BEEN ON THE PLAN AND NOT GOT DONE?
  //
  // Over a simulated month the same job was planned on Monday, not reached,
  // planned again Tuesday, not reached — and nothing anywhere noticed. It just
  // reappeared each morning looking like a fresh intention. That's the quiet
  // accumulating failure this app exists to prevent: not a missed deadline, but
  // a thing that silently becomes evidence you can't get anything done.
  //
  // The answer is already sitting in the saved plans, which are kept for a
  // fortnight. Nothing new to store — just look.
  function carriedOver(cfg, itemId, iso) {
    const c = window.OrganiserSchedule.normaliseConfig(cfg);
    const plans = c.plans || {};
    return Object.keys(plans).filter(
      (k) => k < iso && ((plans[k] || {}).slots || []).some((s) => s.itemId === itemId)
    ).length;
  }

  window.OrganiserDayPlan = { build, fitIn, fitLast, carve, carriedOver };
})();
