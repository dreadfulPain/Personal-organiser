// Voice input — the tracker's Session-1 lock: voice as a first-class way in,
// typing as backup, leaning on what's already on the machine rather than
// building our own recogniser.
//
// TWO ROUTES, chosen automatically, and the difference is stated in the app:
//   • "local"   — the server has STT_URL set (your own Whisper). We record with
//                 MediaRecorder and post the audio to the server, which forwards
//                 it locally. Nothing leaves the machine, exactly like Ollama.
//   • "browser" — nothing configured, so we use the browser's own speech
//                 recognition: zero setup, but Chrome/Edge send the audio to
//                 their servers. Fine for everyday things; the button says so
//                 before you use it, because student and parent detail is not.
//
// Nothing is ever filed by voice alone: dictation only fills the box, and the
// normal check-back still runs.

(function () {
  "use strict";

  let mode = null; // "local" | "browser" | null (unavailable)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  async function detectMode() {
    if (mode !== null) return mode;
    mode = "";
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        const r = await fetch("/api/health");
        const j = await r.json();
        if (j.stt === "local") mode = "local";
      } catch {
        /* fall through to browser */
      }
    }
    if (!mode && SR) mode = "browser";
    return mode;
  }

  function warnedOnce() {
    try {
      return localStorage.getItem("organiser.voiceWarned.v1") === "1";
    } catch {
      return false;
    }
  }
  function markWarned() {
    try {
      localStorage.setItem("organiser.voiceWarned.v1", "1");
    } catch {}
  }

  function appendTo(box, text) {
    if (!text) return;
    const t = text.trim();
    if (!t) return;
    box.value = box.value ? box.value.replace(/\s*$/, "") + " " + t : t;
    box.dispatchEvent(new Event("input", { bubbles: true })); // let it auto-grow
    box.focus();
  }

  // ---- browser speech: live, no recording round-trip ----
  function startBrowser(box, btn, setNote) {
    const rec = new SR();
    rec.lang = navigator.language || "en-GB";
    rec.interimResults = false;
    rec.continuous = true;
    let stopped = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) appendTo(box, e.results[i][0].transcript);
      }
    };
    rec.onerror = (e) => {
      setNote(e.error === "not-allowed" ? "Microphone blocked — allow it in the browser bar." : "Didn't catch that.");
      stop();
    };
    rec.onend = () => {
      if (!stopped) stop();
    };
    function stop() {
      stopped = true;
      btn.classList.remove("listening");
      btn.title = "Dictate";
      btn.dataset.stop = "";
      try {
        rec.stop();
      } catch {}
    }
    btn.dataset.stop = "1";
    btn.classList.add("listening");
    btn.title = "Listening — click to stop";
    setNote("Listening… speak, then click again to stop.");
    rec.start();
    return stop;
  }

  // ---- local Whisper: record, then transcribe on this machine ----
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

  // Attach a mic button to any textarea. Returns the button (or null if voice
  // isn't available at all, in which case nothing is shown — no dead controls).
  async function attach(box, host, setNote) {
    const m = await detectMode();
    if (!m || !box || !host) return null;
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
      // One-time honesty about where the audio goes on the browser route.
      if (m === "browser" && !warnedOnce()) {
        markWarned();
        note("Heads up: your browser transcribes this in the cloud. Fine for everyday notes — for student or parent detail, set up local transcription (see the README) or type it.");
      }
      stopFn = m === "browser" ? startBrowser(box, btn, note) : await startLocal(box, btn, note);
    });
    host.appendChild(btn);
    return btn;
  }

  window.OrganiserVoice = { attach, detectMode };
})();
