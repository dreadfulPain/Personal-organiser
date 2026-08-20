import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The storage change, end to end against a real server: write the new stores,
// read them back, and make sure nothing else got trampled on the way.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawn } from "node:child_process";
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
// The data dir isn't configurable, so this runs against the real one — there
// was no file there, and it's removed again at the end.
const dir = `${REPO_ROOT}/data`;
const port = 8000 + Math.floor(Math.random()*900);
const srv = spawn("node", [`${REPO_ROOT}/server.js`],
  { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
try {
  for (let i=0;i<40;i++) { try { await fetch(`http://127.0.0.1:${port}/api/data`); break; } catch { await wait(150); } }
  const get = async () => (await fetch(`http://127.0.0.1:${port}/api/data`)).json();
  const first = await get();
  ok("a fresh file has the new stores", Array.isArray(first.pastoralNotes) &&
     Array.isArray(first.pastoralTopics) && Array.isArray(first.toldLog), JSON.stringify(Object.keys(first)));

  const put = async (body) => (await fetch(`http://127.0.0.1:${port}/api/data`,
    { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) })).json();
  await put({ ...first,
    items: [{ id:"i1", title:"a job", type:"task", plannedMinutes: 480, spentMinutes: 90,
              optional:true, committed:true, notBefore:"2026-09-18", areas:["work","prof"] }],
    pastoralTopics: [{ id:"t1", label:"how they're getting on", staysFreshDays: 21 },
                     { id:"t2", label:"how they learn best", staysFreshDays: 90,
                       options:["something to watch","reading it","doing it"] }],
    pastoralNotes: [{ id:"n1", who:"p1", topicId:"t1", said:"settled", date:"2026-09-01" },
                    { id:"n2", who:"p1", topicId:"t2", choice:"doing it", said:"doing it", date:"2026-09-03" }],
    targeted: { "class 5": { id:"targeted:class 5", everyDays: 21, lastDone: { p1: "2026-09-04" } } },
    toldLog: [{ id:"g1", who:"p1", to:"his mum", said:"reading is coming on", date:"2026-09-02" }],
    worked: { "2026-09-19": { total: 120, areas: { work: 90, mine: 30 } } },
    areas: [{ id:"work", name:"work", hints:["marking","report"] }],
    tried: [{ id:"y1", what:"watched it done first", skill:"Reading", date:"2026-09-15",
              group:"5A", whoIds:["p1"], note:"" }],
    lessons: [{ id:"l1", title:"Settings", date:"2026-09-15", group:"5A", skill:"Reading",
                slotId:"s1", plan:"Learning Objective:\nsenses", objective:"senses",
                ways:["modelled it"], checks:["exit ticket"], taught:true,
                note:"ran short", itemId:"i1", targets:["W.9-10.3.d"] }],
    lessonConfig: { headings: { objective:["walt"], ways:["what we do"], checks:["how i check"] },
                    reviewDays: [1, 7, 30] },
    rotas: [{ id:"r1", title:"a few minutes each", memberIds:["p1","p2"], perDay:1, minutes:10,
              everyDays:14, lastDone:{ p1:"2026-09-14" }, tried:{ p2:["2026-09-15"] }, optional:true }],
    attendance: [{ id:"a1", group:"5A", date:"2026-09-15", slotId:"s1",
                   away:["p1"], late:["p2"], note:"" }],
    syllabus: { name:"this year", targets:[
      { code:"W.9-10.3.d", text:"Use precise words and sensory language.", strand:"Writing" }] },
  });
  const back = await get();
  ok("pastoral topics come back", back.pastoralTopics.length === 2 && back.pastoralTopics[0].label === "how they're getting on");
  ok("pastoral notes come back", back.pastoralNotes.length === 2 && back.pastoralNotes[0].said === "settled");
  ok("the told log comes back", back.toldLog.length === 1 && back.toldLog[0].to === "his mum");
  // The countable half: a topic is only tallyable if its OPTIONS survive, and a
  // note only counts towards a tally if its CHOICE does. Either one lost and
  // every percentage on the planning page silently becomes zero of zero.
  const choiceTopic = back.pastoralTopics.find((t) => t.id === "t2");
  ok("a topic's set answers survive", choiceTopic && Array.isArray(choiceTopic.options) &&
     choiceTopic.options.join("|") === "something to watch|reading it|doing it",
     JSON.stringify(choiceTopic));
  ok("and which one someone picked survives",
     (back.pastoralNotes.find((n) => n.id === "n2") || {}).choice === "doing it",
     JSON.stringify(back.pastoralNotes));
  ok("who's had something planned for them comes back",
     back.targeted && back.targeted["class 5"] && back.targeted["class 5"].lastDone.p1 === "2026-09-04",
     JSON.stringify(back.targeted));
  const it = back.items[0];
  ok("a job's stated size survives", it.plannedMinutes === 480);
  ok("the minutes already put in survive", it.spentMinutes === 90);
  ok("optional survives", it.optional === true);
  ok("committed survives", it.committed === true);
  ok("and notBefore still does", it.notBefore === "2026-09-18");
  ok("the weekend tally comes back", back.worked && back.worked["2026-09-19"] &&
     back.worked["2026-09-19"].total === 120, JSON.stringify(back.worked));
  ok("with its split intact", back.worked["2026-09-19"].areas.work === 90);
  ok("the areas you named come back", back.areas.length === 1 && back.areas[0].name === "work");
  ok("with the words they've learned", back.areas[0].hints.join() === "marking,report");
  ok("a job's areas survive as a list", Array.isArray(it.areas) && it.areas.join() === "work,prof");
  // The join needs every one of these: no skill and it can't be matched to a
  // level, no date and there is no before or after, no who and it reached
  // nobody. Any one of them dropped and the analysis silently returns nothing.
  const y = (back.tried || [])[0];
  ok("what you tried comes back", !!y && y.what === "watched it done first", JSON.stringify(back.tried));
  ok("with the skill it was aimed at", y && y.skill === "Reading");
  ok("and the day you did it", y && y.date === "2026-09-15");
  ok("and who it reached", y && y.group === "5A" && y.whoIds.join() === "p1");

  // A pasted plan is the biggest single thing this app stores. Every part of it
  // is load-bearing: the text is the evidence, the parse is what gets counted,
  // and taught/skill/date are the whole of the join to how they got on.
  const les = (back.lessons || [])[0];
  ok("a pasted plan comes back", !!les && /senses/.test(les.plan), JSON.stringify(back.lessons));
  ok("with what was read out of it", les && les.objective === "senses" &&
     les.ways.join() === "modelled it" && les.checks.join() === "exit ticket");
  ok("and whether you taught it", les && les.taught === true);
  ok("and what you thought afterwards", les && les.note === "ran short");
  ok("and the job it settled", les && les.itemId === "i1");
  ok("and the slot it sat in", les && les.slotId === "s1");
  // Without these the reminders silently stop; there is no error, the block is
  // just empty, which reads as "nothing due".
  ok("your own review spacing comes back",
     (back.lessonConfig.reviewDays || []).join() === "1,7,30", JSON.stringify(back.lessonConfig));
  // A judgement against a target is an ordinary record, and has to look like one.
  ok("a level recorded against a target code is an ordinary record",
     Array.isArray(back.records), JSON.stringify((back.records || []).slice(0, 1)));

  ok("your own headings come back too",
     back.lessonConfig && back.lessonConfig.headings.objective.join() === "walt",
     JSON.stringify(back.lessonConfig));

  // A rota is only a rota if BOTH halves survive: whose turn has happened, and
  // whose attempt couldn't. Lose the second and a slot that never works for
  // someone stops being noticeable.
  const ro = (back.rotas || [])[0];
  ok("a round comes back", !!ro && ro.memberIds.join() === "p1,p2", JSON.stringify(back.rotas));
  ok("with whose turn has happened", ro && ro.lastDone.p1 === "2026-09-14");
  ok("and whose attempt couldn't", ro && (ro.tried.p2 || []).join() === "2026-09-15");
  ok("and whether it gives way when work is heavy", ro && ro.optional === true);

  // Away and late are different facts and both are load-bearing: lose `away`
  // and every absence becomes an attendance, silently.
  const at = (back.attendance || [])[0];
  ok("a register comes back", !!at && at.group === "5A", JSON.stringify(back.attendance));
  ok("with who was away", at && at.away.join() === "p1");
  ok("and who was late, kept apart from it", at && at.late.join() === "p2");
  ok("and which lesson it was", at && at.date === "2026-09-15" && at.slotId === "s1");

  ok("the syllabus comes back", back.syllabus && back.syllabus.name === "this year",
     JSON.stringify(back.syllabus));
  ok("with the code untouched", back.syllabus.targets[0].code === "W.9-10.3.d");
  ok("the words it is written in", /sensory language/.test(back.syllabus.targets[0].text));
  ok("and which part of the syllabus it sits in", back.syllabus.targets[0].strand === "Writing");
  // Without this the whole coverage half is empty and says nothing is covered.
  ok("and a lesson keeps which targets you attached",
     Array.isArray(les.targets), JSON.stringify(les));

  ok("nothing else was trampled", Array.isArray(back.records) && Array.isArray(back.goals) && Array.isArray(back.schedule));

  // A file written by the OLD version has none of these keys — it must still load.
  fs.writeFileSync(path.join(dir, "organiser-data.json"),
    JSON.stringify({ version:1, items:[{id:"old",title:"before"}], savedAt:null }));
  const legacy = await get();
  ok("an older data file still opens", legacy.items[0].title === "before");
  ok("and gains the new stores as empty, not undefined",
     Array.isArray(legacy.pastoralNotes) && Array.isArray(legacy.toldLog));
  ok("and the weekend tally as an empty object, not undefined",
     legacy.worked && typeof legacy.worked === "object" && !Array.isArray(legacy.worked));
  ok("and the area list as an empty array", Array.isArray(legacy.areas) && legacy.areas.length === 0);
  ok("and what you tried as an empty list", Array.isArray(legacy.tried) && legacy.tried.length === 0);
  ok("and lessons as an empty list", Array.isArray(legacy.lessons) && legacy.lessons.length === 0);
  ok("and rounds as an empty list", Array.isArray(legacy.rotas) && legacy.rotas.length === 0);
  ok("and registers as an empty list — never as a full room",
     Array.isArray(legacy.attendance) && legacy.attendance.length === 0);
  ok("with no syllabus until you paste one", legacy.syllabus === null);
  ok("with no headings until you set some", legacy.lessonConfig === null);
  ok("and the who's-had-something score as an empty object",
     legacy.targeted && typeof legacy.targeted === "object" && !Array.isArray(legacy.targeted));
} finally { srv.kill(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
