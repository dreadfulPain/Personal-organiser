import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE ONE SCREEN THAT ASKS "DID I READ YOU RIGHT?"
//
// Nothing tested it. Not one suite typed into the box, pressed the button, and
// looked at what came back — which is how a one-character change to the title
// box shipped a check-back card showing a completely blank line and asking you
// to confirm it.
//
// It is also where the app's two promises are actually kept or broken:
//
//   · YOUR WORDS COME BACK. Not tidied, not cut, not a paraphrase. Whatever it
//     read goes in the fields beside them, where you can see it and fix it.
//   · NOTHING IS KEPT UNTIL YOU SAY SO. The check-back is the whole reason it
//     is safe for the app to guess at all.
//
// The engine is deliberately absent. That is the state most people are in, and
// the front door has to work in it — including with no server at all, which is
// what happens when somebody double-clicks the page.

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const DUMP = [
  "i start on the 24th but the kids dont start till sept 1st",
  "need to do my visa medical before i can get paid",
  "meet my mentor sarah thursday morning",
  "sort out my chinese phone sim",
].join("\n");

// Type into the box and press the button, the way a person does.
async function capture(text) {
  const r = await open("index.html", { ...DATA, items: [], schedule: [], contacts: [] });
  const box = r.byId.get("dump");
  box.value = text;
  const btn = r.byId.get("sortBtn");
  (btn._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  await r.settle();
  // The cards are written as HTML, so what was DRAWN is the honest thing to
  // read — the stand-in browser doesn't parse a string into a textarea with a
  // value on it, and reading the stub back would only ever tell us about the
  // stub.
  const drawn = r.created
    .concat([...r.byId.values()])
    .map((e) => String(e.innerHTML || ""))
    .filter((h) => h.includes("cb-title"))
    .join(" ");
  const rows = [...drawn.matchAll(/class="cb-title"[^>]*>([\s\S]*?)<\/textarea>/g)].map((m) => m[1]);
  return { r, rows, drawn };
}

// ---------------------------------------------------------------------------
sec("What you typed comes back, on its own line");
{
  const { r, rows } = await capture(DUMP);
  ok("it opens without falling over", r.errs.length === 0, r.errs.join("; "));
  // FOUR LINES, FOUR THINGS. With no server there is no split endpoint to ask,
  // and this used to come back as one item with newlines inside it — the whole
  // front door of the app, broken in the exact mode this file is written for.
  ok("four lines become four things", rows.length === 4, `${rows.length} row(s)`);

  const said = rows;
  // AND THE BOX ACTUALLY HAS THE WORDS IN IT. A card that renders, has the
  // right shape, and shows a blank line is worse than one that fails: it asks
  // you to confirm nothing, and confirming is the only safety there is.
  ok("none of them is blank", said.every((t) => t.trim().length > 0), JSON.stringify(said));
  // Checked from the END. The front of a line can legitimately lose a lead-in —
  // "I need to" is not part of the job and is taken off on purpose. Nothing is
  // ever allowed off the back, which is where a truncation shows.
  DUMP.split("\n").forEach((line) => {
    const tail = line.slice(-30);
    ok(`"…${tail}" comes back whole`, said.some((t) => t.endsWith(tail)), JSON.stringify(said));
  });
}

// ---------------------------------------------------------------------------
sec("Nothing is kept until you say so");
{
  const { r } = await capture(DUMP);
  ok("typing and pressing Add saves nothing yet", r.saves.length === 0,
     JSON.stringify(r.saves.map((s) => Object.keys(s))));

  // Say no, and nothing at all happened.
  const cancel = r.byId.get("cancelBtn");
  (cancel._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  ok("and saying no keeps nothing", (r.state.items || []).length === 0,
     JSON.stringify((r.state.items || []).map((i) => i.title)));
}

sec("And when you do say so, it keeps what it showed you");
{
  const { r, rows } = await capture(DUMP);
  const shown = rows;
  const add = r.byId.get("addBtn");
  (add._on.click || []).forEach((f) => f({ preventDefault() {} }));
  await r.settle();
  const kept = (r.state.items || []).map((i) => i.title);
  ok("everything you confirmed is there", kept.length === shown.length,
     `showed ${shown.length}, kept ${kept.length}`);
  ok("word for word", shown.every((t) => kept.includes(t)),
     JSON.stringify({ shown, kept }));
  // NOT TIDIED ON THE WAY IN EITHER. The capital letter you didn't type stays
  // untyped; the sentence is yours.
  ok("and not tidied up on the way past",
     kept.some((t) => /^i start on the 24th/.test(t)), JSON.stringify(kept));
}

// ---------------------------------------------------------------------------
sec("A long one is still readable");
{
  // No lead-in on the front, so this is the whole sentence and the comparison
  // is exact. ("I need to" IS taken off, on purpose, and is tested elsewhere —
  // mixing the two would make a pass here mean two different things.)
  // Nothing in here for the app to take out: no lead-in on the front, no date,
  // no time, no label. So whatever comes back should be this, exactly.
  const LONG =
    "write up the whole department scheme of work for grade nine english including " +
    "the assessment map, the reading list, and a note about which texts the library " +
    "actually holds enough copies of";
  const { rows } = await capture(LONG);
  ok("it is one thing", rows.length === 1, `${rows.length} row(s)`);
  const t = rows[0] || "";
  ok("longer than the old limit, so there is something to lose", LONG.length > 160, String(LONG.length));
  // NOT CUT AT ALL. This was clipped at 160 characters, mid-word, three lines
  // under a comment promising your sentence back untouched.
  ok("and all of it is there", t === LONG, `${t.length} of ${LONG.length} characters, ends: ${t.slice(-40)}`);
}

// ---------------------------------------------------------------------------
sec("And nothing can collapse the box it is written in");
{
  // growTitle() sets an inline height from what the box measures, and a card
  // measured before it is on the page measures nothing. That shipped: a
  // check-back card, correctly built, showing a blank line and asking you to
  // confirm it. A stand-in browser has no layout, so no test here can catch
  // that by rendering — the floor in the stylesheet is what makes it
  // impossible, and this is what holds the floor in place.
  const css = fs.readFileSync(path.join(REPO_ROOT, "public", "style.css"), "utf8");
  const rule = (css.match(/\.cb-title\s*\{[^}]*\}/) || [""])[0];
  ok("the title box has a height it can never go under", /min-height/.test(rule), rule.slice(0, 240));
  const js = fs.readFileSync(path.join(REPO_ROOT, "public", "app.js"), "utf8");
  ok("and nothing hands it a measurement taken before it was drawn",
     !/style\.height\s*=\s*Math\.min\([^)]*\|\|\s*0/.test(js),
     "an unmeasured box is being given its measurement");
}

done();
