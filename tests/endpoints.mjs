import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// EVERY WAY IN AND OUT OF THE SERVER, WITH NO ENGINE RUNNING.
//
// Eight of these had never been called by anything. Two of them move files —
// one takes a file in, one writes documents out — and neither had ever been
// asked what it does when something is wrong.
//
// The state tested here is the one most people are in: the app running, no
// model installed. What matters then is not that the clever endpoints work, it
// is that they REFUSE PROPERLY — a status you can act on and a sentence a
// person can read, rather than a hang, a stack trace, or worst of all a
// cheerful empty answer that looks like "there was nothing to find".

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PORT = 3961;
const BASE = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT,
  // No AI_ENGINE at all: the ordinary machine, nothing installed.
  env: { ...process.env, NO_OPEN: "1", PORT: String(PORT), AI_ENGINE: "", AI_BASE_URL: "" },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 2200));

const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let j = null;
  try { j = await r.json(); } catch { /* not json */ }
  return { status: r.status, j };
};

// ---------------------------------------------------------------------------
sec("The ones that need a model refuse in words");
{
  // Each gets enough to work on that "nothing to do here" isn't a valid answer
  // — otherwise a 200 saying "no suggestion" is honest and proves nothing.
  const enough = {
    "/api/breakdown": { title: "Write the reports", text: "Write the reports" },
    "/api/cluster": { tasks: [{ id: "1", title: "draft the letter" }, { id: "2", title: "send the letter" },
      { id: "3", title: "chase a reply" }] },
    "/api/record-understand": { text: "Aisha read aloud well today", who: "p1" },
    "/api/compare": { text: "one thing and another thing" },
  };
  for (const p of Object.keys(enough)) {
    const r = await post(p, enough[p]);
    ok(`${p} answers rather than hanging`, r.status > 0, String(r.status));
    ok(`${p} says no rather than pretending`, r.status >= 400, String(r.status));
    // A REFUSAL WITH NO WORDS IS A DEAD END. This is the moment somebody is
    // trying to work out why nothing happened.
    ok(`${p} explains itself`, !!(r.j && (r.j.message || r.j.error)), JSON.stringify(r.j));
    // AND IT MUST NOT COME BACK EMPTY-BUT-FINE. "200 with nothing in it" reads
    // as "there was nothing to find", which is a different and much worse lie.
    ok(`${p} never says nothing-found when it means not-installed`,
       !(r.status === 200 && r.j && Array.isArray(r.j.entries) && !r.j.entries.length),
       JSON.stringify(r.j));
  }
}

sec("Warming something that isn't there is harmless");
{
  const r = await post("/api/warm", {});
  ok("it answers", r.status > 0, String(r.status));
  ok("and does not fall over", r.status !== 500, String(r.status));
}

sec("Which version of the file we are on");
{
  // The shared-folder guard rests on this. If it ever stops answering, two
  // machines can overwrite each other and neither is told.
  const r = await fetch(`${BASE}/api/data-version`);
  ok("it answers", r.ok, String(r.status));
  const j = await r.json();
  ok("with something that identifies the file",
     j && (j.savedAt !== undefined || j.version !== undefined), JSON.stringify(j));
}

sec("Taking a file in");
{
  // The name rides on the query string; the body is the file itself.
  const put = (name, body) =>
    fetch(`${BASE}/api/upload?name=${encodeURIComponent(name)}`, { method: "POST", body })
      .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

  const empty = await put("notes.txt", "");
  ok("a file with nothing in it is refused", empty.status === 400, JSON.stringify(empty));
  ok("and says so in words", /empty/i.test((empty.j || {}).message || ""), JSON.stringify(empty.j));

  // IT MUST NOT LET ANYTHING OUT OF ITS OWN FOLDER. A name with .. in it is how
  // a file ends up written over the server, or over your data, and the name
  // comes from whatever the browser was handed.
  const before = fs.readFileSync(path.join(REPO_ROOT, "server.js"), "utf8").length;
  const climb = await put("../../server.js", "x");
  // WHAT MATTERS IS WHERE IT LANDS, not whether the name still has dots in it.
  // "_.._server.js" looks alarming and is a perfectly flat filename: the
  // slashes were replaced, so there is no path left to climb.
  const FILES = path.join(REPO_ROOT, "data", "files");
  const landed = path.resolve(FILES, String(climb.j.id));
  ok("a name that climbs out of the folder is answered, not obeyed", climb.status === 200,
     JSON.stringify(climb.j));
  ok("and whatever it is called, it lands inside the app's own folder",
     landed.startsWith(path.resolve(FILES) + path.sep), landed);
  ok("with nothing left of the path it tried to take",
     !String(climb.j.id).includes("/") && !String(climb.j.id).includes("\\"),
     String(climb.j.id));
  ok("and server.js is untouched",
     fs.readFileSync(path.join(REPO_ROOT, "server.js"), "utf8").length === before, "it was written over");

  // A perfectly ordinary one still works, and keeps a name you'd recognise.
  const fine = await put("reading check.txt", "some words");
  ok("an ordinary file goes in", fine.status === 200, JSON.stringify(fine));
  ok("and keeps a name you would recognise", /reading check/.test(String(fine.j.id)), String(fine.j.id));

  [climb.j && climb.j.id, fine.j && fine.j.id].filter(Boolean).forEach((id) => {
    try { fs.unlinkSync(path.join(REPO_ROOT, "data", "files", String(id))); } catch { /* already gone */ }
  });
}

sec("Writing documents out");
{
  const r = await post("/api/export", {});
  ok("an export with nothing to write answers rather than hanging", r.status > 0, String(r.status));
  ok("and does not fall over", r.status !== 500, JSON.stringify(r.j));
  ok("saying what happened either way", !!(r.j && (r.j.message || r.j.error || r.j.ok !== undefined)),
     JSON.stringify(r.j));
}

sec("A wrong address is a wrong address");
{
  // A doubled slash used to come back as "Something went wrong", which reads as
  // a broken app and sends you hunting for a fault that isn't there.
  const r = await fetch(`${BASE}//`);
  ok("a mistyped address says not found", r.status === 404, String(r.status));
}

sec("And nothing anywhere leaks the file it is guarding");
{
  // Every one of these is reachable from a browser. None of them may hand back
  // what you have written.
  for (const p of ["/api/health", "/api/data-version"]) {
    const r = await fetch(BASE + p);
    const text = await r.text();
    ok(`${p} carries no records`, !/"records"|"pastoralNotes"|"toldLog"/.test(text), text.slice(0, 160));
  }
}

srv.kill();
done();
