import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// End-to-end over real HTTP: the paths this turn touched, plus the ones it
// could plausibly have broken.
import fs from "node:fs";
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
    if (/router inside a calm personal organiser/.test(sys) && /RECORDPLEASE/.test(b))
      out = { entries: [{ kind: "record", title: "", item_type: "", date: "", time: "", deadline: "",
        importance: "normal", effort: "quick", tags: [], when_text: "", goal_link: "",
        open_loop: false, promised_to: "", who: "S01", note_type: "", summary: "Quiet in group work",
        // A TOPIC THIS TEACHER HAS NOT GOT, and something with nowhere to go.
        topic: "attendance", level: "", follow_up: false, follow_up_date: "", standard: "",
        person: "", direction: "", note: "",
        extras: [{ name: "seat", value: "back row" }] }] };
    else if (/router inside a calm personal organiser/.test(sys))
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
      // A DATE ON THE PAGE dates everything under it — which is what an
      // induction schedule looks like, and what the shape could not carry.
      const dated = (/\b(\d{4}-\d{2}-\d{2})\b/.exec(user) || [])[1] || "";
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
        // A ROOM AND A NOTE WHEN THE ROW HAS THEM — which the model could not
        // hand back at all until the shape it answers in was widened.
        const room = (/\bRoom (\S+)/.exec(l) || [])[1] || "";
        blocks.push({ label: l.replace(/\s*Room \S+/, ""), start: span[1], end: span[2],
          days: dated ? [] : day ? [day] : [], date: dated,
          where: room ? `Room ${room}` : "", note: room ? "from the model" : "" });
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

// AND THE MODEL MAY SAY WHAT THE PLAIN READER HAS ALWAYS BEEN ABLE TO.
//
// It could hand back four things — a name, two times and the weekdays — and
// everything else was dropped on the way through. So a model that read
// "Science & Social Studies, Room 111" off the page had no way to say the room,
// and the lesson arrived as something you could do from a chair at home. Not a
// rule about trusting it: a shape nobody had widened.
const WITHROOM = ["Period", "Time", "Monday", "Tuesday",
  "08:40-09:25", "Science Room 111", "English"].join("\n");
const roomy = await askTt({ text: WITHROOM, flattened: true });
const first = (roomy.blocks || [])[0];
ok("the model can say where a lesson is", first && first.where === "Room 111",
   JSON.stringify(roomy.blocks || []).slice(0, 240));
ok("and what was written beside it", first && /from the model/.test(first.note || ""),
   JSON.stringify(first));
ok("without that having to be typed in afterwards", first && first.label === "Science",
   first && first.label);

// A RECORD KEEPS WHAT DIDN'T FIT YOUR OWN LISTS.
//
// The kind of note, the topic and the level are your words, in your settings,
// so anything else the reader says for them cannot be stored as one — and was
// being quietly replaced with the first on the list or with blank. A note the
// model read as being about attendance, on a teacher whose topics do not
// include it, became a note about nothing, and there was no way to find out it
// had ever said so.
{
  const rr = await (await fetch(B + "/api/route", { method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ text: "RECORDPLEASE", today: "2026-08-12",
      config: { whoIds: ["S01"], types: ["note", "praise"], topics: ["behaviour"], levels: [] } }) })).json();
  const rec = (rr.entries || [])[0];
  ok("the record comes back", rec && rec.kind === "record", JSON.stringify(rr).slice(0, 200));
  ok("a topic that isn't one of yours is not stored as one", rec && rec.record.topic === "",
     rec && rec.record.topic);
  ok("but it is kept, under the name it was given",
     rec && (rec.record.extras || []).some((x) => x.name === "topic" && x.value === "attendance"),
     JSON.stringify(rec && rec.record.extras));
  ok("along with what it saw that has nowhere to go",
     rec && (rec.record.extras || []).some((x) => x.name === "seat" && x.value === "back row"),
     JSON.stringify(rec && rec.record.extras));
  // AND A TOPIC THAT IS ONE OF YOURS IS STILL JUST THE TOPIC.
  const mine = await (await fetch(B + "/api/route", { method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ text: "RECORDPLEASE", today: "2026-08-12",
      config: { whoIds: ["S01"], types: ["note"], topics: ["attendance"], levels: [] } }) })).json();
  const m = (mine.entries || [])[0];
  ok("a topic you do have is the topic", m && m.record.topic === "attendance", m && m.record.topic);
  ok("and is not also sitting in the bag",
     m && !(m.record.extras || []).some((x) => x.name === "topic"),
     JSON.stringify(m && m.record.extras));
}

// AND THE SHAPE IT MAY ANSWER IN COVERS WHAT IS READ OFF THE ANSWER.
//
// The schema is what the model is TOLD it may return, and the validation below
// it is what gets read. A field the server reads and the schema does not list
// is one the model has no way to know it is allowed to send — which is how the
// room went missing for as long as it did, and it cannot be seen by asking a
// stand-in model, because a stand-in answers whatever it likes.
//
// BOTH SCHEMAS, because the second one is where a record lives and it had the
// same hole: adding a field to what the server reads without adding it to what
// the model is told it may send leaves the model unable to guess it is allowed.
for (const [name, schemaRe, handlerRe, readRe] of [
  ["timetable", /const TIMETABLE_SCHEMA = \{[\s\S]*?\n\};/,
   /async function handleTimetable[\s\S]*?\n\}/, /\bb\.(\w+)/g],
  // THE WHOLE HANDLER, to its closing brace at the left margin. Reaching for
  // the first "\n}" instead stopped at the first nested block and read a region
  // with no fields in it at all — so the check passed by looking at nothing,
  // which is the one way a check can be worse than absent.
  ["route", /const ROUTE_SCHEMA = \{[\s\S]*?\n\};/,
   /async function handleRoute\([\s\S]*?\n\}\n/, /\be\.(\w+)/g],
]) {
  const src = fs.readFileSync(`${REPO_ROOT}/server.js`, "utf8");
  const schema = (src.match(schemaRe) || [""])[0];
  const handler = (src.match(handlerRe) || [""])[0];
  const read = [...handler.matchAll(readRe)].map((m) => m[1]);
  ok(`the ${name} handler is actually being looked at`, read.length > 3,
     `only ${read.length} fields found — the region is wrong, so this check is reading nothing`);
  // A FIELD MAY BE LISTED INLINE OR BY NAME. The shape for "anything this app
  // has no field for" is written once and referred to from three schemas, so a
  // check that only recognised `name: { type:` called it missing the moment it
  // stopped being spelled out — which is a check failing on a tidy-up while
  // what it is about was fine.
  const listed = (k) => new RegExp(`\\b${k}:\\s*(\\{\\s*type:|[A-Z][A-Z_]*_SCHEMA\\b)`).test(schema);
  const missing = [...new Set(read)].filter((k) => !listed(k));
  ok(`everything the ${name} answer is read for is a field the model may send`,
     missing.length === 0, `not in the schema: ${missing.join(", ")}`);
}

// A DATE INSTEAD OF DAYS is a one-off, and refusing everything without a
// weekday threw a whole induction away as unreadable.
const oneOff = await askTt({ text: "2026-08-24\n09:00-10:00\nAssembly", flattened: false });
const one = (oneOff.blocks || [])[0];
ok("a dated one-off is kept, with no weekday at all",
   one && one.date === "2026-08-24" && one.days.length === 0, JSON.stringify(oneOff.blocks));
ok("it is handed back as one it couldn't read",
   (noDays.unreadable || []).some((u) => /no day or date/.test(u.why || "")),
   JSON.stringify(noDays.unreadable));

srv.kill(); ol.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
