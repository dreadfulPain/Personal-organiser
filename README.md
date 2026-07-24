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

### Using it on two computers (e.g. work laptop + home) — via a shared folder

Everything the app keeps — your data **and** every attached piece of work — lives
inside this one folder:

```
<this folder>/data/organiser-data.json     ← your tasks, goals, records
<this folder>/data/files/                   ← the work samples you attach
```

So sharing between computers is just: **put this whole folder inside your
OneDrive / Dropbox / Google Drive**, on *both* computers, pointing at the *same*
synced folder. Open it on the work laptop, add and edit; close it; at home it's
all there — records, evidence photos, the lot. No account with us, no server of
ours; the sync service you already have does the carrying.

**A few simple rules so nothing collides** (two computers, one shared file):

- **Use one computer at a time, and let the sync finish before you switch.** Give
  OneDrive a moment to show "up to date" after you close it on one machine before
  you open it on the other. (You're one person — this is natural anyway.)
- **The app protects you if a clash ever happens.** If the shared file was changed
  on the other computer while you had this one open, the app will *not* overwrite
  it — it quietly pulls in the newer version, and your unsaved edit is kept safe
  in `data/backups/` (a `conflict-…json` file) rather than lost. If you leave a
  page open, it also refreshes on its own when the file changes underneath it.
- **Only turn on background auto-start (`Install Auto-Start.bat`) on ONE computer**
  — your main/home one. Two always-running copies both writing the shared file is
  the one thing that causes churn; a single background copy plus opening the other
  when you need it is the clean setup.
- **The AI (Ollama) is per-computer.** It runs on the machine that has it (your
  home desktop with the graphics card). On a work laptop without it, the app just
  works by hand — sorting/routing is off there, everything else is the same. Don't
  put the big model file in the shared folder; only this app folder belongs there.

(You'll need [Node.js](https://nodejs.org/) on each computer to run it. A full
backup = copy the whole `data` folder, since that's where the evidence files
live too — the in-app "Back up now" saves the data file only.)

---

## Reminders that come and find you

Some things are **started but not closed** — a drafted email you still have to
send. Those are the easiest things to lose, so the app treats them specially:

- Mark anything as **"needs finishing"** (the AI also spots it from your words —
  *"drafted the trip email, still need to send it"*). It appears in a
  **Needs finishing** box at the top of the page until it's truly done.
- Every "needs finishing" item (and every hard deadline) gets a **reminder time,
  suggested for you** — earlier than the deadline, so no one else's "done yet?"
  is ever your first warning. No date-maths: it's pre-filled, just nudge it if
  you want.
- When the time arrives, a **real Windows notification** pops up — even if the
  organiser page isn't open. The little server is what sends it, so the app
  window (or background start, below) needs to be running. Each reminder fires
  **once** — changing its time re-arms it. No nagging, ever.
- You can also mark a task **"promised to"** someone. It shows on the task,
  counts like something that matters in *What matters today*, and is mentioned
  in its reminder — your own word, made visible.

### Start it in the background (recommended for reminders)

Double-click **`Install Auto-Start.bat`** once. From then on the organiser runs
quietly whenever you log in — no window, no browser tab — so reminders can
always reach you; open the page whenever you like. Undo it any time with
**`Remove Auto-Start.bat`**. (Reminders reach this computer only — that's the
honest limit of a fully-owned, no-cloud app.)

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

**Working now:** a **tab bar** on every page — *Home · Day · Week · Month · Class
· Students · Portfolio · Goals · Looking back* — one room per question, so each page stays
focused and nothing is buried (Home keeps surfacing what can't be missed, plus a
light seven-day strip). **Week** shows the next seven days one calm day at a
time; **Month** is a full calendar grid — the whole month laid out so you can
see how things sit next to each other in time, empty squares included; **Class**
lays out the
year's skills with where everyone stands on each, from the evidence. **Every
page has a capture box** — dump a messy thought anywhere ("call the dentist tues
· S03 struggled with full stops · get fit") and the app *routes* each part to the
right place: a task, a student record, or a goal. You never go to the right tab
first; it sorts, you don't. The **Portfolio** tab is your *own* evidence log — a
list of standards (it ships with the UK Teachers' Standards, all editable) where
you attach notes and work files to each point and export the whole thing as a
portfolio document, gaps and all. Plus: add by
hand, the check-back, calm **Today / Coming up /
Someday** zones, tick-to-complete (done = gone, kept in **Looking back**). The
**Today** section is laid out as a timeline right on the home page — your timed
things in order with the gaps between them, an "anytime today" group, and you can
give any task a time on the spot. Trustworthy file storage with backups, and
import/export. The AI also
flags each item's **importance** (you can change it — it's only a starting
guess), a rough **effort** (quick / draining — handy for picking light things on a
low-energy day), **category tags**, and whether a date is a **deadline** — shown
lightly in the zones. At the top, a **What matters today** shortlist surfaces a few
must-dos and important items (each with a one-word reason) — it only *suggests*,
nothing moves on its own. A separate **Goals & milestones** page lets you name a
big goal in a sentence and — with smart sorting on — the app **suggests small
milestones** for you to tweak; you fill a bar toward the *next* one and get a
small celebration when it's done. When you add a task that clearly belongs to one
of your goals, it's quietly **linked** to it (shown as *part of:*), which you can
change or clear in the check-back. Goals and tasks are **one pool seen two ways**:
on the home, **Goals in motion** shows each active goal's *next step* to tick
right there (do your goal's work inside your day); on the Goals page, the daily
tasks you linked to a goal appear **under that goal**, also tickable. The same
thing, wherever you look. If a few loose tasks clearly belong together the app may
gently offer to **make them a goal**. Every task has a quiet **edit** link —
change its words, date, time, importance, effort, tags, deadline, or goal any
time (or remove it completely), overdue or not. If a hard deadline slips by, it
surfaces **once, calmly, one at a time** with a simple choice — give it a new
date, make it soft, or mark it handled — then it clears and the next (if any)
takes its place. Coming back after a rough week never means a wall of overdue
items — just today, and one calm decision. **Looking back**
also shows a quiet **mirror** — what you've finished, broken down by area
(category) over a stretch you choose — so you can *see* where your effort's been
going. It describes, never scores; it's for your own steering, no one else's.
There's also a **Record log** page — a one-line log of *what happened*. With
smart sorting on you just say it messily — *"s3 strugled with full stops, chase
mum re the reading sheet friday"* — and the AI picks **who**, the **kind**, writes
the clean line, fills any **detail fields** it actually heard, and spots the
**follow-up and its date**; you glance and tap Add (it never guesses an ID it
isn't sure of — it asks you to pick). Anything the AI sorted then wears a small
**"AI-sorted · check me"** chip until you've personally confirmed it — tap it for
*looks right ✓ / let me fix it / remove it* — so reading back later you always
know which lines were heard by the AI and which you wrote yourself (a "needs a
check" filter sweeps them in one go). AI off = the same bar works by hand (who ·
kind · one line, under 30 seconds). Paste your school's **skills/standards list**
into Set up (one per line) and the log becomes an **evidence tracker**: any record
can link to a skill and carry a **level** — numbers by default (4/3/2/1) for
your own quick read, with **parent wording per level** kept alongside (both
editable). Then one person's view shows their
**levels so far** (always the latest evidence, never an average), and picking a
skill shows **where the whole class stands on it** — each ID once, grouped by
level — which is your reteach / small-group / move-on answer. The AI extracts
skill and level from your words too, only when you actually stated a judgement.
And a judgement can carry its **proof**: attach the actual piece of work (a
photo, a file) to the record behind it. Each "level so far" is a button — tap it
and you're looking at that skill's evidence trail, work samples included. That's
the parent-meeting layout: *here's the year's skills, here's the level, here's
the work that shows it.* When meetings come, the **Class** tab has
**"Get ready for parent meetings"**: a readiness checklist per student — AI
records still to confirm, skills whose **newest evidence is unconfirmed** (the
export would show an older judgement), skills not assessed yet, and levels that
are simply **getting old** (past a window you set — judgements decay; fresh AI
capture on the same skill clears the flag) — each with a one-click **review**
that lands on that student pre-filtered. Then **"Export all
students"** produces one printable file, each student starting on a fresh page:
every skill in the parent wording (never the raw numbers), dated evidence
beneath, work-sample photos embedded. Only records you've personally confirmed
go in — unchecked ones are left out and counted. (A single student exports from
their profile as before.)
(Attached files live in `data/files/` next to your data
— they sync and back up with the folder; the in-app "Back up now" download covers
the data file only, so copy the whole `data` folder for a full backup.) Everything's seen through filters: one
person's timeline,
one kind across everyone, a tag, a time window, or just the open follow-ups.
Tick **"needs a follow-up"** and it becomes a **real task in your normal lists**,
dated tomorrow with a morning reminder — no separate place to check. When a
filter is on, a small **"In this view"** line names who appears and how often
(S07 ×3 …), so groups and patterns surface on their own. Detail grows
**gradually**: each note kind has a few optional fields (result, next step, action
taken…) you can come back and fill later — capture is still one line — and picking
one ID shows their **profile** — standards-first: *strengths* and *targets* per
area (reading, writing, maths…), plus access/medical/home notes — filled bit by
bit, never a form, and every label renameable to match your school's language. All the words — IDs, kinds, fields
— are lists you own; it ships pointed at practice IDs S01–S05. Everything stays on
this computer (the AI is local), but two honest cautions: if the folder syncs to
OneDrive/Dropbox the notes sync with it, and before real names or medical details
go in, check what your workplace's data rules allow outside their official
system.

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
