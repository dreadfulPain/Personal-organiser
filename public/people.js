// People — the humans around the work: how to reach them, what's worth
// remembering, and what's live between you right now.
//
// GENERIC by design (§0.2): the code knows only "people in groups, with fields".
// The groups ("colleague", "parent") and each group's detail fields are DATA,
// seeded once and fully editable — point it at anyone.
//
// NOT A CHARACTER SCOREBOARD, but it DOES count one factual thing: work passed
// between you (§5/§16 — describe, never judge). The point is calibration in both
// directions: "is this person really loading me up, or am I assuming it?" So the
// app logs events you tap in, shows them with their dates and notes, and never
// draws a conclusion about anybody. Everything else here is contact detail and
// your own words about how to work well with someone.
//
// Plain script (works under file://). Saves only { contacts, contactConfig }.

(() => {
  "use strict";

  let contacts = [];
  let config = null;
  let items = []; // to show what's promised to a person
  let records = []; // to show mentions of them
  const filters = { group: "", name: "" };
  let openId = null; // which person's card is expanded
  let range = "90"; // work-log window: "30" | "90" | "all"
  let focusNoteId = null; // a just-logged entry whose note box should take focus

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
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
  // ONE WAY OF WRITING A DATE, for the whole app — see dates.js. Six files
  // kept their own copy of this, each subtly different, and none of them said
  // which year a date was in. Fixing the shared one changed nothing on screen,
  // because almost nothing was using it.
  const friendlyDate = (iso) => OrganiserDates.dayWords(iso, { weekday: false, relative: false });
  function rangeCutoff() {
    if (range === "all") return "";
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    return isoOf(d);
  }
  const RANGE_WORDS = { 30: "the past month", 90: "the past few months", all: "all time" };

  // Seeded once; then it's your list. Note the framing of the "notes" fields:
  // how to work WITH someone, never a rating of them.
  const DEFAULT_CONFIG = {
    groups: ["colleague", "parent", "other"],
    fields: {
      colleague: ["role / year group", "where to find them", "phone / WeChat", "email", "good to ask about", "notes"],
      parent: ["child (ID)", "phone / WeChat", "email", "best way & time to reach them", "language at home", "what they can realistically support with", "notes"],
      other: ["role", "phone / WeChat", "email", "notes"],
    },
    note:
      "Keep this practical and kind: how to reach someone and how to work well with them. " +
      "Remember these notes sit in a folder that may sync — write nothing you'd not want them to read.",
  };
  function normaliseConfig(c) {
    if (!c || typeof c !== "object") return null;
    const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    const out = { groups: list(c.groups), fields: {}, note: (c.note || "").toString() };
    if (c.fields && typeof c.fields === "object") {
      Object.keys(c.fields).forEach((k) => {
        const l = list(c.fields[k]);
        if (l.length) out.fields[k] = l;
      });
    }
    if (!out.groups.length) out.groups = DEFAULT_CONFIG.groups.slice();
    if (!Object.keys(out.fields).length) out.fields = JSON.parse(JSON.stringify(DEFAULT_CONFIG.fields));
    if (!out.note) out.note = DEFAULT_CONFIG.note;
    return out;
  }
  // THE WORD THAT TELLS TWO PEOPLE APART.
  //
  // There are two people called Nick. There is HR at this school and HR at the
  // last one. A name on its own cannot separate them, and the app writing one
  // of them down and getting on with it is how a job you never agreed to ends
  // up on your list.
  //
  // Left blank it falls back to the kind or class they're in, which is enough
  // for most people — a student is "(9A)" without anybody typing anything. It
  // is here for the ones where it isn't.
  function tagLine(person) {
    const wrap = document.createElement("label");
    wrap.className = "cb-field ppl-tag";
    wrap.innerHTML =
      `<span class="cb-lbl">Which one are they? — shown in brackets after their name</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = person.tag || "";
    // The placeholder is examples, not a list to pick from: whatever tells YOU
    // which one this is, is the right answer.
    input.placeholder = person.group
      ? `blank means “${person.group}”`
      : "e.g. their school, their job, their year group";
    input.addEventListener("change", (e) => {
      const v = e.target.value.trim().slice(0, 24);
      if (v) person.tag = v;
      else delete person.tag;
      persist();
      render();
    });
    wrap.appendChild(input);
    return wrap;
  }

  // A FACE. There was no way to keep one at all.
  //
  // You meet nine people in one meeting and you will not remember which A. Example
  // was which by Thursday. A name and a job title are the two things that do
  // NOT help you recognise somebody in a corridor — the photograph is the thing
  // that does, and it was the one thing this page couldn't hold.
  //
  // The machinery was already here: records.js has put work samples through
  // /api/upload into data/files/ since the beginning. People just never asked.
  // Filed under people/<id>, so it is an ordinary file in your own folder, it
  // backs up with everything else, and you can open it without this app.
  function photoLine(person) {
    const wrap = document.createElement("div");
    wrap.className = "cb-field ppl-photo";
    const lab = document.createElement("span");
    lab.className = "cb-lbl";
    lab.textContent = "Their photo — a face is what you actually recognise";
    wrap.appendChild(lab);

    if (person.photo) {
      const img = document.createElement("img");
      img.className = "ppl-face";
      img.src = "/files/" + encodeURI(person.photo);
      img.alt = `Photo of ${person.name || "this person"}`;
      wrap.appendChild(img);
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "link";
      drop.textContent = "remove the photo";
      drop.addEventListener("click", () => {
        delete person.photo;
        persist();
        render();
      });
      wrap.appendChild(drop);
      return wrap;
    }

    // NO SERVER, NO UPLOAD. Opened by double-clicking the file there is nowhere
    // to put one, and saying so is better than a button that does nothing.
    if (OrganiserStore.mode !== "file") {
      const no = document.createElement("p");
      no.className = "muted";
      no.textContent = "Photos need the app running from its own window — there's nowhere to put a file otherwise.";
      wrap.appendChild(no);
      return wrap;
    }

    const pick = document.createElement("input");
    pick.type = "file";
    pick.accept = "image/*";
    pick.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const r = await fetch(
          "/api/upload?name=" + encodeURIComponent(file.name) +
            "&folder=" + encodeURIComponent("people/" + person.id),
          { method: "POST", body: file }
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setStatus(j.message || "Couldn't save that photo.");
          return;
        }
        const d = await r.json();
        person.photo = d.id;
        persist();
        render();
        setStatus(`Photo kept for ${OrganiserNames.saidAs(contacts, person.id)}. ✓`);
      } catch {
        setStatus("Couldn't save that photo — is the app window still open?");
      }
    });
    wrap.appendChild(pick);
    return wrap;
  }

  // AND THE ONE THAT MATTERS MOST. A document says Nick is running the open
  // evening. Whether that is you decides whether you have just been given a
  // job, and there is nothing in the word "Nick" that says. Ticked here, you
  // are written as "Nick (you)" everywhere, and a paper naming the other Nick
  // stops looking like it named you.
  //
  // One person only — ticking somebody else unticks whoever had it, because two
  // of you is not a thing and a leftover tick would be worse than none.
  function meLine(person) {
    const wrap = document.createElement("label");
    wrap.className = "cb-field ppl-me";
    wrap.innerHTML = `<span class="cb-lbl">Is this you?</span>`;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!person.isMe;
    box.addEventListener("change", (e) => {
      contacts.forEach((c) => { if (c && c !== person) delete c.isMe; });
      if (e.target.checked) person.isMe = true;
      else delete person.isMe;
      persist();
      render();
    });
    wrap.appendChild(box);
    return wrap;
  }

  // Everything the app knows this person is called. Shown on their card so the
  // learning is visible and correctable — a spelling it picked up wrongly must
  // be as easy to remove as it was to add.
  function akaLine(person) {
    const wrap = document.createElement("label");
    wrap.className = "cb-field ppl-aka";
    wrap.innerHTML = `<span class="cb-lbl">Also written as (pinyin, characters, a nickname — comma separated)</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = (person.aka || []).join(", ");
    input.placeholder = "picked up automatically when you confirm a spelling";
    input.addEventListener("change", (e) => {
      person.aka = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
      persist();
      render();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function normaliseContacts(list) {
    return (Array.isArray(list) ? list : []).map((c) => ({
      id: c && c.id ? String(c.id) : uid(),
      name: (c && c.name ? String(c.name) : "").trim(),
      // Other ways this person gets written — pinyin against characters, a
      // nickname, a maiden name. Mostly learned from your own confirmations
      // rather than typed, but editable here like everything else.
      aka: (Array.isArray(c && c.aka) ? c.aka : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
      group: (c && c.group ? String(c.group) : "").trim(),
      // Which one they are, when the name doesn't say — see tagLine, and
      // OrganiserNames.tagOf, which is the one place that decides what shows.
      ...(c && c.tag ? { tag: String(c.tag).trim().slice(0, 24) } : {}),
      ...(c && c.isMe ? { isMe: true } : {}),
      // A reference into data/files/, not the image itself — see photoLine.
      ...(c && c.photo ? { photo: String(c.photo) } : {}),
      details: c && c.details && typeof c.details === "object" ? c.details : {},
      workLog: (Array.isArray(c && c.workLog) ? c.workLog : [])
        .map((w) => ({
          id: w && w.id ? String(w.id) : uid(),
          dir: w && w.dir === "out" ? "out" : "in", // "in" = passed to me, "out" = I passed on
          note: (w && w.note ? String(w.note) : "").trim(),
          date: /^\d{4}-\d{2}-\d{2}$/.test(w && w.date) ? w.date : todayISO(),
        })),
      createdAt: (c && c.createdAt) || nowISO(),
    })).filter((c) => c.name);
  }

  function persist() {
    OrganiserStore.save({ contacts, contactConfig: config });
  }
  function setStatus(msg) {
    const s = $("#pplStatus");
    s.textContent = msg || "";
    s.hidden = !msg;
    clearTimeout(setStatus._t);
    if (msg) setStatus._t = setTimeout(() => (s.hidden = true), 4000);
  }

  // ----- what's actually live with a person (computed, never a score) -----
  // DOES THIS NAME MEAN THIS PERSON? — asked of names.js, which is where that
  // question lives. This file had its own answer and it was a much looser one:
  // a.includes(b) || b.includes(a), so a job promised to "Nick" was counted
  // against Nick, Nicky and Nicholas alike, and a job promised to "Li" belonged
  // to every Li on the roster. It also never once admitted a doubt — the card
  // said "1 promised to them" against BOTH people called Nick, definitively,
  // twice, for one promise.
  //
  // SURE and MAYBE are different facts and are now shown as different facts. A
  // promise the app cannot place is not evidence about either person; it is a
  // question, and the card says so instead of answering it twice.
  function openPromises(person) {
    const sure = [];
    const maybe = [];
    items.forEach((i) => {
      if (i.done || !i.promisedTo) return;
      const hit = OrganiserNames.look(i.promisedTo, contacts);
      if (hit.state === "matched" && hit.contact && hit.contact.id === person.id) sure.push(i);
      else if (hit.state === "nearly" && hit.suggestions.some((c) => c.id === person.id)) maybe.push(i);
    });
    return { sure, maybe, length: sure.length };
  }
  function mentions(person) {
    const n = (person.name || "").toLowerCase();
    if (!n) return [];
    return records
      .filter((r) => ((r.summary || "") + " " + (r.detail || "")).toLowerCase().includes(n))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 5);
  }

  // ----- the work log: countable events, never a verdict -----
  // "in" = they passed work to me · "out" = I passed work to them. Counted only
  // inside the chosen window, and always shown WITH the dated list, so it stays
  // evidence you can read rather than a number you argue with.
  function workIn(person) {
    const cut = rangeCutoff();
    return (person.workLog || []).filter((w) => w.dir === "in" && (!cut || w.date >= cut));
  }
  function workOut(person) {
    const cut = rangeCutoff();
    return (person.workLog || []).filter((w) => w.dir === "out" && (!cut || w.date >= cut));
  }
  // ONE CLICK, no dialog: the entry is logged immediately with an empty note and
  // its note box is focused — type if you want, walk away if you don't. If it
  // ever costs more than a moment it won't get done, and the log dies.
  function logWork(person, dir) {
    if (!person.workLog) person.workLog = [];
    const entry = { id: uid(), dir, note: "", date: todayISO() };
    person.workLog.unshift(entry);
    persist();
    openId = person.id; // show what just happened
    focusNoteId = entry.id;
    render();
  }
  function unlogWork(person, id) {
    person.workLog = (person.workLog || []).filter((w) => w.id !== id);
    persist();
    render();
  }

  // ----- mutations -----
  function addPerson() {
    const name = $("#pplName").value.trim();
    if (!name) return;
    const person = { id: uid(), name, group: $("#pplGroup").value, details: {}, createdAt: nowISO() };
    contacts.unshift(person);
    persist();
    $("#pplName").value = "";
    openId = person.id;
    render();
  }
  // ---- a whole class at once ------------------------------------------------
  //
  // Read, shown, then added — the same rule the plan box and the syllabus box
  // follow. Twenty-four people arriving silently is exactly the kind of thing
  // you want to have looked at before it happens.
  function pasteRead() {
    const R = window.OrganiserRoster;
    const box = $("#pplPaste");
    if (!R || !box) return null;
    const text = box.value || "";
    const pick = pasteCols;
    const r = R.read(text, {
      existing: contacts,
      ...(pick ? { name: pick.name, group: pick.group } : {}),
    });
    if (!pasteCols && r.columns) pasteCols = r.pick;
    return r;
  }
  let pasteCols = null;

  function renderPaste() {
    const R = window.OrganiserRoster;
    const prev = $("#pplPreview");
    const words = $("#pplPasteWords");
    const btn = $("#pplPasteAdd");
    const cols = $("#pplCols");
    if (!R || !prev) return;
    // THE PREVIEW HAS TO BE ABOUT THE THING THAT WILL HAPPEN. Pasting a slide
    // showed "18 to add." from the register reader and then added 5 people from
    // the card reader — the count and the action were about two different
    // readings of the same paste.
    const cards = asCards();
    if (cards && cards.length) {
      if (cols) cols.hidden = true;
      if (btn) btn.hidden = false;
      const fresh = cards.filter((c) => !c.already).length;
      const known = cards.length - fresh;
      if (btn) btn.hidden = !fresh;
      if (words)
        words.textContent =
          `${fresh} ${fresh === 1 ? "person" : "people"}, read as a name with what they do under it.` +
          (known ? ` ${known} already on your list.` : "");
      if (prev) {
        prev.hidden = false;
        prev.innerHTML = cards
          .map(
            (c) =>
              `<div class="ppl-prev-row${c.already ? " known" : ""}"><strong>${escapeHtml(c.name)}</strong>` +
              (c.aka.length ? ` <span class="muted">also ${escapeHtml(c.aka.join(", "))}</span>` : "") +
              (c.already ? ` <span class="muted">— already on your list</span>` : "") +
              `<div class="muted">${c.roles.map(escapeHtml).join(" · ")}</div></div>`
          )
          .join("");
      }
      return;
    }
    const r = pasteRead();
    const any = r && r.rows.length;
    if (prev) prev.hidden = !any;
    if (btn) btn.hidden = !any || !r.adding.length;
    if (cols) cols.hidden = !any || r.columns < 2;
    if (words) words.textContent = any ? R.words(r) : "";
    if (!any) return;

    // WHICH COLUMN IS WHICH IS YOURS TO SAY. "Wang, Wei" and "Wang Wei, 9A"
    // are the same shape and mean different things; a guess is offered and
    // never imposed.
    if (cols && r.columns >= 2) {
      cols.innerHTML =
        `<span class="muted">Which column is the name?</span> ` +
        Array.from({ length: r.columns }, (_, c) =>
          `<button type="button" class="p-opt ppl-col${c === r.pick.name ? " on" : ""}" ` +
          `data-col="${c}">${escapeHtml((r.rows[0] && r.rows[0].cells[c]) || "column " + (c + 1))}</button>`
        ).join("");
    }

    prev.innerHTML =
      r.rows
        .slice(0, 40)
        .map(
          (x) =>
            `<div class="ro-row${x.skip ? " ppl-skip" : ""}">` +
            `<span>${escapeHtml(x.name || "—")}</span>` +
            `<span class="p-state">${escapeHtml(x.skip || x.group || "no class")}</span></div>`
        )
        .join("") +
      (r.rows.length > 40 ? `<p class="muted">and ${r.rows.length - 40} more</p>` : "");
  }

  // A NAME WITH THEIR JOB UNDERNEATH IT — see OrganiserRoster.cardsIn.
  //
  // The register reader is for a class: one person per line. A slide from a
  // staff meeting is the other shape entirely — a name, then what they do, as
  // bullets under it — and read as a register it made SIX people out of one,
  // including somebody called "- Master Teacher of Mathematics", and said "6 to
  // add." with every confidence.
  //
  // Which shape a paste is gets decided by the paste, not by a setting.
  const asCards = () => {
    const R = window.OrganiserRoster;
    const text = ($("#pplPaste") || {}).value || "";
    if (!R || !R.looksLikeCards(text)) return null;
    // SOMEBODY YOU ALREADY HAVE IS NOT SOMEBODY NEW. The register reader has
    // always checked this; the card reader didn't, so re-pasting a slide deck to
    // fix one typo gave you every one of them twice. Asked of names.js, which is
    // where "does this name mean this person" lives — so a second name you have
    // already taught it counts as knowing them.
    return R.cardsIn(text).map((c) => {
      const hit = OrganiserNames.look(c.name, contacts);
      return { ...c, already: hit.state === "matched" ? hit.contact : null };
    });
  };

  // WHAT SOMEBODY IS, SHORT ENOUGH TO SIT IN BRACKETS AFTER THEIR NAME.
  //
  // "Assistant Principal" fits and is exactly what you want to see beside
  // Dana's name. "Principal of Somewhere High School" does not, and cutting it
  // mid-word would be worse than nothing — so the head of the phrase is taken,
  // which in English is what comes before "of" or "for" or "at". That is
  // grammar, not domain vocabulary: the same category as the Mr/Ms/Dr this file
  // already strips, and nothing here knows what a principal is.
  const TAG_MAX = 24;
  function tagFromRole(role) {
    const r = String(role || "").trim().replace(/[,;].*$/, "");
    if (!r) return "";
    if (r.length <= TAG_MAX) return r;
    const head = r.split(/\s+\b(?:of|for|at|in|to)\b\s+/)[0].trim();
    return head && head.length <= TAG_MAX ? head : "";
  }

  // As much of the phrase as fits, cut at a word rather than mid-syllable. Used
  // only when the short form would collide with somebody else's.
  function longerTag(role) {
    const r = String(role || "").trim().replace(/[,;].*$/, "");
    if (r.length <= TAG_MAX) return r;
    const words = r.split(/\s+/);
    let out = "";
    for (const w of words) {
      if ((out ? out.length + 1 : 0) + w.length > TAG_MAX) break;
      out = out ? `${out} ${w}` : w;
    }
    // Never ending on a word that was leading somewhere: "Principal of Primary &"
    // reads as a sentence somebody stopped writing.
    return out.replace(/\s+(?:&|and|of|for|at|in|to|the|a|an)$/i, "").replace(/[\s,;:-]+$/, "");
  }

  function pasteAdd() {
    // The slide shape first: if it is one, the register reader must not get it.
    const all = asCards();
    const cards = (all || []).filter((c) => !c.already);
    if (all && all.length && !cards.length) {
      // Every one of them already here — say so rather than doing nothing.
      setStatus(`All ${all.length} of them are already on your list — nothing to add.`);
      return;
    }
    if (cards.length) {
      // A HEAD THAT TWO OF THEM SHARE SEPARATES NEITHER. "Principal of Shanghai
      // High School" and "Principal of Primary & Middle School" both shorten to
      // "Principal", and then two people sit there in identical brackets — which
      // is worse than no brackets, because now the app looks like it has told
      // them apart. Where the short form collides, more of the phrase is kept.
      const heads = cards.map((c) => tagFromRole(c.roles[0]));
      const clashes = new Set(heads.filter((h, i) => h && heads.indexOf(h) !== i));
      const made = cards.map((c, i) => ({
        id: uid(),
        name: c.name,
        group: "",
        // The other name they go by, straight off the slide — "Mr. C. Instance
        // (Principal Robin)" is one man, and this is the app being TOLD so
        // rather than having to be asked later.
        ...(c.aka.length ? { aka: c.aka.slice(0, 8) } : {}),
        // Which one they are, in brackets after their name — see tagFromRole.
        ...((clashes.has(heads[i]) ? longerTag(c.roles[0]) : heads[i])
          ? { tag: clashes.has(heads[i]) ? longerTag(c.roles[0]) : heads[i] }
          : {}),
        // EVERY LINE THEY WROTE, kept whole. The first one goes in the role
        // field because that is what it is; all of them go in the notes,
        // because a person with five jobs has five jobs and picking one for
        // them would be the app editing somebody's introduction.
        details: {
          "role / year group": c.roles[0] || "",
          ...(c.roles.length > 1 ? { notes: c.roles.join("\n") } : {}),
        },
        createdAt: nowISO(),
      }));
      contacts = made.slice().reverse().concat(contacts);
      persist();
      $("#pplPaste").value = "";
      pasteCols = null;
      renderPaste();
      render();
      const skipped = all.length - made.length;
      setStatus(
        `${made.length} added, with what each of them does.` +
        (skipped ? ` ${skipped} ${skipped === 1 ? "was" : "were"} already on your list.` : "") +
        ` Open one to add a photo or change how they're told apart.`
      );
      return;
    }
    const r = pasteRead();
    if (!r || !r.adding.length) return;
    const made = r.adding.map((x) => ({
      id: uid(), name: x.name, group: x.group || "", details: {}, createdAt: nowISO(),
    }));
    // Newest first, same as adding one by one, and in the order you pasted.
    contacts = made.reverse().concat(contacts);
    persist();
    $("#pplPaste").value = "";
    pasteCols = null;
    renderPaste();
    render();
    setStatus(`${made.length} added.`);
  }

  function deletePerson(id) {
    // Guarded like every other lookup: one null row in the list and this throws
    // on c.id, taking the page down on a delete.
    const p = contacts.find((c) => c && c.id === id);
    if (!p || !confirm(`Remove ${OrganiserNames.nameOf(contacts, id)} from your people list?`)) return;
    contacts = contacts.filter((c) => c.id !== id);
    persist();
    render();
  }

  // ----- render -----
  function fillSelect(sel, values, allLabel) {
    const el = $(sel);
    const current = el.value;
    el.innerHTML = "";
    if (allLabel !== undefined) el.appendChild(new Option(allLabel, ""));
    values.forEach((v) => el.appendChild(new Option(v, v)));
    if ([...el.options].some((o) => o.value === current)) el.value = current;
  }

  function personCard(person) {
    const card = document.createElement("section");
    card.className = "ppl-card";
    const promises = openPromises(person);
    const open = openId === person.id;
    const filled = Object.entries(person.details || {}).filter(([, v]) => (v || "").toString().trim());
    const wIn = workIn(person).length;
    const wOut = workOut(person).length;
    card.innerHTML = `
      <div class="ppl-head">
        ${person.photo ? `<img class="ppl-thumb" src="/files/${encodeURI(person.photo)}" alt="" />` : ""}
        <button class="ppl-name" type="button">${escapeHtml(person.name)}</button>
        ${OrganiserNames.tagOf(person) ? `<span class="ppl-tag-chip" title="How this person is told apart from anyone else with the same name">(${escapeHtml(OrganiserNames.tagOf(person))})</span>` : ""}
        ${(person.aka || []).length ? `<span class="ppl-aka-chip" title="Other ways this name gets written">${(person.aka || []).map(escapeHtml).join(" · ")}</span>` : ""}
        ${OrganiserNames.tagOf(person) === (person.group || "") ? "" : `<span class="ppl-group">${escapeHtml(person.group || "")}</span>`}
        ${wIn || wOut ? `<span class="work-chip" title="Work passed between you in ${escapeHtml(RANGE_WORDS[range])}">${wIn} to you · ${wOut} from you</span>` : ""}
        ${promises.sure.length ? `<span class="promise-chip">${promises.sure.length} promised to them</span>` : ""}
        ${promises.maybe.length ? `<span class="promise-chip promise-maybe" title="Somebody else here has the same name, so the app cannot say which of you this was promised to">${promises.maybe.length} might be theirs</span>` : ""}
        <span class="ppl-quick">
          <button class="link q-in" type="button" title="They passed work to me — logs straight away">+ to me</button>
          <button class="link q-out" type="button" title="I passed work to them — logs straight away">+ from me</button>
        </span>
        <button class="x-del ppl-del" type="button" title="Remove">×</button>
      </div>
      ${!open && filled.length ? `<div class="rec-extra-line">${filled.slice(0, 3).map(([k, v]) => `<span class="rec-extra-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}`).join(" · ")}</div>` : ""}`;
    card.querySelector(".ppl-name").addEventListener("click", () => {
      openId = open ? null : person.id;
      render();
    });
    card.querySelector(".q-in").addEventListener("click", () => logWork(person, "in"));
    card.querySelector(".q-out").addEventListener("click", () => logWork(person, "out"));
    card.querySelector(".ppl-del").addEventListener("click", () => deletePerson(person.id));

    if (open) {
      // the details, filled gradually — blank is always fine
      const fields = (config.fields && config.fields[person.group]) || config.fields[config.groups[0]] || [];
      const grid = document.createElement("div");
      grid.className = "rec-extra-fields";
      // which kind of person — changeable any time (e.g. one added by a dump)
      const gl = document.createElement("label");
      gl.className = "cb-field";
      gl.innerHTML = `<span class="cb-lbl">Kind</span>`;
      const gsel = document.createElement("select");
      if (!config.groups.includes(person.group)) gsel.appendChild(new Option("— not sorted —", person.group || ""));
      config.groups.forEach((g) => gsel.appendChild(new Option(g, g)));
      gsel.value = person.group || "";
      gsel.addEventListener("change", (e) => {
        person.group = e.target.value;
        persist();
        render();
      });
      gl.appendChild(gsel);
      grid.appendChild(gl);
      grid.appendChild(photoLine(person));
      grid.appendChild(tagLine(person));
      grid.appendChild(meLine(person));
      grid.appendChild(akaLine(person));
      fields.forEach((f) => {
        const label = document.createElement("label");
        label.className = "cb-field";
        label.innerHTML = `<span class="cb-lbl">${escapeHtml(f)}</span>`;
        const input = document.createElement("input");
        input.type = "text";
        input.value = (person.details && person.details[f]) || "";
        input.placeholder = "fine to leave blank";
        input.addEventListener("change", (e) => {
          const v = e.target.value.trim();
          if (!person.details) person.details = {};
          if (v) person.details[f] = v;
          else delete person.details[f];
          persist();
        });
        label.appendChild(input);
        grid.appendChild(label);
      });
      card.appendChild(grid);

      // What's live between you — facts already in the app, never a tally.
      const live = document.createElement("div");
      live.className = "ppl-live";
      const ms = mentions(person);
      let html = "";
      const promiseRows = (list) => list
        .map((t) => `<div class="ppl-live-row">${escapeHtml(t.title)}${t.date ? ` <span class="gt-when">${escapeHtml(friendlyDate(t.date))}</span>` : ""}</div>`)
        .join("");
      if (promises.sure.length) {
        html += `<p class="ppl-live-title">You've promised them</p>`;
        html += promiseRows(promises.sure);
      }
      // SAID AS A QUESTION, because that is what it is. Somebody else here has
      // the same name, so listing these under "you've promised them" would be
      // the app deciding something it has no way of knowing — twice, once on
      // each of their cards.
      if (promises.maybe.length) {
        html += `<p class="ppl-live-title">Might be theirs — someone else here has this name</p>`;
        html += promiseRows(promises.maybe);
      }
      if (ms.length) {
        html += `<p class="ppl-live-title">Recently noted</p>`;
        html += ms
          .map((r) => `<div class="ppl-live-row"><span class="gt-when">${escapeHtml(friendlyDate(r.date))}</span> ${escapeHtml(r.summary)}</div>`)
          .join("");
      }
      if (!html) html = `<p class="ppl-live-title">Nothing open with them right now.</p>`;
      live.innerHTML = html;
      card.appendChild(live);

      // Work passed between you — tap to log, with the dated evidence beneath.
      const wl = document.createElement("div");
      wl.className = "ppl-work";
      const entries = (person.workLog || [])
        .filter((w) => {
          const cut = rangeCutoff();
          return !cut || w.date >= cut;
        })
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      wl.innerHTML = `
        <p class="ppl-live-title">Work passed between you — ${escapeHtml(RANGE_WORDS[range])}</p>
        <p class="ppl-work-counts">${wIn} to you · ${wOut} from you</p>
        <div class="ppl-work-btns">
          <button class="link w-in" type="button">+ they passed work to me</button>
          <button class="link w-out" type="button">+ I passed work to them</button>
        </div>`;
      const listWrap = document.createElement("div");
      listWrap.className = "ppl-work-list";
      entries.forEach((w) => {
        const row = document.createElement("div");
        row.className = "ppl-work-row";
        row.innerHTML = `<span class="gt-when">${escapeHtml(friendlyDate(w.date))}</span>
          <span class="w-dir ${w.dir}">${w.dir === "in" ? "to you" : "from you"}</span>`;
        // the note is optional and editable in place — never a required step
        const note = document.createElement("input");
        note.type = "text";
        note.className = "w-note";
        note.value = w.note || "";
        note.placeholder = "what was it? (optional)";
        note.addEventListener("change", (e) => {
          w.note = e.target.value.trim();
          persist();
        });
        row.appendChild(note);
        const del = document.createElement("button");
        del.className = "x-del";
        del.type = "button";
        del.title = "Remove this entry";
        del.textContent = "×";
        del.addEventListener("click", () => unlogWork(person, w.id));
        row.appendChild(del);
        listWrap.appendChild(row);
        if (focusNoteId === w.id) {
          setTimeout(() => note.focus(), 0);
          focusNoteId = null;
        }
      });
      wl.appendChild(listWrap);
      wl.querySelector(".w-in").addEventListener("click", () => logWork(person, "in"));
      wl.querySelector(".w-out").addEventListener("click", () => logWork(person, "out"));
      card.appendChild(wl);
    }
    return card;
  }

  function render() {
    $("#pplNote").textContent = config.note || "";
    fillSelect("#pplGroup", config.groups);
    fillSelect("#fGroup", config.groups, "everyone");
    renderConfig();

    // Your own load: the totals across everyone. Framed about YOU (how much is
    // coming your way vs going out), never as a ranking of other people.
    const totIn = contacts.reduce((n, c) => n + workIn(c).length, 0);
    const totOut = contacts.reduce((n, c) => n + workOut(c).length, 0);
    const load = $("#pplLoad");
    if (totIn || totOut) {
      load.hidden = false;
      load.textContent = `Over ${RANGE_WORDS[range]} you've logged ${totIn} thing${totIn === 1 ? "" : "s"} passed to you and ${totOut} passed on by you. Open a person to see what.`;
    } else {
      load.hidden = true;
      load.textContent = "";
    }

    const list = $("#pplList");
    list.innerHTML = "";
    // WHEN THE BRACKETS DON'T HELP. Two people whose names read the same AND
    // whose tags read the same come out identical on screen — which is worse
    // than no tags at all, because now the app looks like it has told them
    // apart. Said here, once, with the names in it, so the fix is obvious.
    const same = OrganiserNames.muddled(contacts);
    if (same.length) {
      const warn = document.createElement("p");
      warn.className = "muted ppl-muddled";
      warn.textContent =
        same
          .map((g) => `${g.length} people here read as “${OrganiserNames.saidAs(contacts, g[0].id)}”`)
          .join("; ") +
        ". Open one and give it something to tell them apart — a school, a job, a year group.";
      list.appendChild(warn);
    }
    const visible = contacts.filter((c) => {
      if (filters.group && c.group !== filters.group) return false;
      if (filters.name && !c.name.toLowerCase().includes(filters.name)) return false;
      return true;
    });
    if (!visible.length) {
      list.insertAdjacentHTML(
        "beforeend",
        `<p class="empty">${contacts.length ? "Nobody matches that." : "No one here yet. Add a name above — details can come later."}</p>`
      );
      return;
    }
    // group them under their kind, so colleagues and parents stay distinct
    const groups = config.groups.concat([...new Set(visible.map((c) => c.group))].filter((g) => !config.groups.includes(g)));
    groups.forEach((g) => {
      const inGroup = visible.filter((c) => c.group === g);
      if (!inGroup.length) return;
      const h = document.createElement("h2");
      h.className = "rec-group-title";
      h.textContent = `${g || "not sorted yet"} (${inGroup.length})`;
      list.appendChild(h);
      inGroup
        .slice()
        // Guarded like every other list of people in the app: a contact with no
        // name is a row that throws here and takes the whole page with it.
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
        .forEach((c) => list.appendChild(personCard(c)));
    });
  }

  function renderConfig() {
    const area = $("#pplCfg");
    area.innerHTML = "";
    const mk = (labelText, value, apply) => {
      const label = document.createElement("label");
      label.className = "cb-field rec-cfg-wide";
      label.innerHTML = `<span class="cb-lbl">${escapeHtml(labelText)}</span>`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.addEventListener("change", (e) => {
        apply(e.target.value);
        persist();
        render();
      });
      label.appendChild(input);
      area.appendChild(label);
    };
    const parse = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
    mk("Kinds of people (comma-separated)", config.groups.join(", "), (v) => {
      const l = parse(v);
      if (l.length) config.groups = l;
    });
    config.groups.forEach((g) =>
      mk(`Details kept for “${g}” (comma-separated)`, ((config.fields || {})[g] || []).join(", "), (v) => {
        const l = parse(v);
        if (!config.fields) config.fields = {};
        if (l.length) config.fields[g] = l;
        else delete config.fields[g];
      })
    );
  }

  function refreshFromExternal(state) {
    contacts = normaliseContacts(state.contacts);
    config = normaliseConfig(state.contactConfig) || config;
    items = state.items || [];
    records = state.records || [];
    render();
  }

  async function init() {
    const data = await OrganiserStore.load();
    contacts = normaliseContacts(data.contacts);
    items = data.items || [];
    records = data.records || [];
    config = normaliseConfig(data.contactConfig);
    if (!config) {
      config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      persist();
    }
    OrganiserStore.onExternalChange(refreshFromExternal);
    $("#pplAdd").addEventListener("click", addPerson);
    const pbox = $("#pplPaste");
    if (pbox) pbox.addEventListener("input", () => { pasteCols = null; renderPaste(); });
    const padd = $("#pplPasteAdd");
    if (padd) padd.addEventListener("click", pasteAdd);
    const pcols = $("#pplCols");
    if (pcols)
      pcols.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest(".ppl-col") : null;
        if (!b) return;
        const c = Number(b.dataset.col);
        // Picking the name column leaves the other one as the group, when there
        // is exactly one other. More than that and the group is left alone.
        const cur = pasteCols || { name: 0, group: -1 };
        pasteCols = { name: c, group: cur.group === c ? -1 : cur.group };
        renderPaste();
      });
    $("#pplName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addPerson();
    });
    $("#fGroup").addEventListener("change", (e) => {
      filters.group = e.target.value;
      render();
    });
    $("#fName").addEventListener("input", (e) => {
      filters.name = e.target.value.trim().toLowerCase();
      render();
    });
    $("#fRange").addEventListener("change", (e) => {
      range = e.target.value;
      render();
    });
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());
    render();
    // ARRIVE WITH IT ALREADY OPEN. Set up sends people here to paste a class
    // list; landing on a page with the box shut is a second search for the
    // thing they were just sent to do.
    if (/#class\b/.test(location.hash || "")) {
      const box = document.getElementById("pplPasteBox");
      if (box) {
        box.open = true;
        box.scrollIntoView({ block: "start" });
      }
    }
  }

  init();
})();
