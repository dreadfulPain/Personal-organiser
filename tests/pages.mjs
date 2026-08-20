import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// EVERY PAGE MUST ACTUALLY SERVE.
//
// This counted the failures, printed the number and then exited 0 whatever it
// found — so a page could 404 for a month and the run stayed green. It counts
// and it fails now.
//
// The list is read from the folder rather than typed out, so a new page is
// covered the moment it exists.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done } = checker();

const PORT = 3948;
const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT, env: { ...process.env, NO_OPEN: "1", PORT: String(PORT) }, stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 2000));

const wanted = fs
  .readdirSync(__j(REPO_ROOT, "public"))
  .filter((f) => /\.(html|js|css)$/.test(f))
  .sort();
ok(`there are pages and scripts to serve`, wanted.length > 20, String(wanted.length));

for (const p of wanted) {
  let r;
  try { r = await fetch(`http://localhost:${PORT}/${p}`); } catch (e) { r = { ok: false, status: String(e.message) }; }
  ok(`serves ${p}`, r.ok, `status ${r.status}`);
}

// AND NOTHING ABOVE public/. The server has files of its own next to it — the
// data file included — and none of them are anybody's business over HTTP.
for (const p of ["server.js", "pipeline.js", "package.json", "../server.js", "data/organiser-data.json"]) {
  let r;
  try { r = await fetch(`http://localhost:${PORT}/${p}`); } catch { r = { ok: false, status: 0 }; }
  ok(`refuses ${p}`, !r.ok, `status ${r.status}`);
}

srv.kill();
done();
