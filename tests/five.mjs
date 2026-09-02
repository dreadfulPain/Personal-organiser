import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// FIVE THINGS TYPED IN ONE AT A TIME, AND A SCHEDULE DROPPED ON TOP.
//
// The question underneath: does what you typed end up in the right places, with
// the right details, without you having to sort it first.
//
// The lines here are the real ones, spelling and all. Spelling never matters is
// a rule, not an aspiration, so the misspellings stay in the test.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";

const PUB = join(REPO_ROOT, "public");
const UPLOAD = "/root/.claude/uploads/2a3fbe32-10e5-5444-988f-643a421d1a40/" +
  "b13ed34a-new_teachers_orientation_scheduleAug.2425.pdf";
let pass = 0, fail = 0;
const gaps = [];
const ok = (n, c, e) => {
  if (c) { pass++; console.log("  ok  " + n); }
  else { fail++; console.log("FAIL  " + n + (e ? "\n      " + String(e).slice(0, 400) : "")); }
};
const gap = (s) => { gaps.push(s); console.log("  --  " + s); };
const sec = (s) => console.log("\n" + s);

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  Promise, isNaN, parseInt, parseFloat, Uint8Array, ArrayBuffer, DecompressionStream,
  Response, Blob, setTimeout };
sb.window = sb; vm.createContext(sb);
["schedule.js", "dayshape.js", "areas.js", "priority.js", "dayplan.js",
 "quickparse.js", "pdftext.js", "calplan.js", "timetable.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const S = sb.OrganiserSchedule, D = sb.OrganiserDayShape, DP = sb.OrganiserDayPlan;
const QP = sb.OrganiserQuickParse, T = sb.OrganiserTimetable, PDF = sb.OrganiserPdfText;

const TYPED = [
  "I need to join the work email group, check my micosoft email",
  "I need to finish updateing my new phone and put in the sim cards",
  "I need to finsih updating my laptop and sign into 365",
  "I need to check my laptop can handle the app and ai",
  "I need to organise this on my clanader",
];

// ---------------------------------------------------------------------------
sec("The words in front of the job");
{
  // "I need to sign into 365" is a job called "sign into 365". A list where
  // every row starts with the same four words is four words of nothing before
  // the thing you are looking for, on every row, every time you scan it.
  [["I need to sign into 365", "sign into 365"],
   ["i have to call the office", "call the office"],
   ["remember to bring the passport", "bring the passport"],
   ["don't forget to pay the deposit", "pay the deposit"],
   ["todo: order the textbooks", "order the textbooks"],
   ["Make sure I email Wei", "email Wei"],
   ["gotta renew the visa", "renew the visa"]]
    .forEach(([raw, want]) => ok(`“${raw}” → “${want}”`, QP.dropLeadIn(raw) === want, QP.dropLeadIn(raw)));
  // Only off the front, and only when something is left.
  ok("a job that is only a lead-in keeps its words", QP.dropLeadIn("I need to") === "I need to");
  ok("and one in the middle of a sentence is left alone",
     QP.dropLeadIn("tell Dan I need to leave early") === "tell Dan I need to leave early");
}

sec("One line that is plainly two jobs");
{
  ok("a comma between two jobs splits",
     JSON.stringify(QP.pieces(TYPED[0])) ===
     JSON.stringify(["I need to join the work email group", "check my micosoft email"]),
     JSON.stringify(QP.pieces(TYPED[0])));
  ok("and so does an “and”",
     QP.pieces(TYPED[1]).length === 2, JSON.stringify(QP.pieces(TYPED[1])));
  ok("and again", QP.pieces(TYPED[2]).length === 2, JSON.stringify(QP.pieces(TYPED[2])));

  // THE ONE THAT MUST NOT SPLIT. "and" joins jobs and it joins nouns, and
  // getting that wrong the second way turns one task into two nonsense ones.
  ok("but “the app and ai” is one thing, not two",
     QP.pieces(TYPED[3]).length === 1, JSON.stringify(QP.pieces(TYPED[3])));
  [["buy milk and bread", 1], ["call Dan and Wei", 1],
   ["check the bag and coat are packed", 1],
   ["print the forms and sign them", 2],
   ["go and get the keys", 1],
   ["update the laptop and sign into 365 by friday", 2]]
    .forEach(([line, want]) =>
      ok(`“${line}” is ${want} job${want === 1 ? "" : "s"}`, QP.pieces(line).length === want,
         JSON.stringify(QP.pieces(line))));
}

sec("What each half knows");
{
  const got = QP.parseAll("update the laptop and sign into 365 by friday", { contacts: [] });
  ok("both halves come back", got.length === 2, JSON.stringify(got.map((g) => g.title)));
  // The Friday was said once, about both of them. Read per-piece, the first
  // half would have no date at all.
  ok("and the date said once applies to both",
     got[0].date && got[0].date === got[1].date, JSON.stringify(got.map((g) => g.date)));
  ok("each says what it was cut out of",
     got.every((g) => /update the laptop and sign into 365/.test(g.sourceText || "")),
     JSON.stringify(got.map((g) => g.sourceText)));
  ok("a line that is one job says nothing about being cut up",
     !QP.parseAll("call the dentist", { contacts: [] })[0].sourceText);
}

// ---------------------------------------------------------------------------
sec("Typed into the app itself, one at a time");
{
  const r = await open("index.html", {
    items: [], waiting: [], goals: [], contacts: [], schedule: [], config: {},
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const input = r.get("#capInput"), btn = r.get("#capBtn"), back = r.get("#capBack");
  const stops = [];
  for (const t of TYPED) {
    const before = (r.state.items || []).length;
    input.value = t;
    btn.click();
    await r.settle();
    // IT ONLY STOPS WHEN IT DID SOMETHING YOU WOULD WANT TO SEE. Nothing saved
    // means it is waiting to be looked at; the status text can't be used here
    // because this harness has no page reload to clear it.
    if ((r.state.items || []).length === before) {
      stops.push(t);
      r.get("#capAdd").click();
      await r.settle();
    }
  }
  ok("it stopped to show the three lines it cut in half", stops.length === 3,
     JSON.stringify(stops.map((s) => s.slice(0, 30))));
  ok("and let the other two straight through", stops.length === 3 && !stops.includes(TYPED[3]));

  const items = r.state.items || [];
  ok("eight jobs from five lines", items.length === 8, String(items.length));
  const titles = items.map((i) => i.title);
  ok("none of them still says “I need to”", !titles.some((t) => /^I need to/i.test(t)),
     JSON.stringify(titles));
  ok("the two halves of the first line are both there",
     titles.includes("join the work email group") && titles.includes("check my micosoft email"),
     JSON.stringify(titles));
  ok("the sim cards didn't get lost inside the phone",
     titles.includes("put in the sim cards"), JSON.stringify(titles));
  ok("and the app and ai stayed together",
     titles.includes("check my laptop can handle the app and ai"), JSON.stringify(titles));
  // SPELLING NEVER MATTERS — and it is never quietly corrected either. What you
  // wrote is what you look for.
  // WHAT YOU WROTE IS WHAT YOU GET BACK, minus the "I need to". Not corrected,
  // not capitalised — the words you'd search for are the words you typed.
  ok("your spelling is left exactly as you typed it",
     titles.includes("finsih updating my laptop") && titles.includes("organise this on my clanader"),
     JSON.stringify(titles));
  ok("everything landed as a task, nothing was filed somewhere odd",
     items.every((i) => i.type === "task") && !(r.state.records || []).length &&
     !(r.state.waiting || []).length,
     JSON.stringify({ records: (r.state.records || []).length, waiting: (r.state.waiting || []).length }));
  // TOLD TODAY MEANS TODAY. You said these out loud today because they are on
  // your mind today; "at no point in particular" is not the plain reading of
  // that, and undated work is never booked into a day at all.
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  ok("everything you said today is for today", items.every((i) => i.date === iso),
     JSON.stringify(items.map((i) => i.date)));
  // AND IT CAN NEVER BE A MISSED DEADLINE. You didn't give a date, so nothing
  // here is a promise — tomorrow these are still waiting, not overdue.
  ok("softly, because you never promised a day",
     items.every((i) => i.deadlineType === "soft"), JSON.stringify(items.map((i) => i.deadlineType)));
  ok("and no time was invented", items.every((i) => !i.time),
     JSON.stringify(items.map((i) => i.time)));
  // The reader itself still invents nothing: it reports that it read no date,
  // and what an absent date MEANS is decided where the task is filed.
  ok("the reader still says it read no date",
     QP.parse(TYPED[0], { contacts: [] }).date === "",
     QP.parse(TYPED[0], { contacts: [] }).date);
}

// ---------------------------------------------------------------------------
sec("And the box on the home page, which is a different one");
{
  // app.js has its own capture box with its own no-model path. It splits at
  // line breaks and full stops — neither of which is in "update the laptop and
  // sign into 365", so without this it kept one line as one job while the bar
  // on every other page cut it in two. Same words, two answers.
  const r = await open("index.html", {
    items: [], waiting: [], goals: [], contacts: [], schedule: [], config: {},
  });
  const dump = r.get("#dump");
  ok("the home page has its own box", !!dump);
  dump.value = TYPED[2];
  const add = r.get("#sortBtn");
  ok("with a button wired to it", !!(add._on && add._on.click));
  add.click();
  await r.settle();
  const heading = String(r.get("#checkbackHeading").textContent || "");
  ok("it stops and says it split the line", /Split into 2/.test(heading), heading);
}

// ---------------------------------------------------------------------------
sec("Unless you said it could wait");
{
  // "Sometime" is you saying otherwise. Narrower than "low priority", which is
  // about how much it matters rather than when.
  [["sort the cupboard sometime", true], ["tidy the shed one day", true],
   ["whenever I get a chance, email Wei", true], ["do the reports eventually", true],
   ["book the flights", false], ["mark the books", false],
   ["low priority: file the forms", false]]
    .forEach(([line, want]) =>
      ok(`“${line}” ${want ? "can wait" : "is for now"}`,
         QP.parse(line, { contacts: [] }).someday === want,
         String(QP.parse(line, { contacts: [] }).someday)));
}

sec("A schedule that is times down one side");
{
  // The third shape a timetable arrives in, and the only one that survives a
  // PDF which positions every letter separately.
  const AGENDA = [
    "7:00-11:00", "Health Check", "(bring passport & ID photos)",
    "11:30-13:00", "Lunch Break & Campus Tour", "2nd Floor, Local Cafeteria",
    "13:15-14:15", "Welcome from Leadership",
  ].join("\n");
  const r = T.read(AGENDA);
  ok("it works out this is an agenda", r.shape === "agenda", r.shape);
  ok("three entries", r.blocks.length === 3, String(r.blocks.length));
  ok("with the times read right",
     r.blocks[0].start === "07:00" && r.blocks[0].end === "11:00", JSON.stringify(r.blocks[0]));
  ok("the line under the time is what it's called",
     r.blocks[0].label === "Health Check", r.blocks[0].label);
  // The detail is not thrown away. "bring your passport" is the most important
  // line on the page and it belongs to the thing it is about.
  ok("and what follows is kept with it",
     /passport/.test(r.blocks[0].note || ""), r.blocks[0].note);
  ok("these are one-offs, not a weekly pattern",
     r.blocks.every((b) => !b.days.length), JSON.stringify(r.blocks.map((b) => b.days)));
}

sec("A PDF that positions every letter separately");
{
  // Clustering positions into columns is right for a PDF that draws cells, and
  // catastrophic for one that draws glyphs — it produces a confident grid made
  // of single letters. Better to admit the layout is no use.
  const glyphs = [{ y: 700, cells: [{ x: 39, text: "TIM" }, { x: 75, text: "E" },
                                    { x: 130, text: "TO" }, { x: 159, text: "PIC" }] },
                  { y: 680, cells: [{ x: 39, text: "7" }, { x: 50, text: ":0" }, { x: 60, text: "0" }] }];
  const r = T.fromRows(glyphs);
  ok("it refuses rather than inventing a grid of letters", r.shape === "none", r.shape);
  ok("and says why", r.note === "glyphs", r.note);
}

sec("And when the columns are gone the model is asked, and told what it's looking at");
{
  // THE PLAIN READER CAN DO NOTHING WITH A FLATTENED WEEK — one long list, no
  // way to tell Monday's lessons from Tuesday's — so it stops. Which leaves
  // exactly the job a model is good at and arithmetic isn't: five subjects
  // after five day names line up with them.
  //
  // It has to be TOLD that, though. Handed the same list with no warning it
  // reads it top to bottom and puts the whole week on Monday.
  const FLAT = ["Grade 1 Timetable", "Period", "Time",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "08:40-09:25", "English", "Story Telling", "Writing", "Reading", "Activity"].join("\n");
  const asked = [];
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] }, {
    fetch: async (url, init) => {
      const body = JSON.parse((init && init.body) || "{}");
      asked.push({ url, body });
      return { ok: true, json: async () => ({
        blocks: ["English", "Story Telling", "Writing", "Reading", "Activity"].map((label, i) =>
          ({ label, start: "08:40", end: "09:25", days: [i + 1] })),
        unreadable: [] }) };
    },
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  const box = r.get("#ttText");
  box.value = FLAT;
  const read = r.get("#ttRead");
  read.fire("click", { target: read });
  await r.settle();

  const tt = asked.find((a) => /api\/timetable/.test(a.url));
  ok("the model is asked rather than the whole thing stopping", !!tt,
     JSON.stringify(asked.map((a) => a.url)));
  ok("and told the columns are gone", tt && tt.body.flattened === true,
     tt && JSON.stringify(tt.body).slice(0, 120));

  // AND WHAT COMES BACK SAYS HOW IT WAS COME BY. The failure here is not a gap
  // anybody would notice — it is a timetable that looks entirely right with
  // Tuesday's lessons on Monday — so the check-back names the guessed part.
  const review = r.get("#ttReview");
  const said = String(review.innerHTML || "") +
    [...(review.children || [])].map((c) => String(c.innerHTML || "")).join(" ");
  ok("the check-back says the days were worked out", /worked out, not read/.test(said),
     said.slice(0, 300));
  ok("and names the day as the part to check", /day against each one is the part to check/.test(said),
     said.slice(0, 300));
  ok("and does not claim the times were guessed too", /times and the names are off/.test(said),
     said.slice(0, 300));
}

sec("And a week that read properly is not labelled a guess");
{
  // THE WARNING MUST NOT OUTLIVE THE READING IT IS ABOUT. Two readings in one
  // sitting — the flattened one first, then a real grid — because a flag that
  // is set and never cleared only shows itself on the SECOND one, and a caution
  // that appears over a reading it isn't about teaches somebody to ignore it.
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] }, {
    fetch: async () => ({ ok: true, json: async () => ({
      blocks: [{ label: "English", start: "08:40", end: "09:25", days: [1] }], unreadable: [] }) }),
  });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  const box = r.get("#ttText");
  const read = r.get("#ttRead");
  // THE ONE ON SCREEN NOW, not every one ever drawn. The page rebuilds its
  // whole setup panel each render, so the old table is gone; the stand-in keeps
  // elements by id, so it isn't. Reading the last one drawn is what a person
  // is actually looking at either way.
  const said = () => {
    const kids = [...(r.get("#ttReview").children || [])]
      .filter((c) => String(c.className || "").includes("su-review"));
    const last = kids[kids.length - 1];
    return last ? String(last.innerHTML || "") : "";
  };

  // One with the columns gone, which is a guess and says so.
  box.value = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "08:40-09:25", "English", "Writing", "Reading", "Activity", "Story Telling"].join("\n");
  read.fire("click", { target: read });
  await r.settle();
  ok("the flattened one is called a guess", /worked out, not read/.test(said()), said().slice(0, 200));

  // Then a real grid, read straight off the page, which is not.
  box.value = ["\tMonday\tTuesday", "08:40-09:25\tEnglish\tWriting"].join("\n");
  read.fire("click", { target: read });
  await r.settle();
  ok("a grid read straight off the page still reads", /Check these before/.test(said()), said().slice(0, 200));
  ok("and is not still carrying the last one's warning",
     !/worked out, not read/.test(said()), said().slice(0, 300));
}

