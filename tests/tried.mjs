import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHAT YOU TRIED, AND WHAT MOVED — the analysis, and its refusals.
//
// The refusals matter more than the arithmetic here. Anything that turns a
// handful of lessons into a percentage is one rounding away from telling a
// teacher that videos work, off four tries, three of which were never looked at
// again. So most of what follows checks that the module declines to say things.

import fs from "node:fs";
import vm from "node:vm";
import { codeOf } from "./_check.mjs";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.window = sb; vm.createContext(sb);
["levels.js", "tried.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const Y = sb.OrganiserTried;

// Strongest first, which is how this app has always stored a scale.
const CFG = { levels: ["4", "3", "2", "1"], levelNames: { 4:"Exceeding", 3:"Proficient", 2:"Developing", 1:"Beginning" }, targetLevel: "3" };
const CLASS = ["S01","S02","S03","S04","S05","S06"].map((id) => ({ id, name: id, group: "5A" }));
const rec = (who, topic, level, date) => ({ id: who+topic+date, who, topic, level, date, createdAt: "" });
const t = (what, skill, date, whoIds, group) => ({ id: what+date+(whoIds||[]).join(), what, skill, date, whoIds: whoIds||[], group: group||"" });

sec("Who a try reached");
{
  const named = Y.normalise(t("watched it done", "Reading", "2026-09-10", ["S01"]));
  ok("someone named is reached", Y.reached(named, "S01", CLASS) === "named");
  ok("someone else is not", !Y.reached(named, "S02", CLASS));
  const whole = Y.normalise(t("watched it done", "Reading", "2026-09-10", [], "5A"));
  ok("a whole group reaches its members", Y.reached(whole, "S03", CLASS) === "group");
  ok("and not someone in another group",
     !Y.reached(whole, "X9", [{ id:"X9", name:"X", group:"6B" }]));
  ok("an entry with no words at all is refused", Y.normalise({ skill:"Reading" }) === null);
}

sec("The join: before, after, and the gaps in between");
{
  const records = [
    rec("S01","Reading","2","2026-09-01"),
    rec("S01","Reading","3","2026-10-01"),
  ];
  const up = Y.outcome(records, CFG, "S01", "Reading", "2026-09-15");
  ok("a level that rose afterwards is seen", up.state === "moved up", JSON.stringify(up));
  ok("with both ends named", up.before.level === "2" && up.after.level === "3");
  ok("and how long it took", up.days === 30, String(up.days));

  // Same day is NOT movement: what they can do at the end of the lesson is
  // performance, and performance and learning come apart.
  const sameDay = Y.outcome(
    [rec("S01","Reading","2","2026-09-15"), rec("S01","Reading","3","2026-09-15")],
    CFG, "S01", "Reading", "2026-09-15");
  ok("a judgement made the same day is not counted as movement",
     sameDay.state === "not followed up yet", JSON.stringify(sameDay));

  const none = Y.outcome([rec("S02","Reading","2","2026-09-01")], CFG, "S02", "Reading", "2026-09-15");
  ok("never looked at again says exactly that", none.state === "not followed up yet");

  const noBefore = Y.outcome([rec("S03","Reading","3","2026-10-01")], CFG, "S03", "Reading", "2026-09-15");
  ok("nothing beforehand is not treated as no change", noBefore.state === "no level beforehand");

  const down = Y.outcome(
    [rec("S04","Reading","3","2026-09-01"), rec("S04","Reading","2","2026-10-01")],
    CFG, "S04", "Reading", "2026-09-15");
  ok("a level that fell is reported too, not hidden", down.state === "moved down");

  // Already at the top: staying there is the best available outcome and must
  // never be counted as "nothing happened".
  const top = Y.outcome(
    [rec("S05","Reading","4","2026-09-01"), rec("S05","Reading","4","2026-10-01")],
    CFG, "S05", "Reading", "2026-09-15");
  ok("someone at the top who stays there is flagged, not scored as a flop",
     top.state === "stayed the same" && top.atCeiling === true, JSON.stringify(top));

  ok("no skill means no join at all", Y.outcome([], CFG, "S01", "", "2026-09-15").state === "no skill");
}

sec("Two things in the same gap belong to both and to neither");
{
  const records = [rec("S01","Reading","2","2026-09-01"), rec("S01","Reading","3","2026-10-01")];
  const list = [t("watched it done","Reading","2026-09-10",["S01"]),
                t("read it aloud","Reading","2026-09-20",["S01"])];
  const out = Y.outcome(records, CFG, "S01", "Reading", "2026-09-10");
  const also = Y.alsoInWindow(list, CLASS, "S01", "Reading", "2026-09-10", out);
  ok("the other thing in the window is named", also.join() === "read it aloud", JSON.stringify(also));

  const rows = Y.byApproach(list, records, CFG, CLASS, CLASS);
  ok("both approaches show the same movement", rows.length === 2 && rows.every((r) => r.up === 1));
  ok("and both are marked as muddled", rows.every((r) => r.muddled === 1), JSON.stringify(rows.map(r=>r.muddled)));
  ok("the caveat says so out loud", /can't be told apart/.test(Y.caveat(rows)), Y.caveat(rows));
}

sec("Counting across a group — and refusing to over-claim");
{
  // Six students. Four judged again, two never looked at.
  const records = [];
  ["S01","S02","S03","S04","S05","S06"].forEach((w) => records.push(rec(w,"Reading","2","2026-09-01")));
  records.push(rec("S01","Reading","3","2026-10-01"));
  records.push(rec("S02","Reading","3","2026-10-01"));
  records.push(rec("S03","Reading","3","2026-10-01"));
  records.push(rec("S04","Reading","2","2026-10-01"));
  const list = [t("watched it done","Reading","2026-09-15",[], "5A")];
  const rows = Y.byApproach(list, records, CFG, CLASS, CLASS);
  const r = rows[0];
  ok("one row per approach", rows.length === 1);
  ok("counting tries, not students", r.tries === 6, String(r.tries));
  ok("three moved up", r.up === 3, JSON.stringify(r));
  ok("one stayed put", r.same === 1);
  ok("and the two never looked at are counted, not dropped", r.waiting === 2, String(r.waiting));
  ok("the denominator is only what could be judged", r.judged === 4, String(r.judged));
  ok("the words give the count and the waiting", /3 of 4 moved up/.test(Y.words(r)) &&
     /2 not looked at again/.test(Y.words(r)), Y.words(r));
  // The row's own words must contain no causal claim at all. The caveat is
  // allowed the word "caused" precisely once, in the denial — so it's checked
  // with the denial removed, rather than waved through for containing it.
  ok("the row itself claims nothing",
     !/because|caused|works|proves|effective|best/i.test(Y.words(r)), Y.words(r));
  const stripped = Y.caveat(rows).replace(/not what caused it/i, "");
  ok("and neither does the caveat, once its denial is taken out",
     !/because|caused|works|proves|effective|best/i.test(stripped), stripped);
  ok("the caveat always says what it isn't",
     /not what caused it/.test(Y.caveat(rows)), Y.caveat(rows));
}

sec("Too few to say anything");
{
  const records = [rec("S01","Reading","2","2026-09-01"), rec("S01","Reading","3","2026-10-01"),
                   rec("S02","Reading","2","2026-09-01"), rec("S02","Reading","3","2026-10-01")];
  const list = [t("watched it done","Reading","2026-09-15",["S01"]),
                t("watched it done","Reading","2026-09-15",["S02"])];
  const r = Y.byApproach(list, records, CFG, CLASS, CLASS)[0];
  ok("two out of two is still only two", r.judged === 2 && r.up === 2);
  ok("no share is offered below three", !/%/.test(Y.words(r)), Y.words(r));
  ok("and it says why", /too few/.test(Y.words(r)), Y.words(r));
  // The failure mode this exists to prevent.
  ok("it never says a hundred per cent", !/100/.test(Y.words(r)), Y.words(r));
}

sec("Ordering is by use, never by success");
{
  const records = [rec("S01","Reading","2","2026-09-01"), rec("S01","Reading","3","2026-10-01"),
                   rec("S02","Reading","2","2026-09-01"), rec("S02","Reading","2","2026-10-01"),
                   rec("S03","Reading","2","2026-09-01"), rec("S03","Reading","2","2026-10-01")];
  const list = [
    t("a one-off","Reading","2026-09-15",["S01"]),          // 1 try, 1 up  — "best"
    t("the usual","Reading","2026-09-15",["S02"]),
    t("the usual","Reading","2026-09-16",["S03"]),          // 2 tries, 0 up
  ];
  const rows = Y.byApproach(list, records, CFG, CLASS, CLASS);
  ok("the most-used comes first, not the most successful",
     rows[0].what === "the usual", rows.map((x) => `${x.what}:${x.tries}`).join(" "));
}

sec("Your words, learned rather than built in");
{
  const list = [t("watched it done","Reading","2026-09-15",["S01"]),
                t("watched it done","Reading","2026-09-16",["S02"]),
                t("read it aloud","Reading","2026-09-17",["S03"])];
  const v = Y.vocabulary(list);
  ok("the words you've used come back", v.map((x) => x.what).join() === "watched it done,read it aloud",
     JSON.stringify(v));
  ok("most-used first", v[0].used === 2);
  // §0.2: no domain vocabulary in the code at all.
  const src = codeOf(fs.readFileSync(`${REPO}/public/tried.js`, "utf8"));
  ok("the module has never heard of a video or a worksheet",
     !/\b(video|worksheet|reading|kinaesthetic|auditory|visual)\b/i.test(src),
     (src.match(/\b(video|worksheet|reading|kinaesthetic|auditory|visual)\b/i) || [])[0]);
}

sec("It works for a plumber, not just a teacher");
{
  // §0.2 again, properly: point it at apprentices and pipe-bending.
  const cfg = { levels: ["signed off","nearly","supervised"], targetLevel: "nearly" };
  const crew = [{ id:"a1", name:"Apprentice", group:"Tuesday" }];
  const records = [{ id:"r1", who:"a1", topic:"bending pipe", level:"supervised", date:"2026-09-01", createdAt:"" },
                   { id:"r2", who:"a1", topic:"bending pipe", level:"nearly", date:"2026-10-01", createdAt:"" }];
  const list = [t("let him do it while I watched","bending pipe","2026-09-15",["a1"])];
  const r = Y.byApproach(list, records, cfg, crew, crew)[0];
  ok("the same machinery reads a trade the same way", r && r.up === 1, JSON.stringify(r));
}

sec("Nothing at all is not an error");
{
  ok("no tries gives no rows", Y.byApproach([], [], CFG, CLASS, CLASS).length === 0);
  ok("no people gives no rows", Y.byApproach([t("x","Reading","2026-09-15",["S01"])], [], CFG, CLASS, []).length === 0);
  ok("rubbish in the list is skipped, not thrown on",
     Y.byApproach([null, {}, { what:"" }], [], CFG, CLASS, CLASS).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
