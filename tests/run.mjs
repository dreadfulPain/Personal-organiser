// THE WHOLE SUITE, ONE COMMAND. `npm test`.
//
// This lived in a scratch directory for months and was run by pasting a shell
// loop each time, which meant it existed only on the machine that happened to
// be running it. It is in the repo now, and the point of that is that it can
// be run by anyone, anywhere, without knowing the loop.
//
// One file at a time, on purpose. Several of these bind a port or write to
// data/, and run together they trip over each other — which shows up as a
// failure in a suite that is perfectly fine, and a false alarm is worse than a
// slow run.

import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// NOT EVERY .mjs HERE IS A SUITE. Some are the scaffolding the suites stand
// on — the browser stand-in, the stand-in engine, the shared counter.
//
// That was a list of filenames until it wasn't, which is the same mistake this
// whole change is about. A leading underscore says "scaffolding", and there is
// nothing left to keep up to date.
const isHelper = (f) => f === "run.mjs" || f.startsWith("_");

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs") && !isHelper(f))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

const run = (f) =>
  new Promise((done) => {
    const p = spawn(process.execPath, [join(HERE, f)], { cwd: HERE });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    // A suite that hangs must not hang the run. Two hundred seconds is far more
    // than the slowest of these takes.
    const kill = setTimeout(() => p.kill("SIGKILL"), 200000);
    p.on("close", (code) => {
      clearTimeout(kill);
      done({ f, code, out });
    });
  });

// ---------------------------------------------------------------------------
// YOUR OWN DATA SURVIVES THE TESTS.
//
// Ten of these suites finish by deleting the app's data directory, because each
// of them was written to clean up after itself and the app has exactly one
// place to put data. Run them on the machine you actually use the organiser on
// — which is the normal case for one person with one laptop — and your
// timetable, your class lists and your term's records go with them. That
// happened here, mid-session, to a real set-up week.
//
// Fixed in ONE place rather than ten, and rather than in the ten that will be
// eleven next month. A suite can delete whatever it likes; the file it would
// have destroyed isn't there while it runs, and is put back afterwards.
const LIVE = join(HERE, "..", "data", "organiser-data.json");
// OUTSIDE data/, because that is the directory the suites delete — put the copy
// in there and the very thing meant to protect it goes with it.
const ASIDE = join(HERE, "..", ".organiser-data-while-testing.json");
const hadLive = fs.existsSync(LIVE);
if (hadLive) {
  try {
    fs.renameSync(LIVE, ASIDE);
    console.log("  (your saved data is set aside while these run, and put back after)\n");
  } catch (e) {
    console.log(`\n  STOPPING: couldn't move your data file out of the way — ${e.message}`);
    console.log("  The tests delete it, so they are not being run.\n");
    process.exit(1);
  }
}
function giveItBack() {
  if (!hadLive) return;
  try {
    // THE DIRECTORY MAY BE GONE. The suites delete data/ outright, so putting
    // the file back needs somewhere to put it — without this the restore failed
    // with ENOENT and left somebody's timetable sitting in a dotfile they had
    // no reason to know about.
    fs.mkdirSync(join(HERE, "..", "data"), { recursive: true });
    fs.rmSync(LIVE, { force: true });
    fs.renameSync(ASIDE, LIVE);
  } catch (e) {
    console.log(`\n  YOUR DATA IS IN ${ASIDE} — couldn't move it back: ${e.message}\n`);
  }
}
// Whatever happens, including Ctrl-C.
process.on("exit", giveItBack);
process.on("SIGINT", () => { giveItBack(); process.exit(130); });

let pass = 0;
let fail = 0;
const broken = [];
const checks = [];
const reports = [];

for (const f of files) {
  const r = await run(f);
  const m = [...r.out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  if (m) {
    pass += Number(m[1]);
    fail += Number(m[2]);
  } else if (/\bok\(|\bbad\(/.test(fs.readFileSync(join(HERE, f), "utf8"))) {
    // It checks things, it just says so in its own words — the wiring audit
    // prints "No issues found" and exits non-zero when there are some.
    checks.push(f);
  } else {
    // A REPORT, NOT A TEST. It prints something for a person to read and
    // cannot fail. Counting it would be claiming coverage that isn't there,
    // and quietly leaving it out would be worse.
    reports.push(f);
  }
  const bad = r.code !== 0 || (m && Number(m[2]) > 0);
  if (bad) broken.push({ f, code: r.code, tail: r.out.trim().split("\n").slice(-14).join("\n") });
  process.stdout.write(
    `${bad ? "FAIL" : "  ok"}  ${f.padEnd(24)} ${m ? `${m[1]} passed, ${m[2]} failed` : "checked"}\n`
  );
}

if (broken.length) {
  console.log("\n" + "─".repeat(60));
  broken.forEach((b) => console.log(`\n${b.f} (exit ${b.code})\n${b.tail}`));
}
if (checks.length)
  console.log(`\n${checks.length} check the app over rather than counting: ${checks.join(", ")}`);
// SAID OUT LOUD. These assert nothing at all, and a run that quietly included
// them in "59 files" would be claiming more than it did.
if (reports.length)
  console.log(`\n${reports.length} print a report and cannot fail, so nothing here covers them: ` +
    reports.join(", "));
console.log(
  `\n${files.length - reports.length} of ${files.length} files test something · ` +
  `${pass} passed, ${fail} failed`
);
process.exit(fail || broken.length ? 1 : 0);
