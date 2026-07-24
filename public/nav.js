// The tab bar — one room per question, so each page can stay focused (and the
// home stays the surfacing hub). Injected by script so eight pages share one
// list. Plain script; works under file:// too.
(function () {
  "use strict";
  var TABS = [
    ["index.html", "Home"],
    ["timeline.html", "Day"],
    ["week.html", "Week"],
    ["month.html", "Month"],
    ["class.html", "Class"],
    ["records.html", "Students"],
    ["portfolio.html", "Portfolio"],
    ["goals.html", "Goals"],
    ["looking-back.html", "Looking back"],
  ];
  var here = location.pathname.split("/").pop() || "index.html";
  var el = document.getElementById("tabs");
  if (!el) return;
  el.className = "tabs";
  el.innerHTML = TABS.map(function (t) {
    return '<a href="' + t[0] + '"' + (t[0] === here ? ' class="active" aria-current="page"' : "") + ">" + t[1] + "</a>";
  }).join("");
})();
