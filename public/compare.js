// THE COMPARISON HARNESS — how the threshold gets decided instead of guessed.
//
// Without this you cannot tell whether splitting the work actually helped. The
// single call might already be fine for short pastes, in which case the right
// answer is to keep it for those and only pay for the pipeline on long ones.
// That's a measurement, not an opinion, and this is the instrument.
//
// It shows the fragments too, because that's the honest reference: every
// fragment is a real piece of your text, so anything meaningful that appears
// there and in neither result is a miss you can point at.

(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function setStatus(msg) {
    const el = $("#cmpStatus");
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  let vocab = { config: {} };

  function describe(e) {
    if (!e || !e.kind) return "(unreadable)";
    if (e.kind === "task") return `<b>task</b> ${escapeHtml(e.item ? e.item.title : "")}${e.item && e.item.date ? ` <span class="muted">${escapeHtml(e.item.date)}</span>` : ""}${e.item && e.item.promisedTo ? ` <span class="muted">→ ${escapeHtml(e.item.promisedTo)}</span>` : ""}`;
    if (e.kind === "record") return `<b>record</b> ${escapeHtml((e.record && e.record.who) || "(no id)")} — ${escapeHtml(e.record ? e.record.summary : "")}`;
    if (e.kind === "goal") return `<b>goal</b> ${escapeHtml(e.goal ? e.goal.title : "")}`;
    if (e.kind === "handover") return `<b>handover</b> ${escapeHtml(e.handover ? e.handover.person : "")} (${escapeHtml(e.handover ? e.handover.dir : "")}) — ${escapeHtml(e.handover ? e.handover.note : "")}`;
    return escapeHtml(e.kind);
  }

  function column(title, side, extra) {
    const items = (side.entries || []).map((e) => `<li>${describe(e)}</li>`).join("");
    return `
      <div class="cmp-col">
        <h3>${escapeHtml(title)}</h3>
        <p class="cmp-stat">${(side.entries || []).length} item${(side.entries || []).length === 1 ? "" : "s"}
          · ${Math.round((side.ms || 0) / 100) / 10}s${side.calls !== undefined ? ` · ${side.calls} call${side.calls === 1 ? "" : "s"}` : ""}</p>
        ${side.error ? `<p class="cmp-err">failed: ${escapeHtml(side.error)}</p>` : ""}
        ${items ? `<ul class="cmp-list">${items}</ul>` : `<p class="muted">nothing</p>`}
        ${extra || ""}
      </div>`;
  }

  async function run() {
    const text = $("#cmpText").value.trim();
    if (!text) return;
    const btn = $("#cmpRun");
    btn.disabled = true;
    setStatus("Running both — the pipeline side takes a while by design…");
    $("#cmpOut").innerHTML = "";
    try {
      const r = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today: new Date().toISOString().slice(0, 10), config: vocab.config || {}, goals: vocab.goals || [] }),
      });
      const d = await r.json();
      if (!r.ok) {
        setStatus(d.message || "Couldn't run that.");
        return;
      }
      setStatus("");
      $("#cmpMeta").textContent = `${d.chars} characters · threshold is ${d.threshold} · this one would ${d.wouldUsePipeline ? "use the pipeline" : "use the single call"}`;

      const cov = d.pipeline && d.pipeline.coverage;
      const covHtml = cov
        ? !cov.checked
          ? `<p class="cmp-cover">coverage check didn't run</p>`
          : cov.missed.length
            ? `<p class="cmp-cover">flagged as not picked up:</p><ul class="cmp-list">${cov.missed.map((m) => `<li>“${escapeHtml(m.quote)}”</li>`).join("")}</ul>`
            : `<p class="cmp-cover">coverage check found nothing missing</p>`
        : "";
      const parked = (d.pipeline && d.pipeline.parked) || [];
      const parkedHtml = parked.length
        ? `<p class="cmp-cover">parked to sort by hand (${parked.length}):</p><ul class="cmp-list">${parked.map((p) => `<li>${escapeHtml(p.text.slice(0, 100))}</li>`).join("")}</ul>`
        : "";

      $("#cmpOut").innerHTML =
        `<div class="cmp-grid">${column("One call", d.single)}${column("The pipeline", d.pipeline, covHtml + parkedHtml)}</div>` +
        `<h3>What step 0 split it into (${d.fragments.length})</h3>` +
        `<p class="muted">Plain code, no model. Anything real in this list that neither side found is a genuine miss.</p>` +
        `<ol class="cmp-frags">${d.fragments.map((f) => `<li>${f.speaker ? `<b>${escapeHtml(f.speaker)}</b> ` : ""}${escapeHtml(f.text)}</li>`).join("")}</ol>`;
    } catch (e) {
      setStatus("Couldn't reach the app: " + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  // A fixture is just a file in your data folder. Keeping the awkward ones is
  // how this stops being guesswork over time.
  async function saveFixture() {
    const text = $("#cmpText").value.trim();
    if (!text) return;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours())}${String(d.getMinutes()).padStart(2, "0")}`;
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `fixtures/paste-${stamp}.txt`, content: text }),
      });
      const j = await r.json().catch(() => ({}));
      $("#cmpSaved").textContent = r.ok ? `Saved to data/${j.path} ✓` : j.message || "Couldn't save that.";
    } catch {
      $("#cmpSaved").textContent = "Couldn't save that.";
    }
  }

  async function init() {
    try {
      const data = await OrganiserStore.load();
      vocab = { config: data.recordConfig || {}, goals: (data.goals || []).map((g) => ({ id: g.id, title: g.title })) };
    } catch {
      /* the harness still works without vocabulary */
    }
    $("#cmpRun").addEventListener("click", run);
    $("#cmpSave").addEventListener("click", saveFixture);
  }

  init();
})();
