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
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const todayISO = () => isoOf(new Date());
  function friendlyDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
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
  function nameMatches(a, b) {
    a = (a || "").trim().toLowerCase();
    b = (b || "").trim().toLowerCase();
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  }
  function openPromises(person) {
    return items.filter((i) => !i.done && nameMatches(i.promisedTo, person.name));
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
  function deletePerson(id) {
    const p = contacts.find((c) => c.id === id);
    if (!p || !confirm(`Remove ${p.name} from your people list?`)) return;
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
        <button class="ppl-name" type="button">${escapeHtml(person.name)}</button>
        ${(person.aka || []).length ? `<span class="ppl-aka-chip" title="Other ways this name gets written">${(person.aka || []).map(escapeHtml).join(" · ")}</span>` : ""}
        <span class="ppl-group">${escapeHtml(person.group || "")}</span>
        ${wIn || wOut ? `<span class="work-chip" title="Work passed between you in ${escapeHtml(RANGE_WORDS[range])}">${wIn} to you · ${wOut} from you</span>` : ""}
        ${promises.length ? `<span class="promise-chip">${promises.length} promised to them</span>` : ""}
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
      if (promises.length) {
        html += `<p class="ppl-live-title">You've promised them</p>`;
        html += promises
          .map((t) => `<div class="ppl-live-row">${escapeHtml(t.title)}${t.date ? ` <span class="gt-when">${escapeHtml(friendlyDate(t.date))}</span>` : ""}</div>`)
          .join("");
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
    const visible = contacts.filter((c) => {
      if (filters.group && c.group !== filters.group) return false;
      if (filters.name && !c.name.toLowerCase().includes(filters.name)) return false;
      return true;
    });
    if (!visible.length) {
      list.innerHTML = `<p class="empty">${contacts.length ? "Nobody matches that." : "No one here yet. Add a name above — details can come later."}</p>`;
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
        .sort((a, b) => a.name.localeCompare(b.name))
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
  }

  init();
})();
