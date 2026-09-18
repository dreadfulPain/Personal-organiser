import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// End-to-end over real HTTP: the paths this turn touched, plus the ones it
// could plausibly have broken.
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import "./_where.mjs";   // a test never opens your data — see tests/_where.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + String(e).slice(0,300) : ""}`); } };

const oport = 11700, sport = 3700;
// WHICH MODEL EACH REQUEST ACTUALLY ASKED FOR — the point of the whole thing
// below: a name out of a settings file is not evidence that this computer has
// it, and two computers is all it takes for it to be wrong on one of them.
const modelsAsked = [];
const chats = [];
// How the stand-in is told which way to misbehave for the call about to be
// made — see askCal. Not in the prompt, so that what is being tested and the
// instructions for testing it cannot be mistaken for each other.
let standIn = "";
// A STAND-IN THAT NEVER ANSWERS, and whether the server gave up on it. This is
// how "giving up actually gives up" is observed from outside: the request the
// server made is aborted at the far end.
let hangs = false;
let droppedByServer = false;
// What this stand-in Ollama says it has pulled, which is deliberately NOT the
// model the server is configured with.
const PULLED = ["llama3.2:3b"];
const ol = http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) { res.writeHead(200, {"Content-Type":"application/json"}); return res.end(JSON.stringify({ models: PULLED.map((name) => ({ name })) })); }
  if (hangs) {
    req.on("aborted", () => { droppedByServer = true; });
    req.on("close", () => { if (!res.writableEnded) droppedByServer = true; });
    return; // never answers
  }
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const askedFor = JSON.parse(b || "{}").model || "";
    if (askedFor) modelsAsked.push(askedFor);
    const sys = (JSON.parse(b || "{}").messages || []).find((m) => m.role === "system")?.content || "";
    // WHAT WAS ACTUALLY ASKED, every time. The retry and the context size are
    // both invisible from the answer, and both are the difference between a
    // model that works on this document and one that does not.
    // AND WHAT IT WAS TOLD ABOUT THE ENTRIES, not only how it was told to read
    // them. An answer is checked against the lines the reader says an entry
    // rests on, so whether those lines were ever SHOWN to it is the difference
    // between a fair check and marking to a rubric nobody handed over.
    const usr = (JSON.parse(b || "{}").messages || []).filter((m) => m.role === "user")
      .map((m) => m.content).join("\n");
    chats.push({ sys, usr, options: JSON.parse(b || "{}").options || {} });
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
    // THE OTHER CALENDAR JOB: saying what a numbered list of entries MEANS,
    // without being able to change the list. The stand-in answers by number and
    // quotes the line it was given, which is what the server checks against the
    // document — and a marker in the text tells it how to misbehave.
    else if (/numbered list of entries already found/i.test(sys)) {
      const user = (JSON.parse(b).messages || []).find((m) => m.role === "user")?.content || "";
      // A CANDIDATE WITH NO DATE ON IT is what a mark on a term grid is, and
      // insisting on one here meant the stand-in simply never saw them.
      const nums = [...user.matchAll(/^(\d+)\. (\d{4}-\d{2}-\d{2})?[^\n]*?— ([^\n\[]*)(?:\[as written: ([^\]]*)\])?/gm)]
        .map((m) => ({ n: Number(m[1]), label: m[3].trim(), line: (m[4] || m[3]).trim() }));
      const how = (/MARKS:(\w+)/.exec(standIn) || [])[1] || "";
      // AND WHETHER THE DOCUMENT SAYS IT. The stand-in points at a word that is
      // really in the line; the markers below make it misbehave in each of the
      // ways a real model does.
      // "noLessons", NOT "off". A document saying "Holidays" says the timetable
      // does not run; it does not say you are away, and only you can say that.
      // So the word the stand-in points at has to be one that supports the
      // answer it gives, or every check below is testing the gate rejecting a
      // pairing rather than the thing it is about. See SAYS_SO.
      const one = (c) => ({ n: c.n, means: "noLessons", runsAsDay: 0, sure: 0.9,
        why: "it looks like a holiday", mine: "yes", said: c.line,
        // POINTING AT THE HEADING THE LIST IS UNDER, which is both a real
        // phrase in what the entry rests on and a phrase that says the thing.
        stated: true, says: "Holidays",
        // NOTHING OWED BY DEFAULT. "due" is the one answer that puts somebody
        // under a deadline, so it has to be shown, and a model that says
        // nothing about it has said nothing. See owed.
        mustBy: "" });
      // AND THE WORDS A READER CLAIMS PUT SOMEBODY UNDER ONE, where the test
      // is about those. Written into the document it is answering about, so a
      // phrase that is really there and a phrase that is not can both be tried.
      // Stops at a quote as well as a line end: on the annotate path the marker
      // travels inside the entry's own ground, which is printed quoted.
      const by = ((/MUSTBY:([^\n]*)/.exec(standIn) || [])[1] || "").trim();
      let answers = nums.map(one);
      // HALF AN ANSWER, which is what a model that runs out of room gives.
      if (how === "half") answers = answers.slice(0, Math.ceil(answers.length / 2));
      // AN ANSWER TO A NUMBER NOBODY ASKED ABOUT.
      if (how === "extra") answers = answers.concat([{ ...one({ n: 999, line: "nowhere" }) }]);
      // AND THE SAME NUMBER TWICE, with a different answer the second time.
      if (how === "dup" && answers.length)
        answers = answers.concat([{ ...answers[0], means: "lessons", why: "changed my mind" }]);
      // A QUOTE THE DOCUMENT DOES NOT HAVE: the evidence gate must still bite.
      if (how === "nowhere") answers = answers.map((a) => ({ ...a, said: "a line from nowhere" }));
      // AND ONE THAT IS REALLY IN THE DOCUMENT AND IS ABOUT SOMETHING ELSE.
      if (how === "borrow")
        answers = answers.map((a) => ({ ...a, said: "• Mid-Autumn Festival: Sep. 25" }));
      // AND A MEANING THAT CONTRADICTS THE SHAPE OF THE ROW.
      if (how === "due") answers = answers.map((a) => ({ ...a, means: "due", mustBy: "due by" }));
      // AND ONE WHOSE "due" POINTS AT WHATEVER THE TEST GAVE IT — including at
      // nothing, which is what a date something merely HAPPENS on deserves.
      if (how === "owed") answers = answers.map((a) => ({ ...a, means: "due", mustBy: by }));
      // AND ONE POINTING AT THE DEADLINE WORDS WHILE BEING HONEST THAT THE REST
      // IS INFERENCE — which is most honest reading, and was being stopped.
      if (how === "guessedowed")
        answers = answers.map((a) => ({ ...a, means: "due", mustBy: by, stated: false, says: "" }));
      // AND AN EVENT ON A WORKING DAY, which proves itself by whose it is.
      if (how === "week") answers = answers.map((a) => ({ ...a, means: "week", stated: false, says: "" }));
      // A READER POINTING AT THE ENTRY'S OWN NAME, confidently, for whatever
      // meaning the test named. Which is what a model does when the name is all
      // it has been given.
      if (how === "name") {
        const m = (/MEANS:(\w+)/.exec(standIn) || [])[1] || "off";
        answers = answers.map((a) => ({ ...a, means: m, stated: true,
          says: (nums.find((c) => c.n === a.n) || {}).label || a.says }));
      }
      // AND A READER QUOTING WHATEVER THE TEST GAVE IT, so a quote off the
      // entry's own heading and a quote off another part of the page can both
      // be tried against the same entry.
      if (how === "says") {
        const q = ((/SAYS:([^\n]*)/.exec(standIn) || [])[1] || "").trim();
        const m = (/MEANS:(\w+)/.exec(standIn) || [])[1] || "week";
        answers = answers.map((a) => ({ ...a, means: m, said: q, says: q, stated: true }));
      }
      // POINTING AT THE HEADING THE LIST IS UNDER, which is not on the entry's
      // own line at all.
      if (how === "heading")
        answers = answers.map((a) => ({ ...a, stated: true, says: "Holidays (subject to change)" }));
      // A READER BEING HONEST THAT IT WORKED THE ANSWER OUT.
      if (how === "guessed") answers = answers.map((a) => ({ ...a, stated: false, says: "" }));
      // AND ONE CLAIMING THE DOCUMENT SAYS SO AND POINTING AT WORDS THAT AREN'T
      // IN IT — the way past a rule that only asked the model to be honest.
      if (how === "invented")
        answers = answers.map((a) => ({ ...a, stated: true, says: "which are days when lessons do not run" }));
      out = { answers };
    }
    // THE CALENDAR JOB. There is no real model here and there cannot be, so
    // this stands in for one by SAYING WHATEVER THE TEST TELLS IT TO: each line
    // of the document is one entry, tab-separated. That puts the right thing
    // under test — not whether a model can read a calendar, which cannot be
    // measured from here, but whether the server does something sensible with
    // whatever comes back, including the answers a model gets wrong.
    else if (/turn it into a plain list of dated entries/i.test(sys)) {
      const user = (JSON.parse(b).messages || []).find((m) => m.role === "user")?.content || "";
      // NOT TRIMMED, on purpose: a leading tab is an entry whose name the model
      // left empty, and that is one of the answers the server has to cope with.
      const entries = user.split("\n").map((l) => l.replace(/\r/g, ""))
        .filter((l) => l.trim() && !/^"{3}$/.test(l.trim()) &&
          !/^(The rest of this|Turn this calendar)/.test(l.trim()))
        .map((l) => {
          const [label, date, endsOn, start, end, days, saidAs, quote] = l.split("\t");
          return {
            label: label || "", date: date || "", endsOn: endsOn || "",
            start: start || "", end: end || "",
            days: (days || "").split(",").filter(Boolean).map(Number),
            // AND SOMETHING IT WAS NEVER ASKED FOR. A model told to say what a
            // date means will say it; the server must not carry it through.
            kind: "off",
            // THE LINE AS A DOCUMENT WRITES IT — "National Day: Oct. 1 - Oct.
            // 7" — which is what a model hands back when it is asked for
            // "anything else the line says": the name, then a colon, then the
            // rest. The server takes the name off the front again; see
            // notTheLabel.
            // A seventh cell is the extra said verbatim, for the shapes that a
            // join cannot produce — a name that runs on into a sentence rather
            // than being followed by a colon.
            extras: [{ name: "as written", value: saidAs ||
              `${label}: ${[date, endsOn, start, end].filter(Boolean).join(" ")}`.trim() }],
            // AND WHAT IT THINKS IT MEANS. The line it says it came from is the
            // document's own line; the server checks the date against it.
            //
            // A seventh cell stands in for that line, so a test can give a
            // document line that does NOT contain the date the model landed on
            // — which is the invented-date case, and the whole point of the
            // check. An eighth cell saying NOWHERE makes it quote something the
            // stand-in owns and the document therefore cannot contain.
            said: quote === "NOWHERE"
              ? "a line the stand-in made up, which is in no document"
              : (saidAs || l.replace(/\t/g, " ").trim()),
            // NO MEANING PROPOSED. These fixtures are about WHERE a quote came
            // from — an invented date, a borrowed line — and a bare tab-separated
            // cell says nothing about anybody's working week, so claiming one
            // would be the stand-in behaving worse than the models it stands in
            // for. Every meaning still has its own checks, tested where they are.
            means: "", runsAsDay: 0, sure: 0.9, why: "it looks like a holiday", mine: "yes",
            // AND WHERE THE DOCUMENT SAYS SO — pointing at words really in the
            // line, which is what the gate checks. See entails.
            stated: true, says: saidAs || l.replace(/\t/g, " ").trim(),
          };
        });
      out = { entries };
    }
    // AND A MODEL THAT ANSWERS WITH SOMETHING THAT IS NOT A CALENDAR. Local
    // models do this — they apologise, or think out loud, or hand back prose —
    // and every one of those came out of the app as "Couldn't read that just
    // now", which is the one thing it is not useful to be told.
    if (/BROKENJSON/.test(b)) {
      res.writeHead(200, {"Content-Type":"application/json"});
      return res.end(JSON.stringify({ message: { content: "I'm sorry, I can't help with that." } }));
    }
    // THE WRAPPING A LOCAL MODEL PUTS ROUND ITS ANSWER. Asked for JSON and given
    // a schema, a small model on somebody's laptop answers with JSON most of the
    // time and with one of these the rest of the time. Each was a whole reading
    // thrown away over its packaging, and twenty-five rows to classify by hand.
    const wrap = (/WRAPPED:(\w+)/.exec(b) || [])[1] || "";
    let content = JSON.stringify(out);
    if (wrap === "fenced") content = "Here is the JSON:\n```json\n" + content + "\n```\nHope that helps!";
    else if (wrap === "array") content = JSON.stringify(out.entries || []);
    else if (wrap === "othername") content = JSON.stringify({ calendar: out.entries || [] });
    else if (wrap === "comma") content = content.replace(/\}\]\}$/, "},]}");
    else if (wrap === "think") content = "<think>let me look at the holidays…</think>\n" + content;
    else if (wrap === "openfence") content = "```json\n" + content;
    // Stopped mid-entry, which is what a reply that runs out of room looks like.
    else if (wrap === "cutoff") content = content.replace(/\}\]\}$/, "},{\"label\":\"Sum");
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ message: { content } }));
  });
}).listen(oport);

