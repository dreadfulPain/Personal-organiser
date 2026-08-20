import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The Week and Month pages actually render, with the planner behind them.
// They were rewritten and nobody can see a browser from here.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,500):""));} };
const sec=(s)=>console.log("\n"+s);

// EVERY MODULE, NOT A CHOSEN FEW.
//
// This was four hand-picked lists, and a new module meant remembering to add
// it to all four — which nobody does, so a page would render in the test
// without the thing it actually needs and pass. A module is a file that puts
// something on window: they are self-contained, loading them all is cheap, and
// there is then nothing to forget.
const MODULE_FILES = fs
  .readdirSync(`${REPO}/public`)
  .filter((f) => f.endsWith(".js") && f !== "store.js")
  .filter((f) => /window\.Organiser[A-Za-z]*\s*=/.test(fs.readFileSync(`${REPO}/public/${f}`, "utf8")));

function loadModules(sb) {
  MODULE_FILES.forEach((f) => {
    try { vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb); } catch { /* a page script, not a module */ }
  });
}

function makeEl(tag) {
  return {
    tagName: tag, className:"", textContent:"", innerHTML:"", title:"", type:"", hidden:false, value:"",
    children: [],
    appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c=>this.children.push(c)); },
    insertAdjacentHTML(_pos, html){ this.innerHTML += html; },
    addEventListener(){}, setAttribute(){}, removeAttribute(){}, focus(){},
    querySelector(){ return makeEl("div"); },
    querySelectorAll(){ return []; },
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  };
}
function textOf(node) {
  if (!node) return "";
  // value too: a title in an <input> is on the page even though it has no text.
  return [node.textContent||"", node.innerHTML||"", node.title||"", node.value||"",
    ...(node.children||[]).map(textOf)].join(" ");
}

