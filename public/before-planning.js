// BEFORE YOU PLAN — one group, everything you already know about it.
//
// The reading order is deliberate and it isn't the obvious one. The group-wide
// split comes FIRST, because that's the decision you make first: what shape is
// this lesson. Then the individuals, because that's what you hang on the shape
// once you have it. Doing it the other way round means reading twenty-four
// names before you know what you're looking for.
//
// Nothing here leaves the screen.

(() => {
  "use strict";

  let contacts = [], records = [], recordConfig = null;
  let pastoralNotes = [], pastoralTopics = [];
  let targeted = null; // who's already had something planned with them in mind
  let group = "";

  const $ = (s) => document.querySelector(s);
  const CP = () => window.OrganiserClassPlan;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  function groups() {
    return [...new Set(contacts.map((c) => (c && c.group) || "").filter(Boolean))].sort();
  }

  function render() {
    const P = CP();
    if (!P) return;
    const pic = P.picture({
      contacts, records, recordConfig, pastoralNotes, pastoralTopics, group,
      targeted: targeted && targeted[group], today: todayISO(),
    });

    const empty = $("#bpEmpty");
    const nothing = !group || pic.empty;
    if (empty) {
      empty.hidden = !nothing;
      empty.textContent = !group
        ? "Pick a group above."
        : "Nothing recorded for this group yet — no levels and no answers. This page fills itself in as you use the rest of the app.";
    }
    ["#bpTallyBlock", "#bpCoverBlock", "#bpAskBlock", "#bpSkillBlock", "#bpNoteBlock"].forEach((sel) => {
      const el = $(sel);
      if (el) el.hidden = nothing;
    });
    if (nothing) return;

    // ---- how the group splits ------------------------------------------
    const t = $("#bpTallies");
    if (t) {
      // Every answer with its names, including the groups of one. The counts
      // pull towards the majority; the names are what stop someone being a
      // rounding error for a whole term.
      const named = new Map(pic.answers.map((a) => [a.topic.id, a]));
      t.innerHTML = pic.tallies.length
        ? pic.tallies
            .map((x) => {
              const rows = x.ranked
                .filter(([, n]) => n > 0)
                .map(([opt, n]) => {
                  const pct = x.answered ? Math.round((n / x.answered) * 100) : 0;
                  const g = named.get(x.topic.id);
                  const who = g && g.groups.find(([o]) => o === opt);
                  const names = who ? who[1].map((p) => p.name).join(", ") : "";
                  return (
                    `<div class="bp-row"><span class="bp-opt">${esc(opt)}</span>` +
                    `<span class="bp-bar"><i style="width:${pct}%"></i></span>` +
                    `<span class="bp-n">${esc(P.shareWords(x, opt))}</span></div>` +
                    (names ? `<p class="bp-who">${esc(names)}</p>` : "")
                  );
                })
                .join("");
              // How many it's based on, always — a split off four answers out of
              // twenty-four is a different thing from one off twenty-two.
              const based =
                x.answered < 3
                  ? `only ${x.answered} answered, so no percentages — too few to mean anything yet`
                  : `${x.answered} of ${x.asked} answered`;
              return `<div class="bp-tally"><h3>${esc(x.topic.label)}</h3>` +
                `<p class="muted">${esc(based)}</p>${rows}</div>`;
            })
            .join("")
        : `<p class="muted">Nothing countable yet. A topic with a few set answers — rather than a sentence — is what makes this part possible.</p>`;
    }

    // ---- nobody falls through -------------------------------------------
    //
    // The counts above are honest and they pull one way: towards the biggest
    // group, every time. This is the counterweight — who has actually had
    // something planned with them in mind, longest wait first. Ticking someone
    // isn't a chore to keep on top of; it's the only way the app can tell a
    // deliberate choice to serve the majority from twelve weeks of drift.
    const cw = $("#bpCoverWords");
    if (cw) cw.textContent = P.coverageWords(pic.coverage);
    const cov = $("#bpCover");
    if (cov) {
      cov.innerHTML = "";
      pic.coverage.waiting.forEach((x) => {
        const row = document.createElement("div");
        row.className = "bp-cover" + (x.last ? "" : " never");
        row.innerHTML =
          `<span class="bp-cname">${esc(x.name)}</span>` +
          `<span class="bp-cwhen">${x.last ? esc(agoWords(x.waited)) : "nothing yet"}</span>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "link";
        btn.textContent = "planned for them";
        btn.addEventListener("click", () => markTargeted(x.id));
        row.appendChild(btn);
        cov.appendChild(row);
      });
    }

    // ---- what's gone stale ----------------------------------------------
    //
    // Told once, in the place where you can act on it: standing in front of the
    // class. Each person's single most-worth-asking heading, never the whole
    // grid — the point is one question you might actually ask today, not an
    // inventory of everything you don't know.
    const aw = $("#bpAskWords");
    if (aw) aw.textContent = P.toAskWords(pic.ask, pic.members.length);
    const ask = $("#bpAsk");
    if (ask) {
      ask.innerHTML = pic.ask.rows.length
        ? pic.ask.rows
            .map(
              (r) =>
                `<div class="bp-ask"><span class="bp-cname">${esc(r.name)}</span>` +
                `<span class="bp-atopic">${esc(r.topic)}</span>` +
                `<span class="bp-cwhen">${esc(r.why)}${r.essential ? " · must have" : ""}</span></div>`
            )
            .join("") +
          (pic.ask.more
            ? `<p class="muted">and ${pic.ask.more} more — these are the ones that have waited longest.</p>`
            : "")
        : "";
    }

    // ---- where people are ----------------------------------------------
    const s = $("#bpSkills");
    if (s) {
      const total = pic.members.length;
      s.innerHTML = pic.skills.length
        ? pic.skills
            .map((sk) => {
              const names = (list, cls) =>
                list.length
                  ? `<p class="bp-names ${cls}">${list.map((r) => esc(r.name)).join(", ")}</p>`
                  : "";
              return (
                `<div class="bp-skill"><h3>${esc(sk.skill)}</h3>` +
                `<p class="muted">${esc(P.skillWords(sk, total))}</p>` +
                names(sk.below, "below") +
                names(sk.unknown, "unknown") +
                `</div>`
              );
            })
            .join("")
        : `<p class="muted">No skills set up yet.</p>`;
    }

    // ---- worth remembering ----------------------------------------------
    const n = $("#bpNotes");
    if (n) {
      n.innerHTML = pic.notes.length
        ? pic.notes
            .map(
              (x) =>
                `<div class="bp-note"><strong>${esc(x.name)}</strong> ` +
                `<span class="p-state">${esc(x.topic)}</span><p class="p-said">${esc(x.said)}</p></div>`
            )
            .join("")
        : `<p class="muted">Nothing written recently. Anything past its shelf life is deliberately left out — planning around an out-of-date note is worse than planning around none.</p>`;
    }
  }

  function agoWords(days) {
    if (!Number.isFinite(days)) return "nothing yet";
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    return `${Math.round(days / 7)} weeks ago`;
  }

  // You planned something with this person in mind. One tap, and it's the only
  // thing that keeps the "nobody falls through" half honest.
  function markTargeted(id) {
    const R = window.OrganiserRota;
    if (!R || !group) return;
    targeted = targeted || {};
    const cur = targeted[group] || { id: "targeted:" + group, memberIds: [], lastDone: {} };
    const members = CP().membersOf(contacts, group).map((m) => m.id);
    const next = R.mark({ ...cur, memberIds: members }, id, todayISO());
    targeted[group] = { id: cur.id, everyDays: cur.everyDays || 21,
      lastDone: (window.OrganiserRota.normalise(next) || {}).lastDone || {} };
    OrganiserStore.save({ targeted });
    render();
  }

  function renderPicker() {
    const sel = $("#bpGroup");
    if (!sel) return;
    const gs = groups();
    sel.innerHTML =
      `<option value="">choose…</option>` +
      gs.map((g) => `<option value="${esc(g)}"${g === group ? " selected" : ""}>${esc(g)}</option>`).join("");
    sel.addEventListener("change", () => {
      group = sel.value;
      render();
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    contacts = Array.isArray(data.contacts) ? data.contacts : [];
    records = Array.isArray(data.records) ? data.records : [];
    recordConfig = data.recordConfig || null;
    pastoralNotes = Array.isArray(data.pastoralNotes) ? data.pastoralNotes : [];
    pastoralTopics = Array.isArray(data.pastoralTopics) ? data.pastoralTopics : [];
    targeted = data.targeted || {};
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash && groups().includes(hash)) group = hash;
    renderPicker();
    render();
  }

  init();
})();
