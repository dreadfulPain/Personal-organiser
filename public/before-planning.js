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
      contacts, records, recordConfig, pastoralNotes, pastoralTopics, group, today: todayISO(),
    });

    const empty = $("#bpEmpty");
    const nothing = !group || pic.empty;
    if (empty) {
      empty.hidden = !nothing;
      empty.textContent = !group
        ? "Pick a group above."
        : "Nothing recorded for this group yet — no levels and no answers. This page fills itself in as you use the rest of the app.";
    }
    ["#bpTallyBlock", "#bpSkillBlock", "#bpNoteBlock"].forEach((sel) => {
      const el = $(sel);
      if (el) el.hidden = nothing;
    });
    if (nothing) return;

    // ---- how the group splits ------------------------------------------
    const t = $("#bpTallies");
    if (t) {
      t.innerHTML = pic.tallies.length
        ? pic.tallies
            .map((x) => {
              const rows = x.ranked
                .filter(([, n]) => n > 0)
                .map(([opt, n]) => {
                  const pct = x.answered ? Math.round((n / x.answered) * 100) : 0;
                  return (
                    `<div class="bp-row"><span class="bp-opt">${esc(opt)}</span>` +
                    `<span class="bp-bar"><i style="width:${pct}%"></i></span>` +
                    `<span class="bp-n">${esc(P.shareWords(x, opt))}</span></div>`
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
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash && groups().includes(hash)) group = hash;
    renderPicker();
    render();
  }

  init();
})();
