// THE TARGETS YOU TEACH AGAINST, WHICHEVER ONES THEY ARE THIS YEAR.
//
// Pasted in whole and kept as data, for one reason above all others: this is
// the part of a teacher's world that changes without warning. A new school, a
// new year group, a department that switches framework halfway through — and if
// any of that were in the code, changing it would mean changing the app. So the
// app knows only that a target is a code and some words. It has never heard of
// any actual syllabus and never will.
//
// TWO THINGS IT DELIBERATELY WILL NOT DO:
//
//   It will not name a target the model remembered. Nothing here asks anything
//   to recall a standard: matching is done against the text YOU pasted, by
//   comparing words, and the matched line is always shown next to its score. A
//   confidently wrong code on a lesson record is worse than an empty one — it
//   looks authoritative, it gets believed, and it ends up in a report.
//
//   It will not tick a target off by itself. Matching offers candidates in
//   order; attaching one is a tap. The gap between "these words overlap" and
//   "this lesson taught that" is exactly the judgement being asked for, and
//   handing it to a word-count would make every number downstream a fiction.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Words too common to carry meaning in a comparison. Not a language model —
  // just the handful that would otherwise make every target match every other.
  const NOISE = new Set(["the","a","an","and","or","to","of","in","on","for","with","by","as",
    "at","from","that","this","their","they","it","is","are","be","will","can","use","using",
    "student","students","pupil","pupils","learner","learners","able","understand"]);

  // Same set of line endings the lesson-plan parser uses, and for the same
  // reason: a syllabus arrives out of a word processor as often as a plan does.
  const LINE_BREAKS = /\r\n|\r|\n|\u000b|\u000c|\u2028|\u2029/;

  const wordsOf = (s) =>
    String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NOISE.has(w));

  function normaliseTarget(t) {
    if (!t || typeof t !== "object") return null;
    const code = String(t.code || "").trim().slice(0, 40);
    const text = String(t.text || "").trim().slice(0, 500);
    if (!code && !text) return null;
    return {
      // A target with words but no code is fine — plenty of curricula are
      // written as sentences with no reference at all.
      code,
      text,
      // Which broad part of the syllabus it sits in, when the document says.
      strand: String(t.strand || "").trim().slice(0, 80),
    };
  }

  function normalise(syl) {
    if (!syl || typeof syl !== "object") return null;
    const targets = (Array.isArray(syl.targets) ? syl.targets : [])
      .map(normaliseTarget)
      .filter(Boolean)
      .slice(0, 1000);
    if (!targets.length) return null;
    return {
      // Whose syllabus this is, in your words. Shown wherever a code is, so
      // "3.2a" is never ambiguous once you're running two at once.
      name: String(syl.name || "").trim().slice(0, 80),
      targets,
    };
  }

  // READING THE DOCUMENT. Same principle as the lesson plan parser: no model,
  // because a syllabus is a list and a list can be parsed. Handles the shapes
  // they actually arrive in — a code then the words, separated by a tab, a
  // dash, a colon, or just a run of spaces — and lines that are only words.
  function parse(text) {
    const targets = [];
    let strand = "";
    String(text || "")
      .split(LINE_BREAKS)
      .forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        // A code is short, starts with a letter or digit, and has no spaces in
        // it. That is as much as can be said without knowing the framework.
        const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._\-/]{1,30})\s*(?:[\t:—–\-)|]|\s{2,})\s*(.+)$/);
        if (m && /\d/.test(m[1])) {
          targets.push({ code: m[1], text: m[2].trim(), strand });
          return;
        }
        // A bare heading with no code under it is a strand — everything after
        // it belongs to it until the next one.
        if (line.length < 60 && !/[.!?]$/.test(line) && !m) {
          strand = line;
          return;
        }
        targets.push({ code: "", text: line, strand });
      });
    return targets.map(normaliseTarget).filter(Boolean);
  }

  // WHICH TARGETS THIS OBJECTIVE MIGHT BE, best first.
  //
  // Word overlap, scored against the shorter of the two so a long target
  // doesn't drown a short objective. Never a decision — the caller shows these
  // and you pick.
  function match(objective, syl, limit) {
    const s = normalise(syl);
    const want = new Set(wordsOf(objective));
    if (!s || !want.size) return [];
    return s.targets
      .map((t) => {
        const have = wordsOf(`${t.text} ${t.strand}`);
        const shared = have.filter((w) => want.has(w));
        const uniq = [...new Set(shared)];
        return {
          target: t,
          // The words themselves, so the reason for the suggestion is visible
          // rather than a number you have to trust.
          shared: uniq,
          score: uniq.length / Math.max(1, Math.min(want.size, new Set(have).size)),
        };
      })
      .filter((x) => x.shared.length)
      .sort((a, b) => b.score - a.score || b.shared.length - a.shared.length)
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
  }

  // WHAT'S BEEN TAUGHT AND WHAT HASN'T.
  //
  // Counted from targets you attached by hand, never from the matching — so
  // this is a record of your judgements, not of a word-overlap score. Untaught
  // is the interesting half and is returned in full.
  function coverage(lessons, syl, opts) {
    const s = normalise(syl);
    if (!s) return { taught: [], untaught: [], fromOther: [], total: 0, lessons: 0 };
    const o = opts || {};
    const seen = new Map();
    let counted = 0;
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught) return;
      if (o.group && l.group !== o.group) return;
      if (o.since && (l.date || "") < o.since) return;
      counted++;
      (Array.isArray(l.targets) ? l.targets : []).forEach((code) => {
        const k = String(code).trim();
        if (!k) return;
        if (!seen.has(k)) seen.set(k, { code: k, times: 0, last: "" });
        const r = seen.get(k);
        r.times++;
        if ((l.date || "") > r.last) r.last = l.date || "";
      });
    });
    const byCode = new Map(s.targets.filter((t) => t.code).map((t) => [t.code, t]));
    const all = [...seen.values()].map((r) => ({ ...r, target: byCode.get(r.code) || null }));
    return {
      // Only codes that are on the syllabus you are teaching NOW.
      //
      // Swap syllabus — new school, new year group — and lessons keep the codes
      // they were given, which is right: that is what happened. But listing
      // them here would put a row on the page with a code and no words beside
      // it, counted as covered against a target that no longer exists. So the
      // ones from a previous list are separated out and counted, rather than
      // either padding this total or vanishing without a word.
      taught: all
        .filter((r) => r.target)
        .sort((a, b) => b.times - a.times || a.code.localeCompare(b.code)),
      fromOther: all
        .filter((r) => !r.target)
        .sort((a, b) => b.times - a.times || a.code.localeCompare(b.code)),
      // Every target with nothing against it. The whole point — you cannot
      // notice an absence by reading a list of presences.
      untaught: s.targets.filter((t) => t.code && !seen.has(t.code)),
      total: s.targets.length,
      lessons: counted,
    };
  }

  // Plain words. Counts only, and no proportion below three lessons — the same
  // floor as everywhere else, for the same reason.
  function words(c) {
    if (!c.total) return "";
    if (!c.lessons) return `${c.total} targets on file, and no taught lessons attached to any of them yet.`;
    const older = c.fromOther && c.fromOther.length
      ? ` ${c.fromOther.length} more ${c.fromOther.length === 1 ? "code is" : "codes are"} on lessons but not on this list — from an earlier one, kept rather than counted.`
      : "";
    if (c.lessons < 3)
      return `${c.taught.length} of ${c.total} targets covered so far, across ${c.lessons} taught ${c.lessons === 1 ? "lesson" : "lessons"} — early days.${older}`;
    return `${c.taught.length} of ${c.total} targets have had a lesson against them, across ${c.lessons} taught lessons.${older}`;
  }

  window.OrganiserSyllabus = { normalise, normaliseTarget, parse, match, coverage, words, wordsOf };
})();
