import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j, join } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// EVERY WAY SOMEBODY WRITES A DATE.
//
// Dates were being fixed one phrase at a time, and each fix looked complete
// because the phrase that prompted it now worked. "The 10th of September" was
// read as no date at all — one of the two ordinary ways to write one in
// English — and nothing anywhere would have said so. Then "a week on Friday",
// asked on a Friday, came back as today.
//
// A list of phrases fixes a phrase. A CORPUS fixes the class: every reasonable
// way a person writes when a thing is, checked in one place, so the gap is
// visible before somebody hits it rather than after.
//
// The rule for what belongs here: if a teacher could plausibly type it into the
// box, it goes in — including the ways it is written outside the US, the ways
// it is written in Chinese, and the ones that SHOULD come back as no date
// because they genuinely don't name a day.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker, codeOf } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = join(REPO_ROOT, "public");
const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp,
  isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["names.js", "quickparse.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(PUB, f), "utf8"), sb));
const Q = sb.OrganiserQuickParse;

const TODAY = new Date();
const iso = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const plus = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return iso(d); };
// THE NEXT DATE THAT FALLS ON THIS WEEKDAY, COUNTING TODAY.
//
// "On Sunday", typed on a Sunday, means today. It is genuinely ambiguous — you
// might have said "today" if you meant today — but the two ways of being wrong
// are not equally bad. Read as today and you meant next week: the thing sits on
// today's list, you see it, you move it. Read as next week and you meant today:
// it is invisible for seven days and you miss it. So it counts today.
const onDow = (dow, extra = 0) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7) + extra);
  return iso(d);
};
// And the same weekday when you said "NEXT" — that one never means today,
// because saying "next Sunday" on a Sunday is the one phrasing that settles it.
const nextDow = (dow, extra = 0) => {
  const d = new Date(TODAY);
  const step = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (step === 0 ? 7 : step) + extra);
  return iso(d);
};
const endOfMonth = () => iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0));
const thisYear = TODAY.getFullYear();
const p2 = (n) => String(n).padStart(2, "0");

// The date must survive being read out of an ordinary sentence, not just on its
// own — that is how it arrives.
const read = (phrase) => Q.parse(`sort out the display ${phrase}`, {}).date || "";

// ---------------------------------------------------------------------------
sec("Days named by their nearness");
{
  const cases = [
    ["today", plus(0)], ["tonight", plus(0)], ["this evening", plus(0)],
    ["tomorrow", plus(1)], ["tmrw", plus(1)],
    ["the day after tomorrow", plus(2)],
    ["yesterday", plus(-1)],
    ["in 3 days", plus(3)], ["in 10 days", plus(10)],
    ["in a week", plus(7)], ["in 2 weeks", plus(14)], ["in a fortnight", plus(14)],
    ["next week", plus(7)],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));
}

sec("Days named by their name");
{
  // Today never counts as "on Friday" when today IS Friday: you would have said
  // today. Saying the wrong one here books a week's work into an hour.
  const cases = [
    ["on monday", onDow(1)], ["on friday", onDow(5)], ["fri", onDow(5)],
    ["next tuesday", nextDow(2)], ["on sun", onDow(0)],
    ["end of the week", onDow(5)],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));
}

sec("A week further out than that");
{
  // THE ONE THAT BROKE. Every phrase here has a plain weekday sitting inside
  // it, so whichever pattern is tried first wins — and the plain one was.
  const cases = [
    ["a week on friday", onDow(5, 7)],
    // "Hand the reports IN, a week on Friday" — the "in" belongs to "hand in",
    // and reading "in a week" and stopping there put it seven days early.
    ["in a week on friday", onDow(5, 7)],
    ["a week from monday", onDow(1, 7)],
    ["friday week", onDow(5, 7)],
    ["tuesday week", onDow(2, 7)],
    ["a fortnight on monday", onDow(1, 14)],
    ["a week today", plus(7)],
    ["a week tomorrow", plus(8)],
    ["end of the month", endOfMonth()],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));
}

sec("Days named by their number");
{
  const d = `${thisYear}-09-10`;
  const cases = [
    ["10 sep", d], ["10 september", d], ["10th september", d], ["10th sept", d],
    // THE "of" IS NOT DECORATION. This is how half the English-speaking world
    // writes a date, and it came back as nothing at all.
    ["on the 10th of september", d], ["the 10th of sept", d], ["10 of september", d],
    ["sep 10", d], ["september 10", d], ["september 10th", d], ["sept 10th", d],
    ["10/09", d], ["10.09", d], ["10-09-26", "2026-09-10"],
    [`${thisYear}-09-10`, d],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));
}

