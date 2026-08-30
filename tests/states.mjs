import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHAT THE APP BELIEVES ABOUT THE ENGINE, in the four states it can be in.
//
// This printed a table and left you to read it. The four answers matter and
// three of them are counter-intuitive, which is exactly why they need pinning:
// a bare "qwen3" tag IS the model you asked for, an empty tags list is not
// evidence the model is missing, and only a list that has other models in it
// and not yours is grounds for saying so.
import http from "node:http";
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// WHAT IT LISTS AND WHAT IT HAS ARE TWO DIFFERENT THINGS, and the whole point
// of case 7 is an engine where they differ. A real Ollama answers /api/show
// about a model it has and 404s about one it hasn't, so this does too —
// answering everything, as it used to, made "the model is missing" and "the
// model is there" indistinguishable and quietly passed both.
function fakeOllama(port, models, has) {
  const really = has || models;
  return http.createServer((req, res) => {
    if (/\/api\/tags/.test(req.url)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ models: models.map((n) => ({ name: n })) }));
    }
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => {
      if (/\/api\/show/.test(req.url)) {
        let want = "";
        try { const j = JSON.parse(b || "{}"); want = j.name || j.model || ""; } catch { /* none */ }
        const bare = (n) => String(n).split(":")[0];
        const found = really.some((n) => n === want || bare(n) === bare(want));
        res.writeHead(found ? 200 : 404, { "Content-Type": "application/json" });
        return res.end(found ? JSON.stringify({ model_info: {} }) : JSON.stringify({ error: "model not found" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { content: JSON.stringify({ entries: [] }) } }));
    });
  }).listen(port);
}

async function check(label, models, wanted, expectAI, expectNote, has) {
  const oport = 11400 + Math.floor(Math.random() * 90);
  const sport = 3900 + Math.floor(Math.random() * 90);
  const ol = fakeOllama(oport, models, has);
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, AI_ENGINE: "ollama", AI_MODEL: wanted, AI_BASE_URL: `http://localhost:${oport}`, NO_OPEN: "1", PORT: String(sport) },
    stdio: "ignore",
  });
  await sleep(2000);
  const d = await (await fetch(`http://localhost:${sport}/api/health`)).json();
  console.log(`${label.padEnd(28)} hasAI=${String(d.hasAI).padEnd(5)} note=${JSON.stringify(d.engineNote)}`);
  ok(`${label}: ${expectAI ? "sorting is on" : "sorting is off"}`, d.hasAI === expectAI,
     `hasAI=${d.hasAI}`);
  ok(`${label}: ${expectNote ? "and it says what to do about it" : "and says nothing it doesn't need to"}`,
     expectNote ? new RegExp(expectNote).test(d.engineNote || "") : !d.engineNote,
     JSON.stringify(d.engineNote));
  srv.kill(); ol.close();
  await sleep(300);
}

// The model is there, named exactly.
await check("4. everything working", ["qwen3:14b"], "qwen3:14b", true, "");
// Ollama sometimes reports "qwen3" for "qwen3:14b". Refusing to sort over that
// would be the app breaking itself on a naming detail.
await check("5. tag reported bare", ["qwen3"], "qwen3:14b", true, "");
// Other models are pulled and yours isn't. THIS is the one worth saying, and
// it says the command rather than the problem.
await check("6. wrong model pulled", ["llama3.2:3b"], "qwen3:14b", false, "ollama pull qwen3:14b");
// AN EMPTY LIST IS NOT AN ANSWER EITHER WAY, so it is no longer treated as
// one. Some builds report nothing while having the model — assuming the worst
// would switch sorting off for people who have it — and a machine with nothing
// pulled reports exactly the same thing, which used to come back as "answering"
// and cost somebody weeks of wondering why it read so badly.
//
// So the list stopped being the evidence: /api/show is asked about the model
// itself. This engine answers about it, so it has it, so sorting is on.
await check("7. tags list empty, model there", [], "qwen3:14b", true, "", ["qwen3:14b"]);
// AND THE SAME EMPTY LIST WITH NOTHING BEHIND IT — the day you install Ollama
// and haven't pulled anything. Indistinguishable from the line above by the
// list alone, which is why the list stopped being the evidence.
await check("8. nothing pulled at all", [], "qwen3:14b", false, "no models are installed yet");
done();
