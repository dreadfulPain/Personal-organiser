import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import vm from "node:vm";
const sb = { window: {}, console, Date, Math, JSON, Set, Map }; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(`${REPO_ROOT}/public/names.js`,"utf8"), sb);
const N = sb.window.OrganiserNames;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+e:""));} };

console.log("A plumber, a band and a hospital — nothing to do with school");
// Contacts from a completely different life.
const trades = [{id:"1",name:"Dave the plumber"},{id:"2",name:"British Gas"},{id:"3",name:"Dr Okafor"}];
ok("a trade contact matches on first word", N.look("Dave", trades).state === "matched");
ok("a company name matches whole", N.look("British Gas", trades).state === "matched");
ok("a titled name matches", N.look("Okafor", trades).state === "matched");
ok("someone new is offered, not invented", N.look("the letting agent", trades).state === "new");

const band = [{id:"1",name:"Priya"},{id:"2",name:"Priyanka"}];
ok("two similar names force a question anywhere", N.look("Priyan", band).state === "nearly");

// The waiting rhythm holds no domain words at all.
const app = fs.readFileSync(`${REPO_ROOT}/public/app.js`,"utf8");
const wo = /function renderWaitingOn[\s\S]*?\n  \}/.exec(app)?.[0] || "";
const nudge = /function nudge\(it\)[\s\S]*?\n  \}/.exec(app)?.[0] || "";
ok("the waiting section names no domain", !/school|lesson|teacher|pupil|parent|student|report|term/i.test(wo), (wo.match(/school|lesson|teacher|pupil|parent|student|report|term/i)||[])[0]);
ok("nor does the nudge builder", !/school|lesson|teacher|pupil/i.test(nudge));
ok("who you're waiting on is whatever you wrote", /it\.waitingOn/.test(wo) && !/"Helen"|'Helen'/.test(wo));
const srv = fs.readFileSync(`${REPO_ROOT}/server.js`,"utf8");
const wt = /function waitingText[\s\S]*?\n\}/.exec(srv)?.[0] || "";
ok("the notification wording is domain-free", !/school|lesson|teacher|pupil|report/i.test(wt), wt);
ok("it uses the name you gave it", /\$\{it\.waitingOn\}/.test(wt));

// The prompt examples must span more than one kind of life.
const line = /- WAITING ON SOMEONE ELSE[^\n]*/.exec(srv)[0];
ok("the examples aren't all school", /plumber|landlord|supplier|invoice/.test(line), line.slice(0,120));
ok("and they don't name a real person from this user's life", !/Helen|Wei|SHSID/.test(line));
ok("it says the target can be an org, not just a person", /a person, a company, an office/.test(line));


// ---------------------------------------------------------------------------
console.log("\nAnd nothing in the code has read one particular school's calendar");
{
  // THE WORRY THIS ANSWERS. A reader can be fixed until it works on the
  // document in front of it and then fall apart on the next one — and a
  // thousand passing checks built around the same file prove nothing about
  // that. So: no word out of any real calendar may reach anything that RUNS.
  //
  // Comments are exempt and deliberately so. What went wrong on a real document
  // is the most valuable thing there is to write down, and a comment cannot
  // change what the code does. What must never happen is a rule of the form
  // "if the text says Holidays, then…", or a prompt teaching a model this
  // school's particular phrasing.
  const { codeOf } = await import("./_check.mjs");
  const files = ["server.js"].concat(
    fs.readdirSync(`${REPO_ROOT}/public`).filter((f) => f.endsWith(".js")).map((f) => `public/${f}`));
  // Words off one real school calendar, none of which any general reader needs.
  const THEIRS = ["Holidays", "Professional Development", "Paper Submission",
    "Score Input", "Report Confirm", "Report Distribution", "Midterm",
    "Mid-Autumn", "National Day", "Winter Vacation", "Summer Vacation",
    "Winter Orientation", "Director Meeting", "Staff Meeting", "Sports Week",
    "Art Festival", "Return Paper", "Exam Time", "Opening Ceremon", "SHSID",
    "Shanghai"];
  const found = [];
  files.forEach((f) => {
    const body = codeOf(fs.readFileSync(`${REPO_ROOT}/${f}`, "utf8"));
    THEIRS.forEach((w) => {
      if (body.indexOf(w) >= 0) found.push(`${f}: ${w}`);
    });
  });
  ok("no word out of a real school's calendar is in anything that runs",
     found.length === 0, found.join("; "));
  ok("and the check is really reading the files", files.length > 10, String(files.length));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
