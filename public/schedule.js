// THE SCHEDULE SPINE — the one place that knows what "a block of time" is.
//
// §0.2, the no-hard-coding rule, applies hardest here. This file does not know
// what a "period", a "lesson", a "break" or a "meeting" is. It knows only:
//
//     a block has a start, an end, a label, and a repeat pattern.
//
// Every domain word lives in your data. Point it at a factory shift pattern or a
// hospital rota and the code cannot tell the difference.
//
// TWO KINDS OF BLOCK, and the difference matters more than anything else here:
//
//   FIXED      — fact. You are genuinely unavailable. Drawn with a solid edge.
//                Only fixed blocks hold reminders back.
//   SOFT       — the app guessing ("usually leaves around 17:00", "this probably
//                takes 40 minutes"). Drawn dashed and faded. A guess must never
//                silence the app, or the whole day plan stops being trustworthy.
//
// Plain script (no modules) so it works under file:// like everything else.

(function () {
  "use strict";

  const pad2 = (n) => String(n).padStart(2, "0");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  // "09:05" → 545. Anything unparseable → null, never a silent 0 (a bad parse
  // landing at midnight would quietly blank out a morning).
  function toMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").toString().trim());
    if (!m) return null;
    const h = +m[1];
    const mm = +m[2];
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  }
  function toHM(mins) {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
    return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  }
  function fmtTime(t) {
    const mins = toMin(t);
    if (mins === null) return "";
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function fmtSpan(a, b) {
    return fmtTime(a) + "–" + fmtTime(b);
  }
  // HOW LONG AGO, IN WORDS — one scale, so two lists cannot describe the same
  // gap differently. They did: a thing left open for a month read "open 30
  // days" on one page and "waiting 4 weeks" on another, both true and neither
  // matching. Returns the span only ("4 weeks"); the framing is the caller's,
  // because "open" and "waiting" are different facts about it.
  function agoWords(stamp, now) {
    const then = stamp instanceof Date ? stamp : new Date(stamp);
    if (!stamp || !Number.isFinite(then.getTime())) return "";
    const days = Math.max(0, Math.round(((now ? now.getTime() : Date.now()) - then.getTime()) / 86400000));
    if (days === 0) return "today";
    if (days === 1) return "1 day";
    if (days < 14) return `${days} days`;
    if (days < 60) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30)} months`;
  }

  function durationWords(mins) {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? "" : "s"}`;
  }

  // ---- config: every number here is DATA, editable, never a constant in code --
  const DEFAULT_CONFIG = {
    // The window a day plan may use. Outside it the app plans nothing.
    dayStart: "07:30",
    dayEnd: "17:30",
    // Starting guesses at how long each effort level takes. These are the seed
    // values only — they are corrected by what actually happens (see learn()).
    effortMinutes: { quick: 10, medium: 30, draining: 75 },
    // A day packed wall to wall collapses at the first interruption. Fill about
    // two thirds of the free time and stop.
    fillFraction: 0.66,
    // Gaps shorter than this aren't worth offering — they're corridor time.
    minGapMinutes: 10,
    // A job too big for one day is done in sittings. This is the smallest
    // sitting worth booking: below it you're not making progress, you're just
    // getting the folder out and putting it away again.
    minSessionMinutes: 25,
    // HOW FAR AHEAD THE DAY PLAN LOOKS for work worth getting on with.
    // A week is right for ordinary jobs and hopeless for a big one: eight hours
    // of reports due in a month stayed invisible until it came inside seven
    // days, and then took four days of scrambling. Four weeks lets a light week
    // now absorb a heavy week later, which is the whole point of planning
    // ahead. Yours to change — shorten it if the day starts feeling cluttered
    // with things that aren't urgent yet.
    planHorizonDays: 28,
    // How many days before a meeting the app starts saying what you have.
    meetingLeadDays: 5,
    // Work owed to a block: how far ahead tasks are made, when they ping, and
    // what they're called. A week out, not a term out — a repeating lesson
    // would otherwise make 180 identical tasks. All three are yours to change;
    // "{block}" is just where the block's own label goes.
    prepHorizonDays: 7,
    prepRemindAt: "17:00",
    prepTitle: "Plan: {block}",
    // What a "be there on time" job is called. Yours to reword — the app never
    // reads these, it only writes them.
    thereTitle: "Be at {block}",
    leaveTitle: "Leave for {block}",
    // WHEN SOMETHING SUDDENLY TAKES OVER. Set the moment you say it has, cleared
    // when you say you're back. While it's set the app plans nothing and pings
    // nothing — the middle of a crisis is the worst possible time to be told
    // about a report that's due.
    away: null, // { label, startedAt } while it's happening, null the rest of the time
    plans: {}, // iso date → { builtAt, acceptedAt, slots:[], dropped:[] }
    learned: {}, // effort key → observed minutes (a SOFT assumption, always)
  };

  function normaliseConfig(c) {
    const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (!c || typeof c !== "object") return out;
    if (toMin(c.dayStart) !== null) out.dayStart = c.dayStart;
    if (toMin(c.dayEnd) !== null) out.dayEnd = c.dayEnd;
    if (c.effortMinutes && typeof c.effortMinutes === "object") {
      ["quick", "medium", "draining"].forEach((k) => {
        const v = Number(c.effortMinutes[k]);
        if (v > 0 && v <= 8 * 60) out.effortMinutes[k] = Math.round(v);
      });
    }
    const f = Number(c.fillFraction);
    if (f > 0 && f <= 1) out.fillFraction = f;
    const g = Number(c.minGapMinutes);
    if (g >= 0 && g <= 120) out.minGapMinutes = Math.round(g);
    const ses = Number(c.minSessionMinutes);
    if (ses >= 5 && ses <= 240) out.minSessionMinutes = Math.round(ses);
    const ph = Number(c.planHorizonDays);
    if (ph >= 1 && ph <= 180) out.planHorizonDays = Math.round(ph);
    const lead = Number(c.meetingLeadDays);
    if (lead >= 0 && lead <= 60) out.meetingLeadDays = Math.round(lead);
    const horizon = Number(c.prepHorizonDays);
    if (horizon >= 1 && horizon <= 28) out.prepHorizonDays = Math.round(horizon);
    if (toMin(c.prepRemindAt) !== null) out.prepRemindAt = c.prepRemindAt;
    if (typeof c.prepTitle === "string" && c.prepTitle.trim()) out.prepTitle = c.prepTitle.trim().slice(0, 80);
    if (typeof c.thereTitle === "string" && c.thereTitle.trim()) out.thereTitle = c.thereTitle.trim().slice(0, 80);
    if (typeof c.leaveTitle === "string" && c.leaveTitle.trim()) out.leaveTitle = c.leaveTitle.trim().slice(0, 80);
    if (c.away && typeof c.away === "object" && c.away.startedAt) {
      out.away = { label: String(c.away.label || "").slice(0, 80), startedAt: String(c.away.startedAt) };
    }
    if (c.plans && typeof c.plans === "object") out.plans = c.plans;
    if (c.learned && typeof c.learned === "object") out.learned = c.learned;
    return out;
  }

  // ---- blocks ---------------------------------------------------------------
  function normaliseBlock(b) {
    if (!b || typeof b !== "object") return null;
    const start = toMin(b.start);
    const end = toMin(b.end);
    if (start === null || end === null || end <= start) return null; // a block with no width isn't a block
    const days = Array.isArray(b.days)
      ? b.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : "";
    if (!days.length && !date) return null; // must repeat on something, or be a real date
    return {
      id: b.id || uid(),
      label: (b.label || "").toString().trim() || "(unnamed)",
      start: toHM(start),
      end: toHM(end),
      days,
      date,
      from: /^\d{4}-\d{2}-\d{2}$/.test(b.from || "") ? b.from : "",
      to: /^\d{4}-\d{2}-\d{2}$/.test(b.to || "") ? b.to : "",
      soft: !!b.soft,
      // Ids this block concerns — how a meeting knows who it's about. Generic:
      // the code never learns what an id means.
      about: Array.isArray(b.about) ? b.about.map((x) => String(x).trim()).filter(Boolean) : [],
      // NOT AVAILABLE AT ALL. You marked the day off — a day away, a weekend
      // you don't work. Nothing is planned into it, and that is your decision
      // rather than the app's.
      blocksDay: !!b.blocksDay,
      // NO FIXED COMMITMENTS TODAY, but the day is still yours: a school
      // holiday, a closure, an INSET day you aren't going to. The lessons stop;
      // the work doesn't, and a break is often the best chance there is to get
      // ahead on the reports. Kept apart from blocksDay because collapsing the
      // two turns every holiday into a month the app refuses to plan.
      noLessons: !!b.noLessons,
      // BEING THERE ON TIME IS ITSELF A JOB.
      //
      // The app used to treat a place you have to be as scenery: it drew the
      // block and planned work right up to the minute it started. For anybody
      // who is penalised for turning up late that is not neutral — it is the
      // app causing the thing. Getting there is work, it takes time, and the
      // time it takes has to be time nothing else is allowed into.
      //
      // Off by default, because for most blocks it is already true that you're
      // in the room. Switch it on and three things follow: the journey is busy,
      // the day says when to leave, and it becomes a job in your list like any
      // other — because that is what it is.
      beThere: !!b.beThere,
      // How long it takes to get there, door to door, including the faff. Zero
      // is a real answer: the next room is somewhere you still have to be on
      // time for, it just doesn't take any getting to.
      getThere: Math.max(0, Math.min(240, Math.round(Number(b.getThere) || 0))),
      // COULD THIS ONE MOVE, IF IT CAME TO IT?
      //
      // Not the same question as soft. Soft means "I'm not sure this happens";
      // this one means "this definitely happens, and it could be swapped".
      // Teachers trade lessons with each other constantly, and when something
      // has to give, the useful thing to know is which of the fixed points are
      // fixed to a person rather than to the clock. Off by default: a lesson is
      // at nine whether or not you're ready for it, until you say otherwise.
      swappable: !!b.swappable,
      // DATES THIS ONE DOESN'T RUN. The exception to a repeating block: you
      // swapped it away, someone covered it, the class was out on a trip. The
      // pattern is still right for every other week, and saying "except that
      // Tuesday" is the only way to keep it right without deleting it.
      skip: Array.isArray(b.skip)
        ? [...new Set(b.skip.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
        : [],
      // THIS DATE RUNS ANOTHER DAY'S TIMETABLE.
      //
      // A make-up day: the holiday moved and a Saturday is standing in for the
      // Friday it replaced, with the Friday lessons on it. Without this the
      // only way to say so is to type every lesson in again as a one-off, and
      // the app still thinks the day is your own — so it plans a lie-in over
      // the top of a full teaching day.
      //
      // 0–6, or null for "this is an ordinary entry". Null rather than -1 or 0,
      // because Sunday IS 0 and every check that reads this has to survive it.
      //
      // AND THE EMPTY CASE IS ASKED FIRST, because Number(null) is 0 — so
      // normalising an already-normalised block turned every entry in the week
      // into "runs as Sunday", and since a make-up marker is not a commitment
      // it was then filtered out of the day. The whole schedule vanished on the
      // second pass through, which is a thing that happens constantly.
      runsAs:
        b.runsAs === null || b.runsAs === undefined || b.runsAs === ""
          ? null
          : Number.isInteger(Number(b.runsAs)) && Number(b.runsAs) >= 0 && Number(b.runsAs) <= 6
            ? Number(b.runsAs)
            : null,
      // DOES THIS BLOCK NEED WORK DOING BEFORE IT? Off by default, always —
      // switching it on for everything would bury you, and most blocks (a
      // break, a duty, a meeting someone else runs) need nothing.
      // leadDays: how far ahead it should be ready. 1 = by the end of the day
      // before.
      prep: b.prep && typeof b.prep === "object" && b.prep.on
        ? { on: true, leadDays: Math.max(0, Math.min(14, Math.round(Number(b.prep.leadDays)) || 1)) }
        : { on: false, leadDays: 1 },
      source: ["hand", "paste", "ics", "learned", "interruption"].includes(b.source) ? b.source : "hand",
      note: (b.note || "").toString().trim(),
    };
  }
  function normalise(list) {
    return (Array.isArray(list) ? list : []).map(normaliseBlock).filter(Boolean);
  }

  function appliesOn(b, iso, asDay) {
    if (b.from && iso < b.from) return false;
    if (b.to && iso > b.to) return false;
    // The exception beats the pattern. A lesson you swapped away isn't there
    // that week, however right the rest of the pattern is.
    if (b.skip && b.skip.indexOf(iso) >= 0) return false;
    if (b.date) return b.date === iso;
    const dow = Number.isInteger(asDay) ? asDay : new Date(iso + "T12:00:00").getDay();
    return b.days.includes(dow);
  }

  // WHICH DAY IS THIS DATE BEHAVING AS? Itself, unless something says otherwise.
  // Returns 0–6, and the answer is what every other question about the day has
  // to be asked with — a Saturday standing in for a Friday has Friday's lessons
  // on it and is a working day, and asking "what weekday is this?" the ordinary
  // way gets both of those wrong.
  function runsAsOn(schedule, iso) {
    const m = normalise(schedule).find((b) => b.date === iso && b.runsAs !== null && !b.soft);
    return m ? m.runsAs : new Date(iso + "T12:00:00").getDay();
  }
  // Is this date standing in for a different one? The marker itself, or null.
  function standingIn(schedule, iso) {
    return normalise(schedule).find((b) => b.date === iso && b.runsAs !== null && !b.soft) || null;
  }

  // Every block that applies on a date, earliest first.
  //
  // A make-up marker is not a block you have to sit through — it says which
  // day's pattern applies, and returning it as a 00:00–23:59 commitment would
  // swallow the day it is trying to describe.
  function blocksOn(schedule, iso) {
    const asDay = runsAsOn(schedule, iso);
    return normalise(schedule)
      .filter((b) => b.runsAs === null && appliesOn(b, iso, asDay))
      .sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
  }
  // Did you mark this day off? Nothing is planned into it.
  function dayIsBlocked(schedule, iso) {
    return blocksOn(schedule, iso).some((b) => b.blocksDay && !b.soft);
  }
  // Are the fixed commitments off today? True for a day you marked off AND for
  // a day with no lessons in it. This is the question anything about TEACHING
  // should ask — where a review lands, what shape the day is — while the
  // planner asks the narrower one above.
  function noTeachingOn(schedule, iso) {
    return blocksOn(schedule, iso).some((b) => (b.blocksDay || b.noLessons) && !b.soft);
  }

  // Merge overlapping FIXED blocks into busy intervals. Soft ones are excluded
  // on purpose — a guess never makes you unavailable.
  function busyOn(schedule, iso) {
    // A no-lessons entry is not a busy one: it says the timetable doesn't apply
    // today, not that you are occupied. A blocksDay entry IS busy, because that
    // one means you are not available at all.
    const fixed = blocksOn(schedule, iso).filter((b) => !b.soft && !b.noLessons);
    // THE JOURNEY IS BUSY TOO. Without this the planner fills the time you
    // needed to travel in, and you arrive late having done everything it said.
    //
    // SORTED AFTER THE JOURNEY IS ADDED, not before. blocksOn sorts by when a
    // block STARTS, and a block with half an hour of travel in front of it now
    // begins earlier than one that starts before it — merge them in the old
    // order and the gap in between silently disappears into the run.
    const spans = fixed
      .map((b) => ({
        start: Math.max(0, toMin(b.start) - (b.beThere ? b.getThere : 0)),
        end: toMin(b.end),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [];
    spans.forEach((sp) => {
      const last = out[out.length - 1];
      if (last && sp.start <= last.end) last.end = Math.max(last.end, sp.end);
      else out.push({ start: sp.start, end: sp.end });
    });
    return out;
  }

  // When you have to set off, for a block that says being there on time matters.
  // Null for everything else — a block you are already sitting in front of has
  // no leaving time, and showing one would be noise on every row.
  function leaveBy(b) {
    if (!b || !b.beThere) return null;
    return Math.max(0, toMin(b.start) - (b.getThere || 0));
  }

  // The free stretches of a day, in minutes-from-midnight.
  function gapsOn(schedule, cfg, iso, notBefore) {
    const c = normaliseConfig(cfg);
    // Unavailable means unavailable: if you marked this day off, nothing is
    // planned into it and that stays true. A day with no LESSONS is a different
    // thing entirely and is still plannable — see noTeachingOn below.
    if (dayIsBlocked(schedule, iso)) return [];
    // notBefore lets a rebuild plan only the time that's actually LEFT. Without
    // it, coming back at two o'clock would re-plan the whole morning.
    const from = Math.max(toMin(c.dayStart), Number.isFinite(notBefore) ? notBefore : 0);
    const to = toMin(c.dayEnd);
    const gaps = [];
    let cursor = from;
    busyOn(schedule, iso).forEach((b) => {
      if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, to) });
      cursor = Math.max(cursor, b.end);
    });
    if (cursor < to) gaps.push({ start: cursor, end: to });
    return gaps.filter((g) => g.end - g.start >= c.minGapMinutes && g.start < to).map((g) => ({ start: g.start, end: Math.min(g.end, to) }));
  }

  // The fixed block covering a moment, if any — this is what holds a reminder.
  function fixedBlockAt(schedule, when) {
    const iso = isoOf(when);
    const mins = when.getHours() * 60 + when.getMinutes();
    return (
      blocksOn(schedule, iso).find((b) => !b.soft && toMin(b.start) <= mins && mins < toMin(b.end)) || null
    );
  }

  // THE ANSWER SMART SNOOZE NEEDS: the next moment you are actually free.
  // Walks forward through today's remaining gaps, then following days. Falls
  // back to a plain "in two hours" if there is no schedule at all yet, so "not
  // now" behaves sensibly from day one.
  function nextFreeMoment(schedule, cfg, from) {
    const c = normaliseConfig(cfg);
    const start = from instanceof Date ? new Date(from) : new Date();
    const blocks = normalise(schedule);
    if (!blocks.length) {
      const d = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      return { at: d, why: "in about two hours", guessed: true };
    }
    for (let i = 0; i < 14; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const iso = isoOf(day);
      // A day with NO blocks on it is a day this app knows nothing about — not a
      // day that's wide open. Treating silence as "free all day" is how you end
      // up pinged at half past seven on a Saturday. If you do work weekends,
      // your own schedule will say so and this skips nothing.
      if (!blocksOn(blocks, iso).length) continue;
      const earliest = i === 0 ? start.getHours() * 60 + start.getMinutes() + 1 : 0;
      const gap = gapsOn(blocks, c, iso).find((g) => g.end > earliest);
      if (!gap) continue;
      const at = new Date(day);
      const mins = Math.max(gap.start, earliest);
      at.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      // Name the moment by what it follows, so it reads as a real point in your
      // day ("after Period 3") rather than a number you have to decode.
      const before = blocksOn(blocks, iso)
        .filter((b) => !b.soft && toMin(b.end) <= mins)
        .pop();
      const why = i === 0 ? (before ? `after ${before.label}` : `at ${fmtTime(toHM(mins))}`) : dayWord(day) + (before ? `, after ${before.label}` : ` at ${fmtTime(toHM(mins))}`);
      return { at, why, guessed: false };
    }
    const d = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return { at: d, why: "in about two hours", guessed: true };
  }
  function dayWord(d) {
    const today = new Date();
    const diff = Math.round((new Date(isoOf(d) + "T12:00:00") - new Date(isoOf(today) + "T12:00:00")) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }

  // ---- how long does a task take? ------------------------------------------
  // Never by asking. The effort field gives a usable answer on day one; what the
  // app already records (created / touched / ticked) sharpens it for free. Every
  // number that comes out of here is a SOFT assumption and must display as one.
  // How much of this is LEFT — which is not the same as how big it is.
  //
  // A job you got half way through is a smaller job now. Without this the app
  // plans the whole thing again every morning, and the minutes you put in
  // vanish. Over a simulated month that was four and a half hours of real work
  // thrown away — and worse, anything bigger than one day's free time could
  // never be finished at all. Six hours of marking against four hours free a
  // day: forty hours at the desk over ten days and still nothing to show for
  // it, because every morning it started again from nothing. With the minutes
  // kept, the same pile is done in six hours across two days.
  function estimateMinutes(item, cfg) {
    const c = normaliseConfig(cfg);
    const effort = ["quick", "medium", "draining"].includes(item && item.effort) ? item.effort : "medium";
    const learned = Number(c.learned[effort]);
    // A SIZE YOU GAVE IT BEATS ANY GUESS. The three effort levels top out at
    // about an hour and a quarter, which cannot describe sixty reports. Left
    // with only "draining", the app planned an eight-hour pile as seventy-five
    // minutes: it fitted anywhere, was never flagged, and got left until four
    // days before it was due and then crammed into one Thursday. Exactly the
    // rush this is supposed to prevent. So a job can carry its own minutes.
    const own = Math.max(0, Math.round(Number(item && item.plannedMinutes) || 0));
    const base = own > 0 ? own : Math.round(learned > 0 ? learned : c.effortMinutes[effort]);
    const spent = Math.max(0, Math.round(Number(item && item.spentMinutes) || 0));
    // ALREADY PAST ITS OWN ESTIMATE. Saying "5 minutes left" here would be a
    // lie the app tells confidently — it doesn't know how much is left, only
    // that the guess was wrong. Assume it needs another proper sitting and say
    // so, rather than dribbling out five-minute slots at something needing hours.
    const overrun = spent >= base;
    const left = overrun ? base : Math.max(5, base - spent);
    return {
      minutes: left,
      soft: true,
      from: own > 0 ? "yours" : learned > 0 ? "learned" : "effort",
      spent,
      full: base,
      overrun,
    };
  }
  // Minutes between two points in a day that you could actually have been
  // working — the wall clock, minus anything the timetable says you were doing
  // instead. Ticking a job off at 11:20 that you picked up at 10:00 does not
  // mean it took eighty minutes if there was a fifty-minute lesson in the
  // middle. The app already knows about the lesson, so it should not have to
  // ask, and it should not quietly record the lesson as part of the job.
  function workingMinutesBetween(schedule, iso, fromMin, toMin) {
    const a = Math.min(fromMin, toMin);
    const b = Math.max(fromMin, toMin);
    const busy = busyOn(schedule, iso).reduce((n, x) => {
      const s = Math.max(a, x.start);
      const e = Math.min(b, x.end);
      return n + Math.max(0, e - s);
    }, 0);
    return Math.max(0, b - a - busy);
  }

  // Fold one observed duration into the running average for that effort level.
  // Weighted so a single odd day can't swing it.
  //
  // CLAMP, DON'T DISCARD — and this is the whole point of the function.
  //
  // It used to throw away anything over four hours. That reads like sensible
  // hygiene and it is quietly poisonous, because a measurement is only ever
  // discarded for being too LONG. Every overrun went in the bin; every job that
  // came in early was counted in full. Over a simulated month of ordinary work
  // that ran, on average, over the guess, the app's idea of a draining job fell
  // from 75 minutes to 57 — so it packed more into a day, so more overran, so
  // more got binned. It was teaching itself that the work is quicker than it is
  // BECAUSE it kept running over, and the plan got less honest every week.
  //
  // A job that took four hours is real information about that kind of work. It
  // should pull the estimate up — just not all the way in one go. So an extreme
  // reading is pulled to the edge of believable and still counted, and the same
  // bound applies on both sides, so nothing can walk the estimate downhill.
  function learn(cfg, item, observedMinutes) {
    const c = normaliseConfig(cfg);
    const effort = ["quick", "medium", "draining"].includes(item && item.effort) ? item.effort : "medium";
    const seen = Math.round(observedMinutes);
    if (!(seen > 0)) return c;
    const prev = Number(c.learned[effort]) > 0 ? Number(c.learned[effort]) : c.effortMinutes[effort];
    const lo = Math.max(1, Math.round(prev / 3));
    const hi = Math.min(8 * 60, prev * 3);
    const used = Math.min(Math.max(seen, lo), hi);
    // AVERAGED IN PROPORTION, NOT IN MINUTES. Durations are multiplicative:
    // "twice as long" and "half as long" are equally surprising. Averaged the
    // ordinary way those are +75 minutes and −37, so the two directions pull
    // with different strength and the estimate wanders even when the readings
    // are balanced. In proportion they're exactly equal and opposite, so a run
    // of odd days can't walk the number anywhere on its own. It also can't
    // reach zero, which an ordinary average eventually can.
    c.learned[effort] = Math.round(Math.exp(0.8 * Math.log(prev) + 0.2 * Math.log(used)));
    return c;
  }

  // ---- WORK THAT'S OWED TO A BLOCK ------------------------------------------
  //
  // THE GAP THIS CLOSES: the app can only track what got captured. A lesson that
  // exists on your timetable but was never typed in as a task is invisible to
  // every safety net here — it has no deadline, it isn't an unfinished loop, and
  // nobody is waiting on it. So the thing that actually goes wrong (turning up
  // to a lesson you never planned) was the one thing nothing could catch.
  //
  // Now that the schedule knows Monday period 3 exists, the task can come from
  // the block instead of from your memory.
  //
  // THREE RULES THAT KEEP THIS FROM BECOMING A FLOOD:
  //   1. Off by default, per block. You say which blocks you actually prepare —
  //      some are shared with a partner, some run off a scheme of work, some
  //      need nothing at all.
  //   2. Generated a WEEK out, not a term out. A repeating lesson would
  //      otherwise produce 180 identical tasks and drown everything else.
  //   3. One per occurrence, keyed to the block and date, so opening the app
  //      twice can't make two.
  function occurrencesOf(block, fromISO, days) {
    const out = [];
    const start = new Date(fromISO + "T12:00:00");
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = isoOf(d);
      if (appliesOn(block, iso)) out.push(iso);
    }
    return out;
  }
  function prepKey(blockId, iso) {
    return blockId + "|" + iso;
  }
  function prepTitle(cfg, block) {
    const c = normaliseConfig(cfg);
    return c.prepTitle.replace("{block}", block.label);
  }
  // A separate key, because one block can owe you both — get the lesson ready
  // AND be in the room for it — and they are two different jobs.
  function thereKey(blockId, iso) {
    return blockId + "|" + iso + "|there";
  }
  function thereTitle(cfg, block) {
    const c = normaliseConfig(cfg);
    // "Leave for" when there is a journey, "Be at" when there isn't. Both are
    // yours to reword; the app never reads them.
    const t = block.getThere > 0 ? c.leaveTitle : c.thereTitle;
    return t.replace("{block}", block.label);
  }
  // Returns what to add and what to quietly drop. Pure — the caller decides
  // whether to save, so nothing is written just by looking.
  function prepPlan(schedule, cfg, items, from) {
    const c = normaliseConfig(cfg);
    const blocks = normalise(schedule).filter((b) => b.prep && b.prep.on && !b.blocksDay);
    const today = isoOf(from instanceof Date ? from : new Date());
    const existing = new Map();
    (items || []).forEach((it) => {
      if (it && it.prepFor) existing.set(it.prepFor, it);
    });

    const add = [];

    // BEING SOMEWHERE ON TIME IS A JOB. Same machinery as the work a block owes
    // you, because it is the same thing: something the block makes you do,
    // dated to it, that you can tick off and that can remind you.
    //
    // Timed to when you have to LEAVE, not when it starts. "09:00" is when you
    // are already late; "08:30" is the number that changes what you do.
    normalise(schedule)
      .filter((b) => b.beThere && !b.blocksDay && !b.noLessons && !b.soft)
      .forEach((b) => {
        occurrencesOf(b, today, c.prepHorizonDays).forEach((iso) => {
          const key = thereKey(b.id, iso);
          if (existing.has(key)) return;
          const at = leaveBy(b);
          add.push({
            prepFor: key,
            autoPrep: true,
            title: thereTitle(c, b),
            type: "task",
            date: iso,
            time: toHM(at),
            // It starts when it starts. Nothing about this one is a preference.
            deadlineType: "hard",
            importance: "normal",
            // Getting somewhere is not a piece of work with a size; it is a
            // moment you have to be at.
            effort: "quick",
            tags: [],
            whenText: b.getThere > 0
              ? `${b.getThere} min to get there, so leave by ${fmtTime(toHM(at))}`
              : `starts ${fmtTime(b.start)}`,
            goalId: "",
            standardId: "",
            openLoop: false,
            promisedTo: "",
            remindAt: iso + "T" + toHM(Math.max(0, at - 15)),
            remindedAt: null,
            lessonAt: iso + "T" + b.start,
            done: false,
          });
        });
      });

    blocks.forEach((b) => {
      occurrencesOf(b, today, c.prepHorizonDays).forEach((iso) => {
        const key = prepKey(b.id, iso);
        if (existing.has(key)) return;
        // Due `leadDays` before the lesson — but never dated in the past, or it
        // would arrive already overdue, which is a lie about what happened.
        const due = addDaysISO(iso, -b.prep.leadDays);
        const dueDate = due < today ? today : due;
        add.push({
          prepFor: key,
          autoPrep: true,
          title: prepTitle(c, b),
          type: "task",
          date: dueDate,
          time: "",
          // The lesson happens whether or not the work is done — that's a real
          // external deadline, not a preference.
          deadlineType: "hard",
          importance: "normal",
          effort: "medium",
          tags: [],
          whenText: `for ${b.label}, ${fmtTime(b.start)} on ${new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}`,
          goalId: "",
          standardId: "",
          openLoop: false,
          promisedTo: "",
          remindAt: dueDate + "T" + c.prepRemindAt,
          remindedAt: null,
          lessonAt: iso + "T" + b.start,
          done: false,
        });
      });
    });

    // Past and never touched → let it go. The lesson has happened; a pile of
    // untouched auto-made tasks accusing you afterwards is exactly the wall the
    // restart guard exists to prevent. Anything you DID engage with — snoozed,
    // renamed, given your own date — is yours now and is kept.
    const drop = [];
    existing.forEach((it, key) => {
      if (it.done) return;
      const iso = key.split("|")[1] || "";
      if (!iso || iso >= today) return;
      const untouched = it.autoPrep && !it.snoozes && !it.edited;
      if (untouched) drop.push(it);
    });
    return { add, drop };
  }
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  // When is the block this task was made for? Used to stop a prep task being
  // pushed past the thing it's for.
  function lessonMomentOf(item) {
    if (!item || !item.lessonAt) return null;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(item.lessonAt);
    if (!m) return null;
    const d = new Date(m[1] + "T12:00:00");
    const mins = toMin(m[2]);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  }

  // How long you've been away, in minutes. Used to write the real block on your
  // return — the app records what ACTUALLY happened, never an estimate of it.
  function awayMinutes(cfg, now) {
    const c = normaliseConfig(cfg);
    if (!c.away) return 0;
    const started = new Date(c.away.startedAt);
    if (isNaN(started)) return 0;
    return Math.max(0, Math.round(((now instanceof Date ? now : new Date()) - started) / 60000));
  }

  window.OrganiserSchedule = {
    awayMinutes,
    occurrencesOf,
    prepKey,
    prepTitle,
    thereKey,
    thereTitle,
    leaveBy,
    prepPlan,
    lessonMomentOf,
    addDaysISO,
    DEFAULT_CONFIG,
    normalise,
    normaliseBlock,
    normaliseConfig,
    appliesOn,
    blocksOn,
    busyOn,
    gapsOn,
    dayIsBlocked,
    noTeachingOn,
    runsAsOn,
    standingIn,
    fixedBlockAt,
    nextFreeMoment,
    estimateMinutes,
    learn,
    workingMinutesBetween,
    isoOf,
    toMin,
    toHM,
    fmtTime,
    fmtSpan,
    durationWords,
    agoWords,
    dayWord,
    uid,
  };
})();
