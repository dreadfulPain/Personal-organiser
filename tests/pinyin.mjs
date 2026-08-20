import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
import fs from "node:fs"; import vm from "node:vm";
const sb = { window: {}, console, Date, Math, JSON, Set, Map, Object }; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(`${REPO_ROOT}/public/names.js`,"utf8"), sb);
const N = sb.window.OrganiserNames;
let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log("  ok  "+n);} else {fail++;console.log("FAIL  "+n+(e?"\n      "+JSON.stringify(e):""));} };
const sec=(s)=>console.log("\n"+s);

sec("Pinyin finds the character name — as a QUESTION, never a silent guess");
{
  const people = [{ id: "1", name: "王伟" }];
  const r = N.look("Wang Wei", people);
  ok("'Wang Wei' reaches 王伟", r.state === "nearly" && r.suggestions[0].name === "王伟", r);
  ok("and it's flagged as a cross-script question", r.bridge === true);
  ok("it never decides for you", r.contact === null);
  ok("no spaces works too", N.look("wangwei", people).state === "nearly");
  ok("tone marks fold away", N.look("Wáng Wěi", people).state === "nearly");
  ok("surname only asks as well", N.look("Wang", people).state === "nearly");
  ok("a different surname doesn't match", N.look("Li Wei", people).state === "new");
  ok("traditional characters are covered", N.look("Zhang", [{id:"2",name:"張偉"}]).state === "nearly");
}

sec("Confirming once teaches it — that's what actually solves pinyin");
{
  const wang = { id: "1", name: "王伟" };
  const people = [wang];
  ok("before: it has to ask", N.look("Wang Wei", people).state === "nearly");
  ok("confirming is remembered", N.remember(wang, "Wang Wei") === true);
  ok("after: instant, no question", N.look("Wang Wei", people).state === "matched", N.look("Wang Wei", people));
  ok("and any spacing of it", N.look("wangwei", people).state === "matched");
  ok("and any case", N.look("WANG WEI", people).state === "matched");
  ok("teaching the same thing twice is a no-op", N.remember(wang, "wang wei") === false);
  ok("the other direction works too", N.look("王伟", people).state === "matched");
  ok("it keeps at most a handful", (() => { for (let i=0;i<20;i++) N.remember(wang, "spelling"+i); return wang.aka.length <= 8; })());
}

sec("It works the other way round, and for names no table could hold");
{
  // Contact stored in pinyin, note written in characters.
  const p = [{ id: "1", name: "Wang Wei" }];
  ok("characters reach a pinyin contact", N.look("王伟", p).state === "nearly", N.look("王伟", p));
  // A surname the starter table doesn't have — learning covers it.
  const rare = { id: "2", name: "澹台明" };
  ok("a rare surname isn't guessed", N.look("Tantai Ming", [rare]).state === "new");
  N.remember(rare, "Tantai Ming");
  ok("but once taught, it's known", N.look("tantai ming", [rare]).state === "matched");
  ok("a nickname works the same way", (() => { const c = { id:"3", name:"Helena Zhou" }; N.remember(c, "H"); return N.look("H", [c]).state === "matched"; })());
}

sec("It must not become loose");
{
  ok("pinyin doesn't match a Latin contact", N.look("Wang", [{id:"1",name:"Wanda"}]).state !== "matched");
  ok("two 王s force a choice", N.look("Wang", [{id:"1",name:"王伟"},{id:"2",name:"王芳"}]).suggestions.length === 2);
  ok("a non-name doesn't bridge", N.look("waiting", [{id:"1",name:"王伟"}]).state === "new");
  ok("an empty aka list is harmless", N.look("x", [{id:"1",name:"王伟",aka:[]}]).state === "new");
  ok("junk in aka doesn't crash", N.look("Wang Wei", [{id:"1",name:"王伟",aka:[null,"",123]}]).state === "nearly");
}

sec("The learning is visible and correctable");
{
  const ppl = fs.readFileSync(`${REPO_ROOT}/public/people.js`,"utf8");
  ok("contacts keep the spellings", /aka: \(Array\.isArray\(c && c\.aka\)/.test(ppl));
  ok("they're shown on the card", /ppl-aka-chip/.test(ppl));
  ok("and editable by hand", /function akaLine/.test(ppl) && /Also written as/.test(ppl));
  const app = fs.readFileSync(`${REPO_ROOT}/public/app.js`,"utf8");
  ok("confirming a suggestion teaches it", /OrganiserNames\.remember\(c, name\)/.test(app));
  ok("and it says what it learned", /I'll know next time/.test(app));
  ok("cross-script asks a different question", /same person as/.test(app));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
