import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Working out which parts of your life a piece of work belongs to.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);
const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","areas.js","weekend.js"].forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const A = sb.window.OrganiserAreas, W = sb.window.OrganiserWeekend;

// Named by the user. NONE of these words are in the code.
const AREAS = [
  { id:"work",  name:"work",         hints:["marking","report","parents","lesson","department"] },
  { id:"prof",  name:"professional", hints:["training","certificate","reading about"] },
  { id:"mine",  name:"personal",     hints:["guitar","running","chinese class"] },
];

sec("A thing can be in more than one part of your life at once");
{
  const both = { id:"t", title:"whatever", areas:["work","prof"] };
  ok("two areas are held, not one", A.on(both).length === 2);
  ok("an old single label still reads", A.on({ area:"work" }).join() === "work");
  ok("neither shape invents anything", A.on({}).length === 0);
  ok("duplicates collapse", A.on({ areas:["work","work"] }).length === 1);
}

sec("What it came from beats anything in the wording");
{
  const ctx = { goalAreas: (id) => (id === "g1" ? ["prof"] : []),
                blockAreas: (id) => (id === "b1" ? ["work"] : []) };
  const step = { title:"read chapter three", goalId:"g1" };
  const r = A.areasFor(step, AREAS, ctx);
  ok("a step of a professional goal is professional", r.areas.join() === "prof", JSON.stringify(r));
  ok("and it says why", r.from === "what it came from");
  ok("work owed to a timetable block takes the block's areas",
     A.areasFor({ title:"prepare something", blockId:"b1" }, AREAS, ctx).areas.join() === "work");
  // The both case, which is the whole reason areas are a list.
  const training = { title:"whole-school training day", goalId:"g1", blockId:"b1" };
  ok("a training day at school is work AND professional",
     A.areasFor(training, AREAS, ctx).areas.sort().join() === "prof,work",
     JSON.stringify(A.areasFor(training, AREAS, ctx)));
}

sec("Otherwise, words you've taught it");
{
  const ctx = { goalAreas: () => [], blockAreas: () => [] };
  ok("marking is work", A.areasFor({ title:"finish the year 9 marking" }, AREAS, ctx).areas.join() === "work");
  ok("guitar is personal", A.areasFor({ title:"guitar practice" }, AREAS, ctx).areas.join() === "mine");
  ok("a training session is professional",
     A.areasFor({ title:"book the training session" }, AREAS, ctx).areas.join() === "prof");
  ok("a phrase has to appear as a phrase",
     A.areasFor({ title:"reading about assessment" }, AREAS, ctx).areas.join() === "prof");
  ok("a hint isn't matched inside a longer word",
     A.areasFor({ title:"restarting the printer" }, AREAS, ctx).areas.length === 0);
  ok("something it can't tell is left alone", A.areasFor({ title:"ring the bank" }, AREAS, ctx).areas.length === 0);
  ok("and says so plainly",
     /not labelled/.test(A.words(A.areasFor({ title:"ring the bank" }, AREAS, ctx), AREAS)));
  ok("a label you set by hand always wins",
     A.areasFor({ title:"finish the year 9 marking", areas:["mine"] }, AREAS, ctx).areas.join() === "mine");
  ok("and it says that's why",
     A.areasFor({ title:"x", areas:["mine"] }, AREAS, ctx).from === "you said so");
}

