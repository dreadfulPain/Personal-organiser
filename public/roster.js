// A CLASS LIST, PASTED IN.
//
// The register arrives as a spreadsheet and always has. Typing twenty-four
// names into a box one at a time is the longest single job in setting this app
// up — longer than the timetable, the calendar, the skills and the syllabus put
// together — and the data is already sitting there in two clean columns.
//
// So: select the cells, copy, paste. That is the whole feature.
//
// WHAT COMES OUT OF A SPREADSHEET is tab-separated, one row per line. What
// comes out of a saved file is comma-separated and may be quoted. What comes
// out of a printed list is often numbered. All three land here, and none of
// them is a format anybody should have to know about.
//
// WHICH COLUMN IS WHICH IS NOT GUESSED. "Wang, Wei" and "Wang Wei, 9A" are the
// same shape and mean completely different things, and an app that decides for
// itself will one day import a class where every surname is a form group. So
// the columns are numbered, a sensible default is offered, and the preview
// shows what you would actually get. Choosing is one tap and only needed when
// the guess is wrong.
//
// §0.2: this knows nothing about schools. It reads a list of people with an
// optional label attached to each, and the caller decides what the label means.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Every way a line can end, same as the other readers here — a list pasted
  // out of a word processor carries the same odd separators a plan does.
  const LINE_BREAKS = /\r\n|\r|\n|\u000b|\u000c|\u2028|\u2029/;

  // ONE ROW, SPLIT INTO CELLS.
  //
  // Tabs win when present, because that is what a spreadsheet paste is and it
  // is unambiguous. Commas and semicolons are the fallback, with quotes
  // honoured so "Wang, Wei" stays one cell when it was written as one.
  function cells(line) {
    if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
        continue;
      }
      if (!quoted && (ch === "," || ch === ";")) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  // Leading numbering from a printed list: "1.", "1)", "01 ". Never touches a
  // name that happens to start with a digit and no separator.
  // No trim here: this runs on the whole line, and trimming it would eat a
  // leading tab — which is exactly how a row with an empty name cell shifts
  // left and turns a form group into a person. Cells are trimmed individually.
  const unnumber = (s) => String(s).replace(/^[ \t]*\d{1,3}\s*[.)\]][ \t]+/, "");

  // A header row names its columns rather than being one of them. Recognised
  // only to be SKIPPED — the words are not used to decide anything, because
  // they would have to be English to work and that is not a safe assumption.
  function looksLikeHeader(row) {
    const words = row.map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
    const known = ["name", "student", "pupil", "fullname", "class", "group", "form", "set", "id", "no"];
    const hits = words.filter((w) => known.includes(w)).length;
    return hits >= 1 && hits >= Math.ceil(row.filter(Boolean).length / 2);
  }

  // THE ROWS, as a grid. No decision about meaning is taken here at all.
  function grid(text) {
    const rows = String(text || "")
      .split(LINE_BREAKS)
      // TRIMMING THE LINE WOULD EAT THE COLUMN. A spreadsheet row whose first
      // cell is empty pastes as "\t9A", and trimming that leaves "9A" — one
      // cell, in the name column, so a form group quietly becomes a person.
      // Each CELL is trimmed instead, which is where trimming belongs.
      .map((l) => l.replace(/\u00a0/g, " ").replace(/\r/g, ""))
      .filter((l) => l.trim())
      .map((l) => cells(unnumber(l)).map((c) => c.replace(/\s+/g, " ").trim()));
    const header = rows.length && looksLikeHeader(rows[0]) ? rows[0] : null;
    const body = header ? rows.slice(1) : rows;
    return {
      header,
      rows: body,
      columns: body.reduce((n, r) => Math.max(n, r.length), 0),
    };
  }

  // WHICH COLUMN LOOKS LIKE A NAME, and which looks like a label.
  //
  // Offered as a starting point, never applied without being shown. The signal
  // is repetition: a class of twenty-four has twenty-four different names and
  // one or two group labels, so the column with the fewest distinct values is
  // almost certainly the group. Nothing here reads the words themselves.
  function suggest(g) {
    if (!g.columns) return { name: 0, group: -1 };
    const distinct = [];
    for (let c = 0; c < g.columns; c++) {
      const vals = g.rows.map((r) => (r[c] || "").trim()).filter(Boolean);
      distinct.push({ c, filled: vals.length, uniq: new Set(vals).size });
    }
    const usable = distinct.filter((d) => d.filled >= Math.max(1, g.rows.length * 0.5));
    if (!usable.length) return { name: 0, group: -1 };
    // Most distinct values = the names.
    const name = usable.slice().sort((a, b) => b.uniq - a.uniq || a.c - b.c)[0].c;
    // Fewest = the group, but only if it really does repeat; a second column of
    // all-different values is something else entirely and is left alone.
    const rest = usable.filter((d) => d.c !== name).sort((a, b) => a.uniq - b.uniq || a.c - b.c);
    const group = rest.length && rest[0].uniq < g.rows.length ? rest[0].c : -1;
    return { name, group };
  }

  // Fold for comparison only. Never stored, never shown — the name you typed is
  // the name that is kept, spacing and capitals and all.
  const fold = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

  // WHAT YOU WOULD ACTUALLY GET, before anything is kept.
  //
  // Returns every row with what it would become and why it might not — an empty
  // name, a repeat inside the paste itself, or somebody already on your list.
  // Nothing is filtered out silently: a row that will be skipped is shown
  // saying so, because a count that quietly drops three people is worse than
  // no import at all.
  function read(text, opts) {
    const o = opts || {};
    const g = grid(text);
    const pick = o.name === undefined && o.group === undefined ? suggest(g) : { name: o.name || 0, group: o.group === undefined ? -1 : o.group };
    const already = new Set(
      (Array.isArray(o.existing) ? o.existing : [])
        .filter(Boolean)
        .map((c) => `${fold(c.name)}|${fold(c.group)}`)
    );
    const seen = new Set();
    const rows = g.rows.map((r) => {
      const name = (r[pick.name] || "").trim();
      const group = pick.group >= 0 ? (r[pick.group] || "").trim() : (o.fallbackGroup || "").trim();
      const key = `${fold(name)}|${fold(group)}`;
      let skip = "";
      if (!name) skip = "no name in that column";
      else if (seen.has(key)) skip = "same name twice in what you pasted";
      else if (already.has(key)) skip = "already on your list";
      if (!skip) seen.add(key);
      return { name, group, skip, cells: r };
    });
    return {
      ...g,
      pick,
      rows,
      adding: rows.filter((r) => !r.skip),
      skipping: rows.filter((r) => r.skip),
    };
  }

  // Plain words for the top of the preview. Counts, and what will be left out.
  function words(r) {
    if (!r.rows.length) return "Nothing read out of that yet.";
    const bits = [`${r.adding.length} to add`];
    const dup = r.skipping.filter((x) => /twice/.test(x.skip)).length;
    const had = r.skipping.filter((x) => /already/.test(x.skip)).length;
    const blank = r.skipping.filter((x) => /no name/.test(x.skip)).length;
    if (had) bits.push(`${had} already on your list`);
    if (dup) bits.push(`${dup} repeated in the paste`);
    if (blank) bits.push(`${blank} with nothing in the name column`);
    return bits.join(" · ") + ".";
  }

  // DOES THIS READ AS A REGISTER RATHER THAN A LIST OF JOBS?
  //
  // The capture bar sits on every page, People included, and somebody who
  // scrolls up on that page finds a big box asking what's on their mind. Paste a
  // register into it and you got one task per child, named after the child —
  // twenty-four to-dos called "Li Wei 9A", with children's names now living in
  // the task list instead of the one page that warns you what a synced folder
  // means for them.
  //
  // This file already knows what a register looks like, because reading one is
  // its whole job. Asked here, the front door gets the same answer the People
  // page gets rather than working out its own.
  //
  // DELIBERATELY HARD TO TRIGGER. Saying this over a real list of jobs is worse
  // than never saying it — it would send somebody to People to fix something
  // that was already right. So all of it has to hold at once: several rows, laid
  // out in columns the way a spreadsheet pastes, every row the same shape, no
  // row that reads as a job, and nothing anywhere carrying a date or a time. A
  // register has no deadlines in it; a list of jobs nearly always has one.
  //
  // And it only ever OFFERS. Nothing is moved and nothing is refused — the cards
  // are still there if a list of names really was a list of jobs.
  function looksLikeRegister(text, items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length < 3) return false;
    if (list.some((m) => m && (m.date || m.time || m.promisedTo || m.waitingOn))) return false;
    // "Email Li Wei" is a job about a person, not a person.
    const Q = typeof window !== "undefined" && window.OrganiserQuickParse;
    if (Q && list.some((m) => Q.startsWithDoing(m && m.title))) return false;
    const g = grid(text);
    if (!g || g.columns < 2 || g.rows.length < 3) return false;
    return g.rows.every(
      (r) => r.length === g.columns && r.every((c) => c && c.split(/\s+/).length <= 4)
    );
  }

  window.OrganiserRoster = { grid, cells, suggest, read, words, looksLikeRegister };
})();
