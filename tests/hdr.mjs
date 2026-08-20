import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// NOTHING THE APP SERVES MAY BE CACHED.
//
// This printed the headers and left you to read them. What it was really
// asking is worth pinning: after an update, the next time you open the app you
// must get the new one. A browser holding on to yesterday's app.js is a bug
// that looks exactly like the update having failed, and it is unfixable from
// inside the app.
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done } = checker();

const PORT = 3777;
const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT, env: { ...process.env, NO_OPEN: "1", PORT: String(PORT) }, stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 2000));

for (const p of ["index.html", "app.js", "style.css", "timeline.html", "schedule.js", "dates.js"]) {
  const r = await fetch(`http://localhost:${PORT}/${p}`);
  const cc = r.headers.get("cache-control") || "";
  ok(`${p} is served`, r.ok, `status ${r.status}`);
  ok(`${p} is never held on to`, /no-store/.test(cc), `Cache-Control: ${cc || "(none)"}`);
}
// A file the server does not serve gets no cache header to argue about.
const miss = await fetch(`http://localhost:${PORT}/pipeline.js`);
ok("a file outside the app isn't served at all", miss.status === 404, String(miss.status));

srv.kill();
done();
