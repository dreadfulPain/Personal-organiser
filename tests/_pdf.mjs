// A REAL PDF, BUILT HERE, SO THE READER IS TESTED AND NOT A STAND-IN.
//
// Everything the PDF reader gets wrong, it gets wrong in the file format: a
// dropped capital, a word split at the column edge, a table that is really a
// picture. None of that survives being described in a fixture — it has to be a
// PDF, with a real content stream, really deflated.
//
// Two test files need one, which is one too many for a copy each.

import zlib from "node:zlib";

// `lines` are drawn one under another, each as its own text-showing operation,
// which is what makes them separate lines to the reader.
//
// opts.picture: the WIDTH of an image to declare on the page. The bytes are
// nonsense; the width is the point, because that is what tells a screenshot of
// a table from a crest on a cover.
export function buildPdf(lines, opts) {
  const o = opts || {};
  const content = "BT /F1 11 Tf 60 760 Td " +
    lines.map((l, i) => `${i ? "0 -18 Td " : ""}(${l}) Tj `).join("") + "ET";
  const comp = zlib.deflateSync(Buffer.from(content));
  const img = o.picture
    ? `<< /Type /XObject /Subtype /Image /Width ${o.picture} /Height 500 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length 3 >>\nstream\r\nabc\r\nendstream`
    : null;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> " +
      (img ? "/XObject << /X1 6 0 R >> " : "") + ">> /Contents 4 0 R >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    img,
  ];
  let out = Buffer.from("%PDF-1.4\n");
  objs.forEach((x, i) => {
    if (x === undefined || (x === null && i !== 3)) return;
    const body = x === null
      ? Buffer.concat([Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\r\n`), comp, Buffer.from("\r\nendstream")])
      : Buffer.from(x);
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
  });
  return Buffer.concat([out, Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF")]);
}

// ---- THE FOUR TRAPS, EACH AS A REAL PDF ------------------------------------
//
// These were four files kept in a temporary directory, which a recycled machine
// took with it — so the checks built around them stopped running and the suite
// stopped dead on the first missing one. Built here instead: a fixture that is
// code cannot go missing, cannot drift from the check it is for, and cannot be
// an absolute path into somebody's scratchpad.
//
// Each is shaped around ONE thing the reader got wrong in the wild. They are
// deliberately minimal — a trap and nothing else — so that when one fails there
// is only one thing it can mean.

// A PDF is objects, a cross-reference table, and a trailer saying where that
// table is. Written once here so the four below differ only in the thing each
// is about.
//
// THE XREF TABLE IS NOT OPTIONAL, even though this app's own reader does not
// need one — it finds objects by scanning for them, which is what lets it open
// the malformed files schools actually hand out. Without a table these fixtures
// could only ever be read by the reader they exist to test, so "my reader
// agrees with my writer" would be the entire evidence. With one, any PDF tool
// opens them, and the fixtures can be checked against something that is not me.
export function pdf(objs) {
  let out = Buffer.from("%PDF-1.4\n");
  const at = [];
  objs.forEach((body, i) => {
    if (body === undefined || body === null) { at[i] = null; return; }
    at[i] = out.length;
    const b = Buffer.isBuffer(body) ? body : Buffer.from(body);
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), b, Buffer.from("\nendobj\n")]);
  });
  const start = out.length;
  const n = objs.length + 1;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 0; i < objs.length; i++)
    xref += at[i] === null
      ? "0000000000 65535 f \n"
      : `${String(at[i]).padStart(10, "0")} 00000 n \n`;
  return Buffer.concat([
    out,
    Buffer.from(xref),
    Buffer.from(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`),
  ]);
}