async function renderPage(file, ids, data) {
  const roots = {};
  ids.forEach(id => (roots[id] = makeEl("div")));
  const doc = {
    querySelector(sel){ return roots[sel] || (roots[sel] = makeEl("div")); },
    createElement: makeEl,
  };
  const sb = {
    console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  loadModules(sb);
  sb.OrganiserStore = { load: async () => data, save(){}, onExternalChange(){} };
  vm.runInContext(fs.readFileSync(`${REPO}/public/${file}`,"utf8"), sb);
  await new Promise(r => setTimeout(r, 20));
  return { roots, text: Object.values(roots).map(textOf).join(" ") };
}

// These pages window on the REAL today, so fixtures must be relative to it.
const pad = (n)=>String(n).padStart(2,"0");
const iso = (d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const plus = (n)=>{ const d=new Date(); d.setDate(d.getDate()+n); return iso(d); };
const MON = plus(0), FRI = plus(4);
const base = { type:"task", time:"", tags:[], date:"", deadlineType:"soft", importance:"normal",
  effort:"draining", goalId:"", openLoop:false, promisedTo:"", waitingOn:"", done:false };
const DATA = {
  items: [
    { ...base, id:"a", title:"Big thing due Friday", date:FRI, deadlineType:"hard" },
    { ...base, id:"b", title:"Pinned by hand", date:MON, time:"13:00" },
    { ...base, id:"c", title:"No date at all", effort:"quick" },
  ],
  schedule: [{ id:"s1", label:"Lessons", start:"09:00", end:"12:00", days:[1,2,3,4,5] }],
  scheduleConfig: { dayStart:"08:00", dayEnd:"17:00" },
};

sec("The Week page");
{
  let out, err = null;
  try { out = await renderPage("week.js", ["#weekList"], DATA); } catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  if (out) {
    ok("the Friday job appears somewhere in the week", /Big thing due Friday/.test(out.text));
    ok("your hand-pinned item is still shown", /Pinned by hand/.test(out.text));
    ok("undated work isn't invented into the week", !/No date at all/.test(out.text));
    ok("it produced seven days", out.roots["#weekList"].children.filter(c=>c.className==="wk-day").length === 7,
       out.roots["#weekList"].children.map(c=>c.className).join(","));
  }
}

sec("The Week page warns early when something won't fit");
{
  // A week with no room at all, and a hard deadline inside it.
  const tight = {
    items: [{ ...base, id:"x", title:"Impossible report", date:MON, deadlineType:"hard" }],
    schedule: [{ id:"s", label:"Solid", start:"08:00", end:"16:55", days:[0,1,2,3,4,5,6] }],
    scheduleConfig: { dayStart:"08:00", dayEnd:"17:00" },
  };
  const out = await renderPage("week.js", ["#weekList"], tight);
  ok("it says so on the page", /Won't fit before/.test(out.text), out.text.slice(0,300));
  ok("and names the job", /Impossible report/.test(out.text));
  ok("and says how long it needed", /needs .*(min|hour|h )/.test(out.text), out.text.slice(0,400));
}

sec("The Month page");
{
  let out, err = null;
  try { out = await renderPage("month.js", ["#monthList","#moTitle","#moPrev","#moNext"], DATA); }
  catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  if (out) {
    ok("it draws a grid", out.roots["#monthList"].children.some(c=>c.className==="mo-grid"));
    ok("dated work appears", /Big thing due Friday/.test(out.text));
    ok("a hand-pinned item still appears", /Pinned by hand/.test(out.text));
    ok("undated work isn't put on a day it doesn't belong", !/No date at all/.test(out.text));
  }
}

sec("Neither page falls over with nothing in it");
{
  const empty = { items: [], schedule: [], scheduleConfig: null };
  let e1=null, e2=null;
  try { await renderPage("week.js", ["#weekList"], empty); } catch (e) { e1 = e; }
  try { await renderPage("month.js", ["#monthList","#moTitle","#moPrev","#moNext"], empty); } catch (e) { e2 = e; }
  ok("empty week", !e1, e1 && e1.stack);
  ok("empty month", !e2, e2 && e2.stack);
}


sec("The Goals page shows the whole-goal bar and the rate");
{
  const roots = { "#goalsList": makeEl("div"), "#celebrate": makeEl("div"), "#newGoal": makeEl("input"),
                  "#addGoal": makeEl("button") };
  const doc = { querySelector(sel){ return roots[sel] || (roots[sel] = makeEl("div")); }, createElement: makeEl };
  const sb2 = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, clearTimeout, document: doc, fetch: async () => ({ ok:false }), confirm: () => false };
  sb2.window = sb2; sb2.globalThis = sb2;
  vm.createContext(sb2);
  loadModules(sb2);
  const soon = plus(10);
  const goal = { id:"g1", title:"Ready for the evening", date: soon, createdAt:"", milestones:[
    { id:"m1", title:"Pull the results together", done:false, completedAt:null,
      steps:[{ id:"s1", title:"Export the marks", done:false, completedAt:null }] },
  ]};
  sb2.OrganiserStore = { load: async () => ({
      goals: [goal],
      items: [{ ...base, id:"w1", title:"The big pile", goalId:"g1", date: soon,
        deadlineType:"hard", plannedMinutes: 40*60 }],
      schedule: [{ id:"l", label:"Lessons", start:"09:00", end:"16:30", days:[1,2,3,4,5] }],
      scheduleConfig: { dayStart:"08:00", dayEnd:"17:00" },
    }), save(){}, onExternalChange(){}, mode: "server" };
  let err = null;
  try {
    vm.runInContext(fs.readFileSync(`${REPO}/public/goals.js`,"utf8"), sb2);
    await new Promise(r => setTimeout(r, 20));
  } catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  const text = Object.values(roots).map(textOf).join(" ");
  ok("the goal is there", /Ready for the evening/.test(text));
  ok("there's a bar for the whole thing", /g-bar/.test(text), text.slice(0,200));
  ok("and a plain sentence about the rate", /a day across the/.test(text) || /left of/.test(text), text.slice(0,400));
  ok("forty hours in ten days is called out", /more than those days can hold/.test(text), text.slice(0,500));
  ok("it says by how much", /by about/.test(text));
}


sec("One person, on one screen");
{
  const ids = ["#pTitle","#pWho","#pTiles","#pChart","#pPastoral","#pTold"];
  const roots = {}; ids.forEach(i => roots[i] = makeEl("div"));
  const doc = { querySelector(sel){ return roots[sel] || (roots[sel] = makeEl("div")); }, createElement: makeEl };
  const sb3 = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: doc, location: { hash: "#s1" } };
  sb3.window = sb3; sb3.globalThis = sb3; vm.createContext(sb3);
  ["levels.js","chart.js","pastoral.js","told.js"].forEach(f =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb3));
  sb3.OrganiserStore = { load: async () => ({
    contacts: [{ id:"s1", name:"S01" }, { id:"s2", name:"S02" }],
    records: [
      { id:"r1", who:"s1", topic:"Reading", level:"working towards", date:"2026-06-02", createdAt:"" },
      { id:"r2", who:"s1", topic:"Reading", level:"secure",          date:"2026-09-01", createdAt:"" },
      { id:"r3", who:"s1", topic:"Writing", level:"working towards", date:"2026-06-02", createdAt:"" },
      { id:"r4", who:"s1", topic:"Writing", level:"working towards", date:"2026-09-01", createdAt:"" },
    ],
    recordConfig: { topics: ["Reading","Writing"],
      levels: ["secure","working towards","not yet"], target: "secure" },
    pastoralTopics: [
      { id:"t1", label:"how they're getting on", staysFreshDays:21, upFront:true },
      { id:"t2", label:"speaking up in class",   staysFreshDays:45, essential:true },
    ],
    pastoralNotes: [{ id:"n1", who:"s1", topicId:"t1", said:"settled with the same group", date:"2026-06-10" }],
    toldLog: [{ id:"g1", who:"s1", to:"his mum", said:"reading has come on", date:"2026-09-02", how:"phone" }],
  }), save(){}, onExternalChange(){}, mode:"server" };
  let err = null;
  try { vm.runInContext(fs.readFileSync(`${REPO}/public/person.js`,"utf8"), sb3);
        await new Promise(r => setTimeout(r, 20)); } catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  const text = Object.values(roots).map(textOf).join(" ");
  ok("the deep link opened on the right person", /S01/.test(text));
  ok("the headline facts are there", /ch-tval/.test(text));
  ok("a chart was drawn", /<svg class="ch"/.test(text), text.slice(0,200));
  ok("both skills are on it", /Reading<\/text>/.test(text) && /Writing<\/text>/.test(text));
  ok("the figures table came with it", /ch-table/.test(text));
  ok("the stale pastoral note is flagged as worth checking", /worth checking again/.test(text));
  ok("the up-front topic leads", text.indexOf("how they're getting on") < text.indexOf("speaking up"));
  ok("what you told people is shown", /his mum/.test(text) && /reading has come on/.test(text));
  ok("and says plainly it never leaves", /never exported/.test(text));

  // Nobody chosen: must not explode or leak anyone.
  const roots2 = {}; ids.forEach(i => roots2[i] = makeEl("div"));
  const sb4 = { ...sb3, document: { querySelector(s){ return roots2[s] || (roots2[s] = makeEl("div")); },
    createElement: makeEl }, location: { hash: "" } };
  sb4.window = sb4; sb4.globalThis = sb4; vm.createContext(sb4);
  ["levels.js","chart.js","pastoral.js","told.js"].forEach(f =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb4));
  let e2 = null;
  try { vm.runInContext(fs.readFileSync(`${REPO}/public/person.js`,"utf8"), sb4);
        await new Promise(r => setTimeout(r, 20)); } catch (e) { e2 = e; }
  ok("with nobody chosen it's quiet, not broken", !e2, e2 && e2.stack);

  // An empty shelf is not a score of nought.
  const roots3 = {}; ids.forEach(i => roots3[i] = makeEl("div"));
  const sb5 = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: { querySelector(s){ return roots3[s] || (roots3[s] = makeEl("div")); },
      createElement: makeEl }, location: { hash: "#s1" } };
  sb5.window = sb5; sb5.globalThis = sb5; vm.createContext(sb5);
  ["levels.js","chart.js","pastoral.js","told.js"].forEach(f =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sb5));
  sb5.OrganiserStore = { load: async () => ({ contacts:[{id:"s1",name:"S01"}], records:[],
    recordConfig: null, pastoralTopics:[], pastoralNotes:[], toldLog:[] }),
    save(){}, onExternalChange(){}, mode:"server" };
  vm.runInContext(fs.readFileSync(`${REPO}/public/person.js`,"utf8"), sb5);
  await new Promise(r => setTimeout(r, 20));
  const t3 = Object.values(roots3).map(textOf).join(" ");
  ok("nothing set up says so, rather than showing nought", /No skills set up yet/.test(t3), t3.slice(0,200));
  ok("and doesn't show a bare zero", !/ch-tval">0</.test(t3));
  ok("and shows nobody's notes", !/settled with the same group/.test(Object.values(roots2).map(textOf).join(" ")));
}


