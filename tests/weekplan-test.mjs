import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Spreading work across a week and a month.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,400):""));} };
const sec=(s)=>console.log("\n"+s);

function load() {
  const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  sb.globalThis = sb; vm.createContext(sb);
  ["schedule.js","priority.js","dayplan.js","weekplan.js"].forEach(f =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
  return sb.window;
}
const W = load();
const S = W.OrganiserSchedule, DP = W.OrganiserDayPlan, WP = W.OrganiserWeekPlan;

const MON="2026-09-14", TUE="2026-09-15", WED="2026-09-16", THU="2026-09-17", FRI="2026-09-18";
const CFG = { dayStart:"08:00", dayEnd:"17:00" };
const CTX = { today: MON, goalTitle: () => "" };
// Wednesday is wall-to-wall; Friday is wide open.
const SCHED = [
  { id:"a", label:"Lessons", start:"09:00", end:"12:00", days:[1,2,4] },
  { id:"b", label:"All day",  start:"08:00", end:"16:55", days:[3] },
];
const base = { type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal",
  effort:"draining", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false };
const mk = (o) => ({ ...base, ...o });
const titleOf = (list, id) => (list.find(i=>i.id===id)||{}).title;

sec("It books work in before it's due, not on the day");
{
  const items = [mk({ id:"big", title:"big thing", date:FRI, deadlineType:"hard" })];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  ok("the Friday job is placed", p.placements.length === 1);
  ok("and placed before Friday", p.placements[0].iso < FRI, p.placements[0].iso);
  ok("it's marked as being done early", p.placements[0].early === true);
  ok("nothing is reported as impossible", p.wontFit.length === 0);
}

sec("Soonest deadline goes first, and the big one claims the long stretch");
{
  const items = [
    mk({ id:"fri", title:"due friday", date:FRI, deadlineType:"hard" }),
    mk({ id:"tue", title:"due tuesday", date:TUE, deadlineType:"hard" }),
  ];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  const tue = p.placements.find(x=>x.itemId==="tue"), fri = p.placements.find(x=>x.itemId==="fri");
  ok("both get a slot", !!tue && !!fri);
  ok("the sooner deadline is booked no later than the later one", tue.iso <= fri.iso, `${tue.iso} vs ${fri.iso}`);
  ok("the Tuesday job lands by Tuesday", tue.iso <= TUE, tue.iso);
}

sec("Urgent beats not-urgent, important beats ordinary");
{
  // One long stretch on Monday; only one of these can have it.
  const oneGap = [{ id:"g", label:"Rest of day", start:"10:00", end:"16:55", days:[0,1,2,3,4,5,6] }];
  const first = (list) => {
    const p = WP.spread(list, oneGap, CFG, MON, 5, CTX);
    const mon = p.byDay[MON] || [];
    return mon.length ? titleOf(list, mon[0].itemId) : null;
  };
  ok("a hard deadline goes before a soft one due the same day",
     first([mk({id:"s",title:"soft",date:TUE}), mk({id:"h",title:"hard",date:TUE,deadlineType:"hard"})]) === "hard");
  ok("what you flagged as important goes before what you didn't",
     first([mk({id:"n",title:"ordinary",date:TUE,deadlineType:"hard"}),
            mk({id:"i",title:"important",date:TUE,deadlineType:"hard",importance:"high"})]) === "important");
  ok("a sooner deadline beats a more important later one",
     first([mk({id:"l",title:"important but friday",date:FRI,deadlineType:"hard",importance:"high"}),
            mk({id:"e",title:"ordinary but tuesday",date:TUE,deadlineType:"hard"})]) === "ordinary but tuesday");
  ok("between equals, the big one takes the long stretch first",
     first([mk({id:"sm",title:"small",date:TUE,deadlineType:"hard",effort:"quick"}),
            mk({id:"bg",title:"big",date:TUE,deadlineType:"hard",effort:"draining"})]) === "big");
}

sec("Two jobs never land in the same gap");
{
  const items = [0,1,2,3].map(i=>mk({ id:"j"+i, title:"job "+i, date:FRI, deadlineType:"hard" }));
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  const clash = [];
  Object.values(p.byDay).forEach(day => {
    day.forEach((a,i) => day.slice(i+1).forEach(b => {
      if (a.start < b.start + b.minutes && b.start < a.start + a.minutes) clash.push([a.itemId,b.itemId]);
    }));
  });
  ok("no two placements overlap", clash.length === 0, JSON.stringify(clash));
  // A job may now be booked as several sittings, so count JOBS, not bookings.
  ok("every one of them got somewhere", new Set(p.placements.map(x=>x.itemId)).size === 4, JSON.stringify(p.wontFit));
}

sec("A day that can't hold it is skipped, and a full week says so");
{
  // Wednesday is blocked out entirely; a Wednesday hard deadline can't be met
  // from Wednesday, but CAN be done earlier in the week.
  const items = [mk({ id:"w", title:"due wednesday", date:WED, deadlineType:"hard" })];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  ok("it's placed on a day that actually has room", p.placements.length === 1 && p.placements[0].iso !== WED,
     JSON.stringify(p.placements));

  // Now genuinely impossible: due today, and today is full.
  const p2 = WP.spread([mk({ id:"x", title:"due today", date:WED, deadlineType:"hard" })], SCHED, CFG, WED, 1, { today:WED, goalTitle:()=>"" });
  ok("truly impossible work is reported, not silently dropped", p2.wontFit.length === 1 && p2.placements.length === 0);
  ok("and it says how long it needed", p2.wontFit[0].minutes > 0);
  ok("and that the deadline was a hard one", p2.wontFit[0].hard === true);
}

sec("A soft date is a wish, a hard date is a wall");
{
  const soft = WP.spread([mk({ id:"s", title:"soft", date:WED })], SCHED, CFG, WED, 5, { today:WED, goalTitle:()=>"" });
  ok("a soft one may land after its date rather than be called impossible",
     soft.placements.length === 1 && soft.placements[0].iso > WED, JSON.stringify(soft));
  const hard = WP.spread([mk({ id:"h", title:"hard", date:WED, deadlineType:"hard" })], SCHED, CFG, WED, 5, { today:WED, goalTitle:()=>"" });
  ok("a hard one is never quietly moved past its deadline", hard.placements.length === 0 && hard.wontFit.length === 1);
}

sec("Overdue work goes as soon as there's room");
{
  const items = [mk({ id:"o", title:"overdue", date:"2026-09-01", deadlineType:"hard" })];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  ok("it isn't abandoned for being late", p.placements.length === 1, JSON.stringify(p.wontFit));
  ok("and it's put at the first opportunity", p.placements[0].iso === MON, p.placements[0].iso);
}

sec("Spreading can't pack the week wall to wall");
{
  const items = Array.from({length:40},(_,i)=>mk({ id:"m"+i, title:"job "+i, date:FRI, deadlineType:"hard" }));
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  let over = [];
  p.dates.forEach(iso => {
    const free = S.gapsOn(SCHED, S.normaliseConfig(CFG), iso).reduce((n,g)=>n+(g.end-g.start),0);
    const used = (p.byDay[iso]||[]).reduce((n,x)=>n+x.minutes,0);
    if (free && used > Math.floor(free*(2/3)) + 90) over.push(`${iso}: ${used}/${free}`);
  });
  ok("no day is filled past its ceiling", over.length === 0, over.join(", "));
  ok("the leftovers are named, not lost", p.wontFit.length > 0);
}

sec("It leaves your own decisions alone");
{
  const items = [
    mk({ id:"pin", title:"pinned by hand", date:MON, time:"13:00" }),
    mk({ id:"free", title:"unpinned", date:MON, deadlineType:"hard" }),
  ];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  ok("a hand-set time is never re-planned", !p.placements.some(x=>x.itemId==="pin"));
  const f = p.placements.find(x=>x.itemId==="free");
  const est = S.estimateMinutes(items[0], S.normaliseConfig(CFG)).minutes;
  ok("and the planner doesn't book over it", !f || f.start >= 13*60+est || f.start + f.minutes <= 13*60,
     JSON.stringify(f));
}

sec("Only work with a date gets spread");
{
  const items = [
    mk({ id:"n", title:"no date" }),
    mk({ id:"d", title:"done", date:FRI, done:true }),
    mk({ id:"l", title:"open loop", date:FRI, openLoop:true }),
  ];
  const p = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  ok("undated work is left for the day plan to fill with", p.placements.length === 0 && p.wontFit.length === 0);
  ok("finished work is never re-planned", !p.placements.some(x=>x.itemId==="d"));
  ok("open loops stay out — they have their own home", !p.placements.some(x=>x.itemId==="l"));
}

sec("The day plan acts on what the week says");
{
  const items = [
    mk({ id:"later", title:"due friday", date:FRI, deadlineType:"hard" }),
    mk({ id:"floaty", title:"whenever", effort:"quick" }),
  ];
  const plan = DP.build(items, SCHED, CFG, MON, { ctx: CTX });
  ok("Monday gets on with Friday's big job", plan.slots.some(s=>s.itemId==="later"),
     JSON.stringify(plan.slots.map(s=>s.itemId)));
  ok("and still uses the leftover time for ordinary work", plan.slots.some(s=>s.itemId==="floaty"));
}

sec("Rearranging after something unscripted");
{
  const items = [
    mk({ id:"a1", title:"due thursday", date:THU, deadlineType:"hard" }),
    mk({ id:"a2", title:"due friday",   date:FRI, deadlineType:"hard" }),
  ];
  const before = WP.spread(items, SCHED, CFG, MON, 5, CTX);
  // Monday and Tuesday vanish into a crisis.
  const wrecked = S.normalise(SCHED).concat(
    [MON,TUE].map(d => S.normaliseBlock({ label:"Crisis", start:"08:00", end:"16:55", date:d })));
  const after = WP.spread(items, SCHED.concat(wrecked.filter(b=>b.date)), CFG, MON, 5, CTX);
  ok("it re-plans rather than keeping a dead plan",
     JSON.stringify(before.byDay) !== JSON.stringify(after.byDay));
  ok("and it moves work later, not off a cliff", after.placements.length >= 1, JSON.stringify(after.wontFit));
  ok("every remaining placement is on a day that survived",
     after.placements.every(p => p.iso !== MON && p.iso !== TUE), JSON.stringify(after.placements));
}

sec("The month is the same question, asked over more days");
{
  const far = "2026-10-09";
  const items = [mk({ id:"far", title:"due next month", date:far, deadlineType:"hard" })];
  const wk = WP.spread(items, SCHED, CFG, MON, 7, CTX);
  const mo = WP.spread(items, SCHED, CFG, MON, 35, CTX);
  ok("a week's view doesn't pretend to plan next month", wk.placements.length === 0 && wk.wontFit.length === 0);
  ok("a month's view places it", mo.placements.length === 1, JSON.stringify(mo.wontFit));
  ok("and not after it's due", mo.placements[0].iso <= far);
  ok("the horizon is capped so a silly number can't hang it", WP.spread(items, SCHED, CFG, MON, 99999, CTX).days === 180);
}

sec("Finding one job a day counts what's already there");
{
  const three = [0,1,2].map(i=>mk({ id:"t"+i, title:"big job "+i }));
  const placed = [];
  const spots = three.map(it => {
    const r = WP.nextDayWithRoom(it, three.concat(placed), SCHED, CFG, MON);
    if (r) { it.date = r.iso; it.time = S.toHM(r.start); placed.push(it); }
    return r;
  });
  ok("all three find a home", spots.every(Boolean));
  ok("and no two are sent to the same minute of the same day",
     new Set(spots.map(s=>s.iso+" "+s.start)).size === 3, JSON.stringify(spots));
  ok("it never offers today — the point is a different day", spots.every(s=>s.iso > MON));
  const huge = WP.nextDayWithRoom(mk({ id:"huge", effort:"draining" }), [], [
    { id:"z", label:"Everything", start:"08:00", end:"16:55", days:[0,1,2,3,4,5,6] }], CFG, MON, 5);
  ok("a job that fits nowhere returns nothing rather than guessing", huge === null);
}

sec("Junk doesn't crash it");
{
  ok("no items", WP.spread([], SCHED, CFG, MON, 5, CTX).placements.length === 0);
  ok("no schedule", WP.spread([mk({id:"a",date:FRI})], [], CFG, MON, 5, CTX).placements.length === 1);
  ok("no config", WP.spread([mk({id:"a",date:FRI})], SCHED, null, MON, 5, CTX).placements.length >= 0);
  ok("rubbish items are skipped", WP.spread([null, undefined, {}, mk({id:"a",date:FRI})], SCHED, CFG, MON, 5, CTX).placements.length === 1);
  ok("zero days still answers", WP.spread([mk({id:"a",date:FRI})], SCHED, CFG, MON, 0, CTX).days === 1);
  // It returns itemId -> minutes for today, so the day plan knows a big job is
  // one SITTING today, not the whole thing.
  const st = WP.startToday([mk({id:"a",date:MON,deadlineType:"hard"})], SCHED, CFG, MON, CTX);
  ok("startToday says how many minutes, not just which jobs", st instanceof Map);
  ok("and the minutes are real", st.get("a") > 0, JSON.stringify([...st]));
}

sec("Nothing here knows what a school is");
{
  const src = fs.readFileSync(`${REPO}/public/weekplan.js`,"utf8");
  const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("no school words in the code", !/lesson|pupil|student|teacher|class|marking|essay|parent/i.test(code),
     (code.match(/lesson|pupil|student|teacher|class|marking|essay|parent/i)||[])[0]);
  ok("no person's name", !/helen|zhou|王/i.test(code));
}


sec("Work that can't be started yet");
{
  const dep = (o) => mk({ id:"d", title:"the follow-up", date:FRI, deadlineType:"hard", notBefore:WED, ...o });
  const p = WP.spread([dep()], SCHED, CFG, MON, 7, CTX);
  ok("it isn't booked before it's possible", p.placements[0] && p.placements[0].iso >= WED,
     JSON.stringify(p.placements));
  ok("but it still gets done before its deadline", p.placements[0].iso <= FRI);

  // On the day the wait clears, late in the day — the thing it waits on
  // happens at some unknown point that day.
  const oneDay = [{ id:"x", label:"Lesson", start:"09:00", end:"10:00", days:[0,1,2,3,4,5,6] }];
  const q = WP.spread([mk({ id:"u", title:"after it", date:FRI, deadlineType:"hard", notBefore:WED, effort:"quick" })],
    oneDay, CFG, MON, 7, CTX);
  const onDay = q.placements[0];
  ok("on the unblock day it goes late, not first thing", onDay.iso === WED && onDay.start > 12*60,
     `${onDay.iso} ${S.toHM(onDay.start)}`);

  // A contradiction is a misread, not a reason to strand the work.
  const bad = WP.spread([mk({ id:"b", title:"nonsense", date:TUE, deadlineType:"hard", notBefore:FRI })], SCHED, CFG, MON, 7, CTX);
  ok("notBefore after the deadline is ignored, not obeyed", bad.placements.length === 1 && bad.placements[0].iso <= TUE,
     JSON.stringify(bad));

  // The day plan and Home agree with the week.
  const items = [mk({ id:"blocked", title:"can't yet", date:FRI, deadlineType:"hard", notBefore:FRI }),
                 mk({ id:"open", title:"can now", effort:"quick" })];
  const plan = DP.build(items, SCHED, CFG, MON, { ctx: CTX });
  ok("the day plan won't offer it early", !plan.slots.some(s=>s.itemId==="blocked"),
     JSON.stringify(plan.slots.map(s=>s.itemId)));
  ok("Home won't nag about it either", !W.OrganiserPriority.ordered(items, CTX).some(i=>i.id==="blocked"));
  ok("and normal work is unaffected", plan.slots.some(s=>s.itemId==="open"));
  ok("once the day arrives it's offered", DP.build(items, SCHED, CFG, FRI, { ctx:{today:FRI,goalTitle:()=>""} })
     .slots.some(s=>s.itemId==="blocked"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
