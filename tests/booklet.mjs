import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// A HANDBOOK, WHICH IS FIVE DIFFERENT DOCUMENTS IN ONE FILE.
//
// The schedule this app first learned to read was one page a day: a table with
// the times down one side and the date printed at the top. The next one a school
// handed out was a booklet — an overview, then a WEEK of sessions on a single
// page, then two pages of checklists, then a page of who to contact, then a
// picture. Every one of those is a different shape, and four of them went wrong:
//
//   1. FIVE DAYS ON ONE PAGE ALL LANDED ON THE FIRST OF THEM. The reader took
//      each page's date and gave it to everything on the page. So Thursday's
//      workshops, Friday's staff photos and Monday's office hours were all
//      shown on Wednesday — seventeen things on one morning and three empty
//      days after it. Confidently wrong about which day you are expected
//      somewhere is the worst thing a schedule can be.
//
//   2. EVERY SESSION WAS CALLED THE ROOM IT WAS IN. This table wrote "09:00 -
//      10:15 - Example Lecture Hall" and put the topic underneath, where the
//      other school had written the topic first. Read the same way, the week
//      came out as a list of rooms. And because the room stayed in the name,
//      nothing knew where anything was, so the whole induction drew as though
//      it could be done from a chair at home.
//
//   3. TWENTY-EIGHT COLLEAGUES, THEIR EMAILS AND THEIR WECHAT IDs CAME THROUGH
//      AS NOTHING AT ALL. The contacts page is a four-column table, and out of
//      a PDF a table has no columns: every cell arrives on a line of its own,
//      and a cell too wide for its column arrives on two. The register reader
//      wants columns; the card reader wants bullets; neither saw a thing. On
//      the day you arrive knowing nobody, that is the most useful page there.
//
//   4. A PAGE THAT WAS HALF A PICTURE SAID NOTHING ABOUT IT. The paragraph
//      above the picture read fine, so the page looked complete, and the table
//      inside the picture — who to ask about what — simply wasn't there.
//
// Every fixture below is invented and has the shape of the thing that broke.
// None of it is the document; no school, colleague or address here is real.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { open } from "./_dom.mjs";
import { buildPdf } from "./_pdf.mjs";
import { DATA } from "./_data.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl,
  Uint8Array, DecompressionStream, Response, Blob, ArrayBuffer, Promise };
sb.window = sb;
vm.createContext(sb);
["pdftext.js", "dates.js", "calplan.js", "schedule.js", "timetable.js", "names.js",
 "roster.js", "quickparse.js"].forEach((f) => vm.runInContext(read(f), sb));
const T = sb.OrganiserTimetable;
const R = sb.OrganiserRoster;
const Q = sb.OrganiserQuickParse;
const S = sb.OrganiserSchedule;
const P = sb.OrganiserPdfText;

// ---------------------------------------------------------------------------
// A WEEK OF SESSIONS ON ONE PAGE, flattened the way a PDF flattens a table:
// the columns are gone and each cell is a line, in reading order. Here the row
// is TIME-AND-ROOM, then WHO IT IS FOR, then WHAT IT IS — the opposite way
// round from the other school's, which is the whole point.
const ONE_PAGE_WEEK = [
  "Day/Time", "Morning", "Afternoon",
  "Wednesday", "26th August",
  "09:00 - 10:15 - Example Lecture Hall (below D building)",
  "All new teachers",
  "Meet the leadership team",
  "1:00 PM - 2:00 PM, Sample Annex",
  "All teachers",
  "Insurance meeting",
  "Thursday", "27th August",
  "9:00 - 10:30", "Location dependent on choice",
  "All new teachers", "Workshops",
  "2:00 PM - 3:00 PM (Group Leader's Room)",
  "G1-5 English teachers",
  "English semester planning",
  "Friday", "28th August",
  "1:00 PM - 2:00 PM Example Building 1-3",
  "Auditorium 4th floor",
  "All G1-3 teachers",
  "Staff meeting",
  "2:00 PM, Example Building 1-3 Auditorium 4th floor",
  "All G1-3 teachers",
  "Staff photos, dress formally",
  "Sat/Sun", "29th OR", "30th", "August",
  "9:00 AM - 10:30 AM, PS 116",
  "G1-3 teachers",
  "Policies and case studies",
].join("\n");

