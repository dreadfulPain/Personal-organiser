import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// An automated version of the audit that found this, so it can't come back:
// every element using the hidden attribute must actually be hideable.
import fs from "node:fs";
import path from "node:path";
const PUB = join(REPO_ROOT, "public");
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + e : ""}`); } };

const css = fs.readFileSync(path.join(PUB, "style.css"), "utf8");

// FIRST: DOES THE STYLESHEET PARSE AT ALL?
//
// Every check in this file — and in every other file that looks at the
// stylesheet — reads it as TEXT. So a broken one still matches every regex
// asked of it, and the whole suite goes on passing while a browser silently
// skips a hundred rules. It has happened once, to a :root holding three
// colours, and the only thing that caught it was looking at the screen.
//
// THE SHAPE IT TOOK, which balanced braces cannot see: an early `*/` closed a
// comment halfway through, the prose after it was read as a selector, and that
// selector swallowed the rule underneath it whole — braces and all, so the file
// still counted out perfectly even.
function cssBreaks(src) {
  const wrong = [];
  let depth = 0, i = 0;
  while (i < src.length) {
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) { wrong.push(`a comment from character ${i} is never closed`); break; }
      i = end + 2;
      continue;
    }
    if (src.startsWith("*/", i)) {
      wrong.push(`a comment ends at character ${i} that never started — everything ` +
        "after it is being read as a selector");
      i += 2;
      continue;
    }
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth < 0) {
      wrong.push(`a closing brace with nothing open at character ${i}`);
      depth = 0;
    }
    i++;
  }
  if (depth > 0) wrong.push(`${depth} rule${depth === 1 ? "" : "s"} left open at the end`);
  return wrong;
}
ok("the stylesheet parses", !cssBreaks(css).length, cssBreaks(css).join("; "));
// And the check itself notices the three shapes it was written for, rather than
// being a function that has quietly stopped looking.
ok("  and would say so if it didn't",
   cssBreaks("a { b: c } */ d { e: f }").length === 1 &&
     cssBreaks("a { b: c ").length === 1 &&
     cssBreaks("a { b: c } /* never ends").length === 1,
   JSON.stringify(["a { b: c } */ d { e: f }", "a { b: c ", "a { b: c } /* never ends"]
     .map(cssBreaks)));

ok("a global [hidden] rule exists", /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css));

// It must come BEFORE any class that sets a display, or !important aside, the
// intent is clearest when it's declared first.
const at = css.indexOf("[hidden]");
ok("declared near the top, before the components", at > 0 && at < css.length / 4, `at ${at} of ${css.length}`);

// Now the real check: no hidden element is left un-hideable.
const hiddenClasses = new Map();
for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(PUB, f), "utf8");
  for (const m of html.matchAll(/<(\w+)([^>]*\bhidden\b[^>]*)>/g)) {
    const cls = /class="([^"]*)"/.exec(m[2]);
    const id = /id="([^"]*)"/.exec(m[2]);
    if (cls) for (const c of cls[1].split(/\s+/)) hiddenClasses.set(c, `${f}#${id ? id[1] : "?"}`);
  }
}
ok("the audit found elements to check", hiddenClasses.size > 10, String(hiddenClasses.size));

const offenders = [];
for (const [c, where] of hiddenClasses) {
  const re = new RegExp("(^|\\})\\s*([^{}]*\\." + c.replace(/[-]/g, "\\-") + "\\b[^{}]*)\\{([^}]*)\\}", "gm");
  let m;
  while ((m = re.exec(css))) {
    const sel = m[2].trim();
    if (sel.includes("[hidden]") || sel.includes(":")) continue;
    const d = /display\s*:\s*([\w-]+)/.exec(m[3]);
    if (d && d[1] !== "none") offenders.push(`${c} (display:${d[1]}) in ${where}`);
  }
}
// With the global rule present these are all neutralised — but list them so the
// override is a deliberate, visible fact rather than something to rediscover.
ok(
  "every hidden element can actually hide",
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css),
  offenders.join("; ")
);
console.log(`\n  (${offenders.length} classes set a display and rely on the global rule: ${offenders.map((o) => o.split(" ")[0]).join(", ")})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
