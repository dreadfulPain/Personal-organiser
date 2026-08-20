import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// WALKING INTO A MEETING BELIEVING YOU'RE PREPARED.
//
// meeting.js exists to stop one specific bad moment, and its own header names
// the dangerous half: "no warnings showing" and "nothing recorded" look
// identical from the outside. A quiet screen is exactly what a well-prepared
// week looks like AND exactly what an empty file looks like.
//
// Nothing tested it. Not one line — the module that exists to prevent silent
// false reassurance was itself silently unchecked, which is the same shape of
// mistake it is built to catch.

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
// meeting.js deliberately does NOT fall back when one of these is missing —
// guessing "no work attached" when it simply couldn't look would put a false
// warning in front of somebody, which is worse than the page not rendering.
["schedule.js", "levels.js", "export.js", "meeting.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const M = sb.OrganiserMeeting;
const S = sb.OrganiserSchedule;

const TODAY = "2026-09-14";
const at = (iso) => new Date(iso + "T09:00:00");
const CFG = { meetingLeadDays: 5, topics: ["Reading", "Writing"] };
const CONFIG = { topics: ["Reading", "Writing"], levels: ["4", "3", "2", "1"], targetLevel: "3" };
const rec = (o) => ({
  id: o.id, who: o.who, topic: o.topic || "", level: o.level || "", date: o.date || TODAY,
  createdAt: (o.date || TODAY) + "T09:00:00Z", type: o.type || "assessment",
  summary: o.summary || "note", detail: "", extra: {}, tags: [], followUp: false,
  // Only what the MODEL wrote needs confirming. Something you typed is
  // confirmed by the act of typing it, which is why src matters here.
  taskId: "", src: o.checked === false ? "ai" : "hand",
  checkedAt: o.checked === false ? "" : (o.date || TODAY) + "T09:00:00Z",
  files: o.files || [],
});

// ---------------------------------------------------------------------------
sec("It speaks first, days ahead, unasked");
{
  const meet = [{ id: "m1", label: "Parents evening", start: "16:00", end: "18:00",
    date: "2026-09-17", days: [], about: ["p1", "p2"] }];
  const up = M.upcoming(meet, CFG, at(TODAY));
  ok("a meeting three days off is seen now", up.length === 1, JSON.stringify(up));
  ok("and it says how many days that is", up[0].daysAway === 3, String(up[0].daysAway));
  ok("and who it is about",
     JSON.stringify(up[0].block.about) === JSON.stringify(["p1", "p2"]),
     JSON.stringify(up[0].block.about));
  ok("and which day", up[0].date === "2026-09-17", up[0].date);

  // ONLY A BLOCK THAT NAMES SOMEBODY. A lesson is not a meeting, and treating
  // every block as one would bury the real thing in noise.
  const lesson = [{ id: "l1", label: "9A English", start: "09:00", end: "10:00",
    date: "2026-09-17", days: [], about: [] }];
  ok("an ordinary block that names nobody isn't a meeting", M.upcoming(lesson, CFG, at(TODAY)).length === 0);

  // Beyond the lead time it is not yet your problem.
  const far = [{ ...meet[0], date: "2026-10-30" }];
  ok("one next month isn't raised yet", M.upcoming(far, CFG, at(TODAY)).length === 0);

  // A WEEKLY SLOT MUST NOT HIDE TOMORROW'S. Each occurrence comes back on its
  // own, or the one that matters is the one you never see.
  const weekly = [{ id: "w1", label: "Review", start: "16:00", end: "17:00", days: [1, 2, 3, 4, 5],
    date: "", about: ["p1"] }];
  const many = M.upcoming(weekly, CFG, at(TODAY));
  ok("a repeating slot comes back once per day, not once", many.length >= 4, String(many.length));
  ok("with the nearest first", many[0].daysAway <= many[many.length - 1].daysAway,
     JSON.stringify(many.map((x) => x.daysAway)));
  // TODAY'S MEETING STOPS BEING UPCOMING ONCE IT HAS STARTED. Warning about
  // something you are already sitting in is noise, and noise is how the ones
  // that matter get ignored.
  const nowish = [{ id: "n1", label: "Review", start: "08:00", end: "08:30",
    date: TODAY, days: [], about: ["p1"] }];
  ok("one that finished this morning isn't still being raised",
     M.upcoming(nowish, CFG, new Date(TODAY + "T14:00:00")).length === 0);
  ok("but one later today still is",
     M.upcoming([{ ...nowish[0], start: "16:00", end: "17:00" }], CFG,
       new Date(TODAY + "T14:00:00")).length === 1);
}

// ---------------------------------------------------------------------------
sec("Nothing written down is not the same as nothing to raise");
{
  const empty = M.readiness("p1", [], CONFIG);
  ok("somebody with no records at all is marked empty", empty.empty === true, JSON.stringify(empty));
  const said = M.lines(empty, CONFIG);
  ok("and it says so in words, not by staying quiet",
     said.missing.some((m) => /nothing logged at all/.test(m.text)), JSON.stringify(said.missing));
  // THE WHOLE POINT. An empty file must stop you, not read as calm.
  ok("it is treated as the thing that would leave you empty-handed",
     said.missing.some((m) => m.blocking), JSON.stringify(said.missing));
  ok("and it offers the next step rather than just the worry",
     said.missing.every((m) => !m.blocking || (m.task || "").length > 5),
     JSON.stringify(said.missing.map((m) => m.task)));
  ok("with nothing claimed on the have side", said.have.length === 0, JSON.stringify(said.have));

  // AND A FULL FILE READS DIFFERENTLY. Same quiet screen, opposite meaning.
  const full = M.readiness("p2", [
    rec({ id: "r1", who: "p2", topic: "Reading", level: "3", files: ["a.pdf"] }),
    rec({ id: "r2", who: "p2", topic: "Writing", level: "3", files: ["b.pdf"] }),
  ], CONFIG);
  ok("somebody with records is not empty", full.empty === false, JSON.stringify(full));
  ok("and the two are never the same sentence",
     JSON.stringify(M.lines(full, CONFIG).missing) !== JSON.stringify(said.missing));
}

// ---------------------------------------------------------------------------
sec("Confidence is not evidence");
{
  // A level confirmed five times by watching has nothing to put on the table.
  // It reads as your strongest judgement and is your thinnest.
  const watched = M.readiness("p3", [
    rec({ id: "r1", who: "p3", topic: "Reading", level: "3" }),
    rec({ id: "r2", who: "p3", topic: "Writing", level: "3" }),
  ], CONFIG);
  ok("levels with no work behind them are counted as no work", watched.work === 0, String(watched.work));
  const said = M.lines(watched, CONFIG);
  ok("and that is said as the blocking thing it is",
     said.missing.some((m) => m.blocking && /nothing to show/.test(m.text)),
     JSON.stringify(said.missing));
  ok("while still crediting what IS there",
     said.have.some((h) => /confirmed record/.test(h.text)), JSON.stringify(said.have));

  // With work attached it stops being blocking.
  const evidenced = M.readiness("p4", [
    rec({ id: "r1", who: "p4", topic: "Reading", level: "3", files: ["one.pdf"] }),
    rec({ id: "r2", who: "p4", topic: "Writing", level: "3", files: ["two.pdf"] }),
  ], CONFIG);
  ok("work on file is counted", evidenced.work === 2, String(evidenced.work));
  ok("and nothing blocks any more",
     !M.lines(evidenced, CONFIG).missing.some((m) => m.blocking),
     JSON.stringify(M.lines(evidenced, CONFIG).missing));
}

// ---------------------------------------------------------------------------
sec("An unconfirmed record would show nothing");
{
  const unchecked = M.readiness("p5", [
    rec({ id: "r1", who: "p5", topic: "Reading", level: "3", checked: false, files: ["a.pdf"] }),
  ], CONFIG);
  ok("something you typed yourself is confirmed by having typed it",
     M.readiness("p6", [rec({ id: "r2", who: "p6", topic: "Reading", level: "3" })], CONFIG).confirmed === 1);
  ok("it is counted as unconfirmed", unchecked.unchecked === 1, JSON.stringify(unchecked));
  ok("and not counted as confirmed", unchecked.confirmed === 0, String(unchecked.confirmed));
  ok("which is said, because an export would come out blank",
     M.lines(unchecked, CONFIG).missing.some((m) => m.blocking && /unconfirmed/.test(m.text)),
     JSON.stringify(M.lines(unchecked, CONFIG).missing));
}

// ---------------------------------------------------------------------------
sec("The one word for a whole meeting");
{
  const empty = M.readiness("p1", [], CONFIG);
  const thin = M.readiness("p3", [rec({ id: "r1", who: "p3", topic: "Reading", level: "3" })], CONFIG);
  const good = M.readiness("p4", [
    rec({ id: "r1", who: "p4", topic: "Reading", level: "3", files: ["a.pdf"] }),
    rec({ id: "r2", who: "p4", topic: "Writing", level: "3", files: ["b.pdf"] }),
  ], CONFIG);
  ok("all ready reads as ready", M.verdict([good], CONFIG) === "ready", M.verdict([good], CONFIG));
  ok("anybody empty-handed makes the whole meeting empty-handed",
     M.verdict([good, empty], CONFIG) === "empty-handed", M.verdict([good, empty], CONFIG));
  // THE WORST CASE WINS. One person you have nothing for is the meeting's
  // problem, however well prepared the rest are.
  ok("and it is the worst one that decides, not the average",
     M.verdict([good, good, good, empty], CONFIG) === "empty-handed");
  ok("nobody at all is not a warning", M.verdict([], CONFIG) === "ready");
}

sec("It counts; it never judges");
{
  const src = fs.readFileSync(path.join(PUB, "meeting.js"), "utf8");
  const strings = [...src.matchAll(/"([^"\\]{12,})"|`([^`\\]{12,})`/g)].map((m) => m[1] || m[2]);
  ok("nothing it says is about you rather than the file",
     !strings.some((s) => /you (should|must|failed|forgot|didn)|not good enough|falling behind|lazy|too slow/i.test(s)),
     JSON.stringify(strings.filter((s) => /you (should|must|failed|forgot|didn)|not good enough|falling behind|lazy|too slow/i.test(s))));
  ok("and it never guesses when a module it needs is absent",
     !/OrganiserLevels\s*\|\||OrganiserExport\s*\|\|/.test(src),
     "it falls back rather than refusing — a false all-clear");
}

done();