sec("A goal with nothing behind it says so");
{
  const roots = { "#goalsList": makeEl("div"), "#celebrate": makeEl("div") };
  const doc = { querySelector(sel){ return roots[sel] || (roots[sel] = makeEl("div")); }, createElement: makeEl };
  const sbx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, clearTimeout, document: doc, fetch: async () => ({ ok:false }), confirm: () => false };
  sbx.window = sbx; sbx.globalThis = sbx; vm.createContext(sbx);
  loadModules(sbx);
  sbx.OrganiserStore = { load: async () => ({
    goals: [{ id:"g1", title:"Get the certificate", date:"", createdAt:"", milestones:[] }],
    items: [], schedule: [], scheduleConfig: null }), save(){}, onExternalChange(){}, mode:"server" };
  vm.runInContext(fs.readFileSync(`${REPO}/public/goals.js`,"utf8"), sbx);
  await new Promise(r => setTimeout(r, 20));
  const text = Object.values(roots).map(textOf).join(" ");
  ok("it doesn't just show a blank", /Nothing behind this one yet/.test(text), text.slice(0,200));
  ok("it says what that means", /nothing to plan or keep score of/.test(text));
  ok("and points at the way to fix it", /paste the answer in/.test(text));
  ok("without pretending the app is the right planner", /better at planning than this app/.test(text));
}


