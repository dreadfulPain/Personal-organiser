// THE WAY IN.
//
// There wasn't one. Somebody opening this app for the first time got a box
// saying "what's on your mind?" and sixteen tabs, and nothing anywhere said
// where to start. The single most important thing the app can know about a
// teacher — the timetable that governs their whole week — lived behind a
// collapsed "set up my week" at the bottom of the Day page. It was findable by
// reading the source and by very little else.
//
// This page does none of the work. Every job still happens where it happened
// before, because two places to paste a timetable is two places to fix when it
// goes wrong. What this does is SAY THE JOBS OUT LOUD, in order, and show which
// of them are done — and each link lands on the panel already open, so
// "set up my timetable" doesn't turn into a second search.
//
// Describes, never nags. A step not done is a step not done; the app works
// without any of them and says so.

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (t) =>
    String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // The list itself lives in steps.js, so the home page's sentence and this
  // page's sentence are the same fact — see the note at the top of that file.
  const STEPS = window.OrganiserSteps.list;

  function render(data) {
    const wrap = $("#suSteps");
    if (!wrap) return;
    wrap.innerHTML = "";
    STEPS.forEach((step, i) => {
      const n = step.done(data) || 0;
      const sec = document.createElement("section");
      sec.className = "su-step" + (n ? " done" : "");
      sec.innerHTML = `
        <h2 class="su-step-h">
          <span class="su-step-n">${n ? "✓" : i + 1}</span>
          ${esc(step.title)}${step.optional ? ' <span class="su-step-opt">if you want it</span>' : ""}
        </h2>
        <p class="su-step-why">${esc(step.why)}</p>
        <p class="su-step-how muted">${esc(step.how)}</p>
        <p class="su-step-state">${n ? esc(step.doneWords(n)) : "Not done yet — the app works without it."}</p>
        <a class="btn su-step-go" href="${esc(step.go)}">${esc(n ? "Change it" : step.goWords)}</a>`;
      wrap.appendChild(sec);
    });
  }

  async function init() {
    const data = await OrganiserStore.load();
    render(data);
    const where = $("#suWhere");
    if (where) {
      where.textContent =
        data.mode === "preview"
          ? "Opened straight from the folder, so changes are kept in this browser only — not in your data file. Start the app with the Start Organiser shortcut to save properly."
          : "Saved automatically to a file you own, every time anything changes.";
    }
  }

  init();
})();
