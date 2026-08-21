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
  // How much you said it matters, as a number to sort by. Only ever what YOU
  // set — the app never decides that something is minor.
  function weight(it) {
    return it && it.importance === "high" ? 0 : it && it.importance === "low" ? 2 : 1;
  }

  // CAN THIS EVEN BE STARTED YET?
  //
  // Some work is genuinely impossible before a date: you cannot write up the
  // notes from a meeting that hasn't happened. Without this the app will
  // cheerfully put "write up the parent meeting notes" in front of you three
  // days before the parent meeting — which is worse than useless, because it
  // looks like being on top of things right up until someone asks for it.
  //
  // A notBefore later than the deadline is a contradiction — almost always a
  // misread phrase — so it's ignored rather than allowed to strand the task.
  function blocked(it, ctx) {
    if (!it.notBefore) return false;
    if (it.date && it.notBefore > it.date) return false; // can't both be true; trust the deadline
    return it.notBefore > ctx.today;
  }

  // Is this worth putting in front of someone today at all?
  function eligible(it, ctx) {
    if (it.openLoop) return false; // open loops have their own louder home — no double-shouting
    if (blocked(it, ctx)) return false; // not yet possible is not the same as not important
    // Optional work is never NAGGED about. It gets offered when there's room —
    // that's a different thing, and it happens in the day plan, not here. But
    // once you've committed to it, it belongs on the list like anything else.
    if (droppable(it)) return false;
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
    // A DEADLINE GETS MORE URGENT AS THE ROOM IN FRONT OF IT RUNS OUT.
    //
    // It used to be a switch: either the day had arrived, or the job sat in the
    // bottom band with everything else. So something due tomorrow ranked
    // exactly the same as something due in three months, and both sat behind a
    // goal task with no deadline at all — right up until the morning it was
    // due, when being told is no use.
    //
    // Tightness is worked out from the whole picture (see weekplan.tightIds):
    // the room left before the deadline against everything already owed to it.
    // Four hours due Friday with three hours free is urgent; ten minutes due
    // Friday is not. Sorted by date after this, so of two tight ones the nearer
    // comes first.
    if (ctx && ctx.tight && ctx.tight.has && ctx.tight.has(it.id)) return 1;
    if (isHigh(it) || it.promisedTo) return 1; // your values, and your word
    if (goalOf(it, ctx)) return 2; // then milestone-pull
    if (dueNow) return 3;
    return 4;
  }
  // CAN THE APP QUIETLY DROP THIS?
  //
  // "Optional" describes where a thing CAME FROM — a nice-to-have, a goal you'd
  // like to get back to. It does not describe whether you can still walk away
  // from it, and treating those as the same thing is wrong in a way that costs
  // other people.
  //
  // A course you'd like to do is optional. A course you have PAID FOR and
  // enrolled on is not, even though the goal it came from was. An appointment
  // you arranged with someone is not, however nice-to-have the reason for it
  // was. The moment something acquires a person expecting you, a time you
  // agreed, or money behind it, the honest options stop being "do it or drop
  // it" and become "do it, or move it and TELL someone".
  //
  // So the app may only withhold work that nobody else is standing behind.
  // Anything else it must keep in front of you — and if it genuinely cannot
  // fit, say so out loud rather than letting it disappear.
  function droppable(it) {
    if (!it || !it.optional) return false;
    if (it.committed) return false; // you said you're in
    if (it.promisedTo) return false; // someone is expecting it
    if (it.time) return false; // a time you set is a time you can be held to
    return true;
  }

  // Optional work always sorts behind committed work, whatever else is true of
  // it. A nice-to-have with a date does not get to push a commitment down.
  // Something optional you've since committed to is NOT behind anything.
  function tier(it) {
    return droppable(it) ? 1 : 0;
  }

  // Why it's here, in plain words. Describes; never judges.
  function reason(it, ctx) {
    // ONLY A PROMISE CAN BE BROKEN. A hard date is one you gave — that one can
    // be overdue. A soft date is a wish about when, and most of them were never
    // typed by anybody: the app puts today on whatever you mention, so calling
    // those overdue tomorrow would build a wall of accusations out of things
    // you only said out loud.
    if (it.date && it.date < ctx.today) return it.deadlineType === "hard" ? "overdue" : "still waiting";
    // AND THE SAME IS TRUE OF TODAY. This said "due today" for any date landing
    // on today, hard or soft — so five things typed this morning with no date on
    // them at all came back stamped "due today", five deadlines the app had
    // invented and then told you about. Nothing was due. It was just today.
    if (it.date && it.date === ctx.today && it.deadlineType === "hard") return "due today";
    if (ctx && ctx.tight && ctx.tight.has && ctx.tight.has(it.id))
      return "little room left before it's due";
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
          tier(a) - tier(b) ||
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
    // THE TAIL IS SORTED TOO. It used to go by tier and then by date, which
    // sounds complete and isn't: everything down here either has no date or has
    // one far enough off that it isn't pressing, so the date decided almost
    // nothing and the rest came out in whatever order the file happened to hold
    // them. A minor job landed ahead of an ordinary one for no reason at all.
    //
    // What you said about how much something matters is the only thing left to
    // go on once nothing is due, so it is what goes on.
    const rest = (items || [])
      .filter((i) => !i.done && !i.openLoop && !taken.has(i.id) && !blocked(i, ctx))
      .sort(
        (a, b) =>
          tier(a) - tier(b) ||
          weight(a) - weight(b) ||
          (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99")
      );
    return first.concat(rest);
  }

  window.OrganiserPriority = { eligible, rank, reason, ordered, forPlanning, blocked, tier, droppable };
})();
