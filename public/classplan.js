// WHAT YOU'D WANT IN FRONT OF YOU WHILE YOU PLAN.
//
// Not a lesson plan. The app has no business writing one of those: the format
// isn't yours to choose, it usually has to leave your machine, and deciding
// what a good lesson looks like is the actual job. What the app IS good at is
// the bit that comes before — remembering everything you already know about
// twenty-four people, and laying it out so the planning has something to bite on.
//
// The two questions this answers, which are the two you can't hold in your head:
//
//   WHO needs what. Not a list of levels — a list of names against the thing
//   each one is stuck on, so a plan can have a name in it.
//   HOW MANY are like that. "Nine of twenty-four do better with something to
//   watch" is a fact you can build a lesson around. Twenty-four paragraphs
//   saying roughly that are not, however true each one is.
//
// AND WHAT IT DOESN'T KNOW. Every count says how many people it's actually
// based on, and a share is withheld entirely below three answers — "100% prefer
// video" off two replies out of twenty-four is worse than saying nothing,
// because it will get planned around.
//
// IT SUGGESTS NOTHING. No "consider using a video". You are the teacher; the
// app is the filing cabinet that can count. Everything here is a fact you
// supplied, arranged so it's usable at the moment you're deciding.
//
// Nothing here knows what a class, a subject or a lesson is. It knows people in
// a group, levels against skills, and answers to topics.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Everyone in a group, in a stable order.
  function membersOf(contacts, group) {
    return (Array.isArray(contacts) ? contacts : [])
      .filter((c) => c && c.id && (!group || c.group === group))
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }

  // WHERE EVERYONE STANDS ON ONE SKILL, sorted so the ones who need something
  // are first — that's the order you'd read it in while planning.
  function bySkill(records, config, skill, members) {
    const L = window.OrganiserLevels;
    const target = L.targetLevel(config);
    const rows = members.map((m) => {
      const rec = L.currentFor(records, m.id, skill);
      return {
        id: m.id,
        name: m.name || m.id,
        level: rec ? rec.level : "",
        date: rec ? rec.date : "",
        // Three states, and "nothing recorded" is NOT the same as "behind".
        // Reading them as the same is how a quiet child becomes a problem child.
        state: !rec ? "nothing recorded" : L.isStronger(config, target, rec.level) ? "below" : "at or above",
      };
    });
    const order = { below: 0, "nothing recorded": 1, "at or above": 2 };
    rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
    return {
      skill,
      target: target || "",
      rows,
      below: rows.filter((r) => r.state === "below"),
      unknown: rows.filter((r) => r.state === "nothing recorded"),
      // The number that decides whether this skill is worth a whole lesson or a
      // quiet word with three people.
      share: rows.length ? rows.filter((r) => r.state === "below").length / rows.length : 0,
    };
  }

  // THE WHOLE PICTURE for one group.
  function picture(opts) {
    const o = opts || {};
    const L = window.OrganiserLevels;
    const P = window.OrganiserPastoral;
    const members = membersOf(o.contacts, o.group);
    const cfg = L ? L.normalise(o.recordConfig) : null;
    const skills = (cfg && cfg.skills) || (cfg && cfg.topics) || [];

    const bySkills = L
      ? skills.map((s) => bySkill(o.records || [], o.recordConfig, s, members))
        // Most people stuck on it first: that's the running order of a lesson.
        .sort((a, b) => b.below.length - a.below.length || a.skill.localeCompare(b.skill))
      : [];

    const tallies = P
      ? (o.pastoralTopics || [])
          .map((t) => P.tally(o.pastoralNotes || [], t, members.map((m) => m.id)))
          .filter((t) => t && t.answered > 0)
          .sort((a, b) => b.answered - a.answered)
      : [];

    // Things you've written about individuals that are worth having to hand.
    // Only the recent ones — a note past its shelf life is a confident wrong
    // answer, and planning around one is worse than planning around nothing.
    const notes = P
      ? members.flatMap((m) =>
          P.freshness(o.pastoralNotes || [], o.pastoralTopics || [], m.id, o.today || "")
            .filter((f) => f.state === "recent" && f.latest && f.latest.said && !f.latest.choice)
            .map((f) => ({ id: m.id, name: m.name || m.id, topic: f.topic.label, said: f.latest.said }))
        )
      : [];

    return {
      group: o.group || "",
      members,
      skills: bySkills,
      tallies,
      notes,
      // Nobody has anything recorded at all — say that, rather than drawing an
      // empty page that looks like a class with no needs.
      empty: !members.length || (!bySkills.some((s) => s.rows.some((r) => r.level)) && !tallies.length),
    };
  }

  // Plain words for one skill, for the top of its block.
  function skillWords(s, total) {
    if (!s.rows.length) return "";
    const n = s.below.length;
    const unknown = s.unknown.length;
    const bits = [];
    if (n === 0) bits.push(`nobody below ${s.target || "target"}`);
    else bits.push(`${n} of ${total} below ${s.target || "target"}`);
    if (unknown) bits.push(`${unknown} with nothing recorded yet`);
    return bits.join(" · ");
  }

  // A share, only when enough people answered to mean anything.
  function shareWords(t, option) {
    const share = t.share(option);
    if (share === null) return `${t.counts[option]} of ${t.answered}`;
    return `${t.counts[option]} of ${t.answered} — ${Math.round(share * 100)}%`;
  }

  window.OrganiserClassPlan = { membersOf, bySkill, picture, skillWords, shareWords };
})();
