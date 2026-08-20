import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Something takes the day over; the app steps back, then rebuilds around it.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import vm from "node:vm"; import { spawn } from "node:child_process";
const REPO = REPO_ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array };
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(REPO+"/public/schedule.js","utf8"), sb);
const S = sb.window.OrganiserSchedule;

sec("Planning only the time that's actually left");
{
  const sched = [{ id:"a", label:"Period 1", start:"09:00", end:"10:00", days:[1,2,3,4,5] }];
  const all = S.gapsOn(sched, null, "2026-09-14");
  const after = S.gapsOn(sched, null, "2026-09-14", 14*60);
  ok("the whole day has morning gaps", all.some((g)=>g.start < 9*60));
  ok("a rebuild at 2pm plans nothing before 2pm", after.every((g)=>g.start >= 14*60), JSON.stringify(after));
  ok("and still finds the afternoon", after.length >= 1);
  ok("no notBefore behaves exactly as before", JSON.stringify(all) === JSON.stringify(S.gapsOn(sched, null, "2026-09-14", undefined)));
}

sec("How long you were away is measured, not estimated");
{
  const started = new Date(Date.now() - 95*60000).toISOString();
  ok("95 minutes reads as 95", S.awayMinutes({ away: { startedAt: started } }, new Date()) === 95);
  ok("not away is zero", S.awayMinutes({}, new Date()) === 0);
  ok("a broken timestamp is zero, not NaN", S.awayMinutes({ away: { startedAt: "rubbish" } }, new Date()) === 0);
  ok("the away state survives normalising", !!S.normaliseConfig({ away: { label:"crisis", startedAt: started } }).away);
  ok("a label-less one still counts", !!S.normaliseConfig({ away: { startedAt: started } }).away);
  ok("junk is dropped", S.normaliseConfig({ away: { label: "x" } }).away === null);
  ok("an interruption is a legal block source", S.normaliseBlock({label:"x",start:"09:00",end:"10:00",date:"2026-09-14",source:"interruption"}).source === "interruption");
}

