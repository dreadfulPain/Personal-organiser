// A GOAL, AS WORK THAT ACTUALLY GETS DONE.
//
// WHY THE OLD VERSION DIDN'T HELP. A goal became milestones, and each milestone
// held STEPS — and a step was a string with a tickbox, living inside the goal.
// Nothing else in the app could see it. It had no size, no date, no deadline. It
// never entered a day plan, was never spread across a week, never appeared in
// "worth knowing now". So a goal was a list you had to remember to go and look
// at, which is precisely the thing this app exists to stop being necessary.
//
// That is why a better breakdown wouldn't have fixed it. The breakdown was
// never the hard part. Deciding what a big thing is made of is a judgement call
// about your situation, and a person — or a proper model — will always do that
// better than this app will. What the app is actually good for is the part that
// comes after: holding it, sizing it, spreading it over the days you really
// have, keeping honest score, and saying early when the sums don't work. That
// is arithmetic, and arithmetic is what a small local program is genuinely
// better at than remembering.
//
// So the division of labour is: YOU (or a model, or a colleague) say what it's
// made of. The app takes it from there and never lets it go quiet.
//
// A DEADLINE IS OPTIONAL. "Get better at marking faster" has no date and needs
// none — it gets progress and a rate and nothing else. "Everything ready for
// parents evening" has a date, and then the arithmetic has teeth: how much is
// left, how many working days, how many minutes a day that means, and whether
// that number is still one you could actually manage.
//
// Nothing here knows what a meeting, a report or a student is. It knows a goal,
// pieces of work, minutes and dates.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Every piece of work belonging to a goal, done or not.
  function workFor(goal, items) {
    if (!goal) return [];
    return (Array.isArray(items) ? items : []).filter(
      (i) => i && typeof i === "object" && i.goalId === goal.id
    );
  }

  // Progress measured in MINUTES, not in things ticked. Ten little jobs and one
  // eight-hour one is not "eleven things"; counting them that way would show 90%
  // done with the whole afternoon still to find. Minutes tell the truth, and the
  // bar can genuinely reach the end — the objection to a whole-goal bar was
  // always that a distant one never fills, not that honesty is bad for you.
  function progress(goal, items, cfg) {
    const S = window.OrganiserSchedule;
    const work = workFor(goal, items);
    let total = 0;
    let done = 0;
    work.forEach((it) => {
      const est = S.estimateMinutes(it, cfg);
      const size = Math.max(est.full, est.spent);
      total += size;
      done += it.done ? size : Math.min(est.spent, size);
    });
    return {
      total,
      done,
      left: Math.max(0, total - done),
      fraction: total > 0 ? Math.min(1, done / total) : 0,
      pieces: work.length,
      piecesDone: work.filter((i) => i.done).length,
    };
  }

  // Working days from one date to another, counting days the schedule leaves
  // you some room. A weekend or a closure day is not a day you can work in, and
  // counting it would make the rate look kinder than it is.
  function daysWithRoom(schedule, cfg, fromISO, toISO) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const out = [];
    if (!toISO || toISO < fromISO) return out;
    for (let i = 0; i < 400; i++) {
      const iso = S.addDaysISO(fromISO, i);
      if (iso > toISO) break;
      const free = S.gapsOn(schedule, c, iso).reduce((n, g) => n + (g.end - g.start), 0);
      if (free >= c.minSessionMinutes) out.push({ iso, free });
    }
    return out;
  }

  // HOW IT'S GOING, and what it would take from here.
  //
  // needPerDay is the number that matters and the number that changes: as days
  // go by without progress it climbs, and watching it climb is the earliest
  // honest signal that this is turning into a rush. When it climbs past what a
  // day can actually hold, that's not a nudge any more — that's the moment to
  // ask for help, for more time, or to drop part of it, and the app should say
  // so while all three are still options.
  function rate(goal, items, schedule, cfg, fromISO) {
    const S = window.OrganiserSchedule;
    const c = S.normaliseConfig(cfg);
    const p = progress(goal, items, cfg);
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test((goal && goal.date) || "") ? goal.date : "";
    const days = deadline ? daysWithRoom(schedule, cfg, fromISO, deadline) : [];
    const daysLeft = days.length;
    // What a day can realistically give this, on average, after the two-thirds
    // rule — the day still has everything else in it.
    const roomPerDay = daysLeft
      ? Math.round((days.reduce((n, d) => n + d.free, 0) / daysLeft) * c.fillFraction)
      : 0;
    const needPerDay = daysLeft > 0 ? Math.ceil(p.left / daysLeft) : 0;

    let verdict = "no deadline";
    if (deadline) {
      if (p.left <= 0) verdict = "done";
      else if (daysLeft === 0) verdict = "out of days";
      else if (needPerDay > roomPerDay) verdict = "more than the days can hold";
      else if (needPerDay > roomPerDay * 0.75) verdict = "tight";
      else verdict = "on track";
    } else if (p.left <= 0 && p.total > 0) verdict = "done";

    return {
      ...p,
      deadline,
      daysLeft,
      roomPerDay,
      needPerDay,
      verdict,
      // How much simply won't fit, if it won't. The number you take to someone.
      short: deadline && daysLeft > 0 ? Math.max(0, p.left - roomPerDay * daysLeft) : 0,
    };
  }

  // A step, as a real piece of work rather than a string in a list.
  //
  // It carries the goal's deadline so the week spreader books it in before then,
  // its own size so a big one is chipped at across days rather than left, and
  // the goal id so the day plan knows why it's there. Everything the rest of the
  // app already does then applies to it without knowing it came from a goal.
  function taskFromStep(goal, step, cfg) {
    const mins = Math.max(0, Math.round(Number(step && step.minutes) || 0));
    return {
      title: (step && step.title ? String(step.title) : "").trim().slice(0, 160),
      type: "task",
      date: /^\d{4}-\d{2}-\d{2}$/.test((goal && goal.date) || "") ? goal.date : "",
      notBefore: /^\d{4}-\d{2}-\d{2}$/.test((step && step.notBefore) || "") ? step.notBefore : "",
      time: "",
      deadlineType: goal && goal.date ? "hard" : "soft",
      importance: "normal",
      effort: mins > 0 ? "draining" : "medium",
      plannedMinutes: mins,
      spentMinutes: 0,
      tags: [],
      whenText: "",
      goalId: goal ? goal.id : "",
      standardId: "",
      openLoop: false,
      promisedTo: "",
      waitingOn: "",
      done: false,
    };
  }

  // Plain words for how it's going. Describes; never judges, never scolds, and
  // never implies the person is the problem when the arithmetic is.
  function words(r) {
    const S = window.OrganiserSchedule;
    if (!r.total) return "Nothing under this yet — add the pieces and it'll start keeping score.";
    if (r.verdict === "done") return "All of it done.";
    const left = `${S.durationWords(r.left)} left of ${S.durationWords(r.total)}`;
    if (!r.deadline) return `${left}. No date on this one, so no rush being measured.`;
    if (r.verdict === "out of days") return `${left}, and the day is here.`;
    const per = `${S.durationWords(r.needPerDay)} a day across the ${r.daysLeft} working day${r.daysLeft === 1 ? "" : "s"} left`;
    if (r.verdict === "more than the days can hold") {
      return `${left}. That's ${per} — more than those days can hold, by about ${S.durationWords(r.short)}. Worth sorting out now rather than later: more time, fewer pieces, or a hand with it.`;
    }
    if (r.verdict === "tight") return `${left}. That's ${per} — doable, but there's not much slack in it.`;
    return `${left}. That's ${per}, which fits comfortably.`;
  }

  window.OrganiserGoalPlan = { workFor, progress, rate, daysWithRoom, taskFromStep, words };
})();
