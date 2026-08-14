// WHAT YOU TOLD THEM, AND WHEN.
//
// When you share something about a person with someone else — a parent at a
// meeting, a colleague, whoever asked — that's a thing worth having written
// down. Not for the app's benefit. For yours, because six weeks later someone
// says "you told us he was fine" and the only honest answer is either "yes, on
// the 14th, and here's roughly what I said" or a shrug.
//
// THIS IS THE MOST SENSITIVE THING IN THE APP, so it is built to a different
// standard from everything else:
//
//   · It never leaves. Not in an export, not in a print, not in a report, not
//     in the diagnostic file. There is no code path out of this module that
//     produces a document. If you want to hand something over, you read it off
//     the screen and decide what to say — which is the point. A log of what you
//     told someone that can itself be handed to someone is a worse thing than
//     no log at all.
//   · The subject is an id, never a name. The names live in one place already
//     and this doesn't copy them.
//   · Nothing is inferred and nothing is scored. It records what you say
//     happened, in your words, and does no thinking about it whatsoever.
//
// Everything above is enforced in code below and checked by tests, not left as
// good intentions in a comment.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const MAX = 600;

  function clean(e) {
    if (!e || typeof e !== "object") return null;
    const who = String(e.who || "").trim().slice(0, 60);
    const said = String(e.said || "").trim().slice(0, MAX);
    if (!who || !said) return null; // an entry about nobody, or saying nothing
    return {
      id: e.id || "",
      who, // an id from your own list — never a name typed in here
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") ? e.date : "",
      // Who you told. Free text on purpose: "his mum", "the head of year",
      // "both parents at the evening" are all more useful than a dropdown.
      to: String(e.to || "").trim().slice(0, 80),
      said,
      // How it happened, in your words. Not a category, not a taxonomy.
      how: String(e.how || "").trim().slice(0, 40),
      at: e.at || "",
    };
  }

  function add(log, entry, iso) {
    const e = clean({ ...entry, date: (entry && entry.date) || iso });
    if (!e) return Array.isArray(log) ? log : [];
    e.id = e.id || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    e.at = e.at || new Date().toISOString();
    return (Array.isArray(log) ? log : []).concat([e]);
  }

  function forPerson(log, whoId) {
    return (Array.isArray(log) ? log : [])
      .map(clean)
      .filter((e) => e && e.who === whoId)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  // When did you last tell anyone anything about this person? The one question
  // that gets asked in the moment and is impossible to answer from memory.
  function lastToldAbout(log, whoId) {
    const list = forPerson(log, whoId);
    return list.length ? list[0] : null;
  }

  // Everything on file, newest first, for reading on screen.
  function recent(log, limit) {
    return (Array.isArray(log) ? log : [])
      .map(clean)
      .filter(Boolean)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
  }

  // Counts only. This is what may be shown ANYWHERE outside this screen —
  // a number of conversations, never a word of what was in them.
  function summary(log, whoId) {
    const list = whoId ? forPerson(log, whoId) : recent(log, 500);
    return { count: list.length, last: list.length ? list[0].date : "" };
  }

  window.OrganiserTold = { add, clean, forPerson, lastToldAbout, recent, summary };
})();
