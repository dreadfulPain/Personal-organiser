// THE ASSESSMENT MODEL — one place that knows how a scale works.
//
// §0.2, the no-hard-coding rule: this file does not know what "Proficient",
// "CCSS" or "reading" mean. It knows only:
//
//     a skill has an ordered list of levels, and levels may have text.
//
// The number of levels, their names, their descriptions, the skills themselves
// and the framework codes on them are ALL editable user data. Point it at a
// three-band apprenticeship scale or a six-band language framework and nothing
// in here changes.
//
// TWO STRUCTURAL FACTS worth stating loudly, because they shape the UI:
//
//   1. THE TARGET IS NOT THE TOP. On a four-point standards scale, level 3 is
//      where most students are meant to sit and level 4 means going beyond it.
//      So the scale is never drawn as a temperature gradient from red to green —
//      that makes the goal look like a near-miss. The target gets a marker; the
//      levels stay neutral.
//   2. LATEST EVIDENCE WINS, never an average, and older evidence is never
//      deleted. The progression IS the valuable part: "here's September, here's
//      now" is a far stronger conversation than one current number, and a
//      questioned judgement needs the trail, not just the conclusion.
//
// Storage note: config.levels is held STRONGEST-FIRST (that's how it has always
// been stored and how the parent wordings line up). Anything visual wants it the
// other way round, so ascending() exists rather than a second stored copy.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Seeded only onto the factory numeric scale — see seedNames() for the guard.
  const DEFAULT_LEVEL_NAMES = { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" };
  const DEFAULT_TARGET = "3";

  function levels(config) {
    return (config && Array.isArray(config.levels) ? config.levels : []).map(String);
  }
  // Weakest → strongest, which is the only order a line should ever be drawn in.
  function ascending(config) {
    return levels(config).slice().reverse();
  }
  function levelName(config, level) {
    const names = (config && config.levelNames) || {};
    const n = names[String(level)];
    return n ? String(n) : "";
  }
  // "3 · Proficient" when named, just "3" when not. Never invents a name.
  function levelLabel(config, level) {
    const n = levelName(config, level);
    return n ? `${level} · ${n}` : String(level);
  }
  function targetLevel(config) {
    const t = config && config.targetLevel ? String(config.targetLevel) : "";
    return levels(config).includes(t) ? t : "";
  }
  function isTarget(config, level) {
    const t = targetLevel(config);
    return !!t && String(level) === t;
  }
  // Strongest is index 0 in storage, so a lower index means a stronger level.
  function rank(config, level) {
    const i = levels(config).indexOf(String(level));
    return i < 0 ? Infinity : i;
  }
  function isStronger(config, a, b) {
    return rank(config, a) < rank(config, b);
  }

  // ---- descriptors: optional at every point --------------------------------
  // Written ONCE per skill and reused across terms, years and schools. They are
  // not per-task rubrics, and nothing in the UI should suggest writing one per
  // piece of work. A skill with no descriptors behaves exactly as before.
  function descriptor(config, skill, level) {
    const all = (config && config.descriptors) || {};
    const forSkill = all[skill];
    if (!forSkill || typeof forSkill !== "object") return "";
    return String(forSkill[String(level)] || "").trim();
  }
  function hasDescriptors(config, skill) {
    const all = (config && config.descriptors) || {};
    const forSkill = all[skill];
    return !!forSkill && Object.keys(forSkill).some((k) => String(forSkill[k] || "").trim());
  }
  // What to show at the moment of judgement. The single-point form — describing
  // only what the target looks like — is a recognised approach in its own right,
  // not a lesser version of writing all four, so it's what gets shown when it's
  // the only thing written.
  function judgingText(config, skill) {
    const t = targetLevel(config);
    const at = t ? descriptor(config, skill, t) : "";
    if (at) return { level: t, text: at, name: levelName(config, t) };
    const asc = ascending(config);
    for (const l of asc) {
      const d = descriptor(config, skill, l);
      if (d) return { level: l, text: d, name: levelName(config, l) };
    }
    return null;
  }
  function setDescriptor(config, skill, level, text) {
    if (!config.descriptors || typeof config.descriptors !== "object") config.descriptors = {};
    const clean = String(text || "").trim();
    if (!config.descriptors[skill]) config.descriptors[skill] = {};
    if (clean) config.descriptors[skill][String(level)] = clean.slice(0, 600);
    else delete config.descriptors[skill][String(level)];
    if (!Object.keys(config.descriptors[skill]).length) delete config.descriptors[skill];
    return config;
  }

  // ---- framework tags on skills --------------------------------------------
  // The same pattern already used for portfolio evidence, one level up: ONE
  // skill statement written in your own words, carrying any number of framework
  // codes. Changing school means re-tagging, not rewriting, and every piece of
  // evidence underneath keeps working.
  function skillTags(config, skill) {
    const all = (config && config.skillTags) || {};
    const t = all[skill];
    return Array.isArray(t) ? t.map(String).filter(Boolean) : [];
  }
  function setSkillTags(config, skill, list) {
    if (!config.skillTags || typeof config.skillTags !== "object") config.skillTags = {};
    const clean = (Array.isArray(list) ? list : [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (clean.length) config.skillTags[skill] = clean;
    else delete config.skillTags[skill];
    return config;
  }
  // Every code in use, for a tag picker. Never a fixed list in code.
  function allTags(config) {
    const all = (config && config.skillTags) || {};
    const set = new Set();
    Object.keys(all).forEach((s) => skillTags(config, s).forEach((t) => set.add(t)));
    return [...set].sort();
  }

  // ---- what a record says about a level ------------------------------------
  // A confirmation stamps the record that's already there rather than writing a
  // new one. Six worksheets at an unchanged level are not six pieces of
  // evidence — the valuable piece is the one that MOVED them, and burying it
  // under repeats makes it harder to find, not easier.
  function confirmations(rec) {
    return Array.isArray(rec && rec.confirmedOn) ? rec.confirmedOn.filter(Boolean) : [];
  }
  function lastConfirmed(rec) {
    return confirmations(rec).slice().sort().pop() || "";
  }
  // The date this judgement was last KNOWN to hold — the evidence date, or a
  // later re-check. Both are shown; they are different facts.
  function asOf(rec) {
    const d = (rec && rec.date) || "";
    const c = lastConfirmed(rec);
    return c > d ? c : d;
  }
  function addConfirmation(rec, iso) {
    if (!rec) return rec;
    if (!Array.isArray(rec.confirmedOn)) rec.confirmedOn = [];
    if (!rec.confirmedOn.includes(iso)) rec.confirmedOn.push(iso);
    return rec;
  }
  // Used when a confirmation turns out to have real work behind it after all —
  // the stamp is replaced by a proper dated record, so the same day isn't
  // counted twice in two places.
  function removeConfirmation(rec, iso) {
    if (!rec || !Array.isArray(rec.confirmedOn)) return rec;
    rec.confirmedOn = rec.confirmedOn.filter((d) => d !== iso);
    if (!rec.confirmedOn.length) delete rec.confirmedOn;
    return rec;
  }

  // ---- confidence is not evidence ------------------------------------------
  // A level confirmed five times by watching someone has no work behind it. It
  // reads as your strongest judgement and is actually your thinnest: there is
  // nothing to put in front of a parent. So "has a level" and "has work" are
  // counted as two different things everywhere, and never collapsed into one.
  function fileCount(rec) {
    return Array.isArray(rec && rec.files) ? rec.files.length : 0;
  }
  function hasWork(rec) {
    return fileCount(rec) > 0;
  }
  // Any work at all behind this person's judgement on this skill, at any level —
  // an older photo still counts as something to show.
  function workFor(records, who, skill) {
    return historyFor(records, who, skill).reduce((n, r) => n + fileCount(r), 0);
  }
  // Skills where a level exists but nothing was ever attached to it.
  function skillsWithoutWork(records, who, topics) {
    return (topics || []).filter((t) => currentFor(records, who, t) && !workFor(records, who, t));
  }

  function sortKey(r) {
    return (r.date || "") + "|" + (r.createdAt || "");
  }

  // Every level ever recorded for one person on one skill, newest first. This is
  // the trail — it is never pruned and there is deliberately no way to prune it
  // from the level views.
  function historyFor(records, who, skill) {
    return (records || [])
      .filter((r) => r.who === who && r.topic === skill && r.level)
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }
  // Where they stand now: the newest evidence, full stop. No averaging, no
  // weighting, no second way of computing a level anywhere in the app.
  function currentFor(records, who, skill) {
    return historyFor(records, who, skill)[0] || null;
  }
  // One skill across everyone: id → their newest record for it.
  function classFor(records, skill) {
    const m = new Map();
    (records || []).forEach((r) => {
      if (r.topic !== skill || !r.level || !r.who) return;
      const cur = m.get(r.who);
      if (!cur || sortKey(r) > sortKey(cur)) m.set(r.who, r);
    });
    return m;
  }

  // Seed names and a target ONLY onto a factory-fresh numeric scale that has
  // never judged anything. A scale someone has edited, or used, is left exactly
  // as they left it — renaming somebody's levels underneath them would be worse
  // than having no names at all.
  function seedNames(config, records) {
    const ls = levels(config);
    const isFactoryNumeric = JSON.stringify(ls) === JSON.stringify(["4", "3", "2", "1"]);
    const named = config.levelNames && Object.keys(config.levelNames).length;
    const used = (records || []).some((r) => r.level);
    if (!isFactoryNumeric || named || used) return false;
    config.levelNames = { ...DEFAULT_LEVEL_NAMES };
    config.targetLevel = DEFAULT_TARGET;
    return true;
  }

  // Kept off the stored config so a hand-edited file can't break the page.
  function normalise(config) {
    if (!config || typeof config !== "object") return config;
    const ls = levels(config);
    const names = {};
    if (config.levelNames && typeof config.levelNames === "object") {
      Object.keys(config.levelNames).forEach((k) => {
        const v = String(config.levelNames[k] || "").trim();
        if (v && ls.includes(String(k))) names[String(k)] = v.slice(0, 40);
      });
    }
    config.levelNames = names;
    config.targetLevel = ls.includes(String(config.targetLevel || "")) ? String(config.targetLevel) : "";
    const desc = {};
    if (config.descriptors && typeof config.descriptors === "object") {
      Object.keys(config.descriptors).forEach((skill) => {
        const forSkill = config.descriptors[skill];
        if (!forSkill || typeof forSkill !== "object") return;
        const clean = {};
        Object.keys(forSkill).forEach((l) => {
          const v = String(forSkill[l] || "").trim();
          // Descriptors for a level that no longer exists are KEPT, not dropped —
          // widening the scale back must not have silently destroyed the writing.
          if (v) clean[String(l)] = v.slice(0, 600);
        });
        if (Object.keys(clean).length) desc[skill] = clean;
      });
    }
    config.descriptors = desc;
    const tags = {};
    if (config.skillTags && typeof config.skillTags === "object") {
      Object.keys(config.skillTags).forEach((skill) => {
        const list = Array.isArray(config.skillTags[skill]) ? config.skillTags[skill] : [];
        const clean = list.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
        if (clean.length) tags[skill] = clean;
      });
    }
    config.skillTags = tags;
    return config;
  }

  window.OrganiserLevels = {
    DEFAULT_LEVEL_NAMES,
    DEFAULT_TARGET,
    levels,
    ascending,
    levelName,
    levelLabel,
    targetLevel,
    isTarget,
    rank,
    isStronger,
    descriptor,
    hasDescriptors,
    judgingText,
    setDescriptor,
    skillTags,
    setSkillTags,
    allTags,
    confirmations,
    lastConfirmed,
    asOf,
    addConfirmation,
    removeConfirmation,
    fileCount,
    hasWork,
    workFor,
    skillsWithoutWork,
    historyFor,
    currentFor,
    classFor,
    seedNames,
    normalise,
  };
})();
