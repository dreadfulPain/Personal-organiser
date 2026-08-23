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
    // 24 August 2026 / 24 Aug 26 / 24th August
    let hit = firstMonthMatch(s, /\b(\d{1,2})(?:st|nd|rd|th)?(?!\d)\s+([A-Za-z]{3,9})\.?\s*(\d{2,4})?\b/g, 2);
    if (hit) return at(hit.m, iso(year(hit.m[3], defaultYear), hit.mo + 1, +hit.m[1]));
    // August 24, 2026 / Aug 24
    hit = firstMonthMatch(s, /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)\s*,?\s*(\d{2,4})?\b/g, 1);
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

  const hasYearOnIt = (line) => /\b(?:19|20|21)\d{2}\b/.test(String(line || ""));

  // EVERY LINE WITH A DATE IN IT. Lines without one are headings, page numbers
  // or notes, and are left alone rather than guessed at.
  function read(text, opts) {
    const o = opts || {};
    const all = String(text || "");
    // Yours if you said one, otherwise the document's own, otherwise this year.
    const fromDoc = docYear(all);
    const useYear = Number(o.year) || fromDoc || new Date().getFullYear();
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
    // Two entries for the same day is a calendar listing it twice, not two
    // events; the later line wins because it is usually the more specific one.
    const byDate = new Map();
    rows.forEach((r) => byDate.set(r.date + "|" + r.label.toLowerCase(), r));
    return {
      rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      read: rows.length,
      year: useYear,
      yearFromDoc: fromDoc || 0,
      // How many rows are leaning on a year that wasn't on their own line.
      borrowed: rows.filter((r) => r.yearAssumed).length,
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
  function words(r, chosen, day) {
    const d = typeof day === "function" ? day : (x) => x;
    if (!r.rows.length) return "No dates found in that. Anything without a date on the line is left alone.";
    const list = chosen || r.rows;
    const decided = list.filter((x) => x.kind).length;
    // SAID FIRST, because a year that is quietly wrong makes every other number
    // here wrong too, and nothing else on the row would show it.
    const y = r.borrowed
      ? `${r.borrowed} of them had no year on the line — read as ${r.year}. ` +
        "Change the year if that's not right. "
      : "";
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
    dateIn, labelOf, docYear, read, plan, span, term, toBlocks, words, addDays,
  };
})();
