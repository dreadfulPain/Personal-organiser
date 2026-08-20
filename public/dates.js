// HOW THIS APP WRITES A DATE TO A PERSON. One answer, everywhere.
//
// There wasn't one. Every page grew its own, and eight places never got round
// to it at all and printed the raw "2026-09-14" — "away for 2026-09-14,
// 2026-09-21, 2026-09-28" on the attendance page, "due 2026-10-05" on a goal.
// That is the hardest possible way to read a date: eight digits and two
// hyphens, no word to grab, and three of them in a row are indistinguishable
// at a glance. For anybody who finds numbers slippery it is worse than useless.
//
// THIS IS ITS OWN FILE FOR A REASON. The obvious home was schedule.js, and it
// can't be: seven pages don't load the schedule spine and have no business
// doing so — attendance, one person, the class list. Putting it there means
// those pages keep private copies, which is exactly the drift this exists to
// stop. So it lives somewhere every page can afford to load.
//
// §0.2: it knows nothing about school, work or what a date means. It writes
// one down.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  // Midday, always. A date parsed as midnight lands on the day before wherever
  // the clocks are behind UTC, which is most of the world for half the year.
  const at = (iso) => new Date(iso + "T12:00:00");

  // A date, written out. "Today" and "Tomorrow" where those are true, because
  // they are the two you look for most and a name beats a number every time.
  //
  //   opts.year   — include the year (an export, an archive: things you read
  //                 out of context months later)
  //   opts.weekday— include the day name (a plan: knowing it's a Tuesday is
  //                 half the information)
  //   opts.relative — say "Today"/"Tomorrow"/"Yesterday" when they apply
  function dayWords(iso, opts) {
    if (!isISO(iso)) return "";
    const o = opts || {};
    const today = isoOf(new Date());
    if (o.relative !== false) {
      if (iso === today) return "Today";
      const d = at(today);
      d.setDate(d.getDate() + 1);
      if (iso === isoOf(d)) return "Tomorrow";
      d.setDate(d.getDate() - 2);
      if (iso === isoOf(d)) return "Yesterday";
    }
    const fmt = { day: "numeric", month: "short" };
    if (o.weekday !== false) fmt.weekday = "short";
    if (o.year) fmt.year = "numeric";
    return at(iso).toLocaleDateString(undefined, fmt);
  }

  // A list of dates, written out, without repeating the month for every one.
  // "away for 14, 21, 28 Sep" rather than three full dates in a row, which is
  // where the digits blur together worst.
  function daysWords(list, opts) {
    const all = (Array.isArray(list) ? list : []).filter(isISO).sort();
    if (!all.length) return "";
    if (all.length === 1) return dayWords(all[0], opts);
    const month = (iso) => at(iso).toLocaleDateString(undefined, { month: "short" });
    const sameMonth = all.every((d) => d.slice(0, 7) === all[0].slice(0, 7));
    if (!sameMonth)
      return all.map((d) => dayWords(d, { ...(opts || {}), weekday: false, relative: false })).join(", ");
    const nums = all.map((d) => String(Number(d.slice(8, 10))));
    return nums.slice(0, -1).join(", ") + " and " + nums[nums.length - 1] + " " + month(all[0]);
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

  window.OrganiserDates = { dayWords, daysWords, agoWords, isoOf, isISO };
})();