sec("And the year, when it is given");
{
  // Without this, next February is filed under this year — in the past, where
  // the app then describes it as something you are still waiting on.
  const cases = [
    ["on the 2nd of feb 2027", "2027-02-02"],
    ["2 feb 2027", "2027-02-02"],
    ["feb 2 2027", "2027-02-02"],
    ["14th of november 2026", "2026-11-14"],
    ["10/09/27", "2027-09-10"],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));
}

sec("Written in Chinese");
{
  const cn = (phrase) => Q.parse(phrase, {}).date || "";
  const cases = [
    ["今天交作业", plus(0)], ["明天开会", plus(1)], ["后天交", plus(2)],
    ["下周交报告", plus(7)],
    ["9月14日交", `${thisYear}-09-14`],
    ["月底交", endOfMonth()],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, cn(say) === want, `${cn(say) || "(none)"} — wanted ${want}`));
}

sec("And what is NOT a date");
{
  // Guessing here is worse than not guessing: a date nobody gave becomes a
  // deadline nobody set, and the app then has an opinion about you missing it.
  const notDates = [
    "march 2026",          // a month and a year, but no day in it
    "in the summer",
    "sometime next term",
    "when i get a minute",
    "before the inspection",
    "at some point",
    "buy 3 folders",       // a number that is a quantity
    "room 214",            // a number that is a place
    "book it 45/99",       // an impossible one
    // A DASH BETWEEN TWO SMALL NUMBERS IS A RANGE far more often than a date,
    // and reading "exercise 4-6" as the 4th of June would turn a page reference
    // into a deadline. With a year on the end it is unambiguous and IS read —
    // see above.
    "exercise 4-6",
    "periods 1-3",
    "10-09",
  ];
  notDates.forEach((say) => ok(`"${say}" is not a date`, read(say) === "", read(say)));
}

sec("A time of day, separately from the day");
{
  const at = (phrase) => Q.parse(`meeting ${phrase}`, {}).time || "";
  const cases = [
    ["at 3pm", "15:00"], ["at 9am", "09:00"], ["at 09:05", "09:05"],
    ["at 15:30", "15:30"], ["3pm", "15:00"], ["at 12pm", "12:00"], ["at 12am", "00:00"],
  ];
  cases.forEach(([say, want]) => ok(`"${say}"`, at(say) === want, `${at(say) || "(none)"} — wanted ${want}`));
  ok('"buy 3 folders" has no time in it', Q.parse("buy 3 folders", {}).time === "");
}