sec("The behaviour, in the page");
{
  const t = fs.readFileSync(REPO+"/public/timeline.js","utf8");
  ok("you can say it's happening", /function startAway/.test(t));
  ok("and that you're back", /function comeBack/.test(t));
  ok("the plan is hidden while you're in it", /Nothing else on the page while you're in it/.test(t));
  ok("the real span is written down as a block", /source: "interruption"/.test(t));
  ok("the old plan is thrown away — it described a day that didn't happen", /delete c\.plans\[iso\]/.test(t));
  ok("the rebuild starts from now", /buildPlan\(iso, null, nowMins\)/.test(t));
  ok("it works out what no longer fits", /rebuilt\.displaced = before\.filter/.test(t));
  ok("and says how long you were gone", /Back after \$\{S\(\)\.durationWords\(mins\)\}/.test(t));
  ok("what's pushed out is offered a new day", /find it a day/.test(t) && /tomorrow/.test(t));

  const box = /function displacedBox[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("nothing is called missed or late", !/missed|late|failed|overdue|behind/i.test(box.replace(/Not missed/g,"")), box.match(/missed|late|failed|overdue|behind/i));
  ok("it says plainly they weren't missed", /Not missed/.test(box));

  // After a long interruption a big job is BOTH pushed out and too big to fit.
  // Printing it in two boxes reads as two jobs at the worst possible moment.
  const fbox = /function flaggedBox[\s\S]*?\n  \}/.exec(t)?.[0] || "";
  ok("a pushed-out job isn't also listed as needing a slot", /alreadyShown\.has\(x\.id\)/.test(fbox), fbox.slice(0, 200));
  ok("and that list comes from the displaced ids", /new Set\(plan\.displaced \|\| \[\]\)/.test(fbox));
  // The planner now lives in dayplan.js — extracted so it can be driven, which
  // is why this is a real behavioural check and not a grep for a line of source.
  const dp = fs.readFileSync(REPO+"/public/dayplan.js","utf8");
  ok("hard deadlines still outrank everything in the rebuild", /if \(used >= budget && !hardToday\) break;/.test(dp));
  ok("the page delegates rather than keeping a second copy", /OrganiserDayPlan\.build/.test(t) && !/const budget = /.test(t));
  {
    const b = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
    b.globalThis = b; vm.createContext(b);
    ["schedule.js","priority.js","dayplan.js"].forEach((f)=>vm.runInContext(fs.readFileSync(REPO+"/public/"+f,"utf8"), b));
    const iso = "2026-09-14";
    const base = { type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal", effort:"draining", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false };
    // Fill the day with soft work, then add one hard-today job. The soft pile
    // must hit the two-thirds limit; the hard one must get in anyway.
    const items = Array.from({length:8},(_,i)=>({ ...base, id:"s"+i, title:"soft "+i }));
    items.push({ ...base, id:"hard1", title:"the hard one", date:iso, deadlineType:"hard", effort:"quick" });
    const plan = b.window.OrganiserDayPlan.build(items, [], null, iso, { ctx:{ today:iso, goalTitle:()=>"" } });
    ok("it really is placed past the fill limit", plan.slots.some((s)=>s.itemId==="hard1"), JSON.stringify(plan.slots.map(s=>s.itemId)));
    ok("and the limit really was reached", plan.used >= Math.floor(plan.freeTotal*(2/3)) - 60, `used ${plan.used} of ${plan.freeTotal}`);
  }
}

sec("Free time actually gets offered something");
{
  const b = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
  b.globalThis = b; vm.createContext(b);
  ["schedule.js","priority.js","dayplan.js"].forEach((f)=>vm.runInContext(fs.readFileSync(REPO+"/public/"+f,"utf8"), b));
  const P = b.window.OrganiserPriority, D = b.window.OrganiserDayPlan;
  const iso = "2026-09-14", ctx = { today: iso, goalTitle: () => "" };
  const base = { type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal", effort:"quick", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false };
  const floaty = Array.from({length:6},(_,i)=>({ ...base, id:"f"+i, title:"ordinary job "+i }));
  const urgent = { ...base, id:"u1", title:"due today", date:iso, deadlineType:"hard" };
  const all = [...floaty, urgent];

  ok("Home still doesn't nag about ordinary undated jobs", P.ordered(all, ctx).map(i=>i.id).join(",") === "u1");
  ok("but the planner can see them", P.forPlanning(all, ctx).length === 7);
  ok("and still puts the pressing one first", P.forPlanning(all, ctx)[0].id === "u1");
  ok("done work is never offered", P.forPlanning([{...base,id:"d1",done:true}], ctx).length === 0);
  ok("open loops stay out — they have their own home", P.forPlanning([{...base,id:"o1",openLoop:true}], ctx).length === 0);
  ok("no duplicates when an item is both", new Set(P.forPlanning(all, ctx).map(i=>i.id)).size === 7);

  const plan = D.build(all, [], null, iso, { ctx });
  ok("the free time is used, not left blank", plan.used > 60, `used ${plan.used}`);
  ok("and the two-thirds limit still stops it", plan.used <= Math.floor(plan.freeTotal*(2/3)) + 30, `used ${plan.used} of ${plan.freeTotal}`);
  ok("a day of nothing but floaty work still gets planned", D.build(floaty, [], null, iso, { ctx }).slots.length > 0);
}

sec("Nothing pings you mid-crisis");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "away-"));
  fs.mkdirSync(path.join(dir,"public"),{recursive:true});
  fs.readdirSync(REPO).filter((f)=>f.endsWith(".js")).forEach((f)=>fs.copyFileSync(path.join(REPO,f),path.join(dir,f)));
  fs.writeFileSync(path.join(dir,"package.json"),JSON.stringify({type:"module"}));
  fs.mkdirSync(path.join(dir,"data"),{recursive:true});
  const pad=(n)=>String(n).padStart(2,"0");
  const past=new Date(Date.now()-30*60000);
  const dt=`${past.getFullYear()}-${pad(past.getMonth()+1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
  const write=(away)=>fs.writeFileSync(path.join(dir,"data","organiser-data.json"),JSON.stringify({
    savedAt:new Date().toISOString(), schedule:[], scheduleConfig: away?{away:{label:"crisis",startedAt:new Date().toISOString()}}:{},
    items:[{id:"a",title:"Ring a parent",remindAt:dt,remindedAt:null,createdAt:new Date().toISOString()}]}));
  const run=async()=>{
    const nf=path.join(dir,"notes.jsonl"); fs.writeFileSync(nf,"");
    const kid=spawn(process.execPath,["server.js"],{cwd:dir,env:{...process.env,NOTIFY_FILE:nf,PORT:String(3690+Math.floor(Math.random()*40)),REMIND_INTERVAL_MS:"5000",NO_OPEN:"1"},stdio:"ignore"});
    await sleep(6500); kid.kill(); await sleep(200);
    return fs.readFileSync(nf,"utf8").split("\n").filter(Boolean);
  };
  write(true);
  ok("while away, nothing fires", (await run()).length === 0);
  ok("and the reminder is HELD, not consumed", !JSON.parse(fs.readFileSync(path.join(dir,"data","organiser-data.json"),"utf8")).items[0].remindedAt);
  write(false);
  ok("once you're back, it arrives", (await run()).length >= 1);
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
