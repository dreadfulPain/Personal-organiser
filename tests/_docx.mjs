// A REAL .docx, BUILT HERE.
//
// Not a stand-in for one: an actual zip with a deflated word/document.xml
// inside it, so the reader under test does the whole job — finds the entry,
// inflates it, takes the tags out. A fixture that skipped the zip would pass
// while the unzipping was broken, which is the half most likely to be.
//
// It lives here rather than in a suite because two suites need it, and one
// copy each is how the same fixture quietly starts testing two things.
//
// No school document is committed. Everything a suite reads is written here.
import zlib from "node:zlib";

export function docx(documentXml) {
  const name = Buffer.from("word/document.xml");
  const body = Buffer.from(documentXml, "utf8");
  const packed = zlib.deflateRawSync(body);
  const crc = zlib.crc32 ? zlib.crc32(body) : 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // the local header is at the front

  const before = Buffer.concat([local, name, packed]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(before.length, 16);
  return Buffer.concat([before, central, name, eocd]);
}

// What a suite actually hands the reader.
export const asFile = (bytes) => new Uint8Array(bytes).buffer;

// Word's XML, in the four shapes that matter.
export const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
export const cell = (...ps) => `<w:tc>${ps.map(p).join("")}</w:tc>`;
export const row = (...cells) => `<w:tr>${cells.join("")}</w:tr>`;
export const table = (...rows) => `<w:tbl>${rows.join("")}</w:tbl>`;
export const doc = (inner) => `<?xml version="1.0"?><w:document><w:body>${inner}</w:body></w:document>`;