sec("And the same time written with a dot, which is how most people write it");
{
  // THE ONE THAT MOVED APPOINTMENTS BY MONTHS. A dot is the ordinary British,
  // Irish and Australian way to write a time, and the house style of most
  // international schools — and every one of these was read as a DATE.
  // "Assembly at 9.10" was filed on the 9th of October, seven weeks out, on a
  // card that looked perfectly sure of itself, and tomorrow morning's assembly
  // had nothing against it at all. "Call mum at 8.02" went to the 8th of
  // February. The word "at" was sitting right there in every one of them.
  const at = (phrase) => Q.parse(`meeting ${phrase}`, {}).time || "";
  const on = (phrase) => Q.parse(`meeting ${phrase}`, {}).date || "";
  const cases = [
    ["at 9.10", "09:10"], ["at 11.05", "11:05"], ["at 8.02", "08:02"],
    // AND THE HALF NOBODY WROTE. A one to six with no am or pm on it is the
    // afternoon: nothing in a school happens at ten past four in the morning,
    // and read as written a parents evening at 6.30 was going in before dawn.
    // A LEADING ZERO IS SOMEBODY BEING EXPLICIT and is left exactly alone,
    // which is why "08.15" is still the morning here and "4.10" is not.
    ["at 4.10", "16:10"], ["at 08.15", "08:15"], ["at 15.30", "15:30"],
    ["from 7.40", "07:40"], ["by 12.05", "12:05"], ["until 3.45", "15:45"],
    ["starts 9.30", "09:30"],
    // With am/pm no lead-in word is needed — the pm IS the lead-in.
    ["6.30pm", "18:30"], ["7.45am", "07:45"],
    // AND THE ONE THAT WAS WORSE THAN NOTHING. "2.15pm" read the 2 and the pm,
    // threw the .15 away, and came back 15:00 — three quarters of an hour late,
    // silently, in a field that looked filled in properly.
    ["2.15pm", "14:15"],
  ];
  cases.forEach(([say, want]) => {
    ok(`"${say}" is a time`, at(say) === want, `${at(say) || "(none)"} — wanted ${want}`);
    ok(`and "${say}" is not a date`, on(say) === "", on(say));
  });
  // AND THE OTHER HALF OF THE SAME COIN. "10.09" with nothing to say it is a
  // clock is still the 10th of September, which is equally somebody's normal.
  ok('"10.09" on its own is still a date', read("10.09") === `${thisYear}-09-10`, read("10.09"));
  // A dot between two single digits is a section number. "Exercise 4.6" read as
  // the 4th of June turns a page reference into a deadline — the same reasoning
  // that already stopped "exercise 4-6" being read.
  ok('"exercise 4.6" is not a date', read("exercise 4.6") === "", read("exercise 4.6"));
  ok('"section 2.3" is not a date', read("section 2.3") === "", read("section 2.3"));
  // Money is not a time. Without a word saying "clock", it is left alone.
  ok('"pay 7.40 for the trip" has no time in it',
     Q.parse("pay 7.40 for the trip", {}).time === "", Q.parse("pay 7.40 for the trip", {}).time);

  // A KNOWN LIMIT, WRITTEN DOWN RATHER THAN QUIETLY TRUE. "Parents evening at
  // 6.30" almost certainly means the evening, and the app reads 06:30 — the
  // same as it has always read "6:30", because the alternative is guessing
  // which half of the day somebody meant. It is shown on the check-back before
  // anything is kept, so it is wrong where you can see it rather than wrong in
  // a list. If that ever changes it must change for both spellings at once.
  ok('a bare "6.30" and a bare "6:30" agree, whatever they decide',
     at("at 6.30") === at("at 6:30"), `${at("at 6.30")} vs ${at("at 6:30")}`);
}

sec("And a time that cannot exist is not a time");
{
  // "9:99" came back as "09:99" — stored, carried around, and then invisible
  // everywhere, because everything that draws a time refuses to draw that one.
  // dates.js and schedule.js both already said it was nonsense; this was the
  // one file that disagreed, and disagreeing quietly is the whole problem.
  const at = (phrase) => Q.parse(`meeting ${phrase}`, {}).time || "";
  [["at 9:99", ""], ["at 9.99", ""], ["at 25:00", ""], ["at 9:60", ""]].forEach(([say, want]) =>
    ok(`"${say}"`, at(say) === want, `${at(say) || "(none)"} — wanted ${want || "(none)"}`));
}

sec("And words that say it comes round again");
{
  // A teacher's week is mostly things that happen again. "Gate duty every
  // Tuesday and Thursday" went on as one task on one Tuesday, looking entirely
  // settled — and after that Tuesday there was no gate duty in the app at all.
  const again = (s) => Q.parse(s, {}).repeatsText || "";
  [
    "gate duty every tuesday and thursday",
    "staff briefing every monday",
    "yard duty on tuesdays",
    "book club thursdays",
    "weekly team meeting",
    "every day",
    "每周五开会",
  ].forEach((s) => ok(`"${s}" is heard as happening again`, again(s) !== "", "(heard nothing)"));
  // AND IT MUST NOT SEE ONE THAT ISN'T THERE. Saying so on a one-off would send
  // people to the timetable to fix something that was already right.
  [
    "call the dentist tomorrow",
    "reports due a week on friday",
    "buy whiteboard pens",
    "parents evening on thursday",
  ].forEach((s) => ok(`"${s}" is not`, again(s) === "", again(s)));
}

