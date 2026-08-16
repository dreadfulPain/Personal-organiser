// The tab bar — one room per question, so each page can stay focused (and the
// home stays the surfacing hub). Injected by script so every page shares one
// list. Plain script; works under file:// too.
//
// "Working?" is last and deliberately plain: when something breaks you need to
// find it without knowing what it's called, and "Help" or "Diagnostics" are
// both worse names for the question you'd actually be asking.
(function () {
  "use strict";
  var TABS = [
    ["index.html", "Home"],
    ["timeline.html", "Day"],
    ["week.html", "Week"],
    ["month.html", "Month"],
    ["class.html", "Class"],
    ["records.html", "Students"],
    ["person.html", "One person"],
    ["before-planning.html", "Before you plan"],
    ["lessons.html", "Lessons"],
    ["people.html", "People"],
    ["portfolio.html", "Portfolio"],
    ["goals.html", "Goals"],
    ["looking-back.html", "Looking back"],
    ["help.html", "Working?"],
  ];
  var here = location.pathname.split("/").pop() || "index.html";
  var el = document.getElementById("tabs");
  if (!el) return;
  el.className = "tabs";
  el.innerHTML = TABS.map(function (t) {
    return '<a href="' + t[0] + '"' + (t[0] === here ? ' class="active" aria-current="page"' : "") + ">" + t[1] + "</a>";
  }).join("");
})();
