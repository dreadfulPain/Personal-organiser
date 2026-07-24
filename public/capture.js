// Universal capture — the core pillar at the app level: dump a messy thought on
// ANY page and it's sorted to the right place (a task, a student record, or a
// goal). You never navigate to the right tab first; the app sorts, you don't.
//
// Two uses:
//   OrganiserCapture.mountBar()  — the standalone bar + check-back the view-only
//                                  pages (Day/Week/Month/Class/Looking-back) use.
//   OrganiserCapture.route()/applyEntries()/… — shared helpers the home box reuses.
//
// Plain script (works under file://). Files via the owned store; view pages
// reload after adding so their lists reflect the new item wherever it landed.

(function () {
  "use strict";

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
  function isoOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const todayISO = () => isoOf(new Date());
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function fmtLocalDT(d) {
    return `${isoOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // A reminder time: the morning before a future date, else soon (mirrors app.js).
  function remindForDate(dateIso) {
    const t = todayISO();
    if (dateIso && dateIso > t) {
      const before = addDaysISO(dateIso, -1);
      if (before > t) return `${before}T09:00`;
      if (before === t && new Date() < new Date(`${t}T09:00`)) return `${t}T09:00`;
      return `${dateIso}T09:00`;
    }
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    soon.setMinutes(soon.getMinutes() - (soon.getMinutes() % 15), 0, 0);
    return fmtLocalDT(soon);
  }

  async function route(text, vocab) {
    const r = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        today: todayISO(),
        now: new Date().toLocaleString(undefined, {
          weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
        }),
        goals: (vocab && vocab.goals ? vocab.goals : []).map((g) => ({ id: g.id, title: g.title })),
        config: (vocab && vocab.config) || {},
        standards: (vocab && vocab.standards ? vocab.standards : []).map((s) => ({ id: s.id, code: s.code })),
      }),
    });
    if (!r.ok) throw new Error("route " + r.status);
    const d = await r.json();
    return Array.isArray(d.entries) ? d.entries : [];
  }

  // Follow-up task spawned from a record — rides the normal reminders (s28).
  function spawnFollowUp(rec, followDate, items) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(followDate || "") ? followDate : addDaysISO(todayISO(), 1);
    const t = {
      id: uid(),
      title: `Follow up: ${rec.summary}${rec.who ? ` (${rec.who})` : ""}`,
      type: "task", date, time: "", deadlineType: "soft", importance: "normal", effort: "quick",
      tags: (rec.tags || []).slice(0, 4), whenText: "", goalId: "", openLoop: false, promisedTo: "",
      remindAt: remindForDate(date), remindedAt: null, done: false, createdAt: nowISO(), completedAt: null,
    };
    items.push(t);
    rec.taskId = t.id;
    return t;
  }

  function finishItem(item) {
    const remindAt = item.openLoop || (item.deadlineType === "hard" && item.date) ? remindForDate(item.date) : "";
    return {
      id: uid(),
      title: item.title,
      type: item.type || "task",
      date: item.date || "",
      time: item.time || "",
      deadlineType: item.deadlineType === "hard" ? "hard" : "soft",
      importance: item.importance || "normal",
      effort: item.effort || "medium",
      tags: item.tags || [],
      whenText: item.whenText || "",
      goalId: item.goalId || "",
      standardId: item.standardId || "",
      openLoop: item.openLoop === true,
      promisedTo: item.promisedTo || "",
      remindAt,
      remindedAt: null,
      done: false,
      createdAt: nowISO(),
      completedAt: null,
    };
  }

  // Push each entry into the right array of `state`, spawning follow-ups. Records
  // are born "AI-sorted · check me" (provenance stays true). Returns counts.
  function applyEntries(entries, state) {
    state.items = state.items || [];
    state.goals = state.goals || [];
    state.records = state.records || [];
    const n = { tasks: 0, records: 0, goals: 0 };
    entries.forEach((e) => {
      if (e.kind === "task" && e.item) {
        state.items.push(finishItem(e.item));
        n.tasks++;
      } else if (e.kind === "record" && e.record) {
        const rec = {
          id: uid(),
          who: e.record.who || "",
          date: todayISO(),
          type: e.record.type || "",
          summary: e.record.summary || "",
          detail: "",
          extra: {},
          topic: e.record.topic || "",
          level: e.record.level || "",
          tags: (e.record.tags || []).slice(0, 4),
          followUp: e.record.follow_up === true,
          taskId: "",
          files: [],
          src: "ai",
          checkedAt: null,
          createdAt: nowISO(),
        };
        state.records.unshift(rec);
        if (rec.followUp) spawnFollowUp(rec, e.record.follow_up_date, state.items);
        n.records++;
      } else if (e.kind === "goal" && e.goal) {
        state.goals.unshift({ id: uid(), title: e.goal.title, createdAt: nowISO(), milestones: [] });
        n.goals++;
      }
    });
    return n;
  }

  function summaryText(n) {
    const parts = [];
    if (n.tasks) parts.push(`${n.tasks} to your tasks`);
    if (n.records) parts.push(`${n.records} to Students`);
    if (n.goals) parts.push(`${n.goals} to Goals`);
    return parts.join(" · ");
  }

  // ---------- the standalone bar (view-only pages) ----------
  let barState = null; // the loaded owned state {items, waiting, goals, records, recordConfig}
  let pending = null;

  async function saveAndReload(msg) {
    try {
      sessionStorage.setItem("capture.flash", msg);
    } catch {}
    // Go through the store so the write carries the shared-folder version guard;
    // flush() forces it out and waits, so the reload can't outrun the save.
    OrganiserStore.save({ items: barState.items, goals: barState.goals, records: barState.records });
    try {
      await OrganiserStore.flush();
    } catch {}
    location.reload();
  }

  function renderPending() {
    const box = document.getElementById("capBack");
    if (!pending || !pending.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    const dest = { task: "→ Tasks", record: "→ Students", goal: "→ Goals" };
    box.innerHTML =
      `<p class="cap-hint">Here's where each will go — tweak or drop any, then add.</p>` +
      pending
        .map((e, i) => {
          let mid = "";
          if (e.kind === "task") mid = escapeHtml(e.item.title) + (e.item.date ? ` <span class="cap-when">${escapeHtml(e.item.date)}</span>` : "");
          else if (e.kind === "record")
            mid = `<span class="cap-who">${escapeHtml(e.record.who || "— who? —")}</span> ${escapeHtml(e.record.summary)}` +
              (e.record.topic ? ` <span class="cap-when">${escapeHtml(e.record.topic)}${e.record.level ? " " + escapeHtml(e.record.level) : ""}</span>` : "");
          else mid = escapeHtml(e.goal.title);
          return `<div class="cap-row"><span class="cap-dest">${dest[e.kind]}</span><span class="cap-mid">${mid}</span><button class="link cap-drop" data-i="${i}" type="button">drop</button></div>`;
        })
        .join("") +
      `<div class="cap-actions"><button id="capAdd" class="btn" type="button">Add all</button><button id="capCancel" class="btn ghost" type="button">Cancel</button></div>`;
    box.querySelectorAll(".cap-drop").forEach((b) =>
      b.addEventListener("click", () => {
        pending.splice(Number(b.dataset.i), 1);
        renderPending();
      })
    );
    document.getElementById("capAdd").addEventListener("click", async () => {
      if (!pending.length) return;
      const n = applyEntries(pending, barState);
      pending = null;
      await saveAndReload(n.tasks + n.records + n.goals ? "Added — " + summaryText(n) + ". ✓" : "");
    });
    document.getElementById("capCancel").addEventListener("click", () => {
      pending = null;
      setCapStatus("");
      renderPending();
    });
  }

  function setCapStatus(msg) {
    const s = document.getElementById("capStatus");
    if (!s) return;
    s.textContent = msg || "";
    s.hidden = !msg;
  }

  async function onSubmit() {
    const input = document.getElementById("capInput");
    const text = input.value.trim();
    if (!text) return;
    const btn = document.getElementById("capBtn");
    if (!barState.aiAvailable) {
      // No AI: capture is sacred — save it as a plain task so nothing is lost.
      barState.items = barState.items || [];
      barState.items.push(finishItem({ title: text, type: "task" }));
      input.value = "";
      await saveAndReload("Saved it as a task (AI sorting is off). ✓");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Sorting…";
    setCapStatus("Reading what you wrote…");
    try {
      const stds = barState.portfolio && Array.isArray(barState.portfolio.points)
        ? barState.portfolio.points.map((p) => ({ id: p.id, code: p.code }))
        : [];
      const entries = await route(text, { goals: barState.goals, config: barState.recordConfig || {}, standards: stds });
      if (!entries.length) {
        setCapStatus("I couldn't find anything to add there — a few more words?");
        return;
      }
      pending = entries;
      input.value = "";
      setCapStatus("");
      renderPending();
    } catch {
      // Unreachable AI: still don't lose it.
      barState.items = barState.items || [];
      barState.items.push(finishItem({ title: text, type: "task" }));
      input.value = "";
      await saveAndReload("Couldn't reach the AI — saved it as a task to sort later. ✓");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sort it";
    }
  }

  async function mountBar() {
    const host = document.getElementById("capture");
    if (!host) return;
    host.className = "capture";
    host.innerHTML = `
      <div class="cap-bar">
        <input id="capInput" type="text" placeholder="Add anything — I'll send it to the right place" aria-label="Add anything" />
        <button id="capBtn" class="btn" type="button">Add</button>
      </div>
      <p id="capStatus" class="status" hidden></p>
      <div id="capBack" class="cap-back" hidden></div>`;

    const data = await OrganiserStore.load();
    barState = {
      items: data.items || [],
      waiting: data.waiting || [],
      goals: data.goals || [],
      records: data.records || [],
      recordConfig: data.recordConfig || null,
      portfolio: data.portfolio || null,
      aiAvailable: false,
    };
    if (OrganiserStore.mode === "file") {
      try {
        const h = await fetch("/api/health");
        const j = await h.json();
        barState.aiAvailable = !!j.hasAI;
        if (barState.aiAvailable) fetch("/api/warm", { method: "POST" }).catch(() => {});
      } catch {}
    }
    document.getElementById("capBtn").textContent = barState.aiAvailable ? "Sort it" : "Add";
    document.getElementById("capBtn").addEventListener("click", onSubmit);
    document.getElementById("capInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") onSubmit();
    });

    // Flash from the reload after an add.
    try {
      const flash = sessionStorage.getItem("capture.flash");
      if (flash) {
        setCapStatus(flash);
        sessionStorage.removeItem("capture.flash");
        setTimeout(() => setCapStatus(""), 4000);
      }
    } catch {}
  }

  window.OrganiserCapture = { mountBar, route, applyEntries, summaryText, finishItem, spawnFollowUp };

  // Auto-mount on any page that provides a #capture slot (view-only pages). The
  // home/records/goals pages keep their own richer boxes and just reuse the
  // helpers above, so they leave the slot out.
  if (document.getElementById("capture")) mountBar();
})();
