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
})();
