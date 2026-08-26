// THE SCHOOL CALENDAR, WHICHEVER SHAPE IT ARRIVED IN.
//
// It comes as a PDF, a spreadsheet, a Word document or an email, and all four
// of those become text the moment you copy them. So this reads text: any line
// with a date in it is an entry, and the words next to it are what it's called.
//
// WHAT IT DOES NOT DO IS GUESS WHAT A DATE MEANS. "Winter break begins" and
// "Staff return" and "INSET day" are three completely different instructions to
// the app — one is a day you may or may not work, one is a working day with no
// lessons in it, one might be either — and telling them apart from the words
// would mean the app deciding your term from a noun. It reads the dates, shows
// them, and you say what each one is. Six taps, once a year.
//
// AND THE ONE THAT MATTERS MOST: WHEN DO THE LESSONS START. Staff go back
// before the students do. That week is working days with no teaching in them,
// and unless the timetable is told when it begins, the app will believe you had
// lessons during it — and in July, and next year, because a timetable typed in
// with no dates on it runs for ever. So one of the labels you can put on a date
// is "the teaching starts here", and that one doesn't make a day at all: it
// tells the timetable when it applies.
//
// §0.2: nothing here knows what a school is. It reads dates out of text and
// hands back rows for you to label. "Lessons" is the app's word for the fixed
// commitments you already typed in, whatever they are; which of them it applies
// to is a question, never an assumption.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const LINE_BREAKS = /\r\n|\r|\n|\u000b|\u000c|\u2028|\u2029/;

  // Month names are part of a date format, not domain vocabulary — the same way
  // a colon is. English only, because that is what the formats below are; a
  // numeric or ISO date needs none of this and always works.
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  const iso = (y, m, d) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Is this a date anybody would recognise as one? Returns ISO, or "".
  //
  // Deliberately narrow. A bare "24" is not a date, and a year on its own is
  // not a date — reading either as one would fill your term with entries you
  // never asked for.
  //
  // AND A MONTH WITH A YEAR AFTER IT IS NOT A DATE EITHER. "March 2026" is a
  // heading, and every calendar has a dozen of them. Read loosely it comes out
  // as the 20th of March, because "2026" splits into a day and a two-digit
  // year — which is why the day number in each pattern below carries a (?!\d):
  // it refuses to be the front of a longer number.
  // THE FIRST THING THAT LOOKS RIGHT IS NOT NECESSARILY THE DATE.
  //
  // Every one of the word patterns below used .match() without /g, which stops
  // at the first place the SHAPE fits — and then, if the word there turned out
  // not to be a month, gave up on the whole line instead of looking further
  // along it.
  //
  // So "Term 1 starts Tuesday 25 August 2026" came back as no date at all. The
  // shape "<number> <word>" fits at "1 starts"; "starts" is not a month; and
  // the 25th of August, sitting four words to the right in plain sight, was
  // never reached. Same for "Term 1 ends Friday 22 January 2027", "Term 2",
  // "Semester 1", "Week 1" — a standalone digit anywhere ahead of the date
  // killed the line.
  //
  // Those two lines are the whole reason this panel exists: term start and term
  // end are what stop a timetable repeating through the summer. They were the
  // two it dropped, and it dropped them without a word.
  //
  // Every pattern now walks the line and keeps the first match that is really a
  // date, rather than the first match that is merely date-shaped.
  // A MISS MUST NOT EAT THE REST OF THE LINE EITHER.
  //
  // "Term 1 ends 22 January 2027" fits the shape at "1 ends 22" — the optional
  // YEAR group happily swallowing the 22, which is the day. "ends" is not a
  // month, so that match is thrown away — and with it the 22, leaving only
  // " January 2027", which has no day in it and matches nothing.
  //
  // So a rejected match rewinds to one character past where it started rather
  // than skipping everything it consumed. Rejecting a guess must never cost the
  // line the letters that guess happened to cover.
  function firstMonthMatch(s, re, monthAt) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const mo = MONTHS.indexOf(String(m[monthAt]).slice(0, 3).toLowerCase());
      if (mo >= 0) return { m, mo };
      re.lastIndex = m.index + 1;
    }
    return null;
  }

  // The date, and the exact words it was read off — so the label can take out
  // that and nothing else. See labelOf.
  function findDate(text, defaultYear) {
    const s = String(text || "");
    const at = (m, isoDate) => ({ iso: isoDate, text: m[0] });
    // 2026-08-24 / 2026/8/24
    let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) return at(m, iso(+m[1], +m[2], +m[3]));
    // AND A CLOCK TIME IS NOT A YEAR. "Nov. 2 16:00" is a deadline at four in
    // the afternoon; the year slot took the 16 and filed it under November 2016.
    // Four of the most important dates a teacher has — when papers are in, when
    // marks are in — landed ten years in the past, looking perfectly ordinary.
    // So the year refuses to be the front of a time.
    const NOT_A_TIME = "(?![:.]\\d)";
    // 24 August 2026 / 24 Aug 26 / 24th August
    let hit = firstMonthMatch(s, new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)\\s+([A-Za-z]{3,9})\\.?\\s*(\\d{2,4}${NOT_A_TIME})?\\b`, "g"), 2);
    if (hit) return at(hit.m, iso(year(hit.m[3], defaultYear), hit.mo + 1, +hit.m[1]));
    // August 24, 2026 / Aug 24
    hit = firstMonthMatch(s, new RegExp(
      `\\b([A-Za-z]{3,9})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)\\s*,?\\s*(\\d{2,4}${NOT_A_TIME})?\\b`, "g"), 1);
    if (hit) return at(hit.m, iso(year(hit.m[3], defaultYear), hit.mo + 1, +hit.m[2]));
    // 24/08/2026 — day first, because a calendar that writes it this way is
    // almost never American, and the ISO form above catches the other order.
    m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (m && +m[1] <= 31 && +m[2] <= 12) return at(m, iso(year(m[3], defaultYear), +m[2], +m[1]));
    return { iso: "", text: "" };
  }

  // "25-27 SEPTEMBER" IS THREE DAYS, NOT ONE.
  //
  // Every Chinese school calendar is full of these — Mid-Autumn, National Day,
  // Spring Festival — and so is every other calendar around a bank holiday.
  // Read as a single date, "National Day holiday 1-7 October 2026" kept the 7th
  // and lost the other six, so Golden Week showed as six teaching days, with a
  // stray "1" left sitting in the row's name.
  //
  // Pairing two SEPARATE lines is deliberately not done — see plan() below, and
  // the calendar that married an INSET day to the start of a break and wrote
  // off seven weeks. This is the other case entirely: one line, both ends said
  // by the person who wrote it, in one breath. Nothing is being inferred.
  //
  // A month name has to be in it. That is what separates "1-7 October" from
  // "exercise 4-6", which is a page reference and not three days off.
  const DASH = "[-–—]|\\bto\\b|\\buntil\\b";
  function rangeIn(text, defaultYear) {
    const s = String(text || "");
    const MO = "[A-Za-z]{3,9}";
    const month = (w) => MONTHS.indexOf(String(w).slice(0, 3).toLowerCase());
    // 25-27 September 2026
    let m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:${DASH})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MO})\\.?\\s*(\\d{2,4})?\\b`).exec(s);
    if (m && month(m[3]) >= 0) {
      const y = year(m[4], defaultYear), mo = month(m[3]) + 1;
      return { from: iso(y, mo, +m[1]), to: iso(y, mo, +m[2]), text: m[0] };
    }
    // September 25-27, 2026
    m = new RegExp(`\\b(${MO})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:${DASH})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{2,4})?\\b`).exec(s);
    if (m && month(m[1]) >= 0) {
      const y = year(m[4], defaultYear), mo = month(m[1]) + 1;
      return { from: iso(y, mo, +m[2]), to: iso(y, mo, +m[3]), text: m[0] };
    }
    // 25 September - 3 October 2026, which crosses a month end — and
    // "20 December 2026 - 5 January 2027", which is the same thing with the
    // year written on both ends, as it has to be when it crosses one.
    m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MO})\\.?\\s*(\\d{4})?\\s*(?:${DASH})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MO})\\.?\\s*(\\d{2,4})?\\b`).exec(s);
    if (m && month(m[2]) >= 0 && month(m[5]) >= 0) {
      const yEnd = year(m[6], defaultYear);
      // The start's own year if it has one; otherwise the end's, stepped back a
      // year when the months say it crossed New Year.
      const yStart = m[3] ? Number(m[3]) : month(m[5]) < month(m[2]) ? yEnd - 1 : yEnd;
      return {
        from: iso(yStart, month(m[2]) + 1, +m[1]),
        to: iso(m[6] ? yEnd : month(m[5]) < month(m[2]) ? yStart + 1 : yStart, month(m[5]) + 1, +m[4]),
        text: m[0],
      };
    }
    // Oct. 1 - Oct. 7, and "Dec. 20, 2026 - Jan. 5, 2027" which crosses New
    // Year. The same shape as the one above with the month written first, which
    // is how every holiday on a Chinese school calendar is written — and until
    // now each of them came out as its first day only, so National Day week was
    // one day off and six days of teaching.
    m = new RegExp(`\\b(${MO})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})?\\s*(?:${DASH})\\s*(${MO})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{2,4})?\\b`).exec(s);
    if (m && month(m[1]) >= 0 && month(m[4]) >= 0) {
      const yEnd = year(m[6], defaultYear);
      const yStart = m[3] ? Number(m[3]) : month(m[4]) < month(m[1]) ? yEnd - 1 : yEnd;
      return {
        from: iso(yStart, month(m[1]) + 1, +m[2]),
        to: iso(m[6] ? yEnd : month(m[4]) < month(m[1]) ? yStart + 1 : yStart, month(m[4]) + 1, +m[5]),
        text: m[0],
      };
    }
    return null;
  }

  function dateIn(text, defaultYear) {
    const r = rangeIn(text, defaultYear);
    if (r && r.to > r.from) return r.from;
    return findDate(text, defaultYear).iso;
  }

  function year(raw, fallback) {
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) return fallback || new Date().getFullYear();
    if (n >= 1000) return n;
    return 2000 + n;
  }

  // Everything left once the date is taken out — that's what it's called.
  //
  // IT USED TO TAKE OUT EVERYTHING DATE-SHAPED, not the date. So "Term 1 starts
  // Tuesday 25 August 2026" lost "1 starts" as well — the same false match that
  // stopped the line being read at all — and came back called "Term Tuesday".
  // Reading the date and naming the row are the same question asked twice, and
  // the two answers had drifted; now the second one is told what the first
  // found and removes exactly that.
  function labelOf(line, isoDate, defaultYear) {
    const raw = String(line || "");
    const range = rangeIn(raw, defaultYear);
    const found = range && range.to > range.from ? range : findDate(raw, defaultYear);
    let s = found.text ? raw.replace(found.text, " ") : raw;
    // Any trailing year the pattern left behind — "…25 August" then "2026" as
    // its own word — is part of the date, not part of the name.
    s = s
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/[\t|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–—:•*]+|[\s\-–—:•*]+$/g, "")
      .trim();
    return s.slice(0, 80);
  }

  // WHICH YEAR IS THIS CALENDAR ABOUT?
  //
  // Found on a real one: a PDF table put "Saturday", "2026" and "24 August" on
  // three separate lines, so the line carrying the date had no year on it and
  // the whole calendar came out a year early. Silently — every date looked
  // perfectly reasonable, they were just all wrong.
  //
  // So the year is taken from the document itself: the four-digit year that
  // appears most often in it. That is still a guess, which is why read() hands
  // it back and the page puts it in a box you can change.
  function docYear(text) {
    const counts = new Map();
    (String(text || "").match(/\b(?:19|20|21)\d{2}\b/g) || []).forEach((y) => {
      counts.set(+y, (counts.get(+y) || 0) + 1);
    });
    if (!counts.size) return 0;
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }

  // EVERY YEAR THE DOCUMENT MENTIONS, not just the one it mentions most.
  //
  // A school calendar for a first semester runs September to January and so has
  // TWO years in it, and one of them has to be borrowed by every line that
  // didn't write its own. Whichever is picked, half the document comes out
  // twelve months wrong — and nothing about a date on the screen says which
  // half. So the years are counted, said, and each borrowed row can be moved
  // between them one at a time.
  function docYears(text) {
    const seen = new Set();
    (String(text || "").match(/\b(?:19|20|21)\d{2}\b/g) || []).forEach((y) => seen.add(+y));
    return [...seen].sort((a, b) => a - b);
  }

  // Half a year is the line. A school's dates for one term sit well inside it;
  // dates that have been spread across a whole year by one borrowed year sit
  // well outside. Nothing here is a rule about when a school year starts.
  const HALF_A_YEAR = 180;
  function straddles(rows) {
    const days = (Array.isArray(rows) ? rows : []).map((r) => Date.parse(r.date + "T12:00:00Z"))
      .filter((n) => !isNaN(n));
    if (days.length < 2) return false;
    return (Math.max(...days) - Math.min(...days)) / 86400000 > HALF_A_YEAR;
  }

  // ---- A WHOLE TERM DRAWN AS ONE GRID ----------------------------------------
  //
  // The third grid, and the one a school hands its teachers: not a month but a
  // SEMESTER, twenty-one weeks in one table, a week to a row, with the week's
  // number down the left-hand side and the numbers running straight through the
  // month ends:
  //
  //     Week  Sun  Mon  Tue  Wed  Thu  Fri  Sat
  //     1                9/1   2    3   4Ý   5
  //     2      6    7u   8     9    10  11Ý  12
  //     ...
  //     ! Grade 11-12 Director Meeting   u Grade 9-10 Director Meeting
  //     Ý Staff Meeting
  //
  // Flattened out of a PDF that is a stream of bare numbers with the odd symbol
  // in it, and NOT ONE DATE ANYWHERE. The month reader refuses it, rightly: the
  // week numbers break the run of days, so read as a month it is nonsense.
  //
  // FOUR THINGS ARE IN HERE AND NOTHING ELSE HAS THEM. Which days are marked,
  // and with what — those are the staff meetings, thirteen of them, and the
  // director meetings. The week numbers, which the page underneath refers to
  // ("Week 12 return papers", "Art Festival: weeks 16-17") and which mean
  // nothing without this. When the term starts and stops. And — the one that
  // fixes the rest of the document — WHICH YEAR EACH MONTH IS IN, because the
  // grid runs from September to January and says so by running.
  //
  // TELLING A WEEK NUMBER FROM A DAY takes no vocabulary: the days ascend by
  // one, so a number that doesn't is not one. A row holds at most seven days,
  // which settles the rest.
  const AS_MONTH_DAY = /^(\d{1,2})\/(\d{1,2})$/;
  const A_NUMBER = /^\d{1,2}$/;
  // "7u" — a day with its mark drawn tight against it, which happens whenever
  // the two runs of text end up close enough to read as one.
  // NOT DIGITS AFTER THE NUMBER. Written loosely this splits "10" into a day
  // called 1 with a mark called 0, and the whole grid falls over on the tenth
  // of the month.
  const NUMBER_THEN_MARK = /^(\d{1,2})([^\d\s]{1,2})$/;
  // What the symbols mean is written underneath, and the description is the
  // first thing long enough to be one.
  const A_DESCRIPTION = 5;
  const A_SYMBOL = 2;

  function weekGridIn(text) {
    // Which weekday a word is has one owner, in timetable.js.
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.dayOf !== "function") return null;
    const lines = String(text || "").split(LINE_BREAKS)
      .map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);

    let at = -1;
    let dows = [];
    let hasWeekColumn = false;
    for (let i = 0; i < lines.length; i++) {
      const run = [];
      let j = i;
      while (j < lines.length && /^[A-Za-z]{2,9}$/.test(lines[j]) && T.dayOf(lines[j]) >= 0) {
        run.push(T.dayOf(lines[j]));
        j++;
      }
      if (run.length >= 5) {
        at = j;
        dows = run;
        // A COLUMN THAT ISN'T A DAY, sitting in front of the ones that are. Its
        // heading is what makes the numbers underneath readable as week
        // numbers rather than as a month gone wrong.
        hasWeekColumn = i > 0 && /^[A-Za-z]{2,9}$/.test(lines[i - 1]) && T.dayOf(lines[i - 1]) < 0;
        break;
      }
      if (j > i) i = j - 1;
    }
    if (at < 0 || !hasWeekColumn) return null;

    // THE LEGEND FIRST, so the grid knows where to stop. It begins at the first
    // symbol that is followed, within a line or two, by something long enough to
    // be a description — which in the grid itself never happens, because the
    // grid is numbers.
    let legendAt = lines.length;
    for (let i = at; i < lines.length; i++) {
      if (lines[i].length > A_SYMBOL || A_NUMBER.test(lines[i])) continue;
      for (let k = i + 1; k <= i + 2 && k < lines.length; k++)
        if (lines[k].length >= A_DESCRIPTION && !A_NUMBER.test(lines[k])) { legendAt = i; break; }
      if (legendAt < lines.length) break;
    }

    const weeks = [];
    let week = null;
    let month = 0, day = 0, rolls = 0, weekNo = 0;
    let last = null;
    const put = (m, d) => {
      if (!week) { week = { n: weekNo, days: [] }; weeks.push(week); }
      last = { month: m, day: d, rolls, marks: [] };
      week.days.push(last);
      month = m;
      day = d;
    };
    for (let i = at; i < legendAt; i++) {
      const line = lines[i];
      const md = AS_MONTH_DAY.exec(line);
      if (md) {
        // A MONTH WRITTEN INTO THE SQUARE, which is how the grid says it has
        // crossed one. Going backwards is a new year, and that is the whole
        // reason this document knows something the rest of the page doesn't.
        if (month && +md[1] < month) rolls++;
        put(+md[1], +md[2]);
        continue;
      }
      const glued = A_NUMBER.test(line) ? null : NUMBER_THEN_MARK.exec(line);
      const n = glued ? +glued[1] : A_NUMBER.test(line) ? +line : NaN;
      if (!isNaN(n)) {
        const full = week && week.days.length >= dows.length;
        if (!month && !weekNo) { weekNo = n; week = null; continue; }
        if (!full && month && n === day + 1) put(month, n);
        // The month ended and the next square carries on without saying so.
        else if (!full && day >= 28 && n === 1) { if (month === 12) rolls++; put(month === 12 ? 1 : month + 1, 1); }
        else if (n === weekNo + 1 || full) { weekNo = n; week = null; }
        // NOT A CALENDAR. Numbers that don't run like days and don't count like
        // weeks are a table of something else that happens to sit under seven
        // day names.
        else return null;
        if (glued && last && week) last.marks.push(glued[2]);
        continue;
      }
      if (line.length <= A_SYMBOL) { if (last) last.marks.push(line); continue; }
      break;
    }
    const all = weeks.flatMap((w) => w.days);
    if (all.length < 20 || weeks.length < 3) return null;

    // WHAT THE SYMBOLS MEAN. Only for symbols the grid actually used — the
    // straight quote a document draws between a symbol and its description is
    // the same shape and means nothing.
    const used = new Set(all.flatMap((d) => d.marks));
    const legend = {};
    for (let i = legendAt; i < lines.length; i++) {
      if (!used.has(lines[i])) continue;
      for (let k = i + 1; k <= i + 3 && k < lines.length; k++)
        if (lines[k].length >= A_DESCRIPTION && !A_NUMBER.test(lines[k])) { legend[lines[i]] = lines[k]; break; }
    }

    // A FULL WEEK IS WHAT PINS THE COLUMNS DOWN. A short one — the first week of
    // a term that starts on a Tuesday — could be sitting anywhere in its row,
    // and an empty square draws nothing at all to say which.
    const whole = weeks.find((w) => w.days.length === dows.length);
    return {
      startDow: dows[0],
      weeks,
      legend,
      anchor: whole ? { month: whole.days[0].month, day: whole.days[0].day, rolls: whole.days[0].rolls } : null,
      from: all[0],
      to: all[all.length - 1],
      marked: all.filter((d) => d.marks.length).length,
    };
  }

  // WHICH YEAR IT STARTS IN. The anchor is a day the grid says is the first
  // column of its row, so it has to fall on that weekday — which in a window of
  // a few years is true of one, sometimes two.
  function weekGridYears(grid, around) {
    if (!grid || !grid.anchor) return [];
    const mid = Number(around) || new Date().getFullYear();
    const out = [];
    for (let y = mid - 3; y <= mid + 3; y++) {
      const a = grid.anchor;
      const on = new Date(Date.UTC(y + a.rolls, a.month - 1, a.day));
      if (on.getUTCMonth() !== a.month - 1) continue;
      if (on.getUTCDay() === grid.startDow) out.push(y);
    }
    return out;
  }

  // WHICH YEAR EACH MONTH IS IN, read off the grid rather than assumed. This is
  // the answer to the thing no amount of staring at a list of dates can settle:
  // a first-semester calendar's September is one year and its January is the
  // next, and the grid knows because it walked from one to the other.
  function weekGridMonths(grid, year) {
    const out = new Map();
    if (!grid) return out;
    grid.weeks.forEach((w) => w.days.forEach((d) => {
      if (!out.has(d.month)) out.set(d.month, year + d.rolls);
    }));
    return out;
  }

  // The days that carry a symbol, gathered under what the legend calls it.
  function weekGridMarks(grid, year) {
    if (!grid) return [];
    const by = new Map();
    grid.weeks.forEach((w) => w.days.forEach((d) => d.marks.forEach((s) => {
      if (!by.has(s)) by.set(s, []);
      by.get(s).push(iso(year + d.rolls, d.month, d.day));
    })));
    return [...by.entries()].map(([symbol, dates]) => {
      // WHICH DAY OF THE WEEK, MOSTLY. A weekly staff meeting is thirteen
      // Fridays and then one Thursday, because the last week of term ends on the
      // Friday — so "all on a Friday" would be false and "no pattern" would be
      // useless. The common day and the count of the ones that aren't on it is
      // both true and worth reading.
      const dows = dates.map((x) => new Date(x + "T12:00:00Z").getUTCDay());
      const tally = new Map();
      dows.forEach((d) => tally.set(d, (tally.get(d) || 0) + 1));
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        symbol,
        // NAMED BY THE DOCUMENT OR NOT AT ALL. A symbol whose legend didn't come
        // through is still a day something happens on, and saying which symbol
        // is more use than inventing a name for it.
        name: grid.legend[symbol] || "",
        dates,
        weekday: top && top[1] > 1 && top[1] >= dates.length - 2 ? top[0] : -1,
        odd: top ? dates.length - top[1] : 0,
        from: dates[0],
        to: dates[dates.length - 1],
      };
    });
  }

  // The same date in another year. Returns "" when there is no such day — the
  // 29th of February in a year that hasn't got one.
  function atYear(isoDate, y) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
    if (!m || !y) return "";
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? iso(y, +m[2], +m[3]) : "";
  }

  const hasYearOnIt = (line) => /\b(?:19|20|21)\d{2}\b/.test(String(line || ""));

  // ---- A MONTH DRAWN AS A WALL CALENDAR --------------------------------------
  //
  // Everything above reads a LIST: one date to a line, with words next to it.
  // That is how a term-dates sheet is written, and it is not how a school writes
  // the shape of a week. For that it draws the month — seven columns, a square
  // per day, the day's number in the corner:
  //
  //     Sunday  Monday  Tuesday …
  //     16      17      18            ← the numbers
  //     OFF     OFF     OFF           ← and what is in each square
  //
  // Out of a PDF that grid has no columns and no squares left. What arrives is
  // the seven day names, then the numbers and their words alternating in reading
  // order, and nothing whatever with a date on it — so the reader above found
  // NOTHING on the overview page of a whole booklet. The first day of school,
  // the two airport-pickup days, every day marked OFF: none of it landed.
  //
  // THE HARD PART IS THAT THE MONTH IS NOT WRITTEN ANYWHERE. A wall calendar
  // does not need to say it: you can see it. What the grid does say is which
  // weekday the first column is, and that the numbers run without a break — and
  // between them those pin the month down, usually to exactly one. Where they
  // do not, the choice is offered rather than guessed.
  const dayNumber = (line) => {
    const m = /^(\d{1,2})$/.exec(String(line || "").trim());
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 31 ? n : 0;
  };
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  // A cell holds a label, not a paragraph. Both of these are about where the
  // GRID ends: below it sits the rest of the page, and the last square has
  // nothing after it to stop it swallowing the lot.
  const CELL_LINE = 40;
  const CELL_LINES = 6;

  function gridIn(text) {
    // Which weekday a word is has one owner, in timetable.js, and this asks it
    // rather than keeping a second list that could learn "Tues" without this one
    // hearing about it.
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.dayOf !== "function") return null;
    const lines = String(text || "").split(LINE_BREAKS)
      .map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);

    // THE HEADER IS THE ONLY THING THAT SAYS THIS IS A CALENDAR. Five or more
    // day names in a row: five, not seven, because a grid of the working week
    // is a grid too.
    let at = -1;
    let dows = [];
    for (let i = 0; i < lines.length; i++) {
      const run = [];
      let j = i;
      while (j < lines.length && /^[A-Za-z]{2,9}$/.test(lines[j]) && T.dayOf(lines[j]) >= 0) {
        run.push(T.dayOf(lines[j]));
        j++;
      }
      if (run.length >= 5) { at = j; dows = run; break; }
      if (j > i) i = j - 1;
    }
    if (at < 0) return null;

    const cells = [];
    let cur = null;
    for (let i = at; i < lines.length; i++) {
      const n = dayNumber(lines[i]);
      if (n) { cur = { day: n, lines: [] }; cells.push(cur); continue; }
      if (!cur) continue;
      // A LINE TOO LONG TO BE IN A SQUARE IS THE PAGE UNDERNEATH.
      if (lines[i].length > CELL_LINE) break;
      if (cur.lines.length < CELL_LINES) cur.lines.push(lines[i]);
    }
    if (cells.length < 5) return null;

    // DO THE NUMBERS RUN LIKE DAYS? Ascending by one, with at most one drop back
    // to the start of the next month. Anything else is a table of numbers that
    // happens to sit under some day names.
    let rolls = 0;
    let monthLen = 0;
    let missing = 0;
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1].day, b = cells[i].day;
      if (b === a + 1) continue;
      // A NUMBER THE PDF DIDN'T GIVE BACK. One square's "30" simply wasn't in
      // the text of a real booklet; the day is gone, and saying so is better
      // than refusing the other twenty-one.
      if (b > a && b - a <= 3) { missing += b - a - 1; continue; }
      if (b < a && a >= 28 && b <= 2 && !rolls) { rolls++; monthLen = a; continue; }
      return null;
    }
    // The first number is taken to sit in the first column. Nothing in the text
    // can confirm it — an empty square draws nothing at all — which is exactly
    // why the month it implies is offered rather than applied silently.
    return {
      startDow: dows[0],
      cells: cells.map((c) => ({ day: c.day, lines: c.lines })),
      monthLen,
      missing,
    };
  }

  // Trim the last square to the size of the others. It is the only one with no
  // number after it, so the page's own title, its welcome paragraph and its
  // footer all pile into it. Held to the MIDDLE size rather than the largest,
  // because one roomy square shouldn't licence a paragraph.
  function gridCells(grid) {
    const cells = grid.cells.map((c) => ({ day: c.day, label: c.lines.join(" ").trim() }));
    if (grid.cells.length > 1) {
      const others = grid.cells.slice(0, -1).map((c) => c.lines.length).sort((a, b) => a - b);
      const typical = Math.max(1, others[Math.floor(others.length / 2)]);
      const last = grid.cells[grid.cells.length - 1];
      if (last.lines.length > typical)
        cells[cells.length - 1].label = last.lines.slice(0, typical).join(" ").trim();
    }
    return cells;
  }

  // WHICH MONTHS COULD THIS BE? The first number falls on the weekday its column
  // names, and if the grid runs over into the next month it also says how long
  // this one is. For a real booklet the two together left exactly one answer.
  function gridMonths(grid, year) {
    const y = Number(year) || new Date().getFullYear();
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const first = grid.cells[0].day;
      if (first > daysInMonth(y, m)) continue;
      if (new Date(Date.UTC(y, m - 1, first)).getUTCDay() !== grid.startDow) continue;
      if (grid.monthLen && daysInMonth(y, m) !== grid.monthLen) continue;
      out.push(m);
    }
    return out;
  }

  // The squares as rows, in the shape everything downstream already reads.
  function gridRows(grid, year, month) {
    let y = Number(year) || new Date().getFullYear();
    let m = Number(month) || 1;
    const cells = gridCells(grid);
    return cells.map((c, i) => {
      if (i && c.day < cells[i - 1].day) { m++; if (m > 12) { m = 1; y++; } }
      return {
        date: iso(y, m, c.day),
        endsOn: "",
        label: c.label || "(no name)",
        line: `${c.day} ${c.label}`.trim(),
        // The year was never on the square, and neither was the month — both are
        // worked out, and both are on screen and changeable.
        yearAssumed: true,
        fromGrid: true,
        kind: "",
      };
    });
  }

  // EVERY LINE WITH A DATE IN IT. Lines without one are headings, page numbers
  // or notes, and are left alone rather than guessed at.
  function read(text, opts) {
    const o = opts || {};
    const all = String(text || "");
    // A TERM DRAWN AS A GRID KNOWS THINGS THE PROSE DOESN'T, and the first of
    // them is the year: it walks from September to January, so it can say which
    // side of New Year each month is on, and its own first column pins the year
    // itself. Read before anything else, because everything below leans on it.
    const wg = weekGridIn(all);
    // Yours if you said one, then what the grid works out, then the year the
    // document says most often, then this one.
    const fromDoc = docYear(all);
    const fromGrid = wg ? weekGridYears(wg, Number(o.year) || fromDoc || new Date().getFullYear())[0] || 0 : 0;
    const useYear = Number(o.year) || fromGrid || fromDoc || new Date().getFullYear();
    // Which year each month belongs to, according to the grid. Empty when there
    // isn't one, and then nothing below changes.
    const gridMonthYear = wg ? weekGridMonths(wg, useYear) : new Map();
    const rows = [];
    all
      .split(LINE_BREAKS)
      .forEach((raw) => {
        const line = raw.replace(/\u00a0/g, " ").trim();
        if (!line) return;
        const d = dateIn(line, useYear);
        if (!d) return;
        const range = rangeIn(line, useYear);
        rows.push({
          date: d,
          // Both ends, when the line itself gave both — see rangeIn. Nothing is
          // paired across lines here; that stays a decision you tick.
          endsOn: range && range.to > range.from ? range.to : "",
          label: labelOf(line, d, useYear) || "(no name)",
          line,
          // Whether the year came off the line itself or was borrowed. Shown,
          // because a borrowed year is the one thing here that can be quietly
          // wrong by exactly twelve months.
          yearAssumed: !hasYearOnIt(line),
          // NOTHING IS GUESSED. What this date means to the app is a decision,
          // and the words are not evidence — "break" could be a week off or a
          // week of INSET. Starts as nothing and you choose.
          kind: "",
        });
      });
    // AND THE GRID SETTLES THE YEARS. A line that didn't write its own year, in a
    // month the grid walked through, gets the year the grid was in when it got
    // there — so the September deadlines are this year and the January ones are
    // next, with nothing assumed about when a school year starts. It is read off
    // the page, by a table that crossed the New Year in front of us.
    if (gridMonthYear.size)
      rows.forEach((r) => {
        if (!r.yearAssumed) return;
        const want = gridMonthYear.get(Number(r.date.slice(5, 7)));
        if (!want) return;
        const moved = atYear(r.date, want);
        if (!moved) return;
        r.date = moved;
        if (r.endsOn) {
          const endWant = gridMonthYear.get(Number(r.endsOn.slice(5, 7))) || want;
          r.endsOn = atYear(r.endsOn, endWant) || r.endsOn;
        }
        r.yearFromGrid = true;
      });
    // AND THE SAME DOCUMENT MAY ALSO HOLD A MONTH DRAWN AS A GRID, which has no
    // dates on it anywhere and so contributed nothing at all above.
    const grid = gridIn(all);
    let month = 0;
    let months = [];
    if (grid) {
      months = gridMonths(grid, useYear);
      // WHAT THE DOCUMENT ITSELF SAYS BEATS WHAT THE GRID IMPLIES. A booklet
      // whose next page writes "26th August" has answered the question, and the
      // shape of the grid was only ever going to narrow it.
      //
      // In order: what you picked; a month the document names that the grid also
      // allows; what the grid allows; and last a month the document names that
      // the grid does NOT allow — which happens when the first square turns out
      // not to be in the first column, the one thing here that is assumed and
      // cannot be checked.
      const inDoc = rows.map((r) => Number(r.date.slice(5, 7)));
      month = Number(o.month) || inDoc.find((m) => months.indexOf(m) >= 0) ||
        months[0] || inDoc[0] || 0;
      if (month) rows.push(...gridRows(grid, useYear, month));
    }
    // Two entries for the same day is a calendar listing it twice, not two
    // events; the later line wins because it is usually the more specific one.
    //
    // EXCEPT WHEN NEITHER OF THEM HAS A NAME. Two lines the reader couldn't put
    // a name to are not evidence of anything, and on a document where a year had
    // to be borrowed they land on the same day for that reason alone — "Aug. 31"
    // at the top of a calendar and "Aug. 31, 2027" at the bottom of it are the
    // first day of this school year and the last day of the next, and one of
    // them was quietly disappearing. Where there is nothing to compare, the line
    // they came off is kept apart.
    const byDate = new Map();
    rows.forEach((r) => byDate.set(
      r.date + "|" + r.label.toLowerCase() + (r.label === "(no name)" ? "|" + r.line : ""), r));
    let out = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    // AND A DAY THE READER COULDN'T NAME IS NOT A SECOND ENTRY FOR THAT DAY. A
    // booklet that draws August as a grid and then writes "26th August" over its
    // detailed page gives that day twice: once as "All-Staff Orientation" and
    // once as a bare heading with nothing to call it. Both kept, you label the
    // same day twice.
    const named = new Set(out.filter((r) => r.label !== "(no name)").map((r) => r.date));
    out = out.filter((r) => r.label !== "(no name)" || !named.has(r.date));
    return {
      rows: out,
      read: rows.length,
      year: useYear,
      yearFromDoc: fromDoc || 0,
      // Every year the document names.
      years: docYears(all),
      // AND WHETHER IT LOOKS LIKE IT STRADDLES ONE. Naming two years is not
      // enough on its own — a booklet for the 2026-27 school year says so on its
      // cover and then talks only about August. The symptom of a document that
      // really crosses a New Year is that, once one year is filled in for the
      // lines that didn't say one, those lines spread out to fill it: December
      // and January, sixteen days apart in life, land eleven months apart here.
      // So the tell is the SPREAD of what was read, not what the cover says.
      // A row the grid dated is not one of the ones with no answer.
      twoYears: docYears(all).length > 1 &&
        straddles(out.filter((r) => r.yearAssumed && !r.yearFromGrid)),
      // How many rows are leaning on a year that wasn't on their own line. Not
      // the grid's — those have a sentence of their own, about the month.
      borrowed: out.filter((r) => r.yearAssumed && !r.fromGrid).length,
      // The grid, if there was one: how many squares it had, which months it
      // could be, which one was taken, and how many squares lost their number
      // on the way out of the PDF.
      grid: grid
        ? { squares: grid.cells.length, months, month, missing: grid.missing }
        : null,
      // AND THE TERM GRID, WHICH IS A DIFFERENT ANIMAL: what weeks it covers,
      // where it starts and stops, and the days it has marked — which are the
      // meetings, and the only place in the document they appear.
      term: wg
        ? {
            weeks: wg.weeks.length,
            from: iso(useYear + wg.from.rolls, wg.from.month, wg.from.day),
            to: iso(useYear + wg.to.rolls, wg.to.month, wg.to.day),
            years: weekGridYears(wg, useYear),
            marks: weekGridMarks(wg, useYear).filter((m) => m.dates.length > 1),
          }
        : null,
    };
  }

  // WHAT THE CHOICES MEAN, in the app's own terms:
  //
  //   "off"     — a day you want nothing planned into.
  //   "noLessons" — a working day with no teaching in it. The break, the INSET
  //                 day, the staff-only week: you can work, there is no class.
  //   "lessons" — the day the teaching starts. Not a day of its own: it is the
  //               answer to "when does the timetable begin", which is the one
  //               thing a calendar knows and a timetable doesn't.
  //   ""        — ignore this line.
  //
  // THAT THIRD ONE IS THE ONE THAT MATTERS MOST. Staff go back before the
  // students do. A timetable typed in with no dates on it runs from the day you
  // typed it until the end of time — through the set-up week, through the
  // holidays, through next July — and the app will believe in lessons that
  // don't exist. "Students return" is the line that fixes it, and it is sitting
  // right there on the calendar you already pasted in.
  //
  // A RANGE IS SAID, NOT INFERRED. A holiday is written as two lines — begins,
  // ends — and pairing them automatically looked obvious until a calendar with
  // an INSET day before the break married the INSET day to the start of it and
  // wrote off seven weeks. Two same-kind rows in a row are not two ends of one
  // thing; often they are simply two things. So a row that runs on to the next
  // one says so, with a tick.
  //
  // WHAT EACH ROW WILL ACTUALLY COVER. Worked out once, here, so that the
  // preview on screen and the days that get kept cannot say different things —
  // the alternative is two copies of this rule drifting apart, and the one you
  // read is the one that isn't running.
  function plan(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.date && r.kind);
    const out = [];
    let i = 0;
    while (i < list.length) {
      const r = list[i];
      // The next row THAT COUNTS. A line you left as "ignore" isn't there, so a
      // tick can't quietly reach past it — which is why the tick shows you the
      // date it lands on rather than just saying "runs on".
      const next = list[i + 1];
      // Could this row run on at all? Asked separately from whether it does,
      // so that the page offers the tick on exactly the rows where ticking it
      // would change something — a tick that does nothing when pressed is
      // worse than no tick.
      // A line that carried BOTH ENDS ITSELF needs no tick and takes no second
      // row with it — "1-7 October" is one line and one holiday. Only the
      // pairing of two separate lines is a decision, because only that one is a
      // guess.
      const ownEnd = r.endsOn && r.endsOn > r.date ? r.endsOn : "";
      const canSpan = !ownEnd && !!next && next.date > r.date;
      const ranged = !!ownEnd || (!!r.spans && canSpan);
      const to = ownEnd || (ranged ? next.date : r.date);
      out.push({
        row: r,
        endRow: ownEnd ? null : ranged ? next : null,
        ranged,
        canSpan,
        // Where it would land, and how far, if you ticked it.
        wouldEnd: canSpan ? next.date : "",
        wouldBe: canSpan ? span(r.date, next.date) : 0,
        from: r.date,
        to,
        days: span(r.date, to),
        kind: r.kind,
        // "Winter break begins" covering the whole break shouldn't still say
        // begins on every one of those days.
        label: ranged
          ? r.label.replace(/\s*(begins?|starts?)\s*$/i, "").trim() || r.label
          : r.label,
      });
      i += ownEnd ? 1 : ranged ? 2 : 1;
    }
    return out;
  }

  // Days from one date to another, inclusive, capped — a mistyped year should
  // cost you a wrong preview, not ten thousand entries.
  const CAP = 400;
  function span(from, to) {
    let n = 0;
    for (let d = from; d <= to && n < CAP; d = addDays(d, 1)) n++;
    return n;
  }

  // WHEN THE LESSONS RUN. A "lessons" row on its own says when they start; with
  // the run-on ticked it says when they stop as well. Returned rather than
  // applied, because which of your timetable entries are lessons is not
  // something a calendar can know — the page asks.
  function term(rows) {
    const p = plan(rows).find((x) => x.kind === "lessons");
    if (!p) return null;
    return { from: p.from, to: p.ranged ? p.to : "", label: p.label };
  }

  function toBlocks(rows) {
    const out = [];
    // A "lessons" row is a marker, not a day — it changes when the timetable
    // applies, and putting a block on that date would be inventing an event.
    plan(rows).filter((p) => p.kind !== "lessons").forEach((p) => {
      for (let d = p.from, n = 0; n < p.days; d = addDays(d, 1), n++) {
        out.push({
          label: p.label,
          start: "00:00",
          end: "23:59",
          date: d,
          days: [],
          blocksDay: p.kind === "off",
          noLessons: p.kind === "noLessons",
          soft: false,
          source: "paste",
        });
      }
    });
    return out;
  }

  const addDays = (isoDate, n) => {
    const d = new Date(isoDate + "T12:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Plain words for the preview. Counts, and what is still undecided — and the
  // number of DAYS, because "3 dates said what they are" hides the difference
  // between three afternoons and half a term.
  // `day` writes a date the way the page writes dates elsewhere. Passed in
  // rather than done here, because how a date reads is the page's business and
  // a module that picked one would fight it.
  const MONTH_WORDS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function words(r, chosen, day) {
    const d = typeof day === "function" ? day : (x) => x;
    // A GRID WITH NO MONTH ON IT IS A QUESTION, NOT A FAILURE. Said even when
    // nothing else was read, because "no dates found" would be the wrong answer
    // to a page that is nothing but dates.
    const g = r.grid;
    if (g && !g.month)
      return "There's a month drawn as a grid in there, and nothing in the document says which month it is. " +
        "Pick one and its days will go in.";
    if (!r.rows.length) return "No dates found in that. Anything without a date on the line is left alone.";
    const list = chosen || r.rows;
    const decided = list.filter((x) => x.kind).length;
    // SAID FIRST, because a year that is quietly wrong makes every other number
    // here wrong too, and nothing else on the row would show it.
    // A DOCUMENT WITH TWO YEARS IN IT HAS NO RIGHT ANSWER, and the important
    // thing is that this is said rather than settled. A first-semester calendar
    // runs from one September to the next January; whichever year is filled in
    // for the lines that don't say one, the other end of it comes out twelve
    // months out, looking exactly as reasonable as the rest.
    const two = r.twoYears && r.borrowed
      ? `This mentions ${r.years.slice(0, 3).join(" and ")}` +
        `${r.years.length > 3 ? " among others" : ""}, so no single year is right for all of it — ` +
        `move any row that's on the wrong side of New Year. `
      : "";
    let y = r.borrowed
      ? `${r.borrowed} of them had no year on the line — read as ${r.year}. ` +
        (two || "Change the year if that's not right. ")
      : "";
    // A TERM DRAWN AS A GRID answers the year question by walking through it, so
    // it is said instead of the guessing above rather than as well as.
    if (r.term)
      y = `The term is drawn out as a grid too — ${r.term.weeks} weeks, ` +
        `${d(r.term.from)} to ${d(r.term.to)}, which is where the years came from. ` +
        (r.term.marks.length
          ? `${r.term.marks.length} thing${r.term.marks.length === 1 ? " is" : "s are"} marked on it; ` +
            "they're under the dates below. "
          : "") + y;
    if (g)
      y = `${g.squares} of them came off a month drawn as a grid, which says no month anywhere — ` +
        `read as ${MONTH_WORDS[g.month - 1]} ${r.year}. Change it if that's wrong. ` +
        (g.missing
          ? `${g.missing} square${g.missing === 1 ? "'s" : "s'"} number didn't survive the PDF, so ` +
            `what was in ${g.missing === 1 ? "it has" : "them has"} ended up on the day before. `
          : "") +
        y;
    if (!decided)
      return y + `${r.rows.length} date${r.rows.length === 1 ? "" : "s"} read. Say what each one is and they'll go in.`;
    const p = plan(list);
    const days = p.filter((x) => x.kind !== "lessons").reduce((n, x) => n + x.days, 0);
    const t = term(list);
    return y + `${r.rows.length} date${r.rows.length === 1 ? "" : "s"} read, ${decided} of them said what they are` +
      (days && days !== decided ? ` — ${days} days in all.` : ".") +
      (t ? ` Lessons run from ${d(t.from)}${t.to ? ` to ${d(t.to)}` : " onwards"}.` : "");
  }

  window.OrganiserCalPlan = {
    dateIn, labelOf, docYear, docYears, atYear, read, plan, span, term, toBlocks, words, addDays,
    gridIn, gridCells, gridMonths, gridRows, MONTHS,
    weekGridIn, weekGridYears, weekGridMonths, weekGridMarks,
  };
})();
