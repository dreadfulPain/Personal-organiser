// WHAT YOU KNOW ABOUT SOMEONE, BESIDES THEIR MARKS.
//
// How they're getting on. Who they sit with. Whether they say anything in
// class. The things a parent asks about first and a mark book cannot answer —
// and which you do know, but only in the way you know things while you're busy,
// which is to say not reliably at four o'clock in front of their mother.
//
// TOPICS ARE DATA. This file does not know what "socially" or "speaking up"
// means. It knows that you keep a handful of topics, that each has a shelf life,
// and that a note has a topic, a date and some words. Point it at anything.
//
// SHELF LIFE IS THE POINT. A note about who someone's friends are is true for
// about a month with a young class. Held past that it isn't a record any more,
// it's a confident wrong answer — worse than an empty space, because an empty
// space makes you go and look. So every topic carries how long it stays true
// for, and the app asks again rather than letting the old answer stand.
//
// Read on screen, never exported — same standing as told.js, enforced the same
// way: nothing in this file builds a document or sends anything anywhere.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // A topic is a heading with a shelf life. Yours to write, rename or delete.
  function normaliseTopic(t) {
    if (!t || typeof t !== "object") return null;
    const label = String(t.label || "").trim().slice(0, 60);
    if (!label) return null;
    return {
      // A TOPIC MUST HAVE AN ID, and a blank one is not a harmless blank.
      // forPerson() reads a missing topic id as "any topic", so a topic saved
      // without one would quietly show the newest note about that person under
      // every heading — the same sentence four times, each under the wrong
      // title, and no error anywhere. Derived from the label, so it's the same
      // id every time rather than a new one on each read.
      id: String(t.id || "").trim() || "t:" + label.toLowerCase(),
      label,
      // How long a note on this stays worth trusting. A month for the things
      // that change, a term for the things that don't.
      staysFreshDays: Math.max(1, Math.min(365, Math.round(Number(t.staysFreshDays) || 30))),
      // Must you have this, or would it merely be good to? Feeds straight into
      // the committed-vs-optional split — nothing new to learn.
      essential: t.essential === true,
      // Shown at the top during a call, or kept a tap away.
      upFront: t.upFront === true,
      // A TOPIC CAN BE A CHOICE RATHER THAN A SENTENCE.
      //
      // "How they get on socially" wants words. "How they learn best" wants one
      // of a few answers — and the difference matters, because only the second
      // can be COUNTED. "Nine of twenty-four do better with something to watch"
      // is a fact you can plan a lesson around; twenty-four paragraphs saying
      // roughly that are not, however true each one is.
      //
      // Empty means free text, which stays the default. The options are yours;
      // this file has no idea what any of them mean.
      options: (Array.isArray(t.options) ? t.options : [])
        .map((o) => String(o || "").trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 12),
    };
  }

  function normaliseNote(n) {
    if (!n || typeof n !== "object") return null;
    const who = String(n.who || "").trim().slice(0, 60);
    const said = String(n.said || "").trim().slice(0, 800);
    // A choice on its own is a complete answer — you shouldn't have to write a
    // sentence as well just to record which of four boxes someone is in.
    if (!who || (!said && !String(n.choice || "").trim())) return null;
    return {
      id: n.id || "",
      who, // an id from your own list, never a name typed in here
      topicId: String(n.topicId || "").trim(),
      // Which of the topic's options this is, when the topic has any. Kept
      // separately from the words so it can be counted without reading them.
      choice: String(n.choice || "").trim().slice(0, 40),
      said: said || String(n.choice || "").trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(n.date || "") ? n.date : "",
      at: n.at || "",
    };
  }

  function add(notes, note, iso) {
    const n = normaliseNote({ ...note, date: (note && note.date) || iso });
    if (!n) return Array.isArray(notes) ? notes : [];
    n.id = n.id || `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    n.at = n.at || new Date().toISOString();
    return (Array.isArray(notes) ? notes : []).concat([n]);
  }

  // Newest first, and the tie-breaks are not a nicety.
  //
  // Correcting something you wrote an hour ago gives two notes with the SAME
  // DATE. Sorting on the date alone leaves them in the order they were written,
  // so the app keeps the answer you just changed — on the person's page, in
  // every count, everywhere — and says nothing about it.
  //
  // So: the date, then `at` (the moment it was written, which is what "newest"
  // actually means), then where it sits in the file. That last one is the only
  // one that can never tie: notes are added to the end, so later in the list is
  // later in life, and two taps inside the same millisecond still come out in
  // the right order.
  function forPerson(notes, whoId, topicId) {
    return (Array.isArray(notes) ? notes : [])
      .map((n, i) => ({ n: normaliseNote(n), i }))
      .filter((x) => x.n && x.n.who === whoId && (!topicId || x.n.topicId === topicId))
      .sort(
        (a, b) =>
          (b.n.date || "").localeCompare(a.n.date || "") ||
          (b.n.at || "").localeCompare(a.n.at || "") ||
          b.i - a.i
      )
      .map((x) => x.n);
  }

  // The most recent thing you wrote under each topic, and whether it has gone
  // past its shelf life. This is the whole answer to "what do I actually have
  // on this person, and how much of it do I still believe".
  function freshness(notes, topics, whoId, iso) {
    return (Array.isArray(topics) ? topics : [])
      .map(normaliseTopic)
      .filter(Boolean)
      .map((t) => {
        const latest = forPerson(notes, whoId, t.id)[0] || null;
        const age = latest && latest.date
          ? Math.round((new Date(iso + "T12:00:00") - new Date(latest.date + "T12:00:00")) / 86400000)
          : null;
        return {
          topic: t,
          latest,
          ageDays: age,
          // Never asked: no note at all. Stale: there is one, but it's older
          // than this topic stays true for. The words matter — "never asked" is
          // a gap, "stale" is a thing to check, and neither is a failure.
          state: !latest ? "never asked" : age > t.staysFreshDays ? "worth checking again" : "recent",
        };
      });
  }

  // What to go and find out, most-worth-doing first: things you must have and
  // have never asked, then things you must have that have gone stale, then the
  // same for the nice-to-haves. Whether any of it actually gets planned is the
  // day plan's business, and it decides that on room, not on this order.
  function gaps(notes, topics, whoId, iso) {
    const rank = (f) =>
      (f.topic.essential ? 0 : 2) + (f.state === "never asked" ? 0 : 1);
    return freshness(notes, topics, whoId, iso)
      .filter((f) => f.state !== "recent")
      .sort((a, b) => rank(a) - rank(b));
  }

  // HOW A WHOLE GROUP ANSWERS ONE TOPIC. The countable half of the picture.
  //
  // Only the most recent answer per person counts — someone who was "reading"
  // in September and "video" in November is one person who changed their mind,
  // not two people.
  function tally(notes, topic, whoIds) {
    const t = normaliseTopic(topic);
    const ids = Array.isArray(whoIds) ? whoIds : [];
    if (!t || !t.options.length) return null;
    const counts = {};
    t.options.forEach((o) => (counts[o] = 0));
    let answered = 0;
    ids.forEach((id) => {
      const latest = forPerson(notes, id, t.id).find((n) => n.choice);
      if (!latest) return;
      if (!(latest.choice in counts)) return; // an option you've since removed
      counts[latest.choice]++;
      answered++;
    });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return {
      topic: t,
      counts,
      ranked,
      answered,
      asked: ids.length,
      // Never a percentage of PEOPLE unless enough of them answered — "100%
      // prefer video" off two replies out of twenty-four is worse than silence.
      share: (o) => (answered >= 3 ? counts[o] / answered : null),
    };
  }

  // Counts only — the one thing that may be shown outside the person's own
  // screen. A number of notes, never a word of what's in them.
  function summary(notes, topics, whoId, iso) {
    const f = freshness(notes, topics, whoId, iso);
    return {
      topics: f.length,
      recent: f.filter((x) => x.state === "recent").length,
      neverAsked: f.filter((x) => x.state === "never asked").length,
      notes: forPerson(notes, whoId).length,
    };
  }

  window.OrganiserPastoral = {
    normaliseTopic, normaliseNote, add, forPerson, freshness, gaps, summary, tally,
  };
})();