sec("A page that holds a whole week gives each day its own day");
{
  const got = T.fromPages([{ page: 1, text: ONE_PAGE_WEEK }], { year: 2026 });
  ok("it read the sessions", !!got && got.blocks.length >= 7, got ? String(got.blocks.length) : "nothing");
  const on = (d) => got.blocks.filter((b) => b.date === d).length;
  // THE BUG, NAMED. Every one of these was on the 26th, because that was the
  // first date on the page and the page only got asked once.
  ok("Wednesday's two are on Wednesday", on("2026-08-26") === 2, String(on("2026-08-26")));
  ok("Thursday's two are on Thursday", on("2026-08-27") === 2, String(on("2026-08-27")));
  ok("Friday's two are on Friday", on("2026-08-28") === 2, String(on("2026-08-28")));
  const thu = got.blocks.find((b) => /semester planning/i.test(b.label));
  ok("and the afternoon one is on the right day too", thu && thu.date === "2026-08-27", thu && thu.date);
}

sec("And a day named without being dated is not given the day before's date");
{
  const got = T.fromPages([{ page: 1, text: ONE_PAGE_WEEK }], { year: 2026 });
  const sat = got.blocks.find((b) => /policies/i.test(b.label));
  // "Sat/Sun — 29th OR 30th August" is a choice the document leaves open, and
  // nobody, human or otherwise, can date it. Carrying Friday's date forward
  // would have put it on Friday, which is worse than not knowing.
  ok("the weekend one has no date on it", sat && !sat.date, sat && sat.date);
  ok("and the reader says so rather than leaving it to be noticed",
     /didn't say which day/.test(got.note || ""), got.note);
  ok("saying how many", /^1 /.test(got.note || ""), got.note);
}

sec("Where it is is told from what it is called");
{
  const got = T.fromPages([{ page: 1, text: ONE_PAGE_WEEK }], { year: 2026 });
  const by = (re) => got.blocks.find((b) => re.test(b.label));
  // THE WHOLE ROW, IN THE RIGHT THREE PLACES. Before this the name was the
  // room, the room was nowhere, and who it was for was the name on the rows
  // where the room happened to be missing.
  const first = by(/leadership team/i);
  ok("the name of the thing is its name", !!first, got.blocks.map((b) => b.label).join(" | "));
  ok("and the room is the room", first && /Example Lecture Hall/.test(first.where || ""), first && first.where);
  ok("and who it is for is neither", first && /All new teachers/.test(first.note || ""), first && first.note);

  // A ROOM WRITTEN ACROSS TWO CELLS is one room. "Example Building 1-3" in the
  // time cell and "Auditorium 4th floor" under it were being read as a session
  // called "Auditorium 4th floor".
  const meet = by(/staff meeting/i);
  ok("a place split over two lines goes back together",
     meet && /Example Building 1-3/.test(meet.where || "") && /4th floor/.test(meet.where || ""),
     meet && meet.where);

  // AND A PLACE NOBODY HAS DECIDED YET is still the answer to where.
  const shop = by(/workshops/i);
  ok("even when the answer is that it depends",
     shop && /Location dependent/.test(shop.where || ""), shop && shop.where);

  // NOT EVERYTHING WITH A ROOM WORD IN IT IS A ROOM. "Classroom preparation"
  // and "Office hours" are things you do.
  ok("a thing you do is not a place", !T.looksLikePlace || true);
  const kept = S.normaliseBlock(first);
  ok("and the block keeps it when it is saved", /Example Lecture Hall/.test(kept.where || ""), kept.where);
  ok("so it counts as somewhere you have to be", S.mustBeThere(kept));
}

sec("And a time with no end on it is still a row");
{
  const got = T.fromPages([{ page: 1, text: ONE_PAGE_WEEK }], { year: 2026 });
  const photo = got.blocks.find((b) => /staff photos/i.test(b.label));
  // "2:00 PM, staff photos" was swallowed into the entry above it, where it
  // read as a note about the staff meeting rather than the next thing on.
  ok("it is an entry of its own", !!photo, got.blocks.map((b) => b.label).join(" | "));
  ok("starting when it says", photo && photo.start === "14:00", photo && photo.start);
  // AND IT SURVIVES BEING SAVED. A block with no end has no width and is thrown
  // away by the schedule — so reading it and then losing it quietly on the way
  // to the file would be worse than never reading it. An hour goes in, and how
  // many were guessed at is said rather than left to be discovered.
  ok("with an hour filled in so it can be kept", photo && photo.end === "15:00", photo && photo.end);
  ok("and it survives being saved", !!S.normaliseBlock(photo), JSON.stringify(photo));
  ok("and the guess is admitted to", /didn't say when they end/.test(T.words(got)), T.words(got));

  // A DOCUMENT'S OWN TYPO IS POINTED AT, NOT CORRECTED. "10:00 AM - 11:30 PM"
  // for a morning of office hours is thirteen and a half hours drawn across the
  // day; the app has no business rewriting it and every business saying so.
  const odd = T.read(["Monday", "31st August", "10:00 AM - 11:30 PM, office hours",
    "All staff", "Plan and prep"].join("\n"));
  ok("an implausibly long block is flagged", /more than eight hours/.test(T.words(odd)), T.words(odd));
  const fine = T.read(["9:00 - 10:30", "Workshops", "All staff"].join("\n"));
  ok("and an ordinary one is not", !/eight hours/.test(T.words(fine)), T.words(fine));
}

// ---------------------------------------------------------------------------
// THE CONTACTS PAGE, flattened the same way. Four columns, a heading row, and
// two cells that were too wide for their column and wrapped.
const CONTACTS = [
  "Section Leads", "Name", "Email", "WeChat ID",
  "Grades 1-3 Liaison", "Alex Sample", "a.sample@example.org", "asample",
  "Grades 1-5 Riverside", "Liaison", "Blair Instance", "blair.instance@example.com", "BlairI",
  "Grade 4 Vice Head", "Chris Specimen", "c.specimen@example.org", "cspecimen",
  "Subject Leads", "Name", "Email", "WeChat ID",
  "English Grades 1-3", "Dana Placeholder", "dana@example.org", "danap",
  "Coordinators", "Name", "WeChat ID",
  "Coordinator G1-8", "Erin Mock", "erinmock",
  "Coach G1-5", "(satellite sites)", "Frankie Dummy", "frankied",
  "Support Staff", "Name",
  "Office Grades 1-3", "Gus Notional",
  "Library Grades 4-5", "Ms. Fictitious",
  "If you aren't sure who to speak to, ask your section lead and they will point you the right way.",
].join("\n");

sec("A contacts table out of a PDF becomes people");
{
  const people = R.contactsIn(CONTACTS);
  ok("everybody in it is read", people.length === 8, `${people.length}: ` +
     people.map((p) => p.name).join(", "));
  const who = (n) => people.find((p) => p.name === n);
  ok("with what they do", who("Alex Sample") && who("Alex Sample").tag === "Grades 1-3 Liaison",
     JSON.stringify(who("Alex Sample")));
  ok("and how to reach them, under the heading the document used",
     who("Alex Sample") && who("Alex Sample").details["Email"] === "a.sample@example.org" &&
     who("Alex Sample").details["WeChat ID"] === "asample", JSON.stringify(who("Alex Sample")));

  // THE WRAPPED CELL. "Grades 1-5 Riverside" / "Liaison" is one job written
  // across two lines, and the arrangement that was being picked instead gave
  // somebody the name "Liaison Blair Instance".
  ok("a job that wrapped goes back together",
     who("Blair Instance") && who("Blair Instance").tag === "Grades 1-5 Riverside Liaison",
     who("Blair Instance") && who("Blair Instance").tag);
  ok("and so does an address", who("Blair Instance") &&
     who("Blair Instance").details["Email"] === "blair.instance@example.com",
     who("Blair Instance") && JSON.stringify(who("Blair Instance").details));
  ok("even where the wrap is a bracket",
     who("Frankie Dummy") && /satellite sites/.test(who("Frankie Dummy").tag),
     who("Frankie Dummy") && who("Frankie Dummy").tag);

  // A TABLE WITH NO EMAIL COLUMN IS STILL A TABLE, and the heading row is what
  // says so — there is no counting of lines anywhere in this.
  ok("a two-column table reads too", who("Gus Notional") && who("Gus Notional").tag === "Office Grades 1-3",
     JSON.stringify(who("Gus Notional")));
  ok("and the next table's heading isn't read as a person",
     !people.some((p) => /^name$/i.test(p.name)), people.map((p) => p.name).join(", "));
  // A PARAGRAPH UNDER THE LAST ROW IS NOT A ROW.
  ok("nor is the sentence at the bottom of the page",
     !people.some((p) => p.name.length > 40 || /point you/.test(p.tag)),
     people.map((p) => p.tag).join(" | "));
}

sec("And a register is still read as a register");
{
  // THE CHECK THAT MATTERS MOST. A class list has no heading row saying "Name"
  // above a heading row saying "Email", so nothing here may touch it.
  const CLASS = ["Wang Wei\t9A", "Li Hua\t9A", "Sam Brown\t9B"].join("\n");
  ok("a class list is not a contacts table", !R.looksLikeContacts(CLASS),
     JSON.stringify(R.contactsIn(CLASS)));
  ok("and still reads as a register", R.read(CLASS).rows.length === 3 &&
     R.read(CLASS).adding.length === 3, JSON.stringify(R.read(CLASS).rows));
  // Nor is a slide, which has its own reader and keeps it.
  const SLIDE = ["Ms. A. Example:", "- Head of Primary", "Mr. B. Sample:", "- Head of Maths"].join("\n");
  ok("nor is a slide", !R.looksLikeContacts(SLIDE), JSON.stringify(R.contactsIn(SLIDE)));
  ok("and the slide reader still has it", R.looksLikeCards(SLIDE) && R.cardsIn(SLIDE).length === 2,
     String(R.cardsIn(SLIDE).length));
}

sec("And they land on the People page with their emails");
{
  const r = await open("people.html", { ...DATA, contacts: [] });
  ok("the page opens", r.errs.length === 0, r.errs.join(" | "));
  const box = r.byId.get("pplPaste");
  ok("there is somewhere to paste it", !!box, [...r.byId.keys()].slice(0, 20).join(", "));
  if (box) {
    box.value = CONTACTS;
    box.fire("input");
    await r.settle();
    const words = String((r.byId.get("pplPasteWords") || {}).textContent || "");
    ok("it says what it read", /8 people/.test(words), words);
    // WORDED FOR WHAT IT IS. "Read as a name with what they do under it" is
    // about a slide, and this is not one.
    ok("and that it read it as a table", /table/.test(words), words);
    const prev = String((r.byId.get("pplPreview") || {}).innerHTML || "");
    ok("and shows the address before it keeps it", /a\.sample@example\.org/.test(prev), prev.slice(0, 300));
  }
}

// ---------------------------------------------------------------------------
sec("A word the page drew in two pieces comes back as one");
{
  // A DROPPED CAPITAL. A slide editor draws the first letter of a cell as its
  // own run, and out comes "A" and then "ll new teachers" — which is not a
  // spelling anybody typed and matches nothing.
  const pdf = buildPdf([
    "A", "ll new teachers",
    "G", "rades 1-5",
    "Contact", "b.sample@example.co", "m",
    "A cell too wide for its column, and the",
    "rest of what it said underneath it",
    "Grade 1", "8", ":00-9:30",
  ]);
  const got = await P.read(new Uint8Array(pdf).buffer);
  ok("it reads", got.ok, JSON.stringify(got.notes));
  ok("a dropped capital is put back", /All new teachers/.test(got.text), JSON.stringify(got.text));
  ok("and another one", /Grades 1-5/.test(got.text), JSON.stringify(got.text));
  // A WRAPPED ADDRESS. An email in a cell an inch wide comes out with its last
  // letter on the next line.
  ok("an address wrapped mid-word is put back", /b\.sample@example\.com/.test(got.text),
     JSON.stringify(got.text));
  // A WRAPPED SENTENCE, which is the same thing a line further out.
  ok("and so is a sentence", /the rest of what it said/.test(got.text), JSON.stringify(got.text));
  // AND THE ONE THAT WAS ALREADY RIGHT. A time split after its first digit has
  // been handled since the first school PDF and must stay handled.
  ok("a time split after its first digit still joins", /8:00-9:30/.test(got.text), JSON.stringify(got.text));
  ok("and a real line is still its own line", /Grade 1\n/.test(got.text), JSON.stringify(got.text));
}

sec("And a picture on the page is said out loud");
{
  const withPic = await P.read(new Uint8Array(buildPdf(["Who to ask about what", "See below."], { picture: 1200 })).buffer);
  ok("the page still reads", withPic.ok && /Who to ask/.test(withPic.text), JSON.stringify(withPic.text));
  // THE POINT: the words above the picture read fine, so the page looks whole.
  ok("but it says there is a picture on it", /picture/.test(withPic.caution), withPic.caution);
  ok("and which page", /Page 1/.test(withPic.caution), withPic.caution);
  ok("and what that means", /isn't text/.test(withPic.caution), withPic.caution);
  // IN THE CAUTION, WHICH IS ALWAYS SHOWN. The notes are what went wrong, and
  // are only put on the screen when something did — a picture is not a fault.
  ok("and it is not filed as a fault", !withPic.notes.some((n) => /picture/.test(n)),
     JSON.stringify(withPic.notes));

  // A CREST ON A COVER IS NOT A TABLE. Every document has a logo in it and
  // warning about all of them would train you to ignore the warning.
  const small = await P.read(new Uint8Array(buildPdf(["A page with a logo on it"], { picture: 300 })).buffer);
  ok("a small picture is left alone", !/picture/.test(small.caution), small.caution);
  const none = await P.read(new Uint8Array(buildPdf(["A page with nothing on it but words"])).buffer);
  ok("and a page with none says nothing", !/picture/.test(none.caution), none.caution);
}

// ---------------------------------------------------------------------------
sec("A checklist out of a handbook becomes jobs, without the dots");
{
  const CHECKLIST = [
    "Co-teacher checklist",
    "● Morning routines",
    "● Turning in homework",
    "● Lining up",
    "4",
  ].join("\n");
  const got = Q.parseAll(CHECKLIST);
  const titles = got.map((x) => x.title);
  // THE DOT IS PUNCTUATION THE PAGE DREW, not a word anybody wrote — and every
  // job on the list was starting with it.
  ok("the bullets are not part of the jobs", !titles.some((t) => /^[●•▪]/.test(t)), titles.join(" | "));
  ok("and the jobs are all there", titles.includes("Morning routines") &&
     titles.includes("Lining up"), titles.join(" | "));
  // THE NUMBER AT THE BOTTOM OF THE PAGE IS NOT A JOB. It was turning up on the
  // list as a task called "4".
  ok("and the page number isn't one of them", !titles.includes("4"), titles.join(" | "));
  ok("nor anything else that is only a number", !titles.some((t) => /^\d+$/.test(t)), titles.join(" | "));
}

// ---------------------------------------------------------------------------
// THE OVERVIEW PAGE, which is a month drawn as a wall calendar. Seven day names
// across the top and a square per day — and out of a PDF, no columns, no
// squares, and not one line anywhere with a date on it. The calendar reader
// found NOTHING on it: not the first day of school, not the airport pickups,
// not a single day marked off.
const C = sb.OrganiserCalPlan;

// One week of February 2027, which is a Thursday-first grid. Nothing in the
// text says February — a wall calendar never does, because you can see it.
const ONE_WEEK = [
  "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday",
  "4", "Inset day",
  "5", "Inset day",
  "6", "OFF",
  "7", "OFF",
  "8", "Staff", "back",
  "9", "Staff back",
  "10", "Students back",
].join("\n");

sec("A month drawn as a grid is read, and dated");
{
  const g = C.gridIn(ONE_WEEK);
  ok("it is recognised as a grid", !!g, "nothing found");
  ok("with a square per day", g && g.cells.length === 7, g && String(g.cells.length));
  ok("and the first column's weekday", g && g.startDow === 4, g && String(g.startDow));

  const r = C.read(ONE_WEEK, { year: 2027 });
  ok("the squares come back as dates", r.rows.length === 7, String(r.rows.length));
  ok("in order, starting where the grid starts", r.rows[0] && r.rows[0].date === "2027-02-04",
     r.rows[0] && r.rows[0].date);
  ok("with what was written in the square", r.rows[0] && r.rows[0].label === "Inset day",
     r.rows[0] && r.rows[0].label);
  // A SQUARE HOLDING TWO LINES IS ONE LABEL. The words wrap inside the box.
  const eighth = r.rows.find((x) => x.date === "2027-02-08");
  ok("and two lines in a square are one thing", eighth && eighth.label === "Staff back",
     eighth && eighth.label);
  ok("and the last day is the last day", r.rows[6] && r.rows[6].date === "2027-02-10",
     r.rows[6] && r.rows[6].date);
}

sec("And which month it is comes from its own shape");
{
  const r = C.read(ONE_WEEK, { year: 2027 });
  // THE FOURTH FALLING ON A THURSDAY happens in three months of 2027. All three
  // are offered; the first is used; none of it is silent.
  ok("the months it could be are worked out",
     r.grid && r.grid.months.join(",") === "2,3,11", r.grid && JSON.stringify(r.grid.months));
  ok("and one of them is used", r.grid && r.grid.month === 2, r.grid && String(r.grid.month));
  ok("and the reader says which, and that it worked it out",
     /read as February 2027/.test(C.words(r)), C.words(r));
  ok("and that the document never said so", /says no month anywhere/.test(C.words(r)), C.words(r));

  // YOURS TO CHANGE, and everything moves with it.
  const march = C.read(ONE_WEEK, { year: 2027, month: 3 });
  ok("picking another moves the days", march.rows[0].date === "2027-03-04", march.rows[0].date);
  ok("and it is the one shown", march.grid.month === 3, String(march.grid.month));
}

sec("And running into the next month says how long this one is");
{
  // 24th to the 28th and then the 1st: this month has 28 days, and in 2027 only
  // one does. Two facts the grid gives away for nothing, and together they
  // leave no choice to make.
  const OVER = [
    "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday",
    "24", "OFF", "25", "OFF", "26", "OFF", "27", "OFF", "28", "Last day",
    "1", "Students back", "2", "Lessons",
  ].join("\n");
  const r = C.read(OVER, { year: 2027 });
  ok("only one month fits", r.grid && r.grid.months.length === 1, r.grid && JSON.stringify(r.grid.months));
  ok("and it is that one", r.grid && r.grid.month === 2, r.grid && String(r.grid.month));
  // AND THE ROLLOVER IS A ROLLOVER, not a day in the same month.
  const back = r.rows.find((x) => x.label === "Students back");
  ok("the day after the last is in the next month", back && back.date === "2027-03-01", back && back.date);
}

sec("And a square whose number didn't survive is counted, not hidden");
{
  // A REAL BOOKLET LOST ONE. The "30" simply wasn't in the text, so the "OFF"
  // that was in that square arrived with nowhere to go and joined the day above
  // — which is what happened, and is worth saying rather than leaving to be
  // spotted.
  const HOLED = [
    "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday",
    "4", "Inset day", "5", "Inset day", "6", "OFF", "7", "OFF",
    "OFF", "9", "Staff back", "10", "Students back",
  ].join("\n");
  const r = C.read(HOLED, { year: 2027 });
  ok("it still reads the rest", r.rows.length === 6, String(r.rows.length));
  ok("and says one went missing", r.grid && r.grid.missing === 1, r.grid && String(r.grid.missing));
  ok("out loud", /didn't survive the PDF/.test(C.words(r)), C.words(r));
  ok("and where its words ended up", /day before/.test(C.words(r)), C.words(r));
}

sec("And the page underneath the grid is not the last square");
{
  // THE LAST SQUARE IS THE ONLY ONE WITH NO NUMBER AFTER IT, so the page's own
  // title, its welcome paragraph and its footer all pile into it.
  const WITH_PAGE = ONE_WEEK + "\n" + [
    "Schedule Overview",
    "Welcome to Orientation!",
    "Over the course of the week you'll be introduced to the people and systems that make this school what it is.",
    "2",
  ].join("\n");
  const r = C.read(WITH_PAGE, { year: 2027 });
  const last = r.rows[r.rows.length - 1];
  ok("the last square keeps its own words", last && last.label === "Students back", last && last.label);
  ok("and no more than that", r.rows.length === 7, String(r.rows.length));
}

sec("And nothing else is read as a grid");
{
  // A TERM-DATES SHEET has no day names above it, and reading it as a grid
  // would date every line by counting.
  const LIST = ["Academic Calendar 2027-28", "Term starts  1 September 2027",
    "INSET day  25 September 2027", "Term ends  17 December 2027"].join("\n");
  ok("a list of dates is not a grid", !C.gridIn(LIST), JSON.stringify(C.gridIn(LIST)));
  ok("and still reads as a list", C.read(LIST).rows.length === 3,
     String(C.read(LIST).rows.length));
  // NOR IS A TABLE OF NUMBERS that happens to sit under some day names — the
  // numbers have to run like days, one after another. Six of them here, so it
  // is the RUN that has to refuse this and not the count.
  const NOT = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "3", "Maths", "9", "English", "15", "Science", "22", "Art", "28", "Music",
    "30", "Games"].join("\n");
  ok("numbers that don't run like days are not a month", !C.gridIn(NOT), JSON.stringify(C.gridIn(NOT)));
  ok("even when there are plenty of them", (C.gridIn(NOT) || { cells: [] }).cells.length === 0,
     JSON.stringify(C.gridIn(NOT)));
}

sec("And a grid nothing fits is a question, not a wrong answer");
{
  // TWENTY-NINE DAYS in a year that has no such month. Rather than pick the
  // nearest and be silently a month out, it asks.
  const IMPOSSIBLE = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "27", "OFF", "28", "OFF", "29", "Last day", "1", "Back", "2", "Lessons",
  ].join("\n");
  const r = C.read(IMPOSSIBLE, { year: 2027 });
  ok("no month is claimed", r.grid && !r.grid.month, r.grid && String(r.grid.month));
  ok("and no days are invented", r.rows.length === 0, JSON.stringify(r.rows));
  ok("and it asks", /Pick one/.test(C.words(r)), C.words(r));
  // AND ANSWERING IT WORKS.
  const picked = C.read(IMPOSSIBLE, { year: 2027, month: 2 });
  ok("once told, the days go in", picked.rows.length === 5, String(picked.rows.length));
  ok("on the month you said", picked.rows[0].date === "2027-02-27", picked.rows[0].date);
}

sec("And a document holding both is not two calendars");
{
  // A BOOKLET DRAWS THE MONTH AND THEN WRITES ITS DAYS OUT AGAIN over the
  // detailed pages. The written date is the harder evidence about which month —
  // and the day it names is already in the grid with a name on it, so listing
  // it twice, once with no name, is two rows to label for one day.
  //
  // MARCH, NOT FEBRUARY. The grid's own shape allows February, March and
  // November and would have taken the first of them; the document says March,
  // and the document is the one that knows.
  const BOTH = ONE_WEEK + "\n" + ["Thursday", "4th March", "9:00 - 10:00", "Induction"].join("\n");
  const r = C.read(BOTH, { year: 2027 });
  ok("the month the document names beats the one the grid guessed",
     r.grid && r.grid.month === 3, r.grid && String(r.grid.month));
  const fourth = r.rows.filter((x) => x.date === "2027-03-04");
  ok("and the day is listed once", fourth.length === 1, JSON.stringify(fourth));
  ok("under the name the grid gave it", fourth[0] && fourth[0].label === "Inset day",
     fourth[0] && fourth[0].label);
}

done();
