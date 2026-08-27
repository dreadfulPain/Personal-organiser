import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A PHOTOGRAPH OF THE STAFFROOM WALL.
//
// A teacher's timetable is on a wall and their calendar is on a noticeboard, so
// the first thing anybody tries is a photo of it — and for a long time the
// honest answer was no, because reading words off a picture needs a model that
// can see and this app will not send a photograph anywhere.
//
// A LOCAL ONE CAN. Ollama runs vision models on the same machine as the text
// one, so the picture never leaves the room it was taken in. That is the only
// reason this exists at all, and it is why the refusals below matter more than
// the happy path: a photograph taken in a school can have children in it, a
// register on a desk, a screen with somebody's marks on it.
//
// There is no Ollama in a test runner, so a stub stands in for one. It is asked
// what it was actually sent, which is the point: this test is as much about
// what leaves the machine as about what comes back.

import http from "node:http";
import { spawn } from "node:child_process";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

// ---- a stand-in for Ollama ------------------------------------------------
const seen = { tags: 0, chat: 0, lastBody: null };
let pulled = [{ name: "qwen3:14b" }, { name: "llava:7b" }];
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url.startsWith("/api/tags")) {
      seen.tags++;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ models: pulled }));
    }
    if (req.url.startsWith("/api/chat")) {
      seen.chat++;
      try { seen.lastBody = JSON.parse(body || "{}"); } catch { seen.lastBody = null; }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        // A LEADING TAB, because a real timetable's header row starts with the
        // empty square above the time column and that is what a model gives back.
        message: { content: "\tMon\tTue\tWed\n08:15\t3B English\t2A English\t1C English" },
      }));
    }
    res.writeHead(404);
    res.end("{}");
  });
});
const STUB_PORT = 3973;
await new Promise((r) => stub.listen(STUB_PORT, r));

