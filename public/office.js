// GETTING THE WORDS OUT OF A WORD DOCUMENT.
//
// Schools send .docx. Not sometimes — constantly, because that is what is on
// the staffroom computer. The app said "I can't open docx files yet" three
// separate times to somebody who was doing nothing unusual, and each time the
// honest next step was "open it and copy the text across", which is a chore
// somebody should not have to do to use their own calendar.
//
// A .docx IS A ZIP, and there is nothing in it that needs a library. The whole
// document is one XML file inside it, and the browser can already inflate —
// DecompressionStream, the same one pdftext.js uses. So: find the entry, unzip
// it, take the tags out.
//
// WHAT SHAPE COMES OUT MATTERS MORE THAN THE TEXT. A calendar in Word is a
// TABLE, and a table read as a paragraph is a wall of numbers that no reader
// here can do anything with. So each CELL comes out on its own line — which is
// exactly what a table looks like after a PDF has flattened it, so every reader
// already written for that shape works on this one without being told.
//
// WHAT IT WILL NOT DO. Old .doc — the pre-2007 binary format — is not a zip and
// is not readable this way. Neither is a .docx whose content is a picture. Both
// say so rather than coming back empty.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (b, at) => dv(b).getUint16(at, true);
  const u32 = (b, at) => dv(b).getUint32(at, true);

  // ---- the zip ---------------------------------------------------------------
  //
  // Read from the END, which is how a zip is meant to be read: the central
  // directory is the index and it lives at the back, so a file that has had
  // anything appended to it still reads correctly.
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;

  function findEocd(b) {
    // The comment field can be 64k, so that is how far back it is worth looking.
    const from = Math.max(0, b.length - 66000);
    for (let i = b.length - 22; i >= from; i--) if (u32(b, i) === EOCD) return i;
    return -1;
  }

  // Every entry's name and where its data starts. Names only — nothing is
  // inflated until something asks for it.
  function entriesIn(b) {
    const eocd = findEocd(b);
    if (eocd < 0) return null;
    let at = u32(b, eocd + 16);
    const count = u16(b, eocd + 10);
    const out = new Map();
    for (let i = 0; i < count && at + 46 <= b.length; i++) {
      if (u32(b, at) !== CENTRAL) break;
      const method = u16(b, at + 10);
      const nameLen = u16(b, at + 28);
      const extraLen = u16(b, at + 30);
      const commentLen = u16(b, at + 32);
      const localAt = u32(b, at + 42);
      let name = "";
      for (let j = 0; j < nameLen; j++) name += String.fromCharCode(b[at + 46 + j]);
      out.set(name, { method, localAt, size: u32(b, at + 20) });
      at += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function unzipOne(b, entry) {
    const at = entry.localAt;
    if (u32(b, at) !== LOCAL) return null;
    // THE LOCAL HEADER'S OWN LENGTHS, not the central directory's — they are
    // allowed to differ, and using the wrong ones starts the data mid-stream.
    const nameLen = u16(b, at + 26);
    const extraLen = u16(b, at + 28);
    const from = at + 30 + nameLen + extraLen;
    const raw = b.subarray(from, from + entry.size);
    if (entry.method === 0) return raw;
    if (entry.method !== 8 || typeof DecompressionStream !== "function") return null;
    try {
      const ds = new DecompressionStream("deflate-raw");
      const buf = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  // ---- the document ----------------------------------------------------------
  //
  // Word's XML is verbose and almost none of it matters here. Four tags do:
  //
  //   </w:p>   a paragraph ended. Inside a table cell that is a line break in
  //            somebody's typing, so it becomes a space; the CELL is the unit.
  //   </w:tc>  a cell ended  → a line, so every reader written for a flattened
  //            table works on this unchanged.
  //   </w:tr>  a row ended   → a line too.
  //   <w:tab/> a real tab somebody typed.
  //
  // Everything else goes. Nothing here reads the words.
  const AMPS = [["&lt;", "<"], ["&gt;", ">"], ["&quot;", '"'], ["&apos;", "'"], ["&amp;", "&"]];

  // A PARAGRAPH MEANS TWO DIFFERENT THINGS depending on where it is.
  //
  // Outside a table it is a line — the title, a heading, a bullet. Inside a
  // table CELL it is a line break in somebody's typing, and the CELL is the unit
  // that matters: "4" and "Staff Mtg" are one square, not two rows.
  //
  // Treating them the same joined a document's whole title onto the first cell
  // of its calendar, which then had no heading row above it and read as nothing
  // at all. So the tables are cut out first and each side gets its own rule.
  const A_TABLE = /(<w:tbl[\s>][\s\S]*?<\/w:tbl>)/;

  function textFromXml(xml) {
    let s = String(xml || "");
    // Anything Word marked as deleted is not in the document any more.
    s = s.replace(/<w:del\b[\s\S]*?<\/w:del>/g, "");
    s = s.replace(/<w:tab\b[^>]*\/?>/g, "\t");
    s = s.replace(/<w:br\b[^>]*\/?>/g, " ");
    const strip = (bit, inTable) => {
      let t = bit
        .replace(/<\/w:p>/g, inTable ? " " : "\n")
        .replace(/<\/w:tc>/g, "\n")
        .replace(/<\/w:tr>/g, "\n")
        .replace(/<[^>]+>/g, "");
      AMPS.forEach(([a, b]) => { t = t.split(a).join(b); });
      return t;
    };
    // split() keeps the captured tables at the odd positions.
    s = s.split(A_TABLE).map((bit, i) => strip(bit, i % 2 === 1)).join("\n");
    return s
      .split("\n")
      .map((l) => l.replace(/[ \u00a0]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }


  // The one thing the caller asks for. Returns { text, note }.
  async function readDocx(arrayBuffer) {
    const b = new Uint8Array(arrayBuffer);
    // "PK" — every zip starts with it, and an old .doc does not.
    if (!(b[0] === 0x50 && b[1] === 0x4b))
      return {
        text: "",
        note: "That looks like an older Word file (.doc rather than .docx). Opening it in Word and saving it as .docx will work, and so will copying the text across.",
      };
    const entries = entriesIn(b);
    if (!entries) return { text: "", note: "That file couldn't be unpacked." };
    const name = [...entries.keys()].find((k) => k === "word/document.xml");
    if (!name)
      return { text: "", note: "That's a Word file with no document inside it — which usually means it isn't really one." };
    const bytes = await unzipOne(b, entries.get(name));
    if (!bytes) return { text: "", note: "The document inside that file couldn't be unpacked." };
    const xml = new TextDecoder("utf-8").decode(bytes);
    const text = textFromXml(xml);
    if (!text.trim())
      return {
        text: "",
        note: "There are no words in that document — everything in it is a picture. A photo of it would actually read better.",
      };
    return { text, note: "" };
  }

  window.OrganiserOffice = { readDocx, textFromXml, entriesIn };
})();
