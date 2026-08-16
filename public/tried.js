// WHAT YOU TRIED, AND WHAT HAPPENED AFTER.
//
// This exists because of a question with a bad answer. "Which medium does this
// student learn best from" feels answerable — ask them, they'll tell you, and
// they'll tell you the same thing next term. But a stated preference doesn't
// predict what they'll actually learn from, and planning around one is planning
// around nothing. The app counting it beautifully only makes it worse: a
// percentage and a ranked bar make a guess look like a finding.
//
// The version of that question that CAN be answered runs the other way round.
// Not "what do you like" but "what did I do, and did anything move afterwards".
// The app already keeps levels over time. All that was missing was a record of
// what you did, so the two can be put side by side.
//
// WHAT THIS IS NOT:
//
//   It is not proof. Between two assessments a student also got six weeks
//   older, sat in other lessons and possibly did some revision. A level that
//   moved after you tried something is not a level that moved BECAUSE you tried
//   it, and nothing in this file will ever say otherwise.
//   It is not a score for you. There is no success rate, no ranking of your
//   teaching, and no wording anywhere that treats "didn't move" as a failure.
//
// WHAT IT IS: the only honest evidence available, which is a great deal better
// than asking. Four things worth knowing that it does say out loud:
//
//   · HOW MANY TRIES it's based on, always, and no share at all below three.
//   · NOT FOLLOWED UP YET, counted and shown. This is the big one. You re-check
//     a student when you think something worked, so quietly dropping the ones
//     you never went back to would leave only the successes standing.
//   · ALREADY AT THE TOP, separated out. Someone who can't move up isn't
//     evidence that nothing works.
//   · MORE THAN ONE THING IN THE WINDOW. If you tried two approaches between
//     the same pair of assessments, both of them "worked". The app can't tell
//     which, and says so rather than counting it twice in silence.
//
// AND A DELIBERATE CONSERVATISM: a level recorded on the same day doesn't count
// as movement. What someone can do at the end of the lesson is performance, not
// learning — the two come apart, and often in opposite directions. The follow-up
// has to be a later day to count for anything.
//
// §0.2, no hard-coding: this file has never heard of video, worksheets, group
// work or reading. "What you tried" is a line of your own text. The app learns
// your vocabulary by watching which words you reuse, exactly like areas.js.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  function normalise(t) {
    if (!t || typeof t !== "object") return null;
    // What you did, in your words. Not a category, not a dropdown of media.
    const what = String(t.what || "").trim().slice(0, 80);
    if (!what) return null;
    return {
      id: t.id || "",
      what,
      // Which skill it was aimed at. Without this there is nothing to join to,
      // so an entry with no skill is kept but can never show an outcome.
      skill: String(t.skill || "").trim().slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : "",
      // Who it reached: a group, specific people, or both.
      group: String(t.group || "").trim().slice(0, 60),
      whoIds: (Array.isArray(t.whoIds) ? t.whoIds : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 200),
      note: String(t.note || "").trim().slice(0, 400),
      at: t.at || "",
    };
  }

  function add(list, entry, iso) {
    const t = normalise({ ...entry, date: (entry && entry.date) || iso });
    if (!t) return Array.isArray(list) ? list : [];
    t.id = t.id || `y${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    t.at = t.at || new Date().toISOString();
    return (Array.isArray(list) ? list : []).concat([t]);
  }

  // Did this reach that person? Either named directly, or in the group it was
  // aimed at. Group membership is read at the time of asking, not stored — a
  // student who joined last week was not in the lesson you taught last term,
  // but the app cannot know that, so this is stated rather than hidden: see
  // `viaGroup` on the outcome.
  function reached(t, whoId, contacts) {
    if (t.whoIds.includes(whoId)) return "named";
    if (!t.group) return "";
    const c = (Array.isArray(contacts) ? contacts : []).find((x) => x && x.id === whoId);
    return c && c.group === t.group ? "group" : "";
  }

  // Everything you tried that reached one person, newest first.
  function forPerson(list, whoId, contacts, skill) {
    return (Array.isArray(list) ? list : [])
      .map((t, i) => ({ t: normalise(t), i }))
      .filter((x) => x.t && reached(x.t, whoId, contacts) && (!skill || x.t.skill === skill))
      .sort((a, b) => (b.t.date || "").localeCompare(a.t.date || "") || b.i - a.i)
      .map((x) => x.t);
  }

  // THE JOIN. Where they stood before, where they stood next time you looked.
  //
  // Before is the newest judgement on or before the day; after is the oldest one
  // strictly after it. Same-day is deliberately counted as "before" — see the
  // note at the top about performance not being learning.
  function outcome(records, config, who, skill, iso) {
    const L = window.OrganiserLevels;
    if (!L || !skill || !iso) return { state: "no skill" };
    const hist = L.historyFor(records || [], who, skill); // newest first
    const before = hist.find((r) => (r.date || "") <= iso) || null;
    const afterList = hist.filter((r) => (r.date || "") > iso);
    const after = afterList.length ? afterList[afterList.length - 1] : null; // oldest after

    if (!before && !after) return { state: "nothing recorded", before: null, after: null };
    // Nothing to compare against. Not a failure — a starting point that happens
    // to be missing, which is worth saying rather than scoring as "no change".
    if (!before) return { state: "no level beforehand", before: null, after };
    if (!after) {
      return {
        state: "not followed up yet",
        before,
        after: null,
        // The one that keeps this honest. You go back and re-check when you
        // think it worked; if these vanished, only the wins would be left.
        atCeiling: L.rank(config, before.level) === 0,
      };
    }
    const up = L.isStronger(config, after.level, before.level);
    const down = L.isStronger(config, before.level, after.level);
    return {
      state: up ? "moved up" : down ? "moved down" : "stayed the same",
      before,
      after,
      // Already at the strongest level: staying there is not evidence of
      // nothing happening, and counting it as such punishes the best outcomes.
      atCeiling: L.rank(config, before.level) === 0,
      days: dayGap(before.date, after.date),
    };
  }

  function dayGap(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  }

  // How many OTHER things you tried sat between the same two assessments. If
  // that's more than nought, this movement belongs to all of them equally and
  // to none of them in particular.
  function alsoInWindow(list, contacts, who, skill, iso, out) {
    if (!out || !out.before || !out.after) return [];
    return forPerson(list, who, contacts, skill)
      .filter((t) => t.date > (out.before.date || "") && t.date <= (out.after.date || "") && t.date !== iso)
      .map((t) => t.what);
  }

  // EVERYTHING YOU TRIED, GROUPED BY WHAT IT WAS.
  //
  // One row per approach, with what happened after each time you used it. The
  // counts are of TRIES, never of students — the same student appearing twice is
  // two tries, and pretending otherwise would overstate what this rests on.
  function byApproach(list, records, config, contacts, people) {
    const ids = (Array.isArray(people) ? people : []).map((p) => (p && p.id) || p).filter(Boolean);
    const rows = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const t = normalise(raw);
      if (!t) return;
      ids.forEach((who) => {
        if (!reached(t, who, contacts)) return;
        const out = outcome(records, config, who, t.skill, t.date);
        const key = t.what.toLowerCase();
        if (!rows.has(key))
          rows.set(key, { what: t.what, tries: 0, up: 0, same: 0, down: 0,
            waiting: 0, ceiling: 0, unknown: 0, skills: new Set(), muddled: 0, cases: [] });
        const r = rows.get(key);
        r.tries++;
        if (t.skill) r.skills.add(t.skill);
        const also = alsoInWindow(list, contacts, who, t.skill, t.date, out);
        if (also.length) r.muddled++;
        if (out.state === "moved up") r.up++;
        else if (out.state === "stayed the same") out.atCeiling ? r.ceiling++ : r.same++;
        else if (out.state === "moved down") r.down++;
        else if (out.state === "not followed up yet") r.waiting++;
        else r.unknown++;
        r.cases.push({ who, skill: t.skill, date: t.date, state: out.state,
          before: out.before ? out.before.level : "", after: out.after ? out.after.level : "",
          days: out.days || null, alsoTried: also });
      });
    });
    return [...rows.values()]
      .map((r) => ({
        ...r,
        skills: [...r.skills],
        // Only the tries that could show movement at all. Everything else is
        // excluded from the denominator AND reported, rather than dropped.
        judged: r.up + r.same + r.down,
      }))
      // Most-used first. NOT most-successful — ranking approaches by a success
      // rate off four tries is exactly the false precision this file exists to
      // avoid, and putting it in an order implies a verdict.
      .sort((a, b) => b.tries - a.tries || a.what.localeCompare(b.what));
  }

  // Plain words for one approach. Never "this works" — always "here is what
  // happened, and here is how much it rests on".
  function words(r) {
    if (!r.tries) return "";
    const bits = [];
    if (r.judged < 3) {
      // Below three there is no share, only the raw counts. A "100% success
      // rate" off two tries is worse than saying nothing at all.
      bits.push(
        r.judged
          ? `${r.up} of ${r.judged} moved up afterwards — too few to read anything into yet`
          : `nothing to compare yet`
      );
    } else {
      bits.push(`${r.up} of ${r.judged} moved up afterwards`);
    }
    if (r.waiting) bits.push(`${r.waiting} not looked at again yet`);
    if (r.ceiling) bits.push(`${r.ceiling} already at the top`);
    return bits.join(" · ");
  }

  // The sentence that has to sit above the whole thing, every time.
  function caveat(rows) {
    const muddled = rows.reduce((n, r) => n + r.muddled, 0);
    const waiting = rows.reduce((n, r) => n + r.waiting, 0);
    const base = "What happened after, not what caused it — between two judgements a student also got older and sat in other lessons.";
    const extra = [];
    if (waiting) extra.push(`${waiting} ${waiting === 1 ? "try has" : "tries have"} had no second look yet`);
    if (muddled) extra.push(`${muddled} had something else tried in the same gap, so the two can't be told apart`);
    return extra.length ? `${base} ${extra.join(", and ")}.` : base;
  }

  // Words you've used before, so the box can offer them back rather than making
  // you retype — and so the same thing doesn't end up counted under three
  // spellings. Learned from use; nothing is built in.
  function vocabulary(list) {
    const seen = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const t = normalise(raw);
      if (!t) return;
      const k = t.what.toLowerCase();
      if (!seen.has(k)) seen.set(k, { what: t.what, used: 0 });
      seen.get(k).used++;
    });
    return [...seen.values()].sort((a, b) => b.used - a.used || a.what.localeCompare(b.what));
  }

  window.OrganiserTried = {
    normalise, add, reached, forPerson, outcome, alsoInWindow, byApproach, words, caveat, vocabulary,
  };
})();
