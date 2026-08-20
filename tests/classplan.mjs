import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// What you'd want in front of you while planning.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);
const sb = { window:{}, console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.globalThis = sb; vm.createContext(sb);
["levels.js","pastoral.js","classplan.js"].forEach(f => vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb));
const L = sb.window.OrganiserLevels, P = sb.window.OrganiserPastoral, CP = sb.window.OrganiserClassPlan;

const TODAY = "2026-09-21";
const CFG = { topics:["Reading","Writing"], levels:["secure","working towards","not yet"], targetLevel:"secure" };
const PEOPLE = ["s1","s2","s3","s4","s5"].map((id,i)=>({ id, name:"S0"+(i+1), group:"9A" }));
const OUTSIDE = [{ id:"x1", name:"Someone else", group:"10B" }];
const rec = (who,topic,level,date)=>({ id:who+topic, who, topic, level, date, createdAt:"" });
const RECORDS = [
  rec("s1","Reading","not yet","2026-09-01"),
  rec("s2","Reading","working towards","2026-09-01"),
  rec("s3","Reading","secure","2026-09-01"),
  rec("s4","Reading","secure","2026-09-01"),
  // s5 has nothing for Reading, and nobody has anything for Writing.
];
const TOPICS = [
  { id:"how", label:"how they learn best", staysFreshDays:120, options:["video","reading","doing"] },
  { id:"soc", label:"how they're getting on", staysFreshDays:21 },
];
let NOTES = [];
[["s1","video"],["s2","video"],["s3","doing"],["s4","reading"],["s5","video"]]
  .forEach(([who,choice]) => { NOTES = P.add(NOTES, { who, topicId:"how", choice }, "2026-09-10"); });
NOTES = P.add(NOTES, { who:"s2", topicId:"soc", said:"much happier since moving seats" }, "2026-09-18");
NOTES = P.add(NOTES, { who:"s3", topicId:"soc", said:"was struggling in the summer" }, "2026-05-02");

sec("A topic can be a countable choice");
{
  const t = P.tally(NOTES, TOPICS[0], PEOPLE.map(p=>p.id));
  ok("it counts the answers", t.answered === 5);
  ok("and gets the split right", t.counts.video === 3 && t.counts.doing === 1 && t.counts.reading === 1);
  ok("ranked biggest first", t.ranked[0][0] === "video");
  ok("a share is a share of who ANSWERED, not of everyone", Math.round(t.share("video")*100) === 60);
  ok("a free-text topic isn't countable", P.tally(NOTES, TOPICS[1], PEOPLE.map(p=>p.id)) === null);
  ok("a choice alone is a complete answer", P.forPerson(NOTES,"s1","how")[0].choice === "video");
  ok("only the newest answer per person counts",
     P.tally(P.add(NOTES, { who:"s1", topicId:"how", choice:"doing" }, "2026-09-20"),
       TOPICS[0], PEOPLE.map(p=>p.id)).counts.video === 2);
}

sec("Too few answers means no percentage at all");
{
  let few = P.add([], { who:"s1", topicId:"how", choice:"video" }, "2026-09-10");
  few = P.add(few, { who:"s2", topicId:"how", choice:"video" }, "2026-09-10");
  const t = P.tally(few, TOPICS[0], PEOPLE.map(p=>p.id));
  ok("two answers still count", t.counts.video === 2);
  ok("but no share is offered", t.share("video") === null);
  ok("and the words say the raw numbers instead", CP.shareWords(t,"video") === "2 of 2");
  const t3 = P.tally(P.add(few, { who:"s3", topicId:"how", choice:"doing" }, "2026-09-10"),
    TOPICS[0], PEOPLE.map(p=>p.id));
  ok("three is enough for a percentage", t3.share("video") !== null);
  ok("and it's shown", /%/.test(CP.shareWords(t3,"video")));
}

sec("Who needs what, so a plan can have a name in it");
{
  const members = CP.membersOf(PEOPLE.concat(OUTSIDE), "9A");
  ok("only this group", members.length === 5);
  const sk = CP.bySkill(RECORDS, CFG, "Reading", members);
  ok("it names who's below target", sk.below.map(r=>r.name).join() === "S01,S02", JSON.stringify(sk.below));
  ok("nothing recorded is its own state, not 'below'",
     sk.unknown.map(r=>r.name).join() === "S05", JSON.stringify(sk.unknown));
  ok("and at-or-above is neither", sk.rows.filter(r=>r.state==="at or above").length === 2);
  ok("the ones needing something come first", sk.rows[0].state === "below");
  ok("it says the share stuck", Math.round(sk.share*100) === 40);
  ok("in plain words", /2 of 5 below secure/.test(CP.skillWords(sk, 5)), CP.skillWords(sk,5));
  ok("and mentions the unrecorded one separately", /1 with nothing recorded/.test(CP.skillWords(sk,5)));
}

