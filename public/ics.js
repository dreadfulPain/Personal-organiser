// .ics CALENDAR IMPORT — plain code, no AI, no library.
//
// Most school systems export .ics, and .ics is just text with one field per
// line. Reading it directly is both more accurate and more honest than asking a
// model to guess: term dates and INSET days are facts, and a fact should never
// arrive through a probabilistic step.
//
// We pull out exactly three things — name, start, end — and ignore everything
// else in the file. Anything we can't read is reported back by name rather than
// silently dropped, so an import can never quietly lose half a term.
//
// TIME ZONES, honestly: a timetable is written in the wall-clock time of the
// place you work, so a "09:00" stays 09:00 whatever the file's TZID says. The
// one exception is a UTC stamp (a trailing "Z"), which really is a different
// number and is converted to local time.

(function () {
  "use strict";

  const pad2 = (n) => String(n).padStart(2, "0");

  // Long lines are folded: a continuation begins with a space or tab.
  function unfold(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  }
  function unescapeText(v) {
    return (v || "")
      .replace(/\\n/gi, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }

  // "20260914T090000" / "20260914T080000Z" / "20260914"
  function parseStamp(raw, params) {
    const v = (raw || "").trim();
    let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
    if (m) {
      const [, y, mo, d, h, mi, s, z] = m;
      if (z) {
        // A real UTC instant — convert to this machine's local wall clock.
        const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
        return { date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`, time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, allDay: false };
      }
      return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false };
    }
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m) {
      const isDate = /VALUE=DATE/i.test(params || "");
      return { date: `${m[1]}-${m[2]}-${m[3]}`, time: "", allDay: isDate || true };
    }
    return null;
  }

  const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function parseRule(rrule) {
    if (!rrule) return null;
    const parts = {};
    rrule.split(";").forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) parts[p.slice(0, i).toUpperCase()] = p.slice(i + 1);
    });
    const freq = (parts.FREQ || "").toUpperCase();
    if (freq !== "WEEKLY" && freq !== "DAILY") return null; // anything odder stays a one-off
    const days = (parts.BYDAY || "")
      .split(",")
      .map((d) => DOW[d.replace(/^[-+]?\d+/, "").toUpperCase()])
      .filter((d) => d !== undefined);
    const until = parseStamp(parts.UNTIL || "", "");
    return { freq, days, until: until ? until.date : "", count: Number(parts.COUNT) || 0 };
  }

  // → { blocks: [...], skipped: [names], count }
  function parse(text) {
    const lines = unfold(String(text || "")).split("\n");
    const blocks = [];
    const skipped = [];
    let cur = null;

    for (const line of lines) {
      const t = line.trim();
      if (/^BEGIN:VEVENT$/i.test(t)) {
        cur = {};
        continue;
      }
      if (/^END:VEVENT$/i.test(t)) {
        if (cur) finish(cur, blocks, skipped);
        cur = null;
        continue;
      }
      if (!cur) continue;
      const c = t.indexOf(":");
      if (c < 0) continue;
      const left = t.slice(0, c);
      const value = t.slice(c + 1);
      const semi = left.indexOf(";");
      const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
      const params = semi < 0 ? "" : left.slice(semi + 1);
      if (name === "SUMMARY") cur.summary = unescapeText(value);
      else if (name === "DTSTART") cur.start = { ...parseStamp(value, params), params };
      else if (name === "DTEND") cur.end = { ...parseStamp(value, params), params };
      else if (name === "RRULE") cur.rule = parseRule(value);
      else if (name === "LOCATION") cur.location = unescapeText(value);
    }
    return { blocks, skipped, count: blocks.length };
  }

  function finish(ev, blocks, skipped) {
    const label = ev.summary || "(untitled)";
    if (!ev.start || !ev.start.date) {
      skipped.push(label);
      return;
    }
    // An all-day entry — a holiday, an INSET day — writes off the whole day
    // rather than sitting in it as a block you could plan around.
    if (!ev.start.time) {
      const days = spanDays(ev.start.date, ev.end && ev.end.date ? ev.end.date : ev.start.date);
      days.forEach((d) => {
        blocks.push({ label, start: "00:00", end: "23:59", date: d, days: [], blocksDay: true, soft: false, source: "ics" });
      });
      return;
    }
    const start = ev.start.time;
    const end = ev.end && ev.end.time ? ev.end.time : addHour(start);
    if (end <= start) {
      skipped.push(label); // crosses midnight, or a bad pair — say so rather than guess
      return;
    }
    const base = { label, start, end, soft: false, source: "ics", note: ev.location || "" };
    if (ev.rule) {
      const days = ev.rule.freq === "DAILY" ? [0, 1, 2, 3, 4, 5, 6] : ev.rule.days.length ? ev.rule.days : [new Date(ev.start.date + "T12:00:00").getDay()];
      blocks.push({ ...base, days, date: "", from: ev.start.date, to: ev.rule.until || countUntil(ev.start.date, ev.rule.count, days.length) });
    } else {
      blocks.push({ ...base, days: [], date: ev.start.date });
    }
  }

  // An all-day DTEND is exclusive: a one-day holiday ends on the NEXT day.
  function spanDays(fromISO, toISO) {
    const out = [];
    const a = new Date(fromISO + "T12:00:00");
    const b = new Date((toISO || fromISO) + "T12:00:00");
    let guard = 0;
    for (let d = new Date(a); d < b || out.length === 0; d.setDate(d.getDate() + 1)) {
      out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
      if (++guard > 400) break; // a malformed file can't run away with us
    }
    return out;
  }
  function addHour(hm) {
    const m = /^(\d{2}):(\d{2})$/.exec(hm);
    if (!m) return "23:59";
    const mins = Math.min(23 * 60 + 59, +m[1] * 60 + +m[2] + 60);
    return pad2(Math.floor(mins / 60)) + ":" + pad2(mins % 60);
  }
  function countUntil(fromISO, count, perWeek) {
    if (!count || !perWeek) return "";
    const weeks = Math.ceil(count / perWeek);
    const d = new Date(fromISO + "T12:00:00");
    d.setDate(d.getDate() + weeks * 7);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  window.OrganiserIcs = { parse };
})();
