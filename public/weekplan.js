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
  function openGaps(items, schedule, c, iso, notBefore) {
    const S = window.OrganiserSchedule;
    const gaps = S.gapsOn(schedule, c, iso, notBefore).map((g) => ({ ...g }));
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

  // WHICH DAY SOON HAS THE MOST ROOM IN IT.
  //
  // Undated work is never booked into a future day — it has no deadline to
  // miss, so committing it would be inventing a promise. That rule is right and
  // it stays. But it left a hole: on a day too full to hold everything, the app
  // squeezed what it could into the evening and said nothing about the Saturday
  // two days later with ten hours in it. It knew, and didn't mention it.
  //
  // So: not a booking. A sentence. You decide.
  function roomAhead(schedule, cfg, fromISO, days) {
    const S = window.OrganiserSchedule;
    const D = window.OrganiserDayShape;
    const c = S.normaliseConfig(cfg);
    const span = Math.max(1, Math.min(60, Number(days) || 7));
    const out = [];
    for (let i = 0; i < span; i++) {
      const iso = S.addDaysISO(fromISO, i);
      // Asked with the day's OWN shape, so a Saturday is measured by the hours
      // a Saturday actually has rather than by a working day's.
      const shape = D && D.shapeOf ? D.shapeOf(schedule, iso, c) : { kind: "work", config: c };
      if (shape.kind === "off") continue;
      const free = S.gapsOn(schedule, shape.config, iso).reduce((n, g) => n + (g.end - g.start), 0);
      out.push({ iso, free, kind: shape.kind, days: i });
    }
    return out;
  }

  // The freest day after today, if it is meaningfully freer. Null when there
  // isn't one — saying "tomorrow has slightly more room" every day would be
  // noise, and noise is how a useful line stops being read.
  function betterDay(schedule, cfg, fromISO, days) {
    const list = roomAhead(schedule, cfg, fromISO, days);
    if (list.length < 2) return null;
    const today = list[0];
    const rest = list.slice(1).filter((d) => d.free > 0);
    if (!rest.length) return null;
    const best = rest.reduce((a, b) => (b.free > a.free ? b : a));
    // Half as much again, and at least an hour more. Below that it is not worth
    // moving anything for.
    if (best.free < today.free * 1.5 || best.free - today.free < 60) return null;
    return best;
  }

  // ---- how tight each deadline actually is ---------------------------------
  //
  // A DEADLINE IS NOT A TIME TO DO SOMETHING. It is a time to have finished by,
  // which means the work itself still belongs in the ordinary queue and gets
  // done in whatever room turns up. What a deadline adds is pressure, and
  // pressure is not a property of the job — it is the room left before it set
  // against everything already owed to that room.
  //
  // So "due Friday" is not urgent by itself. Four hours of work due Friday with
  // three hours free before Friday is urgent. Ten minutes of work due Friday is
  // not, and never becomes so until Friday.
  //
  // Deliberately per-DEADLINE rather than per-job: everything due on or before a
  // date is competing for the same hours, so the honest question is whether all
  // of it fits, not whether this one would if it were the only thing.
  function deadlineLoad(items, schedule, cfg, fromISO, days) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const span = Math.max(1, Math.min(180, Number(days) || c.planHorizonDays));
    const droppable = window.OrganiserPriority.droppable;
    const all = (Array.isArray(items) ? items : []).filter(
      (i) => i && !i.done && !i.openLoop && !droppable(i) && i.date
    );
    if (!all.length) return [];

    // Room, day by day, at the same two-thirds ceiling the plan itself uses —
    // measuring against wall-to-wall would call a week comfortable that isn't.
    const room = [];
    for (let i = 0; i < span; i++) {
      const iso = S.addDaysISO(fromISO, i);
      const free = S.gapsOn(schedule, c, iso).reduce((n, g) => n + (g.end - g.start), 0);
      room.push({ iso, mins: Math.floor(free * c.fillFraction) });
    }
    const roomBy = (date) =>
      room.filter((d) => d.iso <= date).reduce((n, d) => n + d.mins, 0);

    const dates = [...new Set(all.map((i) => i.date))].sort();
    return dates.map((date) => {
      const owed = all.filter((i) => i.date <= date);
      const need = owed.reduce((n, i) => n + S.estimateMinutes(i, c).minutes, 0);
      const have = roomBy(date);
      return { date, need, room: have, slack: have - need, ids: owed.map((i) => i.id) };
    });
  }

  // The jobs whose deadline no longer has comfortable room in front of it.
  // Returned as a Set so ordering can ask in one step, and so that "tight" is
  // decided once from the whole picture rather than guessed at per job.
  function tightIds(items, schedule, cfg, fromISO, days) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const out = new Set();
    deadlineLoad(items, schedule, cfg, fromISO, days).forEach((d) => {
      // Not one useful sitting of spare room left before it. Below that, work
      // stops being something you'll get to and starts being something you have
      // to be doing.
      if (d.slack < c.minSessionMinutes) d.ids.forEach((id) => out.add(id));
    });
    return out;
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
    // TODAY HAS ALREADY PARTLY GONE. The week planned every day from the start
    // of the working day, so at ten in the morning it still offered you half
    // seven — and the first thing on the week's own "today" was a job sitting an
    // hour and a half in the past, looking like something you had failed to do.
    // The day page had learned this; the week hadn't, and they are two answers
    // to the same question.
    //
    // Only ever what the CALLER says the time is. Reading the clock in here
    // would make the same week plan differently depending on when it was asked,
    // which is exactly the kind of thing you can't write a test against.
    const nowMin = ctx && Number.isFinite(ctx.nowMinutes) ? ctx.nowMinutes : null;
    const startOf = (iso) => (nowMin !== null && ctx && iso === ctx.today ? nowMin : undefined);
    const room = new Map();
    dates.forEach((iso) => {
      const gaps = openGaps(all, schedule, c, iso, startOf(iso));
      const free = gaps.reduce((n, g) => n + (g.end - g.start), 0);
      room.set(iso, { gaps, budget: Math.floor(free * c.fillFraction), used: 0, free, overran: false });
    });

    // Only dated work gets spread. Something with no date has no deadline to
    // miss — it's what the day plan uses to fill whatever's left over.
    // Droppable work is deliberately NOT spread. Booking a nice-to-have into
    // next Tuesday makes it a commitment by the back door, and the whole point
    // is that it only ever gets what's genuinely left over on the day. But an
    // optional thing you HAVE committed to — the course you paid for, the
    // appointment you made — is booked like anything else, because it is.
    const droppable = window.OrganiserPriority.droppable;
    const fixed = window.OrganiserPriority.fixedInTime;
    const candidates = all.filter(
      (i) =>
        !i.done && !i.openLoop && !droppable(i) && !i.time && i.date && i.date <= lastISO &&
        // A MEETING WITH NO TIME ON IT IS NOT A GAP TO FILL. Left in, it was
        // treated as work whose wait clears that morning, so the week put it in
        // the LAST gap of the day — and "meet my mentor Thursday morning" came
        // back booked for five in the afternoon. The app does not know when the
        // meeting is; it knows which day. Inventing the hour is worse than
        // leaving it blank, because a wrong time is one you'd act on.
        !fixed(i)
    );

    // They belong to their day all the same, just without an hour against them.
    // Handed back so the week and the month can draw them where they are rather
    // than lose them for not being plannable.
    const onTheDay = all.filter(
      (i) => !i.done && !i.time && fixed(i) && i.date >= fromISO && i.date <= lastISO
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
      const waitUntil =
        it.notBefore && !(it.date && it.notBefore > it.date) ? it.notBefore : "";
      // AND SOMETHING THAT HAPPENS AT A TIME CANNOT HAPPEN BEFORE IT. The week
      // booked a meeting dated Thursday into this afternoon and wrote "ahead of
      // Thursday" next to it, which is not a thing you can be about a meeting.
      const fixedAt = window.OrganiserPriority.fixedInTime(it) ? it.date : "";
      const earliest = fixedAt > waitUntil ? fixedAt : waitUntil;

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

    return { from: fromISO, days: span, dates, placements, wontFit, byDay, onTheDay };
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

  // HOW MUCH ROOM IS THERE, REALLY — and therefore how much more you can take on.
  //
  // Work splits into two kinds. There's what you're committed to: it has to
  // happen, and if it doesn't there are consequences with other people in them.
  // And there's everything else — the useful-but-not-required, the goal you'd
  // like to get back to, the personal thing you put down when work got heavy.
  //
  // The second kind should only ever be offered out of what's genuinely spare
  // AFTER the first kind is safe. And when work gets heavier it should withdraw
  // by itself, quietly, without you having to notice and go round pruning — and
  // come back on its own when the pressure lifts, without you having to remember
  // it existed. That withdrawal is the whole point: the alternative is a list
  // that keeps promising things it can no longer pay for.
  //
  // Nothing here knows which work is which. You mark a thing optional, or you
  // don't; the code only counts minutes.
  function pressure(items, schedule, cfg, fromISO, days, ctx) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const span = Math.max(1, Math.min(180, Number(days) || c.planHorizonDays));
    const all = (Array.isArray(items) ? items : []).filter((i) => i && typeof i === "object");
    const committed = all.filter((i) => !i.done && !window.OrganiserPriority.droppable(i));

    const s = spread(committed, schedule, cfg, fromISO, span, ctx);
    let ceiling = 0;
    let claimed = 0;
    let daysWithRoom = 0;
    s.dates.forEach((iso) => {
      const free = S.gapsOn(schedule, c, iso).reduce((n, g) => n + (g.end - g.start), 0);
      const cap = Math.floor(free * c.fillFraction);
      const used = (s.byDay[iso] || []).reduce((n, p) => n + p.minutes, 0);
      ceiling += cap;
      claimed += used;
      if (cap - used >= c.minSessionMinutes) daysWithRoom++;
    });

    // Committed work that already can't fit before its deadline. If any of that
    // exists, there is no honest sense in which there's room for anything more.
    const shortJobs = s.wontFit.length;
    const headroom = Math.max(0, ceiling - claimed);
    const perDay = s.dates.length ? Math.round(headroom / s.dates.length) : 0;

    let verdict = "room";
    if (shortJobs > 0) verdict = "over";
    else if (perDay < c.minSessionMinutes || daysWithRoom < s.dates.length / 4) verdict = "full";

    return {
      days: s.dates.length,
      ceiling,
      claimed,
      headroom,
      perDay,
      daysWithRoom,
      shortJobs,
      verdict,
      // The plain-language reason, for showing rather than a colour.
      because:
        verdict === "over"
          ? `${shortJobs} committed thing${shortJobs === 1 ? "" : "s"} won't fit before ${shortJobs === 1 ? "it's" : "they're"} due`
          : verdict === "full"
            ? "the committed work is using nearly all the room there is"
            : `about ${S.durationWords(perDay)} a day spare once the committed work is in`,
    };
  }

  // Should optional work be offered at all right now? One question, one answer,
  // asked in the same way by the day plan and by whatever wants to explain it.
  function roomForOptional(items, schedule, cfg, fromISO, ctx) {
    return pressure(items, schedule, cfg, fromISO, null, ctx).verdict === "room";
  }

  window.OrganiserWeekPlan = {
    spread,
    roomAhead,
    betterDay,
    deadlineLoad,
    tightIds,
    startToday,
    nextDayWithRoom,
    trouble,
    pressure,
    roomForOptional,
  };
})();
