// A PAGE'S WORTH OF DATA, IN ONE PLACE.
//
// Enough of everything that no page has to draw its empty state: a page with
// nothing to show has almost no controls, and testing that is testing nothing.
//
// It lived inside one suite and was about to be copied into a second. A fixture
// copied twice is a fixture that goes stale in one of the two, and then one
// suite is quietly testing a shape the app no longer has.

export const TODAY = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// Enough of everything that no page has to draw its empty state. A page with
// nothing to show has almost no controls, and testing that is testing nothing.
export const DATA = {
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