// THE PORT MUST BE OURS.
//
// These are fixed numbers, and a server left running from an earlier go holds
// them — so the one spawned here fails to bind, the OLD one answers every
// request, and the suite reports confidently on a server it did not start and
// whose code it has never seen. That is not a flake that makes a check fail:
// it makes a check PASS while looking at the wrong thing, which is worse. It
// hid a real fault for three runs.
//
// So it is checked, and being unable to check it is itself the failure.
async function mustBeFree(port, what) {
  const free = await new Promise((done) => {
    const probe = http.createServer();
    probe.once("error", () => done(false));
    probe.listen(port, () => probe.close(() => done(true)));
  });
  if (!free) {
    console.log(`FAIL  port ${port} (${what}) is already in use — something is still running from an earlier go.`);
    console.log("      Nothing below would be about this copy of the code. Stopping.");
    process.exit(1);
  }
}
await mustBeFree(sport, "the app");

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

// ---------------------------------------------------------------------------
// THE MODEL ON THIS COMPUTER, NOT THE ONE IN THE FILE.
//
// The server is started with AI_MODEL=qwen3:14b and this Ollama has only
// llama3.2:3b. Same folder, two machines: the setting names a model one of them
// hasn't got, and every request used to ask for it anyway and fail.
{
  modelsAsked.length = 0;
  const r = await (await fetch(B + "/api/route", { method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ text: "call the dentist", today: "2026-08-12", config: {} }) })).json();
  ok("it still sorts on a computer without the configured model",
     Array.isArray(r.entries), JSON.stringify(r).slice(0, 160));
  ok("and asked for the model this computer actually has",
     modelsAsked.length > 0 && modelsAsked.every((m) => m === "llama3.2:3b"),
     JSON.stringify(modelsAsked));
  ok("rather than the one in the settings file",
     !modelsAsked.includes("qwen3:14b"), JSON.stringify(modelsAsked));
}

// AND WHICH ONE IT PICKS, ON FOUR DIFFERENT COMPUTERS.
//
// A fresh stub and a fresh app each time: the answer is cached against where it
// asked, so the only honest way to ask again is to ask somewhere else — which
// is also what actually happens, since the two machines are two machines.
let nextPair = 11730;
async function picksOn(pulled, wanted) {
  const op = nextPair++, ap = nextPair++;
  await mustBeFree(op, "a stand-in ollama");
  await mustBeFree(ap, "a second app");
  const got = [];
  const o = http.createServer((rq, rs) => {
    if (/\/api\/tags/.test(rq.url)) { rs.writeHead(200, {"Content-Type":"application/json"});
      return rs.end(JSON.stringify({ models: pulled.map((name) => ({ name })) })); }
    let bb = ""; rq.on("data", (c) => (bb += c));
    rq.on("end", () => {
      const m = JSON.parse(bb || "{}").model || "";
      if (m) got.push(m);
      rs.writeHead(200, {"Content-Type":"application/json"});
      rs.end(JSON.stringify({ message: { content: JSON.stringify({ entries: [] }) } }));
    });
  }).listen(op);
  const app = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, stdio: "ignore",
    env: { ...process.env, AI_ENGINE: "ollama", AI_MODEL: wanted,
           AI_BASE_URL: `http://localhost:${op}`, NO_OPEN: "1", PORT: String(ap) } });
  await sleep(2200);
  await fetch(`http://localhost:${ap}/api/route`, { method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ text: "call the dentist", today: "2026-08-12", config: {} }) })
    .then((x) => x.text()).catch(() => "");
  await sleep(200);
  app.kill(); o.close();
  await sleep(200);
  return got[0] || "(never asked)";
}

// YOUR OWN SETTING STILL WINS when this computer has the model you named — the
// whole point is to stop a machine failing over a name it hasn't got, not to
// start overruling a choice that works.
ok("the model you asked for is used when it is here",
   (await picksOn(["llama3.2:3b", "qwen3:14b"], "qwen3:14b")) === "qwen3:14b",
   "it overrode a setting that was perfectly good");
// AND A TEXT MODEL BEFORE ONE THAT SEES, on a machine with both.
ok("a text model is preferred to one that sees",
   (await picksOn(["llava:7b", "llama3.2:3b"], "qwen3:14b")) === "llama3.2:3b",
   "it picked the vision model to sort with");
// AND AN EMBEDDING MODEL IS NOT A SORTER — it cannot hold a conversation at
// all, and picked as one it fails every request with an error about something
// else entirely. Better to ask for the model that isn't there and say so.
ok("an embedding model is never picked to sort with",
   (await picksOn(["nomic-embed-text"], "qwen3:14b")) === "qwen3:14b",
   "it tried to sort with an embedding model");

const h = await (await fetch(B + "/api/health")).json();
ok("health says the engine is live", h.hasAI === true, JSON.stringify(h));
ok("and names the one it is actually using", /llama3\.2:3b/.test(h.engineNote || ""), h.engineNote);

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
// WHAT THE MODEL IS TOLD ABOUT ITS OWN CONFIDENCE.
//
// There is one question about a school calendar this app cannot settle for
// itself and must not pretend to: whether a day with a name on it is a day
// without lessons. "Professional Development (PD) Days for Teachers: Oct. 16,
// Nov. 13" says who the day is for. It does not say that classes are off —
// and a model that reads it as "no lessons" is inferring, confidently.
//
// The app cannot tell that reading from a correct one without acquiring a
// vocabulary, which it will not do (§0.2). What it can do is ask the model to
// be honest about it, and then gate on the honesty — a low "sure" is already
// enough to send a row to be asked about. So the instruction is load-bearing:
// remove it and the only thing standing between a guess and your calendar is
// the model's mood. This is here so it cannot go quietly.
{
  const src = fs.readFileSync(`${REPO_ROOT}/server.js`, "utf8");
  const prompts = [...src.matchAll(/const CALENDAR(?:_MARK)?_PROMPT = `([\s\S]*?)`;/g)].map((m) => m[1]);
  ok("both calendar prompts are being looked at", prompts.length === 2, String(prompts.length));
  ok("each says what a meaning is a claim about",
     prompts.every((p) => /what happens to their lessons/i.test(p)),
     JSON.stringify(prompts.map((p) => /what happens to their lessons/i.test(p))));
  ok("and each says to be honest when that is being inferred",
     prompts.every((p) => /naming who a day is for is not a line saying whether classes run/i.test(p)),
     JSON.stringify(prompts.map((p) => p.slice(-200))));
}

for (const [name, schemaRe, handlerRe, readRe] of [
  ["timetable", /const TIMETABLE_SCHEMA = \{[\s\S]*?\n\};/,
   /async function handleTimetable[\s\S]*?\n\}/, /\bb\.(\w+)/g],
  ["calendar", /const CALENDAR_SCHEMA = \{[\s\S]*?\n\};/,
   /async function handleCalendar\([\s\S]*?\n\}\n/, /\be\.(\w+)/g],
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

// ---------------------------------------------------------------------------
// THE CALENDAR, READ BY THE MODEL.
//
// The endpoint that did not exist: a school calendar arrives as prose, in a
// language whose month names this app has never heard of, or laid out in a way
// no pattern-match will follow — and until now there was nowhere for a reader
// to help. What comes back is STRUCTURE ONLY, and the checks below are about
// the line the whole design turns on: it may say when something is, never what
// it means.
// HOW THE STAND-IN IS TOLD WHICH WAY TO MISBEHAVE.
//
// The markers ride in the document, because the document used to be sent to the
// model with every batch. It is not any more — each entry now carries what it
// rests on, which is the only place its quote may come from, so five copies of
// the same calendar were five copies of something the gates would refuse to use.
//
// So on the annotate path the markers are put where the prompt still goes: onto
// the entries themselves. The document keeps them too, because the free-form
// path still reads it whole, and because that is where the checks look for a
// quote. Nothing about what is being tested changes — only the envelope.
const askCal = async (body) => {
  // OUT OF BAND, NOT IN THE PROMPT. The markers used to ride in the document,
  // because the document was sent to the model with every batch. It is not any
  // more — each entry carries what it rests on, which is the only place its
  // quote may come from, so five copies of one calendar were five copies of
  // something the gates would refuse to use.
  //
  // Putting them on the entries instead put them INSIDE the ground the checks
  // are made against, so a test for "words invented to prove a deadline" handed
  // the invented words to the thing meant to catch them. These two ends are the
  // same process; the stand-in is told directly, and nothing about the request
  // changes at all.
  standIn = String(body.text || "").split("\n")
    .filter((l) => /^(MARKS|MUSTBY|SAYS|MEANS):/.test(l)).join("\n");
  return (await (await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) })).json());
};

{
  const cal = await askCal({ year: 2026, text: [
    "Mid-Autumn Festival\t2026-09-25\t2026-09-27",
    "Staff meeting\t\t\t16:00\t17:00\t5",
    "Parents' evening\t2026-10-14\t\t18:30\t20:00",
  ].join("\n") });
  const by = (n) => (cal.rows || []).find((r) => r.label === n);
  ok("the calendar endpoint answers with rows", (cal.rows || []).length === 3,
     JSON.stringify(cal).slice(0, 300));
  ok("a holiday keeps both of its ends",
     by("Mid-Autumn Festival") && by("Mid-Autumn Festival").endsOn === "2026-09-27",
     JSON.stringify(by("Mid-Autumn Festival")));
  ok("and says where that end came from",
     by("Mid-Autumn Festival") && by("Mid-Autumn Festival").endFrom === "model",
     JSON.stringify(by("Mid-Autumn Festival")));
  // A REPEAT IS NOT A DATE. "Staff meeting every Friday" has no day to be on;
  // giving it one would put a standing commitment on a single Friday for ever.
  ok("something weekly comes back as a rule, not a day",
     by("Staff meeting") && !by("Staff meeting").date &&
     JSON.stringify(by("Staff meeting").days) === "[5]",
     JSON.stringify(by("Staff meeting")));
  ok("with the time it happens at",
     by("Staff meeting") && by("Staff meeting").start === "16:00" &&
     by("Staff meeting").end === "17:00", JSON.stringify(by("Staff meeting")));
  ok("and a dated evening keeps its clock times",
     by("Parents' evening") && by("Parents' evening").start === "18:30",
     JSON.stringify(by("Parents' evening")));
  // THE WHOLE POINT. "Winter break begins", "Staff return" and "INSET day" are
  // three different instructions to this app, and a model would tell them apart
  // confidently and be wrong about a fortnight. The stand-in above says "off"
  // on every single row; not one of them may arrive decided.
  ok("nothing comes back already decided",
     (cal.rows || []).every((r) => r.kind === ""),
     JSON.stringify((cal.rows || []).map((r) => `${r.label}:${r.kind}`)));
  // AND WHAT IT SAW THAT NOTHING HERE HAS A FIELD FOR is kept rather than
  // narrowed away — same shape as the timetable and the records.
  ok("and what it read beside a line is not thrown away",
     (by("Parents' evening").extras || []).some((x) => x.name === "as written"),
     JSON.stringify(by("Parents' evening").extras));
}

