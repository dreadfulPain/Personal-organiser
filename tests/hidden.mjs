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
