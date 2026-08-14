// ONE PERSON, ON ONE SCREEN.
//
// The use this is built for is precise: someone is on the phone asking about
// their child, and you have a couple of seconds to find the answer without
// sounding like you're rummaging. That rules out most of how an app would
// normally lay this out.
//
// So the order is the order the questions actually come in:
//   1. The two or three facts that answer the first question. Not a chart — a
//      chart of one fact is a worse way of showing it than the fact.
//   2. How it's gone over time, as a picture, because "has he improved" is a
//      shape question and a shape answers it faster than a column of numbers.
//   3. What you know besides the marks — and, honestly, how old each bit is.
//   4. What you've already told people, so you don't contradict yourself.
//
// Everything on this page stays on this page. Nothing here builds a document.
//
// Plain script (works under file://), like everything else here.

(() => {
  "use strict";

  let contacts = [], records = [], recordConfig = null;
  let pastoralNotes = [], pastoralTopics = [], toldLog = [];
  let who = "";

  const $ = (s) => document.querySelector(s);
  const L = () => window.OrganiserLevels;
  const C = () => window.OrganiserChart;
  const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nameOf = (id) => {
    const c = contacts.find((x) => x && x.id === id);
    return (c && c.name) || id;
  };
  const ago = (iso) => {
    if (!iso) return "";
    const d = Math.round((new Date(todayISO() + "T12:00:00") - new Date(iso + "T12:00:00")) / 86400000);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.round(d / 7)} weeks ago`;
    return `${Math.round(d / 30)} months ago`;
  };

  function skills() {
    const cfg = L() ? L().normalise(recordConfig) : null;
    return (cfg && cfg.topics) || [];
  }

  // ---- 1. the facts, before any picture --------------------------------
  function renderTiles() {
    const el = $("#pTiles");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const lv = L();
    const ss = skills();
    // No skills set up at all is NOT a score of zero. "0 of 0" reads like a
    // result; it's an empty shelf, and the difference matters when someone is
    // on the phone.
    if (!ss.length) {
      el.innerHTML = `<p class="muted">No skills set up yet — nothing to show against them. Set them up on the Students page and this fills in.</p>`;
      return;
    }
    const current = ss
      .map((s) => ({ skill: s, rec: lv.currentFor(records, who, s) }))
      .filter((x) => x.rec);
    const target = lv.targetLevel(recordConfig);
    const atOrAbove = current.filter((x) => !lv.isStronger(recordConfig, target, x.rec.level)).length;
    const newest = current
      .map((x) => x.rec.date)
      .filter(Boolean)
      .sort()
      .pop();
    const told = window.OrganiserTold ? window.OrganiserTold.summary(toldLog, who) : { count: 0, last: "" };

    el.innerHTML =
      C().tile("skills with a level", `${current.length}`, ss.length ? `of ${ss.length}` : "") +
      C().tile(`at or above ${lv.levelName(recordConfig, target) || "target"}`, `${atOrAbove}`,
        current.length ? `of ${current.length} recorded` : "nothing recorded yet") +
      C().tile("last piece of evidence", newest ? ago(newest) : "none yet", newest || "") +
      C().tile("times you've told someone", `${told.count}`, told.last ? `last ${ago(told.last)}` : "");
  }

  // ---- 2. how it's gone -------------------------------------------------
  function renderChart() {
    const el = $("#pChart");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const lv = L();
    const asc = lv.ascending(recordConfig); // weakest → strongest
    const yTicks = asc.map((name, i) => ({ v: i + 1, label: name }));
    const series = skills()
      .map((s) => {
        const hist = lv.historyFor(records, who, s).slice().reverse(); // oldest first
        return {
          name: s,
          points: hist
            .map((r) => ({ x: r.date || "", y: asc.indexOf(r.level) + 1, label: r.level }))
            .filter((p) => p.x && p.y > 0),
        };
      })
      .filter((s) => s.points.length);

    if (!series.length) {
      el.innerHTML = `<p class="muted">No levels recorded yet. They'll draw themselves as you add them.</p>`;
      return;
    }
    el.innerHTML = C().overTime(series, {
      yMin: 1, yMax: Math.max(2, asc.length), yTicks,
      alt: `How ${nameOf(who)} has gone, by skill, over time`,
      valueLabel: "skill",
    });
  }

  // ---- 3. besides the marks --------------------------------------------
  function renderPastoral() {
    const el = $("#pPastoral");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const P = window.OrganiserPastoral;
    if (!P) { el.innerHTML = ""; return; }
    const rows = P.freshness(pastoralNotes, pastoralTopics, who, todayISO());
    if (!rows.length) {
      el.innerHTML = `<p class="muted">No topics set up yet. Add the handful of things you'd want to be able to answer — and how long each stays true for.</p>`;
      return;
    }
    // Up-front topics first, then the rest — that's what "front and centre"
    // means when the phone is already ringing.
    const sorted = rows.slice().sort((a, b) => (b.topic.upFront ? 1 : 0) - (a.topic.upFront ? 1 : 0));
    el.innerHTML = sorted
      .map((f) => {
        const note = f.latest ? esc(f.latest.said) : "";
        const when =
          f.state === "never asked"
            ? `<span class="p-state">never asked</span>`
            : f.state === "worth checking again"
              ? `<span class="p-state">from ${esc(ago(f.latest.date))} — worth checking again</span>`
              : `<span class="p-state">${esc(ago(f.latest.date))}</span>`;
        return (
          `<div class="p-topic${f.topic.upFront ? " up" : ""}">` +
          `<div class="p-thead"><strong>${esc(f.topic.label)}</strong>${when}</div>` +
          (note ? `<p class="p-said">${note}</p>` : `<p class="muted p-said">Nothing written down.</p>`) +
          `</div>`
        );
      })
      .join("");
  }

  // ---- 4. what you've already said -------------------------------------
  function renderTold() {
    const el = $("#pTold");
    if (!el) return;
    if (!who) { el.innerHTML = ""; return; }
    const T = window.OrganiserTold;
    if (!T) { el.innerHTML = ""; return; }
    const list = T.forPerson(toldLog, who);
    if (!list.length) {
      el.innerHTML = `<p class="muted">Nothing logged yet. Worth a line after a conversation — it's the thing you can't reconstruct later.</p>`;
      return;
    }
    el.innerHTML =
      `<p class="muted">On this screen only — this is never exported, printed or included in any report.</p>` +
      list
        .map(
          (e) =>
            `<div class="p-told"><div class="p-thead"><strong>${esc(e.to || "someone")}</strong>` +
            `<span class="p-state">${esc(ago(e.date))}${e.how ? ` · ${esc(e.how)}` : ""}</span></div>` +
            `<p class="p-said">${esc(e.said)}</p></div>`
        )
        .join("");
  }

  function renderAll() {
    const t = $("#pTitle");
    if (t) t.textContent = who ? nameOf(who) : "One person";
    renderTiles();
    renderChart();
    renderPastoral();
    renderTold();
  }

  function renderPicker() {
    const sel = $("#pWho");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">choose…</option>` +
      contacts
        .filter((c) => c && c.id)
        .map((c) => `<option value="${esc(c.id)}"${c.id === who ? " selected" : ""}>${esc(c.name || c.id)}</option>`)
        .join("");
    sel.addEventListener("change", () => {
      who = sel.value;
      renderAll();
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    records = Array.isArray(data.records) ? data.records : [];
    recordConfig = data.recordConfig || null;
    pastoralNotes = Array.isArray(data.pastoralNotes) ? data.pastoralNotes : [];
    pastoralTopics = Array.isArray(data.pastoralTopics) ? data.pastoralTopics : [];
    toldLog = Array.isArray(data.toldLog) ? data.toldLog : [];
    // Deep-link straight to someone: person.html#id — so a shortcut can open on
    // the right person rather than on a chooser.
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash && contacts.some((c) => c && c.id === hash)) who = hash;
    renderPicker();
    renderAll();
  }

  init();
})();