{
  // A ROW THAT VANISHED IS INVISIBLE; A ROW MARKED "couldn't read this" CAN BE
  // TYPED IN. You can check a list for what is wrong on it and never for what
  // is not on it at all.
  const bad = await askCal({ year: 2026, text: [
    // NOT FIRST. The whole document is trimmed before it is sent, so a line
    // beginning with a tab loses it if it is the first one — which is right for
    // a document and wrong for what this line is here to be.
    "Something\t\t\t\t\t",
    "\t2026-09-25",
    "Backwards\t2026-10-10\t2026-10-01",
    "Wrong way round\t2026-11-02\t\t16:00\t09:00",
    "Fine\t2026-12-01",
  ].join("\n") });
  ok("only the readable one is kept", (bad.rows || []).length === 1,
     JSON.stringify(bad.rows));
  const why = (bad.unreadable || []).map((u) => u.why);
  ok("a line with no name is handed back", why.includes("no name"), JSON.stringify(why));
  ok("so is one with nothing to happen on", why.includes("no date and no day"), JSON.stringify(why));
  ok("so is a holiday that ends before it starts", why.includes("ends before it starts"),
     JSON.stringify(why));
  ok("and an evening whose times run backwards", why.includes("the times run backwards"),
     JSON.stringify(why));
  ok("four dropped rows, four things to look at", (bad.unreadable || []).length === 4,
     JSON.stringify(bad.unreadable));
  // AND ONE WITH NO NAME IS FINDABLE BY ITS DATE. A calendar row has a day, not
  // a start time — the page needs something to call it, and "(no name)" beside
  // the reason "no name" is a thing to read twice and act on never.
  const anon = (bad.unreadable || []).find((u) => u.why === "no name");
  ok("a nameless line comes back with the day it was on", anon && anon.at === "2026-09-25",
     JSON.stringify(anon));
}

{
  // WHAT THE APP CAN CHECK FOR ITSELF, WHICH IS NOT WHAT THE MODEL SAYS IT IS
  // SURE OF.
  //
  // The real calendar has "Professional Development (PD) Days for Teachers:
  // Oct. 16, Nov. 13" on it, and a model turned that into ONE entry dated the
  // 13th of October — a day in neither half of it — and would have said 0.9
  // about it. Asked how confident it is, a model is as fluent about an invented
  // date as a copied one. Whether the day is actually written on the line it
  // claims to come from is a fact, and it is cheap.
  const seen = await askCal({ year: 2026, text: [
    // The stand-in echoes the line it was given as "said", so a date in the
    // first cell that is not in the line is exactly the invented case.
    ["Mid-Autumn Festival", "2026-09-25"].join("\t"),
    ["PD Days", "2026-10-13", "", "", "", "", "PD Days for Teachers: Oct. 16, Nov. 13"].join("\t"),
  ].join("\n") });
  const by = (n) => (seen.rows || []).find((r) => r.label === n);
  ok("a date written on its own line goes through unquestioned",
     by("Mid-Autumn Festival") && by("Mid-Autumn Festival").checked === "",
     JSON.stringify(by("Mid-Autumn Festival")));
  ok("and one the document does not contain is sent back as a question",
     by("PD Days") && /isn't written near that line/.test(by("PD Days").checked || ""),
     JSON.stringify(by("PD Days")));
  // THE 16th AND THE 13th OF NOVEMBER, AND NEVER THE 13th OF OCTOBER. The exact
  // reading that started all of this, kept as a check so it cannot come back:
  // the day the entry landed on must be one of the two days written beside it.
  ok("the invented day is the one that is refused, by name",
     by("PD Days") && by("PD Days").date === "2026-10-13" && by("PD Days").checked,
     JSON.stringify(by("PD Days")));
  ok("with what it thought, so the page can say what it is asking about",
     by("PD Days") && by("PD Days").why,
     JSON.stringify(by("PD Days")));
  // AND A LINE THAT IS NOT IN THE DOCUMENT AT ALL. A reader that quotes
  // something the text does not say has not read the text.
  const made = await askCal({ year: 2026, text: [
    ["Invented", "2026-09-25", "", "", "", "", "", "NOWHERE"].join("\t"),
  ].join("\n") });
  ok("a line the document doesn't have is a question too",
     (made.rows || [])[0] && /not in the document/.test(made.rows[0].checked || ""),
     JSON.stringify(made.rows));
}

{
  // A PDF HAS NO LINES, so "is the date on that line" was the right question
  // asked a shade too literally.
  //
  // Text comes out of a PDF as runs placed by position, and whatever puts them
  // back into a string is guessing. One visual row of a table arrives as
  //
  //     Professional Development Days for Teachers
  //     Oct. 16, Nov. 13
  //
  // and a reader that quotes the name and dates it correctly from the fragment
  // underneath was being sent back as a question every single time — the check
  // punishing the extractor's line breaks rather than the reader's invention.
  //
  // So the evidence is a bounded SPAN: the quote, plus one neighbour that could
  // not be an entry of its own — dates and no name. See evidence().
  const split = (date) => askCal({ year: 2026, text: [
    ["PD Days", date, "", "", "", "", "Professional Development Days for Teachers"].join("\t"),
    "Oct. 16, Nov. 13",
  ].join("\n") });
  const right = (await split("2026-10-16")).rows.find((r) => r.label === "PD Days");
  ok("a date the extractor put on the next run still counts as written",
     right && right.checked === "", JSON.stringify(right));
  // AND THE SPAN IS WHAT IT SAYS IT IS, so the page can show the grounds rather
  // than assert them.
  ok("and the row carries the document's own words that say so",
     right && /Professional Development Days for Teachers Oct\. 16, Nov\. 13/.test(right.source || ""),
     JSON.stringify(right && right.source));
  const wrong = (await split("2026-10-13")).rows.find((r) => r.label === "PD Days");
  ok("while the invented day is still refused across the break",
     wrong && /isn't written near that line/.test(wrong.checked || ""), JSON.stringify(wrong));
  // AND THE LINE NEXT DOOR IS NOT BORROWED FROM WHEN IT IS SOMEBODY ELSE'S.
  //
  // This is the whole safety of the widening: a fragment with a name of its own
  // is an entry, and an entry's dates belong to it. Without this the 13th of
  // October would be "written nearby" on any calendar that happens to have
  // something else on the 13th — which is most of them.
  const near = await askCal({ year: 2026, text: [
    ["PD Days", "2026-10-13", "", "", "", "", "Professional Development Days for Teachers"].join("\t"),
    "Art Festival Oct. 13",
  ].join("\n") });
  const borrowed = (near.rows || []).find((r) => r.label === "PD Days");
  ok("a date on a line that has its own name is not borrowed",
     borrowed && /isn't written near that line/.test(borrowed.checked || ""),
     JSON.stringify(borrowed));

  // AND A WEEK NUMBER IS NOT A DAY OF THE MONTH.
  //
  // "Art Festival: Week 16 - Week 17" came back as the 16th and 17th of
  // December — a fortnight out, and reading exactly like an answer. The prompt
  // says not to; the check is what makes it not matter whether it listened,
  // because 16 next to the word Week is not December written down.
  const weeks = await askCal({ year: 2026, text: [
    ["Art Festival", "2026-12-16", "2026-12-17", "", "", "",
     "Art Festival: Week 16 - Week 17"].join("\t"),
  ].join("\n") });
  const art = (weeks.rows || [])[0];
  ok("a week number read as a day of the month is sent back to be asked about",
     art && /isn't written near that line/.test(art.checked || ""), JSON.stringify(art));
}

{
  // WHAT IT SAID BESIDE THE LINE, WITHOUT THE LINE AGAIN.
  //
  // Asked for "anything else the line says", a model hands back the whole line
  // — so a row called "National Day" sat above the words "National Day: Oct. 1
  // - Oct. 7", on every row of a twenty-row calendar. The stand-in above echoes
  // the row's first cell into an extra, which is exactly what one really did.
  const said = await askCal({ year: 2026, text: [
    "National Day\t2026-10-01\t2026-10-07",
    ["Exam time", "2026-11-10", "", "", "", "",
     "Exam time and expected report distribution date"].join("\t"),
  ].join("\n") });
  const nat = (said.rows || []).find((r) => r.label === "National Day");
  ok("what it saw beside a line is kept", (nat.extras || []).length === 1,
     JSON.stringify(nat.extras));
  ok("with the row's own name taken off the front of it",
     nat.extras[0].value === "2026-10-01 2026-10-07",
     JSON.stringify(nat.extras));
  // AND ONLY WHERE THE NAME IS FOLLOWED BY A SEPARATOR. "Exam time and expected
  // report distribution date" begins with the name of the entry and then goes
  // on being a sentence; taking the name off the front of that leaves "and
  // expected report distribution date", which is worse than the repetition.
  const exam = (said.rows || []).find((r) => r.label === "Exam time");
  ok("a name that runs on into a sentence is left whole",
     exam && (exam.extras || [])[0] &&
     /^Exam time and expected/.test(exam.extras[0].value),
     JSON.stringify(exam && exam.extras));
}

{
  // A DOCUMENT TOO LONG TO SEND IN ONE GO SAYS SO.
  //
  // A whole-year calendar goes over the limit, and going over it meant the rest
  // was simply not read — silently. Nothing anywhere said the summer had been
  // cut off, so a document that came back missing a third of itself looked
  // exactly like one the model had read and found nothing more in.
  const long = "Padding line with no date on it at all.\n".repeat(400) +
    "Sports Day\t2026-06-12";
  const big = await askCal({ year: 2026, text: long });
  ok("a document longer than the limit is still read", "rows" in big, JSON.stringify(big).slice(0, 160));
  ok("and says how much of it went", big.cut === 12000, JSON.stringify(big.cut));
  const small = await askCal({ year: 2026, text: "Sports Day\t2026-06-12" });
  ok("while a short one says nothing about being cut", !("cut" in small),
     JSON.stringify(small).slice(0, 160));
}

{
  // AND WHEN IT GOES WRONG, WHAT WENT WRONG.
  //
  // "Couldn't read that just now — you can still type the dates in by hand" was
  // the answer to every failure there is: a model that isn't running, one that
  // timed out, one that apologised in prose instead of answering. The person is
  // then in front of the twenty-five manual decisions this whole panel exists to
  // save them from, with nothing to act on. A local model answering with
  // anything but JSON is the commonest of the three and it looked exactly like
  // the other two.
  const broke = await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "BROKENJSON\tterm dates", year: 2026 }) });
  const why = await broke.json();
  ok("a model that answers with prose is a failure, not an empty calendar",
     broke.status === 502, String(broke.status));
  ok("and the message says what actually happened",
     /couldn't read|isn't answering|took longer|error \(/i.test(why.message || "") &&
     !/^Couldn't read that just now/.test(why.message || ""),
     JSON.stringify(why.message));
  ok("while still saying what you can do instead",
     /type the dates in by hand/.test(why.message || ""), JSON.stringify(why.message));
}

