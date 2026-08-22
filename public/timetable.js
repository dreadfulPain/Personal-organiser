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
    const hasDate = (l) => !!(C && C.dateIn(l, o.year || 2000));
    let open = null;
    let extra = 0;
    lines.forEach((line) => {
      // A line that is ONLY a time is a heading for what comes next. A line
      // with a time and words in it is an entry all by itself.
      const span = spanIn(line);
      if (span) {
        const rest = line
          .replace(new RegExp(`\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?\\s*(?:${DASH})\\s*\\d{1,2}\\s*[:.h]?\\s*\\d{0,2}\\s*(?:am|pm)?`, "i"), " ")
          .replace(/\s{2,}/g, " ").replace(/^[\s\-–—:|\t]+|[\s\-–—:|\t]+$/g, "").trim();
        open = { label: rest, start: span.start, end: span.end, days: [], date: o.date || "",
          soft: false, source: "paste" };
        extra = 0;
        out.blocks.push(open);
        return;
      }
      // Everything under a time belongs to it, until the next time. The FIRST
      // such line is what it's called; the rest is detail, and detail is not
      // dropped — "(bring passport and ID photos)" is the single most
      // important line on the page and belongs with the thing it is about.
      if (!open) return;
      if (!open.label) { open.label = line.slice(0, 80); return; }
      // BUT THE LAST ENTRY ON A PAGE IS FOLLOWED BY THE PAGE. A footer, a
      // welcome paragraph, the date printed at the bottom — all of it sits
      // under the last time on the page and none of it is about that entry.
      // A row of a table is a few lines; a page of prose is not, so the detail
      // stops after a few, and stops dead at a date, which is a new day
      // starting rather than more about this one.
      if (hasDate(line) || extra >= 6) { open = null; return; }
      extra++;
      // KEPT AS SEPARATE LINES. In the document these are separate cells — who
      // is running it, then where it is — and running them together makes
      // "Dave" and "TBA" into a person called Dave Tba. The line break is the
      // only thing left saying they are two different facts.
      open.note = ((open.note ? open.note + "\n" : "") + line).slice(0, 300);
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
      out.note = `${undated} of them had no date on their page — say which day they're on before keeping them.`;
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
    if (agenda) return agenda;
    return NOTHING;
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
    return `${r.blocks.length} block${r.blocks.length === 1 ? "" : "s"} read` +
      (days ? `, across ${days} day${days === 1 ? "" : "s"}` : "") + ". " +
      (r.note ? r.note + " " : "") +
      "Check them and take out anything that shouldn't be there.";
  }

  window.OrganiserTimetable = {
    DAYS, dayOf, timeOf, spanIn, cellsOf, daysIn, headerIn, readGrid, readLines,
    read, readAgenda, fromPages, fromRows, words,
  };
})();
