import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// DICTATION, WHICH IS OFF — and the promise that it is.
//
// The browser's own speech recognition was taken out on purpose: it transcribes
// in the cloud, which contradicts everything else here. What is left only ever
// talks to a Whisper server on your own machine.
//
// So this file makes two promises, and neither had anything holding it to them:
//
//   1. With nothing switched on there is NO microphone button anywhere — not a
//      disabled one, not a hidden one. Nothing to press, no audio path at all.
//   2. There is no route to anybody else's computer. Not a fallback, not a
//      "just this once if the local one is down".
//
// A privacy promise nothing checks is a privacy hope.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const SRC = fs.readFileSync(path.join(PUB, "voice.js"), "utf8");

// A page, roughly: enough for voice.js to try to put a button on it.
function page(health) {
  const made = [];
  // `count: false` for the page furniture this stand-in needs for itself —
  // only what voice.js asks for should be counted as something it drew.
  const el = (count = true) => {
    const e = { tagName: "BUTTON", dataset: {}, style: {}, className: "", textContent: "",
      children: [], _on: {},
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(n, f) { (this._on[n] = this._on[n] || []).push(f); },
      setAttribute() {}, remove() {}, querySelector: () => null };
    if (count) made.push(e);
    return e;
  };
  const sb = {
    console, Date, Math, JSON, Promise, Set, Map, Object, Number, String, Array, RegExp,
    setTimeout, clearTimeout,
    document: { createElement: () => el(), querySelector: () => null, body: el(false) },
    location: { protocol: health === null ? "file:" : "http:" },
    fetch: async () => {
      if (health === null) throw new Error("no server");
      return { ok: true, json: async () => health };
    },
    navigator: {},
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return { sb, made };
}

// ---------------------------------------------------------------------------
sec("With nothing switched on, there is no microphone at all");
{
  const { sb, made } = page({ hasAI: true }); // a server, but no stt
  const got = await sb.OrganiserVoice.attach({}, {}, () => {});
  ok("attaching gives you nothing back", got === null, JSON.stringify(got));
  ok("and no button was ever made", !made.some((e) => /mic/.test(e.className)),
     JSON.stringify(made.map((e) => e.className)));
  ok("the mode is off", (await sb.OrganiserVoice.detectMode()) === "", await sb.OrganiserVoice.detectMode());
}

sec("Opened as a plain file, there is nothing either");
{
  // No server to ask, so nothing is assumed. Assuming "probably fine" here
  // would be assuming a microphone is safe to offer, which is the one thing
  // this must never do.
  const { sb, made } = page(null);
  ok("no mode is found", (await sb.OrganiserVoice.detectMode()) === "");
  ok("and no button", (await sb.OrganiserVoice.attach({}, {}, () => {})) === null);
  ok("nothing was drawn at all", made.length === 0, String(made.length));
}

sec("Only when your own machine is doing the listening");
{
  const { sb } = page({ stt: "local" });
  ok("the local path is the one that turns it on",
     (await sb.OrganiserVoice.detectMode()) === "local", await sb.OrganiserVoice.detectMode());
  // ANY OTHER ANSWER IS NOT GOOD ENOUGH. "stt: cloud" or "stt: true" must not
  // be read as permission — only the word that means your own machine.
  for (const said of [{ stt: "cloud" }, { stt: true }, { stt: "remote" }, { stt: "" }, {}]) {
    const p = page(said);
    ok(`${JSON.stringify(said)} does not turn it on`,
       (await p.sb.OrganiserVoice.detectMode()) === "", await p.sb.OrganiserVoice.detectMode());
  }
}

sec("And there is no road to anybody else's computer");
{
  // The browser's own recognition was removed deliberately. If it ever came
  // back, this is where it would show.
  ok("no browser speech recognition", !/webkitSpeechRecognition|SpeechRecognition/.test(SRC));
  ok("nothing is sent anywhere but this machine",
     !/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(SRC),
     (SRC.match(/https?:\/\/[^\s"'`)]+/g) || []).join(" "));
  // The only endpoint it may use is the local one, which forwards to Whisper on
  // your own machine.
  const urls = [...SRC.matchAll(/["'`](\/api\/[a-z-]+)["'`]/g)].map((m) => m[1]);
  ok("and the only endpoint it uses is the local transcribe one",
     urls.every((u) => u === "/api/transcribe" || u === "/api/health"), JSON.stringify(urls));
  // Dictation only ever FILLS the box. Nothing is filed by voice alone — the
  // ordinary check-back still runs, which matters most when the words are
  // whatever a microphone thought it heard.
  ok("it never files anything itself",
     !/OrganiserStore|\.save\(/.test(SRC), "voice.js can write to the store");
}

done();