sec("The model may write what this app has no field for, and it changes nothing");
{
  // WHAT WAS BEING ASKED FOR. Every field a block has is a question somebody
  // once thought to ask, and a reader that can only answer those has to throw
  // away everything else it saw — "swaps with PE in week B", "bring swimming
  // kit", "covered by Ms Chen on Thursdays". What it throws away is invisible,
  // because you cannot check a list for what isn't on it.
  //
  // So there is a place for the rest, named by whoever wrote the document
  // rather than by this app. KEPT AND SHOWN. NEVER ACTED ON — and that last
  // part is the whole of what makes it safe to let anything at all be written.
  const S = sb.OrganiserSchedule;
  const said = [{ name: "week", value: "B only" }, { name: "bring", value: "swimming kit" }];
  const kept = S.normaliseBlock({
    label: "Swimming", start: "09:00", end: "10:00", days: [1], extras: said,
  });
  ok("a name this app never heard of survives", kept.extras.length === 2,
     JSON.stringify(kept.extras));
  ok("with the words as written", kept.extras[0].name === "week" &&
     kept.extras[0].value === "B only", JSON.stringify(kept.extras));

  // AND IT CHANGES NOTHING. The same block with and without them must be the
  // same block in every way the app can act on — that is the guarantee, and it
  // is why this is safe to allow.
  const bare = S.normaliseBlock({ label: "Swimming", start: "09:00", end: "10:00", days: [1] });
  const same = (a, b) => {
    const strip = (x) => { const c = { ...x }; delete c.id; delete c.extras; return JSON.stringify(c); };
    return strip(a) === strip(b);
  };
  ok("everything else about it is untouched", same(kept, bare),
     JSON.stringify(kept) + "\n vs \n" + JSON.stringify(bare));
  ok("and it is still somewhere you can sit", S.mustBeThere(kept) === S.mustBeThere(bare),
     `${S.mustBeThere(kept)} vs ${S.mustBeThere(bare)}`);

  // A NAME THAT LOOKS LIKE ONE OF THE APP'S OWN CANNOT BECOME IT. This is the
  // way a free-for-all turns into a way in: a model that answers
  // {"name":"blocksDay","value":"true"} must not take the day off.
  const sneaky = S.normaliseBlock({
    label: "Swimming", start: "09:00", end: "10:00", days: [1],
    extras: [{ name: "blocksDay", value: "true" }, { name: "beThere", value: "yes" },
             { name: "where", value: "Room 9" }],
  });
  ok("a field name in the list is not that field", sneaky.blocksDay === false,
     String(sneaky.blocksDay));
  ok("nor does it make you have to be there", S.mustBeThere(sneaky) === false,
     String(S.mustBeThere(sneaky)));
  ok("and the real where is still empty", sneaky.where === "", JSON.stringify(sneaky.where));
  ok("they are only ever a list on the side", sneaky.extras.length === 3,
     JSON.stringify(sneaky.extras));

  // AND A MODEL HAVING A BAD DAY FILLS A BOX, NOT THE FILE.
  const flood = S.normaliseBlock({
    label: "Swimming", start: "09:00", end: "10:00", days: [1],
    extras: Array.from({ length: 200 }, (_, i) => ({ name: "n" + i, value: "x".repeat(9000) })),
  });
  ok("there are only ever a few", flood.extras.length === 8, String(flood.extras.length));
  ok("and none of them is long", flood.extras.every((x) => x.value.length <= 200),
     String(Math.max(...flood.extras.map((x) => x.value.length))));
  ok("and rubbish is dropped rather than stored",
     S.normaliseBlock({ label: "x", start: "09:00", end: "10:00", days: [1],
       extras: [{ name: "", value: "no name" }, { name: "no value", value: "" }, "not even an object"] })
       .extras.length === 0, "empty pairs were kept");
}

sec("And what it wrote is on the screen, not just in the file");
{
  // KEPT AND NOT SHOWN IS THE SAME AS THROWN AWAY, only with more disk used.
  const r = await open("timeline.html", {
    schedule: [], scheduleConfig: { modelFirst: true }, config: {}, items: [], goals: [],
  }, {
    fetch: async () => ({ ok: true, json: async () => ({
      blocks: [{ label: "Swimming", start: "09:00", end: "10:00", days: [1],
                 extras: [{ name: "week", value: "B only" }] }],
      unreadable: [] }) }),
  });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  r.get("#ttText").value = "Mon 09:00-10:00 Swimming";
  const b = r.get("#ttRead");
  b.fire("click", { target: b });
  await r.settle();
  const all = (n) => !n ? "" : String(n.innerHTML || "") +
    [...(n.children || [])].map((c) => String(c.textContent || "") + all(c)).join(" ");
  const box = [...(r.get("#ttReview").children || [])]
    .filter((c) => String(c.className || "").includes("su-review")).pop();
  ok("what the model wrote is on the check-back", /week: B only/.test(all(box)),
     all(box).slice(0, 400));
}