{
  // THE READER OWNS THE LIST. THE MODEL ONLY SAYS WHAT EACH ONE MEANS.
  //
  // Asked to turn a calendar into entries, a model hands back its own list — and
  // that list then REPLACED the one this app had already read out of the
  // document. On a real school calendar the reply ran out of room after the
  // first entry, and twenty-two dates a person could see on their screen a
  // moment earlier became one. A model going quiet, going slow or going wrong
  // must not be able to delete what was read before it was asked.
  // A LIST WITH A HEADING OVER IT, because that is what a calendar gives you and
  // because the heading is where "a day off" is actually said. Under the words
  // alone, "Mid-Autumn Festival: Sep. 25" says which day it is and nothing about
  // whether anybody is working — see SAYS_SO.
  const DOC = [
    "Holidays:",
    "• Mid-Autumn Festival: Sep. 25",
    "• National Day: Oct. 1-Oct. 7",
    "• Christmas Holiday: Dec. 22-Dec. 25",
    "• New Year's Day: Jan. 1-Jan. 3, 2027",
  ].join("\n");
  const CANDS = [
    { n: 1, date: "2026-09-25", endsOn: "", label: "Mid-Autumn Festival", line: "• Mid-Autumn Festival: Sep. 25" },
    { n: 2, date: "2026-10-01", endsOn: "2026-10-07", label: "National Day", line: "• National Day: Oct. 1-Oct. 7" },
    { n: 3, date: "2026-12-22", endsOn: "2026-12-25", label: "Christmas Holiday", line: "• Christmas Holiday: Dec. 22-Dec. 25" },
    { n: 4, date: "2027-01-01", endsOn: "2027-01-03", label: "New Year's Day", line: "• New Year's Day: Jan. 1-Jan. 3, 2027" },
  ];
  const mark = (how, cands) => askCal({ year: 2026, candidates: cands || CANDS,
    text: how ? `MARKS:${how}\n${DOC}` : DOC });

  const all = await mark("");
  ok("a numbered list comes back answered by number",
     (all.answers || []).map((a) => a.n).join(",") === "1,2,3,4", JSON.stringify(all.answers));
  ok("with no entries in the answer at all — it cannot add or remove one",
     !("rows" in all) && !("entries" in all), JSON.stringify(Object.keys(all)));
  ok("and nothing left unanswered", (all.missed || []).length === 0, JSON.stringify(all.missed));
  ok("what it thinks each one means is carried",
     (all.answers || []).every((a) => a.means === "noLessons" && a.why), JSON.stringify(all.answers[0]));
  // THE EVIDENCE GATE IS STILL THE GATE. The dates are this app's now, so a date
  // cannot be invented — but a model can still annotate from the general sense
  // of the page rather than from the entry in front of it, and that is checked
  // exactly as before: the words it quotes must be in the document, with the
  // entry's own date beside them.
  const astray = await mark("nowhere");
  ok("an answer quoting a line the document hasn't got is still a question",
     (astray.answers || []).every((a) => /not in the document/.test(a.checked || "")),
     JSON.stringify((astray.answers || [])[0]));
  ok("while one quoting the real line goes through",
     (all.answers || []).every((a) => a.checked === ""), JSON.stringify(all.answers));

  // AND HALF AN ANSWER LEAVES THE OTHER HALF NAMED, NOT MISSING.
  const half = await mark("half");
  ok("a half-finished answer answers what it answered",
     (half.answers || []).length === 2, JSON.stringify((half.answers || []).map((a) => a.n)));
  ok("and says which numbers it never got to",
     JSON.stringify(half.missed) === "[3,4]", JSON.stringify(half.missed));
  ok("so every number is accounted for exactly once",
     [...(half.answers || []).map((a) => a.n), ...(half.missed || [])].sort().join(",") === "1,2,3,4",
     JSON.stringify([half.answers, half.missed]));

  // AN ANSWER TO A NUMBER NOBODY ASKED ABOUT IS NOT AN ANSWER.
  const extra = await mark("extra");
  ok("an answer to a number that was never asked is dropped",
     (extra.answers || []).every((a) => a.n <= 4), JSON.stringify((extra.answers || []).map((a) => a.n)));
  // NOR IS A SECOND ONE TO A NUMBER ALREADY ANSWERED.
  const twice = await mark("dup");
  ok("and a number answered twice keeps the first answer",
     (twice.answers || []).filter((a) => a.n === 1).length === 1 &&
     (twice.answers || []).find((a) => a.n === 1).means === "noLessons",
     JSON.stringify((twice.answers || []).filter((a) => a.n === 1)));

  // ---- AND WHETHER THE MEANING FITS THE ROW ------------------------------
  //
  // EVIDENCE THAT AN ENTRY EXISTS IS NOT EVIDENCE THAT THE ANSWER ABOUT IT IS
  // RIGHT. Every check above proves the row came out of the document and says
  // nothing about whether what the model made of it holds together — so "First
  // Semester: Sep. 1, 2026 ~ Jan. 22, 2027", a hundred and forty-four days,
  // arrived ticked and ready as DUE THAT DAY.
  //
  // These are not beliefs about schools. They are the three ways an answer can
  // contradict the shape of the row it is on, which is arithmetic.
  const shaped = async (c, how) => (await askCal({ year: 2026, candidates: [c],
    // "due" now has to point at words that put somebody under a deadline, so a
    // fixture about the SHAPE of a due row needs a document that owes something.
    text: `${how ? `MARKS:${how}\n` : ""}Papers due by 16:00\n` +
      "• First Semester: Sep. 1, 2026 ~ Jan. 22, 2027\n" +
      "• Winter Vacation: Jan. 23, 2027 ~ Feb.\nAug. 31" }));
  const term = await shaped({ n: 1, date: "2026-09-01", endsOn: "2027-01-22",
    label: "First Semester", line: "• First Semester: Sep. 1, 2026 ~ Jan. 22, 2027" }, "due");
  ok("a stretch of days is not due on one of them",
     /isn't due on one of them/.test(((term.answers || [])[0] || {}).checked || ""),
     JSON.stringify((term.answers || [])[0]));
  // AND THE SAME ROW WITH A MEANING THAT FITS IT GOES THROUGH.
  ok("while the same row with a meaning that fits it goes through",
     ((await shaped({ n: 1, date: "2026-09-01", endsOn: "",
       label: "First Semester", line: "• First Semester: Sep. 1, 2026 ~ Jan. 22, 2027" }, "due"))
       .answers[0] || {}).checked === "", "a one-day due date was refused too");
  const cut = await shaped({ n: 1, date: "2027-01-23", endsOn: "",
    label: "Winter Vacation", line: "• Winter Vacation: Jan. 23, 2027 ~ Feb." });
  ok("a line that runs on past its end can't be ready",
     /the end isn't on it/.test(((cut.answers || [])[0] || {}).checked || ""),
     JSON.stringify((cut.answers || [])[0]));
  const anon = await shaped({ n: 1, date: "2026-08-31", endsOn: "", label: "(no name)", line: "Aug. 31" });
  ok("and a row nobody could name can't be ready either",
     /nothing on that line to call it/.test(((anon.answers || [])[0] || {}).checked || ""),
     JSON.stringify((anon.answers || [])[0]));

  // AND A RANGE INSIDE ONE MONTH SAYS THE MONTH ONCE. "Tentatively Nov. 10-12"
  // has the twelfth of November written on it as plainly as anything else on the
  // page, and asking for "Nov 12" found nothing — so two exam windows came back
  // with "the day it ends isn't written near that line" printed directly above
  // the line that ends on it.
  const short2 = await askCal({ year: 2026, text: "Holidays:\nTentatively Nov. 10-12",
    candidates: [{ n: 1, date: "2026-11-10", endsOn: "2026-11-12",
      label: "Midterm exams", line: "Tentatively Nov. 10-12" }] });
  ok("a range written once inside a month is read as evidence for both ends",
     ((short2.answers || [])[0] || {}).checked === "", JSON.stringify((short2.answers || [])[0]));

  // ---- DOES THE DOCUMENT SAY THIS, OR DID THE READER WORK IT OUT? ----------
  //
  // THE LAST GAP, AND THE ONE CONFIDENCE COULD NOT CLOSE. "Professional
  // Development (PD) Days for Teachers: Oct. 16, Nov. 13" says who the day is
  // for. It does not say the students are away or that lessons stop — and a
  // model reading it as "no lessons" was ticking a teaching day out of a term at
  // 0.9, which is a number and not evidence. Raising the number would only have
  // made it ask about the holidays too.
  //
  // What separates the two is whether the words it quoted SAY the thing. That is
  // a question about the text, not about the model, so it can be asked — and
  // half of it can be CHECKED: a reader claiming the document says so must point
  // at the words, and the words must really be in what it quoted.
  // AND THE PROOF MAY BE THE HEADING THE LIST IS UNDER. What makes "Mid-Autumn
  // Festival: Sep. 25" a holiday is the word over the list it is in, not a word
  // on its own line — and refusing that would bury somebody in questions about
  // rows that were fine.
  const heading = await askCal({ year: 2026,
    text: `MARKS:heading\nHolidays (subject to change):\n${DOC}`,
    candidates: CANDS.map((c) => ({ ...c,
      context: ["Holidays (subject to change):", c.line] })) });
  ok("proof from the heading the list sits under counts",
     (heading.answers || []).every((a) => a.checked === ""),
     JSON.stringify((heading.answers || [])[0]));
  // AND IT IS SHOWN THE LINES IT IS BEING MARKED AGAINST.
  //
  // The reader worked out what each entry rests on, sent it here, and used it
  // as the only place a claim could be proved — and never put it in front of the
  // model. So a reading was JUDGED against evidence it had never been given:
  // four plain holidays on a real calendar sat under the heading "Holidays
  // (Subject to government announcements)", the app knew it, and the model,
  // seeing only "Mid-Autumn Festival: Sep. 25", could do nothing but reason from
  // the name of the festival — and was then told its reasoning was not in the
  // document. Marking to a rubric nobody handed over.
  {
    const sent = chats.filter((c) => /numbered list of entries already found/i.test(c.sys)).slice(-1)[0];
    ok("the entry's own heading goes to the model with the entry",
       !!sent && /what the document puts it under/.test(sent.usr || "") &&
       /Holidays \(subject to change\)/.test(sent.usr || ""),
       JSON.stringify((sent || {}).usr || "").slice(0, 300));
    ok("  and it is told that is where its proof is looked for",
       !!sent && /where "says" is looked for/i.test(sent.sys || ""),
       String(!!sent));
  }
  // AND A REAL PHRASE BORROWED FROM ANOTHER SECTION DOES NOT. "Holidays" is
  // genuinely in the file — three sections away — and looked for across the
  // whole document it would stand as proof that a training day is a day off.
  const elsewhere = await askCal({ year: 2026,
    text: `MARKS:heading\nHolidays (subject to change):\n${DOC}`,
    candidates: CANDS.map((c) => ({ ...c, context: [c.line] })) });
  ok("while the same phrase fetched from another part of the file does not",
     (elsewhere.answers || []).every((a) => /aren't in what this came from/.test(a.checked || "")),
     JSON.stringify((elsewhere.answers || [])[0]));
  const said0 = await mark("");
  ok("a reader that points at words really in the line goes through",
     (said0.answers || []).every((a) => a.checked === ""), JSON.stringify(said0.answers));
  const guessed = await mark("guessed");
  ok("one that says it worked the answer out is asked about",
     (guessed.answers || []).every((a) => /the reader worked it out/.test(a.checked || "")),
     JSON.stringify((guessed.answers || [])[0]));
  // AND IT CANNOT GET PAST THIS BY CLAIMING OTHERWISE. A model that says the
  // document states it must produce the words, and the words are looked for.
  const invented = await mark("invented");
  ok("and one that invents the words that prove it is caught",
     (invented.answers || []).every((a) => /aren't in what this came from/.test(a.checked || "")),
     JSON.stringify((invented.answers || [])[0]));

  // ---- AND "DUE" IS NOT LIKE THE OTHER FIVE ------------------------------
  //
  // Five of the six meanings describe the DAY: it is a holiday, there is no
  // teaching, another day's timetable runs, teaching starts, something happens
  // you should turn up to. Get one wrong and a day is described wrongly, which
  // you can see and argue with.
  //
  // "Due" is the only one that says something about the PERSON — that work of
  // theirs has to be finished by then. It is the only one that makes a task
  // with a deadline on it, and a deadline nobody set is pressure the document
  // never put on anybody. So it is asked for its own evidence, separately,
  // because folded into one question about whether the document "says" the
  // answer a model points at the name of the thing, and the name of a thing is
  // not an obligation.
  //
  // NOTHING HERE KNOWS WHICH WORDS MEAN WHICH. The difference between a thing
  // released on a date and a thing owed by one is in the words, and the words
  // are the document's — there is no list of verbs anywhere in this app, and
  // these fixtures deliberately have nothing to do with schools. What is
  // checked is that the claim is MADE and CHECKABLE: pointed at, really there,
  // and in this entry's own ground rather than fetched from elsewhere.
  {
    const PAIRS = [
      // [what the document says, the words that would prove an obligation]
      ["Application due Friday 6 November 2026", "due"],
      ["Payment deadline Monday 9 November 2026", "deadline"],
    ];
    const HAPPENS = [
      "Applications released Friday 13 November 2026",
      "Results published Monday 16 November 2026",
    ];
    // The name as the reader makes it: the line with its date taken out.
    const nameOf = (line) => line.replace(/,?\s*(?:Friday|Monday)\s+\d+\s+\w+\s+\d{4}/, "").trim();
    const ask = (line, mustBy, date) => askCal({ year: 2026,
      text: `MARKS:owed\nMUSTBY:${mustBy}\n${line}`,
      candidates: [{ n: 1, date, endsOn: "", label: nameOf(line), line, context: [line] }] });
    for (const [line, proof] of PAIRS) {
      const got = await ask(line, proof, /6 November/.test(line) ? "2026-11-06" : "2026-11-09");
      ok(`"${line.split(" ").slice(0, 2).join(" ")}" can be due, pointing at "${proof}"`,
         ((got.answers || [])[0] || {}).checked === "", JSON.stringify((got.answers || [])[0]));
      ok("  and the row carries the words it rests on",
         ((got.answers || [])[0] || {}).mustBy === proof,
         JSON.stringify((got.answers || [])[0]));
    }
    for (const line of HAPPENS) {
      const got = await ask(line, "", /13 November/.test(line) ? "2026-11-13" : "2026-11-16");
      ok(`"${line.split(" ").slice(0, 2).join(" ")}" is a date, not a deadline`,
         /not that anything of yours is due by then/.test(((got.answers || [])[0] || {}).checked || ""),
         JSON.stringify((got.answers || [])[0]));
    }
    // AND IT CANNOT BE GOT PAST BY MAKING THE WORDS UP, any more than the other
    // gates can. Same rule, same arithmetic.
    const bluff = await ask(HAPPENS[0], "must be handed in by", "2026-11-13");
    ok("and words invented to prove a deadline are caught like any other",
       /put you under a deadline aren't in what this came from/
         .test(((bluff.answers || [])[0] || {}).checked || ""),
       JSON.stringify((bluff.answers || [])[0]));
    // AND A REAL PHRASE BORROWED FROM ANOTHER ENTRY IS NOT EVIDENCE EITHER.
    const borrowed = await askCal({ year: 2026,
      text: `MARKS:owed\nMUSTBY:due\n${PAIRS[0][0]}\n${HAPPENS[0]}`,
      candidates: [{ n: 1, date: "2026-11-13", endsOn: "", label: HAPPENS[0],
        line: HAPPENS[0], context: [HAPPENS[0]] }] });
    ok("nor one lifted off a different entry that really does have a deadline",
       /put you under a deadline aren't in what this came from/
         .test(((borrowed.answers || [])[0] || {}).checked || ""),
       JSON.stringify((borrowed.answers || [])[0]));
    // AND NONE OF THIS TOUCHES THE OTHER FIVE MEANINGS.
    // AND A MEANING THAT DESCRIBES THE DAY NEEDS NO "mustBy" — it needs its own
    // words instead, which is the same rule wearing different clothes.
    const SHUT = "Offices closed Friday 13 November 2026";
    const off = await askCal({ year: 2026, text: `MARKS:says\nMEANS:noLessons\nSAYS:closed\n${SHUT}`,
      candidates: [{ n: 1, date: "2026-11-13", endsOn: "", label: nameOf(SHUT),
        line: SHUT, context: [SHUT] }] });
    ok("while a meaning that describes the day needs no such thing",
       ((off.answers || [])[0] || {}).checked === "",
       JSON.stringify((off.answers || [])[0]));
  }

  // ---- AND WHAT AN ANSWER HAS TO PROVE DEPENDS ON WHAT IT CLAIMS ---------
  //
  // "week" says only that something happens on a working day they should turn
  // up to. It takes nothing away — no teaching stops, no day comes off, nothing
  // falls due — and no document has ever written "this is in your week", so
  // asking one to STATE it is asking for a sentence that does not exist. What
  // makes a parents' evening yours is who it is FOR, which the document does
  // say, matched against what you say you teach, which it never will.
  {
    const LINE = "Parents' evening, Friday 6 November 2026: Year 7 and Year 8";
    // AS THE READER MAKES ONE: the name with the date taken out of it, the line
    // as the document wrote it. A candidate whose label IS its whole line is a
    // mark on a grid, and a mark is a different case — see the name-only check.
    const NAME = "Parents' evening: Year 7 and Year 8";
    const ask = (about) => askCal({ year: 2026, about,
      text: `MARKS:week\n${LINE}`,
      candidates: [{ n: 1, date: "2026-11-06", endsOn: "", label: NAME, line: LINE,
        context: [LINE] }] });
    const told = await ask("Year 7 form tutor");
    ok("an event goes in your week when the document says who it is for and you have said who you are",
       ((told.answers || [])[0] || {}).checked === "" &&
       ((told.answers || [])[0] || {}).means === "week",
       JSON.stringify((told.answers || [])[0]));
    const blank = await ask("");
    ok("  and is a question when you have told it nothing about yourself",
       /haven't said what you teach/.test(((blank.answers || [])[0] || {}).checked || ""),
       JSON.stringify((blank.answers || [])[0]));
    // AND NOTHING ELSE IS LOOSENED. A day OFF still has to be said by the
    // document, profile or no profile: it takes a working day out of a term.
    const off = await askCal({ year: 2026, about: "Year 7 form tutor",
      text: `MARKS:guessed\n${LINE}`,
      candidates: [{ n: 1, date: "2026-11-06", endsOn: "", label: NAME, line: LINE,
        context: [LINE] }] });
    ok("while a day off still has to be something the document says",
       /the reader worked it out/.test(((off.answers || [])[0] || {}).checked || ""),
       JSON.stringify((off.answers || [])[0]));
  }

  // AND "due" IS ASKED ONCE, NOT TWICE. Whether the document says something is
  // owed is the SAME question as which words put you under the deadline, and it
  // was being asked in both wordings — so a reader that pointed at the words and
  // was honest that the rest was inference failed on the weaker of the two. On a
  // real calendar that stopped four genuine deadlines.
  {
    const LINE = "Payment deadline Monday 9 November 2026";
    const got = await askCal({ year: 2026,
      // "guessed" is a reader saying stated:false — the honest shape of most
      // reading — while still pointing at the words that make it a deadline.
      text: `MARKS:guessedowed\nMUSTBY:deadline\n${LINE}`,
      candidates: [{ n: 1, date: "2026-11-09", endsOn: "", label: LINE, line: LINE,
        context: [LINE] }] });
    ok("a deadline that points at the words is not asked the same thing again",
       ((got.answers || [])[0] || {}).checked === "" &&
       ((got.answers || [])[0] || {}).mustBy === "deadline",
       JSON.stringify((got.answers || [])[0]));
  }

  // ---- AND WHERE BOTH SIDES WROTE NUMBERS DOWN, THE NUMBERS DECIDE -------
  //
  // Whose an entry is was left entirely to a model, and a model is inconsistent
  // about it in the way models are: on one real calendar it set aside a meeting
  // labelled for one pair of year groups and put the meeting labelled for the
  // NEXT pair into the week of somebody who had written which year they teach
  // in the box. Two labels of the same shape, answered two ways, and the second
  // one wrong.
  //
  // It did not have to be asked. Whether two sets of numbers meet is arithmetic.
  //
  // NOTHING HERE KNOWS WHAT A YEAR GROUP IS, and there is no list of words. It
  // compares numbers carrying THE SAME LABEL ON BOTH SIDES — the label can be
  // anything the two of you happen to share. These fixtures use a word this app
  // has never met, on purpose.
  {
    const ask = (about, line) => askCal({ year: 2026, about,
      text: `MARKS:week\n${line}`,
      candidates: [{ n: 1, date: "2026-11-06", endsOn: "", label: line, line,
        context: [line] }] });
    const apart = await ask("Pod 1 group leader", "Pod 11-12 leaders' briefing, 6 November 2026");
    ok("numbers on both sides that miss are set aside whatever the model said",
       ((apart.answers || [])[0] || {}).mine === "no",
       JSON.stringify((apart.answers || [])[0]));
    const meet = await ask("Pod 1 group leader", "Pod 1-8 parents' evening, 6 November 2026");
    ok("and numbers that meet are theirs, whatever the model said",
       ((meet.answers || [])[0] || {}).mine === "yes",
       JSON.stringify((meet.answers || [])[0]));
    // AND THE NEXT ONE ALONG IS DECIDED THE SAME WAY AS THE LAST, which is the
    // whole complaint: two labels of one shape must not be answered two ways.
    const next = await ask("Pod 1 group leader", "Pod 9-10 leaders' briefing, 6 November 2026");
    ok("  and the pair either side of the boundary agree with each other",
       ((next.answers || [])[0] || {}).mine === "no",
       JSON.stringify((next.answers || [])[0]));
    // AND A LABEL THE TWO SIDES DO NOT SHARE IS NOT AN ANSWER. "Pod 1" says
    // nothing about "Tier 9-12"; there is nothing to compare and the reading
    // stands.
    const other = await ask("Pod 1 group leader", "Tier 9-12 briefing, 6 November 2026");
    ok("while numbers under a label the other side never used decide nothing",
       ((other.answers || [])[0] || {}).mine === "yes",
       JSON.stringify((other.answers || [])[0]));
    // AND NEITHER DOES A LABEL WITH NO NUMBERS AT ALL.
    const none = await ask("Pod 1 group leader", "Whole-staff briefing, 6 November 2026");
    ok("and a label with no numbers on it is still the model's to judge",
       ((none.answers || [])[0] || {}).mine === "yes",
       JSON.stringify((none.answers || [])[0]));
    // AND A FOUR-FIGURE YEAR IS NOT A GROUP OF ANYBODY.
    //
    // Calendars put the year in their titles and people put it in the box —
    // "…, intake 2026" on one side and "…, intake 2026" on the other. Counted
    // as a label with numbers under it, that is a group everybody is in, and it
    // would overrule the groups that actually mean something: the pods here
    // plainly miss, and this must not come out as theirs because both sides
    // mentioned the same year.
    const yr = await ask("Pod 1 group leader, intake 2026",
                         "Pod 9-10 briefing, intake 2026, 6 November 2026");
    ok("and a four-figure year is not a group of anybody",
       ((yr.answers || [])[0] || {}).mine === "no",
       JSON.stringify((yr.answers || [])[0]));
  }

  // ---- AND AN ENTRY'S OWN GROUND IS A PLACE ITS QUOTE MAY COME FROM -------
  //
  // What the quote check is really asking is "does this belong to this entry",
  // and the entry's date was the only way it had of asking. That is a proxy,
  // and it costs a table its right-hand column: a cell reading "Nov. 17 16:00"
  // under a heading called "Score Input & Report Confirm" is best described by
  // quoting the heading — which has no date anywhere near it. So one column of
  // a deadline table went through and the column beside it, built the same way
  // out of the same page, did not.
  {
    const CELL = { n: 1, date: "2026-11-17", endsOn: "", label: "Midterm — Scores Due",
      line: "17 Nov 16:00",
      context: ["Submission and scoring deadlines:", "Midterm", "Papers In", "Scores Due",
                "17 Nov 16:00"] };
    const head = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: "MARKS:says\nSAYS:Scores Due\nSubmission and scoring deadlines:\nMidterm\n17 Nov 16:00",
      candidates: [CELL] });
    ok("a cell quoting its own column heading is not treated as borrowing",
       ((head.answers || [])[0] || {}).checked === "",
       JSON.stringify((head.answers || [])[0]));
    // AND A QUOTE OFF SOMEBODY ELSE'S LINE STILL IS. The rule is the entry's
    // own ground, not the whole page.
    const borrowed = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: "MARKS:says\nSAYS:Spring Fair\nSubmission and scoring deadlines:\nMidterm\n17 Nov 16:00\nSpring Fair",
      candidates: [CELL] });
    ok("  while a quote off another part of the page still is",
       /line not in the document|isn't the line this came off|day isn't written/
         .test(((borrowed.answers || [])[0] || {}).checked || ""),
       JSON.stringify((borrowed.answers || [])[0]));
  }

  // ---- AND NO CELL MAY PROVE ITSELF OUT OF THE COLUMN BESIDE IT ----------
  //
  // "An entry's own ground" is only worth having if the ground is the CELL'S and
  // not the whole table row. A two-column deadline table has two headings over
  // one row, and both were being handed to both cells — so the paper-submission
  // cell could prove itself by quoting the scores column, a real phrase,
  // genuinely in the table, and about the cell next to it. That is borrowing in
  // the one place a borrowed phrase looks most like evidence, because it comes
  // off the same row of the same table.
  {
    const TABLE = ["Submission and scoring deadlines:", "Papers In", "Scores Due",
                   "Midterm", "2 Nov 16:00", "17 Nov 16:00"].join("\n");
    // As the reader works them out: each cell knows its row, ITS column, and
    // its own words.
    const LEFT = { n: 1, date: "2026-11-02", endsOn: "", label: "Midterm — Papers In",
      line: "2 Nov 16:00",
      context: ["Submission and scoring deadlines:", "Midterm", "Papers In", "2 Nov 16:00"] };
    const RIGHT = { n: 1, date: "2026-11-17", endsOn: "", label: "Midterm — Scores Due",
      line: "17 Nov 16:00",
      context: ["Submission and scoring deadlines:", "Midterm", "Scores Due", "17 Nov 16:00"] };
    const cite = (cell, quote) => askCal({ year: 2026, about: "Pod 1 group leader",
      text: `MARKS:says\nSAYS:${quote}\n${TABLE}`, candidates: [cell] });
    const bad = async (what, cell, quote) => {
      const got = await cite(cell, quote);
      ok(what, !!((got.answers || [])[0] || {}).checked, JSON.stringify((got.answers || [])[0]));
    };
    await bad("the left cell cannot prove itself by the right column's heading", LEFT, "Scores Due");
    await bad("  nor by the right cell's own words", LEFT, "17 Nov 16:00");
    await bad("the right cell cannot prove itself by the left column's heading", RIGHT, "Papers In");
    await bad("  nor by the left cell's own words", RIGHT, "2 Nov 16:00");
    // AND EACH STILL PROVES ITSELF BY ITS OWN, which is the whole point of the
    // ground: narrow enough to be honest, wide enough to be usable.
    for (const [what, cell, quote] of [
      ["and the left cell still proves itself by its own column", LEFT, "Papers In"],
      ["and the right cell still proves itself by its own column", RIGHT, "Scores Due"],
    ]) {
      const got = await cite(cell, quote);
      ok(what, ((got.answers || [])[0] || {}).checked === "",
         JSON.stringify((got.answers || [])[0]));
    }
    // AND THE ROW HEADING IS IN BOTH CELLS' GROUND — it really is what both of
    // them are in — BUT BEING THERE IS NO LONGER ENOUGH.
    //
    // This used to pass, and was written down as a thing no structural rule
    // could settle: refusing a row heading outright would be right for this
    // table and wrong for the one written the other way round —
    //
    //     Reports due | 12 Nov | 14 Mar
    //
    // where the ROW says what is owed and the column says which term. That is
    // still true, and it is still not decided by where the words sit. It is
    // decided by WHAT THEY SAY: "Midterm" does not put anybody under a
    // deadline and "Reports due" does, whichever edge of the table each is on.
    // See SAYS_SO.
    const rowOnly = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: `MARKS:owed\nMUSTBY:Midterm\n${TABLE}`, candidates: [LEFT] });
    ok("and a row heading that owes nothing proves nothing, wherever it sits",
       /a date this happens on, not a thing you owe by then/
         .test(((rowOnly.answers || [])[0] || {}).checked || ""),
       JSON.stringify((rowOnly.answers || [])[0]));
    // AND THE SAME TABLE WRITTEN THE OTHER WAY ROUND STILL WORKS, which is why
    // this is about the words and not about the edge.
    const otherWay = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: `MARKS:owed\nMUSTBY:Reports due\nReports due\n12 Nov 2026`,
      candidates: [{ n: 1, date: "2026-11-12", endsOn: "", label: "Reports due — Autumn",
        line: "12 Nov 2026", context: ["Reports due", "Autumn", "12 Nov 2026"] }] });
    ok("  while a row heading that does owe something proves it",
       ((otherWay.answers || [])[0] || {}).checked === "",
       JSON.stringify((otherWay.answers || [])[0]));
    // WHAT IS SETTLED: it cannot be borrowed from the row NEXT DOOR.
    const otherRow = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: `MARKS:owed\nMUSTBY:Final\n${TABLE}\nFinal\n31 Dec 16:00`, candidates: [LEFT] });
    ok("  while another row's heading proves nothing at all",
       /put you under a deadline aren't in what this came from/
         .test(((otherRow.answers || [])[0] || {}).checked || ""),
       JSON.stringify((otherRow.answers || [])[0]));
  }

  // ---- AND EVERY SHARED LABEL IS A CONSTRAINT ----------------------------
  //
  // Taking the first overlap as the answer let a match on one dimension rescue
  // a miss on another. "Pod 1, Room 12" against "Pod 9-10 briefing, Room 12"
  // came out as theirs because the room agreed — and the pod is a fact about
  // whose it is, saying no, which nothing else agreeing makes less true.
  {
    const ask = (about, line) => askCal({ year: 2026, about,
      text: `MARKS:week\n${line}`,
      candidates: [{ n: 1, date: "2026-11-06", endsOn: "", label: line, line,
        context: [line] }] });
    const clash = await ask("Pod 1 group leader, Room 12",
                            "Pod 9-10 briefing in Room 12, 6 November 2026");
    ok("a label that misses is not rescued by another that meets",
       ((clash.answers || [])[0] || {}).mine === "no",
       JSON.stringify((clash.answers || [])[0]));
    const both = await ask("Pod 1 group leader, Room 12",
                           "Pod 1-8 evening in Room 12, 6 November 2026");
    ok("  and two that both meet are still theirs",
       ((both.answers || [])[0] || {}).mine === "yes",
       JSON.stringify((both.answers || [])[0]));
    const one = await ask("Pod 1 group leader, Room 12",
                          "Pod 1-8 evening in Room 5, 6 November 2026");
    ok("  while one that misses sets it aside even where the other meets",
       ((one.answers || [])[0] || {}).mine === "no",
       JSON.stringify((one.answers || [])[0]));
  }

  // ---- AND WHAT THE APP CAN ANSWER FOR ITSELF, IT DOES NOT ASK ABOUT -----
  //
  // A whole calendar went to a model one batch at a time, and the model spent
  // the best part of an hour being asked whether Christmas is a holiday — while
  // the check waiting behind it already knew, because the document writes
  // "Holidays" over the list Christmas is in and the app knows what its own
  // words mean. Every answer came back and was checked against exactly the
  // evidence that could have produced it.
  //
  // So the evidence goes first. The model is shown only what is genuinely open,
  // and the answers that need no model survive a model that never runs.
  {
    const decide = (cands, about) => askCal({ year: 2026, about: about || "Pod 1 group leader",
      decideOnly: true, text: "some calendar", candidates: cands });
    const one = (over, label, line) => ([{ n: 1, date: "2026-11-13", endsOn: "",
      label, line, context: [over, line] }]);

    const off = await decide(one("Closures:", "Autumn break", "13 November 2026"));
    // A CLOSURE SUSPENDS THE TIMETABLE. It does not say you are away — that is
    // your answer to give and no sheet can give it for you. See SAYS_SO.
    ok("an entry under a heading that says closed is settled without asking",
       ((off.answers || [])[0] || {}).means === "noLessons",
       JSON.stringify((off.answers || [])[0]));
    ok("  and says it is the document talking, not a reader thinking",
       /the document says so, in as many words/.test(((off.answers || [])[0] || {}).why || ""),
       JSON.stringify((off.answers || [])[0]));
    const due = await decide(one("Submission deadlines:", "Midterm — Papers In", "2 Nov 16:00"));
    ok("a cell under a heading that says deadlines is settled too",
       ((due.answers || [])[0] || {}).means === "due",
       JSON.stringify((due.answers || [])[0]));
    // AND NOTHING IT CANNOT PROVE. The whole point is that what is left is
    // genuinely open, not that the list gets shorter.
    const open = await decide(one("Whole-school events:", "Induction morning", "13 November 2026"));
    ok("while an entry whose words say nothing is left for the model",
       !((open.answers || [])[0] || {}).means,
       JSON.stringify((open.answers || [])[0]));
    // AND TWO ANSWERS AT ONCE IS AMBIGUITY, WHICH IS WHAT THE MODEL IS FOR. A
    // line naming a holiday AND the timetable a working day follows says both.
    const both = await decide(one("Closures:",
      "Autumn break", "13 Nov is a working day, even week Wednesday schedule"));
    ok("and where its own words say two different things, nobody is settled on",
       !((both.answers || [])[0] || {}).means,
       JSON.stringify((both.answers || [])[0]));
    // AND WHAT THE ROW IS CALLED CAN STOP IT BEING SETTLED AT ALL. A day the
    // document calls a working day, inside a list of closures, is the exception
    // that list is announcing — and it is the one case where being decided
    // without anybody asking would be worst, because nobody proposed it.
    const exception = await decide(one("Closures:",
      "Autumn break — is a working day", "13 November 2026"));
    ok("a row whose own name says the opposite is not settled by its heading",
       !((exception.answers || [])[0] || {}).means,
       JSON.stringify((exception.answers || [])[0]));
    // AND IT SAYS ITS WORKING. This is the one judgement the app makes entirely
    // on its own — no model, nobody asked — so "the reader thinks this isn't
    // yours: no reason given" is it asking to be taken on trust about exactly
    // the decision that most needs to show what it rests on.
    const shown = await decide([{ n: 1, date: "2026-11-13", endsOn: "",
      label: "Pod 9-10 leaders' briefing", line: "Pod 9-10 leaders' briefing, 13 Nov 2026",
      context: ["Pod 9-10 leaders' briefing, 13 Nov 2026"] }]);
    ok("and it says which numbers it compared, both of them",
       /you said pod 1/.test(((shown.answers || [])[0] || {}).whyMine || "") &&
       /this one is pod 9-10/.test(((shown.answers || [])[0] || {}).whyMine || ""),
       JSON.stringify((shown.answers || [])[0]));
    // AND THE SAME THE OTHER WAY ROUND, because "this one IS yours, and here is
    // why" is the other half of one fact — and on a row still waiting on you
    // for what the day MEANS, it says which half is already answered.
    const kept = await decide([{ n: 1, date: "2026-11-13", endsOn: "",
      label: "Pod 1-8 parents' evening", line: "Pod 1-8 parents' evening, 13 Nov 2026",
      context: ["Pod 1-8 parents' evening, 13 Nov 2026"] }]);
    ok("  and says it when the numbers meet, not only when they miss",
       ((kept.answers || [])[0] || {}).mine === "yes" &&
       /you said pod 1; this one is pod 1-8/.test(((kept.answers || [])[0] || {}).whyMine || ""),
       JSON.stringify((kept.answers || [])[0]));
    // AND WHOSE IT IS NEEDS NO MODEL EITHER, which is the half that used to be
    // downstream of one: a meeting labelled for years somebody does not teach
    // came back as blank buttons the moment the model ran out of time.
    const theirs = await decide([{ n: 1, date: "2026-11-13", endsOn: "",
      label: "Pod 9-10 leaders' briefing", line: "Pod 9-10 leaders' briefing, 13 Nov 2026",
      context: ["Pod 9-10 leaders' briefing, 13 Nov 2026"] }]);
    ok("somebody else's meeting is set aside with no model in the room",
       ((theirs.answers || [])[0] || {}).mine === "no",
       JSON.stringify((theirs.answers || [])[0]));
    // AND THE SHAPE STILL HAS TO FIT. A stretch of days cannot be due on one.
    const span = await decide([{ n: 1, date: "2026-11-13", endsOn: "2026-12-13",
      label: "Submission window", line: "13 Nov - 13 Dec 2026",
      context: ["Submission deadlines:", "13 Nov - 13 Dec 2026"] }]);
    ok("and a stretch of days is still not due on one of them",
       !((span.answers || [])[0] || {}).means,
       JSON.stringify((span.answers || [])[0]));
    // AND NO MODEL IS ASKED. Counted at the far end: this pass must not reach
    // one, or it is not a pass, it is another round trip with extra steps.
    {
      const before = chats.length;
      await decide(one("Closures:", "Autumn break", "13 November 2026"));
      ok("and no model is asked for any of it", chats.length === before,
         `${chats.length - before} asked`);
    }
  }

  // ---- AND POINTING AT THE RIGHT LINE IS NOT THE LINE SAYING THE THING ---
  //
  // THE HOLE THIS CLOSES, and it took a real calendar to show it. Every check
  // up to here asks WHERE a quote came from — is it in the document, is it in
  // this entry's own ground, is it the entry's whole name. None of them asks
  // WHAT IT SAYS. So a reader could quote words that genuinely identify the
  // event and then append a consequence those words do not carry, and the
  // answer went through ticked:
  //
  //     "Orientation: Feb. 18-19"  →  day off
  //     "Students Arrival"         →  day off
  //     "Report Distribution"      →  something is due from you
  //
  // Each quote real, in the right place, about the right entry, and proving
  // nothing at all about anybody's working week.
  //
  // WHAT CHANGED, AND WHAT DID NOT. Nothing here knows what an orientation is,
  // or a festival, or a training day — that is one school's world, it is
  // endless, and it is the app deciding a term from a noun. But the app DEFINED
  // these six answers and wrote them on its own buttons, and a verifier that
  // does not know what its own words mean leaves every judgement to a model.
  // So: a vocabulary for the app's own categories, none for the world's events.
  // These fixtures are deliberately nothing to do with schools.
  {
    const ask = (line, means, says, mustBy) => askCal({ year: 2026,
      about: "Pod 1 group leader",
      text: `MARKS:says\nMEANS:${means}\nSAYS:${says}\n${line}`,
      candidates: [{ n: 1, date: "2026-11-13", endsOn: "", label: line.split(",")[0],
        line, context: [line] }] });
    const refused = async (what, line, means, says) => {
      const got = await ask(line, means, says);
      ok(what, !!((got.answers || [])[0] || {}).checked,
         JSON.stringify((got.answers || [])[0]));
    };
    const allowed = async (what, line, means, says) => {
      const got = await ask(line, means, says);
      ok(what, ((got.answers || [])[0] || {}).checked === "",
         JSON.stringify((got.answers || [])[0]));
    };
    // NAMING THE EVENT IS NOT SAYING WHAT IT DOES.
    await refused("naming an event does not make it a day off",
                  "Induction morning, 13 November 2026", "off", "Induction morning");
    await refused("  nor a day with no teaching",
                  "Induction morning, 13 November 2026", "noLessons", "Induction morning");
    await refused("  nor the day the work starts",
                  "Induction morning, 13 November 2026", "lessons", "Induction morning");
    // WHILE A DOCUMENT THAT SAYS IT, SAYS IT.
    await allowed("a document that says the place is closed says it",
                  "Site closed, 13 November 2026", "noLessons", "closed");
    await allowed("  and one that says there are no classes says that",
                  "No classes, 13 November 2026", "noLessons", "No classes");
    // AND WHAT A LINE SAYS ABOUT ITSELF BEATS THE LIST IT IS FILED UNDER.
    //
    // The strongest of the failures: a line reading IS A WORKING DAY came back
    // proposed as a day off. It is inside a list of closures — it is the
    // exception that list is announcing — and the section it sits under cannot
    // outrank the words on it.
    {
      const clash = await askCal({ year: 2026, about: "Pod 1 group leader",
        // "Days off" rather than "Closures": a closure says the timetable is
        // not running, which a working day can live with; being AWAY is what a
        // working day contradicts, and that is the pairing this is about.
        text: "MARKS:says\nMEANS:off\nSAYS:Days off\nDays off\n13 Nov is a working day, even week Wednesday schedule",
        candidates: [{ n: 1, date: "2026-11-13", endsOn: "",
          label: "Autumn break — is a working day, even week Wednesday schedule",
          line: "13 Nov is a working day, even week Wednesday schedule",
          context: ["Days off", "13 Nov is a working day, even week Wednesday schedule"] }] });
      ok("a day the document calls a working day cannot be a day off",
         /says the opposite/.test(((clash.answers || [])[0] || {}).checked || ""),
         JSON.stringify((clash.answers || [])[0]));
      // AND THE SAME LINE READ THE WAY IT ACTUALLY READS STILL GOES THROUGH.
      const runs = await askCal({ year: 2026, about: "Pod 1 group leader",
        text: "MARKS:says\nMEANS:runsAs\nSAYS:even week Wednesday schedule\nClosures\n13 Nov is a working day, even week Wednesday schedule",
        candidates: [{ n: 1, date: "2026-11-13", endsOn: "",
          label: "Autumn break — is a working day, even week Wednesday schedule",
          line: "13 Nov is a working day, even week Wednesday schedule",
          context: ["Closures", "13 Nov is a working day, even week Wednesday schedule"] }] });
      ok("  while the reading the line actually supports goes through",
         ((runs.answers || [])[0] || {}).checked === "",
         JSON.stringify((runs.answers || [])[0]));
    }
    // AND IT HAS TO BE THE PHRASE, NOT THE WORD SOMEWHERE IN IT.
    //
    // A vocabulary matched as bare words is keyword spotting, and keyword
    // spotting is how a term loses a day to a concert. The difference is
    // grammatical and it is checkable: in "Christmas Holiday: Dec. 22" the word
    // is the head of its phrase; in "Holiday concert" it is modifying the noun
    // after it, and the sentence is about a concert.
    for (const [line, means, says] of [
      ["Holiday concert, 13 November 2026", "noLessons", "Holiday concert"],
      ["Vacation programme, 13 November 2026", "noLessons", "Vacation programme"],
      ["Deadline guidance meeting, 13 November 2026", "due", "Deadline guidance"],
      ["Timetable review meeting, 13 November 2026", "runsAs", "Timetable review"],
    ]) await refused(`"${says}" does not say it, it mentions it`, line, means, says);
    // WHILE THE SAME WORD AT THE HEAD OF ITS PHRASE DOES SAY IT.
    await allowed("but the same word heading its own phrase does",
                  "Winter Holiday, 13 November 2026", "noLessons", "Winter Holiday");
    // AND A THING CLOSED TO SOMEBODY ELSE IS NOT YOUR DAY OFF. "Closed to
    // students" is closed to THEM, and whoever reads this is still working.
    // Costs a question on "closed to the public", which is the right way round.
    await refused("and closed to somebody else is not closed to you",
                  "Site closed to students, 13 November 2026", "noLessons", "closed to students");
    // AND WHERE THE SENTENCE NAMES WHOSE IT IS, THE NUMBERS STILL DECIDE — so a
    // day with no classes for a year group this person does not teach is set
    // aside rather than taken out of their week. Same rule as everywhere else;
    // it is not the semantics' job to know.
    {
      const theirs = await askCal({ year: 2026, about: "Pod 1 group leader",
        text: "MARKS:says\nMEANS:noLessons\nSAYS:No classes\nNo classes for Pod 12, 13 November 2026",
        candidates: [{ n: 1, date: "2026-11-13", endsOn: "", label: "No classes for Pod 12",
          line: "No classes for Pod 12, 13 November 2026",
          context: ["No classes for Pod 12, 13 November 2026"] }] });
      ok("a day with no classes for somebody else's group is not your day",
         ((theirs.answers || [])[0] || {}).mine === "no",
         JSON.stringify((theirs.answers || [])[0]));
    }

    // AND A DATE SOMETHING HAPPENS ON IS STILL NOT A DEADLINE, however real the
    // phrase pointed at. This is the same rule reaching "due": "Week 12 (Nov. 20
    // Return Paper)" is a genuine phrase about the genuine entry, and it is a
    // date reports go out on.
    {
      const out = await askCal({ year: 2026, about: "Pod 1 group leader",
        text: "MARKS:owed\nMUSTBY:Week 12 handout\nWeek 12 handout\n20 Nov 2026",
        candidates: [{ n: 1, date: "2026-11-20", endsOn: "", label: "Newsletter — Handed out",
          line: "20 Nov 2026", context: ["Week 12 handout", "Handed out", "20 Nov 2026"] }] });
      ok("a real phrase about the right entry still cannot make a deadline",
         /a date this happens on, not a thing you owe by then/
           .test(((out.answers || [])[0] || {}).checked || ""),
         JSON.stringify((out.answers || [])[0]));
    }
  }

  // ---- AND GIVING UP HAS TO ACTUALLY GIVE UP -----------------------------
  //
  // THE EIGHTEEN MINUTES. The page gives a batch two minutes and then gives up
  // on it — and nothing told the server, and the server had no deadline of its
  // own, so its request to the model ran on to the end. A machine that answers
  // one thing at a time then spends the next batch's turn finishing the last
  // batch's, and a reading already written off is the reason the one after it
  // is late too. Five batches of a real calendar came to eighteen minutes and
  // fifty seconds of that, with twenty-four of twenty-seven entries still
  // unanswered at the end.
  //
  // Both ends of one rope, and neither was tied. What is checked here is the
  // one that can be: hanging up on the server stops the work it was waiting for.
  {
    hangs = true;
    const ctl = new AbortController();
    const asked = fetch(B + "/api/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({ year: 2026, text: "Some calendar\nOpen evening 6 Nov 2026",
        candidates: [{ n: 1, date: "2026-11-06", endsOn: "", label: "Open evening",
          line: "Open evening 6 Nov 2026", context: ["Open evening 6 Nov 2026"] }] }),
    }).catch(() => null);
    await sleep(300);
    ctl.abort();
    await asked;
    await sleep(400);
    ok("hanging up stops the work the server was waiting for",
       droppedByServer, String(droppedByServer));
    hangs = false;
  }

  // ---- AND A NAME IS NOT EVIDENCE ABOUT WHAT IT MEANS --------------------
  //
  // A mark on a term grid is a symbol and a line of legend saying what the
  // symbol is called. That is the whole of what the document says about it — so
  // a reader answering "no lessons" and pointing at the mark's own name passed
  // the check, because the words really are in what the entry rests on: they
  // are ALL of what it rests on. Fourteen Fridays came back ticked as a
  // staff-only day with no teaching, which the calendar never said, on the
  // strength of the meeting's own name.
  {
    const only = (label, means) => askCal({ year: 2026, about: "Pod 1 group leader",
      text: `MARKS:name\nMEANS:${means}\nSome calendar\n${label}`,
      candidates: [{ n: 1, date: "", endsOn: "", label, line: label, context: [label] }] });
    for (const means of ["noLessons", "off", "runsAs", "lessons"]) {
      const got = await only("Whole-Staff Briefing", means);
      ok(`"${means}" cannot be proved by the entry's own name`,
         /says what this is called and nothing else/
           .test(((got.answers || [])[0] || {}).checked || ""),
         JSON.stringify((got.answers || [])[0]));
    }
    // AND AN ENTRY THAT RESTS ON MORE THAN ITS NAME IS UNTOUCHED. A heading over
    // it, a row and column round it, or words of its own are all something to
    // point at; this is not a rule about marks, it is a rule about having
    // nothing but a name.
    const more = await askCal({ year: 2026, about: "Pod 1 group leader",
      text: "MARKS:says\nMEANS:noLessons\nSAYS:Closed all day\nClosed all day\nWhole-Staff Briefing",
      candidates: [{ n: 1, date: "", endsOn: "", label: "Whole-Staff Briefing",
        line: "Whole-Staff Briefing", context: ["Closed all day", "Whole-Staff Briefing"] }] });
    ok("while an entry with a heading over it still has something to point at",
       ((more.answers || [])[0] || {}).checked === "",
       JSON.stringify((more.answers || [])[0]));
  }

  // ---- AND "IS THIS YOURS" IS ONLY AN ANSWER IF THERE WAS A QUESTION -------
  //
  // The model is told what the person teaches, in their own words, and judges
  // relevance from that. With the box empty it is told nothing — so "yes, this
  // is for you" is not a judgement, it is a shrug in the shape of one, and it
  // was enough to tick a year-group meeting into somebody's week.
  const askedNothing = await askCal({ year: 2026, text: DOC, candidates: CANDS });
  ok("with nothing said about the person, what it says about relevance is dropped",
     (askedNothing.answers || []).every((a) => a.mine === ""),
     JSON.stringify((askedNothing.answers || []).map((a) => a.mine)));
  const toldSomething = await askCal({ year: 2026, text: DOC, candidates: CANDS,
    about: "Grade 1 homeroom, primary school" });
  ok("and kept once there is something to judge it against",
     (toldSomething.answers || []).every((a) => a.mine === "yes"),
     JSON.stringify((toldSomething.answers || []).map((a) => a.mine)));

  // ---- AND NO ENTRY MAY BORROW ANOTHER'S EVIDENCE --------------------------
  //
  // The date was the only thing tying a quote to the entry it was about, so an
  // entry with NO date — which is what a mark on a term grid is — could be
  // supported by any line anywhere in the document. On a real calendar "Grade
  // 9-10 Director Meeting" came back on screen justified by "Holidays:
  // Mid-Autumn Festival: Sep. 25" and "Grade 11-12 Director Meeting" by the
  // National Day line. Both quotes really are in the document, so both passed.
  //
  // That is worse than a wrong answer. A wrong answer can be disagreed with; an
  // answer showing somebody else's evidence as its reason is the app lying about
  // where it got something, and being checkable is the whole of what this panel
  // is for.
  const WITH_LEGEND = `${DOC}\nGrade 9-10 Director Meeting\nStaff Meeting`;
  const legend = (how) => askCal({ year: 2026,
    text: how ? `MARKS:${how}\n${WITH_LEGEND}` : WITH_LEGEND,
    candidates: [{ n: 1, date: "", endsOn: "", label: "Grade 9-10 Director Meeting",
      line: "Grade 9-10 Director Meeting" }] });
  const borrow = await legend("borrow");
  ok("an entry with no date can't be justified by a line about something else",
     /isn't the line this came off/.test(((borrow.answers || [])[0] || {}).checked || ""),
     JSON.stringify((borrow.answers || [])[0]));
  // AND ITS OWN LINE STILL WORKS. The rule is an anchor, not a refusal.
  const own = await legend("");
  ok("while its own line does",
     ((own.answers || [])[0] || {}).checked === "" &&
     /Grade 9-10 Director Meeting/.test(((own.answers || [])[0] || {}).source || ""),
     JSON.stringify((own.answers || [])[0]));

  // AND THE JOB IT IS ACTUALLY ASKED TO DO IS THE OTHER ONE.
  const used = chats.filter((c) => /numbered list of entries already found/i.test(c.sys));
  ok("with a list to annotate it is never asked to produce entries",
     used.length > 0 && chats.filter((c) => /plain list of dated entries/i.test(c.sys) &&
       /numbered list/i.test(c.sys)).length === 0, String(used.length));
}

