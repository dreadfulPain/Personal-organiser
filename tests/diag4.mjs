import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The warning has to be proportionate: quiet when there's nothing to lose,
// pointed once there is.
import fs from "node:fs";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };
const REPO = REPO_ROOT;

// A PORT EACH, AND WAITED FOR RATHER THAN SLEPT AT.
//
// This picked a random port out of a forty-wide range three times per run and
// then slept for a fixed 2.2 seconds. Both halves are a coin toss: two suites
// running at once can draw the same number, and a loaded machine takes longer
// than the guess — and either way the failure is ECONNREFUSED in a check about
// the diagnostic report, which points at nothing. The same fault was fixed in
// diag2 and left here.
let nextPort = 3781;
async function diag() {
  const port = nextPort++;
  const srv = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, NO_OPEN: "1", PORT: String(port) }, stdio: "ignore" });
  let d = null;
  // Up to twelve seconds, asked twenty-five times — it is ready when it answers.
  for (let i = 0; i < 60 && !d; i++) {
    try { d = await (await fetch(`http://localhost:${port}/api/diagnose`)).json(); }
    catch { await sleep(200); }
  }
  srv.kill(); await sleep(200);
  if (!d) throw new Error(`the server never answered on port ${port}`);
  return d.checks.find((c) => c.name === "Updates");
}

// This repo IS a git clone.
const connected = await diag();
ok("a connected folder just says so", connected.state === "ok" && /connected/.test(connected.detail));

// Hide .git to simulate an unzipped folder.
fs.renameSync(`${REPO}/.git`, `${REPO}/.git-hidden`);
try {
  fs.rmSync(`${REPO}/data`, { recursive: true, force: true });
  const empty = await diag();
  ok("an empty unzipped folder is only INFO", empty.state === "info", empty.state);
  ok("and still says how to connect it", /Double-click “Update”/.test(empty.fix));

  fs.mkdirSync(`${REPO}/data`, { recursive: true });
  fs.writeFileSync(`${REPO}/data/organiser-data.json`, JSON.stringify({
    items: Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: "t" + i })),
    goals: [{ id: "g1" }, { id: "g2" }], records: [], contacts: [], schedule: [], savedAt: new Date().toISOString(),
  }));
  const risky = await diag();
  ok("with real writing in it, it becomes a PROBLEM", risky.state === "problem", risky.state);
  ok("it names the actual danger", /stay behind in this one/.test(risky.detail), risky.detail);
  ok("and the fix keeps the writing", /keeps everything you've written/.test(risky.fix));
  ok("it doesn't tell you to re-download", !/download/i.test(risky.fix));
} finally {
  fs.renameSync(`${REPO}/.git-hidden`, `${REPO}/.git`);
  fs.rmSync(`${REPO}/data`, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
