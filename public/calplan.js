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
  function findDate(text, defaultYear, order) {
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
    // 12/18 — TWO NUMBERS AND NO YEAR, which is how half the calendars in the
    // world write a date and how this one wrote its whole winter break. There
    // was no pattern for it at all, so "Winter break 12/18 - 1/4" was not a
    // line with a date on it and the break simply did not exist.
    //
    // WHICH NUMBER IS THE MONTH is the whole difficulty, and it is answered by
    // the document rather than assumed — see slashOrder. Where the document
    // says nothing either way, month-first, because that is what the grid
    // reader in this same file has always taken "9/1" to mean and one file
    // should not read one date two ways.
    // AND A SQUARE OF A GRID IS NOT AN ENTRY. A wall calendar writes the first
    // of a new month into its square as "11/1", and read as prose that is a
    // dated line with nothing on it — so a term grid quietly grew a row for the
    // first of every month it crossed, each one called "(no name)". A line with
    // no letters anywhere in it is a square; an entry says what it is.
    m = /[A-Za-z]/.test(s) ? s.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\s*[-/.]\s*\d)/) : null;
    if (m) {
      const a = +m[1], b = +m[2];
      const dayFirst = order === "dmy" || (order !== "mdy" && a > 12 && b <= 12);
      const mo = dayFirst ? b : a;
      const dy = dayFirst ? a : b;
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31)
        return at(m, iso(defaultYear || new Date().getFullYear(), mo, dy));
    }
    return { iso: "", text: "" };
  }

  // WHICH NUMBER IS THE MONTH, ASKED OF THE WHOLE DOCUMENT.
  //
  // "12/18" is the eighteenth of December or the twelfth of June and nothing in
  // those five characters says which. But a calendar is not one date: it is
  // thirty, and among thirty there is nearly always one that settles it — a
  // first number over twelve can only be a day, a second number over twelve can
  // only be a day, and one of those decides the lot.
  //
  // Only where the document says nothing at all does anything get assumed, and
  // then it is month-first, because that is what the grid reader in this same
  // file has always taken "9/1" to mean.
  function slashOrder(text) {
    let dmy = 0;
    let mdy = 0;
    for (const m of String(text || "").matchAll(/\b(\d{1,2})\/(\d{1,2})\b(?!\s*[-/.]\s*\d)/g)) {
      const a = +m[1], b = +m[2];
      if (a > 12 && b <= 12) dmy++;
      else if (b > 12 && a <= 12) mdy++;
    }
    return dmy && !mdy ? "dmy" : mdy && !dmy ? "mdy" : "";
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
  // A TILDE IS A DASH. "First Semester: Sep. 1, 2026 ~ Jan. 22, 2027" is how a
  // great many calendars write a span, and read without it the line becomes two
  // entries — a semester that starts and a separate one that ends — instead of
  // one that runs. It is punctuation, not vocabulary: no word of any language is
  // being recognised here, only the mark between two dates.
  const DASH = "[-–—~〜～]|\\bto\\b|\\buntil\\b";
  // A WEEKDAY NAME IN FRONT OF A DATE IS DECORATION. "Monday 25 October 2027 -
  // Friday 29 October 2027" is the commonest way a half term is written down,
  // and every pattern below expects a number after the dash — so it found the
  // start, hit "Friday", and handed back a one-day half term. Worse, "Monday 25
  // - Friday 29 October" came back as the 29th: the END read as the whole of it.
  //
  // Taken out before the shapes are tried, because "Monday 25 October" and "25
  // October" are the same date and only one of them has to be understood twice.
  // Asked of timetable.js, which is where "is this word a weekday" lives.
  function noDayNames(s) {
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.dayOf !== "function") return s;
    return String(s || "").replace(/\b([A-Za-z]{3,9})\.?,?\s+(?=\d)/g,
      (whole, word) => (T.dayOf(word) >= 0 ? " " : whole));
  }

  function rangeIn(text, defaultYear, order) {
    const s = noDayNames(text);
    // 12/18 - 1/4 — two numbers each side and no year anywhere, which is how a
    // winter break gets written and the one time of year a range CROSSES a New
    // Year. Read without that in mind it ends four months before it starts.
    {
      const two = /\b(\d{1,2})\/(\d{1,2})\s*(?:[-–—]|\bto\b)\s*(\d{1,2})\/(\d{1,2})\b(?!\s*[-/.]\s*\d)/.exec(s);
      if (two) {
        const dayFirst = order === "dmy";
        const pick = (a, b) => (dayFirst ? { mo: +b, dy: +a } : { mo: +a, dy: +b });
        const A = pick(two[1], two[2]);
        const B = pick(two[3], two[4]);
        const y = defaultYear || new Date().getFullYear();
        if (A.mo >= 1 && A.mo <= 12 && B.mo >= 1 && B.mo <= 12 && A.dy <= 31 && B.dy <= 31) {
          const from = iso(y, A.mo, A.dy);
          const to = iso(B.mo < A.mo ? y + 1 : y, B.mo, B.dy);
          return { from, to, text: two[0] };
        }
      }
    }
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
      // ANCHORED TO THE START, NOT THE END.
      //
      // With no year written on either side, the year the document is about
      // belongs to the day the span STARTS on: "Winter Recess 21 Dec - 1 Jan"
      // in a calendar for 2026 is that December and the January after it. Hung
      // on the end instead, the break moved to the December BEFORE the school
      // year began — twelve months out, in the direction nobody would check.
      // Where the end carries its own year there is nothing to guess: the start
      // is the year before it.
      const yStart = m[3] ? Number(m[3])
        : m[6] ? (month(m[5]) < month(m[2]) ? yEnd - 1 : yEnd)
        : defaultYear;
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
      // Anchored to the start — see above.
      const yStart = m[3] ? Number(m[3])
        : m[6] ? (month(m[4]) < month(m[1]) ? yEnd - 1 : yEnd)
        : defaultYear;
      return {
        from: iso(yStart, month(m[1]) + 1, +m[2]),
        to: iso(m[6] ? yEnd : month(m[4]) < month(m[1]) ? yStart + 1 : yStart, month(m[4]) + 1, +m[5]),
        text: m[0],
      };
    }
    return null;
  }

  function dateIn(text, defaultYear, order) {
    const r = rangeIn(text, defaultYear);
    if (r && r.to > r.from) return r.from;
    return findDate(text, defaultYear, order).iso;
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
  // EVERY OTHER DATE THE LINE NAMES.
  //
  // A line was one date, and the rest of what it said went nowhere. A school
  // calendar puts the important part in the second half constantly:
  //
  //   "National Day: Oct. 1 - Oct. 7 (Sep. 20 is a working day, even week
  //    Tuesday schedule; Oct. 10 is a working day, even week Wednesday
  //    schedule)"
  //
  // — a week off, and buried in the brackets after it, the TWO SATURDAYS AND
  // SUNDAYS YOU ARE WORKING to pay for it. Those are the days a teacher would
  // most want warning of, they were read, and they were thrown away because the
  // line had already produced its row.
  //
  //   "Score input: Midterm Nov. 17 16:00 Final Jan. 15 16:00" is the same
  //   shape: two deadlines, one kept.
  //
  // NOTHING HERE KNOWS WHAT A WORKING DAY IS. It finds a date, takes the words
  // around it as the name, and — where a weekday is named beside a date that is
  // NOT that weekday — fills in which day it stands in for, because that is
  // what "the 20th, Tuesday schedule" is saying and the app already has
  // somewhere to put it. The row still arrives undecided like every other one.
  // AND WHAT THE EXTRA DATES ON A LINE ARE CALLED.
  //
  // "Final" is a perfect name inside the line it came from and a useless one in
  // a list of things to do a month later — which is exactly where a deadline
  // ends up. What the entries on one line SHARE is its subject, so the subject
  // goes back in front: "Score Input & Report Confirm — Final", "National Day —
  // is a working day, even week Tuesday schedule", which says which holiday
  // that Sunday is paying for.
  //
  // ONE RULE, TWO READERS. This reader takes the subject off the head of the
  // line; the model hands back a row whose label IS the subject. Both then name
  // the extra days the same way, because they call the same thing — and when
  // this lived inside read() only, the model's path produced rows called "is a
  // working day, even week Tuesday schedule" with no notion of what for.
  function underStem(stem, rows) {
    if (!stem) return rows || [];
    (rows || []).forEach((x) => {
      // A CLAUSE THAT IS NOTHING BUT A DATE TAKES THE SUBJECT WHOLE.
      //
      // "Professional Development (PD) Days for Teachers: Oct. 16, Nov. 13" is
      // two training days, and the second came out called "(no name)" — the one
      // row on the page with nothing at all to recognise it by was the one this
      // skipped, for want of a name of its own to put the subject in front of.
      // It does not need one: the subject IS its name.
      // AND A CLAUSE THAT IS A DATE AND A CLOCK. "Reports Due: 6 Nov 16:00; 26
      // Mar 16:00" leaves the second clause with nothing in it but the four
      // o'clock — which is kept as a name where there is nothing else at all
      // (see labelOf) and is not a name when the subject is right there. It
      // came out "Reports Due — 16:00", with the deadline's own time sitting in
      // its title, on every deadline after the first.
      if (!x.label || x.label === "(no name)" || !hasWords(x.label)) { x.label = stem; return; }
      if (x.label.toLowerCase().indexOf(stem.toLowerCase()) === 0) return;
      x.label = `${stem} — ${x.label}`.slice(0, 120);
    });
    return rows || [];
  }

  // A school calendar writes the subject in front of a colon — "Score Input &
  // Report Confirm: Midterm … Final" — so that is what comes off the head of a
  // line. Where there is no colon, the head is the subject.
  function subjectOf(head) {
    const bits = String(head || "").split(":");
    return (bits.length > 1 ? bits.slice(0, -1).join(":") : String(head || "")).trim();
  }

  function alsoOn(line, taken, useYear, order, after) {
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    let rest = noDayNames(line);
    // THE FIRST OCCURRENCE, NOT EVERY ONE. Blanking "Oct. 1" everywhere also
    // blanks the front of "Oct. 10", so the second make-up day in the brackets
    // — the whole reason this exists — was cut in half and never found.
    //
    // AND BLANKED TO THE SAME LENGTH. Replacing a date with a shorter marker
    // shifts every position after it, and the positions are what tell the row
    // this line already made where its own name stops — so the holiday came
    // back called "National Day: Oct." with the sentence cut mid-word.
    const gone = (n) => "•".repeat(n);
    const CLOCK = /^\s*(\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)/i;
    // AND THE CLOCK THAT BELONGS TO IT. The row this line already made took its
    // date; its FOUR O'CLOCK is still sitting there, between that date and the
    // next one, and the next one's name is everything since the last date — so
    // "Midterm Nov. 17 16:00 Final Jan. 15 16:00" gave the January deadline the
    // name "16:00 Final": the first deadline's time in the second one's name.
    // A COMMA BETWEEN TWO DATES DIVIDES THEM; A COMMA INSIDE ANYTHING DOES NOT.
    //
    // A calendar separates its dates with a comma at least as often as with a
    // semicolon, and the comma was not a separator at all. So "Parent
    // Conferences: 21 Nov, 12 Mar, 14 May" gave March the name "Parent
    // Conferences — , , 14 May", and "Sports Day 14 May, Speech Day 21 May,
    // Prize Giving 4 Jun" gave the Speech Day row "Sports Day — Speech Day ,
    // Prize Giving": its own name, the next one's, and the first one's subject,
    // all in one line on somebody's calendar.
    //
    // BUT A COMMA IS ALSO ORDINARY PUNCTUATION. "Grades 9, 10 and 11 Meeting"
    // is one name with two of them in it and "November 21, 2026" is one date
    // with one, so cutting on every comma trades one fault for another.
    //
    // THE TEST IS A DATE ON BOTH SIDES OF IT, and not being inside one. Every
    // date on the line is found first, with where it sits, because that is what
    // the test needs and because a comma inside a date — the American way of
    // writing one, and the way a range is often written — must be left exactly
    // where it is. Asked before anything is blanked, for the same reason: the
    // blanking is what would erase the evidence.
    //
    // Marked in the same character every other separator is blanked to, and in
    // one character so that nothing after it moves — the positions are what tell
    // the row this line already made where its own name stops.
    {
      const spans = [];
      let scan = rest;
      for (let n = 0; n < 12; n++) {
        const f = findDate(scan, useYear, order);
        const i = f && f.text ? scan.indexOf(f.text) : -1;
        if (i < 0) break;
        spans.push([i, i + f.text.length]);
        scan = scan.slice(0, i) + gone(f.text.length) + scan.slice(i + f.text.length);
      }
      // AND EACH SIDE IS ONLY AS FAR AS THE NEXT SEPARATOR OF ANY KIND. Looked
      // at as far as the next COMMA, the aside in "National Day: Oct. 1 - Oct.
      // 7 (Sep. 20 is a working day, even week Tuesday schedule; Oct. 10 is a
      // working day…)" found a date on both sides of its comma — one of them
      // past a semicolon, in the NEXT aside — and cut the sentence in half, so
      // the make-up day lost the weekday it stands in for.
      const HARD = /[;,()\[\]•]/;
      const bound = (i, step) => {
        for (let j = i + step; j >= 0 && j < rest.length; j += step)
          if (HARD.test(rest[j])) return j;
        return step < 0 ? -1 : rest.length;
      };
      const cut = new Set();
      for (let i = rest.indexOf(","); i >= 0; i = rest.indexOf(",", i + 1)) {
        if (spans.some(([a, b]) => i > a && i < b)) continue;
        const lo = bound(i, -1), hi = bound(i, 1);
        if (spans.some(([a, b]) => a > lo && b <= i) && spans.some(([a, b]) => a >= i && b <= hi))
          cut.add(i);
      }
      if (cut.size)
        rest = rest.replace(/,/g, (m, i) => (cut.has(i) ? "•" : ","));
    }
    (taken || []).forEach((t) => {
      const at = t ? rest.indexOf(t) : -1;
      if (at < 0) return;
      const after = CLOCK.exec(rest.slice(at + t.length));
      const n = t.length + (after ? after[0].length : 0);
      rest = rest.slice(0, at) + gone(n) + rest.slice(at + n);
    });
    const out = [];
    let was = after || "";
    // Six is a line that is really a paragraph; past that the words around each
    // date stop being a name and the row stops being worth offering.
    for (let n = 0; n < 6; n++) {
      const range = rangeIn(rest, useYear, order);
      const ranged = range && range.to > range.from;
      const found = ranged ? range : findDate(rest, useYear, order);
      const date = ranged ? range.from : found.iso;
      if (!date || !found.text) break;
      // The date this line named last, so a jump backwards can be seen.
      const at = rest.indexOf(found.text);
      // THE CLOCK THAT BELONGS TO THIS DATE GOES WITH IT.
      //
      // "Midterm Nov. 17 16:00 Final Jan. 15 16:00" — the first entry's four
      // o'clock sits between the two, so the second one's name was read as
      // everything since the last date and came out "16:00 Final": the first
      // deadline's time, in the second deadline's name.
      const ranAt = at + found.text.length;
      const clock = CLOCK.exec(rest.slice(ranAt));
      // THE CLAUSE IT SITS IN is its name. A calendar separates these with a
      // semicolon or a bracket far more often than with a full stop, and where
      // it separates them with nothing the whole remainder is the honest
      // answer — the words are the document's, not this app's.
      const CUT = /[;()\[\]•]|\.\s/;
      const before = rest.slice(0, at).split(CUT).pop();
      const after = (clock ? clock[0] : "") +
        rest.slice(ranAt + (clock ? clock[0].length : 0)).split(CUT)[0];
      const clause = `${before} ${after}`;
      // AND THE FALL-BACK KEEPS THE WORDS AND NOT THE DATES. Where labelOf
      // trimmed away everything, this took the clause as written — which on a
      // cell whose dates are divided by nothing but spaces meant the NEXT
      // date, whole, as the name of this one: "All staff — 6 Nov". See
      // dropDates.
      const label = labelOf(clause, date, useYear, order) ||
        dropDates(`${before} ${after}`, useYear, order).replace(/\s+/g, " ").trim();
      // AND WHICH DAY IT STANDS IN FOR, when the clause names a weekday that is
      // not the one the date falls on. Same weekday means the words are only
      // naming the date and say nothing more.
      let runsAsDay;
      if (T && typeof T.dayOf === "function") {
        const own = new Date(date + "T12:00:00").getDay();
        clause.split(/[^A-Za-z]+/).some((w) => {
          const d = T.dayOf(w);
          if (d < 0 || d === own) return false;
          runsAsDay = d;
          return true;
        });
      }
      const t = timeOnLine(clause);
      // A DATE LISTED AFTER A LATER ONE HAS CROSSED A NEW YEAR.
      //
      // "Midterm Nov. 17 16:00 Final Jan. 15 16:00" is this November and next
      // January, and the January one came out 2026 — eleven months before the
      // midterm it is the sequel to, on a line that plainly puts them in order.
      // A first-semester calendar is full of these: the papers go in in
      // November, the reports out in January.
      //
      // NOT MERELY EARLIER. "Oct. 1 - Oct. 7 (Sep. 20 …)" names a day eleven
      // days before, and that is a make-up day, not next year. Only a jump
      // BACKWARDS OF MONTHS is a New Year, and only where the line did not
      // write the year itself.
      const BACK = 150;
      let fixed = date;
      let rolled = false;
      if (was && !hasYearOnIt(clause) && date < was &&
          (new Date(was + "T12:00:00") - new Date(date + "T12:00:00")) / 86400000 > BACK) {
        const up = atYear(date, Number(date.slice(0, 4)) + 1);
        if (up) { fixed = up; rolled = true; }
      }
      was = fixed;
      out.push({
        date: fixed,
        // Said on the row, because a year the app worked out and a year the
        // document wrote should not look the same.
        ...(rolled ? { yearRolled: true } : {}),
        endsOn: ranged && !rolled ? range.to : "",
        endFrom: ranged ? "line" : "",
        label: label || "(no name)",
        ...(t ? { start: t.start, end: t.end } : {}),
        ...(runsAsDay === undefined ? {} : { runsAsDay }),
        line,
        yearAssumed: !hasYearOnIt(clause),
        kind: "",
        // Where it came from, so the page can say that this row and the one
        // above it were the same line of the document — and where in the line
        // its clause began, so the row that line already made can stop calling
        // itself by words that now belong to this one.
        alsoOn: true,
        clauseAt: Math.max(0, at - String(before).length),

      });
      const took = found.text.length + (clock ? clock[0].length : 0);
      rest = rest.slice(0, at) + gone(took) + rest.slice(at + took);
    }
    return out;
  }

  // EVERY DATE A PIECE OF TEXT CARRIES, TAKEN OUT OF IT.
  //
  // A DATE IS NEVER PART OF A NAME. Only the date a row had taken was removed,
  // so a table cell holding a term's worth of one meeting — "18 Sep; 9 Oct; 6
  // Nov; 4 Dec; 8 Jan" — came out called "; 9 Oct; 6 Nov; 4 Dec; 8 Jan": four
  // more dates sitting in the name of the first. Untidy is the least of it.
  // Leftovers with month names in them LOOK like a name, so the line was taken
  // to have named itself and never asked the cell above it what it was.
  //
  // Asked in one place because two asked it — what a row is called, and what
  // the clause an extra date sits in is called — and the second was answering
  // it with the raw words, dates and all.
  function dropDates(text, defaultYear, order) {
    let s = String(text || "");
    for (let n = 0; n < 8; n++) {
      const more = findDate(s, defaultYear, order);
      if (!more || !more.text || s.indexOf(more.text) < 0) break;
      s = s.replace(more.text, " ");
    }
    return s;
  }

  function labelOf(line, isoDate, defaultYear, order) {
    // THE SAME LINE THE DATE WAS READ OFF. The readers take the weekday names
    // out before they look — "Monday 25 October" is the 25th of October — so
    // the words they hand back to be removed are the words of the stripped
    // line. Taken off the original, nothing matched and the whole date stayed
    // in the name: "Half term Monday 25 October 2027 - Friday 29 October 2027".
    //
    // And a weekday belongs to the date rather than the name in any case. The
    // date says which day of the week it is; the name is what happens on it.
    const raw = noDayNames(line);
    const range = rangeIn(raw, defaultYear, order);
    const found = range && range.to > range.from ? range : findDate(raw, defaultYear, order);
    let s = dropDates(found.text ? raw.replace(found.text, " ") : raw, defaultYear, order);
    // The time belongs to the block, not to what it is called — see timeOnLine.
    //
    // UNLESS IT IS ALL THERE IS. "Nov. 2 16:00" is a paper deadline at four in
    // the afternoon and the four o'clock is the whole of what distinguishes it;
    // taking it out leaves a row called nothing at all. A name it can be read
    // by beats a tidy one it hasn't got.
    const clock = timeOnLine(s);
    if (clock && clock.text) {
      const without = s.replace(clock.text, " ");
      if (/[A-Za-z]/.test(without)) s = without;
    }
    // Any trailing year the pattern left behind — "…25 August" then "2026" as
    // its own word — is part of the date, not part of the name.
    s = s
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/[\t|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–—:•*,]+|[\s\-–—:•*,]+$/g, "")
      .trim();
    return s.slice(0, 80);
  }

  // AND WHAT TIME IT IS AT.
  //
  // A school calendar is full of timed things — a parents' evening at 6:30, a
  // concert at 7, a photo at 10:15, a trip that leaves at 8:15 — and not one of
  // them was kept. Every row became a block from midnight to midnight, so the
  // app knew you had something on the 12th and not that it was in the evening.
  // The time was even read, in the sense that it stayed in the NAME: "Parents'
  // evening , 6:30pm - 8:30pm". Words on screen, nothing the app could use.
  //
  // A RANGE, or a lone time announced by "at" or ending the line. Not any time
  // anywhere: "back by 3:30" in the middle of a sentence is somebody mentioning
  // a time, which is the same rule timetable.js draws for its own lines. How a
  // clock time is READ stays in timetable.js — there is one answer to that.
  function timeOnLine(line) {
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.spanIn !== "function") return null;
    const s = String(line || "");
    const span = T.spanIn(s);
    if (span) {
      const m = new RegExp(
        `\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?\\s*(?:${DASH})\\s*\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?`, "i").exec(s);
      return { start: span.start, end: span.end, text: m ? m[0] : "" };
    }
    const one = /\bat\s+(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i.exec(s) ||
      /(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\s*$/i.exec(s);
    if (!one) return null;
    const start = T.timeOf(one[1].replace(/\s+/g, ""));
    return start ? { start, end: "", text: one[0] } : null;
  }

  // A LINE THAT SAYS "EVERY FRIDAY" IS NOT A DAY, IT IS A RULE.
  //
  // "Staff meeting every Friday, 3:30-4:30" is on most school calendars and it
  // got no row at all — no date on it, so nothing to read, so nothing offered.
  // A whole standing commitment, printed on the calendar, invisible to the app.
  //
  // THE TELL IS THAT IT NAMES DAYS AND NO DATE. A line with a date is one day,
  // whatever weekday it happens to fall on: "Friday 25 October" is the 25th.
  // A line with weekday names and no date at all is either a rule or a heading,
  // and what separates those two is that a rule SAYS SO — "every", "each",
  // "weekly", or the day said in the plural. "Friday" on its own is a heading
  // and stays one; guessing otherwise would turn every day name in a document
  // into a standing appointment.
  const SAYS_EVERY = /\b(?:every|each|weekly|fortnightly|alternate)\b/i;
  function repeatIn(line) {
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.daysIn !== "function") return null;
    const s = String(line || "");
    const days = T.daysIn(s);
    if (!days.length) return null;
    const plural = (s.match(/\b[A-Za-z]{4,10}s\b/g) || []).some((w) => T.dayOf(w) >= 0);
    if (!SAYS_EVERY.test(s) && !plural) return null;
    return days;
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
  // "10/1" on its own, and "10/1 Holiday" — the same square with what is in it
  // written beside the date. A calendar in Word puts the words in the square;
  // read strictly, the grid stopped dead at the first month it crossed.
  const AS_MONTH_DAY = /^(\d{1,2})\/(\d{1,2})(?:\s+(\S.{0,38}))?$/;
  const A_NUMBER = /^\d{1,2}$/;
  // "7u" — a day with its mark drawn tight against it, which happens whenever
  // the two runs of text end up close enough to read as one.
  // NOT DIGITS AFTER THE NUMBER. Written loosely this splits "10" into a day
  // called 1 with a mark called 0, and the whole grid falls over on the tenth
  // of the month.
  const NUMBER_THEN_MARK = /^(\d{1,2})([^\d\s]{1,2})$/;
  // And the same square written out: the day, a space, and what is in it. Short,
  // because a square holds a note and the page underneath holds paragraphs.
  const DAY_THEN_WORDS = /^(\d{1,2})\s+(\S.{0,38})$/;
  // What the symbols mean is written underneath, and the description is the
  // first thing long enough to be one.
  const A_DESCRIPTION = 5;
  const A_SYMBOL = 2;

  // A GRID, ONE CELL TO A LINE — WHICHEVER WAY IT ARRIVED.
  //
  // Both readers below were written for what a PDF gives back: every square on
  // its own line. A WORD OR EXCEL TABLE PASTES AS TABS — one whole ROW to a
  // line — which is the likeliest way of all for a calendar to arrive, and
  // neither of them could see it. The day names were all on one line, so the
  // header scan never fired, so a pasted calendar was not a calendar at all.
  //
  // A line with no tab in it is left exactly as it was, so the shape that
  // already worked still does.
  function cellLines(text) {
    return String(text || "")
      .split(LINE_BREAKS)
      .flatMap((l) => (l.indexOf("\t") >= 0 ? l.split("\t") : [l]))
      .map((l) => l.replace(/\u00a0/g, " ").trim())
      .filter(Boolean);
  }

  function weekGridIn(text) {
    // Which weekday a word is has one owner, in timetable.js.
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (!T || typeof T.dayOf !== "function") return null;
    const lines = cellLines(text);

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
        if (md[3] && last) last.marks.push(md[3]);
        continue;
      }
      // A SQUARE WITH WORDS IN IT. Out of a PDF a marked day is a number and a
      // symbol; out of the Word document the same calendar came from, it is
      // "4 Ý Staff Mtg" — the day, the symbol AND what it is, in one cell. That
      // is better evidence than the symbol, because it needs no legend at all,
      // and the reader used to stop dead at the first one.
      let n = NaN;
      let extra = "";
      if (A_NUMBER.test(line)) {
        n = +line;
      } else {
        const glued = NUMBER_THEN_MARK.exec(line);
        const rich = glued ? null : DAY_THEN_WORDS.exec(line);
        if (glued) { n = +glued[1]; extra = glued[2]; }
        else if (rich) { n = +rich[1]; extra = rich[2]; }
      }
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
        if (extra && last && week) last.marks.push(extra);
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
      // THE DAYS IN A ROW, GROUPED. Four squares in a row is one thing four days
      // long; four squares scattered over a term is four things. Said as "2
      // days, no day in particular, 20 Sept to 10 Oct" they were indantical, and
      // that sentence reads as "somewhere in those three weeks" about two days
      // the calendar names outright.
      const runs = [];
      dates.forEach((d) => {
        const last = runs[runs.length - 1];
        if (last && addDays(last[1], 1) === d) last[1] = d;
        else runs.push([d, d]);
      });
      return {
        symbol,
        // NAMED BY THE DOCUMENT, one way or the other. A PDF gives a symbol and
        // a legend at the bottom; the Word original of the same calendar puts
        // the words in the square — "4 Ý Staff Mtg" — which needs no legend at
        // all. The leading symbol is dropped from the name because it is not a
        // word: a single character in front of the words is the mark, not part
        // of what the thing is called.
        name: grid.legend[symbol] || String(symbol).replace(/^\S\s+/, "").trim(),
        dates,
        runs,
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
  // A SQUARE IS ITS NUMBER, AND WHAT IS IN IT.
  //
  // This took a number and nothing else, so "1 INSET" — a day with the one thing
  // on it that matters — was not a square at all. The day was skipped, and with
  // it the word that says why it is on the calendar: a month whose INSET day,
  // sports day and two holidays were the entire reason it was printed came out
  // as thirty plain numbers.
  //
  // The term grid learnt this and this one did not, which is the same question
  // answered in two places and only one of them kept up. Returns the day and
  // whatever else the square said.
  const squareIn = (line) => {
    const t = String(line || "").trim();
    let m = /^(\d{1,2})$/.exec(t);
    if (!m) m = /^(\d{1,2})\s+(\S.{0,38})$/.exec(t);
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 31 ? { day: n, words: (m[2] || "").trim() } : null;
  };
  const dayNumber = (line) => {
    const sq = squareIn(line);
    return sq ? sq.day : 0;
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
    const lines = cellLines(text);

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
      const sq = squareIn(lines[i]);
      if (sq) {
        // Whatever was written beside the number is the first thing in the
        // square, not a line under the one before it.
        cur = { day: sq.day, lines: sq.words ? [sq.words] : [] };
        cells.push(cur);
        continue;
      }
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

  // A CELL IS NOT A LINE, AND ITS NAME IS IN THE COLUMN IT CAME FROM.
  //
  // A deadline table —
  //
  //     Paper Submission   Score Input & Report Confirm
  //     Midterm            Nov. 2 16:00    Nov. 17 16:00
  //     Final              Dec. 31 16:00   Jan. 15 16:00
  //
  // comes out of a PDF one cell to a line, so four of the most important dates a
  // teacher has — when papers are in, when marks are in — reached the page
  // called "16:00". The name was not missing from the document. It is a line or
  // two up, where a person reads it without noticing they have, and where this
  // reader was not looking.
  //
  // A COLUMN HAS MORE THAN ONE CELL IN IT, and that is the whole of what says
  // this is a table. Two dates one under another with a name above them is a row
  // of one; ONE date under a line of words is a date under a heading — and
  // taking the heading is how "4th March" comes to be called "Thursday", and a
  // date at the foot of a page comes to be called after the title at the top.
  //
  // So the run of dated lines this one belongs to is found first, and only where
  // there is more than one of them is the line above the run looked at. Nothing
  // further is reached, and a date with nothing to call it stays honestly
  // nameless.
  function nameAbove(lines, at, useYear, order) {
    const none = { name: "", headed: false };
    const cells = cellRun(lines, at, useYear, order);
    if (!cells) return none;
    const prev = tidyLine(lines, cells.lo - 1);
    if (!prev || !hasWords(prev)) return none;
    // AND A WEEKDAY IS NOT A NAME. "Thursday" written over "4th March" is the
    // document saying which day of the week it is — which this app works out for
    // itself and prints on every row anyway. Asked of the whole line, not of the
    // words inside it: "Thursday Assembly" is a name and "Thursday" is not.
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (T && T.dayOf && T.dayOf(prev.replace(/[^A-Za-z]+/g, "")) >= 0) return none;
    const row = labelOf(prev, "", useYear, order);
    // AND THE COLUMN IT IS IN, WHERE THE TABLE HAS HEADINGS.
    //
    // "Midterm" twice and "Final" twice is better than "16:00" four times and
    // it is still the same name on two different days. The document does say
    // which is which — "Paper Submission" and "Score Input & Report Confirm"
    // are written across the top of the table, one to a line, in the order the
    // cells come in. See headingsOver.
    const heads = headingsOver(lines, cells, useYear, order);
    // AND A TITLE IS NOT A ROW LABEL. Where no heading row was found, the line
    // above the run has to have earned its place. A document's own title at the
    // top of a page has nothing above it at all, and handing it to the first two
    // dates on the page names them both after the paperwork — and then, being
    // the same name over the same day, they look like one event written twice.
    //
    // WHAT EARNS IT IS THAT THE SHAPE REPEATS, which is the whole of what makes
    // something a table rather than a heading with dates under it. A row above
    // (a date two lines up) said so, and that is why the first row of a table
    // was refused: nothing is above it but the table's own heading, so
    //
    //     Term blocks / Autumn Recess / 26 Oct / 30 Oct / Spring Recess / …
    //
    // kept "Spring Recess" and lost "Autumn Recess". A row BELOW says the same
    // thing just as well — a label and then its own cells, directly after this
    // row's last one. A title has neither.
    const rowAbove = !!dateIn(tidyLine(lines, cells.lo - 2), useYear, order);
    const below = tidyLine(lines, cells.hi + 1);
    const rowBelow = !!below && !dateIn(below, useYear, order) && hasWords(below) &&
      !!dateIn(tidyLine(lines, cells.hi + 2), useYear, order);
    if (!heads && !rowAbove && !rowBelow) return none;
    // WHICH CELL OF THE ROW THIS IS, counted in CELLS. It was counted in lines,
    // which is the same number only when nothing sits between them — and an
    // assessment table puts a time between every pair, so the third deadline was
    // the fifth line and looked for a fifth column heading that does not exist.
    const j = cells.cells ? cells.cells.indexOf(at) : at - cells.lo;
    // A NAME OFF THE TABLE BEATS THE CELL'S OWN WORDS. "Tentatively Nov. 10-12"
    // put "Tentatively" on the page as the name of a week of exams, and the
    // document says what it is one line further up: this is the Exam Time column
    // of the Midterm row. Only where the headings were actually found — see
    // headingsOver, which returns nothing unless the shape is really a table.
    // AND WHICH COLUMN IT IS, KEPT. Two cells of one column of one table are
    // the same KIND of thing said about two different rows — "Paper Submission"
    // for the midterm and for the final — and they rest on the same evidence.
    // See the column pass in calShow: what is doubted about one of them is
    // doubted about all of them.
    if (heads && heads[j])
      return { name: `${row} — ${heads[j]}`.slice(0, 120), headed: true, col: heads[j] };
    return { name: row, headed: false };
  }

  const tidyLine = (lines, i) =>
    i < 0 || i >= lines.length ? "" : String(lines[i] || "").replace(/\u00a0/g, " ").trim();

  // THE RUN OF CELLS A DATED LINE IS IN, and nothing if it is on its own.
  //
  // A column has more than one cell in it, and that is the whole of what says
  // this is a table. Two dates one under another with a name above them is a row
  // of one; ONE date under a line of words is a date under a heading — and
  // taking the heading is how "4th March" comes to be called "Thursday", and a
  // date at the foot of a page comes to be called after the title at the top.
  // THE HEADING A LINE SITS UNDER.
  //
  // A calendar files things: "Holidays:", "Deadlines:", "Term dates:" — a line
  // of words, no date, ending in a colon, and everything below it belongs to it
  // until the next one. That heading is often the only place the document says
  // what a whole list of entries IS, so it is part of what an entry rests on
  // even though it is nowhere near it.
  //
  // Bounded: it stops at a blank line and at a line with a date on it, because
  // once dates have started the heading above them is the one that applies.
  const HEADING = /:\s*$/;
  function headingOver(lines, at, useYear, order) {
    for (let i = at - 1; i >= 0 && at - i <= 12; i--) {
      const t = tidyLine(lines, i);
      if (!t) return "";
      if (!HEADING.test(t)) continue;
      if (dateIn(t, useYear, order)) return "";
      return hasWords(t) ? t : "";
    }
    return "";
  }

  // AND THE NAME ON THE LINE UNDERNEATH, which is the other half of the same
  // thought and was missing.
  //
  // A great many calendars put the day on one line and what happens on the
  // next:
  //
  //     Thu 27 Aug
  //     Faculty Welcome Day
  //     Whole-staff orientation and department planning. 08:30-15:30.
  //
  // Read looking only upwards, every one of those is a date with nothing to
  // call it — thirty of them on one document, which is not a calendar, it is a
  // list of numbers. The rule is the mirror of nameAbove and refuses the same
  // things: a line with a date on it is the next entry, a weekday is not a
  // name, and a heading belongs to what comes after it rather than to what
  // came before.
  // AND THE NAME ON THE LINE ABOVE, where the document is built the other way up.
  //
  // Some tables run name-then-dates rather than date-then-name:
  //
  //     Summer Break
  //     1 July 2027 - 31 August 2027
  //     Notes
  //
  // Reaching downwards there takes the heading of whatever comes next — the
  // summer holiday came out called "Notes". Reaching upwards blindly is no
  // better: in a list written date-then-name-then-detail, the line above a date
  // is the PREVIOUS entry's detail sentence.
  //
  // What tells them apart is one line further out. Where the line above a date
  // is itself preceded by a date — or by nothing at all — it is the first line
  // of its own block and belongs to this date. Where more words come before it,
  // it is the tail of the block above and belongs to that.
  function nameJustAbove(lines, at, useYear, order) {
    const prev = tidyLine(lines, at - 1);
    if (!prev || dateIn(prev, useYear, order) || !hasWords(prev)) return "";
    if (HEADING.test(prev) || monthHeading(prev)) return "";
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (T && T.dayOf && T.dayOf(prev.replace(/[^A-Za-z]+/g, "")) >= 0) return "";
    // AND STRICTLY A DATE ABOVE IT. Allowing "nothing at all" as well let the
    // title at the top of a page name the first date under it — which is the
    // fault the rule looking upwards was given its bounds to avoid.
    if (!dateIn(tidyLine(lines, at - 2), useYear, order)) return "";
    return labelOf(prev, "", useYear, order);
  }

  // A LINE THAT CARRIES DATES AND NOT ONE WORD IS A CELL OF A TABLE.
  //
  //     Whole-Staff Briefing
  //     18 Sep; 9 Oct; 6 Nov; 4 Dec; 8 Jan
  //     All teaching staff
  //     15:45
  //
  // That is one row of a four-column table, and a flattened PDF gives it to us
  // one cell per line. The dates cell is the middle of it: the name is BEFORE
  // it and the line AFTER it is the same row's next column — who it is for —
  // which is how every meeting in a real staff calendar came out named after
  // its own audience, or after nothing at all.
  //
  // THE TELL IS THAT THERE IS NOT ONE WORD ON IT, AND THAT IT IS A LIST.
  //
  // A line with words names itself, however many dates it carries. A line of
  // nothing but dates and the punctuation between them cannot: it is not a
  // sentence, not a heading and not a title.
  //
  // AND A LIST IS NOT A SPAN. "Mon 24 May - Fri 28 May" is two dates and ONE
  // entry, whose name sits wherever that document puts names — under it, as
  // often as not. "18 Sep; 9 Oct; 6 Nov" is several entries, and only a cell
  // holds several entries with no name on the line. Read as the same thing,
  // reaching upwards took the previous entry's detail sentence ("In the
  // library, 18:00.") and called a week's holiday by it. The dash is the
  // difference, and it is the document's own mark rather than a guess.
  function cellOfDates(line, useYear, order) {
    let s = noDayNames(String(line || ""));
    let n = 0;
    for (; n < 8; n++) {
      const f = findDate(s, useYear, order);
      if (!f || !f.text || s.indexOf(f.text) < 0) break;
      s = s.replace(f.text, " ");
    }
    return n >= 2 && /[;,]/.test(s) && /^[\s;,.:•*|\t]*$/.test(s) ? n : 0;
  }

  // AND THE CELL BEFORE IT IS WHAT IT IS CALLED.
  //
  // ONE LINE, AND THE LINE HAS TO BE IN THIS COLUMN. A flattened table says
  // which column a line came out of by how far it is indented, so a line at a
  // different indent is a different column — the table's heading row, not this
  // row's name — and reaching through it collected "Meeting Dates Who Time"
  // and put that in front of every meeting in the table.
  //
  // AND STRICTLY ONE. Two lines up is as often the section heading over the
  // whole table as it is the rest of a wrapped name, and nothing on the page
  // tells those apart: "Academic-year blocks / Semester 1 / 1 September 2026 -
  // 22 January 2027" and "Upper School Curriculum / Leaders / 10 Sep; 12 Nov;
  // 14 Jan" are the same four lines in the same order. Taking one gives
  // "Semester 1", which is right, and "Leaders", which is half a name — and
  // half a name you can see is worth more than a whole one that might be the
  // heading of the table it is in. THE GAP: a name that wrapped comes back cut
  // to its last line. Said here rather than guessed at.
  function nameOfCell(lines, at, useYear, order) {
    const col = (i) => (/^\t*/.exec(String(lines[i] || "")) || [""])[0].length;
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    const t = tidyLine(lines, at - 1);
    if (!t || col(at - 1) !== col(at)) return "";
    if (dateIn(t, useYear, order) || !hasWords(t)) return "";
    if (HEADING.test(t) || monthHeading(t) || namesItself(t)) return "";
    if (T && T.dayOf && T.dayOf(t.replace(/[^A-Za-z]+/g, "")) >= 0) return "";
    return labelOf(t, "", useYear, order);
  }

  // AND THE TIME IS IN A CELL OF ITS OWN, FURTHER ALONG THE SAME ROW.
  //
  //     Whole-Staff Briefing
  //     18 Sep; 9 Oct; 6 Nov; 4 Dec; 8 Jan
  //     All teaching staff
  //     15:45
  //
  // Six briefings at a quarter to four, and the quarter to four is two cells
  // away from the dates. A line that is nothing but a clock cannot be an entry
  // — there is no day for it to be on — so in this column, before the next row
  // of the table begins, it belongs to this one. What is between them is
  // stepped over rather than read: this app has no column headings to know
  // what "All teaching staff" IS, and guessing would be inventing a field.
  function timeOfCell(lines, at, useYear, order) {
    const col = (i) => (/^\t*/.exec(String(lines[i] || "")) || [""])[0].length;
    for (let i = at + 1; i < lines.length && i <= at + 4; i++) {
      const t = tidyLine(lines, i);
      if (!t || col(i) !== col(at) || dateIn(t, useYear, order)) return null;
      if (hasWords(t)) continue;
      const clock = timeOnLine(t);
      if (clock) return clock;
    }
    return null;
  }

  function nameBelow(lines, at, useYear, order) {
    const next = tidyLine(lines, at + 1);
    if (!next || dateIn(next, useYear, order) || !hasWords(next)) return "";
    // AND NOT A NAME THAT BELONGS TO THE DATE AFTER IT.
    //
    // Some tables run the other way round — the name, then its dates, then the
    // next name, then its dates:
    //
    //     Semester 1
    //     1 September 2026 - 22 January 2027
    //     Midyear Recess
    //     23 January 2027 - 14 February 2027
    //
    // Reaching downwards there takes the NEXT entry's name, and every row comes
    // out labelled one place along: the autumn term called "Midyear Recess",
    // the midyear break called "Staff Preparation". A wrong name is worse than
    // none — it reads as a fact and there is nothing on the row to argue with.
    //
    // The tell is what follows the candidate. A name with a DATE under it is
    // the label of that date, not of the one above it. A name with a sentence
    // under it is this row's, and the sentence is its detail.
    if (dateIn(tidyLine(lines, at + 2), useYear, order)) return "";
    if (HEADING.test(next) || monthHeading(next)) return "";
    const T = typeof window !== "undefined" && window.OrganiserTimetable;
    if (T && T.dayOf && T.dayOf(next.replace(/[^A-Za-z]+/g, "")) >= 0) return "";
    return labelOf(next, "", useYear, order);
  }

  // A LINE THAT IS A MONTH AND A YEAR AND NOTHING ELSE — "AUGUST 2026",
  // "January 2027". Not an entry: a heading over the dates beneath it, and the
  // only place some documents write the year down at all.
  function monthHeading(line) {
    const t = String(line || "").trim();
    const m = /^([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})$/.exec(t);
    if (!m) return 0;
    const at = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return at < 0 ? 0 : Number(m[2]);
  }

  // EVERYTHING THIS ENTRY RESTS ON, AND NOTHING ELSE.
  //
  // The heading its list is under, the row and column it is in if it is in a
  // table, and its own words. This is what the app can say about where an entry
  // sits WITHOUT knowing anything about schools — and it is the only place a
  // claim about that entry may look for its proof. Checked against the whole
  // document instead, a reader could justify a training day by quoting the word
  // "Holidays" out of a list three sections away: a real phrase, borrowed, which
  // is the same fault as a borrowed line wearing different clothes.
  function contextOf(lines, at, line, useYear, order) {
    const out = [];
    const head = headingOver(lines, at, useYear, order);
    if (head) out.push(head);
    const cells = cellRun(lines, at, useYear, order);
    if (cells) {
      const row = tidyLine(lines, cells.lo - 1);
      if (row && hasWords(row)) out.push(row);
      // AND ITS OWN COLUMN, NOT EVERY COLUMN.
      //
      // All of them were pushed in, so the ground an entry's claims are checked
      // against held the headings of the cells BESIDE it. On a two-column
      // deadline table that means the paper-submission cell could prove itself
      // by quoting "Score Input & Report Confirm" — a real phrase, genuinely in
      // the table, and about the cell next to it. That is borrowing, in the one
      // place a borrowed phrase looks most like evidence, because it comes off
      // the same row of the same table.
      //
      // A cell rests on the heading of its list, the row it is in, the column IT
      // is in, and its own words. Which column that is, is known: the cells of a
      // row are the dated ones, in order, and the headings line up with them.
      const heads = headingsOver(lines, cells, useYear, order);
      const j = cells.cells ? cells.cells.indexOf(at) : at - cells.lo;
      if (heads && heads[j]) out.push(heads[j]);
    }
    out.push(line);
    return out.filter(Boolean).slice(0, 6);
  }

  function cellRun(lines, at, useYear, order) {
    const dated = (i) => { const t = tidyLine(lines, i); return !!t && !!dateIn(t, useYear, order); };
    // A LINE THAT IS NOTHING BUT A CLOCK IS NOT A CELL OF ITS OWN.
    //
    // There is no day for it to be on. It is the time of the date above it,
    // written in the cell below because that is where a tall narrow column puts
    // it — and it broke every table it appeared in:
    //
    //     Mid-Semester
    //     23 Oct 2026
    //     16:30            <- this
    //     16 Nov 2026
    //     17:00            <- and this
    //     20 Nov 2026
    //
    // A run of cells was dates DIRECTLY one under another, so that table's runs
    // were one cell long, one cell is not a table, and everything that needs a
    // table to be a table stopped there: the headings above were never looked
    // for, the row label beside them was never found, and six deadlines came out
    // called "Semester", "Mid-Semester" or nothing at all.
    //
    // Stepped over, not counted: the cells of the row are the DATED ones, which
    // is what the column headings line up with.
    const clockOnly = (i) => {
      const t = tidyLine(lines, i);
      return !!t && !hasWords(t) && !dateIn(t, useYear, order) && !!timeOnLine(t);
    };
    const back = (i) => { let j = i - 1; while (j >= 0 && clockOnly(j)) j--; return j; };
    const on = (i) => { let j = i + 1; while (j < lines.length && clockOnly(j)) j++; return j; };
    let lo = at, hi = at;
    const cells = [at];
    for (let p = back(lo); p >= 0 && dated(p); p = back(lo)) { lo = p; cells.unshift(p); }
    for (let p = on(hi); p < lines.length && dated(p); p = on(hi)) { hi = p; cells.push(p); }
    if (hi === lo || lo === 0) return null;
    // AND A LINE THAT NAMES ITSELF IS NOT A CELL.
    //
    // Two bulleted entries that happen to sit next to each other are two
    // entries, not a row of a table — and read as one, "Parents' Meeting
    // (Tentative): Jan. 20" came back called "Art Festival: Week 16-Week 17 —
    // Sports Week: Tentatively Week 7", which is three unrelated things in one
    // name. What separates them is on the line: a cell of a table is a date and
    // perhaps a word; an entry writes its own name and then a colon.
    for (let i = lo; i <= hi; i++) if (namesItself(tidyLine(lines, i))) return null;
    // `cells` is where the dated ones are, in order — which is what a column
    // heading lines up with. `size` counts those, not the lines between them.
    return { lo, hi, cells, size: cells.length };
  }
  // Words, and then a colon. "Sports Week: Tentatively Week 7" names itself;
  // "Nov. 2 16:00" and "Tentatively Nov. 10-12" do not — the only colon in the
  // first of those is inside a clock, which is why the clocks come out before
  // the question is asked at all.
  const namesItself = (t) =>
    /^[^:]*[A-Za-z]{2}[^:]*:/.test(String(t || "").replace(/\b\d{1,2}:\d{2}\b/g, " "));

  // THE HEADING ROW OVER A TABLE, where there is one.
  //
  // Walking up from the row's own label: lines with dates on them are other
  // rows' cells and are stepped over; a run of lines with words and no dates is
  // either the heading row or an earlier row's label. The tell is what follows
  // it — a row label is followed by cells, a heading is followed by another
  // name — so the last line of the run is dropped when it is a row label, and
  // what is left, taken from the bottom, is as many headings as this row has
  // cells. Nothing is returned unless there are exactly that many, which is what
  // keeps an ordinary list of holidays under a paragraph from being read as a
  // table.
  function headingsOver(lines, cells, useYear, order) {
    if (cells.size < 2) return null;
    const dated = (i) => { const t = tidyLine(lines, i); return !!t && !!dateIn(t, useYear, order); };
    // THE ROW ABOVE IS STEPPED OVER WHOLE, clocks and all. Its cells are dates
    // with times between them, the same shape as this row's — and stopping at
    // the first of those times left the walk sitting in the middle of another
    // row, where a heading is never going to be.
    const cellish = (i) => {
      const t = tidyLine(lines, i);
      return !!t && (dated(i) || (!hasWords(t) && !!timeOnLine(t)));
    };
    const run = [];
    let i = cells.lo - 2;
    const skipped = i >= 0 && cellish(i);
    while (i >= 0 && cellish(i)) i--;
    while (i >= 0) {
      const t = tidyLine(lines, i);
      if (!t || dated(i) || !hasWords(t)) break;
      run.unshift(t);
      i--;
    }
    if (!run.length) return null;
    // AND THE LAST OF THEM IS ANOTHER ROW'S LABEL, not a heading, when there was
    // a row above to step over. "Cycle / Paper / Scores / Reports" then
    // "Mid-Semester" then that row's dates: walking up from the second row
    // collects the first row's label along with the headings, and it is the one
    // nearest the cells.
    const heads = (skipped && run.length > 1 ? run.slice(0, -1) : run).slice(-cells.size);
    if (heads.length !== cells.size) return null;
    return heads.map((h) => labelOf(h, "", useYear, order) || h);
  }

  // Letters, in any of the alphabets a school calendar is written in. A clock, a
  // bullet and a number are not a name, however much room they take up.
  const hasWords = (s) =>
    /[A-Za-zЀ-ӿ一-鿿぀-ヿ]/
      .test(String(s || "").replace(/\b\d{1,2}:\d{2}\b/g, " "));

  // MONTHS THE DOCUMENT NAMES THAT NOTHING CAME OUT IN.
  //
  // Not a count of failures — a reader cannot know what it did not see. This is
  // the one shape of not-seeing that leaves a mark: the word "December" is on
  // the page and no entry is in December. On a document read cleanly it is
  // empty, and where it is not, something is worth a second look.
  function monthsMissed(all, rows, useYear) {
    const named = new Set();
    const text = String(all || "");
    MONTHS.forEach((m, i) => {
      if (new RegExp(`\\b${m}[a-z]*\\b`, "i").test(text)) named.add(i + 1);
    });
    rows.forEach((r) => { if (r.date) named.delete(Number(r.date.slice(5, 7))); });
    rows.forEach((r) => { if (r.endsOn) named.delete(Number(r.endsOn.slice(5, 7))); });
    void useYear;
    return [...named].sort((a, b) => a - b);
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
    // Which number is the month, decided by the whole document rather than
    // guessed at line by line — see slashOrder.
    const order = slashOrder(all);
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
    const lines = all.split(LINE_BREAKS);
    // ONE CELL, ONE THING, SEVERAL DAYS.
    //
    // "Whole-Staff Briefing | 18 Sep; 9 Oct; 6 Nov; 4 Dec; 8 Jan | All teaching
    // staff | 15:45" is ONE row of a document describing FIVE occurrences of
    // ONE meeting. They share a name, a time, whoever it is for and the line
    // they came off; the only thing that differs is the day. So they are told
    // apart from five unrelated rows that happen to sit together — the panel
    // can ask about a termly briefing once instead of five times, and a row can
    // say what it is one of.
    //
    // WHAT IS NOT A SERIES, and both matter:
    //   · TWO DIFFERENT THINGS ON ONE LINE. "Midterm Nov. 17, Final Jan. 15" is
    //     a midterm and a final — one line, two names, two events. The tell is
    //     the name: occurrences of one thing are called one thing.
    //   · TWO THINGS ON ONE DAY. A cell holding a briefing at eight and a
    //     conference at half past three is two events that share a date, which
    //     is the one thing occurrences of a series never do.
    //   · ONE DATE. A tag on every row would say nothing at all.
    let seriesN = 0;
    const markSeries = (kin) => {
      if (kin.length < 2) return;
      const name = (x) => String(x.label || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (new Set(kin.map(name)).size !== 1) return;
      if (new Set(kin.map((x) => x.date)).size !== kin.length) return;
      const id = `series-${++seriesN}`;
      kin.forEach((x) => { x.series = id; x.ofSeries = kin.length; });
    };
    // THE YEAR A MONTH HEADING PUTS OVER THE DATES UNDER IT.
    //
    // "AUGUST 2026" and then "Thu 27 Aug"; "JANUARY 2027" and then "Mon 4 Jan".
    // The entries never write a year, the headings always do, and read without
    // them a document that runs from one August to the next February comes out
    // with its whole second half twelve months early. This app already treats a
    // borrowed year as the one thing that can be quietly wrong by exactly a
    // year; here the document said it and nothing was listening.
    //
    // It holds until the next heading, which is what a heading means.
    const headYear = [];
    {
      let year = 0;
      lines.forEach((raw, i) => {
        const t = String(raw || "").replace(/\u00a0/g, " ").trim();
        // AND IT STOPS AT A BLANK LINE, which is where a block of a document
        // ends — a page break, a change of section. Carried past one, the
        // heading over the last month of a chronological list went on applying
        // to a page organised by something else entirely, and put a year on
        // dates it had nothing to do with.
        if (!t) { year = 0; headYear[i] = 0; return; }
        const y = monthHeading(t);
        if (y) year = y;
        // AND IT STOPS AT A LINE THAT WRITES ITS OWN YEAR AND DISAGREES.
        //
        // A blank line is where a block of a document ends — except that a
        // flattened PDF often has no blank line at a page break, only a running
        // header and a page number. On a real staff calendar the heading
        // "FEBRUARY 2027" at the foot of page two went on applying through the
        // whole of page three, which is organised by function rather than by
        // month, and put 2027 on a table of meetings that begins in September.
        //
        // A document that writes "23 Oct 2026" while February 2027 is nominally
        // in force has plainly left that section. It is saying so itself, which
        // is better evidence than a page number this reader cannot recognise.
        else if (year && !monthHeading(t)) {
          const own = hasYearOnIt(t) ? dateIn(t, year, "") : "";
          if (own && Number(own.slice(0, 4)) !== year) { year = 0; }
        }
        headYear[i] = year;
      });
    }
    lines
      .forEach((raw, at) => {
        const line = raw.replace(/\u00a0/g, " ").trim();
        if (!line) return;
        // The year this line is under, where the document wrote one over it.
        const yr = headYear[at] || useYear;
        const range = rangeIn(line, yr, order);
        // WHERE A RANGE WAS FOUND, ITS START IS THE DATE.
        //
        // These were two searches over one line and nothing made them agree.
        // On "Half term 25/10 - 29/10" the date search skipped the first date —
        // it is followed by a dash and a number, which is how a three-part date
        // looks, so it is passed over — and took the SECOND. The row then said
        // it began on the 29th and ended on the 29th: a week of half term
        // collapsed onto its own last day, from a line that plainly said both.
        const d = (range && range.to > range.from && range.from) || dateIn(line, yr, order);
        if (!d) {
          // NO DATE, BUT IT MAY STILL BE SOMETHING. A line naming weekdays and
          // saying "every" is a standing commitment — see repeatIn.
          const every = repeatIn(line);
          if (!every) return;
          const t = timeOnLine(line);
          rows.push({
            date: "",
            days: every,
            endsOn: "",
            endFrom: "",
            // "Staff meeting every Friday" is a staff meeting. The rule is
            // shown beside it on the page, so saying it twice in the name is
            // just less room for the part that says what it is.
            label: labelOf(
              line.replace(SAYS_EVERY, " ")
                .replace(/\b[A-Za-z]{3,10}s?\b/g, (w) => (repeatIn("every " + w) ? " " : w)),
              "", yr, order) || "(no name)",
            ...(t ? { start: t.start, end: t.end } : {}),
            line,
            yearAssumed: false,
            kind: "",
          });
          return;
        }
        rows.push({
          date: d,
          // Both ends, when the line itself gave both — see rangeIn. Nothing is
          // paired across lines here; that stays a decision you tick.
          endsOn: range && range.to > range.from ? range.to : "",
          // WHERE THAT END CAME FROM. Shown on the page, because a date the app
          // read off the document and a date you typed into the box should not
          // look the same — and "as written" was the only one of the two the
          // page could say until the grid started answering as well.
          endFrom: range && range.to > range.from ? "line" : "",
          // WHAT THE LINE CALLS IT, or — where the line is a table cell with
          // nothing on it but a date and a clock — what the column it came out
          // of calls it. See nameAbove.
          ...(function () {
            const own = labelOf(line, d, yr, order);
            // A CELL OF DATES IS NAMED BY THE CELL BEFORE IT, AND BY NOTHING
            // AFTER IT. The line below is the same table row's next column —
            // who it is for, what time it starts — not the next entry's name.
            // See cellOfDates.
            const cell = cellOfDates(line, yr, order);
            if (cell) {
              const named = nameOfCell(lines, at, yr, order);
              if (named) return { label: named, nameFrom: "column" };
            }
            const above = nameAbove(lines, at, yr, order);
            const near = !hasWords(own) && !above.name
              ? nameJustAbove(lines, at, yr, order) ||
                (cell ? "" : nameBelow(lines, at, yr, order))
              : "";
            if (near) return { label: near, nameFrom: "column" };
            // AND WHERE IT CAME FROM. A name the line did not carry is not the
            // row's own identity: two cells of one column can be the same day
            // written twice, and telling them apart is what the line they came
            // off is for. Same reasoning as a row with no name at all.
            if (above.headed)
              return {
                label: above.name, nameFrom: "column",
                // Named by its table as well as by its column, because two
                // tables on one page can both have a column called "Dates".
                colGroup: `${headingOver(lines, at, yr, order) || ""}#${above.col}`,
              };
            if (hasWords(own)) return { label: own };
            return above.name
              ? { label: above.name, nameFrom: "column" }
              : { label: own || "(no name)" };
          })(),
          // When the line said one. Empty means all day, which is what a
          // holiday is and what every row used to be.
          ...(function () {
            // AND A CELL OF A TABLE KEEPS ITS TIME IN THE NEXT CELL DOWN. This
            // was asked only of a line holding a LIST of dates — the meetings
            // table — and an assessment table writes one date to a cell with
            // its deadline underneath it, so half past four sat on a line of
            // its own and no deadline had a time. Same shape, same question,
            // now asked of any dated line. See timeOfCell.
            const t = timeOnLine(line) || timeOfCell(lines, at, yr, order);
            return t ? { start: t.start, end: t.end } : {};
          })(),
          line,
          // EVERYTHING THIS ENTRY RESTS ON — see contextOf. Sent with the entry
          // when a reader is asked what it means, and the only place a claim
          // about it may look for its proof.
          context: contextOf(lines, at, line, yr, order),
          // Whether the year came off the line itself or was borrowed. Shown,
          // because a borrowed year is the one thing here that can be quietly
          // wrong by exactly twelve months.
          yearAssumed: !hasYearOnIt(line),
          // NOTHING IS GUESSED. What this date means to the app is a decision,
          // and the words are not evidence — "break" could be a week off or a
          // week of INSET. Starts as nothing and you choose.
          kind: "",
        });
        // AND EVERY OTHER DATE THE SAME LINE NAMES — see alsoOn. The make-up
        // days a holiday is paid for with are written in the brackets after it.
        //
        // ONE THING TAKEN, because the row above consumed exactly one: the
        // range where there was one, otherwise the single date.
        const already = range && range.to > range.from
          ? range.text
          : findDate(noDayNames(line), yr, order).text;
        // THE PARENT'S DATE AND THE ONE BEFORE IT, so a jump backwards across a
        // New Year is seen from the first extra onwards rather than only
        // between two extras.
        const more = alsoOn(line, [already], yr, order, d);
        if (more.length) {
          // AND THE ROW THIS LINE ALREADY MADE STOPS AT THE FIRST OF THEM. The
          // holiday was called "National Day: (Sep. 20 is a working day, even
          // week Tuesday schedule; Oct. 10 is" — the whole bracket, which is
          // now two rows of its own, read out again as part of its name.
          const cut = Math.min(...more.map((x) => x.clauseAt));
          const head = noDayNames(line).slice(0, cut).replace(/[\s(;,:•-]+$/, "");
          const short = labelOf(head, d, yr, order);
          const parent = rows[rows.length - 1];
          if (short) parent.label = short;
          // AND WHERE THE LINE HAD NO NAME OF ITS OWN, THE CELL'S NAME IS ALL
          // OF THEM. "18 Sep; 9 Oct; 6 Nov; 4 Dec; 8 Jan" in the cell after
          // "Whole-Staff Briefing" is five whole-staff briefings — not one
          // briefing and four days with nothing at all on them, which is how
          // every recurring meeting in a real staff calendar arrived.
          underStem(short ? subjectOf(short) : (parent.nameFrom === "column" ? parent.label : ""),
                    more);
          // AND THE TIME IS THE WHOLE CELL'S. Six briefings at a quarter to
          // four are six meetings with a time, not one with a time and five
          // all-day blocks over somebody's afternoons.
          if (parent.start) more.forEach((x) => {
            if (!x.start) { x.start = parent.start; if (parent.end) x.end = parent.end; }
          });
          // ONE CELL, ONE THING, SEVERAL DAYS — see series.
          markSeries([parent].concat(more));
          // AND THE SAME GROUND UNDER THEM. A second date on one line is the
          // same entry said twice — "Oct. 16, Nov. 13" — so it rests on exactly
          // what the first one rests on. Without this the thirteenth of November
          // arrived with nothing behind it and no claim about it could be
          // checked at all.
          const ground = rows[rows.length - 1] && rows[rows.length - 1].context;
          if (ground) more.forEach((x) => { x.context = ground.slice(); });
          rows.push(...more);
        }
        // AND TWO THINGS IN ONE CELL ON ONE DAY ARE TWO THINGS.
        //
        // "Staff Briefing 08:00; Family Conferences 15:30 | 21 Nov 2026" is a
        // morning briefing and an afternoon conference on the same Friday, and
        // it came out as one all-day row wearing both their names. The
        // afternoon was simply gone, and the day it was gone from had something
        // on it, so nothing anywhere said a thing had been lost.
        //
        // THE TELL IS THAT EVERY HALF CARRIES ITS OWN CLOCK. A semicolon
        // divides plenty of things that are not two events — "Exam Week; Grades
        // 9-12" is one event and a note about who sits it — and nothing here
        // can tell those apart by the words, so it does not try. A time is a
        // thing happening AT a time; two of them either side of a semicolon on
        // one day is two things, and one untimed half is not evidence of
        // anything. Splitting on less than all of them would invent rows out of
        // asides, which is the fault the other way round.
        else {
          const parts = noDayNames(line).split(";").map((p) => p.trim()).filter(Boolean);
          // WITH THE DATE OUT OF THE WAY FIRST. A clock is only read where it
          // ends a clause or is announced by "at" — see timeOnLine, which is
          // that strict so that "back by 3:30" in the middle of a sentence is
          // not an appointment. The date usually sits after the time in a cell
          // ("Family Conferences 15:30 | 21 Nov 2026"), so asked of the clause
          // as written the second half of the pair had no time and the line
          // was never split.
          const timed = parts.map((p) => {
            const f = findDate(p, yr, order);
            return { p, t: timeOnLine(f && f.text ? p.replace(f.text, " ") : p) };
          }).filter((x) => x.t && hasWords(x.p));
          if (parts.length > 1 && timed.length === parts.length) {
            const parent = rows[rows.length - 1];
            rows.splice(rows.length - 1, 1, ...timed.map(({ p, t }) => ({
              ...parent,
              label: labelOf(p, d, yr, order) || "(no name)",
              start: t.start,
              end: t.end,
            })));
          }
        }
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
    // AND WHERE THERE IS NO GRID, THE DOCUMENT'S OWN WRITTEN DATES SETTLE THEM.
    //
    // Most calendars have no grid. What they all have is SOME dates with the
    // year written out: the line saying when it was issued, the term blocks at
    // the back, the two or three entries somebody typed in full. Those say what
    // stretch of time the document is about, and a date with no year on it
    // belongs inside that stretch.
    //
    // WHAT THIS REPLACES, and why: the only thing available before was the
    // order the dates came in — a date listed after a later one has crossed a
    // New Year. That is right for a sentence, which runs forwards, and wrong
    // for a table, which is sorted by nothing. On a real staff calendar the
    // table of recurring meetings sat after a term block ending in August, so
    // "18 Sep; 9 Oct; 6 Nov; 4 Dec; 8 Jan" — a line with no year anywhere on it
    // — put every meeting twelve months late and the January ones twenty-four.
    // Nobody would have spotted it: each date looked perfectly reasonable.
    //
    // NOTHING IS ASSUMED ABOUT WHEN A SCHOOL YEAR STARTS. The span is read off
    // the page, the same way the grid's years are. Where the document writes no
    // years at all, or writes them more than about fourteen months apart, there
    // is nothing to read and nothing here changes. And where a date would fit
    // the span in more than one year it is left exactly as it was: two answers
    // is not an answer, and a year quietly moved is the one fault on this page
    // that looks like no fault at all.
    {
      const written = rows.filter((r) => r.date && !r.yearAssumed)
        .reduce((a, r) => a.concat([r.date, r.endsOn || ""]), []).filter(Boolean).sort();
      const lo = written[0] || "", hi = written[written.length - 1] || "";
      const apart = lo && hi
        ? (Number(hi.slice(0, 4)) - Number(lo.slice(0, 4))) * 12 +
          (Number(hi.slice(5, 7)) - Number(lo.slice(5, 7)))
        : 99;
      if (lo && hi && apart <= 14)
        rows.forEach((r) => {
          if (!r.yearAssumed || r.yearFromGrid || !r.date) return;
          const fits = [];
          for (let y = Number(lo.slice(0, 4)); y <= Number(hi.slice(0, 4)); y++) {
            const moved = atYear(r.date, y);
            if (moved && moved >= lo && moved <= hi) fits.push(moved);
          }
          if (fits.length !== 1 || fits[0] === r.date) return;
          // AND NEVER ONTO A DAY THE DOCUMENT HAS ALREADY SPELLED OUT.
          //
          // A school year has the same few days at both ends of it. "Aug. 31"
          // at the top of a calendar is the day the students arrive, a fortnight
          // before term; "Aug. 31, 2027" at the bottom of the same calendar is
          // the end of the summer holiday a year later. Same month, same day,
          // consecutive academic years, and only the second one writes its year.
          //
          // The span said the first one did not fit — it is one day before the
          // earliest date the document happens to write out — so it was moved
          // twelve months, on top of the other, and a day that should sort first
          // in the list sorted last. Nobody would have caught that except by
          // knowing the document.
          //
          // The written dates are a SAMPLE of the document's range, not its
          // edges. So landing exactly on one of them is not a fit, it is a
          // collision: far likelier that the app has just recreated the entry
          // the document already spelled out than that two things share that
          // day and only one of them wrote the year. Endpoints only — a date
          // inside a term block is an ordinary date in term time.
          const spelled = new Set(written);
          if (spelled.has(fits[0])) return;
          const shift = Number(fits[0].slice(0, 4)) - Number(r.date.slice(0, 4));
          r.date = fits[0];
          if (r.endsOn)
            r.endsOn = atYear(r.endsOn, Number(r.endsOn.slice(0, 4)) + shift) || r.endsOn;
          // AND SAID, in place of whatever the ordering rule had said about it.
          // A year the app worked out and a year the document wrote must not
          // look the same, and the REASON must be the real one.
          r.yearRolled = false;
          r.yearFromDoc = true;
        });
    }
    // AND HOW LONG EACH OF THEM RUNS, WHERE THE CALENDAR DREW IT.
    //
    // A holiday arrives as two lines — begins, ends — and pairing them is a
    // guess, so it is a tick you press. But when the same document also DRAWS
    // the term, the guess is unnecessary and wrong: the grid gives every marked
    // day its own square, so a stretch of them is drawn rather than implied.
    //
    // "Mid-Autumn Festival" is one square. "National Day" is seven. The tick
    // offered to marry the two into a seven-day Mid-Autumn — a week off invented
    // out of a one-day holiday, with no way to say otherwise except not pressing
    // it, and no way at all to say the seven days the next line really is.
    //
    // So a row landing on a marked square covers that square's run. It is put in
    // the box you can change, not asserted: the grid marks what it marks, and a
    // line about something it doesn't mark can land on a square by coincidence.
    const marked = new Map();
    if (wg)
      weekGridMarks(wg, useYear).forEach((m) =>
        m.runs.forEach(([a, z]) => { if (!marked.has(a) || marked.get(a) < z) marked.set(a, z); }));
    if (marked.size)
      rows.forEach((r) => {
        if (r.endsOn || !marked.has(r.date)) return;
        r.endsOn = marked.get(r.date);
        r.endFrom = "grid";
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
    // ONE EVENT, WRITTEN DOWN TWICE.
    //
    // A calendar often says a thing once in its month-by-month list and again in
    // a table at the back — "Midyear Recess, 23 Jan - 14 Feb" in both. Those are
    // not two events. Offered as two they are two things to answer, two things
    // to tick, and two identical holidays in somebody's week.
    //
    // WHAT IS NOT ENOUGH: the same day. Two different things happen on one day
    // all the time, and merging on a date alone would quietly throw one of them
    // away. What IS enough is the same name over the same days — or one name
    // being the start of the other, which is how "Staff Preparation" and "Staff
    // Preparation Days" turn up in the two halves of one document.
    //
    // AND BOTH PLACES ARE KEPT. The row says what it rests on — see contextOf —
    // and a reading that quietly drops one of its two sources is a reading you
    // can no longer check. The second line goes on the row beside the first.
    const byDate = new Map();
    rows.forEach((r) => byDate.set(
      // A repeat has no date to be the same day as, so it is told apart by the
      // days it runs on — two lines both saying "every Friday assembly" are one
      // rule said twice, and "every Friday" and "every Monday" are not.
      (r.date || "every " + (r.days || []).join(",")) + "|" + (r.endsOn || "") + "|" +
      r.label.toLowerCase().replace(/\s+/g, " ").trim() +
      // A ROW NOBODY COULD NAME is told apart by the line it came off, because
      // there is nothing else to tell it apart by.
      (r.label === "(no name)" ? "|" + r.line : ""), r));
    // Said twice: the key above kept the later one, so the earlier one's line
    // is put back on it.
    {
      const seen = new Map();
      rows.forEach((r) => {
        const key = (r.date || "every " + (r.days || []).join(",")) + "|" + (r.endsOn || "") + "|" +
          r.label.toLowerCase() + (r.label === "(no name)" ? "|" + r.line : "");
        const kept = byDate.get(key);
        if (kept && kept !== r && r.line && kept.line !== r.line)
          kept.alsoFrom = (kept.alsoFrom || []).concat([r.line]).slice(0, 4);
        seen.set(key, true);
      });
    }
    const kept = [...byDate.values()];
    // AND A NAME THAT IS NEARLY ANOTHER IS A QUESTION, NOT A DECISION.
    //
    // "Staff Preparation" and "Staff Preparation Days" over the same days are
    // almost certainly one thing written two ways. "Staff Meeting" and "Staff
    // Meeting Prep" are two. "Sports Day" and "Sports Day Setup". "Parent
    // Meeting" and "Parent Meeting AM". A short trailing word can change the
    // event entirely, and no length of it decides which case this is.
    //
    // So nothing is merged on a nearly. Two copies of one event is a thing to
    // notice and untick; two different events silently becoming one is a thing
    // that disappears, and there is no screen on which that can be seen. Both
    // rows stay, and the pair becomes a question you are asked.
    const nearly = (a, b) => {
      const x = a.label.toLowerCase().replace(/\s+/g, " ").trim();
      const y = b.label.toLowerCase().replace(/\s+/g, " ").trim();
      if (!x || !y || x === y || x === "(no name)" || y === "(no name)") return false;
      const short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
      return short.length >= 6 && long.indexOf(short) === 0;
    };
    // AND SO IS THE SAME DAY AT THE SAME HOUR.
    //
    // A calendar written in two halves says its deadlines twice — once in the
    // month list and once in a table — and once the table is read as a table
    // the two are both there, correctly named, and named DIFFERENTLY: "Semester
    // Assessment Paper Upload" and "Semester — Paper / Task Due" are the same
    // deadline and neither name begins the other, so no rule about words is
    // going to see it.
    //
    // What the document itself says is that both are on the 18th of December at
    // half past four. Either that is one thing written twice, or it is a genuine
    // clash — and both are worth a moment of somebody's. So it is a QUESTION, on
    // exactly the terms a near-name is: nothing merges, both rows stay, and
    // "Keep both" is one press.
    //
    // SAME DAY ALONE IS NOT ENOUGH AND NEVER WILL BE. Two different things
    // happen on one day constantly, and asking about every busy Friday of the
    // year is how a useful question becomes noise nobody reads. The hour is what
    // makes it worth asking, and the hour is on the page.
    const sameHour = (a, b) =>
      !!a.start && a.start === b.start && (a.end || "") === (b.end || "");
    //
    // AND THE NEAR ONES ON A DAY ARE ONE QUESTION, NOT ONE QUESTION PER ROW.
    // "Semester", "Semester Assessment" and "Semester Assessment Paper Upload"
    // over the same Friday is a single thing to decide, and asked three times
    // it can be answered three ways that contradict each other. Which rows
    // belong to which question is only knowable here, where what-is-near-what
    // is worked out — so it is settled here, as a tag the rows in one question
    // share, rather than each row naming one neighbour and the screen trying to
    // reassemble the sets from that. What to SAY on a row is then the other
    // rows carrying its tag: one fact, in one place. See drawSameGroups.
    const group = kept.map((_, i) => i);
    const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
    kept.forEach((r, i) => kept.slice(i + 1).forEach((o, j) => {
      if (!r.date || r.date !== o.date || (r.endsOn || "") !== (o.endsOn || "")) return;
      if (!nearly(r, o) && !sameHour(r, o)) return;
      group[find(i)] = find(i + 1 + j);
    }));
    {
      const size = new Map();
      kept.forEach((_, i) => size.set(find(i), (size.get(find(i)) || 0) + 1));
      kept.forEach((r, i) => { if (size.get(find(i)) > 1) r.sameGroup = `${r.date}#${find(i)}`; });
    }
    // Dated rows in date order, and the rules that have no date after them.
    let out = inOrder(kept);
    // AND A DAY THE READER COULDN'T NAME IS NOT A SECOND ENTRY FOR THAT DAY. A
    // booklet that draws August as a grid and then writes "26th August" over its
    // detailed page gives that day twice: once as "All-Staff Orientation" and
    // once as a bare heading with nothing to call it. Both kept, you label the
    // same day twice.
    const named = new Set(out.filter((r) => r.label !== "(no name)").map((r) => r.date));
    // AND ONLY A SQUARE OF THE GRID LOSES ITS PLACE THIS WAY.
    //
    // This dropped ANY nameless row that shared a day with a named one, which is
    // a merge on the date alone — the one thing that must not be done, because
    // two different things happen on one day all the time. On a real calendar it
    // quietly threw away a staff meeting because a family conference was on the
    // same afternoon, and then, once dropping came with provenance, the
    // conference claimed the meeting's line as evidence FOR ITSELF. A false
    // claim about where something came from is worse than the duplicate it was
    // avoiding.
    //
    // The case it was written for is narrower and is about one document saying
    // one thing twice: a square of a grid, or a cell of a table, that holds a
    // date AND NOTHING ELSE, on a day the document names elsewhere. That is the
    // same day drawn twice. A line carrying four other dates is not that — it is
    // something the reader could not name, and it stays.
    // NOT YET PINNED BY A FIXTURE, and said so. The shape that needs this —
    // a nameless row sharing a day with a named one, whose line carries a list
    // of other dates — cannot be built here yet, because a date cell holding a
    // list still comes out with a fragment of that list for a name rather than
    // with no name at all. It gets its fixture when that is mended. Until then
    // it is exercised by a real document and by nothing committed, which is
    // worth knowing and worth not pretending otherwise.
    const bare = (r) => {
      const line = String(r.line || "");
      if (hasWords(labelOf(line, r.date, useYear, order))) return false;
      // One month named on it, or none. Five is a list of other days.
      const named2 = MONTHS.filter((m) => new RegExp(`\\b${m}`, "i").test(line)).length;
      return named2 <= 1 && !/\d[^\d]{0,3}\d{1,2}\s*[;,]\s*\d/.test(line);
    };
    out = out.filter((r) => r.label !== "(no name)" || !named.has(r.date) || !bare(r));
    return {
      rows: out,
      // AND WHETHER IT THINKS IT GOT EVERYTHING.
      //
      // THE HOLE THIS CLOSES. This reader owns the list, and a reader that
      // found NOTHING hands the job to the model. A reader that found FIVE of
      // twelve hands over nothing at all — it did not fail, so nothing asks the
      // question, and the seven it never saw do not exist. The five are safe
      // and the seven are gone, which is the same silence the whole panel was
      // built to end, arriving by a different door.
      //
      // The tell is cheap and it is about the document rather than about any
      // school: a month is NAMED in the text and no entry came out in it. That
      // is either a month heading over an empty stretch or a date this reader
      // could not resolve, and it cannot tell which — so it says so and lets
      // the model look. See monthsMissed.
      missed: monthsMissed(all, out, useYear),
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
      borrowed: out.filter((r) => r.yearAssumed && !r.fromGrid && !r.yearRolled).length,
      // AND HOW MANY HAD A YEAR PUT ON THEM BECAUSE THE LINE PUT THEM AFTER A
      // LATER DATE — see alsoOn. Counted apart from the rest, because "4 of
      // them read as 2026" was being said over a list in which one was 2027.
      rolled: out.filter((r) => r.yearRolled).length,
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
      // AN END EQUAL TO THE START IS AN ANSWER, not a missing one. A one-day
      // holiday drawn as one square on the calendar has been settled by the
      // document, and offering to run it on to the next line is offering to
      // contradict it. `ranged` therefore asks whether it actually covers more
      // than a day, rather than whether an end was given.
      // A DEADLINE IS A MOMENT, NOT A STRETCH. "Reports due" covering the four
      // days to the next line would be four days of reports being due, which is
      // not a thing that happens — so it never ranges and is never offered the
      // run-on, whatever the line after it says.
      const due = r.kind === "due";
      const ownEnd = !due && r.endsOn && r.endsOn >= r.date ? r.endsOn : "";
      const canSpan = !due && !ownEnd && !!next && next.date > r.date;
      const to = ownEnd || (r.spans && canSpan ? next.date : r.date);
      const ranged = to > r.date;
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
    // A RULE IS ONE BLOCK THAT REPEATS, not a block on every day it falls on.
    //
    // "Staff meeting every Friday" is one standing commitment. Written out as
    // fourteen dated entries it would be fourteen things to change when it
    // moves, and it would stop at whatever date the writing-out stopped at.
    //
    // AND IT IS BOUNDED BY THE TERM THE SAME CALENDAR GIVES. A weekly thing
    // with no end runs through the holidays and through next July — which is
    // the exact fault the "lessons start" row exists to fix for a timetable, so
    // a rule read off a calendar should not walk straight back into it. When
    // the calendar says when the teaching runs, the rule runs then.
    const t = term(rows);
    (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.kind && r.kind !== "lessons" && r.kind !== "due" &&
        !r.date && (r.days || []).length)
      .forEach((r) => {
        const T = typeof window !== "undefined" && window.OrganiserTimetable;
        const timed = r.kind !== "off" && r.start;
        out.push({
          label: r.label,
          start: timed ? r.start : "00:00",
          end: timed
            ? r.end || (T && T.anHourAfter ? T.anHourAfter(r.start) : "") || "23:59"
            : "23:59",
          date: "",
          days: r.days.slice(),
          from: (t && t.from) || "",
          to: (t && t.to) || "",
          blocksDay: r.kind === "off",
          noLessons: r.kind === "noLessons",
          beThere: r.kind === "week",
          // AND WHETHER THAT CLOCK IS A CLOCK — see TIMINGS in schedule.js.
          // Without a time from the document this reads midnight to a minute to
          // midnight, which is not what "it happens on the sixteenth" says and
          // costs the whole day's free time to believe.
          ...(timed || r.kind === "off" || r.kind === "noLessons" || r.runsAsDay !== undefined
            ? {} : { timing: "sometime" }),

          // AND ANYTHING READ OFF THE LINE THAT NOTHING HERE HAS A FIELD FOR —
          // a room, a year group, who it is for. It reached the row and stopped
          // there, so a reader that could say "Example Building 109" was giving
          // it to a panel that dropped it on the way to the week. Carried, in
          // the same shape a timetable block carries it.
          ...((r.extras || []).length ? { extras: r.extras } : {}),
          soft: false,
          source: "paste",
        });
      });
    // A "lessons" row is a marker, not a day — it changes when the timetable
    // applies, and putting a block on that date would be inventing an event.
    plan(rows).filter((p) => p.kind !== "lessons" && p.kind !== "due").forEach((p) => {
      // AT THE TIME THE LINE SAID, WHEN IT SAID ONE.
      //
      // Every row became midnight to midnight, so a parents' evening at 6:30
      // was a whole day gone and a concert at seven was a whole day gone. The
      // time was even read — it stayed in the NAME, "Parents' evening , 6:30pm
      // - 8:30pm" — so it was on the screen and nowhere the app could use it.
      //
      // A DAY OFF IS STILL ALL DAY. A holiday has no time and being told one
      // would be wrong; this is for the things that do.
      const timed = p.kind !== "off" && p.row && p.row.start;
      const T = typeof window !== "undefined" && window.OrganiserTimetable;
      const end = timed
        ? p.row.end || (T && T.anHourAfter ? T.anHourAfter(p.row.start) : "") || "23:59"
        : "23:59";
      for (let d = p.from, n = 0; n < p.days; d = addDays(d, 1), n++) {
        out.push({
          label: p.label,
          start: timed ? p.row.start : "00:00",
          end,
          date: d,
          days: [],
          // "in my week" is neither: a thing that happens, at a time, on a day
          // you are working. Without it every timed line on a calendar had to
          // be filed as a day off or thrown away.
          blocksDay: p.kind === "off",
          noLessons: p.kind === "noLessons",
          beThere: p.kind === "week",
          // AND WHETHER THAT CLOCK IS A CLOCK — see TIMINGS in schedule.js.
          // Without a time from the document this reads midnight to a minute to
          // midnight, which is not what "it happens on the sixteenth" says and
          // costs the whole day's free time to believe.
          ...(timed || p.kind === "off" || p.kind === "noLessons" || p.runsAsDay !== undefined
            ? {} : { timing: "sometime" }),

          // A MAKE-UP DAY: a Saturday that runs the Tuesday timetable, because
          // a holiday moved and this is the day standing in for it. The app has
          // always had somewhere to put that — see runsAs in schedule.js — and
          // the calendar that ANNOUNCES it had no way to reach it. So a teacher
          // read "Makeup, 2 days" off their own calendar and then typed both
          // dates into a different form by hand.
          ...(p.kind === "runsAs" && p.row && p.row.runsAsDay !== undefined
            ? { runsAs: p.row.runsAsDay }
            : {}),
          ...((p.row && p.row.extras || []).length ? { extras: p.row.extras } : {}),
          soft: false,
          source: "paste",
        });
      }
    });
    return out;
  }

  // A DATE WITH SOMETHING DUE ON IT.
  //
  // The choices on a row were all about what kind of DAY it is — off, no
  // lessons, in my week, standing in for another one — and the commonest thing
  // on a school calendar after a holiday is none of those. "Reports due, 2 Nov
  // 16:00" is a job with a deadline. There was no answer for it: you could book
  // yourself an hour to attend your own deadline, or throw the line away. This
  // app has had tasks with deadlines since the beginning; the calendar simply
  // could not reach them.
  //
  // Shaped here and made by the page, the same way toBlocks is — what a task
  // needs to look like is the store's business, not this file's.
  function toTasks(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.kind === "due" && r.date)
      .map((r) => ({
        title: r.label || "(no name)",
        date: r.date,
        // The time it is due BY, when the line gave one. A deadline at four in
        // the afternoon and one at the end of the day are different days.
        time: r.start || "",
      }));
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

  // DATED ROWS IN DATE ORDER, AND THE RULES THAT HAVE NO DATE AFTER THEM.
  //
  // Exported because this reader is no longer the only one that produces rows.
  // A model reads a document top to bottom and hands its entries back in the
  // order it met them, which on a real school calendar is nothing like date
  // order — the page then grouped them by month as it went and drew November,
  // October, December, October again, January, September. The grouping was not
  // wrong; it was being given a shuffled list. Sorted in the one place both
  // readings pass through, so neither can be the one that forgets.
  function inOrder(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) =>
      ((a.date ? 0 : 1) - (b.date ? 0 : 1)) ||
      String(a.date || "").localeCompare(String(b.date || "")));
  }

  function words(r, chosen, day) {
    const d = typeof day === "function" ? day : (x) => x;
    // A GRID WITH NO MONTH ON IT IS A QUESTION, NOT A FAILURE. Said even when
    // nothing else was read, because "no dates found" would be the wrong answer
    // to a page that is nothing but dates.
    const g = r.grid;
    const ask = g && !g.month
      ? "There's a month drawn as a grid in there, and nothing in the document says which month it is. " +
        "Pick one and its days will go in. "
      : "";
    if (ask && !r.rows.length) return ask.trim();
    if (!r.rows.length) return "No dates found in that. Anything without a date on the line is left alone.";
    // WHO READ IT CHANGES WHAT CAN HONESTLY BE SAID ABOUT IT.
    //
    // The provenance below — a year borrowed from elsewhere in the document, a
    // month worked out from the shape of a grid — is a description of how THIS
    // reader dated things. None of it is true of a reading the model did, and
    // saying it anyway would be describing one reading while showing another.
    // The term grid is not in that category: its marks come off the page
    // either way and are on screen either way, so that sentence stays.
    const mine = r.from !== "model";
    const list = chosen || r.rows;
    const decided = list.filter((x) => x.kind).length;
    // SAID FIRST, because a year that is quietly wrong makes every other number
    // here wrong too, and nothing else on the row would show it.
    // A DOCUMENT WITH TWO YEARS IN IT HAS NO RIGHT ANSWER, and the important
    // thing is that this is said rather than settled. A first-semester calendar
    // runs from one September to the next January; whichever year is filled in
    // for the lines that don't say one, the other end of it comes out twelve
    // months out, looking exactly as reasonable as the rest.
    const two = mine && r.twoYears && r.borrowed
      ? `This mentions ${r.years.slice(0, 3).join(" and ")}` +
        `${r.years.length > 3 ? " among others" : ""}, so no single year is right for all of it — ` +
        `move any row that's on the wrong side of New Year. `
      : "";
    let y = mine && r.borrowed
      ? `${r.borrowed} of them had no year on the line — read as ${r.year}. ` +
        (two || "Change the year if that's not right. ")
      : "";
    // SAID APART FROM THE REST, because it is a different answer to the same
    // question: those rows have no year on the line either, and they are not
    // the document's year — they are the year after it.
    if (mine && r.rolled)
      y += `${r.rolled === 1 ? "One more is" : `${r.rolled} more are`} read as ${r.year + 1}, ` +
        `because the line puts ${r.rolled === 1 ? "it" : "them"} after a later date. `;
    // A TERM DRAWN AS A GRID answers the year question by walking through it, so
    // it is said instead of the guessing above rather than as well as.
    if (r.term)
      y = `The term is drawn out as a grid too — ${r.term.weeks} weeks, ` +
        `${d(r.term.from)} to ${d(r.term.to)}${mine ? ", which is where the years came from" : ""}. ` +
        (r.term.marks.length
          ? `${r.term.marks.length} thing${r.term.marks.length === 1 ? " is" : "s are"} marked on it; ` +
            "they're under the dates below. "
          : "") + y;
    if (g && mine)
      y = `${g.squares} of them came off a month drawn as a grid, which says no month anywhere — ` +
        `read as ${MONTH_WORDS[g.month - 1]} ${r.year}. Change it if that's wrong. ` +
        (g.missing
          ? `${g.missing} square${g.missing === 1 ? "'s" : "s'"} number didn't survive the PDF, so ` +
            `what was in ${g.missing === 1 ? "it has" : "them has"} ended up on the day before. `
          : "") +
        y;
    // AND THE UNANSWERED MONTH IS STILL UNANSWERED even when something else was
    // read. It used to replace the whole sentence, so a sheet with a nameless
    // grid on it and thirty dated lines below said only "pick a month" and
    // never that the thirty had been read.
    y = ask + y;
    // SORTED INTO PILES ON THE PAGE, which says the count and what is to be
    // done with it in one sentence — so this one stops at what it alone knows,
    // which is where the years came from and when the lessons run.
    if (r.triaged) {
      const t0 = term(list);
      return (y + (t0 ? `Lessons run from ${d(t0.from)}${t0.to ? ` to ${d(t0.to)}` : " onwards"}.` : "")).trim();
    }
    if (!decided)
      return y + `${r.rows.length} date${r.rows.length === 1 ? "" : "s"} read. Say what each one is and they'll go in.`;
    const p = plan(list);
    const days = p.filter((x) => x.kind !== "lessons" && x.kind !== "due")
      .reduce((n, x) => n + x.days, 0);
    const t = term(list);
    return y + `${r.rows.length} date${r.rows.length === 1 ? "" : "s"} read, ${decided} of them said what they are` +
      (days && days !== decided ? ` — ${days} days in all.` : ".") +
      (t ? ` Lessons run from ${d(t.from)}${t.to ? ` to ${d(t.to)}` : " onwards"}.` : "");
  }

  window.OrganiserCalPlan = {
    dateIn, labelOf, alsoOn, underStem, docYear, docYears, atYear, read, inOrder, plan, span, term, toBlocks, toTasks, words, addDays,
    gridIn, gridCells, gridMonths, gridRows, MONTHS,
    weekGridIn, weekGridYears, weekGridMonths, weekGridMarks,
  };
})();
