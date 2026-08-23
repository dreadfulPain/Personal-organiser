import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// COMING BACK TO IT, AND WHETHER IT LANDED.
//
// Two modules, four questions. The arithmetic is easy and mostly right by
// inspection; what's worth testing is the judgement each one refuses to make,
// and the states that are easy to collapse into each other by accident:
//
//   taught-but-not-judged is NOT the same as below target
//   taught to 9A is NOT taught to 9B
//   re-teaching something IS reviewing it
//   a review due on a Saturday is not a review

import fs from "node:fs";
import vm from "node:vm";
import { everyModule } from "./_dom.mjs";

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
// schedule.js included on purpose: review.js asks it whether a day is written
// off, and without it every holiday silently stops existing.
["levels.js", "schedule.js", "syllabus.js", "review.js", "attain.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const RV = sb.OrganiserReview, AT = sb.OrganiserAttain, S = sb.OrganiserSyllabus;

// Their own three-point scale, strongest first — the words the request used.
const CFG = {
  levels: ["mastered it", "can use it", "learnt it"],
  targetLevel: "can use it",
  topics: ["Descriptive writing"],
};
const CLASS = ["S01","S02","S03","S04","S05","S06"].map((id) => ({ id, name: id, group: "9A" }));
const SYL = { name: "this year", targets: [
  { code: "W.3.d", text: "Use precise words and sensory language.", strand: "Writing" },
  { code: "W.4", text: "Produce clear and coherent writing.", strand: "Writing" },
  { code: "RL.1", text: "Cite textual evidence.", strand: "Reading" },
]};
const rec = (who, code, level, date) => ({ id: who+code+date, who, topic: code, level, date, createdAt: "" });
// A Tuesday slot, so a review due on a Saturday has somewhere to go.
const SCHEDULE = [{ id: "s1", label: "9A period 3", start: "11:00", end: "12:00", days: [2] }];

sec("Where the class is: taught, and taught to WHOM");
{
  const lessons = [
    { id:"l1", taught:true, date:"2026-09-01", group:"9A", slotId:"s1", targets:["W.3.d"] },
    { id:"l2", taught:true, date:"2026-09-08", group:"9B", slotId:"s1", targets:["W.4"] },
    { id:"l3", taught:false, date:"2026-09-15", group:"9A", slotId:"s1", targets:["RL.1"] },
  ];
  const a = S.coverage(lessons, SYL, { group: "9A" });
  ok("only that class's lessons count", a.taught.length === 1 && a.taught[0].code === "W.3.d",
     JSON.stringify(a.taught.map((x) => x.code)));
  ok("a lesson taught to another class is not covered here",
     a.untaught.some((t) => t.code === "W.4"), JSON.stringify(a.untaught.map((x) => x.code)));
  ok("and a lesson never taught doesn't count either",
     a.untaught.some((t) => t.code === "RL.1"));
  const b = S.coverage(lessons, SYL, { group: "9B" });
  ok("the other class has its own picture", b.taught[0].code === "W.4", JSON.stringify(b.taught));
}

sec("One person: where they are, and what needs work");
{
  const lessons = [
    { id:"l1", taught:true, date:"2026-09-01", group:"9A", targets:["W.3.d","W.4"] },
    { id:"l2", taught:true, date:"2026-09-20", group:"9A", targets:["RL.1"] },
  ];
  const records = [
    rec("S01","W.3.d","learnt it","2026-09-05"),   // below "can use it"
    rec("S01","W.3.d","can use it","2026-09-19"),  // moved up — latest wins
    rec("S01","W.4","learnt it","2026-09-05"),     // below
    // RL.1 taught but never judged.
  ];
  const rows = AT.forPerson(records, CFG, lessons, SYL, "S01", "9A");
  ok("every target their class was taught is listed", rows.length === 3, JSON.stringify(rows.map((r) => r.code)));
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  ok("the newest judgement wins", by["W.3.d"].level === "can use it");
  ok("and counts as at or above target", by["W.3.d"].state === "at or above");
  ok("one below target is named as below", by["W.4"].state === "below");
  // The distinction that matters most on this whole page.
  ok("taught but never judged is its OWN state, not 'below'",
     by["RL.1"].state === "not judged yet", JSON.stringify(by["RL.1"]));
  ok("the trail is kept, not just the latest", by["W.3.d"].history === 2);
  ok("the words carried over from the syllabus", /sensory/.test(by["W.3.d"].text));
  ok("below-target ones come first", rows[0].state === "below");

  const work = AT.needsWork(rows, 8);
  ok("what needs work is only the below-target ones", work.length === 1 && work[0].code === "W.4",
     JSON.stringify(work.map((x) => x.code)));
  ok("the summary counts all three states", /1 of 3 at or above target/.test(AT.personWords(rows)),
     AT.personWords(rows));
  ok("and never tells them off",
     !/poor|weak|failing|behind|should/i.test(AT.personWords(rows)), AT.personWords(rows));

  // Judging someone against something their class never had is a mark for the
  // planning, not for them.
  const other = AT.forPerson(records, CFG, lessons, SYL, "S01", "9B");
  ok("nothing is judged against a class that wasn't taught it", other.length === 0);
}

sec("One target, whole class: enough to move on, or go again?");
{
  const records = [
    rec("S01","W.3.d","mastered it","2026-09-19"),
    rec("S02","W.3.d","can use it","2026-09-19"),
    rec("S03","W.3.d","can use it","2026-09-19"),
    rec("S04","W.3.d","learnt it","2026-09-19"),
    rec("S05","W.3.d","learnt it","2026-09-19"),
    // S06 never judged.
  ];
  const r = AT.forClass(records, CFG, CLASS, "W.3.d");
  ok("everyone judged is counted", r.judged === 5, JSON.stringify(r));
  ok("at or above the bar", r.at === 3);
  ok("below it", r.below === 2);
  ok("and the one nobody judged is counted apart", r.unjudged === 1);
  ok("the split is by level, strongest first",
     r.ranked.map(([l]) => l).join() === "mastered it,can use it,learnt it",
     JSON.stringify(r.ranked));
  ok("the ones below are named, not just counted",
     r.namesBelow.map((x) => x.name).sort().join() === "S04,S05", JSON.stringify(r.namesBelow));
  ok("and so is the one never judged", r.namesUnjudged[0].name === "S06");
  ok("the words give the counts", /3 of 5 judged are at or above can use it/.test(AT.classWords(r)),
     AT.classWords(r));
  // The refusal. One line of code would say "move on", and it would be wrong
  // about half the time, because it depends on WHICH two are behind.
  ok("it never says whether to move on",
     !/move on|go again|ready to|you should|re-?teach/i.test(AT.classWords(r)), AT.classWords(r));

  const none = AT.forClass([], CFG, CLASS, "W.3.d");
  ok("nothing judged says so plainly", /Nobody judged on this yet/.test(AT.classWords(none)),
     AT.classWords(none));
  ok("and is not reported as everyone failing", none.below === 0 && none.unjudged === 6);
}

sec("The class picture, worst first");
{
  const lessons = [{ id:"l1", taught:true, date:"2026-09-01", group:"9A", targets:["W.3.d","W.4"] }];
  const records = [
    rec("S01","W.3.d","can use it","2026-09-19"), rec("S02","W.3.d","can use it","2026-09-19"),
    rec("S01","W.4","learnt it","2026-09-19"), rec("S02","W.4","learnt it","2026-09-19"),
    rec("S03","W.4","learnt it","2026-09-19"),
  ];
  const p = AT.picture(records, CFG, lessons, SYL, CLASS, "9A");
  ok("only what was taught appears", p.rows.length === 2, JSON.stringify(p.rows.map((r) => r.code)));
  ok("the one most people are behind on leads", p.rows[0].code === "W.4", JSON.stringify(p.rows.map((r) => [r.code, r.below])));
  ok("and the syllabus wording comes with it", /clear and coherent/.test(p.rows[0].text));
  const blank = AT.picture([], CFG, lessons, SYL, CLASS, "9A");
  ok("a class with nothing judged is a different page from a class in trouble",
     blank.anyJudged === false && blank.rows.length === 2);
}

sec("Coming back to it: a day, a week, a month");
{
  ok("the gaps start at a day, a week, a month", RV.gaps(null).join() === "1,7,30");
  ok("and they're yours to change", RV.gaps({ reviewDays: [2, 14] }).join() === "2,14");
  ok("an empty list means you don't want this", RV.gaps({ reviewDays: [] }).length === 0);
  ok("and rubbish in it is dropped, not crashed on",
     RV.gaps({ reviewDays: [1, "x", -5, 7] }).join() === "1,7");

  // Taught once on a Tuesday. First review is due the next day — a Wednesday,
  // when you don't have them — so it moves to the following Tuesday.
  const lessons = [{ id:"l1", taught:true, date:"2026-09-01", group:"9A", slotId:"s1", targets:["W.3.d"] }];
  const rows = RV.due(lessons, null, SCHEDULE, "2026-09-01");
  ok("one target taught means one thing to come back to", rows.length === 1, JSON.stringify(rows));
  ok("it's the first time back", rows[0].round === 1 && rows[0].rounds === 3);
  ok("the day the gap lands on is kept", rows[0].wanted === "2026-09-02");
  // The point of the whole thing: a reminder you can act on.
  ok("but it moves to the next lesson you actually have them",
     rows[0].on === "2026-09-08" && rows[0].moved === true, JSON.stringify(rows[0]));
  ok("and says that's what happened", /first lesson you have them/.test(RV.words(rows[0])),
     RV.words(rows[0]));

  // Re-teaching IS reviewing, and the next gap gets longer.
  const again = lessons.concat([{ id:"l2", taught:true, date:"2026-09-08", group:"9A", slotId:"s1", targets:["W.3.d"] }]);
  const r2 = RV.due(again, null, SCHEDULE, "2026-09-08");
  ok("going over it again counts as the review", r2[0].round === 2, JSON.stringify(r2[0]));
  ok("and the next gap is the longer one", r2[0].wanted === "2026-09-15");

  // Three occasions uses all three gaps; a fourth means it's finished.
  const done = again.concat([
    { id:"l3", taught:true, date:"2026-09-15", group:"9A", slotId:"s1", targets:["W.3.d"] },
    { id:"l4", taught:true, date:"2026-10-15", group:"9A", slotId:"s1", targets:["W.3.d"] },
  ]);
  ok("once you've been back as many times as there are gaps, it drops out",
     RV.due(done, null, SCHEDULE, "2026-10-20").length === 0);

  // Per class. Teaching 9A says nothing about when 9B last saw it.
  const twoClasses = [
    { id:"a", taught:true, date:"2026-09-01", group:"9A", slotId:"s1", targets:["W.3.d"] },
    { id:"b", taught:true, date:"2026-09-01", group:"9B", slotId:"s1", targets:["W.3.d"] },
  ];
  const both = RV.due(twoClasses, null, SCHEDULE, "2026-09-01");
  ok("each class has its own review to do", both.length === 2, JSON.stringify(both.map((x) => x.group)));
  const oneOnly = RV.due(twoClasses.concat([
    { id:"c", taught:true, date:"2026-09-08", group:"9A", slotId:"s1", targets:["W.3.d"] }]),
    null, SCHEDULE, "2026-09-08");
  const nine9b = oneOnly.find((x) => x.group === "9B");
  ok("going over it with one class does NOT tick it off for the other",
     nine9b && nine9b.round === 1, JSON.stringify(oneOnly.map((x) => [x.group, x.round])));

  // Overdue, and never blamed for it.
  const late = RV.due(lessons, null, SCHEDULE, "2026-09-22");
  ok("something past its day is marked overdue", late[0].state === "overdue");
  ok("with how long by", late[0].overdueBy === 14, String(late[0].overdueBy));
  ok("and no telling-off anywhere", !/should|failed|late|neglect|forgot/i.test(RV.summary(late)),
     RV.summary(late));
  ok("nothing waiting says so plainly", /Nothing waiting/.test(RV.summary([])));

  // A HOLIDAY IS NOT A DAY YOU SEE THEM. The timetable says Tuesdays; it does
  // not say this Tuesday is the first day of the winter break. Found by running
  // five months with a month off in the middle — a review taught the week
  // before landed on day one of the holiday, which is exactly the case the
  // whole feature exists for.
  const HOLIDAY = SCHEDULE.concat([{ id: "hol", label: "Winter break", start: "00:00",
    end: "23:59", days: [0,1,2,3,4,5,6], from: "2026-09-07", to: "2026-10-05", blocksDay: true }]);
  const overHol = RV.due(lessons, null, HOLIDAY, "2026-09-01");
  ok("a review due inside a holiday waits for the school to open",
     overHol[0].on > "2026-10-05", `${overHol[0].on} (wanted ${overHol[0].wanted})`);
  ok("and lands on a day that class is actually taught",
     new Date(overHol[0].on + "T12:00:00").getDay() === 2, overHol[0].on);
  ok("and still says it had to move", overHol[0].moved === true);
  // With no slot at all there is still a holiday to avoid. Taught the day
  // before it starts, so the first review falls squarely inside it.
  const noSlotHol = RV.due([{ id:"x", taught:true, date:"2026-09-06", group:"9A", targets:["W.3.d"] }],
    null, HOLIDAY, "2026-09-06");
  ok("the first review would land on day one of the holiday",
     noSlotHol[0].wanted === "2026-09-07", noSlotHol[0].wanted);
  ok("even with no timetable, it waits for the school to open",
     noSlotHol[0].on === "2026-10-06", noSlotHol[0].on);

  // No timetable at all: a plain date beats pretending to know.
  const noSlot = RV.due([{ id:"x", taught:true, date:"2026-09-01", group:"9A", targets:["W.3.d"] }],
    null, [], "2026-09-01");
  ok("with no slot it just gives the date", noSlot[0].on === "2026-09-02" && noSlot[0].moved === false);
}

sec("It still knows nothing about schools");
{
  const clean = (f) => fs.readFileSync(`${REPO}/public/${f}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const banned = /\b(ib|gcse|common core|ccss|key stage|ks[1-5]|maths|english|science)\b/i;
  ["review.js", "attain.js"].forEach((f) =>
    ok(`${f} names no syllabus, subject or key stage`, !banned.test(clean(f)),
       (clean(f).match(banned) || [])[0]));
  // And the spacing is data, not a rule in the code.
  ok("the gaps are not hard-coded anywhere but the starting values",
     (clean("review.js").match(/\b30\b/g) || []).length <= 1);
}


sec("Marking a class from the lesson you taught");
{
  const els = {};
  const el = (sel) => (els[sel] = els[sel] || makeEl(sel));
  const doc = { querySelector: (x) => el(x), createElement: makeEl, querySelectorAll: () => [] };
  const sb2 = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "" } };
  sb2.window = sb2; sb2.globalThis = sb2; vm.createContext(sb2);
  // EVERY module, derived — see everyModule() in _dom.mjs. This runs a whole
  // PAGE script, and a page loads all of them; naming a handful by hand goes
  // stale the moment the page needs one more, and the failure then shows up
  // inside the PAGE as "X is not defined".
  everyModule(sb2);
  const state = {
    lessons: [{ id:"l1", title:"Settings", date:"2026-09-01", group:"9A", slotId:"s1",
      plan:"x", objective:"describe a setting", ways:["modelled it"], checks:["exit ticket"],
      taught:true, targets:["W.3.d"] }],
    lessonConfig: null, contacts: CLASS, records: [], recordConfig: CFG,
    schedule: SCHEDULE, items: [], tried: [], syllabus: SYL,
  };
  sb2.OrganiserStore = { load: async () => state, save(p) { Object.assign(state, p); },
    onExternalChange() {} };
  vm.runInContext(fs.readFileSync(`${REPO}/public/lessons.js`, "utf8"), sb2);
  await new Promise((r) => setTimeout(r, 20));

  ok("a taught lesson with targets offers marking",
     /how did they do/.test(el("#lsList").innerHTML), el("#lsList").innerHTML.slice(0, 400));

  const click = (cls, data) => {
    const node = { className: cls, dataset: data, classList: { contains: (c) => c === cls } };
    el("#lsList").fire("click", { target: { ...node, closest: () => node } });
  };
  click("ls-mark", { id: "l1" });
  ok("the grid opens with everyone in that class",
     /S01/.test(el("#lsList").innerHTML) && /S06/.test(el("#lsList").innerHTML),
     el("#lsList").innerHTML.slice(0, 300));
  ok("and a button for each level on your own scale",
     /mastered it/.test(el("#lsList").innerHTML) && /learnt it/.test(el("#lsList").innerHTML));
  ok("it says a blank is not a nought",
     /not the same as not getting it/.test(el("#lsList").innerHTML));

  click("ls-lvl", { who: "S01", code: "W.3.d", level: "can use it" });
  const r = (state.records || [])[0];
  ok("a level tapped here is saved", !!r, JSON.stringify(state.records));
  ok("against the target code, as a topic", r && r.topic === "W.3.d");
  ok("with the level you tapped", r && r.level === "can use it");
  // It has to be indistinguishable from one made on the Students page, or half
  // the app stops seeing it.
  ok("and every field the rest of the app expects",
     r && r.who === "S01" && r.date && r.createdAt && r.src === "hand" &&
     Array.isArray(r.files) && Array.isArray(r.tags) && r.summary,
     JSON.stringify(r));

  // The same judgement again is a confirmation, not a second piece of evidence.
  click("ls-lvl", { who: "S01", code: "W.3.d", level: "can use it" });
  ok("tapping the same level again doesn't make a second record",
     state.records.length === 1, JSON.stringify(state.records.map((x) => x.level)));
  ok("it stamps the one that's there", (state.records[0].confirmedOn || []).length === 1);

  // And it flows straight into the class picture.
  click("ls-lvl", { who: "S02", code: "W.3.d", level: "learnt it" });
  const pic = sb2.OrganiserAttain.picture(state.records, CFG, state.lessons, SYL, CLASS, "9A");
  ok("the class picture picks it up at once", pic.rows[0].judged === 2, JSON.stringify(pic.rows[0]));
  ok("one at or above, one below", pic.rows[0].at === 1 && pic.rows[0].below === 1);
  ok("and four not judged", pic.rows[0].unjudged === 4);

  // And the review reminder is on the page.
  ok("what's due to come back to is shown",
     /W.3.d/.test(el("#lsReview").innerHTML), el("#lsReview").innerHTML.slice(0, 300));
  ok("and never blames you for it",
     !/should|late|failed|forgot|neglect/i.test(el("#lsReview").innerHTML + el("#lsReviewWords").textContent),
     el("#lsReviewWords").textContent);

  // The gaps are editable from the page.
  el("#lsHGaps").value = "2, 14";
  el("#lsHeadForm").fire("submit", { preventDefault() {} });
  ok("your own spacing is saved", (state.lessonConfig || {}).reviewDays.join() === "2,14",
     JSON.stringify(state.lessonConfig));
  el("#lsHGaps").value = "";
  el("#lsHeadForm").fire("submit", { preventDefault() {} });
  ok("and emptying it turns the reminders off, rather than restoring the defaults",
     state.lessonConfig.reviewDays.length === 0 &&
     sb2.OrganiserReview.due(state.lessons, state.lessonConfig, SCHEDULE, "2026-09-30").length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
