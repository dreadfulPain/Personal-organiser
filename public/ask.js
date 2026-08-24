// THINGS TO ASK SOMEBODY, AND WHAT THEY TOLD YOU.
//
// "Ask, ask and ask again" is the first thing anybody says to a teacher at a new
// school, and it is good advice for a reason: in a big place, hundreds of things
// that everyone assumes are obvious were never actually said to you. Printing.
// Assessment. Who approves a trip. How much homework is normal. What the
// co-teacher actually does. Working any of them out yourself costs an hour and
// gets it wrong.
//
// A QUESTION IS NOT A TASK. It has a different shape:
//
//   · somebody ELSE has the answer, so you cannot just do it;
//   · you can only get it when you catch them, which is unpredictable;
//   · and once you have it, the ANSWER is the thing worth keeping — not the
//     fact that you asked.
//
// Filed as tasks they scatter down a list, and each one waits for you to happen
// to remember it at the moment you are standing next to the person who could
// have told you in ten seconds. So they are kept BY WHO CAN ANSWER: catch the
// assistant principal in a corridor and all four of your questions for her are
// on one screen.
//
// AND WHAT YOU WERE TOLD STAYS. A term of these is the local knowledge nobody
// wrote down for you. It is what you will want again next September, and what
// the next new teacher will ask you for.
//
// §0.2: nothing here knows what a school is. It is questions, people, and
// answers.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let asks = [];
  let contacts = [];
  let find = "";

  const $ = (s) => document.querySelector(s);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const todayISO = () => OrganiserDates.today();
  const esc = (t) =>
    String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Asked of one place — see OrganiserNames.saidAs. Two people called Nick is
  // exactly the situation this page puts you in.
  const personWords = (id) => OrganiserNames.saidAs(contacts, id);
  const day = (iso) => (iso ? OrganiserDates.dayWords(iso, { relative: false }) : "");

  function persist() {
    OrganiserStore.save({ asks });
  }
  function setStatus(msg) {
    const el = $("#akStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    clearTimeout(setStatus._t);
    if (msg) setStatus._t = setTimeout(() => { el.hidden = true; el.textContent = ""; }, 5000);
  }

  function normalise(list) {
    return (Array.isArray(list) ? list : [])
      .filter(Boolean)
      .map((a) => ({
        id: a.id ? String(a.id) : uid(),
        question: (a.question ? String(a.question) : "").trim(),
        // Who might know. Blank is fine and common — half of them start as
        // "somebody must know this".
        whoId: (a.whoId ? String(a.whoId) : "").trim(),
        asked: /^\d{4}-\d{2}-\d{2}$/.test(a.asked || "") ? a.asked : "",
        answer: (a.answer ? String(a.answer) : "").trim(),
        answeredAt: /^\d{4}-\d{2}-\d{2}$/.test(a.answeredAt || "") ? a.answeredAt : "",
        createdAt: a.createdAt || nowISO(),
      }))
      .filter((a) => a.question);
  }

  // THE THREE STATES, and they are genuinely different things to look at.
  const open = () => asks.filter((a) => !a.asked && !a.answer);
  const sent = () => asks.filter((a) => a.asked && !a.answer);
  const known = () => asks.filter((a) => a.answer);

  // ---- the box at the top ---------------------------------------------------
  function renderWho() {
    const sel = $("#akWho");
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML =
      `<option value="">— not sure who —</option>` +
      contacts
        .filter((c) => c && c.id && c.name)
        .slice()
        // IN THE ORDER YOU READ A REGISTER, like every other list of people here.
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((c) => `<option value="${esc(c.id)}">${esc(personWords(c.id))}</option>`)
        .join("");
    sel.value = keep;
  }

  function add(e) {
    e.preventDefault();
    const q = ($("#akQ").value || "").trim();
    // NOT A SILENT NOTHING. Pressing a button that does nothing is the fault
    // this app has had to fix on three separate pages already.
    if (!q) return setStatus("Type the question first — even half of one is enough to keep.");
    const whoId = ($("#akWho").value || "").trim();
    asks.unshift({ id: uid(), question: q, whoId, asked: "", answer: "", answeredAt: "",
      createdAt: nowISO() });
    persist();
    $("#akQ").value = "";
    $("#akQ").focus();
    render();
    setStatus(whoId ? `Kept, for ${personWords(whoId)}. ✓` : "Kept. Say who might know whenever you find out. ✓");
  }

  // ---- still to ask, grouped by who ----------------------------------------
  function renderOpen() {
    const el = $("#akOpen");
    const words = $("#akOpenWords");
    if (!el) return;
    const list = open();
    if (!list.length) {
      el.innerHTML = `<p class="empty">Nothing waiting to be asked. Add one above the moment it occurs to you — that is the only time you reliably remember it.</p>`;
      if (words) words.textContent = "";
      return;
    }
    // GROUPED BY WHO, because that is the whole reason this page is not a task
    // list. You do not get to choose when you bump into somebody; you get to
    // choose whether all your questions for them are on one screen when you do.
    const by = new Map();
    list.forEach((a) => {
      const k = a.whoId || "";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(a);
    });
    // Whoever you have most stacked up for goes first — that is the conversation
    // most worth catching.
    const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
    if (words)
      words.textContent =
        `${list.length} ${list.length === 1 ? "question" : "questions"}, for ` +
        `${by.size} ${by.size === 1 ? "person" : "people"}.`;
    el.innerHTML = groups
      .map(
        ([whoId, qs]) =>
          `<div class="ak-group"><h3 class="ak-who">${
            whoId ? esc(personWords(whoId)) : "Nobody named yet"
          }${qs.length > 1 ? ` <span class="muted">— ${qs.length} things</span>` : ""}</h3>` +
          qs
            .map(
              (a) =>
                `<div class="ak-row" data-id="${esc(a.id)}">` +
                `<div class="ak-q">${esc(a.question)}</div>` +
                `<div class="ak-acts">` +
                `<button type="button" class="link ak-asked">asked them</button>` +
                `<button type="button" class="link ak-answer">they said…</button>` +
                `<button type="button" class="x-del ak-del" title="Remove">×</button>` +
                `</div></div>`
            )
            .join("") +
          `</div>`
      )
      .join("");
  }

  function renderSent() {
    const el = $("#akSent");
    const block = $("#akSentBlock");
    if (!el || !block) return;
    const list = sent();
    block.hidden = !list.length;
    el.innerHTML = list
      .map(
        (a) =>
          `<div class="ak-row" data-id="${esc(a.id)}">` +
          `<div class="ak-q">${esc(a.question)}` +
          `<div class="muted">${a.whoId ? esc(personWords(a.whoId)) + " · " : ""}asked ${esc(day(a.asked))}</div></div>` +
          `<div class="ak-acts">` +
          `<button type="button" class="link ak-answer">they said…</button>` +
          `<button type="button" class="link ak-unask">not asked after all</button>` +
          `</div></div>`
      )
      .join("");
  }

  function renderKnown() {
    const el = $("#akKnown");
    const block = $("#akKnownBlock");
    if (!el || !block) return;
    const all = known();
    block.hidden = !all.length;
    const q = find.trim().toLowerCase();
    const list = q
      ? all.filter((a) => (a.question + " " + a.answer).toLowerCase().includes(q))
      : all;
    if (!list.length) {
      el.innerHTML = `<p class="empty">Nothing here matches that.</p>`;
      return;
    }
    el.innerHTML = list
      .sort((a, b) => String(b.answeredAt || "").localeCompare(String(a.answeredAt || "")))
      .map(
        (a) =>
          `<div class="ak-known" data-id="${esc(a.id)}">` +
          `<div class="ak-q">${esc(a.question)}</div>` +
          `<div class="ak-a">${esc(a.answer)}</div>` +
          `<div class="muted">${a.whoId ? esc(personWords(a.whoId)) + " · " : ""}${esc(day(a.answeredAt))}` +
          ` <button type="button" class="link ak-reopen">still not sure</button></div>` +
          `</div>`
      )
      .join("");
  }

  function byId(id) {
    return asks.find((a) => a.id === id) || null;
  }

  // Writing the answer opens a box in place rather than a prompt — you are
  // usually copying down something somebody just said, and it is often two
  // sentences rather than two words.
  function answerBox(row, a) {
    if (row.querySelector(".ak-answerbox")) return;
    const wrap = document.createElement("div");
    wrap.className = "ak-answerbox";
    const box = document.createElement("textarea");
    box.rows = 2;
    box.value = a.answer || "";
    box.setAttribute("aria-label", `What you were told about: ${a.question}`);
    box.placeholder = "what they actually said";
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "btn";
    keep.textContent = "Keep it";
    keep.addEventListener("click", () => {
      const v = box.value.trim();
      if (!v) return setStatus("Nothing typed — the question stays where it was.");
      a.answer = v;
      a.answeredAt = todayISO();
      if (!a.asked) a.asked = todayISO();
      persist();
      render();
      setStatus("Kept. It'll be in “What you were told” from now on. ✓");
    });
    wrap.appendChild(box);
    wrap.appendChild(keep);
    row.appendChild(wrap);
    box.focus();
  }

  function wire() {
    $("#akForm").addEventListener("submit", add);
    const finder = $("#akFind");
    if (finder)
      finder.addEventListener("input", (e) => {
        find = e.target.value || "";
        renderKnown();
      });
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const row = t.closest("[data-id]");
      if (!row) return;
      const a = byId(row.getAttribute("data-id"));
      if (!a) return;
      if (t.classList.contains("ak-asked")) {
        a.asked = todayISO();
        persist();
        render();
        setStatus(`Marked as asked${a.whoId ? " of " + personWords(a.whoId) : ""}. ✓`);
      } else if (t.classList.contains("ak-unask")) {
        a.asked = "";
        persist();
        render();
      } else if (t.classList.contains("ak-answer")) {
        answerBox(row, a);
      } else if (t.classList.contains("ak-reopen")) {
        // NOT DELETED. An answer you have stopped trusting is still what you
        // were told, and throwing it away loses the fact that you asked.
        a.answer = "";
        a.answeredAt = "";
        persist();
        render();
        setStatus("Back on the list to ask again. ✓");
      } else if (t.classList.contains("ak-del")) {
        if (!confirm(`Remove “${a.question}”?`)) return;
        asks = asks.filter((x) => x.id !== a.id);
        persist();
        render();
      }
    });
  }

  function render() {
    renderWho();
    renderOpen();
    renderSent();
    renderKnown();
  }

  async function init() {
    const data = await OrganiserStore.load();
    asks = normalise(data.asks);
    contacts = data.contacts || [];
    OrganiserStore.onExternalChange((state) => {
      asks = normalise(state.asks);
      contacts = state.contacts || contacts;
      render();
    });
    wire();
    render();
  }

  init();
})();
