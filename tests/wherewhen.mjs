import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// AN ORIENTATION SCHEDULE, AND WHAT A DAY LOOKS LIKE AFTERWARDS.
//
// A real one, read out of a PDF a school handed out. It is a table — time, what
// it is, who it is for, who is running it, and WHERE — spread over a page a day.
//
// WHAT IT ALREADY DID WELL, and this is worth pinning because it is most of the
// job: each page's own date, so the second day of an induction does not land on
// the first; the times; and the small print beside each row, which is where
// "bring your passport and four ID photos" lives.
//
// WHAT WAS WRONG. Saving them said "They repeat every week — say when the term
// ends and they'll stop there." These are sixteen things on two named days. They
// do not come round again, and telling somebody their induction is now a
// permanent Saturday fixture is alarming as well as false.
//
// AND THE THING THAT WAS MISSING ENTIRELY: a lesson or a meeting needs your body
// in a particular room; marking needs a chair. The app said which in two words
// on a badge — "BE THERE" against "ON" — which has to be READ. Now it is seen.
//
// The schedule in this file is invented. Its shape is not.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["dates.js", "calplan.js", "schedule.js", "timetable.js"].forEach((f) =>
  vm.runInContext(read(f), sb));
const S = sb.OrganiserSchedule;
const T = sb.OrganiserTimetable;

// Two pages, a day each, laid out the way such a table flattens out of a PDF:
// the columns are gone and each cell is its own line, in column order.
const PAGES = [
  { page: 1, text: [
    "TIME", "TOPIC", "ATTENDEES", "PEOPLE IN CHARGE", "LOCATION(S)",
    "Saturday 22 August 2026",
    "7:00-11:00", "Health Check", "(bring passport &", "TWO", "ID photos)",
    "Everyone on the list", "A. Example, B. Sample", "No 1, Example Gate",
    "11:30-13:00", "Lunch & Campus Tour", "All New Teachers", "Liaisons", "Second Floor, Canteen",
  ].join("\n") },
  { page: 2, text: [
    "Sunday 23 August 2026",
    "8:00-9:30", "Curriculum Introduction", "All New Teachers", "C. Instance", "Example Building 109",
    "13:00-13:40", "IT Training (please bring your laptop)", "All New Teachers", "IT", "Example Building 109",
  ].join("\n") },
];

// ---------------------------------------------------------------------------
sec("A schedule spread over a page a day keeps its days");
{
  const got = T.fromPages(PAGES, { year: 2026 });
  ok("it read something", !!got && got.blocks.length >= 4, got ? String(got.blocks.length) : "nothing");
  const dates = [...new Set(got.blocks.map((b) => b.date))].sort();
  // EACH PAGE'S OWN DATE. Read as one lump they all take the first date on the
  // document, and the second day of an induction lands on the first.
  ok("both days are there", dates.length === 2, JSON.stringify(dates));
  ok("and they are the days the pages said",
     dates[0] === "2026-08-22" && dates[1] === "2026-08-23", JSON.stringify(dates));
  const it = got.blocks.find((b) => /IT Training/.test(b.label));
  ok("a thing on day two is on day two", it && it.date === "2026-08-23", it && it.date);
  ok("with the time it says", it && it.start === "13:00" && it.end === "13:40",
     it && `${it.start}-${it.end}`);
}

sec("And the small print survives being kept");
{
  const got = T.fromPages(PAGES, { year: 2026 });
  const health = got.blocks.find((b) => /Health Check/.test(b.label));
  ok("the reader keeps what was beside it", /passport/.test(health.note || ""), health.note);

  // AND SURVIVES BECOMING A BLOCK. This has been true all along and is pinned
  // because it is the whole value of reading the thing: a schedule you cannot
  // read the small print off is a list of times.
  const kept = S.normaliseBlock(health);
  ok("and so does the block it becomes", /passport/.test(kept.note || ""), kept.note);
  ok("including who was running it", /Example/.test(kept.note || ""), kept.note);
  // A block can hold a place of its own, which is the half the app can act on.
  const withPlace = S.normaliseBlock({ ...health, where: "No 1, Example Gate" });
  ok("a block can be told where it is", withPlace.where === "No 1, Example Gate", withPlace.where);
}

