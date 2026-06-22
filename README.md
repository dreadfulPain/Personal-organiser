# Personal Organiser

A calm, neurodivergent-friendly organiser. You dump messy, misspelled,
unstructured thoughts at it; it understands them, sorts them into the right
places, and shows you your life in a way that feels manageable.

> Say it messily → it understands → it organises → you feel oriented.

This build is about **trustworthy storage**: a place to keep your life that you
own and can't easily lose. AI sorting is a separate later step — you can use the
organiser fully by hand right now.

---

## Start here

You need [Node.js](https://nodejs.org/) (the free "LTS" download). Nothing else
to install — the app uses no third-party packages to run.

- **Windows:** double-click **`Start Organiser.bat`**
- **Mac:** double-click **`start.command`** (first time: right-click → Open; you
  may need to run `chmod +x start.command` once)
- **Linux:** `chmod +x start.sh` then `./start.sh`

A browser tab opens at `http://localhost:3000`. Keep the little black window open
while you use it — closing it stops the app. That's it.

To add things: type one thing and press **Add** (or ⌘/Ctrl + Enter), check it
looks right, and it lands in a zone. Tick something off and it's gone from the
active view, kept in **Looking back**.

---

## Where your data is saved (plain English)

When you start it with **Start Organiser**, everything is saved **automatically**
to a real file on your computer:

```
<this folder>/data/organiser-data.json
```

- It saves the moment you change anything. No "save" button to remember.
- It's a plain file **you own** — no account, no cloud of ours, works offline.
- It's written safely: a half-finished save can never corrupt it, and the app
  keeps automatic backups in `data/backups/` (the version before your last
  change, plus one snapshot per day).

### How to back up

- Click **Back up now** in the app to download a dated copy, **or**
- just copy `data/organiser-data.json` somewhere safe (a USB stick, another
  folder).
- **Restore** a backup any time with the **Restore from a backup** button.

### Getting it on more than one device (optional, free, still yours)

Put this whole folder inside your **OneDrive / Dropbox / Google Drive** folder.
Your data file then syncs across your devices automatically — and it's still a
file you own, with no separate service to depend on. (A more seamless built-in
sync can come later; the storage is built so that can be added without a
rewrite.)

---

## Two ways to open it (and why one is "preview")

- **Start Organiser (recommended):** runs the little local server, saves to your
  real data file. Trustworthy.
- **Double-clicking `public/index.html` directly:** opens in *preview mode* —
  you can look around and add things, but changes are kept only in that browser,
  **not** saved to your data file. The app says so clearly at the top so you're
  never caught out. Use **Start Organiser** for anything you want to keep.

---

## Smart sorting (optional — local, private, free)

By default you add things by hand. When you want it, switch on **smart
sorting**: type one messy line like "tysday call dentist and bins tonight" and
the app splits it into clean, dated items and drops them into the right zones.

The AI runs **on your own computer** — nothing is sent to anyone, no account, no
bill. You've already set this up (Ollama + the `qwen3:14b` model). To switch it
on in the app:

1. Make sure **Ollama** is running (it usually starts with Windows). Check by
   opening http://localhost:11434 — it should say "Ollama is running".
2. In this app's folder, copy `.env.example` to **`.env`** (it's already set to
   Ollama + `qwen3:14b`).
3. Restart the organiser (close the window, double-click **Start Organiser**
   again). The button changes from **Add** to **Sort it** — you're live.

If Ollama isn't running when you try to sort, your dump is saved under "Waiting
to be sorted" so nothing is lost — sort it once Ollama is back.

Behind the scenes the app follows three rules so the model behaves: it tells the
model the current **date and time** every time (it has no clock), it demands a
**fixed JSON shape** (not prose), and it **silences the model's think-aloud**.

**Swappable by design:** the app just talks to a standard local "AI socket," so
you can later point it at a different model or service by editing `.env` — no app
changes. See `.env.example` for the alternatives (LM Studio / a cloud option).

**Using it on another device:** the model thinks on this desktop's graphics
card, so either install Ollama on each capable computer, or have other devices on
your home wi-fi point at this desktop (set `AI_BASE_URL` to
`http://YOUR-DESKTOP:11434` in that device's `.env`). Don't put the big model
file in OneDrive — only the small app + data file belong there.

## What's here on purpose — and what's not yet

**Working now:** add by hand, the check-back, calm **Today / Coming up /
Someday** zones, tick-to-complete (done = gone, kept in **Looking back**), a
**Today timeline** (lay the day out by time, see the gaps, give floating tasks a
time), trustworthy file storage with backups, and import/export. The AI also
flags each item's **importance** (you can change it — it's only a starting
guess), **category tags**, and whether a date is a **deadline** — shown lightly
in the zones. At the top, a **What matters today** shortlist surfaces a few
must-dos and important items (each with a one-word reason) — it only *suggests*,
nothing moves on its own. A separate **Goals & milestones** page lets you name a
big goal in a sentence and — with smart sorting on — the app **suggests small
milestones** for you to tweak; you fill a bar toward the *next* one and get a
small celebration when it's done. When you add a task that clearly belongs to one
of your goals, it's quietly **linked** to it (shown as *part of:*), which you can
change or clear in the check-back.

**Later, separate steps:**

- **AI sorting is built in** — see **Smart sorting** above to switch it on. It
  stays optional and off until you do.
- Built-in cross-device sync, goal-breakdown, reminders, voice.

## For the curious: how it's built

- `server.js` — a tiny local web server using only Node's built-in modules. It
  serves the page and saves/loads your data file. No internet needed.
- `public/` — the screen you see (`index.html`, `style.css`, `app.js`) plus
  `store.js`, the one place that knows *where* data lives (the seam that lets
  sync be added later).
- The AI step, when turned on, lives behind `/api/understand` and is completely
  optional.
