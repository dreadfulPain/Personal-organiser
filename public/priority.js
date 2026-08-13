// WHAT MATTERS — the one definition of it, used in two places.
//
// The Home shortlist and the Day plan both have to answer "what should be in
// front of me?". If each had its own copy of that answer they would drift, and
// the app would quietly start disagreeing with itself — which is exactly the
// thing it exists to stop happening in your head.
//
// The signals (§0.2): urgency (a hard deadline that's arrived), importance (your
// own "matters a lot"), a promise made to someone, and milestone-pull (a task
// linked to a goal you chose). Milestone-pull is the ungameable one — your goals
// can't be set by other people — but it is a boost, NEVER an override: it can
// never jump ahead of a hard deadline that's due today.
//
// ctx = { today: "YYYY-MM-DD", goalTitle: (id) => string }

(function () {
  "use strict";

  function goalOf(it, ctx) {
    return ctx && typeof ctx.goalTitle === "function" ? ctx.goalTitle(it.goalId) : "";
  }
  function isHigh(it) {
    return it.importance === "high";
  }

  // Is this worth putting in front of someone today at all?
  function eligible(it, ctx) {
    if (it.openLoop) return false; // open loops have their own louder home — no double-shouting
    const dueNow = it.date && it.date <= ctx.today;
    if (it.deadlineType === "hard" && dueNow) return true;
    if (isHigh(it)) return true;
    if (it.promisedTo) return true;
    if (goalOf(it, ctx)) return true;
    if (it.date) return true;
    return false; // floaty, not important, not toward a goal → not a "today" thing
  }

  // Lower is more pressing. 0 is reserved for the guard.
  function rank(it, ctx) {
    const dueNow = it.date && it.date <= ctx.today;
    if (it.deadlineType === "hard" && dueNow) return 0; // always first
    if (isHigh(it) || it.promisedTo) return 1; // your values, and your word
    if (goalOf(it, ctx)) return 2; // then milestone-pull
    if (dueNow) return 3;
    return 4;
  }

  // Why it's here, in plain words. Describes; never judges.
  function reason(it, ctx) {
    if (it.date && it.date < ctx.today) return "overdue";
    if (it.date && it.date === ctx.today) return "due today";
    if (it.promisedTo) return "promised to " + it.promisedTo;
    if (isHigh(it)) return "matters a lot";
    const g = goalOf(it, ctx);
    if (g) return "toward " + g;
    return "";
  }

  // Eligible items, most pressing first.
  function ordered(items, ctx) {
    return (items || [])
      .filter((i) => !i.done && eligible(i, ctx))
      .sort(
        (a, b) =>
          rank(a, ctx) - rank(b, ctx) ||
          (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99")
      );
  }

  // FILLING A DAY IS A DIFFERENT QUESTION FROM WHAT TO NAG ABOUT.
  //
  // Home asks "what should I put in front of you?" — and "order whiteboard pens"
  // is rightly not that. The day plan asks something else: "there's an hour and
  // fifty minutes free, what could go in it?" Answering that with ordered() —
  // the nag list — means undated ordinary work is never offered any of the free
  // time, so the plan looks sparse while the backlog quietly grows. Measured on
  // a normal week that was two hours a day left blank with four real jobs
  // waiting, and the two-thirds comfort limit never once reached.
  //
  // So: the pressing things first, in pressing order, then everything else to
  // fill what's left. The limit still stops it, and nothing here changes what
  // Home shows.
  function forPlanning(items, ctx) {
    const first = ordered(items, ctx);
    const taken = new Set(first.map((i) => i.id));
    const rest = (items || [])
      .filter((i) => !i.done && !i.openLoop && !taken.has(i.id))
      .sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
    return first.concat(rest);
  }

  window.OrganiserPriority = { eligible, rank, reason, ordered, forPlanning };
})();
