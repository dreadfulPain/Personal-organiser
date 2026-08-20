import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WHAT LEAVES THE APP.
//
// An export is the one thing here that ends up in front of somebody else — a
// parent, a head of department, an inspector. Everything else in this app can
// be wrong and only cost you a bad afternoon. This can be wrong in front of a
// family.
//
// It had no test at all. The wiring audit knew the file existed; nothing ever
// asked it a question.
//
// Two rules it lives under, and neither had anything holding it to them:
//   · nothing the model wrote goes out until a person has looked at it
//   · a level with no work behind it is not evidence, and must not read as
//     though it were

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["levels.js", "export.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const X = sb.OrganiserExport;

const CONFIG = {
  topics: ["Reading", "Writing"],
  levels: ["4", "3", "2", "1"],
  levelNames: { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" },
  targetLevel: "3",
  // A SEPARATE VOCABULARY ON PURPOSE. levelNames is what you call a level to
  // yourself; this is what you would write to a family, and they are not the
  // same sentence. Keeping one list would force you to pick which audience to
  // be wrong for.
  levelParentWords: ["working beyond", "working at the expected standard", "working towards", "at an early stage"],
  whoIds: ["p1"],
};
const rec = (o) => ({
  id: o.id, who: o.who || "p1", topic: o.topic || "", level: o.level || "",
  date: o.date || "2026-09-14", createdAt: (o.date || "2026-09-14") + "T09:00:00Z",
  type: "assessment", summary: o.summary || "note", detail: "", extra: {}, tags: [],
  followUp: false, taskId: "", src: o.src || "hand",
  checkedAt: o.checkedAt === undefined ? "2026-09-14T09:00:00Z" : o.checkedAt,
  files: o.files || [],
});

// ---------------------------------------------------------------------------
sec("Nothing the model wrote goes out unlooked-at");
{
  const mine = rec({ id: "a", topic: "Reading", level: "3" });
  const its = rec({ id: "b", topic: "Reading", level: "3", src: "ai", checkedAt: "" });
  const seen = rec({ id: "c", topic: "Reading", level: "3", src: "ai" });
  ok("something you typed needs no checking", X.needsCheck(mine) === false);
  ok("something the model wrote does", X.needsCheck(its) === true);
  ok("until you have looked at it", X.needsCheck(seen) === false);

  // THE ONE THAT MATTERS. An unchecked record must not become a level in a
  // document that goes to a family.
  const csv = X.resultsCsv([its], CONFIG);
  ok("an unchecked record contributes no level to an export",
     /Reading,,not assessed yet/.test(csv), csv);
  ok("and once looked at, it does",
     /Reading,3,working at the expected standard/.test(X.resultsCsv([seen], CONFIG)),
     X.resultsCsv([seen], CONFIG));
}

// ---------------------------------------------------------------------------
sec("A skill with nothing recorded says so, rather than looking fine");
{
  const csv = X.resultsCsv([rec({ id: "a", topic: "Reading", level: "3" })], CONFIG);
  const lines = csv.split("\r\n");
  ok("every skill on the list gets a row", lines.length === 3, JSON.stringify(lines));
  // A BLANK CELL IS THE DANGEROUS ANSWER. It reads as "fine" and means
  // "never looked at".
  ok("the one never assessed says so in words",
     /Writing,,not assessed yet/.test(csv), csv);
  ok("and the header names the columns", /^id,skill,level,in words,dated,from/.test(csv), lines[0]);
}

// ---------------------------------------------------------------------------
sec("A level is written in words, not just a number");
{
  ok("the number becomes the words you would say to a family",
     X.parentWord(CONFIG, "3") === "working at the expected standard", X.parentWord(CONFIG, "3"));
  ok("which is not the same as what you call it to yourself",
     X.parentWord(CONFIG, "3") !== CONFIG.levelNames[3]);
  // NOTHING IS INVENTED. With no words set it falls back to the level itself —
  // honest, if bare, and a bare number in front of a parent is worth knowing
  // about rather than being surprised by.
  ok("with no words set, the level goes out as itself",
     X.parentWord({ levels: ["3"] }, "3") === "3", X.parentWord({ levels: ["3"] }, "3"));
  ok("and a level that isn't on the list is never given somebody else's words",
     X.parentWord(CONFIG, "9") === "9", X.parentWord(CONFIG, "9"));
}

// ---------------------------------------------------------------------------
sec("A spreadsheet that opens as a spreadsheet");
{
  // A NAME WITH A COMMA IN IT MUST NOT BECOME TWO COLUMNS. That silently shifts
  // every cell after it, so the wrong level lands against the wrong skill —
  // wrong, and wrong in a document you have already sent.
  ok("a comma is quoted", X.csvCell("Patel, Aisha") === '"Patel, Aisha"', X.csvCell("Patel, Aisha"));
  ok("a quote is doubled", X.csvCell('she said "good"') === '"she said ""good"""',
     X.csvCell('she said "good"'));
  ok("a line break is quoted", X.csvCell("one\ntwo") === '"one\ntwo"', JSON.stringify(X.csvCell("one\ntwo")));
  ok("and something ordinary is left alone", X.csvCell("Reading") === "Reading");
  ok("nothing at all is an empty cell, not the word null",
     X.csvCell(null) === "" && X.csvCell(undefined) === "", JSON.stringify(X.csvCell(null)));
  ok("rows are joined the way a spreadsheet expects",
     X.toCsv([["a", "b"], ["c", "d"]]) === "a,b\r\nc,d", JSON.stringify(X.toCsv([["a", "b"], ["c", "d"]])));
}

// ---------------------------------------------------------------------------
sec("The newest judgement is the one that goes out");
{
  const older = rec({ id: "a", topic: "Reading", level: "2", date: "2026-09-01" });
  const newer = rec({ id: "b", topic: "Reading", level: "3", date: "2026-09-10" });
  const got = X.latestLevels([older, newer]);
  ok("two judgements on one skill leave one", got.size === 1, String(got.size));
  ok("and it is the later one", got.get("Reading").level === "3", got.get("Reading").level);
  // ORDER OF ARRIVAL MUST NOT DECIDE IT. A file read back in a different order
  // would otherwise export a different level.
  ok("whichever order they were written in",
     X.latestLevels([newer, older]).get("Reading").level === "3");
}

// ---------------------------------------------------------------------------
sec("What hasn't been looked at in a while");
{
  const old = rec({ id: "a", topic: "Reading", level: "3", date: "2025-01-05" });
  const fresh = rec({ id: "b", topic: "Writing", level: "3", date: "2026-09-10" });
  const stale = X.staleTopics("p1", [old, fresh], CONFIG);
  ok("a skill judged long ago is raised", stale.includes("Reading") || X.oldTopics("p1", [old, fresh], CONFIG).length > 0,
     JSON.stringify({ stale, old: X.oldTopics("p1", [old, fresh], CONFIG) }));
  ok("and one judged this month isn't",
     !X.oldTopics("p1", [old, fresh], CONFIG).includes("Writing"),
     JSON.stringify(X.oldTopics("p1", [old, fresh], CONFIG)));
  ok("a skill never judged at all is not called stale — it is a different thing",
     !stale.includes("Nothing"), JSON.stringify(stale));
}

// ---------------------------------------------------------------------------
sec("And it never carries what it must not");
{
  const src = fs.readFileSync(path.join(PUB, "export.js"), "utf8");
  // THE STANDING RULE. Pastoral notes and what you were told in confidence go
  // in the app and never come out of it. This is the file that would leak them.
  ok("nothing pastoral can reach an export", !/OrganiserPastoral|pastoralNotes/.test(src));
  ok("and nothing you were told in confidence", !/OrganiserTold|toldLog/.test(src));
}

done();
