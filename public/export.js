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
  function friendlyDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
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
    const prepared = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
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

  window.OrganiserExport = { studentSection, staleTopics, oldTopics, oldCutoffISO, latestLevels, needsCheck, docShell, download };
})();
