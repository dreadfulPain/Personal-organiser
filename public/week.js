// The Week room: the next seven days as a calm list — never a grid wall.
// Pure seeing + tick; everything else happens on Home.

(() => {
  "use strict";

  // Now, to the minute. Handed to the planner rather than read inside it, so the
  // same span asked twice in one minute plans identically.
  const minuteNow = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

  const TYPE_LABEL = { task: "To do", appointment: "Event", reminder: "Reminder", note: "Note" };

  let items = [];
  let schedule = [];
  let cfg = null;
  let contacts = [];

  // WHICH PERSON, not just a name — see OrganiserNames.saidAs. This page printed
  // a bare "promised to Nick" while the home page had already learned to say
  // which Nick, so the same task read two different ways depending on which
  // page you happened to be standing on.
  const personWords = (name) =>
    window.OrganiserNames ? OrganiserNames.saidAs(contacts, name) : String(name || "");

  const $ = (sel) => document.querySelector(sel);
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  // Asked of one place — see OrganiserDates.isoOf.
  const isoOf = (d) => OrganiserDates.isoOf(d);
  // Asked of one place — see OrganiserDates.today(). Fourteen files worked this
  // out for themselves, in four spellings that all agreed. So did nameOf, once.
  const todayISO = () => OrganiserDates.today();
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function dayHeading(iso, i) {
    if (i === 0) return "Today";
    if (i === 1) return "Tomorrow";
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "short",
    });
  }
  // Asked of one place — see OrganiserDates.timeWords. Five files had their own
  // and no two were the same; the week's insisted on a two-digit hour, which
  // is the difference that has already cost this app once.
  const fmtTime = (t) => OrganiserDates.timeWords(t);

  function complete(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = new Date().toISOString();
    OrganiserStore.save({ items });
    render();
  }

  function row(it, p) {
    const el = document.createElement("div");
    el.className = "item wk-item";
    // The time the week has set aside for it, or the time you set by hand.
    const t =
      p && p.noTime
        ? ""
        : p && !p.pinnedByHand && window.OrganiserSchedule
          ? fmtTime(OrganiserSchedule.toHM(p.start))
          : fmtTime(it.time);
    el.innerHTML = `
      <button class="tick" aria-label="Mark done" title="Mark done"></button>
      ${t ? `<div class="tl-time">${escapeHtml(t)}</div>` : ""}
      <div class="item-main">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="item-meta">
          <span class="badge ${it.type}">${TYPE_LABEL[it.type] || "Note"}</span>
          ${p && p.noTime ? `<span class="when">no time set</span>` : ""}
          ${p && p.early ? `<span class="when">ahead of ${escapeHtml(dayName(it.date))}</span>` : ""}
          ${it.deadlineType === "hard" ? `<span class="when due">hard deadline</span>` : ""}
          ${it.promisedTo ? `<span class="promise-chip">promised to ${escapeHtml(personWords(it.promisedTo))}</span>` : ""}
          ${it.openLoop ? `<span class="loop-chip">needs finishing</span>` : ""}
        </div>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => complete(it.id));
    return el;
  }

  // WHAT YOU ARE ALREADY DOING THAT DAY. Lessons, form time, duty, meetings —
  // the things that are simply true about the day before any task is planned
  // into it.
  //
  // THIS PAGE USED TO IGNORE THEM ENTIRELY. A teacher with a full timetable saw
  // "free" printed under Monday, Tuesday, Wednesday and Thursday, because the
  // page only ever looked at tasks and no task happened to fall there. The
  // planner knew about the lessons the whole time — it was placing work around
  // them — and the one view you'd use to decide when to take on more work said
  // the days were empty.
  function blocksFor(iso) {
    const S = window.OrganiserSchedule;
    if (!S || !S.blocksOn) return [];
    // Soft blocks are guesses and the day markers aren't things you attend.
    return S.blocksOn(schedule, iso)
      .filter((b) => !b.soft && !b.blocksDay && !b.noLessons)
      .map((b) => ({ block: b, start: S.toMin(b.start) }))
      .sort((a, b) => a.start - b.start);
  }

  function blockRow(b) {
    const el = document.createElement("div");
    el.className = "item wk-item wk-block";
    const t = fmtTime(b.block.start);
    el.innerHTML = `
      ${t ? `<div class="tl-time">${escapeHtml(t)}</div>` : ""}
      <div class="item-main">
        <div class="item-title">${escapeHtml(b.block.label || "Block")}</div>
        <div class="item-meta">
          <span class="badge block">${b.block.beThere ? "BE THERE" : "ON"}</span>
          ${b.block.end ? `<span class="when">till ${escapeHtml(fmtTime(b.block.end))}</span>` : ""}
        </div>
      </div>`;
    return el;
  }

  const DAYS = 7;

  // WHAT'S CHANGED HERE. This page used to list whatever carried the day's date
  // on it. That answered "when is this due", never "when am I going to do it" —
  // so a big job due Friday sat on Friday looking fine, right up until Friday
  // turned out to have no room in it. Now the week is planned: work is shown on
  // the day there is actually space for it, before it's due, and anything that
  // won't fit at all is said at the top on Monday rather than discovered later.
  function render() {
    const wrap = $("#weekList");
    wrap.innerHTML = "";
    const t = todayISO();
    const WP = window.OrganiserWeekPlan;
    const plan = WP
      ? WP.spread(items, schedule, cfg, t, DAYS, { today: t, nowMinutes: minuteNow(), goalTitle: () => "" })
      : null;

    if (plan && plan.wontFit.length) wrap.appendChild(wontFitBox(plan));

    // TODAY IS ASKED OF THE DAY PLANNER, the same one the Day page uses.
    //
    // The week only spreads work with a real deadline on it — that is its job.
    // Undated work is what fills whatever is left of TODAY, and that answer
    // lives in dayplan.js. Working it out separately here is how this page and
    // the Day page came to describe the same morning differently.
    const todaySlots = (() => {
      const DP = window.OrganiserDayPlan;
      const DS = window.OrganiserDayShape;
      const S = window.OrganiserSchedule;
      if (!DP || !S) return null;
      const dayCfg = DS && DS.shapeOf ? DS.shapeOf(schedule, t, cfg).config : cfg;
      try {
        return DP.build(items, schedule, dayCfg, t, {
          notBefore: minuteNow(),
          ctx: { today: t, goalTitle: () => "" },
        }).slots;
      } catch {
        return null;
      }
    })();

    for (let i = 0; i < DAYS; i++) {
      const iso = addDaysISO(t, i);
      const booked = plan ? plan.byDay[iso] || [] : [];
      // TODAY IS BOTH. The day planner says what today's leftover time is
      // actually going on; the week says what it has set aside for today
      // against a deadline. Showing only the first dropped work the week had
      // deliberately booked — an essay pile due Friday disappeared out of the
      // whole seven days — and showing only the second is how this page and the
      // Day page came to describe the same morning differently.
      const placed =
        i === 0 && todaySlots
          ? todaySlots.concat(booked.filter((b) => !todaySlots.some((s2) => s2.itemId === b.itemId)))
          : booked;
      const seen = new Set(placed.map((p) => p.itemId));
      // Placed by the week, plus anything you pinned to a time on this day
      // yourself — your own decision is never quietly dropped from the picture.
      const pinned = items
        .filter((x) => !x.done && x.date === iso && x.time && !seen.has(x.id))
        .map((x) => ({ itemId: x.id, start: 0, pinnedByHand: true }));
      // Things that happen ON this day at an hour nobody has said — a meeting
      // you know is Thursday and not much else. They are not planned into a
      // gap, so they'd otherwise vanish from the one view you'd look for them
      // in. Drawn with no time, because there isn't one.
      const untimed = ((plan && plan.onTheDay) || [])
        .filter((x) => x.date === iso && !seen.has(x.id))
        .map((x) => ({ itemId: x.id, start: -1, noTime: true }));
      const day = placed
        .concat(pinned)
        .concat(untimed)
        .map((p) => ({ ...p, it: items.find((x) => x.id === p.itemId) }))
        .filter((p) => p.it && !p.it.done)
        .sort((a, b) => a.start - b.start);

      const blocks = blocksFor(iso);
      const sec = document.createElement("section");
      sec.className = "wk-day";
      const h = document.createElement("h2");
      h.className = "wk-heading" + (i === 0 ? " today" : "");
      h.textContent = dayHeading(iso, i);
      sec.appendChild(h);
      // FREE MEANS FREE. Not "no tasks happen to be planned here" — a day with
      // four lessons on it is not free, and saying so is worse than saying
      // nothing, because it is the sentence you plan against.
      if (!day.length && !blocks.length) {
        sec.insertAdjacentHTML("beforeend", `<p class="wk-free">free</p>`);
      } else {
        const list = document.createElement("div");
        list.className = "items";
        // One day, in time order, whichever kind of thing each row is.
        const rows = blocks
          .map((b) => ({ at: b.start, make: () => blockRow(b) }))
          .concat(day.map((p) => ({
            at: p.pinnedByHand && p.it.time && window.OrganiserSchedule
              ? OrganiserSchedule.toMin(p.it.time)
              : p.start,
            make: () => row(p.it, p),
          })))
          .sort((a, b) => a.at - b.at);
        rows.forEach((r) => list.appendChild(r.make()));
        sec.appendChild(list);
      }
      wrap.appendChild(sec);
    }
  }

  // Said now, while there's still a week left to do something about it.
  function wontFitBox(plan) {
    const box = document.createElement("div");
    box.className = "dp-flagged";
    const rows = plan.wontFit
      .map((w) => ({ w, it: items.find((x) => x.id === w.itemId) }))
      .filter((r) => r.it);
    if (!rows.length) return box;
    box.innerHTML =
      `<h3>Won't fit before ${rows.length === 1 ? "it's" : "they're"} due</h3>` +
      `<p class="muted">There isn't a long enough stretch left in the week for ${rows.length === 1 ? "this" : "these"}. ` +
      `Better said now than on the day. It may want breaking into smaller pieces, moving, or letting go of.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    rows.forEach(({ w, it }) => {
      const el = document.createElement("div");
      el.className = "dp-flagrow";
      el.innerHTML =
        `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>` +
        `<span class="when due">needs ${escapeHtml(mins(w.minutes))}${w.date ? ` by ${escapeHtml(dayName(w.date))}` : ""}</span>`;
      list.appendChild(el);
    });
    box.appendChild(list);
    return box;
  }

  function mins(n) {
    return window.OrganiserSchedule ? OrganiserSchedule.durationWords(n) : `${n} min`;
  }
  function dayName(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    schedule = data.schedule || [];
    cfg = data.scheduleConfig || null;
    contacts = data.contacts || [];
    OrganiserStore.onExternalChange((state) => {
      items = state.items || items;
      schedule = state.schedule || schedule;
      cfg = state.scheduleConfig || cfg;
      contacts = state.contacts || contacts;
      render();
    });
    render();
  }

  init();
})();
