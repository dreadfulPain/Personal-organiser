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
    const startNow = WP ? WP.startToday(items, schedule, c, iso, ctx) : new Set();

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
      const est = S.estimateMinutes(it, c);
      const hardToday = it.deadlineType === "hard" && it.date && it.date <= iso;
      if (used >= budget && !hardToday) break;
      const gap = fitIn(gaps, est.minutes);
      if (!gap) {
        if (est.minutes > c.minGapMinutes) flagged.push({ itemId: it.id, minutes: est.minutes });
        continue;
      }
      slots.push({
        itemId: it.id,
        start: gap.start,
        end: gap.start + est.minutes,
        soft: true,
        why: window.OrganiserPriority.reason(it, ctx),
      });
      carve(gaps, gap.start, gap.start + est.minutes);
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

  window.OrganiserDayPlan = { build, fitIn, carve };
})();
