// READING A LESSON PLAN YOU WROTE SOMEWHERE ELSE.
//
// The app has no business writing lesson plans — the format isn't yours to
// choose, it usually has to leave your machine, and deciding what a good lesson
// looks like is the actual job. But once you've written one, there are four
// things worth pulling out of it and keeping:
//
//   what you were trying to get them to do,
//   how you went about it,
//   how you checked whether it landed,
//   and what you thought afterwards.
//
// Those four, against a date and a class, are enough to answer questions you
// currently can't answer at all: have I assessed the same way eleven times
// running, did I ever check the objective I wrote in September, which class
// gets my thinnest planning.
//
// NO MODEL IS INVOLVED IN THIS FILE. Lesson plans already have headings — that
// is what a lesson plan IS — so reading one is parsing, not comprehension. A
// parser gives the same answer twice, can be tested, and never invents a
// learning objective that wasn't there. A 14B model does none of those things.
// The AI path in this app is for messy speech, not for structured documents.
//
// SPELLING NEVER MATTERS, rule two of this whole project. Headings are matched
// on letters only, case folded, punctuation dropped — so "Learning Objective:",
// "learning objectives", "LEARNING OBJECTIVE" and "Learnign Objective" all land
// in the same place.
//
// §0.2, no hard-coding: the headings are DATA. There are starting values,
// seeded the same way and for the same reason as the level names in levels.js —
// a feature that does nothing until you configure it does nothing. Every one of
// them is yours to rename, delete or replace, which is what makes this survive
// changing schools, changing year groups, or a department that calls the
// objective a "success criterion". The same is true of the syllabus when it
// arrives: it will be a list you paste in, not a list in here.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Seeded onto a fresh config only — see headings(). Yours the moment you
  // touch them, and never re-seeded over the top of your edits.
  const STARTING_HEADINGS = {
    objective: ["learning objective", "learning objectives", "objective", "objectives",
      "aim", "aims", "lo", "walt", "success criteria", "outcome", "outcomes"],
    ways: ["activities", "activity", "procedure", "lesson outline", "tasks", "task",
      "method", "how", "steps", "sequence", "main", "body"],
    checks: ["assessment", "assessments", "how i will know", "how i'll know", "check",
      "checking", "checks", "plenary", "exit ticket", "evidence", "evaluation"],
  };
  const PARTS = ["objective", "ways", "checks"];

  // Letters and digits only, folded. This is the whole of the spelling policy.
  const fold = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");

  function headings(config) {
    const c = (config && config.headings) || {};
    const out = {};
    PARTS.forEach((p) => {
      const list = Array.isArray(c[p]) ? c[p] : null;
      // An empty array is a deliberate "I don't use this heading", and is
      // respected. Only a missing one gets the starting values.
      out[p] = (list || STARTING_HEADINGS[p]).map((x) => String(x).trim()).filter(Boolean);
    });
    return out;
  }

  function normaliseConfig(config) {
    const c = config && typeof config === "object" ? { ...config } : {};
    c.headings = headings(c);
    return c;
  }

  // Which part, if any, this line is the heading of.
  //
  // Long synonyms match as a prefix, so "Learning objective — to describe..."
  // is a heading with its content on the same line. Short ones ("lo", "aim")
  // must match the whole line, or every word containing them becomes a heading.
  function headingOf(line, hs) {
    const raw = String(line || "").trim();
    if (!raw || raw.length > 120) return null;
    // A BULLET IS CONTENT, always. Without this, "- Assessment of prior
    // learning" sitting in a list of activities reads as the Assessment
    // heading, and every activity written below it is filed as a way of
    // checking. Silently, and only in the plans that happen to say it.
    if (isBullet(raw)) return null;
    const f = fold(raw);
    if (!f) return null;
    for (const part of PARTS) {
      for (const syn of hs[part] || []) {
        const s = fold(syn);
        if (!s) continue;
        if (s.length <= 3 ? f === s : f.startsWith(s)) {
          // What's left on the same line after the heading itself.
          const after = raw.replace(/^[^A-Za-z0-9]*/, "").slice(syn.length).replace(/^[\s:：.\-–—>)]+/, "");
          return { part, rest: fold(after) ? after.trim() : "" };
        }
      }
    }
    // NOTHING MATCHED CLEANLY — so try again allowing for a slip.
    //
    // Rule two of this whole project is that spelling never matters, and a
    // heading is exactly where it would bite hardest: "Activites" instead of
    // "Activities" and the entire lesson goes unread, with no error and no
    // clue. Only whole-line headings are matched this way — a line carrying
    // content as well is long enough that a fuzzy match would be a guess.
    // Reuses the one comparison the app already has, rather than a second
    // opinion about what counts as close: short words must be exact, longer
    // ones may be a letter or two out.
    const N = window.OrganiserNames;
    if (!N || !N.nearEnough) return null;
    for (const part of PARTS) {
      for (const syn of hs[part] || []) {
        const s = fold(syn);
        if (!s || Math.abs(f.length - s.length) > 2) continue;
        if (N.nearEnough(f, s)) return { part, rest: "" };
      }
    }
    return null;
  }

  const isBullet = (line) => /^\s*([-*•·‣▪]|\(?\d+[.)]|[a-z][.)])\s+/i.test(line);
  const unbullet = (line) => line.replace(/^\s*([-*•·‣▪]|\(?\d+[.)]|[a-z][.)])\s+/i, "").trim();

  // THE PARSE. Everything under a heading belongs to it until the next one.
  function parse(text, config) {
    const hs = headings(config);
    const lines = String(text || "").split(/\r?\n/);
    const found = { objective: [], ways: [], checks: [] };
    const before = []; // anything above the first heading — usually the title
    let current = null;
    lines.forEach((line) => {
      const h = headingOf(line, hs);
      if (h) {
        current = h.part;
        if (h.rest) found[current].push(h.rest);
        return;
      }
      const t = line.trim();
      if (!t) return;
      if (!current) { before.push(t); return; }
      found[current].push(isBullet(t) ? unbullet(t) : t);
    });
    return {
      // One line, because that's what an objective is. If it came out as
      // several, they're joined rather than silently dropped.
      objective: found.objective.join(" ").trim().slice(0, 300),
      ways: tidy(found.ways),
      checks: tidy(found.checks),
      title: (before[0] || "").slice(0, 120),
      // What the parse did NOT recognise. Shown on screen, never hidden — if
      // your plan uses headings the app doesn't know, you should find that out
      // by looking at it, not by wondering why a count is low.
      unread: before.slice(1).length,
      // Which parts came back empty, so the page can offer to fix the headings
      // rather than just showing a blank.
      missing: PARTS.filter((p) => !found[p].length),
    };
  }

  function tidy(list) {
    return list
      .map((x) => String(x).trim())
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 40)
      .map((x) => x.slice(0, 200));
  }

  // ---- one lesson -----------------------------------------------------------
  function normalise(l) {
    if (!l || typeof l !== "object") return null;
    const plan = String(l.plan || "");
    const title = String(l.title || "").trim().slice(0, 120);
    // A lesson with neither a plan nor a name is not a lesson.
    if (!plan.trim() && !title) return null;
    return {
      id: l.id || "",
      title,
      date: /^\d{4}-\d{2}-\d{2}$/.test(l.date || "") ? l.date : "",
      slotId: String(l.slotId || "").trim(),
      group: String(l.group || "").trim().slice(0, 60),
      // Which skill it was aimed at — the join to levels, and to what-you-tried.
      skill: String(l.skill || "").trim().slice(0, 60),
      plan: plan.slice(0, 20000),
      objective: String(l.objective || "").trim().slice(0, 300),
      ways: tidy(Array.isArray(l.ways) ? l.ways : []),
      checks: tidy(Array.isArray(l.checks) ? l.checks : []),
      // Afterwards. Kept apart from the plan on purpose: one is what you meant
      // to do and the other is what happened, and merging them loses the gap
      // between the two, which is the interesting part.
      taught: l.taught === true,
      note: String(l.note || "").trim().slice(0, 2000),
      // The job this settles, if you said so. Never guessed — see lessons.js.
      itemId: String(l.itemId || "").trim(),
      at: l.at || "",
    };
  }

  function add(list, lesson, iso) {
    const l = normalise({ ...lesson, date: (lesson && lesson.date) || iso });
    if (!l) return Array.isArray(list) ? list : [];
    l.id = l.id || `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    l.at = l.at || new Date().toISOString();
    return (Array.isArray(list) ? list : []).concat([l]);
  }

  function update(list, id, patch) {
    return (Array.isArray(list) ? list : []).map((x) => {
      if (!x || x.id !== id) return x;
      const merged = normalise({ ...x, ...patch });
      return merged ? { ...merged, id: x.id, at: x.at } : x;
    });
  }

  // Newest first, with the same tie-breaks as everywhere else in this app: the
  // day, then when it was written, then where it sits in the file.
  function recent(list, opts) {
    const o = opts || {};
    return (Array.isArray(list) ? list : [])
      .map((l, i) => ({ l: normalise(l), i }))
      .filter((x) => x.l && (!o.group || x.l.group === o.group) && (!o.slotId || x.l.slotId === o.slotId))
      .sort(
        (a, b) =>
          (b.l.date || "").localeCompare(a.l.date || "") ||
          (b.l.at || "").localeCompare(a.l.at || "") ||
          b.i - a.i
      )
      .map((x) => x.l);
  }

  // ---- the link to whether it worked ---------------------------------------
  //
  // A taught lesson IS a thing you tried: it has a date, a class, a skill and
  // the ways you went about it. Rather than writing a second copy into the
  // what-you-tried store — two records of one event, drifting apart the first
  // time you edit either — the lessons are handed over in that shape when
  // asked. One entry, one truth, and the analysis that already exists does the
  // rest without knowing lessons are a thing.
  function asTried(lessons) {
    const out = [];
    (Array.isArray(lessons) ? lessons : []).forEach((raw) => {
      const l = normalise(raw);
      // Only lessons you actually taught, and only ones aimed at a skill —
      // a plan that was never delivered is not evidence of anything.
      if (!l || !l.taught || !l.skill || !l.date) return;
      l.ways.forEach((w, i) => {
        out.push({ id: `${l.id}:${i}`, what: w, skill: l.skill, date: l.date,
          group: l.group, whoIds: [], note: l.title });
      });
    });
    return out;
  }

  // ---- the mirror -----------------------------------------------------------
  //
  // Counts of what you actually did, and nothing else. No advice, no score, no
  // ranking of your teaching. The point is the things you can't see from the
  // inside — that eleven lessons running were checked the same way, or that one
  // class has had half the planning of another — and the conclusion is yours.
  function mirror(lessons, opts) {
    const o = opts || {};
    const list = recent(lessons, o).filter((l) => !o.since || l.date >= o.since);
    const taught = list.filter((l) => l.taught);
    const count = (getter) => {
      const m = new Map();
      taught.forEach((l) => (getter(l) || []).forEach((v) => {
        const k = String(v).toLowerCase().trim();
        if (!k) return;
        if (!m.has(k)) m.set(k, { what: String(v).trim(), used: 0 });
        m.get(k).used++;
      }));
      return [...m.values()].sort((a, b) => b.used - a.used || a.what.localeCompare(b.what));
    };
    const ways = count((l) => l.ways);
    const checks = count((l) => l.checks);
    const byGroup = new Map();
    list.forEach((l) => {
      const g = l.group || "no class set";
      if (!byGroup.has(g)) byGroup.set(g, { group: g, planned: 0, taught: 0, withPlan: 0, noted: 0 });
      const r = byGroup.get(g);
      r.planned++;
      if (l.taught) r.taught++;
      if (l.plan.trim()) r.withPlan++;
      if (l.note) r.noted++;
    });
    return {
      lessons: list.length,
      taught: taught.length,
      ways,
      checks,
      groups: [...byGroup.values()].sort((a, b) => b.planned - a.planned || a.group.localeCompare(b.group)),
      // An objective you wrote and never checked is the gap this whole thing
      // exists to show. Counted, not scolded about.
      objectiveNotChecked: taught.filter((l) => l.objective && !l.checks.length).length,
      withObjective: taught.filter((l) => l.objective).length,
      noted: taught.filter((l) => l.note).length,
    };
  }

  // Say what's there, and how much it rests on. The same three-is-the-floor
  // rule as everywhere else: below that there are counts and no proportions.
  function mirrorWords(m) {
    if (!m.lessons) return "Nothing logged yet.";
    if (m.taught < 3)
      return `${m.lessons} logged, ${m.taught} taught. Too few to see a pattern in yet — this fills in as you go.`;
    const bits = [`${m.taught} lessons taught`];
    if (m.checks.length && m.checks[0].used >= 3)
      bits.push(`the most-used way of checking appears in ${m.checks[0].used} of them`);
    if (m.objectiveNotChecked)
      bits.push(`${m.objectiveNotChecked} wrote an objective with no way of checking it recorded`);
    if (m.taught - m.noted > 0) bits.push(`${m.taught - m.noted} have no note from afterwards`);
    return bits.join(" · ") + ".";
  }

  window.OrganiserLessonPlan = {
    STARTING_HEADINGS, PARTS, headings, normaliseConfig, headingOf, parse,
    normalise, add, update, recent, asTried, mirror, mirrorWords,
  };
})();
