import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The banner must appear for "set up but not running", and NOT for "never set
// up" — those are different problems and only one is fixable from here.
import http from "node:http";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + e : ""}`); } };

async function health(env) {
  const port = 3960 + Math.floor(Math.random() * 30);
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_OPEN: "1", PORT: String(port), ...env }, stdio: "ignore",
  });
  await sleep(2000);
  const j = await (await fetch(`http://localhost:${port}/api/health`)).json();
  srv.kill(); await sleep(200);
  return j;
}

const off = await health({});
ok("never set up: no banner (engineNote empty on the client)", off.configured === false);

const down = await health({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11201" });
ok("set up but down: the client gets a note to show", down.configured === true && down.hasAI === false && !!down.engineNote);
ok("and it names the fix", /is it running\?/.test(down.engineNote), down.engineNote);

const ol = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: [{ name: "qwen3:14b" }] })); }
  res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ message: { content: "{}" } }));
}).listen(11202);
const up = await health({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11202" });
ol.close();
ok("working: nothing to show", up.hasAI === true && up.engineNote === "");

import fs from "node:fs";
const app = fs.readFileSync(`${REPO_ROOT}/public/app.js`, "utf8");
const html = fs.readFileSync(`${REPO_ROOT}/public/index.html`, "utf8");
ok("the banner only shows when there's a reason", /banner\.hidden = !engineNote/.test(app));
ok("the hint distinguishes the two off-states", /Saved as you typed it — sorting is unavailable just now/.test(app));
ok("it reassures nothing is lost", /Everything you type is still saved/.test(html));
ok("there's a way back without reloading", /function recheckEngine/.test(app) && /aiRecheck/.test(html));
ok("and it re-warms the model when it returns", /Sorting is back on/.test(app) && /api\/warm/.test(app));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
