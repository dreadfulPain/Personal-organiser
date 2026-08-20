import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Installed-vs-missing must not give the same advice.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };

async function diag(env) {
  const port = 3820 + Math.floor(Math.random() * 40);
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_OPEN: "1", PORT: String(port), ...env }, stdio: "ignore",
  });
  await sleep(2200);
  const d = await (await fetch(`http://localhost:${port}/api/diagnose`)).json();
  srv.kill(); await sleep(200);
  return d;
}
const find = (d, n) => d.checks.find((c) => c.name === n);

// --- not installed, nothing listening: the reported situation ---
const missing = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11221", PATH: "/nonexistent" });
const m = find(missing, "Smart sorting");
ok("a missing Ollama is named as missing", /doesn't seem to be on this computer/.test(m.detail), m.detail);
ok("it explains what Ollama even is", /free program that does the sorting/.test(m.detail));
ok("it links the download rather than saying 'start it'", /ollama\.com\/download/.test(m.fix));
ok("and does NOT tell you to start something that isn't there", !/Start menu, type Ollama and run it/.test(m.fix));
ok("it gives the pull command too", /ollama pull qwen3:14b/.test(m.fix));
ok("and warns the download is big", /big download/.test(m.fix));
const which = find(missing, "Which model to install");
ok("it raises which model suits the machine", !!which);
ok("naming the current one", /qwen3:14b/.test(which.detail));
ok("and offering a laptop-sized alternative", /qwen3:4b/.test(which.fix), which.fix);

// --- installed but not running ---
const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-"));
fs.writeFileSync(path.join(fakeDir, "ollama"), "#!/bin/sh\n");
fs.chmodSync(path.join(fakeDir, "ollama"), 0o755);
const notRunning = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11222", PATH: fakeDir });
const nr = find(notRunning, "Smart sorting");
ok("an installed-but-stopped Ollama is told apart", /IS installed on this computer, it just isn't running/.test(nr.detail), nr.detail);
ok("and gets the start-it advice", /Start Ollama|Start menu/.test(nr.fix));
ok("with no download link — it's already here", !/ollama\.com\/download/.test(nr.fix));
ok("and no model-choice noise", !find(notRunning, "Which model to install"));
fs.rmSync(fakeDir, { recursive: true, force: true });

// --- running: neither message appears ---
const ol = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: [{ name: "qwen3:14b" }] })); }
  res.writeHead(200, {"Content-Type":"application/json"}); res.end("{}");
}).listen(11223);
const good = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11223", PATH: "/nonexistent" });
ok("a working setup says nothing about installing", find(good, "Smart sorting").state === "ok" && !find(good, "Which model to install"));
ol.close();

// --- a remote engine is never accused of not being installed locally ---
const remote = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://192.168.1.50:11434", PATH: "/nonexistent" });
ok("a remote address isn't checked for a local install", !/doesn't seem to be on this computer/.test(find(remote, "Smart sorting").detail), find(remote, "Smart sorting").detail);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
