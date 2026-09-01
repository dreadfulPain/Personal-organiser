// Personal Organiser — local server (zero dependencies)
//
// This file uses ONLY Node's built-in modules, so the core app (seeing your
// zones + trustworthy saving) needs no `npm install` and no internet. Just Node.
//
// THE TWO HALVES (design tracker §0.1):
//   SEEING + SAVING  = static files in /public + the /api/data store below.
//                      Fully offline, no AI, never pauses. This is the
//                      trustworthy half this build is about.
//   PUTTING IN (AI)  = the optional sorting endpoints (/api/route for a short
//                      capture, /api/pipeline for a long paste, plus the
//                      per-page helpers). All optional: the app works
//                      completely without any of them.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
// The paste pipeline lives in its own module with a single entry point, so the
// capture box, the Day tab and anything later all call the SAME thing. Two
// copies of this would drift, exactly like two copies of the scoring would.
import { runPipeline, splitFragments, estimateCalls, ungroundedFields } from "./pipeline.js";

const __dirname = dirname(fileURLToPathSafe(import.meta.url));

function fileURLToPathSafe(u) {
  return fileURLToPath(u);
}
function dirname(p) {
  return path.dirname(p);
}

// --- where things live -----------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DATA_FILE = path.join(DATA_DIR, "organiser-data.json");
const PREV_FILE = path.join(BACKUP_DIR, "previous.json");

const PORT = process.env.PORT || 3000;
// How big your own saved document may get. Deliberately far larger than the
// limit on anything typed or pasted in: this one grows on its own, a bit every
// day, and the day it crosses the line is the day saving stops.
const DATA_LIMIT = 64 * 1024 * 1024;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Read a simple .env file (so you can paste a key without installing dotenv).
loadEnvFile();
function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env — that's fine */
  }
}

// --- the store: a real file the user owns, saved safely --------------------

const FILES_DIR = path.join(DATA_DIR, "files");
const EXPORT_DIR = path.join(DATA_DIR, "exports");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return normaliseDoc(d);
    }
  } catch (e) {
    console.warn("[data] main file unreadable, trying the previous copy:", e.message);
    try {
      const d = JSON.parse(fs.readFileSync(PREV_FILE, "utf8"));
      return { ...normaliseDoc(d), recovered: true };
    } catch {
      /* fall through to empty */
    }
  }
  return emptyDoc();
}

// THE LIST OF STORES, WRITTEN ONCE — THIS END TOO.
//
// public/store.js has had a table for a while, and the comment two hundred lines
// down this file already said what happens without one:
//
//   "THE LIST IS AN ALLOWLIST: a new store that isn't named here is silently
//    dropped on the next write by any page that doesn't send it, which is a
//    very quiet way to lose someone's notes."
//
// Somebody knew. It was still hand-copied into SIX places in this file — the
// empty document, the normaliser, the fallback, the conflict copy, the merge and
// the final write — and adding a store to the client did exactly what the
// comment predicted: every question typed into it vanished on save, with no
// error anywhere.
//
// One table. Adding a store means adding one line, at each end, and nothing else.
//   name · what "none" is for it
const STORES = [
  ["items", []],
  ["waiting", []],
  ["goals", []],
  ["records", []],
  ["recordConfig", null],
  ["portfolio", null],
  ["contacts", []],
  ["contactConfig", null],
  ["schedule", []],
  ["scheduleConfig", null],
  ["pastoralTopics", []],
  ["pastoralNotes", []],
  ["toldLog", []],
  ["worked", {}],
  ["areas", []],
  ["targeted", {}],
  ["tried", []],
  ["lessons", []],
  ["lessonConfig", null],
  ["rotas", []],
  ["syllabus", null],
  ["attendance", []],
  ["asks", []],
  ["visits", []],
  ["visitConfig", null],
];

// The same shape rule as the client's keep(): a value is taken only if it is the
// shape that store is, and anything else becomes "none" rather than being handed
// on to a page that will try to loop over it.
const blankFor = (b) => (Array.isArray(b) ? [] : b && typeof b === "object" ? {} : null);
function fits(value, b) {
  if (Array.isArray(b)) return Array.isArray(value);
  const objish = value && typeof value === "object" && !Array.isArray(value);
  return !!objish;
}
function emptyDoc() {
  const o = { version: 1 };
  STORES.forEach(([k, b]) => { o[k] = blankFor(b); });
  o.savedAt = null;
  return o;
}
// A PARTIAL SAVE LEAVES THE REST ALONE. A page saves only the stores it owns, so
// anything the input hasn't got — or has got in the wrong shape — comes from
// what is already on disk. Falling back rather than blanking is the whole reason
// the goals page cannot wipe your register.
function mergeDoc(input, current) {
  const o = { version: 1, savedAt: new Date().toISOString() };
  const src = input || {};
  const was = current || {};
  STORES.forEach(([k, b]) => {
    o[k] = fits(src[k], b) ? src[k] : fits(was[k], b) ? was[k] : blankFor(b);
  });
  return o;
}

function normaliseDoc(d) {
  const o = { version: 1 };
  const src = d || {};
  STORES.forEach(([k, b]) => { o[k] = fits(src[k], b) ? src[k] : blankFor(b); });
  o.savedAt = src.savedAt || null;
  return o;
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function writeData(input, opts) {
  ensureDirs();
  const baseSavedAt = opts && typeof opts.baseSavedAt === "string" ? opts.baseSavedAt : null;
  // Read the current on-disk state ONCE — used both to preserve omitted halves
  // and to guard against clobbering a shared file another machine just changed.
  let current = emptyDoc();
  try {
    current = readData();
  } catch {
    /* keep empty fallbacks */
  }

  // SHARED-FOLDER CONFLICT GUARD: if the client loaded version X but the file on
  // disk is now version Y (another computer wrote it, or a sync pulled it in),
  // do NOT overwrite. Preserve the incoming edit as a conflict copy so nothing
  // is ever lost, and tell the client to reload the latest.
  if (baseSavedAt !== null && current.savedAt && current.savedAt !== baseSavedAt) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      // Everything the incoming save meant, over what is on disk — see mergeDoc.
      // An ABSENT key means "I'm not talking about this store" and must not blank
      // it, which is exactly as true in a conflict copy as in an ordinary write.
      const kept = mergeDoc(input, current);
      fs.writeFileSync(path.join(BACKUP_DIR, `conflict-${stamp}.json`), JSON.stringify(kept, null, 2));
      pruneBackups();
      logEvent("save", { ok: false, why: "shared-folder-conflict" });
    } catch (e) {
      console.warn("[data] conflict copy warning:", e.message);
    }
    const err = new Error("conflict");
    err.conflict = true;
    err.current = current;
    throw err;
  }

  // EVERY STORE, FROM ONE TABLE — see mergeDoc. This was twenty-odd hand-written
  // lines, and the comment that used to sit in the middle of them said exactly
  // what would go wrong: a store not named here is dropped on the next write by
  // any page that doesn't send it. It then happened.
  const doc = mergeDoc(input, current);
  const json = JSON.stringify(doc, null, 2);

  // Keep safety copies BEFORE overwriting: the previous version (undo a bad
  // change) and one snapshot per day (point-in-time recovery).
  if (fs.existsSync(DATA_FILE)) {
    try {
      const current = fs.readFileSync(DATA_FILE);
      fs.writeFileSync(PREV_FILE, current);
      const daily = path.join(BACKUP_DIR, `organiser-${todayStamp()}.json`);
      if (!fs.existsSync(daily)) fs.writeFileSync(daily, current);
      pruneBackups();
    } catch (e) {
      console.warn("[data] backup warning:", e.message);
    }
  }

  // Atomic write: write to a temp file, then rename over the real one. A crash
  // mid-write can never leave the real file half-written.
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, DATA_FILE);
  return doc.savedAt;
}

function pruneBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^organiser-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    const keep = 60;
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
    // keep only the most recent handful of shared-folder conflict copies
    const conflicts = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^conflict-.*\.json$/.test(f))
      .sort();
    for (const f of conflicts.slice(0, Math.max(0, conflicts.length - 20))) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch {
    /* pruning is best-effort */
  }
}

// --- optional AI (loaded only if/when you set it up) -----------------------

const MODEL = "claude-opus-4-8"; // swap to a smaller model id for faster/cheaper sorting

const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    milestones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
        required: ["title", "steps"],
        additionalProperties: false,
      },
    },
  },
  required: ["milestones"],
  additionalProperties: false,
};

// Cluster detection (§9 slice 2c): spot when several loose tasks are really parts
// of one goal. Returns a proposed title + the NUMBERS of the tasks that belong.
const CLUSTER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    tasks: { type: "array", items: { type: "integer" } },
  },
  required: ["title", "tasks"],
  additionalProperties: false,
};

const BREAKDOWN_PROMPT = `You break a big goal into small milestones for a calm organiser built for someone with dyslexia and dyscalculia who is easily overwhelmed by the scale of a plan.

Your whole job: take one goal, written in plain words, and carve it into a few SMALL, reachable milestones — each one a real checkpoint the person could finish and feel a little proud of, even though the whole goal continues.

Follow these rules without exception:
- Lean SMALL and soon-reachable. A milestone the user can reach in days, not months. A distant milestone is demotivating — it becomes a bar that never fills. Small wins that arrive soon are the entire point.
- Propose about 3 to 5 milestones, in a sensible order (earliest first).
- Give each milestone 2 to 4 concrete first steps — short, plain, each starting with a verb ("Draft", "Email", "List", "Book"). The FIRST milestone's steps must be especially tiny and obvious, so starting is easy.
- Keep every title short and plain. Fix spelling silently. Never mention spelling.
- Stay practical and general. Do not assume facts the user did not give. If the goal is vague, choose sensible, common-sense milestones anyone with that goal would recognise.
- No preamble, no commentary. Return only the structured result.

Example — goal "learn to bake bread" might become:
{"milestones":[
  {"title":"Bake one basic loaf","steps":["Buy flour and yeast","Pick one simple recipe","Bake it once"]},
  {"title":"Get a reliable everyday loaf","steps":["Bake the same recipe twice more","Note what to change each time"]},
  {"title":"Try a second kind of bread","steps":["Choose a new recipe","Bake it once"]}
]}`;

// Cluster prompt (§9 slice 2c). Conservative by design: the app must NEVER
// over-goal. Most of the time the right answer is "no cluster". Domain-agnostic.
const CLUSTER_PROMPT = `You spot when several of a person's loose to-do items are really parts of ONE bigger goal, in a calm organiser for someone who is easily overwhelmed.

You are shown a numbered list of tasks that do not belong to any goal yet. Your job is to notice a GENUINE cluster — three or more tasks that clearly work toward the same larger goal — and propose that goal.

Rules, without exception:
- Be CONSERVATIVE. Most of the time there is NO cluster. If you are not clearly confident, return {"title":"","tasks":[]}. A wrong guess is worse than none.
- Only group tasks that genuinely serve one shared goal. Never force unrelated tasks together just to make a group.
- Require at least three tasks. Fewer than three clearly-related tasks → no suggestion.
- Propose a short, plain goal title (a few words, not a sentence). Fix spelling silently.
- "tasks" is the list of NUMBERS (exactly as shown) of the tasks that belong to the proposed goal.
- Propose at most one goal — the single clearest cluster. Return only the structured result.

Example — given:
1. Email Vanke HR
2. Buy milk
3. Update my CV
4. Practice interview answers
5. Call the plumber
you return:
{"title":"Find a new job","tasks":[1,3,4]}

Example — given unrelated errands with no common goal, you return:
{"title":"","tasks":[]}`;

// Record-log understanding (§10 + the core pillar): one messy note → clean
// records. GENERIC: every word of vocabulary — the IDs, the kinds, each kind's
// detail fields — arrives with the request as data; nothing here knows what the
// log is about. The worked example uses neutral placeholders on purpose.
const RECORD_PROMPT = `You are the "understanding" engine inside a calm personal organiser's record log, built for someone with dyslexia and dyscalculia. The log keeps short dated records ABOUT entries on a list of IDs, each record of one KIND from a given list; a kind may have a few optional DETAIL FIELDS. The lists arrive with every request.

Your job: read one messy, possibly misspelled note — it may contain SEVERAL separate records — and return clean records.

Follow these rules without exception:
- Spelling never matters. Silently fix all typos. Never comment on them.
- Split the note into separate records when it covers different IDs or clearly different happenings.
- "who": EXACTLY one ID copied from the provided list. Match generously ("p2", "P02", "number 2" all mean "P02" when the list has P02). If no ID from the list is implied, use "" — NEVER invent an ID.
- "type": the best-fitting kind from the provided list.
- "summary": ONE short, clean line saying what happened, in plain words.
- "details": only field names listed for the chosen kind, and ONLY when the note actually states that information — [{"field":"...","value":"..."}]. Most details stay empty; never pad, never guess.
- "tags": 0-3 short lower-case category labels, only when obvious. A tag is a category, never a judgment.
- "follow_up": true ONLY when something needs doing or chasing later ("chase", "follow up", "check in", "send", "ask", "remind"). Logging alone is false.
- "follow_up_date": when follow_up is true and a day is stated or clearly implied, the real date in YYYY-MM-DD (resolve "friday", "tomorrow" from the today you are given). Otherwise "".
- "topic": a list of trackable skills/standards may be provided. Set "topic" to the EXACT entry the note is clearly evidence about — matched generously by its code or words ("RL.3.2", "central message"). If none clearly fits, or no list is given, use "". Never invent one.
- "level": a list of judgement levels may be provided (strongest first). Set "level" ONLY when the note states a judgement ("2/4", "below expected", "got it easily", "secure") — map it to the closest provided level. No judgement stated, or no list given → "". Never invent a judgement of your own.
- Never ask the user anything. Return only the structured result.

Example — IDs: P01, P02 · kinds: visit (details: outcome, next step), check (details: result) · skills: pressure test, safety cert · levels: good, fair, poor. Today is Wednesday 2026-06-10, and the note is:
"p2 visit went ok boiler stil noisy, pressure test came out fair, chase the parts quote friday. p1 check fine"
you return:
{"records":[
  {"who":"P02","type":"visit","summary":"Visit went OK — boiler still noisy","details":[{"field":"outcome","value":"OK, boiler still noisy"},{"field":"next step","value":"chase the parts quote"}],"tags":[],"follow_up":true,"follow_up_date":"2026-06-12","topic":"pressure test","level":"fair"},
  {"who":"P01","type":"check","summary":"Check was fine","details":[{"field":"result","value":"fine"}],"tags":[],"follow_up":false,"follow_up_date":"","topic":"","level":""}
]}`;

