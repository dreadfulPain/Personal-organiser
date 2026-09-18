// WHERE A TEST OR A SCREENSHOT RUN KEEPS ITS DATA — which is never yours.
//
// This exists because of a real incident, not a hypothetical one. A screenshot
// script wrote its fixture straight into the app's ordinary data directory,
// because that is the path the app opens and so it is the path a script types.
// The fixture was then read back off the screen and reported as real saved
// data, and the only thing that caught it was tracing one wrong date.
//
// The suite already moved the live file aside while it ran. That protects one
// command. It does not protect `node tests/e2e.mjs` on its own, and it protects
// nothing at all that somebody writes to look at a screen.
//
// So the safe thing is made the easy thing: import this, spawn with env(), and
// the server you start has its own directory and is forbidden from opening
// anybody's real one. See whereData in server.js for the other half.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// THE ONE NOBODY MAY WRITE TO. Exported so the guard that checks this can name
// it without working it out a second time — see tests/apart.mjs.
export const YOURS = path.join(REPO, "data");
export const YOURS_FILE = path.join(YOURS, "organiser-data.json");
export const MARKER = ".this-is-real-data";

// OUTSIDE THE REPOSITORY, on purpose. A scratch directory inside it is one
// `rm -rf data` away from the real one, one glob away from being committed, and
// — on the machine this app is actually used on — inside a folder that syncs to
// OneDrive.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "organiser-test-"));

let n = 0;
// A directory of its own for one server, one test, one screenshot run.
export function scratch(what) {
  const dir = path.join(ROOT, `${String(what || "run").replace(/\W+/g, "-")}-${++n}`);
  fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
  return dir;
}

// THE DEFAULT ONE, for the common case: a test that starts a server and does
// not care where its file goes, only that it is not yours.
export const DATA = scratch("data");

// Set for this process too, so anything spawned with {...process.env} — which
// is nearly everything — inherits it without being asked twice.
process.env.ORGANISER_ROLE = process.env.ORGANISER_ROLE || "test";
process.env.ORGANISER_DATA_DIR = process.env.ORGANISER_DATA_DIR || DATA;

// What to hand a spawn. `dir` for a test that wants its own; left out, they
// share DATA, which is fine for tests that do not look at the file.
export function env(extra, dir) {
  return { ...process.env, NO_OPEN: "1", ORGANISER_ROLE: "test",
    ORGANISER_DATA_DIR: dir || process.env.ORGANISER_DATA_DIR || DATA, ...(extra || {}) };
}

// A COPIED REPOSITORY IS A DIFFERENT CASE. Four tests copy the app somewhere
// disposable and run it as a person would, to check what a real installation
// does — so the role really is "user" and the data directory really is that
// copy's own. Said out loud here rather than left as a bare env object, because
// "this one runs as a user" is exactly the claim that needs to be visible.
export function asUser(copiedTo, extra) {
  const dir = path.join(copiedTo, "data");
  if (path.resolve(copiedTo) === path.resolve(REPO))
    throw new Error("asUser() was given the real repository, not a copy of it");
  return { ...process.env, NO_OPEN: "1", ORGANISER_ROLE: "user",
    ORGANISER_DATA_DIR: dir, ...(extra || {}) };
}

// AND FOR A SCRIPT WRITTEN TO LOOK AT A SCREEN, which is where this went wrong.
//
// A screenshot run wants a file it can see on a page, so it has to write one —
// and the shortest way to write one is to write it where the app reads. This
// makes the safe way shorter: it hands back a directory, puts the document in
// it, and gives you the environment to start a server with. Nothing about it
// can reach your own file.
//
//   const { dir, env } = fixture("migration", { schedule: [...] });
//   spawn(process.execPath, ["server.js"], { cwd: REPO, env: env({ PORT: "3797" }) });
export function fixture(what, doc) {
  const dir = scratch(`demo-${what || "fixture"}`);
  fs.writeFileSync(path.join(dir, "organiser-data.json"),
    JSON.stringify({ savedAt: new Date().toISOString(), ...(doc || {}) }, null, 2));
  return {
    dir,
    file: path.join(dir, "organiser-data.json"),
    read: () => JSON.parse(fs.readFileSync(path.join(dir, "organiser-data.json"), "utf8")),
    env: (extra) => ({ ...process.env, NO_OPEN: "1", ORGANISER_ROLE: "demo",
      ORGANISER_DATA_DIR: dir, ...(extra || {}) }),
  };
}

export function wipe() {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
}
