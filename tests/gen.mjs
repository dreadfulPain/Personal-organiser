import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs";
import vm from "node:vm";
const sb = { window: {}, console, Date, Math, JSON, Set, Map };
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(`${REPO_ROOT}/public/names.js`, "utf8"), sb);
const N = sb.window.OrganiserNames;

const show = (label, name, people) => {
  const r = N.look(name, people);
  console.log(`${label.padEnd(30)} "${name}" -> ${r.state}${r.contact ? " = " + r.contact.name : ""}${r.suggestions.length ? " ? " + r.suggestions.map(s=>s.name).join("/") : ""}`);
};

console.log("--- not English ---");
show("Chinese, exact", "王伟", [{id:1,name:"王伟"}]);
show("Chinese, one char different", "王玮", [{id:1,name:"王伟"}]);
show("Chinese given name only", "伟", [{id:1,name:"王伟"}]);
show("Chinese with space", "王 伟", [{id:1,name:"王伟"}]);
show("Arabic", "محمد", [{id:1,name:"محمد"}]);
show("Cyrillic near-miss", "Ivanov", [{id:1,name:"Ivanova"}]);
show("accented exact", "José", [{id:1,name:"José"}]);
show("accent dropped", "Jose", [{id:1,name:"José"}]);

console.log("\n--- English shapes ---");
show("apostrophe", "O'Brien", [{id:1,name:"O'Brien"}]);
show("apostrophe dropped", "OBrien", [{id:1,name:"O'Brien"}]);
show("hyphenated", "Smith-Jones", [{id:1,name:"Smith-Jones"}]);
show("surname only", "Zhou", [{id:1,name:"Helena Zhou"}]);
show("middle name", "Anne", [{id:1,name:"Mary Anne Fox"}]);
show("title", "Dr Patel", [{id:1,name:"Patel"}]);
show("extra spaces", "  helen   zhou ", [{id:1,name:"Helen Zhou"}]);

console.log("\n--- not a person at all (must not crash) ---");
show("a company", "British Gas", [{id:1,name:"Wei"}]);
show("a role", "the office", [{id:1,name:"Wei"}]);
show("very long", "x".repeat(300), [{id:1,name:"Wei"}]);
show("emoji", "😀", [{id:1,name:"Wei"}]);
show("null-ish", "", [{id:1,name:"Wei"}]);
console.log("undefined contacts ->", N.look("Wei", undefined).state);
console.log("contacts with junk ->", N.look("Wei", [null, {}, {name:""}, {id:1,name:"Wei"}]).state);

// Lock the fixes in.
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"  "+e:""));} };
console.log("\n--- regressions to hold ---");
ok("accents fold", N.look("Jose", [{id:1,name:"José"}]).state === "matched");
ok("titles are stripped", N.look("Dr Patel", [{id:1,name:"Patel"}]).state === "matched");
ok("spacing in CJK doesn't split a person", N.look("王 伟", [{id:1,name:"王伟"}]).state === "matched");
ok("but a Latin prefix is NOT the same person", N.look("Ivanov", [{id:1,name:"Ivanova"}]).state === "nearly");
ok("nor a Latin substring", N.look("Ann", [{id:1,name:"Annabel"}]).state !== "matched", N.look("Ann",[{id:1,name:"Annabel"}]).state);
ok("short different names stay different", N.look("Ben", [{id:1,name:"Ken"}]).state === "new");
ok("one CJK character is too little to act on", N.look("伟", [{id:1,name:"王伟"}]).state === "new");
ok("an ambiguous CJK part asks", N.look("王伟", [{id:1,name:"王伟民"},{id:2,name:"王伟华"}]).state === "nearly");
ok("junk contacts don't crash", N.look("Wei", [null,{},{name:""},{id:1,name:"Wei"}]).state === "matched");
ok("undefined contacts don't crash", N.look("Wei", undefined).state === "new");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
