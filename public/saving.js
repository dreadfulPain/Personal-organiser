// SAYING SO WHEN A SAVE DIDN'T WORK — on every page, not just the first one.
//
// Fifteen of the sixteen pages that write anything down had no way of telling
// you a save had failed. You would take a register, or write up a lesson, and
// the page would look exactly as it looks when it worked: nothing missing, no
// warning, no mark anywhere. The store knew. It emitted a status and, on every
// page but the home one, nothing was listening.
//
// This is deliberately quiet. A green "Saved ✓" on all seventeen pages is noise
// that gets ignored within a week, and a notice that is ignored is the same as
// no notice at all. So it says nothing while things are working, and speaks
// only when something has actually gone wrong — then stays up until a save
// gets through, because a failure that scrolls away hasn't been seen.
//
// ONE OWNER, EVERY PAGE. The home page keeps its own quiet "Saving… / Saved ✓"
// line, because that is worth seeing where you type things in. But a save that
// FAILED is said here and only here — two places writing the same sentence is
// how they drift into saying different things about the same problem.
//
// Written as a plain script (no modules) so it also works under file://.

(function () {
  "use strict";

  if (!window.OrganiserStore) return;

  let box = null;

  function show(text) {
    if (!box) {
      box = document.createElement("div");
      box.id = "savingTrouble";
      box.className = "saving-trouble";
      box.setAttribute("role", "status");
      const first = document.querySelector("main") || document.body;
      if (first.firstChild) first.insertBefore(box, first.firstChild);
      else first.appendChild(box);
    }
    box.textContent = text;
    box.hidden = false;
  }

  function clear() {
    if (!box) return;
    box.hidden = true;
    // EMPTIED, not merely hidden. This is a role="status" region, so a sentence
    // left sitting in it can still be read out — and being told about a save
    // that failed twenty minutes ago and has since worked is worse than not
    // being told at all.
    box.textContent = "";
  }

  OrganiserStore.onStatus(function (s) {
    if (!s || s.mode === "preview") return;
    if (s.state === "error") {
      // Whatever the server said, first — it is the only thing that can tell
      // you which problem this is.
      show(s.note || "Couldn't save. It tried several times and stopped — check the app window is still open, then change something to try again.");
    } else if (s.state === "conflict") {
      show(s.note || "This changed on another device — the latest has been pulled in.");
    } else if (s.state === "saved") {
      clear();
    }
  });
})();
