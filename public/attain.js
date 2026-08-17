// WHAT THEY GOT, AGAINST WHAT YOU TAUGHT.
//
// The syllabus answers "where are we as a class" only in the thinnest sense:
// which targets have had a lesson pointed at them. Having taught something is
// not the same as anyone having learnt it, and a coverage page that stops there
// will happily show a full green wall over a class that got none of it.
//
// So this is the other half. Three questions, and they are genuinely different:
//
//   ONE PERSON — where are they on each target, and which parts need work.
//   ONE TARGET, WHOLE CLASS — did enough of them get it to move on, or does it
//   need going over again.
//   AND WHAT ISN'T KNOWN — which is the answer more often than either.
//
// NOTHING NEW IS STORED. A record already has a person, a topic, a level and a
// date, and a topic is just a string — so a target code is a topic, and the
// whole history mechanism that already exists works on targets unchanged.
// Latest evidence wins, older evidence is kept, the trail is the valuable part.
//
// THE SCALE IS YOURS. "Learnt it / can use it / mastered it" is three points on
// the same ordered list the rest of the app uses. This file has no idea what
// any of them mean, only which is stronger.
//
// AND IT DOES NOT DECIDE. It will say nineteen of twenty-four are at or above
// where you set the bar and five aren't. It will never say "move on" — that
// depends on which five, on what's next, and on how long you have, none of
// which is knowable from here.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const L = () => window.OrganiserLevels;

  // WHERE ONE PERSON IS on every target that's been taught to their class.
  //
  // Taught but never judged is its own state and is the interesting one — it is
  // not the same as "not got it", and reading them as the same is how a quiet
  // child ends up looking like a struggling one.
  function forPerson(records, config, lessons, syllabus, who, group) {
    const lv = L();
    if (!lv) return [];
    const S = window.OrganiserSyllabus;
    const syl = S ? S.normalise(syllabus) : null;
    const byCode = new Map((syl ? syl.targets : []).filter((t) => t.code).map((t) => [t.code, t]));
    const target = lv.targetLevel(config);

    // Only targets their class has actually been taught — judging someone
    // against something never covered is a mark for your planning, not theirs.
    const taught = new Map();
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught || (group && l.group !== group)) return;
      (Array.isArray(l.targets) ? l.targets : []).forEach((c) => {
        const k = String(c || "").trim();
        if (!k) return;
        if (!taught.has(k) || l.date > taught.get(k)) taught.set(k, l.date || "");
      });
    });

    return [...taught.entries()]
      .map(([code, lastTaught]) => {
        const rec = lv.currentFor(records || [], who, code);
        return {
          code,
          text: byCode.has(code) ? byCode.get(code).text : "",
          strand: byCode.has(code) ? byCode.get(code).strand : "",
          lastTaught,
          level: rec ? rec.level : "",
          date: rec ? rec.date : "",
          // Three states, and the middle one is not a bad mark.
          state: !rec
            ? "not judged yet"
            : lv.isStronger(config, target, rec.level)
              ? "below"
              : "at or above",
          history: lv.historyFor(records || [], who, code).length,
        };
      })
      .sort((a, b) => {
        const order = { below: 0, "not judged yet": 1, "at or above": 2 };
        return order[a.state] - order[b.state] || String(a.code).localeCompare(String(b.code));
      });
  }

  // What this person needs work on: the below-target ones, most-recently-taught
  // first, because that's the one still fresh enough to go back to.
  function needsWork(rows, limit) {
    return rows
      .filter((r) => r.state === "below")
      .sort((a, b) => (b.lastTaught || "").localeCompare(a.lastTaught || ""))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 8)));
  }

  // ONE TARGET ACROSS A CLASS. The counts, and nothing but the counts.
  function forClass(records, config, members, code) {
    const lv = L();
    const ids = (Array.isArray(members) ? members : []).map((m) => (m && m.id) || m).filter(Boolean);
    if (!lv || !ids.length) return { code, counts: {}, at: 0, below: 0, unjudged: 0, total: 0 };
    const target = lv.targetLevel(config);
    const counts = {};
    let at = 0, below = 0, unjudged = 0;
    const namesBelow = [], namesUnjudged = [];
    const byId = new Map((Array.isArray(members) ? members : []).map((m) => [(m && m.id) || m, (m && m.name) || m]));
    ids.forEach((id) => {
      const rec = lv.currentFor(records || [], id, code);
      if (!rec) { unjudged++; namesUnjudged.push({ id, name: byId.get(id) || id }); return; }
      counts[rec.level] = (counts[rec.level] || 0) + 1;
      if (lv.isStronger(config, target, rec.level)) { below++; namesBelow.push({ id, name: byId.get(id) || id }); }
      else at++;
    });
    return {
      code,
      counts,
      // Strongest first, matching how the scale is stored, so the row reads the
      // same way round as everywhere else in the app.
      ranked: lv.levels(config).map((l) => [l, counts[l] || 0]).filter(([, n]) => n > 0),
      at,
      below,
      unjudged,
      total: ids.length,
      judged: at + below,
      namesBelow,
      namesUnjudged,
      target,
    };
  }

  // THE WHOLE CLASS, TARGET BY TARGET — what's solid and what isn't.
  function picture(records, config, lessons, syllabus, members, group) {
    const S = window.OrganiserSyllabus;
    const syl = S ? S.normalise(syllabus) : null;
    const byCode = new Map((syl ? syl.targets : []).filter((t) => t.code).map((t) => [t.code, t]));
    const taught = new Set();
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught || (group && l.group !== group)) return;
      (Array.isArray(l.targets) ? l.targets : []).forEach((c) => {
        const k = String(c || "").trim();
        if (k) taught.add(k);
      });
    });
    const rows = [...taught].map((code) => {
      const r = forClass(records, config, members, code);
      const t = byCode.get(code);
      return { ...r, text: t ? t.text : "", strand: t ? t.strand : "" };
    });
    return {
      // Most people below where you set the bar, first. That is the running
      // order of what to go back over, if you decide to go back over anything.
      rows: rows.sort((a, b) => b.below - a.below || b.unjudged - a.unjudged || String(a.code).localeCompare(String(b.code))),
      taught: rows.length,
      // Nothing judged at all is a different page from a class with problems.
      anyJudged: rows.some((r) => r.judged > 0),
    };
  }

  // Plain words for one target. Counts and names, never a verdict.
  //
  // The temptation here is enormous: the caller wants to be told "move on" or
  // "go again", and one line of code would say it. It would also be wrong about
  // half the time, because it depends on WHICH five are behind, what comes next
  // and how many weeks are left — none of which is in this file.
  function classWords(r) {
    if (!r.total) return "";
    if (!r.judged) return `Nobody judged on this yet, out of ${r.total}.`;
    const bits = [`${r.at} of ${r.judged} judged are at or above ${r.target || "target"}`];
    if (r.below) bits.push(`${r.below} below`);
    if (r.unjudged) bits.push(`${r.unjudged} not judged`);
    return bits.join(" · ") + ".";
  }

  // For one person, in the same spirit.
  function personWords(rows) {
    if (!rows.length) return "Nothing taught to this class has been recorded against the syllabus yet.";
    const below = rows.filter((r) => r.state === "below").length;
    const un = rows.filter((r) => r.state === "not judged yet").length;
    const at = rows.length - below - un;
    const bits = [`${at} of ${rows.length} at or above target`];
    if (below) bits.push(`${below} below`);
    if (un) bits.push(`${un} not judged yet`);
    return bits.join(" · ") + ".";
  }

  window.OrganiserAttain = { forPerson, needsWork, forClass, picture, classWords, personWords };
})();
