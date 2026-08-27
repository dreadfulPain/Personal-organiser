// Universal capture — the core pillar at the app level: dump a messy thought on
// ANY page and it's sorted to the right place (a task, a student record, or a
// goal). You never navigate to the right tab first; the app sorts, you don't.
//
// Two uses:
//   OrganiserCapture.mountBar()  — the standalone bar + check-back the view-only
//                                  pages (Day/Week/Month/Class/Looking-back) use.
//   OrganiserCapture.route()/applyEntries()/… — shared helpers the home box reuses.
//
// Plain script (works under file://). Files via the owned store; view pages
// reload after adding so their lists reflect the new item wherever it landed.

(function () {
  "use strict";

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
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
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function fmtLocalDT(d) {
    return `${isoOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // A reminder time: the morning before a future date, else soon (mirrors app.js).
  function remindForDate(dateIso) {
    const t = todayISO();
    if (dateIso && dateIso > t) {
      const before = addDaysISO(dateIso, -1);
      if (before > t) return `${before}T09:00`;
      if (before === t && new Date() < new Date(`${t}T09:00`)) return `${t}T09:00`;
      return `${dateIso}T09:00`;
    }
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    soon.setMinutes(soon.getMinutes() - (soon.getMinutes() % 15), 0, 0);
    return fmtLocalDT(soon);
  }

  async function route(text, vocab) {
    const r = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        today: todayISO(),
        now: new Date().toLocaleString(undefined, {
          weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
        }),
        goals: (vocab && vocab.goals ? vocab.goals : []).map((g) => ({ id: g.id, title: g.title })),
        config: (vocab && vocab.config) || {},
        standards: (vocab && vocab.standards ? vocab.standards : []).map((s) => ({ id: s.id, code: s.code })),
      }),
    });
    if (!r.ok) {
      // Carry the server's own explanation up. It knows WHY — "Ollama isn't
      // answering at …" is worth a hundred "something went wrong"s.
      const d = await r.json().catch(() => ({}));
      const err = new Error(d.message || "The sorter didn't answer (" + r.status + ").");
      err.code = d.error || "http_" + r.status;
      throw err;
    }
    const d = await r.json();
    return Array.isArray(d.entries) ? d.entries : [];
  }

  // THE PIPELINE PATH — for pastes long enough that one big call starts
  // silently dropping items. Kicks off, then polls: the work runs behind an
  // immediate answer, so nothing waits at the door.
  //
  // Slower by design, so it SAYS what it's doing. Silence during a slow
  // operation reads as broken, and a spinner with no words is silence.
  const STEP_WORDS = {
    split: "Breaking it into pieces…",
    mine: "Working out which bits are for you…",
    detail: "Reading each one properly…",
    coverage: "Checking nothing was missed…",
  };
  async function routeViaPipeline(text, vocab, onStep) {
    const r = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        today: todayISO(),
        config: (vocab && vocab.config) || {},
        me: (vocab && vocab.me) || "",
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const err = new Error(d.message || "The sorter didn't answer (" + r.status + ").");
      err.code = d.error || "http_" + r.status;
      throw err;
    }
    const { id } = await r.json();
    if (!id) throw new Error("pipeline no id");

    for (let tick = 0; tick < 600; tick++) {
      await new Promise((ok) => setTimeout(ok, 500));
      const s = await fetch("/api/pipeline?id=" + encodeURIComponent(id));
      if (!s.ok) throw new Error("pipeline status " + s.status);
      const d = await s.json();
      if (!d.done) {
        const word = STEP_WORDS[d.step] || "Working…";
        onStep(d.total > 1 ? `${word} (${Math.min(d.doneCount, d.total)} of ${d.total})` : word);
        continue;
      }
      return d;
    }
    throw new Error("pipeline timeout");
  }

  // Follow-up task spawned from a record — rides the normal reminders (s28).
  function spawnFollowUp(rec, followDate, items) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(followDate || "") ? followDate : addDaysISO(todayISO(), 1);
    const t = {
      id: uid(),
      title: `Follow up: ${rec.summary}${rec.who ? ` (${rec.who})` : ""}`,
      type: "task", date, time: "", deadlineType: "soft", importance: "normal", effort: "quick",
      tags: (rec.tags || []).slice(0, 4), whenText: "", goalId: "", openLoop: false, promisedTo: "",
      remindAt: remindForDate(date), remindedAt: null, done: false, createdAt: nowISO(), completedAt: null,
    };
    items.push(t);
    rec.taskId = t.id;
    return t;
  }

  // TOLD TODAY MEANS TODAY.
  //
  // Something with no date used to get none at all, which sounds neutral and
  // isn't: undated work is never booked into a day, so it drifted. You said it
  // out loud today because it is on your mind today, and the plain reading of
  // that is "now", not "at no point in particular".
  //
  // SOFT, always. A date you didn't give is a wish about when, never a promise
  // — nothing here can turn into a missed deadline, because you never set one.
  // And if you said it could wait ("sometime", "whenever"), it keeps no date at
  // all, because that is you saying otherwise.
  function dateFor(item) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) return item.date;
    if (item.someday) return "";
    return todayISO();
  }

  // DID YOU SAY WHEN, OR DID THE APP?
  //
  // Something typed with no date on it gets today's, so it turns up in front of
  // you rather than vanishing into a pile nobody looks at. That is right, and it
  // is not a deadline — but nothing recorded the difference, so everything
  // downstream treated the two the same.
  //
  // What that looked like: twenty-four things typed on one morning, none of them
  // with a date in the sentence, all stamped today, and the app then worked out
  // that twenty-four things were due today with no room for them — so all of it
  // came back marked "little room left before it's due". Twenty-four deadlines
  // it had invented and was now warning you about.
  //
  // One field, set once, here at the front door.
  function datedBy(item) {
    return /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") ? "you" : "app";
  }

  // One reading of a clock time, shared by everything here. The same rule the
  // schedule spine uses — one or two digits for the hour, and anything that
  // isn't a time becomes nothing rather than midnight. Written out here rather
  // than borrowed, because this file runs on pages that have no schedule at
  // all and must never come to need one.
  function tidyTime(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").toString().trim());
    if (!m) return "";
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h > 23 || mm > 59) return "";
    return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }

  function finishItem(item) {
    const remindAt = item.openLoop || (item.deadlineType === "hard" && item.date) ? remindForDate(item.date) : "";
    return {
      id: uid(),
      title: item.title,
      type: item.type || "task",
      date: dateFor(item),
      datedBy: datedBy(item),
      // TIDIED ON THE WAY IN, not trusted. This is the front door on every
      // page, and it used to keep whatever it was handed — so a time written
      // "9:05" was stored unpadded, the planner read it as 09:05 and pinned the
      // job there, and the row in your list showed no time at all. Two answers
      // to the same question, and the one you could see was the wrong one.
      time: tidyTime(item.time),
      deadlineType: item.deadlineType === "hard" ? "hard" : "soft",
      importance: item.importance || "normal",
      effort: item.effort || "medium",
      tags: item.tags || [],
      whenText: item.whenText || "",
      goalId: item.goalId || "",
      standardId: item.standardId || "",
      openLoop: item.openLoop === true,
      // WHICH PARTS OF YOUR LIFE THIS BELONGS TO — a list, because a training
      // session at school is work AND professional at once, and forcing a
      // choice makes the answer wrong whichever way you pick. Yours to name;
      // see areas.js, which has no idea what any of them mean.
      areas: window.OrganiserAreas ? OrganiserAreas.on(item) : [],
      // HOW BIG, and HOW MUCH OF IT IS DONE. Without these the planner sees a
      // guess where you gave it a number, and forgets every minute you ever put
      // in — which is how an eight-hour job got planned as an hour and a job
      // bigger than a day could never finish.
      plannedMinutes: Math.max(0, Math.round(Number(item.plannedMinutes) || 0)),
      spentMinutes: Math.max(0, Math.round(Number(item.spentMinutes) || 0)),
      // Where it came from, and whether you can still walk away from it. Two
      // separate facts — see priority.js.
      optional: item.optional === true,
      committed: item.committed === true,
      // Earliest this could possibly be done — NOT the same as when it's due.
      // Both readers produce it; it has to survive the trip into storage.
      notBefore: /^\d{4}-\d{2}-\d{2}$/.test(item.notBefore || "") ? item.notBefore : "",
      promisedTo: item.promisedTo || "",
      // THE BALL IS IN SOMEONE ELSE'S COURT. Different from promisedTo, which
      // means you owe them — here you've done your part and are waiting. It
      // can't be finished by you doing something, so it needs a rhythm rather
      // than a deadline.
      waitingOn: item.waitingOn || "",
      waitingSince: item.waitingOn ? todayISO() : "",
      contactId: item.contactId || "",
      remindAt,
      remindedAt: null,
      // What the model read it off, when it wasn't English. A translation is the
      // one step with no possible check — you can't verify a translation of
      // something you couldn't read — so the source is kept forever and a wrong
      // one stays recoverable by anyone who reads the language.
      sourceText: item.sourceText || "",
      sourceEnglish: item.sourceEnglish || "", // what that source says, plainly
      // Fields that couldn't be traced back to your text. Not wrong, just
      // untraceable — and the chip says so more loudly.
      ungrounded: Array.isArray(item.ungrounded) ? item.ungrounded : [],
      done: false,
      createdAt: nowISO(),
      completedAt: null,
    };
  }

  // Push each entry into the right array of `state`, spawning follow-ups. Records
  // are born "AI-sorted · check me" (provenance stays true). Returns counts.
  function applyEntries(entries, state) {
    state.items = state.items || [];
    state.goals = state.goals || [];
    state.records = state.records || [];
    state.contacts = state.contacts || [];
    const n = { tasks: 0, records: 0, goals: 0, handovers: 0, people: 0 };
    entries.forEach((e) => {
      if (e.kind === "task" && e.item) {
        state.items.push(finishItem({ ...e.item, sourceText: e.sourceText || "", sourceEnglish: e.sourceEnglish || "", ungrounded: e.ungrounded || [] }));
        n.tasks++;
      } else if (e.kind === "record" && e.record) {
        const rec = {
          id: uid(),
          who: e.record.who || "",
          date: todayISO(),
          type: e.record.type || "",
          summary: e.record.summary || "",
          detail: "",
          extra: {},
          topic: e.record.topic || "",
          level: e.record.level || "",
          tags: (e.record.tags || []).slice(0, 4),
          followUp: e.record.follow_up === true,
          taskId: "",
          files: [],
          sourceText: e.sourceText || "", // the original, when it wasn't English
          sourceEnglish: e.sourceEnglish || "", // and what it says, plainly
          ungrounded: Array.isArray(e.ungrounded) ? e.ungrounded : [],
          src: "ai",
          checkedAt: null,
          createdAt: nowISO(),
        };
        state.records.unshift(rec);
        if (rec.followUp) spawnFollowUp(rec, e.record.follow_up_date, state.items);
        n.records++;
      } else if (e.kind === "goal" && e.goal) {
        state.goals.unshift({ id: uid(), title: e.goal.title, createdAt: nowISO(), milestones: [] });
        n.goals++;
      } else if (e.kind === "handover" && e.handover) {
        // Log it against that person — creating them if they're new, so a
        // handover never needs a detour to the People page first.
        const want = (e.handover.person || "").trim().toLowerCase();
        let person = state.contacts.find((c) => (c.name || "").trim().toLowerCase() === want);
        if (!person) {
          person = { id: uid(), name: e.handover.person, group: "", details: {}, workLog: [], createdAt: nowISO() };
          state.contacts.unshift(person);
        }
        if (!person.workLog) person.workLog = [];
        person.workLog.unshift({
          id: uid(),
          dir: e.handover.dir === "out" ? "out" : "in",
          note: e.handover.note || "",
          date: todayISO(),
        });
        n.handovers++;
      } else if (e.kind === "person" && e.person) {
        // SOMEBODY ALREADY ON THE LIST IS NOT SOMEBODY NEW — asked of names.js,
        // which is where "does this name mean this person" lives, so a second
        // paste to fix one typo doesn't give you everybody twice.
        const N = window.OrganiserNames;
        const hit = N && N.look ? N.look(e.person.name, state.contacts) : { state: "none" };
        if (hit.state === "matched") return;
        state.contacts.unshift({
          id: uid(),
          name: e.person.name,
          group: "",
          ...(e.person.aka && e.person.aka.length ? { aka: e.person.aka.slice(0, 8) } : {}),
          ...(e.person.tag ? { tag: e.person.tag } : {}),
          details: { ...(e.person.details || {}) },
          createdAt: nowISO(),
        });
        n.people++;
      }
    });
    return n;
  }

  // ---- A DOCUMENT AT THE FRONT DOOR ------------------------------------------
  //
  // The box says "type it however it comes out" and takes only typing. Every
  // reader this app has — the timetable, the calendar, the term grid, the
  // contacts table — sits behind a file input on some other page, one of them
  // three levels down inside a section you have to know to open. So somebody
  // with a school PDF in their hand finds no way to give it to the app at all,
  // and reasonably concludes it can't read one.
  //
  // It can read one. It just never offered.
  const READS = ".pdf,.txt,.csv,.md,text/plain,text/csv,application/pdf";

  async function textOf(file) {
    if (!file) return { text: "", note: "" };
    const name = String(file.name || "");
    if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
      const P = window.OrganiserPdfText;
      if (!P) return { text: "", note: "This page can't open a PDF." };
      const r = await P.read(await file.arrayBuffer());
      if (!r.ok || !r.text.trim())
        return { text: "", note: (r.notes || []).join(" ") || "Nothing readable came out of that file." };
      return { text: r.text, note: r.caution || "", pages: (r.pages || []).length };
    }
    // A WORD OR EXCEL FILE IS A ZIP, and unpacking one is a job of its own —
    // said plainly rather than failing at it, because "nothing happened" is the
    // worst possible answer to a file somebody chose on purpose.
    if (/\.(docx?|xlsx?|pptx?|pages|numbers|key)$/i.test(name))
      return { text: "", note: `I can't open ${name.split(".").pop().toLowerCase()} files yet. Opening it and copying the text across works.` };
    if (/\.(png|jpe?g|gif|heic|webp|bmp|tiff?)$/i.test(name))
      return { text: "", note: "That's a picture, and reading words off a picture needs something this app hasn't got. A PDF or the text itself will work." };
    return { text: await file.text(), note: "" };
  }

  // WHAT IS IN IT — asked of every reader, and answered with all of them.
  //
  // One school document is usually several things at once: the booklet that
  // holds a week of sessions also holds a month drawn as a grid and a page of
  // contacts. Picking one and silently doing it would be wrong three ways, so
  // this counts what each reader can see and the caller offers the choice.
  function whatIsIt(text) {
    const out = { people: 0, blocks: 0, dates: 0, marks: 0 };
    const R = window.OrganiserRoster;
    const T = window.OrganiserTimetable;
    const C = window.OrganiserCalPlan;
    if (R) out.people = peopleIn(text).entries.length;
    if (T) {
      try {
        const got = T.read(text);
        out.blocks = got && got.blocks ? got.blocks.length : 0;
      } catch { /* a reader that can't read it has found nothing, which is the answer */ }
    }
    if (C) {
      try {
        const got = C.read(text);
        out.dates = got.rows.length;
        out.marks = got.term && got.term.marks ? got.term.marks.length : 0;
      } catch { /* same */ }
    }
    return out;
  }

  // ---- IS THIS A LIST OF PEOPLE? ---------------------------------------------
  //
  // Asked BEFORE the sorter, and answered without it. A list of colleagues has
  // no task in it, no record, no goal and no handover — which are the only four
  // things the sorter can return — so it came back with nothing and the front
  // door said "I couldn't find anything to add there — try a few more words?"
  // to somebody who had just pasted five people with their email addresses.
  //
  // Wrong, and unkind about it: there was plenty there, and more words would
  // not have helped.
  //
  // NO MODEL NEEDED. A list of people is a shape, not a sentence, and the
  // readers for it are already written and exact. That also means this works
  // with the sorting turned off, which is the state the app has to be usable in.
  function peopleIn(text) {
    const R = window.OrganiserRoster;
    const none = { entries: [], rest: String(text || "") };
    if (!R) return none;
    const made = (list, rest) => ({
      entries: list.map((p) => ({ kind: "person", person: p })),
      rest: rest === undefined ? "" : rest,
    });
    // A table with a heading row, then a slide, then a flat list — most exact
    // first, because each is a narrower claim than the one after it.
    if (R.looksLikeContacts && R.looksLikeContacts(text)) return made(R.contactsIn(text));
    if (R.looksLikeCards && R.looksLikeCards(text))
      return made(R.cardsIn(text).map((c) => ({
        name: c.name, aka: c.aka, tag: c.roles[0] || "",
        details: c.roles.length > 1 ? { notes: c.roles.join("\n") } : {},
      })));
    if (R.looksLikeLoose && R.looksLikeLoose(text)) {
      const got = R.looseIn(text);
      return made(got.people, got.rest);
    }
    return none;
  }

  function summaryText(n) {
    const parts = [];
    if (n.tasks) parts.push(`${n.tasks} to your tasks`);
    if (n.records) parts.push(`${n.records} to Students`);
    if (n.goals) parts.push(`${n.goals} to Goals`);
    if (n.people) parts.push(`${n.people} to People`);
    if (n.handovers) parts.push(`${n.handovers} logged to People`);
    return parts.join(" · ");
  }

  // ---------- the standalone bar (view-only pages) ----------
  let barState = null; // the loaded owned state {items, waiting, goals, records, recordConfig}
  let pending = null;
  let lastRun = null; // the pipeline's own report — coverage + what it parked

  async function saveAndReload(msg) {
    try {
      sessionStorage.setItem("capture.flash", msg);
    } catch {}
    // Go through the store so the write carries the shared-folder version guard;
    // flush() forces it out and waits, so the reload can't outrun the save.
    OrganiserStore.save({ items: barState.items, waiting: barState.waiting, goals: barState.goals, records: barState.records, contacts: barState.contacts });
    try {
      await OrganiserStore.flush();
    } catch {}
    location.reload();
  }

  function renderPending() {
    const box = document.getElementById("capBack");
    if (!pending || !pending.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    const dest = { task: "→ Tasks", record: "→ Students", goal: "→ Goals", handover: "→ People" };
    // THE COVERAGE LINE. A long paste's one genuinely useful sentence: either
    // "nothing was left behind", said quietly, or the bit that wasn't picked up
    // — quoted from what you pasted, never turned into an item on its own.
    let cover = "";
    if (lastRun && lastRun.coverage) {
      const c = lastRun.coverage;
      if (!c.checked) cover = `<p class="cap-cover unsure">Couldn't double-check this one for missed bits — worth a skim.</p>`;
      else if (!c.missed.length) cover = `<p class="cap-cover clean">Checked the whole thing — nothing else in there needed you. ✓</p>`;
      else
        cover =
          `<p class="cap-cover flagged">Not picked up${c.missed.length > 1 ? ` (${c.missed.length})` : ""} — worth a look:</p>` +
          `<ul class="cap-missed">` +
          c.missed.map((m) => `<li>“${escapeHtml(m.quote)}”${m.why ? ` <span class="cap-why">${escapeHtml(m.why)}</span>` : ""}</li>`).join("") +
          `</ul>`;
    }
    box.innerHTML =
      cover +
      `<p class="cap-hint">Here's where each will go — tweak or drop any, then add.</p>` +
      pending
        .map((e, i) => {
          const flags =
            (e.ungrounded && e.ungrounded.length
              ? `<span class="cap-ungrounded" title="This wasn't in what you wrote, as far as I can tell — worth a look">couldn't find the ${escapeHtml(e.ungrounded.join(" or "))} in your words</span>`
              : "") +
            (e.sourceText ? `<span class="cap-source" title="What it was translated from">${escapeHtml(e.sourceText.slice(0, 60))}</span>` : "");
          let mid = "";
          if (e.kind === "task") mid = escapeHtml(e.item.title) + (e.item.date ? ` <span class="cap-when">${escapeHtml(OrganiserDates.dayWords(e.item.date))}</span>` : "");
          else if (e.kind === "record")
            mid = `<span class="cap-who">${escapeHtml(e.record.who || "— who? —")}</span> ${escapeHtml(e.record.summary)}` +
              (e.record.topic ? ` <span class="cap-when">${escapeHtml(e.record.topic)}${e.record.level ? " " + escapeHtml(e.record.level) : ""}</span>` : "");
          else if (e.kind === "handover")
            mid = `<span class="cap-who">${escapeHtml(e.handover.person)}</span> ${e.handover.dir === "out" ? "← you passed on" : "→ passed to you"}${e.handover.note ? ` <span class="cap-when">${escapeHtml(e.handover.note)}</span>` : ""}`;
          else mid = escapeHtml(e.goal.title);
          return `<div class="cap-row"><span class="cap-dest">${dest[e.kind]}</span><span class="cap-mid">${mid}${flags ? `<span class="cap-flags">${flags}</span>` : ""}</span><button class="link cap-drop" data-i="${i}" type="button">drop</button></div>`;
        })
        .join("") +
      `<div class="cap-actions"><button id="capAdd" class="btn" type="button">Add all</button><button id="capCancel" class="btn ghost" type="button">Cancel</button></div>`;
    box.querySelectorAll(".cap-drop").forEach((b) =>
      b.addEventListener("click", () => {
        pending.splice(Number(b.dataset.i), 1);
        renderPending();
      })
    );
    document.getElementById("capAdd").addEventListener("click", async () => {
      if (!pending || !pending.length) return;
      const n = applyEntries(pending, barState);
      pending = null;
      await saveAndReload(n.tasks + n.records + n.goals ? "Added — " + summaryText(n) + ". ✓" : "");
    });
    document.getElementById("capCancel").addEventListener("click", () => {
      pending = null;
      setCapStatus("");
      renderPending();
    });
  }

  function setCapStatus(msg) {
    const s = document.getElementById("capStatus");
    if (!s) return;
    s.textContent = msg || "";
    s.hidden = !msg;
  }

  // A DOCUMENT OPENED FROM THE BAR. Same three answers as the home page: the
  // people can be done here and now; the timetable and the calendar are checked
  // before they are kept, so they are carried to the page that does the
  // checking; and anything else goes into the box for you to look at.
  async function openHere(file) {
    const found = document.getElementById("capFound");
    const input = document.getElementById("capInput");
    if (found) { found.hidden = false; found.textContent = "Reading it…"; }
    let got;
    try {
      got = await textOf(file);
    } catch {
      got = { text: "", note: "That file couldn't be opened." };
    }
    if (!got.text.trim()) {
      if (found) found.innerHTML = `<p class="muted">${escapeHtml(got.note || "Nothing readable came out of that file.")}</p>`;
      return;
    }
    const what = whatIsIt(got.text);
    const bits = [];
    if (what.people) bits.push(`${what.people} ${what.people === 1 ? "person" : "people"}`);
    if (what.blocks >= ENOUGH_OF_IT) bits.push(`${what.blocks} things for your week`);
    if (what.dates >= ENOUGH_OF_IT) bits.push(`${what.dates} dates`);
    if (what.marks) bits.push(`${what.marks} marked on the calendar`);
    const btn = (act, words) => `<button type="button" class="p-opt doc-go" data-act="${act}">${words}</button>`;
    if (!found) return;
    found.innerHTML =
      `<p><strong>${escapeHtml(file.name || "that file")}</strong>` +
      (got.pages ? ` <span class="muted">— ${got.pages} page${got.pages === 1 ? "" : "s"}</span>` : "") + `</p>` +
      `<p class="muted">${bits.length ? "What I can see in it: " + escapeHtml(bits.join(" · ")) + "." : "I couldn't see anything I know how to read in it."}</p>` +
      (what.people ? btn("people", `put the ${what.people} ${what.people === 1 ? "person" : "people"} in`) : "") +
      (what.blocks >= ENOUGH_OF_IT ? btn("week", "take it to your week →") : "") +
      (what.dates >= ENOUGH_OF_IT || what.marks ? btn("calendar", "take it to your calendar →") : "") +
      btn("words", "just put the words in the box") +
      (got.note ? `<p class="muted">${escapeHtml(got.note)}</p>` : "");
    found.querySelectorAll(".doc-go").forEach((b) =>
      b.addEventListener("click", async () => {
        const act = b.getAttribute("data-act");
        if (act === "words") {
          if (input) { input.value = got.text; input.focus(); }
          found.hidden = true;
          return;
        }
        if (act === "people") {
          const list = peopleIn(got.text);
          const state = {
            items: barState.items || [], goals: barState.goals || [],
            records: barState.records || [], contacts: barState.contacts || [],
          };
          const n = applyEntries(list.entries, state);
          barState.contacts = state.contacts;
          await saveAndReload(`${n.people} added to People → — their names were read off the end of each line, worth a look.`);
          return;
        }
        try {
          sessionStorage.setItem("organiser.handover", JSON.stringify({ to: act, text: got.text }));
        } catch { /* no session storage: the page still opens, just empty-handed */ }
        location.href = "timeline.html";
      }));
  }

  // Two stray blocks found in a page of prose is not a timetable, and offering
  // it next to "18 things for your week" would make the offer useless.
  const ENOUGH_OF_IT = 3;

  async function onSubmit() {
    const input = document.getElementById("capInput");
    let text = input.value.trim();
    if (!text) return;
    const btn = document.getElementById("capBtn");

    // A LIST OF PEOPLE IS NOT A SENTENCE — the same door, on every other page.
    // The bar had its own copy of "I couldn't find anything to add there", so
    // fixing only the home box would have left the Day, the Week, the Month and
    // three more pages saying it to somebody pasting a list of colleagues.
    let peopleWords = "";
    const found = peopleIn(text);
    if (found.entries.length) {
      const state = {
        items: barState.items || [],
        goals: barState.goals || [],
        records: barState.records || [],
        contacts: barState.contacts || [],
      };
      const n = applyEntries(found.entries, state);
      barState.contacts = state.contacts;
      const same = found.entries.length - n.people;
      peopleWords =
        (n.people ? `${n.people} added to People → — their names were read off the end of each line, worth a look.` : "") +
        (same ? ` ${same} ${same === 1 ? "was" : "were"} already there.` : "");
      text = (found.rest || "").trim();
      input.value = text;
      // Nothing else in it: save and say so. Anything else carries on to the
      // usual path, which will add its own news to this.
      if (!text) {
        await saveAndReload(peopleWords.trim());
        return;
      }
    }
    if (!barState.aiAvailable) {
      // No AI: capture is sacred, and patterns still read the everyday parts —
      // the date, the time, anyone already in People. Offline and instant.
      barState.items = barState.items || [];
      const QP = window.OrganiserQuickParse;
      const guesses = QP
        ? QP.parseAll(text, {
            contacts: barState.contacts || [],
            fixedWords: window.OrganiserSchedule
              ? OrganiserSchedule.normaliseConfig(barState.scheduleConfig).fixedWords
              : null,
          })
        : [{ title: text, type: "task" }];
      // ONE THING GOES STRAIGHT IN. Capture is meant to be a single tap, and
      // making you confirm "call the dentist" would take that away.
      //
      // MORE THAN ONE STOPS TO BE LOOKED AT. Cutting your sentence in half is
      // the one thing here you would want to see, because when it is wrong it
      // is wrong in a way you would never notice afterwards — two half-jobs
      // that each read perfectly well on their own.
      if (guesses.length > 1) {
        pending = guesses.map((g) => ({ kind: "task", item: g, sourceText: g.sourceText || text }));
        input.value = "";
        input.style.height = "auto";
        setCapStatus(`Read that as ${guesses.length} jobs — drop any that shouldn't be there.`);
        renderPending();
        return;
      }
      const guess = guesses[0];
      barState.items.push(finishItem(guess));
      input.value = "";
      const read = QP && QP.foundAnything(guess);
      await saveAndReload(
        (peopleWords ? peopleWords + " " : "") +
        (read ? "Saved, with the date and details I could read. ✓" : "Saved it as a task. ✓") +
          (barState.engineNote ? " " + barState.engineNote : "")
      );
      return;
    }
    btn.disabled = true;
    btn.textContent = "Sorting…";
    setCapStatus("Reading what you wrote…");
    try {
      const stds = barState.portfolio && Array.isArray(barState.portfolio.points)
        ? barState.portfolio.points.map((p) => ({ id: p.id, code: p.code }))
        : [];
      const vocab = { goals: barState.goals, config: barState.recordConfig || {}, standards: stds };
      // Short pastes keep the proven one-shot call. Long ones — where a single
      // call starts quietly losing items — go through the pipeline. The
      // threshold is a setting, not a belief: /compare.html is how it's set.
      const long = barState.pipelineMinChars > 0 && text.length >= barState.pipelineMinChars;
      let entries = [];
      if (long) {
        const out = await routeViaPipeline(text, vocab, setCapStatus);
        entries = out.entries || [];
        lastRun = out;
        // Anything the pipeline couldn't read goes to the sort-later pile as
        // plain text — the one fallback, same as everywhere else. Saved RIGHT
        // NOW rather than when the check-back is confirmed: cancelling the
        // check-back must never throw away the bits that couldn't be read.
        if ((out.parked || []).length) {
          barState.waiting = barState.waiting || [];
          out.parked.forEach((p) => barState.waiting.push({ id: uid(), text: p.text, at: nowISO(), why: p.why || "" }));
          OrganiserStore.save({ waiting: barState.waiting });
        }
      } else {
        entries = await route(text, vocab);
        lastRun = null;
      }
      if (!entries.length && !(lastRun && lastRun.parked && lastRun.parked.length)) {
        // The people, if there were any, already went in.
        // The people, if there were any, already went in — so the news about
        // them must not be replaced by "I couldn't find anything".
        if (peopleWords) await saveAndReload(peopleWords + " Nothing else in there looked like a job.");
        else setCapStatus("I couldn't find anything to add there — a few more words?");
        return;
      }
      pending = entries;
      input.value = "";
      input.style.height = "auto";
      setCapStatus("");
      renderPending();
    } catch (err) {
      // Unreachable AI: still don't lose it, and say what's actually wrong.
      barState.items = barState.items || [];
      barState.items.push(finishItem({ title: text, type: "task" }));
      input.value = "";
      const why = err && err.code ? err.message : "Couldn't reach the sorter.";
      await saveAndReload(why + " Saved it as a task instead. ✓");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sort it";
    }
  }

  async function mountBar() {
    const host = document.getElementById("capture");
    if (!host) return;
    host.className = "capture";
    host.innerHTML = `
      <div class="cap-bar">
        <textarea id="capInput" rows="1" placeholder="Add anything — or paste a whole conversation; I'll send it to the right place" aria-label="Add anything"></textarea>
        <button id="capBtn" class="btn" type="button">Add</button>
      </div>
      <!-- AND A DOCUMENT, on every page the bar is on. "Open a file" working on
           the home page and nowhere else would be the same inconsistency the
           list of people had. -->
      <p class="cap-open"><label class="dump-file" for="capFile">…or open a file</label>
        <input id="capFile" type="file" accept="${READS}" hidden /></p>
      <p id="capStatus" class="status" hidden></p>
      <div id="capFound" class="dump-found" hidden></div>
      <div id="capBack" class="cap-back" hidden></div>`;

    const data = await OrganiserStore.load();
    barState = {
      items: data.items || [],
      waiting: data.waiting || [],
      goals: data.goals || [],
      records: data.records || [],
      recordConfig: data.recordConfig || null,
      portfolio: data.portfolio || null,
      contacts: data.contacts || [],
      // The words that mean "this happens at a time". The same box on eleven
      // other pages has to read a sentence the same way the home page does —
      // one question, one answer, wherever you happen to be standing.
      scheduleConfig: data.scheduleConfig || null,
      aiAvailable: false,
    };
    if (OrganiserStore.mode === "file") {
      try {
        const h = await fetch("/api/health");
        const j = await h.json();
        barState.aiAvailable = !!j.hasAI;
        barState.engineNote = j.configured && !j.hasAI ? j.engineNote || "" : "";
        barState.pipelineMinChars = Number(j.pipelineMinChars) || 0;
        if (barState.aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
      } catch {}
    }
    document.getElementById("capBtn").textContent = barState.aiAvailable ? "Sort it" : "Add";
    document.getElementById("capBtn").addEventListener("click", onSubmit);
    const capInput = document.getElementById("capInput");
    // Enter sends a one-liner; Shift+Enter (or a pasted chat) makes it multi-line
    // and the box grows to fit — so a whole conversation can be dropped in.
    capInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !capInput.value.includes("\n")) {
        e.preventDefault();
        onSubmit();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit();
      }
    });
    const grow = () => {
      capInput.style.height = "auto";
      capInput.style.height = Math.min(capInput.scrollHeight, 220) + "px";
    };
    capInput.addEventListener("input", grow);
    capInput.addEventListener("paste", () => setTimeout(grow, 0));
    const capFile = document.getElementById("capFile");
    if (capFile)
      capFile.addEventListener("change", async () => {
        const f = capFile.files && capFile.files[0];
        capFile.value = "";
        if (f) await openHere(f);
      });
    ["dragover", "drop"].forEach((n) =>
      capInput.addEventListener(n, async (e) => {
        e.preventDefault();
        if (n !== "drop") return;
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) await openHere(f);
      }));
    // Speak it instead of typing, if this machine can (mic appears only if so).
    if (window.OrganiserVoice) {
      OrganiserVoice.attach(capInput, document.querySelector(".cap-bar"), setCapStatus);
    }

    // Flash from the reload after an add.
    try {
      const flash = sessionStorage.getItem("capture.flash");
      if (flash) {
        setCapStatus(flash);
        sessionStorage.removeItem("capture.flash");
        setTimeout(() => setCapStatus(""), 4000);
      }
    } catch {}
  }

  window.OrganiserCapture = { mountBar, route, applyEntries, summaryText, finishItem, spawnFollowUp, peopleIn, textOf, whatIsIt, READS };

  // Auto-mount on any page that provides a #capture slot (view-only pages). The
  // home/records/goals pages keep their own richer boxes and just reuse the
  // helpers above, so they leave the slot out.
  if (document.getElementById("capture")) mountBar();
})();
