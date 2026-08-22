// WHO WAS ACTUALLY IN THE ROOM.
//
// Two jobs, and the second is the one that matters most.
//
// The first is small and obvious: you taught something on Tuesday, and three of
// them weren't there for it. The app already knows what was taught and when, so
// once it knows who was in, it can say which targets a particular person has
// simply never been in the room for — which is a completely different problem
// from not having understood them, and needs a completely different response.
//
// The second is the one that ruins your week. A student stops coming. Somebody
// else is dealing with it — the form tutor, the year head, a colleague in
// another department — and you assume it's in hand, because it is, and nobody
// tells you anything because there's nothing you need to do. Then the head
// stands in front of you and asks how they're getting on, and you have no
// answer at all. Not because you didn't care: because nothing ever put the fact
// in front of you. Three weeks of absence is invisible if you only ever see one
// lesson at a time.
//
// So the register is kept for the run, not the day, and a long gap is said out
// loud, early, on a page you look at anyway.
//
// MARK THE EXCEPTIONS, NEVER THE ROOM. Ticking twenty-four names present is a
// job nobody does twice. You tap the ones who aren't there — usually none, often
// one — and everyone else is in by default. That's also how you actually take a
// register in your head: you look for the gaps.
//
// AND "NOT TAKEN" IS NOT "EVERYONE CAME". A day with no register is a day with
// no information, and counting it as full attendance would quietly turn every
// day you were too busy into evidence that nothing is wrong. A session exists
// only once you've taken it.
//
// Nothing here knows what a school is. It knows people in a group, days, and
// who wasn't there.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const clean = (list) =>
    (Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i).slice(0, 200);

  function normalise(r) {
    if (!r || typeof r !== "object") return null;
    const group = String(r.group || "").trim().slice(0, 60);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : "";
    if (!group || !date) return null;
    return {
      id: r.id || "",
      group,
      date,
      slotId: String(r.slotId || "").trim(),
      // Away and late are different facts and are kept apart. Late is not a
      // little bit absent — they were there for most of it.
      away: clean(r.away),
      late: clean(r.late),
      note: String(r.note || "").trim().slice(0, 300),
      at: r.at || "",
    };
  }

  // Taking it again for the same class, same day, same slot REPLACES it. You
  // are correcting the register, not adding a second one — two registers for
  // one lesson would double every count that reads them.
  function take(list, entry, iso) {
    const r = normalise({ ...entry, date: (entry && entry.date) || iso });
    if (!r) return Array.isArray(list) ? list : [];
    const rest = (Array.isArray(list) ? list : []).filter((x) => {
      const n = normalise(x);
      return !n || !(n.group === r.group && n.date === r.date && n.slotId === r.slotId);
    });
    r.id = r.id || `at${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    r.at = r.at || new Date().toISOString();
    return rest.concat([r]);
  }

  // Every register taken for a class, oldest first.
  function sessions(list, group, opts) {
    const o = opts || {};
    return (Array.isArray(list) ? list : [])
      .map(normalise)
      .filter((r) => r && (!group || r.group === group))
      .filter((r) => (!o.since || r.date >= o.since) && (!o.until || r.date <= o.until))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }

  // Was this person away on this day? Null when no register was taken — which
  // is not the same as "they were in", and callers must not read it as such.
  function wasAway(list, who, group, iso) {
    const day = sessions(list, group).filter((s) => s.date === iso);
    if (!day.length) return null;
    return day.some((s) => s.away.includes(who));
  }

  // HOW MUCH ONE PERSON HAS MISSED, and — the part that matters — whether they
  // are missing right now.
  function pattern(list, who, group, iso, opts) {
    const o = opts || {};
    const all = sessions(list, group, { until: iso });
    const recent = o.last ? all.slice(-Math.max(1, Number(o.last) || 10)) : all;
    const away = recent.filter((s) => s.away.includes(who));
    const late = recent.filter((s) => s.late.includes(who));

    // The current run: consecutive most-recent sessions they were away for.
    // This is the number that would have answered the head's question.
    let run = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].away.includes(who)) run++;
      else break;
    }
    const lastIn = [...all].reverse().find((s) => !s.away.includes(who));
    const gap = (from) => Math.round((new Date(iso + "T12:00:00") - new Date(from + "T12:00:00")) / 86400000);
    const daysSinceIn = lastIn ? gap(lastIn.date) : null;
    // HOW OLD THE ANSWER ITSELF IS.
    //
    // A run of three carries on reading as "away the last three times" whether
    // those were last week or last term. After a month off it is describing
    // something that stopped being news in November, in the present tense, at
    // the top of the page. So the date of the most recent register is carried
    // out alongside the run — the fact and its age travel together.
    const lastTaken = all.length ? all[all.length - 1].date : "";
    const daysSinceRegister = lastTaken ? gap(lastTaken) : null;
    return {
      who,
      group,
      sessions: recent.length,
      away: away.length,
      late: late.length,
      // Never a share off fewer than three registers — the same floor as every
      // other count in this app, for the same reason.
      share: recent.length >= 3 ? away.length / recent.length : null,
      run,
      lastIn: lastIn ? lastIn.date : "",
      daysSinceIn,
      lastTaken,
      daysSinceRegister,
      // Nothing has been taken for this class in a fortnight, so whatever this
      // says is about a state of affairs that may well have moved on.
      stale: daysSinceRegister !== null && daysSinceRegister > 14,
      dates: away.map((s) => s.date),
    };
  }

  // WHO IS WORTH A SECOND LOOK, worst first.
  //
  // Ranked, not filtered: everyone is here with their real numbers, so the list
  // never quietly decides that someone's four absences don't count. The flag
  // only changes what's shown loudly, never what's counted.
  function concerns(list, members, group, iso, opts) {
    const o = opts || {};
    const run = Math.max(1, Number(o.run) || 3);
    const share = Number(o.share) > 0 ? Number(o.share) : 0.2;
    const last = Math.max(1, Number(o.last) || 10);
    return (Array.isArray(members) ? members : [])
      .filter((m) => m && m.id && (!group || m.group === group))
      .map((m) => {
        const p = pattern(list, m.id, group || m.group, iso, { last });
        return {
          ...p,
          name: m.name || m.id,
          // Two different worries. A long unbroken run means something is going
          // on NOW and probably needs a question asked today. A high share over
          // a term is a pattern, which is a slower and different conversation.
          missingNow: p.run >= run,
          oftenAway: p.share !== null && p.share >= share,
        };
      })
      .filter((p) => p.away > 0 || p.run > 0)
      .sort((a, b) => b.run - a.run || (b.share || 0) - (a.share || 0) || a.name.localeCompare(b.name));
  }

  // Plain words. Never a judgement about the family, the child or you — a count
  // of registers and a number of days, and a question rather than a verdict.
  function words(p) {
    if (!p.sessions) return "No registers taken for this class yet.";
    if (p.run >= 2) {
      const since = p.daysSinceIn === null ? "" :
        p.daysSinceIn < 14 ? `, last in ${p.daysSinceIn} days ago`
        : `, last in ${Math.round(p.daysSinceIn / 7)} weeks ago`;
      // If no register has been taken for a fortnight, say so first. Otherwise
      // a run from before a holiday reads as something happening this week.
      const old = p.stale
        ? ` The last register for this class was ${
            p.daysSinceRegister < 21 ? `${p.daysSinceRegister} days` : `${Math.round(p.daysSinceRegister / 7)} weeks`
          } ago, so this may have moved on.`
        : "";
      return `Away the last ${p.run} times${since}. Do you know why?${old}`;
    }
    if (!p.away) return `In for all ${p.sessions} registers taken.`;
    const sh = p.share === null
      ? `${p.away} of ${p.sessions}`
      : `${p.away} of ${p.sessions} — ${Math.round(p.share * 100)}%`;
    return `Away ${sh}${p.late ? `, late ${p.late}` : ""}.`;
  }

  function summary(rows, total) {
    if (!total) return "";
    if (!rows.length) return "Nobody has missed a session on the registers taken.";
    const now = rows.filter((r) => r.missingNow).length;
    const often = rows.filter((r) => r.oftenAway && !r.missingNow).length;
    // EVERY ROW IS ACCOUNTED FOR. This counted only the ones it flags, and the
    // list below shows everybody who has missed anything — so a class with one
    // frequent absence and one single day read "1 is away often." over two
    // names. A sentence that summarises a list has to add up to the list, or
    // the reader has to work out which name it meant.
    const rest = rows.length - now - often;
    const bits = [];
    if (now) bits.push(`${now} ${now === 1 ? "has" : "have"} missed several in a row`);
    if (often) bits.push(`${often} ${often === 1 ? "is" : "are"} away often`);
    if (rest > 0) bits.push(`${rest} ${rest === 1 ? "has" : "have"} missed at least one`);
    return bits.join(" · ") + ".";
  }

  // WHAT THEY WEREN'T IN THE ROOM FOR.
  //
  // The join this exists for. A target taught on a day they were away is not
  // something they failed to grasp — it is something they were never offered,
  // and the two need opposite responses. Only counted when a register was
  // actually taken that day: no register means no claim.
  function missed(lessons, list, records, config, who, group) {
    const lv = window.OrganiserLevels;
    const out = new Map();
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught || !l.date || (group && l.group !== group)) return;
      if (wasAway(list, who, l.group, l.date) !== true) return;
      (Array.isArray(l.targets) ? l.targets : []).forEach((code) => {
        const c = String(code || "").trim();
        if (!c) return;
        if (!out.has(c)) out.set(c, { code: c, dates: [], lesson: l.title || "" });
        out.get(c).dates.push(l.date);
      });
    });
    // Were they in for it another time, or judged on it since? Either way it
    // isn't outstanding — the point is what still needs catching up, not a
    // list of every lesson they ever missed.
    const seenElsewhere = new Set();
    (Array.isArray(lessons) ? lessons : []).forEach((l) => {
      if (!l || !l.taught || (group && l.group !== group)) return;
      if (wasAway(list, who, l.group, l.date) === true) return;
      (Array.isArray(l.targets) ? l.targets : []).forEach((c) => seenElsewhere.add(String(c).trim()));
    });
    return [...out.values()]
      .map((r) => {
        const rec = lv ? lv.currentFor(records || [], who, r.code) : null;
        const target = lv ? lv.targetLevel(config) : "";
        return {
          ...r,
          caughtElsewhere: seenElsewhere.has(r.code),
          judged: !!rec,
          level: rec ? rec.level : "",
          // Judged at or above target since means it landed anyway, somehow.
          settled: !!rec && lv && !lv.isStronger(config, target, rec.level),
        };
      })
      .filter((r) => !r.settled)
      .sort((a, b) => (b.dates[b.dates.length - 1] || "").localeCompare(a.dates[a.dates.length - 1] || ""));
  }

  function missedWords(rows) {
    if (!rows.length) return "";
    const fresh = rows.filter((r) => !r.caughtElsewhere).length;
    return fresh
      ? `${fresh} ${fresh === 1 ? "target was" : "targets were"} taught while they were away and haven't been covered with them since.`
      : `Everything they missed has come up again in a lesson they were in.`;
  }

  window.OrganiserAttend = {
    normalise, take, sessions, wasAway, pattern, concerns, words, summary, missed, missedWords,
  };
})();
