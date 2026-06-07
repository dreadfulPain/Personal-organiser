import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// THE TWO HALVES (see the design tracker, §0.1)
//
//   SEEING    = the static files in /public. Reads from the browser's local
//               storage, renders the zones, ticks things off. No network, no
//               AI, never pauses. This server just hands those files over.
//
//   PUTTING IN = the /api/understand endpoint below. This is the one online,
//               AI-powered job: take a messy, misspelled dump and turn it into
//               clean, sorted items. This is the "magic" that fixes the exact
//               entry-friction that made every other app unusable.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(join(__dirname, "public")));

// The model that does the understanding. The latest, most capable Claude model
// reads messy / vague / misspelled input best — and getting it right is what
// builds trust. If you'd rather have faster, cheaper sorting, change this one
// line to a smaller model id (e.g. "claude-haiku-4-5").
const MODEL = "claude-opus-4-8";

// What we ask the model to return for every dump. Empty strings (not nulls)
// mean "none" — it keeps the shape simple and predictable.
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
          date: { type: "string" }, // "YYYY-MM-DD" when a day can be pinned, else ""
          when_text: { type: "string" }, // the user's own time phrase, else ""
        },
        required: ["title", "type", "date", "when_text"],
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

Return only the structured result.

Example — if today is Sunday, 2026-06-07, and the user dumps:
"tysday i gotta call the denist and also mums bday is comin up"
you return:
{"items":[
  {"title":"Call dentist","type":"task","date":"2026-06-09","when_text":"Tuesday"},
  {"title":"Mum's birthday","type":"appointment","date":"","when_text":"coming up"}
]}`;

// Construct the Anthropic client lazily, so the server still boots and serves
// the (offline) seeing half even when no API key is set.
let client;
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

// Lets the front-end show a gentle setup hint when no key is configured yet.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: !!process.env.ANTHROPIC_API_KEY });
});

// The magic: messy dump in -> clean, sorted items out.
app.post("/api/understand", async (req, res) => {
  const text = (req.body?.text || "").toString().trim();
  if (!text) {
    return res.status(400).json({ error: "empty", message: "There was nothing to sort." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "no_key",
      message: "No API key is set, so sorting is off right now.",
    });
  }

  const today = ISO.test(req.body?.today) ? req.body.today : new Date().toISOString().slice(0, 10);
  const todayLabel = `${weekdayName(today)}, ${today}`;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${todayLabel}.\n\nHere is what I dumped. Sort it:\n"""\n${text}\n"""`,
        },
      ],
      // Structured outputs: the first text block is guaranteed to be valid JSON
      // matching SCHEMA, so we can parse it without guesswork.
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block) throw new Error("No content returned from the model.");
    const data = JSON.parse(block.text);
    const items = Array.isArray(data.items) ? data.items : [];
    res.json({ items });
  } catch (err) {
    console.error("[understand] failed:", err?.message || err);
    res.status(502).json({
      error: "sort_failed",
      message: "I couldn't sort that just now.",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Personal Organiser is running:  http://localhost:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  Note: ANTHROPIC_API_KEY is not set, so sorting is off.");
    console.log("  Copy .env.example to .env and add your key, then restart.\n");
  }
});