function recordTurn(nowLabel, today, text, whoIds, types, fieldsMap, topics, levels) {
  const kinds = types
    .map((t) => {
      const f = fieldsMap[t] || [];
      return f.length ? `${t} (details: ${f.join(", ")})` : t;
    })
    .join(" · ");
  let s =
    `Right now it is ${nowLabel} (today's date is ${today}).\n\n` +
    `IDs: ${whoIds.join(", ")}\nKinds: ${kinds}`;
  if (topics.length) s += `\nSkills/standards: ${topics.join(" · ")}`;
  if (levels.length) s += `\nLevels (strongest first): ${levels.join(", ")}`;
  return s + `\n\nSort this note into records:\n"""\n${text}\n"""`;
}

function buildRecordSchema(whoIds, types, topics, levels) {
  return {
    type: "object",
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          properties: {
            who: { type: "string", enum: whoIds.concat([""]) },
            type: { type: "string", enum: types },
            summary: { type: "string" },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: { field: { type: "string" }, value: { type: "string" } },
                required: ["field", "value"],
                additionalProperties: false,
              },
            },
            tags: { type: "array", items: { type: "string" } },
            follow_up: { type: "boolean" },
            follow_up_date: { type: "string" },
            topic: { type: "string", enum: topics.concat([""]) },
            level: { type: "string", enum: levels.concat([""]) },
          },
          required: ["who", "type", "summary", "details", "tags", "follow_up", "follow_up_date", "topic", "level"],
          additionalProperties: false,
        },
      },
    },
    required: ["records"],
    additionalProperties: false,
  };
}

function weekdayName(iso) {
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
      weekday: "long",
      timeZone: "UTC",
    });
  } catch {
    return "";
  }
}

// Which AI engine to use, read from .env. Returns null when AI is switched off
// (the app then works by hand). The engine is a SWAPPABLE box: the rest of the
// app just asks it to turn a messy line into clean items and never cares which
// engine answers — a local model (Ollama / LM Studio), a free cloud tier, or
// Anthropic.
function aiConfig() {
  const engine = (process.env.AI_ENGINE || "").toLowerCase().trim();
  if (engine === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? { engine: "anthropic", model: process.env.AI_MODEL || MODEL } : null;
  }
  if (engine === "ollama") {
    return {
      engine: "ollama",
      baseUrl: process.env.AI_BASE_URL || "http://localhost:11434",
      model: process.env.AI_MODEL || "qwen3:14b",
      // How long Ollama keeps the model loaded in memory after a request. The
      // first sort of the day pays a cold-start; keeping it warm makes every
      // sort after that feel instant. "30m" by default, "-1" to never unload.
      keepAlive: process.env.AI_KEEP_ALIVE || "30m",
    };
  }
  if (["local", "lmstudio", "openai", "openai-compatible"].includes(engine)) {
    return {
      engine: "openai",
      baseUrl: process.env.AI_BASE_URL || "http://localhost:1234/v1",
      model: process.env.AI_MODEL || "local-model",
      apiKey: process.env.AI_API_KEY || "",
    };
  }
  // Back-compat: a bare Anthropic key (no AI_ENGINE) still turns AI on.
  if (process.env.ANTHROPIC_API_KEY) return { engine: "anthropic", model: process.env.AI_MODEL || MODEL };
  return null;
}

// Prompt rule 1 (§0.3): the model has no clock and no memory, so every request
// states the date and time. Rule 2 (fixed JSON shape) and rule 3 (no
// think-aloud) are handled per engine below.

// Build the user turn for a goal breakdown, with a learned granularity nudge
// (§9: the AI learns the user's preferred milestone size from how they edit).
function breakdownTurn(title, priorCounts) {
  const counts = Array.isArray(priorCounts) ? priorCounts.filter((n) => Number.isFinite(n) && n > 0) : [];
  let hint = "";
  if (counts.length >= 2) {
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg >= 5) hint = "\n\nThis user tends to keep MANY small milestones — lean smaller and split a little more than usual.";
    else if (avg <= 2.5) hint = "\n\nThis user tends to keep FEWER, larger milestones — lean a little bigger than usual.";
  }
  return `Break this goal into small milestones.\n\nGoal:\n"""\n${title}\n"""${hint}`;
}

// Build the user turn for cluster detection: a numbered list of the loose tasks.
function clusterTurn(tasks) {
  const list = tasks.map((t, i) => `${i + 1}. ${String(t.title).trim()}`).join("\n");
  return `Here are some loose tasks that aren't part of any goal yet:\n${list}\n\nIf — and only if — at least three of them are clearly parts of one bigger goal, propose that goal. Otherwise return an empty title and no tasks.`;
}

// Some local models "think out loud" in <think>…</think> before answering.
// Strip that so only the answer remains (prompt rule 3, belt-and-braces).
function stripThink(s) {
  return String(s || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

// Pull JSON out of a model reply even if it's wrapped in prose or ``` fences.
function extractJson(text) {
  let t = stripThink(text);
  if (!t) throw new Error("empty reply");
  t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("no JSON in reply");
  }
}

// The AI box is asked for ONE thing: turn a system+user prompt into a JSON
// object matching a given schema. Both jobs — sorting a dump (§2) and breaking a
// goal into milestones (§9) — go through the same swappable engines below; only
// the prompt and schema differ. Each caller returns the parsed object.

// Engine: Ollama on this machine (the chosen setup). Its native /api/chat lets
// us turn thinking OFF cleanly and ask for a fixed JSON shape. Built-in fetch
// only — nothing leaves the machine.
async function callOllama(cfg, system, user, schema) {
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/api/chat";
  const headers = { "Content-Type": "application/json" };
  const base = {
    model: cfg.model,
    stream: false,
    // Keep the model resident between calls so only the first one pays cold-start.
    keep_alive: cfg.keepAlive,
    options: { temperature: 0.2 },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  // Strongest first (schema-constrained + thinking off), then degrade for older
  // Ollama versions that lack one of those knobs.
  const variants = [
    { ...base, think: false, format: schema },
    { ...base, think: false, format: "json" },
    { ...base, format: "json" },
  ];
  let resp = null;
  for (const body of variants) {
    resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (resp.ok) break;
  }
  if (!resp || !resp.ok) {
    const detail = resp ? await resp.text().catch(() => "") : "";
    throw new Error(`Ollama responded ${resp ? resp.status : "?"} ${detail.slice(0, 150)}`);
  }
  const data = await resp.json();
  return extractJson(data?.message?.content ?? "");
}

// Engine: any OpenAI-compatible server (LM Studio, a free cloud tier, or
// Ollama's /v1 socket). Kept so the box stays swappable.
async function callOpenAI(cfg, system, user, schema) {
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
  const base = {
    model: cfg.model,
    temperature: 0.2,
    max_tokens: 1000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  let resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...base,
      response_format: { type: "json_schema", json_schema: { name: "structured_output", strict: true, schema } },
    }),
  });
  if (resp.status === 400) {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...base, response_format: { type: "json_object" } }),
    });
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`AI server responded ${resp.status} ${detail.slice(0, 150)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  return extractJson(content);
}

// Engine: Anthropic cloud (uses the official SDK, loaded only if needed).
async function callAnthropic(cfg, system, user, schema) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    const err = new Error("AI sorting via Anthropic needs a one-time setup (npm install).");
    err.friendly = err.message;
    throw err;
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: cfg.model,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("No content returned from the model.");
  return JSON.parse(block.text);
}

// Dispatch to whichever engine is configured. The rest of the app never cares.
// A local model that isn't running is the single most likely reason sorting
// stops working, and it used to surface as "I can't reach the app" — which
// points at the wrong thing entirely. The app was fine; Ollama was off. So:
// name the real cause, and say what to do about it.
function offlineReason(cfg, e) {
  const m = (e && e.message) || "";
  const looksOffline = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|timed? out/i.test(m);
  if (!looksOffline || !cfg || !cfg.baseUrl) return "";
  const name = cfg.engine === "ollama" ? "Ollama" : "your local AI";
  return `${name} isn't answering at ${cfg.baseUrl} — is it running?`;
}

// Ask the engine whether it's actually there. Cached briefly: every page load
// hits /api/health, and this must not become a per-page round trip.
let liveCache = { at: 0, ok: false, note: "" };
async function engineLive(cfg) {
  if (!cfg) return { ok: false, note: "AI sorting isn't switched on." };
  if (cfg.engine === "anthropic") return { ok: true, note: "" }; // a key is all there is to check
  if (Date.now() - liveCache.at < 10000) return { ok: liveCache.ok, note: liveCache.note };
  let out = { ok: false, note: "" };
  try {
    const ctl = new AbortController();
    const bail = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch(cfg.baseUrl.replace(/\/+$/, "") + (cfg.engine === "ollama" ? "/api/tags" : "/models"), {
      signal: ctl.signal,
    });
    clearTimeout(bail);
    if (!r.ok) throw new Error("status " + r.status);
    // It answered — but the model it's meant to use may not be pulled, which
    // fails later with a message nobody would connect back to here.
    if (cfg.engine === "ollama") {
      const d = await r.json().catch(() => ({}));
      const names = (d.models || []).map((m) => String(m.name || m.model || ""));
      const base = (n) => n.split(":")[0];
      // STOP INFERRING FROM THE LIST — ASK ABOUT THE MODEL.
      //
      // This read "if there are names and none of them match, complain", which
      // has a hole in the exact shape of somebody's first day: Ollama installed,
      // NOTHING pulled, tags list empty, condition false, "answering". The app
      // said the sorting was on, the diagnostic report said "answering", and
      // every sort went quietly through the fallback patterns instead. Weeks of
      // "why does it read things so badly" with the one fact that explains it
      // being reported the wrong way round.
      //
      // Guarding the other way was no better: an engine that reports no tags but
      // does have the model would have had its sorting switched off for it.
      //
      // Both of those are guesses about a LIST. There is no need for either —
      // /api/show answers the actual question about the actual model, and costs
      // one cheap request only when the fast path hasn't already said yes.
      if (names.some((n) => n === cfg.model || base(n) === base(cfg.model))) {
        out = { ok: true, note: "" };
      } else {
        let there = false;
        try {
          const s = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/api/show", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: cfg.model, model: cfg.model }),
            signal: AbortSignal.timeout(2000),
          });
          there = s.ok;
        } catch {
          /* it didn't answer about the model, which is not a yes */
        }
        out = there
          ? { ok: true, note: "" }
          : {
              ok: false,
              note: names.length
                ? `Ollama is running, but "${cfg.model}" isn't pulled. Run: ollama pull ${cfg.model}`
                : `Ollama is running, but no models are installed yet. Run: ollama pull ${cfg.model}`,
            };
      }
    } else out = { ok: true, note: "" };
  } catch (e) {
    out = { ok: false, note: offlineReason(cfg, e) || "The local AI isn't answering just now." };
  }
  liveCache = { at: Date.now(), ...out };
  return out;
}

// ---- THE FLIGHT RECORDER --------------------------------------------------
//
// A rolling log of what HAPPENED, kept so a problem can be described to someone
// who wasn't there. It is content-free BY CONSTRUCTION, and that is not a
// promise in a comment — it is the shape of the data. Every entry is a kind, a
// duration, and a short code. There is no field a task title, a student's name
// or a line you wrote could travel in, so none can leak into a message you paste
// somewhere.
//
// Error text is the one risk, because a model or a filesystem will happily echo
// your words back inside an error. So errors are reduced to a CLASS before they
// are written down, never stored raw.
const APP_VERSION = "0.2.0";
const LOG_FILE = path.join(DATA_DIR, "events.jsonl");
const LOG_KEEP = 400;

function errorClass(e) {
  const m = ((e && e.message) || String(e || "")).toLowerCase();
  if (/fetch failed|econnrefused|enotfound|eai_again/.test(m)) return "engine-unreachable";
  if (/abort|timed? ?out|etimedout/.test(m)) return "timeout";
  if (/socket hang up|econnreset|epipe/.test(m)) return "connection-dropped";
  if (/json|unexpected token|schema|parse/.test(m)) return "bad-answer-shape";
  if (/enospc/.test(m)) return "disk-full";
  if (/eacces|eperm/.test(m)) return "permission-denied";
  if (/enoent/.test(m)) return "file-missing";
  if (/conflict/.test(m)) return "shared-folder-conflict";
  if (/call_cap/.test(m)) return "hit-the-call-ceiling";
  const status = /\b(4\d\d|5\d\d)\b/.exec(m);
  if (status) return "engine-said-" + status[1];
  return "other";
}

// ---- DID THE ANSWER TURN OUT TO BE ANY GOOD? ------------------------------
//
// Timings only say whether the call worked. A sort that confidently files a
// task against the wrong person is a SUCCESS by that measure — which makes the
// app's most important failure mode invisible.
//
// The truest signal available is what you CHANGE before accepting: if the date
// gets corrected on half the sorts, the date extraction is bad, and no amount
// of timing data would ever say so. That signal is completely content-free —
// "the date was corrected" carries no date.
//
// AND IT IS ENFORCED BY AN ALLOWLIST, NOT BY GOOD INTENTIONS. The endpoint
// accepts only these exact strings. A future bug that tried to send a task
// title through here could not: there is no shape for it to arrive in.
const EVENT_WHAT = ["corrected", "dropped", "cancelled", "accepted", "name-question", "record-confirmed"];
const EVENT_FIELDS = [
  "title", "date", "time", "importance", "effort", "tags", "deadline",
  "promisedTo", "waitingOn", "goal", "standard", "who", "level", "topic",
  "kind", "summary", "person", "direction", "none",
];
const EVENT_VALUES = ["task", "record", "goal", "handover", "matched", "nearly", "new", "accepted", "rejected", "added"];

