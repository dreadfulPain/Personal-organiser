import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// Names → People, and the waiting rhythm that must not become nagging.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
const REPO = REPO_ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };
const section = (s) => console.log("\n" + s);

// ---------- names ----------
const sandbox = { window: {}, console, Date, Math, JSON, Set, Map };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "public/names.js"), "utf8"), sandbox);
const N = sandbox.window.OrganiserNames;

section("A name is checked by looking, not by asking a model");
{
  const people = [{ id: "1", name: "Helena Zhou" }, { id: "2", name: "Wei" }, { id: "3", name: "Sarah Bell" }];
  ok("an exact name links quietly", N.look("Wei", people).state === "matched");
  ok("case doesn't matter", N.look("wei", people).state === "matched");
  ok("a first name matches a full name", N.look("Sarah", people).state === "matched" && N.look("Sarah", people).contact.id === "3");

  // THE ONE WORTH ASKING ABOUT.
  const near = N.look("Helen", people);
  ok("a one-letter slip is flagged, not silently accepted", near.state === "nearly", near.state);
  ok("and it names who it might have meant", near.suggestions[0].name === "Helena Zhou");
  ok("it never picks for you", near.contact === null);

  ok("a genuinely new person is 'new'", N.look("Gareth", people).state === "new");
  ok("short different names are NOT treated as typos", N.look("Ben", [{ id: "x", name: "Ken" }]).state === "new");
  // Two Helens is exactly when a guess would be wrong.
  const two = N.look("Helen", [{ id: "a", name: "Helen Zhou" }, { id: "b", name: "Helen Smith" }]);
  ok("two people with the same first name must be asked about", two.state === "nearly" && two.suggestions.length === 2);
  ok("an empty roster means new, not a crash", N.look("Helen", []).state === "new");
  ok("an empty name asks nothing", N.look("", people).state === "new");

  const entry = { kind: "task", item: { promisedTo: "Wei", waitingOn: "Helen" } };
  ok("both person fields are found", N.namesIn(entry).map((x) => x.field).join() === "promisedTo,waitingOn");
  ok("a handover's person is found", N.namesIn({ kind: "handover", handover: { person: "Jo" } })[0].name === "Jo");
}

// ---------- the rhythm ----------
section("Waiting on someone: a rhythm with an exit, not an alarm");
{
  const app = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  ok("it has its own section, not 'Needs finishing'", /function renderWaitingOn/.test(app));
  ok("and the code says why that matters", /can't finish it — the next move is theirs/.test(app));
  const fn = /function renderWaitingOn[\s\S]*?\n  \}/.exec(app)?.[0] || "";
  ["it came", "nudge them", "still waiting", "stop asking"].forEach((a) =>
    ok(`every ping offers "${a}"`, fn.includes(`"${a}"`))
  );
  ok("stopping keeps the task", /Won't ask about that again — the task is still on your list/.test(app));
  ok("it shows how long, as a fact", /since today|days/.test(fn));
  ok("nudging makes a real task rather than a feeling", /function nudge/.test(app) && /Nudge \$\{it\.waitingOn\}/.test(app));
  ok("no judging words anywhere in it", !/should have|still haven't|you keep|chase them up again|lazy/.test(fn));
}

// ---------- the server rhythm, for real ----------
section("The server re-arms it — and stops on its own");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wo-"));
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });
  fs.readdirSync(REPO).filter((f) => f.endsWith(".js")).forEach((f) => fs.copyFileSync(path.join(REPO, f), path.join(dir, f)));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });

  const pad = (n) => String(n).padStart(2, "0");
  const past = new Date(Date.now() - 30 * 60000);
  const localDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const since = new Date(Date.now() - 12 * 86400000);

  const write = (asked) => fs.writeFileSync(path.join(dir, "data", "organiser-data.json"), JSON.stringify({
    savedAt: new Date().toISOString(), schedule: [],
    items: [{ id: "w", title: "Helen's reply about next year", waitingOn: "Helen",
      waitingSince: `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`,
      asked, remindAt: localDT(past), remindedAt: null, createdAt: new Date().toISOString() }],
  }));
  const run = async (env = {}) => {
    const nf = path.join(dir, "notes.jsonl");
    fs.writeFileSync(nf, "");
    const kid = spawn(process.execPath, ["server.js"], { cwd: dir,
      env: { ...process.env, NOTIFY_FILE: nf, PORT: String(3560 + Math.floor(Math.random() * 60)), REMIND_INTERVAL_MS: "5000", NO_OPEN: "1", ...env }, stdio: "ignore" });
    await sleep(6500); kid.kill(); await sleep(200);
    return {
      notes: fs.readFileSync(nf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
      item: JSON.parse(fs.readFileSync(path.join(dir, "data", "organiser-data.json"), "utf8")).items[0],
    };
  };

  write(0);
  const first = await run();
  ok("it pings about the wait", first.notes.length === 1 && /Still waiting on Helen/.test(first.notes[0].title), JSON.stringify(first.notes));
  ok("it says how long, not how bad", /12 days now/.test(first.notes[0].body), first.notes[0].body);
  ok("and offers the way out in the notification itself", /Nudge them, or let it go\?/.test(first.notes[0].body));
  ok("no scolding in the wording", !/should|still haven't|forgot|overdue/i.test(first.notes[0].title + first.notes[0].body));
  ok("it RE-ARMS rather than going quiet", !!first.item.remindAt && first.item.remindAt > localDT(new Date()), first.item.remindAt);
  ok("and counts that it asked", first.item.asked === 1);

  write(5); // one short of the cap
  const last = await run();
  ok("at the cap it pings one final time", last.notes.length === 1);
  ok("then stops re-arming by itself", last.item.remindAt === "", last.item.remindAt);
  ok("the count is honest about how many", last.item.asked === 6);

  write(0);
  const quick = await run({ WAITING_ASK_DAYS: "2" });
  const d = new Date(quick.item.remindAt);
  const gap = Math.round((d - new Date()) / 86400000);
  ok("the rhythm is yours to change", gap === 2, `${gap} days`);

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
