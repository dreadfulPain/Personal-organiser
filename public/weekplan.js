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

      // A JOB TOO BIG FOR ONE DAY IS DONE IN SITTINGS.
      //
      // Without this, anything larger than the longest gap simply never got
      // placed — and because the biggest size the app could express was about
      // an hour, an eight-hour pile of reports looked like a one-hour job,
      // fitted anywhere, was never flagged, and got left until four days before
      // it was due. Then one Thursday absorbed six hours of it. That is the
      // rush this whole thing exists to prevent.
      //
      // So: work out how many sittings it needs, book them from the earliest
      // day that has room, and if the days before the deadline cannot hold it
      // all, say by how much — that shortfall is the warning.
      // ONLY chip a job you TOLD the app was that big. A "draining" job is
      // draining because it wants one uninterrupted stretch — cutting that into
      // twenty-five minute pieces is precisely what "needs a proper slot"
      // exists to refuse. But sixty reports genuinely are done ten at a time,
      // and the way the app knows the difference is that you said how long it
      // needs. A stated size is a statement that it can be worked through.
      const needsSittings = est.from === "yours";
      let owed = est.minutes;
      const sittings = [];

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
        // Whole thing in one go if it fits; otherwise the biggest sitting this
        // day can hold, down to the smallest one worth getting the folder out for.
        let take = owed;
        let gap = onUnblockDay
          ? window.OrganiserDayPlan.fitLast(r.gaps, take)
          : window.OrganiserDayPlan.fitIn(r.gaps, take);
        if (!gap && needsSittings) {
          // No stretch holds the rest of it, so take the biggest sitting this
          // day can give — bounded by the day's own ceiling, so chipping at a
          // big job can't quietly fill a week wall to wall.
          const roomLeft = mustToday ? owed : Math.max(0, r.budget - r.used);
          const biggest = r.gaps.reduce((b, g) => Math.max(b, g.end - g.start), 0);
          take = Math.min(owed, biggest, roomLeft);
          if (take < c.minSessionMinutes) continue;
          gap = onUnblockDay
            ? window.OrganiserDayPlan.fitLast(r.gaps, take)
            : window.OrganiserDayPlan.fitIn(r.gaps, take);
        }
        if (!gap) continue;
        const at = onUnblockDay ? gap.end - take : gap.start;
        window.OrganiserDayPlan.carve(r.gaps, at, at + take);
        r.used += take;
        if (r.used >= r.budget) r.overran = true;
        owed -= take;
        const one = { itemId: it.id, iso, start: at, minutes: take, early: !!(it.date && iso < it.date) };
        sittings.push(one);
        if (!placed) placed = one;
        if (owed <= 0) break;
      }

      // Every sitting is a real booking; the first is also "the" placement.
      sittings.forEach((x) => placements.push({ ...x, sittings: sittings.length }));
      if (owed > 0) {
        // Some or all of it has nowhere to go before the deadline. `short` is
        // the number that makes the warning actionable: this much time has to
        // come from somewhere — an evening, someone else, or a later date.
        wontFit.push({
          itemId: it.id,
          minutes: est.minutes,
          short: owed,
          booked: est.minutes - owed,
          date: it.date,
          hard,
        });
      }
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
  // Returns itemId → MINUTES for today, not just a list of ids. The minutes
  // matter: a big job is booked as a sitting, and if the day plan then went
  // looking for a gap the size of the whole job it would find none and put the
  // job off — which is exactly what happened. Eight hours of reports, twenty-
  // five working days of warning, and not one minute of it ever started.
  function startToday(items, schedule, cfg, iso, ctx, days) {
    const c = window.OrganiserSchedule.normaliseConfig(cfg);
    const s = spread(items, schedule, cfg, iso, days || c.planHorizonDays, ctx);
    const out = new Map();
    (s.byDay[iso] || []).forEach((p) => out.set(p.itemId, (out.get(p.itemId) || 0) + p.minutes));
    return out;
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

  // TROUBLE YOU CAN STILL DO SOMETHING ABOUT.
  //
  // The Week tab looks seven days ahead, which is fine for ordinary work and
  // useless for the thing that actually catches people out: a big commitment
  // weeks away with a pile of work behind it. Measured over two months, an
  // eight-hour set of reports for a parents evening sat untouched for fifteen
  // working days and then swallowed a Thursday whole — and a seven-day check
  // could not have said a word about it until it was far too late to ask for
  // help or for more time.
  //
  // This asks the same question over a long horizon and reports each piece of
  // work that cannot fit before it's due, HOW SHORT it is, and how many days
  // are left. Short and early is a nudge; short and late is a problem you need
  // to take to someone. The app's job is to make sure you find out while it's
  // still the first one.
  function trouble(items, schedule, cfg, fromISO, days, ctx) {
    const S = window.OrganiserSchedule;
    const horizon = Math.max(1, Math.min(180, Number(days) || 56));
    const s = spread(items, schedule, cfg, fromISO, horizon, ctx);
    const all = Array.isArray(items) ? items : [];
    return s.wontFit
      .map((w) => {
        const it = all.find((i) => i && i.id === w.itemId);
        if (!it) return null;
        const daysLeft = it.date ? Math.round((new Date(it.date + "T12:00:00") - new Date(fromISO + "T12:00:00")) / 86400000) : null;
        return {
          itemId: w.itemId,
          title: it.title || "",
          date: it.date || "",
          daysLeft,
          hard: !!w.hard,
          needs: w.minutes,
          // How much of it the days before the deadline CAN hold, and what's
          // left over. The leftover is the number worth acting on.
          booked: w.booked || 0,
          short: w.short || w.minutes,
        };
      })
      .filter(Boolean)
      // Soonest first — that's the one you can least afford to hear about late.
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || b.short - a.short);
  }

  window.OrganiserWeekPlan = { spread, startToday, nextDayWithRoom, trouble };
})();
