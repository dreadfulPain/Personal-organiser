// COMING BACK TO IT, BEFORE IT GOES.
//
// Something taught once and never returned to is mostly gone within a month.
// Coming back to it after a day, then a week, then a month is the cheapest
// thing a teacher can do about that, and the only reason it doesn't happen is
// that nobody can hold thirty of those dates in their head at once.
//
// So the app holds them. It knows what you taught and when, because a kept
// lesson carries its targets and its date; the rest is arithmetic.
//
// THE GAPS ARE YOURS. A day, a week, a month is the usual shape and it's what
// this starts with, but the numbers are data like everything else here —
// change them, add a fourth, cut it to two. The app has no opinion about what
// the right spacing is and no business having one.
//
// IT LANDS ON A LESSON, NOT ON A DATE. "Review this on Saturday" is useless if
// you don't see that class on Saturday. So a review due on a day you don't
// teach them moves forward to the next time you actually do, and says so.
//
// RE-TEACHING IS REVIEWING. If you covered the same target again in a later
// lesson, that review happened — it doesn't matter that it wasn't labelled as
// one. Each time you come back to something, the next gap gets longer, which is
// the whole point of spacing them out.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // A day, a week, a month. Yours to change — see the note above.
  const STARTING_GAPS = [1, 7, 30];

  function gaps(config) {
    const g = config && Array.isArray(config.reviewDays) ? config.reviewDays : null;
    const clean = (g || STARTING_GAPS)
      .map((n) => Math.round(Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 3650)
      .slice(0, 8);
    // An empty list is a deliberate "I don't want this", and is respected.
    return g ? clean : STARTING_GAPS.slice();
  }

  const addDays = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const dayGap = (a, b) =>
    Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

  // WHEN YOU NEXT SEE THAT CLASS.
  //
  // A review due on a day you don't teach them is not a review, it's a note you
  // will scroll past. So it moves to the next occurrence of the slot the lesson
  // was taught in. No slot, or a slot that runs on no days, means the date
  // itself stands — better a plain date than pretending to know the timetable.
  function nextSitting(schedule, slotId, fromISO, limitDays) {
    const S = window.OrganiserSchedule;
    const slot = (Array.isArray(schedule) ? schedule : []).find((s) => s && s.id === slotId);
    const days = slot && Array.isArray(slot.days) ? slot.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
    // A DAY WRITTEN OFF IS NOT A DAY YOU SEE THEM. The timetable says you teach
    // 9A on Mondays; it does not say the Monday in question is the first day of
    // the winter break. Checking only the day of the week lands every review
    // that falls in a holiday on a day the school is shut — which is precisely
    // the case this exists to handle, since a month off is exactly when
    // something taught before it needs coming back to.
    const off = (iso) => !!(S && S.dayIsBlocked && S.dayIsBlocked(schedule, iso));
    // With no slot there is still a holiday to avoid, so this runs either way.
    const cap = Math.max(1, Math.min(365, Number(limitDays) || 60));
    for (let i = 0; i <= cap; i++) {
      const iso = addDays(fromISO, i);
      if (off(iso)) continue;
      if (!days.length || days.includes(new Date(iso + "T12:00:00").getDay()))
        return { date: iso, moved: i > 0, slot: slot || null };
    }
    return { date: fromISO, moved: false, slot: slot || null };
  }

  // EVERY OCCASION A TARGET WAS TAUGHT, oldest first, per class.
  //
  // Per class deliberately: teaching something to 9A says nothing whatsoever
  // about when 9B last saw it, and merging them would quietly mark a review as
  // done for a class that never had it.
  function occasions(lessons) {
    const by = new Map();
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught || !l.date) return;
      (Array.isArray(l.targets) ? l.targets : []).forEach((code) => {
        const c = String(code || "").trim();
        if (!c) return;
        const key = `${l.group || ""}|${c}`;
        if (!by.has(key)) by.set(key, { group: l.group || "", code: c, dates: [], slotId: "" });
        const r = by.get(key);
        r.dates.push(l.date);
        // The slot most recently used for it — that's where the reminder lands.
        if (!r.slotId || l.date >= r.dates[r.dates.length - 2]) r.slotId = l.slotId || r.slotId;
      });
    });
    by.forEach((r) => r.dates.sort());
    return [...by.values()];
  }

  // WHAT'S DUE TO BE COME BACK TO.
  //
  // For each target in each class: how many times you've been back to it so
  // far, and therefore which gap applies next. Everything already covered as
  // many times as there are gaps is finished and drops out.
  function due(lessons, config, schedule, iso, opts) {
    const o = opts || {};
    const g = gaps(config);
    if (!g.length) return [];
    return occasions(lessons)
      .filter((r) => !o.group || r.group === o.group)
      .map((r) => {
        const times = r.dates.length;
        if (times > g.length) return null; // been back to it enough
        const last = r.dates[r.dates.length - 1];
        const gap = g[times - 1];
        if (!Number.isFinite(gap)) return null;
        const wanted = addDays(last, gap);
        const sitting = nextSitting(schedule, r.slotId, wanted);
        return {
          group: r.group,
          code: r.code,
          taught: r.dates,
          times,
          // Which of your gaps this is — "the second time back", not a number
          // out of context.
          round: times,
          rounds: g.length,
          wanted,
          // The day you actually see them next, which is when it can happen.
          on: sitting.date,
          moved: sitting.moved,
          slot: sitting.slot ? sitting.slot.label || "" : "",
          overdueBy: Math.max(0, dayGap(sitting.date, iso)),
          state: sitting.date > iso ? "coming" : sitting.date === iso ? "today" : "overdue",
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          // Overdue first, longest overdue at the top; then what's coming.
          b.overdueBy - a.overdueBy || (a.on || "").localeCompare(b.on || "") ||
          String(a.code).localeCompare(String(b.code))
      );
  }

  // Plain words for one row. Never an instruction — a date and a count.
  function words(r) {
    const when =
      r.state === "today"
        ? "today"
        : r.state === "overdue"
          ? `${r.overdueBy} ${r.overdueBy === 1 ? "day" : "days"} ago`
          : `on ${r.on}`;
    const moved = r.moved ? ` — first lesson you have them after ${r.wanted}` : "";
    return `${nth(r.round)} time back, ${when}${moved}`;
  }

  function nth(n) {
    return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
  }

  // A count for the top of the block. Nothing below is a failing — a review not
  // yet done is a review not yet done.
  function summary(rows) {
    const over = rows.filter((r) => r.state === "overdue").length;
    const today = rows.filter((r) => r.state === "today").length;
    if (!rows.length) return "Nothing waiting to be come back to.";
    const bits = [];
    if (today) bits.push(`${today} ready today`);
    if (over) bits.push(`${over} past the day ${over === 1 ? "it" : "they"} came up`);
    const coming = rows.length - over - today;
    if (coming) bits.push(`${coming} coming`);
    return bits.join(" · ") + ".";
  }

  window.OrganiserReview = { STARTING_GAPS, gaps, occasions, nextSitting, due, words, summary };
})();
