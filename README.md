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

## What's here on purpose — and what's not yet

**Working now:** add by hand, the check-back, calm **Today / Coming up /
Someday** zones, tick-to-complete (done = gone, kept in **Looking back**),
trustworthy file storage with backups, and import/export.

**Later, separate steps:**

- **AI sorting** — type one messy line and have it split, spell-fixed, and
  date-resolved automatically. It's already wired up but switched off until you
  set it up (it's the next hill, kept separate on purpose). When you're ready,
  this needs one optional package (`npm install`) and a key or local model.
- Built-in cross-device sync, goal-breakdown, reminders, voice.

## For the curious: how it's built

- `server.js` — a tiny local web server using only Node's built-in modules. It
  serves the page and saves/loads your data file. No internet needed.
- `public/` — the screen you see (`index.html`, `style.css`, `app.js`) plus
  `store.js`, the one place that knows *where* data lives (the seam that lets
  sync be added later).
- The AI step, when turned on, lives behind `/api/understand` and is completely
  optional.