{
  // THE WRAPPING A LOCAL MODEL PUTS ROUND ITS ANSWER.
  //
  // This is the fault that stopped the whole feature working on a real machine.
  // Asked for JSON and given a schema, a small model answers with JSON most of
  // the time and with one of these the rest of the time — and the reader took a
  // fence at the very start, a fence at the very end, and otherwise "from the
  // first { to the last }", which is not a JSON value and breaks on a brace in
  // the prose, on a bare array, and on anything cut off. Every one of them was a
  // whole reading thrown away over its packaging, and twenty-five rows to
  // classify by hand instead.
  const LINE = "Mid-Autumn Festival\t2026-09-25";
  const wrapped = async (how) => (await (await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `WRAPPED:${how}\t2026-12-01\n${LINE}`, year: 2026 }) })).json());
  for (const [how, what] of [
    ["fenced", "a fenced block with a sentence either side of it"],
    ["array", "the bare array, without the object round it"],
    ["othername", "the right array under a name of its own choosing"],
    ["comma", "a trailing comma, because it was writing a list"],
    ["think", "its thinking out loud, and then the answer"],
    ["openfence", "a fence it opened and never closed"],
  ]) {
    const got = await wrapped(how);
    ok(`${what} still reads`,
       (got.rows || []).some((r) => r.label === "Mid-Autumn Festival"),
       JSON.stringify(got).slice(0, 200));
  }
  // AND AN ANSWER THAT SIMPLY STOPS. A reply that ran out of room is mended back
  // to its last whole entry, because twenty-two entries out of twenty-five is
  // worth having and nothing is not — and then SAID, because a reading that is
  // quietly short is the one kind this app must never hand over without a word.
  const short = await wrapped("cutoff");
  ok("an answer that stops mid-entry keeps the entries that finished",
     (short.rows || []).some((r) => r.label === "Mid-Autumn Festival"),
     JSON.stringify(short).slice(0, 200));
  ok("and says that is what happened", short.shortAnswer === true,
     JSON.stringify(short.shortAnswer));
  const whole = await wrapped("none");
  ok("while an answer that finished says nothing of the sort",
     !("shortAnswer" in whole), JSON.stringify(whole.shortAnswer));
}

