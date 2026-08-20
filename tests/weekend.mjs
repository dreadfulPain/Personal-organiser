import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Weekends stay open, and get counted.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);
const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","priority.js","dayplan.js","weekplan.js","goalplan.js","weekend.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const S = sb.window.OrganiserSchedule, W = sb.window.OrganiserWeekend,
      GP = sb.window.OrganiserGoalPlan, DP = sb.window.OrganiserDayPlan;

// 2026-09-19 is a Saturday; 2026-09-21 the Monday after.
const SAT = "2026-09-19", SUN = "2026-09-20", MON = "2026-09-21";

sec("A weekend is never blocked off");
{
  const CFG = { dayStart:"08:00", dayEnd:"17:00" };
  const sched = [{ id:"l", label:"Lessons", start:"09:00", end:"12:00", days:[1,2,3,4,5] }];
  ok("a Saturday has room in it like any other day",
     S.gapsOn(sched, S.normaliseConfig(CFG), SAT).reduce((n,g)=>n+(g.end-g.start),0) > 0);
  const it = { id:"x", title:"a job", type:"task", time:"", tags:[], date:SAT, deadlineType:"hard",
    importance:"normal", effort:"medium", goalId:"", openLoop:false, promisedTo:"", waitingOn:"",
    notBefore:"", spentMinutes:0, plannedMinutes:0, optional:false, done:false };
  ok("and the day plan will use it", DP.build([it], sched, CFG, SAT,
     { ctx:{ today:SAT, goalTitle:()=>"" } }).slots.length === 1);
  const r = GP.rate({ id:"g", title:"x", date:"2026-10-09" },
    [{ ...it, id:"a", goalId:"g", date:"", plannedMinutes:120 }], sched, CFG, "2026-09-14");
  ok("the rate counts weekend days rather than pretending they don't exist", r.weekendDays > 0);
  ok("and says they're counted, not that you should block them",
     /counted, because sometimes you do use them/.test(GP.words(r)), GP.words(r));
  ok("it no longer tells you to mark them off", !/mark them off/.test(GP.words(r)));
}

sec("Minutes are recorded against the day they happened on");
{
  let w = {};
  w = W.record(w, SAT, 90, "work");
  w = W.record(w, SAT, 30, "personal");
  w = W.record(w, MON, 200, "work");
  ok("a day's total adds up", w[SAT].total === 120);
  ok("and splits by area", w[SAT].areas.work === 90 && w[SAT].areas.personal === 30);
  ok("an unlabelled entry still counts to the total",
     W.record({}, SAT, 45, "")[SAT].total === 45);
  ok("but isn't given a made-up area",
     Object.keys(W.record({}, SAT, 45, "")[SAT].areas).length === 0);
  ok("nothing is recorded for zero minutes", Object.keys(W.record({}, SAT, 0, "x")).length === 0);
  ok("a bad date is refused", Object.keys(W.record({}, "soon", 30, "x")).length === 0);
  ok("junk normalises away", Object.keys(W.normalise({ bad:"x", "2026-09-19":{ total:-5 } })).length === 0);
}

sec("Saturday and the Sunday after it are one weekend");
{
  ok("a Saturday belongs to itself", W.weekendOf(SAT) === SAT);
  ok("the Sunday after belongs to it too", W.weekendOf(SUN) === SAT);
  ok("a Monday belongs to no weekend", W.weekendOf(MON) === "");
  let w = W.record(W.record({}, SAT, 60, "work"), SUN, 60, "work");
  const list = W.recent(w, MON, 4);
  ok("both days land in one weekend", list[0].total === 120, JSON.stringify(list[0]));
  ok("and it's named by its Saturday", list[0].saturday === SAT);
  ok("weekday work is never counted as weekend work",
     W.recent(W.record({}, MON, 300, "work"), MON, 4).every(x => x.total === 0));
}

sec("A run of worked weekends is noticed");
{
  let w = {};
  // Five Saturdays in a row, working back from SAT.
  for (let i = 0; i < 5; i++) w = W.record(w, S.addDaysISO(SAT, -7 * i), 180, "work");
  const v = W.look(w, MON, 8);
  ok("it counts how many of the last eight had work", v.used === 5, v.used);
  ok("and how many in a row", v.streak === 5, v.streak);
  ok("that's raised as worth knowing", v.concern === "run", v.concern);
  const words = W.words(v);
  ok("the words say the number", /5 in a row/.test(words), words);
  ok("and hand the judgement back", /only|your|if it wasn't a run of choices/i.test(words), words);
  ok("without scolding", !/should|too much|failing|bad/i.test(words), words);

  // A gap breaks the run.
  const gapped = W.look(W.record({}, S.addDaysISO(SAT, -21), 120, "work"), MON, 8);
  ok("one weekend a month ago isn't a run", gapped.streak === 0 && gapped.concern === "");
}

sec("It's the split that matters, not the total");
{
  let even = {}, lop = {};
  for (let i = 0; i < 3; i++) {
    const d = S.addDaysISO(SAT, -7 * i);
    even = W.record(W.record(even, d, 120, "work"), d, 120, "mine");
    lop = W.record(W.record(lop, d, 230, "work"), d, 10, "mine");
  }
  const ve = W.look(even, MON, 8), vl = W.look(lop, MON, 8);
  ok("the same total can be a fine weekend or a lopsided one",
     ve.total === vl.total, `${ve.total} vs ${vl.total}`);
  ok("an even split raises nothing", ve.concern === "", ve.concern);
  ok("a lopsided one is named", vl.concern === "lopsided", vl.concern);
  ok("with the share", /9[0-9]%/.test(W.words(vl)), W.words(vl));
  ok("and says which area", /work/.test(W.words(vl)));
  ok("and still leaves the judgement to you", /only you can say/.test(W.words(vl)));
}

sec("With nothing labelled it says so rather than guessing");
{
  const v = W.look(W.record({}, SAT, 240, ""), MON, 8);
  ok("the total is there", v.total === 240);
  ok("nothing is invented", Object.keys(v.areas).length === 0);
  ok("and it asks for labels rather than assuming", /Nothing's labelled/.test(W.words(v)), W.words(v));
}

sec("Nothing recorded says nothing, calmly");
{
  const v = W.look({}, MON, 8);
  ok("no fuss", v.used === 0 && v.total === 0);
  ok("and no invented concern", v.concern === "");
  ok("junk doesn't crash it", typeof W.words(W.look(null, MON, 8)) === "string");
}

sec("Nothing here knows what a job is");
{
  const src = fs.readFileSync(`${REPO}/public/weekend.js`,"utf8");
  const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("no areas are hard-coded", !/"work"|"personal"|"professional"|'work'/i.test(code),
     (code.match(/"work"|"personal"|"professional"/i)||[])[0]);
  ok("nothing school-specific", !/lesson|marking|pupil|teacher/i.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