function handleEvent(res, body) {
  const what = String(body?.what || "");
  if (!EVENT_WHAT.includes(what)) return sendJson(res, 400, { error: "unknown_kind" });
  const row = { what };
  const field = String(body?.field || "");
  if (field && EVENT_FIELDS.includes(field)) row.field = field;
  const value = String(body?.value || "");
  if (value && EVENT_VALUES.includes(value)) row.value = value;
  const n = Number(body?.n);
  if (Number.isFinite(n) && n >= 0 && n < 1000) row.n = Math.round(n);
  logEvent("use", row); // anything not on the lists above simply never arrives
  return sendJson(res, 200, { ok: true });
}

function logEvent(kind, fields) {
  try {
    ensureDirs();
    const row = { at: new Date().toISOString(), kind, ...(fields || {}) };
    fs.appendFileSync(LOG_FILE, JSON.stringify(row) + "\n");
    // Keep it small and bounded — this is a diary, not an archive.
    const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
    if (lines.length > LOG_KEEP * 1.5) fs.writeFileSync(LOG_FILE, lines.slice(-LOG_KEEP).join("\n") + "\n");
  } catch {
    /* the log must never be the thing that breaks the app */
  }
}
function readEvents() {
  try {
    return fs
      .readFileSync(LOG_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Every model call is timed and its outcome recorded — no prompt, no answer,
// just "which job, how long, did it work". That is the single most useful thing
// for working out whether a setup is healthy or the model is struggling.
async function runEngine(cfg, system, user, schema, label) {
  const t0 = Date.now();
  try {
    const out =
      cfg.engine === "anthropic"
        ? await callAnthropic(cfg, system, user, schema)
        : cfg.engine === "ollama"
          ? await callOllama(cfg, system, user, schema)
          : await callOpenAI(cfg, system, user, schema);
    logEvent("ai", { job: label || "sort", ms: Date.now() - t0, ok: true });
    return out;
  } catch (e) {
    logEvent("ai", { job: label || "sort", ms: Date.now() - t0, ok: false, why: errorClass(e) });
    throw e;
  }
}

// Map the AI's free-text "goal" (a copied title) to a real goal id — but only on
// an EXACT title match against the goals the client sent (§9: confident-only
// auto-linking). Anything else becomes no link, so a hallucinated title can't
// mis-file a task. The transient "goal" field is dropped; the item carries goalId.
function linkGoal(it, goals) {
  const wanted = (it && typeof it.goal === "string" ? it.goal : "").trim().toLowerCase();
  let goalId = "";
  if (wanted) {
    const match = goals.find(
      (g) => g && typeof g.title === "string" && g.title.trim().toLowerCase() === wanted && g.id
    );
    if (match) goalId = String(match.id);
  }
  const out = { ...it, goalId };
  delete out.goal;
  return out;
}

// Tidy AI-proposed milestones: trim, drop blanks, cap counts (defensive — the
// schema asks for a few small ones, but never trust the model to obey exactly).
function normaliseMilestones(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((m) => ({
      title: (m && m.title ? String(m.title) : "").trim(),
      steps: (Array.isArray(m && m.steps) ? m.steps : [])
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 6),
    }))
    .filter((m) => m.title)
    .slice(0, 6);
}

async function handleBreakdown(res, body) {
  const title = (body?.title || "").toString().trim();
  if (!title) return sendJson(res, 400, { error: "empty", message: "There was no goal to break down." });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI breakdown isn't switched on yet." });

  try {
    const parsed = await runEngine(cfg, BREAKDOWN_PROMPT, breakdownTurn(title, body?.priorCounts), BREAKDOWN_SCHEMA, "goal-breakdown");
    sendJson(res, 200, { milestones: normaliseMilestones(parsed.milestones) });
  } catch (e) {
    console.error("[breakdown] failed:", e?.message || e);
    sendJson(res, 502, { error: "breakdown_failed", message: "I couldn't break that goal down just now." });
  }
}

// Cluster detection (§9 slice 2c): given the user's goal-less tasks, the AI may
// gently spot one real cluster and propose making it a goal. Conservative and
// non-essential — any failure or thin result returns { suggestion: null } with a
// 200, so a missing suggestion never disrupts the page (it's a nudge, not an
// action the user asked for).
async function handleCluster(res, body) {
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks.filter((t) => t && t.id != null && t.title).slice(0, 60)
    : [];
  if (tasks.length < 3) return sendJson(res, 200, { suggestion: null });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI isn't switched on yet." });

  try {
    const parsed = await runEngine(cfg, CLUSTER_PROMPT, clusterTurn(tasks), CLUSTER_SCHEMA, "goal-cluster");
    const title = (parsed && parsed.title ? String(parsed.title) : "").trim();
    const idxs = Array.isArray(parsed && parsed.tasks) ? parsed.tasks : [];
    const ids = [];
    idxs.forEach((n) => {
      const i = Math.floor(Number(n)) - 1; // the model uses 1-based numbers
      if (i >= 0 && i < tasks.length) {
        const id = String(tasks[i].id);
        if (!ids.includes(id)) ids.push(id);
      }
    });
    // Only surface a real cluster: a title AND at least three distinct tasks.
    if (!title || ids.length < 3) return sendJson(res, 200, { suggestion: null });
    sendJson(res, 200, { suggestion: { title, taskIds: ids } });
  } catch (e) {
    console.error("[cluster] failed:", e?.message || e);
    sendJson(res, 200, { suggestion: null });
  }
}

// Record-log understanding: messy note → clean records, using ONLY the
// vocabulary the client sent (IDs, kinds, per-kind fields — all data). The
// client shows the result for a glance-and-tap before anything is filed.
async function handleRecordUnderstand(res, body) {
  const text = (body?.text || "").toString().trim();
  if (!text) return sendJson(res, 400, { error: "empty", message: "There was nothing to sort." });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  const clean = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 100) : []);
  const whoIds = clean(body?.config?.whoIds);
  const types = clean(body?.config?.types);
  if (!whoIds.length || !types.length)
    return sendJson(res, 400, { error: "no_vocab", message: "The log's lists are missing." });
  const fieldsMap = {};
  if (body?.config?.fields && typeof body.config.fields === "object") {
    Object.keys(body.config.fields).forEach((k) => {
      const l = clean(body.config.fields[k]);
      if (l.length) fieldsMap[k] = l;
    });
  }
  const topics = clean(body?.config?.topics).slice(0, 300);
  const levels = topics.length ? clean(body?.config?.levels).slice(0, 10) : [];

  const today = ISO.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
  const nowLabel = typeof body?.now === "string" && body.now.trim() ? body.now.trim() : `${weekdayName(today)}, ${today}`;

  try {
    const parsed = await runEngine(
      cfg,
      RECORD_PROMPT,
      recordTurn(nowLabel, today, text, whoIds, types, fieldsMap, topics, levels),
      buildRecordSchema(whoIds, types, topics, levels)
    );
    const records = (Array.isArray(parsed.records) ? parsed.records : [])
      .map((r) => {
        const type = types.includes(r.type) ? r.type : types[0];
        const allowed = fieldsMap[type] || [];
        const details = {};
        (Array.isArray(r.details) ? r.details : []).forEach((d) => {
          const name = (d && d.field ? String(d.field) : "").trim();
          const value = (d && d.value ? String(d.value) : "").trim();
          if (!name || !value) return;
          // match the kind's configured field names loosely, store under the exact name
          const exact = allowed.find((f) => f.toLowerCase() === name.toLowerCase());
          if (exact) details[exact] = value.slice(0, 300);
        });
        return {
          who: whoIds.includes(r.who) ? r.who : "",
          type,
          summary: (r.summary || "").toString().trim().slice(0, 200),
          details,
          tags: (Array.isArray(r.tags) ? r.tags : [])
            .map((t) => String(t).trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 4),
          follow_up: r.follow_up === true,
          follow_up_date: ISO.test(r.follow_up_date) ? r.follow_up_date : "",
          topic: topics.includes(r.topic) ? r.topic : "",
          level: levels.includes(r.level) ? r.level : "",
        };
      })
      .filter((r) => r.summary);
    sendJson(res, 200, { records });
  } catch (e) {
    console.error("[record-understand] failed:", e?.message || e);
    sendJson(res, 502, { error: "sort_failed", message: "I couldn't sort that note just now." });
  }
}

// Universal router (the core pillar, at the app level): one messy note, split
// into ENTRIES, each classified as a task, a record about one of the IDs, or a
// goal — and extracted accordingly, in ONE call. All vocabulary (goals, IDs,
// note kinds, skills, levels) arrives with the request; the code stays generic.
const ROUTE_PROMPT = `You are the router inside a calm personal organiser. You read one messy, possibly misspelled note — which may hold SEVERAL different things — and split it into clean ENTRIES. For each entry you decide ONE "kind" and fill only that kind's fields (leave the rest empty/false).

The four kinds:
- "task": something the user must DO, or an appointment/reminder/note FOR THEMSELVES ("call the dentist tuesday", "mum's birthday friday", "idea: try a cold open").
- "record": an observation ABOUT one of the IDs listed below — only when a list of IDs is given AND the note is clearly about one of them ("S03 struggled with full stops", "called Leo's mum"). If no IDs are listed, never use this kind.
- "goal": a longer-term aim the user wants to work towards over time, that would be carved into milestones ("get fit", "learn the guitar", "get a new job"). Not a one-off task.
- "handover": a piece of WORK moving between the user and a named person — only when the words plainly say so ("Sarah passed me the display board", "handed the trip forms to Tom", "Priya's covering my Tuesday"). Set person (their name as written), direction ("to_me" when the work lands on the user, "from_me" when the user hands it off), and note (the work, in a few words). Merely mentioning someone is NOT a handover; asking the user to do something is a task, not a handover, unless the words say it was passed/handed/given over.

Rules:
- Spelling never matters; fix it silently. Split different things into separate entries. Make a sensible call and never ask.
- Most notes are a single task. Only use "record" for a clear observation about a listed ID; only use "goal" for a genuine long-term aim.

PASTED CONVERSATIONS: the note may be a copied chat rather than the user's own words — lines like "Anna: ...", "[10:32] Mr Li: ...", or alternating messages, possibly in another language. When it looks like a conversation:
- Read it as messages between the USER and other people, and extract ONLY what the user must do, chase, or remember. Never turn the other person's own to-do into a task for the user.
- If someone ASKS the user for something ("could you send the report by Friday?"), that is a task for the user with promised_to set to that person's name.
- If the USER commits to something ("I'll get it to you Friday"), that is also a task with promised_to set to the person they told.
- WAITING ON SOMEONE ELSE is different from both. The user has DONE their part and the next move is someone else's: "sent it over, waiting to hear back", "asked the plumber to quote, nothing yet", "the landlord still hasn't confirmed", "chased the supplier about the invoice", "she said she'd let me know". Set waiting_on to whoever is being waited on — a person, a company, an office, whatever the user named — and leave promised_to empty. The ball is in their court, not the user's.
- Ignore greetings, thanks, small talk, and anything already settled or already done.
- If a message shows its own date/time, resolve "Friday"/"tomorrow" against THAT message's date; otherwise use the today you are given.
- Write every title and summary in ENGLISH even when the conversation is in another language — translate the essential action; the user reads their list in English. Keep a person's name as written.
- If nothing in the conversation needs the user to act or remember, return no entries at all.

For a "task" entry set: title (short, verb-first for to-dos), item_type (task | appointment | reminder | note), date (YYYY-MM-DD or "" — resolve "tuesday"/"tomorrow" from the given today), time ("HH:MM" or ""), deadline ("hard" for a real deadline with consequences, else "soft"), importance ("high"/"normal"/"low"), effort ("quick"/"medium"/"draining"), tags (0-3 lowercase categories), when_text (the user's own time phrase, or ""), goal_link (the EXACT title of one listed goal it clearly belongs to, else ""), open_loop (true only if already started/prepped but not sent/finished), promised_to (a person's name it's committed to, else ""), waiting_on (a person's name the user is waiting to hear back from, else ""), standard (the EXACT code of one listed standard the task EXPLICITLY names, e.g. "TS4" in "prep TS4 display" — else ""; never guess a standard from the topic).

For a "record" entry set: who (EXACTLY one ID from the list, or "" if unsure — never invent one), note_type (the best-fitting kind from the list), summary (one clean line), topic (an EXACT skill from the list if it's clearly evidence of one, else ""), level (an EXACT level from the list only if a judgement is stated, else ""), tags, follow_up (true if it needs chasing later), follow_up_date (YYYY-MM-DD when implied, else "").

For a "goal" entry set: title (a few plain words).

For a "handover" entry set: person, direction, note (leave the task/record fields empty).

Return only the structured result.

Example — today is Monday 2026-09-07; IDs: S01, S02, S03; kinds: assessment, parent; goals: Learn guitar; standards: TS4, TS7. Note:
"s3 realy struggled with full stops in writing, chase his mum friday. also book the dentist for tuesday, prep the TS4 display, and i want to get fit"
you return:
{"entries":[
  {"kind":"record","who":"S03","note_type":"assessment","summary":"Struggled with full stops in writing","topic":"","level":"","tags":["writing"],"follow_up":false,"follow_up_date":"","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","standard":"","person":"","direction":"","note":""},
  {"kind":"record","who":"S03","note_type":"parent","summary":"Chase mum about full stops","topic":"","level":"","tags":[],"follow_up":true,"follow_up_date":"2026-09-11","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","standard":"","person":"","direction":"","note":""},
  {"kind":"task","title":"Book the dentist","item_type":"task","date":"2026-09-08","time":"","deadline":"soft","importance":"normal","effort":"quick","tags":["health"],"when_text":"Tuesday","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""},
  {"kind":"task","title":"Prep the display","item_type":"task","date":"","time":"","deadline":"soft","importance":"normal","effort":"medium","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"TS4","person":"","direction":"","note":""},
  {"kind":"goal","title":"Get fit","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""}
]}

Example of a PASTED CONVERSATION — today is Monday 2026-09-07; IDs: S01, S02, S03; kinds: assessment, parent. Note:
"[Mon 09:14] Wang Li (S02's mum): Hello teacher! Thank you for yesterday.
[Mon 09:15] Wang Li: Could you send the reading list before Friday? Also XiaoMing was upset about the seating change.
[Mon 09:20] Me: Of course, I'll email it Thursday. I'll keep an eye on him."
you return:
{"entries":[
  {"kind":"task","title":"Email the reading list to Wang Li","item_type":"task","date":"2026-09-10","time":"","deadline":"hard","importance":"normal","effort":"quick","tags":[],"when_text":"Thursday","goal_link":"","open_loop":false,"promised_to":"Wang Li","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""},
  {"kind":"record","who":"S02","note_type":"parent","summary":"Mum says he was upset about the seating change","topic":"","level":"","tags":["pastoral"],"follow_up":true,"follow_up_date":"2026-09-08","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","standard":"","person":"","direction":"","note":""}
]}
(The greeting and the thanks produced nothing; the mother's own words became a record about her child, and the two things the user committed to became one dated task promised to her.)

Example of a HANDOVER — "sarah's passed me the year 4 display board, and i gave the trip forms to tom" becomes:
{"entries":[
  {"kind":"handover","person":"Sarah","direction":"to_me","note":"Year 4 display board","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":""},
  {"kind":"handover","person":"Tom","direction":"from_me","note":"Trip forms","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","waiting_on":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":""}
]}`;

