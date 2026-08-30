// The tab bar — one room per question, so each page can stay focused (and the
// home stays the surfacing hub). Injected by script so every page shares one
// list. Plain script; works under file:// too.
//
// SIXTEEN LINKS IN A ROW IS NOT A MENU, IT IS A WALL. Somebody new read the
// first row as "Home, Day, Week, Month" and then hit Class, Students, One
// person, Before you plan — four tabs that all sound like people, none of which
// is the list of your classes. "Class" turned out to be a skills tracker.
// Nothing said where to start, and the most important thing you own — your
// timetable — was not on here at all.
//
// So: grouped, with the group said out loud, and every tab named the same thing
// as the page it opens. A tab that says one word and lands on a page saying
// another is the confusion, not the cure.
//
// "Working?" is last and deliberately plain: when something breaks you need to
// find it without knowing what it's called, and "Help" or "Diagnostics" are
// both worse names for the question you'd actually be asking.
(function () {
  "use strict";
  var GROUPS = [
    ["My time", [
      ["index.html", "Home"],
      ["timeline.html", "Day"],
      ["week.html", "Week"],
      ["month.html", "Month"],
    ]],
    ["Teaching", [
      ["attend.html", "Register"],
      ["lessons.html", "Lessons"],
      ["rota.html", "Turns"],
      ["before-planning.html", "Before you plan"],
      // Both new at a school and most useful in the first term — but neither
      // stops being useful, so they sit with the ordinary teaching pages rather
      // than in a "new here" corner that would go stale.
      ["visits.html", "Watching others"],
    ]],
    // Named for what each page CALLS ITSELF. "Class" was the year's skills and
    // "Students" was the record log; both read as "a list of my students",
    // which neither is.
    ["Students", [
      ["class.html", "Skills"],
      ["records.html", "Record log"],
      ["person.html", "One person"],
    ]],
    ["Mine", [
      ["ask.html", "Ask"],
      ["goals.html", "Goals"],
      ["portfolio.html", "Portfolio"],
      ["looking-back.html", "Looking back"],
      ["people.html", "People"],
    ]],
    ["The app", [
      ["setup.html", "Set up"],
      ["help.html", "Working?"],
    ]],
  ];
  var here = location.pathname.split("/").pop() || "index.html";
  var el = document.getElementById("tabs");
  if (!el) return;
  el.className = "tabs";
  el.innerHTML = GROUPS.map(function (g) {
    return (
      '<span class="tabgroup"><span class="tabgroup-name">' + g[0] + "</span>" +
      g[1].map(function (t) {
        return (
          '<a href="' + t[0] + '"' +
          (t[0] === here ? ' class="active" aria-current="page"' : "") +
          ">" + t[1] + "</a>"
        );
      }).join("") +
      "</span>"
    );
  }).join("");

  // ---- IS THE SORTING ACTUALLY ON? ------------------------------------------
  //
  // Somebody used this app for weeks believing their messy sentences were being
  // read by a model, and they weren't: nothing was installed, so every sort fell
  // through to the pattern reader. Nothing on any page said so. They only found
  // out by trying to install Ollama and discovering it had never been there.
  //
  // So it is said, on every page, all the time — not a banner that appears when
  // something breaks, because "no warning" and "nothing checked" look identical
  // and this is the difference between the app understanding you and the app
  // pattern-matching you.
  //
  // A DOT AND A WORD, never a colour on its own: about one man in twelve cannot
  // separate red from green, and this is exactly the kind of small coloured
  // thing that assumes they can.
  var dot = document.createElement("a");
  dot.className = "ai-dot ai-dot-asking";
  dot.href = "help.html";
  dot.innerHTML = '<span class="ai-dot-light" aria-hidden="true"></span><span class="ai-dot-word">checking…</span>';
  el.appendChild(dot);

  function show(state, word, why) {
    dot.className = "ai-dot ai-dot-" + state;
    dot.querySelector(".ai-dot-word").textContent = word;
    // The whole reason, on hover and to a screen reader — the dot says WHETHER,
    // the title says WHY, and the link goes to the page that says what to do.
    dot.title = why;
    dot.setAttribute("aria-label", "Sorting " + word + ". " + why);
  }

  function ask() {
    show("asking", "checking…", "Asking whether the sorter is answering.");
    fetch("api/health")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.hasAI) {
          show("on", "sorting on", "The sorter is answering, so what you type is read properly.");
          return;
        }
        if (!j.configured) {
          show("off", "sorting off",
            "No AI is set up on this machine, so what you type is read by patterns instead. " +
            "That works, and it reads less well. Click to see how to turn it on.");
          return;
        }
        show("off", "sorting off",
          (j.engineNote || "The sorter isn't answering.") + " Click for what to do about it.");
      })
      .catch(function () {
        // No server at all: the page was opened by double-clicking it. Saying
        // "off" is true — nothing is sorting — and the help page explains.
        show("off", "sorting off",
          "This page was opened without the app running, so nothing is being sorted or saved to your file.");
      });
  }
  ask();
  // Asked again when the tab comes back, because the usual way this changes is
  // somebody going and starting Ollama and coming back to look.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) ask();
  });
  dot.addEventListener("click", function (e) {
    // A click re-checks first: the commonest reason for looking at it is having
    // just fixed the thing it is complaining about.
    if (dot.className.indexOf("ai-dot-off") < 0) return;
    e.preventDefault();
    ask();
    setTimeout(function () { location.href = "help.html"; }, 400);
  });
})();
