import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE CONTROLS ON EVERY PAGE, ONE BY ONE.
//
// Pressing everything and seeing what dies was already here, for seven pages
// typed out by hand. This asks the questions that survived that:
//
//   · does every BUTTON on the page actually do something? A button with no
//     handler is the purest version of the failure this app keeps producing —
//     it looks finished, it is on screen, and nothing happens.
//   · does every page render far enough to be worth pressing at all? A page
//     that throws halfway through its first render still passes a
//     press-everything test, because there is almost nothing left to press.
//     That is how week.html came to be "all 2 controls survive" for months.
//   · is anything that carries data left unreachable?

import fs from "node:fs";
import path from "node:path";
import { open } from "./_dom.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
// Named rather than quietly dropped: one is prose, one needs a model before it
// does anything at all.
const SKIP = { "help.html": "prose only", "compare.html": "needs an engine" };
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html") && !SKIP[f]).sort();

const TODAY = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// Enough of everything that no page has to draw its empty state. A page with
// nothing to show has almost no controls, and testing that is testing nothing.
const DATA = {
  items: [{ id: "t1", title: "mark the books", type: "task", date: TODAY, time: "", tags: [],
    deadlineType: "soft", importance: "normal", effort: "medium", goalId: "g1", openLoop: false,
    promisedTo: "", waitingOn: "", done: false, createdAt: TODAY + "T08:00:00Z", completedAt: null,
    plannedMinutes: 0, spentMinutes: 0, optional: false, committed: false, notBefore: "", areas: ["work"] }],
  waiting: [{ id: "w1", title: "a reply", who: "Dan", since: TODAY }],
  goals: [{ id: "g1", title: "Get the reports done", areas: ["work"], date: TODAY,
    createdAt: TODAY + "T08:00:00Z", completedAt: null,
    milestones: [{ id: "m1", title: "First draft", done: false, completedAt: null,
      steps: [{ id: "s1", title: "read one set", done: false, completedAt: null }] }] }],
  records: [{ id: "r1", who: "p1", topic: "Reading", level: "3", date: TODAY,
    createdAt: TODAY + "T08:00:00Z", type: "assessment", summary: "Reading — 3", detail: "",
    extra: {}, tags: [], followUp: false, taskId: "", src: "hand",
    checkedAt: TODAY + "T08:00:00Z", files: [] }],
  recordConfig: { levels: ["4", "3", "2", "1"], levelNames: { 4: "Exceeding", 3: "Proficient", 2: "Developing", 1: "Beginning" },
    targetLevel: "3", topics: ["Reading", "Writing"], types: ["assessment"], skillTags: {},
    descriptors: {}, standards: [], whoIds: ["p1", "p2"] },
  portfolio: { points: [{ id: "st1", code: "TS1", title: "Set high expectations" }], entries: [] },
  contacts: [{ id: "p1", name: "Aisha", group: "9A", details: {}, createdAt: TODAY + "T08:00:00Z" },
    { id: "p2", name: "Ben", group: "9A", details: {}, createdAt: TODAY + "T08:00:00Z" }],
  contactConfig: { groups: ["9A"], fields: {}, note: "" },
  schedule: [{ id: "b1", label: "9A English", start: "09:00", end: "10:00", days: [0, 1, 2, 3, 4, 5, 6] }],
  scheduleConfig: { dayStart: "07:30", dayEnd: "17:30" },
  pastoralTopics: [{ id: "t:settling in", label: "settling in", options: ["fine", "not fine"] }],
  pastoralNotes: [{ id: "pn1", who: "p1", topicId: "t:settling in", choice: "fine", said: "fine",
    note: "", date: TODAY, at: TODAY + "T08:00:00Z" }],
  toldLog: [{ id: "tl1", who: "p1", person: "Mum", direction: "out", note: "the reading",
    date: TODAY, at: TODAY + "T08:00:00Z" }],
  worked: { [TODAY]: 90 },
  areas: [{ id: "work", label: "Work" }],
  targeted: {},
  tried: [{ id: "tr1", who: "p1", approach: "read aloud together", skill: "Reading", date: TODAY,
    group: "9A", whoIds: ["p1"], note: "" }],
  lessons: [{ id: "ls1", date: TODAY, slotId: "b1", group: "9A", skill: "Reading",
    plan: "Objective: read aloud", targets: ["R1"], at: TODAY + "T08:00:00Z" }],
  lessonConfig: { headings: ["Objective"] },
  rotas: [{ id: "ro1", name: "Reading aloud", memberIds: ["p1", "p2"], lastDone: {}, tried: {} }],
  syllabus: { name: "Reading", targets: [{ code: "R1", strand: "Reading", text: "reads aloud" }] },
  attendance: [{ id: "at1", group: "9A", date: TODAY, slotId: "b1", away: ["p2"], late: [],
    note: "", at: TODAY + "T08:00:00Z" }],
};

// ---------------------------------------------------------------------------
sec("Every button on every page does something");
for (const p of pages) {
  const html = fs.readFileSync(path.join(PUB, p), "utf8");
  const btns = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const r = await open(p, DATA);
  ok(`${p} opens without error`, r.errs.length === 0, r.errs.join("; "));
  if (!btns.length) continue;
  const dead = btns.filter((id) => {
    const e = r.byId.get(id);
    return !(e && e._on && e._on.click);
  });
  ok(`${p}: all ${btns.length} buttons in its markup are wired to something`,
     dead.length === 0, `nothing happens when you press: ${dead.join(", ")}`);
}

// ---------------------------------------------------------------------------
sec("Every page renders far enough to be worth pressing");
for (const p of pages) {
  const r = await open(p, DATA);
  const drawn = r.created
    .map((e) => String(e.textContent || "") + String(e.innerHTML || ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // A PAGE THAT THREW HALFWAY THROUGH ITS FIRST RENDER still passes a
  // press-everything test, because there is nothing left to press. Two of them
  // were doing exactly that and nobody could tell.
  ok(`${p} draws a real page, not a stump`, drawn.length > 120, `${drawn.length} chars: ${drawn.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------
sec("And nothing on any page shows an id where a name belongs");
for (const p of pages) {
  const r = await open(p, DATA);
  const drawn = r.created.map((e) => String(e.textContent || "") + String(e.innerHTML || "")).join(" ");
  // The ids in this fixture are p1 and p2, and the people are Aisha and Ben.
  // An id on screen means a lookup that quietly failed — the row still renders,
  // so it never looks broken, it just stops meaning anything.
  const shows = /(^|[\s>(])p[12]([\s<),.]|$)/.test(drawn);
  ok(`${p} shows names, not ids`, !shows,
     (drawn.match(/.{0,30}\bp[12]\b.{0,30}/) || [""])[0]);
}

done();