const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["task", "record", "goal", "handover"] },
          title: { type: "string" },
          item_type: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          deadline: { type: "string" },
          importance: { type: "string" },
          effort: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          when_text: { type: "string" },
          goal_link: { type: "string" },
          open_loop: { type: "boolean" },
          promised_to: { type: "string" },
          waiting_on: { type: "string" },
          who: { type: "string" },
          note_type: { type: "string" },
          summary: { type: "string" },
          topic: { type: "string" },
          level: { type: "string" },
          follow_up: { type: "boolean" },
          follow_up_date: { type: "string" },
          standard: { type: "string" },
          person: { type: "string" },
          direction: { type: "string" },
          note: { type: "string" },
        },
        required: [
          "kind", "title", "item_type", "date", "time", "deadline", "importance", "effort", "tags",
          "when_text", "goal_link", "open_loop", "promised_to", "waiting_on", "who", "note_type", "summary",
          "topic", "level", "follow_up", "follow_up_date", "standard", "person", "direction", "note",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["entries"],
  additionalProperties: false,
};

function routeTurn(nowLabel, today, text, goals, whoIds, types, topics, levels, standardCodes) {
  let s = `Right now it is ${nowLabel} (today's date is ${today}).`;
  const gTitles = (Array.isArray(goals) ? goals : []).map((g) => (g && g.title ? String(g.title).trim() : "")).filter(Boolean);
  if (gTitles.length) s += `\n\nMy goals (a task can belong to one; "get better at" phrasing may itself be a goal):\n- ${gTitles.join("\n- ")}`;
  if (whoIds.length) {
    s += `\n\nIDs a record can be about: ${whoIds.join(", ")}\nNote kinds: ${types.join(", ")}`;
    if (topics.length) s += `\nSkills: ${topics.join(" · ")}`;
    if (levels.length) s += `\nLevels: ${levels.join(", ")}`;
  } else {
    s += `\n\n(No IDs configured, so nothing is a "record" — only tasks and goals.)`;
  }
  if (standardCodes.length) s += `\n\nStandards (set a task's "standard" only if it NAMES one of these codes): ${standardCodes.join(", ")}`;
  return s + `\n\nSort this note into entries:\n"""\n${text}\n"""`;
}

// ---- the timetable, read once a term -------------------------------------
// This is the rare, valuable, human-checked job the local model is genuinely
// good for: a wall of pasted text into a clean list of blocks, shown as an
// editable table BEFORE anything is saved. It is allowed to be slow and it is
// allowed to be wrong, because a person reads every row afterwards.
//
// It stays domain-neutral: the model is told to copy the labels it is given,
// never to interpret them. "Period 3" and "Shift B" get identical treatment.
const TIMETABLE_PROMPT = `You read one pasted timetable and turn it into a plain list of time blocks. Nothing else.

A block has: label, start time, end time, and the weekdays it repeats on.

RULES
- COPY the label exactly as written. Do not tidy, translate, expand or interpret it. If a row says "P3 Mth/7B", the label is "P3 Mth/7B".
- Times are 24-hour "HH:MM". Convert "9am" to "09:00", "1.15pm" to "13:15".
- "days" lists weekday numbers: 0=Sunday, 1=Monday … 6=Saturday.
- A block on every weekday is [1,2,3,4,5]. A block on one day is that one day.
- If a row has no end time, make the end 60 minutes after the start.
- Include breaks, lunch and free periods if they are written down — they are blocks like any other.
- If a row is not a time block (a title, a note, a page number), leave it out.
- Never invent a block that is not in the text. An empty list is a fine answer.

Return only the JSON object.`;

const TIMETABLE_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          days: { type: "array", items: { type: "integer" } },
        },
        required: ["label", "start", "end", "days"],
        additionalProperties: false,
      },
    },
  },
  required: ["blocks"],
  additionalProperties: false,
};

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
function tidyHM(v) {
  const m = HHMM.exec((v || "").toString().trim());
  if (!m) return "";
  return String(m[1]).padStart(2, "0") + ":" + m[2];
}

async function handleTimetable(res, body) {
  const text = (body?.text || "").toString().trim();
  if (!text) return sendJson(res, 400, { error: "empty", message: "There was nothing to read." });
  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });
  // A FLATTENED GRID IS A DIFFERENT JOB, AND SAYING SO IS FREE.
  //
  // The plain reader gives up on a timetable whose columns are gone — one long
  // list, no way to tell Monday's lessons from Tuesday's — and that is exactly
  // where a model earns its place: five subjects after five day names is a
  // thing a reader can line up and arithmetic cannot. But only if it knows
  // that is what it is looking at. Handed the same list with no warning it
  // reads it top to bottom as one day.
  const flattened = body?.flattened === true;
  const HINT = "\n\nThis one is a WEEKLY GRID that has been flattened: the day names are in " +
    "it but the columns are gone, so the cells arrive one after another in reading order. " +
    "Work out which lesson falls on which day from that order — a row of lessons after a row " +
    "of day names lines up with them, in order. If you cannot tell for a row, leave it out " +
    "rather than putting it on a day you are not sure of.";
  try {
    const parsed = await runEngine(cfg, TIMETABLE_PROMPT + (flattened ? HINT : ""), `Turn this timetable into blocks:\n"""\n${text.slice(0, 8000)}\n"""`, TIMETABLE_SCHEMA, "timetable");
    const blocks = [];
    // A ROW THAT VANISHED IS INVISIBLE; A ROW MARKED "couldn't read this" IS
    // FIXABLE. Rows that don't validate used to be silently dropped, which is
    // the one failure the human gate can't catch — you can only check a table
    // for what's wrong, never for what isn't there. Now they come back too,
    // named, so the missing row is in front of you.
    const unreadable = [];
    (Array.isArray(parsed.blocks) ? parsed.blocks : []).slice(0, 200).forEach((b) => {
      const label = (b.label || "").toString().trim().slice(0, 80);
      const start = tidyHM(b.start);
      const end = tidyHM(b.end);
      const days = (Array.isArray(b.days) ? b.days : [])
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const why = !label
        ? "no name"
        : !start || !end
          ? "couldn't read the times"
          : end <= start
            ? "ends before it starts"
            : !days.length
              ? "no days"
              : "";
      if (why) {
        unreadable.push({ label: label || "(no name)", start: b.start || "", end: b.end || "", why });
        return;
      }
      blocks.push({ label, start, end, days, soft: false, source: "paste" });
    });
    return sendJson(res, 200, { blocks, unreadable });
  } catch (e) {
    console.warn("[timetable] failed:", e?.message || e);
    const why = offlineReason(cfg, e);
    return sendJson(res, 502, { error: "ai_failed", message: (why ? why + " " : "Couldn't read that just now — ") + "you can still type the blocks in by hand." });
  }
}

// ---- THE PASTE PIPELINE ---------------------------------------------------
// Small jobs instead of one big one (see pipeline.js for why). It is slower and
// costs more model calls, so it does NOT replace the single call for everything:
// short pastes keep the proven one-shot path, long ones — where the silent
// truncation actually bites — go through the pipeline.
//
// PIPELINE_MIN_CHARS is a PROVISIONAL default. It has not been measured against
// a real model; /compare.html exists to measure it, and this number should be
// set from what that shows rather than from anyone's intuition.
const PIPELINE_MIN_CHARS = Math.max(0, Number(process.env.PIPELINE_MIN_CHARS) || 500);
const PIPELINE_MAX_CALLS = Math.max(4, Number(process.env.PIPELINE_MAX_CALLS) || 40);

// Jobs live in memory only. A pipeline run is a few seconds of work, not a
// record — if the server restarts mid-run the paste is still in the box.
const jobs = new Map();
function reapJobs() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, j] of jobs) if (j.at < cutoff) jobs.delete(id);
}

function engineCaller(cfg) {
  return (system, user, schema, label) => runEngine(cfg, system, user, schema, "paste-" + (label || "step"));
}

function pipelineCtx(body) {
  const clean = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const whoIds = clean(body?.config?.whoIds).slice(0, 100);
  const topics = whoIds.length ? clean(body?.config?.topics).slice(0, 300) : [];
  // The label set comes from what this app can actually FILE something into,
  // and the record kinds inside it are the user's own words — no vocabulary
  // list is written into the pipeline itself.
  const kinds = ["task", "goal", "handover"];
  if (whoIds.length) kinds.splice(1, 0, "record");
  return {
    today: ISO.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10),
    me: (body?.me || "").toString().trim().slice(0, 40),
    kinds,
    kindHints:
      `"task" = something for the reader to do.` +
      (whoIds.length ? ` "record" = something that happened involving one of: ${whoIds.slice(0, 40).join(", ")}.` : "") +
      ` "goal" = something the reader wants to get better at over time.` +
      ` "handover" = work being passed between the reader and another person.`,
    whoIds,
    types: clean(body?.config?.types).slice(0, 40),
    topics,
    levels: topics.length ? clean(body?.config?.levels).slice(0, 10) : [],
  };
}

// ---- WHAT'S WRONG: the checks, so nobody has to open a terminal -----------
//
// Everything here was already findable — in a JSON endpoint, a PowerShell
// command, a file path you'd have to know to look for. That is a developer's
// answer to a question anyone can have, and it means the moment something
// breaks you're stuck until someone technical is available.
//
// So the app runs its own checks and writes the answers in plain words, with
// what to do about each one, and a button that copies the lot.
function portOpen(host, port, ms) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(ms);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

// IS IT EVEN INSTALLED? "Start Ollama" is a dead end if there's nothing to
// start, and "it isn't running" and "it isn't here" need completely different
// answers. Checked by looking for the file — no process spawned, no shell.
function findOllama() {
  const win = process.platform === "win32";
  const exe = win ? "ollama.exe" : "ollama";
  const guesses = win
    ? [
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", exe),
        path.join(process.env.PROGRAMFILES || "", "Ollama", exe),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Ollama", exe),
      ]
    : ["/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama", "/Applications/Ollama.app"];
  for (const g of guesses) {
    try {
      if (g && fs.existsSync(g)) return g;
    } catch {
      /* keep looking */
    }
  }
  // Then anywhere on PATH, for a non-standard install.
  const parts = (process.env.PATH || "").split(win ? ";" : ":");
  for (const dir of parts) {
    try {
      if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
    } catch {
      /* keep looking */
    }
  }
  return "";
}

