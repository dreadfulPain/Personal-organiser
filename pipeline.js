// THE PASTE PIPELINE — one call, one job, one short answer.
//
// WHY THIS EXISTS. The single "understand this conversation" call asked a 14B
// model to do five jobs at once: split the text, label each part, work out who
// said what, translate it, and find the dates. That is exactly where a small
// model fails — and it fails SILENTLY. It returns valid, schema-shaped JSON with
// two of the four items quietly missing. Nothing errors. You never find out.
//
// Splitting the work doesn't make the model cleverer. It makes each answer short
// enough to be right, and it makes failure VISIBLE: a failed step is one missing
// item you can see, not a truncated list you can't.
//
// THE STEPS
//   0. Split the text        — plain code, NO model. The most important step.
//   1. Is this for me?       — yes/no, batched, kills most of the volume
//   2. Render into English   — survivors only, once, KEEPING BOTH versions
//   3. What kind of thing?   — one label, read off the SOURCE
//   4. Pull out the details  — a tight schema per kind, read off the SOURCE
//   5. Coverage check        — "what in the original isn't represented here?"
//
// FOUR RULES THAT HOLD THROUGHOUT
//   - Nothing is ever dropped. A failed step parks its fragment as plain text
//     for you to glance at. There is one fallback in this whole file and that
//     is it.
//   - There is a hard ceiling on model calls. A huge paste degrading into "here
//     is a pile to sort" is a fine outcome; a frozen app is not.
//   - The coverage check POINTS AT TEXT. It is not allowed to create anything.
//   - UNDERSTANDING HAPPENS IN THE SOURCE LANGUAGE. Translation is a rendering
//     step for what you read, never a preprocessing step for what the app
//     decides. The model reads Chinese natively; putting a translation in front
//     of it would only add a lossy layer that every later step then reasons
//     about — and a garbled sentence would corrupt the label, the extraction
//     and the coverage check at once, invisibly.
//
// Testable without a GPU: every model call arrives through the injected `call`,
// so the whole pipeline can be driven by a fake in tests.

// ---------------------------------------------------------------- STEP 0
// SPLITTING HAPPENS IN CODE, NOT IN THE MODEL. This is the most important
// decision in the file: if the model does the splitting, everything downstream
// inherits its mistakes, and a line dropped here can never be recovered by any
// later step — including the coverage check, which would never know it existed.
//
// Chat and email pastes have real structure. Find it with a regex, not a guess.

