// WATCHING SOMEBODY ELSE TEACH.
//
// Not learning how to teach — learning how it is done HERE, which is a
// different thing and much faster to pick up by looking than by being told. How
// much of the language the children can genuinely handle, how tight the routines
// are, what the other adult in the room actually does, how much ground a lesson
// covers, what counts as normal behaviour, how polished a lesson is expected to
// look. None of that is written down anywhere, and all of it is visible in
// forty minutes.
//
// WHY IT NEEDS HEADINGS. Sitting in with no list, you come out with "that was
// good" and nothing you can use. The headings are what you go in looking for,
// and they are the whole feature — the notes are just what you saw.
//
// SEEDED, THEN YOURS. §0.2: a list you have to invent before the feature works
// is a feature nobody uses, and a list you cannot change is the app telling you
// what matters. Same as the record types and the portfolio points — a starting
// point, fully editable, never re-seeded over your edits.
//
// AND IT COUNTS THEM, because "watch three people in your first month" is the
// advice everybody gives and nobody tracks. A count is not a target and this
// never says you are behind on one — it says how many and when the last was.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let visits = [];
  let cfg = null;
  let contacts = [];
  let openId = "";

  const $ = (s) => document.querySelector(s);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const todayISO = () => OrganiserDates.today();
  const esc = (t) =>
    String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (iso) => (iso ? OrganiserDates.dayWords(iso, { relative: false }) : "");

  // Seeded onto a fresh config only. These are the things people who have done
  // this say are worth looking for; none of them is a rule.
  const STARTING_HEADINGS = [
    "How much of the language they can genuinely handle",
    "How tight the routines are",
    "What the other adult in the room does",
    "Pacing — how long on each thing",
    "How much ground one lesson covers",
    "What the worksheets and materials look like",
    "What counts as normal behaviour here",
    "How polished a lesson is expected to look",
  ];

  function normaliseConfig(c) {
    const heads = Array.isArray(c && c.headings)
      ? c.headings.map((h) => String(h).trim()).filter(Boolean)
      : [];
    return { headings: heads.length ? heads : STARTING_HEADINGS.slice() };
  }

  function normalise(list) {
    return (Array.isArray(list) ? list : [])
      .filter(Boolean)
      .map((v) => ({
        id: v.id ? String(v.id) : uid(),
        who: (v.who ? String(v.who) : "").trim(),
        date: /^\d{4}-\d{2}-\d{2}$/.test(v.date || "") ? v.date : "",
        what: (v.what ? String(v.what) : "").trim(),
        // Keyed by the heading TEXT, not by an index — so renaming a heading
        // never silently re-labels what you wrote under the old one, and
        // deleting one never shifts everything below it up by one.
        notes: v.notes && typeof v.notes === "object" ? v.notes : {},
        createdAt: v.createdAt || nowISO(),
      }))
      .filter((v) => v.who || v.what);
  }

  const persist = () => OrganiserStore.save({ visits, visitConfig: cfg });

  function setStatus(msg) {
    const el = $("#vsStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    clearTimeout(setStatus._t);
    if (msg) setStatus._t = setTimeout(() => { el.hidden = true; el.textContent = ""; }, 5000);
  }

  function addVisit(e) {
    e.preventDefault();
    const who = ($("#vsWho").value || "").trim();
    const what = ($("#vsWhat").value || "").trim();
    if (!who && !what) return setStatus("Say whose lesson it was, or what it was — either will do.");
    const date = ($("#vsDate").value || "").trim() || todayISO();
    const v = { id: uid(), who, date, what, notes: {}, createdAt: nowISO() };
    visits.unshift(v);
    openId = v.id;
    persist();
    $("#vsWho").value = "";
    $("#vsWhat").value = "";
    render();
    setStatus("Started — write under the headings below while it's fresh. ✓");
  }

  // HOW MANY, AND WHEN THE LAST ONE WAS. Not a target, and never "you are
  // behind": those are the two ways a count turns into a telling-off.
  function renderCount() {
    const el = $("#vsCount");
    if (!el) return;
    if (!visits.length) {
      el.textContent = "None logged yet. The first one teaches you more than the next three.";
      return;
    }
    const dates = visits.map((v) => v.date).filter(Boolean).sort();
    const last = dates[dates.length - 1];
    el.textContent =
      `${visits.length} logged` + (last ? ` · the last one ${OrganiserDates.dayWords(last)}` : "");
  }

  function renderPeople() {
    const dl = $("#vsPeople");
    if (!dl) return;
    dl.innerHTML = contacts
      .filter((c) => c && c.name)
      .map((c) => `<option value="${esc(c.name)}"></option>`)
      .join("");
  }

  function renderList() {
    const el = $("#vsList");
    if (!el) return;
    if (!visits.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = "";
    visits
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .forEach((v) => {
        const card = document.createElement("section");
        card.className = "vs-card";
        const filled = cfg.headings.filter((h) => (v.notes[h] || "").trim()).length;
        card.innerHTML =
          `<div class="p-thead"><button class="ppl-name vs-open" type="button">${
            esc(v.who || "somebody")
          }</button>` +
          `<span class="p-state">${esc(day(v.date))}${v.what ? " · " + esc(v.what) : ""}` +
          ` · ${filled} of ${cfg.headings.length} written up</span>` +
          `<button type="button" class="x-del vs-del" title="Remove">×</button></div>`;
        card.querySelector(".vs-open").addEventListener("click", () => {
          openId = openId === v.id ? "" : v.id;
          render();
        });
        card.querySelector(".vs-del").addEventListener("click", () => {
          if (!confirm(`Remove the note on ${v.who || "this lesson"}?`)) return;
          visits = visits.filter((x) => x.id !== v.id);
          persist();
          render();
        });

        if (openId === v.id) {
          const grid = document.createElement("div");
          grid.className = "rec-extra-fields";
          cfg.headings.forEach((h) => {
            const lab = document.createElement("label");
            lab.className = "cb-field";
            lab.innerHTML = `<span class="cb-lbl">${esc(h)}</span>`;
            const box = document.createElement("textarea");
            box.rows = 2;
            box.value = v.notes[h] || "";
            // NOTHING IS REQUIRED. You will not have seen all eight of these in
            // one lesson, and a form that expects you to is a form you stop
            // filling in.
            box.placeholder = "fine to leave blank";
            box.addEventListener("change", (e) => {
              const t = e.target.value.trim();
              if (t) v.notes[h] = t;
              else delete v.notes[h];
              persist();
              renderCount();
            });
            lab.appendChild(box);
            grid.appendChild(lab);
          });
          card.appendChild(grid);
        }
        el.appendChild(card);
      });
  }

  function renderConfig() {
    const box = $("#vsHeads");
    if (!box) return;
    if (document.activeElement !== box) box.value = cfg.headings.join("\n");
  }

  function wire() {
    $("#vsForm").addEventListener("submit", addVisit);
    const d = $("#vsDate");
    if (d && !d.value) d.value = todayISO();
    const heads = $("#vsHeads");
    if (heads)
      heads.addEventListener("change", (e) => {
        const list = e.target.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        // AN EMPTY LIST IS NOT A CHOICE ANYBODY MAKES ON PURPOSE — it would make
        // the page do nothing at all, with no way back but retyping the lot.
        cfg.headings = list.length ? list : STARTING_HEADINGS.slice();
        persist();
        render();
      });
  }

  function render() {
    renderCount();
    renderPeople();
    renderList();
    renderConfig();
  }

  async function init() {
    const data = await OrganiserStore.load();
    visits = normalise(data.visits);
    cfg = normaliseConfig(data.visitConfig);
    contacts = data.contacts || [];
    if (!data.visitConfig) persist(); // seed once; from here it is your list
    OrganiserStore.onExternalChange((state) => {
      visits = normalise(state.visits);
      cfg = normaliseConfig(state.visitConfig);
      contacts = state.contacts || contacts;
      render();
    });
    wire();
    render();
  }

  init();
})();
