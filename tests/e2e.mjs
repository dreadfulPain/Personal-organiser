import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// End-to-end over real HTTP: the paths this turn touched, plus the ones it
// could plausibly have broken.
import http from "node:http";
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };

const oport = 11700, sport = 3700;
const ol = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: [{ name: "qwen3:14b" }] })); }
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const sys = (JSON.parse(b || "{}").messages || []).find((m) => m.role === "system")?.content || "";
    let out = {};
    if (/router inside a calm personal organiser/.test(sys))
      out = { entries: [{ kind: "task", title: "Wait for SHSID's reply", item_type: "task", date: "", time: "", deadline: "", importance: "normal", effort: "quick", tags: [], when_text: "", goal_link: "", open_loop: true, promised_to: "Helen", who: "", note_type: "", summary: "", topic: "", level: "", follow_up: false, follow_up_date: "", standard: "", person: "", direction: "", note: "" }] };
    else if (/numbered line/.test(sys)) { const n = [...((JSON.parse(b).messages||[]).find(m=>m.role==="user")?.content||"").matchAll(/^(\d+)\. /gm)]; out = { answers: n.map(([,x]) => ({ n: Number(x), mine: true })) }; }
    else if (/ONE label/.test(sys)) out = { kind: "task" };
    else if (/ONE thing to do/.test(sys)) out = { title: "a thing", date: "", promised_to: "" };
    else if (/ONLY what is missing/.test(sys)) out = { missed: [] };
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ message: { content: JSON.stringify(out) } }));
  });
}).listen(oport);

const srv = spawn(process.execPath, ["server.js"], {
  cwd: REPO_ROOT,
  env: { ...process.env, AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b", AI_BASE_URL: `http://localhost:${oport}`, NO_OPEN: "1", PORT: String(sport) },
  stdio: "ignore",
});
await sleep(2200);
const B = `http://localhost:${sport}`;

for (const p of ["", "index.html", "records.html", "class.html", "timeline.html", "compare.html", "app.js", "capture.js", "pipeline.js"]) {
  const r = await fetch(`${B}/${p}`);
  ok(`serves /${p || "(root)"}`, p === "pipeline.js" ? r.status === 404 : r.ok, String(r.status));
}

const h = await (await fetch(B + "/api/health")).json();
ok("health says the engine is live", h.hasAI === true && h.engineNote === "");

const rt = await (await fetch(B + "/api/route", { method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ text: "sent message to Helen (from SHSID) with the wording for the next school year. waiting for the school's reply", today: "2026-08-12", config: {} }) })).json();
ok("the user's message sorts", rt.entries && rt.entries.length === 1, JSON.stringify(rt).slice(0,200));
ok("it became an open loop", rt.entries[0].item.openLoop === true);
ok("Helen is grounded — she's in the text", !rt.entries[0].ungrounded, JSON.stringify(rt.entries[0].ungrounded));

const pj = await (await fetch(B + "/api/pipeline", { method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ text: "Call the dentist. Book the hall. Email Wei.", today: "2026-08-12", config: {} }) })).json();
ok("the pipeline still starts", !!pj.id, JSON.stringify(pj));
await sleep(2500);
const st = await (await fetch(B + "/api/pipeline?id=" + pj.id)).json();
ok("and finishes", st.done === true);
ok("with entries", (st.entries || []).length === 3, String((st.entries||[]).length));
ok("and a coverage verdict", st.coverage && st.coverage.checked === true);

const tt = await (await fetch(B + "/api/timetable", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ text: "x" }) })).json();
ok("timetable still answers with both lists", "blocks" in tt || "message" in tt, JSON.stringify(tt).slice(0,120));

srv.kill(); ol.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
