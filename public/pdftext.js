// GETTING THE WORDS OUT OF A PDF.
//
// Written because schools send PDFs and there is no arguing with that. It is
// the least trustworthy reader in this app and it says so out loud, every time,
// because the way PDF extraction fails is the dangerous way: it hands you
// something that looks like text.
//
// WHAT A PDF ACTUALLY IS: not a document. A set of instructions for putting
// marks on a page. "TIME" may be stored as four glyph numbers in a font subset
// where glyph 199 happens to be drawn as a T. Read those numbers as characters
// and you get "Ç¼À¸" — same length, same shape, confidently wrong. The map from
// glyph back to letter is optional, and when it's missing there is nothing to
// be done. So this reads the map when it's there, and reports how much of the
// text it couldn't map when it isn't.
//
// WHAT IT WILL NEVER DO WELL:
//
//   A SCANNED PAGE has no text in it at all — it's a photograph. Nothing short
//   of character recognition gets it out, and that isn't happening here. Such a
//   page comes back empty, and empty is reported rather than glossed over.
//
//   A TABLE loses its shape. Cells come back in the order they were drawn,
//   which usually reads like the table but never guarantees which value went
//   with which column. Fine for a schedule you'll read; not fine for anything
//   counted.
//
//   TWO COLUMNS interleave. Same reason.
//
// SO IT IS ALWAYS A DRAFT. Everything this produces is shown to you before it
// is kept, the same rule the plan box and the syllabus box already follow — and
// here it matters more than anywhere else in the app.
//
// No libraries: the browser can already inflate, via DecompressionStream.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Bytes → a string where one byte is one char, so offsets in the text and
  // offsets in the file are the same number. TextDecoder can't be used: every
  // encoding it knows remaps something in the top half of the range.
  function bytesToLatin1(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192)
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
    return out;
  }

  async function inflate(bytes, raw) {
    if (typeof DecompressionStream !== "function") return null;
    try {
      const ds = new DecompressionStream(raw ? "deflate-raw" : "deflate");
      const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  // ---- the object table ---------------------------------------------------
  function readObjects(s) {
    const objs = new Map();
    for (const m of s.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)) {
      const start = m.index + m[0].length;
      const end = s.indexOf("endobj", start);
      if (end > 0) objs.set(Number(m[1]), { start, end, body: s.slice(start, end) });
    }
    return objs;
  }

  async function streamOf(o, bytes, s) {
    const m = o.body.match(/\bstream\r?\n/);
    if (!m) return null;
    const from = o.start + m.index + m[0].length;
    // /Length is the document's own answer and is exact when it's a plain
    // number; searching for "endstream" is the fallback for when it's an
    // indirect reference. Either alone is enough — a file missing one is
    // malformed but still readable, and refusing it would lose the whole
    // document over a keyword.
    const len = o.body.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    const marker = s.indexOf("endstream", from);
    let to = marker;
    // Whether the document's own /Length settled it, or we had to go looking for
    // the word "endstream" — which is what the trimming below is for.
    let byLength = false;
    if (len) {
      const byLen = from + Number(len[1]);
      if (marker < 0 || byLen <= marker) { to = byLen; byLength = true; }
    }
    if (to < 0 || to > bytes.length) return null;
    // THE BROWSER'S INFLATE IS STRICTER THAN NODE'S, and this is the difference
    // that matters: almost every PDF puts a newline between the compressed data
    // and the word "endstream". Node shrugs at those two bytes.
    // DecompressionStream calls them "trailing junk" and throws away the whole
    // stream — so a reader that passes its tests in Node returns a blank page
    // in the browser, which is where it actually runs.
    //
    // BUT ONLY WHERE THE LENGTH DID NOT SAY. Compressed data is bytes, and one
    // stream in a few dozen ends in the byte 0x0a or 0x20 — which is a newline
    // only if you are reading it as text. Trimmed off a stream whose /Length was
    // exact, that eats real data, the inflate fails, and the page comes back
    // blank with nothing to say why. Found by a calendar that had nothing wrong
    // with it beyond the luck of where its deflate stopped.
    if (!byLength)
      while (to > from && (bytes[to - 1] === 10 || bytes[to - 1] === 13 || bytes[to - 1] === 32)) to--;
    let data = bytes.subarray(from, to);
    // A STREAM CAN BE PACKED MORE THAN ONCE, AND IN ORDER.
    //
    // /Filter is not one name. It is a name OR A LIST, and a list is applied in
    // the order it is written: "[ /ASCII85Decode /FlateDecode ]" means the
    // deflated bytes were then written out as printable characters, so they must
    // be un-printed before they can be inflated. Reading /Filter by looking for
    // the word FlateDecode anywhere in the dictionary got the right answer for
    // one of those and the wrong answer for the other — it inflated the
    // ASCII85 text as if it were compressed data, which fails, and the page came
    // back empty with nothing to say why.
    //
    // ReportLab writes this pairing by default, and ReportLab is what a great
    // many school systems generate their PDFs with. A calendar produced that way
    // was three blank pages.
    for (const f of filtersOf(o.body)) {
      if (f === "FlateDecode") data = (await inflate(data, false)) || (await inflate(data, true));
      else if (f === "ASCII85Decode") data = ascii85(bytesToLatin1(data));
      else if (f === "ASCIIHexDecode") data = asciiHex(bytesToLatin1(data));
      // A PACKING THIS READER DOES NOT KNOW. Handing back the packed bytes would
      // be handing back nonsense that looks like text, which is the one failure
      // this whole file is written to avoid.
      else return null;
      if (!data) return null;
    }
    return data;
  }

  // The filters a stream is packed with, in the order they were applied. One
  // name or a list of them; both are ordinary and both turn up.
  function filtersOf(body) {
    const m = body.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
    if (!m) return [];
    return [...m[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((x) => x[1]);
  }

  // ASCII85: four bytes written as five printable characters, base 85, so that
  // a stream survives being sent through something that only carries text. A
  // published format, the same in every document there is.
  function ascii85(s) {
    let t = String(s || "").replace(/\s/g, "");
    if (t.slice(0, 2) === "<~") t = t.slice(2);
    const end = t.indexOf("~>");
    if (end >= 0) t = t.slice(0, end);
    const out = [];
    let tuple = 0, count = 0;
    const four = (n, howMany) => {
      const b = [0, 0, 0, 0];
      for (let i = 3; i >= 0; i--) { b[i] = n % 256; n = (n - b[i]) / 256; }
      for (let i = 0; i < howMany; i++) out.push(b[i]);
    };
    for (let i = 0; i < t.length; i++) {
      // "z" stands for four zero bytes, and only where a group has not started.
      if (t[i] === "z" && count === 0) { out.push(0, 0, 0, 0); continue; }
      const v = t.charCodeAt(i) - 33;
      if (v < 0 || v > 84) continue;
      tuple = tuple * 85 + v;
      if (++count === 5) { four(tuple, 4); tuple = 0; count = 0; }
    }
    // A last group that never filled up is padded, and gives one byte fewer
    // than the characters it was written with.
    if (count > 1) {
      for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
      four(tuple, count - 1);
    }
    return new Uint8Array(out);
  }

  // ASCIIHex: the same idea, two characters to a byte, ending at ">".
  function asciiHex(s) {
    const t = String(s || "").replace(/\s/g, "");
    const end = t.indexOf(">");
    const h = (end >= 0 ? t.slice(0, end) : t).replace(/[^0-9A-Fa-f]/g, "");
    const out = [];
    for (let i = 0; i < h.length; i += 2)
      out.push(parseInt((h.slice(i, i + 2) + "0").slice(0, 2), 16));
    return new Uint8Array(out);
  }

  // ---- the glyph-to-letter map --------------------------------------------
  function parseCMap(text) {
    const map = new Map();
    const hexToStr = (h) => {
      let out = "";
      for (let i = 0; i + 1 < h.length; i += 4)
        out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
      return out;
    };
    for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
        map.set(parseInt(p[1], 16), hexToStr(p[2]));
    for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), dst = parseInt(p[3], 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++)
          map.set(c, String.fromCodePoint(dst + (c - lo)));
      }
    return map;
  }

  // THREE LEVELS OF INDIRECTION, and all three turn up in the wild:
  //   /Resources << /Font << /F1 9 0 R >> >>   inline
  //   /Resources 7 0 R                          resources are their own object
  //   /Font 8 0 R                               the font dict is its own object
  // Miss the last and no font resolves, so no map is applied — and the text
  // still comes out, looking like real words in the wrong alphabet. That is
  // exactly the bug this comment exists to stop somebody reintroducing.
  async function fontsFor(pageObj, objs, bytes, s) {
    const fonts = new Map();
    let scope = pageObj.body;
    const rref = scope.match(/\/Resources\s+(\d+)\s+0\s+R/);
    if (rref && objs.has(+rref[1])) scope = objs.get(+rref[1]).body;
    let entries = [];
    const inline = scope.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (inline) entries = [...inline[1].matchAll(/\/([\w.]+)\s+(\d+)\s+0\s+R/g)];
    if (!entries.length) {
      const fref = scope.match(/\/Font\s+(\d+)\s+0\s+R/);
      if (fref && objs.has(+fref[1]))
        entries = [...objs.get(+fref[1]).body.matchAll(/\/([\w.]+)\s+(\d+)\s+0\s+R/g)];
    }
    for (const [, name, num] of entries) {
      const f = objs.get(+num);
      if (!f) continue;
      let cmap = null;
      const tu = f.body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (tu && objs.has(+tu[1])) {
        const d = await streamOf(objs.get(+tu[1]), bytes, s);
        if (d) cmap = parseCMap(bytesToLatin1(d));
      }
      fonts.set(name, { cmap, twoByte: /\/Type0\b/.test(f.body) || /\/Identity-H/.test(f.body) });
    }
    return fonts;
  }

  // <48656c6c6f> → the bytes it names. Whitespace inside is legal and common.
  function hexBytes(hex) {
    const h = hex.replace(/\s+/g, "");
    let raw = "";
    for (let i = 0; i + 1 < h.length; i += 2) raw += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return raw;
  }

  // THE TWENTY-SEVEN BYTES EVERY OTHER ENCODING LEAVES EMPTY.
  //
  // A PDF font with no glyph map of its own is read byte for byte, and for the
  // printable range that is right. Between 0x80 and 0x9f it is not: those are
  // control codes in Latin-1 and typography in the encoding PDFs actually use —
  // the en dash, the em dash, curly quotes, the ellipsis. A calendar writes its
  // ranges with one of them.
  //
  // Left unmapped, "29 March – 10 April" came through with an invisible control
  // character where the dash was, so it was not a range at all: two separate
  // days, one of them named after the other. Nothing about this is a fact about
  // any school — it is a published table, the same for every document there is.
  const WINANSI = {
    0x80: "\u20ac", 0x82: "\u201a", 0x83: "\u0192", 0x84: "\u201e", 0x85: "\u2026",
    0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02c6", 0x89: "\u2030", 0x8a: "\u0160",
    0x8b: "\u2039", 0x8c: "\u0152", 0x8e: "\u017d", 0x91: "\u2018", 0x92: "\u2019",
    0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
    0x98: "\u02dc", 0x99: "\u2122", 0x9a: "\u0161", 0x9b: "\u203a", 0x9c: "\u0153",
    0x9e: "\u017e", 0x9f: "\u0178",
  };
  const winAnsi = (raw) => {
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      out += c >= 0x80 && c <= 0x9f && WINANSI[c] ? WINANSI[c] : raw[i];
    }
    return out;
  };

  // The twelve, short and long, at the very end of a line. Format, not
  // vocabulary: no fact about any school is written down here.
  // The month names, written once. Three rules below ask where a month sits on
  // a line — at the end, at the start, anywhere — and three copies of twelve
  // abbreviations is three chances for one of them to learn a spelling the
  // others haven't.
  const MON = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
  const MONTH_END = new RegExp(`\\b(?:${MON})[a-z]*\\.?$`, "i");
  const MONTH_AT = new RegExp(`^(?:${MON})[a-z]*\\.?\\b`, "i");
  const MONTH_IN = new RegExp(`\\b(?:${MON})[a-z]*\\.?\\b`, "i");
  // A LIST OF DATES CUT BETWEEN THE DAY AND ITS MONTH. A table cell holding a
  // term's worth of one meeting is wider than its column, so it wraps — and it
  // wraps wherever it happens to reach the edge, which on a real staff calendar
  // was in the middle of "15 Dec":
  //
  //     8 Sep; 22 Sep; 20 Oct; 17 Nov; 15
  //     Dec; 19 Jan
  //
  // Read as written that is a meeting in December lost outright, a row called
  // "; ; ; ; 15", and a row called "Dec;".
  const DAY_END = /[;,]\s*\d{1,2}$/;

  const unescapeStr = (t) =>
    t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, g) =>
      ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[g] ??
        String.fromCharCode(parseInt(g, 8))));

  // ---- one page's content stream ------------------------------------------
  //
  // Returns the text as before, AND where each piece of it sat.
  //
  // A PDF has no table. It has words at coordinates, and the columns are only
  // visible in the coordinates — so a timetable read as plain text comes out as
  // "RegistrationRegistrationRegistration", one row of five lessons run
  // together with nothing between them. The text is what almost everything here
  // wants; the positions are what a grid needs, and they cost nothing to keep.
  function textOf(content, fonts, tally) {
    const lines = [];
    // Every line as its cells: [{ x, text }]. A new cell starts wherever the
    // document jumped sideways by more than a space's width, which is exactly
    // where a person would see a column.
    const rows = [];
    let rowCells = [];
    let x = 0, cellX = 0, cellStart = 0;
    let line = "";
    let font = null;
    let size = 12;
    // HOW WIDE THE TEXT DRAWN SINCE THE LAST MOVE IS, roughly.
    //
    // Needed because "did the document jump sideways" is the wrong question on
    // its own. A page that positions every glyph — and plenty do — moves
    // sideways before each one BY THE WIDTH OF THE ONE BEFORE IT, which is not
    // a jump at all. Measured against the point size alone, that reads as a
    // column break at every letter, and a whole timetable arrives as "S", "ch",
    // "e", "d", "u", "le". Nothing downstream can recover columns from that:
    // the grid reader correctly refuses a page of two-letter fragments, so the
    // positions are thrown away and a table is read as a run of sentences.
    //
    // A PDF does not say how wide a character is — that means the font's own
    // width table — but six tenths of the point size is close enough for the
    // only question being asked here: did the document step OVER what it had
    // just drawn, or did it leave a gap you could see?
    // Six tenths of the point size is the average of a font and not the width of
    // any particular letter, and the difference matters at the two ends: a
    // capital W is very nearly a full em and an i is barely a third of one. A
    // single W stepped over at its real width therefore looked like a gap, and
    // "Wednesday" came back as "W" and "ednesday" — which is only harmless
    // because the reader happens to know that W is a day. Three rough classes
    // are still rough, and they are right where it counts.
    let drewAt = 0;
    const WIDE_CH = /[A-Z0-9@#%&MWmw]/;
    const THIN_CH = /[ijlt.,:;'!|()[\]]/;
    const drawn = () => {
      let w = 0;
      for (let i = drewAt; i < line.length; i++) {
        const ch = line[i];
        w += WIDE_CH.test(ch) ? 0.72 : THIN_CH.test(ch) ? 0.34 : 0.56;
      }
      return w * size;
    };
    let y = null;

    const put = (raw) => {
      if (font && font.cmap) {
        const step = font.twoByte ? 2 : 1;
        for (let i = 0; i < raw.length; i += step) {
          const code = step === 2 ? (raw.charCodeAt(i) << 8) | (raw.charCodeAt(i + 1) || 0) : raw.charCodeAt(i);
          tally.glyphs++;
          if (font.cmap.has(code)) line += font.cmap.get(code);
          else tally.unmapped++;
        }
      } else {
        tally.glyphs += raw.length;
        raw = winAnsi(raw);
        // No map at all. The bytes may be ordinary letters, or they may be
        // glyph numbers — and there is no way to tell from in here. Counted, so
        // the caller can say how much of the page is only probably right.
        tally.unmapped += /[^\x20-\x7e\r\n\t]/.test(raw) ? raw.length : 0;
        line += raw;
      }
    };
    // A cell ends where the next one begins. Taken as a slice of the line that
    // is being built anyway, so the character decoding above is not duplicated
    // and the two outputs cannot drift apart.
    const closeCell = (nextX) => {
      const t = line.slice(cellStart).trim();
      if (t) rowCells.push({ x: cellX, text: t });
      cellStart = line.length;
      drewAt = line.length;
      cellX = nextX;
    };
    // THE LINE AND ITS CELLS ARE THE SAME LINE, so they are kept or dropped
    // together. Two conditions that happen to agree today are two that can stop
    // agreeing, and everything below walks the two lists in step.
    const br = () => {
      closeCell(x);
      const whole = line.trim();
      if (rowCells.length && whole) { rows.push({ y, cells: rowCells }); lines.push(whole); }
      rowCells = [];
      line = "";
      cellStart = 0;
      drewAt = 0;
      cellX = x;
    };

    // A TJ ARRAY'S STRINGS MAY CONTAIN BRACKETS, AND ONE DID.
    //
    // The array was matched as "[ anything but a bracket ]", so a document whose
    // font draws "~" with the code 0x5b — a literal "[" in the content stream —
    // ended the array early. The regex then failed, the scan moved on, found the
    // NEXT "]" and matched from the bracket INSIDE the string: everything before
    // it was dropped without a word. On a real school calendar that quietly
    // deleted the front of five lines —
    //
    //     • First Semester: Sep. 1, 2026 ~ Jan. 22, 2027
    //
    // arrived as "Jan. 22, 2027", so four dates turned up on the page with no
    // name on them and nothing anywhere said a word had gone missing. The model
    // was being handed a document with holes in it and asked to explain them.
    //
    // So the body of an array is a sequence of THINGS — a string, a hex string,
    // or a number — and a bracket inside a string is inside a string.
    const re =
      /\/([\w.]+)\s+([\d.]+)\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)\b|([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm\b|T\*|\[((?:\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|[^\[\]()<>])*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\bET\b/g;
    let m;
    while ((m = re.exec(content))) {
      if (m[1] !== undefined) { font = fonts.get(m[1]) || null; size = Number(m[2]) || size; continue; }
      if (m[3] !== undefined) {
        // A LINE BREAK IS A VERTICAL MOVE BIGGER THAN THE TEXT IS TALL.
        // A fixed threshold splits "8:00" into "8" and ":00" the moment a
        // document nudges a character a fraction of a point, which real ones do
        // constantly. Measured against the font size, that stops happening.
        const dx = Number(m[3]) || 0;
        x += dx;
        if (Math.abs(Number(m[4])) > Math.max(2, size * 0.4)) br();
        // AND A COLUMN BREAK IS A SIDEWAYS MOVE THAT CLEARS WHAT WAS JUST
        // DRAWN, by more than a space. Measured against the point size alone
        // this fired on every glyph of a page that positions them one at a
        // time — see `drawn` above.
        else if (dx - drawn() > Math.max(1, size * 0.4)) closeCell(x);
        drewAt = line.length;
        continue;
      }
      if (m[5] !== undefined) {
        const ny = Number(m[10]);
        const nx = Number(m[9]);
        const broke = y !== null && Math.abs(ny - y) > Math.max(2, size * 0.4);
        // Measured from where the ink actually ended, not from where the last
        // move left the pen — see `drawn`. Otherwise a column break is judged
        // against a position several words back.
        // FORWARDS PAST THE INK, OR BACKWARDS AT ALL.
        //
        // Backwards was missing, and a document is free to draw its marks in
        // any order — one drew Friday before Monday. A move to the left was not
        // counted as starting a cell, so Monday was stamped with Friday's
        // position, and a row of day names came back in a jumble that no column
        // could be read from.
        const jumped = !broke && Number.isFinite(nx) &&
          (nx - (x + drawn()) > Math.max(1, size * 0.4) ||
            x - nx > Math.max(1, size * 0.4));
        // MOVED BEFORE THE BREAK, not after. Closing a cell stamps the NEXT
        // one's position, so a row that ends at the right-hand edge would give
        // the next row's first cell that same edge — and the time column would
        // land under Friday.
        if (Number.isFinite(nx)) x = nx;
        if (broke) br();
        else if (jumped) closeCell(x);
        drewAt = line.length;
        y = ny;
        continue;
      }
      if (m[0] === "T*" || m[0] === "ET") { br(); continue; }
      if (m[11] !== undefined) {
        // A TJ array holds strings interleaved with kerning numbers, and the
        // strings come in BOTH forms — (literal) and <hex>. A font with an
        // Identity-H encoding writes hex almost exclusively, so handling only
        // the parenthesised kind silently drops most of the text on exactly
        // the documents that need this reader most.
        for (const p of m[11].matchAll(/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>|(-?[\d.]+)/g)) {
          if (p[1] !== undefined) put(unescapeStr(p[1]));
          else if (p[2] !== undefined) put(hexBytes(p[2]));
          // A big negative kern is a space the document drew instead of wrote.
          else if (Number(p[3]) < -180) line += " ";
        }
        continue;
      }
      if (m[12] !== undefined) { put(unescapeStr(m[12])); continue; }
      if (m[13] !== undefined) put(hexBytes(m[13]));
    }
    br();
    // A PDF HAS NO LINES. It has marks at positions, and everything above is an
    // inference about where one line stopped and the next began. This is where
    // that inference is caught being wrong: a line of one or two characters,
    // followed immediately by one starting with punctuation nothing ever starts
    // with, was a single word cut in half. "8" and ":00-9:30" are one cell.
    // AND PUT BACK TOGETHER IN BOTH OF THIS READER'S ANSWERS, NOT ONE.
    //
    // All of this mending was done to the TEXT and none of it to the rows, and
    // the rows are what anything wanting the document's columns reads. So the
    // same PDF, out of the same function, said two different things: the text
    // said "• Christmas Holiday: Dec. 22-Dec. 25" and the columns said "Dec. 2",
    // "2", "-", "Dec. 25". The calendar panel reads the columns when a document
    // has any — and a school calendar always does, because of the term grid at
    // the top — so what a person actually saw was the twenty-second of December
    // read as the second, three weeks of holiday in the wrong place, while the
    // reader's other answer had it right all along.
    //
    // One decision, both answers. Where a line is joined to the one above it,
    // its cells join that line's cells too.
    const out = [];
    const outRows = [];
    const clean = lines.map((l) => l.replace(/[ \t]+/g, " ").trim());
    const keep = (l, at) => {
      out.push(l);
      outRows.push({ y: rows[at].y, cells: rows[at].cells.slice() });
    };
    const join = (whole, at, glue) => {
      out[out.length - 1] = whole;
      const into = outRows[outRows.length - 1];
      const add = rows[at].cells;
      if (!into || !add.length) return;
      if (!into.cells.length) { into.cells = add.slice(); return; }
      const last = into.cells[into.cells.length - 1];
      into.cells[into.cells.length - 1] = { ...last, text: last.text + glue + add[0].text };
      into.cells = into.cells.concat(add.slice(1));
    };
    clean
      .forEach((l, at) => {
        const prev = out[out.length - 1];
        // What comes NEXT is sometimes the only thing that says what this line
        // is: see the split number below.
        const next = clean[at + 1] || "";
        if (prev === undefined) { keep(l, at); return; }
        if (prev.length <= 2 && /^[:.,;)\]\-–]/.test(l)) { join(prev + l, at, ""); return; }
        // A DROPPED CAPITAL. Documents built in a slide editor draw the first
        // letter of a cell as its own run, a hair away from the rest, and out
        // comes "A" and then "ll primary and middle school teachers". A single
        // letter followed by a line that starts in lower case is one word that
        // was cut after its first character — nothing else in English looks
        // like that.
        if (prev.length === 1 && /^[a-zà-ÿ]/.test(l)) { join(prev + l, at, ""); return; }
        // AND A WORD WRAPPED IN A NARROW COLUMN. An address in a table cell an
        // inch wide comes out as "a.sample123@example.co" and then "m". The tell
        // is that the line above has no spaces in it at all — it is one token,
        // and a token does not have a two-letter sentence after it.
        if (!/\s/.test(prev) && prev.length >= 6 && /^[a-zà-ÿ]{1,3}$/.test(l)) {
          join(prev + l, at, "");
          return;
        }
        // A SENTENCE WRAPPED IN A NARROW COLUMN. Same thing a line further out:
        // "Staff meeting with the director, grade" / "level meetings with
        // Chinese staff" is one cell that hit the edge of its column, and split
        // there it reads as a meeting whose name stops mid-phrase.
        //
        // A COMMA CAN NEVER START A CELL, so a line beginning with one is always
        // the rest of the line above. Anything else has to earn it: the line
        // above must be long enough to have actually run out of room, and the
        // line itself must be prose — lower case AND more than one word. Without
        // that last part a table of names and email addresses joins every
        // address onto the person above it.
        // A COLON NEVER STARTS A LINE EITHER. ": Feb. 18-19, 2027" is the rest
        // of the line above it, always — no sentence in any document begins with
        // one. The rule above it only joined a line starting with punctuation
        // when the line before was a couple of characters long, so a name split
        // across three runs came out as three lines and the entry underneath
        // them had nothing to call it.
        if (/^[,;:]/.test(l)) { join(prev + l, at, ""); return; }
        // A NUMBER THAT LOST ITS OTHER HALF. "Dec. 2" / "2-" / "Dec. 25" is the
        // twenty-second of December cut in two where the column ran out, and
        // read as written it is the second — three weeks of holiday in the
        // wrong place, and nothing on the screen to say so. Digits and a dash
        // and nothing else is never a line of its own.
        if (/^\d{1,2}[-–—]$/.test(l)) { join(prev + l, at, ""); return; }
        // AND THE SAME BREAK ONE CHARACTER EARLIER, where the dash came out on
        // a line of its own too: "Dec. 2" / "2" / "-" / "Dec. 25".
        //
        // A BARE NUMBER IS USUALLY A CELL — a square of a calendar, a week
        // number, a page — so this needs all three parts before it will touch
        // it: the line above ends mid-number, this one is only digits, and the
        // one below is the dash that says the number was reaching for something.
        if (/\d$/.test(prev) && /^\d{1,2}$/.test(l) && /^[-–—]$/.test(next)) {
          join(prev + l, at, "");
          return;
        }
        // A MONTH THAT LOST ITS DAY. "Feb." at the end of one line and "17, 2027"
        // at the start of the next is one date the extractor cut in half — and
        // the half that survives is a month with no day in it, which reads as an
        // entry that simply has no end: "Winter Vacation: Jan. 23, 2027 ~ Feb."
        //
        // Month names are a date FORMAT and not something anybody's school is
        // being assumed about — the same list every date reader in this app
        // already has — and a month at the very end of a line is never the end
        // of a sentence.
        if (MONTH_END.test(prev) && /^\d{1,2}\b/.test(l)) { join(prev + " " + l, at, " "); return; }
        // AND A DAY THAT LOST ITS MONTH — the same break the other way round.
        //
        // All three parts are required, because "12" at the end of a line after
        // a comma is otherwise an ordinary thing ("Grades 9, 10, 11, 12") and a
        // line starting with a month is an ordinary thing too. What is not
        // ordinary is both at once ON A LINE THAT IS ALREADY LISTING DATES: a
        // line carrying a month, ending mid-list on a bare day, with a month
        // beginning the next one. See DAY_END.
        if (DAY_END.test(prev) && MONTH_IN.test(prev) && MONTH_AT.test(l)) {
          join(prev + " " + l, at, " ");
          return;
        }
        // A HYPHEN ON A LINE OF ITS OWN IS THE MIDDLE OF A WORD, or of a range.
        // A school calendar is made of these — "Mid-Autumn Festival", "Oct. 1 -
        // Oct. 7", "Grade 11-12" — and every one of them came out in three
        // pieces, so the holiday was called "Autumn Festival" and the range was
        // two unrelated days. A bullet is "- " with something after it; this is
        // a dash and nothing else, which is never a bullet.
        if (/^[-–—]$/.test(l)) { join(prev + "-", at, ""); return; }
        // AND THE OTHER HALF OF THE SAME BREAK. Once a line ends in a hyphen it
        // is unfinished, whether the document wrote it that way ("Feb. 18-") or
        // the line above just handed it one. "Dec. 2" / "2-" / "Dec. 25" is the
        // twenty-second of December in three pieces, and read as written it is
        // the second — three weeks of holiday in the wrong place.
        if (/[-–—]$/.test(prev)) { join(prev + l, at, ""); return; }
        if (prev.length >= 25 && /^[a-zà-ÿ]/.test(l) && /\s/.test(l)) {
          join(prev + " " + l, at, " ");
          return;
        }
        keep(l, at);
      });

    // AND A PDF HAS NO ROWS EITHER.
    //
    // Everything above mends a line that was cut in the middle. This mends the
    // opposite: text that is plainly on ONE line of the page arriving as
    // several, because a line here ends wherever the document ends a text
    // object — and some documents wrap every single fragment in one.
    //
    // A real timetable did exactly that, and the cost was the whole grid: its
    // five day names came back as five rows of one word each, so nothing could
    // find a row of day names, so the table had no header, so every lesson was
    // placed by guesswork. Two pieces of text at the same height are on the same
    // line of the page, however the document chose to draw them.
    //
    // THE ROWS ONLY, AND NOT THE TEXT — which is the opposite of the rule above
    // it and for a reason worth being precise about.
    //
    // The mending above is about WORDS: a word cut in half is cut in half in
    // both answers, so both have to be repaired or the same document says two
    // different things. This is about LAYOUT, and there the two answers are
    // asked different questions. `rows` means "where each piece of text sat", so
    // two pieces at the same height belong to the same row and always did.
    // `text` means "the words in reading order", and a page with two columns of
    // prose side by side really does have two runs of writing on it — joined by
    // height they interleave into nonsense, sentence by alternating sentence.
    //
    // Joining the text as well broke eighteen checks in the calendar reader,
    // which reads the text. Nothing was wrong with those documents; the answer
    // they are asked for is simply not this one.
    const at = new Map();
    const bandRows = [];
    outRows.forEach((r) => {
      // A DOCUMENT THAT NEVER SAID ITS HEIGHTS HAS NONE TO COMPARE.
      //
      // Height is only recorded where a document positions text absolutely. One
      // that walks down the page with relative nudges never sets it at all, and
      // reading "no height" as height nought put every line of such a page on
      // one row — so a whole document collapsed into a single line.
      if (r.y === null || r.y === undefined) { bandRows.push(r); return; }
      // Rounded, because "the same height" in a PDF is the same number give or
      // take the last decimal place.
      const key = Math.round(Number(r.y));
      const seen = at.get(key);
      if (seen === undefined) {
        at.set(key, bandRows.length);
        bandRows.push({ y: r.y, cells: r.cells.slice() });
        return;
      }
      bandRows[seen].cells = bandRows[seen].cells.concat(r.cells);
    });
    // AND READ ACROSS THE PAGE, whatever order the marks were put on it in. A
    // document may draw Friday before Monday — nothing says it must not — and
    // the mending above shuffles cells as it joins them, so the order a row
    // arrives in is not the order it reads in.
    bandRows.forEach((r) => r.cells.sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0)));
    return { text: out.join("\n"), rows: bandRows };
  }

  // ---- what is on the page that isn't words --------------------------------
  //
  // A TABLE PASTED IN AS A SCREENSHOT IS A PICTURE, and a picture of writing
  // holds no text at all. A booklet whose contacts page was half a picture came
  // back looking complete: the paragraph above it read fine, and the twelve
  // names inside it were simply not there, with nothing said. Silence is the
  // wrong answer — a page that is partly a photograph should say so.
  //
  // WIDE, because the point is to warn about pictures that could be holding
  // writing, not about the crest on the front cover. Anything narrower than
  // this is decoration; anything wider is a screenshot of something.
  const PICTURE_WIDTH = 700;
  function picturesOn(pageObj, objs) {
    let res = pageObj.body;
    const ref = pageObj.body.match(/\/Resources\s+(\d+)\s+0\s+R/);
    if (ref && objs.get(+ref[1])) res = objs.get(+ref[1]).body;
    // The XObject dictionary is a flat map of name to object, so the first
    // ">>" after it is its own end.
    const xo = res.match(/\/XObject\s*<<([\s\S]*?)>>/);
    if (!xo) return 0;
    let n = 0;
    for (const m of xo[1].matchAll(/(\d+)\s+0\s+R/g)) {
      const o = objs.get(+m[1]);
      if (!o || !/\/Subtype\s*\/Image/.test(o.body)) continue;
      const w = o.body.match(/\/Width\s+(\d+)/);
      if (w && Number(w[1]) >= PICTURE_WIDTH) n++;
    }
    return n;
  }

  // ---- the whole document -------------------------------------------------
  async function read(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const s = bytesToLatin1(bytes);
    const notes = [];
    if (!/^%PDF-/.test(s.slice(0, 8))) return { ok: false, text: "", pages: [], notes: ["That doesn't look like a PDF."] };
    if (/\/Encrypt\b/.test(s)) notes.push("This PDF is protected, so some of it may not open.");
    if (typeof DecompressionStream !== "function")
      return { ok: false, text: "", pages: [], notes: ["This browser can't unpack a PDF. Open it and copy the text across instead — it will be better anyway."] };

    const objs = readObjects(s);
    // A PDF 1.5+ file can pack its objects inside compressed object streams.
    // Those aren't unpacked here, and a file built that way will come back
    // mostly empty — which is said, rather than left looking like a blank
    // document.
    if (/\/Type\s*\/ObjStm/.test(s))
      notes.push("Parts of this file are packed in a way this reader doesn't open, so some text may be missing.");

    const pageObjs = [];
    for (const [n, o] of objs)
      if (/\/Type\s*\/Page\b/.test(o.body) && !/\/Type\s*\/Pages\b/.test(o.body)) pageObjs.push({ n, o });
    pageObjs.sort((a, b) => a.n - b.n);

    const tally = { glyphs: 0, unmapped: 0 };
    const pages = [];
    for (let i = 0; i < pageObjs.length; i++) {
      const p = pageObjs[i];
      const fonts = await fontsFor(p.o, objs, bytes, s);
      const cref = p.o.body.match(/\/Contents\s+(\d+)\s+0\s+R/);
      const carr = p.o.body.match(/\/Contents\s*\[([^\]]+)\]/);
      const nums = cref
        ? [+cref[1]]
        : carr
          ? [...carr[1].matchAll(/(\d+)\s+0\s+R/g)].map((x) => +x[1])
          : [];
      let content = "";
      for (const n of nums) {
        const o = objs.get(n);
        const d = o && (await streamOf(o, bytes, s));
        if (d) content += bytesToLatin1(d) + "\n";
      }
      const got = content ? textOf(content, fonts, tally) : { text: "", rows: [] };
      pages.push({ page: i + 1, text: got.text, rows: got.rows, pictures: picturesOn(p.o, objs) });
    }
    // SAID IN THE CAUTION, NOT IN THE NOTES. The notes are what went wrong, and
    // are only put on the screen when something did; a picture on a page that
    // read perfectly well is not a fault, it is a thing to know. The caution is
    // shown every time, which is the point of it.
    const shown = pages.filter((p) => p.pictures && p.text);
    const aboutPictures = shown.length
      ? ` ${shown.length === 1 ? "Page" : "Pages"} ${shown.map((p) => p.page).join(", ")} ` +
        `${shown.length === 1 ? "has a picture" : "have pictures"} on ${shown.length === 1 ? "it" : "them"} — ` +
        "anything written inside a picture isn't text, so it isn't here."
      : "";

    const empty = pages.filter((p) => !p.text).length;
    // An empty page in a PDF with images on it is a scan, and a scan is a
    // photograph of words. Saying "no text found" is the only honest answer.
    if (empty && /\/Subtype\s*\/Image/.test(s))
      notes.push(
        `${empty} of ${pages.length} pages have no text in them at all — they're probably scans, which are pictures of words rather than words.`
      );
    else if (empty)
      notes.push(`${empty} of ${pages.length} pages came back empty.`);

    const bad = tally.glyphs ? tally.unmapped / tally.glyphs : 0;
    if (bad > 0.2)
      notes.push(
        `Roughly ${Math.round(bad * 100)}% of the characters couldn't be matched to letters, so a lot of this will be wrong. Opening the PDF and copying the text across will be better.`
      );
    else if (bad > 0.02)
      notes.push(`A few characters couldn't be matched to letters — check the text below before keeping it.`);

    return {
      ok: true,
      pages,
      text: pages.map((p) => p.text).filter(Boolean).join("\n\n"),
      // Where each piece of text sat, for anything that needs the columns back.
      rows: pages.flatMap((p) => p.rows || []),
      notes,
      // Always. Not a warning about this file — a fact about the format.
      caution:
        "Read out of a PDF, so treat it as a rough draft. Tables lose their columns and anything in two columns can come out interleaved. Check it before keeping it." +
        aboutPictures,
    };
  }

  window.OrganiserPdfText = { read, parseCMap, bytesToLatin1 };
})();