sec("The whole picture, in the order you'd read it");
{
  const pic = CP.picture({ contacts: PEOPLE.concat(OUTSIDE), records: RECORDS, recordConfig: CFG,
    pastoralNotes: NOTES, pastoralTopics: TOPICS, group: "9A", today: TODAY });
  ok("only the group's people", pic.members.length === 5);
  ok("the skill most people are stuck on comes first", pic.skills[0].skill === "Reading",
     pic.skills.map(s=>s.skill).join());
  ok("a skill with nothing recorded still appears", pic.skills.some(s=>s.skill==="Writing"));
  ok("countable topics are tallied", pic.tallies.length === 1 && pic.tallies[0].topic.id === "how");
  ok("a recent note is kept", pic.notes.some(n=>/much happier/.test(n.said)));
  ok("one past its shelf life is left out", !pic.notes.some(n=>/struggling in the summer/.test(n.said)));
  ok("and a choice isn't repeated as a note", !pic.notes.some(n=>n.said === "video"));
  ok("it isn't called empty", pic.empty === false);
}

sec("A group with nothing says so rather than looking like a class with no needs");
{
  const pic = CP.picture({ contacts: OUTSIDE, records: [], recordConfig: CFG,
    pastoralNotes: [], pastoralTopics: TOPICS, group: "10B", today: TODAY });
  ok("it knows it's empty", pic.empty === true);
  ok("but still lists the person", pic.members.length === 1);
  ok("no group at all is empty too", CP.picture({ contacts: [], group:"nope" }).empty === true);
}