const start = (env, port) => {
  const p = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NO_OPEN: "1", PORT: String(port), ...env },
    stdio: "ignore",
  });
  return p;
};
// A SERVER THAT DIED IS AN ANSWER TOO, and a test that dies with it reports
// nothing at all. Caught here so a broken build fails a check instead of
// taking the run down.
const look = async (port, body) => {
  try {
    const r = await fetch(`http://localhost:${port}/api/look`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let j = null;
    try { j = await r.json(); } catch { /* not json */ }
    return { status: r.status, j };
  } catch (e) {
    return { status: 0, j: null, died: String(e && e.message ? e.message : e) };
  }
};
// A picture, as far as anything here is concerned: some bytes, base64.
const PICTURE = Buffer.from("not really a jpeg, and it does not need to be").toString("base64");

// ---------------------------------------------------------------------------
const A = 3971;
const srvLocal = start({ AI_ENGINE: "ollama", AI_BASE_URL: `http://localhost:${STUB_PORT}` }, A);
await new Promise((r) => setTimeout(r, 2200));

sec("A photograph is read by a model on this machine");
{
  const { j } = await look(A, { image: PICTURE });
  ok("it comes back with words", !!(j && j.ok && j.text), JSON.stringify(j));
  ok("which are the words in the picture", /3B English/.test((j && j.text) || ""), j && j.text);
  // THE EMPTY SQUARE ABOVE THE TIME COLUMN. Trimmed off the front, every day
  // shifts one column left and the time column becomes Monday — a whole
  // timetable, wrong by a day, with nothing on the screen looking odd.
  ok("and the blank corner cell survives", (j && j.text || "").startsWith("\t"),
     JSON.stringify((j && j.text || "").slice(0, 12)));
  // WHICH MODEL. Named, because the answer is only as good as the thing that
  // gave it and the person reading it should know which that was.
  ok("and says which model read it", j && j.model === "llava:7b", j && j.model);

  // IT WENT TO THE MACHINE'S OWN ADDRESS AND NOWHERE ELSE.
  ok("the picture was sent to the local engine", seen.chat === 1, String(seen.chat));
  ok("as an image, to the model that can see",
     !!(seen.lastBody && seen.lastBody.model === "llava:7b" &&
        seen.lastBody.messages[0].images && seen.lastBody.messages[0].images[0] === PICTURE),
     JSON.stringify(seen.lastBody && seen.lastBody.model));
  // AND IT WAS ASKED TO COPY, NOT TO DESCRIBE. A model asked about a picture
  // will happily tell you what it thinks the picture is FOR, which on a
  // timetable is a paragraph and no lessons.
  const asked = seen.lastBody && seen.lastBody.messages[0].content;
  ok("asked for the words, not a description", /do not describe/i.test(asked || ""), asked);
  // A TAB BETWEEN CELLS is what turns a photographed timetable into a grid the
  // reader here already understands.
  ok("and asked to keep the table a table", /TAB between the cells/i.test(asked || ""), asked);
}

sec("And which model can see is worked out, not assumed");
{
  // A TEXT MODEL ASKED TO READ A PICTURE gives you a confident description of a
  // picture it never saw, and nothing on the screen would say so.
  pulled = [{ name: "qwen3:14b" }, { name: "mistral:7b" }];
  const { j } = await look(A, { image: PICTURE });
  ok("with nothing that can see, it says so", !!(j && !j.ok && j.why === "no_vision_model"),
     JSON.stringify(j));
  ok("and says exactly what to run", /ollama pull llava/.test((j && j.message) || ""), j && j.message);
  ok("and it is a big download, so it says that too", /big download/.test((j && j.message) || ""),
     j && j.message);
  pulled = [{ name: "qwen3:14b" }, { name: "llava:7b" }];
}

sec("And an empty request is refused rather than sent");
{
  const { status, j } = await look(A, {});
  ok("no picture, no call", status === 400 && j && j.why === "empty", JSON.stringify(j));
}
srvLocal.kill();
await new Promise((r) => setTimeout(r, 400));

// ---------------------------------------------------------------------------
const B = 3972;
const srvCloud = start({ AI_ENGINE: "anthropic", ANTHROPIC_API_KEY: "sk-not-a-real-key" }, B);
await new Promise((r) => setTimeout(r, 2200));

sec("And a photograph never goes to a cloud engine");
{
  const before = seen.chat;
  const { j } = await look(B, { image: PICTURE });
  // NOT A WARNING — A REFUSAL. A photograph taken in a school can have children
  // in it. There is no setting that turns this off, and there should not be.
  ok("it refuses", !!(j && !j.ok), JSON.stringify(j));
  ok("saying why", j && j.why === "not_local", j && j.why);
  ok("in words about this machine", /only ever read on this machine/.test((j && j.message) || ""),
     j && j.message);
  ok("and nothing was sent anywhere", seen.chat === before, `${seen.chat} vs ${before}`);
}
srvCloud.kill();
await new Promise((r) => setTimeout(r, 400));

// ---------------------------------------------------------------------------
const C = 3974;
const srvNone = start({ AI_ENGINE: "", AI_BASE_URL: "", ANTHROPIC_API_KEY: "" }, C);
await new Promise((r) => setTimeout(r, 2200));

sec("And with no AI at all it says what would make it work");
{
  const { j } = await look(C, { image: PICTURE });
  ok("it refuses calmly", !!(j && !j.ok && j.why === "no_ai"), JSON.stringify(j));
  ok("and says what is missing", /needs a local model that can see/.test((j && j.message) || ""),
     j && j.message);
}
srvNone.kill();
await new Promise((r) => setTimeout(r, 300));
stub.close();

// ---------------------------------------------------------------------------
sec("And the app says out loud that a picture is the least trustworthy of all");
{
  const src = (await import("node:fs")).readFileSync(`${REPO_ROOT}/public/capture.js`, "utf8");
  // A MODEL READING HANDWRITING ON A WALL IN BAD LIGHT will get things wrong,
  // and it will get them wrong in a way that reads perfectly well. Everything
  // else in this app that guesses says so; this guesses most of all.
  ok("it names the model that read it", /Read out of a photograph by \$\{d\.model\}/.test(src),
     "the reading isn't attributed");
  ok("and says nothing left the machine", /nothing left it/.test(src), "the promise isn't made");
  ok("and says to check every line", /Check every line of it/.test(src), "it doesn't say to check it");
  // AND THE PICKER LETS YOU CHOOSE ONE. "Open a file" that refuses the obvious
  // file is the same door being shut twice.
  ok("a photo can be chosen at all", /image\/\*/.test(src), "images aren't offered");
}

// ---------------------------------------------------------------------------
sec("And a timetable that only says when each period STARTS is still a timetable");
{
  // THE THING THE PHOTOGRAPH TURNED UP. Half the timetables in the world put
  // one time in the left-hand column — 08:15, 09:00, 09:55 — because the end of
  // each period is the start of the next and nobody writes both. Read as needing
  // a range, every one of them came out as nothing at all: no header row wrong,
  // no cell missed, simply no timetable.
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const sbx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
    RegExp, isNaN, parseInt, parseFloat, Intl };
  sbx.window = sbx;
  vm.createContext(sbx);
  ["dates.js", "calplan.js", "schedule.js", "timetable.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(`${REPO_ROOT}/public/${f}`, "utf8"), sbx));
  const T = sbx.OrganiserTimetable;

  const STARTS_ONLY = [
    "\tMon\tTue\tWed\tThu\tFri",
    "08:15\t3B English\t3B English\t3B English\t3B English\t3B English",
    "09:00\t2A English\t1C English\t2A English\t1C English\t2A English",
    "09:55\t3B Science\t2A SSS\t\t3B Science\t2A SSS",
  ].join("\n");
  const r = T.read(STARTS_ONLY);
  ok("it is read as a grid", r.shape === "grid", r.shape);
  ok("with every lesson in it", r.blocks.length === 14, String(r.blocks.length));
  ok("across the whole week", r.days.length === 5, JSON.stringify(r.days));
  // EACH PERIOD ENDS WHERE THE NEXT ONE STARTS, which is what the column means.
  const first = r.blocks.find((b) => b.start === "08:15");
  ok("a period ends when the next one starts", first && first.end === "09:00", first && first.end);
  // AND THE LAST ONE HAS NOTHING UNDER IT, so an hour goes in and is admitted to.
  const last = r.blocks.find((b) => b.start === "09:55");
  ok("the last of the day gets an hour", last && last.end === "10:55", last && last.end);
  ok("and the guess is said out loud", /didn't say when they end/.test(T.words(r)), T.words(r));

  // AND THE SAME GRID WITH ITS CORNER CELL MISSING still lands on the right
  // days. The shift check looks to the LEFT of the first day column for a time;
  // looking only for a full span it found none, so a start-only timetable had
  // its time column read as Monday.
  const NO_CORNER = STARTS_ONLY.replace(/^\t/, "");
  const c = T.read(NO_CORNER);
  ok("a lost corner cell doesn't shift the days", c.blocks.length === 14, String(c.blocks.length));
  ok("and Monday is still Monday",
     !!c.blocks.find((b) => b.days[0] === 1 && b.label === "3B English"),
     JSON.stringify(c.blocks.slice(0, 3).map((b) => `${b.days} ${b.label}`)));

  // A GRID THAT DOES SAY BOTH ENDS IS UNTOUCHED.
  const BOTH = [
    "\tMon\tTue",
    "08:15-08:55\t3B English\t3B English",
    "09:00-09:40\t2A English\t1C English",
  ].join("\n");
  const b = T.read(BOTH);
  ok("a grid with real spans still reads", b.shape === "grid" && b.blocks.length === 4,
     `${b.shape} ${b.blocks.length}`);
  ok("and keeps the ends it was given",
     b.blocks[0].end === "08:55", b.blocks[0].end);
  ok("with nothing guessed", !/didn't say when they end/.test(T.words(b)), T.words(b));
  // AND A ROW WITH NO TIME IN IT IS STILL A HEADING, not a lesson.
  const NOTED = ["\tMon\tTue", "Autumn term", "08:15\t3B English\t3B English"].join("\n");
  const n = T.read(NOTED);
  ok("a heading row makes no lessons", n.blocks.length === 2, String(n.blocks.length));
}

done();
