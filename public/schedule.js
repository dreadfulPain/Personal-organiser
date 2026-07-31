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
    // How many days before a meeting the app starts saying what you have.
    meetingLeadDays: 5,
    // Work owed to a block: how far ahead tasks are made, when they ping, and
    // what they're called. A week out, not a term out — a repeating lesson
    // would otherwise make 180 identical tasks. All three are yours to change;
    // "{block}" is just where the block's own label goes.
    prepHorizonDays: 7,
    prepRemindAt: "17:00",
    prepTitle: "Plan: {block}",
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
    const lead = Number(c.meetingLeadDays);
    if (lead >= 0 && lead <= 60) out.meetingLeadDays = Math.round(lead);
    const horizon = Number(c.prepHorizonDays);
    if (horizon >= 1 && horizon <= 28) out.prepHorizonDays = Math.round(horizon);
    if (toMin(c.prepRemindAt) !== null) out.prepRemindAt = c.prepRemindAt;
    if (typeof c.prepTitle === "string" && c.prepTitle.trim()) out.prepTitle = c.prepTitle.trim().slice(0, 80);
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
      // Whole day unavailable (a holiday, an INSET day). Nothing is planned into it.
      blocksDay: !!b.blocksDay,
      // DOES THIS BLOCK NEED WORK DOING BEFORE IT? Off by default, always —
      // switching it on for everything would bury you, and most blocks (a
      // break, a duty, a meeting someone else runs) need nothing.
      // leadDays: how far ahead it should be ready. 1 = by the end of the day
      // before.
      prep: b.prep && typeof b.prep === "object" && b.prep.on
        ? { on: true, leadDays: Math.max(0, Math.min(14, Math.round(Number(b.prep.leadDays)) || 1)) }
        : { on: false, leadDays: 1 },
      source: ["hand", "paste", "ics", "learned"].includes(b.source) ? b.source : "hand",
      note: (b.note || "").toString().trim(),
    };
  }
  function normalise(list) {
    return (Array.isArray(list) ? list : []).map(normaliseBlock).filter(Boolean);
  }

  function appliesOn(b, iso) {
    if (b.from && iso < b.from) return false;
    if (b.to && iso > b.to) return false;
    if (b.date) return b.date === iso;
    const dow = new Date(iso + "T12:00:00").getDay();
    return b.days.includes(dow);
  }
  // Every block that applies on a date, earliest first.
  function blocksOn(schedule, iso) {
    return normalise(schedule)
      .filter((b) => appliesOn(b, iso))
      .sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
  }
  // Is the whole day written off (holiday / INSET)?
  function dayIsBlocked(schedule, iso) {
    return blocksOn(schedule, iso).some((b) => b.blocksDay && !b.soft);
  }

  // Merge overlapping FIXED blocks into busy intervals. Soft ones are excluded
  // on purpose — a guess never makes you unavailable.
  function busyOn(schedule, iso) {
    const fixed = blocksOn(schedule, iso).filter((b) => !b.soft);
    const out = [];
    fixed.forEach((b) => {
      const s = toMin(b.start);
      const e = toMin(b.end);
      const last = out[out.length - 1];
      if (last && s <= last.end) last.end = Math.max(last.end, e);
      else out.push({ start: s, end: e });
    });
    return out;
  }

  // The free stretches of a day, in minutes-from-midnight.
  function gapsOn(schedule, cfg, iso) {
    const c = normaliseConfig(cfg);
    if (dayIsBlocked(schedule, iso)) return [];
    const from = toMin(c.dayStart);
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
  function estimateMinutes(item, cfg) {
    const c = normaliseConfig(cfg);
    const effort = ["quick", "medium", "draining"].includes(item && item.effort) ? item.effort : "medium";
    const learned = Number(c.learned[effort]);
    const base = learned > 0 ? learned : c.effortMinutes[effort];
    return { minutes: Math.max(5, Math.round(base)), soft: true, from: learned > 0 ? "learned" : "effort" };
  }
  // Fold one observed duration into the running average for that effort level.
  // Weighted so a single odd day can't swing it, and clamped so a task left open
  // over a weekend doesn't teach the app that "medium" means eleven hours.
  function learn(cfg, item, observedMinutes) {
    const c = normaliseConfig(cfg);
    const effort = ["quick", "medium", "draining"].includes(item && item.effort) ? item.effort : "medium";
    const seen = Math.round(observedMinutes);
    if (!(seen > 0) || seen > 4 * 60) return c; // out of range → learn nothing
    const prev = Number(c.learned[effort]) > 0 ? Number(c.learned[effort]) : c.effortMinutes[effort];
    c.learned[effort] = Math.round(prev * 0.8 + seen * 0.2);
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

  window.OrganiserSchedule = {
    occurrencesOf,
    prepKey,
    prepTitle,
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
    fixedBlockAt,
    nextFreeMoment,
    estimateMinutes,
    learn,
    isoOf,
    toMin,
    toHM,
    fmtTime,
    fmtSpan,
    durationWords,
    dayWord,
    uid,
  };
})();
