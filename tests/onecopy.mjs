import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE SAME QUESTION, ANSWERED TWICE.
//
// This is the single most reliable source of bugs in this app, and every one of
// them was invisible until somebody happened to look:
//
//   · nameOf     — six copies. Five said `c.name || id`; the Day page's said
//                  `c.name`, so a contact with no name rendered as "undefined".
//   · friendlyDate — six copies, none of which said which YEAR a date was in,
//                  while dates.js (loaded by all seventeen pages) did.
//   · fmtTime    — five copies. The week's insisted on a two-digit hour, which
//                  is exactly the bug that had already been found and fixed in
//                  app.js and left standing here.
//   · toMin      — "9:99" was 639 minutes to one module and not a time at all
//                  to the other.
//   · escapeHtml — seven of fourteen copies threw on anything but a string.
//   · whoIds     — three files worked out who a log was about; two were wrong
//                  the same way, and one of them wrote the export.
//
// The pattern is always the same. N copies agree, so nobody minds. One gets
// fixed. The other N-1 are now wrong and nothing says so.
//
// So this counts. A watched helper may be IMPLEMENTED once; everywhere else has
// to delegate to that one. Delegating is cheap and reads fine — the point is
// that there is one place to fix.

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");

// Small pure helpers whose answer must not depend on which file is asking.
// Each says where the one implementation lives, so a delegator is recognisable
// rather than guessed at.
const WATCHED = {
  nameOf: { owner: "names.js", via: "OrganiserNames.nameOf", what: "what a person is called" },
  // A DIFFERENT QUESTION FROM nameOf, kept separate on purpose. nameOf is the
  // bare name — for matching, for sorting, for a file somebody reads back in.
  // personWords is how a person is WRITTEN FOR SOMEBODY TO READ, which has to
  // carry the word that separates two people called Nick. Six places printed a
  // bare promisedTo straight out, so half the app could tell them apart and
  // half could not.
  personWords: { owner: null, via: "OrganiserNames.saidAs", what: "a person, written so you know which one" },
  tagOf: { owner: "names.js", via: "OrganiserNames.tagOf", what: "which one a person is" },
  // Which weekday a word is. timetable.js has had this since the beginning and
  // calplan.js now needs it too — a wall calendar's header is seven day names —
  // so it asks rather than keeping a second list. Two lists is how one of them
  // learns "Tues" and the other doesn't.
  dayOf: { owner: "timetable.js", via: "OrganiserTimetable.dayOf", what: "which weekday a word is" },
  timeWords: { owner: "dates.js", via: "OrganiserDates.timeWords", what: "a clock time in words" },
  fmtTime: { owner: null, via: "OrganiserDates.timeWords", what: "a clock time in words" },
  dayWords: { owner: "dates.js", via: "OrganiserDates.dayWords", what: "a date in words" },
  friendlyDate: { owner: null, via: "OrganiserDates.dayWords", what: "a date in words" },
  toMin: { owner: "schedule.js", via: "OrganiserSchedule.toMin", what: "a clock time as minutes" },
  escapeHtml: { owner: null, via: null, what: "text made safe to put on a page" },
  esc: { owner: null, via: null, what: "text made safe to put on a page" },
  // dates.js owns this. schedule.js and quickparse.js keep their own on
  // purpose — they are the layer BELOW presentation and have to run without it
  // — and the section at the bottom holds those two to the same answer.
  isoOf: { owner: null, via: "OrganiserDates.isoOf", what: "a date as yyyy-mm-dd",
           spine: ["dates.js", "schedule.js", "quickparse.js"] },
  todayISO: { owner: null, via: "OrganiserDates.today", what: "today, as yyyy-mm-dd" },
  pad2: { owner: null, via: null, what: "a number padded to two digits" },
  uid: { owner: null, via: null, what: "a new id" },
  addDaysISO: { owner: null, via: null, what: "a date n days from another" },
  nowISO: { owner: null, via: null, what: "the moment, as a timestamp" },
  minuteNow: { owner: null, via: null, what: "the time now, in minutes" },
};

// The body a declaration actually has: braces if it has them, otherwise the
// expression it returns. Started AFTER the declaration, because starting at the
// name finds the next function's brace on a one-line arrow — which quietly
// compares the wrong two things.
function bodyFrom(src, at) {
  let i = at;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === "{") {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (!depth) return src.slice(i, j + 1);
      }
    }
  }
  const nl = src.indexOf("\n", i);
  return src.slice(i, nl < 0 ? i + 200 : nl);
}

