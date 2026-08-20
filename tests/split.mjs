import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The gap the double-check found: splitting is pure code but was gated behind
// the AI, so a laptop with no model got a whole pasted thread as one title.
import { spawn } from "node:child_process";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(n,c,e)=>{if(c){pass++;console.log("  ok  "+n);}else{fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));}};

const port=3667;
// NO AI configured at all — the situation this is for.
const srv=spawn(process.execPath,["server.js"],{cwd:REPO_ROOT,env:{...process.env,NO_OPEN:"1",PORT:String(port)},stdio:"ignore"});
await sleep(2200);
const B=`http://localhost:${port}`;

const h = await (await fetch(B+"/api/health")).json();
ok("confirmed: no engine at all", h.hasAI === false && h.configured === false);

const thread = `[10:22] Wei: morning nick
[10:22] Wei: can you send me the year 7 report by friday
[10:25] Wei: also S03 did really well on the reading test
Wei: thanks!`;
const r = await fetch(B+"/api/split",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:thread})});
ok("splitting works with NO engine", r.ok, String(r.status));
const d = await r.json();
ok("a chat becomes separate messages", d.fragments.length === 4, JSON.stringify(d.fragments.map(f=>f.text)));
ok("the speaker survives", d.fragments[0].speaker === "Wei");
ok("the real content is there", d.fragments.some(f=>/year 7 report/.test(f.text)));

const blob = await (await fetch(B+"/api/split",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"Call the dentist. Book the hall. Email Wei."})})).json();
ok("a paragraph splits into sentences", blob.fragments.length === 3, JSON.stringify(blob.fragments.map(f=>f.text)));

const one = await (await fetch(B+"/api/split",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"just one thing"})})).json();
ok("one thing stays one thing", one.fragments.length === 1);

const empty = await fetch(B+"/api/split",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:""})});
ok("empty doesn't error", empty.ok && (await empty.json()).fragments.length === 0);

// The AI-gated endpoints must STILL refuse, as before.
const p = await fetch(B+"/api/pipeline",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:thread})});
ok("the AI pipeline still declines without an engine", p.status === 503);

srv.kill(); await sleep(200);

import fs from "node:fs";
const app = fs.readFileSync(`${REPO_ROOT}/public/app.js`,"utf8");
ok("the no-AI path uses it", /fetch\("\/api\/split"/.test(app));
ok("only for something worth splitting", /text\.length > 40/.test(app));
ok("each part still goes through the pattern reader", /OrganiserQuickParse\.parseAll\(t, \{ contacts \}\)/.test(app));
// And a part can itself be two jobs — the splitter cuts at line breaks and full
// stops, which "update the laptop and sign into 365" has neither of.
ok("and a part that is two jobs is cut again", /parts\.flatMap\(/.test(app));
ok("and it says how many it made", /Split into \$\{made\.length\}/.test(app));
ok("a failed split still keeps the text", /one lump is still better than nothing lost/.test(app));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