sec("It suggests nothing and knows nothing about school");
{
  const src = fs.readFileSync(`${REPO}/public/classplan.js`,"utf8");
  const code = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok("no school words", !/lesson|pupil|student|teacher|video|reading|class\b/i.test(code),
     (code.match(/lesson|pupil|student|teacher|video|class\b/i)||[])[0]);
  // Strip comments FIRST. The header explains that this file suggests nothing,
  // and quotes an example of what it won't say — reading that as a violation is
  // the same mistake as flagging the "!" in `if (!WP)`.
  const strings = (code.match(/`[^`]*`|"[^"]*"|'[^']*'/g)||[]).join(" ");
  ok("it never tells you what to do", !/you should|consider|try using|recommend|suggest/i.test(strings),
     (strings.match(/you should|consider|try using|recommend|suggest/i)||[])[0]);
  ok("and builds no document", !/download|blob|csv|docShell/i.test(src));
}

sec("Junk doesn't crash it");
{
  ok("no contacts", CP.picture({}).members.length === 0);
  ok("no config", CP.picture({ contacts: PEOPLE, group:"9A" }).skills.length >= 0);
  ok("rubbish people are skipped", CP.membersOf([null, {}, PEOPLE[0]], "9A").length === 1);
  ok("a tally with no ids answers nothing", P.tally(NOTES, TOPICS[0], []).answered === 0);
  ok("an option you've since removed isn't counted",
     P.tally(P.add([], { who:"s1", topicId:"how", choice:"gone" }, "2026-09-10"),
       TOPICS[0], ["s1"]).answered === 0);
}


sec("Nobody is a rounding error");
{
  vm.runInContext(fs.readFileSync(`${REPO}/public/rota.js`,"utf8"), sb);
  const members = CP.membersOf(PEOPLE, "9A");
  const w = CP.whoAnswered(NOTES, TOPICS[0], members);
  ok("every answer keeps its names", w.groups.length === 3, JSON.stringify(w.groups));
  ok("including the group of one",
     w.groups.find(([o]) => o === "reading")[1].map(p=>p.name).join() === "S04");
  ok("the small groups are called out on their own",
     w.smallest.map(s=>s.option).sort().join() === "doing,reading", JSON.stringify(w.smallest));
  ok("and the biggest is still first for reading", w.groups[0][0] === "video");
  ok("someone with no answer isn't quietly dropped",
     CP.whoAnswered(P.add([], { who:"s1", topicId:"how", choice:"video" }, "2026-09-10"),
       TOPICS[0], members).noAnswer.length === 4);
  ok("a free-text topic has no groups", CP.whoAnswered(NOTES, TOPICS[1], members) === null);
}

sec("Who's had something aimed at them, and who's still waiting");
{
  const members = CP.membersOf(PEOPLE, "9A");
  const none = CP.coverage(members, null, TODAY);
  ok("nobody targeted yet is said plainly", none.never.length === 5 && none.everSeen === 0);
  ok("and it isn't framed as a failure",
     /starting point, not a failing/.test(CP.coverageWords(none)), CP.coverageWords(none));

  const some = CP.coverage(members,
    { everyDays: 21, lastDone: { s1:"2026-09-20", s2:"2026-09-19" } }, TODAY);
  ok("the ones never reached come first", some.waiting[0].last === "", JSON.stringify(some.waiting[0]));
  ok("and are named", some.never.map(x=>x.name).sort().join() === "S03,S04,S05");
  ok("the words count them", /3 of 5 haven't had anything/.test(CP.coverageWords(some)),
     CP.coverageWords(some));

  const all = CP.coverage(members, { everyDays: 21,
    lastDone: { s1:"2026-09-20", s2:"2026-09-19", s3:"2026-09-18", s4:"2026-09-17", s5:"2026-08-01" } },
    TODAY);
  ok("once everyone's had a turn, the longest wait leads", all.waiting[0].name === "S05");
  ok("and a long wait is named as overdue", all.overdue.map(x=>x.name).join() === "S05");
  ok("with no blame in the wording", !/should|failed|neglect/i.test(CP.coverageWords(all)),
     CP.coverageWords(all));

  const fresh = CP.coverage(members, { everyDays: 21,
    lastDone: { s1:TODAY, s2:TODAY, s3:TODAY, s4:TODAY, s5:TODAY } }, TODAY);
  ok("everyone recently covered says so", /Everyone has had something/.test(CP.coverageWords(fresh)));
}

sec("The picture carries both halves");
{
  const pic = CP.picture({ contacts: PEOPLE, records: RECORDS, recordConfig: CFG,
    pastoralNotes: NOTES, pastoralTopics: TOPICS, group: "9A", today: TODAY,
    targeted: { everyDays: 21, lastDone: { s1:"2026-09-20" } } });
  ok("the counts are there", pic.tallies.length === 1);
  ok("and the names under every answer", pic.answers.length === 1 && pic.answers[0].groups.length === 3);
  ok("and who's waiting", pic.coverage.never.length === 4, JSON.stringify(pic.coverage.never));
  ok("nobody in the group is missing from the waiting list",
     pic.coverage.waiting.length === pic.members.length);
}

sec("What's worth asking, before it's needed rather than after");
{
  const members = CP.membersOf(PEOPLE, "9A");
  const ask = CP.toAsk(NOTES, TOPICS, members, TODAY, 6);

  // "how they're getting on" is 21 days fresh. s2 was asked three days ago, so
  // is the only one with nothing outstanding on it; s3's is from May.
  ok("everyone with a gap is listed", ask.people === 4, JSON.stringify(ask.rows.map(r=>r.name)));
  ok("the one asked recently isn't chased", !ask.rows.some((r) => r.name === "S02"),
     JSON.stringify(ask.rows.map(r=>r.name)));
  ok("never-asked comes before merely-aged",
     ask.rows[0].why === "never asked", JSON.stringify(ask.rows.map(r=>r.why)));
  ok("and it says which heading", ask.rows.every((r) => r.topic));
  ok("one line per person, not one per heading",
     new Set(ask.rows.map((r) => r.name)).size === ask.rows.length);
  ok("it never tells you off", !/should|failed|neglect|behind|forgot/i.test(CP.toAskWords(ask, 5)),
     CP.toAskWords(ask, 5));
  ok("the words count the people", /4 of 5/.test(CP.toAskWords(ask, 5)), CP.toAskWords(ask, 5));

  // A must-have that's gone stale outranks a nice-to-have never asked.
  const ess = [{ id:"exam", label:"exam result", staysFreshDays:7, essential:true },
               { id:"pen", label:"handwriting", staysFreshDays:365 }];
  let n2 = [];
  n2 = P.add(n2, { who:"s1", topicId:"exam", said:"62" }, "2026-08-01");
  const e = CP.toAsk(n2, ess, members, TODAY, 6);
  ok("a must-have gone stale leads", e.rows[0].topic === "exam result", JSON.stringify(e.rows[0]));
  ok("and is marked as one", e.rows[0].essential === true);

  // Nothing set up at all is not a list of problems.
  const nothing = CP.toAsk([], [], members, TODAY, 6);
  ok("no headings means nothing to chase", nothing.rows.length === 0 && nothing.people === 0);
  ok("and it says so calmly",
     /Nothing needs asking/.test(CP.toAskWords(nothing, 5)), CP.toAskWords(nothing, 5));

  // A long list is capped, and says it was.
  const capped = CP.toAsk(NOTES, TOPICS, members, TODAY, 2);
  ok("a long list is trimmed", capped.rows.length === 2);
  ok("and admits how many it left out", capped.more === 2, String(capped.more));
  ok("keeping the longest-waiting ones", capped.rows[0].why === "never asked");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