{
  // AND WHEN IT REALLY CANNOT BE READ, IT IS ASKED ONCE MORE, PLAINLY.
  //
  // A model that wrapped its answer in an apology is one that can be told not
  // to. Only for a reply that could not be read — never after a timeout or a
  // refused connection, where asking again is just waiting twice.
  const before = chats.length;
  const r = await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "BROKENJSON\tterm dates", year: 2026 }) });
  const said = await r.json();
  const mine = chats.slice(before).filter((c) => /plain list of dated entries/i.test(c.sys));
  ok("an unreadable answer is asked about a second time", mine.length === 2,
     String(mine.length));
  ok("and the second time it is told to send the JSON and nothing else",
     /JSON object and nothing else/.test((mine[1] || {}).sys || ""),
     JSON.stringify(((mine[1] || {}).sys || "").slice(-120)));
  ok("and the first time it is not — that is the prompt you wrote",
     !/JSON object and nothing else/.test((mine[0] || {}).sys || ""), "the nudge is in the first ask");
  // AND WHAT IT SAID COMES BACK, so the person whose computer it is can see it.
  ok("what the model actually said comes back with the failure",
     /I'm sorry/.test(said.saw || ""), JSON.stringify(said.saw));
  ok("and it is the FIRST answer, not the one made under an instruction they never wrote",
     !/could not be read/.test(said.saw || ""), JSON.stringify(said.saw));
}

