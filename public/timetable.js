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
    if (!Number.isFinite(h) || !Number.isFinite(mins) || mins > 59 || h > 24) return "";
    const ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 24) return "";
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
      const found = rows.some((cells, i) =>
        i !== headRow && cells.slice(0, first).some((c) => spanIn(c)));
      if (found) {
        if (shift) cols = cols.map((c) => ({ ...c, col: c.col + shift }));
        break;
      }
    }
    out.days = cols.map((c) => c.day);
    const firstDayCol = Math.min(...cols.map((c) => c.col));

    rows.forEach((cells, i) => {
      if (i === headRow) return;
      // The time for this row lives to the LEFT of the first day column — in a
      // column of its own, or next to a period number. Anything further left is
      // a period name and is not needed.
      let span = null;
      for (let j = 0; j < firstDayCol && j < cells.length; j++) {
        const s = spanIn(cells[j]);
        if (s) { span = s; break; }
      }
      if (!span) return;   // a row with no time in it is a heading or a note
      cols.forEach(({ col, day }) => {
        const label = (cells[col] || "").trim();
        if (!label) return;              // an empty cell is a free period
        out.blocks.push({
          label: label.slice(0, 80),
          start: span.start,
          end: span.end,
          days: [day],
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

  // ---- the front door -------------------------------------------------------
  //
  // Grid or lines: worked out from the text, never asked. A grid is tried first
  // because a grid read as lines loses four days out of five, while lines read
  // as a grid simply find no time column and fall through.
  function read(text) {
    const raw = String(text || "");
    const rows = raw.split(LINE_BREAKS).map(cellsOf).filter((c) => c.some((x) => x));
    const grid = rows.some((c) => c.length >= 2) ? readGrid(rows) : null;
    if (grid) return grid;
    const lines = readLines(raw);
    if (lines) return lines;
    return { shape: "none", days: [], blocks: [], daysGuessed: false, note: "" };
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
  function fromRows(pdfRows, opts) {
    const list = (Array.isArray(pdfRows) ? pdfRows : []).filter((r) => r && r.cells && r.cells.length);
    if (!list.length) return { shape: "none", days: [], blocks: [], daysGuessed: false, note: "" };
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
    return `${r.blocks.length} lesson${r.blocks.length === 1 ? "" : "s"} read` +
      (days ? `, across ${days} day${days === 1 ? "" : "s"}` : "") + ". " +
      (r.note ? r.note + " " : "") +
      "Check them and take out anything that shouldn't be there.";
  }

  window.OrganiserTimetable = {
    DAYS, dayOf, timeOf, spanIn, cellsOf, daysIn, headerIn, readGrid, readLines,
    read, fromRows, words,
  };
})();
