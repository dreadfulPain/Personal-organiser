// The Month room: a real calendar grid — time given physical form, so the
// relation of things to each other in time is visible at a glance (the user's
// own accommodation: the spatial layout IS the help). Kept calm: generous
// cells, soft colours, neighbours faded, nothing red.

(() => {
  "use strict";

  // Now, to the minute. Handed to the planner rather than read inside it, so the
  // same span asked twice in one minute plans identically.
  const minuteNow = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

  let items = [];
  let schedule = [];
  let cfg = null;
  let offset = 0; // months from the current one

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  // Asked of one place — see OrganiserDates.isoOf.
  const isoOf = (d) => OrganiserDates.isoOf(d);
  // Asked of one place — see OrganiserDates.today(). Fourteen files worked this
  // out for themselves, in four spellings that all agreed. So did nameOf, once.
  const todayISO = () => OrganiserDates.today();
  function monthStart(off) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + off, 1);
  }
  function shortTime(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const d = new Date();
    d.setHours(+m[1], +m[2], 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: m[2] === "00" ? undefined : "2-digit" });
  }

  // Monday-first cells covering the whole weeks the month touches; neighbour
  // days show faded WITH their items (the point is seeing time run on).
  function monthCells(list, off) {
    const start = monthStart(off);
    const y = start.getFullYear();
    const m = start.getMonth();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const lead = (start.getDay() + 6) % 7;
    const total = Math.ceil((lead + daysIn) / 7) * 7;
    // A month is the same question as a week, asked over more days: not "when
    // is this due" but "when is there actually room to do it". Work shows on
    // the day it's planned for, which for anything big is before its deadline.
    // Days already gone keep showing the due date — there's nothing left to
    // plan into them, and pretending otherwise would rewrite history.
    // Each entry carries the minute it's planned for, so the day reads in the
    // order it will actually happen. A planned start isn't written onto the
    // item — the item keeps your deadline, the plan is worked out fresh.
    const byIso = new Map();
    const push = (iso, it, start) => {
      if (!byIso.has(iso)) byIso.set(iso, []);
      const day = byIso.get(iso);
      if (!day.some((e) => e.it === it)) day.push({ it, start });
    };
    const today = todayISO();
    const first = isoOf(new Date(y, m, 1 - lead));
    const from = first > today ? first : today;
    const span = Math.max(1, Math.round((new Date(y, m, 1 - lead + total) - new Date(from + "T12:00:00")) / 86400000));
    const WP = window.OrganiserWeekPlan;
    const plan = WP
      ? WP.spread(list, schedule, cfg, from, span, { today, nowMinutes: minuteNow(), goalTitle: () => "" })
      : null;
    const planned = new Set();
    if (plan) {
      plan.placements.forEach((p) => {
        const it = list.find((x) => x.id === p.itemId);
        if (!it) return;
        planned.add(it.id);
        push(p.iso, it, p.start);
      });
    }
    // Anything the planner didn't place — undated, already past, or won't fit —
    // still belongs on its own date. Nothing disappears because it can't be fitted.
    list.forEach((it) => {
      if (it.done || !it.date || planned.has(it.id)) return;
      push(it.date, it, null);
    });
    const cells = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m, 1 - lead + i);
      const iso = isoOf(d);
      cells.push({
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === m,
        // HOW MUCH OF THE DAY IS ALREADY GONE. The line under the title promises
        // that an empty square is real free time, and it wasn't: a teacher with
        // a full timetable saw every teaching day of the month as a blank box.
        // Nothing was wrong with the timetable — this grid simply never looked
        // at it, while promising you could plan against the gaps.
        booked: bookedOn(iso),
        // AND WHETHER IT IS A DAY AT ALL. A term calendar read in is mostly a
        // list of days you are NOT in — holidays, the days off round them, the
        // days with no teaching — and this grid, the one place you would look
        // to see the shape of a term, drew every one of them as an ordinary
        // empty square. It knew: it read the same blocks in order to leave them
        // out of the minutes. It just never said.
        off: offOn(iso),
        names: namesOn(iso),
        items: (byIso.get(iso) || [])
          .slice()
          .sort((a, b) => minuteOf(a) - minuteOf(b)),
      });
    }
    return { cells, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  }

  // Minutes already committed on a day — lessons, form time, duty, meetings.
  //
  // NOT ON A DAY YOU ARE NOT IN. A day marked off is a day the school is shut,
  // and the rest of the app already treats it that way — dayIsBlocked stops the
  // planner putting anything there. This grid asked a narrower question and got
  // a square that said "Mid-Autumn Festival" and "1 hour booked" at the same
  // time, because a standing Friday meeting still fell on the Friday of the
  // holiday. Two true-looking facts that contradict each other, in one square.
  function onThatDay(iso) {
    const S = window.OrganiserSchedule;
    if (!S || !S.blocksOn) return [];
    if (S.dayIsBlocked && S.dayIsBlocked(schedule, iso)) return [];
    return S.blocksOn(schedule, iso).filter((b) => !b.soft && !b.blocksDay && !b.noLessons);
  }
  function bookedOn(iso) {
    const S = window.OrganiserSchedule;
    if (!S) return 0;
    return onThatDay(iso).reduce((n, b) => n + Math.max(0, S.toMin(b.end) - S.toMin(b.start)), 0);
  }

  // AND WHAT THEY ARE, WHEN THERE ARE FEW ENOUGH TO SAY.
  //
  // "1 hour booked" every Friday tells you nothing you did not know. The
  // holiday on the same grid gets its name; the meeting got a number. But a
  // teaching day is eight lessons, and eight names in a month square is a wall
  // — so the rule is how MANY, not what they are: one or two get named, more
  // than that and the total is the useful thing. No vocabulary either way.
  function namesOn(iso) {
    const on = onThatDay(iso);
    return on.length && on.length <= 2 ? on.map((b) => b.label).filter(Boolean) : [];
  }

  // WHAT MAKES A DAY NOT AN ORDINARY ONE, and what it is called. Two kinds,
  // told apart because they mean different things to a teacher: nothing at all
  // is planned into a day off, while a day with no lessons is a working day
  // your timetable does not run on.
  function offOn(iso) {
    const S = window.OrganiserSchedule;
    if (!S || !S.blocksOn) return null;
    // A MAKE-UP DAY IS THE THIRD KIND, and it was the only one this grid drew
    // as an ordinary empty square. A Sunday that runs Monday's timetable is the
    // most surprising day in anybody's year — you are teaching at the weekend —
    // and the app had it stored exactly right and said it nowhere. It is not
    // "off" and it is not "no lessons": it is a working day borrowed from
    // another one, so it says which.
    const stand = S.standingIn && S.standingIn(schedule, iso);
    if (stand)
      return {
        kind: "runsas",
        label: (stand.label ? stand.label + " — " : "") +
          `runs ${OrganiserDates.dayName(stand.runsAs) || "another day"}'s timetable`,
      };
    const on = S.blocksOn(schedule, iso).filter((b) => b.blocksDay || b.noLessons);
    if (!on.length) return null;
    const day = on.find((b) => b.blocksDay);
    return {
      kind: day ? "off" : "nolessons",
      // Its own name, because "Holiday" and "Sports Week" are not the same day
      // and the calendar it came off said which.
      label: (day || on[0]).label || (day ? "day off" : "no lessons"),
    };
  }

  function weekdayNames() {
    const names = [];
    const monday = new Date(2024, 0, 1); // a known Monday
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      names.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    return names;
  }

  // Sort key for a cell: the planned minute if there is one, then a hand-set
  // time, then everything else after both.
  function minuteOf(e) {
    if (e.start !== null && e.start !== undefined) return e.start;
    const m = /^(\d{2}):(\d{2})$/.exec((e.it && e.it.time) || "");
    return m ? +m[1] * 60 + +m[2] : 24 * 60 + 1;
  }

  const SHOW = 3; // item lines per cell before "+N more"

  function render() {
    const { cells, label } = monthCells(items, offset);
    $("#moTitle").textContent = label;
    const wrap = $("#monthList");
    wrap.innerHTML = "";

    const head = document.createElement("div");
    head.className = "mo-grid mo-grid-head";
    weekdayNames().forEach((n) => {
      const c = document.createElement("div");
      c.className = "mo-dow";
      c.textContent = n;
      head.appendChild(c);
    });
    wrap.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "mo-grid";
    const today = todayISO();
    cells.forEach((cell) => {
      const el = document.createElement("div");
      el.className =
        "mo-cell" + (cell.inMonth ? "" : " faded") + (cell.iso === today ? " today" : "") +
        (cell.off ? " mo-" + cell.off.kind : "");
      const num = document.createElement("div");
      num.className = "mo-daynum";
      num.textContent = cell.day;
      el.appendChild(num);
      // SAID, NOT JUST SHADED. About one man in twelve cannot separate red from
      // green, and a square that is only a different colour is a square that
      // says nothing to them — so the day says what it is in words, and the
      // shading is the second way of saying it rather than the only one.
      if (cell.off) {
        const tag = document.createElement("div");
        tag.className = "mo-off";
        tag.textContent = cell.off.label;
        el.appendChild(tag);
      }
      // Named where there are few enough to name, counted where there are not.
      if (cell.names.length)
        cell.names.forEach((name) => {
          const on = document.createElement("div");
          on.className = "mo-booked";
          on.textContent = name;
          el.appendChild(on);
        });
      else if (cell.booked) {
        const on = document.createElement("div");
        on.className = "mo-booked";
        on.textContent =
          (window.OrganiserSchedule ? OrganiserSchedule.durationWords(cell.booked) : cell.booked + " min") +
          " booked";
        el.appendChild(on);
      }
      cell.items.slice(0, SHOW).forEach(({ it, start }) => {
        const line = document.createElement("div");
        line.className = "mo-ev" + (it.deadlineType === "hard" ? " hard" : "");
        const t = shortTime(
          start !== null && start !== undefined && window.OrganiserSchedule
            ? OrganiserSchedule.toHM(start)
            : it.time
        );
        line.textContent = (t ? t + " " : "") + it.title;
        // The plan may put it before its deadline; say so rather than let the
        // grid quietly imply the date moved.
        line.title = it.date && start !== null && it.date !== cell.iso ? `${it.title} — due ${OrganiserDates.dayWords(it.date)}` : it.title;
        el.appendChild(line);
      });
      if (cell.items.length > SHOW) {
        const more = document.createElement("div");
        more.className = "mo-more";
        more.textContent = `+${cell.items.length - SHOW} more`;
        el.appendChild(more);
      }
      grid.appendChild(el);
    });
    wrap.appendChild(grid);
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    schedule = data.schedule || [];
    cfg = data.scheduleConfig || null;
    $("#moPrev").addEventListener("click", () => {
      offset--;
      render();
    });
    $("#moNext").addEventListener("click", () => {
      offset++;
      render();
    });
    render();
  }

  init();
})();
