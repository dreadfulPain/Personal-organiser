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

  // EVERY ANSWER, WITH THE NAMES UNDER IT — including the ones with one name.
  //
  // The counts alone quietly push you towards the majority every time: the
  // biggest bar is the obvious thing to build the lesson round, and the person
  // who is the only one who learns another way becomes a rounding error. Over a
  // term that is the same child missing out every single lesson, and nobody
  // notices, because each individual lesson looked sensible.
  //
  // So the small groups get names too, and are shown the same size as the big
  // ones. A group of one is not a footnote — it's a person, and it's the group
  // most likely to need something planned ON PURPOSE rather than by accident.
  function whoAnswered(notes, topic, members) {
    const P = window.OrganiserPastoral;
    const t = P.normaliseTopic(topic);
    if (!t || !t.options.length) return null;
    const groups = {};
    t.options.forEach((o) => (groups[o] = []));
    const noAnswer = [];
    members.forEach((m) => {
      const latest = P.forPerson(notes, m.id, t.id).find((n) => n.choice);
      if (!latest || !(latest.choice in groups)) {
        noAnswer.push({ id: m.id, name: m.name || m.id });
        return;
      }
      groups[latest.choice].push({ id: m.id, name: m.name || m.id });
    });
    return {
      topic: t,
      // Biggest first for reading, but every one is returned and the page shows
      // them all — the ordering is a convenience, not a filter.
      groups: Object.entries(groups)
        .filter(([, who]) => who.length)
        .sort((a, b) => b[1].length - a[1].length),
      noAnswer,
      // The ones it would be easiest to plan past without noticing.
      smallest: Object.entries(groups)
        .filter(([, who]) => who.length && who.length <= 2)
        .map(([opt, who]) => ({ option: opt, who })),
    };
  }

  // WHO HAS ACTUALLY HAD SOMETHING AIMED AT THEM, and who is still waiting.
  //
  // This is the half the counts can't answer. Planning for the majority is the
  // right call most weeks; doing it every week without noticing is how someone
  // goes a term without a single thing planned with them in mind. The app can
  // keep that score, and it's the same score the rota already keeps: longest
  // since their turn goes first, and a turn missed for reasons that weren't
  // theirs costs them nothing.
  function coverage(members, rota, iso) {
    const R = window.OrganiserRota;
    if (!R || !members.length) return { waiting: [], everSeen: 0, total: members.length };
    const byId = new Map(members.map((m) => [m.id, m.name || m.id]));
    const r = { id: (rota && rota.id) || "targeted", title: "", perDay: 1, minutes: 5,
      everyDays: (rota && rota.everyDays) || 21,
      memberIds: members.map((m) => m.id), lastDone: (rota && rota.lastDone) || {} };
    const q = R.queue(r, iso).map((x) => ({ ...x, name: byId.get(x.id) || x.id }));
    return {
      waiting: q,
      // Never had anything aimed at them at all — the ones that matter most.
      never: q.filter((x) => !x.last),
      overdue: R.overdue(r, iso).map((x) => ({ ...x, name: byId.get(x.id) || x.id })),
      everSeen: q.filter((x) => x.last).length,
      total: members.length,
      everyDays: r.everyDays,
    };
  }

  // Say it as a count and a list of names, never as a score out of the class.
  function coverageWords(c) {
    if (!c.total) return "";
    if (!c.everSeen) return `Nobody has had anything aimed at them yet — that's a starting point, not a failing.`;
    if (c.never.length)
      return `${c.never.length} of ${c.total} haven't had anything planned with them in mind yet.`;
    if (c.overdue.length)
      return `${c.overdue.length} haven't had anything aimed at them in over ${c.everyDays} days.`;
    return `Everyone has had something aimed at them within the last ${c.everyDays} days.`;
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

    // The same topics, but with the NAMES under every answer — see whoAnswered.
    const answers = P
      ? (o.pastoralTopics || [])
          .map((t) => whoAnswered(o.pastoralNotes || [], t, members))
          .filter((x) => x && x.groups.length)
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
      answers,
      notes,
      coverage: coverage(members, o.targeted, o.today || ""),
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

  window.OrganiserClassPlan = {
    membersOf, bySkill, whoAnswered, coverage, coverageWords, picture, skillWords, shareWords,
  };
})();
