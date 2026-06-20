// Personal Organiser — local server (zero dependencies)
//
// This file uses ONLY Node's built-in modules, so the core app (seeing your
// zones + trustworthy saving) needs no `npm install` and no internet. Just Node.
//
// THE TWO HALVES (design tracker §0.1):
//   SEEING + SAVING  = static files in /public + the /api/data store below.
//                      Fully offline, no AI, never pauses. This is the
//                      trustworthy half this build is about.
//   PUTTING IN (AI)  = the optional /api/understand endpoint. It loads the
//                      Anthropic SDK lazily, so it only matters once you choose
//                      to set up AI later (a separate hill). The app works
//                      completely without it.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
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
  return { version: 1, items: [], waiting: [], savedAt: null };
}

function normaliseDoc(d) {
  return {
    version: 1,
    items: Array.isArray(d.items) ? d.items : [],
    waiting: Array.isArray(d.waiting) ? d.waiting : [],
    savedAt: d.savedAt || null,
  };
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function writeData(input) {
  ensureDirs();
  const doc = {
    version: 1,
    savedAt: new Date().toISOString(),
    items: Array.isArray(input.items) ? input.items : [],
    waiting: Array.isArray(input.waiting) ? input.waiting : [],
  };
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
  } catch {
    /* pruning is best-effort */
  }
}

// --- optional AI (loaded only if/when you set it up) -----------------------

const MODEL = "claude-opus-4-8"; // swap to a smaller model id for faster/cheaper sorting

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["task", "appointment", "reminder", "note"] },
          date: { type: "string" },
          time: { type: "string" },
          deadlineType: { type: "string", enum: ["hard", "soft"] },
          importance: { type: "string", enum: ["high", "normal", "low"] },
          tags: { type: "array", items: { type: "string" } },
          when_text: { type: "string" },
        },
        required: ["title", "type", "date", "time", "deadlineType", "importance", "tags", "when_text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are the "understanding" engine inside a calm personal organiser. It was built for someone with dyslexia and dyscalculia. Your whole job is to take one messy, possibly misspelled line — which may contain several different things jumbled together — and turn it into clean, sorted entries.

Follow these rules without exception:
- Spelling never matters. Silently fix all typos and misspellings. Never comment on them.
- Split the input into separate items when it contains more than one thing.
- Never ask the user to clarify. Make a sensible, generous call and move on.
- Keep each title short and clear. For tasks, start with a verb ("Call dentist", "Buy milk"). For everything else, name the thing plainly ("Mum's birthday").

For each item decide a "type":
- "task" — an action to do (call, buy, email, fix, finish).
- "appointment" — something tied to a specific day/time or event, including birthdays and meetings.
- "reminder" — a nudge to remember something, often phrased "remind me", "don't forget".
- "note" — information or an idea to keep, with no action ("idea: ...", a password, a thought).

For each item resolve the timing into "date" and "when_text":
- "date": a real calendar date in YYYY-MM-DD format, ONLY when you can pin a specific day. Use the "today" you are given to resolve words like "today", "tomorrow", "tuesday" (the next upcoming Tuesday), "this friday", or explicit dates. If no specific day is implied, use an empty string "".
- "when_text": the human time phrase as the user meant it ("Tuesday", "soon", "coming up", "next week"), or an empty string "" if there was none. Keep this even when you also set a date, so the user recognises their own words.
- Do not invent dates the user did not imply. Vague timing ("soon", "next week", "coming up", "sometime") means date "" with the phrase kept in when_text.

Also set "time":
- "time": a 24-hour clock time "HH:MM" ONLY when a specific time is given or clearly implied ("3pm" -> "15:00", "at 9" -> "09:00", "half seven" -> "19:30").
- Vague parts of the day ("tonight", "this morning", "this afternoon") are NOT specific times -> leave time "" and keep the phrase in when_text.
- No time mentioned -> "".

Also set "deadlineType", "importance" and "tags":
- "deadlineType": "hard" when the date is a REAL deadline with consequences ("by Friday", "due Monday", "before the 5th"). "soft" for a preferred or vague date, a scheduled time or appointment ("on Friday", "at 3pm", "dentist Tuesday"), or no date at all. When unsure use "soft".
- "importance": your best STARTING GUESS of how much this matters to the user — "high", "normal", or "low" — judged from their words (e.g. "really need to", "important", or a big consequence -> high; a routine errand -> low). When unsure use "normal". It is only a suggestion the user can change.
- "tags": 0-3 short lower-case CATEGORY labels for the life-area or kind of thing (e.g. "work", "family", "health", "home", "money", "social", "admin", "fun"). Use whatever fits; you are not limited to that list.
- CRUCIAL: a tag is a CATEGORY, never an importance level. Do NOT raise importance just because something is "work", nor lower it because it is "fun". Importance and category are judged separately.

Return only the structured result.

Example — if today is Sunday, 2026-06-07, and the user dumps:
"tysday i gotta call the denist at 3pm and also mums bday is comin up and rly need to send the rent by friday"
you return:
{"items":[
  {"title":"Call dentist","type":"task","date":"2026-06-09","time":"15:00","deadlineType":"soft","importance":"normal","tags":["health"],"when_text":"Tuesday 3pm"},
  {"title":"Mum's birthday","type":"appointment","date":"","time":"","deadlineType":"soft","importance":"normal","tags":["family"],"when_text":"coming up"},
  {"title":"Send the rent","type":"task","date":"2026-06-12","time":"","deadlineType":"hard","importance":"high","tags":["money","home"],"when_text":"by Friday"}
]}`;

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
function userTurn(nowLabel, today, text) {
  return `Right now it is ${nowLabel} (today's date is ${today}).\n\nHere is what I dumped. Sort it:\n"""\n${text}\n"""`;
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

// Engine: Ollama on this machine (the chosen setup). Its native /api/chat lets
// us turn thinking OFF cleanly and ask for a fixed JSON shape. Built-in fetch
// only — nothing leaves the machine.
async function understandWithOllama(cfg, nowLabel, today, text) {
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/api/chat";
  const headers = { "Content-Type": "application/json" };
  const base = {
    model: cfg.model,
    stream: false,
    options: { temperature: 0.2 },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userTurn(nowLabel, today, text) },
    ],
  };
  // Strongest first (schema-constrained + thinking off), then degrade for older
  // Ollama versions that lack one of those knobs.
  const variants = [
    { ...base, think: false, format: SCHEMA },
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
  const parsed = extractJson(data?.message?.content ?? "");
  return Array.isArray(parsed.items) ? parsed.items : [];
}

// Engine: any OpenAI-compatible server (LM Studio, a free cloud tier, or
// Ollama's /v1 socket). Kept so the box stays swappable.
async function understandWithOpenAI(cfg, nowLabel, today, text) {
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
  const base = {
    model: cfg.model,
    temperature: 0.2,
    max_tokens: 1000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userTurn(nowLabel, today, text) },
    ],
  };
  let resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...base,
      response_format: { type: "json_schema", json_schema: { name: "organiser_items", strict: true, schema: SCHEMA } },
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
  const parsed = extractJson(content);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

