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

  // Each step: what it is, why it is worth doing, where it happens, and how to
  // tell whether it has been. The "done" test reads real data — never a flag
  // saying it was done, which can be true of an empty result.
  const STEPS = [
    {
      title: "Your timetable",
      why:
        "Your lessons, form time, duties and meetings. Everything else works around " +
        "these: the day plans into the gaps between them, the week stops calling a " +
        "teaching day free, and nothing gets booked over a lesson.",
      how: "Paste it from a spreadsheet, open the PDF, or import a calendar file.",
      go: "timeline.html#setup",
      goWords: "Set up my timetable",
      done: (d) => (d.schedule || []).filter((b) => b && !b.blocksDay && !b.noLessons).length,
      doneWords: (n) => `${n} block${n === 1 ? "" : "s"} in.`,
    },
    {
      title: "Your term dates",
      why:
        "When term starts and ends, INSET days, holidays. Without them a timetable " +
        "repeats every week for ever, so the summer shows as fully booked and the " +
        "month view says you have no free time when you have six weeks of it.",
      how: "Paste or open the calendar the school sent you.",
      go: "timeline.html#calendar",
      goWords: "Read in the school calendar",
      done: (d) =>
        (d.schedule || []).filter((b) => b && (b.noLessons || b.blocksDay || b.from || b.to)).length,
      doneWords: (n) => `${n} date${n === 1 ? "" : "s"} the timetable knows about.`,
    },
    {
      title: "Your classes",
      why:
        "Who is in each group. The register works from this, and so does anything " +
        "that says a name rather than a code.",
      how: "Copy the names out of your register and paste the lot in — one per line, " +
        "or two columns for name and class.",
      go: "people.html#class",
      goWords: "Paste a class in",
      done: (d) => (d.contacts || []).length,
      doneWords: (n) => `${n} ${n === 1 ? "person" : "people"} on your list.`,
    },
    {
      title: "The parts of your life",
      why:
        "Work, home, whatever else you keep separate. Only useful if you want the app " +
        "to keep them apart — plenty of people never need this one.",
      how: "Name them however you name them.",
      go: "index.html",
      goWords: "Home",
      optional: true,
      done: (d) => (d.areas || []).length,
      doneWords: (n) => `${n} named.`,
    },
  ];

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
