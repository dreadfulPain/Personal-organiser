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

  // A NAME WITH THEIR JOB UNDERNEATH IT — the other shape a list of people comes in.
  //
  // Everything above reads a REGISTER: one person per line, or two columns. That
  // is not how anybody writes down the people they meet. A staff meeting slide,
  // an org chart, a conference programme, the "who's who" page of a handbook —
  // all of them are a name, and then what they do, as bullets under it:
  //
  //     Ms. A. Example:
  //     - Principal of Somewhere High School
  //     - Master Teacher of Mathematics
  //     - Director of the County Mathematical Society
  //
  // Read as a register that is FOUR PEOPLE, one of them called "- Master Teacher
  // of Mathematics", and the app says "4 to add." with every confidence.
  //
  // WHAT MARKS THE DIFFERENCE IS SHAPE, NOT WORDS (§0.2). A bullet, or an
  // indent, means "this line belongs to the one above". Nothing here knows what
  // a principal is, or a school, or that any of these words are job titles —
  // only that a line hanging off another line is not a person.
  const BULLET = /^\s*[-–—•*·▪]\s+/;
  const INDENTED = /^(?:\t| {2,})\S/;
  const under = (line) => BULLET.test(line) || INDENTED.test(line);
  // "Ms. A. Example:" — the colon is punctuation introducing the list, not
  // part of anybody's name.
  const asHeading = (line) => String(line).trim().replace(/[:：]\s*$/, "").trim();

  // TWO NAMES, ONE PERSON, WRITTEN THE WAY SLIDES WRITE IT.
  // "Mr. C. Instance (Principal Robin)" is one man with an English name his
  // students use — exactly the case the app already handles once you tell it,
  // and here it is being told, in the brackets.
  const ALIAS = /^(.*?)\s*[（(]([^)）]{2,40})[)）]\s*$/;
  // AND OFTEN THREE. In an international school somebody has their name in
  // characters, the pinyin of it, and an English name they picked — and a slide
  // will put two of those in one bracket: "(王伟 / Jason)". Kept as one string
  // that is neither of them, "Jason" on its own then matches nobody.
  const ALSO_SEP = /\s*[\/、,;，；]\s*|\s+\|\s+/;

  // NAME AND NAME, SIDE BY SIDE, NO BRACKETS AT ALL — "Wang Wei 王伟", which is
  // how most Chinese school documents write it. One person, two scripts, and
  // splitting on where the script changes needs no vocabulary at all: it is the
  // boundary between two writing systems, the same kind of fact as a colon.
  const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]+/;
  const LATIN_RUN = /[A-Za-zÀ-ɏ]{2,}/;
  function splitScripts(name) {
    const s = String(name || "").trim();
    if (!CJK_RUN.test(s) || !LATIN_RUN.test(s)) return null;
    // Only where they are separate words. "李Anna" written solid is one token
    // somebody chose to write that way, and cutting it would be inventing.
    const parts = s.split(/\s+/);
    const cjk = parts.filter((p) => CJK_RUN.test(p));
    const latin = parts.filter((p) => !CJK_RUN.test(p));
    if (!cjk.length || !latin.length) return null;
    // Whichever the slide put first is the name; the other is what they are
    // also written as. Nothing here decides which is somebody's "real" name.
    const cjkFirst = s.indexOf(cjk[0]) < s.indexOf(latin[0]);
    return cjkFirst
      ? { name: cjk.join(" "), also: [latin.join(" ")] }
      : { name: latin.join(" "), also: [cjk.join(" ")] };
  }

  // ONE PERSON'S NAME, HOWEVER IT WAS WRITTEN. Used wherever a name arrives on
  // a line of its own — off a slide, or out of the "Name" column of a table.
  // Both meet the same person written the same three ways, so both ask here.
  function personFrom(head) {
    const m = ALIAS.exec(String(head || "").trim());
    const plain = (m ? m[1] : String(head || "")).trim();
    const bracketed = m ? m[2].split(ALSO_SEP).map((x) => x.trim()).filter(Boolean) : [];
    const scripts = splitScripts(plain);
    return {
      name: scripts ? scripts.name : plain,
      aka: [...(scripts ? scripts.also : []), ...bracketed].filter(Boolean).slice(0, 8),
    };
  }

  function cardsIn(text) {
    const lines = String(text || "").split(LINE_BREAKS).filter((l) => l.trim());
    const out = [];
    let cur = null;
    lines.forEach((raw) => {
      if (under(raw) && cur) {
        cur.roles.push(raw.replace(BULLET, "").trim());
        return;
      }
      // A NEW HEADING. A line with nothing under it yet is a candidate; whether
      // it turns out to be a person is decided at the end, by whether anything
      // hung off it.
      const head = asHeading(raw);
      if (!head) return;
      cur = { ...personFrom(head), roles: [] };
      out.push(cur);
    });
    // ONLY THE ONES THAT ACTUALLY HAD SOMETHING UNDER THEM. A plain list of
    // names with no bullets is a register, and the register reader is better at
    // it — this must not quietly take that job over.
    return out.filter((c) => c.name && c.roles.length);
  }

  // ---- A CONTACTS TABLE THAT HAS BEEN THROUGH A PDF -------------------------
  //
  // The third shape, and the one that matters most on the day you arrive: the
  // "who to contact" page of a staff handbook. Twenty people, their job, their
  // email and their WeChat, in a four-column table — and out of a PDF a table
  // has no columns. Every cell comes back on a line of its own, in reading
  // order, and a cell too wide for its column comes back on TWO:
  //
  //     Section Leads               ← the table's own title
  //     Name                        ← and its column headings
  //     Email
  //     WeChat ID
  //     Grades 1-3 Liaison          ← then four lines per person
  //     Alex Sample
  //     a.sample@example.org
  //     asample
  //     Grades 1-5 Riverside        ← except when a cell wrapped, and then five
  //     Liaison
  //     Blair Instance
  //     blair.instance@example.com
  //     BlairI
  //
  // Neither reader above sees anything here. The register reader wants columns
  // and finds one; the card reader wants a bullet and finds none. So this page
  // — the single most useful page in the booklet for somebody who has just
  // arrived and knows nobody — came through as nothing at all.
  //
  // THE HEADING ROW IS WHAT MAKES IT READABLE. It says how many columns there
  // are and what each of them holds, which is exactly what the PDF threw away.
  // Everything else here follows from that: the lines are dealt out N at a time,
  // and where a row doesn't fit, the column that wrapped is found by asking
  // which arrangement makes every cell make sense.
  //
  // §0.2: the column NAMES are read off the document, not known in advance. The
  // handful of words below is only how a heading announces what kind of thing a
  // column holds — an address, a handle, a number — the same order of knowledge
  // as knowing that a comma separates cells.
  const COLUMN_KIND = [
    [/^(name|full name|names?)$/i, "name"],
    [/^(e-?mail(\s*address)?|address)$/i, "email"],
    [/^(we-?chat( id)?|wei-?xin|qq|line|whats-?app|telegram|handle|username|user|id)$/i, "handle"],
    [/^(phone|mobile|tel(ephone)?|number|extension|ext\.?|contact number)$/i, "phone"],
    [/^(role|title|job|position|post|department|dept\.?|team|subject|grade|notes?)$/i, "other"],
  ];
  const kindOf = (head) => {
    const h = String(head || "").trim().replace(/[:：]\s*$/, "");
    for (const [re, kind] of COLUMN_KIND) if (re.test(h)) return kind;
    return "";
  };

  const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  // What a cell of each kind has to look like for a row to be believed. The
  // first column has no heading of its own — it is whatever the table is a
  // table OF — so anything short will do for it. Short, because a paragraph of
  // prose after the last row is not a row.
  function fitsKind(kind, text, loose) {
    const s = String(text || "").trim();
    if (!s || s.length > 70) return false;
    // AN ADDRESS THE DOCUMENT ITSELF GOT WRONG is still the only address there
    // is. One of these had lost its "@" before the file was ever made; refusing
    // it lost the person, and the two people listed after them as well. Taken
    // as written, on the last pass only, so a real address always wins first.
    if (kind === "email") return loose ? !/\s/.test(s) : EMAIL.test(s);
    if (kind === "handle") return !/\s/.test(s) && s.length >= 2 && s.length <= 40 && !EMAIL.test(s);
    if (kind === "phone") return /\d/.test(s) && !/[A-Za-z]{4,}/.test(s);
    // A NAME IS SHORT AND IS NOT AN ADDRESS. Deliberately loose otherwise: this
    // is a list of people the reader has never heard of, written in whatever
    // script and order the school writes them in.
    if (kind === "name") return !/@/.test(s) && s.length <= 40 && s.split(/\s+/).length <= 5;
    return true;
  }
  // Which columns are allowed to have wrapped. On the first pass, only the ones
  // that can be long: a person's name and their WeChat handle are sized to fit
  // and a job description is not, so when a row is a line too long it is the job
  // that ran over. Getting this the other way round produced somebody called
  // "Liaison Blair Instance".
  const CAN_WRAP = { "": true, other: true, email: true };
  // An address never has a space in it, so its pieces go back together with
  // nothing between them; everything else is words, which take a space.
  const glue = (kind, parts) => parts.join(kind === "email" ? "" : " ").trim();

  // Deal `lines` out into one row of `kinds`, allowing any one cell to have
  // wrapped onto following lines. Returns the cells and how many lines it used,
  // or null if no arrangement works.
  //
  // SMALLEST FIRST. A row that fits exactly is the row; only when it cannot be
  // made to fit is a wrap looked for, so an ordinary table is never re-read as a
  // wrapped one.
  function dealRow(lines, kinds) {
    const most = Math.min(lines.length, kinds.length + 3);
    // Three passes, each giving up something: which columns may have wrapped,
    // and then whether an address has to look like one.
    for (const how of [{}, { anyWrap: true }, { loose: true }, { anyWrap: true, loose: true }])
      for (let take = kinds.length; take <= most; take++) {
        const found = arrange(lines.slice(0, take), kinds, how);
        if (found) return { cells: found, used: take };
      }
    return null;
  }
  function arrange(part, kinds, how) {
    if (!kinds.length) return part.length ? null : [];
    const spare = how.anyWrap || CAN_WRAP[kinds[0]] ? part.length - kinds.length : 0;
    for (let n = 1; n <= 1 + Math.max(0, spare); n++) {
      const head = glue(kinds[0], part.slice(0, n));
      if (!fitsKind(kinds[0], head, how.loose)) continue;
      const rest = arrange(part.slice(n), kinds.slice(1), how);
      if (rest) return [head, ...rest];
    }
    return null;
  }

  // Every table on the page, each with its own heading row. A handbook page
  // holds four or five of them one after another.
  function tableIn(text) {
    const lines = String(text || "").split(LINE_BREAKS).map((l) => l.trim()).filter(Boolean);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (kindOf(lines[i]) !== "name") { i++; continue; }
      // The headings run from "Name" for as long as the lines keep announcing a
      // kind of column. What came before it is the table's own title.
      const kinds = ["", "name"];
      const heads = [lines[i - 1] || "", lines[i]];
      let j = i + 1;
      while (j < lines.length && kindOf(lines[j])) {
        kinds.push(kindOf(lines[j]));
        heads.push(lines[j]);
        j++;
      }
      // A table of nothing but names is a register, and the register reader is
      // better at it.
      if (kinds.length < 2) { i = j; continue; }
      const rows = [];
      while (j < lines.length && kindOf(lines[j]) !== "name") {
        // THE NEXT TABLE'S HEADING ROW IS NOT THIS TABLE'S LAST ROW. A page
        // holds five of these one under another, and the words above the next
        // "Name" are that table's title — read on as data they become a person
        // called Name.
        if (lines.slice(j, j + kinds.length).some((l) => kindOf(l) === "name")) break;
        const got = dealRow(lines.slice(j), kinds);
        // A LINE THAT WON'T FIT IS NOT SILENTLY DROPPED — it ends the table.
        // Whatever follows is prose, or a table of a shape this doesn't read,
        // and either way pretending otherwise would invent people.
        if (!got) break;
        rows.push(got.cells);
        j += got.used;
      }
      if (rows.length) out.push({ title: heads[0], heads, kinds, rows });
      i = j > i ? j : i + 1;
    }
    return out;
  }

  // The same tables as people: what they are called, what they do, and the ways
  // of reaching them kept under the headings the document used for them.
  function contactsIn(text) {
    const out = [];
    tableIn(text).forEach((t) => {
      const at = (k) => t.kinds.indexOf(k);
      const nameAt = at("name");
      t.rows.forEach((r) => {
        // Through the same door as a name off a slide: an international school
        // writes a person as "Wang Wei 王伟" in a table exactly as often as it
        // does on a slide, and one of them being a table changes nothing.
        const who = personFrom(r[nameAt] || "");
        const name = who.name;
        if (!name) return;
        const details = {};
        t.kinds.forEach((k, n) => {
          if (n === nameAt || !r[n]) return;
          // The first column is what the table is a table of, which is the
          // person's job — "Grades 1–3 Liaison" under "Foreign Leadership".
          if (n === 0) return;
          details[t.heads[n]] = r[n];
        });
        out.push({ name, aka: who.aka, tag: (r[0] || "").trim(), details, from: t.title });
      });
    });
    return out;
  }

  // ---- A LIST OF PEOPLE TYPED OUT FLAT ---------------------------------------
  //
  // The fourth shape, and the one somebody actually reaches the app with. Not a
  // register, not a slide, not a table with a heading row — a list where each
  // person is one line and everything about them is on it:
  //
  //     add these people
  //     Grades 1-3 Liaison Alex Sample a.sample@example.org asample
  //     Grade 4 Vice Head Chris Specimen c.specimen@example.org cspecimen
  //
  // This is what a contacts table becomes the moment it is copied out of a PDF
  // and pasted somewhere that doesn't keep columns, and it is what a person
  // types when they are getting names in quickly. Every reader above said no to
  // it, so five colleagues pasted into the front door came back as "I couldn't
  // find anything to add there — try a few more words?", which is both wrong
  // and, since they had written plenty, unhelpful about what to do next.
  //
  // THE ADDRESS IS WHAT MAKES IT READABLE. An email is unmistakable, it sits
  // between the name and the handle, and a line with one on it and words in
  // front is a person however the rest is arranged.
  const AN_EMAIL = /[^\s@,;:()<>]+@[^\s@,;:()<>]+\.[A-Za-z]{2,}/;
  // An address the paste cut in half. Two ways it can look:
  //
  //   "…@outlo"     — plainly unfinished, nothing a domain ends with.
  //   "…@example.co" — LOOKS finished, and isn't: the "m" wrapped onto the next
  //                    line. A two-letter ending is a real one, so this can only
  //                    be told apart by what follows.
  const ENDS_IN_ADDRESS = /\S*@\S*$/;
  const UNFINISHED = /@[^\s@,;:()<>]*$/;
  const MAYBE_CUT = /@\S+\.[a-z]{2}$/i;
  const CONTINUES_IT = /^[a-z]{1,3}(?:\s|$)/;
  // A name is TWO WORDS unless the address says otherwise. Every other rule
  // tried needed to know which words are jobs and which are people, which is
  // exactly the vocabulary this app doesn't have — and two words is right for
  // "Grade 4 Vice Head | Michael Example" and for every other line on a real
  // list. Where the address carries the surname it is used to check the guess.
  const NAME_WORDS = 2;

  function looseIn(text) {
    const raw = String(text || "").split(LINE_BREAKS).map((l) => l.trim()).filter(Boolean);
    // AN ADDRESS BROKEN ACROSS TWO LINES is one address. Pasted out of a PDF it
    // arrives as "…@outlo" and then "ok.com", and read as written the person
    // has no way to be reached.
    const lines = [];
    raw.forEach((l) => {
      const prev = lines[lines.length - 1];
      // A LINE WITH ITS OWN ADDRESS ON IT IS THE NEXT PERSON, never the tail of
      // the one above. That one test is what keeps this from gluing two people
      // together whenever a name happens to start with a short word.
      const joins = prev !== undefined && ENDS_IN_ADDRESS.test(prev) && !AN_EMAIL.test(l) &&
        (!AN_EMAIL.test(prev) ? UNFINISHED.test(prev) && /^[\w.\-]/.test(l)
          : MAYBE_CUT.test(prev) && CONTINUES_IT.test(l));
      if (joins) {
        lines[lines.length - 1] = prev + l;
        return;
      }
      lines.push(l);
    });

    const out = [];
    const used = new Set();
    let started = false;
    let carry = "";
    let carried = [];
    lines.forEach((l, at) => {
      const m = AN_EMAIL.exec(l);
      if (!m) {
        // BEFORE THE FIRST PERSON THIS IS A LEAD-IN — "add these people" — and
        // after it, it is the front of the next row, wrapped. Which of the two
        // it is takes no vocabulary: a preamble comes before the list.
        if (started) { carry = (carry ? carry + " " + l : l); carried.push(at); }
        return;
      }
      started = true;
      const before = ((carry ? carry + " " + l.slice(0, m.index) : l.slice(0, m.index)))
        .replace(/[,;:|]+/g, " ").replace(/\s+/g, " ").trim();
      const after = l.slice(m.index + m[0].length).replace(/^[\s,;:|]+/, "").trim();
      const words = before.split(" ").filter(Boolean);
      // How much of the front is the name. Two words, unless the address's own
      // letters say a third belongs with them.
      const local = fold(m[0].split("@")[0].replace(/[^A-Za-z]/g, ""));
      let take = Math.min(NAME_WORDS, words.length);
      const inAddress = (w) => w && local.indexOf(fold(w.replace(/[^A-Za-z]/g, ""))) >= 0;
      while (take < words.length && take < 4 && inAddress(words[words.length - take - 1])) take++;
      const name = words.slice(words.length - take).join(" ");
      const tag = words.slice(0, words.length - take).join(" ");
      if (!name) return;
      used.add(at);
      carried.forEach((i) => used.add(i));
      carry = "";
      carried = [];
      const who = personFrom(name);
      const details = { Email: m[0] };
      // A single token after the address is a handle — a WeChat ID, a username.
      // Anything longer is words about them, which are worth keeping as words.
      if (after) details[/^\S+$/.test(after) ? "handle" : "notes"] = after;
      out.push({ name: who.name, aka: who.aka, tag, details, from: "" });
    });
    // WHATEVER WASN'T A PERSON IS STILL SOMETHING. The lead-in, and anything
    // typed alongside, goes back to the caller rather than being swallowed.
    const rest = lines.filter((_, i) => !used.has(i)).join("\n").trim();
    return { people: out, rest };
  }

  // Two or more, because one line with an address on it is far more often a job
  // about somebody — "send the form to a.sample@example.org" — than a list.
  const looksLikeLoose = (text) => looseIn(text).people.length >= 2;

  // Is this a contacts table? Only if a heading row was actually found and it
  // produced people — which a register never does, because a register has no
  // line in it saying "Name" followed by a line saying "Email".
  const looksLikeContacts = (text) => contactsIn(text).length >= 2;

  // Is this text written as name-then-roles rather than as a register? Most of
  // it has to be, so one stray dash in a class list doesn't change how the whole
  // paste is read.
  function looksLikeCards(text) {
    const lines = String(text || "").split(LINE_BREAKS).filter((l) => l.trim());
    if (lines.length < 2) return false;
    const bullets = lines.filter(under).length;
    const cards = cardsIn(text);
    if (!cards.length) return false;
    // Every card has at least one role by construction; the test is whether the
    // page is MOSTLY that, rather than a register with a note in it.
    return bullets >= lines.length / 2;
  }

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

  window.OrganiserRoster = { grid, cells, suggest, read, words, looksLikeRegister, cardsIn,
    looksLikeCards, tableIn, contactsIn, looksLikeContacts, looseIn, looksLikeLoose };
})();
