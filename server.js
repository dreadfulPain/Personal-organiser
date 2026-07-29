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
  return { version: 1, items: [], waiting: [], goals: [], records: [], recordConfig: null, portfolio: null, contacts: [], contactConfig: null, schedule: [], scheduleConfig: null, savedAt: null };
}

function normaliseDoc(d) {
  return {
    version: 1,
    items: Array.isArray(d.items) ? d.items : [],
    waiting: Array.isArray(d.waiting) ? d.waiting : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    records: Array.isArray(d.records) ? d.records : [],
    recordConfig: d.recordConfig && typeof d.recordConfig === "object" ? d.recordConfig : null,
    portfolio: d.portfolio && typeof d.portfolio === "object" ? d.portfolio : null,
    contacts: Array.isArray(d.contacts) ? d.contacts : [],
    contactConfig: d.contactConfig && typeof d.contactConfig === "object" ? d.contactConfig : null,
    schedule: Array.isArray(d.schedule) ? d.schedule : [],
    scheduleConfig: d.scheduleConfig && typeof d.scheduleConfig === "object" ? d.scheduleConfig : null,
    savedAt: d.savedAt || null,
  };
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
  let current = { goals: [], records: [], recordConfig: null, portfolio: null, contacts: [], contactConfig: null, schedule: [], scheduleConfig: null, savedAt: null };
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
      const kept = {
        version: 1,
        savedAt: new Date().toISOString(),
        items: Array.isArray(input.items) ? input.items : [],
        waiting: Array.isArray(input.waiting) ? input.waiting : [],
        goals: Array.isArray(input.goals) ? input.goals : current.goals || [],
        records: Array.isArray(input.records) ? input.records : current.records || [],
        recordConfig: input.recordConfig && typeof input.recordConfig === "object" ? input.recordConfig : current.recordConfig || null,
        portfolio: input.portfolio && typeof input.portfolio === "object" ? input.portfolio : current.portfolio || null,
        contacts: Array.isArray(input.contacts) ? input.contacts : current.contacts || [],
        contactConfig: input.contactConfig && typeof input.contactConfig === "object" ? input.contactConfig : current.contactConfig || null,
        schedule: Array.isArray(input.schedule) ? input.schedule : current.schedule || [],
        scheduleConfig: input.scheduleConfig && typeof input.scheduleConfig === "object" ? input.scheduleConfig : current.scheduleConfig || null,
      };
      fs.writeFileSync(path.join(BACKUP_DIR, `conflict-${stamp}.json`), JSON.stringify(kept, null, 2));
      pruneBackups();
    } catch (e) {
      console.warn("[data] conflict copy warning:", e.message);
    }
    const err = new Error("conflict");
    err.conflict = true;
    err.current = current;
    throw err;
  }

  // Preserve any half a save didn't include (goals, records, config).
  const goals = Array.isArray(input.goals) ? input.goals : current.goals || [];
  const records = Array.isArray(input.records) ? input.records : current.records || [];
  const recordConfig =
    input.recordConfig && typeof input.recordConfig === "object" ? input.recordConfig : current.recordConfig || null;
  const portfolio =
    input.portfolio && typeof input.portfolio === "object" ? input.portfolio : current.portfolio || null;
  const contacts = Array.isArray(input.contacts) ? input.contacts : current.contacts || [];
  const contactConfig =
    input.contactConfig && typeof input.contactConfig === "object" ? input.contactConfig : current.contactConfig || null;
  const schedule = Array.isArray(input.schedule) ? input.schedule : current.schedule || [];
  const scheduleConfig =
    input.scheduleConfig && typeof input.scheduleConfig === "object" ? input.scheduleConfig : current.scheduleConfig || null;
  const doc = {
    version: 1,
    savedAt: new Date().toISOString(),
    items: Array.isArray(input.items) ? input.items : [],
    waiting: Array.isArray(input.waiting) ? input.waiting : [],
    goals,
    records,
    recordConfig,
    portfolio,
    contacts,
    contactConfig,
    schedule,
    scheduleConfig,
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
          effort: { type: "string", enum: ["quick", "medium", "draining"] },
          tags: { type: "array", items: { type: "string" } },
          when_text: { type: "string" },
          goal: { type: "string" },
          open_loop: { type: "boolean" },
          promised_to: { type: "string" },
        },
        required: ["title", "type", "date", "time", "deadlineType", "importance", "effort", "tags", "when_text", "goal", "open_loop", "promised_to"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// Goal breakdown (§9 milestones slice 2): a goal title → a few SMALL milestones,
// each with a couple of concrete first steps. Same strict-shape discipline.
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

Also set "deadlineType", "importance", "effort" and "tags":
- "deadlineType": "hard" when the date is a REAL deadline with consequences ("by Friday", "due Monday", "before the 5th"). "soft" for a preferred or vague date, a scheduled time or appointment ("on Friday", "at 3pm", "dentist Tuesday"), or no date at all. When unsure use "soft".
- "importance": your best STARTING GUESS of how much this matters to the user — "high", "normal", or "low" — judged from their words (e.g. "really need to", "important", or a big consequence -> high; a routine errand -> low). When unsure use "normal". It is only a suggestion the user can change.
- "effort": your best STARTING GUESS of how much energy the task takes — "quick" (a couple of minutes, light: a short email, a quick call), "medium" (normal), or "draining" (long or heavy: a big report, a hard conversation). Judge it from the task SIZE; you cannot know what personally tires the user, so this is only a starting guess they can change. When unsure use "medium".
- "tags": 0-3 short lower-case CATEGORY labels for the life-area or kind of thing (e.g. "work", "family", "health", "home", "money", "social", "admin", "fun"). Use whatever fits; you are not limited to that list.
- CRUCIAL: a tag is a CATEGORY, never an importance level. Do NOT raise importance just because something is "work", nor lower it because it is "fun". Importance and category are judged separately.

Also set "goal":
- A list of the user's existing goals may be given at the end of their message. If an item CLEARLY and confidently belongs to one of those goals, set "goal" to that goal's EXACT title (copied character-for-character).
- Otherwise — if you are not sure, or no goals are listed — use an empty string "". Most items belong to no goal; only link an obvious, confident match.
- NEVER invent a goal title that is not in the list. A wrong link is worse than no link.

Also set "open_loop" and "promised_to":
- "open_loop": true ONLY when the words say the thing is already started or prepared but not finished or sent — "drafted", "wrote it but haven't sent it", "half done", "still need to send / submit / hand in". A brand-new task is false. When unsure use false.
- "promised_to": the NAME of a person this has been committed to ("told Sam I'd send it", "promised mum", "Sarah is waiting on it"), else "". A person merely mentioned is NOT a promise — only a stated commitment or someone clearly waiting.

Return only the structured result.

Example — if today is Sunday, 2026-06-07, and the user dumps:
"tysday i gotta call the denist at 3pm and also mums bday is comin up and rly need to send the rent by friday. also i drafted the trip email for sarah but havnt sent it, she needs it thursday"
you return:
{"items":[
  {"title":"Call dentist","type":"task","date":"2026-06-09","time":"15:00","deadlineType":"soft","importance":"normal","effort":"quick","tags":["health"],"when_text":"Tuesday 3pm","goal":"","open_loop":false,"promised_to":""},
  {"title":"Mum's birthday","type":"appointment","date":"","time":"","deadlineType":"soft","importance":"normal","effort":"medium","tags":["family"],"when_text":"coming up","goal":"","open_loop":false,"promised_to":""},
  {"title":"Send the rent","type":"task","date":"2026-06-12","time":"","deadlineType":"hard","importance":"high","effort":"quick","tags":["money","home"],"when_text":"by Friday","goal":"","open_loop":false,"promised_to":""},
  {"title":"Send trip email to Sarah","type":"task","date":"2026-06-11","time":"","deadlineType":"hard","importance":"normal","effort":"quick","tags":["social"],"when_text":"by Thursday","goal":"","open_loop":true,"promised_to":"Sarah"}
]}`;

// Goal breakdown prompt (§9 slice 2). Carves a goal into SMALL, soon-reachable
// milestones — the opposite of the overwhelm reflex. Domain-agnostic (§0.2): it
// must work for any goal without knowing what the goal is "about".
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
function userTurn(nowLabel, today, text, goals) {
  let s = `Right now it is ${nowLabel} (today's date is ${today}).\n\nHere is what I dumped. Sort it:\n"""\n${text}\n"""`;
  const titles = Array.isArray(goals)
    ? goals.map((g) => (g && g.title ? String(g.title).trim() : "")).filter(Boolean)
    : [];
  if (titles.length) {
    s +=
      `\n\nMy existing goals (only set an item's "goal" to one of these EXACT titles if it clearly belongs, otherwise ""):\n` +
      titles.map((t) => `- ${t}`).join("\n");
  }
  return s;
}

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
function runEngine(cfg, system, user, schema) {
  if (cfg.engine === "anthropic") return callAnthropic(cfg, system, user, schema);
  if (cfg.engine === "ollama") return callOllama(cfg, system, user, schema);
  return callOpenAI(cfg, system, user, schema);
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

async function handleUnderstand(res, body) {
  const text = (body?.text || "").toString().trim();
  if (!text) return sendJson(res, 400, { error: "empty", message: "There was nothing to sort." });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI sorting isn't switched on yet." });

  const today = ISO.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
  const nowLabel = typeof body?.now === "string" && body.now.trim() ? body.now.trim() : `${weekdayName(today)}, ${today}`;
  const goals = Array.isArray(body?.goals) ? body.goals : [];

  try {
    const parsed = await runEngine(cfg, SYSTEM_PROMPT, userTurn(nowLabel, today, text, goals), SCHEMA);
    const items = (Array.isArray(parsed.items) ? parsed.items : []).map((it) => linkGoal(it, goals));
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

// Goal breakdown (§9 slice 2): a typed goal → a few small AI-proposed milestones.
// This is the goals usability unlock — the user names a goal in a sentence and the
// app does the carving (manual entry was only scaffolding). Graceful: 503 when AI
// is off / 502 when it fails, so the page just keeps the goal empty for hand-entry.
async function handleBreakdown(res, body) {
  const title = (body?.title || "").toString().trim();
  if (!title) return sendJson(res, 400, { error: "empty", message: "There was no goal to break down." });

  const cfg = aiConfig();
  if (!cfg) return sendJson(res, 503, { error: "no_engine", message: "AI breakdown isn't switched on yet." });

  try {
    const parsed = await runEngine(cfg, BREAKDOWN_PROMPT, breakdownTurn(title, body?.priorCounts), BREAKDOWN_SCHEMA);
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
    const parsed = await runEngine(cfg, CLUSTER_PROMPT, clusterTurn(tasks), CLUSTER_SCHEMA);
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
- Ignore greetings, thanks, small talk, and anything already settled or already done.
- If a message shows its own date/time, resolve "Friday"/"tomorrow" against THAT message's date; otherwise use the today you are given.
- Write every title and summary in ENGLISH even when the conversation is in another language — translate the essential action; the user reads their list in English. Keep a person's name as written.
- If nothing in the conversation needs the user to act or remember, return no entries at all.

For a "task" entry set: title (short, verb-first for to-dos), item_type (task | appointment | reminder | note), date (YYYY-MM-DD or "" — resolve "tuesday"/"tomorrow" from the given today), time ("HH:MM" or ""), deadline ("hard" for a real deadline with consequences, else "soft"), importance ("high"/"normal"/"low"), effort ("quick"/"medium"/"draining"), tags (0-3 lowercase categories), when_text (the user's own time phrase, or ""), goal_link (the EXACT title of one listed goal it clearly belongs to, else ""), open_loop (true only if already started/prepped but not sent/finished), promised_to (a person's name it's committed to, else ""), standard (the EXACT code of one listed standard the task EXPLICITLY names, e.g. "TS4" in "prep TS4 display" — else ""; never guess a standard from the topic).

For a "record" entry set: who (EXACTLY one ID from the list, or "" if unsure — never invent one), note_type (the best-fitting kind from the list), summary (one clean line), topic (an EXACT skill from the list if it's clearly evidence of one, else ""), level (an EXACT level from the list only if a judgement is stated, else ""), tags, follow_up (true if it needs chasing later), follow_up_date (YYYY-MM-DD when implied, else "").

For a "goal" entry set: title (a few plain words).

For a "handover" entry set: person, direction, note (leave the task/record fields empty).

Return only the structured result.

Example — today is Monday 2026-09-07; IDs: S01, S02, S03; kinds: assessment, parent; goals: Learn guitar; standards: TS4, TS7. Note:
"s3 realy struggled with full stops in writing, chase his mum friday. also book the dentist for tuesday, prep the TS4 display, and i want to get fit"
you return:
{"entries":[
  {"kind":"record","who":"S03","note_type":"assessment","summary":"Struggled with full stops in writing","topic":"","level":"","tags":["writing"],"follow_up":false,"follow_up_date":"","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","standard":"","person":"","direction":"","note":""},
  {"kind":"record","who":"S03","note_type":"parent","summary":"Chase mum about full stops","topic":"","level":"","tags":[],"follow_up":true,"follow_up_date":"2026-09-11","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","standard":"","person":"","direction":"","note":""},
  {"kind":"task","title":"Book the dentist","item_type":"task","date":"2026-09-08","time":"","deadline":"soft","importance":"normal","effort":"quick","tags":["health"],"when_text":"Tuesday","goal_link":"","open_loop":false,"promised_to":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""},
  {"kind":"task","title":"Prep the display","item_type":"task","date":"","time":"","deadline":"soft","importance":"normal","effort":"medium","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"TS4","person":"","direction":"","note":""},
  {"kind":"goal","title":"Get fit","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""}
]}

Example of a PASTED CONVERSATION — today is Monday 2026-09-07; IDs: S01, S02, S03; kinds: assessment, parent. Note:
"[Mon 09:14] Wang Li (S02's mum): Hello teacher! Thank you for yesterday.
[Mon 09:15] Wang Li: Could you send the reading list before Friday? Also XiaoMing was upset about the seating change.
[Mon 09:20] Me: Of course, I'll email it Thursday. I'll keep an eye on him."
you return:
{"entries":[
  {"kind":"task","title":"Email the reading list to Wang Li","item_type":"task","date":"2026-09-10","time":"","deadline":"hard","importance":"normal","effort":"quick","tags":[],"when_text":"Thursday","goal_link":"","open_loop":false,"promised_to":"Wang Li","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":"","person":"","direction":"","note":""},
  {"kind":"record","who":"S02","note_type":"parent","summary":"Mum says he was upset about the seating change","topic":"","level":"","tags":["pastoral"],"follow_up":true,"follow_up_date":"2026-09-08","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","when_text":"","goal_link":"","open_loop":false,"promised_to":"","standard":"","person":"","direction":"","note":""}
]}
(The greeting and the thanks produced nothing; the mother's own words became a record about her child, and the two things the user committed to became one dated task promised to her.)

Example of a HANDOVER — "sarah's passed me the year 4 display board, and i gave the trip forms to tom" becomes:
{"entries":[
  {"kind":"handover","person":"Sarah","direction":"to_me","note":"Year 4 display board","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":""},
  {"kind":"handover","person":"Tom","direction":"from_me","note":"Trip forms","title":"","item_type":"","date":"","time":"","deadline":"","importance":"","effort":"","tags":[],"when_text":"","goal_link":"","open_loop":false,"promised_to":"","who":"","note_type":"","summary":"","topic":"","level":"","follow_up":false,"follow_up_date":"","standard":""}
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
          "when_text", "goal_link", "open_loop", "promised_to", "who", "note_type", "summary",
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
  try {
    const parsed = await runEngine(cfg, TIMETABLE_PROMPT, `Turn this timetable into blocks:\n"""\n${text.slice(0, 8000)}\n"""`, TIMETABLE_SCHEMA);
    const blocks = [];
    (Array.isArray(parsed.blocks) ? parsed.blocks : []).slice(0, 200).forEach((b) => {
      const label = (b.label || "").toString().trim().slice(0, 80);
      const start = tidyHM(b.start);
      const end = tidyHM(b.end);
      if (!label || !start || !end || end <= start) return; // a block with no width isn't a block
      const days = (Array.isArray(b.days) ? b.days : [])
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (!days.length) return;
      blocks.push({ label, start, end, days, soft: false, source: "paste" });
    });
    return sendJson(res, 200, { blocks });
  } catch (e) {
    console.warn("[timetable] failed:", e?.message || e);
    return sendJson(res, 502, { error: "ai_failed", message: "Couldn't read that just now — you can still type the blocks in by hand." });
  }
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
      ROUTE_SCHEMA
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
        },
      });
    });
    sendJson(res, 200, { entries });
  } catch (e) {
    console.error("[route] failed:", e?.message || e);
    sendJson(res, 502, { error: "sort_failed", message: "I couldn't sort that just now." });
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
      spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else {
      spawn("notify-send", [title, body], { detached: true, stdio: "ignore" }).unref();
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

function checkReminders() {
  try {
    const now = new Date();
    const doc = readData();
    // Inside a lesson, meeting, or anything else you called fixed: hold everything.
    const busy = fixedBlockAt(doc.schedule, now);
    if (busy) return;
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
      due.forEach((it) => (it.remindedAt = stamp));
      aged.forEach((it) => (it.agedAt = stamp));
      console.log(`[remind] batched ${due.length + aged.length}`);
      writeData(doc, { baseSavedAt: doc.savedAt });
      return;
    }
    due.forEach((it) => {
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
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
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
      return sendJson(res, 200, { ok: true, hasAI: !!cfg, engine: cfg ? cfg.engine : null, stt: stt ? "local" : "off", dataFile: DATA_FILE });
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
        const body = await readBody(req);
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

    if (pathname === "/api/transcribe" && req.method === "POST") {
      return handleTranscribe(req, res, reqUrl.searchParams);
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