function folderSize(dir) {
  let bytes = 0;
  const walk = (d, depth) => {
    if (depth > 6) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else
        try {
          bytes += fs.statSync(p).size;
        } catch {
          /* skip */
        }
    }
  };
  walk(dir, 0);
  return bytes;
}
function human(bytes) {
  if (bytes < 1024) return bytes + " bytes";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

async function handleDiagnose(res) {
  const checks = [];
  const add = (name, state, detail, fix) => checks.push({ name, state, detail, fix: fix || "" });

  // --- the app itself -----------------------------------------------------
  add("The app", "ok", `Running on Node ${process.version}, ${process.platform}.`);

  // --- your writing -------------------------------------------------------
  let doc = null;
  try {
    doc = readData();
  } catch {
    /* reported below */
  }
  if (!doc) {
    add("Your writing", "problem", `Couldn't read ${DATA_FILE}.`, "There may be a usable copy in the data/backups folder next to it.");
  } else {
    const counts = [
      [doc.items.length, "task"],
      [doc.records.length, "record"],
      [doc.goals.length, "goal"],
      [doc.contacts.length, "person"],
      [doc.schedule.length, "timetable block"],
    ]
      .filter(([n]) => n)
      .map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
    let backups = 0;
    try {
      backups = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).length;
    } catch {
      /* none yet */
    }
    // ONE SENTENCE, ONE STORY. This read "nothing saved yet · last saved
    // 8/23/2026, 3:45:03 AM", which is two answers to the same question sitting
    // next to each other disagreeing. The file HAD been written; it was just
    // empty. Somebody checking whether their work is safe should not have to
    // work out which half to believe, so an empty file says it is empty and
    // stops there.
    const size = `${backups} backup${backups === 1 ? "" : "s"} · ${human(folderSize(DATA_DIR))} in total.`;
    add(
      "Your writing",
      "ok",
      counts.length
        ? `${counts.join(", ")} · last saved ${doc.savedAt ? new Date(doc.savedAt).toLocaleString() : "never"} · ${size}`
        : `Nothing written down yet — the file is here and empty, waiting. · ${size}`
    );
    add("Where it lives", "info", DATA_FILE);
    if (/onedrive|dropbox|google ?drive|icloud/i.test(DATA_FILE)) {
      add(
        "This folder syncs to the cloud",
        "info",
        "Your data folder is inside a syncing folder, so it reaches your other computer by itself — and a copy sits on the provider's servers.",
        "That's fine for ordinary notes. Check your school's data policy before real names or medical details go in."
      );
    }
  }

  // --- can this folder receive updates? -----------------------------------
  // A folder unzipped from GitHub has no .git, so every update means ANOTHER
  // new folder — and the writing stays behind in the old one. Harmless while
  // it's empty; a real way to lose work once it isn't. So the warning grows
  // teeth only when there's something to strand.
  const connected = fs.existsSync(path.join(__dirname, ".git"));
  const hasWriting = !!doc && (doc.items.length || doc.records.length || doc.goals.length || doc.contacts.length);
  if (connected) {
    add("Updates", "ok", "This folder is connected, so updating is just double-clicking Update.");
  } else if (hasWriting) {
    add(
      "Updates",
      "problem",
      "This folder can't receive updates, so the next one would mean downloading a whole new folder — and everything you've written would stay behind in this one.",
      "Double-click “Update” in the app folder and say yes when it offers to connect this folder up. It keeps everything you've written exactly as it is."
    );
  } else {
    add("Updates", "info", "This folder isn't connected for updates yet.", "Double-click “Update” in the app folder to connect it — it takes a moment and only needs doing once.");
  }

  // --- sorting ------------------------------------------------------------
  const cfg = aiConfig();
  if (!cfg) {
    add("Smart sorting", "info", "Not switched on. The app works fully by hand without it.", "To turn it on, copy .env.example to .env in the app folder.");
  } else if (cfg.engine !== "ollama") {
    const live = await engineLive(cfg);
    add("Smart sorting", live.ok ? "ok" : "problem", live.ok ? `Working (${cfg.engine}).` : live.note, "");
  } else {
    const u = new URL(cfg.baseUrl);
    const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
    const open = await portOpen(u.hostname, Number(u.port) || 11434, 1500);
    if (!open) {
      const found = local ? findOllama() : "not-checked";
      if (local && !found) {
        // NOT INSTALLED is a different problem from NOT RUNNING, and telling
        // someone to start a program that isn't there is a dead end.
        add(
          "Smart sorting",
          "problem",
          "Ollama doesn't seem to be on this computer — that's the free program that does the sorting. Without it, messages are saved exactly as you typed them.",
          `Download it from https://ollama.com/download and install it (the defaults are fine). Then open a terminal once and run:  ollama pull ${cfg.model}  — it's a big download, so leave it running. After that, press “Check again”.`
        );
        add(
          "Which model to install",
          "info",
          `The app is set to "${cfg.model}". That one wants a desktop graphics card with plenty of memory.`,
          "On a laptop without a dedicated graphics card, use a smaller one instead: pull qwen3:4b, then change AI_MODEL in the .env file to qwen3:4b. It sorts a little less well and a lot faster."
        );
      } else {
        // Installed (or remote) but nothing listening — on Windows this is
        // nearly always the tray app simply not being started.
        add(
          "Smart sorting",
          "problem",
          `Nothing is answering at ${cfg.baseUrl}, so messages are saved as you typed them instead of being sorted.` +
            (found && found !== "not-checked" ? " Ollama IS installed on this computer, it just isn't running." : ""),
          process.platform === "win32"
            ? "Open the Start menu, type Ollama and run it. Wait for the llama icon to appear near the clock (bottom-right), then press “Check again”. If it was already running, right-click that icon, Quit, and start it once more."
            : "Start Ollama, then press “Check again”."
        );
      }
    } else {
      const live = await engineLive(cfg);
      add(
        "Smart sorting",
        live.ok ? "ok" : "problem",
        live.ok ? `Working — ${cfg.model} at ${cfg.baseUrl}.` : live.note,
        live.ok ? "" : `In a terminal: ollama pull ${cfg.model}`
      );
    }
  }

  // --- reminders and dictation -------------------------------------------
  add(
    "Pop-up reminders",
    "ok",
    process.platform === "win32"
      ? "Windows notifications — they appear while this app's black window is open."
      : "Desktop notifications — they appear while the app is running."
  );
  add("Dictation", "info", sttConfig() ? "On, and staying on this computer." : "Off. There's no cloud dictation in this app on purpose.");

  const stamp = new Date().toLocaleString();
  const copyText =
    `Organiser check — ${stamp}\n` +
    checks.map((c) => `[${c.state}] ${c.name}: ${c.detail}${c.fix ? `\n      fix: ${c.fix}` : ""}`).join("\n");
  return sendJson(res, 200, { checks, copyText, at: stamp });
}

// ---- THE REPORT YOU CAN SEND SOMEONE --------------------------------------
//
// The self-check answers "is it working". This answers the harder question:
// "here is everything about how this is going, so someone can find problems I
// can't see, and tell me what to build next."
//
// THE RULE THAT SHAPES ALL OF IT: not one word you have written appears here.
// No task titles, no student ids, no names, no note text, no file names. Only
// SHAPES — how many, how long, how often, what failed. That isn't a policy
// applied at the end; it's why the flight recorder stores classes rather than
// messages. You can paste this into a message to a stranger and lose nothing.
//
// It is also deliberately a text file rather than JSON: you should be able to
// read every line of it yourself before you send it.
function whichVersion() {
  // Reading .git directly — no process spawned. "Which version are you running"
  // has been the ambiguity behind more than one confusing report.
  try {
    const head = fs.readFileSync(path.join(__dirname, ".git", "HEAD"), "utf8").trim();
    const m = /^ref: (.+)$/.exec(head);
    if (!m) return { branch: "(detached)", commit: head.slice(0, 8) };
    const branch = m[1].replace("refs/heads/", "");
    let commit = "";
    try {
      commit = fs.readFileSync(path.join(__dirname, ".git", m[1]), "utf8").trim().slice(0, 8);
    } catch {
      const packed = fs.readFileSync(path.join(__dirname, ".git", "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(" " + m[1]));
      commit = line ? line.slice(0, 8) : "";
    }
    return { branch, commit };
  } catch {
    return { branch: "(not a git folder — downloaded as a zip)", commit: "" };
  }
}

function bucket(ms) {
  if (ms < 1000) return "under 1s";
  if (ms < 3000) return "1-3s";
  if (ms < 10000) return "3-10s";
  if (ms < 30000) return "10-30s";
  return "over 30s";
}

async function handleReport(res) {
  const L = [];
  const line = (x) => L.push(x === undefined ? "" : x);
  const now = new Date();
  const v = whichVersion();
  const cfg = aiConfig();
  const doc = (() => {
    try {
      return readData();
    } catch {
      return null;
    }
  })();

  line(`ORGANISER REPORT — ${now.toLocaleString()}`);
  line("Counts and timings only. Nothing you have written appears below:");
  line("no task titles, no names, no student ids, no note text, no file names.");
  line();
  line("── VERSION ─────────────────────────────────────────────");
  line(`app        ${APP_VERSION}`);
  line(`branch     ${v.branch}${v.commit ? "  commit " + v.commit : ""}`);
  line(`node       ${process.version} on ${process.platform} (${process.arch})`);
  line(`updates    ${fs.existsSync(path.join(__dirname, ".git")) ? "connected" : "NOT connected — a new download would strand the data"}`);
  line();

  line("── SETUP ───────────────────────────────────────────────");
  if (!cfg) line("sorting    off (no AI configured)");
  else {
    const live = await engineLive(cfg);
    line(`sorting    ${cfg.engine}${cfg.model ? " / " + cfg.model : ""} — ${live.ok ? "answering" : "NOT answering: " + live.note}`);
  }
  line(`long paste switches to step-by-step above ${PIPELINE_MIN_CHARS} characters, ceiling ${PIPELINE_MAX_CALLS} calls`);
  line(`waiting    re-asks every ${ASK_EVERY_DAYS} days, at most ${ASK_AT_MOST} times`);
  line(`ageing     one nudge after ${AGE_DAYS} untouched days`);
  line(`dictation  ${sttConfig() ? "on (local)" : "off"}`);
  line(`data       ${/onedrive|dropbox|google ?drive|icloud/i.test(DATA_FILE) ? "inside a syncing folder" : "local folder"}`);
  line();

  line("── WHAT'S IN USE ───────────────────────────────────────");
  if (!doc) line("could not read the data file");
  else {
    const items = doc.items || [];
    const open = items.filter((i) => !i.done);
    const has = (n) => (n ? String(n) : "none");
    line(`tasks      ${has(open.length)} open, ${has(items.length - open.length)} done`);
    line(`  of those: ${open.filter((i) => i.date).length} dated, ${open.filter((i) => i.deadlineType === "hard").length} hard deadlines,`);
    line(`            ${open.filter((i) => i.openLoop).length} unfinished loops, ${open.filter((i) => i.waitingOn).length} waiting on someone,`);
    line(`            ${open.filter((i) => i.promisedTo).length} promised to someone, ${open.filter((i) => i.autoPrep).length} auto-made from the timetable`);
    line(`  reminders ${open.filter((i) => i.remindAt).length} armed, ${open.filter((i) => Number(i.snoozes) > 0).length} pushed back at least once`);
    line(`records    ${has((doc.records || []).length)}${(doc.records || []).length ? `, ${(doc.records || []).filter((r) => r.src === "ai" && !r.checkedAt).length} still unconfirmed` : ""}`);
    line(`  evidence ${(doc.records || []).reduce((n, r) => n + ((r.files || []).length), 0)} files attached, ${(doc.records || []).filter((r) => r.level).length} carry a level`);
    line(`goals      ${has((doc.goals || []).length)}`);
    line(`people     ${has((doc.contacts || []).length)}, ${(doc.contacts || []).filter((c) => (c.aka || []).length).length} with learned spellings`);
    line(`timetable  ${has((doc.schedule || []).length)} blocks${(doc.schedule || []).length ? `, ${(doc.schedule || []).filter((b) => b.prep && b.prep.on).length} set to make prep tasks` : " — the day plan, lesson-time quiet and prep tasks all wait on this"}`);
    const rc = doc.recordConfig || {};
    line(`skills     ${has((rc.topics || []).length)} tracked, ${Object.keys(rc.descriptors || {}).length} with descriptions written`);
    line(`portfolio  ${doc.portfolio && doc.portfolio.evidence ? doc.portfolio.evidence.length : 0} pieces of evidence`);
    line(`last saved ${doc.savedAt ? new Date(doc.savedAt).toLocaleString() : "never"}`);
  }
  line();

  const events = readEvents();
  const ai = events.filter((e) => e.kind === "ai");
  line("── HOW THE SORTING IS ACTUALLY GOING ───────────────────");
  if (!ai.length) line("no sorting attempted yet");
  else {
    const okCalls = ai.filter((e) => e.ok);
    const bad = ai.filter((e) => !e.ok);
    line(`${ai.length} calls recorded, ${bad.length} failed`);
    const byJob = {};
    okCalls.forEach((e) => {
      byJob[e.job] = byJob[e.job] || [];
      byJob[e.job].push(e.ms);
    });
    Object.entries(byJob).forEach(([job, all]) => {
      const sorted = all.slice().sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)];
      line(`  ${job.padEnd(18)} ${all.length}x  typical ${bucket(mid)}  slowest ${bucket(sorted[sorted.length - 1])}`);
    });
    if (bad.length) {
      // Broken down BY JOB as well as by reason: "the timetable read fails but
      // ordinary sorting is fine" is a completely different problem from "none
      // of it works", and the count alone can't tell them apart.
      line("  failures:");
      const byWhy = {};
      bad.forEach((e) => {
        const k = `${e.job || "?"} — ${e.why || "?"}`;
        byWhy[k] = (byWhy[k] || 0) + 1;
      });
      Object.entries(byWhy).forEach(([k, n]) => line(`    ${k} × ${n}`));
      const never = [...new Set(bad.map((e) => e.job))].filter((j) => !okCalls.some((e) => e.job === j));
      if (never.length) line(`    never once succeeded: ${never.join(", ")}`);
    }
  }
  line();

  const use = events.filter((e) => e.kind === "use");
  line("── IS THE SORTING ANY GOOD? ────────────────────────────");
  line("(what you change before accepting — the only real measure of quality. A call");
  line(" that worked but guessed wrong looks perfect in the section above.)");
  if (!use.length) line("nothing recorded yet — accept or correct a few sorts and this fills in");
  else {
    const acceptedRows = use.filter((e) => e.what === "accepted");
    const accepted = acceptedRows.reduce((n, e) => n + (e.n || 1), 0);
    const dropped = use.filter((e) => e.what === "dropped").length;
    const cancelled = use.filter((e) => e.what === "cancelled").reduce((n, e) => n + (e.n || 1), 0);
    line(`${accepted} entries accepted, ${dropped} dropped from the check-back, ${cancelled} whole batches cancelled`);

    const byField = {};
    use.filter((e) => e.what === "corrected" && e.field).forEach((e) => (byField[e.field] = (byField[e.field] || 0) + 1));
    const rows = Object.entries(byField).sort((a2, b2) => b2[1] - a2[1]);
    if (rows.length) {
      line("  corrected before filing:");
      rows.forEach(([f, n]) => {
        const pct = accepted ? Math.round((n / Math.max(accepted, n)) * 100) : 0;
        line(`    ${f.padEnd(14)} ${String(n).padStart(3)}${accepted ? `   ~${pct}% of accepted entries` : ""}`);
      });
      line("  ^ anything high here is a field the sorting gets wrong often — worth fixing first");
    } else line("  nothing has needed correcting");

    const names = use.filter((e) => e.what === "name-question");
    if (names.length) {
      const yes = names.filter((e) => e.value === "matched" || e.value === "accepted").length;
      const added = names.filter((e) => e.value === "added").length;
      line(`  name questions: asked ${names.length}, right ${yes}, a new person ${added}`);
      if (names.length >= 5 && yes / names.length < 0.5) line("  ^ it's guessing the wrong person more often than not");
    }
  }
  line();

  const problems = events.filter((e) => e.ok === false);
  line("── PROBLEMS RECORDED ───────────────────────────────────");
  if (!problems.length) line("none");
  else
    problems.slice(-15).forEach((e) => line(`  ${new Date(e.at).toLocaleString()}  ${e.kind}${e.job ? "/" + e.job : ""}  ${e.why || ""}`));
  line();

  line("── WHAT'S NOT BEING USED ───────────────────────────────");
  line("(untouched features — useful for deciding what to improve or drop)");
  if (doc) {
    const unused = [];
    if (!(doc.schedule || []).length) unused.push("the timetable — so no day plan, no lesson-time quiet, no prep tasks");
    if (!(doc.records || []).length) unused.push("student records");
    if (!((doc.recordConfig || {}).topics || []).length) unused.push("skills and levels");
    if (!(doc.contacts || []).length) unused.push("People");
    if (!(doc.goals || []).length) unused.push("goals");
    if (!(doc.portfolio && (doc.portfolio.evidence || []).length)) unused.push("the portfolio");
    if (!(doc.items || []).some((i) => i.waitingOn)) unused.push("waiting-on-someone");
    if (!ai.some((e) => String(e.job).startsWith("paste-"))) unused.push("long-paste sorting");
    line(unused.length ? unused.map((u) => "  never used: " + u).join("\n") : "  everything has been used at least once");
  }
  line();
  line("── END. Nothing above identifies anyone. ───────────────");

  const text = L.join("\n");
  return sendJson(res, 200, { text, at: now.toLocaleString() });
}

