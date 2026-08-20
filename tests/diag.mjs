import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE DIAGNOSE PAGE, WHICH IS WHAT YOU HAVE WHEN NOTHING ELSE WORKS.
//
// It printed its own output for a person to read. What it must actually do is
// never in doubt: say what state each thing is in, say it in words rather than
// a code, offer a fix for anything broken, and hand you the whole lot as text
// you can paste to somebody — because the moment you need this is the moment
// you cannot describe the problem yourself.
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done } = checker();
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

ok("it checks several things, not one", (d.checks || []).length >= 4, String((d.checks || []).length));
ok("every one says what state it is in",
   d.checks.every((c) => ["ok", "info", "problem"].includes(c.state)),
   JSON.stringify(d.checks.map((c) => c.state)));
ok("and every one says it in words",
   d.checks.every((c) => (c.detail || "").length > 10),
   JSON.stringify(d.checks.filter((c) => (c.detail || "").length <= 10).map((c) => c.name)));
// A PROBLEM WITH NO WAY OUT IS JUST BAD NEWS.
ok("anything broken comes with something to do about it",
   d.checks.filter((c) => c.state === "problem").every((c) => (c.fix || "").length > 5),
   JSON.stringify(d.checks.filter((c) => c.state === "problem" && !(c.fix || "").length).map((c) => c.name)));
// The whole point of the page: you can hand it to somebody.
ok("all of it can be copied out in one go", (d.copyText || "").length > 100, String((d.copyText || "").length));
ok("and what's copied is what's on screen",
   d.checks.every((c) => d.copyText.includes(c.name)),
   JSON.stringify(d.checks.map((c) => c.name).filter((n) => !d.copyText.includes(n))));
// AND IT NEVER CARRIES YOUR WRITING. This is the file you send to a stranger.
ok("it holds nothing you wrote", !/\b(items|records|title)"\s*:/.test(d.copyText),
   d.copyText.slice(0, 200));

srv.kill();
done();