sec("And what the model is sent is the table, not the flattened text");
{
  // A PDF THAT POSITIONS ITS COLUMNS hands back text with the gaps missing
  // entirely — "TimeMondayTuesday", and a row of lessons as one long word. That
  // was what went to the model, so it was being asked to make sense of a
  // document with its word boundaries taken out. The positions have the cells
  // in them and always did.
  const at = (x, text) => ({ x, text });
  const rows = [
    { cells: [at(40, "Time"), at(150, "Monday"), at(300, "Tuesday")] },
    { cells: [at(40, "08:40-09:25"), at(150, "Science"), at(190, "&"), at(210, "Social"),
              at(250, "Studies"), at(300, "English")] },
  ];
  const table = T.tableOf(rows);
  ok("the cells come back as a table", /\t/.test(table), JSON.stringify(table));
  ok("with the whole of a wide cell in one of them",
     /Science & Social Studies\tEnglish/.test(table), JSON.stringify(table));
  ok("and nothing run together", !/StudiesEnglish/.test(table), JSON.stringify(table));
  // AND IT IS WHAT THE PAGE HANDS OVER. Pinned on the line that decides, because
  // the alternative is the flattened text and the two look identical from here.
  const tl = fs.readFileSync(`${REPO_ROOT}/public/timeline.js`, "utf8");
  ok("the page sends it rather than the flattened text",
     /const forModel = \(pdf && pdf\.rows && T && T\.tableOf\(pdf\.rows\)\) \|\| text;/.test(tl),
     "the model is back on the flattened text");
  ok("and both ways in send the same thing",
     (tl.match(/askTheModel\(forModel/g) || []).length === 2,
     "one way in still sends something else");
}

sec("And reading the same week in twice does not give you two of it");
{
  // WHAT WAS ON SCREEN. Fifteen blocks where the first three were the week and
  // the rest were the same lessons again in another shape — because the first
  // reading was wrong, it got saved, and the second reading was added on top of
  // it. Taking those out is one press each.
  //
  // The calendar's two ways in have always refused a day they already had. This
  // one — the one people actually use — never did.
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  const GRID = ["\tMonday\tTuesday", "08:40-09:25\tEnglish\tWriting"].join("\n");
  const readAndSave = async () => {
    r.get("#ttText").value = GRID;
    const b = r.get("#ttRead");
    b.fire("click", { target: b });
    await r.settle();
    const box = [...(r.get("#ttReview").children || [])]
      .filter((c) => String(c.className || "").includes("su-review")).pop();
    const save = [...(box.children || [])].concat(
      ...[...(box.children || [])].map((c) => [...(c.children || [])]))
      .find((c) => String(c.textContent || "") === "Save these blocks");
    save.fire("click", { target: save });
    await r.settle();
  };
  await readAndSave();
  ok("the first reading goes in", (r.state.schedule || []).length === 2,
     JSON.stringify((r.state.schedule || []).map((b) => `${b.label} ${b.days}`)));
  await readAndSave();
  ok("and the same one again adds nothing", (r.state.schedule || []).length === 2,
     JSON.stringify((r.state.schedule || []).map((b) => `${b.label} ${b.days}`)));
  ok("and it says so rather than looking like it saved them",
     /already in your week/.test(String(r.get("#ttStatus").textContent || "")),
     String(r.get("#ttStatus").textContent));

  // THE SAME NAME AT THE SAME TIME ON ANOTHER DAY IS NOT A DUPLICATE — that is
  // simply what a timetable looks like, and refusing it would quietly delete
  // half of everybody's week.
  // TWO DAY NAMES, because one is not a heading row: with a single day the
  // reader has no header to find and falls back to "these columns are Monday
  // onwards" — which puts the lesson back on Monday, where it really is a
  // duplicate. The fixture was wrong, not the rule.
  r.get("#ttText").value = ["\tWednesday\tThursday", "08:40-09:25\tEnglish\tArt"].join("\n");
  const b2 = r.get("#ttRead");
  b2.fire("click", { target: b2 });
  await r.settle();
  const box2 = [...(r.get("#ttReview").children || [])]
    .filter((c) => String(c.className || "").includes("su-review")).pop();
  const save2 = [...(box2.children || [])].concat(
    ...[...(box2.children || [])].map((c) => [...(c.children || [])]))
    .find((c) => String(c.textContent || "") === "Save these blocks");
  save2.fire("click", { target: save2 });
  await r.settle();
  ok("the same lesson on another day still goes in", (r.state.schedule || []).length === 4,
     JSON.stringify((r.state.schedule || []).map((b) => `${b.label} ${b.days}`)));
}

sec("A cell wider than its column is still one cell");
{
  // WHAT WAS ON SCREEN. A saved week where the lessons were called "English(G1",
  // "Science & So", "Homework(G", "Activity(G1" — every one of them cut at the
  // first word or two, and the rest of the subject simply gone.
  //
  // A PDF holds no cells, only words at positions, and the columns were being
  // worked out by clustering EVERY position in the document. So a cell wider
  // than its column — "Science & Social Studies (G1) Primary Section", which is
  // what a real one says — became four or five columns of its own. Only the
  // first sat under a day name, and the reader reads the day columns, so
  // everything after the first word or two went into columns nothing ever looks
  // at. Not truncated: dropped, silently, and the subject named after its
  // opening word.
  //
  // A table's columns are set by its heading row. So they are taken from it.
  const at = (x, text) => ({ x, text });
  const runs = (x0, words) => {
    const out = [];
    let x = x0;
    words.forEach((w) => { out.push(at(x, w)); x += w.length * 5.5 + 3; });
    return out;
  };
  const rows = [
    { cells: [at(40, "Time"), at(150, "Monday"), at(300, "Tuesday"), at(450, "Wednesday")] },
    { cells: [at(40, "08:40-09:25"),
              ...runs(150, ["Science", "&", "Social", "Studies", "(G1)"]),
              ...runs(300, ["English", "(G1)", "Primary", "Section"]),
              ...runs(450, ["Art"])] },
  ];
  const r = T.fromRows(rows);
  ok("three lessons, one to a day", r.blocks.length === 3, JSON.stringify(r.blocks.map((b) => b.label)));
  const on = (d) => (r.blocks.find((b) => b.days[0] === d) || {}).label;
  ok("a wide cell keeps all of itself", on(1) === "Science & Social Studies (G1)", on(1));
  ok("and does not stop at its first word", /Studies/.test(on(1) || ""), on(1));
  ok("the day beside it is its own lesson", on(2) === "English (G1) Primary Section", on(2));
  ok("and has not been given the tail of the one before it",
     !/Studies/.test(on(2) || ""), on(2));
  ok("and a short cell is unharmed", on(3) === "Art", on(3));

  // AND THE TIME IS STILL TO THE LEFT OF THE DAYS. The heading row's leading
  // cell is often blank, so there is no edge for the time column — and without
  // one every time in the document belongs to Monday and no row has a time at
  // all.
  const blank = [
    { cells: [at(150, "Monday"), at(300, "Tuesday")] },
    { cells: [at(40, "08:40-09:25"), ...runs(150, ["Science", "&", "Social", "Studies"]),
              ...runs(300, ["Art"])] },
  ];
  const b2 = T.fromRows(blank);
  ok("a header with no cell over the times still reads", b2.blocks.length === 2,
     JSON.stringify(b2.blocks.map((x) => `${x.label} ${x.start}`)));
  ok("with the time off the left-hand column",
     b2.blocks[0] && b2.blocks[0].start === "08:40", b2.blocks[0] && b2.blocks[0].start);
  ok("and the whole of the wide cell",
     b2.blocks[0] && b2.blocks[0].label === "Science & Social Studies",
     b2.blocks[0] && b2.blocks[0].label);
}

sec("Who reads it first is a setting, and both of them say how long they took");
{
  // "THE MODEL IS SLOWER" WAS NEVER MEASURED on the machine it happens on. It
  // is a defensible default and it was still an assertion, so it is a switch
  // now, and each reader says how long it took — the decision belongs to
  // whoever is sitting in front of it, made from their own numbers.
  const asked = [];
  const openWith = async (modelFirst, answer) => {
    const r = await open("timeline.html", {
      schedule: [], scheduleConfig: { modelFirst }, config: {}, items: [], goals: [],
    }, {
      fetch: async (url, init) => {
        if (/api\/timetable/.test(String(url))) asked.push(JSON.parse((init && init.body) || "{}"));
        return { ok: true, json: async () => answer };
      },
    });
    const toggle = r.get("#setupToggle");
    toggle.fire("click", { target: toggle });
    await r.settle();
    return r;
  };
  const GRID = ["\tMonday\tTuesday", "08:40-09:25\tEnglish\tWriting"].join("\n");
  const read = async (r, text) => {
    r.get("#ttText").value = text;
    const b = r.get("#ttRead");
    b.fire("click", { target: b });
    await r.settle();
  };
  const rows = (r) => {
    const kids = [...(r.get("#ttReview").children || [])]
      .filter((c) => String(c.className || "").includes("su-review"));
    const box = kids[kids.length - 1];
    const walk = (n) => !n ? [] : [...(n.children || [])]
      .flatMap((c) => (String(c.className || "").includes("su-trow") ? [c] : walk(c)));
    return walk(box);
  };

  // OFF: read here, and the model is never troubled by a grid it can't improve.
  asked.length = 0;
  const off = await openWith(false, { blocks: [], unreadable: [] });
  await read(off, GRID);
  ok("with it off the grid is read here", rows(off).length === 2, String(rows(off).length));
  ok("and the model is not asked at all", asked.length === 0, JSON.stringify(asked));
  ok("and it says how long that took",
     /Read here in /.test(String(off.get("#ttStatus").textContent || "")),
     String(off.get("#ttStatus").textContent));

  // ON: the model is asked, and its answer is the one that is kept.
  asked.length = 0;
  const on = await openWith(true, { blocks: [
    { label: "From the model", start: "09:00", end: "10:00", days: [1] }], unreadable: [] });
  await read(on, GRID);
  ok("with it on the model is asked", asked.length === 1, JSON.stringify(asked));
  ok("and its answer is what is kept", rows(on).length === 1, String(rows(on).length));
  ok("and it says how long the model took",
     /read by the model in /.test(String(on.get("#ttStatus").textContent || "")),
     String(on.get("#ttStatus").textContent));

  // AND THE DOCUMENT IS STILL READ EITHER WAY. "The model first" means its
  // answer wins, not that the document goes unread — the reading here costs a
  // fraction of a millisecond and is the only thing that can say whether the
  // columns survived, which is what the model gets told it is looking at.
  asked.length = 0;
  const flat = await openWith(true, { blocks: [
    { label: "English", start: "08:40", end: "09:25", days: [1] }], unreadable: [] });
  await read(flat, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "08:40-09:25", "English", "Writing", "Reading", "Activity", "Art"].join("\n"));
  ok("a flattened week is still spotted with the model going first",
     asked[0] && asked[0].flattened === true, JSON.stringify(asked[0]));
  const shown = (() => {
    const kids = [...(flat.get("#ttReview").children || [])]
      .filter((c) => String(c.className || "").includes("su-review"));
    const last = kids[kids.length - 1];
    const all = (n) => !n ? "" : String(n.innerHTML || "") + [...(n.children || [])].map(all).join(" ");
    return all(last);
  })();
  ok("and the days are still called a guess", /worked out, not read/.test(shown),
     shown.slice(0, 200));
}

sec("And whichever goes first, the other one picks up what it misses");
{
  // A TURN TAKEN IS NOT AN ANSWER. With the model first and nothing coming
  // back, the plain reader has not had its go — and on a clean grid it is the
  // one that was always going to get it.
  const r = await open("timeline.html", {
    schedule: [], scheduleConfig: { modelFirst: true }, config: {}, items: [], goals: [],
  }, { fetch: async () => ({ ok: true, json: async () => ({ blocks: [], unreadable: [] }) }) });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  r.get("#ttText").value = ["\tMonday\tTuesday", "08:40-09:25\tEnglish\tWriting"].join("\n");
  const b = r.get("#ttRead");
  b.fire("click", { target: b });
  await r.settle();
  const kids = [...(r.get("#ttReview").children || [])]
    .filter((c) => String(c.className || "").includes("su-review"));
  const walk = (n) => !n ? [] : [...(n.children || [])]
    .flatMap((c) => (String(c.className || "").includes("su-trow") ? [c] : walk(c)));
  ok("the grid is read here after the model found nothing",
     walk(kids[kids.length - 1]).length === 2, String(walk(kids[kids.length - 1]).length));
  const status = String(r.get("#ttStatus").textContent || "");
  ok("and it says the model went first and found nothing",
     /model found nothing/.test(status), status);
  ok("with how long that cost", /found nothing in /.test(status), status);
  ok("and how long this one took", /Read here in /.test(status), status);
}

sec("A reading is measured before it is believed");
{
  // THE HOLE THIS CLOSES. The plain reader goes first and the model is asked
  // only when it comes back with nothing — which is right nearly always, since
  // a grid is arithmetic. But the test for "it worked" was "it produced
  // blocks", and that is a very weak stand-in for "it read the document":
  // eight lessons all called the same thing, on no day, counted as a success,
  // so the model was never asked and nothing said the reading was thin.
  const same = { blocks: [{ label: "G1( )", days: [] }, { label: "G1( )", days: [] },
                          { label: "G1( )", days: [] }] };
  ok("a week where everything has one name is thin", /same name/.test(T.thin(same, "x")),
     JSON.stringify(T.thin(same, "x")));
  const WEEK = "Monday Tuesday Wednesday Thursday Friday";
  const oneDay = { blocks: [{ label: "English", days: [1] }, { label: "Writing", days: [1] }] };
  ok("and so is a whole week that landed on one day",
     /landed on one/.test(T.thin(oneDay, WEEK)), JSON.stringify(T.thin(oneDay, WEEK)));

  // AND NEITHER IS A GOOD READING, which is the half that matters: a measure
  // that fires on everything is a measure nobody reads.
  const real = { blocks: [{ label: "English", days: [1] }, { label: "Writing", days: [2] }] };
  ok("a real week is not called thin", T.thin(real, WEEK) === "", T.thin(real, WEEK));
  ok("nor is a document that only ever names one day",
     T.thin(oneDay, "Monday only") === "", T.thin(oneDay, "Monday only"));
  ok("nor is a single block, which cannot be compared to anything",
     T.thin({ blocks: [{ label: "English", days: [1] }] }, WEEK) === "",
     T.thin({ blocks: [{ label: "English", days: [1] }] }, WEEK));
}

sec("And a thin one is offered a second opinion rather than quietly kept");
{
  // OFFERED, NOT TAKEN. A one-day timetable exists and so does a week of the
  // same duty, so this may be a perfectly good reading of an unusual document.
  // What was wrong before was not preferring one reading over the other — it
  // was never noticing there was a question.
  const asked = [];
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] }, {
    fetch: async (url, init) => {
      if (/api\/timetable/.test(String(url))) asked.push(JSON.parse((init && init.body) || "{}"));
      return { ok: true, json: async () => ({
        blocks: [{ label: "English", start: "08:40", end: "09:25", days: [1] },
                 { label: "Writing", start: "08:40", end: "09:25", days: [2] }],
        unreadable: [] }) };
    },
  });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  // The table on screen now, and the button the PAGE wired — which the
  // stand-in hands back per element, so it has to be asked of the same box the
  // page asked, not of the document.
  const table = () => {
    const kids = [...(r.get("#ttReview").children || [])]
      .filter((c) => String(c.className || "").includes("su-review"));
    return kids[kids.length - 1] || null;
  };
  // Everything the table says, heading and rows: the notices are set as
  // innerHTML on the box, the rows are appended as elements with their own.
  const all = (n) => !n ? "" : String(n.innerHTML || "") +
    [...(n.children || [])].map(all).join(" ");
  const said = () => all(table());
  const box = r.get("#ttText");
  const read = r.get("#ttRead");
  box.value = ["Monday Tuesday Wednesday Thursday Friday",
    "Mon 08:40-09:25 English", "Mon 09:35-10:15 Writing"].join("\n");
  read.fire("click", { target: read });
  await r.settle();

  ok("the reading is still shown", /Check these before/.test(said()), said().slice(0, 200));
  ok("and the model has not been asked behind your back", asked.length === 0,
     JSON.stringify(asked));
  ok("but it says the reading looked thin", /looking thin/.test(said()), said().slice(0, 400));
  ok("and says what looked thin about it", /landed on one/.test(said()), said().slice(0, 400));
  ok("and allows that it might be right anyway", /may be right/.test(said()), said().slice(0, 400));

  // TAKING THE OFFER asks the model with the same words the first reading had —
  // which the box no longer holds, because the panel is rebuilt every render.
  const btn = table().querySelector("#ttSecond");
  btn.fire("click", { target: btn });
  await r.settle();
  ok("taking the offer asks the model", asked.length === 1, JSON.stringify(asked));
  ok("with the text the first reading had", /Mon 08:40-09:25 English/.test(asked[0].text || ""),
     JSON.stringify(asked[0]).slice(0, 160));
  ok("and not claiming the columns were lost, which nothing established",
     asked[0].flattened === false, JSON.stringify(asked[0]).slice(0, 160));
  ok("what comes back replaces it", /Writing/.test(said()), said().slice(0, 400));
  ok("and the offer is gone with the reading it was about",
     !/looking thin/.test(said()), said().slice(0, 400));
}

