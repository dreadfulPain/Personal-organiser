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
    if (len) {
      const byLen = from + Number(len[1]);
      if (marker < 0 || byLen <= marker) to = byLen;
    }
    if (to < 0 || to > bytes.length) return null;
    // THE BROWSER'S INFLATE IS STRICTER THAN NODE'S, and this is the difference
    // that matters: almost every PDF puts a newline between the compressed data
    // and the word "endstream". Node shrugs at those two bytes.
    // DecompressionStream calls them "trailing junk" and throws away the whole
    // stream — so a reader that passes its tests in Node returns a blank page
    // in the browser, which is where it actually runs.
    while (to > from && (bytes[to - 1] === 10 || bytes[to - 1] === 13 || bytes[to - 1] === 32)) to--;
    const raw = bytes.subarray(from, to);
    if (!/\/FlateDecode/.test(o.body)) return raw;
    return (await inflate(raw, false)) || (await inflate(raw, true));
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

  const unescapeStr = (t) =>
    t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, g) =>
      ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[g] ??
        String.fromCharCode(parseInt(g, 8))));

  // ---- one page's content stream ------------------------------------------
  function textOf(content, fonts, tally) {
    const lines = [];
    let line = "";
    let font = null;
    let size = 12;
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
        // No map at all. The bytes may be ordinary letters, or they may be
        // glyph numbers — and there is no way to tell from in here. Counted, so
        // the caller can say how much of the page is only probably right.
        tally.unmapped += /[^\x20-\x7e\r\n\t]/.test(raw) ? raw.length : 0;
        line += raw;
      }
    };
    const br = () => { if (line.trim()) lines.push(line.trim()); line = ""; };

    const re =
      /\/([\w.]+)\s+([\d.]+)\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)\b|([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm\b|T\*|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\bET\b/g;
    let m;
    while ((m = re.exec(content))) {
      if (m[1] !== undefined) { font = fonts.get(m[1]) || null; size = Number(m[2]) || size; continue; }
      if (m[3] !== undefined) {
        // A LINE BREAK IS A VERTICAL MOVE BIGGER THAN THE TEXT IS TALL.
        // A fixed threshold splits "8:00" into "8" and ":00" the moment a
        // document nudges a character a fraction of a point, which real ones do
        // constantly. Measured against the font size, that stops happening.
        if (Math.abs(Number(m[4])) > Math.max(2, size * 0.4)) br();
        continue;
      }
      if (m[5] !== undefined) {
        const ny = Number(m[10]);
        if (y !== null && Math.abs(ny - y) > Math.max(2, size * 0.4)) br();
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
    const out = [];
    lines
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .forEach((l) => {
        const prev = out[out.length - 1];
        if (prev !== undefined && prev.length <= 2 && /^[:.,;)\]\-–]/.test(l)) out[out.length - 1] = prev + l;
        else out.push(l);
      });
    return out.join("\n");
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
      pages.push({ page: i + 1, text: content ? textOf(content, fonts, tally) : "" });
    }

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
      notes,
      // Always. Not a warning about this file — a fact about the format.
      caution:
        "Read out of a PDF, so treat it as a rough draft. Tables lose their columns and anything in two columns can come out interleaved. Check it before keeping it.",
    };
  }

  window.OrganiserPdfText = { read, parseCMap, bytesToLatin1 };
})();