// Whitespace and the parameter's name are not behaviour: two copies differing
// only in `(s)` versus `(t)` are the same answer, and flagging them would train
// everyone to ignore this.
const shape = (body, params) => {
  let out = body.replace(/\s+/g, " ").trim().replace(/;$/, "");
  // "{ return X; }" and "X" are the same answer written two ways. Flagging that
  // would fill this with noise, and a check people learn to ignore is worse
  // than no check.
  const wrapped = /^\{\s*return\s+([\s\S]*?);?\s*\}$/.exec(out);
  if (wrapped) out = wrapped[1].trim();
  params.filter((p) => /^[a-z]$|^[a-z][a-z]?$/i.test(p)).forEach((p, n) => {
    out = out.replace(new RegExp(`\\b${p}\\b`, "g"), `_a${n}`);
  });
  return out;
};

const found = new Map(); // name -> [{ file, shape, delegates }]
for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith(".js"))) {
  const src = fs
    .readFileSync(path.join(PUB, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const name of Object.keys(WATCHED)) {
    const re = new RegExp(
      `(?:function\\s+${name}\\s*\\(([^)]*)\\)|const\\s+${name}\\s*=\\s*(?:\\(([^)]*)\\)|(\\w+))\\s*=>)`,
      "g"
    );
    let m;
    while ((m = re.exec(src))) {
      const params = (m[1] || m[2] || m[3] || "").split(",").map((s) => s.trim()).filter(Boolean);
      const body = bodyFrom(src, m.index + m[0].length);
      const via = WATCHED[name].via;
      if (!found.has(name)) found.set(name, []);
      found.get(name).push({
        file: f,
        shape: shape(body, params),
        delegates: !!via && body.includes(via),
      });
    }
  }
}

// ---------------------------------------------------------------------------
sec("Every one of these is worked out in one place");
for (const [name, meta] of Object.entries(WATCHED)) {
  const list = found.get(name) || [];
  if (list.length < 2) continue;
  // Anything that hands the question on isn't a rival answer.
  const own = list.filter((x) => !x.delegates);
  const shapes = [...new Set(own.map((x) => x.shape))];
  const where = own.map((x) => x.file);
  ok(
    `${name} — ${meta.what} — has one answer, not ${shapes.length}`,
    shapes.length <= 1,
    `implemented differently in: ${where.join(", ")}`
  );
  if (meta.owner) {
    ok(`and it lives in ${meta.owner}`, own.every((x) => x.file === meta.owner),
       `also implemented in: ${where.filter((f) => f !== meta.owner).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
sec("And the ones already pulled into one place stay there");
{
  // These were each found broken by a real teacher walkthrough, so the check is
  // named after the failure rather than the function.
  const dates = fs.readFileSync(path.join(PUB, "dates.js"), "utf8");
  ok("a clock time is written by dates.js", /function timeWords\(/.test(dates), "timeWords has gone");
  ok("and a one-digit hour is a time", /\\d\{1,2\}/.test(dates) || /\d\{1,2\}/.test(dates),
     "it insists on two digits again — the bug that hid a 9:05");

  const names = fs.readFileSync(path.join(PUB, "names.js"), "utf8");
  ok("a person's name is worked out by names.js", /function nameOf\(/.test(names), "nameOf has gone");

  // AND NOBODY MAY GO ROUND THEM. A page that writes its own is the whole
  // failure this file exists for, whatever it happens to call the function.
  const rogue = fs
    .readdirSync(PUB)
    // Named with the reason, not quietly excluded. app.js formats the MOMENT a
    // save happened — a timestamp of an event, not a time somebody scheduled —
    // which is a different question with a different answer.
    .filter((f) => f.endsWith(".js") &&
      !["dates.js", "names.js", "schedule.js", "chart.js", "month.js", "app.js"].includes(f))
    .filter((f) => /toLocaleTimeString\(/.test(fs.readFileSync(path.join(PUB, f), "utf8")));
  ok("nothing else turns a time into words its own way", rogue.length === 0, rogue.join(", "));
}

// ---------------------------------------------------------------------------
sec("And where a copy is kept on purpose, the two still agree");
{
  // schedule.js and quickparse.js each keep their own isoOf, because they are
  // the layer everything else stands on and must be runnable — and testable —
  // without the presentation layer above them. That is a real reason, and it is
  // also exactly how nameOf started. So the two are held to the same answer
  // rather than trusted to stay that way.
  const run = (file) => {
    const ctx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
      isNaN, parseInt, parseFloat, Intl };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(PUB, file), "utf8"), ctx);
    return ctx;
  };
  const D = run("dates.js").OrganiserDates;
  const S = run("schedule.js").OrganiserSchedule;
  const days = ["2026-01-01", "2026-02-28", "2026-08-09", "2026-09-30", "2026-12-31", "2027-03-07"];
  const mismatched = days.filter((iso) => {
    const d = new Date(iso + "T12:00:00");
    return D.isoOf(d) !== S.isoOf(d);
  });
  ok("the spine writes a date the same way dates.js does", mismatched.length === 0,
     mismatched.map((iso) => `${iso}: dates.js says ${D.isoOf(new Date(iso + "T12:00:00"))}, schedule.js says ${S.isoOf(new Date(iso + "T12:00:00"))}`).join("; "));
  // Including the ones a padding bug shows up on: a single-digit month or day.
  ok("including single-digit months and days",
     D.isoOf(new Date(2026, 0, 5)) === "2026-01-05" && S.isoOf(new Date(2026, 0, 5)) === "2026-01-05",
     `${D.isoOf(new Date(2026, 0, 5))} / ${S.isoOf(new Date(2026, 0, 5))}`);

  // THE VALIDITY RULE, WHICH THREE FILES EACH HELD SEPARATELY. timetable.js
  // allowed hour 24; dates.js and schedule.js refused it. So a block written
  // "24:00" was accepted on the way in, stored, and then invisible — nothing
  // that draws a time would draw it. quickparse said the same about "9:99".
  // An hour is out of range in the same place for all of them or one of them is
  // storing something the rest cannot show.
  const T = run("timetable.js").OrganiserTimetable;
  const clocks = ["24:00", "23:59", "9:99", "00:00", "12:30"];
  const disagree = clocks.filter((c) => {
    const good = [T.timeOf(c) !== "", D.timeWords(c) !== "", S.toMin(c) !== null];
    return good.some(Boolean) && !good.every(Boolean);
  });
  ok("what counts as a real clock time is one rule, not three",
     disagree.length === 0,
     disagree.map((c) => `${c}: timetable=${JSON.stringify(T.timeOf(c))} dates=${JSON.stringify(D.timeWords(c))} schedule=${JSON.stringify(S.toMin(c))}`).join("; "));
}

// ---------------------------------------------------------------------------
sec("And where one thing ends and the next begins is one answer");
{
  // TWO SPLITTERS. The server's, in pipeline.js, and the browser's, in
  // quickparse.js — because the app has to work with the server off, opened by
  // double-clicking the file. Which one runs is invisible to the person typing,
  // so if they disagree the app behaves differently for reasons nobody can see.
  //
  // They did. Typing "gate duty tues and thurs before school from 7.40, mr chen
  // does mon wed fri" gave the browser one thing and the server two — the
  // second of which was a task called "40, mr chen does mon wed fri", dated
  // tomorrow. 7.40 is how most of the English-speaking world writes twenty to
  // eight, so this was not a strange thing to type.
  const { splitFragments } = await import("../pipeline.js");
  const qctx = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
    isNaN, parseInt, parseFloat, Intl };
  qctx.window = qctx;
  vm.createContext(qctx);
  ["names.js", "quickparse.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), qctx));
  const Q = qctx.OrganiserQuickParse;

  // Things a teacher types where a full stop is not the end of anything.
  const SAID = [
    "gate duty tues and thurs before school from 7.40, mr chen does mon wed fri",
    "assembly at 9.10 tomorrow",
    "parents evening 6.30pm on thursday",
    "the trip costs 12.50 a head",
    "cover for sarah period 3 on friday",
    "worried about li wei in 9a, his mum emailed me",
  ];
  SAID.forEach((line) => {
    const server = splitFragments(line).length;
    const browser = Q.parseAll(line, {}).length;
    ok(`"${line.slice(0, 44)}…" is the same number of things either way`,
       server === browser, `server made ${server}, browser made ${browser}`);
  });
  // AND NEITHER OF THEM MAY CUT A NUMBER IN HALF, which is the specific way
  // they came apart.
  const broken = SAID.filter((line) =>
    splitFragments(line).some((f) => /\d\.$/.test(f.text)) ||
    Q.parseAll(line, {}).some((r) => /\d\.$/.test(r.title)));
  ok("and nothing comes back ending mid-number", broken.length === 0, broken.join(" | "));
}

done();
