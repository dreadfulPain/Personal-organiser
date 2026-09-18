import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A TEST RUN MAY NOT TOUCH YOUR DATA. Enforced, not intended.
//
// This file exists because of what happened, not what might. A screenshot
// script wrote its own fixture into the app's ordinary data directory — the
// path is the one the app opens, so it is the path a script types — and the
// fixture was then read back off the screen and reported as a real saved
// timetable. Six thousand passing checks had nothing to say about it, because
// every one of them was about what the code computes and none about where it
// wrote.
//
// Three separate things are checked here, because one is not enough:
//
//   1. THE SERVER REFUSES. Started as a test or a demo it must be given its own
//      directory, and it will not open one holding real data however it is
//      pointed there.
//   2. NOTHING IN THE SUITE NAMES THE REAL PATH. A file that types it is a file
//      that will one day write to it.
//   3. AND THE PROOF, which is the only one that cannot be argued with: a real
//      file is put where yours lives, the tests that start servers are run for
//      real, and it must come back byte for byte with nothing added beside it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const YOURS = path.join(REPO_ROOT, "data");
const YOURS_FILE = path.join(YOURS, "organiser-data.json");
const MARKER = ".this-is-real-data";

// Start a server and say what it did, rather than assuming it came up.
const start = async (env, wait) => {
  const p = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT,
    env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let said = "";
  p.stdout.on("data", (d) => (said += d));
  p.stderr.on("data", (d) => (said += d));
  const ended = new Promise((r) => p.on("close", (code) => r(code)));
  const code = await Promise.race([ended, sleep(wait || 1800).then(() => null)]);
  if (code === null) { p.kill("SIGKILL"); await ended; }
  return { code, said };
};

// ---------------------------------------------------------------------------
sec("A test run has to name its own directory");

