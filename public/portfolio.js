// The Portfolio: a list of POINTS (standards/competencies) and the evidence of
// your own work behind each — export the lot as a portfolio document.
//
// GENERIC by design (§0.2): the code knows only "points" and "evidence". The
// point list is DATA, seeded with the UK Teachers' Standards but fully editable
// — reword them, add or remove any, or point it at a different framework.
//
// Plain script (works under file://). Saves only { portfolio } via the
// merge-save; evidence files use the same upload/serve/delete as the record log.

(() => {
  "use strict";

  // Evidence is the THING; frameworks are tags ON it. One photo of a lesson can
  // count toward a Teachers' Standard, an IB practice and anything else at once —
  // stored once, tagged many times. (Storing evidence inside each framework would
  // mean three copies of everything and no way to keep them in step.)
  let pf = null; // { title, points:[{id,code,title}], evidence:[{id,pointIds:[],date,note,files:[]}] }
  let items = []; // the shared task pool — tasks linked to a standard live here too

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
  // Asked of one place — see OrganiserDates.isoOf.
  const isoOf = (d) => OrganiserDates.isoOf(d);
  // Asked of one place — see OrganiserDates.today(). Fourteen files worked this
  // out for themselves, in four spellings that all agreed. So did nameOf, once.
  const todayISO = () => OrganiserDates.today();
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  // ONE WAY OF WRITING A DATE, for the whole app — see dates.js. Six files
  // kept their own copy of this, each subtly different, and none of them said
  // which year a date was in. Fixing the shared one changed nothing on screen,
  // because almost nothing was using it.
  const friendlyDate = (iso) =>
    OrganiserDates.dayWords(iso, { weekday: false, relative: false, year: true });

  // Seeded once if absent — the UK Teachers' Standards (2011) as editable data.
  const DEFAULT_PORTFOLIO = {
    title: "Teachers' Standards portfolio",
    points: [
      { id: "ts1", code: "TS1", title: "Set high expectations which inspire, motivate and challenge pupils" },
      { id: "ts2", code: "TS2", title: "Promote good progress and outcomes by pupils" },
      { id: "ts3", code: "TS3", title: "Demonstrate good subject and curriculum knowledge" },
      { id: "ts4", code: "TS4", title: "Plan and teach well structured lessons" },
      { id: "ts5", code: "TS5", title: "Adapt teaching to respond to the strengths and needs of all pupils" },
      { id: "ts6", code: "TS6", title: "Make accurate and productive use of assessment" },
      { id: "ts7", code: "TS7", title: "Manage behaviour effectively to ensure a good and safe learning environment" },
      { id: "ts8", code: "TS8", title: "Fulfil wider professional responsibilities" },
      { id: "part2", code: "Part 2", title: "Personal and professional conduct" },
    ],
    evidence: [],
  };
  function normalisePortfolio(p) {
    if (!p || typeof p !== "object") return null;
    const points = (Array.isArray(p.points) ? p.points : [])
      .map((pt) => ({
        id: pt && pt.id ? String(pt.id) : uid(),
        code: (pt && pt.code ? String(pt.code) : "").trim(),
        title: (pt && pt.title ? String(pt.title) : "").trim(),
      }))
      .filter((pt) => pt.title || pt.code);
    const evidence = (Array.isArray(p.evidence) ? p.evidence : []).map((e) => ({
      id: e && e.id ? String(e.id) : uid(),
      // back-compat: older evidence carried a single pointId
      pointIds: (Array.isArray(e && e.pointIds) ? e.pointIds : e && e.pointId ? [e.pointId] : [])
        .map((x) => String(x).trim())
        .filter(Boolean),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e && e.date) ? e.date : todayISO(),
      note: (e && e.note ? String(e.note) : "").trim(),
      files: Array.isArray(e && e.files) ? e.files : [],
      fromTaskId: (e && e.fromTaskId ? String(e.fromTaskId) : "") || undefined,
    }));
    return { title: (p.title || "").toString().trim() || "Portfolio", points, evidence };
  }
  let showGaps = false;

  function persist() {
    OrganiserStore.save({ portfolio: pf });
  }

  function evidenceFor(pointId) {
    return pf.evidence
      .filter((e) => (e.pointIds || []).includes(pointId))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""));
  }

  // ----- tasks linked to a standard (the "reminders to do the work" half) -----
  // A real task in the shared pool, so it also appears in Today/Week and can
  // carry a reminder — but shown here under its standard, tickable in place.
  function tasksFor(pointId) {
    return items
      .filter((i) => !i.done && i.standardId === pointId)
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  }
  function addTask(pointId, title) {
    title = (title || "").trim();
    if (!title) return;
    items.push({
      id: uid(),
      title,
      type: "task",
      date: "",
      time: "",
      deadlineType: "soft",
      importance: "normal",
      effort: "medium",
      tags: [],
      whenText: "",
      goalId: "",
      standardId: pointId,
      openLoop: false,
      promisedTo: "",
      remindAt: "",
      remindedAt: null,
      done: false,
      createdAt: nowISO(),
      completedAt: null,
    });
    OrganiserStore.save({ items });
    render();
  }
  // Done — and, if you want, the doing becomes the proof. A to-do and a piece of
  // evidence are different things, so the bridge is a choice, never automatic:
  // asEvidence=true files a matching evidence line under the same standard.
  function completeTask(id, asEvidence) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.done = true;
    it.completedAt = nowISO();
    if (asEvidence) {
      pf.evidence.unshift({
        id: uid(),
        pointIds: it.standardId ? [it.standardId] : [],
        date: todayISO(),
        note: it.title,
        files: [],
        fromTaskId: it.id, // traceable back to the task that produced it
      });
      OrganiserStore.save({ items, portfolio: pf });
      setStatus("Done — and logged as evidence. Add the proof to it below. ✓");
    } else {
      OrganiserStore.save({ items });
    }
    render();
  }

  // ----- mutations -----
  function addEvidence(pointId, note) {
    note = (note || "").trim();
    if (!note) return;
    pf.evidence.unshift({ id: uid(), pointIds: [pointId], date: todayISO(), note, files: [] });
    persist();
    render();
  }
  function deleteEvidence(id) {
    if (!confirm("Remove this piece of evidence? Any attached file is deleted too.")) return;
    const e = pf.evidence.find((x) => x.id === id);
    (e && e.files ? e.files : []).forEach((f) => fetch("/files/" + String(f.id).split("/").map(encodeURIComponent).join("/"), { method: "DELETE" }).catch(() => {}));
    pf.evidence = pf.evidence.filter((x) => x.id !== id);
    persist();
    render();
  }
  async function uploadTo(ev, file, folder) {
    try {
      // Filed into a plain, grabbable folder: data/files/portfolio/<standard>/…
      const r = await fetch(
        "/api/upload?name=" + encodeURIComponent(file.name) + "&folder=" + encodeURIComponent("portfolio/" + (folder || "unfiled")),
        { method: "POST", body: file }
      );
      if (!r.ok) {
        setStatus("Couldn't save that file.");
        return;
      }
      const d = await r.json();
      if (!ev.files) ev.files = [];
      ev.files.push({ id: d.id, name: d.name, addedAt: nowISO() });
      persist();
      setStatus("Attached. ✓");
      render();
    } catch {
      setStatus("Couldn't save that file — is the app window still open?");
    }
  }
  function removeFile(ev, f) {
    if (!confirm(`Remove "${f.name}"? The file is deleted too.`)) return;
    fetch("/files/" + String(f.id).split("/").map(encodeURIComponent).join("/"), { method: "DELETE" }).catch(() => {});
    ev.files = (ev.files || []).filter((x) => x.id !== f.id);
    persist();
    render();
  }
  function setStatus(msg) {
    const s = $("#pfStatus");
    s.textContent = msg || "";
    s.hidden = !msg;
    clearTimeout(setStatus._t);
    if (msg) setStatus._t = setTimeout(() => (s.hidden = true), 4000);
  }

  // ----- render -----
  function evidenceRow(point, ev) {
    const row = document.createElement("div");
    row.className = "pf-ev";
    row.innerHTML = `
      <div class="pf-ev-head">
        <span class="pf-ev-date">${escapeHtml(friendlyDate(ev.date))}</span>
        <button class="x-del pf-ev-del" type="button" title="Remove this evidence">×</button>
      </div>
      <textarea class="pf-ev-note" rows="2" aria-label="Evidence note">${escapeHtml(ev.note)}</textarea>
      <div class="rec-files"></div>`;
    row.querySelector(".pf-ev-note").addEventListener("change", (e) => {
      ev.note = e.target.value.trim();
      persist();
    });
    row.querySelector(".pf-ev-del").addEventListener("click", () => deleteEvidence(ev.id));

    // The same piece of work can count toward other points too — tag it here
    // rather than filing a duplicate copy under each framework.
    const also = (ev.pointIds || []).filter((id) => id !== point.id);
    const tagLine = document.createElement("div");
    tagLine.className = "pf-ev-tags";
    also.forEach((id) => {
      const p = pf.points.find((x) => x.id === id);
      if (!p) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "topic-chip pf-untag";
      chip.title = "Also counts here — click to untag";
      chip.textContent = "also " + (p.code || p.title.slice(0, 20));
      chip.addEventListener("click", () => {
        ev.pointIds = ev.pointIds.filter((x) => x !== id);
        persist();
        render();
      });
      tagLine.appendChild(chip);
    });
    const addTag = document.createElement("select");
    addTag.className = "pf-addtag";
    addTag.appendChild(new Option("+ also counts for…", ""));
    pf.points
      .filter((p) => !(ev.pointIds || []).includes(p.id))
      .forEach((p) => addTag.appendChild(new Option((p.code ? p.code + " — " : "") + p.title, p.id)));
    addTag.addEventListener("change", (e) => {
      if (!e.target.value) return;
      if (!ev.pointIds) ev.pointIds = [];
      ev.pointIds.push(e.target.value);
      persist();
      render();
    });
    if (pf.points.length > 1) tagLine.appendChild(addTag);
    row.appendChild(tagLine);
    const fw = row.querySelector(".rec-files");
    (ev.files || []).forEach((f) => {
      const line = document.createElement("div");
      line.className = "rec-file-line";
      const a = document.createElement("a");
      a.href = "/files/" + String(f.id).split("/").map(encodeURIComponent).join("/");
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = f.name;
      const del = document.createElement("button");
      del.className = "x-del";
      del.type = "button";
      del.title = "Remove this file";
      del.textContent = "×";
      del.addEventListener("click", () => removeFile(ev, f));
      line.append(a, del);
      fw.appendChild(line);
    });
    if (OrganiserStore.mode === "file") {
      const attach = document.createElement("label");
      attach.className = "rec-attach";
      attach.textContent = "+ attach a file";
      const inp = document.createElement("input");
      inp.type = "file";
      inp.hidden = true;
      inp.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) uploadTo(ev, f, point.code || point.id);
        e.target.value = "";
      });
      attach.appendChild(inp);
      fw.appendChild(attach);
    }
    return row;
  }

  function pointCard(point) {
    const ev = evidenceFor(point.id);
    const card = document.createElement("section");
    card.className = "pf-card";
    const n = ev.length;
    card.innerHTML = `
      <div class="pf-head">
        <h2 class="pf-code">${escapeHtml(point.code || "")}</h2>
        <span class="pf-count ${n ? "" : "gap"}">${n ? `${n} piece${n === 1 ? "" : "s"} of evidence` : "no evidence yet"}</span>
      </div>
      <p class="pf-title">${escapeHtml(point.title)}</p>
      <div class="pf-evs"></div>`;
    const evs = card.querySelector(".pf-evs");
    ev.forEach((e) => evs.appendChild(evidenceRow(point, e)));
    const add = document.createElement("div");
    add.className = "add-line";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "+ add evidence — what shows this, and where";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addEvidence(point.id, input.value);
        input.value = "";
      }
    });
    add.appendChild(input);
    card.appendChild(add);

    // Things to DO for this standard — real tasks, tickable here, that also live
    // in your normal lists (and can carry a reminder like any task).
    const tasks = tasksFor(point.id);
    const th = document.createElement("p");
    th.className = "pf-tasks-title";
    th.textContent = "To do for this standard";
    card.appendChild(th);
    if (tasks.length) {
      const tw = document.createElement("div");
      tw.className = "pf-tasks";
      tasks.forEach((it) => {
        const row = document.createElement("div");
        row.className = "gt-row";
        const tick = document.createElement("button");
        tick.className = "tick";
        tick.setAttribute("aria-label", "Mark done");
        tick.title = "Mark done (without logging evidence)";
        tick.addEventListener("click", () => completeTask(it.id, false));
        const main = document.createElement("div");
        main.className = "gt-main";
        main.innerHTML = `<span class="gt-title">${escapeHtml(it.title)}</span>${it.date ? `<span class="gt-when">${escapeHtml(friendlyDate(it.date))}</span>` : ""}`;
        const asEv = document.createElement("button");
        asEv.className = "link pf-done-ev";
        asEv.type = "button";
        asEv.textContent = "done → evidence";
        asEv.title = "Mark done AND log it as evidence for this standard";
        asEv.addEventListener("click", () => completeTask(it.id, true));
        row.append(tick, main, asEv);
        tw.appendChild(row);
      });
      card.appendChild(tw);
    }
    const addT = document.createElement("div");
    addT.className = "add-line";
    const ti = document.createElement("input");
    ti.type = "text";
    ti.placeholder = "+ add a task for this standard";
    ti.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addTask(point.id, ti.value);
        ti.value = "";
      }
    });
    addT.appendChild(ti);
    card.appendChild(addT);
    return card;
  }

  function render() {
    $("#pfTitle").textContent = pf.title;
    document.title = pf.title;
    const list = $("#pfList");
    list.innerHTML = "";
    if (!pf.points.length) {
      list.innerHTML = `<p class="empty">No points yet — add some in “Set up this portfolio” below.</p>`;
      return;
    }
    const points = showGaps ? pf.points.filter((p) => evidenceFor(p.id).length === 0) : pf.points;
    if (!points.length) {
      list.innerHTML = `<p class="empty">Every point has evidence. 🎉</p>`;
      return;
    }
    points.forEach((p) => list.appendChild(pointCard(p)));
  }

  // ----- export (self-contained portfolio doc, images embedded) -----
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
  async function exportPortfolio() {
    setStatus("Preparing the portfolio…");
    let covered = 0;
    let body = "";
    for (const point of pf.points) {
      const ev = evidenceFor(point.id);
      if (ev.length) covered++;
      body += `<section><h2>${escapeHtml(point.code ? point.code + " — " : "")}${escapeHtml(point.title)}</h2>`;
      if (!ev.length) body += `<p class="none">No evidence yet.</p>`;
      for (const e of ev) {
        body += `<div class="ev"><p><strong>${escapeHtml(friendlyDate(e.date))}</strong> — ${escapeHtml(e.note)}</p>`;
        for (const f of e.files || []) {
          if (IMG_EXT.test(f.name || "")) {
            const uri = await fileAsDataUri(f.id);
            if (uri) body += `<img src="${uri}" alt="${escapeHtml(f.name)}" />`;
            else body += `<p class="fn">file: ${escapeHtml(f.name)}</p>`;
          } else if (f.name) {
            body += `<p class="fn">file: ${escapeHtml(f.name)}</p>`;
          }
        }
        body += `</div>`;
      }
      body += `</section>`;
    }
    const prepared = OrganiserDates.dayWords(todayISO(), { weekday: false, relative: false, year: true, long: true });
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(pf.title)}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#333;line-height:1.6}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
.ev{margin:8px 0 14px}.ev p{margin:4px 0}.ev img{max-width:100%;border:1px solid #ddd;border-radius:6px;margin:6px 0}
.fn{font-style:italic;color:#777}.none{color:#999;font-style:italic}.meta{color:#777;font-size:0.9rem}
@media print{section{page-break-inside:avoid}}</style></head><body>
<h1>${escapeHtml(pf.title)}</h1>
<p class="meta">Prepared ${escapeHtml(prepared)} · ${covered} of ${pf.points.length} points evidenced.</p>
${body}</body></html>`;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${todayISO()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported — ${covered} of ${pf.points.length} points have evidence. ✓`);
  }

  // ----- set up (points as text) -----
  function pointsToText() {
    return pf.points.map((p) => (p.code ? `${p.code} — ${p.title}` : p.title)).join("\n");
  }
  function parsePoints(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = /^(.*?)\s+[—-]\s+(.*)$/.exec(line);
        // Keep a point's id stable if its wording is unchanged, so evidence stays linked.
        const code = m ? m[1].trim() : "";
        const title = m ? m[2].trim() : line;
        const existing = pf.points.find((p) => p.code === code && p.title === title);
        return existing || { id: uid(), code, title };
      });
  }
  function wireConfig() {
    $("#pfCfgTitle").value = pf.title;
    $("#pfCfgPoints").value = pointsToText();
    $("#pfCfgTitle").addEventListener("change", (e) => {
      pf.title = e.target.value.trim() || "Portfolio";
      persist();
      render();
    });
    $("#pfCfgPoints").addEventListener("change", (e) => {
      const pts = parsePoints(e.target.value);
      if (pts.length) pf.points = pts;
      e.target.value = pointsToText();
      persist();
      render();
    });
  }

  function refreshFromExternal(state) {
    pf = normalisePortfolio(state.portfolio) || pf;
    items = state.items || [];
    render();
    wireConfig();
  }

  async function init() {
    const data = await OrganiserStore.load();
    pf = normalisePortfolio(data.portfolio);
    items = data.items || [];
    if (!pf || !pf.points.length) {
      pf = JSON.parse(JSON.stringify(DEFAULT_PORTFOLIO));
      persist(); // seed once; from here it's your data
    }
    OrganiserStore.onExternalChange(refreshFromExternal);
    $("#pfExport").addEventListener("click", exportPortfolio);
    $("#pfGaps").addEventListener("change", (e) => {
      showGaps = e.target.checked;
      render();
    });
    window.addEventListener("pagehide", () => OrganiserStore.flushBeacon());
    wireConfig();
    render();
  }

  init();
})();