sec("And a deadline said as a limit rather than a point");
{
  // How anybody writes a target: "observe three teachers within a month",
  // "get the reports done by the end of September". "End of the month" was read
  // and "end of September" was not — the same phrase with the month said out
  // loud, and the more common of the two for anything further than a fortnight
  // away.
  const monthEnd = (mo) => {
    const n = new Date();
    const yr = mo < n.getMonth() ? n.getFullYear() + 1 : n.getFullYear();
    return iso(new Date(yr, mo + 1, 0));
  };
  [
    ["by the end of september", monthEnd(8)],
    ["before the end of september", monthEnd(8)],
    ["end of jan", monthEnd(0)],
    ["end of december", monthEnd(11)],
  ].forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));

  // A month already gone means NEXT year's. "End of January", said in November,
  // is January — not ten months into the past, where the app would then describe
  // it as something you had missed.
  ok("a month already past means next year's",
     read("end of january") >= iso(TODAY), read("end of january"));

  // WITHIN a span, rather than at a point.
  [
    ["within a month", plus(30)],
    ["within 2 months", plus(60)],
    ["within 10 days", plus(10)],
    ["within the next fortnight", plus(7)],
  ].forEach(([say, want]) => ok(`"${say}"`, read(say) === want, `${read(say) || "(none)"} — wanted ${want}`));

  // AND THE ONE THAT STILL MUST NOT BE A DATE. A month and a year with no day
  // in it is a heading, and reading it would put a deadline nobody set.
  ok('"march 2026" is still not a date', read("march 2026") === "", read("march 2026"));
  ok("and neither is a bare month", read("september") === "", read("september"));
}

// ---------------------------------------------------------------------------
sec("And a date is written the same way everywhere");
{
  // dates.js exists so there is ONE way of writing a date. It left the year off
  // unless somebody asked for it — so "Tue, Feb 2" for something seventeen
  // months away read as this coming February, in exactly the words the app uses
  // for a date six weeks away. The one number that told them apart was the one
  // being dropped.
  const dsb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, RegExp, Intl };
  dsb.window = dsb;
  vm.createContext(dsb);
  vm.runInContext(fs.readFileSync(path.join(PUB, "dates.js"), "utf8"), dsb);
  const D = dsb.OrganiserDates;
  const nextYear = `${thisYear + 1}-02-02`;
  const lastYear = `${thisYear - 1}-12-01`;
  ok("a date this year says the day and the month", !/\d{4}/.test(D.dayWords(`${thisYear}-09-10`)),
     D.dayWords(`${thisYear}-09-10`));
  ok("one in another year says which year", new RegExp(String(thisYear + 1)).test(D.dayWords(nextYear)),
     D.dayWords(nextYear));
  ok("and so does one behind us", new RegExp(String(thisYear - 1)).test(D.dayWords(lastYear)),
     D.dayWords(lastYear));
  ok("today is still today", D.dayWords(iso(TODAY)) === "Today", D.dayWords(iso(TODAY)));
  ok("and tomorrow is still tomorrow", D.dayWords(plus(1)) === "Tomorrow", D.dayWords(plus(1)));
}

// ---------------------------------------------------------------------------
sec("And only one file decides how a date looks");
{
  // dates.js exists so there is ONE way of writing a date, and it is loaded by
  // every page. Six files kept a private copy of the same function anyway, each
  // subtly different — so fixing the shared one changed nothing anybody could
  // see. That is the whole failure: a shared module nothing shares.
  const own = fs.readdirSync(PUB).filter((f) => f.endsWith(".js") && f !== "dates.js");
  // Where a date is written for a PERSON to read. Places that ask a Date object
  // for a month name or a weekday name to build something else — a calendar
  // grid's column headings, a chart's axis — are a different job and say so.
  const ALLOWED = {
    "month.js": "the calendar grid's own month and weekday headings",
    "chart.js": "axis labels on a graph",
    "week.js": "the heading over each day of the week",
    "timeline.js": "the heading over today",
    "goals.js": "a month label on a milestone",
    "schedule.js": "a clock time, not a date",
    "app.js": "the weekday letters on the day strip",
  };
  const offenders = own.filter((f) => {
    if (ALLOWED[f]) return false;
    const src = codeOf(fs.readFileSync(path.join(PUB, f), "utf8"));
    return /toLocaleDateString/.test(src);
  });
  ok("nothing else writes a date its own way", offenders.length === 0, offenders.join(", "));
  console.log(`  -- building their own labels on purpose: ${Object.keys(ALLOWED).join(", ")}`);

  // And nobody keeps a second copy of the function itself.
  const copies = own.filter((f) => /function friendlyDate\s*\(/.test(fs.readFileSync(path.join(PUB, f), "utf8")));
  ok("and nobody keeps their own copy of it", copies.length === 0, copies.join(", "));
}

done();
