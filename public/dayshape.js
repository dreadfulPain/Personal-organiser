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

  // ---- WHAT IS DIFFERENT ABOUT TODAY ---------------------------------------
  //
  // THE QUESTION A TIMETABLE CANNOT ANSWER BY BEING SHOWN TO YOU. You know what
  // a Tuesday looks like; you have taught it thirty times. What you do not know,
  // and what costs you when you get it wrong, is the Tuesday that ISN'T one —
  // the make-up day running Wednesday's lessons, the morning the parents are in,
  // the week Read Aloud doesn't run. Every one of those was already in the data
  // and none of it was ever said: the app drew the day and left you to notice.
  //
  // So this asks what the resolved day has that the ordinary week does not, and
  // what the ordinary week has that the day has lost. Five things can differ,
  // and they are the five the schedule can already represent:
  //
  //   runsAs  — today is running another weekday's timetable
  //   lessons — the teaching is off, or the whole day is
  //   added   — something is on today that is not part of any week
  //   gone    — something that normally runs today is not running
  //   swapped — the last two at the same hour, which is one event, not two
  //
  // NOTHING IS A DIFFERENCE BY DEFAULT. An ordinary day returns an empty list,
  // and an empty list is the point: a week that says "Wednesday — no changes"
  // is five lines of reassurance to read before finding the one that matters.
  function normalWeek(schedule) {
    const S = window.OrganiserSchedule;
    if (!S) return [];
    // The repeating week: blocks that run on weekdays rather than on one date,
    // and that are not the calendar saying a day is off.
    return S.normalise(schedule)
      .filter((b) => b.days.length && b.runsAs === null && !b.blocksDay && !b.noLessons);
  }

  // Do two blocks cover any of the same minute? A one-off carries a date and a
  // lesson carries a weekday, so the only thing the two can be compared on is
  // the clock. normaliseBlock has already refused anything without a real start
  // and a later end, so there is no unreadable time to defend against here.
  function overlap(a, b) {
    const S = window.OrganiserSchedule;
    if (!S) return false;
    return S.toMin(a.start) < S.toMin(b.end) && S.toMin(b.start) < S.toMin(a.end);
  }

  function differsOn(schedule, iso, config) {
    const S = window.OrganiserSchedule;
    if (!S || !/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return [];
    const out = [];
    const dow = new Date(iso + "T12:00:00").getDay();
    const asDay = S.runsAsOn ? S.runsAsOn(schedule, iso) : dow;
    const here = S.blocksOn(schedule, iso);
    // 1. A DAY STANDING IN FOR ANOTHER. Said first because it explains
    //    everything else on the day: the lessons are not yours by accident.
    if (asDay !== dow)
      out.push({ how: "runsAs", day: asDay,
        // The seven words, from the one place that has them — see dates.js.
        // S.dayWord answers a different question ("today", "tomorrow", else the
        // weekday) and wants a Date, which is not what a weekday NUMBER is.
        words: `running ${(window.OrganiserDates && OrganiserDates.DAY_NAMES[asDay]) || "another day"}'s timetable` });
    // 2. THE TEACHING IS OFF, or the whole day is. Named by the entry that says
    //    so, because "no lessons" and "no lessons — Faculty Learning Day" are
    //    the same fact and only one of them tells you anything.
    here.filter((b) => !b.soft && (b.blocksDay || b.noLessons)).forEach((b) =>
      out.push({ how: b.blocksDay ? "off" : "noLessons", block: b,
        words: (b.blocksDay ? "a day off" : "no lessons") +
          (b.label && b.label !== "(unnamed)" ? ` — ${b.label}` : "") }));
    // 3 AND 4, ASKED TOGETHER. What is on today that is not part of any week,
    //    and what normally runs and is not running.
    //
    //    They were two questions until it became clear that half the time they
    //    are one event seen from both sides. "No Read Aloud" on one line and
    //    "Assembly 08:15" on another leaves you to notice they are the same
    //    twenty minutes; "Read Aloud → Assembly" is the thing that happened.
    //
    // 3. A one-off has a date rather than weekdays, which is exactly what makes
    //    it unusual.
    const added = here.filter((b) => !b.blocksDay && !b.noLessons && b.date && !b.days.length);
    // 4. THE QUIET ONE, and the one that catches people out: nothing on the
    //    screen is wrong, something is simply absent, and absence is exactly
    //    what looking at a timetable cannot show you.
    //
    //    NOT ON A DAY STANDING IN FOR ANOTHER. A Tuesday running Monday's
    //    timetable has lost every one of Tuesday's lessons, and that is what
    //    "running Monday's timetable" MEANS — listing them underneath it is the
    //    same sentence three more times, and the one line that explained the
    //    day goes under the three that repeat it.
    //
    //    A day with no lessons needs no such guard: its blocks are all still
    //    there, they are simply not taught, so nothing is missing to list.
    //    AND NOT THE OTHER HALF OF A FORTNIGHT. A slot that carries Writing in
    //    odd weeks and Show & Tell in even ones has not LOST Writing on an even
    //    Tuesday — that is the timetable working. Said every other week it is
    //    the loudest thing on the page and it is never once news.
    const par = S.parityOn ? S.parityOn(schedule, iso) : "";
    const on = new Set(here.map((b) => b.id));
    const gone = asDay !== dow ? [] : normalWeek(schedule)
      .filter((b) => b.days.includes(dow) && !on.has(b.id) &&
        !(b.parity && par && b.parity !== par));
    // ONLY EVER A SWAP WHEN BOTH HALVES ARE TRUE. The lesson has to be off AND
    // something has to be on in its place. A meeting that merely clashes with a
    // lesson still running is a clash, and drawing it as a replacement would be
    // the app telling you a lesson is cancelled when nobody has cancelled it.
    const took = new Set();
    added.forEach((b) => {
      const was = gone.find((g) => !took.has(g.id) && overlap(b, g));
      if (was) took.add(was.id);
      out.push(was
        ? { how: "swapped", block: b, was, words: `${was.label} → ${b.label}` }
        : { how: "added", block: b,
            words: `${b.label}${b.start ? ` ${S.fmtTime(b.start)}` : ""}` });
    });
    gone.filter((b) => !took.has(b.id))
      .forEach((b) => out.push({ how: "gone", block: b, words: `no ${b.label}` }));
    void config;
    return out;
  }

  // WHICH LAYER IS EACH THING ON TODAY?
  //
  // A wall timetable with pencil on it. The printed half is the same every week
  // and you stopped reading it years ago; the pencil is the half you look for.
  // Drawn in the same ink, finding the pencil becomes the work — and finding
  // the pencil was the whole job.
  //
  // So every block on the day says which it is, and it is answered HERE rather
  // than in each view, because "is this one different" asked twice is two
  // answers that drift. The differences themselves are still differsOn's to
  // find; this only arranges today's blocks around what it said.
  //
  // The day-wide entries — a day off, no lessons, another day's timetable — are
  // deliberately not rows. They are true of the whole day rather than of a time
  // in it, they come back from differsOn already, and a view that draws both
  // says the same thing twice.
  function layersOn(schedule, iso, config) {
    const S = window.OrganiserSchedule;
    if (!S || !/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return [];
    const changed = new Map();
    differsOn(schedule, iso, config).forEach((d) => {
      if (d.block && d.block.id) changed.set(d.block.id, d);
    });
    return S.blocksOn(schedule, iso)
      .filter((b) => !b.blocksDay && !b.noLessons)
      .map((b) => {
        const d = changed.get(b.id);
        return {
          block: b,
          layer: d ? "change" : "standing",
          how: d ? d.how : "standing",
          // What this stands in for, on the rows that stand in for something.
          was: (d && d.was) || null,
          // AND PROTECTED IS NOT HERE AT ALL, which is the point of it. It is
          // true of a block whichever layer that block is on — a lunch you keep
          // is as spoken for on the day it moves as on the days it doesn't — so
          // it stays on the block, where it already was. Copying it up onto the
          // row would be the same fact in two places, waiting to disagree.
        };
      });
  }

  window.OrganiserDayShape = {
    STARTING_OWN, STARTING_PARTS, ownDay, workingDays, kindOf, shapeOf, loosen, words,
    differsOn, layersOn,
  };
})();