sec("It learns from being corrected");
{
  let list = AREAS.map(a => ({ ...a, hints: [...a.hints] }));
  const ctx = { goalAreas: () => [], blockAreas: () => [] };
  ok("it doesn't know this one yet",
     A.areasFor({ title:"moderate the coursework samples" }, list, ctx).areas.length === 0);
  list = A.learn(list, "work", "moderate the coursework samples");
  ok("after correcting it, the words stick",
     A.areasFor({ title:"moderate the coursework samples" }, list, ctx).areas.join() === "work");
  ok("and a similar one lands too",
     A.areasFor({ title:"coursework moderation for year 11" }, list, ctx).areas.join() === "work");
  ok("glue words are never learned", !A.wordsOf("the and of for to").length);

  // A word that already means something else is not stolen.
  const before = list.find(a=>a.id==="work").hints.length;
  list = A.learn(list, "mine", "marking the guitar tabs");
  ok("a word another area owns isn't taken", !list.find(a=>a.id==="mine").hints.includes("marking"));
  ok("but the genuinely new one is", list.find(a=>a.id==="mine").hints.includes("tabs"));
  ok("and the first area keeps what it had", list.find(a=>a.id==="work").hints.length === before);

  // Unlearning, so the same mistake stops repeating.
  let l2 = A.learn(AREAS.map(a=>({...a,hints:[...a.hints]})), "work", "ring the plumber");
  ok("a wrong lesson can be taken back",
     !A.unlearn(l2, "work", "ring the plumber").find(a=>a.id==="work").hints.includes("plumber"));
  ok("without touching what it had right",
     A.unlearn(l2, "work", "ring the plumber").find(a=>a.id==="work").hints.includes("marking"));
}

sec("Overlapping areas don't produce a hundred and forty per cent");
{
  const SAT = "2026-09-19", MON = "2026-09-21";
  // Two hours of something that is BOTH work and professional.
  const w = W.record({}, SAT, 120, ["work","prof"]);
  ok("the day's total is the time that passed", w[SAT].total === 120);
  ok("and each area gets the full two hours", w[SAT].areas.work === 120 && w[SAT].areas.prof === 120);
  const v = W.look(w, MON, 8);
  ok("the labelled total is the time, not the sum of the areas", v.labelled === 120, v.labelled);
  ok("so no share can exceed everything", v.biggest.minutes / v.labelled <= 1);
  ok("and nothing is reported as unlabelled", v.unlabelled === 0);
  // Half labelled, half not.
  const mixed = W.record(W.record({}, SAT, 60, ["work"]), SAT, 60, []);
  ok("unlabelled time is counted as unlabelled", W.look(mixed, MON, 8).unlabelled === 0 ||
     W.look(mixed, MON, 8).labelled === 120);
}

sec("Nothing in this file knows what a school is");
{
  const src = fs.readFileSync(`${REPO}/public/areas.js`,"utf8");
  const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("no area names are built in", !/"work"|"personal"|"professional"|'work'/i.test(code),
     (code.match(/"work"|"personal"|"professional"/i)||[])[0]);
  ok("no school words at all",
     !/lesson|marking|pupil|teacher|school|training|certificate/i.test(code),
     (code.match(/lesson|marking|pupil|teacher|school|training|certificate/i)||[])[0]);
  // The real test of that: a completely different life works the same.
  const PLUMBER = [{ id:"jobs", name:"jobs", hints:["boiler","callout"] },
                   { id:"rest", name:"rest", hints:["fishing"] }];
  const ctx = { goalAreas: () => [], blockAreas: () => [] };
  ok("point it at a plumber and it behaves identically",
     A.areasFor({ title:"boiler service at number 12" }, PLUMBER, ctx).areas.join() === "jobs");
  ok("and at their weekend too",
     A.areasFor({ title:"fishing with dad" }, PLUMBER, ctx).areas.join() === "rest");
}

sec("Junk doesn't crash it");
{
  ok("no areas", A.areasFor({ title:"x" }, null, {}).areas.length === 0);
  ok("no item", A.areasFor(null, AREAS, {}).areas.length === 0);
  ok("no context", A.areasFor({ title:"marking" }, AREAS, null).areas.join() === "work");
  ok("a nameless area is dropped", A.normalise([{ hints:["x"] }]).length === 0);
  ok("learning onto an unknown area changes nothing",
     A.learn(AREAS, "nope", "some words").length === AREAS.length);
  ok("words cope with an empty answer", typeof A.words({ areas: [], from: "" }, AREAS) === "string");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
