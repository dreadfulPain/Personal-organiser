// TURNS — the page for going round a list.
//
// rota.js has always known how to do this; it had no way in. What it needs from
// a screen is small, and all four of the awkward cases have to be reachable in
// one tap each, because they happen while you're standing in a corridor:
//
//   it happened                 → mark it, and they go to the back
//   they weren't free           → remember the attempt, but they KEEP their place
//   my day fell apart           → nothing at all is recorded, which IS the rule
//   they can't, who else?       → the next in line, and it costs them nothing
//
// The third one is the one worth being careful about: the temptation is to add
// a button for it. There must not be one. Not marking someone is already the
// correct behaviour, so a button would only give you a way to record a fault
// that was never theirs.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let rotas = [], contacts = [], items = [], schedule = [];
  let which = "";

  const $ = (s) => document.querySelector(s);
  const R = () => window.OrganiserRota;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Asked of one place — see OrganiserDates.today(). Fourteen files worked this
  // out for themselves, in four spellings that all agreed. So did nameOf, once.
  const todayISO = () => OrganiserDates.today();

  // Asked of one place — see OrganiserNames.nameOf. Six files each had their
  // own copy of this and they had already drifted apart.
  // A rota is the case this exists for: colleagues, from anywhere, whose names
  // are exactly what gets muddled. Never dropped.
  const shownIds = () => [];
  // NAME PLUS THE WORD THAT TELLS THEM APART — see OrganiserNames.saidAs. A
  // tag every row on this page shares is dropped, because it separates nobody.
  const personWords = (id) =>
    OrganiserNames.saidAs(contacts, id, { sharedBy: OrganiserNames.sharedTag(contacts, shownIds()) });
  const waitWords = (w) => {
    if (!Number.isFinite(w)) return "no turn yet";
    if (w <= 0) return "today";
    if (w === 1) return "yesterday";
    if (w < 14) return `${w} days ago`;
    return `${Math.round(w / 7)} weeks ago`;
  };
  const current = () => rotas.find((r) => r && r.id === which) || null;
  const groups = () =>
    [...new Set(contacts.map((c) => (c && c.group) || "").filter(Boolean))].sort();

  function save() {
    OrganiserStore.save({ rotas });
    render();
  }

  // Replace one rota in the list, keeping the rest untouched.
  function put(next) {
    if (!next) return;
    rotas = rotas.map((r) => (r && r.id === next.id ? next : r));
    save();
  }

  // ---- who's up ------------------------------------------------------------
  function renderToday() {
    const r = current();
    const el = $("#roToday");
    if (!el || !r) return;
    const iso = todayISO();
    const due = R().due(r, iso);
    const st = R().state(r, iso);

    const words = $("#roState");
    if (words)
      words.textContent = st.total
        ? `${st.total} in the round · ${st.seen} had a turn within ${st.everyDays} days · ` +
          `${st.waiting} waiting longer`
        : "";

    if (!due.length) { el.innerHTML = `<p class="muted">Nobody in this round yet.</p>`; return; }
    el.innerHTML = due
      .map(
        (x) =>
          `<div class="ro-up"><div class="p-thead"><strong>${esc(personWords(x.id))}</strong>` +
          `<span class="p-state">last turn ${esc(waitWords(x.waited))}` +
          (x.tries ? ` · ${x.tries} ${x.tries === 1 ? "try" : "tries"} that couldn't happen` : "") +
          `</span></div>` +
          `<div class="ro-buttons">` +
          `<button type="button" class="btn ro-did" data-id="${esc(x.id)}">it happened</button>` +
          `<button type="button" class="link ro-busy" data-id="${esc(x.id)}">they weren't free</button>` +
          `</div>` +
          // Offered only when asked for, because the swap is a decision and not
          // the default. Taking a turn early costs the stand-in nothing: the
          // queue is ordered by how long since a turn, and they've just had one.
          `<div class="ro-instead" data-for="${esc(x.id)}"></div>` +
          `</div>`
      )
      .join("");
  }

  function renderStuck() {
    const r = current();
    const block = $("#roStuckBlock");
    const el = $("#roStuck");
    if (!el || !block) return;
    const stuck = r ? R().neverCatching(r, 3) : [];
    block.hidden = !stuck.length;
    el.innerHTML = stuck
      .map(
        (x) =>
          `<div class="ro-row"><span>${esc(personWords(x.id))}</span>` +
          `<span class="p-state">${x.tries} tries at this time, none of them worked</span>` +
          `<button type="button" class="link ro-clear" data-id="${esc(x.id)}">sorted it</button></div>`
      )
      .join("");
  }

  function renderQueue() {
    const r = current();
    const el = $("#roQueue");
    if (!el || !r) return;
    el.innerHTML = R()
      .queue(r, todayISO())
      .map(
        (x, i) =>
          `<div class="ro-row"><span>${i + 1}. ${esc(personWords(x.id))}</span>` +
          `<span class="p-state">${esc(waitWords(x.waited))}</span></div>`
      )
      .join("");
  }

  function wire() {
    const today = $("#roToday");
    if (today)
      today.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest("button") : null;
        if (!b) return;
        const r = current();
        if (!r) return;
        const id = b.dataset.id;
        if (b.classList.contains("ro-did")) {
          put(R().mark(r, id, todayISO()));
        } else if (b.classList.contains("ro-busy")) {
          // THEY weren't free. The attempt is remembered so a slot that never
          // works gets noticed — but their place is untouched, because that
          // wasn't their doing either.
          put(R().tryFailed(r, id, todayISO()));
          offerInstead(id);
        } else if (b.classList.contains("ro-swap")) {
          put(R().mark(r, id, todayISO()));
        }
      });
    const stuck = $("#roStuck");
    if (stuck)
      stuck.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest(".ro-clear") : null;
        if (!b) return;
        const r = current();
        if (!r) return;
        // You've arranged a different time. The failed attempts are spent —
        // they were about the old slot and say nothing about the new one.
        const t = { ...(r.tried || {}) };
        delete t[b.dataset.id];
        put({ ...r, tried: t });
      });
    const add = $("#roAddTask");
    if (add) add.addEventListener("click", addToDay);
    const sel = $("#roWhich");
    if (sel)
      sel.addEventListener("change", () => {
        which = sel.value;
        render();
      });
    const form = $("#roForm");
    if (form) form.addEventListener("submit", create);
  }

  // Who to ask instead. Rendered after the fact rather than always on screen —
  // it's only a question once somebody has said no.
  function offerInstead(id) {
    const r = current();
    const box = document.querySelector(`.ro-instead[data-for="${id}"]`);
    if (!r || !box) return;
    const next = R().insteadOf(r, id, todayISO());
    if (!next) { box.innerHTML = `<p class="muted">Nobody else in the round.</p>`; return; }
    box.innerHTML =
      `<p class="muted">${esc(personWords(id))} keeps their place — they come back round first. ` +
      `Next in line is ${esc(personWords(next.id))}, and taking a turn now costs them nothing.</p>` +
      `<button type="button" class="btn ro-swap" data-id="${esc(next.id)}">did it with ${esc(personWords(next.id))}</button>`;
  }

  // Today's turn as an ordinary piece of work, so the day plan sizes and places
  // it like everything else rather than it being a thing you have to remember.
  function addToDay() {
    const r = current();
    if (!r) return;
    const iso = todayISO();
    const due = R().due(r, iso);
    if (!due.length) return;
    const made = due
      .map((x) => R().taskFor(r, x.id, `${r.title || "A turn"} — ${personWords(x.id)}`, iso))
      .filter(Boolean)
      // Twice in a day would be two of the same job on the list, and the second
      // one is never the one you tick off.
      .filter((t) => !items.some((i) => i && !i.done && i.rotaId === r.id && i.rotaMemberId === t.rotaMemberId && i.date === iso))
      .map((t) => ({ ...t, id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(), completedAt: null }));
    if (!made.length) return;
    items = items.concat(made);
    OrganiserStore.save({ items });
    render();
  }

  function create(e) {
    e.preventDefault();
    const group = ($("#roGroup").value || "").trim();
    // IN THE ORDER YOU READ A REGISTER. A round goes by longest-since-a-turn,
    // but the list it is built from is the one you check against your register,
    // and it came back in whatever order it was stored in.
    const memberIds = contacts
      .filter((c) => c && c.id && (!group || c.group === group))
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .map((c) => c.id);
    if (!memberIds.length) return;
    const made = R().normalise({
      id: `rota${Date.now().toString(36)}`,
      title: ($("#roTitle").value || "").trim() || group,
      memberIds,
      perDay: Number($("#roPerDay").value) || 1,
      minutes: Number($("#roMinutes").value) || 10,
      everyDays: Number($("#roEvery").value) || 14,
      optional: $("#roOptional").checked,
      lastDone: {},
    });
    if (!made) return;
    rotas = rotas.concat([made]);
    which = made.id;
    const box = $("#roSetupBox");
    if (box) box.open = false;
    save();
  }

  function renderPickers() {
    const sel = $("#roWhich");
    if (sel)
      sel.innerHTML = rotas.length
        ? rotas.map((r) => `<option value="${esc(r.id)}"${r.id === which ? " selected" : ""}>${esc(r.title || r.id)}</option>`).join("")
        : `<option value="">none set up yet</option>`;
    const g = $("#roGroup");
    if (g)
      g.innerHTML =
        `<option value="">everyone on your list</option>` +
        groups().map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }

  function render() {
    renderPickers();
    const r = current();
    ["#roTodayBlock", "#roQueueBlock"].forEach((s) => {
      const el = $(s);
      if (el) el.hidden = !r;
    });
    if (!r) {
      const st = $("#roStuckBlock");
      if (st) st.hidden = true;
      return;
    }
    renderToday();
    renderStuck();
    renderQueue();
  }

  async function init() {
    const data = await OrganiserStore.load();
    rotas = Array.isArray(data.rotas) ? data.rotas : [];
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    items = Array.isArray(data.items) ? data.items : [];
    schedule = Array.isArray(data.schedule) ? data.schedule : [];
    which = rotas.length ? rotas[0].id : "";
    wire();
    render();
  }

  init();
})();
