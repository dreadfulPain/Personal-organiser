// Shared export machinery for the record log (plain script, used by the
// Students and Class pages). Builds parent-facing progress pages: parent words
// only (the working numbers never leave the app), personally-confirmed
// evidence only, work-sample images embedded so the file stands alone.
// Also the honesty helpers: which skills' NEWEST evidence is still unconfirmed
// (an export would show an older confirmed level — or nothing — instead).

(function () {
  "use strict";

  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function needsCheck(rec) {
    return rec.src === "ai" && !rec.checkedAt;
  }
  function newestFirst(a, b) {
    return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  }
  // ONE WAY OF WRITING A DATE, for the whole app — see dates.js. Six files
  // kept their own copy of this, each subtly different, and none of them said
  // which year a date was in. Fixing the shared one changed nothing on screen,
  // because almost nothing was using it.
  const friendlyDate = (iso) =>
    OrganiserDates.dayWords(iso, { weekday: false, relative: false, year: true });
  function latestLevels(recs) {
    const m = new Map();
    recs.forEach((r) => {
      if (!r.topic || !r.level) return;
      const key = (r.date || "") + "|" + (r.createdAt || "");
      const cur = m.get(r.topic);
      if (!cur || key > cur.key) m.set(r.topic, { level: r.level, key });
    });
    return m;
  }
  function parentWord(config, level) {
    const i = (config.levels || []).indexOf(level);
    return (config.levelParentWords || [])[i] || level;
  }
  // Skills where the newest record is unconfirmed AI — the export would say
  // something older (or nothing). The pre-flight list names these.
  function staleTopics(who, records, config) {
    const mine = records.filter((r) => r.who === who && r.topic);
    const out = [];
    (config.topics || []).forEach((t) => {
      const all = mine.filter((r) => r.topic === t).sort(newestFirst);
      if (all.length && needsCheck(all[0])) out.push(t);
    });
    return out;
  }
  // Skills whose export-visible judgement (latest CONFIRMED evidence) is from
  // more than the configured window ago — judgements decay; this names the ones
  // worth fresh evidence. A fact about the record's age, never about the person.
  function oldCutoffISO(config) {
    const days = Number(config && config.staleDays) > 0 ? Math.min(Number(config.staleDays), 365) : 60;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function oldTopics(who, records, config) {
    const usable = records.filter((r) => r.who === who && r.topic && !needsCheck(r));
    const lv = latestLevels(usable);
    const cutoff = oldCutoffISO(config);
    const out = [];
    lv.forEach((v, t) => {
      const date = (v.key || "").split("|")[0];
      if (date && date < cutoff) out.push(t);
    });
    return out;
  }

  const IMG_EXT = /\.(jpe?g|png|gif|webp)$/i;
  async function fileAsDataUri(id) {
    try {
      const r = await fetch("/files/" + String(id).split("/").map(encodeURIComponent).join("/"));
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function studentSection(who, records, config) {
    const mine = records.filter((r) => r.who === who && r.topic);
    const excluded = mine.filter(needsCheck).length;
    const usable = mine.filter((r) => !needsCheck(r));
    const lv = latestLevels(usable);
    const stale = staleTopics(who, records, config);

    let html = `<section class="student"><h1>${escapeHtml(who)} — progress summary</h1>`;
    for (const topic of config.topics || []) {
      const level = lv.get(topic);
      html += `<section><h2>${escapeHtml(topic)}</h2>`;
      html += `<p class="lvl">${level ? escapeHtml(parentWord(config, level.level)) : "not assessed yet"}</p>`;
      const ev = usable.filter((r) => r.topic === topic).sort(newestFirst);
      for (const r of ev) {
        html += `<div class="ev"><p><strong>${escapeHtml(friendlyDate(r.date))}</strong> — ${escapeHtml(r.summary)}</p>`;
        for (const f of r.files || []) {
          if (IMG_EXT.test(f.name || "")) {
            const uri = await fileAsDataUri(f.id);
            if (uri) html += `<img src="${uri}" alt="${escapeHtml(f.name)}" />`;
            else html += `<p class="fn">work sample: ${escapeHtml(f.name)}</p>`;
          } else if (f.name) {
            html += `<p class="fn">work sample on file: ${escapeHtml(f.name)}</p>`;
          }
        }
        html += `</div>`;
      }
      html += `</section>`;
    }
    html += `</section>`;
    return {
      html,
      excluded,
      stale,
      old: oldTopics(who, records, config),
      assessed: lv.size,
      unassessed: (config.topics || []).length - lv.size,
    };
  }

  function docShell(title, inner) {
    const prepared = OrganiserDates.dayWords(stamp(), { weekday: false, relative: false, year: true, long: true });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#333;line-height:1.6}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.05rem;margin:26px 0 2px;border-bottom:1px solid #ddd;padding-bottom:4px}
.lvl{margin:4px 0 8px;font-weight:bold;color:#3c6b5c}.ev p{margin:4px 0}
.ev img{max-width:100%;border:1px solid #ddd;border-radius:6px;margin:6px 0}
.fn{font-style:italic;color:#777}.meta{color:#777;font-size:0.9rem}
.student{margin-bottom:48px}
@media print{.student{page-break-before:always}.student:first-of-type{page-break-before:auto}}</style></head><body>
<p class="meta">Prepared ${escapeHtml(prepared)}. Each skill is described in plain words, with the dated work behind it.</p>
${inner}
</body></html>`;
  }

  function download(name, html) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- exports you can open WITHOUT the app --------------------------------
  // organiser-data.json stays the single truth. Everything below is a copy that
  // gets rebuilt, written to data/exports/ in folders you can navigate in
  // Windows Explorer without knowing this app exists.
  //
  // No .xlsx and no .docx on purpose: both are zipped folders of XML and writing
  // them properly needs a library, which would break the zero-dependency rule
  // for no real gain. CSV opens in Excel on a double-click. HTML opens in Word
  // and prints correctly. That's the whole trick.
  //
  // Every write is a NEW dated file, never an overwrite — so if you hand-edit
  // one in Excel, the next export sits beside it instead of wiping your work.
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Excel's rules, not ours: quote anything with a comma, quote or newline, and
  // double up internal quotes.
  function csvCell(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) {
    return (rows || []).map((r) => (r || []).map(csvCell).join(",")).join("\r\n");
  }

  // Writes into data/exports/. Needs the server (file mode); in preview mode it
  // falls back to a normal download so nothing is silently lost.
  async function saveToFolder(relPath, content, opts) {
    if (window.OrganiserStore && OrganiserStore.mode !== "file") {
      download(relPath.split("/").pop(), content);
      return { ok: true, fallback: true };
    }
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath, content, bom: !!(opts && opts.bom) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, message: d.message || "Couldn't write that file." };
      return { ok: true, path: d.path };
    } catch {
      return { ok: false, message: "Couldn't reach the app's file store." };
    }
  }

  // One row per id per skill, with the level as BOTH the working number and the
  // parent wording — so the spreadsheet is useful to you and safe to hand on.
  // WHO THE SPREADSHEET IS ABOUT is given, not guessed. It used to read
  // config.whoIds directly — the hand-typed list that starts as five
  // placeholders — so the file a head of department opens would have had five
  // rows about people who don't exist and none about the actual class.
  // A NAME COLUMN, because a spreadsheet nobody can read is not a document.
  // The id stayed the only thing identifying a row, and once ids came from your
  // contacts rather than being S01 to S05 they were internal strings —
  // "mt3v7fbo7pwla" — so the file a head of department opens said nothing about
  // anybody. The id is kept alongside for joining back to the app.
  //
  // nameOf is supplied by the caller, like `who` is: this file never learns what
  // a person is, and never reaches for a store.
  function resultsCsv(records, config, who, nameOf) {
    const name = typeof nameOf === "function" ? nameOf : (x) => x;
    const rows = [["id", "name", "skill", "level", "in words", "dated", "from"]];
    const list = Array.isArray(who) && who.length ? who : config.whoIds || [];
    list.forEach((who) => {
      const usable = (records || []).filter((r) => r.who === who && r.topic && !needsCheck(r));
      const lv = latestLevels(usable);
      (config.topics || []).forEach((topic) => {
        const v = lv.get(topic);
        rows.push([
          who,
          name(who),
          topic,
          v ? v.level : "",
          v ? parentWord(config, v.level) : "not assessed yet",
          v ? (v.key || "").split("|")[0] : "",
          v ? "confirmed evidence" : "",
        ]);
      });
    });
    return toCsv(rows);
  }

  // ---- READ IT BEFORE IT LEAVES THE BUILDING -------------------------------
  //
  // Everywhere else in this app a one-tap confirm is right: the cost of a small
  // mistake is a small correction, and a heavier ritual would just train you to
  // click past it. Exactly one place is different — the page you hand to a
  // parent. That text was confirmed weeks ago on a narrow row, in passing, and
  // it's now about to leave the building with a child's name on it.
  //
  // So this is not a new confirmation habit. It's one read of a page you were
  // going to read anyway, shown at the size it will be read at, at the moment
  // it matters. The sentences are the actual sentences that will appear.
  function reviewPanel(students, records, config, onConfirm) {
    const box = document.createElement("div");
    box.className = "xp-review";
    const lines = [];
    students.forEach((who) => {
      const mine = records.filter((r) => r.who === who && r.topic && !needsCheck(r));
      const lv = latestLevels(mine);
      const per = [];
      (config.topics || []).forEach((t) => {
        const v = lv.get(t);
        if (v) per.push({ topic: t, words: parentWord(config, v.level) });
      });
      const said = mine.sort(newestFirst).slice(0, 6);
      lines.push({ who, per, said });
    });

    box.innerHTML =
      `<h3>Read this before it goes out</h3>` +
      `<p class="xp-why">These are the exact words that will appear, about a named child. Everything here was
        confirmed by you at some point — this is the read that counts, because after this it's out of your hands.</p>` +
      lines
        .map(
          (l) =>
            `<section class="xp-student"><h4>${escapeHtml(l.who)}</h4>` +
            (l.per.length
              ? `<ul class="xp-levels">${l.per.map((p) => `<li><b>${escapeHtml(p.topic)}</b> — ${escapeHtml(p.words)}</li>`).join("")}</ul>`
              : `<p class="xp-none">no levels will be shown</p>`) +
            (l.said.length
              ? `<ul class="xp-said">${l.said.map((r) => `<li>${escapeHtml(friendlyDate(r.date))} — ${escapeHtml(r.summary)}</li>`).join("")}</ul>`
              : `<p class="xp-none">no dated notes will be shown</p>`) +
            `</section>`
        )
        .join("");

    const actions = document.createElement("div");
    actions.className = "xp-actions";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn";
    go.textContent = "I've read it — export";
    go.addEventListener("click", () => onConfirm(true));
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "link";
    stop.textContent = "not yet";
    stop.addEventListener("click", () => onConfirm(false));
    actions.append(go, stop);
    box.appendChild(actions);
    return box;
  }

  window.OrganiserExport = {
    studentSection,
    reviewPanel,
    staleTopics,
    oldTopics,
    oldCutoffISO,
    latestLevels,
    parentWord,
    needsCheck,
    docShell,
    download,
    toCsv,
    csvCell,
    saveToFolder,
    resultsCsv,
    stamp,
  };
})();
