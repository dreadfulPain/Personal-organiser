import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import { spawn } from "node:child_process";
const s = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, NO_OPEN: "1", PORT: "3948" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2000));
let bad = 0;
for (const p of ["index.html","help.html","help.js","timeline.html","class.html","records.html","people.html","portfolio.html","goals.html","looking-back.html","week.html","month.html","compare.html","nav.js","style.css"]) {
  const r = await fetch("http://localhost:3948/" + p);
  if (!r.ok) { console.log("BAD", r.status, p); bad++; }
}
console.log(bad ? `${bad} pages failed` : "all pages serve");
s.kill(); process.exit(0);
