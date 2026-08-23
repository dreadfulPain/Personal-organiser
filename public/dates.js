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
  // A CLOCK TIME, WRITTEN THE ONE WAY.
  //
  // Five files had their own version of this and no two were the same. One of
  // them — the week's — insisted on a two-digit hour, which is the exact
  // difference that has already cost this app once: a time stored "9:05" was
  // pinned by the planner and showed as nothing at all in the list, so the row
  // said one thing and the plan another. That was found and fixed in app.js,
  // and left standing in week.js, because there were five of them.
  //
  // One or two digits for the hour. Anything that isn't a time is nothing,
  // never midnight — a blank is visibly missing, and midnight is a lie you act
  // on.
  function timeWords(hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm == null ? "" : hm).trim());
    if (!m) return "";
    const h = Number(m[1]);
    const mins = Number(m[2]);
    if (h > 23 || mins > 59) return "";
    return new Date(2000, 0, 1, h, mins).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function dayWords(iso, opts) {
    if (!isISO(iso)) return "";
    const o = opts || {};
    const today = isoOf(new Date());
    if (o.relative !== false) {
      // Some places say it mid-sentence ("noted today") and want it lower case.
      // That was one of the small differences that had six pages each keeping
      // their own copy of this function.
      const said = (w) => (o.lower ? w.toLowerCase() : w);
      if (iso === today) return said("Today");
      const d = at(today);
      d.setDate(d.getDate() + 1);
      if (iso === isoOf(d)) return said("Tomorrow");
      d.setDate(d.getDate() - 2);
      if (iso === isoOf(d)) return said("Yesterday");
    }
    // A document handed to somebody else writes the month out — "22 August
    // 2026" rather than "22 Aug" — and that is the only difference, so it lives
    // here rather than in two more private copies of this function.
    const fmt = { day: "numeric", month: o.long ? "long" : "short" };
    if (o.weekday !== false) fmt.weekday = "short";
    // A DIFFERENT YEAR ALWAYS SAYS SO. "Tue, Feb 2" for something seventeen
    // months out reads as this coming February — the same words the app uses
    // for a date six weeks away — and the one number that tells them apart was
    // the one being left off. Asking for the year still forces it on; not
    // asking no longer means "hide it even when it matters".
    if (o.year || iso.slice(0, 4) !== today.slice(0, 4)) fmt.year = "numeric";
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

  // Today, as yyyy-mm-dd. Fourteen files worked this out for themselves, in
  // four different spellings — all agreeing, which is exactly the state nameOf
  // and fmtTime were in before one of them was quietly changed.
  const today = () => isoOf(new Date());

  window.OrganiserDates = { timeWords, dayWords, daysWords, agoWords, isoOf, isISO, today };
})();
