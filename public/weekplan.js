// SPREADING WORK ACROSS DAYS — the week, and the month.
//
// THE GAP THIS CLOSES. The day plan is good at one question: what fits in
// today? Nothing answered the other one — "this is due Friday, it needs an hour
// and a quarter, and by Friday there won't be an hour and a quarter left". The
// day plan only ever considered work whose date had already arrived, so a job
// due Friday was invisible until Friday morning, at which point being told
// "needs a proper slot" is not help, it's an obituary.
//
// Measured on a full week: Monday had four and three quarter hours free and
// spent it tidying the stockroom, because the essays due Wednesday and the
// budget due Friday were not yet allowed to be looked at. Wednesday was six
// lessons with no stretch long enough for the essays. The budget — flagged
// important, hard deadline — never got done at all. Four missed deadlines in a
// week where there was easily enough time, all of it available on Monday.
//
// WHAT THIS DOES. Looks across a run of days and books deadline work in before
// it's due, soonest deadline first, biggest job first within a deadline —
// because long stretches are the scarce thing and a big job must claim one
// before small jobs chop it up. It keeps track of what it has already booked,
// so two jobs never land in the same gap. It stops at the same two-thirds mark
// the day plan uses, so spreading the week can't pack it wall to wall.
//
// And what genuinely cannot fit before its deadline comes back as `wontFit` —
// so it can be said on Monday, while there's still something you can do about
// it, instead of on Friday when there isn't.
//
// THE WEEK AND THE MONTH ARE THE SAME QUESTION at different lengths, so this
// takes the number of days as a parameter rather than knowing what a week is.
// Nothing here knows what a lesson, a deadline or a subject is: it knows dates,
// blocks, gaps and minutes.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const DEFAULT_DAYS = 14;

  // A day's free stretches, minus anything you pinned to a clock time by hand.
  // A time you chose yourself is a commitment, not a suggestion.
  function openGaps(items, schedule, c, iso) {
    const S = window.OrganiserSchedule;
    const gaps = S.gapsOn(schedule, c, iso).map((g) => ({ ...g }));
    items
      .filter((i) => !i.done && i.date === iso && i.time)
      .forEach((i) => {
        const start = S.toMin(i.time);
        if (start === null) return;
        const est = S.estimateMinutes(i, c);
        window.OrganiserDayPlan.carve(gaps, start, start + est.minutes);
      });
    return gaps;
  }

  // Soonest deadline first. Within a day: hard before soft, then what you said
  // matters, then the biggest — because the big one needs the long stretch and
  // there may only be one of them.
  function order(list, c) {
    const S = window.OrganiserSchedule;
    const key = (i) => ({
      due: i.date || "9999-99-99",
      hard: i.deadlineType === "hard" ? 0 : 1,
      high: i.importance === "high" ? 0 : 1,
      mins: S.estimateMinutes(i, c).minutes,
    });
    return list.slice().sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (
        x.due.localeCompare(y.due) || x.hard - y.hard || x.high - y.high || y.mins - x.mins
      );
    });
  }

  // items, schedule, cfg → where each dated job should actually get done.
  // days: how far to look (7 for the week, a month's length for the month).
  function spread(items, schedule, cfg, fromISO, days, ctx) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    // Not given → the default. Given → honoured, clamped. Asking for zero days
    // and quietly getting a fortnight is the kind of surprise that hides bugs.
    const asked = Number(days);
    const span = Math.max(1, Math.min(180, Number.isFinite(asked) ? asked : DEFAULT_DAYS));
    // A saved file that's been hand-edited, or half-written by a crash, can hold
    // nulls. One of them shouldn't take the whole week's plan down.
    const all = (Array.isArray(items) ? items : []).filter((i) => i && typeof i === "object");
    const dates = [];
    for (let i = 0; i < span; i++) dates.push(S.addDaysISO(fromISO, i));
    const lastISO = dates[dates.length - 1];

    // Each day starts with its real free time and its own two-thirds ceiling.
    const room = new Map();
    dates.forEach((iso) => {
      const gaps = openGaps(all, schedule, c, iso);
      const free = gaps.reduce((n, g) => n + (g.end - g.start), 0);
      room.set(iso, { gaps, budget: Math.floor(free * c.fillFraction), used: 0, free, overran: false });
    });

    // Only dated work gets spread. Something with no date has no deadline to
    // miss — it's what the day plan uses to fill whatever's left over.
    const candidates = all.filter(
      (i) => !i.done && !i.openLoop && !i.time && i.date && i.date <= lastISO
    );

    const placements = [];
    const wontFit = [];

    order(candidates, c).forEach((it) => {
      const est = S.estimateMinutes(it, c);
      // A hard deadline must land on or before its date. A soft one is a wish,
      // so it may land later rather than be declared impossible.
      const hard = it.deadlineType === "hard";
      // Already overdue? Then the deadline is "as soon as there is room".
      const limit = hard ? (it.date < fromISO ? lastISO : it.date) : lastISO;

      // The earliest this could possibly happen. A notBefore later than the
      // deadline is a contradiction, so the deadline wins — see priority.js.
      const earliest =
        it.notBefore && !(it.date && it.notBefore > it.date) ? it.notBefore : "";

      let placed = null;
      for (const iso of dates) {
        if (iso > limit) break;
        if (earliest && iso < earliest) continue;
        const r = room.get(iso);
        if (!r) continue;
        // Don't blow past the day's ceiling — unless it's due that day and
        // hard, which is the one case the day plan also lets through. ONCE,
        // though: a single job is never dropped for want of ten minutes, but
        // forty hard deadlines landing on one Friday is not a day, it's a
        // fiction, and promising all of them is the exact lie this app exists
        // to stop. The rest come back as "won't fit", which is the truth.
        const mustToday = hard && iso === it.date && !r.overran;
        if (r.used >= r.budget && !mustToday) continue;
        // On the very day the wait clears, book as LATE as it will fit. The
        // thing being waited on happens at some unknown point that day, and
        // putting the follow-up work at eight in the morning would put it
        // before the meeting it depends on — which was the whole bug.
        const onUnblockDay = !!earliest && iso === earliest;
        const gap = onUnblockDay
          ? window.OrganiserDayPlan.fitLast(r.gaps, est.minutes)
          : window.OrganiserDayPlan.fitIn(r.gaps, est.minutes);
        if (!gap) continue;
        const at = onUnblockDay ? gap.end - est.minutes : gap.start;
        window.OrganiserDayPlan.carve(r.gaps, at, at + est.minutes);
        r.used += est.minutes;
        if (r.used >= r.budget) r.overran = true;
        placed = { itemId: it.id, iso, start: at, minutes: est.minutes, early: !!(it.date && iso < it.date) };
        break;
      }

      if (placed) placements.push(placed);
      else wontFit.push({ itemId: it.id, minutes: est.minutes, date: it.date, hard });
    });

    const byDay = {};
    dates.forEach((iso) => (byDay[iso] = []));
    placements.forEach((p) => byDay[p.iso].push(p));
    Object.keys(byDay).forEach((iso) => byDay[iso].sort((a, b) => a.start - b.start));

    return { from: fromISO, days: span, dates, placements, wontFit, byDay };
  }

  // Which jobs the week says to get on with today — including ones not due
  // until later. This is what stops a quiet Monday being spent on the stockroom
  // while Friday quietly becomes impossible.
  function startToday(items, schedule, cfg, iso, ctx, days) {
    const s = spread(items, schedule, cfg, iso, days || 7, ctx);
    return new Set((s.byDay[iso] || []).map((p) => p.itemId));
  }

  // The first day at or after `fromISO` with a real stretch free for this job,
  // counting everything already committed. Replaces "find the first gap in an
  // empty timetable", which cheerfully sent three different jobs to the same
  // Tuesday morning at the same minute.
  function nextDayWithRoom(it, items, schedule, cfg, fromISO, days) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const span = Math.max(1, Math.min(180, Number(days) || 21));
    const est = S.estimateMinutes(it, c);
    for (let i = 1; i <= span; i++) {
      const iso = S.addDaysISO(fromISO, i);
      const gaps = openGaps(items, schedule, c, iso);
      // Everything the week has already booked onto that day is taken too.
      const s = spread(items, schedule, cfg, fromISO, i + 1, null);
      (s.byDay[iso] || []).forEach((p) => {
        if (p.itemId !== it.id) window.OrganiserDayPlan.carve(gaps, p.start, p.start + p.minutes);
      });
      const gap = window.OrganiserDayPlan.fitIn(gaps, est.minutes);
      if (gap) return { iso, start: gap.start, minutes: est.minutes };
    }
    return null;
  }

  window.OrganiserWeekPlan = { spread, startToday, nextDayWithRoom };
})();
