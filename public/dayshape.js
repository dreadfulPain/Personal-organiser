// NOT EVERY DAY IS THE SAME SHAPE.
//
// The app has been treating one working day as the model for all of them: one
// start time, one end time, a grid of fixed blocks, and — when a day was marked
// off — nothing at all. Both halves of that are wrong, and the second is worse.
//
// A DAY OFF TEACHING IS NOT A DAY OFF. A holiday means the classes stop. It
// does not mean the work does, and it is very often the best chance you get to
// start the reports or get ahead on planning before term buries you. Going dark
// for a month and saying "nothing planned into it" is the app deciding
// something that isn't its to decide.
//
// AND A DAY AT HOME IS NOT RIGID. On a teaching day the shape is imposed from
// outside: the lesson is at nine whether or not you are ready for it, lunch is
// when the canteen is open. At home none of that is true. You don't know when
// you'll wake up. Meals are roughly when you're hungry. A plan that says
// "09:14–09:44" for a Sunday is not a plan, it's a fiction, and the first time
// it's wrong you stop believing the rest of it.
//
// So a day has a KIND, and the kind decides two things: the hours it runs, and
// whether the plan is a timetable or an order. Nothing here decides what you
// should do with the day — only what shape the day is.
//
// §0.2: this knows nothing about schools, terms or weekends as such. It knows
// that some days carry your fixed commitments and some don't, and which is
// which comes from the schedule you keep and the days you named.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Seeded, and yours the moment you touch them — the same rule as the level
  // names and the review gaps. A day of your own starts later and runs longer
  // than a working day, which is the usual shape of one, not a rule about it.
  const STARTING_OWN = { start: "09:00", end: "21:00", loose: true };

  // The rough parts of a day, for when clock times would be a lie. Yours to
  // rename; the app never reads the words, only their order.
  const STARTING_PARTS = ["first thing", "before lunch", "after lunch", "evening"];

  // Asked of the schedule spine, which is the one place that decides what a
  // clock time is. This had its own reading and the two disagreed: "9:99" is
  // 639 minutes here and not a time at all there, so a hand-edited or restored
  // config could have a day starting at a quarter to eleven according to one
  // module and no day at all according to the other.
  //
  // The fallback is kept for the case where this module is used without the
  // spine — no page in the app does, but a test might.
  const toMin = (hm) => {
    if (window.OrganiserSchedule) return OrganiserSchedule.toMin(hm);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    return h > 23 || mm > 59 ? null : h * 60 + mm;
  };

  function ownDay(config) {
    const c = (config && config.ownDay) || {};
    return {
      start: toMin(c.start) !== null ? c.start : STARTING_OWN.start,
      end: toMin(c.end) !== null ? c.end : STARTING_OWN.end,
      // Loose by default, because a day at home usually is. Switch it off and a
      // day of your own is planned to the clock like a working one.
      loose: c.loose === undefined ? STARTING_OWN.loose : c.loose !== false,
      parts: (Array.isArray(c.parts) && c.parts.length
        ? c.parts
        : STARTING_PARTS
      ).map((p) => String(p).trim()).filter(Boolean).slice(0, 8),
    };
  }

  // WHICH KIND OF DAY IS THIS?
  //
  //   "work" — your fixed commitments apply. The timetable is real and the
  //            hours are imposed from outside.
  //   "own"  — they don't. A weekend, a holiday, an INSET day you're not going
  //            to. Work can still happen and often should; the shape is yours.
  //   "off"  — you said no. Away, resting, doing something else. No tasks.
  //
  // The third one nearly wasn't here, on the grounds that a day you want
  // nothing from is a day you don't open the app on. That was wrong, and for a
  // reason that has nothing to do with the day itself: TELLING IT IN ADVANCE IS
  // THE WHOLE POINT. Five weeks to a deadline is not five weeks if five of
  // those days are a break — and the only way anything can be placed sensibly
  // is if the gap is known before it arrives rather than discovered by not
  // being used.
  function kindOf(schedule, iso, config) {
    const S = window.OrganiserSchedule;
    // Asked first: a day you marked off is off, whatever else is true of it.
    if (S && S.dayIsBlocked && S.dayIsBlocked(schedule, iso)) return "off";
    // Then: no lessons, but the day is still yours.
    if (S && S.noTeachingOn && S.noTeachingOn(schedule, iso)) return "own";
    // Otherwise: does anything actually run today? A day with no fixed block on
    // it is your own day whether it's a Saturday or a Tuesday in the holidays.
    const blocks = S && S.blocksOn
      ? S.blocksOn(schedule, iso).filter((b) => !b.soft && !b.blocksDay && !b.noLessons)
      : [];
    if (blocks.length) return "work";
    // No blocks and nothing written off. Fall back to the days you said you
    // work — not to a built-in idea of a weekend, which would be wrong for
    // anybody whose week isn't Monday to Friday.
    //
    // AND ASKED AS THE DAY IT IS STANDING IN FOR. A Saturday making up for a
    // Friday is a working day even if the Friday it replaces happens to have
    // no blocks on it — the calendar says you are at work, and "what weekday is
    // this?" is the wrong question to answer that with.
    const wd = workingDays(config);
    const dow = S && S.runsAsOn ? S.runsAsOn(schedule, iso) : new Date(iso + "T12:00:00").getDay();
    return wd.includes(dow) ? "work" : "own";
  }

  // Which days you work, when the schedule can't say. Monday to Friday to begin
  // with, and editable, because plenty of people's weeks aren't.
  function workingDays(config) {
    const d = config && Array.isArray(config.workingDays) ? config.workingDays : null;
    const clean = (d || [1, 2, 3, 4, 5]).map(Number).filter((n) => n >= 0 && n <= 6);
    return d ? clean : [1, 2, 3, 4, 5];
  }

  // THE DAY'S SHAPE: when it runs, and whether the clock means anything.
  //
  // Returns a config the planner can use directly, so nothing downstream has to
  // learn about kinds — a working day gets the hours it always got, and a day
  // of your own gets its own.
  function shapeOf(schedule, iso, config) {
    const kind = kindOf(schedule, iso, config);
    const own = ownDay(config);
    // A day off has no hours to speak of. It is returned rather than refused so
    // that a caller counting days can tell the difference between "nothing fits
    // here" and "I never asked about this day".
    if (kind === "off") {
      return { kind, loose: false, start: "", end: "", parts: [], config: config || {} };
    }
    if (kind === "work") {
      return {
        kind,
        loose: false,
        start: (config && config.dayStart) || "07:30",
        end: (config && config.dayEnd) || "17:30",
        parts: [],
        // The planner's config, with the day's own hours in it.
        config: config || {},
      };
    }
    return {
      kind,
      loose: own.loose,
      start: own.start,
      end: own.end,
      parts: own.parts,
      config: { ...(config || {}), dayStart: own.start, dayEnd: own.end },
    };
  }

  // A LOOSE PLAN IS AN ORDER, NOT A TIMETABLE.
  //
  // Same jobs, same sequence, but grouped into the rough parts of the day
  // instead of pinned to minutes. What it will not do is pretend not to know
  // the order — the sequence is the useful half and it is kept exactly.
  function loosen(rows, shape) {
    const parts = shape.parts && shape.parts.length ? shape.parts : STARTING_PARTS;
    const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!list.length) return parts.map((p) => ({ part: p, rows: [] }));
    const from = toMin(shape.start) || 0;
    const to = toMin(shape.end) || 1440;
    const span = Math.max(1, to - from);
    return parts.map((p, i) => {
      const lo = from + (span * i) / parts.length;
      const hi = from + (span * (i + 1)) / parts.length;
      return {
        part: p,
        rows: list.filter((r) => {
          const at = Number(r.start);
          if (!Number.isFinite(at)) return i === 0;
          // The last part takes anything that ran past the end, rather than
          // dropping it — a job that overran is still a job you have.
          return i === parts.length - 1 ? at >= lo : at >= lo && at < hi;
        }),
      };
    });
  }

  // Plain words for the top of a day. Says which kind it is and what that
  // means, because the difference is the whole point and is invisible
  // otherwise.
  function words(shape) {
    if (shape.kind === "work") return "";
    if (shape.kind === "off")
      return "You've marked this off — nothing is planned into it, and the work has been placed around it.";
    return shape.loose
      ? "A day of your own — no lessons, so this is an order rather than a timetable. Times would only be a guess."
      : "A day of your own — no lessons, but planned to the clock as you asked.";
  }

  window.OrganiserDayShape = {
    STARTING_OWN, STARTING_PARTS, ownDay, workingDays, kindOf, shapeOf, loosen, words,
  };
})();
