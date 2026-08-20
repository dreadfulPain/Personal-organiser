import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 3944;
const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT,
  env: { ...process.env, NO_OPEN: "1", PORT: String(port), AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11434" },
  stdio: "ignore",
});
await sleep(2200);
const d = await (await fetch(`http://localhost:${port}/api/diagnose`)).json();
for (const c of d.checks) {
  console.log(`[${c.state.padEnd(7)}] ${c.name}\n            ${c.detail}` + (c.fix ? `\n     FIX -> ${c.fix}` : ""));
}
console.log("\n--- what 'Copy all of this' puts on the clipboard ---\n" + d.copyText);
srv.kill();
process.exit(0);
