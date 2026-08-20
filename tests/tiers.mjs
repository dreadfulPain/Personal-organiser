import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Committed work vs optional work, and going round a list one at a time.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["schedule.js","priority.js","dayplan.js","weekplan.js","goalplan.js","rota.js","told.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const S = sb.window.OrganiserSchedule, DP = sb.window.OrganiserDayPlan,
      WP = sb.window.OrganiserWeekPlan, PR = sb.window.OrganiserPriority, R = sb.window.OrganiserRota;

const MON = "2026-09-14", FRI = "2026-09-18";
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
const CTX = { today: MON, goalTitle: () => "" };
const QUIET = [{ id:"l", label:"A couple of lessons", start:"09:00", end:"11:00", days:[1,2,3,4,5] }];
// Heavy but survivable: one 100-minute stretch a day, nothing like enough for
// the pile of commitments. If it left NO room at all the test would prove
// nothing — of course optional work is withdrawn from a day with no minutes.
const BRUTAL = [{ id:"a", label:"Morning", start:"08:30", end:"11:30", days:[1,2,3,4,5] },
                { id:"b", label:"Afternoon", start:"13:10", end:"16:45", days:[1,2,3,4,5] }];
const mk = (o) => ({ type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal",
  effort:"medium", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false,
  notBefore:"", spentMinutes:0, optional:false, ...o });

sec("Optional work never outranks work you're committed to");
{
  const items = [
    mk({ id:"opt", title:"nice to have", date:MON, deadlineType:"hard", importance:"high", optional:true }),
    mk({ id:"com", title:"committed",    date:FRI, deadlineType:"soft" }),
  ];
  const order = PR.forPlanning(items, CTX).map(i=>i.id);
  ok("a high-importance optional still sits behind an ordinary commitment",
     order.indexOf("com") < order.indexOf("opt"), order.join(","));
  ok("optional work is never nagged about on Home", !PR.ordered(items, CTX).some(i=>i.id==="opt"));
  ok("committed work still is", PR.ordered(items, CTX).some(i=>i.id==="com"));
}

sec("Optional work is never booked into a future day");
{
  const items = [mk({ id:"o", title:"someday", date:FRI, deadlineType:"hard", optional:true })];
  const s = WP.spread(items, QUIET, CFG, MON, 7, CTX);
  ok("the week doesn't reserve time for it", s.placements.length === 0, JSON.stringify(s.placements));
  ok("and doesn't warn about it either", s.wontFit.length === 0);
}

sec("The tap: room means room over the weeks, not room today");
{
  const spare = WP.pressure([mk({ id:"a", title:"one job", date:FRI, deadlineType:"hard" })],
    QUIET, CFG, MON, 14, CTX);
  ok("a quiet fortnight has room", spare.verdict === "room", spare.verdict);
  ok("and says roughly how much a day", spare.perDay > 0);
  ok("in plain words", /a day spare/.test(spare.because), spare.because);

  const packed = WP.pressure(
    Array.from({length:30},(_,i)=>mk({ id:"p"+i, title:"job "+i, date:FRI, deadlineType:"hard", effort:"draining" })),
    BRUTAL, CFG, MON, 14, CTX);
  ok("a fortnight that can't hold its commitments has no room", packed.verdict === "over", packed.verdict);
  ok("and says why", /won't fit before/.test(packed.because), packed.because);
}

sec("The tap actually opens and closes the day plan");
{
  const opt = mk({ id:"o", title:"the optional one", effort:"quick", optional:true });
  const quiet = DP.build([opt, mk({ id:"c", title:"committed", date:MON })], QUIET, CFG, MON, { ctx: CTX });
  ok("on a quiet run it's offered", quiet.slots.some(s=>s.itemId==="o"),
     JSON.stringify(quiet.slots.map(s=>s.itemId)));

  const heavy = [opt, ...Array.from({length:30},(_,i)=>
    mk({ id:"p"+i, title:"job "+i, date:FRI, deadlineType:"hard", effort:"draining" }))];
  const busy = DP.build(heavy, BRUTAL, CFG, MON, { ctx: CTX });
  ok("under pressure it's withdrawn", !busy.slots.some(s=>s.itemId==="o"),
     JSON.stringify(busy.slots.map(s=>s.itemId)));
  ok("and the committed work still gets planned", busy.slots.length > 0);

  // It must come back on its own, without anyone remembering it exists.
  const eased = DP.build([opt, mk({ id:"c", title:"committed", date:MON })], QUIET, CFG, MON, { ctx: CTX });
  ok("when the pressure lifts it returns by itself", eased.slots.some(s=>s.itemId==="o"));
}

sec("A quiet day inside a brutal fortnight isn't an invitation");
{
  // Today is free; the next fortnight is not. The tap should stay shut.
  const sched = [{ id:"today", label:"free today", start:"09:00", end:"09:30", days:[1] },
                 { id:"rest",  label:"Wall to wall", start:"08:30", end:"16:45", days:[2,3,4,5] }];
  const items = [mk({ id:"o", title:"optional", effort:"quick", optional:true }),
    ...Array.from({length:25},(_,i)=>mk({ id:"p"+i, title:"job "+i, date:"2026-09-25",
      deadlineType:"hard", effort:"draining" }))];
  const plan = DP.build(items, sched, CFG, MON, { ctx: CTX });
  ok("a free Monday doesn't unlock optional work", !plan.slots.some(s=>s.itemId==="o"),
     JSON.stringify(plan.slots.map(s=>s.itemId)));
}

sec("Going round a list, one at a time");
{
  const rota = { id:"r1", title:"one-to-ones", memberIds:["a","b","c","d"], perDay:1,
    minutes:10, everyDays:8, lastDone:{} };
  ok("nobody seen yet means everyone is waiting", R.state(rota, MON).seen === 0);
  ok("and the queue holds all of them", R.queue(rota, MON).length === 4);
  ok("one a day is offered", R.due(rota, MON).length === 1);

  // Go round properly: a, b, c, d on consecutive days.
  let r = rota;
  ["2026-09-14","2026-09-15","2026-09-16","2026-09-17"].forEach((d) => {
    const next = R.due(r, d)[0];
    r = R.mark(r, next.id, d);
  });
  ok("everyone got a turn", Object.keys(R.normalise(r).lastDone).length === 4);
  ok("and the one seen longest ago is next", R.due(r, "2026-09-18")[0].id === "a",
     JSON.stringify(R.due(r, "2026-09-18")));

  // A day gets eaten: 'b' was up and didn't happen.
  const missed = R.mark(rota, "a", "2026-09-14");   // only a got done
  const nextDay = R.due(missed, "2026-09-15")[0];
  ok("the missed one is still at the front the next day", nextDay.id === "b", nextDay.id);
  ok("and nobody else lost their place",
     R.queue(missed, "2026-09-15").map(x=>x.id).join(",") === "b,c,d,a",
     R.queue(missed, "2026-09-15").map(x=>x.id).join(","));

  // Longest-waiting first is the ONLY rule, and it makes make-ups automatic.
  let r2 = { ...rota, lastDone:{ a:"2026-09-01", b:"2026-09-10", c:"2026-09-11", d:"2026-09-12" } };
  ok("the one waiting longest comes back round first", R.due(r2, MON)[0].id === "a");
  ok("overdue is reported without blame", R.overdue(r2, MON).map(x=>x.id).join(",") === "a");
}

sec("A rota turn is ordinary work the day plan understands");
{
  const rota = { id:"r1", title:"one-to-ones", memberIds:["a","b"], perDay:1, minutes:10, everyDays:14 };
  const t = R.taskFor(rota, "a", "Ten minutes with a", MON);
  ok("it's optional by default", t.optional === true);
  ok("it carries its size", t.plannedMinutes === 10 && t.effort === "quick");
  ok("it's for today, softly", t.date === MON && t.deadlineType === "soft");
  ok("it remembers who it was for", t.rotaMemberId === "a" && t.rotaId === "r1");
  const longer = R.taskFor({ ...rota, minutes: 60 }, "a", "x", MON);
  ok("a longer turn is sized accordingly", longer.effort === "draining");
  ok("a rota can be made committed if you decide it is",
     R.taskFor({ ...rota, optional:false }, "a", "x", MON).optional === false);
}

sec("Junk doesn't crash any of it");
{
  ok("no rota", R.due(null, MON).length === 0);
  ok("empty members", R.normalise({ id:"x", memberIds: [] }) === null);
  ok("rubbish lastDone is dropped", Object.keys(R.normalise({ id:"x", memberIds:["a"],
     lastDone:{ a:"not a date" } }).lastDone).length === 0);
  ok("marking someone not on the list changes nothing",
     R.mark({ id:"x", memberIds:["a"] }, "zz", MON).lastDone === undefined ||
     !R.normalise(R.mark({ id:"x", memberIds:["a"] }, "zz", MON)).lastDone.zz);
  ok("pressure copes with nothing", WP.pressure([], QUIET, CFG, MON, 14, CTX).verdict === "room");
  ok("pressure copes with junk", WP.pressure([null, {}], QUIET, CFG, MON, 14, CTX).verdict === "room");
  ok("taskFor on a bad rota is null", R.taskFor(null, "a", "x", MON) === null);
}

sec("Nothing here knows what a school is");
{
  ["rota.js"].forEach((f) => {
    const src = fs.readFileSync(`${REPO}/public/${f}`,"utf8");
    const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok(`no school words in ${f}`, !/lesson|pupil|student|teacher|parent|class/i.test(code),
       (code.match(/lesson|pupil|student|teacher|parent|class/i)||[])[0]);
  });
}


sec("Groups of information, kept fresh — the two mechanisms composing");
{
  // The design, in data: one rota PER KIND OF INFORMATION. Its cycle is how
  // long that kind stays true for, and whether it's committed or optional is
  // whether you must have it or would merely like it.
  //
  // Nothing new is needed for "remind me to update the friends list" — a thing
  // that goes out of date every few weeks IS a rota with a short cycle.
  const people = ["p1","p2","p3","p4","p5"];
  const MUST = { id:"marks", title:"marks and work", memberIds:people, perDay:2,
    minutes:15, everyDays:30, optional:false, lastDone:{} };
  const SOFT = { id:"social", title:"how they're getting on", memberIds:people, perDay:1,
    minutes:10, everyDays:21, optional:true, lastDone:{} };

  ok("a must-have set makes committed work", R.taskFor(MUST, "p1", "x", MON).optional === false);
  ok("a nice-to-have set makes optional work", R.taskFor(SOFT, "p1", "x", MON).optional === true);

  // The must-have work is planned whatever the pressure; the nice-to-have isn't.
  const items = [
    { ...R.taskFor(MUST, "p1", "marks: p1", MON), id:"m1" },
    { ...R.taskFor(SOFT, "p1", "social: p1", MON), id:"s1" },
    ...Array.from({length:30},(_,i)=>mk({ id:"p"+i, title:"job "+i, date:FRI,
      deadlineType:"hard", effort:"draining" })),
  ];
  const busy = DP.build(items, BRUTAL, CFG, MON, { ctx: CTX });
  ok("under pressure the must-have collection still happens",
     busy.slots.some(s=>s.itemId==="m1"), JSON.stringify(busy.slots.map(s=>s.itemId)));
  ok("and the nice-to-have quietly stands down", !busy.slots.some(s=>s.itemId==="s1"));

  const calm = DP.build([items[0], items[1]], QUIET, CFG, MON, { ctx: CTX });
  ok("when there's room, both are offered",
     calm.slots.some(s=>s.itemId==="m1") && calm.slots.some(s=>s.itemId==="s1"),
     JSON.stringify(calm.slots.map(s=>s.itemId)));

  // Going out of date is just a cycle that has come round again.
  const stale = { ...SOFT, lastDone: { p1:"2026-08-01", p2:"2026-09-10", p3:"2026-09-11",
    p4:"2026-09-12", p5:"2026-09-13" } };
  ok("something noted six weeks ago comes back round",
     R.overdue(stale, MON).map(x=>x.id).join(",") === "p1", JSON.stringify(R.overdue(stale, MON)));
  ok("and recent ones are left alone", R.state(stale, MON).seen === 4, JSON.stringify(R.state(stale, MON)));
  ok("it counts rather than scoring you out of five",
     R.state(stale, MON).total === 5 && typeof R.state(stale, MON).seen === "number");

  // Different kinds go stale at different rates, which is the whole point.
  const slow = { ...MUST, everyDays: 90, lastDone: { p1:"2026-07-01" } };
  const fast = { ...SOFT, everyDays: 14, lastDone: { p1:"2026-07-01" } };
  ok("a slow-changing kind isn't nagged as often", R.overdue(slow, "2026-09-14").length <= 5);
  ok("a fast-changing one comes round sooner",
     R.overdue(fast, MON).length >= R.overdue(slow, MON).length);
}


sec("Optional is where it came from; droppable is whether you can still walk away");
{
  const paidCourse = mk({ id:"c1", title:"IB module 2", optional:true, committed:true, date:FRI, deadlineType:"hard" });
  const appointment = mk({ id:"c2", title:"see the mentor", optional:true, promisedTo:"Helen", date:FRI });
  const pinned = mk({ id:"c3", title:"booked slot", optional:true, time:"14:00", date:MON });
  const idle = mk({ id:"c4", title:"might read that book", optional:true });

  ok("a course you paid for is not droppable", !PR.droppable(paidCourse));
  ok("an appointment with someone is not droppable", !PR.droppable(appointment));
  ok("a time you set yourself is not droppable", !PR.droppable(pinned));
  ok("a genuine nice-to-have is", PR.droppable(idle));
  ok("ordinary work was never droppable anyway", !PR.droppable(mk({ id:"x" })));

  // Under real pressure the loose one goes and the committed ones stay.
  const heavy = [paidCourse, appointment, idle,
    ...Array.from({length:30},(_,i)=>mk({ id:"p"+i, title:"job "+i, date:FRI,
      deadlineType:"hard", effort:"draining" }))];
  const plan = DP.build(heavy, BRUTAL, CFG, MON, { ctx: CTX });
  const ids = plan.slots.map(s=>s.itemId);
  ok("the loose nice-to-have stands down", !ids.includes("c4"), ids.join(","));
  ok("but the course you paid for is not quietly dropped",
     ids.includes("c1") || WP.spread(heavy, BRUTAL, CFG, MON, 14, CTX).wontFit.some(w=>w.itemId==="c1"),
     ids.join(","));
  ok("and it's never simply invisible — it's planned or it's flagged",
     ids.includes("c1") || WP.trouble(heavy, BRUTAL, CFG, MON, 30, CTX).some(t=>t.itemId==="c1"));
  ok("Home shows a committed optional like anything else",
     PR.ordered(heavy, CTX).some(i=>i.id==="c1"));
  ok("and still says nothing about the loose one", !PR.ordered(heavy, CTX).some(i=>i.id==="c4"));
  ok("the week books a committed optional", WP.spread([paidCourse], QUIET, CFG, MON, 14, CTX).placements.length > 0);
  ok("and still refuses to book a loose one", WP.spread([mk({ id:"c4", optional:true, date:FRI })],
     QUIET, CFG, MON, 14, CTX).placements.length === 0);
}

sec("When they can't make it, not when you can't");
{
  const rota = { id:"r", title:"turns", memberIds:["a","b","c"], perDay:1, minutes:10, everyDays:9, lastDone:{} };
  // YOUR day fell apart: nothing is recorded, and they stay up.
  ok("a day you lost costs them nothing", R.due(rota, "2026-09-15")[0].id === "a");

  // THEY couldn't make it: they keep their place, and the attempt is noted.
  const t1 = R.tryFailed(rota, "a", MON);
  ok("they keep their place", R.due(t1, "2026-09-15")[0].id === "a");
  ok("and the attempt is remembered", R.queue(t1, MON)[0].tries === 1);
  ok("you're told who to ask instead", R.insteadOf(t1, "a", MON).id === "b");

  // The swap happens; the swapped-in person doesn't lose out later.
  const t2 = R.mark(t1, "b", MON);
  ok("after the swap the one who missed is still first", R.due(t2, "2026-09-15")[0].id === "a");
  ok("and the one who stepped in isn't punished for it — they're just recent",
     R.queue(t2, "2026-09-15").map(x=>x.id).indexOf("b") === 2,
     R.queue(t2, "2026-09-15").map(x=>x.id).join(","));

  // Three misses is a fact about the time slot, not about the person.
  let t3 = rota;
  ["2026-09-14","2026-09-15","2026-09-16"].forEach(d => { t3 = R.tryFailed(t3, "a", d); });
  ok("a slot that never works for someone is noticed", R.neverCatching(t3, 3).map(x=>x.id).join(",") === "a");
  ok("one miss isn't", R.neverCatching(t1, 3).length === 0);
  ok("a turn that finally happens clears the tally",
     R.neverCatching(R.mark(t3, "a", "2026-09-17"), 3).length === 0);
}

sec("What you told them stays on the screen");
{
  const T = sb.window.OrganiserTold;
  let log = [];
  log = T.add(log, { who:"p1", to:"his mum", said:"reading has come on a lot this term", how:"at the evening" }, MON);
  log = T.add(log, { who:"p1", to:"head of year", said:"still quiet in class" }, "2026-09-10");
  ok("it keeps what you said", T.forPerson(log, "p1").length === 2);
  ok("newest first", T.lastToldAbout(log, "p1").date === MON);
  ok("it holds an id, never a name", T.forPerson(log, "p1").every(e => e.who === "p1"));
  ok("an entry about nobody is refused", T.add([], { said:"something" }, MON).length === 0);
  ok("an entry saying nothing is refused", T.add([], { who:"p1" }, MON).length === 0);
  ok("junk doesn't crash it", T.recent(null).length === 0 && T.forPerson(undefined, "p1").length === 0);
  ok("what may be shown elsewhere is a count and a date only",
     JSON.stringify(Object.keys(T.summary(log, "p1")).sort()) === '["count","last"]');
  ok("and that count is right", T.summary(log, "p1").count === 2);

  // The promise, enforced rather than intended.
  const src = fs.readFileSync(`${REPO}/public/told.js`,"utf8");
  ok("nothing in it builds a document", !/download|blob|csv|\.html|docShell|export/i.test(src.replace(/\/\/.*$/gm,"")));
  ok("nothing in it fetches or posts anywhere", !/fetch\(|XMLHttpRequest|navigator\.|clipboard/i.test(src));
  const diag = fs.readFileSync(`${REPO}/server.js`,"utf8");
  ok("the diagnostic report has never heard of it", !/OrganiserTold|\btold\b/i.test(
     (/function handleReport[\s\S]{0,4000}/.exec(diag)||[""])[0]));
}


sec("What you know besides the marks, and how old it is");
{
  vm.runInContext(fs.readFileSync(`${REPO}/public/pastoral.js`,"utf8"), sb);
  const P = sb.window.OrganiserPastoral;
  const TOPICS = [
    { id:"t1", label:"how they're getting on", staysFreshDays: 21, essential:false, upFront:true },
    { id:"t2", label:"marks and work",         staysFreshDays: 60, essential:true },
  ];
  let notes = [];
  notes = P.add(notes, { who:"p1", topicId:"t1", said:"sits with the same three, seems settled" }, "2026-08-01");
  notes = P.add(notes, { who:"p1", topicId:"t2", said:"steady 4s" }, "2026-09-10");

  const f = P.freshness(notes, TOPICS, "p1", MON);
  ok("a note from six weeks ago is worth checking again",
     f.find(x=>x.topic.id==="t1").state === "worth checking again", JSON.stringify(f.map(x=>x.state)));
  ok("a recent one on a slow-changing topic is left alone",
     f.find(x=>x.topic.id==="t2").state === "recent");
  ok("a topic never asked says exactly that",
     P.freshness([], TOPICS, "p1", MON).every(x=>x.state === "never asked"));
  ok("it says how old, in days", f.find(x=>x.topic.id==="t1").ageDays > 40);

  const g = P.gaps(notes, TOPICS, "p1", MON);
  ok("gaps leaves out what's still fresh", !g.some(x=>x.topic.id==="t2"));
  ok("and lists what's gone stale", g.some(x=>x.topic.id==="t1"));
  const g2 = P.gaps([], TOPICS, "p1", MON);
  ok("a must-have never asked comes before a nice-to-have never asked",
     g2[0].topic.id === "t2", JSON.stringify(g2.map(x=>x.topic.id)));

  ok("what leaves this module is counts only",
     JSON.stringify(Object.keys(P.summary(notes, TOPICS, "p1", MON)).sort())
       === '["neverAsked","notes","recent","topics"]');
  ok("a note about nobody is refused", P.add([], { said:"x" }, MON).length === 0);
  ok("a note saying nothing is refused", P.add([], { who:"p1" }, MON).length === 0);
  ok("junk doesn't crash it", P.freshness(null, null, "p1", MON).length === 0);

  const src = fs.readFileSync(`${REPO}/public/pastoral.js`,"utf8");
  ok("nothing in it builds a document", !/download|blob|csv|docShell|\bexport\b/i.test(src.replace(/\/\/.*$/gm,"")));
  ok("nothing in it sends anywhere", !/fetch\(|XMLHttpRequest|navigator\.|clipboard/i.test(src));
}

sec("The chart obeys the rules it claims to");
{
  vm.runInContext(fs.readFileSync(`${REPO}/public/chart.js`,"utf8"), sb);
  const CH = sb.window.OrganiserChart;
  const one = CH.overTime([{ name:"Reading", points:[
    { x:"2026-09-01", y:1, label:"working towards" }, { x:"2026-09-14", y:3, label:"secure" }] }],
    { yMin:1, yMax:4 });
  ok("one line needs no legend box", !/ch-key/.test(one));
  ok("but is still labelled on the chart", /Reading<\/text>/.test(one));
  ok("the figures are always there too", /ch-table/.test(one) && /secure/.test(one));
  ok("points carry their own value for hovering", /<title>Reading —/.test(one));
  ok("lines are 2px", /stroke-width="2"/.test(one));
  ok("markers are ringed in the surface colour so overlaps stay separate",
     /stroke="#faf7f2" stroke-width="2"/.test(one));

  const four = CH.overTime([0,1,2,3].map(i=>({ name:"S"+i,
    points:[{x:"2026-09-01",y:1},{x:"2026-09-14",y:i+1}] })), { yMin:1, yMax:4 });
  ok("more than one line gets a legend", /ch-key/.test(four));
  ok("and every one is still labelled directly", ["S0","S1","S2","S3"].every(n=>four.includes(n+"</text>")));
  ok("the fixed colour order is used, never cycled",
     CH.colourOf(0) === "#00806a" && CH.colourOf(1) === "#c06a00" && CH.colourOf(2) === "#3a6bb5");
  ok("a fifth line is not given an invented colour", CH.colourOf(4) === "#726c63");
  ok("nothing red anywhere", !/#(e|f)[0-9a-f]{2}[0-3][0-9a-f]{3}/i.test(four));
  ok("no data at all says so plainly", /Nothing recorded yet/.test(CH.overTime([], {})));
  ok("junk doesn't crash it", typeof CH.overTime(null, null) === "string");
  ok("a headline fact is a fact, not a chart", /ch-tval/.test(CH.tile("x", "3", "of 4")));
  ok("values are escaped", CH.tile("x", "<script>", "").includes("&lt;script&gt;"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
