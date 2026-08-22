import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE REGISTER, AND THE THING IT'S REALLY FOR.
//
// The counting is easy. What's worth testing is the three places this could
// quietly lie:
//
//   a day with no register must never read as "everyone came"
//   away and late are different facts
//   a target missed through absence is not a target failed
//
// And the one that prompted it: a student who has stopped coming has to be
// visible without anyone going looking.

import fs from "node:fs";
import vm from "node:vm";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

function makeEl(tag) {
  return {
    tagName: tag || "div", className: "", textContent: "", innerHTML: "", value: "",
    checked: false, hidden: false, open: true, type: "", dataset: {}, children: [], _on: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
    removeEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {}, reset() {},
    fire(n, ev) { (this._on[n] || []).forEach((f) => f(ev)); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.window = sb; vm.createContext(sb);
["levels.js", "attend.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const A = sb.OrganiserAttend;

const CFG = { levels: ["mastered it", "can use it", "learnt it"], targetLevel: "can use it" };
const CLASS = ["S01","S02","S03","S04"].map((id) => ({ id, name: id, group: "9A" }));

sec("Taking it: mark the exceptions, never the room");
{
  let list = A.take([], { group: "9A", slotId: "s1", away: ["S03"] }, "2026-09-01");
  ok("a register is kept", list.length === 1, JSON.stringify(list));
  ok("with only the one who wasn't there", list[0].away.join() === "S03");
  ok("and everyone else is in by saying nothing", list[0].away.length === 1);

  // Correcting it replaces it. Two registers for one lesson would double every
  // count that reads them.
  list = A.take(list, { group: "9A", slotId: "s1", away: ["S03", "S04"] }, "2026-09-01");
  ok("taking it again for the same lesson replaces it", list.length === 1, JSON.stringify(list));
  ok("with the correction", list[0].away.join() === "S03,S04");

  // A different slot the same day is a different lesson.
  list = A.take(list, { group: "9A", slotId: "s2", away: [] }, "2026-09-01");
  ok("but a different lesson that day is its own register", list.length === 2);

  ok("away and late are kept apart",
     A.take([], { group: "9A", away: ["S01"], late: ["S02"] }, "2026-09-01")[0].late.join() === "S02");
  ok("a register for nobody in particular is refused", A.normalise({ date: "2026-09-01" }) === null);
  ok("and one with no date is too", A.normalise({ group: "9A" }) === null);
}

sec("A day with no register is not a day everyone came");
{
  const list = A.take([], { group: "9A", away: ["S03"] }, "2026-09-01");
  ok("someone marked away was away", A.wasAway(list, "S03", "9A", "2026-09-01") === true);
  ok("someone not marked was in", A.wasAway(list, "S01", "9A", "2026-09-01") === false);
  // The distinction the whole file depends on.
  ok("a day you never took it answers 'don't know', not 'in'",
     A.wasAway(list, "S01", "9A", "2026-09-08") === null,
     String(A.wasAway(list, "S01", "9A", "2026-09-08")));

  const p = A.pattern(list, "S01", "9A", "2026-09-08");
  ok("and untaken days are not counted as attendance", p.sessions === 1, JSON.stringify(p));
}

sec("Someone who has stopped coming");
{
  // Four Tuesdays. In for the first, then away for three running.
  let list = [];
  list = A.take(list, { group: "9A", away: [] }, "2026-09-01");
  list = A.take(list, { group: "9A", away: ["S03"] }, "2026-09-08");
  list = A.take(list, { group: "9A", away: ["S03"] }, "2026-09-15");
  list = A.take(list, { group: "9A", away: ["S03"] }, "2026-09-22");

  const p = A.pattern(list, "S03", "9A", "2026-09-22");
  ok("the run of absences is counted", p.run === 3, JSON.stringify(p));
  ok("and when they were last actually in", p.lastIn === "2026-09-01");
  ok("and how long ago that was", p.daysSinceIn === 21, String(p.daysSinceIn));
  // The sentence that would have answered the head's question.
  ok("it says how many in a row and asks why",
     /Away the last 3 times/.test(A.words(p)) && /Do you know why/.test(A.words(p)), A.words(p));
  ok("and never blames the child or the family",
     !/truant|refus|parent|lazy|poor attendance|problem/i.test(A.words(p)), A.words(p));

  const rows = A.concerns(list, CLASS, "9A", "2026-09-22", {});
  ok("they are top of the list", rows[0].who === "S03", JSON.stringify(rows.map((r) => r.who)));
  ok("flagged as missing right now", rows[0].missingNow === true);
  ok("and nobody else is on it", rows.length === 1, JSON.stringify(rows.map((r) => r.who)));
  ok("the summary says it in one line",
     /1 has missed several in a row/.test(A.summary(rows, 4)), A.summary(rows, 4));

  // Someone away often but not right now is a different, slower worry.
  let spread = [];
  ["2026-09-01","2026-09-08","2026-09-15","2026-09-22","2026-09-29"].forEach((d, i) => {
    spread = A.take(spread, { group: "9A", away: i % 2 === 0 ? ["S02"] : [] }, d);
  });
  const s2 = A.concerns(spread, CLASS, "9A", "2026-09-29", {});
  const row = s2.find((r) => r.who === "S02");
  ok("someone away often is flagged differently", row.oftenAway === true && row.missingNow === false,
     JSON.stringify(row));
  ok("with the share worked out", Math.round(row.share * 100) === 60, String(row.share));
  ok("the two worries are worded apart",
     /away often/.test(A.summary(s2, 4)), A.summary(s2, 4));

  // Below three registers there is no share at all.
  const thin = A.pattern(A.take([], { group: "9A", away: ["S01"] }, "2026-09-01"), "S01", "9A", "2026-09-01");
  ok("no share off one register", thin.share === null, String(thin.share));
  ok("but the count is still given", /1 of 1/.test(A.words(thin)), A.words(thin));

  ok("nothing taken yet says so plainly", /No registers taken/.test(A.words(A.pattern([], "S01", "9A", "2026-09-01"))));
  ok("and a clean class isn't a warning", /Nobody has missed/.test(A.summary([], 4)));
}

sec("What they were never in the room for");
{
  const lessons = [
    { id:"l1", taught:true, date:"2026-09-01", group:"9A", title:"Settings", targets:["W.3.d"] },
    { id:"l2", taught:true, date:"2026-09-08", group:"9A", title:"Evidence", targets:["RL.1"] },
    { id:"l3", taught:true, date:"2026-09-15", group:"9A", title:"Again",   targets:["W.3.d"] },
  ];
  let list = [];
  list = A.take(list, { group: "9A", away: ["S03"] }, "2026-09-01"); // missed W.3.d
  list = A.take(list, { group: "9A", away: ["S03"] }, "2026-09-08"); // missed RL.1
  list = A.take(list, { group: "9A", away: [] }, "2026-09-15");      // in for W.3.d again

  const rows = A.missed(lessons, list, [], CFG, "S03", "9A");
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  ok("both missed targets are found", rows.length === 2, JSON.stringify(rows.map((r) => r.code)));
  ok("one they later sat through is marked as caught elsewhere", by["W.3.d"].caughtElsewhere === true);
  ok("the one they never saw is not", by["RL.1"].caughtElsewhere === false);
  ok("the words count only what's still outstanding",
     /1 target was taught while they were away/.test(A.missedWords(rows)), A.missedWords(rows));

  // Judged at or above target since means it landed anyway, however it landed.
  const judged = [{ id:"r1", who:"S03", topic:"RL.1", level:"can use it", date:"2026-09-20", createdAt:"" }];
  const after = A.missed(lessons, list, judged, CFG, "S03", "9A");
  ok("something they've since been judged good on drops off",
     !after.some((r) => r.code === "RL.1"), JSON.stringify(after.map((r) => r.code)));

  // Judged BELOW target does not drop off — that's still outstanding.
  const weak = [{ id:"r2", who:"S03", topic:"RL.1", level:"learnt it", date:"2026-09-20", createdAt:"" }];
  ok("but one they're still below target on stays",
     A.missed(lessons, list, weak, CFG, "S03", "9A").some((r) => r.code === "RL.1"));

  // Somebody who was there for everything has nothing outstanding.
  ok("someone who was in for it all has nothing to catch up",
     A.missed(lessons, list, [], CFG, "S01", "9A").length === 0);

  // No register on the day means no claim either way.
  const noReg = A.missed(lessons, [], [], CFG, "S03", "9A");
  ok("with no registers taken, nothing is claimed about who missed what", noReg.length === 0);
}

sec("The page: four seconds to take it");
{
  const els = {};
  const el = (x) => (els[x] = els[x] || makeEl(x));
  const doc = { querySelector: (x) => el(x), createElement: makeEl, querySelectorAll: () => [] };
  const sb2 = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "" } };
  sb2.window = sb2; sb2.globalThis = sb2; vm.createContext(sb2);
  ["levels.js", "attend.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb2));
  const state = {
    attendance: [], contacts: CLASS, schedule: [{ id:"s1", label:"period 3", days:[2] }],
    lessons: [{ id:"l1", taught:true, date:"2026-09-01", group:"9A", title:"Settings", targets:["W.3.d"] }],
    records: [], recordConfig: CFG,
  };
  sb2.OrganiserStore = { load: async () => state, save(p) { Object.assign(state, p); },
    onExternalChange() {} };
  vm.runInContext(fs.readFileSync(`${REPO}/public/attendpage.js`, "utf8"), sb2);
  await new Promise((r) => setTimeout(r, 20));

  // One class on the list, so it opens on it rather than making you choose.
  ok("it opens on the only class you have", /S01/.test(el("#atNames").innerHTML),
     el("#atNames").innerHTML.slice(0, 200));
  ok("nobody is marked until you tap", /Nobody is marked away/.test(el("#atTakenWords").textContent));
  ok("there is no tick-everyone-present step",
     !/present|here\b/i.test(el("#atNames").innerHTML.replace(/isn.t here/gi, "")),
     el("#atNames").innerHTML.slice(0, 200));

  const tap = (cls, id) => {
    const node = { className: cls, dataset: { id }, classList: { contains: (c) => c === cls } };
    el("#atNames").fire("click", { target: { ...node, closest: () => node } });
  };
  tap("at-away", "S03");
  el("#atSave").fire("click", {});
  const r = (state.attendance || [])[0];
  ok("the register is kept", !!r, JSON.stringify(state.attendance));
  ok("with only the one who wasn't there", r && r.away.join() === "S03");
  ok("and everyone else in by saying nothing", r && r.away.length === 1);

  // Late clears away, and the other way round — they are different facts.
  tap("at-late", "S03");
  el("#atSave").fire("click", {});
  ok("marking late clears away", state.attendance[0].away.length === 0 &&
     state.attendance[0].late.join() === "S03", JSON.stringify(state.attendance[0]));
  ok("and it replaced the register rather than adding one", state.attendance.length === 1);
}

sec("It still knows nothing about schools");
{
  const clean = fs.readFileSync(`${REPO}/public/attend.js`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("no subject, key stage or framework in the code",
     !/\b(ib|gcse|key stage|ks[1-5]|maths|english|science|form tutor|safeguarding)\b/i.test(clean));
  // Attendance is the most loaded data in here. Nothing may score a child.
  ok("nothing in it grades a person",
     !/truant|persistent|unauthorised|bad|good attendance|score/i.test(clean));
}

// ---------------------------------------------------------------------------
sec("The sentence over the list adds up to the list");
{
  // It counted only the ones it flags, while the list below shows everybody who
  // has missed anything. So a class with one frequent absence and one single
  // day read "1 is away often." over two names, and the reader had to work out
  // which one it meant.
  const mk = (id, away, late, oftenAway, missingNow) =>
    ({ id, away, late, oftenAway, missingNow, of: 8, pct: Math.round((away / 8) * 100) });
  const said = (rows) => A.summary(rows, 8);

  ok("nothing missed says so", said([]) === "Nobody has missed a session on the registers taken.",
     said([]));
  ok("one often away and one odd day accounts for both",
     said([mk("a", 2, 2, true, false), mk("b", 1, 0, false, false)]) ===
       "1 is away often · 1 has missed at least one.",
     said([mk("a", 2, 2, true, false), mk("b", 1, 0, false, false)]));
  const three = said([mk("a", 4, 0, true, true), mk("b", 3, 0, true, false), mk("c", 1, 0, false, false)]);
  ok("and the numbers add up to the rows",
     three.match(/\d+/g).map(Number).reduce((x, y) => x + y, 0) === 3, three);
  // COUNTS AND NAMES, NEVER A VERDICT. Nobody is described, only counted.
  ok("and it never says what any of it means",
     !/\b(poor|bad|concern|worrying|unacceptable|problem)\b/i.test(three), three);
}

// ---------------------------------------------------------------------------
sec("And the page for one person answers the question a parent asks");
{
  // The person page promises "everything about one person on one screen — for
  // when someone is on the phone and you have about two seconds". It had a
  // block for what CURRICULUM they missed, which needs lesson plans to work
  // out — so with none written it stayed hidden and the page said nothing at
  // all about attendance. The app had the answer on the register page the whole
  // time; the page whose whole job is one-person-one-screen was the one that
  // didn't ask for it.
  const js = fs.readFileSync(`${REPO_ROOT}/public/person.js`, "utf8");
  const html = fs.readFileSync(`${REPO_ROOT}/public/person.html`, "utf8");
  ok("the person page asks how often they are here", /AT\.pattern\(/.test(js),
     "it never asks the attendance module about this person");
  ok("and says it in the module's own words", /AT\.words\(/.test(js),
     "it writes its own sentence, so the two pages can drift apart");
  ok("with somewhere on the page to put it", /id="pHereBlock"/.test(html), "no block for it");
  // AND ONLY WHEN THERE IS SOMETHING TO SAY. A class with no registers taken
  // must not get a heading with nothing under it.
  ok("hidden when no register has been taken", /block\.hidden = !pat \|\| !pat\.sessions/.test(js),
     "it shows the block even with nothing in it");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
