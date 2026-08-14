// GOING ROUND A LIST, ONE AT A TIME.
//
// Some work isn't one job, it's the same small job done for every name on a
// list, over and over: a few minutes each, cycling through, so that by the end
// of a few weeks everyone has had a turn and you have something to say about
// all of them. It's the shape of a one-to-one, a check-in, a phone round, a
// stock count — the code doesn't know which.
//
// TWO RULES, both from what actually happens rather than what would be tidy:
//
//   Nobody is skipped because of something that wasn't their doing. If the day
//   the app offered you Wei got eaten by a crisis, Wei does not go to the back
//   of the queue and wait another fortnight for it. The cycle carries on as
//   planned for everyone else — they shouldn't lose their turn either — and the
//   missed one is offered again at the first opportunity, on top.
//
//   Longest since their last turn goes first. That's the only ordering rule,
//   and it makes both of the above fall out on their own: a missed turn is by
//   definition the longest-waiting, so it comes back round immediately without
//   anything needing to be pushed out of the way.
//
// Nothing here knows what the names are. It takes a list of ids and a record of
// when each was last done, and answers "who's next".
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // rota = { id, title, memberIds: [], perDay: 1, minutes: 10, everyDays: 14,
  //          lastDone: { memberId: "YYYY-MM-DD" }, optional: true }
  function normalise(r) {
    if (!r || typeof r !== "object") return null;
    const ids = Array.isArray(r.memberIds)
      ? r.memberIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (!ids.length) return null;
    const lastDone = {};
    if (r.lastDone && typeof r.lastDone === "object") {
      Object.keys(r.lastDone).forEach((k) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.lastDone[k])) lastDone[k] = r.lastDone[k];
      });
    }
    return {
      id: r.id || "",
      title: (r.title || "").toString().trim().slice(0, 80),
      memberIds: ids,
      perDay: Math.max(1, Math.min(20, Math.round(Number(r.perDay) || 1))),
      minutes: Math.max(1, Math.min(240, Math.round(Number(r.minutes) || 10))),
      // How often everyone should come round. Used only to say how it's going —
      // it never forces anyone's turn earlier than the queue would.
      everyDays: Math.max(1, Math.min(365, Math.round(Number(r.everyDays) || 14))),
      lastDone,
      // A rota is optional work by default: it's the good habit that should give
      // way when the committed work is heavy, and come back when it lifts.
      optional: r.optional !== false,
    };
  }

  // Longest since their last turn, first. Never had a turn sorts before
  // everyone — you can't be further behind than never.
  function queue(rota, iso) {
    const r = normalise(rota);
    if (!r) return [];
    return r.memberIds
      .map((id) => ({
        id,
        last: r.lastDone[id] || "",
        waited: r.lastDone[id]
          ? Math.round((new Date(iso + "T12:00:00") - new Date(r.lastDone[id] + "T12:00:00")) / 86400000)
          : Infinity,
      }))
      .sort((a, b) => b.waited - a.waited || String(a.id).localeCompare(String(b.id)));
  }

  // Who's up today. Just the front of the queue — no cleverness, because the
  // queue ordering has already done the work.
  function due(rota, iso) {
    const r = normalise(rota);
    if (!r) return [];
    return queue(r, iso).slice(0, r.perDay);
  }

  // Anyone who has waited longer than a full cycle. Not "late" and not anyone's
  // fault — just the honest state of the list, for showing.
  function overdue(rota, iso) {
    const r = normalise(rota);
    if (!r) return [];
    return queue(r, iso).filter((x) => x.waited > r.everyDays);
  }

  // A turn happened. The only mutation, and it's one line of state.
  function mark(rota, memberId, iso) {
    const r = normalise(rota);
    if (!r || !r.memberIds.includes(memberId)) return rota;
    return { ...r, lastDone: { ...r.lastDone, [memberId]: iso } };
  }

  // Today's turn as an ordinary piece of work, so the day plan handles it like
  // everything else: sized, optional by default, and never spread ahead — a
  // one-to-one on a fixed future date isn't a rota, it's an appointment.
  function taskFor(rota, memberId, label, iso) {
    const r = normalise(rota);
    if (!r) return null;
    return {
      title: (label || memberId).toString().slice(0, 160),
      type: "task",
      date: iso,
      notBefore: "",
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: r.minutes <= 15 ? "quick" : r.minutes <= 45 ? "medium" : "draining",
      plannedMinutes: r.minutes,
      spentMinutes: 0,
      optional: r.optional,
      rotaId: r.id,
      rotaMemberId: memberId,
      tags: [],
      whenText: "",
      goalId: "",
      standardId: "",
      openLoop: false,
      promisedTo: "",
      waitingOn: "",
      done: false,
    };
  }

  // How the round is going, in plain terms. Counts, never a percentage of
  // people — "nine of twenty-four" reads as a mark out of twenty-four.
  function state(rota, iso) {
    const r = normalise(rota);
    if (!r) return { total: 0, seen: 0, waiting: 0, longest: 0 };
    const q = queue(r, iso);
    const seen = q.filter((x) => x.waited <= r.everyDays).length;
    const longest = q.length && Number.isFinite(q[0].waited) ? q[0].waited : Infinity;
    return {
      total: q.length,
      seen,
      waiting: q.length - seen,
      longest,
      everyDays: r.everyDays,
    };
  }

  window.OrganiserRota = { normalise, queue, due, overdue, mark, taskFor, state };
})();
