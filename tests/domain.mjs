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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