{
  // HOW MUCH THE MODEL IS ALLOWED TO SEE AND SAY.
  //
  // Ollama's default context is 4,096 tokens on a current build and 2,048 on an
  // older one, and nothing here ever said otherwise. A school calendar is the
  // longest job in this app — the instructions, the whole document, and then a
  // dozen fields for each of twenty-five entries — and past the limit Ollama
  // does not refuse: it drops the front of the conversation and the reply stops
  // mid-sentence. The machine was doing as it was told.
  const asked = (c) => c.options && c.options.num_ctx;
  const small = chats.filter((c) => /plain list of dated entries/i.test(c.sys)).slice(-1)[0];
  ok("the context size is asked for at all", asked(small) >= 4096, JSON.stringify(small && small.options));
  const big = chats.length;
  await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Padding line with no date on it at all.\n".repeat(250) +
      "Sports Day\t2026-06-12", year: 2026 }) });
  const long = chats.slice(big).filter((c) => /plain list of dated entries/i.test(c.sys))[0];
  ok("and it grows with the document rather than being one number for everything",
     asked(long) > asked(small), `${asked(small)} then ${asked(long)}`);
  ok("with a ceiling, so a long document can't ask a laptop for more than it has",
     asked(long) <= 16384, String(asked(long)));
}

{
  // NOTHING TO READ IS NOT AN ERROR TO SWALLOW.
  const empty = await (await fetch(B + "/api/calendar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }) }));
  ok("an empty document is refused rather than sent", empty.status === 400, String(empty.status));
}

// AND WHEN IT CANNOT ANSWER, THE MESSAGE IS SENTENCES, NOT ONE WELDED TO
// ANOTHER'S TAIL. offlineReason writes a whole sentence and it ends in a
// question mark, so this came back as "…is it running? you can still type the
// blocks in by hand."
{
  // Pointed at a port with nothing on it, so the engine is configured and dead.
  const dead = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, AI_ENGINE: "ollama", AI_MODEL: "qwen3:14b",
           AI_BASE_URL: "http://localhost:11719", NO_OPEN: "1", PORT: "3719" },
    stdio: "ignore",
  });
  await sleep(2200);
  const say = async (path, body) => (await (await fetch(`http://localhost:3719${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) })).json()).message || "";
  for (const [what, path, body] of [
    ["timetable", "/api/timetable", { text: "Mon 09:00-10:00 Duty" }],
    ["calendar", "/api/calendar", { text: "Staff return 24 August 2026", year: 2026 }],
  ]) {
    const msg = await say(path, body);
    ok(`the ${what} says why it couldn't`, /isn't answering/.test(msg), msg);
    ok(`and does not carry on in lower case after a question mark`,
       !/\?\s+[a-z]/.test(msg), msg);
  }
  dead.kill();
}

srv.kill(); ol.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
