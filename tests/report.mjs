import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The one rule that matters: the report must contain NOTHING the user wrote.
// Tested by filling the app with distinctive secrets and searching the output.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import http from "node:http"; import { spawn } from "node:child_process";
const REPO = REPO_ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,300):""));} };
const sec=(s)=>console.log("\n"+s);

// Every one of these is a thing a real user would be horrified to paste into a chat.
const SECRETS = {
  taskTitle: "ZQTASKZQ ring Helen about the safeguarding referral",
  recordSummary: "ZQRECZQ S03 disclosed something at home",
  studentId: "ZQPUPILZQ",
  personName: "ZQPERSONZQ",
  goalTitle: "ZQGOALZQ get a new job",
  fileName: "ZQFILEZQ.jpg",
  blockLabel: "ZQBLOCKZQ Period 3",
  skill: "ZQSKILLZQ reading",
  detail: "ZQDETAILZQ mother's phone number is 138",
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rep-"));
fs.mkdirSync(path.join(dir, "public"), { recursive: true });
fs.readdirSync(REPO).filter((f) => f.endsWith(".js")).forEach((f) => fs.copyFileSync(path.join(REPO, f), path.join(dir, f)));
fs.readdirSync(path.join(REPO, "public")).forEach((f) => fs.copyFileSync(path.join(REPO, "public", f), path.join(dir, "public", f)));
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
fs.mkdirSync(path.join(dir, "data"), { recursive: true });
fs.writeFileSync(path.join(dir, "data", "organiser-data.json"), JSON.stringify({
  savedAt: new Date().toISOString(),
  items: [
    { id: "1", title: SECRETS.taskTitle, date: "2026-09-14", deadlineType: "hard", promisedTo: SECRETS.personName, remindAt: "2026-09-13T09:00", snoozes: 2 },
    { id: "2", title: "second", waitingOn: SECRETS.personName, waitingSince: "2026-08-01" },
    { id: "3", title: "done one", done: true },
    { id: "4", title: "auto", autoPrep: true, openLoop: true },
  ],
  records: [{ id: "r", who: SECRETS.studentId, summary: SECRETS.recordSummary, detail: SECRETS.detail, topic: SECRETS.skill, level: "3", src: "ai", files: [{ id: "f", name: SECRETS.fileName }] }],
  goals: [{ id: "g", title: SECRETS.goalTitle }],
  contacts: [{ id: "c", name: SECRETS.personName, aka: ["ZQAKAZQ"], details: { notes: SECRETS.detail } }],
  schedule: [{ id: "b", label: SECRETS.blockLabel, start: "09:00", end: "10:00", days: [1], prep: { on: true, leadDays: 1 } }],
  recordConfig: { topics: [SECRETS.skill], descriptors: { [SECRETS.skill]: { 3: SECRETS.detail } }, whoIds: [SECRETS.studentId] },
  portfolio: { evidence: [{ id: "e", pointIds: ["TS1"], name: SECRETS.fileName }] },
}));

// A stand-in engine that fails, so failures show up in the report too.
const ol = http.createServer((req, res) => { res.writeHead(500); res.end("boom " + SECRETS.taskTitle); }).listen(11777);
const port = 3733;
const srv = spawn(process.execPath, ["server.js"], { cwd: dir,
  env: { ...process.env, NO_OPEN: "1", PORT: String(port), AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: "http://localhost:11777" }, stdio: "ignore" });
await sleep(2200);
const B = `http://localhost:${port}`;
// Make a failing call so there's something in the flight recorder.
await fetch(B + "/api/route", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ text: SECRETS.taskTitle }) }).catch(()=>{});
await sleep(300);
const rep = (await (await fetch(B + "/api/report")).json()).text;

sec("NOTHING THE USER WROTE MAY APPEAR");
for (const [what, secret] of Object.entries(SECRETS)) {
  ok(`no ${what}`, !rep.includes(secret), rep.split("\n").find((l) => l.includes(secret)));
}
ok("no 'ZQ' marker of any kind", !/ZQ/.test(rep), (/.*ZQ.*/.exec(rep) || [])[0]);
ok("the raw error text isn't echoed", !/boom/.test(rep));
ok("no full data path", !/organiser-data\.json/.test(rep));

sec("BUT IT SAYS ENOUGH TO BE USEFUL");
ok("counts the open tasks", /tasks\s+3 open, 1 done/.test(rep), rep.split("\n").find((l)=>l.startsWith("tasks")));
ok("counts hard deadlines", /1 hard deadlines/.test(rep));
ok("counts waiting-on", /1 waiting on someone/.test(rep));
ok("counts pushed-back reminders", /1 pushed back/.test(rep));
ok("counts unconfirmed records", /1 still unconfirmed/.test(rep));
ok("counts attached evidence", /1 files attached/.test(rep));
ok("counts learned spellings", /1 with learned spellings/.test(rep));
ok("counts timetable blocks and prep", /1 blocks, 1 set to make prep/.test(rep));
ok("counts written descriptors", /1 with descriptions written/.test(rep));
ok("names the version", /branch|not a git folder/.test(rep));
ok("says whether updates are connected", /updates\s+/.test(rep));
ok("says the engine isn't answering", /NOT answering/.test(rep));
ok("records the failed call", /failed/.test(rep) && /engine-said-500|other/.test(rep));
// With every call failing there are no successful timings to group — so the
// useful thing is that the FAILURES are broken down by job.
ok("failures are broken down by job", /sort — /.test(rep), rep.split("\n").filter((l)=>l.includes("×")).join(" | "));
ok("and it says which job never worked at all", /never once succeeded: sort/.test(rep));
ok("lists what's unused", /never used:/.test(rep));
ok("flags the syncing folder", /syncing folder|local folder/.test(rep));
ok("states the privacy rule at the top", /Nothing you have written appears below/.test(rep));
ok("and again at the end", /Nothing above identifies anyone/.test(rep));

sec("THE LOG ITSELF IS CLEAN");
const log = fs.readFileSync(path.join(dir, "data", "events.jsonl"), "utf8");
ok("the flight recorder holds no content either", !/ZQ|boom/.test(log), log.split("\n")[0]);
ok("it stores a class, not a message", /"why":"/.test(log) && !/"message"/.test(log));

srv.kill(); ol.close(); await sleep(200);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