sec("And a second opinion that comes back empty takes nothing away");
{
  // YOU ASKED TO COMPARE TWO THINGS, NOT TO LOSE ONE. A model that finds
  // nothing must leave what was already read exactly where it was.
  const r = await open("timeline.html", { schedule: [], config: {}, items: [], goals: [] }, {
    fetch: async () => ({ ok: true, json: async () => ({ blocks: [], unreadable: [] }) }),
  });
  const toggle = r.get("#setupToggle");
  toggle.fire("click", { target: toggle });
  await r.settle();
  const box = r.get("#ttText");
  const read = r.get("#ttRead");
  box.value = ["Monday Tuesday Wednesday Thursday Friday",
    "Mon 08:40-09:25 English", "Mon 09:35-10:15 Writing"].join("\n");
  read.fire("click", { target: read });
  await r.settle();
  const before = [...(r.get("#ttReview").children || [])].length;
  const kid = [...(r.get("#ttReview").children || [])]
    .filter((c) => String(c.className || "").includes("su-review")).pop();
  const btn = kid.querySelector("#ttSecond");
  btn.fire("click", { target: btn });
  await r.settle();
  const kids = [...(r.get("#ttReview").children || [])]
    .filter((c) => String(c.className || "").includes("su-review"));
  ok("the first reading is still there", kids.length > 0 && before > 0,
     `${before} before, ${kids.length} after`);
  ok("and it says so rather than looking like it worked",
     /didn't get any further/.test(String(r.get("#ttStatus").textContent || "")),
     String(r.get("#ttStatus").textContent));
}

sec("And a class beside the period is who it's for, not what it is");
{
  // THE SAME QUESTION, ASKED IN ONE PLACE AND NOT THE OTHER. Every line UNDER a
  // time has always been checked for a cohort — "Grade 5" is who a session is
  // for, not what it is called — and the line the time is ON never was.
  //
  // So a timetable that put the class beside the period gave every entry that
  // class as its name: eight rows, all called the same thing, the actual
  // subject sitting in the note underneath where nothing would ever read it.
  const r = T.readAgenda(["08:40-09:25 G1( )", "English, Primary Section",
                          "09:35-10:15 G1( )", "Story Telling"].join("\n"));
  ok("the entry is named after the subject", r.blocks[0] && r.blocks[0].label === "English, Primary Section",
     r.blocks[0] && r.blocks[0].label);
  ok("and not after the class", r.blocks.every((b) => b.label !== "G1( )"),
     JSON.stringify(r.blocks.map((b) => b.label)));
  ok("nor are they all called the same thing",
     new Set(r.blocks.map((b) => b.label)).size === r.blocks.length,
     JSON.stringify(r.blocks.map((b) => b.label)));

  // AND NOTHING IS LOST BY BEING WRONG. A row that is a time and a class and
  // nothing else is a real row, and it gets the class back as its name rather
  // than being thrown away for having none.
  const bare = T.readAgenda("09:00-10:00 Grade 5");
  ok("a row with only a class still has a name", bare && bare.blocks[0] &&
     bare.blocks[0].label === "Grade 5", bare && JSON.stringify(bare.blocks));
}

// ---------------------------------------------------------------------------
sec("A class timetable whose columns didn't survive is not eight nameless lessons");
{
  // WHAT SOMEBODY GOT WHEN THEY READ IN THEIR OWN WEEK. Eight rows, every one
  // called the same thing, none of them on any day, each with an empty date box
  // wanting to know which single day it happened on — which a weekly timetable
  // has no answer to. The times were right. Nothing else was.
  //
  // It had gone all the way through to readAgenda, which exists for a schedule
  // with the times down one side and is not fussy, because the document it is
  // for has no grid to find. Given a grid that has BEEN flattened it still
  // produces something, and something is worse than nothing here: it looks like
  // an answer, and every one of those blocks would have been thrown away on
  // save for having no day and no date.
  const FLAT = [
    "Grade 1 Timetable",
    "Period", "Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "1", "08:40-09:25", "G1( )", "English(G1) Primary Section English(G1)",
    "2", "09:35-10:15", "G1( )", "English(G1) Primary Section Story Telling",
    "3", "10:30-11:05", "G1( )", "Writing (G1) Odd Primary Section",
    "4", "12:15-12:35", "G1( )", "Activity(G1) Primary Section Reading",
  ].join("\n");
  const r = T.read(FLAT);
  ok("it is not offered as a reading", r.blocks.length === 0,
     JSON.stringify(r.blocks.map((b) => `${b.label} ${b.start}`)));
  ok("and says which part is missing", r.note === "columns", r.note);

  // AND WHAT TELLS IT APART FROM A REAL AGENDA is written on the document: a
  // week names its days across the top, an orientation schedule names one or
  // none. Same shape, same absence of dates, opposite answer.
  const ONEDAY = [
    "7:00-11:00", "Health Check", "(bring passport & ID photos)",
    "11:30-13:00", "Lunch Break & Campus Tour",
  ].join("\n");
  ok("an undated agenda is still read", T.read(ONEDAY).shape === "agenda", T.read(ONEDAY).shape);
  ok("with its entries", T.read(ONEDAY).blocks.length === 2, String(T.read(ONEDAY).blocks.length));

  // AND A DATED ONE IS KEPT however few days it names — the dates are the
  // answer to the only question this rule is asking.
  const DATED = ["Monday 24 August 2026", "9:00-10:00", "Health Check",
    "Tuesday 25 August 2026", "9:00-10:00", "Campus Tour"].join("\n");
  const d = T.read(DATED);
  ok("a dated schedule is kept even naming two days", d.shape === "agenda", d.shape);
  ok("and its entries carry the dates", d.blocks.every((b) => b.date), JSON.stringify(d.blocks.map((b) => b.date)));
}

