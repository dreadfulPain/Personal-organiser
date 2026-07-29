// Voice input — CURRENTLY OFF, and invisible unless you switch it on.
//
// The browser's own speech recognition (Chrome/Edge) was removed deliberately:
// it transcribes in the cloud, which contradicts the rest of this app. What's
// left is the in-house path only:
//
//   • No STT_URL in .env  → there is NO microphone button anywhere. Nothing to
//                            see, nothing running, no audio path at all.
//   • STT_URL set         → the mic appears and records to YOUR local Whisper
//                            server via /api/transcribe. Audio never leaves the
//                            machine, exactly like Ollama.
//
// So this file is dormant scaffolding for the in-house version, not a feature
// that's live today. Dictation would only ever FILL the capture box — the normal
// check-back still runs, and nothing is filed by voice alone.

(function () {
  "use strict";

  let mode = null; // "local" | "" (off)

  async function detectMode() {
    if (mode !== null) return mode;
    mode = "";
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        const r = await fetch("/api/health");
        const j = await r.json();
        if (j.stt === "local") mode = "local";
      } catch {
        /* leave off */
      }
    }
    return mode;
  }

  function appendTo(box, text) {
    const t = (text || "").trim();
    if (!t) return;
    box.value = box.value ? box.value.replace(/\s*$/, "") + " " + t : t;
    box.dispatchEvent(new Event("input", { bubbles: true })); // let it auto-grow
    box.focus();
  }

  // Record here, transcribe on this machine.
  async function startLocal(box, btn, setNote) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("Microphone blocked — allow it in the browser bar.");
      return null;
    }
    const chunks = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      btn.classList.remove("listening");
      btn.title = "Dictate";
      btn.dataset.stop = "";
      if (!chunks.length) return setNote("");
      setNote("Transcribing on this computer…");
      try {
        const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
        const r = await fetch("/api/transcribe?name=audio.webm", { method: "POST", body: blob });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return setNote(d.message || "Couldn't transcribe that.");
        appendTo(box, d.text);
        setNote(d.text ? "" : "Nothing was heard.");
      } catch {
        setNote("Couldn't reach the transcriber.");
      }
    };
    btn.dataset.stop = "1";
    btn.classList.add("listening");
    btn.title = "Recording — click to stop";
    setNote("Recording… click again when you're done.");
    mr.start();
    return () => mr.stop();
  }

  // Attach a mic to a textarea. Returns null (and adds NOTHING to the page)
  // unless local transcription is configured — so today it's simply absent.
  async function attach(box, host, setNote) {
    const m = await detectMode();
    if (m !== "local" || !box || !host) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mic-btn";
    btn.title = "Dictate";
    btn.setAttribute("aria-label", "Dictate");
    btn.textContent = "🎤";
    let stopFn = null;
    const note = setNote || (() => {});
    btn.addEventListener("click", async () => {
      if (btn.dataset.stop === "1") {
        if (stopFn) stopFn();
        stopFn = null;
        return;
      }
      stopFn = await startLocal(box, btn, note);
    });
    host.appendChild(btn);
    return btn;
  }

  window.OrganiserVoice = { attach, detectMode };
})();