sec("Before you plan");
{
  const ids = ["#bpGroup","#bpEmpty","#bpTallies","#bpSkills","#bpNotes","#bpCover","#bpCoverWords",
               "#bpTallyBlock","#bpSkillBlock","#bpNoteBlock","#bpCoverBlock",
               "#bpAsk","#bpAskWords","#bpAskBlock",
               "#bpTried","#bpTriedCaveat","#bpTriedBlock"];
  const roots = {}; ids.forEach(i => roots[i] = makeEl("div"));
  const sbp = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: { querySelector(s){ return roots[s] || (roots[s] = makeEl("div")); },
      createElement: makeEl }, location: { hash: "#9A" } };
  sbp.window = sbp; sbp.globalThis = sbp; vm.createContext(sbp);
  ["levels.js","pastoral.js","chart.js","rota.js","names.js","tried.js","lessonplan.js",
   "classplan.js"].forEach(f =>
    vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`,"utf8"), sbp));
  const P = sbp.window.OrganiserPastoral;
  let notes = [];
  [["s1","video"],["s2","video"],["s3","doing"],["s4","video"],["s5","reading"]]
    .forEach(([who,choice]) => { notes = P.add(notes, { who, topicId:"how", choice }, plus(-5)); });
  notes = P.add(notes, { who:"s2", topicId:"soc", said:"much happier since moving seats" }, plus(-3));
  sbp.OrganiserStore = { load: async () => ({
    contacts: ["s1","s2","s3","s4","s5"].map((id,i)=>({ id, name:"S0"+(i+1), group:"9A" })),
    records: [
      { id:"r1", who:"s1", topic:"Reading", level:"not yet", date: plus(-10), createdAt:"" },
      { id:"r2", who:"s2", topic:"Reading", level:"working towards", date: plus(-10), createdAt:"" },
      { id:"r3", who:"s3", topic:"Reading", level:"secure", date: plus(-10), createdAt:"" },
      // Judged again after the thing that was tried, so there is movement to read.
      { id:"r4", who:"s1", topic:"Reading", level:"working towards", date: plus(-1), createdAt:"" },
      { id:"r5", who:"s2", topic:"Reading", level:"secure", date: plus(-1), createdAt:"" },
    ],
    tried: [{ id:"y1", what:"watched it done first", skill:"Reading", date: plus(-5),
              group:"9A", whoIds:[] }],
    // A lesson you taught should reach the same analysis without being copied
    // into the what-you-tried store.
    lessons: [{ id:"l1", title:"Settings", date: plus(-4), group:"9A", skill:"Reading",
                plan:"x", objective:"describe a setting", ways:["swapped and read each other's"],
                checks:["exit ticket"], taught:true }],
    recordConfig: { topics:["Reading","Writing"], levels:["secure","working towards","not yet"],
      targetLevel:"secure" },
    pastoralTopics: [
      { id:"how", label:"how they learn best", staysFreshDays:120, options:["video","reading","doing"] },
      { id:"soc", label:"how they're getting on", staysFreshDays:21 },
    ],
    pastoralNotes: notes,
  }), save(){}, onExternalChange(){}, mode:"server" };
  let err = null;
  try { vm.runInContext(fs.readFileSync(`${REPO}/public/before-planning.js`,"utf8"), sbp);
        await new Promise(r => setTimeout(r, 20)); } catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  const text = Object.values(roots).map(textOf).join(" ");
  ok("the group split comes with real numbers", /3 of 5/.test(text), text.slice(0,300));
  ok("and a percentage once enough answered", /60%/.test(text));
  ok("it names who's below target", /S01, S02/.test(text), text.slice(0,600));
  ok("nothing-recorded is listed separately from below", /nothing recorded yet/.test(text));
  ok("a recent note is there", /much happier/.test(text));
  ok("it never tells you what to do", !/you should|consider using|we recommend/i.test(text));
  // The counts pull towards the majority; these two are the counterweight.
  ok("the group of one is named, not rounded away", /S05/.test(text), text.slice(0,800));
  ok("everyone in the class appears in the waiting list",
     ["S01","S02","S03","S04","S05"].every(n => text.includes(n)));
  ok("and it says who hasn't had anything aimed at them",
     /haven't had anything|Nobody has had anything/.test(text), text.slice(0,400));
  ok("without blaming anyone", !/should have|neglect|failing to/i.test(text));
  // Stale data says so on the page you open BEFORE the lesson, not on the page
  // you open once a parent is already asking.
  ok("it says what's worth asking about", /worth asking about/i.test(text), text.slice(0,400));
  ok("naming the heading that's gone quiet", /how they(&#39;|')re getting on/.test(text),
     text.slice(0,400));
  ok("and saying which of the two kinds of empty it is",
     /never asked|last asked/.test(text), text.slice(0,400));
  // The answerable version of "what works for them": what you did, and what
  // their level did afterwards — with its caveats attached, every time.
  ok("what you tried is counted across the group", /watched it done first/.test(text),
     text.slice(0,400));
  ok("with how many tries it rests on", /5 tries|tries/.test(text));
  ok("the ones never looked at again are counted, not dropped",
     /not looked at again/.test(text), text.slice(0,600));
  ok("and it never claims it caused anything",
     !/because of|it works|proved|most effective/i.test(text));
  ok("the caveat is on the page, not just in the code",
     /not what caused it/.test(text), text.slice(0,600));
  // Static copy lives in the HTML, not in a rendered element the harness holds
  // a reference to — so it is checked where it actually is.
  ok("a lesson you taught reaches the same analysis",
     /swapped and read/.test(text), text.slice(0,600));
  ok("and the trap that bites this hardest is named on the page",
     /drift upwards on their own/.test(fs.readFileSync(`${REPO}/public/before-planning.html`,"utf8")));
}


sec("The Lessons page");
{
  const ids = ["#lsPaste","#lsPreview","#lsList","#lsCount","#lsMirror","#lsMirrorWords",
               "#lsGroup","#lsGroups","#lsSkill","#lsDate","#lsSlot","#lsItem","#lsSave",
               "#lsHObjective","#lsHWays","#lsHChecks","#lsHeadForm"];
  const roots = {}; ids.forEach(i => roots[i] = makeEl("div"));
  const sbl = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    Promise, setTimeout, document: { querySelector(s){ return roots[s] || (roots[s] = makeEl("div")); },
      createElement: makeEl }, location: { hash: "" } };
  sbl.window = sbl; sbl.globalThis = sbl; vm.createContext(sbl);
  loadModules(sbl);
  // Eleven taught lessons, all checked the same way — the thing you can't see
  // from the inside, which is the whole reason the mirror exists.
  const lessons = [];
  for (let i = 1; i <= 11; i++)
    lessons.push({ id:"l"+i, title:"Lesson "+i, date: plus(-i), group: i > 8 ? "9B" : "9A",
      skill:"Reading", plan:"x", objective:"do the thing",
      ways:[i % 2 ? "talked them through it" : "they worked in pairs"],
      checks:["exit ticket"], taught:true });
  sbl.OrganiserStore = { load: async () => ({ lessons, lessonConfig: null,
    contacts: [{ id:"s1", name:"S01", group:"9A" }], records: [],
    recordConfig: { topics:["Reading"], levels:["4","3","2","1"], targetLevel:"3" },
    schedule: [], items: [], tried: [] }), save(){}, onExternalChange(){} };
  let err = null;
  try { vm.runInContext(fs.readFileSync(`${REPO}/public/lessons.js`,"utf8"), sbl);
        await new Promise(r => setTimeout(r, 20)); } catch (e) { err = e; }
  ok("it renders without throwing", !err, err && err.stack);
  const text = Object.values(roots).map(textOf).join(" ");
  ok("the kept plans are listed", /Lesson 1/.test(text), text.slice(0,300));
  ok("with how many were taught", /11 kept/.test(text), text.slice(0,300));
  ok("the mirror counts the way you always check", /11 of 11/.test(text), text.slice(0,600));
  ok("and splits by class", /9B/.test(text));
  ok("it never tells you how to teach",
     !/you should|consider|try to|needs improvement|too much|not enough/i.test(text), text.slice(0,600));
  ok("and never grades the lesson",
     !/\bgood lesson|\bpoor\b|\bweak\b|outstanding|inadequate/i.test(text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
