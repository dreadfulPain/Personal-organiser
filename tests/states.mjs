import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import http from "node:http";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeOllama(port, models) {
  return http.createServer((req, res) => {
    if (/\/api\/tags/.test(req.url)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ models: models.map((n) => ({ name: n })) }));
    }
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { content: JSON.stringify({ entries: [] }) } }));
    });
  }).listen(port);
}

async function check(label, models, wanted) {
  const oport = 11400 + Math.floor(Math.random() * 90);
  const sport = 3900 + Math.floor(Math.random() * 90);
  const ol = fakeOllama(oport, models);
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, AI_ENGINE: "ollama", AI_MODEL: wanted, AI_BASE_URL: `http://localhost:${oport}`, NO_OPEN: "1", PORT: String(sport) },
    stdio: "ignore",
  });
  await sleep(2000);
  const d = await (await fetch(`http://localhost:${sport}/api/health`)).json();
  console.log(`${label.padEnd(28)} hasAI=${String(d.hasAI).padEnd(5)} note=${JSON.stringify(d.engineNote)}`);
  srv.kill(); ol.close();
  await sleep(300);
}

await check("4. everything working", ["qwen3:14b"], "qwen3:14b");
await check("5. tag reported bare", ["qwen3"], "qwen3:14b");
await check("6. wrong model pulled", ["llama3.2:3b"], "qwen3:14b");
await check("7. tags list empty", [], "qwen3:14b");
process.exit(0);
