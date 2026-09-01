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
    // THE TIMETABLE JOB. A model told the grid has been flattened can line the
    // cells up with the day names; one that hasn't been told reads the list top
    // to bottom and puts the whole week on Monday. This stand-in does exactly
    // that, so what comes back says whether it was told.
    else if (/turn it into a plain list of time blocks/i.test(sys)) {
      const told = /WEEKLY GRID that has been flattened/.test(sys);
      const user = (JSON.parse(b).messages || []).find((m) => m.role === "user")?.content || "";
      const DAY = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
      const names = [];
      const blocks = [];
      let span = null, col = 0;
      user.split("\n").map((l) => l.trim()).forEach((l) => {
        if (DAY[l]) { names.push(DAY[l]); return; }
        const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(l);
        if (m) { span = m; col = 0; return; }
        if (!span || !l || /"""|Period|Time/.test(l)) return;
        // Told, it lines up with the day names and leaves out what it cannot
        // place — which is what the hint asks for, and what lets the server's
        // own refusal of a day-less block be checked below.
        const day = told ? names[col] : 1;
        blocks.push({ label: l, start: span[1], end: span[2], days: day ? [day] : [] });
        col++;
      });
      out = { blocks };
    }
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

// A WEEK WHOSE COLUMNS ARE GONE, handed to the model because plain code can do
// nothing with it. Whether it is told what it is looking at decides whether the
// week comes back as a week or as one very long Monday.
const FLAT = ["Period", "Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "08:40-09:25", "English", "Story Telling", "Writing", "Reading", "Activity"].join("\n");
const askTt = async (body) => (await (await fetch(B + "/api/timetable", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body) })).json());

const flat = await askTt({ text: FLAT, flattened: true });
ok("a flattened week is read rather than refused", (flat.blocks || []).length === 5,
   JSON.stringify(flat).slice(0, 200));
ok("and lands across the week, not all on one day",
   new Set((flat.blocks || []).map((x) => x.days[0])).size === 5,
   JSON.stringify((flat.blocks || []).map((x) => `${x.label}:${x.days}`)));

// AND NOT TOLD, IT DOESN'T KNOW TO. Which is what the flag is for: the same
// text, the same model, and a whole week on Monday.
const blind = await askTt({ text: FLAT });
ok("the same text without the flag has nothing to line it up with",
   new Set((blind.blocks || []).map((x) => x.days[0])).size === 1,
   JSON.stringify((blind.blocks || []).map((x) => `${x.label}:${x.days}`)));

// AND A DAY-LESS BLOCK IS STILL NEVER KEPT. The model is being asked to work
// something out; a row it could not place must come back as one it couldn't
// read, not as a block with nothing to happen on.
const noDays = await askTt({ text: "09:00-10:00\nAssembly", flattened: true });
ok("a block with no day is never saved", (noDays.blocks || []).length === 0,
   JSON.stringify(noDays).slice(0, 200));
ok("it is handed back as one it couldn't read",
   (noDays.unreadable || []).some((u) => /no days/.test(u.why || "")),
   JSON.stringify(noDays.unreadable));

srv.kill(); ol.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
