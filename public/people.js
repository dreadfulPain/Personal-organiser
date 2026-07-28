// People — the humans around the work: how to reach them, what's worth
// remembering, and what's live between you right now.
//
// GENERIC by design (§0.2): the code knows only "people in groups, with fields".
// The groups ("colleague", "parent") and each group's detail fields are DATA,
// seeded once and fully editable — point it at anyone.
//
// DELIBERATELY NOT A SCOREBOARD (§5/§16 — the mirror describes, never judges):
// the app keeps no give/take tally on a person. What it shows instead is what
// actually happened and is still open — things you promised them, records that
// mention them — plus your own words about how to work well with them. Facts and
// your judgement; never the app's verdict on a colleague.
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

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function friendlyDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

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
  function normaliseContacts(list) {
    return (Array.isArray(list) ? list : []).map((c) => ({
      id: c && c.id ? String(c.id) : uid(),
      name: (c && c.name ? String(c.name) : "").trim(),
      group: (c && c.group ? String(c.group) : "").trim(),
      details: c && c.details && typeof c.details === "object" ? c.details : {},
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
    card.innerHTML = `
      <div class="ppl-head">
        <button class="ppl-name" type="button">${escapeHtml(person.name)}</button>
        <span class="ppl-group">${escapeHtml(person.group || "")}</span>
        ${promises.length ? `<span class="promise-chip">${promises.length} promised to them</span>` : ""}
        <button class="x-del ppl-del" type="button" title="Remove">×</button>
      </div>
      ${!open && filled.length ? `<div class="rec-extra-line">${filled.slice(0, 3).map(([k, v]) => `<span class="rec-extra-k">${escapeHtml(k)}:</span> ${escapeHtml(v)}`).join(" · ")}</div>` : ""}`;
    card.querySelector(".ppl-name").addEventListener("click", () => {
      openId = open ? null : person.id;
      render();
    });
    card.querySelector(".ppl-del").addEventListener("click", () => deletePerson(person.id));

    if (open) {
      // the details, filled gradually — blank is always fine
      const fields = (config.fields && config.fields[person.group]) || config.fields[config.groups[0]] || [];
      const grid = document.createElement("div");
      grid.className = "rec-extra-fields";
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
    }
    return card;
  }

  function render() {
    $("#pplNote").textContent = config.note || "";
    fillSelect("#pplGroup", config.groups);
    fillSelect("#fGroup", config.groups, "everyone");
    renderConfig();

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
      h.textContent = `${g} (${inGroup.length})`;
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
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());
    render();
  }

  init();
})();