async function handlePipelineStart(res, body) {
  const text = (body?.text || "").toString();
  if (!text.trim()) return sendJson(res, 400, { error: "empty", message: "There was nothing to sort." });
  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  reapJobs();
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const est = estimateCalls(text, { maxCalls: PIPELINE_MAX_CALLS });
  const job = { at: Date.now(), done: false, step: "split", doneCount: 0, total: est.fragments, result: null, error: null };
  jobs.set(id, job);

  // Answer NOW. The work runs behind this, so nothing waits at the door.
  sendJson(res, 200, { id, fragments: est.fragments, estimate: est });

  runPipeline(text, pipelineCtx(body), {
    call: engineCaller(cfg),
    maxCalls: PIPELINE_MAX_CALLS,
    onProgress: (p) => {
      job.step = p.step;
      job.doneCount = p.done;
      job.total = p.total;
    },
  })
    .then((out) => {
      job.result = out;
      job.done = true;
    })
    .catch((e) => {
      console.warn("[pipeline] failed:", e?.message || e);
      // Even a total failure loses nothing: the whole paste is parked.
      job.result = { entries: [], parked: [{ text, start: 0, end: text.length, why: "the sorter couldn't run — here it is to sort by hand" }], coverage: { checked: false, missed: [] }, calls: 0, fragments: 0, capped: false };
      job.done = true;
    });
}

function handlePipelineStatus(res, id) {
  const job = jobs.get(String(id || ""));
  if (!job) return sendJson(res, 404, { error: "no_job", message: "That sort has expired — paste it again." });
  return sendJson(res, 200, {
    done: job.done,
    step: job.step,
    doneCount: job.doneCount,
    total: job.total,
    ...(job.done ? job.result : {}),
  });
}

// The comparison harness. Runs the SAME text through both paths so the
// difference can be seen rather than assumed. It is entirely plausible that the
// single call is fine for short pastes and the pipeline only earns its cost on
// long ones — this is how that gets decided.
async function handleCompare(res, body) {
  const text = (body?.text || "").toString();
  if (!text.trim()) return sendJson(res, 400, { error: "empty" });
  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  const started = Date.now();
  let single = { entries: [], ms: 0, error: null };
  try {
    const t0 = Date.now();
    const parsed = await runEngine(cfg, ROUTE_PROMPT, routeTurn(
      `${weekdayName(body.today || new Date().toISOString().slice(0, 10))}, ${body.today || ""}`,
      body.today || new Date().toISOString().slice(0, 10),
      text,
      body.goals || [],
      (body?.config?.whoIds || []).map(String),
      (body?.config?.types || []).map(String),
      (body?.config?.topics || []).map(String),
      (body?.config?.levels || []).map(String),
      []
    ), ROUTE_SCHEMA);
    single = { entries: Array.isArray(parsed.entries) ? parsed.entries : [], ms: Date.now() - t0, calls: 1, error: null };
  } catch (e) {
    single = { entries: [], ms: Date.now() - started, calls: 1, error: e?.message || "failed" };
  }

  let piped = { entries: [], ms: 0, error: null };
  try {
    const t0 = Date.now();
    const out = await runPipeline(text, pipelineCtx(body), { call: engineCaller(cfg), maxCalls: PIPELINE_MAX_CALLS });
    piped = { ...out, ms: Date.now() - t0, error: null };
  } catch (e) {
    piped = { entries: [], parked: [], ms: Date.now() - started, error: e?.message || "failed" };
  }

  return sendJson(res, 200, {
    chars: text.length,
    threshold: PIPELINE_MIN_CHARS,
    wouldUsePipeline: text.length >= PIPELINE_MIN_CHARS,
    fragments: splitFragments(text).map((f) => ({ text: f.text, speaker: f.speaker, when: f.when })),
    single,
    pipeline: piped,
  });
}

async function handleRoute(res, body) {
  const text = (body?.text || "").toString().trim();
  if (!text) return sendJson(res, 400, { error: "empty", message: "There was nothing to sort." });
  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  const clean = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const goals = Array.isArray(body?.goals) ? body.goals : [];
  const whoIds = clean(body?.config?.whoIds).slice(0, 100);
  const types = clean(body?.config?.types).slice(0, 40);
  const topics = whoIds.length ? clean(body?.config?.topics).slice(0, 300) : [];
  const levels = topics.length ? clean(body?.config?.levels).slice(0, 10) : [];
  // Standards a task can be tagged "for" — {code, id} pairs; the AI returns the
  // code, we map it to the portfolio point's id.
  const standards = (Array.isArray(body?.standards) ? body.standards : [])
    .map((s) => ({ code: (s && s.code ? String(s.code) : "").trim(), id: s && s.id ? String(s.id) : "" }))
    .filter((s) => s.code && s.id)
    .slice(0, 100);
  const standardCodes = standards.map((s) => s.code);

  const today = ISO.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
  const nowLabel = typeof body?.now === "string" && body.now.trim() ? body.now.trim() : `${weekdayName(today)}, ${today}`;

  const TYPES = ["task", "appointment", "reminder", "note"];
  const IMP = ["high", "normal", "low"];
  const EFF = ["quick", "medium", "draining"];

  try {
    const parsed = await runEngine(
      cfg,
      ROUTE_PROMPT,
      routeTurn(nowLabel, today, text, goals, whoIds, types, topics, levels, standardCodes),
      ROUTE_SCHEMA,
      "sort"
    );
    const entries = [];
    (Array.isArray(parsed.entries) ? parsed.entries : []).forEach((e) => {
      const kind = ["task", "record", "goal", "handover"].includes(e.kind) ? e.kind : "task";
      if (kind === "goal") {
        const title = (e.title || "").toString().trim().slice(0, 120);
        if (title) entries.push({ kind: "goal", goal: { title } });
        return;
      }
      if (kind === "handover") {
        const person = (e.person || "").toString().trim().slice(0, 60);
        if (!person) return; // a handover with nobody attached is meaningless
        entries.push({
          kind: "handover",
          handover: {
            person,
            dir: e.direction === "from_me" ? "out" : "in",
            note: (e.note || "").toString().trim().slice(0, 120),
          },
        });
        return;
      }
      if (kind === "record" && whoIds.length) {
        const summary = (e.summary || "").toString().trim().slice(0, 200);
        if (!summary) return;
        entries.push({
          kind: "record",
          record: {
            who: whoIds.includes(e.who) ? e.who : "",
            type: types.includes(e.note_type) ? e.note_type : types[0],
            summary,
            topic: topics.includes(e.topic) ? e.topic : "",
            level: levels.includes(e.level) ? e.level : "",
            tags: clean(e.tags).map((t) => t.toLowerCase()).slice(0, 4),
            follow_up: e.follow_up === true,
            follow_up_date: ISO.test(e.follow_up_date) ? e.follow_up_date : "",
          },
        });
        return;
      }
      // task (default, and the fallback if a record had no IDs). Returned in the
      // app's own field names, ready to file.
      const title = (e.title || e.summary || "").toString().trim().slice(0, 200);
      if (!title) return;
      const want = (e.goal_link || "").toString().trim().toLowerCase();
      let goalId = "";
      if (want) {
        const m = goals.find((g) => g && typeof g.title === "string" && g.title.trim().toLowerCase() === want && g.id);
        if (m) goalId = String(m.id);
      }
      const wantStd = (e.standard || "").toString().trim().toLowerCase();
      const stdMatch = wantStd ? standards.find((s) => s.code.toLowerCase() === wantStd) : null;
      entries.push({
        kind: "task",
        item: {
          title,
          type: TYPES.includes(e.item_type) ? e.item_type : "task",
          date: ISO.test(e.date) ? e.date : "",
          time: /^\d{1,2}:\d{2}$/.test(e.time || "") ? e.time : "",
          deadlineType: e.deadline === "hard" ? "hard" : "soft",
          importance: IMP.includes(e.importance) ? e.importance : "normal",
          effort: EFF.includes(e.effort) ? e.effort : "medium",
          tags: clean(e.tags).map((t) => t.toLowerCase()).slice(0, 4),
          whenText: (e.when_text || "").toString().trim(),
          goalId,
          standardId: stdMatch ? stdMatch.id : "",
          openLoop: e.open_loop === true,
          promisedTo: (e.promised_to || "").toString().trim().slice(0, 40),
          waitingOn: (e.waiting_on || "").toString().trim().slice(0, 40),
        },
      });
    });
    // GROUNDING, in code, before any of it is offered for filing. The same
    // check the pipeline runs, applied to the single-call path so both roads
    // into the app have it. A field that couldn't be traced back to the text
    // isn't discarded — it's marked, and the chip gets louder.
    entries.forEach((entry) => {
      const missing = ungroundedFields(entry, text);
      if (missing.length) entry.ungrounded = missing;
    });
    sendJson(res, 200, { entries });
  } catch (e) {
    console.error("[route] failed:", e?.message || e);
    sendJson(res, 502, { error: "sort_failed", message: offlineReason(cfg, e) || "I couldn't sort that just now." });
  }
}

// --- speech to text (OFF unless you configure it) ---------------------------
// Deliberately in-house only: there is no cloud speech route in this app. With
// no STT_URL set, no microphone appears anywhere and this endpoint declines.
// Point STT_URL at your own local Whisper server and dictation turns on, with
// the audio staying on this machine exactly like Ollama.
function sttConfig() {
  const url = (process.env.STT_URL || "").trim();
  if (!url) return null;
  return { url, model: (process.env.STT_MODEL || "whisper-1").trim(), apiKey: (process.env.STT_API_KEY || "").trim() };
}

