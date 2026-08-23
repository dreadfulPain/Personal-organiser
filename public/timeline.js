// THE DAY — a plan that is already made when you get here.
//
// The old version of this page was an empty grid you had to fill in. That is
// backwards: laying out a day is exactly the job that costs the most and gets
// skipped first. So the shape is now: THE APP PROPOSES, YOU ADJUST, YOU ACCEPT.
//
//   1. Fixed blocks are laid down first — they're facts.
//   2. The gaps between them get filled from what already matters.
//   3. You move, remove, add anything.
//   4. You press accept. That's the day settled.
//
// Nothing locks after accepting. Things move all day, because days do.
//
// TWO HONESTIES that hold this together:
//   - Only about two thirds of the free time gets filled. A day packed wall to
//     wall collapses at the first interruption, and then the plan is a liar.
//   - Every time the app guessed — how long something takes, when you finish —
//     it is drawn dashed and says so. A guess must never look like a fact.

(() => {
  "use strict";

  const S = () => window.OrganiserSchedule;

  let items = [];
  let waiting = [];
  let goals = [];
  let schedule = [];
  let cfg = null;
  // ARRIVE WITH IT ALREADY OPEN. Set up sends you here to do one specific job;
  // landing on the Day page with the panel shut means hunting for it a second
  // time, which is the thing that made the timetable unfindable in the first
  // place.
  let setupOpen = /#setup\b/.test(location.hash || "");
  let pastedBlocks = null; // AI-read timetable rows, waiting to be checked
  let unreadableRows = []; // rows it couldn't make sense of — shown, never dropped
  let addingBlock = false;
  let movingId = null; // which planned task is having its slot changed
  let worked = {}; // minutes really put in, per day — see weekend.js
  let areaList = []; // the parts of your life, as YOU named them — see areas.js
  let rotas = []; // going round a list, one at a time — see rota.js
  let contacts = []; // People, for linking a session to whoever is running it
  let areaEditId = null; // which job is having its areas corrected
  const goalAreasById = (id) => {
    const g = goals.find((x) => x.id === id);
    return (g && (Array.isArray(g.areas) ? g.areas : [])) || [];
  };

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const todayISO = () => S().isoOf(new Date());

  // ---- the school calendar --------------------------------------------------
  //
  // Read, shown, labelled by you, then in. The middle step is the whole point:
  // "Winter break begins" and "Staff return" are different instructions to this
  // app, and telling them apart from the words would be the app deciding your
  // term from a noun.
  // The calendar's dates carry the year, because a school calendar is read
  // months before the days in it. Everything else about how a date is written
  // comes from the one place — see dates.js.
  const calDay = (iso) => OrganiserDates.dayWords(iso, { year: true, relative: false }) || iso;

  let calRows = [];
  // What read() worked out — chiefly the year, which is the one number here that
  // can be quietly wrong and take every other date down with it.
  let calMeta = { rows: [], year: 0, borrowed: 0 };

  function calRead(text, year) {
    const C = window.OrganiserCalPlan;
    if (!C) return;
    const r = C.read(text || "", year ? { year } : undefined);
    calRows = r.rows;
    calMeta = r;
    const box = $("#calYear");
    // Filled in from the document, and yours to correct.
    if (box && !box.value) box.value = String(r.year || "");
    renderCal();
  }

  function renderCal() {
    const C = window.OrganiserCalPlan;
    const box = $("#calRows");
    const words = $("#calWords");
    const btn = $("#calAdd");
    if (!C || !box) return;
    if (words) words.textContent = C.words({ ...calMeta, rows: calRows }, calRows, calDay);
    if (btn) btn.hidden = !calRows.some((r) => r.kind);
    // What each row will actually cover, worked out by the reader rather than
    // guessed at again here — so what this shows is what gets kept.
    const marks = new Map();
    C.plan(calRows).forEach((p) => {
      marks.set(p.row, p);
      if (p.endRow) marks.set(p.endRow, { endOf: p });
    });
    box.innerHTML = "";
    calRows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "cal-row";
      const mark = marks.get(r);
      const name = document.createElement("span");
      name.className = "cal-name";
      // WRITTEN OUT, not 2026-08-24. Half the rows on a real calendar come back
      // with no name on them — the date is a heading and the words are in a
      // table cell somewhere else — so the date is the only thing telling you
      // which row you're looking at, and a string of digits is the hardest
      // possible way to read one.
      name.textContent = `${calDay(r.date)} — ${r.label}`;
      row.appendChild(name);
      // Four plain choices, and "nothing" is one of them and is the default.
      [["noLessons", "no lessons"], ["off", "day off"],
       ["lessons", "lessons start"], ["", "ignore"]].forEach(([k, lab]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "p-opt cal-pick" + (r.kind === k ? " on" : "");
        b.textContent = lab;
        b.addEventListener("click", () => {
          // Clearing a row clears the run-on with it — a tick on a line that
          // does nothing would sit there looking like it meant something.
          calRows[i] = { ...r, kind: k, spans: k ? r.spans : false };
          renderCal();
        });
        row.appendChild(b);
      });
      // THE RUN-ON. A holiday arrives as two lines — begins, ends — and only
      // you know which pairs are a stretch and which are two separate days.
      // Offered only where pressing it would change something.
      if (mark && mark.canSpan) {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = "p-opt cal-span" + (r.spans ? " on" : "");
        // SAME WORDS EITHER WAY, and they say the date it lands on and how far
        // that is — before you press it, not after. The whole reason this is a
        // tick and not a guess is that the stretch can be seven weeks long, and
        // nobody should find that out by having it happen to them.
        tick.textContent =
          (r.kind === "lessons"
            ? `and stop on ${calDay(mark.wouldEnd)}`
            : `runs on to ${calDay(mark.wouldEnd)} — ${mark.wouldBe} days`) + (r.spans ? " ✓" : "?");
        tick.addEventListener("click", () => {
          calRows[i] = { ...r, spans: !r.spans };
          renderCal();
        });
        row.appendChild(tick);
      }
      // And the far end of a stretch says so, so a row vanishing into one above
      // it isn't a surprise.
      if (mark && mark.endOf) {
        const end = document.createElement("span");
        end.className = "muted cal-end";
        end.textContent = `end of “${mark.endOf.label}”`;
        row.appendChild(end);
      }
      box.appendChild(row);
    });
    renderCalTerm();
  }

  // WHICH OF YOUR TIMETABLE ENTRIES ARE THE LESSONS.
  //
  // The calendar knows when the teaching runs. It cannot know which lines of
  // your week are teaching — period 3 and the Tuesday briefing look identical
  // from here, and one of them happens in the set-up week and one doesn't. So
  // it shows you what it would limit, ticked, and you take the ticks off
  // whatever carries on regardless.
  let calTermPick = null;

  const repeatingBlocks = () =>
    schedule.filter((b) => b && Array.isArray(b.days) && b.days.length && !b.date &&
      !b.blocksDay && !b.noLessons);

  function renderCalTerm() {
    const C = window.OrganiserCalPlan;
    const box = $("#calTerm");
    if (!box) return;
    const t = C && C.term(calRows);
    const list = repeatingBlocks();
    box.innerHTML = "";
    box.hidden = !t || !list.length;
    if (!t || !list.length) return;
    if (!calTermPick) calTermPick = new Set(list.map((b) => b.id));
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      `Lessons run from ${calDay(t.from)}${t.to ? ` to ${calDay(t.to)}` : " onwards"}. Which of these only ` +
      "happen in that stretch? Anything ticked stops applying outside it — take the tick " +
      "off whatever runs regardless.";
    box.appendChild(p);
    list.forEach((b) => {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "p-opt cal-term" + (calTermPick.has(b.id) ? " on" : "");
      pick.textContent = `${b.label || "(no name)"} ${b.start}–${b.end}` +
        (b.from || b.to ? ` (already ${b.from || "…"}–${b.to || "…"})` : "");
      pick.addEventListener("click", () => {
        if (calTermPick.has(b.id)) calTermPick.delete(b.id);
        else calTermPick.add(b.id);
        renderCalTerm();
      });
      box.appendChild(pick);
    });
  }

  function calApply() {
    const C = window.OrganiserCalPlan;
    if (!C) return;
    const made = C.toBlocks(calRows).map((b) => ({ ...b, id: uid() }));
    // A day already in the schedule is left as it is — reading the calendar in
    // twice must not put two of every holiday in your week.
    const have = new Set(schedule.filter((b) => b && b.date).map((b) => b.date + "|" + (b.label || "")));
    const fresh = made.filter((b) => !have.has(b.date + "|" + b.label));
    // The term dates are a separate thing that can arrive on its own — a
    // calendar saying only "students return" still has something to tell you.
    const t = C.term(calRows);
    const picked = t && calTermPick ? [...calTermPick] : [];
    if (!fresh.length && !picked.length) return;
    if (picked.length)
      schedule = schedule.map((b) =>
        b && calTermPick.has(b.id) ? { ...b, from: t.from, to: t.to || b.to || "" } : b);
    schedule = schedule.concat(fresh);
    persist();
    calRows = [];
    calTermPick = null;
    const box = $("#calPaste");
    if (box) box.value = "";
    renderCal();
    renderTimeOff();
    render();
    const words = $("#calWords");
    if (words)
      words.textContent =
        (fresh.length ? `${fresh.length} day${fresh.length === 1 ? "" : "s"} added. ` : "") +
        (picked.length
          ? `${picked.length} timetable entr${picked.length === 1 ? "y" : "ies"} now only run` +
            `${picked.length === 1 ? "s" : ""} from ${calDay(t.from)}${t.to ? ` to ${calDay(t.to)}` : " onwards"}. `
          : "") +
        "Paste another calendar in if there's more.";
  }

  // ---- time off ------------------------------------------------------------
  //
  // A range of days you want nothing planned into. Stored as ordinary
  // day-blocking entries, one per day, because that is what the rest of the app
  // already understands — no new store, and every count that already respects a
  // day off respects these the moment they exist.
  function addTimeOff(fromISO, toISO, label) {
    if (!fromISO) return;
    const to = toISO && toISO >= fromISO ? toISO : fromISO;
    const name = (label || "").trim() || "off";
    const made = [];
    for (let i = 0; i < 400; i++) {
      const iso = S().addDaysISO(fromISO, i);
      if (iso > to) break;
      // Already marked off? Leave it — booking a fortnight that overlaps a day
      // you'd already taken must not put two of it in the list.
      if (schedule.some((b) => b && b.date === iso && b.blocksDay)) continue;
      made.push({ id: uid(), label: name, start: "00:00", end: "23:59", date: iso,
        days: [], blocksDay: true, soft: false, source: "hand" });
    }
    if (!made.length) return;
    // WHAT YOU ARE ACTUALLY BOOKING OVER. Counted before the days go in, while
    // the timetable still applies to them — afterwards they are marked off and
    // the lessons have already gone quiet.
    const covers = lessonsCovered(made.map((b) => b.date));
    schedule = schedule.concat(made);
    persist();
    renderTimeOff();
    render();
    const words = $("#offWords");
    if (words && covers.total) words.textContent = coverWords(covers) + " " + words.textContent;
  }

  // The teaching those dates would land on, and how much of it you'd said could
  // be traded. Counted, never judged — booking leave over a teaching day is an
  // ordinary thing to do, and the app's job is to say what it costs, not
  // whether to.
  function lessonsCovered(dates) {
    const Sx = S();
    let total = 0, swappable = 0;
    const days = new Set();
    dates.forEach((iso) => {
      const on = Sx.blocksOn(schedule, iso).filter((b) => !b.soft && !b.blocksDay && !b.noLessons);
      if (!on.length) return;
      days.add(iso);
      total += on.length;
      swappable += on.filter((b) => b.swappable).length;
    });
    return { total, swappable, days: days.size };
  }

  function coverWords(c) {
    return `That covers ${c.total} fixed thing${c.total === 1 ? "" : "s"} across ` +
      `${c.days} day${c.days === 1 ? "" : "s"}` +
      (c.swappable
        ? ` — ${c.swappable} of them you'd said could be swapped.`
        : ", and none of them are marked as swappable.");
  }

  function removeTimeOff(id) {
    schedule = schedule.filter((b) => !(b && b.id === id));
    persist();
    renderTimeOff();
    render();
  }

  function renderTimeOff() {
    const list = $("#offList");
    const words = $("#offWords");
    if (!list) return;
    const off = schedule.filter((b) => b && b.blocksDay && b.date).sort((a, b) => a.date.localeCompare(b.date));
    const ahead = off.filter((b) => b.date >= todayISO());
    if (words)
      words.textContent = ahead.length
        ? `${ahead.length} day${ahead.length === 1 ? "" : "s"} booked off ahead — the work is being placed around ${ahead.length === 1 ? "it" : "them"}.`
        : "Nothing booked off ahead.";
    // Only what's still to come: a day off last March is not information.
    list.innerHTML = "";
    ahead.slice(0, 60).forEach((b) => {
      const row = document.createElement("div");
      row.className = "ro-row";
      const name = document.createElement("span");
      name.textContent = `${OrganiserDates.dayWords(b.date)} — ${b.label || "off"}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link";
      btn.textContent = "put it back";
      btn.addEventListener("click", () => removeTimeOff(b.id));
      row.append(name, btn);
      list.appendChild(row);
    });
  }

  function persist() {
    OrganiserStore.save({ items, waiting, schedule, scheduleConfig: cfg, worked, areas: areaList, rotas });
  }

  // People are saved SEPARATELY, and only when this page actually changed them.
  // Sending contacts on every ordinary save means one page that loaded them
  // wrong can empty the People tab from the other side of the app, and that is
  // the exact shape of bug this store has produced before.
  function persistPeople() {
    OrganiserStore.save({ contacts });
  }

  // A TURN TICKED OFF HERE IS A TURN, not just a job done.
  //
  // A rota task carries which round and which person it belongs to. Without
  // this the job disappears off the day and the queue never moves, so the same
  // name is offered again tomorrow and the round silently stops going round.
  function markRotaTurn(it) {
    const R = window.OrganiserRota;
    if (!R || !it || !it.rotaId || !it.rotaMemberId) return;
    const r = rotas.find((x) => x && x.id === it.rotaId);
    if (!r) return;
    const next = R.mark(r, it.rotaMemberId, todayISO());
    rotas = rotas.map((x) => (x && x.id === it.rotaId ? next : x));
  }

  // Make the tasks a block owes, and let go of the ones whose moment has passed.
  // Idempotent: keyed to block+date, so running it on every open can't double up.
  function syncPrep() {
    const { add, drop } = S().prepPlan(schedule, cfg, items, new Date());
    if (!add.length && !drop.length) return false;
    const gone = new Set(drop.map((d) => d.id));
    items = items.filter((i) => !gone.has(i.id));
    add.forEach((t) => items.push({ ...t, id: uid(), createdAt: new Date().toISOString() }));
    persist();
    return true;
  }
  function goalTitleById(id) {
    const g = goals.find((x) => x.id === id);
    return g ? g.title : "";
  }
  function ctx() {
    return { today: todayISO(), goalTitle: goalTitleById, tight: tightNow() };
  }

  // WHICH DEADLINES HAVE RUN OUT OF ROOM IN FRONT OF THEM. Worked out from the
  // whole picture — every hour free between now and the deadline against
  // everything already owed to those hours — so that a job gets more urgent as
  // its room disappears rather than only on the morning it is due.
  function tightNow() {
    const WPx = window.OrganiserWeekPlan;
    if (!WPx || !WPx.tightIds) return null;
    const c = S().normaliseConfig(cfg);
    try {
      return WPx.tightIds(items, schedule, c, todayISO(), Math.max(c.planHorizonDays, 28));
    } catch {
      return null; // ordering must never be the thing that breaks the page
    }
  }

  // ---------- building the plan ----------
  // Order matters and is deliberate:
  //   1. A hard deadline due today goes in first, always. Nothing outranks it.
  //   2. Effort is matched to gap size — a draining thing needs a real stretch,
  //      and if today hasn't got one it is NOT crammed in. It's flagged as
  //      needing a proper slot, which is a true and useful thing to know.
  //   3. Whatever's left is filled from the shared "what matters" scoring.
  function planFor(iso) {
    const c = S().normaliseConfig(cfg);
    const store = c.plans[iso];
    if (store && store.acceptedAt) return { ...store, accepted: true };
    // NOT INTO THIS MORNING, IF THIS MORNING HAS GONE. The first plan of the day
    // was built from the start of the working day whatever the clock said, so
    // opening this page at ten to catch up handed you a plan that began at
    // half seven: five jobs sitting in hours that had already passed, every one
    // of them looking like something you'd failed to do. The rebuild after
    // "something's come up" already knew to start from now; the ordinary first
    // look didn't.
    return buildPlan(iso, store, iso === todayISO() ? minuteNow() : undefined);
  }

  // Now, to the minute — and only ever used for today.
  function minuteNow() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  // The planner itself lives in dayplan.js so it can be driven and tested
  // without a browser — this page just supplies the data and shows the result.
  function buildPlan(iso, previous, notBefore) {
    // THE DAY'S OWN HOURS. A working day runs to the hours you set for work; a
    // day without lessons runs to the ones you keep for yourself, which start
    // later and go on longer. The planner is handed the right pair and needs to
    // know nothing about which kind of day it is.
    const DS = window.OrganiserDayShape;
    const dayCfg = DS ? DS.shapeOf(schedule, iso, cfg).config : cfg;
    return window.OrganiserDayPlan.build(items, schedule, dayCfg, iso, { previous, notBefore, ctx: ctx() });
  }

  function savePlan(iso, plan) {
    const c = S().normaliseConfig(cfg);
    c.plans[iso] = plan;
    // Keep a fortnight of plans and let the rest go — a plan is a working note,
    // not a record. (What actually happened lives in the tasks themselves.)
    const keep = Object.keys(c.plans).sort().slice(-14);
    c.plans = keep.reduce((o, k) => ((o[k] = c.plans[k]), o), {});
    cfg = c;
    persist();
  }


  // MINUTES ACTUALLY WORKED, AGAINST THE DAY THEY HAPPENED ON.
  //
  // Everything else the app knows is about intention — what was planned, what's
  // due. This is the only record of what really went in and WHEN, which is the
  // only way to tell a Sunday you chose from a Sunday that just filled up. See
  // weekend.js: it's the difference the app exists to help you notice.
  function logWorked(it, minutes) {
    const W = window.OrganiserWeekend;
    if (!W || !(minutes >= 1)) return;
    const c = S().normaliseConfig(cfg);
    // Every area the job belongs to — worked out from what it came from, or
    // from words you've taught it, if it isn't labelled by hand.
    const A = window.OrganiserAreas;
    const areas = A ? A.areasFor(it, areaList, { goalAreas: goalAreasById }).areas : [];
    worked = W.record(worked, todayISO(), minutes, areas);
    cfg = c;
  }

  // WHICH PARTS OF YOUR LIFE THIS BELONGS TO.
  //
  // Shown as a small line on the job, because a label you can't see is a label
  // you can't correct — and correcting is the whole mechanism. It works one out
  // from what the job came from, or from words you've taught it; you tap it to
  // disagree, and disagreeing teaches it. Nothing has to be labelled and nothing
  // nags: an unlabelled job is honest, and a wrongly labelled one quietly ruins
  // the only measurement that can tell a chosen Sunday from a habit.
  function areaLabel(it) {
    const A = window.OrganiserAreas;
    if (!A) return "";
    const r = A.areasFor(it, areaList, { goalAreas: goalAreasById });
    const names = r.areas.map((id) => {
      const a = A.normalise(areaList).find((x) => x.id === id);
      return (a && a.name) || id;
    });
    return names.length ? names.join(" + ") : "which part of life?";
  }

  function areaBox(it) {
    const A = window.OrganiserAreas;
    const box = document.createElement("div");
    box.className = "dp-areabox";
    const known = A ? A.normalise(areaList) : [];
    const now = new Set(A ? A.areasFor(it, areaList, { goalAreas: goalAreasById }).areas : []);
    box.innerHTML = `<p class="muted">Tick any that apply — a thing can be more than one. Correcting it teaches the words.</p>`;
    const row = document.createElement("div");
    row.className = "dp-arealist";
    known.forEach((a) => {
      const lab = document.createElement("label");
      lab.className = "dp-areapick";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = now.has(a.id);
      cb.addEventListener("change", () => setArea(it, a.id, cb.checked));
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" " + a.name));
      row.appendChild(lab);
    });
    box.appendChild(row);
    const add = document.createElement("div");
    add.className = "dp-areaadd";
    add.innerHTML = `<input type="text" class="dp-areanew" placeholder="or name a new one" aria-label="New area" />`;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "link";
    go.textContent = "add";
    const input = add.querySelector(".dp-areanew");
    const make = () => {
      const name = (input.value || "").trim();
      if (!name) return;
      const A2 = window.OrganiserAreas;
      const id = name.toLowerCase();
      if (!A2.normalise(areaList).some((a) => a.id === id)) areaList = areaList.concat([{ id, name, hints: [] }]);
      setArea(it, id, true);
    };
    go.addEventListener("click", make);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") make(); });
    add.appendChild(go);
    box.appendChild(add);
    return box;
  }

  // Setting a label by hand is the correction: it's remembered on the job AND
  // the job's own words join that area's hints, so the next one lands right.
  function setArea(it, areaId, on) {
    const A = window.OrganiserAreas;
    const cur = new Set(A.areasFor(it, areaList, { goalAreas: goalAreasById }).areas);
    if (on) cur.add(areaId);
    else cur.delete(areaId);
    it.areas = [...cur];
    areaList = on ? A.learn(areaList, areaId, it.title) : A.unlearn(areaList, areaId, it.title);
    persist();
    render();
  }

  // ---------- when the day is taken away from you ----------
  //
  // A meeting appears. A child needs you. The plan you accepted this morning is
  // now fiction, and the worst thing an organiser can do at that moment is
  // nothing — you come back at two o'clock to a day that still claims you were
  // going to do all of it, and every single item silently becomes a small
  // failure.
  //
  // So: say it's happening, and the app steps back completely — no plan, no
  // pings. Say you're back, and it works out what's actually left and rebuilds
  // around it. What can't fit today is MOVED, not marked missed: the time went
  // somewhere real and the app knows where, because you told it.
  // itemId/slotStart: what was in your hands when it happened. Without them the
  // app knows the day stopped but not what it stopped in the middle of, so the
  // minutes already put into that job are lost — see partWayThrough.
  function startAway(label, itemId, slotStart) {
    const c = S().normaliseConfig(cfg);
    c.away = {
      label: (label || "").trim().slice(0, 80),
      startedAt: new Date().toISOString(),
      itemId: itemId || "",
      slotStart: Number.isFinite(slotStart) ? slotStart : null,
    };
    cfg = c;
    persist();
    render();
  }

  function comeBack() {
    const c = S().normaliseConfig(cfg);
    if (!c.away) return;
    const started = new Date(c.away.startedAt);
    const now = new Date();
    const iso = todayISO();
    const mins = S().awayMinutes(c, now);

    // Write down what actually happened. Not an estimate — the real span, kept
    // as a block, so the day is an honest record and tomorrow's planning knows
    // this time was genuinely gone.
    if (mins >= 2 && S().isoOf(started) === iso) {
      const b = S().normaliseBlock({
        label: c.away.label || "Something came up",
        start: S().toHM(started.getHours() * 60 + started.getMinutes()),
        end: S().toHM(Math.min(now.getHours() * 60 + now.getMinutes(), 24 * 60 - 1)),
        date: iso,
        source: "interruption",
      });
      if (b) schedule = S().normalise(schedule).concat([b]);
    }

    // WHATEVER YOU HAD IN YOUR HANDS. The minutes you'd put into it before the
    // door went are kept, so the job comes back smaller rather than starting
    // from nothing — the same reasoning as "got part way", except you shouldn't
    // have to remember to press anything while a child is crying at you.
    const paused = c.away.itemId ? items.find((i) => i.id === c.away.itemId) : null;
    let banked = 0;
    if (paused && !paused.done) {
      const plan = c.plans[iso] || {};
      const from = Math.max(
        Number.isFinite(c.away.slotStart) ? c.away.slotStart : 0,
        Number.isFinite(plan.lastTickMin) ? plan.lastTickMin : 0
      );
      const to = started.getHours() * 60 + started.getMinutes();
      banked = S().workingMinutesBetween(schedule, iso, from, to);
      if (banked >= 1) {
        paused.spentMinutes = Math.round(Number(paused.spentMinutes) || 0) + banked;
        logWorked(paused, banked);
      }
    }

    // What the day USED to say, so the rebuild can name what moved.
    const before = (c.plans[iso] && c.plans[iso].slots ? c.plans[iso].slots : []).map((s2) => s2.itemId);
    c.away = null;
    delete c.plans[iso]; // the old plan described a day that didn't happen
    cfg = c;

    const nowMins = now.getHours() * 60 + now.getMinutes();
    const rebuilt = buildPlan(iso, null, nowMins);
    rebuilt.rebuiltAt = now.toISOString();
    rebuilt.awayMinutes = mins;
    const nowIn = new Set(rebuilt.slots.map((s2) => s2.itemId));
    rebuilt.displaced = before.filter((id) => !nowIn.has(id) && !(items.find((i) => i.id === id) || {}).done);
    savePlan(iso, rebuilt);
    persist();
    render();
    setTlStatus(
      `Back after ${S().durationWords(mins)}.${
        banked >= 1 ? ` The ${S().durationWords(banked)} you'd put into “${paused.title}” is kept.` : ""
      } ${
        rebuilt.displaced.length
          ? `${rebuilt.displaced.length} thing${rebuilt.displaced.length === 1 ? "" : "s"} didn't fit what's left — ${rebuilt.displaced.length === 1 ? "it's" : "they're"} below.`
          : "Everything still fits."
      }`
    );
    // What happened, and whether it started something. Offered, never demanded:
    // ignore it and it's gone on the next render.
    if (paused || mins >= 5) offerFollowUp({ title: label || "what came up" }, "did anything come out of that?");
  }

  function renderAway() {
    const c = S().normaliseConfig(cfg);
    const bar = $("#awayBar");
    if (!bar) return false;
    if (!c.away) {
      bar.className = "away-bar";
      bar.hidden = false;
      bar.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link away-start";
      btn.textContent = "something's come up";
      btn.addEventListener("click", () => {
        bar.innerHTML = "";
        const form = document.createElement("div");
        form.className = "away-form";
        form.innerHTML = `<input type="text" class="away-what" placeholder="what is it? (optional)" aria-label="What's come up" />`;
        const go = document.createElement("button");
        go.type = "button";
        go.className = "btn";
        go.textContent = "I'm on it";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "link";
        cancel.textContent = "never mind";
        const input = form.querySelector(".away-what");
        go.addEventListener("click", () => startAway(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") startAway(input.value);
        });
        cancel.addEventListener("click", renderAway);
        form.append(go, cancel);
        bar.appendChild(form);
        setTimeout(() => input.focus(), 0);
      });
      bar.append(btn);
      return false;
    }

    // Away: the plan is deliberately gone from the screen. Looking at a list of
    // things you can't do, while dealing with something you must, is the exact
    // pressure this app exists to take off you.
    const since = new Date(c.away.startedAt);
    bar.className = "away-bar active";
    bar.hidden = false;
    bar.innerHTML = `
      <div class="away-main">
        <strong>${escapeHtml(c.away.label || "Something came up")}</strong>
        <span class="away-since">since ${escapeHtml(S().fmtTime(S().toHM(since.getHours() * 60 + since.getMinutes())))} · ${escapeHtml(S().durationWords(S().awayMinutes(c, new Date())))}</span>
        <span class="away-calm">Your day's on hold and nothing will ping you. Come back when you're done.</span>
      </div>`;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "I'm back";
    back.addEventListener("click", comeBack);
    bar.appendChild(back);
    return true;
  }

  // ---------- rendering ----------
  function itemById(id) {
    return items.find((i) => i.id === id);
  }

  function render() {
    const iso = todayISO();
    $("#tlDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    renderSetup();

    const wrap = $("#timeline");
    wrap.innerHTML = "";

    if (renderAway()) {
      // Nothing else on the page while you're in it. Come back and it rebuilds.
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

    // A DAY YOU MARKED OFF stays off — that was your decision, not the app's.
    if (S().dayIsBlocked(schedule, iso)) {
      wrap.innerHTML = `<p class="empty">You've marked today off — nothing planned into it.</p>`;
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

    // A DAY WITHOUT LESSONS IS STILL A DAY. It runs to its own hours and its
    // plan is an order rather than a timetable, because at home nobody knows
    // when they'll get up and a plan that says 09:14 is a fiction.
    const DS = window.OrganiserDayShape;
    const shape = DS ? DS.shapeOf(schedule, iso, cfg) : { kind: "work", loose: false, config: cfg };
    const shapeNote = DS ? DS.words(shape) : "";

    const plan = planFor(iso);
    const blocks = S().blocksOn(schedule, iso);

    if (!blocks.length && !plan.slots.length) {
      wrap.innerHTML = `<p class="empty">Nothing to lay out yet. Add your week's shape below, or add tasks on the
        <a href="index.html">main page</a> — this builds itself from both.</p>`;
      renderAccept(null);
      renderUnplanned(iso, null);
      return;
    }

    // One list, in time order: fixed blocks and planned tasks interleaved, so
    // the day reads top to bottom the way it will actually happen.
    const rows = [];
    blocks.forEach((b) => rows.push({ kind: "block", at: S().toMin(b.start), block: b }));
    plan.slots.forEach((s) => {
      const it = itemById(s.itemId);
      if (it && !it.done) rows.push({ kind: "task", at: s.start, slot: s, item: it });
    });
    rows.sort((a, b) => a.at - b.at || (a.kind === "block" ? -1 : 1));

    // WHAT KIND OF DAY THIS IS, said before the list rather than left to be
    // inferred from it looking odd.
    if (shapeNote) {
      const note = document.createElement("p");
      note.className = "dp-shape";
      note.textContent = shapeNote;
      wrap.appendChild(note);
    }

    const list = document.createElement("div");
    list.className = "dp-list" + (shape.loose ? " loose" : "");

    if (shape.loose && DS) {
      // AN ORDER, NOT A TIMETABLE. The sequence is kept exactly — it is the
      // useful half — but nothing is pinned to a minute, because on a day at
      // home the minute would be invented and the first time it's wrong you
      // stop believing the rest of the page.
      DS.loosen(rows.map((r) => ({ ...r, start: r.at })), shape).forEach((part) => {
        if (!part.rows.length) return;
        const head = document.createElement("h3");
        head.className = "dp-part";
        head.textContent = part.part;
        list.appendChild(head);
        part.rows.forEach((r) => {
          const el = r.kind === "block" ? blockRow(r.block) : taskRow(r.slot, r.item, plan, iso);
          el.classList.add("no-clock");
          list.appendChild(el);
        });
      });
    } else {
      let prevEnd = null;
      rows.forEach((r) => {
        const startsAt = r.kind === "block" ? S().toMin(r.block.start) : r.slot.start;
        if (prevEnd !== null && startsAt - prevEnd >= S().normaliseConfig(cfg).minGapMinutes) {
          list.appendChild(freeRow(prevEnd, startsAt));
        }
        list.appendChild(r.kind === "block" ? blockRow(r.block) : taskRow(r.slot, r.item, plan, iso));
        prevEnd = r.kind === "block" ? S().toMin(r.block.end) : r.slot.end;
      });
    }
    wrap.appendChild(list);

    const heads = troubleBox(iso);
    if (heads) wrap.appendChild(heads);
    if (plan.displaced && plan.displaced.length) wrap.appendChild(displacedBox(plan, iso));
    if (plan.flagged && plan.flagged.length) wrap.appendChild(flaggedBox(plan, iso));
    renderAccept(plan, iso);
    renderUnplanned(iso, plan);
  }

  // An id is not a person. A block that says "about c8x2k" tells you nothing,
  // and the whole reason for linking one to People is so the day can say who.
  function aboutWords(ids) {
    // THE ONE THAT HAD DRIFTED. This returned c.name with no fallback, so a
    // contact saved without a name put "with undefined" on the day.
    const names = (ids || []).map((id) => OrganiserNames.nameOf(contacts, id));
    return "with " + names.join(", ");
  }

  // WHEN TO SET OFF. "09:00" is when you are already late; this is the number
  // that changes what you do, so it goes on the row itself.
  function leaveWords(b) {
    const at = S().leaveBy(b);
    if (at === null) return "";
    return `<div class="dp-leave">${b.getThere > 0
      ? `leave by ${escapeHtml(S().fmtTime(S().toHM(at)))} — ${b.getThere} min to get there`
      : "be there on time"}</div>`;
  }

  function blockRow(b) {
    const el = document.createElement("div");
    // The solid/dashed difference is the most important thing on this page: a
    // fixed block is a fact, a soft one is the app guessing. If they looked the
    // same the whole plan would stop being trustworthy.
    el.className = "dp-row dp-block" + (b.soft ? " soft" : "");
    el.innerHTML = `
      <div class="dp-time">${escapeHtml(S().fmtSpan(b.start, b.end))}</div>
      <div class="dp-main">
        <div class="dp-title">${escapeHtml(b.label)}</div>
        ${b.soft ? `<div class="dp-guess">the app's guess — not a fixed thing</div>` : ""}
        ${b.about && b.about.length ? `<div class="dp-about">${escapeHtml(aboutWords(b.about))}</div>` : ""}
        ${leaveWords(b)}
      </div>`;
    return el;
  }

  function freeRow(from, to) {
    const el = document.createElement("div");
    el.className = "dp-free";
    el.textContent = `${S().durationWords(to - from)} free`;
    return el;
  }

  function taskRow(slot, it, plan, iso) {
    const el = document.createElement("div");
    el.className = "dp-row dp-task" + (slot.pinned ? "" : " soft");
    const est = S().estimateMinutes(it, cfg);
    // Says it plainly and describes rather than judges: the job has been on the
    // plan and not got done, which is a fact about the job's size, not about you.
    const again = window.OrganiserDayPlan.carriedOver(cfg, it.id, iso);
    el.innerHTML = `
      <div class="dp-time">${escapeHtml(S().fmtTime(S().toHM(slot.start)))}</div>
      <div class="dp-main">
        <div class="dp-title">${escapeHtml(it.title)}</div>
        <div class="dp-meta">
          <span class="dp-est${slot.pinned ? "" : " guess"}">${escapeHtml(S().durationWords(est.minutes))}${est.spent ? " left" : ""}${slot.pinned ? "" : " — a guess"}</span>
          ${est.spent ? `<span class="dp-sofar">${escapeHtml(S().durationWords(est.spent))} already in</span>` : ""}
          ${slot.why ? `<span class="dp-why">${escapeHtml(slot.why)}</span>` : ""}
          ${slot.clashWith && slot.clashWith.length
            ? `<span class="dp-clash">at the same time as ${escapeHtml(slot.clashWith.join(", "))}</span>`
            : ""}
          ${again >= 2 ? `<span class="dp-again">on the plan ${again} days running — it may want a proper slot, or breaking up</span>` : ""}
          <button type="button" class="link dp-area">${escapeHtml(areaLabel(it))}</button>
        </div>
      </div>
      <div class="dp-actions">
        <button type="button" class="tick" aria-label="Done" title="Done"></button>
        <button type="button" class="link dp-part">got part way</button>
        <button type="button" class="link dp-stop">something's come up</button>
        <button type="button" class="link dp-move">move</button>
        <button type="button" class="link dp-remove">not today</button>
      </div>`;
    el.querySelector(".tick").addEventListener("click", () => completeFromPlan(it, slot));
    el.querySelector(".dp-part").addEventListener("click", () => partWayThrough(it, slot));
    // THE INTERRUPTION BUTTON, on the thing you were actually doing. One tap
    // when the door goes: the day goes quiet, and the minutes already in this
    // job are held rather than lost. Say what it was when you come back.
    el.querySelector(".dp-stop").addEventListener("click", () => startAway("", it.id, slot.start));
    el.querySelector(".dp-area").addEventListener("click", () => {
      areaEditId = areaEditId === it.id ? null : it.id;
      render();
    });
    if (areaEditId === it.id) el.appendChild(areaBox(it));
    el.querySelector(".dp-remove").addEventListener("click", () => {
      const p = planFor(iso);
      p.dropped = (p.dropped || []).concat([it.id]);
      p.slots = p.slots.filter((s) => s.itemId !== it.id);
      savePlan(iso, p);
      render();
    });
    el.querySelector(".dp-move").addEventListener("click", () => {
      movingId = movingId === it.id ? null : it.id;
      render();
    });
    if (movingId === it.id) el.appendChild(moveBox(it, slot, iso));
    return el;
  }

  function moveBox(it, slot, iso) {
    const box = document.createElement("div");
    box.className = "dp-movebox";
    box.innerHTML = `<label>start at <input type="time" class="dp-newtime" value="${S().toHM(slot.start)}" /></label>
      <button type="button" class="link dp-movesave">move it</button>`;
    box.querySelector(".dp-movesave").addEventListener("click", () => {
      const v = box.querySelector(".dp-newtime").value;
      const mins = S().toMin(v);
      if (mins === null) return;
      // Moving something by hand makes it YOURS — it gets a real time on the
      // task and stops being something the app can shuffle.
      it.time = S().toHM(mins);
      it.date = iso;
      movingId = null;
      const p = planFor(iso);
      p.slots = p.slots.filter((s) => s.itemId !== it.id);
      savePlan(iso, p);
      persist();
      render();
    });
    return box;
  }

  // Ticking something off is the only free measurement the app gets of how long
  // a thing actually took — so it learns from it, quietly, and never asks.
  //
  // WHEN DID IT ACTUALLY START? There's no start button on purpose: one more
  // thing to remember is one more thing to fail at. But the app does know when
  // you last ticked something off, and you cannot have begun this one before
  // that. So the start is the LATER of "when the plan said" and "when you
  // finished the last thing". On a day running two hours late those are wildly
  // different numbers, and using the plan's was the whole problem.
  //
  // WHY THAT MATTERED. The old guard accepted anything up to twice the slot and
  // threw the rest away. That is not a filter, it's a sieve with a bias: an
  // overrun gets discarded, an underrun always counts. Measured over a
  // simulated month, work that really averaged 89 minutes taught the app 51,
  // and its idea of "draining" fell from 75 minutes to 57 — so it packed more
  // in, so more overran, so more got thrown away. The app was teaching itself
  // that your work is quicker than it is BECAUSE it kept running over.
  //
  // Now the measurement is honest, so the guard only has to catch the absurd —
  // something ticked hours after it was really finished. Wide, and applied the
  // same to a fast day as a slow one.
  function completeFromPlan(it, slot) {
    const now = new Date();
    const iso = todayISO();
    const p = planFor(iso);
    it.done = true;
    it.completedAt = now.toISOString();
    markRotaTurn(it);

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const lastTick = Number.isFinite(p.lastTickMin) ? p.lastTickMin : -1;
    const began = Math.max(slot.start, lastTick);
    // Wall clock minus the lessons in between — the app knows the timetable, so
    // a lesson that happened mid-job is not counted as part of the job.
    const elapsed = S().workingMinutesBetween(schedule, iso, began, nowMin);
    // What the job cost ALTOGETHER, including the sittings before today —
    // otherwise a three-hour job done over three days teaches the app it takes
    // an hour, which is how the estimates drifted down in the first place.
    const est = S().estimateMinutes(it, cfg);
    const total = elapsed + (Math.round(Number(it.spentMinutes) || 0));
    if (total >= 1 && total <= Math.max(4 * est.full, 120)) cfg = S().learn(cfg, it, total);
    logWorked(it, elapsed);

    p.lastTickMin = nowMin;
    savePlan(iso, p);
    persist();
    render();
    offerFollowUp(it);
  }

  // GOT PART WAY. The middle state the app had no word for.
  //
  // A job you got half through isn't done and isn't untouched. With nowhere to
  // put that, the minutes vanished: the plan asked for the whole thing again
  // tomorrow. Over a test month that was four and a half hours of real work
  // thrown away — and a pile of marking bigger than one day's free time could
  // never be finished at all, forty hours at the desk over ten days with
  // nothing to show, because every morning it started again from nothing.
  //
  // Costs one tap, and only when you want it. Nothing is ever assumed.
  function partWayThrough(it, slot) {
    const now = new Date();
    const iso = todayISO();
    const p = planFor(iso);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const lastTick = Number.isFinite(p.lastTickMin) ? p.lastTickMin : -1;
    const began = Math.max(slot.start, lastTick);
    const mins = S().workingMinutesBetween(schedule, iso, began, nowMin);
    if (mins >= 1) it.spentMinutes = Math.round(Number(it.spentMinutes) || 0) + mins;
    logWorked(it, mins);

    // It's had its turn today; the rest of the day belongs to other things.
    p.dropped = (p.dropped || []).concat([it.id]);
    p.slots = (p.slots || []).filter((s2) => s2.itemId !== it.id);
    p.lastTickMin = nowMin;
    savePlan(iso, p);
    persist();
    render();
    const left = S().estimateMinutes(it, cfg).minutes;
    setTlStatus(
      mins >= 1
        ? `${S().durationWords(mins)} on “${it.title}” — kept. About ${S().durationWords(left)} left, and it'll come round again. ✓`
        : `“${it.title}” put down for today — it'll come round again.`
    );
  }

  // WORK THAT MAKES MORE WORK. Finishing something is exactly when you find out
  // it wasn't the end of it — and exactly when you're least likely to stop and
  // write the next bit down, because it feels finished. Offered, never asked:
  // ignore it and it goes on the next render. One tap if you need it.
  function offerFollowUp(it, wording) {
    const bar = $("#tlStatus");
    if (!bar) return;
    bar.hidden = false;
    if (!wording) bar.textContent = `Done: ${it.title}. `;
    else bar.textContent = bar.textContent ? bar.textContent + " " : "";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = wording || "anything follow from it?";
    link.addEventListener("click", () => {
      const box = document.querySelector("#capture textarea, #capture input[type=text]");
      if (box) {
        box.focus();
        box.scrollIntoView({ block: "center" });
      }
      bar.textContent = "Say it however it comes out — it'll be sorted.";
    });
    bar.appendChild(link);
  }

  // Pushed out by something that actually happened. The wording matters: these
  // did not slip and you did not fail to do them — the time went somewhere real,
  // and the app knows where because you told it.
  // HEADING FOR A CLASH — said while you can still do something about it.
  //
  // Everything else in this page is about today. This is the one thing that
  // isn't: it looks weeks out and reports work that will not fit before it's
  // due, and by how much. That number is the useful part — "two hours short" is
  // something you can take to someone and ask for help, or for more time, or
  // for permission to drop something else. "You've run out of time" on the
  // morning of is not.
  //
  // Deliberately unexcited. No red, no count-down, no exclamation marks. The
  // point is that you find out early, not that you feel bad early.
  // IS IT PILING UP? The count of hours you have against the hours already
  // promised to a deadline, over the whole horizon rather than today.
  //
  // The app has been able to work this out for a long time and never said it.
  // "Two hours a day spare once the committed work is in" and "the committed
  // work is using nearly all the room there is" are the same arithmetic and
  // completely different weeks, and you can only act on the second one early.
  //
  // Said only when it is one of those two. A comfortable month does not need
  // reporting every morning.
  function pressureWords(iso) {
    const WP = window.OrganiserWeekPlan;
    if (!WP || !WP.pressure) return "";
    const c = S().normaliseConfig(cfg);
    let p;
    try {
      p = WP.pressure(items, schedule, c, iso, Math.max(c.planHorizonDays, 28), ctx());
    } catch {
      return "";
    }
    if (!p || p.verdict === "room") return "";
    return `Over the next ${p.days} days — ${p.because}. ` +
      `${S().durationWords(p.claimed)} of work against ${S().durationWords(p.ceiling)} of room, ` +
      `and ${p.daysWithRoom} day${p.daysWithRoom === 1 ? "" : "s"} with a real gap left in ${p.daysWithRoom === 1 ? "it" : "them"}.`;
  }

  function troubleBox(iso) {
    const WP = window.OrganiserWeekPlan;
    if (!WP || !WP.trouble) return null;
    const c = S().normaliseConfig(cfg);
    const rows = WP.trouble(items, schedule, c, iso, Math.max(c.planHorizonDays, 28), ctx())
      .filter((t) => t.short >= c.minSessionMinutes)
      .slice(0, 3);
    const piling = pressureWords(iso);
    if (!rows.length && !piling) return null;

    const box = document.createElement("div");
    box.className = "dp-ahead";
    box.innerHTML =
      `<h3>Worth knowing now</h3>` +
      (piling ? `<p class="dp-piling">${escapeHtml(piling)}</p>` : "") +
      (rows.length
        ? `<p class="muted">There isn't room for ${rows.length === 1 ? "this" : "these"} before ${rows.length === 1 ? "it's" : "they're"} due, on the time you've actually got. Said now rather than on the day, while there's still something you can do about it.</p>`
        : "");
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    rows.forEach((t) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      const when =
        t.daysLeft === null ? "" :
        t.daysLeft <= 0 ? "due today" :
        t.daysLeft === 1 ? "due tomorrow" :
        `${t.daysLeft} days away`;
      row.innerHTML =
        `<span class="dp-flagtitle">${escapeHtml(t.title)}</span>` +
        `<span class="dp-shortby">${escapeHtml(S().durationWords(t.short))} short${when ? ` · ${escapeHtml(when)}` : ""}</span>`;
      const a = document.createElement("button");
      a.type = "button";
      a.className = "link";
      a.textContent = "find it a day";
      const item = itemById(t.itemId);
      a.addEventListener("click", () => item && findADay(item, iso));
      row.appendChild(a);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function displacedBox(plan, iso) {
    const box = document.createElement("div");
    box.className = "dp-displaced";
    const names = plan.displaced.map((id) => itemById(id)).filter((x) => x && !x.done);
    if (!names.length) return box;
    box.innerHTML =
      `<h3>Pushed out by ${escapeHtml(plan.awayMinutes ? S().durationWords(plan.awayMinutes) : "what came up")}</h3>` +
      `<p class="muted">Not missed — there just isn't room left today. Move them, or leave them and they'll come round again.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    names.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      row.innerHTML = `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>`;
      const a = document.createElement("button");
      a.type = "button";
      a.className = "link";
      a.textContent = "find it a day";
      a.addEventListener("click", () => findADay(it, iso));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = "tomorrow";
      b.addEventListener("click", () => {
        it.date = S().addDaysISO(iso, 1);
        it.time = "";
        persist();
        render();
        setTlStatus(`Moved “${it.title}” to tomorrow. ✓`);
      });
      row.append(a, b);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function flaggedBox(plan, iso) {
    const box = document.createElement("div");
    box.className = "dp-flagged";
    // Never say the same thing twice. After a long interruption a big job is
    // both "pushed out" AND "wouldn't have fitted" — both true, but printing it
    // in two boxes with two explanations reads as two jobs, at the exact moment
    // you have least patience for working out that it's one. "Pushed out" wins:
    // it names the cause and it's the box with somewhere to put it.
    const alreadyShown = new Set(plan.displaced || []);
    const names = plan.flagged
      .map((f) => itemById(f.itemId))
      .filter((x) => x && !x.done && !alreadyShown.has(x.id))
      .slice(0, 4);
    if (!names.length) return box;
    box.innerHTML = `<h3>Needs a proper slot</h3>
      <p class="muted">Today hasn't got a long enough stretch for ${names.length === 1 ? "this" : "these"}. Not squeezed in on purpose — it wouldn't have fitted.</p>`;
    const list = document.createElement("div");
    list.className = "dp-flaglist";
    names.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dp-flagrow";
      row.innerHTML = `<span class="dp-flagtitle">${escapeHtml(it.title)}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link";
      btn.textContent = "find it a day";
      btn.addEventListener("click", () => findADay(it, iso));
      row.appendChild(btn);
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  // Look forward for the first day with a stretch long enough, and offer it.
  // Move one job to the next day that can genuinely hold it.
  //
  // This used to search the raw timetable — the lessons and nothing else — so it
  // was blind to every other thing already booked. Move three jobs after a bad
  // morning and all three landed on the same day at the same minute, on top of
  // each other, and the app looked like it had sorted you out. nextDayWithRoom
  // counts what's already committed, including what the week has planned.
  function findADay(it, fromISO) {
    const c = S().normaliseConfig(cfg);
    const est = S().estimateMinutes(it, c);
    const spot = window.OrganiserWeekPlan.nextDayWithRoom(it, items, schedule, c, fromISO, 21);
    if (!spot) {
      setTlStatus(`No day in the next three weeks has a ${S().durationWords(est.minutes)} stretch free. It may want breaking up.`);
      return;
    }
    it.date = spot.iso;
    it.time = S().toHM(spot.start);
    persist();
    render();
    setTlStatus(`Moved “${it.title}” to ${S().dayWord(new Date(spot.iso + "T12:00:00"))} at ${S().fmtTime(it.time)} — the first real stretch it fits in. ✓`);
  }

  // Said as a day and an amount, not as an instruction. It is your call.
  function roomWords(d) {
    const when = new Date(d.iso + "T12:00:00")
      .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
    return `${when} has ${S().durationWords(d.free)} free in it` +
      (d.kind === "own" ? " and nothing fixed" : "") + " — more room than today, if any of this can wait.";
  }

  // How long something has been sitting there. Said only once it is long enough
  // to be worth saying — "waiting 2 days" on everything would be noise, and a
  // number nobody needs is how a useful line stops being read.
  function waitingWords(it) {
    const s = OrganiserDates.agoWords(it.createdAt);
    // Said only once it is long enough to be worth saying — "waiting 2 days" on
    // everything is noise, and a number nobody needs is how a useful line stops
    // being read.
    if (!s || /^(today|1 day|[1-6] days)$/.test(s)) return "";
    return `waiting ${s}`;
  }

  function renderUnplanned(iso, plan) {
    const el = $("#unplanned");
    if (!el) return;
    const planned = new Set((plan && plan.slots ? plan.slots : []).map((s) => s.itemId));
    const left = items.filter((i) => !i.done && i.date === iso && !planned.has(i.id));
    // WORK WITH NO DATE IS NOT THE SAME AS WORK THAT DOESN'T EXIST.
    //
    // It is filler: it goes in whatever space is left over. But a day whose
    // budget is already full has no space left over, and then it gets nothing —
    // and unlike the dated work beside it, nothing said so. Dated work that
    // didn't fit is listed here and re-tried tomorrow by the week planner;
    // undated work was simply gone. Not de-prioritised — invisible.
    //
    // Deadlines still come first. This is not a claim that it should have had a
    // slot; it is the app admitting it is holding something it never mentions.
    const P = window.OrganiserPriority;
    const floating = items.filter(
      (i) => !i.done && !i.date && !i.openLoop && !planned.has(i.id) &&
        !(P && P.droppable && P.droppable(i))
    );
    if (!left.length && !floating.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    // AND WHERE THERE IS ROOM. Nothing is booked into it — undated work has no
    // deadline to miss and turning it into a commitment would be inventing a
    // promise. But the app knew the Saturday was empty and said nothing, which
    // is its own kind of unhelpful.
    const WPx = window.OrganiserWeekPlan;
    const better = WPx && WPx.betterDay ? WPx.betterDay(schedule, cfg, iso, 8) : null;
    el.innerHTML = `<h2>Also today</h2>` +
      (left.length
        ? `<p class="muted">Dated today but left out of the plan — the day was full enough.</p>`
        : "") +
      (better ? `<p class="dp-room">${escapeHtml(roomWords(better))}</p>` : "");
    const put = (into, it, extra) => {
      const row = document.createElement("div");
      row.className = "dp-alsorow";
      row.textContent = it.title;
      if (extra) {
        const tag = document.createElement("span");
        tag.className = "dp-waiting";
        tag.textContent = extra;
        row.appendChild(tag);
      }
      into.appendChild(row);
    };
    if (left.length) {
      const list = document.createElement("div");
      list.className = "dp-alsolist";
      left.forEach((it) => put(list, it, ""));
      el.appendChild(list);
    }
    if (floating.length) {
      const head = document.createElement("p");
      head.className = "muted dp-floating";
      head.textContent =
        `${floating.length} with no day on ${floating.length === 1 ? "it" : "them"} — ` +
        "these go in whatever room is left over, and today there wasn't any.";
      el.appendChild(head);
      const list = document.createElement("div");
      list.className = "dp-alsolist";
      // A handful, oldest first. A list of forty is not a thing anybody reads,
      // and the ones that have sat longest are the ones worth seeing.
      floating
        .slice()
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
        .slice(0, 6)
        .forEach((it) => put(list, it, waitingWords(it)));
      if (floating.length > 6) {
        const more = document.createElement("div");
        more.className = "dp-alsorow muted";
        more.textContent = `…and ${floating.length - 6} more`;
        list.appendChild(more);
      }
      el.appendChild(list);
    }
  }

  function renderAccept(plan, iso) {
    const bar = $("#dpAccept");
    if (!bar) return;
    if (!plan) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.innerHTML = "";
    if (plan.accepted) {
      const p = document.createElement("p");
      p.className = "dp-settled";
      p.textContent = "That's the day settled. Move anything you like — nothing's locked.";
      bar.appendChild(p);
      const re = document.createElement("button");
      re.type = "button";
      re.className = "link";
      re.textContent = "rebuild it";
      re.addEventListener("click", () => {
        const c = S().normaliseConfig(cfg);
        delete c.plans[iso];
        cfg = c;
        persist();
        render();
      });
      bar.appendChild(re);
      return;
    }
    const note = document.createElement("p");
    note.className = "dp-note";
    const freeLeft = Math.max(0, (plan.freeTotal || 0) - (plan.used || 0));
    note.textContent = freeLeft
      ? `${S().durationWords(freeLeft)} left deliberately free — days don't survive being packed.`
      : "";
    bar.appendChild(note);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "That's my day";
    btn.addEventListener("click", () => {
      const p = planFor(iso);
      p.acceptedAt = new Date().toISOString();
      savePlan(iso, p);
      render();
      setTlStatus("Settled. ✓");
    });
    bar.appendChild(btn);
  }

  function setTlStatus(msg) {
    const el = $("#tlStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // ---------- the week's shape (a once-a-term job) ----------
  // Sent here for the school calendar? Open that fold and go to it.
  function openFromLink() {
    const h = location.hash || "";
    if (/#calendar\b/.test(h)) {
      const box = document.getElementById("calBox");
      if (box) {
        box.open = true;
        box.scrollIntoView({ block: "start" });
      }
      return;
    }
    if (/#setup\b/.test(h)) {
      const t = document.getElementById("setupToggle");
      if (t) t.scrollIntoView({ block: "start" });
    }
  }

  function renderSetup() {
    const panel = $("#setup");
    const toggle = $("#setupToggle");
    if (!panel || !toggle) return;
    const n = S().normalise(schedule).length;
    toggle.textContent = setupOpen ? "close" : n ? `my week (${n} block${n === 1 ? "" : "s"})` : "set up my week";
    panel.hidden = !setupOpen;
    if (!setupOpen) return;

    panel.innerHTML = `
      <p class="muted">Your week's shape. This is a once-a-term job — take your time over it, it's worth getting right.
      Blocks marked <em>fixed</em> are facts and hold reminders back; <em>soft</em> ones are guesses and never silence anything.</p>
      <div class="su-import">
        <label class="su-lab">Paste your timetable — any layout, it gets read into rows you check before saving.</label>
        <textarea id="ttText" rows="4" placeholder="Mon-Fri 08:40-09:00 Registration&#10;Mon 09:00-09:45 P1 Maths 7B&#10;…"></textarea>
        <div class="su-row">
          <button type="button" id="ttRead" class="btn">Read this</button>
          <label class="su-file">or open the PDF
            <input type="file" id="ttPdf" accept=".pdf,application/pdf" hidden />
          </label>
          <label class="su-file">or import a calendar file (.ics)
            <input type="file" id="icsFile" accept=".ics,text/calendar" hidden />
          </label>
          <button type="button" id="addBlockBtn" class="link">add one by hand</button>
        </div>
        <p id="ttStatus" class="su-status" hidden></p>
      </div>
      <div id="makeUp" class="su-makeup"></div>
      <div id="fixedWords" class="su-makeup"></div>
      <div id="ttReview"></div>
      <div id="blockAdd"></div>
      <div id="blockList" class="su-list"></div>`;

    $("#ttRead").addEventListener("click", readTimetable);
    $("#ttPdf").addEventListener("change", readTimetablePdf);
    $("#icsFile").addEventListener("change", readIcs);
    renderMakeUp();
    renderFixedWords();
    $("#addBlockBtn").addEventListener("click", () => {
      addingBlock = !addingBlock;
      renderSetup();
    });
    if (addingBlock) $("#blockAdd").appendChild(blockForm());
    if (unreadableRows.length) $("#ttReview").appendChild(unreadableBox());
    if (pastedBlocks) $("#ttReview").appendChild(reviewTable());
    renderBlockList();
  }

  // THE WORDS THAT MEAN "THIS HAPPENS AT A TIME", shown so they can be changed.
  //
  // A vocabulary you cannot see is not yours, and this one decides something
  // that matters: whether the app may plan a thing earlier than the day it is
  // on. It learns a word whenever you change something to an Event on the
  // check-back, which is the ordinary way it fills up — this is where you look
  // if it learned one it shouldn't have.
  function renderFixedWords() {
    const box = $("#fixedWords");
    if (!box) return;
    const c = S().normaliseConfig(cfg);
    box.innerHTML = `
      <details class="p-setup">
        <summary>Words that mean something happens at a time (${c.fixedWords.length})</summary>
        <p class="muted">A deadline means have it finished by then, so the app looks for
          room earlier. These words mean the opposite — the thing happens when it happens,
          and turning up early is not being ahead of it. Anything with one of these in it
          is read as an Event, which you can always change on the check-back.</p>
        <p class="muted">It adds a word here whenever you correct it. Edit the list however
          you like; leave it empty and nothing is ever read as fixed.</p>
        <label class="ls-full">One per line
          <textarea id="fwText" rows="5">${escapeHtml(c.fixedWords.join("\n"))}</textarea>
        </label>
        <button type="button" id="fwSave" class="btn">Keep these words</button>
      </details>`;
    const btn = $("#fwSave");
    if (btn)
      btn.addEventListener("click", () => {
        const list = ($("#fwText").value || "").split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
        cfg = { ...S().normaliseConfig(cfg), fixedWords: list };
        persist();
        renderSetup();
        setSuStatus(`Keeping ${list.length} word${list.length === 1 ? "" : "s"}. ✓`);
      });
  }

  function setSuStatus(msg) {
    const el = $("#ttStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // WHAT THE READER FOUND, ON SCREEN, BEFORE ANY OF IT IS KEPT.
  function showRead(got) {
    pastedBlocks = got.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
    unreadableRows = [];
    renderSetup();
    setSuStatus(window.OrganiserTimetable ? window.OrganiserTimetable.words(got) : "");
  }

  async function readTimetable() {
    // NOT TRIMMED. A timetable's first line is the day names with an empty cell
    // in front of them, so the paste starts with a tab — and trimming it takes
    // that cell away and shifts every day one column to the left. Monday's
    // lessons come out on Sunday and nothing looks wrong.
    const text = $("#ttText").value || "";
    if (!text.trim()) return;
    // READ HERE, IN PLAIN CODE, FIRST.
    //
    // A timetable is a grid, and a grid is arithmetic: count the columns, find
    // the times, take what's in each cell. It went through the model for a
    // year, which meant no model meant no timetable, no server meant no
    // timetable, and the same paste could come out differently twice. None of
    // that was ever necessary. The model still gets a go at anything that
    // isn't a grid or a list, because that part it genuinely is better at.
    const T = window.OrganiserTimetable;
    const got = T ? T.read(text) : null;
    if (got && got.blocks.length) return showRead(got);
    setSuStatus("Reading it… this one's allowed to take a moment.");
    try {
      const r = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) {
        setSuStatus(d.message || "Couldn't read that — you can still add blocks by hand.");
        return;
      }
      if (!d.blocks || !d.blocks.length) {
        unreadableRows = Array.isArray(d.unreadable) ? d.unreadable : [];
        pastedBlocks = null;
        renderSetup();
        setSuStatus(
          unreadableRows.length
            ? `Nothing came out whole — but ${unreadableRows.length} row${unreadableRows.length === 1 ? " is" : "s are"} listed below so you can see what it stumbled on.`
            : "Nothing in there looked like a timed block. Try adding one by hand to see the shape."
        );
        return;
      }
      pastedBlocks = d.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
      unreadableRows = Array.isArray(d.unreadable) ? d.unreadable : [];
      setSuStatus("");
      renderSetup();
    } catch {
      setSuStatus("Couldn't reach the reader just now — you can still add blocks by hand.");
    }
  }

  // A TIMETABLE OUT OF A PDF.
  //
  // Not through the text. A PDF has no columns to lose because it never had
  // any — it has words at coordinates, and read as text a whole row of lessons
  // comes out run together with nothing between them. The positions are the
  // columns, so those are what this uses, and the text is only the fallback.
  async function readTimetablePdf(e) {
    const f = e.target.files && e.target.files[0];
    const P = window.OrganiserPdfText;
    const T = window.OrganiserTimetable;
    if (!f || !P || !T) return;
    setSuStatus("Opening it…");
    try {
      const r = await P.read(await f.arrayBuffer());
      if (!r.ok) {
        setSuStatus((r.notes.join(" ") || "That file couldn't be opened.") +
          " Opening it and copying the table across will work.");
        return;
      }
      // THREE WAYS IN, STRONGEST FIRST.
      //
      // The PDF's own positions, if it drew a table with them. Then the text,
      // if it still looks like a grid or a list. Then page by page as an
      // agenda — a schedule with the times down one side and a date printed on
      // each page, which is what an orientation or an inset day arrives as, and
      // which is all that survives a PDF that positions every letter separately.
      const fromRows = r.rows && r.rows.length ? T.fromRows(r.rows) : null;
      const fromText = T.read(r.text);
      const got =
        (fromRows && fromRows.blocks.length ? fromRows : null) ||
        (fromText.shape === "grid" || fromText.shape === "lines" ? fromText : null) ||
        T.fromPages(r.pages) ||
        fromText;
      if (!got.blocks.length) {
        if ($("#ttText")) $("#ttText").value = r.text;
        setSuStatus("Nothing in there looked like a timetable — the text is in the box " +
          "above so you can see what came out, and tidy it.");
        return;
      }
      showRead(got);
      setSuStatus(r.caution + " " + T.words(got));
    } catch {
      setSuStatus("That file couldn't be opened. Copy the table across instead.");
    }
  }

  // ---- make-up days ---------------------------------------------------------
  //
  // A Saturday that runs the Friday timetable, because the holiday moved and
  // this is the day standing in for it. Without it the only way to say so is to
  // type every lesson in again as a one-off — and the app would still think the
  // day was your own, so it would plan a lie-in over the top of a teaching day.
  function renderMakeUp() {
    const box = $("#makeUp");
    if (!box) return;
    const Sx = S();
    const made = Sx.normalise(schedule).filter((b) => b.runsAs !== null);
    box.innerHTML = `
      <details class="p-setup">
        <summary>Days that run another day's timetable</summary>
        <p class="muted">A working Saturday standing in for a weekday, or any day
          that runs a different day's lessons. Say which day it runs as and the
          whole timetable moves with it — hours, lessons and all.</p>
        <div class="su-row">
          <label>Date <input type="date" class="mu-date" /></label>
          <label>runs as
            <select class="mu-day">${DAY_NAMES.map((n, i) => `<option value="${i}">${escapeHtml(n)}</option>`).join("")}</select>
          </label>
          <button type="button" class="btn mu-add">Add it</button>
        </div>
        <div class="mu-list"></div>
      </details>`;
    const list = box.querySelector(".mu-list");
    if (!made.length) list.innerHTML = `<p class="empty">None yet.</p>`;
    else
      made.forEach((b) => {
        const row = document.createElement("div");
        row.className = "su-brow";
        const span = document.createElement("span");
        span.className = "su-blabel";
        span.textContent = `${OrganiserDates.dayWords(b.date)} — runs as ${DAY_NAMES[b.runsAs]}`;
        row.appendChild(span);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "link";
        del.textContent = "remove";
        del.addEventListener("click", () => {
          schedule = Sx.normalise(schedule).filter((x) => x.id !== b.id);
          persist();
          renderSetup();
          render();
        });
        row.appendChild(del);
        list.appendChild(row);
      });
    box.querySelector(".mu-add").addEventListener("click", () => {
      const date = box.querySelector(".mu-date").value;
      const day = Number(box.querySelector(".mu-day").value);
      // NOTHING HAPPENING IS NOT AN ANSWER. Pressing this with no date in the
      // box did nothing at all and said nothing at all — so the only way to
      // find out why was to guess.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setSuStatus("Which date is it? Put the day in first and I'll move the timetable onto it.");
        return;
      }
      const made2 = Sx.normaliseBlock({
        label: `runs as ${DAY_NAMES[day]}`,
        start: "00:00", end: "23:59", date, runsAs: day, source: "hand",
      });
      if (!made2) return;
      // One per date. Saying it twice is a correction, not a second day.
      const replacing = Sx.normalise(schedule).some((x) => x.date === date && x.runsAs !== null);
      schedule = Sx.normalise(schedule)
        .filter((x) => !(x.date === date && x.runsAs !== null))
        .concat([made2]);
      persist();
      renderSetup();
      render();
      // Said out loud, like every other action in this panel. The row appearing
      // below is real feedback, but it is the only action here that didn't also
      // say what it had done.
      setSuStatus(
        `${replacing ? "Changed" : "Added"} — ${OrganiserDates.dayWords(date)} runs ${DAY_NAMES[day]}'s timetable. ✓`
      );
    });
  }

  function readIcs(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      const out = OrganiserIcs.parse(fr.result);
      if (!out.blocks.length) {
        setSuStatus("No events found in that file.");
        return;
      }
      pastedBlocks = out.blocks.map((b) => ({ ...b, id: uid(), keep: true }));
      setSuStatus(
        `Read ${out.blocks.length} entr${out.blocks.length === 1 ? "y" : "ies"}.` +
          (out.skipped.length ? ` ${out.skipped.length} couldn't be read and ${out.skipped.length === 1 ? "was" : "were"} left out: ${out.skipped.slice(0, 3).join(", ")}${out.skipped.length > 3 ? "…" : ""}` : "")
      );
      renderSetup();
    };
    fr.onerror = () => setSuStatus("Couldn't read that file.");
    fr.readAsText(file);
    e.target.value = "";
  }

  const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function daysWords(b) {
    if (b.date) return b.date;
    if (!b.days || !b.days.length) return "—";
    if (b.days.length === 5 && [1, 2, 3, 4, 5].every((d) => b.days.includes(d))) return "weekdays";
    return b.days.slice().sort().map((d) => DAY_NAMES[d]).join(" ");
  }

  // ---- who's running these -------------------------------------------------
  //
  // A schedule says who is taking each session, and those people are the ones
  // you are about to spend two days with. Read out of a PDF their names arrive
  // mixed into one run of words with the rooms and the groups, so something has
  // to pick them out — and then STOP.
  //
  // Never added silently. That rule is written at the top of names.js and it is
  // right: a wrong guess becomes a permanent contact you then have to find and
  // delete, and a right one you never confirmed is a contact you don't trust.
  // So they are offered, unticked, and the ones you tick get added AND linked to
  // the sessions their name appeared in.
  //
  // Anyone already in People is matched and linked without asking, because that
  // is not a guess — it is a look-up.
  let peoplePick = null;

  function candidates() {
    const N = window.OrganiserNames;
    if (!N || !N.peopleIn || !pastedBlocks) return [];
    const seen = new Map();
    pastedBlocks.forEach((b) => {
      if (!b.note) return;
      N.peopleIn(b.note).forEach((c) => {
        const found = N.look(c.name, contacts);
        const key = found.state === "matched" ? found.contact.id : "new:" + c.name.toLowerCase();
        const had = seen.get(key);
        if (had) { had.on.push(b.id); return; }
        seen.set(key, {
          key, name: found.state === "matched" ? found.contact.name : c.name,
          known: found.state === "matched" ? found.contact : null,
          nearly: found.state === "nearly" ? found.suggestions : null,
          listed: c.listed, on: [b.id],
        });
      });
    });
    return [...seen.values()];
  }

  function peopleOffer() {
    const box = document.createElement("div");
    box.className = "su-people";
    const list = candidates();
    if (!list.length) return box;
    if (!peoplePick) {
      // Anyone you already have is on, because linking a person you already
      // know is a look-up. Anyone new is off, because adding one is a decision.
      peoplePick = new Set(list.filter((c) => c.known).map((c) => c.key));
    }
    const known = list.filter((c) => c.known).length;
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      `${list.length} name${list.length === 1 ? "" : "s"} in these — tick whoever is a person and ` +
      `they'll go in People, linked to the sessions they're named on.` +
      (known ? ` ${known} ${known === 1 ? "is" : "are"} already there.` : "") +
      " It only finds the ones written as a list, so add anyone it missed.";
    box.appendChild(p);
    const row = document.createElement("div");
    row.className = "su-chips";
    list.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "p-opt su-chip" + (peoplePick.has(c.key) ? " on" : "") + (c.known ? " known" : "");
      b.textContent = c.name + (c.known ? " ✓" : "") + (c.on.length > 1 ? ` ·${c.on.length}` : "");
      if (c.nearly && c.nearly.length)
        b.title = `You already have ${c.nearly.map((x) => x.name).join(" or ")} — same person?`;
      b.addEventListener("click", () => {
        if (peoplePick.has(c.key)) peoplePick.delete(c.key);
        else peoplePick.add(c.key);
        renderSetup();
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    const add = document.createElement("div");
    add.className = "su-row";
    add.innerHTML = `<label>someone it missed <input type="text" class="pp-new" maxlength="60" /></label>
      <button type="button" class="link pp-add">add them</button>`;
    add.querySelector(".pp-add").addEventListener("click", () => {
      const name = add.querySelector(".pp-new").value.trim();
      if (!name) return;
      const N = window.OrganiserNames;
      const found = N ? N.look(name, contacts) : { state: "new" };
      if (found.state === "matched") { peoplePick.add(found.contact.id); renderSetup(); return; }
      contacts = contacts.concat([{ id: uid(), name, group: "", details: {},
        createdAt: new Date().toISOString() }]);
      persistPeople();
      renderSetup();
    });
    box.appendChild(add);
    return box;
  }

  // Turn the ticks into People, and hand back which block gets which id.
  function applyPeople() {
    const byBlock = new Map();
    if (!peoplePick || !peoplePick.size) return byBlock;
    let changed = false;
    candidates().forEach((c) => {
      if (!peoplePick.has(c.key)) return;
      let id = c.known ? c.known.id : "";
      if (!id) {
        id = uid();
        contacts = contacts.concat([{ id, name: c.name, group: "", details: {},
          createdAt: new Date().toISOString() }]);
        changed = true;
      }
      c.on.forEach((blockId) => {
        if (!byBlock.has(blockId)) byBlock.set(blockId, []);
        byBlock.get(blockId).push(id);
      });
    });
    if (changed) persistPeople();
    return byBlock;
  }

  // ---- things a schedule tells you to DO -----------------------------------
  //
  // "Health Check (bring passport & FOUR ID photos)". The session is a thing
  // you attend; the bracket is a thing you have to do, and it is the single
  // most important line on the page — the one that costs you the morning if you
  // miss it. As a block it is neither: you cannot tick it off and nothing
  // reminds you.
  //
  // A BRACKET THAT STARTS WITH A DOING WORD. Narrow on purpose: a bracket is
  // nearly always an aside, and an aside in the imperative is an instruction to
  // the reader. "(PS & MS)" and "(HS)" are not, and don't come out.
  let jobPick = null;

  function askedFor() {
    const QP = window.OrganiserQuickParse;
    if (!QP || !QP.startsWithDoing || !pastedBlocks) return [];
    const out = [];
    const seen = new Set();
    pastedBlocks.forEach((b) => {
      const src = `${b.label || ""}\n${b.note || ""}`;
      (src.match(/\(([^)]{4,80})\)/g) || []).forEach((raw) => {
        // A bracket can run across the lines the note kept, so it comes back
        // as one line before anything reads it.
        const inner = raw.slice(1, -1).replace(/\s+/g, " ").trim();
        if (!QP.startsWithDoing(inner)) return;
        const key = inner.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          key, text: QP.dropLeadIn(inner), date: b.date || "",
          // The session's name without its brackets — one of which is this very
          // instruction, and reading it twice on one line is noise.
          on: String(b.label || "").replace(/\s*\([^)]*\)/g, "").trim(),
        });
      });
    });
    return out;
  }

  function jobOffer() {
    const box = document.createElement("div");
    box.className = "su-people";
    const list = askedFor();
    if (!list.length) return box;
    if (!jobPick) jobPick = new Set();
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = `${list.length} of these say to bring or do something. ` +
      "Tick any you want as a job on the day — they're not jobs until you say so.";
    box.appendChild(p);
    const row = document.createElement("div");
    row.className = "su-chips";
    list.forEach((j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "p-opt su-chip" + (jobPick.has(j.key) ? " on" : "");
      b.textContent = j.text + (j.on ? ` — ${j.on}` : "");
      b.addEventListener("click", () => {
        if (jobPick.has(j.key)) jobPick.delete(j.key);
        else jobPick.add(j.key);
        renderSetup();
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    return box;
  }

  function applyJobs() {
    if (!jobPick || !jobPick.size) return 0;
    const made = askedFor().filter((j) => jobPick.has(j.key)).map((j) => ({
      id: uid(), title: j.text, type: "task", date: j.date, time: "", tags: [],
      deadlineType: j.date ? "hard" : "soft", importance: "normal", effort: "quick",
      goalId: "", openLoop: false, promisedTo: "", waitingOn: "", done: false,
      createdAt: new Date().toISOString(), completedAt: null, plannedMinutes: 0,
      spentMinutes: 0, optional: false, committed: true, notBefore: "", areas: [],
      // What it came off, so you can see why it's there a month later.
      whenText: j.on || "",
    }));
    if (!made.length) return 0;
    items = items.concat(made);
    return made.length;
  }

  // ---- somewhere you have to be --------------------------------------------
  //
  // A schedule is a list of places you have to be at a time, and if being late
  // is penalised then every one of them is a job — not scenery on the calendar.
  // The app used to draw them and then plan work up to the minute they started,
  // which is the app causing the thing you get penalised for.
  //
  // ON BY DEFAULT HERE, unlike everything else in this box. Everything else is
  // the app proposing something about your words; this is the plain reading of
  // what a schedule IS. Untick it if these are places you're already sitting.
  let therePick = true;
  let thereMins = 0;
  // Blank = for ever, which is the honest default for a timetable nobody has
  // told us the term dates for. See termOffer().
  let termFrom = "";
  let termTo = "";

  // WHEN DOES THIS TIMETABLE ACTUALLY RUN?
  //
  // A timetable typed in with no dates on it repeats every week for ever — which
  // is what you want during term and quietly wrong the rest of the year. Paste
  // one in August and the app shows your summer as fully booked: every weekday
  // of the holidays carrying a full teaching load, in the month view whose whole
  // promise is that an empty square is real free time.
  //
  // Blank still means "for ever", because that is the honest default for a
  // timetable somebody hasn't told us the term dates for. But it is asked, here,
  // where the timetable is being saved, instead of being a fact you find out in
  // December.
  function termOffer() {
    const box = document.createElement("div");
    box.className = "su-people";
    if (!pastedBlocks || !pastedBlocks.length) return box;
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = termFrom || termTo
      ? "These run between those dates and nowhere else."
      : "Left blank, these run every week for ever — through the holidays too. Put the term's dates in and they stop at the end of it.";
    box.appendChild(p);
    const row = document.createElement("div");
    row.className = "su-row";
    const lab = document.createElement("label");
    lab.innerHTML =
      `runs from <input type="date" class="tm-from" value="${escapeHtml(termFrom)}" />` +
      ` until <input type="date" class="tm-to" value="${escapeHtml(termTo)}" />`;
    lab.querySelector(".tm-from").addEventListener("change", (e) => { termFrom = e.target.value || ""; renderSetup(); });
    lab.querySelector(".tm-to").addEventListener("change", (e) => { termTo = e.target.value || ""; renderSetup(); });
    row.appendChild(lab);
    box.appendChild(row);
    return box;
  }

  function thereOffer() {
    const box = document.createElement("div");
    box.className = "su-people";
    if (!pastedBlocks || !pastedBlocks.length) return box;
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      "These are places you have to be. Counted as jobs, nothing gets planned " +
      "into the time it takes to get there, and the day tells you when to leave.";
    box.appendChild(p);
    const row = document.createElement("div");
    row.className = "su-row";
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "p-opt su-chip" + (therePick ? " on" : "");
    tick.textContent = therePick ? "count these as jobs ✓" : "count these as jobs";
    tick.addEventListener("click", () => { therePick = !therePick; renderSetup(); });
    row.appendChild(tick);
    const lab = document.createElement("label");
    lab.innerHTML = `minutes to get there <input type="number" class="th-mins" min="0" max="240" value="${thereMins}" />`;
    lab.querySelector(".th-mins").addEventListener("change", (e) => {
      thereMins = Math.max(0, Math.min(240, Number(e.target.value) || 0));
      renderSetup();
    });
    row.appendChild(lab);
    box.appendChild(row);
    return box;
  }

  // NOTHING SAVES UNTIL THIS IS CHECKED. The model read a wall of text; a person
  // reads the result. Every cell is editable and every row can be dropped.
  function reviewTable() {
    const box = document.createElement("div");
    box.className = "su-review";
    box.innerHTML = `<h3>Check these before they're saved</h3>
      <p class="muted">Fix anything that's wrong, untick anything that isn't a real block. Nothing is saved until you press save.</p>`;
    const table = document.createElement("div");
    table.className = "su-table";
    pastedBlocks.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "su-trow" + (b.keep ? "" : " dropped");
      // A ONE-OFF NEEDS ITS DATE ON SCREEN, NOT JUST IN THE DATA. Something
      // with no repeating days and no date is thrown away when it's saved —
      // silently, because a block with nothing to happen on isn't a block. So
      // anything dated shows a date box, and one that's empty is visibly empty.
      const dated = !b.days || !b.days.length;
      row.innerHTML = `
        <input type="checkbox" class="su-keep" ${b.keep ? "checked" : ""} aria-label="Keep this row" />
        <input type="text" class="su-label" value="${escapeHtml(b.label)}" aria-label="Label" />
        <input type="time" class="su-start" value="${escapeHtml(b.start)}" aria-label="Start" />
        <input type="time" class="su-end" value="${escapeHtml(b.end)}" aria-label="End" />
        ${dated
          ? `<input type="date" class="su-date${b.date ? "" : " missing"}" value="${escapeHtml(b.date || "")}" aria-label="Date" />`
          : `<span class="su-days">${escapeHtml(daysWords(b))}</span>`}`;
      row.querySelector(".su-keep").addEventListener("change", (e) => {
        pastedBlocks[i].keep = e.target.checked;
        row.classList.toggle("dropped", !e.target.checked);
      });
      row.querySelector(".su-label").addEventListener("input", (e) => (pastedBlocks[i].label = e.target.value));
      row.querySelector(".su-start").addEventListener("change", (e) => (pastedBlocks[i].start = e.target.value));
      row.querySelector(".su-end").addEventListener("change", (e) => (pastedBlocks[i].end = e.target.value));
      if (dated)
        row.querySelector(".su-date").addEventListener("change", (e) => (pastedBlocks[i].date = e.target.value));
      if (b.note) {
        const note = document.createElement("span");
        note.className = "su-tnote";
        note.textContent = b.note;
        row.appendChild(note);
      }
      table.appendChild(row);
    });
    box.appendChild(table);
    box.appendChild(termOffer());
    box.appendChild(thereOffer());
    box.appendChild(peopleOffer());
    box.appendChild(jobOffer());
    const actions = document.createElement("div");
    actions.className = "su-row";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn";
    save.textContent = "Save these blocks";
    save.addEventListener("click", () => {
      const wanted = pastedBlocks.filter((b) => b.keep);
      // Who runs what, worked out before the blocks are made so each one can
      // carry the ids of the people named on it.
      const who = applyPeople();
      const kept = wanted
        .map((b) => S().normaliseBlock({
          ...b,
          about: (b.about || []).concat(who.get(b.id) || []),
          beThere: therePick,
          getThere: therePick ? thereMins : 0,
          // Blank stays blank, and blank means for ever.
          from: termFrom || b.from || "",
          to: termTo || b.to || "",
        }))
        .filter(Boolean);
      // A ROW THAT WOULDN'T SAVE IS SAID OUT LOUD. "Saved 14" when you were
      // looking at 16 is the failure you can't see: the two that went are the
      // two you'd have wanted to know about.
      const lost = wanted.length - kept.length;
      schedule = S().normalise(schedule).concat(kept);
      const linked = kept.filter((b) => b.about.length).length;
      const jobs = applyJobs();
      pastedBlocks = null;
      peoplePick = null;
      jobPick = null;
      therePick = true;
      thereMins = 0;
      persist();
      renderSetup();
      render();
      setSuStatus(
        `Saved ${kept.length} block${kept.length === 1 ? "" : "s"}. ✓` +
        (linked ? ` ${linked} of them say who's running it.` : "") +
        (jobs ? ` ${jobs} job${jobs === 1 ? "" : "s"} added.` : "") +
        (termFrom || termTo
          ? ` Running ${termFrom ? `from ${calDay(termFrom)}` : "until now"}${termTo ? ` to ${calDay(termTo)}` : " onwards"}.`
          : " They repeat every week — say when the term ends and they'll stop there.") +
        (lost ? ` ${lost} couldn't be saved — ${lost === 1 ? "it had" : "they had"} no day or date on ${lost === 1 ? "it" : "them"}.` : "")
      );
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link";
    cancel.textContent = "throw these away";
    cancel.addEventListener("click", () => {
      pastedBlocks = null;
      renderSetup();
    });
    actions.append(save, cancel);
    box.appendChild(actions);
    return box;
  }

  // A ROW THAT VANISHED IS INVISIBLE. You can check a table for what's WRONG,
  // but never for what ISN'T THERE — so a row the reader couldn't parse is
  // listed here rather than quietly dropped, with what tripped it up. Add it by
  // hand, or fix the paste and read it again; either way you know it existed.
  function unreadableBox() {
    const box = document.createElement("div");
    box.className = "su-unreadable";
    box.innerHTML =
      `<h3>${unreadableRows.length} row${unreadableRows.length === 1 ? "" : "s"} it couldn't read</h3>` +
      `<p class="muted">Not saved and not thrown away — here they are so nothing goes missing without you seeing it.</p>` +
      `<ul>${unreadableRows
        .map((r) => `<li><span class="su-badlabel">${escapeHtml(r.label)}</span> <span class="su-badwhy">${escapeHtml(r.why)}</span>${r.start || r.end ? ` <span class="su-badtime">${escapeHtml(String(r.start || "?"))}–${escapeHtml(String(r.end || "?"))}</span>` : ""}</li>`)
        .join("")}</ul>`;
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "link";
    hide.textContent = "I've dealt with these";
    hide.addEventListener("click", () => {
      unreadableRows = [];
      renderSetup();
    });
    box.appendChild(hide);
    return box;
  }

  function blockForm(existing) {
    const b = existing || { label: "", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5], date: "", from: "", to: "", soft: false, swappable: false, beThere: false, getThere: 0, skip: [], about: [] };
    const form = document.createElement("div");
    form.className = "su-form";
    form.innerHTML = `
      <input type="text" class="bf-label" placeholder="what is it called?" value="${escapeHtml(b.label)}" aria-label="Label" />
      <label>from <input type="time" class="bf-start" value="${escapeHtml(b.start)}" /></label>
      <label>to <input type="time" class="bf-end" value="${escapeHtml(b.end)}" /></label>
      <div class="bf-days">${DAY_LETTERS.map((l, i) => `<label class="bf-day"><input type="checkbox" value="${i}" ${b.days.includes(i) ? "checked" : ""} /><span>${l}</span></label>`).join("")}</div>
      <label class="bf-onedate">or one date only <input type="date" class="bf-date" value="${escapeHtml(b.date || "")}" /></label>
      <div class="bf-runs">
        <span class="bf-hint">WHEN DOES IT RUN? Staff go back before the students do, and a
          timetable with no dates on it runs for ever — including that week, and next July.
          Leave both empty if it really does apply all year.</span>
        <label>from <input type="date" class="bf-from" value="${escapeHtml(b.from || "")}" /></label>
        <label>until <input type="date" class="bf-to" value="${escapeHtml(b.to || "")}" /></label>
      </div>
      <label class="bf-soft"><input type="checkbox" class="bf-softbox" ${b.soft ? "checked" : ""} /> this one's a guess, not a fixed thing</label>
      <label class="bf-soft"><input type="checkbox" class="bf-swapbox" ${b.swappable ? "checked" : ""} /> this one could be swapped with someone if it came to it</label>
      <label class="bf-soft"><input type="checkbox" class="bf-therebox" ${b.beThere ? "checked" : ""} /> I have to be here on time — count it as a job</label>
      <label class="bf-lead">and it takes <input type="number" class="bf-getthere" min="0" max="240" value="${Number(b.getThere) || 0}" /> minutes to get there
        <span class="bf-hint">Nothing gets planned into that time, and the day tells you when to leave.</span></label>
      <label class="bf-soft"><input type="checkbox" class="bf-prep" ${b.prep && b.prep.on ? "checked" : ""} /> I have to get something ready before this one</label>
      <label class="bf-lead">ready by <input type="number" class="bf-leaddays" min="0" max="14" value="${b.prep && b.prep.leadDays ? b.prep.leadDays : 1}" /> day(s) before
        <span class="bf-hint">A task appears for each time this comes round, a week ahead — not the whole term. Leave the box unticked for anything you don't prepare yourself.</span></label>
      <label class="bf-about">about (ids, comma separated — leave empty unless it's a meeting)
        <input type="text" class="bf-aboutbox" value="${escapeHtml((b.about || []).join(", "))}" /></label>
      <div class="su-row">
        <button type="button" class="btn bf-save">${existing ? "Save changes" : "Add this block"}</button>
        <button type="button" class="link bf-cancel">cancel</button>
      </div>`;
    form.querySelector(".bf-cancel").addEventListener("click", () => {
      addingBlock = false;
      editingBlockId = null;
      renderSetup();
    });
    form.querySelector(".bf-save").addEventListener("click", () => {
      const days = [...form.querySelectorAll(".bf-days input:checked")].map((x) => Number(x.value));
      const made = S().normaliseBlock({
        id: existing ? existing.id : uid(),
        label: form.querySelector(".bf-label").value,
        start: form.querySelector(".bf-start").value,
        end: form.querySelector(".bf-end").value,
        days,
        date: form.querySelector(".bf-date").value,
        // The stretch it runs for. Without these a timetable applies from the
        // day you typed it until the end of time.
        from: form.querySelector(".bf-from").value,
        to: form.querySelector(".bf-to").value,
        soft: form.querySelector(".bf-softbox").checked,
        // Not the same as a guess. This one definitely happens — it is just
        // fixed to a person rather than to the clock, and could be traded.
        swappable: form.querySelector(".bf-swapbox").checked,
        // Turning up on time is work. Saying so blocks the journey out and puts
        // it in your list as a job like any other.
        beThere: form.querySelector(".bf-therebox").checked,
        getThere: Number(form.querySelector(".bf-getthere").value) || 0,
        // Kept, or a swap already recorded would be thrown away by an edit.
        skip: (existing && existing.skip) || [],
        runsAs: existing ? existing.runsAs : null,
        prep: {
          on: form.querySelector(".bf-prep").checked,
          leadDays: Number(form.querySelector(".bf-leaddays").value) || 1,
        },
        about: form.querySelector(".bf-aboutbox").value.split(",").map((s) => s.trim()).filter(Boolean),
        source: "hand",
      });
      if (!made) {
        setSuStatus("That needs a name, a start and an end — and at least one day (or a date).");
        return;
      }
      schedule = S().normalise(schedule).filter((x) => x.id !== made.id).concat([made]);
      addingBlock = false;
      editingBlockId = null;
      persist();
      syncPrep(); // switching it on should take effect now, not tomorrow
      renderSetup();
      render();
      setSuStatus(made.prep.on ? "Saved — its tasks are on your list. ✓" : "Saved. ✓");
    });
    return form;
  }

  let editingBlockId = null;
  // Which block is having its exceptions edited, if any.
  let swappingId = "";
  function renderBlockList() {
    const el = $("#blockList");
    if (!el) return;
    const list = S().normalise(schedule).sort((a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || S().toMin(a.start) - S().toMin(b.start));
    el.innerHTML = "";
    if (!list.length) {
      el.innerHTML = `<p class="empty">No blocks yet.</p>`;
      return;
    }
    list.forEach((b) => {
      if (editingBlockId === b.id) {
        el.appendChild(blockForm(b));
        return;
      }
      const row = document.createElement("div");
      row.className = "su-brow" + (b.soft ? " soft" : "");
      row.innerHTML = `
        <span class="su-bwhen">${escapeHtml(daysWords(b))} ${escapeHtml(S().fmtSpan(b.start, b.end))}</span>
        <span class="su-blabel">${escapeHtml(b.label)}${b.soft ? ' <span class="su-softtag">guess</span>' : ""}${b.swappable ? ' <span class="su-swaptag">could swap</span>' : ""}${b.beThere ? ` <span class="su-theretag">be there${b.getThere ? ` · ${b.getThere}m away` : ""}</span>` : ""}${b.skip.length ? ` <span class="su-skiptag">off ${b.skip.length} day${b.skip.length === 1 ? "" : "s"}</span>` : ""}${b.prep && b.prep.on ? ` <span class="su-preptag">gets ready ${b.prep.leadDays === 0 ? "same day" : b.prep.leadDays + "d before"}</span>` : ""}</span>`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "link";
      edit.textContent = "edit";
      edit.addEventListener("click", () => {
        editingBlockId = b.id;
        renderSetup();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "link";
      del.textContent = "remove";
      del.addEventListener("click", () => {
        const kept = S().normalise(schedule).filter((x) => x.id !== b.id);
        const gone = b;
        schedule = kept;
        persist();
        renderSetup();
        render();
        setSuStatus(`Removed “${gone.label}”.`);
      });
      // NOT THIS WEEK. A swap, a cover, a trip — the pattern is still right for
      // every other week, and deleting the lesson to record one Tuesday would
      // be throwing away the term to fix a day.
      const swap = document.createElement("button");
      swap.type = "button";
      swap.className = "link su-swapbtn";
      swap.textContent = swappingId === b.id ? "never mind" : "not on…";
      swap.addEventListener("click", () => {
        swappingId = swappingId === b.id ? "" : b.id;
        renderSetup();
      });
      row.append(edit, swap, del);
      el.appendChild(row);
      if (swappingId === b.id) el.appendChild(swapForm(b));
    });
  }

  // The dates one block doesn't run on, and adding another.
  function swapForm(b) {
    const box = document.createElement("div");
    box.className = "su-form su-swapform";
    box.innerHTML = `
      <p class="muted">Days this one isn't happening — you swapped it with someone,
        someone covered it, the class was out. Everything else about it stays as it is.</p>
      <div class="su-row">
        <label>not on <input type="date" class="sw-date" /></label>
        <button type="button" class="btn sw-add">Mark it off</button>
      </div>
      <p class="muted">A SWAP IS TWO HALVES. If you took it somewhere else rather than
        losing it, say where and both halves go in at once — otherwise the day you
        gave it away is right and the day you teach it is empty.</p>
      <div class="su-row">
        <label>instead it's on <input type="date" class="sw-to" /></label>
        <label>from <input type="time" class="sw-start" value="${escapeHtml(b.start)}" /></label>
        <label>to <input type="time" class="sw-end" value="${escapeHtml(b.end)}" /></label>
      </div>
      <div class="sw-list"></div>`;
    const list = box.querySelector(".sw-list");
    if (!b.skip.length) list.innerHTML = `<p class="empty">It runs every time so far.</p>`;
    else
      b.skip.forEach((d) => {
        const row = document.createElement("div");
        row.className = "su-brow";
        const s = document.createElement("span");
        s.className = "su-blabel";
        s.textContent = d;
        row.appendChild(s);
        const put = document.createElement("button");
        put.type = "button";
        put.className = "link";
        put.textContent = "put it back";
        put.addEventListener("click", () => setSkip(b.id, b.skip.filter((x) => x !== d)));
        row.appendChild(put);
        list.appendChild(row);
      });
    box.querySelector(".sw-add").addEventListener("click", () => {
      const d = box.querySelector(".sw-date").value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const to = box.querySelector(".sw-to").value;
      const moved = /^\d{4}-\d{2}-\d{2}$/.test(to)
        ? S().normaliseBlock({
            // EVERYTHING THE ORIGINAL WAS, then the three things a swap
            // changes. This used to name the fields to carry across — label,
            // about, prep, swappable — and quietly dropped the rest, so the
            // lesson you teach on the new day came back as scenery: not
            // somewhere you have to be, no journey time, none of the day
            // markers. It read "ON" in the week where every other lesson read
            // "BE THERE". A list of fields to copy is a list that goes out of
            // date the next time a block learns something new.
            ...b,
            // A new block, not the same one twice. normaliseBlock gives it an id.
            id: "",
            // A one-off on a date, not a pattern — and the original's swaps are
            // not this one's.
            days: [],
            skip: [],
            start: box.querySelector(".sw-start").value || b.start,
            end: box.querySelector(".sw-end").value || b.end,
            date: to,
            source: "hand",
          })
        : null;
      setSkip(b.id, b.skip.concat([d]), moved);
    });
    return box;
  }

  function setSkip(id, dates, alsoAdd) {
    schedule = S().normalise(schedule).map((x) => (x.id === id ? { ...x, skip: dates } : x));
    if (alsoAdd) schedule = schedule.concat([alsoAdd]);
    persist();
    // The form stays open. Taking a date back off is a correction, and closing
    // the thing you are correcting is how you lose your place in it.
    renderSetup();
    render();
    if (alsoAdd) setSuStatus(`Swapped — it's off on ${dates[dates.length - 1]} and on ${alsoAdd.date} instead.`);
  }

  async function init() {
    const data = await OrganiserStore.load();
    items = data.items || [];
    waiting = data.waiting || [];
    goals = data.goals || [];
    schedule = data.schedule || [];
    cfg = data.scheduleConfig || null;
    worked = data.worked || {};
    areaList = data.areas || [];
    rotas = data.rotas || [];
    contacts = data.contacts || [];
    syncPrep();
    const calBox = $("#calPaste");
    const calYear = $("#calYear");
    const reRead = () => calRead(calBox ? calBox.value : "", calYear ? Number(calYear.value) : 0);
    if (calBox) calBox.addEventListener("input", reRead);
    // Changing the year re-reads what's already there rather than making you
    // paste it again.
    if (calYear) calYear.addEventListener("input", reRead);
    const calAdd = $("#calAdd");
    if (calAdd) calAdd.addEventListener("click", calApply);
    const calFile = $("#calFile");
    if (calFile)
      calFile.addEventListener("change", async () => {
        const f = calFile.files && calFile.files[0];
        const P = window.OrganiserPdfText;
        const words = $("#calWords");
        if (!f || !P) return;
        if (words) words.textContent = "Reading…";
        try {
          const r = await P.read(await f.arrayBuffer());
          if (!r.ok || !r.text.trim()) {
            if (words) words.textContent = (r.notes.join(" ") || "Nothing readable in that file.") +
              " Opening it and copying the text across will work.";
            return;
          }
          if (calBox) calBox.value = r.text;
          // A new document brings its own year, so the old one is let go of.
          if (calYear) calYear.value = "";
          calRead(r.text);
          if (words) words.textContent = r.caution + " " + words.textContent;
        } catch (e) {
          if (words) words.textContent = "That file couldn't be opened. Copy the text across instead.";
        }
      });

    const offAdd = $("#offAdd");
    if (offAdd)
      offAdd.addEventListener("click", () =>
        addTimeOff($("#offFrom").value, $("#offTo").value, $("#offLabel").value));
    const offToday = $("#offToday");
    if (offToday) offToday.addEventListener("click", () => addTimeOff(todayISO(), todayISO(), $("#offLabel").value));
    renderTimeOff();

    $("#setupToggle").addEventListener("click", () => {
      setupOpen = !setupOpen;
      renderSetup();
    });
    OrganiserStore.onExternalChange((state) => {
      items = state.items || items;
      schedule = state.schedule || schedule;
      cfg = state.scheduleConfig || cfg;
      worked = state.worked || worked;
      areaList = state.areas || areaList;
      render();
    });
    render();
    openFromLink();
  }

  init();
})();