sec("And with the columns kept it is simply a timetable");
{
  // THE SAME DOCUMENT, READ THE WAY IT SHOULD HAVE BEEN. A PDF holds no table,
  // only words at coordinates — and those coordinates ARE the columns. All that
  // was ever needed was to hand them on.
  const at = (x, text) => ({ x, text });
  const rows = [
    { cells: [at(40, "Period"), at(110, "Time"), at(210, "Monday"), at(330, "Tuesday"),
              at(450, "Wednesday"), at(570, "Thursday"), at(690, "Friday")] },
    { cells: [at(40, "1"), at(110, "08:40-09:25"), at(210, "English"), at(330, "English"),
              at(450, "Story Telling"), at(570, "English"), at(690, "Writing")] },
    { cells: [at(40, "2"), at(110, "09:35-10:15"), at(210, "Story Telling"), at(330, "Reading"),
              at(450, "English"), at(570, "Activity"), at(690, "English")] },
  ];
  const r = T.bestOf({ rows, text: "" });
  ok("it reads as a grid", r.shape === "grid", r.shape);
  ok("across the whole week", JSON.stringify(r.days) === "[1,2,3,4,5]", JSON.stringify(r.days));
  ok("ten lessons, two periods by five days", r.blocks.length === 10, String(r.blocks.length));
  ok("each on its own day", r.blocks.every((b) => b.days.length === 1),
     JSON.stringify(r.blocks.map((b) => b.days)));
  ok("called what the square says", !!r.blocks[2] && r.blocks[2].label === "Story Telling",
     r.blocks[2] && r.blocks[2].label);
  ok("and not all called the same thing",
     new Set(r.blocks.map((b) => b.label)).size > 1,
     JSON.stringify(r.blocks.map((b) => b.label)));
  // AND THE TIMES STILL COME OFF THE COLUMN THEY ARE IN.
  ok("with the period's own time",
     !!r.blocks[0] && r.blocks[0].start === "08:40" && r.blocks[0].end === "09:25",
     JSON.stringify(r.blocks[0]));

  // ONE WAY IN, NOT TWO. This decision used to live in the page, in the one
  // handler that had a PDF to hand — so when a file could be DROPPED on the box
  // as well as chosen, the drop handed over the text alone and the columns were
  // gone before anything looked at them. Both ways in ask the same function now.
  const tl = fs.readFileSync(`${REPO_ROOT}/public/timeline.js`, "utf8");
  ok("the page asks the reader rather than deciding again",
     (tl.match(/T\.bestOf\(/g) || []).length >= 2, "the two ways in have drifted apart");
  ok("and a dropped file hands over what the file had in it",
     /dropOnto\(\$\("#ttText"\), \(text, got\)/.test(tl), "the drop still hands over text alone");
  const cap = fs.readFileSync(`${REPO_ROOT}/public/capture.js`, "utf8");
  ok("and the reader of the file keeps its shape", /pdf: r/.test(cap),
     "capture throws the positions away again");
}

// ---------------------------------------------------------------------------
sec("The actual PDF the school sent");
{
  if (!fs.existsSync(UPLOAD)) {
    gap("the orientation PDF isn't here — the real-document check was skipped " +
        "(it is never committed)");
  } else {
    const got = await PDF.read(new Uint8Array(fs.readFileSync(UPLOAD)).buffer);
    ok("it opens", got.ok && got.pages.length === 2, `${got.ok} ${got.pages.length}`);
    ok("its own positions are no use, and it says so",
       T.fromRows(got.rows).shape === "none", T.fromRows(got.rows).shape);
    const r = T.fromPages(got.pages);
    ok("read page by page it is an agenda", r && r.shape === "agenda", r && r.shape);
    ok("sixteen things across two days", r.blocks.length === 16, String(r.blocks.length));
    ok("on the two days it is actually about",
       JSON.stringify(r.dates) === JSON.stringify(["2026-08-24", "2026-08-25"]),
       JSON.stringify(r.dates));
    ok("every one of them carries its date",
       r.blocks.every((b) => b.date), JSON.stringify(r.blocks.filter((b) => !b.date)));
    ok("the first morning starts where the document says it does",
       r.blocks[0].start === "07:00" && /Health Check/.test(r.blocks[0].label),
       JSON.stringify(r.blocks[0]));
    ok("and what to bring came with it",
       /passport/i.test(r.blocks[0].note || ""), r.blocks[0].note);
    ok("the second day's first session is on the second day",
       r.blocks.find((b) => /English Curriculum/.test(b.label)).date === "2026-08-25");
    ok("the one that says bring your laptop kept that",
       /laptop/i.test(r.blocks.find((b) => /IT Training/.test(b.label)).label),
       r.blocks.find((b) => /IT Training/.test(b.label)).label);
    // NOTHING FROM THE BLURB. The page ends with a welcome paragraph sitting
    // under the last time on it, and none of that is about that session.
    const last = r.blocks.filter((b) => b.date === "2026-08-24").slice(-1)[0];
    ok("the page's welcome paragraph didn't get swallowed",
       !/eager to start planning/i.test(last.note || ""), last.note);

    // AND THEN THE DAY, which is the question underneath all of it.
    sec("What the app then does with those two days");
    const schedule = r.blocks.map((b, i) => S.normaliseBlock({ ...b, id: "s" + i })).filter(Boolean);
    ok("all sixteen survive being stored", schedule.length === 16, String(schedule.length));
    const CFG = { dayStart: "07:30", dayEnd: "21:00", minGapMinutes: 10, fillFraction: 0.66,
      minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
    const items = [];
    let n = 0;
    TYPED.forEach((line) =>
      QP.parseAll(line, { contacts: [] }).forEach((g) =>
        items.push({ id: "t" + ++n, title: g.title, type: "task", date: "", time: "",
          deadlineType: "soft", importance: "normal", effort: "medium", tags: [], goalId: "",
          openLoop: false, promisedTo: "", waitingOn: "", done: false,
          createdAt: "2026-08-23T09:00:00Z", completedAt: null, plannedMinutes: 0,
          spentMinutes: 0, optional: false, committed: false, notBefore: "", areas: [] })));

    const sun = D.shapeOf(schedule, "2026-08-23", CFG);
    ok("the Sunday before is your own day", sun.kind === "own", sun.kind);
    ok("and planned as an order, not to the minute", sun.loose === true);
    const mon = D.shapeOf(schedule, "2026-08-24", CFG);
    ok("the 24th became a working day because there is now something on it",
       mon.kind === "work", mon.kind);
    ok("with six things fixed in it", S.blocksOn(schedule, "2026-08-24").length === 6,
       String(S.blocksOn(schedule, "2026-08-24").length));
    ok("and ten on the 25th", S.blocksOn(schedule, "2026-08-25").length === 10,
       String(S.blocksOn(schedule, "2026-08-25").length));

    const free = (iso) => S.gapsOn(schedule, CFG, iso).reduce((t, g) => t + (g.end - g.start), 0);
    ok("the 24th has less free time in it than the 25th",
       free("2026-08-24") > free("2026-08-25"), `${free("2026-08-24")} vs ${free("2026-08-25")}`);
    ok("but both still have time to work in", free("2026-08-24") > 60 && free("2026-08-25") > 60,
       `${free("2026-08-24")} / ${free("2026-08-25")}`);

    const plan = DP.build(items, schedule, CFG, "2026-08-24", { ctx: { items, schedule, config: CFG } });
    ok("work is placed on the 24th", plan.slots.length > 0, JSON.stringify(plan.slots.length));
    // THE PART THAT MATTERS: nothing is planned on top of the orientation.
    const busy = S.busyOn(schedule, "2026-08-24");
    const clash = plan.slots.filter((s) => busy.some((b) => s.start < b.end && s.end > b.start));
    ok("and none of it lands on top of a session you have to be at",
       clash.length === 0, JSON.stringify(clash));
    ok("it uses the gap between the health check and lunch",
       plan.slots.some((s) => s.start >= 660 && s.end <= 690), JSON.stringify(plan.slots.slice(0, 2)));
  }
}

// ---------------------------------------------------------------------------
sec("Who is running each of these");
{
  const N = (() => { vm.runInContext(fs.readFileSync(path.join(PUB, "names.js"), "utf8"), sb);
    return sb.OrganiserNames; })();
  const NOTE = "PS & MS New Teachers HS New Teachers Jack D, Joshua K (PS & MS) " +
    "Dave (HS) Xianmian Building 109 (PS & MS) Xianmian Building 105 (HS)";
  const found = N.peopleIn(NOTE);
  ok("it finds the people written as a list",
     found.some((c) => c.name === "Jack D") && found.some((c) => c.name === "Joshua K"),
     JSON.stringify(found.map((c) => c.name)));
  ok("and the one on its own", found.some((c) => c.name === "Dave"),
     JSON.stringify(found.map((c) => c.name)));
  // SHAPE, NOT VOCABULARY. Nothing here knows what a room or a school is.
  ok("a room with a number in it is not a person",
     !found.some((c) => /Building/.test(c.name)), JSON.stringify(found.map((c) => c.name)));
  ok("and an acronym is not a person",
     !found.some((c) => ["PS", "MS", "HS", "TBA"].includes(c.name)),
     JSON.stringify(found.map((c) => c.name)));
  ok("the ones written in a list are marked as the surer ones",
     found.find((c) => c.name === "Jack D").listed === true);
  ok("nothing is a person twice", new Set(found.map((c) => c.name)).size === found.length);
  ok("an empty note offers nobody", N.peopleIn("").length === 0);
}

sec("And on the page: ticked, added, linked");
{
  const r = await open("timeline.html", {
    schedule: [], config: {}, items: [], goals: [],
    // Dave is someone you already know. He must be linked without being asked.
    contacts: [{ id: "p-dave", name: "Dave", group: "", details: {}, createdAt: "2026-01-01T00:00:00Z" }],
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  r.get("#setupToggle").click();
  await r.settle();
  r.get("#ttText").value = [
    "Induction day  24 August 2026",
    "9:00-10:00", "School Culture Talk", "Jack D, Joshua K", "Xianmian Building 109",
    "11:00-12:00", "Field Trip", "Dave", "TBA",
  ].join("\n");
  r.get("#ttRead").click();
  await r.settle();

  const rows = r.created.filter((e) => String(e.className).includes("su-trow"));
  ok("two sessions came out", rows.length === 2, String(rows.length));
  // Each one gets a date box of its own, because a one-off with no day on it is
  // thrown away when it's saved — silently, until now.
  ok("each one-off is shown with a date to check",
     r.created.filter((e) => /\bsu-date\b/.test(String(e.className))).length >= 2,
     String(r.created.filter((e) => /\bsu-date\b/.test(String(e.className))).length));
  const chips = r.created.filter((e) => /\bsu-chip\b/.test(String(e.className)));
  ok("and it offers the people it found", chips.length >= 3,
     JSON.stringify(chips.map((c) => c.textContent)));
  const dave = chips.find((c) => /^Dave/.test(String(c.textContent)));
  // TBA IS NOT A SURNAME. An acronym anywhere in the run spoils it.
  ok("a placeholder next to a name doesn't become part of it",
     dave && !/TBA/.test(dave.textContent), dave && dave.textContent);
  ok("someone you already know is marked as known and already ticked",
     dave && /✓/.test(dave.textContent) && /\bon\b/.test(dave.className),
     dave && `${dave.textContent} / ${dave.className}`);
  const jack = chips.find((c) => /^Jack D/.test(String(c.textContent)));
  ok("and someone new is offered but NOT ticked",
     jack && !/\bon\b/.test(jack.className), jack && jack.className);

  jack.click();
  await r.settle();
  const put = r.created.find((e) => String(e.textContent) === "Save these blocks");
  put.click();
  await r.settle();

  const people = r.state.contacts || [];
  ok("Jack went into People", people.some((c) => c.name === "Jack D"),
     JSON.stringify(people.map((c) => c.name)));
  ok("Joshua did not, because you didn't tick him",
     !people.some((c) => c.name === "Joshua K"), JSON.stringify(people.map((c) => c.name)));
  ok("and Dave wasn't added a second time",
     people.filter((c) => c.name === "Dave").length === 1, JSON.stringify(people.map((c) => c.name)));

  const sched = S.normalise(r.state.schedule || []);
  const talk = sched.find((b) => /Culture Talk/.test(b.label));
  const trip = sched.find((b) => /Field Trip/.test(b.label));
  // A DATE IN THE PASTE IS THE DATE THEY HAPPEN ON. Without it they have no day
  // to be on, and something with no day is thrown away when it is saved.
  ok("both took the date off the top of the paste",
     talk.date === "2026-08-24" && trip.date === "2026-08-24",
     JSON.stringify([talk.date, trip.date]));
  ok("and neither became a weekly pattern",
     !talk.days.length && !trip.days.length, JSON.stringify([talk.days, trip.days]));
  const jackId = people.find((c) => c.name === "Jack D").id;
  ok("the session Jack runs is linked to him", talk.about.includes(jackId),
     JSON.stringify(talk.about));
  ok("the one Dave runs is linked to him without being asked",
     trip.about.includes("p-dave"), JSON.stringify(trip.about));
  ok("and Jack isn't linked to the trip he has nothing to do with",
     !trip.about.includes(jackId), JSON.stringify(trip.about));
  ok("it says how many now say who's running them",
     /say who's running it/.test(String(r.get("#ttStatus").textContent)),
     String(r.get("#ttStatus").textContent));
}

// ---------------------------------------------------------------------------
sec("And the things it tells you to bring");
{
  const r = await open("timeline.html", {
    schedule: [], config: {}, items: [], goals: [], contacts: [],
  });
  r.get("#setupToggle").click();
  await r.settle();
  r.get("#ttText").value = [
    "Orientation  24 August 2026",
    "7:00-11:00", "Health Check (bring passport & FOUR ID photos)", "Dan, Joey",
    "13:00-13:40", "IT Training (please bring your laptop)", "Ms Wang",
    "14:00-15:00", "Experience Sharing (PS & MS)", "Madison, Lindsey",
  ].join("\n");
  r.get("#ttRead").click();
  await r.settle();

  const chips = r.created.filter((e) => /\bsu-chip\b/.test(String(e.className)));
  const jobs = chips.filter((c) => /bring/i.test(String(c.textContent)));
  ok("it spots the two that tell you to bring something", jobs.length === 2,
     JSON.stringify(chips.map((c) => c.textContent)));
  // "(PS & MS)" IS NOT AN INSTRUCTION. A bracket is usually an aside; only one
  // in the imperative is something you have to do.
  ok("and doesn't turn a group label into a job",
     !chips.some((c) => /^PS & MS/.test(String(c.textContent))),
     JSON.stringify(chips.map((c) => c.textContent)));
  ok("the “please” is dropped, the job isn't",
     jobs.some((c) => /^bring your laptop/.test(String(c.textContent))),
     JSON.stringify(jobs.map((c) => c.textContent)));
  ok("and each says which session it came off",
     jobs.every((c) => /—/.test(String(c.textContent))), JSON.stringify(jobs.map((c) => c.textContent)));
  ok("none of them are ticked to start with",
     jobs.every((c) => !/\bon\b/.test(c.className)), JSON.stringify(jobs.map((c) => c.className)));

  jobs.find((c) => /passport/.test(String(c.textContent))).click();
  await r.settle();
  r.created.find((e) => String(e.textContent) === "Save these blocks").click();
  await r.settle();

  const items = r.state.items || [];
  ok("the one you ticked became a job", items.length === 1, JSON.stringify(items.map((i) => i.title)));
  ok("the one you didn't, didn't", !items.some((i) => /laptop/.test(i.title)),
     JSON.stringify(items.map((i) => i.title)));
  ok("and it's on the day of the thing it's for", items[0].date === "2026-08-24", items[0].date);
  ok("it's a hard date, because the health check is not moving",
     items[0].deadlineType === "hard", items[0].deadlineType);
  ok("and it remembers what it came off",
     /Health Check/.test(items[0].whenText || ""), items[0].whenText);
  ok("the sessions themselves still went in",
     (r.state.schedule || []).length === 3, String((r.state.schedule || []).length));
  ok("and it says what it did", /job added/.test(String(r.get("#ttStatus").textContent)),
     String(r.get("#ttStatus").textContent));
}

// ---------------------------------------------------------------------------
sec("A place you have to be is a job you have to do");
{
  const CFG = { dayStart: "06:00", dayEnd: "18:00", minGapMinutes: 10,
    effortMinutes: { quick: 10, medium: 30, draining: 75 }, fillFraction: 1,
    minSessionMinutes: 10, planHorizonDays: 28, prepHorizonDays: 7 };
  const AWAY = S.normaliseBlock({ id: "b1", label: "Health Check", start: "07:00",
    end: "11:00", date: "2026-08-24", beThere: true, getThere: 45 });
  ok("a block can say being there on time matters",
     AWAY.beThere === true && AWAY.getThere === 45, JSON.stringify(AWAY));

  // THE ONE THAT ACTUALLY CAUSED THE PROBLEM. Without the journey being busy,
  // the planner fills 06:15–07:00 and you arrive late having done as it said.
  const busy = S.busyOn([AWAY], "2026-08-24");
  ok("the journey is busy, not just the thing",
     busy[0].start === 375 && busy[0].end === 660, JSON.stringify(busy));
  const gaps2 = S.gapsOn([AWAY], CFG, "2026-08-24");
  ok("so nothing is offered in the three quarters of an hour before it",
     !gaps2.some((g) => g.end > 375 && g.start < 420), JSON.stringify(gaps2));
  ok("and the morning before the journey is still yours",
     gaps2.some((g) => g.start === 360 && g.end === 375), JSON.stringify(gaps2));

  // Turn it off and the old behaviour is exactly what it was.
  const NEAR = S.normaliseBlock({ ...AWAY, beThere: false, getThere: 45 });
  ok("a block that isn't one of these is untouched",
     S.busyOn([NEAR], "2026-08-24")[0].start === 420,
     JSON.stringify(S.busyOn([NEAR], "2026-08-24")));

  ok("it says when to leave", S.leaveBy(AWAY) === 375, String(S.leaveBy(AWAY)));
  ok("and says nothing for a block that isn't one", S.leaveBy(NEAR) === null);
  ok("nought minutes away is still somewhere to be on time",
     S.leaveBy(S.normaliseBlock({ ...AWAY, getThere: 0 })) === 420);

  // TWO OF THEM, AND THE SECOND ONE'S JOURNEY STARTS BEFORE THE FIRST ENDS.
  // Merging these in the order they start rather than the order you set off
  // loses the gap between them entirely.
  const A = S.normaliseBlock({ id: "a", label: "First", start: "09:00", end: "09:30",
    date: "2026-08-24" });
  const B = S.normaliseBlock({ id: "b", label: "Second", start: "10:00", end: "11:00",
    date: "2026-08-24", beThere: true, getThere: 90 });
  const both = S.busyOn([A, B], "2026-08-24");
  ok("the earlier journey isn't swallowed by the later thing",
     both.length === 1 && both[0].start === 510 && both[0].end === 660,
     JSON.stringify(both));
  ok("and the free time before it is still free",
     S.gapsOn([A, B], CFG, "2026-08-24").some((g) => g.end === 510),
     JSON.stringify(S.gapsOn([A, B], CFG, "2026-08-24")));

  // AND IT IS A JOB, in the list, tickable, with a reminder.
  const { add } = S.prepPlan([AWAY], CFG, [], new Date("2026-08-20T09:00:00"));
  const job = add.find((t) => /Health Check/.test(t.title));
  ok("it becomes a job in the list", !!job, JSON.stringify(add.map((t) => t.title)));
  ok("timed to when you set off, not when it starts", job.time === "06:15", job.time);
  ok("on the right day", job.date === "2026-08-24", job.date);
  ok("as a hard deadline, because it starts when it starts",
     job.deadlineType === "hard", job.deadlineType);
  ok("it says why that time", /45 min to get there/.test(job.whenText), job.whenText);
  ok("and it pings before you have to leave", job.remindAt === "2026-08-24T06:00",
     job.remindAt);
  ok("it's called Leave for, because there's a journey",
     /^Leave for/.test(job.title), job.title);
  // AND NOTHING AT ALL WHEN THERE IS NO JOURNEY. This used to make a "Be at
  // <block>" job timed to the very minute the block starts — so a day drew the
  // block, drew a second row underneath saying to be at it, and then warned in
  // red that the two were at the same time. Twenty-two blocks became forty-four
  // rows, half of them clashing with themselves.
  //
  // A block with no journey is already on the day and already says "be there on
  // time". There is nothing left for a second row to tell you.
  ok("and nothing at all when there is no journey to protect",
     S.prepPlan([S.normaliseBlock({ ...AWAY, getThere: 0 })], CFG, [],
       new Date("2026-08-20T09:00:00")).add.length === 0,
     JSON.stringify(S.prepPlan([S.normaliseBlock({ ...AWAY, getThere: 0 })], CFG, [],
       new Date("2026-08-20T09:00:00")).add.map((t) => t.title)));

  // AND IT CAN TAKE ONE BACK. The app could make a job on your behalf but could
  // only drop it the day AFTER — so a block you deleted, or a rule that changed,
  // left its jobs sitting in your list for a week with nothing to say they were
  // orphans.
  {
    const made = S.prepPlan([AWAY], CFG, [], new Date("2026-08-20T09:00:00")).add
      .map((t) => ({ ...t, id: "auto-" + t.prepFor, done: false }));
    ok("a job was made while the block wanted one", made.length > 0, String(made.length));
    const gone = S.prepPlan([], CFG, made, new Date("2026-08-20T09:00:00"));
    ok("and taken back once nothing asks for it", gone.drop.length === made.length,
       JSON.stringify(gone.drop.map((t) => t.title)));
    // BUT ONLY WHILE IT IS STILL THE APP'S. The moment you rename one, move it,
    // or put it off, it is yours and nothing may quietly remove it.
    const mine = made.map((t) => ({ ...t, edited: true }));
    ok("never one you have touched",
       S.prepPlan([], CFG, mine, new Date("2026-08-20T09:00:00")).drop.length === 0);
  }

  // Once, not once per look.
  const again = S.prepPlan([AWAY], CFG, add, new Date("2026-08-20T09:00:00"));
  ok("looking twice doesn't make two of them",
     !again.add.some((t) => /Health Check/.test(t.title)),
     JSON.stringify(again.add.map((t) => t.title)));

  // And it doesn't fight the work a block already owed you.
  const BOTH = S.normaliseBlock({ ...AWAY, prep: { on: true, leadDays: 1 } });
  const two = S.prepPlan([BOTH], CFG, [], new Date("2026-08-20T09:00:00"));
  ok("a block can owe you both getting ready AND being there",
     two.add.filter((t) => /Health Check/.test(t.title)).length === 2,
     JSON.stringify(two.add.map((t) => `${t.title} ${t.date} ${t.time}`)));
  ok("and they are two different jobs, not one written twice",
     new Set(two.add.map((t) => t.prepFor)).size === 2,
     JSON.stringify(two.add.map((t) => t.prepFor)));
}

sec("And the imported sessions become that, by default");
{
  const r = await open("timeline.html", {
    schedule: [], config: {}, items: [], goals: [], contacts: [],
  });
  r.get("#setupToggle").click();
  await r.settle();
  r.get("#ttText").value = [
    "Orientation  24 August 2026",
    "7:00-11:00", "Health Check", "9:00-10:00", "Welcome",
  ].join("\n");
  r.get("#ttRead").click();
  await r.settle();
  const chips = r.created.filter((e) => /\bsu-chip\b/.test(String(e.className)));
  const there = chips.find((c) => /count these as jobs/.test(String(c.textContent)));
  ok("the import says these are places you have to be", !!there,
     JSON.stringify(chips.map((c) => c.textContent)));
  // THE ONE THING IN THIS BOX THAT IS ON TO START WITH. Everything else is the
  // app proposing something; this is what a schedule already is.
  ok("and it is on already", /\bon\b/.test(there.className), there.className);
  const mins = r.created.find((e) => /\bth-mins\b/.test(String(e.className)));
  ok("with somewhere to say how long it takes to get there", !!mins);
  mins.value = "30";
  mins.fire("change", { target: mins });
  await r.settle();
  r.created.find((e) => String(e.textContent) === "Save these blocks").click();
  await r.settle();
  const sched = S.normalise(r.state.schedule || []);
  ok("both went in as places to be on time",
     sched.length === 2 && sched.every((b) => b.beThere && b.getThere === 30),
     JSON.stringify(sched.map((b) => [b.label, b.beThere, b.getThere])));
  ok("and the journey is protected",
     S.busyOn(sched, "2026-08-24")[0].start === 6 * 60 + 30,
     JSON.stringify(S.busyOn(sched, "2026-08-24")));
}

sec("And the day itself says when to leave");
{
  // Repeating on every day, so it applies whatever today is.
  const r = await open("timeline.html", {
    items: [], goals: [], contacts: [],
    schedule: [{ id: "b1", label: "Health Check", start: "11:00", end: "12:00",
      days: [0, 1, 2, 3, 4, 5, 6], beThere: true, getThere: 45 }],
    scheduleConfig: { dayStart: "06:00", dayEnd: "20:00" },
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const rows = r.created.filter((e) => /\bdp-leave\b/.test(String(e.innerHTML || "")));
  const said = r.created.map((e) => String(e.innerHTML || "")).join(" ");
  ok("the day says when to set off", /leave by/.test(said), said.slice(0, 200));
  ok("and how long it takes", /45 min to get there/.test(said), said.slice(0, 200));
}

// ---------------------------------------------------------------------------
sec("Nothing is ever planned into a lesson");
{
  vm.runInContext(fs.readFileSync(path.join(PUB, "weekplan.js"), "utf8"), sb);
  const WP = sb.OrganiserWeekPlan;
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const WEEK = [
    { id: "L1", label: "9A English", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5] },
    { id: "L2", label: "G10 Lit", start: "11:00", end: "12:00", days: [1, 2, 3, 4, 5] },
    { id: "L3", label: "G11 Writing", start: "14:00", end: "15:00", days: [1, 2, 3, 4, 5] },
  ];
  const MON = "2026-09-14";
  const mk = (o) => ({ id: o.id, title: o.title, type: "task", date: o.date || "", time: o.time || "",
    tags: [], deadlineType: o.deadlineType || "soft", importance: "normal", effort: o.effort || "medium",
    goalId: "", openLoop: false, promisedTo: "", waitingOn: "", done: false,
    createdAt: "2026-09-10T08:00:00Z", completedAt: null, plannedMinutes: 0, spentMinutes: 0,
    optional: false, committed: false, notBefore: "", areas: [] });

  const many = Array.from({ length: 12 }, (_, i) => mk({ id: "t" + i, title: "job " + i }));
  const plan = DP.build(many, WEEK, CFG, MON, { ctx: { items: many, schedule: WEEK, config: CFG } });
  const busy = S.busyOn(WEEK, MON);
  const over = plan.slots.filter((s) => busy.some((b) => s.start < b.end && s.end > b.start));
  ok("a dozen jobs are placed", plan.slots.length >= 8, String(plan.slots.length));
  ok("and not one of them lands in a lesson", over.length === 0, JSON.stringify(over));
  ok("they sit in the gaps between them",
     plan.slots.every((s) => s.end <= 540 || (s.start >= 600 && s.end <= 660) ||
       (s.start >= 720 && s.end <= 840) || s.start >= 900),
     JSON.stringify(plan.slots.map((s) => `${s.start}-${s.end}`)));

  // A TIME YOU TYPED IS DIFFERENT. It goes where you said — and used to go
  // there silently, on top of the lesson, looking exactly like a plan.
  const timed = [mk({ id: "clash", title: "mark the books", date: MON, time: "09:15" })];
  const p2 = DP.build(timed, WEEK, CFG, MON, { ctx: { items: timed, schedule: WEEK, config: CFG } });
  const slot = p2.slots.find((s) => s.itemId === "clash");
  ok("it is still put where you said", slot && slot.start === 555, JSON.stringify(slot));
  ok("but it says what it is on top of",
     slot && slot.clashWith && slot.clashWith.includes("9A English"),
     JSON.stringify(slot && slot.clashWith));
  // NOT MOVED. You may know the class is out on a trip.
  ok("and it isn't quietly moved off it", slot.start === 555);
  const fine = [mk({ id: "ok", title: "mark the books", date: MON, time: "10:15" })];
  const p3 = DP.build(fine, WEEK, CFG, MON, { ctx: { items: fine, schedule: WEEK, config: CFG } });
  ok("one that doesn't clash says nothing",
     !(p3.slots.find((s) => s.itemId === "ok").clashWith || []).length,
     JSON.stringify(p3.slots[0]));
}

sec("And why the weekend wasn't used");
{
  const WP = sb.OrganiserWeekPlan;
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const WEEK = [
    { id: "L1", label: "9A English", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5] },
    { id: "L2", label: "G10 Lit", start: "11:00", end: "12:00", days: [1, 2, 3, 4, 5] },
    { id: "L3", label: "G11 Writing", start: "14:00", end: "15:00", days: [1, 2, 3, 4, 5] },
  ];
  const MON = "2026-09-14";
  const room = WP.roomAhead(WEEK, CFG, MON, 7);
  const sat = room.find((d) => d.iso === "2026-09-19");
  ok("it knows the Saturday is free", sat && sat.free > 600, JSON.stringify(sat));
  ok("and that it is a day of your own", sat.kind === "own", sat.kind);
  ok("more free than a teaching day",
     sat.free > room.find((d) => d.iso === MON).free,
     `${sat.free} vs ${room.find((d) => d.iso === MON).free}`);

  // SO IT SAYS SO. Not a booking — undated work has no deadline to miss and
  // turning it into one would be inventing a promise.
  const better = WP.betterDay(WEEK, CFG, MON, 8);
  ok("and on a teaching day it names the freer one coming",
     better && [0, 6].includes(new Date(better.iso + "T12:00:00").getDay()),
     JSON.stringify(better));
  // On the Saturday itself there is nothing better to point at.
  ok("standing on the free day it says nothing",
     WP.betterDay(WEEK, CFG, "2026-09-19", 3) === null,
     JSON.stringify(WP.betterDay(WEEK, CFG, "2026-09-19", 3)));
  ok("and a day off is never offered as room",
     !WP.roomAhead(WEEK.concat([{ id: "off", label: "away", start: "00:00", end: "23:59",
       date: "2026-09-19", blocksDay: true }]), CFG, MON, 7).some((d) => d.iso === "2026-09-19"));
}

// ---------------------------------------------------------------------------
sec("A date you never gave can never become a failure");
{
  vm.runInContext(fs.readFileSync(path.join(PUB, "priority.js"), "utf8"), sb);
  const PR = sb.OrganiserPriority;
  const TODAY = "2026-09-20";
  const old = { id: "a", title: "put in the sim cards", type: "task", date: "2026-09-14",
    deadlineType: "soft", importance: "normal", effort: "medium", done: false, tags: [] };
  const promised = { ...old, id: "b", title: "hand in the reports", deadlineType: "hard" };
  ok("a day that went by on something you never promised is still waiting",
     PR.reason(old, { today: TODAY }) === "still waiting", PR.reason(old, { today: TODAY }));
  ok("and a deadline you DID give is overdue",
     PR.reason(promised, { today: TODAY }) === "overdue", PR.reason(promised, { today: TODAY }));
  // AND TODAY IS NO DIFFERENT. This asserted "due today" for a soft date as well
  // as a hard one — "today is today either way" — but "due" is a claim about a
  // DEADLINE, not about a date. Six things typed on a Friday morning with no
  // date on them at all came back stamped "due today": six deadlines the app
  // had invented and then told you about. That is the wall the next comment
  // describes, built on the one day you cannot escape it.
  ok("a deadline you gave for today says so",
     PR.reason({ ...promised, date: TODAY }, { today: TODAY }) === "due today",
     PR.reason({ ...promised, date: TODAY }, { today: TODAY }));
  ok("and one the app dated for you claims nothing",
     PR.reason({ ...old, date: TODAY }, { today: TODAY }) === "",
     PR.reason({ ...old, date: TODAY }, { today: TODAY }));
  // AND A DATE THE APP SUPPLIED IS NOT A DEADLINE ANYWHERE.
  //
  // Anything typed without a date gets today's, so it turns up in front of you
  // rather than sinking into a pile. Nothing recorded which dates were yours,
  // so everything downstream treated the two the same — and twenty-four things
  // typed on one morning came back as twenty-four deadlines due today, all
  // marked "little room left before it's due", with a real essay deadline on
  // Friday ranked BELOW every one of them and never planned at all.
  {
    const mine = { ...old, id: "m", date: TODAY, datedBy: "you", deadlineType: "soft" };
    const theirs = { ...old, id: "t", date: TODAY, datedBy: "app", deadlineType: "soft" };
    ok("a date you gave is one you gave", PR.gaveDate(mine) === true);
    ok("a date the app gave is not", PR.gaveDate(theirs) === false);
    // Anything written before the field existed has no answer, and the honest
    // reading of "I don't know" is "not a promise you made".
    ok("and something older than the question counts as yours",
       PR.gaveDate({ ...old, date: TODAY }) === true);
    // THE ORDERING IS THE POINT. Filler must never outrank work with a real
    // deadline; that is the whole job of this file.
    const dueFriday = { ...old, id: "f", date: "2026-09-25", datedBy: "you", deadlineType: "soft" };
    ok("filler the app dated today does not count as due",
       PR.rank(theirs, { today: TODAY }) === 4, String(PR.rank(theirs, { today: TODAY })));
    ok("but a date you gave that has arrived does",
       PR.rank(mine, { today: TODAY }) === 3, String(PR.rank(mine, { today: TODAY })));
    ok("so real work is never pushed behind filler",
       PR.rank(mine, { today: TODAY }) <= PR.rank(theirs, { today: TODAY }));
    void dueFriday;
  }

  // THE WALL. The app dates whatever you mention, so a fortnight of mentioning
  // things would otherwise be a fortnight of accusations.
  const app = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
  ok("nothing on a row calls a soft date overdue",
     !/const overdue = it\.date && it\.date < todayISO\(\);/.test(app),
     "a row still marks any past date overdue");
  ok("and the section that asks you to re-date only ever holds real deadlines",
     /deadlineType === "hard" && it\.date && it\.date < todayISO\(\)/.test(app));
}

sec("And now it can reach the weekend");
{
  const WP = sb.OrganiserWeekPlan;
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const WEEK = [
    { id: "L1", label: "9A English", start: "09:00", end: "10:00", days: [1, 2, 3, 4, 5] },
    { id: "L2", label: "G10 Lit", start: "11:00", end: "12:00", days: [1, 2, 3, 4, 5] },
    { id: "L3", label: "G11 Writing", start: "14:00", end: "15:00", days: [1, 2, 3, 4, 5] },
  ];
  const MON = "2026-09-14";
  const mk = (id, date) => ({ id, title: "job " + id, type: "task", date, time: "", tags: [],
    deadlineType: "soft", importance: "normal", effort: "draining", goalId: "", openLoop: false,
    promisedTo: "", waitingOn: "", done: false, createdAt: "2026-09-14T08:00:00Z",
    completedAt: null, plannedMinutes: 0, spentMinutes: 0, optional: false, committed: false,
    notBefore: "", areas: [] });

  // WITH NO DATE these were never booked into any day at all — which is why the
  // free Saturday went unused. Dated today, softly, they are spread like
  // anything else, and a soft one may land later rather than be squeezed in.
  const undated = Array.from({ length: 30 }, (_, i) => mk("u" + i, ""));
  const dated = Array.from({ length: 30 }, (_, i) => mk("d" + i, MON));
  const a = WP.spread(undated, WEEK, CFG, MON, 8, { today: MON, goalTitle: () => "" });
  const b = WP.spread(dated, WEEK, CFG, MON, 8, { today: MON, goalTitle: () => "" });
  ok("with no date at all, nothing is placed anywhere",
     (a.placements || []).length === 0, String((a.placements || []).length));
  ok("dated today, they are placed", (b.placements || []).length > 10,
     String((b.placements || []).length));
  const weekend = (b.placements || []).filter((p) =>
    [0, 6].includes(new Date(p.iso + "T12:00:00").getDay()));
  ok("and the free weekend is used", weekend.length > 0,
     JSON.stringify([...new Set((b.placements || []).map((p) => p.iso))]));
  ok("with more on a weekend day than a teaching day, because there are no lessons in it",
     weekend.length / 2 > (b.placements.length - weekend.length) / 6,
     `${weekend.length} across 2 days vs ${b.placements.length - weekend.length} across 6`);
}

// ---------------------------------------------------------------------------
sec("Work with no day on it is never silently held");
{
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const mk = (id, date, effort) => ({ id, title: "job " + id, type: "task", date: date || "",
    time: "", tags: [], deadlineType: "soft", importance: "normal", effort: effort || "medium",
    goalId: "", openLoop: false, promisedTo: "", waitingOn: "", done: false,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    completedAt: null, plannedMinutes: 0, spentMinutes: 0,
    optional: false, committed: false, notBefore: "", areas: [] });

  // WITH ROOM it is placed, exactly as you'd expect — filler that fills.
  const few = [mk("u1", ""), mk("u2", ""), mk("u3", "")];
  const easy = DP.build(few, [], CFG, "2026-09-14", { ctx: { items: few, schedule: [], config: CFG } });
  ok("with room, work with no day goes in", easy.slots.length === 3, String(easy.slots.length));

  // WITHOUT ROOM it gets nothing — which is fair, the day is full — but until
  // now nothing said so, while the dated work beside it was listed and re-tried.
  const packed = [...Array.from({ length: 20 }, (_, i) => mk("D" + i, "2026-09-14", "draining")),
                  ...Array.from({ length: 5 }, (_, i) => mk("U" + i, ""))];
  const full = DP.build(packed, [], CFG, "2026-09-14", { ctx: { items: packed, schedule: [], config: CFG } });
  ok("on a full day it gets none", !full.slots.some((s) => s.itemId.startsWith("U")),
     JSON.stringify(full.slots.map((s) => s.itemId)));

  const r = await open("timeline.html", {
    items: packed, goals: [], contacts: [], schedule: [],
    scheduleConfig: CFG,
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const also = r.get("#unplanned");
  ok("the day owns up to holding them", also.hidden === false, String(also.hidden));
  const said = r.created.map((e) => String(e.textContent || "")).concat([String(also.innerHTML || "")]).join(" ");
  ok("it says how many have no day on them", /5 with no day on them/.test(said), said.slice(0, 300));
  ok("and why they got nothing", /whatever room is left over/.test(said), said.slice(0, 300));
  // NAMED, not just counted. A number you can't act on is not information.
  const rows = r.created.filter((e) => /\bdp-alsorow\b/.test(String(e.className)));
  ok("and names them", rows.some((x) => /job U/.test(String(x.textContent))),
     JSON.stringify(rows.map((x) => x.textContent).slice(0, 8)));
  const waits = r.created.filter((e) => /\bdp-waiting\b/.test(String(e.className)));
  ok("how long they've sat, once that's worth saying",
     waits.length > 0 && /waiting \d+ weeks/.test(String(waits[0].textContent)),
     JSON.stringify(waits.map((x) => x.textContent)));

  // A DAY WITH ROOM SAYS NOTHING, because there is nothing to own up to.
  const r2 = await open("timeline.html", {
    items: few, goals: [], contacts: [], schedule: [], scheduleConfig: CFG,
  });
  ok("a day that fitted everything stays quiet", r2.get("#unplanned").hidden === true,
     String(r2.get("#unplanned").hidden));
}

// ---------------------------------------------------------------------------
sec("One list, in order, and the next gap takes the next thing");
{
  const PR = sb.OrganiserPriority;
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const TODAY = "2026-09-14";
  const mk = (o) => ({ id: o.id, title: o.id, type: "task", date: o.date || "", time: "",
    tags: [], deadlineType: o.deadlineType || "soft", importance: o.importance || "normal",
    effort: "quick", goalId: "", openLoop: false, promisedTo: o.promisedTo || "", waitingOn: "",
    done: false, createdAt: "2026-09-01T08:00:00Z", completedAt: null, plannedMinutes: 0,
    spentMinutes: 0, optional: false, committed: false, notBefore: "", areas: [] });
  const ctx = { today: TODAY, goalTitle: () => "" };

  const list = [
    mk({ id: "undated-high", importance: "high" }),
    mk({ id: "dated-normal", date: TODAY }),
    mk({ id: "undated-normal" }),
    mk({ id: "far-normal", date: "2026-10-05" }),
    mk({ id: "dated-hard", date: TODAY, deadlineType: "hard" }),
    mk({ id: "undated-promised", promisedTo: "Wei" }),
  ];
  const q = PR.forPlanning(list, ctx).map((i) => i.id);
  ok("a deadline that has arrived is first", q[0] === "dated-hard", JSON.stringify(q));
  // HAVING A DATE IS NOT THE SAME AS MATTERING. What you said about a thing
  // beats the mere fact that another thing has a day written on it.
  ok("then what you said matters, date or no date",
     q.indexOf("undated-high") < q.indexOf("dated-normal"), JSON.stringify(q));
  ok("and your word to someone, date or no date",
     q.indexOf("undated-promised") < q.indexOf("dated-normal"), JSON.stringify(q));
  ok("ordinary work with no day on it comes last", q[q.length - 1] === "undated-normal",
     JSON.stringify(q));

  // AND THE GAPS TAKE THEM IN THAT ORDER. The plan is the queue made concrete.
  const p = DP.build(list, [], CFG, TODAY, { ctx: { items: list, schedule: [], config: CFG,
    today: TODAY, goalTitle: () => "" } });
  ok("everything fits on an empty day", p.slots.length === 6, String(p.slots.length));
  ok("in the same order the list is in",
     JSON.stringify(p.slots.map((s) => s.itemId)) === JSON.stringify(q),
     JSON.stringify(p.slots.map((s) => s.itemId)));
  ok("each one after the last, earliest first",
     p.slots.every((s, i) => i === 0 || s.start >= p.slots[i - 1].start),
     JSON.stringify(p.slots.map((s) => s.start)));

  // WITHIN THE TAIL, WHAT YOU SAID STILL DECIDES. This used to be whatever
  // order the file happened to hold them in, so a minor job landed ahead of an
  // ordinary one for no reason at all.
  const tail = [mk({ id: "minor-1", importance: "low" }), mk({ id: "normal-1" }),
                mk({ id: "minor-2", importance: "low" }), mk({ id: "normal-2" })];
  ok("ordinary before minor, whatever order they were written in",
     JSON.stringify(PR.forPlanning(tail, ctx).map((i) => i.id)) ===
     JSON.stringify(["normal-1", "normal-2", "minor-1", "minor-2"]),
     JSON.stringify(PR.forPlanning(tail, ctx).map((i) => i.id)));
}

// ---------------------------------------------------------------------------
sec("A deadline is a time to have finished by, not a time to do it at");
{
  const PR = sb.OrganiserPriority, WP = sb.OrganiserWeekPlan;
  const TODAY = "2026-09-14";
  const SCHED = [{ id: "L1", label: "lesson", start: "09:00", end: "12:00", days: [1, 2, 3, 4, 5] },
                 { id: "L2", label: "lesson", start: "13:00", end: "15:00", days: [1, 2, 3, 4, 5] }];
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const mk = (id, date, eff, imp) => ({ id, title: id, type: "task", date: date || "", time: "",
    tags: [], deadlineType: "hard", importance: imp || "normal", effort: eff || "medium",
    goalId: "", openLoop: false, promisedTo: "", waitingOn: "", done: false,
    createdAt: "2026-09-01T08:00:00Z", completedAt: null, plannedMinutes: 0, spentMinutes: 0,
    optional: false, committed: false, notBefore: "", areas: [] });

  // ROOM IS COUNTED AGAINST WHAT IS OWED TO IT, per deadline, cumulatively —
  // everything due on or before a date competes for the same hours.
  const three = [mk("a", "2026-09-16", "draining"), mk("b", "2026-09-16", "draining"),
                 mk("c", "2026-09-16", "draining"), mk("far", "2026-12-14", "quick")];
  const load = WP.deadlineLoad(three, SCHED, CFG, TODAY, 28);
  ok("it works out the room before each deadline", load.length === 2, JSON.stringify(load));
  ok("and what is already owed to it", load[0].need === 225, String(load[0].need));
  ok("counting later deadlines cumulatively",
     load[1].need === 235, String(load[1].need));

  // FOUR HOURS DUE FRIDAY WITH THREE HOURS FREE IS URGENT. Ten minutes due
  // Friday is not, and never becomes so until Friday.
  ok("with room to spare, nothing is urgent yet",
     WP.tightIds(three, SCHED, CFG, TODAY, 28).size === 0,
     JSON.stringify([...WP.tightIds(three, SCHED, CFG, TODAY, 28)]));
  const lots = [...Array.from({ length: 8 }, (_, i) => mk("big" + i, "2026-09-16", "draining")),
                mk("far", "2026-12-14", "quick")];
  const tight = WP.tightIds(lots, SCHED, CFG, TODAY, 28);
  ok("once the room runs out, they are", tight.size === 8, String(tight.size));
  ok("and a deadline months off with room in front of it isn't",
     !tight.has("far"), JSON.stringify([...tight]));

  // AND THAT IS WHAT MOVES THEM UP THE LIST. Before this a hard deadline due
  // tomorrow ranked the same as one due in three months, and both sat behind a
  // task with no deadline at all — until the morning it was due.
  const withHigh = lots.concat([mk("matters a lot", "", "medium", "high")]);
  const t2 = WP.tightIds(withHigh, SCHED, CFG, TODAY, 28);
  const loose = { today: TODAY, goalTitle: () => "" };
  const keen = { today: TODAY, goalTitle: () => "", tight: t2 };
  ok("without the room counted, what matters comes first",
     PR.forPlanning(withHigh, loose)[0].id === "matters a lot",
     PR.forPlanning(withHigh, loose)[0].id);
  ok("with it counted, the deadline about to be missed does",
     PR.forPlanning(withHigh, keen)[0].id.startsWith("big"),
     PR.forPlanning(withHigh, keen)[0].id);
  ok("and the row says why", PR.reason(withHigh[0], keen) === "little room left before it's due",
     PR.reason(withHigh[0], keen));
  ok("what matters is still ahead of everything that isn't pressing",
     PR.forPlanning(withHigh, keen).map((i) => i.id).indexOf("matters a lot") <
     PR.forPlanning(withHigh, keen).map((i) => i.id).indexOf("far"),
     JSON.stringify(PR.forPlanning(withHigh, keen).map((i) => i.id)));
  // NOT A PERMANENT PROMOTION. Take the pile away and it goes quiet again.
  ok("with room, nothing claims to be tight",
     PR.reason(three[0], { today: TODAY, goalTitle: () => "",
       tight: WP.tightIds(three, SCHED, CFG, TODAY, 28) }) === "",
     PR.reason(three[0], { today: TODAY, goalTitle: () => "",
       tight: WP.tightIds(three, SCHED, CFG, TODAY, 28) }));
}

sec("And it says when it is piling up");
{
  const CFG = { dayStart: "07:30", dayEnd: "17:30", minGapMinutes: 10, fillFraction: 0.66,
    minSessionMinutes: 25, planHorizonDays: 28, effortMinutes: { quick: 10, medium: 30, draining: 75 } };
  const SCHED = [{ id: "L1", label: "lesson", start: "09:00", end: "12:00", days: [0, 1, 2, 3, 4, 5, 6] },
                 { id: "L2", label: "lesson", start: "13:00", end: "15:00", days: [0, 1, 2, 3, 4, 5, 6] }];
  const soon = (n) => {
    const d = new Date(Date.now() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const mk = (id, date) => ({ id, title: id, type: "task", date, time: "", tags: [],
    deadlineType: "hard", importance: "normal", effort: "draining", goalId: "", openLoop: false,
    promisedTo: "", waitingOn: "", done: false, createdAt: new Date().toISOString(),
    completedAt: null, plannedMinutes: 0, spentMinutes: 0, optional: false, committed: false,
    notBefore: "", areas: [] });

  const heavy = Array.from({ length: 40 }, (_, i) => mk("job" + i, soon(3)));
  const r = await open("timeline.html", {
    items: heavy, goals: [], contacts: [], schedule: SCHED, scheduleConfig: CFG,
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const said = r.created.map((e) => String(e.innerHTML || "") + " " + String(e.textContent || "")).join(" ");
  ok("it says the next stretch is over-full", /Over the next \d+ days/.test(said),
     said.slice(0, 400));
  ok("with the hours counted both ways", /of work against/.test(said), said.slice(0, 400));
  ok("and how many days still have a real gap", /day.? with a real gap/.test(said),
     said.slice(0, 400));
  // UNEXCITED. Early, not frightening.
  ok("without telling you off", !/should|failed|behind|too slow|hurry/i.test(said),
     said.slice(0, 400));

  // A COMFORTABLE MONTH SAYS NOTHING. Reporting "plenty of room" every morning
  // is how a line that matters stops being read.
  const light = [mk("one", soon(20))];
  const r2 = await open("timeline.html", {
    items: light, goals: [], contacts: [], schedule: SCHED, scheduleConfig: CFG,
  });
  const quiet = r2.created.map((e) => String(e.innerHTML || "")).join(" ");
  ok("a week with room in it stays quiet", !/Over the next/.test(quiet), quiet.slice(0, 200));
}

// ---------------------------------------------------------------------------
sec("A thing you started and left says how long it has been open");
{
  // The list of things you're waiting on OTHER people for has always said how
  // long. The list of things YOU started and left said nothing — which is the
  // wrong way round, because that's the one you can do something about.
  const old = new Date(Date.now() - 45 * 86400000).toISOString();
  const mk = (id, at, remind) => ({ id, title: id, type: "task", date: "", time: "", tags: [],
    deadlineType: "soft", importance: "normal", effort: "medium", goalId: "", openLoop: true,
    promisedTo: "", waitingOn: "", done: false, createdAt: at, completedAt: null,
    plannedMinutes: 0, spentMinutes: 0, optional: false, committed: false, notBefore: "",
    areas: [], remindAt: remind || "", remindedAt: null });
  const r = await open("index.html", {
    items: [mk("left in July", old), mk("started just now", new Date().toISOString())],
    goals: [], contacts: [], schedule: [], waiting: [],
  });
  ok("the page opens", r.errs.length === 0, r.errs.join("; "));
  const said = r.created.map((e) => String(e.innerHTML || "")).join(" ");
  ok("an old one says how long it has been open", /open 6 weeks/.test(said),
     said.replace(/<[^>]*>/g, " ").slice(0, 300));
  ok("and a new one says so plainly too", /started today/.test(said), said.slice(0, 300));

  // A loop nobody set a reminder on used to sink below every loop that had one,
  // however long it had been sitting — and those are exactly the ones that go
  // quiet for a term.
  const rows = r.created.filter((e) => /\blp-row\b/.test(String(e.className)));
  ok("both are listed", rows.length === 2, String(rows.length));
  ok("the older one comes first when neither has a reminder",
     /left in July/.test(String(rows[0].innerHTML || "")), String(rows[0].innerHTML || "").slice(0, 120));

  // ONE SCALE, NOT FOUR. Two lists about how long something has been sitting
  // used to describe the same month differently — "open 30 days" on one and
  // "waiting 4 weeks" on the other, both true and neither matching.
  // Not the schedule spine — seven pages can't load that and still show dates.
  vm.runInContext(fs.readFileSync(path.join(PUB, "dates.js"), "utf8"), sb);
  const S2 = sb.OrganiserDates;
  [[0, "today"], [1, "1 day"], [9, "9 days"], [30, "4 weeks"], [45, "6 weeks"], [90, "3 months"]]
    .forEach(([d, want]) =>
      ok(`${d} days ago reads as “${want}”`,
         S2.agoWords(new Date(Date.now() - d * 86400000)) === want,
         S2.agoWords(new Date(Date.now() - d * 86400000))));
  ok("nonsense gets no words at all", S2.agoWords("not a date") === "" && S2.agoWords("") === "");
  ok("and a stamp in the future doesn't go negative",
     S2.agoWords(new Date(Date.now() + 5 * 86400000)) === "today",
     S2.agoWords(new Date(Date.now() + 5 * 86400000)));
}

sec("One way of writing a date down");
{
  vm.runInContext(fs.readFileSync(path.join(PUB, "dates.js"), "utf8"), sb);
  const DT = sb.OrganiserDates;
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // A NAME BEATS A NUMBER. These are the three you look for most.
  ok("today is Today", DT.dayWords(iso(0)) === "Today", DT.dayWords(iso(0)));
  ok("tomorrow is Tomorrow", DT.dayWords(iso(1)) === "Tomorrow", DT.dayWords(iso(1)));
  ok("yesterday is Yesterday", DT.dayWords(iso(-1)) === "Yesterday", DT.dayWords(iso(-1)));
  ok("anything else is written out, never left as digits",
     !/^\d{4}-/.test(DT.dayWords("2026-09-14")) && /Sep/.test(DT.dayWords("2026-09-14")),
     DT.dayWords("2026-09-14"));
  ok("with the day name, because knowing it's a Tuesday is half the information",
     /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(DT.dayWords("2026-09-14")), DT.dayWords("2026-09-14"));
  ok("and the year when it's something you'll read out of context",
     /2026/.test(DT.dayWords("2026-09-14", { year: true, relative: false })),
     DT.dayWords("2026-09-14", { year: true, relative: false }));
  ok("nonsense gets nothing rather than a wrong date",
     DT.dayWords("") === "" && DT.dayWords("not a date") === "");

  // A LIST OF DATES IS WHERE DIGITS BLUR WORST. Three full ISO dates in a row
  // are indistinguishable at a glance.
  ok("a run in one month says the month once",
     DT.daysWords(["2026-09-14", "2026-09-21", "2026-09-28"]) === "14, 21 and 28 Sep",
     DT.daysWords(["2026-09-14", "2026-09-21", "2026-09-28"]));
  ok("one date on its own is just that date",
     /Sep/.test(DT.daysWords(["2026-09-14"])), DT.daysWords(["2026-09-14"]));
  ok("across two months each one says which",
     (DT.daysWords(["2026-09-28", "2026-10-05"]).match(/Sep|Oct/g) || []).length === 2,
     DT.daysWords(["2026-09-28", "2026-10-05"]));
  ok("out of order, put back in order",
     DT.daysWords(["2026-09-28", "2026-09-14"]) === "14 and 28 Sep",
     DT.daysWords(["2026-09-28", "2026-09-14"]));
  ok("nothing at all says nothing", DT.daysWords([]) === "" && DT.daysWords(null) === "");

  // AND NOWHERE PRINTS THE RAW THING TO A READER. An <input type="date"> needs
  // ISO and is left alone; text a person reads is not.
  const raw = [];
  ["attendpage.js", "person.js", "capture.js", "goals.js", "month.js", "timeline.js"].forEach((f) => {
    const src = fs.readFileSync(path.join(PUB, f), "utf8");
    src.split("\n").forEach((line, n) => {
      if (/type="date"/.test(line)) return;
      if (/\$\{esc\(?[a-z.]*\.dates?\)?[^A-Za-z]|\$\{[a-z]+\.date\}|dates\.join\(/.test(line))
        raw.push(`${f}:${n + 1}`);
    });
  });
  ok("no page prints a raw date at a person any more", raw.length === 0, JSON.stringify(raw));
}

sec("One reading of a clock time, not two");
{
  // app.js kept a private copy that wanted two digits for the hour and answered
  // 0 — midnight — for anything it couldn't read. So a task the sorter timed as
  // "9:05" was pinned by the planner at 09:05 and showed no time at all on its
  // own row: two answers to the same question, and the visible one was wrong.
  const S3 = sb.OrganiserSchedule;
  ok("one digit or two, same answer", S3.toMin("9:05") === 545 && S3.toMin("09:05") === 545);
  ok("and nothing readable is null, never midnight",
     S3.toMin("nonsense") === null && S3.toMin("") === null && S3.toMin("9:5") === null,
     JSON.stringify([S3.toMin("nonsense"), S3.toMin("")]));
  const app = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
  ok("every page can reach the date words, not just the ones with a schedule",
     ["attend.html", "person.html", "class.html", "records.html", "people.html",
      "portfolio.html", "before-planning.html", "index.html", "timeline.html"]
       .every((h) => fs.readFileSync(path.join(PUB, h), "utf8").includes('src="dates.js"')),
     "a page shows dates but can't reach the one place that writes them");
  ok("and nothing keeps a second copy of how long ago",
     !/function agoWords/.test(fs.readFileSync(path.join(PUB, "schedule.js"), "utf8")),
     "schedule.js still has its own agoWords");
  ok("the page uses that reading rather than keeping its own",
     /OrganiserSchedule\.toMin\(t\)/.test(app), "app.js still has a private toMin");
  ok("and shows a one-digit hour rather than dropping it",
     /\^\(\\d\{1,2\}\):\(\\d\{2\}\)\$\/\.exec\(\(t \|\| ""\)\.toString/.test(app),
     "fmtTime still insists on two digits");
  // AND TIDIED AT THE FRONT DOOR, so an unpadded time can't get stored at all.
  const cap = fs.readFileSync(path.join(PUB, "capture.js"), "utf8");
  ok("the capture bar tidies a time on the way in", /time: tidyTime\(item\.time\)/.test(cap),
     "capture.js still stores whatever it was handed");
}

// ---------------------------------------------------------------------------
sec("The two pages nothing had ever opened");
{
  // Not because they were thought about and skipped — nobody had counted.
  const { open } = await import("./_dom.mjs");
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const DATA = {
    items: [{ id: "t1", title: "mark the books", type: "task", date: iso(2), time: "",
      tags: [], deadlineType: "hard", importance: "normal", effort: "medium", goalId: "g1",
      openLoop: false, promisedTo: "", waitingOn: "", done: false, createdAt: iso(-1) + "T09:00:00Z",
      completedAt: null, plannedMinutes: 0, spentMinutes: 0, optional: false, committed: false,
      notBefore: "", areas: [] }],
    goals: [{ id: "g1", title: "Get the reports done", areas: ["work"], date: iso(20),
      createdAt: iso(-30) + "T09:00:00Z", completedAt: null,
      milestones: [{ id: "m1", title: "First draft", done: false, completedAt: null,
        steps: [{ id: "s1", title: "read one set", done: false, completedAt: null }] }] }],
    schedule: [], contacts: [], waiting: [],
  };

  for (const page of ["goals.html", "month.html"]) {
    const r = await open(page, DATA);
    ok(`${page} opens without error`, r.errs.length === 0, r.errs.join("; "));
    const drawn = r.created.map((e) => String(e.textContent || "") + String(e.innerHTML || "")).join(" ");
    ok(`${page} draws something`, drawn.trim().length > 20, drawn.slice(0, 120));
    // A PAGE THAT RENDERS AN EMPTY SHELL IS NOT A PAGE THAT WORKS. It has to
    // show the thing it was given.
    ok(`${page} shows what it was given`,
       /reports|mark the books/i.test(drawn), drawn.slice(0, 200));
    ok(`${page} leaves no raw date on screen`, !/\b\d{4}-\d{2}-\d{2}\b/.test(
         drawn.replace(/type="date"[^>]*/g, "").replace(/value="[^"]*"/g, "")),
       (drawn.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).slice(0, 3).join(" "));
  }
}

if (gaps.length) {
  console.log("\nWhat is not there\n" + "-".repeat(17));
  gaps.forEach((g) => console.log("  · " + g));
}
console.log(`\n${pass} passed, ${fail} failed, ${gaps.length} gap(s)`);
process.exit(fail ? 1 : 0);
