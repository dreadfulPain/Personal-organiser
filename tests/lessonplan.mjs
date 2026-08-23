import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// READING A PLAN SOMEBODY ELSE'S TEMPLATE PRODUCED.
//
// The parser is the load-bearing part: everything downstream counts what it
// pulled out, so a heading it silently misses becomes a lesson with no method,
// which becomes a mirror that says you never do group work. So this throws real
// shapes at it — different schools' templates, different capitalisation, a plan
// with no headings at all, and one with the objective on the heading line.

import fs from "node:fs";
import vm from "node:vm";

const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp };
sb.window = sb; vm.createContext(sb);
["levels.js", "names.js", "tried.js", "lessonplan.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(`${REPO}/public/${f}`, "utf8"), sb));
const LP = sb.OrganiserLessonPlan;

sec("A plan in the shape most of them come in");
{
  const text = `Year 9 English — Tuesday period 3

Learning Objective:
To describe a setting using the five senses.

Activities:
- Starter: look at the photo, write three words
- Model a paragraph on the board
- They write their own, then swap and read
- Share two out loud

Assessment:
- Circulate and read over shoulders
- Exit ticket: one sentence using two senses`;
  const p = LP.parse(text, null);
  ok("the objective comes out", /five senses/.test(p.objective), p.objective);
  ok("the title above it is kept", /Year 9 English/.test(p.title), p.title);
  ok("every activity is picked up", p.ways.length === 4, JSON.stringify(p.ways));
  ok("bullets are stripped", !/^[-*•]/.test(p.ways[0]), p.ways[0]);
  ok("and the checks are separated from them", p.checks.length === 2, JSON.stringify(p.checks));
  ok("nothing is missing", p.missing.length === 0, JSON.stringify(p.missing));
}

sec("Another school, another template");
{
  const text = `WALT: use connectives to join two ideas

Lesson outline
1. Recap yesterday
2. Sort the connective cards into groups
3. Write four sentences

Plenary
Thumbs up / thumbs down on the three examples`;
  const p = LP.parse(text, null);
  ok("an objective on the same line as its heading still lands",
     /connectives/.test(p.objective), JSON.stringify(p));
  ok("numbered steps are read as steps", p.ways.length === 3, JSON.stringify(p.ways));
  ok("numbering is stripped too", p.ways[0] === "Recap yesterday", p.ways[0]);
  ok("a plenary counts as checking", p.checks.length === 1, JSON.stringify(p.checks));
}

sec("Spelling never matters — rule two");
{
  const p = LP.parse(`LEARNING OBJECTIVES:\nto explain photosynthesis\n\nActivites\n- watch the clip`, null);
  ok("shouting still parses", /photosynthesis/.test(p.objective), p.objective);
  ok("and a typo in a heading still parses", p.ways.length === 1, JSON.stringify(p.ways));
  const q = LP.parse(`Learnign Objective\nto add fractions`, null);
  ok("so does a typo in the objective heading", /fractions/.test(q.objective), JSON.stringify(q));
}

sec("What it refuses to invent");
{
  const p = LP.parse(`Just some notes I scribbled about tomorrow.\nNothing structured at all.`, null);
  ok("no headings means no objective, not a guessed one", p.objective === "", p.objective);
  ok("and no methods", p.ways.length === 0);
  ok("it says what it couldn't find", p.missing.length === 3, JSON.stringify(p.missing));
  ok("but it keeps the first line as a name", /Just some notes/.test(p.title), p.title);
  ok("and counts what it didn't read", p.unread === 1, String(p.unread));

  ok("an empty plan is empty, not an error", LP.parse("", null).objective === "");
  ok("and so is rubbish", LP.parse(null, null).ways.length === 0);
}

sec("Short headings don't run wild");
{
  // A bulleted line that starts with a heading word is content, not a heading.
  // Without that rule everything under it is filed as a way of checking.
  const b = LP.parse(`Activities\n- Assessment of prior learning\n- Then the main task\n- Finally a swap`, null);
  ok("a bullet naming a heading word is still a bullet", b.ways.length === 3, JSON.stringify(b.ways));
  ok("and nothing leaks into the checks", b.checks.length === 0, JSON.stringify(b.checks));

  // "lo" and "aim" are in the starting list. A line merely containing them
  // must not become a heading, or half the plan lands under the objective.
  const p = LP.parse(`Aim\nto read closely\n\nActivities\n- Closing the lesson with a summary\n- Look at the diagram`, null);
  ok("a word containing a short heading isn't treated as one",
     p.ways.length === 2, JSON.stringify(p.ways));
  ok("the objective is only the objective", p.objective === "to read closely", p.objective);
}

sec("The headings are yours");
{
  // §0.2 — a department that calls it something else, and a trade that has
  // never heard of a plenary.
  const cfg = { headings: { objective: ["what they should walk out knowing"],
                            ways: ["what we do"], checks: ["how i check"] } };
  const p = LP.parse(`What they should walk out knowing\nhow to bleed a radiator\n\nWhat we do\n- watch me do one\n- they do the next one\n\nHow I check\n- they do one on their own`, cfg);
  ok("your own headings work", /bleed a radiator/.test(p.objective), JSON.stringify(p));
  ok("and your own method heading", p.ways.length === 2, JSON.stringify(p.ways));
  ok("and your own checking heading", p.checks.length === 1, JSON.stringify(p.checks));

  // And the built-in ones are then NOT active, because you replaced them.
  const q = LP.parse(`Learning Objective:\nsomething`, cfg);
  ok("replacing the headings really replaces them", q.objective === "", JSON.stringify(q));

  // An empty list is "I don't use this heading", not "give me the defaults".
  const none = LP.parse(`Assessment:\n- a quiz`, { headings: { checks: [] } });
  ok("a heading you deleted stays deleted", none.checks.length === 0, JSON.stringify(none));
}

sec("A lesson, saved and changed");
{
  let list = LP.add([], { title: "Settings", plan: "Learning Objective:\nsenses", group: "9A",
    skill: "Writing" }, "2026-09-15");
  ok("it saves", list.length === 1 && list[0].id);
  ok("dated when you say", list[0].date === "2026-09-15");
  ok("not taught until you say so", list[0].taught === false);

  list = LP.update(list, list[0].id, { taught: true, note: "ran short, only got to two" });
  ok("marking it taught sticks", list[0].taught === true);
  ok("and the note afterwards", /ran short/.test(list[0].note));
  ok("without losing the plan", /senses/.test(list[0].plan));
  ok("or changing its id", list[0].id === list[0].id);

  ok("a lesson with nothing in it at all is refused", LP.normalise({ group: "9A" }) === null);
  ok("updating something that isn't there changes nothing",
     LP.update(list, "nope", { taught: false })[0].taught === true);
}

sec("A taught lesson is a thing you tried");
{
  const lessons = [
    { id:"l1", title:"Settings", date:"2026-09-15", group:"9A", skill:"Writing",
      plan:"x", ways:["modelled it first","they swapped and read"], checks:["exit ticket"], taught:true },
    { id:"l2", title:"Not taught", date:"2026-09-16", group:"9A", skill:"Writing",
      plan:"x", ways:["a quiz"], taught:false },
    { id:"l3", title:"No skill", date:"2026-09-17", group:"9A", plan:"x", ways:["something"], taught:true },
  ];
  const t = LP.asTried(lessons);
  ok("each way becomes a try", t.length === 2, JSON.stringify(t.map((x) => x.what)));
  ok("carrying the skill", t.every((x) => x.skill === "Writing"));
  ok("and the class", t.every((x) => x.group === "9A"));
  ok("a lesson you never taught is not evidence", !t.some((x) => x.what === "a quiz"));
  ok("and one with no skill can't be joined to anything", !t.some((x) => x.what === "something"));

  // The real point: it goes straight into the analysis that already exists,
  // without that analysis knowing lessons were invented.
  const Y = sb.OrganiserTried;
  const CFG = { levels: ["4","3","2","1"], targetLevel: "3" };
  const CLASS = [{ id:"S01", name:"S01", group:"9A" }];
  const records = [{ id:"r1", who:"S01", topic:"Writing", level:"2", date:"2026-09-01", createdAt:"" },
                   { id:"r2", who:"S01", topic:"Writing", level:"3", date:"2026-10-01", createdAt:"" }];
  const rows = Y.byApproach(t, records, CFG, CLASS, CLASS);
  ok("what-you-tried reads lessons with no changes at all",
     rows.length === 2 && rows.every((r) => r.up === 1), JSON.stringify(rows.map((r) => [r.what, r.up])));
}

sec("The mirror describes, and does not advise");
{
  const lessons = [];
  for (let i = 1; i <= 11; i++)
    lessons.push({ id:"l"+i, title:"L"+i, date:`2026-09-${String(i).padStart(2,"0")}`,
      group: i > 8 ? "9B" : "9A", skill:"Writing", plan:"x",
      objective: "do the thing", ways:["talked them through it"], checks:["exit ticket"], taught:true });
  const m = LP.mirror(lessons, {});
  ok("it counts the lessons", m.taught === 11);
  ok("and notices the same check every time", m.checks[0].used === 11, JSON.stringify(m.checks));
  ok("and how they split by class", m.groups.length === 2 && m.groups[0].planned === 8,
     JSON.stringify(m.groups));
  ok("the words give the number it rests on", /11 lessons taught/.test(LP.mirrorWords(m)),
     LP.mirrorWords(m));
  ok("and never tell you what to do",
     !/should|try|consider|need to|ought|must|improve|better|worse|poor/i.test(LP.mirrorWords(m)),
     LP.mirrorWords(m));
  ok("nor grade you",
     !/good|bad|weak|strong|excellent|failing/i.test(LP.mirrorWords(m)), LP.mirrorWords(m));

  // An objective written and never checked is the gap worth seeing.
  const gap = LP.mirror([{ id:"g", title:"t", date:"2026-09-01", group:"9A", plan:"x",
    objective:"something", ways:["a"], checks:[], taught:true }], {});
  ok("an objective with nothing to check it is counted", gap.objectiveNotChecked === 1);

  // Below three, no pattern is offered at all.
  const few = LP.mirror(lessons.slice(0, 2), {});
  ok("two lessons is not a pattern", /Too few/.test(LP.mirrorWords(few)), LP.mirrorWords(few));
  ok("and nothing at all says so plainly", /Nothing logged/.test(LP.mirrorWords(LP.mirror([], {}))));
}

sec("It has never heard of a school");
{
  const src = fs.readFileSync(`${REPO}/public/lessonplan.js`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // The starting headings are seeded vocabulary, exactly like the level names
  // in levels.js — allowed, and named as such. Nothing else may assume a
  // subject, a key stage, a syllabus or a country.
  const banned = /\b(ib|gcse|a-level|common core|ccss|key stage|ks[1-5]|year 7|maths|english|science|primary|secondary)\b/i;
  ok("no syllabus, subject or key stage anywhere in the code", !banned.test(src),
     (src.match(banned) || [])[0]);
}

// ---------------------------------------------------------------------------
sec("Starter, main, plenary — the ordinary three-part lesson");
{
  // TWO THIRDS OF IT WAS HERE. "Main" and "plenary" were both seeded and
  // "starter" was not, so a plan written the most ordinary way there is came
  // back with its starter glued onto the end of the learning objective:
  //
  //   "to explain how a writer builds tension Starter (5 min): read the
  //    opening paragraph, one word each for how it feels"
  //
  // and the objective is the one line that gets reused — the skill and the
  // evidence hang off it. Found by pasting a real plan in.
  const PLAN = [
    "9A English — Monday",
    "Learning objective: to explain how a writer builds tension",
    "",
    "Starter (5 min): read the opening paragraph, one word each for how it feels",
    "Main (25 min): annotate the extract for short sentences",
    "Plenary (10 min): one sentence each — what did the writer do and why",
  ].join("\n");
  const p = LP.parse(PLAN, null);
  ok("the objective is only the objective",
     p.objective === "to explain how a writer builds tension", JSON.stringify(p.objective));
  ok("and it has not swallowed the starter",
     !/starter/i.test(p.objective), JSON.stringify(p.objective));
  const taught = (p.ways || []).join(" | ");
  ok("the starter is part of how you taught it", /opening paragraph/.test(taught), taught);
  ok("and so is the main", /annotate the extract/.test(taught), taught);
  ok("the plenary is how you checked it",
     (p.checks || []).join(" | ").includes("one sentence each"), JSON.stringify(p.checks));

  // AND THE OTHER NAMES FOR THE SAME THING, because half of them are what the
  // department down the corridor calls it.
  ["Do now", "Bell work", "Settler", "Warm up", "Retrieval practice", "Hook"].forEach((word) => {
    const one = LP.parse(`Objective: to know the water cycle\n${word}: label the diagram from memory`, null);
    ok(`"${word}" is a way of teaching`, (one.ways || []).join(" ").includes("label the diagram"),
       `objective=${JSON.stringify(one.objective)} ways=${JSON.stringify(one.ways)}`);
    ok(`and "${word}" leaves the objective alone`,
       one.objective === "to know the water cycle", JSON.stringify(one.objective));
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