{
  const port = () => String(3900 + Math.floor(Math.random() * 90));
  const no = await start({ ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: "", PORT: port() });
  ok("a server started as a test with nowhere to put things refuses to start",
     no.code === 1, `exit ${no.code}: ${no.said.slice(0, 200)}`);
  ok("  and says which setting is missing",
     /ORGANISER_DATA_DIR/.test(no.said), no.said.slice(0, 200));
  ok("  and says why there is no default",
     /somebody's real file/.test(no.said), no.said.slice(0, 300));

  // AND IT WILL NOT BE POINTED AT REAL DATA, whatever the path looks like. A
  // rule about path SHAPES cannot survive a typo; a directory that says what it
  // holds can.
  const real = fs.mkdtempSync(path.join(os.tmpdir(), "looks-real-"));
  fs.writeFileSync(path.join(real, MARKER), "yes");
  const nope = await start({ ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: real, PORT: port() });
  ok("and a directory holding real data is refused even when it is named",
     nope.code === 1, `exit ${nope.code}: ${nope.said.slice(0, 200)}`);
  ok("  saying what is in it rather than what the path looks like",
     /real saved data/.test(nope.said) && nope.said.includes(MARKER), nope.said.slice(0, 300));

  const fine = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-"));
  const up = await start({ ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: fine, PORT: port() });
  ok("while a directory of its own starts normally", up.code === null,
     `exit ${up.code}: ${up.said.slice(0, 200)}`);
  // AND IT DOES NOT CLAIM THAT ONE. The marker says "a person keeps things
  // here", so a scratch run must not leave one behind — the next test run would
  // then refuse a directory that holds nothing at all.
  ok("  and does not mark a scratch directory as yours",
     !fs.existsSync(path.join(fine, MARKER)), fs.readdirSync(fine).join(", "));

  const mine = fs.mkdtempSync(path.join(os.tmpdir(), "mine-"));
  const asUser = await start({ ORGANISER_ROLE: "user", ORGANISER_DATA_DIR: mine, PORT: port() });
  ok("and a real run marks its directory as holding real data",
     asUser.code === null && fs.existsSync(path.join(mine, MARKER)),
     `exit ${asUser.code} · ${fs.readdirSync(mine).join(", ")}`);
  [real, fine, mine].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}

// ---------------------------------------------------------------------------
sec("And nothing in the suite names the directory yours is in");

{
  // WHERE THE PATH IS ALLOWED TO APPEAR: in the two files whose job is this
  // one, and nowhere else. A file that types the real path is a file that will
  // one day write to it — which is exactly how this started.
  const MAY = new Set(["_where.mjs", "apart.mjs", "run.mjs"]);
  const named = [];
  for (const f of fs.readdirSync(path.join(REPO_ROOT, "tests")).filter((x) => x.endsWith(".mjs"))) {
    if (MAY.has(f)) continue;
    const src = fs.readFileSync(path.join(REPO_ROOT, "tests", f), "utf8");
    // The shapes that resolve to <repo>/data: joined from the repo root, or
    // written out as a path.
    const hits = [
      /\b(?:REPO|REPO_ROOT|__dirname)\s*,\s*["']data["']/,
      /\$\{(?:REPO|REPO_ROOT)\}\/data\b/,
      /["']\.\.\/data\/["']?/,
    ].filter((re) => re.test(src));
    if (hits.length) named.push(f);
  }
  ok("no suite names the data directory of the repository it is running in",
     named.length === 0,
     named.map((f) => `${f} names <repo>/data`).join("; "));

  // AND EVERY SUITE THAT STARTS A SERVER GOES THROUGH THE ONE PLACE.
  const spawns = [], missing = [];
  for (const f of fs.readdirSync(path.join(REPO_ROOT, "tests")).filter((x) => x.endsWith(".mjs"))) {
    if (f === "_where.mjs" || f === "apart.mjs") continue;
    const src = fs.readFileSync(path.join(REPO_ROOT, "tests", f), "utf8");
    if (!/spawn\([^)]*\[\s*["'](?:[^"']*\/)?server\.js["']/.test(src) &&
        !/spawn\([^)]*server\.js/.test(src)) continue;
    spawns.push(f);
    if (!/_where\.mjs/.test(src)) missing.push(f);
  }
  ok("the audit found suites that start servers", spawns.length > 10, String(spawns.length));
  ok("and every one of them goes through tests/_where.mjs",
     missing.length === 0, missing.join(", "));
}

// ---------------------------------------------------------------------------
sec("And the proof: a real file, where yours lives, through a real test run");

// THE ONLY CHECK THAT CANNOT BE ARGUED WITH. The two above say the code is
// arranged correctly. This one runs the suites for real with something
// irreplaceable in the way, and looks at it afterwards.
{
  const had = fs.existsSync(YOURS_FILE) ? fs.readFileSync(YOURS_FILE) : null;
  const hadDir = fs.existsSync(YOURS);
  const before = hadDir ? fs.readdirSync(YOURS).sort() : [];
  // Something that would be unmistakable if it were overwritten, and a marker,
  // so the directory looks exactly like a person's.
  const SENTINEL = JSON.stringify({
    savedAt: "2001-01-01T00:00:00.000Z",
    items: [{ id: "sentinel", title: "do not overwrite me" }],
    schedule: [], goals: [], records: [], contacts: [],
  }, null, 2);
  fs.mkdirSync(YOURS, { recursive: true });
  const hadMarker = fs.existsSync(path.join(YOURS, MARKER));
  if (!hadMarker) fs.writeFileSync(path.join(YOURS, MARKER), "sentinel run\n");
  fs.writeFileSync(YOURS_FILE, SENTINEL);

  // A SPREAD OF THEM, not one: the ones that start a server, the ones that
  // wrote into the directory before this, and the one that deletes it.
  const TRY = ["whole.mjs", "diag4.mjs", "roundtrip.mjs", "endpoints.mjs"];
  const ran = [];
  for (const f of TRY) {
    const p = spawn(process.execPath, [path.join("tests", f)], {
      cwd: REPO_ROOT, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const code = await new Promise((r) => p.on("close", r));
    ran.push(`${f}:${code}`);
  }
  ok("the suites that start servers all ran", ran.every((r) => r.endsWith(":0")), ran.join(" "));

  const now = fs.existsSync(YOURS_FILE) ? fs.readFileSync(YOURS_FILE) : null;
  ok("and the file where your data lives is still there",
     now !== null, "it was deleted");
  ok("  byte for byte as it was",
     now !== null && now.toString() === SENTINEL,
     now ? `now ${now.toString().slice(0, 120)}` : "gone");
  const after = fs.readdirSync(YOURS).sort();
  const added = after.filter((f) => !before.includes(f) &&
    f !== "organiser-data.json" && !(f === MARKER && !hadMarker));
  ok("  with nothing new left beside it",
     added.length === 0, `added: ${added.join(", ")}`);

  // Put back exactly what was there.
  if (!hadMarker) fs.rmSync(path.join(YOURS, MARKER), { force: true });
  if (had) fs.writeFileSync(YOURS_FILE, had);
  else fs.rmSync(YOURS_FILE, { force: true });
  if (!hadDir) fs.rmSync(YOURS, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
sec("And the one write nobody asked for leaves something to go back to");

// A SCHEMA STAMP IS STILL A CHANGE TO SOMEBODY'S FILE. The app opens the file,
// sees it was written under an older reading of its own answers, and writes a
// marker so it knows not to ask twice. Good behaviour — and a write nobody
// chose, so it keeps a copy first.
//
// Neither of the two copies the app already keeps is good enough for this one.
// previous.json is overwritten by the very next save, and the save right after
// a migration is the one somebody makes while answering it. The daily snapshot
// is written once a day, so if the app was used this morning it holds this
// morning rather than the state before the change.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
  fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
  const WAS = {
    savedAt: "2026-09-01T09:00:00.000Z",
    schedule: [{ id: "h1", label: "Winter Vacation", date: "2027-01-23",
      start: "00:00", end: "23:59", days: [], blocksDay: true, source: "paste" }],
    items: [], goals: [], records: [], contacts: [],
  };
  fs.writeFileSync(path.join(dir, "organiser-data.json"), JSON.stringify(WAS, null, 2));
  // A DAILY SNAPSHOT ALREADY THERE, which is the case that makes the existing
  // backups no help: the app was used earlier today.
  const daily = path.join(dir, "backups",
    `organiser-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(daily, JSON.stringify({ savedAt: "earlier today" }));

  const port = 3990 + Math.floor(Math.random() * 9);
  const p = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT,
    env: { ...process.env, ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: dir,
      NO_OPEN: "1", PORT: String(port) }, stdio: "ignore" });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 40; i++) {
    try { await fetch(B + "/api/data"); break; } catch { await sleep(150); }
  }
  // The stamp, exactly as the page writes it at load.
  await fetch(B + "/api/data", { method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedAt: WAS.savedAt,
      scheduleMeaning: { wrote: 1, ask: ["h1"], done: [] } }) });
  // And then the save somebody makes while answering it, which is what takes
  // previous.json away.
  await fetch(B + "/api/data", { method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule: [{ id: "h1", label: "Winter Vacation",
      date: "2027-01-23", start: "00:00", end: "23:59", days: [],
      blocksDay: false, noLessons: true, source: "hand" }] }) });
  p.kill("SIGKILL");
  await sleep(200);

  const kept = path.join(dir, "backups", "before-meaning-1.json");
  ok("stamping a file's meaning keeps a copy of what was there before",
     fs.existsSync(kept), fs.readdirSync(path.join(dir, "backups")).join(", "));
  const back = fs.existsSync(kept) ? JSON.parse(fs.readFileSync(kept, "utf8")) : {};
  ok("  holding the state before the stamp, not after it",
     !back.scheduleMeaning && (back.schedule || [])[0] &&
       back.schedule[0].blocksDay === true,
     JSON.stringify({ meaning: back.scheduleMeaning,
       blocksDay: (back.schedule || [])[0] && back.schedule[0].blocksDay }));
  // AND IT IS NOT ONE OF THE ROLLING ONES. Both of those have moved on by now,
  // which is the whole reason this copy exists.
  const prev = JSON.parse(fs.readFileSync(path.join(dir, "backups", "previous.json"), "utf8"));
  ok("  where the rolling copy has already moved past it",
     !!prev.scheduleMeaning,
     "previous.json still holds the pre-migration state, so this proves nothing");
  ok("  and the day's snapshot was already taken before any of this",
     JSON.parse(fs.readFileSync(daily, "utf8")).savedAt === "earlier today",
     "the daily snapshot happened to cover it, so this proves nothing");
  // ONCE, NOT ON EVERY SAVE.
  const copies = fs.readdirSync(path.join(dir, "backups"))
    .filter((f) => /^before-meaning-/.test(f));
  ok("  and one copy per meaning, not one per save", copies.length === 1, copies.join(", "));

  // AND IT SURVIVES THE THING IT EXISTS FOR: going back.
  //
  // Restore an older backup and the file is unstamped again, so the app stamps
  // it a second time. If that second stamp overwrote the copy, it would replace
  // the state before the migration with the state you happened to restore —
  // taking away the only thing you had to go back to at the exact moment you
  // were using it.
  const first = fs.readFileSync(kept, "utf8");
  fs.writeFileSync(path.join(dir, "organiser-data.json"), JSON.stringify({
    savedAt: "2026-09-02T09:00:00.000Z", items: [{ id: "restored", title: "from a backup" }],
    schedule: [], goals: [], records: [], contacts: [],
  }, null, 2));
  const p2 = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT,
    env: { ...process.env, ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: dir,
      NO_OPEN: "1", PORT: String(port + 20) }, stdio: "ignore" });
  const B2 = `http://127.0.0.1:${port + 20}`;
  for (let i = 0; i < 40; i++) {
    try { await fetch(B2 + "/api/data"); break; } catch { await sleep(150); }
  }
  await fetch(B2 + "/api/data", { method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedAt: "2026-09-02T09:00:00.000Z",
      scheduleMeaning: { wrote: 1, ask: [], done: [] } }) });
  p2.kill("SIGKILL");
  await sleep(200);
  ok("  and restoring a backup does not overwrite the copy with what you restored",
     fs.readFileSync(kept, "utf8") === first,
     JSON.parse(fs.readFileSync(kept, "utf8")).items ? "it now holds the restored file" : "changed");

  // AND PRUNING DOES NOT EAT IT. Sixty daily snapshots is two months of
  // ordinary use, and the copy has to still be there after them.
  for (let i = 1; i <= 65; i++)
    fs.writeFileSync(path.join(dir, "backups",
      `organiser-2026-${String(Math.ceil(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}.json`),
      "{}");
  const p3 = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT,
    env: { ...process.env, ORGANISER_ROLE: "test", ORGANISER_DATA_DIR: dir,
      NO_OPEN: "1", PORT: String(port + 40) }, stdio: "ignore" });
  const B3 = `http://127.0.0.1:${port + 40}`;
  for (let i = 0; i < 40; i++) {
    try { await fetch(B3 + "/api/data"); break; } catch { await sleep(150); }
  }
  const at3 = (await (await fetch(B3 + "/api/data")).json()).savedAt;
  await fetch(B3 + "/api/data", { method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedAt: at3, items: [{ id: "x", title: "an ordinary save" }] }) });
  p3.kill("SIGKILL");
  await sleep(200);
  const dailies = fs.readdirSync(path.join(dir, "backups"))
    .filter((f) => /^organiser-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  ok("  and two months of ordinary backups do not prune it away",
     fs.existsSync(kept) && dailies.length <= 61,
     `${dailies.length} dated copies · before-meaning-1.json ${fs.existsSync(kept) ? "kept" : "GONE"}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
