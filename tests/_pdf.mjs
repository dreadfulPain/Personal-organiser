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
