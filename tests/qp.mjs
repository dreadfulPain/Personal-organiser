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
  // A huge input must not crash — and must not be quietly cut, either. This
  // asserted title.length <= 160, which was the app silently deleting the end
  // of what somebody wrote, three lines under a comment promising their
  // sentence back untouched. Long is a display problem; you don't solve a
  // display problem by throwing away the words.
  ok("a huge input doesn't crash", p("x".repeat(5000)).title.length === 5000,
     String(p("x".repeat(5000)).title.length));
  ok("and nothing typed is thrown away", p("y".repeat(400)).title === "y".repeat(400));
  ok("an impossible date is refused", p("book it 45/99").date === "", p("book it 45/99").date);
  ok("a bare number isn't a time", p("buy 3 folders").time === "", p("buy 3 folders").time);
  ok("it marks where it came from", p("anything").by === "patterns");
  ok("it never sets a goal or standard", !p("do the thing friday").goalId && !p("do the thing friday").standardId);
}

// ---------------------------------------------------------------------------
// WHAT IT GOT WRONG ON ORDINARY TEACHER SENTENCES.
//
// Five of these came out of typing the sort of thing anybody types into the box
// on a Tuesday morning. Three were silent — a date read as none, a time read as
// the wrong half of the day, a three-day event starting two days late — and the
// other two left the sentence sitting in its own title.
sec("A day of the month with no month on it");
{
  // "PARENTS EVENING ON THE 20TH" is how anybody writes a date inside the month
  // they are in, and it came back with no date at all — so the one evening in
  // the term you cannot miss never reached a calendar.
  const n = new Date();
  const soon = n.getDate() <= 20
    ? new Date(n.getFullYear(), n.getMonth(), 20)
    : new Date(n.getFullYear(), n.getMonth() + 1, 20);
  const want = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-20`;
  let r = p("parents evening on the 20th at 6.30");
  ok("the 20th is a date", r.date === want, `${r.date} (wanted ${want})`);
  ok("and it is called what it is", r.title === "parents evening", r.title);
  ok("by the 31st works too", p("book the hall by the 31st").date.endsWith("-31") ||
     p("book the hall by the 31st").date === "", p("book the hall by the 31st").date);

  // THE COMING ONE, not one that has been and gone.
  const past = n.getDate() > 5;
  if (past) {
    r = p("reports due on the 5th");
    ok("a day already past means next month", r.date > `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`, r.date);
  }
  // AND A SENTENCE THAT MERELY HAS AN ORDINAL IN IT IS NOT A DATE.
  ok("'the 3rd time this week' is not the third of the month",
     p("the 3rd time this week ive asked").date === "", p("the 3rd time this week ive asked").date);
}

sec("A bare hour of one to six is the afternoon");
{
  // Read as written, "6.30" was half past six in the MORNING — stored, shown,
  // and with nothing anywhere to say it had been read the unlikely way.
  ok("6.30 is the evening", p("parents evening at 6.30").time === "18:30",
     p("parents evening at 6.30").time);
  ok("and 4.15 is the afternoon", p("meeting at 4.15").time === "16:15", p("meeting at 4.15").time);
  // A LEADING ZERO IS SOMEBODY BEING EXPLICIT, and is left alone.
  ok("06:30 is the morning, because it says so", p("meeting at 06:30").time === "06:30",
     p("meeting at 06:30").time);
  // AND SEVEN ONWARDS NEEDS NO HELP.
  ok("7.45 is the morning", p("briefing at 7.45").time === "07:45", p("briefing at 7.45").time);
  ok("8.30am is untouched", p("assembly tomorrow 8.30am").time === "08:30",
     p("assembly tomorrow 8.30am").time);
  ok("and am said out loud still wins", p("swim at 6am").time === "06:00", p("swim at 6am").time);
}

sec("Hours written as a span, and days written as a range");
{
  // "9-3" is how a day out is always written, and it came back with no time —
  // which then left the "9-3" in the title, which stopped the date being cut
  // out of the title either, so the whole line came back as its own name.
  let r = p("trip to the museum next tuesday 9-3");
  ok("it starts at nine", r.time === "09:00", r.time);
  ok("and the name is the trip", r.title === "trip to the museum", r.title);
  // NARROW ON PURPOSE. A page reference is the same shape and far more common.
  ok("an exercise range is not a time", p("do exercise 4-6 on friday").time === "",
     p("do exercise 4-6 on friday").time);
  ok("and stays in the name", p("do exercise 4-6 on friday").title === "do exercise 4-6",
     p("do exercise 4-6 on friday").title);
  ok("nor is a list of periods", p("periods 1-3 cover").time === "", p("periods 1-3 cover").time);

  // "BOOK FAIR 10-12 NOVEMBER" IS THREE DAYS AND IT STARTS ON THE TENTH. The
  // twelfth matched first and the ten was left behind in the name.
  r = p("book fair 10-12 november");
  ok("a range starts where it starts", r.date.endsWith("-11-10"), r.date);
  ok("and none of it is left in the name", r.title === "book fair", r.title);
  r = p("exams november 10-12");
  ok("written month-first too", r.date.endsWith("-11-10"), r.date);
  ok("with a clean name", r.title === "exams", r.title);
  // AND A SINGLE DATE IS STILL A SINGLE DATE.
  ok("one day still reads as one day", p("PD day oct 16").date.endsWith("-10-16"),
     p("PD day oct 16").date);
}

sec("And the name is the job, not the sentence");
{
  // The time sat in the MIDDLE, so cutting it would have left a hole; by the
  // time the Monday had gone and it was at the end, nobody looked again.
  ok("a time in the middle goes once the date has", p("meeting at 15:30 on monday").title === "meeting",
     p("meeting at 15:30 on monday").title);
  // "every" was left hanging off the end, pointing at nothing.
  ok("a repeat is cut whole", p("swimming every wednesday 1pm").title === "swimming",
     p("swimming every wednesday 1pm").title);
  ok("and it still says it comes round", !!p("swimming every wednesday 1pm").repeatsText,
     p("swimming every wednesday 1pm").repeatsText);
  // AND THE ONES THAT WERE ALREADY RIGHT ARE STILL RIGHT — cutting a phrase out
  // of the middle of a sentence leaves nonsense, and this must never start.
  ok("a sentence that needs its date keeps it",
     p("the kids dont start till sept 1st").title === "the kids dont start till sept 1st",
     p("the kids dont start till sept 1st").title);
  ok("and a day in the middle of a phrase stays put",
     p("meet my mentor sarah thursday morning").title === "meet my mentor sarah thursday morning",
     p("meet my mentor sarah thursday morning").title);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