// EVERY STREAM ENDS \r\n BEFORE endstream, which is legal, common, and the thing
// that used to make every page come back empty.
function stream(text, extra) {
  const comp = zlib.deflateSync(Buffer.from(text, "latin1"));
  return Buffer.concat([
    Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode${extra || ""} >>\nstream\r\n`),
    comp,
    Buffer.from("\r\nendstream"),
  ]);
}

const hex = (s) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

// 1. A FONT WHOSE DICTIONARY IS AN OBJECT OF ITS OWN.
//
// /Resources /Font 6 0 R — the font dict is not inline, it is its own object.
// Miss that and no font resolves, so no glyph map is applied, and the raw
// two-byte codes come out as text: they LOOK like words and are not, and every
// high byte is a NUL. That is what the NUL check in the suite is about.
//
// The map is a ToUnicode CMap in an object of its own, as real ones are. Glyph
// 3 is a T only because the map says so.
export function cidPdf() {
  const LETTERS = "TIMEABL";                 // T I M E A B L — enough for TIMETABLE
  const code = (ch) => LETTERS.indexOf(ch) + 1;
  const twoByte = (s) => [...s].map((ch) => String.fromCharCode(0, code(ch))).join("");
  // Drawn as two runs with a big negative kern between them: the document drew
  // a space instead of writing one, which is how a great many of them do it.
  const content =
    "BT /F1 12 Tf 60 700 Td " +
    `[<${hex(twoByte("TIME"))}> -400 <${hex(twoByte("TABLE"))}>] TJ ET`;
  const cmap =
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n" +
    `1 begincodespacerange <0000> <FFFF> endcodespacerange\n` +
    `${LETTERS.length} beginbfchar\n` +
    [...LETTERS].map((ch) => `<${String(code(ch)).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}>`).join("\n") +
    "\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end";
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    // The indirection this fixture exists for.
    "<< /Type /Page /Parent 2 0 R /Resources << /Font 6 0 R >> /Contents 4 0 R >>",
    stream(content),
    "<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Sample /Encoding /Identity-H /DescendantFonts [] /ToUnicode 7 0 R >>",
    "<< /F1 5 0 R >>",
    stream(cmap),
  ]);
}

// 2. A LINE BREAK THAT WAS NEVER THERE.
//
// A cell drawn as two runs a hair apart — "8:00-" then "9:30" — with a vertical
// nudge smaller than the text is tall. Read with a fixed threshold that becomes
// two lines, and a timetable's times come out cut in half. A real line break
// follows, so the fixture says both halves of the rule at once.
export function splitPdf() {
  // TWO RUNS THAT NOTHING DOWNSTREAM WOULD REJOIN, which is what makes this
  // fixture about the threshold rather than about the tidying that happens
  // after it. "8:00-" and "9:30" are put back together by a later rule whatever
  // the threshold does — so on their own they prove nothing about it. A word
  // cut in half is rejoined by no rule at all: get the threshold wrong and
  // "Registration" stays "Registra" and "tion".
  const content =
    "BT /F1 11 Tf 60 700 Td (8:00-) Tj " +
    "0 -1 Td (9:30) Tj " +           // a nudge: NOT a new line
    "0 -18 Td (Registra) Tj " +      // a real new line, then…
    "0 -0.6 Td (tion) Tj " +         // …a nudge inside one word
    "0 -18 Td (Next row) Tj ET";     // and a real new line again
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    stream(content),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}

// 3. A PAGE THAT IS ONLY A PICTURE.
//
// No text at all and an image on it. The dangerous outcome is silence: an empty
// result with no explanation reads as an empty document, and somebody retypes
// their whole timetable believing the file had nothing in it.
export function scanPdf() {
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /XObject << /X1 5 0 R >> >> /Contents 4 0 R >>",
    stream("q 1 0 0 1 0 0 cm /X1 Do Q"),
    Buffer.concat([
      Buffer.from("<< /Type /XObject /Subtype /Image /Width 1200 /Height 900 " +
        "/BitsPerComponent 8 /ColorSpace /DeviceRGB /Length 3 >>\nstream\r\n"),
      Buffer.from([1, 2, 3]),
      Buffer.from("\r\nendstream"),
    ]),
  ]);
}

// 4. A FONT WITH NO MAP AT ALL.
//
// Nothing can be done about this one — the bytes may be letters or they may be
// glyph numbers and there is no way to tell from inside the file. What must not
// happen is passing silently, because what comes out looks exactly like text.
export function nomapPdf() {
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    stream("BT /F1 11 Tf 60 700 Td <0102030405060708> Tj ET"),
    // No /ToUnicode anywhere.
    "<< /Type /Font /Subtype /TrueType /BaseFont /AAAAAA+Sample /FirstChar 1 /LastChar 8 >>",
  ]);
}
