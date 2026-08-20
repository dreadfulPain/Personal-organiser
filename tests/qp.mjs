import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import vm from "node:vm";
const sb = { window: {}, console, Date, Math, JSON, Set, Map, Object, RegExp, String, Number, Array };
sb.globalThis = sb; vm.createContext(sb);
["names.js","quickparse.js"].forEach(f => vm.runInContext(fs.readFileSync(`${REPO_ROOT}/public/`+f,"utf8"), sb));
const Q = sb.window.OrganiserQuickParse;
const CONTACTS = [{id:"1",name:"Helen Zhou"},{id:"2",name:"王伟"},{id:"3",name:"Dave the plumber"}];
const p = (t) => Q.parse(t, { contacts: CONTACTS });
const iso = (n) => { const d=new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+JSON.stringify(e):""));} };
const sec=(s)=>console.log("\n"+s);

sec("The everyday sentences — no model needed");
{
  let r = p("call the dentist on tuesday");
  ok("it pulls the day out", !!r.date, r);
  ok("and cleans it out of the title", r.title === "call the dentist", r.title);
  r = p("email Wei about the trip by friday");
  ok("'by friday' becomes a date", !!r.date);
  r = p("finish the reports tomorrow at 3pm");
  ok("tomorrow", r.date === iso(1), r.date);
  ok("and 3pm becomes 15:00", r.time === "15:00", r.time);
  ok("title is just the job", r.title === "finish the reports", r.title);
  r = p("book the hall 14/09");
  ok("a written date, day first", r.date.endsWith("-09-14"), r.date);
  r = p("submit data by 20 Sep");
  ok("'20 Sep' works", r.date.endsWith("-09-20"), r.date);
  ok("and 'by' + deadline word makes it hard", p("deadline: submit data by 20 Sep").deadlineType === "hard");
  r = p("in 3 days ring the office");
  ok("'in 3 days'", r.date === iso(3), r.date);
  ok("today", p("do it today").date === iso(0));
  ok("next week", p("plan the trip next week").date === iso(7));
}

sec("Chinese, since half the messages will be");
{
  ok("明天", p("明天交报告").date === iso(1), p("明天交报告").date);
  ok("今天", p("今天开会").date === iso(0));
  ok("后天", p("后天").date === iso(2));
  ok("下周", p("下周做计划").date === iso(7));
  ok("周五", !!p("周五之前发给我").date);
  ok("9月14日", p("9月14日开会").date.endsWith("-09-14"), p("9月14日开会").date);
}

sec("People — only ever yours, never invented");
{
  ok("a known contact is found", p("email Helen about the trip").promisedTo === "Helen Zhou", p("email Helen about the trip"));
  ok("a stranger is NOT invented", p("email Gareth about the trip").promisedTo === "", p("email Gareth about the trip").promisedTo);
  ok("Chinese contact found", p("给王伟发消息").promisedTo === "王伟", p("给王伟发消息").promisedTo);
  ok("waiting-for is spotted", p("waiting for Helen to reply").waitingOn === "Helen Zhou", p("waiting for Helen to reply"));
  ok("and it isn't also 'promised to'", p("waiting for Helen to reply").promisedTo === "");
  ok("an unknown waiting-on is kept if capitalised", p("waiting for Gareth to reply").waitingOn === "Gareth");
  ok("with no contacts at all it just doesn't guess", Q.parse("email Helen", { contacts: [] }).promisedTo === "");
}

sec("Tone and effort, from the words you used");
{
  ok("urgent → high", p("urgent: ring the office").importance === "high");
  ok("no rush → low", p("tidy the cupboard whenever").importance === "low");
  ok("neither → normal", p("tidy the cupboard").importance === "normal");
  ok("'just' → quick", p("just email Helen").effort === "quick");
  ok("'write up' → draining", p("write up the reports").effort === "draining");
}

sec("It must never make things worse");
{
  const plain = p("think about the thing");
  ok("a sentence with nothing in it stays untouched", plain.title === "think about the thing" && !plain.date, plain);
  ok("and it says it found nothing", Q.foundAnything(plain) === false);
  ok("but says so when it did", Q.foundAnything(p("call the dentist tuesday")) === true);
  ok("empty input doesn't crash", p("").title === "");
  ok("a huge input doesn't crash", p("x".repeat(5000)).title.length <= 160);
  ok("an impossible date is refused", p("book it 45/99").date === "", p("book it 45/99").date);
  ok("a bare number isn't a time", p("buy 3 folders").time === "", p("buy 3 folders").time);
  ok("it marks where it came from", p("anything").by === "patterns");
  ok("it never sets a goal or standard", !p("do the thing friday").goalId && !p("do the thing friday").standardId);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
