import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
// DOES THE REPORT SAY HOW THE SORTING IS ACTUALLY DOING?
//
// Three real calls through a stand-in engine, then look at what the report has
// to say about them. It printed that slice and left you to judge it; what it
// is really asking is whether the app counts its own work at all, because a
// report that says nothing about the sorting is how "it's a bit slow lately"
// stays an impression instead of a number.
import http from "node:http"; import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done } = checker();
const REPO = REPO_ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-"));
fs.mkdirSync(path.join(dir, "public"), { recursive: true });
fs.readdirSync(REPO).filter((f) => f.endsWith(".js")).forEach((f) => fs.copyFileSync(path.join(REPO, f), path.join(dir, f)));
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
fs.mkdirSync(path.join(dir, "data"), { recursive: true });
fs.writeFileSync(path.join(dir, "data", "organiser-data.json"), JSON.stringify({ savedAt: new Date().toISOString(), items: [{id:"1",title:"x"}] }));
// An engine that WORKS, so successful timings appear.
const ol = http.createServer((req,res)=>{
  if(/tags/.test(req.url)){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({models:[{name:"qwen3:14b"}]}));}
  res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({message:{content:JSON.stringify({entries:[]})}}));
}).listen(11778);
const srv = spawn(process.execPath,["server.js"],{cwd:dir,env:{...process.env,NO_OPEN:"1",PORT:"3734",AI_ENGINE:"ollama",AI_MODEL:"qwen3:14b",AI_BASE_URL:"http://localhost:11778"},stdio:"ignore"});
await sleep(2200);
for (let i=0;i<3;i++) await fetch("http://localhost:3734/api/route",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"a thing"})});
await sleep(300);
const rep = (await (await fetch("http://localhost:3734/api/report")).json()).text;
const from = rep.indexOf("── HOW THE SORTING");
const to = rep.indexOf("── PROBLEMS");
const slice = from >= 0 && to > from ? rep.slice(from, to) : "";
console.log(slice);

ok("the report has a section about the sorting", from >= 0, rep.slice(0, 160));
ok("and a section about what went wrong", to > from, `from=${from} to=${to}`);
ok("it counted the three calls that were made", /\b3\b/.test(slice), slice.slice(0, 200));
ok("and says how long they took", /sec|second|ms|min/i.test(slice), slice.slice(0, 200));
// THE REPORT IS A THING YOU HAND TO SOMEBODY. It must carry no writing of
// yours — the same rule the diagnose file lives under.
ok("and carries nothing you wrote", !/"title"|"items"/.test(rep), rep.slice(0, 200));

srv.kill(); ol.close(); await sleep(150); fs.rmSync(dir,{recursive:true,force:true});
done();
