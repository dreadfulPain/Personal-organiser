// "Is everything working?" — the page that exists so nobody has to open a
// terminal to find out why something stopped.
//
// Everything shown here was already discoverable: in a JSON endpoint, in a
// PowerShell command, in a file path you'd have to know to look for. That's a
// developer's answer to a question anyone can have, and it leaves you stuck the
// moment something breaks. So the app does its own checks, writes them in plain
// words with what to do about each, and copies the lot in one press.

(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  let copyText = "";

  const WORD = { ok: "working", problem: "needs a look", info: "" };

  async function run() {
    const list = $("#hcList");
    const btn = $("#hcAgain");
    btn.disabled = true;
    btn.textContent = "Checking…";
    list.innerHTML = `<p class="muted">Checking…</p>`;
    try {
      const d = await (await fetch("/api/diagnose")).json();
      copyText = d.copyText || "";
      $("#hcWhen").textContent = d.at ? "checked " + d.at : "";
      list.innerHTML = (d.checks || [])
        .map(
          (c) => `
        <div class="hc-row ${escapeHtml(c.state)}">
          <div class="hc-head">
            <span class="hc-name">${escapeHtml(c.name)}</span>
            ${WORD[c.state] ? `<span class="hc-state">${WORD[c.state]}</span>` : ""}
          </div>
          <div class="hc-detail">${escapeHtml(c.detail)}</div>
          ${c.fix ? `<div class="hc-fix"><strong>To fix it:</strong> ${escapeHtml(c.fix)}</div>` : ""}
        </div>`
        )
        .join("");
      if (!(d.checks || []).length) list.innerHTML = `<p class="muted">Nothing to report.</p>`;
    } catch {
      // If this page can't reach the app, the app isn't running — and saying so
      // is more use than a spinner that never stops.
      list.innerHTML = `<div class="hc-row problem">
        <div class="hc-head"><span class="hc-name">The app</span><span class="hc-state">needs a look</span></div>
        <div class="hc-detail">This page can't reach the app, which usually means its black window has been closed.</div>
        <div class="hc-fix"><strong>To fix it:</strong> double-click “Start Organiser” in the app folder, then reload this page.</div>
      </div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Check again";
    }
  }

  async function copyAll() {
    const btn = $("#hcCopy");
    const text = copyText || $("#hcList").textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied ✓";
    } catch {
      // Clipboard access can be refused; a selected textarea always works.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.className = "hc-fallback";
      $("#hcList").before(ta);
      ta.select();
      btn.textContent = "Select it and copy";
    }
    setTimeout(() => (btn.textContent = "Copy all of this"), 2500);
  }

  // THE REPORT. Built on the server, shown here in full, and only then
  // downloadable — you read what you're sending before you send it.
  let report = "";
  async function buildReport() {
    const btn = $("#hcBuild");
    btn.disabled = true;
    btn.textContent = "Gathering…";
    try {
      const d = await (await fetch("/api/report")).json();
      report = d.text || "";
      const box = $("#hcReport");
      box.value = report;
      box.hidden = false;
      $("#hcSave").hidden = false;
      $("#hcCopyReport").hidden = false;
      btn.textContent = "Make it again";
    } catch {
      $("#hcReport").value = "Couldn't gather it — is the app still running?";
      $("#hcReport").hidden = false;
      btn.textContent = "Try again";
    } finally {
      btn.disabled = false;
    }
  }
  function saveReport() {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organiser-report-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("#hcSave").textContent = "Saved to Downloads ✓";
    setTimeout(() => ($("#hcSave").textContent = "Save it as a file"), 2500);
  }
  async function copyReport() {
    const btn = $("#hcCopyReport");
    try {
      await navigator.clipboard.writeText(report);
      btn.textContent = "Copied ✓";
    } catch {
      $("#hcReport").select();
      btn.textContent = "Select it and copy";
    }
    setTimeout(() => (btn.textContent = "Copy it"), 2500);
  }

  $("#hcBuild").addEventListener("click", buildReport);
  $("#hcSave").addEventListener("click", saveReport);
  $("#hcCopyReport").addEventListener("click", copyReport);
  $("#hcAgain").addEventListener("click", run);
  $("#hcCopy").addEventListener("click", copyAll);
  run();
})();
