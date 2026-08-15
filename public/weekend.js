// WHERE THE WEEKENDS ARE GOING.
//
// A weekend is not blocked off and shouldn't be. Sometimes the only way a big
// thing gets done is a quiet Sunday morning, and an app that refuses to plan
// into one is just wrong about how the job works.
//
// But the reason to keep them open is that YOU chose to use one — not that they
// quietly became a fifth and sixth working day. Those two look identical from
// the inside, week to week, and only tell themselves apart over a couple of
// months, by which point it's a habit rather than a decision. Nobody notices
// the drift while it's happening; that's the whole nature of it.
//
// So the weekends stay open and get COUNTED. What went in, how many weekends
// running, and — if you've said which part of your life a piece of work belongs
// to — how it splits. The point isn't a total. It's the split and the streak:
// six hours on a Saturday for something of your own is a good weekend, and six
// hours of marking is a different thing entirely, and a total can't tell them
// apart.
//
// AREAS ARE YOURS. This file has no idea what "work" or "personal" mean. It
// groups by whatever label you put on a piece of work, and if you haven't put
// any on, it says so rather than guessing.
//
// DESCRIBES, NEVER JUDGES. It reports what happened. Whether five weekends
// running is too many is not the app's call — but it IS the app's job to make
// sure you're the one deciding, with the number in front of you.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const isWeekend = (iso) => {
    const d = new Date(iso + "T12:00:00").getDay();
    return d === 0 || d === 6;
  };
  // Which weekend a date belongs to, named by its Saturday, so a Sunday and the
  // Saturday before it count as one weekend rather than two.
  function weekendOf(iso) {
    const S = window.OrganiserSchedule;
    const d = new Date(iso + "T12:00:00").getDay();
    if (d === 6) return iso;
    if (d === 0) return S.addDaysISO(iso, -1);
    return "";
  }

  // worked: { "YYYY-MM-DD": { total: minutes, areas: { label: minutes } } }
  function normalise(worked) {
    const out = {};
    if (!worked || typeof worked !== "object") return out;
    Object.keys(worked).forEach((iso) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      const d = worked[iso] || {};
      const total = Math.max(0, Math.round(Number(d.total) || 0));
      const areas = {};
      if (d.areas && typeof d.areas === "object") {
        Object.keys(d.areas).forEach((k) => {
          const v = Math.max(0, Math.round(Number(d.areas[k]) || 0));
          if (v > 0) areas[String(k).slice(0, 40)] = v;
        });
      }
      if (total > 0) out[iso] = { total, areas };
    });
    return out;
  }

  // Add minutes to a day's tally. The only writer.
  //
  // A job in more than one area counts its FULL time under each — a training
  // session is two hours of work and two hours of getting better at the job,
  // not one hour of each. That means the areas can add up to more than the
  // total, which is correct and is why the total is kept separately rather than
  // summed from the parts.
  function record(worked, iso, minutes, areas) {
    const w = normalise(worked);
    const mins = Math.max(0, Math.round(Number(minutes) || 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "") || mins < 1) return w;
    const day = w[iso] || { total: 0, areas: {} };
    day.total += mins;
    const list = Array.isArray(areas) ? areas : areas ? [areas] : [];
    list
      .map((a) => String(a || "").trim().slice(0, 40))
      .filter(Boolean)
      .forEach((key) => { day.areas[key] = (day.areas[key] || 0) + mins; });
    w[iso] = day;
    return w;
  }

  // The last N weekends, newest first, each with what went into it.
  function recent(worked, todayISO, howMany) {
    const S = window.OrganiserSchedule;
    const w = normalise(worked);
    const n = Math.max(1, Math.min(52, Math.round(Number(howMany) || 8)));
    const out = [];
    // Walk back to the most recent Saturday, then step back a week at a time.
    let cur = todayISO;
    for (let i = 0; i < 8 && !isWeekend(cur); i++) cur = S.addDaysISO(cur, -1);
    let sat = weekendOf(cur) || S.addDaysISO(todayISO, -7);
    for (let i = 0; i < n; i++) {
      const sun = S.addDaysISO(sat, 1);
      const a = w[sat] || { total: 0, areas: {} };
      const b = w[sun] || { total: 0, areas: {} };
      const areas = {};
      [a, b].forEach((d) => Object.keys(d.areas).forEach((k) => (areas[k] = (areas[k] || 0) + d.areas[k])));
      out.push({ saturday: sat, total: a.total + b.total, areas, used: a.total + b.total > 0 });
      sat = S.addDaysISO(sat, -7);
    }
    return out;
  }

  // HOW IT'S BEEN GOING. Counts and a split — never a verdict on the person.
  function look(worked, todayISO, howMany, opts) {
    const o = opts || {};
    const list = recent(worked, todayISO, howMany || 8);
    const used = list.filter((x) => x.used);
    const total = list.reduce((n, x) => n + x.total, 0);
    // A run of weekends worked, counting back from the most recent one.
    let streak = 0;
    for (const x of list) {
      if (!x.used) break;
      streak++;
    }
    const areas = {};
    list.forEach((x) => Object.keys(x.areas).forEach((k) => (areas[k] = (areas[k] || 0) + x.areas[k])));
    // Areas can overlap, so the labelled total is NOT their sum — it's the time
    // that carried at least one label. Anything else would report 140%.
    const labelled = list.reduce((n, x) => n + (Object.keys(x.areas).length ? x.total : 0), 0);
    // Which area is taking the most, and what share of the labelled time.
    const ranked = Object.entries(areas).sort((a, b) => b[1] - a[1]);
    const biggest = ranked.length ? { area: ranked[0][0], minutes: ranked[0][1] } : null;
    return {
      weekends: list.length,
      used: used.length,
      streak,
      total,
      perUsedWeekend: used.length ? Math.round(total / used.length) : 0,
      areas,
      ranked,
      biggest,
      labelled,
      unlabelled: Math.max(0, total - labelled),
      list,
      // The one thing worth saying out loud, if anything is.
      concern:
        streak >= (o.streakConcern || 4)
          ? "run"
          : biggest && labelled > 0 && biggest.minutes / labelled >= (o.shareConcern || 0.8) && used.length >= 3
            ? "lopsided"
            : "",
    };
  }

  function words(v) {
    const S = window.OrganiserSchedule;
    if (!v.used) return `Nothing recorded on a weekend in the last ${v.weekends}. `.trim();
    const base =
      `${v.used} of the last ${v.weekends} weekends had work in them` +
      (v.total ? `, ${S.durationWords(v.total)} altogether` : "") + ".";
    if (v.concern === "run") {
      return (
        `${base} That's ${v.streak} in a row. Worth knowing rather than worth worrying about — ` +
        `but if it wasn't a run of choices, it's the kind of thing that's easier to change now than in a term's time.`
      );
    }
    if (v.concern === "lopsided" && v.biggest) {
      const pct = Math.round((v.biggest.minutes / v.labelled) * 100);
      return (
        `${base} Nearly all of it — ${pct}% — went on ${v.biggest.area}. ` +
        `A weekend spent on something of your own choosing is a different thing from one that filled up, and only you can say which this was.`
      );
    }
    if (!v.labelled && v.total) {
      return `${base} Nothing's labelled, so there's no telling what kind of time it was — put an area on a job or two and this starts being able to answer that.`;
    }
    return base;
  }

  window.OrganiserWeekend = { isWeekend, weekendOf, normalise, record, recent, look, words };
})();