// Engine: Anthropic cloud (uses the official SDK, loaded only if needed).
async function understandWithAnthropic(cfg, nowLabel, today, text) {
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
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userTurn(nowLabel, today, text) }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("No content returned from the model.");
  const parsed = JSON.parse(block.text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function handleUnderstand(res, body) {
  const text = (body?.text || "").toString().trim();
  if (!text) return sendJson(res, 400, { error: "empty", message: "There was nothing to sort." });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  const today = ISO.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
  const nowLabel = typeof body?.now === "string" && body.now.trim() ? body.now.trim() : `${weekdayName(today)}, ${today}`;

  try {
    let items;
    if (cfg.engine === "anthropic") items = await understandWithAnthropic(cfg, nowLabel, today, text);
    else if (cfg.engine === "ollama") items = await understandWithOllama(cfg, nowLabel, today, text);
    else items = await understandWithOpenAI(cfg, nowLabel, today, text);
    sendJson(res, 200, { items });
  } catch (e) {
    const detail = e?.message || String(e);
    console.error("[understand] failed:", detail);
    let friendly = e?.friendly;
    if (!friendly) {
      if (cfg.engine === "ollama")
        friendly = "Can't reach your local AI. Make sure Ollama is running and the model is installed, then try again.";
      else if (cfg.engine === "anthropic") friendly = "I couldn't sort that just now.";
      else friendly = "Can't reach your local AI. In LM Studio, load your model and click Start Server, then try again.";
    }
    sendJson(res, 502, { error: "sort_failed", message: friendly });
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
};

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
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// --- routing ---------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      const cfg = aiConfig();
      return sendJson(res, 200, { ok: true, hasAI: !!cfg, engine: cfg ? cfg.engine : null, dataFile: DATA_FILE });
    }

    if (pathname === "/api/data") {
      if (req.method === "GET") return sendJson(res, 200, readData());
      if (req.method === "PUT" || req.method === "POST") {
        const body = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          return sendJson(res, 400, { error: "bad_json", message: "Could not read the data." });
        }
        const savedAt = writeData(parsed);
        return sendJson(res, 200, { ok: true, savedAt });
      }
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    if (pathname === "/api/understand" && req.method === "POST") {
      const body = await readBody(req);
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* leave empty */
      }
      return handleUnderstand(res, parsed);
    }

    if (req.method === "GET" || req.method === "HEAD") return serveStatic(pathname, res);
    return sendJson(res, 404, { error: "not_found" });
  } catch (e) {
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
  console.log("\n  Keep this window open while you use the organiser. Close it to stop.\n");
  openBrowser(url);
});

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* opening the browser is best-effort; the URL is printed above */
  }
}