const SPEAKER_RE = /^\s*(?:[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s+)?([^\n:：]{1,40}?)\s*[:：]\s*(\S.*)$/;
const TIME_ONLY_RE = /^\s*[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*$/;
const EMAIL_HEADER_RE = /^\s*(from|to|cc|bcc|subject|sent|date|发件人|收件人|抄送|主题|日期)\s*[:：]/i;
const REPLY_MARKER_RE = /^\s*(>+|-{2,}\s*original message|on .{3,80}\bwrote:|在.{2,60}写道[：:])/i;

function scanLines(src) {
  const out = [];
  let at = 0;
  for (const raw of src.split("\n")) {
    out.push({ text: raw, start: at, end: at + raw.length });
    at += raw.length + 1;
  }
  return out;
}

function frag(text, start, end, extra) {
  return { text: text.trim(), start, end, speaker: "", when: "", ...(extra || {}) };
}

// A real chat needs more than one line with "something:" in it — otherwise
// "Note: buy milk" reads as a speaker called Note. So: at least two such lines,
// AND either a timestamp somewhere or a name that repeats.
function detectChat(lines) {
  const hits = [];
  lines.forEach((l, i) => {
    if (EMAIL_HEADER_RE.test(l.text) || REPLY_MARKER_RE.test(l.text)) return;
    const m = SPEAKER_RE.exec(l.text);
    if (m) hits.push({ i, when: m[1] || "", speaker: m[2].trim(), body: m[3] });
  });
  if (hits.length < 2) return null;
  const names = hits.map((h) => h.speaker.toLowerCase());
  const repeats = names.some((n, i) => names.indexOf(n) !== i);
  const timed = hits.some((h) => h.when) || lines.some((l) => TIME_ONLY_RE.test(l.text));
  if (!repeats && !timed) return null;

  const out = [];
  let cur = null;
  let pendingWhen = "";
  lines.forEach((l, i) => {
    const t = TIME_ONLY_RE.exec(l.text);
    if (t) {
      pendingWhen = t[1]; // a bare timestamp line belongs to what follows
      return;
    }
    const hit = hits.find((h) => h.i === i);
    if (hit) {
      if (cur) out.push(cur);
      cur = frag(hit.body, l.start + l.text.indexOf(hit.body), l.end, {
        speaker: hit.speaker,
        when: hit.when || pendingWhen,
        source: "chat",
      });
      pendingWhen = "";
      return;
    }
    // A line with no speaker continues the last one — people press enter
    // mid-thought and that is one message, not two.
    if (cur && l.text.trim()) {
      cur.text = (cur.text + " " + l.text.trim()).trim();
      cur.end = l.end;
    }
  });
  if (cur) out.push(cur);
  return out.filter((f) => f.text);
}

// Email: split at headers and quoted-reply markers. Everything between two
// markers is one fragment.
function detectEmail(lines) {
  const marked = lines.some((l) => EMAIL_HEADER_RE.test(l.text) || REPLY_MARKER_RE.test(l.text));
  if (!marked) return null;
  const out = [];
  let cur = null;
  lines.forEach((l) => {
    const isMarker = EMAIL_HEADER_RE.test(l.text) || REPLY_MARKER_RE.test(l.text);
    if (isMarker) {
      if (cur && cur.text) out.push(cur);
      cur = null;
      // A header line is kept as its own fragment: "Subject: trip money" often
      // IS the thing that matters, and throwing it away loses that.
      if (l.text.trim()) out.push(frag(l.text.replace(/^\s*>+\s*/, ""), l.start, l.end, { source: "email-header" }));
      return;
    }
    if (!l.text.trim()) {
      if (cur && cur.text) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = frag(l.text, l.start, l.end, { source: "email" });
    else {
      cur.text = (cur.text + " " + l.text.trim()).trim();
      cur.end = l.end;
    }
  });
  if (cur && cur.text) out.push(cur);
  return out.filter((f) => f.text);
}

// Blank-line-separated paragraphs, then single lines.
function detectBlocks(src, lines) {
  const nonEmpty = lines.filter((l) => l.text.trim());
  if (nonEmpty.length < 2) return null;
  const out = [];
  let cur = null;
  lines.forEach((l) => {
    if (!l.text.trim()) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = frag(l.text, l.start, l.end, { source: "line" });
    else {
      // A bullet or a numbered item starts something new even without a blank
      // line between — that's what the marker is for.
      if (/^\s*([-*•]|\d+[.)])\s+/.test(l.text)) {
        out.push(cur);
        cur = frag(l.text, l.start, l.end, { source: "line" });
        return;
      }
      cur.text = (cur.text + " " + l.text.trim()).trim();
      cur.end = l.end;
    }
  });
  if (cur) out.push(cur);
  return out.length > 1 ? out : null;
}

// Last resort: one long paragraph. Still code, still no model.
function sentences(src) {
  const out = [];
  // THE `m` IS LOAD-BEARING. Without it `$` means end of the whole text, so the
  // second alternative could only ever match the LAST line — and a line with no
  // full stop on the end matched neither alternative and was dropped. Six lines
  // typed into the box came back as one: the last one. Nobody punctuates a
  // brain dump, so this was the ordinary case, not the odd one.
  const re = /[^.!?。！？\n]+[.!?。！？]+["'”’)]*\s*|[^.!?。！？\n]+$/gm;
  let m;
  while ((m = re.exec(src))) {
    const text = m[0].trim();
    if (text) out.push(frag(text, m.index, m.index + m[0].length, { source: "sentence" }));
  }
  return glueNumbers(out, src);
}

// A FULL STOP BETWEEN TWO DIGITS IS NOT THE END OF A SENTENCE.
//
// "gate duty tues and thurs before school from 7.40, mr chen does mon wed fri"
// came back as two things: "…from 7." and "40, mr chen does mon wed fri" — the
// second of which went on the list, as a task, dated tomorrow. 7.40 is how most
// of the English-speaking world writes twenty to eight, so this was not an odd
// input; it was Tuesday.
//
// Done as a mend afterwards rather than inside the pattern above, because that
// pattern is doing something subtle with `m` and `$` already and every edit to
// it has cost a day. This is the same rule stated once: if a piece ends on a
// digit-and-dot and the next one starts with a digit, they were never two
// pieces. Prices, version numbers and "section 3.2" are mended by it too.
function glueNumbers(frags, src) {
  const out = [];
  for (const f of frags) {
    const prev = out[out.length - 1];
    if (prev && /\d\.$/.test(prev.text) && /^\d/.test(f.text)) {
      prev.text = prev.text + f.text;
      prev.end = f.end;
      continue;
    }
    out.push(f);
  }
  return out.length ? out : [frag(src, 0, src.length, { source: "whole" })];
  return out.length ? out : [frag(src, 0, src.length, { source: "whole" })];
}

export function splitFragments(text) {
  const src = String(text || "");
  if (!src.trim()) return [];
  const lines = scanLines(src);
  const chat = detectChat(lines);
  if (chat && chat.length > 1) return chat;
  const email = detectEmail(lines);
  if (email && email.length > 1) return email;
  const blocks = detectBlocks(src, lines);
  if (blocks) return blocks;
  return sentences(src);
}

// Detected in CODE, not with a model call — a character range is a fact and a
// fact shouldn't cost a round trip.
const NON_LATIN = /[぀-ヿ㐀-䶿一-鿿가-힯Ѐ-ӿ؀-ۿ฀-๿]/g;
export function looksNonEnglish(text) {
  const s = String(text || "").replace(/\s/g, "");
  if (!s) return false;
  const hits = (s.match(NON_LATIN) || []).length;
  return hits / s.length > 0.15;
}

// ---------------------------------------------------- GROUNDING (no model)
//
// The most common way a small model fails is not refusing — it's inventing
// something plausible. A date that was never mentioned. A name nobody said. And
// invention is exactly the failure you cannot spot by reading the output,
// because plausible is what it's optimised for.
//
// So before a field that CLAIMS to come from your text gets filed, the code goes
// and looks for it. No second model call: a search cannot hallucinate, costs
// nothing, and can't fail in the same direction as the thing it's checking.
//
// What is NOT grounded, deliberately:
//   - titles and summaries. Those are paraphrases; that's their job. Demanding
//     a summary appear verbatim would fail on every correct answer.
//   - ids, skills, levels. Those are checked against your lists instead, which
//     is stronger than a text search.
//
// And when grounding FAILS, the value is not thrown away and not guessed at. It
// gets filed wearing a louder chip, because it may well be right — it just
// wasn't traceable, and you're the one who should decide.

// Anything in the text that could legitimately have produced a date. We can't
// verify WHICH date "Friday" meant, but we can verify that something date-shaped
// was said at all — and "nothing date-shaped was said" is the case that matters.
const DATE_HINT =
  /\b(mon|tues?|wed|thur?s?|fri|sat|sun)(day)?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(today|tonight|tomorrow|tmrw|yesterday|weekend|asap|eod|eow)\b|\bnext (week|month|term|monday|tuesday|wednesday|thursday|friday)\b|\bthis (week|month|term|morning|afternoon|evening|friday|monday)\b|\bend of (the )?(day|week|month|term)\b|\bin (a|two|three|\d+) (day|days|week|weeks)\b|\b\d{1,2}(st|nd|rd|th)\b|\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|[今明昨][天日]|下?周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]|本周|下周|月底|周末/i;

export function hasDateHint(source) {
  return DATE_HINT.test(String(source || ""));
}

// A name should actually appear. People write names as written, so a substring
// match is fair — and a name the model produced from nowhere is exactly what
// this is for.
export function nameAppears(name, source) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true; // an empty field claims nothing, so there's nothing to ground
  const hay = String(source || "").toLowerCase();
  if (hay.includes(n)) return true;
  // "Wei Zhang" is grounded by "Wei" — a first name alone is still traceable.
  return n.split(/\s+/).filter((p) => p.length > 1).some((p) => hay.includes(p));
}

// Returns the list of field names that could NOT be traced back to the text.
// An empty list means everything checkable was checkable.
export function ungroundedFields(entry, source) {
  const out = [];
  if (!entry || !source) return out;
  if (entry.kind === "task" && entry.item) {
    if (entry.item.date && !hasDateHint(source)) out.push("date");
    if (entry.item.promisedTo && !nameAppears(entry.item.promisedTo, source)) out.push("promised to");
    if (entry.item.waitingOn && !nameAppears(entry.item.waitingOn, source)) out.push("who you're waiting on");
  }
  if (entry.kind === "handover" && entry.handover) {
    if (!nameAppears(entry.handover.person, source)) out.push("person");
  }
  if (entry.kind === "record" && entry.record) {
    if (entry.record.followUpDate && !hasDateHint(source)) out.push("follow-up date");
  }
  return out;
}

// ------------------------------------------------------------- THE SCHEMAS
// Each one asks for the least it can. Never one schema with fifteen optional
// fields — optional fields are exactly where a small model starts inventing.

const MINE_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, mine: { type: "boolean" } },
        required: ["n", "mine"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

const kindSchema = (kinds) => ({
  type: "object",
  properties: { kind: { type: "string", enum: kinds } },
  required: ["kind"],
  additionalProperties: false,
});

const TASK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    date: { type: "string" },
    not_before: { type: "string" },
    promised_to: { type: "string" },
    waiting_on: { type: "string" },
  },
  required: ["title", "date", "not_before", "promised_to", "waiting_on"],
  additionalProperties: false,
};
const RECORD_SCHEMA = {
  type: "object",
  properties: {
    who: { type: "string" },
    note_type: { type: "string" },
    summary: { type: "string" },
    topic: { type: "string" },
    level: { type: "string" },
  },
  required: ["who", "note_type", "summary", "topic", "level"],
  additionalProperties: false,
};
const GOAL_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};
const HANDOVER_SCHEMA = {
  type: "object",
  properties: { person: { type: "string" }, direction: { type: "string" }, note: { type: "string" } },
  required: ["person", "direction", "note"],
  additionalProperties: false,
};
const TRANSLATE_SCHEMA = {
  type: "object",
  properties: { english: { type: "string" } },
  required: ["english"],
  additionalProperties: false,
};
const COVERAGE_SCHEMA = {
  type: "object",
  properties: {
    missed: {
      type: "array",
      items: {
        type: "object",
        properties: { quote: { type: "string" }, why: { type: "string" } },
        required: ["quote", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["missed"],
  additionalProperties: false,
};

// -------------------------------------------------------------- THE PROMPTS

const MINE_PROMPT = `You decide, for each numbered line, ONE thing: is there something in it for the reader to DO or REMEMBER?

Answer "mine": true only if the line contains an action, a commitment, a fact worth recording, or something the reader was asked for.

Answer false for: greetings, goodbyes, thanks, small talk, emoji-only lines, someone else's task that doesn't involve the reader, general announcements with nothing to do, and anything purely social.

Answer for EVERY number you are given. Do not skip any. Do not add numbers you weren't given.

Lines may be in any language. Judge them as written.`;

const KIND_PROMPT = `You give ONE label to one short piece of text. Nothing else.

Choose the single label that best fits what the reader would need to do with it. If two could fit, choose the one the text is most directly about.

The text may not be in English. Read it exactly as it is — a label is a judgement about meaning, and meaning lives in the words that were actually written.`;

const TASK_PROMPT = `Pull out ONE thing to do from this text.

- "title": what to do, in plain words, as short as possible. Imperative if you can.
- "date": when it is DUE, only if the text states or clearly implies one. Use YYYY-MM-DD. If not stated, leave it empty. Never guess a date.
- "not_before": the earliest it could POSSIBLY be done, if the text says the thing depends on something happening first — "after the parent meeting on Friday", "once the visit is over". This is not the same as the due date. Use YYYY-MM-DD, and only when a real date can be worked out. Otherwise empty.
- "promised_to": only if the text names the person the reader OWES it to. Otherwise empty.
- "waiting_on": only if the reader has done their part and is waiting to hear back from someone named. The ball is in that person's court, not the reader's. Otherwise empty. Never fill both this and "promised_to".

Never invent detail that isn't there. Empty is always a valid answer for a field.

The text may not be in English. Read it exactly as it is — do not translate it in your head first — and write your answer in English.`;

const RECORD_PROMPT = `Pull out ONE note about a person from this text.

- "who": ONLY an id from the list you are given. If the text names someone not on that list, leave it EMPTY. Never guess an id, and never make one up.
- "note_type": one of the kinds you are given.
- "summary": one plain line about what happened.
- "topic" and "level": ONLY if the text explicitly states one from the lists you are given. Otherwise empty.

Empty fields are correct answers. Inventing is not.

The text may not be in English. Read it exactly as it is — do not translate it in your head first — and write your answer in English.`;

const GOAL_PROMPT = `Turn this text into ONE short goal title — something the reader is trying to get better at or reach. Keep it to a few words.

The text may not be in English. Read it exactly as it is — do not translate it in your head first — and write your answer in English.`;

const HANDOVER_PROMPT = `Work out ONE transfer of work from this text.

- "person": who it involves.
- "direction": "to_me" if work is being passed TO the reader, "from_me" if the reader is passing it to someone else.
- "note": a few words on what the work is.

The text may not be in English. Read it exactly as it is — do not translate it in your head first — and write your answer in English.`;

const TRANSLATE_PROMPT = `Translate the text into natural English. Return only the translation. If it is already English, return it unchanged. Keep names, times and numbers exactly as they are.`;

// The coverage check. Two rules make this useful instead of noise:
//   1. It QUOTES the original. It cannot create items. It points at text.
//   2. It is told what is legitimately ignorable — otherwise it flags "Hi Nick"
//      every single time and you learn to ignore the whole feature.
const COVERAGE_PROMPT = `You compare an original message against a list of things that were taken from it, and report ONLY what is missing.

Return short QUOTES from the original — exact fragments of its text. You are NOT creating tasks or items and you must not write any. You are pointing at text that nobody handled.

DO NOT report any of these:
- greetings, goodbyes, thanks, apologies
- emoji and one-word reactions
- anything already represented in the list, even if worded differently

When you are unsure whether something was handled, REPORT IT. A borderline thing reported is a two-second glance; a borderline thing swallowed is gone.

If everything meaningful is represented, return an empty list. An empty list is the normal, good answer — do not invent something to report.`;

// WHY THAT LIST IS SHORTER THAN IT LOOKS.
//
// Step 1 and this step are not independent. They are the same model, and if the
// exclusion list here repeats step 1's question — "is this addressed to someone
// else?", "is this just chat with nothing to do?" — then a request wrongly read
// as a pleasantry at step 1 gets read the same way here, and nothing is flagged.
// Correlated failures do not cross-check each other.
//
// So the judgement calls have been REMOVED from this prompt and moved into code
// below. What's left in the prompt is only the unambiguous: a greeting is a
// greeting. Everything debatable is now told to err towards reporting, and the
// code — not the model — decides whether a flagged quote is pure pleasantry.
// A regex cannot be wrong in the same direction as the model that made the
// mistake, which is the whole point.
const SOCIAL_ONLY =
  /^[\s\p{P}\p{S}]*(hi|hey|hello|morning|good morning|good afternoon|evening|thanks|thank you|thx|ta|cheers|ok|okay|sure|no worries|np|bye|goodbye|see you|welcome|sorry|np|yes|yeah|no|👍|😊|早上好|你好|谢谢|多谢|再见|好的|好|辛苦了|不客气)[\s\p{P}\p{S}]*$/iu;
function isSocialOnly(quote) {
  return SOCIAL_ONLY.test(String(quote || "").trim());
}

// ------------------------------------------------------------- THE PIPELINE

const DEFAULTS = {
  maxCalls: 40, // a hard ceiling; past it, the rest is parked rather than ground through
  batchSize: 10, // step 1 answers 10 at a time — short enough to stay reliable
};

export async function runPipeline(text, ctx, deps) {
  const opts = { ...DEFAULTS, ...(deps || {}) };
  const call = opts.call;
  const progress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const kinds = Array.isArray(ctx.kinds) && ctx.kinds.length ? ctx.kinds : ["task"];

  const state = { calls: 0, capped: false };
  // Every model call goes through here: it counts against the ceiling, retries
  // ONCE on a bad answer, then gives up. A small model that got it wrong twice
  // will usually get it wrong again, and you are waiting.
  async function ask(system, user, schema, label) {
    if (state.calls >= opts.maxCalls) {
      state.capped = true;
      throw new Error("call_cap");
    }
    state.calls++;
    try {
      return await call(system, user, schema, label);
    } catch (e) {
      if (e && e.message === "call_cap") throw e;
      if (state.calls >= opts.maxCalls) {
        state.capped = true;
        throw e;
      }
      state.calls++;
      return await call(system, user, schema, label); // one retry, then it parks
    }
  }

  const entries = [];
  const parked = [];
  const park = (f, why) => parked.push({ text: f.text, start: f.start, end: f.end, why });

  // ---- step 0 (no model) --------------------------------------------------
  const fragments = splitFragments(text);
  progress({ step: "split", done: fragments.length, total: fragments.length });
  if (!fragments.length) return { entries, parked, coverage: null, calls: 0, fragments: 0, capped: false };

  // ---- step 1: is this for me? (batched) ----------------------------------
  const survivors = [];
  for (let i = 0; i < fragments.length; i += opts.batchSize) {
    const batch = fragments.slice(i, i + opts.batchSize);
    const listed = batch.map((f, n) => `${n + 1}. ${f.speaker ? f.speaker + ": " : ""}${f.text}`).join("\n");
    try {
      const out = await ask(MINE_PROMPT, `The reader is ${ctx.me || "the person reading this"}.\n\n${listed}`, MINE_SCHEMA, "mine");
      const said = new Map((out.answers || []).map((a) => [Number(a.n), !!a.mine]));
      batch.forEach((f, n) => {
        // A fragment the model didn't answer for is NOT silently dropped — an
        // unanswered question is a failure, so it's kept for the next step.
        if (said.get(n + 1) !== false) survivors.push(f);
      });
    } catch (e) {
      // The cheapest step failing must not cost you the paste. Keep them all
      // and let the later steps sort it out, or park them.
      if (e && e.message === "call_cap") batch.forEach((f) => park(f, "too much in one paste — sort this by hand"));
      else batch.forEach((f) => survivors.push(f));
    }
    progress({ step: "mine", done: Math.min(i + opts.batchSize, fragments.length), total: fragments.length });
  }

  // ---- steps 2-4, per survivor -------------------------------------------
  for (let i = 0; i < survivors.length; i++) {
    const f = survivors[i];
    progress({ step: "detail", done: i, total: survivors.length });
    try {
      // TRANSLATION IS A RENDERING STEP, NOT A PREPROCESSING STEP.
      //
      // The model does not need English in order to understand Chinese — that's
      // a job it does natively. Translating first doesn't help it think; it
      // inserts a LOSSY STEP BEFORE COMPREHENSION, and then every later step
      // reasons about the translation instead of what was actually said. A
      // garbled sentence would corrupt the label, the extraction and the
      // coverage check at once, and not one of them could see it.
      //
      // Translating for output only keeps the blast radius to what you READ,
      // never to what the app DECIDED.
      //
      // So: translate each surviving fragment ONCE, here, and keep both versions
      // side by side. Everything that reasons below reads the source. Grounding
      // and display read the English. Nothing already discarded is translated,
      // because the code-split and step 1 both ran first — which also means the
      // most expensive call in the chain is never spent on a greeting.
      let english = "";
      if (looksNonEnglish(f.text)) {
        try {
          const t = await ask(TRANSLATE_PROMPT, f.text, TRANSLATE_SCHEMA, "translate");
          if (t && typeof t.english === "string" && t.english.trim()) english = t.english.trim();
        } catch (e) {
          if (e && e.message === "call_cap") throw e; // the ceiling still binds
          // A failed rendering costs you the English, and NOTHING ELSE. Nothing
          // below reads it, so there is no reason to lose the fragment over it.
        }
      }

      // step 2 — one label, read off the SOURCE
      const k = await ask(KIND_PROMPT, kindQuestion(ctx, kinds, f), kindSchema(kinds), "kind");
      const kind = kinds.includes(k.kind) ? k.kind : kinds[0];

      // step 3 — a tight schema per kind, also read off the SOURCE. The prompts
      // ask for the answer in English, so the reading and the rendering happen
      // together over the original rather than across a lossy copy of it.
      const entry = await extract(ask, ctx, kind, f);
      if (entry) {
        // Grounding, in code: does what it claims to have read actually appear?
        // Searched across BOTH, because an English value extracted from Chinese
        // can only be found in the English rendering of that Chinese.
        const against = english ? f.text + " " + english : f.text;
        const missing = ungroundedFields(entry, against);
        if (missing.length) entry.ungrounded = missing;
        if (english) {
          // NEVER LOSE THE SOURCE. Translation is the one step with no possible
          // check — you can't verify a translation of something you couldn't
          // read, so the mistake is silent AND permanent. Both are kept, so the
          // whole chain stays readable: what it read, what that says, what it
          // filed.
          entry.sourceText = f.text;
          entry.sourceEnglish = english;
        }
        entries.push(entry);
      } else park(f, "couldn't make anything of this one");
    } catch (e) {
      if (e && e.message === "call_cap") {
        park(f, "too much in one paste — sort this by hand");
        survivors.slice(i + 1).forEach((rest) => park(rest, "too much in one paste — sort this by hand"));
        break;
      }
      park(f, "the sorter couldn't read this one");
    }
  }
  progress({ step: "detail", done: survivors.length, total: survivors.length });

  // ---- step 5: the coverage check ----------------------------------------
  // The valuable part. One call, comparing the WHOLE original against what came
  // out. It quotes; it never files.
  let coverage = null;
  try {
    const summary = entries.map((e, n) => `${n + 1}. ${describe(e)}`).join("\n") || "(nothing was taken from it)";
    const out = await ask(
      COVERAGE_PROMPT,
      `ORIGINAL MESSAGE:\n"""\n${text.slice(0, 6000)}\n"""\n\nWHAT WAS TAKEN FROM IT:\n${summary}\n\nWhich parts of the original are not represented above?`,
      COVERAGE_SCHEMA,
      "coverage"
    );
    const missed = (Array.isArray(out.missed) ? out.missed : [])
      .map((m) => ({ quote: String(m.quote || "").trim().slice(0, 200), why: String(m.why || "").trim().slice(0, 120) }))
      // It must POINT AT the original. A "quote" that isn't in the text is the
      // model inventing, and inventing is the one thing this step can't do.
      .filter((m) => m.quote && text.toLowerCase().includes(m.quote.toLowerCase().slice(0, 24)))
      // And pure pleasantries are filtered HERE rather than by the prompt, so
      // this step isn't re-running step 1's judgement with step 1's blind spots.
      .filter((m) => !isSocialOnly(m.quote))
      .slice(0, 6);
    coverage = { checked: true, missed };
  } catch {
    coverage = { checked: false, missed: [] }; // couldn't check — say so, don't claim clean
  }
  progress({ step: "coverage", done: 1, total: 1 });

  return { entries, parked, coverage, calls: state.calls, fragments: fragments.length, capped: state.capped };
}

function kindQuestion(ctx, kinds, f) {
  const lines = [`Labels you may use: ${kinds.join(", ")}`];
  if (ctx.kindHints) lines.push(ctx.kindHints);
  lines.push("", `Text: "${f.text}"`);
  return lines.join("\n");
}

function describe(e) {
  if (e.kind === "task") return `to do: ${e.item.title}`;
  if (e.kind === "record") return `note about ${e.record.who || "someone"}: ${e.record.summary}`;
  if (e.kind === "goal") return `goal: ${e.goal.title}`;
  if (e.kind === "handover") return `work ${e.handover.dir === "out" ? "passed to" : "given by"} ${e.handover.person}: ${e.handover.note}`;
  return "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function extract(ask, ctx, kind, f) {
  if (kind === "record") {
    const whoIds = ctx.whoIds || [];
    if (!whoIds.length) return null;
    const out = await ask(
      RECORD_PROMPT,
      `Ids you may use: ${whoIds.join(", ")}\nNote kinds: ${(ctx.types || []).join(", ")}` +
        ((ctx.topics || []).length ? `\nSkills: ${ctx.topics.join(" · ")}\nLevels: ${(ctx.levels || []).join(", ")}` : "") +
        `\n\nText: "${f.text}"`,
      RECORD_SCHEMA,
      "record"
    );
    const summary = String(out.summary || "").trim().slice(0, 200);
    if (!summary) return null;
    // An unrecognised id comes back BLANK, never guessed. That rule predates
    // this file and it stays: a record filed against the wrong person is worse
    // than one you have to assign yourself.
    const who = whoIds.includes(out.who) ? out.who : "";
    const topic = (ctx.topics || []).includes(out.topic) ? out.topic : "";
    return {
      kind: "record",
      record: {
        who,
        type: (ctx.types || []).includes(out.note_type) ? out.note_type : (ctx.types || [])[0] || "",
        summary,
        topic,
        level: topic && (ctx.levels || []).includes(out.level) ? out.level : "",
        followUp: false,
        followUpDate: "",
      },
    };
  }
  if (kind === "goal") {
    const out = await ask(GOAL_PROMPT, `Text: "${f.text}"`, GOAL_SCHEMA, "goal");
    const title = String(out.title || "").trim().slice(0, 120);
    return title ? { kind: "goal", goal: { title } } : null;
  }
  if (kind === "handover") {
    const out = await ask(HANDOVER_PROMPT, `The reader is ${ctx.me || "the person reading this"}.\n\nText: "${f.text}"`, HANDOVER_SCHEMA, "handover");
    const person = String(out.person || "").trim().slice(0, 60);
    if (!person) return null;
    return {
      kind: "handover",
      handover: { person, dir: out.direction === "from_me" ? "out" : "in", note: String(out.note || "").trim().slice(0, 120) },
    };
  }
  const out = await ask(TASK_PROMPT, `Today is ${ctx.today}.\n\nText: "${f.text}"`, TASK_SCHEMA, "task");
  const title = String(out.title || "").trim().slice(0, 160);
  if (!title) return null;
  const promisedTo = String(out.promised_to || "").trim().slice(0, 40);
  const waitingOn = String(out.waiting_on || "").trim().slice(0, 40);
  return {
    kind: "task",
    item: {
      title,
      type: "task",
      date: ISO_DATE.test(out.date || "") ? out.date : "",
      // Earliest possible, which is a different fact from when it's due. A
      // not_before after the deadline is a contradiction, so it's dropped
      // rather than allowed to strand the task.
      notBefore:
        ISO_DATE.test(out.not_before || "") &&
        !(ISO_DATE.test(out.date || "") && out.not_before > out.date)
          ? out.not_before
          : "",
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: "medium",
      tags: [],
      whenText: f.when || "",
      goalId: "",
      standardId: "",
      openLoop: false,
      promisedTo,
      waitingOn,
    },
  };
}

// How many model calls a paste of this shape will cost, before running it. Used
// to warn honestly rather than discovering the ceiling halfway through.
export function estimateCalls(text, opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const n = splitFragments(text).length;
  const batches = Math.ceil(n / o.batchSize);
  return { fragments: n, atLeast: batches + 1, atMost: batches + n * 3 + 1 };
}