sec("And saying they repeat every week would be false");
{
  const src = read("timeline.js");
  // The whole save message, not a slice of it — the three sentences it can end
  // with are spread over more lines than a fixed window catches.
  // NOT PINNED TO A VARIABLE NAME. This named `kept`, and when the thing that
  // was actually saved stopped being `kept` — rows already in the week are no
  // longer added — the check broke on a rename while the behaviour it is about
  // was fine. What matters is that the sentence is decided by asking the blocks,
  // whatever they are called.
  const said = (src.match(/setSuStatus\(\s*`Saved \$\{\w+\.length\}[\s\S]*?\n      \);/) || [""])[0];
  ok("what gets said is read off what was saved",
     /\w+\.every\(\(b\) => b\.date\)/.test(said), "it still says one thing whatever was saved");
  ok("and dated ones are told they don't come round again",
     /don't come round again/.test(said), "an induction still reads as a weekly fixture");
  // AND A REAL TIMETABLE STILL GETS THE OTHER SENTENCE, because for a timetable
  // it is true and it is the thing worth saying.
  ok("while a repeating one still says when to stop it",
     /They repeat every week/.test(said), "the timetable's own warning has gone");
}

// ---------------------------------------------------------------------------
sec("Somewhere you have to be looks different from anywhere you can sit");
{
  // The rule, in one place, so a lesson looks the same on every page it is on.
  ok("there is one rule for it", typeof S.mustBeThere === "function", "no such rule");
  ok("a ticked block needs you there", S.mustBeThere({ beThere: true }));
  ok("and so does one with an address on it", S.mustBeThere({ where: "Example Building 109" }));
  // A THING WITH AN ADDRESS IS SOMEWHERE YOU HAVE TO BE. Asking somebody to tick
  // sixteen boxes to say what the app has just read is asking them to do its job.
  ok("even with the tick off", S.mustBeThere({ beThere: false, where: "the hall" }));
  // AND MARKING IS NOT. This is the whole distinction: it needs a chair, not a
  // room, and a gap between two of these is a different gap.
  ok("and something with neither does not", !S.mustBeThere({ label: "mark 9A books" }));
  ok("nor does an empty place", !S.mustBeThere({ where: "   " }));
  ok("nor nothing at all", !S.mustBeThere(null) && !S.mustBeThere(undefined));
}

sec("And it is seen rather than read");
{
  // A BADGE SAYING "BE THERE" HAS TO BE READ, on every row, every time. For
  // somebody who finds reading expensive that is the opposite of help.
  const css = read("style.css");
  ok("there is a mark for it", /\.needs-you-there\s*\{/.test(css), "nothing marks it visually");
  // A COLOUR ALONE IS NOT ENOUGH: about one man in twelve cannot separate two
  // hues, so the mark is also a solid bar down the leading edge.
  ok("and it is not only a colour", /\.needs-you-there[\s\S]{0,200}border-left/.test(css),
     "colour is doing all the work");
  ok("and it still says the words too", /badge block/.test(read("week.js")),
     "the badge went when the colour arrived");

  // BOTH PAGES A DAY IS LOOKED AT ON.
  ["week.js", "timeline.js"].forEach((f) =>
    ok(`${f} marks them`, /needs-you-there/.test(read(f)), `${f} draws them all the same`));
  ["week.js", "timeline.js"].forEach((f) =>
    ok(`${f} asks the one rule`, /mustBeThere\(/.test(read(f)), `${f} works it out for itself`));
}

sec("And a day shows both kinds together");
{
  // TOMORROW, not a fixed date: the week shows the next seven days, so a date
  // written into the file goes stale and the block quietly stops being in view.
  const soon = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const dayData = {
    ...DATA,
    schedule: [
      S.normaliseBlock({ id: "b1", label: "Curriculum Introduction", start: "08:00", end: "09:30",
        days: [], date: soon(1), where: "Example Building 109", note: "bring your laptop" }),
    ],
    items: [{ id: "mk", title: "mark 9A books", type: "task", date: soon(1), datedBy: "you",
      time: "", deadlineType: "soft", importance: "normal", effort: "draining", tags: [],
      whenText: "", goalId: "", standardId: "", openLoop: false, areas: [], plannedMinutes: 60,
      spentMinutes: 0, promisedTo: "", waitingOn: "", contactId: "", remindAt: "",
      remindedAt: null, done: false, createdAt: "2026-08-20T09:00:00Z" }],
  };
  const r = await open("week.html", dayData);
  ok("the week opens", r.errs.length === 0, r.errs.join(" | "));
  const html = r.created.concat([...r.byId.values()]).map((e) => String(e.innerHTML || "")).join(" ");
  const classes = r.created.map((e) => String(e.className || "")).join(" ");
  ok("the lesson is marked", /needs-you-there/.test(classes + html), classes.slice(0, 200));
  ok("and where it is is on it", /Example Building 109/.test(html), html.slice(0, 300));
}

done();
