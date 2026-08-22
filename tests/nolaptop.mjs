import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The laptop story: no model, and the front door still mostly works.
import fs from "node:fs"; import vm from "node:vm";
const REPO = REPO_ROOT;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+String(e).slice(0,200):""));} };
const sec=(s)=>console.log("\n"+s);

sec("The no-AI path is now a real path, not a shrug");
const app = fs.readFileSync(REPO+"/public/app.js","utf8");
// Moved into addWithoutAI when splitting was added; pin the behaviour, not the line.
ok("the home box uses the pattern reader", /OrganiserQuickParse\.parseAll\(/.test(app));
// A part can still be more than one job: the splitter cuts at line breaks and
// full stops, and "update the laptop and sign into 365" has neither.
ok("and it reads every job in a line, not just the line", /parseAll\(/.test(app));
ok("and splits a paste first, with no engine needed", /fetch\("\/api\/split"/.test(app));
ok("it still falls back safely if that file is missing", /window\.OrganiserQuickParse\s*\n?\s*\?/.test(app));
ok("it says when it actually read something", /Read what I could/.test(app));
ok("and doesn't pretend when it didn't", /Add this — tweak anything/.test(app));
ok("it goes through the SAME check-back", /renderCheckback\(\);/.test(app));
ok("corrections are still measured on this path", /proposed = made\.map\(\(m\) => JSON\.parse/.test(app));
const cap = fs.readFileSync(REPO+"/public/capture.js","utf8");
ok("every other page's bar too", /parseAll\(/.test(cap));

// AND BOTH HAND IT THE SAME THING.
//
// These used to pin the exact words of the call — `{ contacts }` — which broke
// the moment a second field was added and said nothing at all about the thing
// that matters: the box on the home page and the box on the other eleven pages
// have to read a sentence the same way. One question, one answer, wherever you
// happen to be standing.
//
// WHAT THE READER NEEDS IS READ OFF THE READER. Add a field to quickparse and
// both callers have to start passing it, without anybody remembering to come
// back and edit this list — which is the failure that put a different
// vocabulary on the home page from every other page.
{
  const qp = fs.readFileSync(`${REPO_ROOT}/public/quickparse.js`, "utf8");
  const wants = [...new Set([...qp.matchAll(/\bctx\s*&&\s*ctx\.(\w+)|\(ctx\s*&&\s*ctx\.(\w+)\)/g)]
    .map((m) => m[1] || m[2]).filter(Boolean))];
  ok("the reader takes something off the context", wants.length >= 2, JSON.stringify(wants));
  const given = (src, where) =>
    wants.forEach((k) =>
      ok(`${where} tells it about ${k}`,
         new RegExp(`parseAll\\([\\s\\S]{0,400}?\\b${k}\\b`).test(src),
         `nothing near the parseAll call mentions ${k}`));
  given(app, "the home box");
  given(cap, "every other page's bar");
}

ok("and stops to show you when it cut a line in half", /Read that as \$\{guesses\.length\} jobs/.test(cap));

sec("It's loaded everywhere the capture box is");
for (const f of fs.readdirSync(REPO+"/public").filter((x)=>x.endsWith(".html"))) {
  const h = fs.readFileSync(REPO+"/public/"+f,"utf8");
  if (!/capture\.js/.test(h)) continue;
  ok(`${f} loads it`, /quickparse\.js/.test(h) && /names\.js/.test(h));
  const qi = h.indexOf("quickparse.js"), ni = h.indexOf("names.js"), ci = h.indexOf("capture.js");
  ok(`${f} loads it in the right order`, ni < qi && qi < ci, `names@${ni} quick@${qi} capture@${ci}`);
}

sec("Nothing about it is domain-specific");
const q = fs.readFileSync(REPO+"/public/quickparse.js","utf8");
ok("no school words", !/\b(school|lesson|teacher|pupil|student|marking|term)\b/i.test(q.replace(/\/\/.*$/gm,"")));
ok("no person's name", !/Helen|Wei\b|Nicholas/.test(q.replace(/\/\/.*$/gm,"")));
ok("people come only from YOUR list", /Only ever people you already have/.test(q));
ok("it never sets a goal or a standard", /goalId: ""/.test(q) && /standardId: ""/.test(q));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
