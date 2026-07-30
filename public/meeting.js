// MEETING READINESS — the answer to "I thought I was on top of this".
//
// The failure this exists to prevent has two halves, and the second is the
// dangerous one:
//
//   1. You don't realise a meeting is close.
//   2. You DO realise, you feel fine about it, and you're wrong — because
//      "no warnings showing" and "nothing recorded" look identical from the
//      outside.
//
// A checklist you have to remember to press only fixes the first. So this
// speaks first, days ahead, unasked — and it is careful to say which kind of
// empty it is looking at. "Nothing to raise" and "nothing written down" are
// completely different sentences and must never be collapsed into one.
//
// It stays generic (§0.2): a "meeting" is only a block that names some ids. The
// code never learns what a parent, a student, or a review is.
//
// Nothing here judges. It counts what exists and reports the count.

(function () {
  "use strict";

  // Needs schedule.js (to know when a meeting is), export.js (to know what's
  // confirmed) and levels.js (to know what has work behind it). Load all three
  // before this file. It deliberately does NOT fall back if one is missing:
  // guessing "no work attached" when it simply couldn't look would put a false
  // warning in front of someone, which is worse than the page not rendering.
  const S = () => window.OrganiserSchedule;
  const LV = () => window.OrganiserLevels;

  function daysBetween(fromISO, toISO) {
    return Math.round((new Date(toISO + "T12:00:00") - new Date(fromISO + "T12:00:00")) / 86400000);
  }

  // Blocks in the next `lead` days that name at least one id. Each occurrence is
  // returned separately, so a weekly slot doesn't hide the one that's tomorrow.
  function upcoming(schedule, cfg, fromDate) {
    const c = S().normaliseConfig(cfg);
    const start = fromDate instanceof Date ? fromDate : new Date();
    const todayISO = S().isoOf(start);
    const out = [];
    for (let i = 0; i <= c.meetingLeadDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = S().isoOf(d);
      S().blocksOn(schedule, iso)
        .filter((b) => b.about && b.about.length && !b.blocksDay)
        .forEach((b) => {
          // Today's meeting is only still "upcoming" until it starts.
          if (i === 0 && S().toMin(b.end) <= start.getHours() * 60 + start.getMinutes()) return;
          out.push({ block: b, date: iso, daysAway: daysBetween(todayISO, iso) });
        });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || S().toMin(a.block.start) - S().toMin(b.block.start));
  }

  // What you actually have on one id. Counts only; no opinions.
  function readiness(who, records, config) {
    const X = window.OrganiserExport;
    const mine = (records || []).filter((r) => r.who === who);
    const withTopic = mine.filter((r) => r.topic);
    const confirmed = withTopic.filter((r) => !X.needsCheck(r));
    const topics = (config && config.topics) || [];
    const assessed = X.latestLevels(confirmed).size;
    const newest = mine
      .map((r) => r.date || "")
      .filter(Boolean)
      .sort()
      .pop() || "";
    return {
      who,
      total: mine.length,
      withTopic: withTopic.length,
      confirmed: confirmed.length,
      unchecked: withTopic.filter((r) => X.needsCheck(r)).length,
      newestDate: newest,
      ageDays: newest ? daysBetween(newest, S().isoOf(new Date())) : null,
      assessed,
      unassessed: Math.max(0, topics.length - assessed),
      stale: X.staleTopics(who, records || [], config || { topics: [] }),
      old: X.oldTopics(who, records || [], config || { topics: [] }),
      // CONFIDENCE IS NOT EVIDENCE. A level confirmed five times by watching
      // someone has no work behind it — it reads as your strongest judgement
      // and is your thinnest, because there is nothing to put on the table.
      // So "has a level" and "has work" are counted separately, always.
      work: mine.reduce((n, r) => n + LV().fileCount(r), 0),
      noWork: LV().skillsWithoutWork(records || [], who, topics),
      // THE IMPORTANT ONE. Not "no problems found" — "nothing written down".
      empty: mine.length === 0,
    };
  }

  // Plain sentences about what's there, and — separately — what isn't.
  // `blocking` items are the ones that would actually leave you empty-handed.
  function lines(r, config) {
    const topics = (config && config.topics) || [];
    const have = [];
    const missing = [];
    if (r.empty) {
      missing.push({
        text: "nothing logged at all — there'd be nothing to show or talk from",
        blocking: true,
        task: `Write up something for ${r.who} before the meeting`,
      });
      return { have, missing };
    }
    have.push({
      text:
        `${r.confirmed} confirmed record${r.confirmed === 1 ? "" : "s"}` +
        (r.newestDate ? `, newest ${r.ageDays === 0 ? "today" : r.ageDays === 1 ? "yesterday" : `${r.ageDays} days ago`}` : ""),
    });
    if (topics.length) have.push({ text: `${r.assessed} of ${topics.length} skill${topics.length === 1 ? "" : "s"} has a level` });
    // Stated as its own fact, because it's the one an export actually needs.
    if (r.work) have.push({ text: `${r.work} piece${r.work === 1 ? "" : "s"} of work attached` });

    // Levels resting on observation alone. Not nothing — you can still talk
    // from the note — but there'd be nothing to put in front of anyone.
    if (r.assessed && !r.work) {
      missing.push({
        text: "every level is from watching, with no work attached — there'd be nothing to show",
        blocking: true,
        task: `Get a piece of ${r.who}'s work on file`,
      });
    } else if (r.noWork.length) {
      missing.push({
        text: `${r.noWork.length} skill${r.noWork.length === 1 ? "" : "s"} judged with no work attached (${r.noWork.slice(0, 3).join("; ")}${r.noWork.length > 3 ? "…" : ""})`,
        blocking: false,
        task: `Get work on file for ${r.who}`,
      });
    }

    if (!r.confirmed && r.unchecked) {
      missing.push({
        text: `${r.unchecked} record${r.unchecked === 1 ? "" : "s"} still unconfirmed — an export would show nothing`,
        blocking: true,
        task: `Confirm the AI-sorted records for ${r.who}`,
      });
    } else if (r.unchecked) {
      missing.push({
        text: `${r.unchecked} unconfirmed record${r.unchecked === 1 ? "" : "s"} would be left out`,
        blocking: false,
        task: `Confirm the AI-sorted records for ${r.who}`,
      });
    }
    if (r.stale.length) {
      missing.push({
        text: `newest evidence is unconfirmed for ${r.stale.length} skill${r.stale.length === 1 ? "" : "s"} — you'd be showing something older`,
        blocking: false,
        task: `Check the newest evidence for ${r.who}`,
      });
    }
    if (topics.length && r.unassessed === topics.length) {
      missing.push({
        text: `no skill has evidence yet — records exist but none are tied to a skill`,
        blocking: true,
        task: `Tie some of ${r.who}'s records to a skill`,
      });
    } else if (r.unassessed) {
      missing.push({
        text: `${r.unassessed} skill${r.unassessed === 1 ? "" : "s"} with nothing behind ${r.unassessed === 1 ? "it" : "them"} yet`,
        blocking: false,
        task: `Get evidence for ${r.who}'s remaining skills`,
      });
    }
    if (r.old.length) {
      missing.push({
        text: `${r.old.length} level${r.old.length === 1 ? "" : "s"} getting old — worth fresh evidence`,
        blocking: false,
        task: `Get fresh evidence for ${r.who}`,
      });
    }
    return { have, missing };
  }

  // One overall word for a meeting, from the worst thing in it. Deliberately
  // three states, because "fine" and "nothing recorded" must not both be green.
  function verdict(readinesses, config) {
    let worst = "ready";
    readinesses.forEach((r) => {
      const { missing } = lines(r, config);
      if (missing.some((m) => m.blocking)) worst = "empty-handed";
      else if (missing.length && worst === "ready") worst = "thin";
    });
    return worst;
  }

  window.OrganiserMeeting = { upcoming, readiness, lines, verdict, daysBetween };
})();
