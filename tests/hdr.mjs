import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT,
  env: { ...process.env, NO_OPEN: "1", PORT: "3777" }, stdio: "ignore",
});
await sleep(2000);
for (const p of ["index.html", "app.js", "style.css", "pipeline.js"]) {
  const r = await fetch("http://localhost:3777/" + p);
  console.log(String(r.status).padEnd(4), p.padEnd(14), "Cache-Control:", r.headers.get("cache-control"));
}
srv.kill();
process.exit(0);
