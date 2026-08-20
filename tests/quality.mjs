import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawn } from "node:child_process";
const REPO = REPO_ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "q-"));
fs.mkdirSync(path.join(dir, "public"), { recursive: true });
fs.readdirSync(REPO).filter((f)=>f.endsWith(".js")).forEach((f)=>fs.copyFileSync(path.join(REPO,f),path.join(dir,f)));
fs.writeFileSync(path.join(dir,"package.json"), JSON.stringify({type:"module"}));
fs.mkdirSync(path.join(dir,"data"),{recursive:true});
fs.writeFileSync(path.join(dir,"data","organiser-data.json"), JSON.stringify({savedAt:new Date().toISOString(),items:[]}));
const port = 3755;
const srv = spawn(process.execPath,["server.js"],{cwd:dir,env:{...process.env,NO_OPEN:"1",PORT:String(port)},stdio:"ignore"});
await sleep(2200);
const B = `http://localhost:${port}`;
const send = (b) => fetch(B+"/api/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});

sec("The allowlist cannot be talked past");
const SECRET = "ZQLEAKZQ ring Helen about the referral";
let r = await send({ what: "corrected", field: SECRET });
ok("a secret in `field` is refused entry", r.ok);            // accepted call...
r = await send({ what: SECRET });
ok("an unknown `what` is rejected outright", r.status === 400);
await send({ what: "corrected", field: "date", value: SECRET, n: 99999 });
await send({ what: "accepted", value: "accepted", n: 3 });
await send({ what: "corrected", field: "date" });
await send({ what: "corrected", field: "date" });
await send({ what: "corrected", field: "who" });
await send({ what: "dropped", value: "dropped" });
await send({ what: "name-question", value: "rejected" });
await sleep(300);
const log = fs.readFileSync(path.join(dir,"data","events.jsonl"),"utf8");
ok("...and never reaches the log", !log.includes("ZQLEAKZQ"), log.split("\n").find((l)=>l.includes("ZQ")));
ok("an out-of-range number is dropped", !/99999/.test(log));
ok("only allowlisted fields are stored", !/"field":"(?!date|who)/.test(log));

sec("But the signal that matters gets through");
const rep = (await (await fetch(B+"/api/report")).json()).text;
const q = rep.slice(rep.indexOf("── IS THE SORTING ANY GOOD"), rep.indexOf("── PROBLEMS"));
console.log(q.split("\n").map((l)=>"    "+l).join("\n"));
ok("it counts what was accepted", /3 entries accepted/.test(q), q);
ok("it counts what was dropped", /1 dropped/.test(q));
ok("it ranks the field corrected most", /date\s+3/.test(q), q);
ok("and the rarer one below it", /who\s+1/.test(q));
ok("it says what that ranking means", /gets wrong often/.test(q));
ok("it reports the name questions", /name questions/.test(q));
ok("and it still carries no content", !/ZQ/.test(rep));
ok("the section explains why timings aren't enough", /looks perfect in the section above/.test(rep));

srv.kill(); await sleep(150); fs.rmSync(dir,{recursive:true,force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
