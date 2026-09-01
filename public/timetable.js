// THE TIMETABLE, WHICHEVER SHAPE IT ARRIVED IN.
//
// A timetable is a GRID. Times down the side, days across the top, a lesson in
// each cell. That is true whether it came as a Word table, an Excel sheet, a
// PDF or a photograph of the staffroom wall, and it is not a list of sentences.
//
// It used to be read by the local model, which meant three things: no model, no
// timetable; no server, no timetable; and the same paste could come out
// differently twice. A grid does not need any of that. It needs the columns
// counted, which is arithmetic.
//
// THE OTHER SHAPE IS LINES — "Mon 09:00-09:45 P1 Maths" — because that is how
// people type one out by hand when they haven't got the table to hand. Both are
// read here, and which one it is comes from what the text looks like rather
// than from being asked.
//
// §0.2: nothing here knows what a lesson is. It finds times, days and whatever
// words sit next to them, and hands back blocks for you to check. The words in
// the cells are never read for meaning.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const LINE_BREAKS = /\r\n|\r|\n|\u000b|\u000c|\u2028|\u2029/;

  // Day names are part of a calendar's format, not domain vocabulary — the same
  // way month names are in the calendar reader, and a colon is in a time.
  // English only, because that is what these formats are.
  const DAYS = [
    ["sunday", "sun", "su"],
    ["monday", "mon", "mo", "m"],
    ["tuesday", "tues", "tue", "tu"],
    ["wednesday", "weds", "wed", "we", "w"],
    ["thursday", "thurs", "thur", "thu", "th"],
    ["friday", "fri", "fr", "f"],
    ["saturday", "sat", "sa"],
  ];

  // Which day is this word, if any? -1 for "not a day".
  function dayOf(word) {
    const w = String(word || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return -1;
    for (let i = 0; i < DAYS.length; i++) if (DAYS[i].includes(w)) return i;
    return -1;
  }

  // A time, in any of the ways one gets written. Returns "HH:MM" or "".
  function timeOf(raw) {
    const s = String(raw || "").trim();
    let m = /^(\d{1,2})[:.h](\d{2})\s*(am|pm)?$/i.exec(s);
    if (!m) m = /^(\d{1,2})\s*(am|pm)$/i.exec(s) ? [null, RegExp.$1, "00", RegExp.$2] : null;
    if (!m) return "";
    let h = Number(m[1]);
    const mins = Number(m[2]);
    // 23, NOT 24. This said 24, and dates.js and schedule.js both said 23 — so a
    // block written "24:00" was accepted here, stored, and then invisible
    // everywhere, because everything that draws a time refuses to draw that one.
    // Refused up front is worse for nobody and visible to everybody.
    if (!Number.isFinite(h) || !Number.isFinite(mins) || mins > 59 || h > 23) return "";
    const ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) return "";
    return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  // A span like "08:25-09:10", "8.25 – 9.10", "9:15 to 10:00". Returns
  // { start, end } or null.
  const DASH = "[-–—~]|\\bto\\b|\\buntil\\b";
  function spanIn(raw) {
    const s = String(raw || "").replace(/\u00a0/g, " ").trim();
    const m = new RegExp(
      `(\\d{1,2}\\s*[:.h]\\s*\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm))\\s*(?:${DASH})\\s*(\\d{1,2}\\s*[:.h]\\s*\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm))`,
      "i"
    ).exec(s);
    if (!m) return null;
    const start = timeOf(m[1].replace(/\s+/g, ""));
    const end = timeOf(m[2].replace(/\s+/g, ""));
    if (!start || !end || end <= start) return null;
    return { start, end };
  }

  // A TIME WITH NO END ON IT. "2:00 PM, staff photos" is a row of a schedule
  // like any other; a reader that only takes ranges swallows it into the entry
  // above as though it were a note about that one.
  //
  // AT THE FRONT OF THE LINE ONLY. "back by 3:30" inside a sentence is somebody
  // mentioning a time, and treating it as a new entry cuts the sentence in half.
  function startsAt(raw) {
    const s = String(raw || "").replace(/ /g, " ").trim();
    const m = /^(\d{1,2}\s*[:.h]\s*\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i.exec(s);
    return m ? timeOf(m[1].replace(/\s+/g, "")) || "" : "";
  }

  // An hour on from a time, stopping at the end of the day rather than wrapping
  // round into the next one.
  function anHourAfter(hm) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hm || ""));
    if (!m) return "";
    const at = Number(m[1]) * 60 + Number(m[2]) + 60;
    return at >= 24 * 60 ? "23:59" : `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
  }

  // ---- is that a place, or is it the thing itself? ---------------------------
  //
  // Not vocabulary this school uses — English words for kinds of place, in the
  // same bucket as the month names and "am". §0.2 is about not knowing what a
  // school calls its subjects and its classes; it is not a rule against knowing
  // what "corridor" means.
  //
  // AT THE END, NOT ANYWHERE. "Lunch & Campus Tour" has a place word in the
  // middle of it and is plainly a thing you do; "Riverside Auditorium" ends in
  // one and is plainly a room. Ending in one is the difference, and it is also
  // why "Classroom preparation" and "Office hours" stay as names, which is what
  // they are.
  const PLACE_WORD =
    /\b(rooms?|classrooms?|halls?|auditoriums?|annexe?s?|buildings?|blocks?|floors?|gates?|campus(?:es)?|labs?|laborator(?:y|ies)|librar(?:y|ies)|canteens?|cafeterias?|gyms?|gymnasiums?|theat(?:re|er)s?|studios?|cent(?:re|er)s?|wings?|playgrounds?|pitches?|courts?|offices?|entrances?|lobb(?:y|ies)|foyers?|stairs|corridors?|schools?|sites?|venues?|roads?|streets?|lanes?|avenues?)\s*$/i;
  // "LG1-02", "PS 116", "D406" — a short run of letters and digits and nothing
  // else. A shape, not a word: no list can hold every room number ever painted
  // on a door.
  //
  // THREE CHARACTERS WHEN IT IS ALL DIGITS, because the number at the bottom of
  // a page is also a short run of digits, and a page number read as a room puts
  // "3" in the where and marks the row as somewhere you have to be.
  const ROOM_CODE = /^[A-Za-z]{0,4}[ \-]?[A-Za-z]?\d{1,4}(?:\s*[-–]\s*\d{1,3})?$/;
  const roomCode = (s) => ROOM_CODE.test(s) && /\d/.test(s) && (/[A-Za-z]/.test(s) ? s.length >= 2 : s.length >= 3);
  // And two words that announce a place outright, wherever the rest of the line
  // goes. "Location dependent on PD choice" is not a room and is still the
  // answer to where, including the part where nobody knows yet.
  const SAYS_PLACE = /^(location|venue|where)\b\s*:?/i;
  function looksLikePlace(text) {
    // Brackets round the whole of it are punctuation, not part of the address.
    const s = String(text || "").trim().replace(/^[（(]\s*|\s*[)）]$/g, "").trim();
    if (!s || s.length > 70) return false;
    if (SAYS_PLACE.test(s)) return true;
    if (s.length <= 12 && roomCode(s)) return true;
    // Tried with two things taken off the end, because both of them sit AFTER
    // the word that says it is a place: the direction to it — "(Below D
    // building)" — and the room number, since "Example Building 102" is a
    // building with a room in it and "Primary School 1-3" is a school with a
    // wing in it.
    const noBracket = s.replace(/[（(][^)）]*[)）]\s*$/, "").trim();
    const noNumber = (t) =>
      t.replace(/[\s,\-–]*(?:no\.?\s*)?\d+(?:st|nd|rd|th)?(?:\s*[-–]\s*\d+)?\s*$/i, "").trim();
    return [s, noBracket, noNumber(s), noNumber(noBracket)].some((t) => PLACE_WORD.test(t));
  }

  // ---- who it is for is not what it is called --------------------------------
  //
  // A schedule's rows say WHO before they say WHAT as often as the other way
  // round, and read in order that gives you a week of meetings all called "All
  // Teachers". This is not the school's vocabulary: "all" and "every" are
  // English, and "grade"/"year" followed by a number is the shape every school
  // system writes a cohort in — the same kind of knowledge as the month names,
  // which this app has always had to have.
  //
  // AND NOTHING IS LOST BY BEING WRONG. A line skipped here still goes in the
  // note, and if the entry never finds another name it gets this one back.
  const FOR_WHOM = /^(?:all|every)\b|^(?:grades?|years?|yrs?|g)\s*\.?\s*\d/i;
  const looksLikeAudience = (line) => {
    const s = String(line || "").trim();
    return !!s && s.length <= 60 && FOR_WHOM.test(s);
  };

  // ---- splitting a pasted line into cells -----------------------------------
  //
  // Tabs if there are any — that is what a spreadsheet and a Word table both
  // paste as. Otherwise runs of two or more spaces, which is what a table looks
  // like once it has been through anything that flattens it.
  //
  // NOT TRIMMED FIRST. A row whose first cell is empty starts with a tab, and
  // trimming the line eats it and shifts every cell one to the left — which is
  // how a Monday lesson becomes a Sunday one.
  function cellsOf(line) {
    const raw = String(line || "").replace(/\u00a0/g, " ").replace(/\s+$/, "");
    if (raw.indexOf("\t") >= 0) return raw.split("\t").map((c) => c.trim());
    return raw.split(/ {2,}/).map((c) => c.trim());
  }

  // ---- the header row -------------------------------------------------------
  //
  // Which column is which day. Found by looking for a row with two or more day
  // names in it — a timetable has five, so this is not a close-run thing.
  function headerIn(rows) {
    let best = null;
    rows.forEach((cells, i) => {
      const found = [];
      cells.forEach((c, j) => {
        const d = dayOf(c);
        if (d >= 0) found.push({ col: j, day: d });
      });
      if (found.length >= 2 && (!best || found.length > best.found.length))
        best = { row: i, found };
    });
    return best;
  }

  // ---- reading a grid -------------------------------------------------------
  function readGrid(rows) {
    const head = headerIn(rows);
    const out = { shape: "grid", days: [], blocks: [], daysGuessed: false, note: "" };
    let cols;          // [{ col, day }]
    let headRow = -1;
    if (head) {
      cols = head.found;
      headRow = head.row;
    } else {
      // NO HEADER. Some timetables put the days in a picture, or the paste lost
      // the row. The columns are still there, so they are offered as the
      // working week in order — and said out loud, because it is a guess and it
      // is the one guess here that could silently shift every lesson by a day.
      const widest = rows.reduce((n, c) => Math.max(n, c.length), 0);
      if (widest < 2) return null;
      cols = [];
      for (let j = 1; j < widest && cols.length < 7; j++) cols.push({ col: j, day: cols.length + 1 });
      out.daysGuessed = true;
      out.note = "No row of day names was found, so the columns have been read as " +
        "Monday onwards, left to right. Check that before keeping it.";
    }
    // THE HEADER MAY HAVE LOST ITS LEADING EMPTY CELL.
    //
    // The day names sit above the lessons with a blank cell over the time
    // column, so that first cell is empty — and anything that trims a line, or
    // a PDF that simply drew nothing there, loses it. The header then starts at
    // column 0 while the body still starts with the time, and every lesson
    // lands a day early with nothing looking wrong.
    //
    // The tell is that no row has a time to the LEFT of the first day column,
    // which for a real timetable never happens. Shift and look again.
    for (let shift = 0; shift <= 2; shift++) {
      const first = Math.min(...cols.map((c) => c.col)) + shift;
      // A START ON ITS OWN COUNTS AS A TIME HERE TOO. Looking only for a full
      // span, a timetable whose left-hand column says "08:15" had no time
      // anywhere to the left of the days — so the shift was never found, and
      // the time column was read as Monday.
      const found = rows.some((cells, i) =>
        i !== headRow && cells.slice(0, first).some((c) => spanIn(c) || startsAt(c)));
      if (found) {
        if (shift) cols = cols.map((c) => ({ ...c, col: c.col + shift }));
        break;
      }
    }
    out.days = cols.map((c) => c.day);
    const firstDayCol = Math.min(...cols.map((c) => c.col));

    // THE TIME FOR EACH ROW, WORKED OUT FOR ALL OF THEM BEFORE ANY BLOCK IS
    // MADE — because a row that only says when it starts is finished by the row
    // underneath it.
    //
    // HALF THE TIMETABLES IN THE WORLD ARE WRITTEN THAT WAY. The left-hand
    // column says 08:15, 09:00, 09:55 and the end of each period is the start of
    // the next; nobody writes both. Read here as needing a range, every one of
    // those came out as NOTHING AT ALL — no header row wrong, no cell missed,
    // simply no timetable — and a photograph of a staffroom wall is the most
    // likely thing of all to be written that way.
    const spans = rows.map((cells, i) => {
      if (i === headRow) return null;
      // The time lives to the LEFT of the first day column — in a column of its
      // own, or next to a period number. Anything further left is a period name
      // and is not needed.
      for (let j = 0; j < firstDayCol && j < cells.length; j++) {
        const s = spanIn(cells[j]);
        if (s) return s;
      }
      for (let j = 0; j < firstDayCol && j < cells.length; j++) {
        const at = startsAt(cells[j]);
        if (at) return { start: at, end: "", lone: true };
      }
      return null;   // a row with no time in it is a heading or a note
    });
    spans.forEach((s, i) => {
      if (!s || !s.lone) return;
      // The next row that has a time, and is later in the day than this one. A
      // row that goes backwards is a new column of the same table, not the end
      // of this period.
      const next = spans.slice(i + 1).find((x) => x && x.start > s.start);
      s.end = next ? next.start : anHourAfter(s.start);
      s.endGuessed = !next;
    });

    rows.forEach((cells, i) => {
      if (i === headRow) return;
      const span = spans[i];
      if (!span || !span.end) return;
      cols.forEach(({ col, day }) => {
        const label = (cells[col] || "").trim();
        if (!label) return;              // an empty cell is a free period
        out.blocks.push({
          label: label.slice(0, 80),
          start: span.start,
          end: span.end,
          days: [day],
          // The last period of the day has no row under it to finish it, so an
          // hour is filled in and said out loud — see words().
          ...(span.endGuessed ? { endGuessed: true } : {}),
          soft: false,
          source: "paste",
        });
      });
    });
    return out.blocks.length ? out : null;
  }

  // ---- reading lines --------------------------------------------------------
  //
  // "Mon 09:00-09:45 P1 Maths", "Mon-Fri 12:00-13:00 Lunch", "Tuesday 2pm-3pm
  // duty". A day or a range of days, a span, and whatever is left is the name.
  function readLines(text) {
    const out = { shape: "lines", days: [], blocks: [], daysGuessed: false, note: "" };
    String(text || "").split(LINE_BREAKS).forEach((raw) => {
      const line = raw.replace(/\u00a0/g, " ").trim();
      if (!line) return;
      const span = spanIn(line);
      if (!span) return;
      const days = daysIn(line);
      if (!days.length) return;
      // Everything that isn't the days or the time is what it's called.
      const label = line
        .replace(new RegExp(`\\b[A-Za-z]{1,9}\\.?\\s*(?:${DASH})\\s*[A-Za-z]{1,9}\\b`, "gi"), (m) =>
          daysIn(m).length >= 2 ? " " : m)
        .replace(/\b[A-Za-z]{1,9}\b/g, (w) => (dayOf(w) >= 0 ? " " : w))
        .replace(new RegExp(
          `\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?\\s*(?:${DASH})\\s*\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?`, "gi"), " ")
        .replace(/[,;|\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
        .trim();
      if (!label) return;
      out.blocks.push({
        label: label.slice(0, 80),
        start: span.start,
        end: span.end,
        days,
        soft: false,
        source: "paste",
      });
    });
    out.days = [...new Set(out.blocks.flatMap((b) => b.days))].sort();
    return out.blocks.length ? out : null;
  }

  // Every day a line names, including ranges: "Mon-Fri", "Tue & Thu", "MWF".
  function daysIn(line) {
    const s = String(line || "");
    const found = new Set();
    // A range first, so "Mon-Fri" doesn't come out as two separate days.
    const range = new RegExp(`\\b([A-Za-z]{1,9})\\.?\\s*(?:${DASH})\\s*([A-Za-z]{1,9})\\b`, "gi");
    let m;
    while ((m = range.exec(s))) {
      const a = dayOf(m[1]);
      const b = dayOf(m[2]);
      if (a < 0 || b < 0) continue;
      for (let d = a, n = 0; n < 7; n++, d = (d + 1) % 7) {
        found.add(d);
        if (d === b) break;
      }
    }
    if (found.size) return [...found].sort((x, y) => x - y);
    (s.match(/\b[A-Za-z]{1,9}\b/g) || []).forEach((w) => {
      const d = dayOf(w);
      if (d >= 0) found.add(d);
    });
    return [...found].sort((x, y) => x - y);
  }

  // ---- an agenda ------------------------------------------------------------
  //
  // THE THIRD SHAPE, and the one a real document turned out to be. An
  // orientation schedule, a conference programme, an inset day: the time sits
  // on a line of its own and what happens at it follows underneath.
  //
  //     7:00-11:00
  //     Health Check
  //     (bring passport & ID photos)
  //     11:30-13:00
  //     Lunch Break & Campus Tour
  //
  // This is also what a two-column table collapses to when it goes through a
  // PDF, which is why it matters more than it looks: the columns are gone but
  // the ORDER survives, and the order is enough.
  //
  // It is a day, not a week — these are things happening once, on a date, so
  // they come back with no days on them and the date is asked for separately.
  function readAgenda(text, opts) {
    const o = opts || {};
    const out = { shape: "agenda", days: [], blocks: [], daysGuessed: false, note: "" };
    const lines = String(text || "").split(LINE_BREAKS)
      .map((l) => l.replace(/\u00a0/g, " ").trim()).filter(Boolean);
    // A date is what the reader uses to know a new day has started; if none is
    // given it just doesn't check.
    const C = window.OrganiserCalPlan;
    const dateOn = (l) => (C && C.dateIn(l, o.year || 2000)) || "";
    // AND A HEADING THAT NAMES A DAY WITHOUT DATING IT. "Sat/Sun", "Thursday" —
    // a new day has started and there is no way to know which one. Everything
    // under it belongs to a day nobody has said yet, and saying it belongs to
    // the day above is how an induction ends up half on the wrong morning.
    const dayHeading = (l) =>
      /^[A-Za-z]/.test(l) && !/\d/.test(l) && l.length <= 40 && daysIn(l).length > 0 &&
      l.replace(/[A-Za-z]+/g, (w) => (dayOf(w) >= 0 ? "" : w)).replace(/[\s\/&,\-–—+.]+/g, "") === "";
    // THE DAY BEING READ, WHICH IS NOT ALWAYS THE PAGE'S. One page a day is the
    // shape the first such document arrived in; the next one put five days on a
    // single page, and everything after the first heading landed on Wednesday.
    // A schedule that is confidently wrong about which morning you are expected
    // somewhere is worse than one that admits it doesn't know.
    let date = o.date || "";
    let open = null;
    let extra = 0;
    lines.forEach((line) => {
      // A line that is ONLY a time is a heading for what comes next. A line
      // with a time and words in it is an entry all by itself.
      const span = spanIn(line);
      // AND ONE THAT SAYS WHEN IT STARTS AND NOT WHEN IT ENDS. "2:00 PM, staff
      // photos" is an entry; a schedule that only takes ranges drops it, and it
      // is dropped INTO the entry above, where it reads as a detail of that one.
      // Only at the front of a line — a time in the middle of a sentence is
      // somebody mentioning a time, not a row of a table.
      const lone = span ? null : startsAt(line);
      if (span || lone) {
        const rest = line
          .replace(span
            ? new RegExp(`\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?\\s*(?:${DASH})\\s*\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?`, "i")
            : /^\s*\d{1,2}\s*[:.h]?\s*\d{0,2}\s*(?:am|pm)?/i, " ")
          // COMMAS TOO. "9:00 AM - 10:30 AM," left behind a lesson called ",".
          .replace(/\s{2,}/g, " ").replace(/^[\s\-–—:,.|\t]+|[\s\-–—:,|\t]+$/g, "").trim();
        // WHAT IS LEFT ON THE LINE IS SOMETIMES WHERE, NOT WHAT. One school
        // writes "TIME | TOPIC | … | LOCATION" and another writes "09:00 -
        // 10:15 - Example Lecture Hall", and read the same way the second gives you
        // a week of lessons called "Lecture Hall". A place moved out of the way
        // lets the name fall through to the line below it — and puts the room
        // where the app can use it, which is what makes the thing show as
        // somewhere you have to be rather than something you can do anywhere.
        const place = looksLikePlace(rest);
        open = { label: place ? "" : rest, where: place ? rest : "",
          // AN HOUR, WHEN THE DOCUMENT DIDN'T SAY. A block with no end has no
          // width and is thrown away when it is saved — so reading these and
          // then losing them on the way to the file is worse than not reading
          // them. An hour is filled in, the row is editable before it is kept,
          // and how many were guessed is said out loud.
          start: span ? span.start : lone, end: span ? span.end : anHourAfter(lone),
          ...(span ? {} : { endGuessed: true }),
          days: [], date, soft: false, source: "paste" };
        extra = 0;
        out.blocks.push(open);
        return;
      }
      // A NEW DAY STARTING, rather than more about the entry above. Checked
      // before anything else is done with the line, and whether or not an entry
      // is open: on a page holding a week, the heading for Thursday arrives in
      // the middle of Wednesday's last row.
      const said = dateOn(line);
      if (said) { date = said; open = null; return; }
      if (dayHeading(line)) { date = ""; open = null; return; }
      // Everything under a time belongs to it, until the next time. The FIRST
      // such line is what it's called; the rest is detail, and detail is not
      // dropped — "(bring passport and ID photos)" is the single most
      // important line on the page and belongs with the thing it is about.
      if (!open) return;
      // A LINE UNDER A BULLET IS STILL THE LINE. The dash a document draws in
      // front of a cell is not part of what the cell says.
      const said2 = line.replace(/^[-–—•*·▪]\s+/, "").trim();
      // THE ROOM IS USUALLY ON A LINE OF ITS OWN, and which line depends on how
      // the school laid the table out: right after the time in one document,
      // last in the row after who is running it in another. Any of them, while
      // nothing has claimed the place yet — a second place-shaped line is
      // detail rather than an overwrite.
      //
      // This is what makes the thing show as somewhere you have to be. Until it
      // did, a whole induction drew as though every session could be done from a
      // chair at home.
      //
      // AND AN ADDRESS CAN BE TWO CELLS. "Primary School 1-3" in the time cell
      // and "Auditorium 4th floor" under it are one place written across a line
      // break, so while nothing has been named yet a second place-shaped line
      // joins the first rather than becoming what the thing is called. After
      // there is a name, it is detail.
      if (looksLikePlace(said2) && (!open.where || !open.label)) {
        open.where = ((open.where ? open.where + " " : "") + said2).slice(0, 120);
        extra++;
        return;
      }
      if (!open.label) {
        if (looksLikeAudience(said2)) {
          // Kept, in both senses: it goes in the note like any other detail, and
          // it is remembered in case this entry never says what it is.
          if (!open.forWhom) open.forWhom = said2.slice(0, 80);
        } else {
          open.label = said2.slice(0, 80);
          return;
        }
      }
      // BUT THE LAST ENTRY ON A PAGE IS FOLLOWED BY THE PAGE. A footer, a
      // welcome paragraph, the date printed at the bottom — all of it sits
      // under the last time on the page and none of it is about that entry.
      // A row of a table is a few lines; a page of prose is not, so the detail
      // stops after a few.
      if (extra >= 6) { open = null; return; }
      extra++;
      // KEPT AS SEPARATE LINES. In the document these are separate cells — who
      // is running it, then where it is — and running them together makes
      // "Dave" and "TBA" into a person called Dave Tba. The line break is the
      // only thing left saying they are two different facts.
      open.note = ((open.note ? open.note + "\n" : "") + said2).slice(0, 300);
    });
    // AND IF NOTHING ELSE NAMED IT, WHAT WAS SKIPPED COMES BACK. Who it is for,
    // then where it is: a row that is a time and a room and nothing else is a
    // real row — "9:00 Library" — and reading the room as only a room would
    // throw the entry away for having no name. The place is kept in both, so it
    // still counts as somewhere you have to be.
    out.blocks.forEach((b) => {
      if (!b.label && b.forWhom) b.label = b.forWhom;
      if (!b.label && b.where) b.label = b.where;
      delete b.forWhom;
    });
    out.blocks = out.blocks.filter((b) => b.label);
    return out.blocks.length ? out : null;
  }

  // A DOCUMENT THAT IS SEVERAL DAYS LONG.
  //
  // An orientation schedule is one day a page, and the date for that day is
  // printed on it — so each page is read on its own and its entries get that
  // page's date. Read as one lump they would all run together with no way to
  // tell the first morning from the second.
  function fromPages(pages, opts) {
    const o = opts || {};
    const C = window.OrganiserCalPlan;
    const list = Array.isArray(pages) ? pages : [];
    const out = { shape: "agenda", days: [], blocks: [], daysGuessed: false, note: "", dates: [] };
    list.forEach((p) => {
      const text = String((p && p.text) || "");
      if (!text.trim()) return;
      // The date printed on this page. Anywhere on it — a schedule puts it in
      // the header, the footer or beside the title, and which is not knowable.
      const found = C ? C.read(text, o.year ? { year: o.year } : undefined) : { rows: [] };
      const date = found.rows.length ? found.rows[0].date : "";
      const got = readAgenda(text, { date, year: found.year });
      if (!got) return;
      if (date && out.dates.indexOf(date) < 0) out.dates.push(date);
      out.blocks = out.blocks.concat(got.blocks);
    });
    if (!out.blocks.length) return null;
    const undated = out.blocks.filter((b) => !b.date).length;
    if (undated)
      out.note = `${undated} of them didn't say which day they're on — the heading above them named a day without dating it, or there was no date at all. Say which day before keeping them.`;
    return out;
  }

  // ---- the front door -------------------------------------------------------
  //
  // Grid, lines or agenda: worked out from the text, never asked. A grid is
  // tried first because a grid read as anything else loses four days out of
  // five, while the others read as a grid simply find no time column and fall
  // through.
  function read(text) {
    const raw = String(text || "");
    const rows = raw.split(LINE_BREAKS).map(cellsOf).filter((c) => c.some((x) => x));
    const grid = rows.some((c) => c.length >= 2) ? readGrid(rows) : null;
    if (grid) return grid;
    const lines = readLines(raw);
    if (lines) return lines;
    // A PASTED AGENDA USES A DATE IN ITS OWN TEXT, if there is one — the same
    // rule fromPages() uses per page. Without it the entries have no day to
    // happen on, and something with no day is thrown away when it is saved.
    const C = window.OrganiserCalPlan;
    const found = C ? C.read(raw) : { rows: [] };
    const agenda = readAgenda(raw, found.rows.length
      ? { date: found.rows[0].date, year: found.year } : undefined);
    // A WEEKLY TIMETABLE WHOSE COLUMNS DIDN'T SURVIVE IS NOT AN AGENDA.
    //
    // readAgenda is the last thing tried and it is not fussy, because the
    // document it exists for — an orientation schedule, times down one side —
    // has no grid to find and often no dates either; you fill those in on the
    // way past. Handed a class timetable whose columns have been flattened away
    // it still produces something: one entry per period, named after whatever
    // text happened to follow the time, belonging to no day and no date.
    //
    // Which is worse than nothing, because it looks like an answer. Somebody
    // read in their week and got eight lessons all called the same thing, each
    // asking which single date it happened on — a question a weekly timetable
    // has no answer to. And a block with neither a day nor a date is thrown
    // away when it is saved, so every one of them was going to vanish anyway.
    //
    // WHAT TELLS THE TWO APART is written on the document. A week has its days
    // named across the top; an orientation schedule names one day, or none. So
    // a reading with no day and no date on any of it, out of a text that names
    // most of a week, is a grid that lost its columns — and saying that is
    // useful, where handing back the entries is not.
    const dated = agenda && agenda.blocks.some((b) => b.date || (b.days && b.days.length));
    if (agenda && (dated || namesAWeek(raw) < 3)) return agenda;
    return agenda
      ? { ...NOTHING, note: "columns" }
      : NOTHING;
  }

  // How much of a week a document names. Not per line — a flattened grid puts
  // each day on its own — so it is the count of DIFFERENT days anywhere in it.
  //
  // AND RUN TOGETHER TOO. A PDF that drew a table and put nothing between the
  // cells hands back "PeriodTimeMondayTuesdayWednesdayThursdayFriday", where
  // every day name is there and not one of them is a word. Written out in full
  // a day name is not a substring of anything else, so those can be found
  // without the word boundary that isn't there — which the short forms cannot,
  // since "sat" and "sun" live inside ordinary words.
  const WEEK_WORDS = /monday|tuesday|wednesday|thursday|friday|saturday|sunday/gi;
  function namesAWeek(text) {
    const raw = String(text || "");
    const seen = new Set();
    raw.split(LINE_BREAKS).forEach((l) => daysIn(l).forEach((d) => seen.add(d)));
    (raw.match(WEEK_WORDS) || []).forEach((w) => {
      const d = dayOf(w);
      if (d >= 0) seen.add(d);
    });
    return seen.size;
  }

  // THREE WAYS INTO A PDF, STRONGEST FIRST.
  //
  // The PDF's own positions, if it drew a table with them. Then the text, if it
  // still looks like a grid or a list. Then page by page as an agenda — a
  // schedule with the times down one side and a date printed on each page,
  // which is all that survives a PDF that positions every letter separately.
  //
  // THIS USED TO LIVE IN THE PAGE, in the one handler that had a PDF to hand.
  // Then a file could be DROPPED on the box as well as chosen, and the drop
  // handed over the text alone — so a timetable dropped rather than picked lost
  // its columns before anything looked at it, and a grid that reads perfectly
  // came out as prose. The two ways in are the same way in now.
  function bestOf(got) {
    const g = got || {};
    const byRows = g.rows && g.rows.length ? fromRows(g.rows) : null;
    const byText = read(g.text || "");
    return (byRows && byRows.blocks.length ? byRows : null) ||
      (byText.shape === "grid" || byText.shape === "lines" ? byText : null) ||
      (g.pages && g.pages.length ? fromPages(g.pages) : null) ||
      byText;
  }

  // ---- reading a PDF's own columns -----------------------------------------
  //
  // A PDF has no table, only words at coordinates. Read as text a timetable
  // comes out as one row of five lessons run together with nothing between
  // them, which is unreadable by anything. The positions ARE the columns, so
  // they are clustered back into columns here and then read as an ordinary
  // grid.
  //
  // TOLERANCE IS A FRACTION OF THE PAGE, not a number of points, because a
  // document scaled differently is the same table.
  const NOTHING = { shape: "none", days: [], blocks: [], daysGuessed: false, note: "" };

  // ARE THESE COLUMNS, OR ARE THEY LETTERS?
  //
  // Plenty of PDFs place every glyph separately — a real one turned "TIME" into
  // a cell saying "TIM" and a cell saying "E". Clustered, that produces a grid
  // of single characters and a confident answer made of nonsense, which is far
  // worse than admitting the layout is no use and reading the text instead.
  //
  // The tell is the size of the pieces. Columns hold words; a document that is
  // positioning letters hands back cells one or two characters long.
  function looksLikeColumns(rows) {
    const cells = rows.flatMap((r) => r.cells);
    if (cells.length < 4) return false;
    const short = cells.filter((c) => String(c.text || "").trim().length <= 2).length;
    return short / cells.length < 0.3;
  }

  function fromRows(pdfRows, opts) {
    const list = (Array.isArray(pdfRows) ? pdfRows : []).filter((r) => r && r.cells && r.cells.length);
    if (!list.length) return NOTHING;
    if (!looksLikeColumns(list)) return { ...NOTHING, note: "glyphs" };
    const xs = list.flatMap((r) => r.cells.map((c) => Number(c.x) || 0));
    const spread = Math.max(...xs) - Math.min(...xs);
    const tol = Math.max(4, spread * ((opts && opts.tolerance) || 0.02));
    // Cluster the x positions: anything within a tolerance of a known column
    // belongs to it.
    const centres = [];
    [...xs].sort((a, b) => a - b).forEach((x) => {
      const last = centres[centres.length - 1];
      if (last !== undefined && x - last <= tol) return;
      centres.push(x);
    });
    const colOf = (x) => {
      let best = 0, gapTo = Infinity;
      centres.forEach((c, i) => {
        const d = Math.abs(c - x);
        if (d < gapTo) { gapTo = d; best = i; }
      });
      return best;
    };
    const rows = list.map((r) => {
      const cells = [];
      r.cells.forEach((c) => {
        const j = colOf(Number(c.x) || 0);
        cells[j] = ((cells[j] ? cells[j] + " " : "") + String(c.text || "")).trim();
      });
      for (let j = 0; j < cells.length; j++) if (cells[j] === undefined) cells[j] = "";
      return cells;
    });
    const grid = readGrid(rows);
    return grid || read(rows.map((c) => c.join("\t")).join("\n"));
  }

  // Plain words for the preview: what it found and what it is unsure of.
  function words(r) {
    if (!r || !r.blocks.length)
      return "Nothing in there looked like a timetable. A grid with the times down " +
        "one side and the days across the top is what it reads best.";
    const days = r.days.length;
    // "BLOCKS", NOT "LESSONS". This file says at the top that nothing in it
    // knows what a lesson is — and then told you it had read twenty-one of
    // them, when five were form time, two were duties and two were meetings.
    // Blocks is what the code calls them and what the save button says.
    const guessed = r.blocks.filter((b) => b.endGuessed).length;
    // A DOCUMENT'S OWN TYPO, WHICH THE APP HAS NO BUSINESS CORRECTING AND EVERY
    // BUSINESS POINTING AT. One of these said "10:00 AM - 11:30 PM" for what was
    // plainly a morning, and drawn straight it swallowed the whole day.
    const long = r.blocks.filter((b) => {
      const a = timeOf(b.start), z = timeOf(b.end);
      if (!a || !z) return false;
      const mins = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
      return mins(z) - mins(a) > 8 * 60;
    }).length;
    return `${r.blocks.length} block${r.blocks.length === 1 ? "" : "s"} read` +
      (days ? `, across ${days} day${days === 1 ? "" : "s"}` : "") + ". " +
      (r.note ? r.note + " " : "") +
      (guessed
        ? `${guessed} of them didn't say when they end — an hour is filled in, change any that are wrong. `
        : "") +
      (long
        ? `${long} of them ${long === 1 ? "runs" : "run"} for more than eight hours, which is usually a typo in the document. `
        : "") +
      "Check them and take out anything that shouldn't be there.";
  }

  window.OrganiserTimetable = {
    DAYS, dayOf, timeOf, spanIn, cellsOf, daysIn, headerIn, readGrid, readLines,
    read, readAgenda, fromPages, fromRows, bestOf, words, anHourAfter, looksLikePlace,
  };
})();
