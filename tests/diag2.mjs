import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The states that matter, including the Windows wording and the OneDrive note.
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };

async function diag(env) {
  const port = 3910 + Math.floor(Math.random() * 30);
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

// Nothing listening — the reported situation.
const down = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11209" });
const s1 = find(down, "Smart sorting");
ok("nothing listening is a problem, not a mystery", s1.state === "problem");
ok("it says what the effect is on you", /saved (exactly )?as you typed them/.test(s1.detail), s1.detail);
// Which fix is right depends on whether Ollama is installed here at all, and
// the whole point is that those two get DIFFERENT advice.
const missingHere = /doesn't seem to be on this computer/.test(s1.detail);
ok(
  "and gives the fix that matches the situation",
  missingHere ? /ollama\.com\/download/.test(s1.fix) : /Start Ollama|Start menu/.test(s1.fix),
  s1.fix
);
ok("never both at once", !(/ollama\.com\/download/.test(s1.fix) && /Start menu, type Ollama/.test(s1.fix)));
ok("it never tells you to run a terminal command to find the fault", !/PowerShell|api\/health/.test(JSON.stringify(down)));

// Listening, but the model isn't pulled — the sneaky one.
const ol = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: [{ name: "llama3.2:3b" }] })); }
  res.writeHead(200, {"Content-Type":"application/json"}); res.end("{}");
}).listen(11210);
const nomodel = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11210" });
const s2 = find(nomodel, "Smart sorting");
ok("running-but-no-model is told apart from not running", /Ollama is running/.test(s2.detail), s2.detail);
ok("and gives the pull command", /ollama pull qwen3:14b/.test(s2.fix));
ol.close();

// Working.
const ol2 = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: [{ name: "qwen3:14b" }] })); }
  res.writeHead(200, {"Content-Type":"application/json"}); res.end("{}");
}).listen(11211);
const good = await diag({ AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11211" });
ok("working reports working", find(good, "Smart sorting").state === "ok");
ok("with no fix to do", !find(good, "Smart sorting").fix);
ol2.close();

// Not configured at all is INFO, not a fault.
const off = await diag({});
ok("never set up is information, not a problem", find(off, "Smart sorting").state === "info");
ok("and says the app still works without it", /works fully by hand/.test(find(off, "Smart sorting").detail));

// It counts your actual writing.
fs.mkdirSync(`${REPO_ROOT}/data`, { recursive: true });
fs.writeFileSync(`${REPO_ROOT}/data/organiser-data.json`,
  JSON.stringify({ items: [{ id: "a", title: "x" }, { id: "b", title: "y" }], records: [{ id: "r" }], goals: [], contacts: [], schedule: [], savedAt: new Date().toISOString() }));
const withData = await diag({});
const w = find(withData, "Your writing");
ok("it counts what you've actually written", /2 tasks/.test(w.detail) && /1 record/.test(w.detail), w.detail);
ok("and when it was last saved", /last saved/.test(w.detail));
ok("it shows where the file is", !!find(withData, "Where it lives"));
fs.rmSync(`${REPO_ROOT}/data`, { recursive: true, force: true });

ok("everything is copyable in one string", typeof down.copyText === "string" && down.copyText.includes("Smart sorting"));
ok("the copy includes the fixes", /fix:/.test(down.copyText));

const help = fs.readFileSync(`${REPO_ROOT}/public/help.js`, "utf8");
ok("the page says so when the app itself is down", /black window has been closed/.test(help));
ok("and copying has a fallback when the clipboard is blocked", /hc-fallback/.test(help));
const nav = fs.readFileSync(`${REPO_ROOT}/public/nav.js`, "utf8");
ok("it's findable in the tab bar", /help\.html", "Working\?"/.test(nav));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