// Build an OpenAI-style multipart body by hand (no dependencies) — the shape
// faster-whisper-server / whisper.cpp / LM Studio all accept.
function multipartAudio(buf, filename, model) {
  const boundary = "----organiser" + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const mid = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n--${boundary}--\r\n`
  );
  return { body: Buffer.concat([head, buf, mid]), boundary };
}

async function handleTranscribe(req, res, query) {
  const cfg = sttConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_stt", message: "Local transcription isn't set up." });
  let audio;
  try {
    audio = await readBodyBuffer(req, 25 * 1024 * 1024);
  } catch {
    return sendJson(res, 413, { error: "too_large", message: "That recording is too long." });
  }
  if (!audio.length) return sendJson(res, 400, { error: "empty", message: "Nothing was recorded." });
  try {
    const name = (query.get("name") || "audio.webm").replace(/[^\w.\-]/g, "_");
    const { body, boundary } = multipartAudio(audio, name, cfg.model);
    const headers = { "Content-Type": `multipart/form-data; boundary=${boundary}` };
    if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
    const r = await fetch(cfg.url, { method: "POST", headers, body });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[stt] server said", r.status, detail.slice(0, 150));
      return sendJson(res, 502, { error: "stt_failed", message: "The transcriber couldn't hear that." });
    }
    const d = await r.json().catch(() => ({}));
    sendJson(res, 200, { text: (d.text || "").toString().trim() });
  } catch (e) {
    console.error("[stt] failed:", e?.message || e);
    sendJson(res, 502, { error: "stt_failed", message: "Couldn't reach your transcriber." });
  }
}

// Pre-warm: load the local model into memory BEFORE the first real sort, so the
// daily-sort step (touched every day) doesn't pay the cold-start wait. Ollama
// loads a model when /api/generate is called with an empty prompt; keep_alive
// then holds it resident. Best-effort and silent — if it can't warm, the real
// sort still works, just slower the first time. Only meaningful for Ollama.
// ---- READING A PHOTOGRAPH -------------------------------------------------
//
// A teacher's timetable is on the staffroom wall and their calendar is on a
// noticeboard, so the first thing anybody tries is a photo of it. Until now the
// app said no — and it was right to, because reading words off a picture needs
// a model that can see, and this app will not send a photograph anywhere.
//
// A LOCAL ONE CAN. Ollama runs vision models on the same machine as the text
// one, so the picture never leaves the room it was taken in. That is the whole
// reason this is possible at all.
//
// AND IT IS ONLY EVER LOCAL. A photograph taken in a school can have children
// in it, a register on a desk, a screen with somebody's marks on it. So this
// refuses to run against a cloud engine — not "warns", refuses. There is no
// setting that turns that off.
const VISION_MODELS = [
  "llava", "bakllava", "llama3.2-vision", "llama3.2vision", "llama4",
  "minicpm-v", "moondream", "qwen2-vl", "qwen2.5vl", "qwen2.5-vl",
  "granite3.2-vision", "gemma3", "mistral-small3", "internvl",
];
const looksLikeVision = (name) => {
  const n = String(name || "").toLowerCase();
  return VISION_MODELS.some((v) => n.includes(v));
};

// Word for word, and the LAYOUT with it. A timetable read into one long
// paragraph is unreadable by anything here; the same timetable with a tab
// between its cells goes straight into the grid reader that already exists.
const LOOK_PROMPT =
  "Write out every word in this picture as plain text.\n" +
  "Keep the layout: one line of the picture on one line of your answer.\n" +
  "If it is a table or a timetable, put a TAB between the cells of a row and keep each row on its own line.\n" +
  "Copy what is written. Do not describe the picture, do not explain it, do not summarise it, " +
  "and do not add a single word that is not written in it.\n" +
  "Where you cannot make something out, write [?] in its place rather than guessing.";

async function handleLook(req, res) {
  const cfg = aiConfig();
  if (!cfg)
    return sendJson(res, 200, {
      ok: false,
      why: "no_ai",
      message: "Reading a picture needs a local model that can see, and no AI is set up on this machine yet.",
    });
  // THE LINE THAT IS NOT NEGOTIABLE.
  if (cfg.engine !== "ollama")
    return sendJson(res, 200, {
      ok: false,
      why: "not_local",
      message:
        "A photograph is only ever read on this machine, and the AI this app is set to talk to isn't on it. " +
        "Install Ollama and pull a model that can see, and photos will work.",
    });

  let body = {};
  try {
    body = JSON.parse((await readBody(req, 24 * 1024 * 1024)) || "{}");
  } catch {
    return sendJson(res, 400, { ok: false, why: "unreadable", message: "That picture didn't arrive in one piece." });
  }
  const image = String(body.image || "").replace(/^data:[^,]*,/, "");
  if (!image) return sendJson(res, 400, { ok: false, why: "empty", message: "There was no picture in that." });

  const base = cfg.baseUrl.replace(/\/+$/, "");
  // WHICH MODEL CAN SEE. Said in .env if you have said it; otherwise whichever
  // pulled model looks like one, because asking a text model to read a picture
  // gets you a confident description of a picture it never saw.
  let model = (process.env.AI_VISION_MODEL || "").trim();
  if (!model) {
    try {
      const tags = await fetch(base + "/api/tags", { signal: AbortSignal.timeout(4000) });
      const list = tags.ok ? ((await tags.json()).models || []).map((m) => m.name || m.model || "") : [];
      model = list.find(looksLikeVision) || "";
    } catch {
      /* nothing pulled, or Ollama not answering — said below */
    }
  }
  if (!model)
    return sendJson(res, 200, {
      ok: false,
      why: "no_vision_model",
      message:
        "No model that can see is installed. In a terminal, run:  ollama pull llava  " +
        "— it's a big download, so leave it running. After that, photos will work.",
    });

  try {
    const r = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No JSON shape asked for: what is wanted back is the words, as words.
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: cfg.keepAlive,
        options: { temperature: 0 },
        messages: [{ role: "user", content: LOOK_PROMPT, images: [image] }],
      }),
      // A vision model on a laptop is slow. Slow is fine; silent is not, which
      // is why the page says what it is doing while this runs.
      signal: AbortSignal.timeout(240000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return sendJson(res, 200, {
        ok: false,
        why: "engine",
        message: `The model that reads pictures answered ${r.status}. ${detail.slice(0, 150)}`,
      });
    }
    const data = await r.json();
    // TRIMMED AT THE ENDS, BUT NOT ACROSS THE FRONT OF THE FIRST LINE. A
    // timetable's header row starts with an EMPTY CELL — the blank square above
    // the time column — and out of a model that is a leading tab. Trimmed away,
    // every day shifts one column left and the time column becomes Monday.
    const text = String(data?.message?.content ?? "").replace(/^[\r\n]+/, "").replace(/\s+$/, "");
    if (!text)
      return sendJson(res, 200, { ok: false, why: "nothing", message: "It couldn't make anything out in that picture." });
    return sendJson(res, 200, { ok: true, text, model });
  } catch (e) {
    return sendJson(res, 200, {
      ok: false,
      why: "unreachable",
      message: `Couldn't reach the model that reads pictures. ${String(e && e.message ? e.message : e).slice(0, 120)}`,
    });
  }
}

async function handleWarm(res) {
  const cfg = aiConfig();
  if (!cfg || cfg.engine !== "ollama") return sendJson(res, 200, { ok: true, warmed: false });
  try {
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/api/generate";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, keep_alive: cfg.keepAlive }),
    });
    return sendJson(res, 200, { ok: true, warmed: r.ok });
  } catch {
    return sendJson(res, 200, { ok: true, warmed: false });
  }
}

// --- active reminders: the piece that comes and FINDS you (§0.2 s28) ---------
// The user's memory must not be where unfinished tasks live. While this server
// runs (see the auto-start launcher), it scans the owned data file and fires a
// real OS notification when an item's reminder time arrives — browser open or
// not. Zero new installs: Windows toasts via PowerShell, macOS via osascript,
// Linux via notify-send. Each reminder fires once (remindedAt marks it); editing
// the time re-arms it. Calm + activating, task-framed, never shaming.

const REMIND_INTERVAL_MS = Math.max(5000, Number(process.env.REMIND_INTERVAL_MS) || 60000);

function xmlEscape(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));
}

function notify(title, body) {
  // Test/debug hook: append to a file instead of toasting (used by the checks).
  if (process.env.NOTIFY_FILE) {
    try {
      fs.appendFileSync(process.env.NOTIFY_FILE, JSON.stringify({ at: new Date().toISOString(), title, body }) + "\n");
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    if (process.platform === "win32") {
      // Native Windows toast via WinRT — no modules, no installs. Sent as an
      // encoded command so quoting can never break it.
      const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast scenario="reminder"><visual><binding template="ToastText02"><text id="1">${xmlEscape(title).replace(/'/g, "''")}</text><text id="2">${xmlEscape(body).replace(/'/g, "''")}</text></binding></visual></toast>')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Personal Organiser').Show((New-Object Windows.UI.Notifications.ToastNotification $xml))`;
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      spawnQuietly("powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], "remind");
    } else if (process.platform === "darwin") {
      spawnQuietly("osascript",
        ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], "remind");
    } else {
      spawnQuietly("notify-send", [title, body], "remind");
    }
  } catch (e) {
    console.warn("[remind] couldn't show a notification:", e?.message || e);
  }
}

// "in 3 days" style words, not date-math (dyscalculia-friendly).
function dueWords(dateIso) {
  if (!ISO.test(dateIso || "")) return "";
  const today = todayStamp();
  if (dateIso < today) return "it's past its deadline";
  if (dateIso === today) return "due today";
  const diff = Math.round((new Date(dateIso + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000);
  if (diff === 1) return "due tomorrow";
  if (diff <= 6) return `due ${weekdayName(dateIso)}`;
  return `due ${dateIso}`;
}

// Calm, task-framed words (no-shame floor s24/s28): the task is owed, the
// person is never failing.
function reminderText(it) {
  const due = dueWords(it.date);
  const promised = it.promisedTo ? `Promised to ${it.promisedTo}. ` : "";
  if (it.openLoop) {
    return {
      title: `Needs finishing — ${it.title}`,
      body: `${promised}You prepped this; closing it now takes it off your mind.${due ? ` It's ${due}.` : ""}`,
    };
  }
  return {
    title: `Coming due — ${it.title}`,
    body: `${promised}${due ? `It's ${due} — ` : ""}doing it now keeps it on your own schedule.`,
  };
}

// A reminder is due when its time has arrived, the item is still not done, and
// it hasn't already fired (remindedAt). "YYYY-MM-DDTHH:MM" parses as LOCAL time
// — the server runs on the same machine as the browser, so clocks agree.
function dueReminders(items, now) {
  return (items || []).filter((it) => {
    if (!it || it.done || !it.remindAt || it.remindedAt) return false;
    const t = new Date(it.remindAt);
    return !isNaN(t) && t <= now;
  });
}

// IMPORTANCE HAS NO CLOCK — so ageing supplies one. Something you marked as
// mattering a lot, that has sat untouched for a while and has no reminder of its
// own, gets ONE quiet nudge. Then it never asks again; it just stays high on the
// shortlist. This closes the "important things never ping" gap without turning
// importance into a nag.
const AGE_DAYS = Math.max(1, Number(process.env.REMIND_AGE_DAYS) || 10);
function agedImportant(items, now) {
  const cutoff = now.getTime() - AGE_DAYS * 24 * 60 * 60 * 1000;
  return (items || []).filter((it) => {
    if (!it || it.done || it.importance !== "high") return false;
    if (it.remindAt || it.agedAt) return false; // has its own ping, or already nudged once
    const born = new Date(it.createdAt || 0).getTime();
    return born && born <= cutoff;
  });
}

// QUIET TIME COMES FROM THE SCHEDULE, not from a setting.
//
// A reminder you can't act on at 10:15 teaches you to ignore reminders. So
// nothing fires while you're inside a fixed block — it's HELD, and lands the
// moment the block ends. Soft blocks (the app's own guesses) never silence
// anything; a guess must not be able to swallow a real ping.
//
// This repeats a little of public/schedule.js on purpose. The browser files are
// plain classic scripts and this is an ES module, so there is no honest way to
// share them without a build step — and a build step costs more than these
// twenty lines. Only the narrow "am I inside a fixed block" question lives here;
// all the planning logic stays in the one place, client-side.
function blockMinutes(v) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((v || "").toString().trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
function blockAppliesOn(b, iso, dow) {
  if (b.from && iso < b.from) return false;
  if (b.to && iso > b.to) return false;
  if (b.date) return b.date === iso;
  return Array.isArray(b.days) && b.days.includes(dow);
}
// The fixed block covering this exact moment, or null if you're free.
function fixedBlockAt(schedule, now) {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of Array.isArray(schedule) ? schedule : []) {
    if (!b || b.soft) continue;
    const s = blockMinutes(b.start);
    const e = blockMinutes(b.end);
    if (s === null || e === null || e <= s) continue;
    if (!blockAppliesOn(b, iso, dow)) continue;
    if (s <= mins && mins < e) return b;
  }
  return null;
}

// WAITING ON SOMEONE ELSE gets a rhythm rather than a single ping, because a
// silence doesn't resolve itself and one forgotten nudge is how a thing quietly
// dies. This is not the nagging the app forbids: it re-asks only about
// something YOU said you were waiting for, it says how long it's been rather
// than passing judgement, every ping carries a way to end it, and it counts its
// own asks and stops by itself. Nagging has no exit; this is mostly exit.
const ASK_EVERY_DAYS = Math.max(1, Number(process.env.WAITING_ASK_DAYS) || 5);
const ASK_AT_MOST = Math.max(1, Number(process.env.WAITING_ASK_TIMES) || 6);

function rearmWaiting(it, now) {
  const asked = (Number(it.asked) || 0) + 1;
  it.asked = asked;
  if (asked >= ASK_AT_MOST) {
    it.remindAt = ""; // it has said its piece; it stays on the page, silently
    it.remindedAt = null;
    return false;
  }
  const next = new Date(now);
  next.setDate(next.getDate() + ASK_EVERY_DAYS);
  next.setHours(9, 0, 0, 0);
  const p2 = (n) => String(n).padStart(2, "0");
  it.remindAt = `${next.getFullYear()}-${p2(next.getMonth() + 1)}-${p2(next.getDate())}T${p2(next.getHours())}:${p2(next.getMinutes())}`;
  it.remindedAt = null; // re-armed, so it comes back rather than going quiet
  return true;
}
function waitingText(it, now) {
  const since = it.waitingSince ? new Date(it.waitingSince + "T12:00:00") : null;
  const days = since ? Math.max(0, Math.round((now - since) / 86400000)) : 0;
  const how = days <= 1 ? "since yesterday" : `${days} days now`;
  return {
    title: `Still waiting on ${it.waitingOn}`,
    body: `${it.title} — ${how}. Nudge them, or let it go?`,
  };
}

function checkReminders() {
  try {
    const now = new Date();
    const doc = readData();
    // Inside a lesson, meeting, or anything else you called fixed: hold everything.
    const busy = fixedBlockAt(doc.schedule, now);
    if (busy) return;
    // And while something has taken the day over — a crisis is the worst
    // possible moment to be told about a report that's due on Friday.
    if (doc.scheduleConfig && doc.scheduleConfig.away && doc.scheduleConfig.away.startedAt) return;
    const due = dueReminders(doc.items, now);
    const aged = agedImportant(doc.items, now);
    if (!due.length && !aged.length) return;
    // Everything that piled up while you were teaching arrives as ONE notification
    // at the next gap. Four separate pings at the same second is just noise.
    if (due.length + aged.length > 2) {
      const titles = due.concat(aged).map((it) => it.title).slice(0, 5);
      const extra = due.length + aged.length - titles.length;
      notify(
        `${due.length + aged.length} things waiting`,
        titles.join(" · ") + (extra ? ` · and ${extra} more` : "")
      );
      const stamp = new Date().toISOString();
      due.forEach((it) => {
        if (it.waitingOn) rearmWaiting(it, now); // keeps its rhythm even in a batch
        else it.remindedAt = stamp;
      });
      aged.forEach((it) => (it.agedAt = stamp));
      console.log(`[remind] batched ${due.length + aged.length}`);
      writeData(doc, { baseSavedAt: doc.savedAt });
      return;
    }
    due.forEach((it) => {
      if (it.waitingOn) {
        const w = waitingText(it, now);
        notify(w.title, w.body);
        const again = rearmWaiting(it, now);
        console.log(`[remind:waiting] ${w.title}${again ? "" : " (last time)"}`);
        return;
      }
      const t = reminderText(it);
      notify(t.title, t.body);
      it.remindedAt = new Date().toISOString();
      console.log(`[remind] ${t.title}`);
    });
    aged.forEach((it) => {
      notify(`Still waiting — ${it.title}`, `You marked this as mattering. It's been sitting a while — worth a moment, or let it go?`);
      it.agedAt = new Date().toISOString(); // once only; never asks again
      console.log(`[remind:aged] ${it.title}`);
    });
    // Mark them fired. Guarded by the version we just read, so if another
    // computer wrote the shared file in between, we back off (it'll retry).
    writeData(doc, { baseSavedAt: doc.savedAt }); // never nag twice
  } catch (e) {
    console.warn("[remind] check failed:", e?.message || e);
  }
}

// --- tiny static file server ----------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

// --- evidence files: real files in a folder the user owns ------------------
// Attached work samples live as plain files in data/files/ (they sync/back up
// with the folder). The data file only stores small references — it never
// balloons with file bytes.

function readBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Only ever a basename inside FILES_DIR — a hostile id can't walk out of it.
// A reference id is now a relative path under data/files/ (e.g.
// "students/S03/reading sample.jpg" or "portfolio/TS1/display.jpg"), so the
// files sit in plain, human-navigable, grabbable folders — you can lift a
// student's or a standard's folder straight out. Old flat ids (no slash) still
// resolve. Traversal is blocked; the path can never leave data/files/.
function evidencePath(id) {
  const rel = decodeURIComponent(String(id || "")).replace(/\\/g, "/");
  if (!rel || rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  const p = path.normalize(path.join(FILES_DIR, rel));
  if (p !== FILES_DIR && !p.startsWith(FILES_DIR + path.sep)) return null;
  return p;
}

// "students/S03" → safe folder segments; anything odd becomes "_".
function safeFolder(raw) {
  return String(raw || "")
    .split("/")
    .map((seg) => seg.trim().replace(/[^\w.\-() ]/g, "_").replace(/^\.+/, "").slice(0, 60))
    .filter(Boolean)
    .slice(0, 3)
    .join("/");
}

async function handleUpload(req, res, query) {
  const rawName = (query.get("name") || "file").toString().slice(0, 120);
  let base = (rawName.replace(/[^\w.\-() ]/g, "_").slice(-90) || "file").replace(/^\.+/, "") || "file";
  const folder = safeFolder(query.get("folder") || "");
  let buf;
  try {
    buf = await readBodyBuffer(req, 15 * 1024 * 1024);
  } catch {
    return sendJson(res, 413, { error: "too_large", message: "That file is too big (15 MB max)." });
  }
  if (!buf.length) return sendJson(res, 400, { error: "empty", message: "That file looks empty." });
  ensureDirs();
  const dir = folder ? path.join(FILES_DIR, folder) : FILES_DIR;
  fs.mkdirSync(dir, { recursive: true });
  // Keep the readable original name; only uniquify if that name is already taken.
  let name = base;
  if (fs.existsSync(path.join(dir, name))) {
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    name = `${stem}-${Math.random().toString(36).slice(2, 6)}${ext}`;
  }
  fs.writeFileSync(path.join(dir, name), buf);
  const id = folder ? `${folder}/${name}` : name;
  sendJson(res, 200, { id, name: rawName });
}

// ---- EXPORTS: readable without the app ------------------------------------
// organiser-data.json stays the single truth. Everything under data/exports/ is
// a rebuildable copy, written as a NEW dated file every time rather than
// overwritten — so a hand-edit in Excel is never silently wiped, it's just
// superseded by a file next to it.
//
// No .xlsx, no .docx: those are zipped folders of XML and writing them properly
// means a library. CSV opens in Excel on a double-click; HTML opens in Word and
// prints correctly. That is the whole trick that keeps the zero-dependency rule.
function exportPath(rel) {
  const parts = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim().replace(/[^\w.\-() ]/g, "_").replace(/^\.+/, "").slice(0, 60))
    .filter(Boolean)
    .slice(0, 4);
  if (!parts.length) return null;
  const p = path.normalize(path.join(EXPORT_DIR, parts.join("/")));
  if (!p.startsWith(EXPORT_DIR + path.sep)) return null;
  return p;
}

async function handleExport(req, res) {
  let parsed = {};
  try {
    parsed = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "bad_json" });
  }
  const rel = (parsed.path || "").toString();
  const p = exportPath(rel);
  if (!p) return sendJson(res, 400, { error: "bad_path", message: "That filename can't be used." });
  const text = (parsed.content || "").toString();
  if (text.length > 20 * 1024 * 1024) return sendJson(res, 413, { error: "too_large" });
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Excel reads a bare UTF-8 CSV as the system's legacy code page and turns
    // Chinese characters (and anything accented) into rubbish. The three-byte
    // BOM is what tells it otherwise. This is not optional.
    const bom = parsed.bom ? "﻿" : "";
    fs.writeFileSync(p, bom + text, "utf8");
    return sendJson(res, 200, { ok: true, path: path.relative(DATA_DIR, p).split(path.sep).join("/"), full: p });
  } catch (e) {
    console.warn("[export] write failed:", e?.message || e);
    return sendJson(res, 500, { error: "write_failed", message: "Couldn't write that file." });
  }
}

function handleEvidenceFile(req, res, id) {
  const p = evidencePath(id);
  if (!p || !fs.existsSync(p)) return sendJson(res, 404, { error: "not_found" });
  if (req.method === "DELETE") {
    try {
      fs.unlinkSync(p);
    } catch {
      /* already gone is fine */
    }
    return sendJson(res, 200, { ok: true });
  }
  const type = MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Disposition": "inline" });
  fs.createReadStream(p).pipe(res);
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    // NEVER LET THE BROWSER SERVE A STALE APP. Without this the browser caches
    // these files on its own guess, so after an update you'd get the OLD app and
    // reasonably conclude the update didn't work. Everything here comes off
    // localhost, so there is no bandwidth worth saving by caching it.
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, must-revalidate",
    });
    res.end(buf);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req, maxBytes) {
  const cap = maxBytes || 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let over = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > cap) {
        // DO NOT KILL THE SOCKET HERE. Destroying it means the browser gets no
        // answer at all — the save simply fails, the app says "couldn't save,
        // will keep trying", and there is no way on earth to find out why.
        // Let the rest arrive and throw it away, then say so in words the
        // route can pass on.
        if (!over) {
          over = true;
          data = "";
        }
        return;
      }
      data += c;
    });
    req.on("end", () => {
      if (over) {
        const e = new Error("too large");
        e.tooLarge = true;
        e.limit = cap;
        e.size = size;
        reject(e);
        return;
      }
      resolve(data);
    });
    req.on("error", reject);
  });
}

const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)}MB`;

// --- routing ---------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    let reqUrl;
    try {
      reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    } catch {
      // A doubled slash or a mistyped address is a wrong address, not a broken
      // app. It used to come back as "Something went wrong", which sends you
      // looking for a fault that isn't there.
      return sendJson(res, 404, { error: "not_found" });
    }
    const pathname = reqUrl.pathname;

    if (pathname === "/api/upload" && req.method === "POST") {
      return handleUpload(req, res, reqUrl.searchParams);
    }

    if (pathname.startsWith("/files/") && (req.method === "GET" || req.method === "DELETE")) {
      return handleEvidenceFile(req, res, pathname.slice("/files/".length));
    }

    if (req.method === "GET" && pathname === "/api/health") {
      const cfg = aiConfig();
      const stt = sttConfig();
      // CONFIGURED IS NOT THE SAME AS RUNNING. aiConfig() only reads .env, so it
      // said "yes, AI" while Ollama was switched off — and the app then tried,
      // failed, and blamed itself. Actually asking makes the three states
      // distinguishable: off, configured-but-not-answering, and working.
      const live = await engineLive(cfg);
      return sendJson(res, 200, {
        ok: true,
        hasAI: !!cfg && live.ok,
        configured: !!cfg,
        engine: cfg ? cfg.engine : null,
        engineNote: live.note,
        engineUrl: cfg && cfg.baseUrl ? cfg.baseUrl : "",
        stt: stt ? "local" : "off",
        dataFile: DATA_FILE,
        pipelineMinChars: PIPELINE_MIN_CHARS,
      });
    }

    // Cheap freshness check for the shared-folder poll: just the version stamp.
    if (pathname === "/api/data-version" && req.method === "GET") {
      let savedAt = null;
      try {
        savedAt = readData().savedAt;
      } catch {}
      return sendJson(res, 200, { savedAt });
    }

    if (pathname === "/api/data") {
      if (req.method === "GET") return sendJson(res, 200, readData());
      if (req.method === "PUT" || req.method === "POST") {
        // YOUR OWN DATA FILE IS NOT A PASTED NOTE. The general limit is there to
        // stop one enormous paste; years of records, lesson plans and registers
        // legitimately run past it, and somebody whose file simply grew should
        // never find that saving has quietly stopped working.
        const body = await readBody(req, DATA_LIMIT);
        let parsed;
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          return sendJson(res, 400, { error: "bad_json", message: "Could not read the data." });
        }
        try {
          const savedAt = writeData(parsed, { baseSavedAt: parsed.baseSavedAt });
          return sendJson(res, 200, { ok: true, savedAt });
        } catch (e) {
          if (e && e.conflict) {
            // Another computer changed the shared file first. The client's edit is
            // safe in a conflict copy; hand back the current data so it can reload.
            return sendJson(res, 409, { error: "conflict", savedAt: e.current.savedAt, data: e.current });
          }
          throw e;
        }
      }
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    if (pathname === "/api/warm" && req.method === "POST") {
      return handleWarm(res);
    }

    // A photograph, read on this machine and nowhere else — see handleLook.
    if (pathname === "/api/look" && req.method === "POST") {
      return handleLook(req, res);
    }

    if (pathname === "/api/transcribe" && req.method === "POST") {
      return handleTranscribe(req, res, reqUrl.searchParams);
    }

    if (pathname === "/api/breakdown" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleBreakdown(res, parsed);
    }

    if (pathname === "/api/cluster" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleCluster(res, parsed);
    }

    if (pathname === "/api/record-understand" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleRecordUnderstand(res, parsed);
    }

    if (pathname === "/api/timetable" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleTimetable(res, parsed);
    }

    if (pathname === "/api/export" && req.method === "POST") {
      return handleExport(req, res);
    }

    if (pathname === "/api/event" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleEvent(res, parsed);
    }

    if (req.method === "GET" && pathname === "/api/report") {
      return handleReport(res);
    }

    if (req.method === "GET" && pathname === "/api/diagnose") {
      return handleDiagnose(res);
    }

    // Splitting is PURE CODE and deliberately needs no engine. It sat behind the
    // pipeline, which meant a machine with no model got a whole pasted thread as
    // one task title — when the app could always have broken it into lines.
    if (pathname === "/api/split" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      const frags = splitFragments((parsed.text || "").toString()).map((f) => ({
        text: f.text,
        speaker: f.speaker,
        when: f.when,
      }));
      return sendJson(res, 200, { fragments: frags });
    }

    if (pathname === "/api/pipeline" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handlePipelineStart(res, parsed);
    }

    if (pathname === "/api/pipeline" && req.method === "GET") {
      return handlePipelineStatus(res, reqUrl.searchParams.get("id"));
    }

    if (pathname === "/api/compare" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleCompare(res, parsed);
    }

    if (pathname === "/api/route" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleRoute(res, parsed);
    }

    if (req.method === "GET" || req.method === "HEAD") return serveStatic(pathname, res);
    return sendJson(res, 404, { error: "not_found" });
  } catch (e) {
    // TOO BIG IS A THING WITH A NAME. It used to destroy the connection without
    // answering, so the browser got nothing at all — no status, no reason, just
    // a save that failed — and the app said "couldn't save, will keep trying"
    // while checking a window that had been open the whole time. Answered here
    // rather than at one route, so every way in says the same thing.
    if (e && e.tooLarge) {
      console.warn(`[server] refused ${mb(e.size)}, over the ${mb(e.limit)} limit`);
      return sendJson(res, 413, {
        error: "too_large",
        message: `That is ${mb(e.size)}, past the ${mb(e.limit)} limit. Nothing was written — your saved file is exactly as it was.`,
      });
    }
    console.error("[server] error:", e?.message || e);
    sendJson(res, 500, { error: "server", message: "Something went wrong." });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("\n  It looks like your organiser is already running.");
    console.log(`  Look for it in your browser at http://localhost:${PORT}`);
    console.log("  (or close the other black window first, then try again).\n");
  } else {
    console.log("\n  The organiser couldn't start: " + (err.message || err) + "\n");
  }
  process.exitCode = 1;
});

ensureDirs();
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Your organiser is running:  ${url}`);
  console.log(`  Your data is saved to:      ${DATA_FILE}`);
  const aiCfg = aiConfig();
  if (!aiCfg) {
    console.log("\n  (AI sorting is off — add things by hand. See .env.example to switch it on.)");
  } else if (aiCfg.engine === "anthropic") {
    console.log("\n  AI sorting: Anthropic cloud.");
  } else {
    const keep = aiCfg.engine === "ollama" ? "keep Ollama running" : "keep your local AI running";
    console.log(`\n  AI sorting: local at ${aiCfg.baseUrl} (${keep}).`);
  }
  console.log("\n  Keep this window open while you use the organiser. Close it to stop.");
  console.log("  Reminders fire from here as real notifications — even with the browser closed.\n");
  openBrowser(url);
  // Catch anything that came due while the machine was off, then keep watch.
  setTimeout(checkReminders, 5000);
  setInterval(checkReminders, REMIND_INTERVAL_MS);
});

// LAUNCHING SOMETHING THAT MIGHT NOT BE THERE.
//
// spawn() does NOT throw when the command is missing — it emits an async
// 'error' event, and a ChildProcess with no listener for that takes the whole
// process down with it. So the try/catch that looks like it's handling this
// handles nothing at all, and the server dies.
//
// It cost two real crashes. Opening the browser at startup kills the app on any
// machine without an opener — you double-click the launcher and get nothing,
// with no way to tell that the SERVER was fine and only the browser call
// wasn't. And a missing notifier kills it later: it runs happily all day and
// then vanishes the moment the first reminder fires, which is about the most
// confusing failure this app could have.
//
// Neither of these is worth a crash. Both are conveniences.
function spawnQuietly(cmd, args, label) {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    // THE LINE THAT MATTERS. Without it, "command not found" is fatal.
    child.on("error", (e) => {
      console.warn(`[${label || cmd}] couldn't run ${cmd}: ${e && e.message ? e.message : e}`);
    });
    child.unref();
    return child;
  } catch (e) {
    console.warn(`[${label || cmd}] couldn't run ${cmd}: ${e && e.message ? e.message : e}`);
    return null;
  }
}

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  try {
    if (process.platform === "win32") spawnQuietly("cmd", ["/c", "start", "", url], "open");
    else if (process.platform === "darwin") spawnQuietly("open", [url], "open");
    else spawnQuietly("xdg-open", [url], "open");
  } catch {
    /* opening the browser is best-effort; the URL is printed above */
  }
}
