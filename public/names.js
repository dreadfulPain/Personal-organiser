// NAMES → PEOPLE. A person's name is a fact you can check by looking, so this
// is code, not a model call (§ the grounding rule: only ask a model when the
// question is about meaning).
//
// Three answers, and the difference between them is the whole point:
//
//   MATCHED   — "Helen" is already in People. Link it, silently. Nothing to ask.
//   NEARLY    — People has "Helena" and the note said "Helen". THAT is worth
//               asking about, because a one-letter slip files work against the
//               wrong person and neither of you ever finds out.
//   NEW       — nobody like that. Offer to add them; never add them silently,
//               because a typo would quietly become a permanent contact.
//
// It never decides. It hands you the question with the answer pre-filled.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  // Ordinary edit distance, capped — we only care about "one or two slips".
  function distance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // How close is close enough to be worth asking about? Scaled to length: one
  // slip in a short name is a lot, one in a long name is a typo.
  function nearEnough(a, b) {
    const d = distance(a, b);
    if (d === 0) return true;
    const len = Math.max(a.length, b.length);
    if (len <= 4) return false; // "Ben" vs "Ken" are different people, not a typo
    if (len <= 7) return d === 1;
    return d <= 2;
  }

  // Returns { state: "matched" | "nearly" | "new", contact, suggestions }.
  function look(name, contacts) {
    const wanted = norm(name);
    const list = Array.isArray(contacts) ? contacts.filter((c) => c && c.name) : [];
    if (!wanted) return { state: "new", contact: null, suggestions: [] };

    const exact = list.find((c) => norm(c.name) === wanted);
    if (exact) return { state: "matched", contact: exact, suggestions: [] };

    // "Helen" matching "Helen Zhou" — a first name is how people actually
    // write, and it's a match, not a near-miss.
    const byFirst = list.filter((c) => {
      const parts = norm(c.name).split(" ");
      return parts.includes(wanted) || norm(c.name).startsWith(wanted + " ");
    });
    if (byFirst.length === 1) return { state: "matched", contact: byFirst[0], suggestions: [] };
    // Two people called Helen is exactly when you must be asked, not guessed at.
    if (byFirst.length > 1) return { state: "nearly", contact: null, suggestions: byFirst.slice(0, 4) };

    const near = list.filter((c) => nearEnough(wanted, norm(c.name)) || norm(c.name).split(" ").some((p) => nearEnough(wanted, p)));
    if (near.length) return { state: "nearly", contact: null, suggestions: near.slice(0, 4) };

    return { state: "new", contact: null, suggestions: [] };
  }

  // Every name an entry claims, so one pass can check them all.
  function namesIn(entry) {
    const out = [];
    if (!entry) return out;
    if (entry.kind === "task" && entry.item) {
      if (entry.item.promisedTo) out.push({ field: "promisedTo", name: entry.item.promisedTo });
      if (entry.item.waitingOn) out.push({ field: "waitingOn", name: entry.item.waitingOn });
    }
    if (entry.kind === "handover" && entry.handover && entry.handover.person)
      out.push({ field: "person", name: entry.handover.person });
    return out;
  }

  window.OrganiserNames = { look, namesIn, distance, nearEnough, norm };
})();
