import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import http from "node:http"; import { spawn } from "node:child_process";
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
console.log(rep.slice(rep.indexOf("── HOW THE SORTING"), rep.indexOf("── PROBLEMS")));
srv.kill(); ol.close(); await sleep(150); fs.rmSync(dir,{recursive:true,force:true});
