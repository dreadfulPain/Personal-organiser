# The Organiser — what it is, what's in it, and what we think it will do

*A plain-English account of the whole thing, written to be read on its own.*

---

## 1. Why it exists

Paper planners worked. Every digital organiser failed — and not because of the
looking. **Seeing** the week on paper was effortless; **putting things in** to an
app was not. Tapping into the right field, deciding whether a thought is a task
or a note or a date, choosing a folder — that decision-at-the-door is the exact
friction that ends the relationship with the app by week three.

So this app is built around one sentence:

> **Say it messily → it understands → it organises → you feel oriented.**

Two things it must never do:

1. **Make you decide what kind of thing you're entering before you enter it.**
   The app sorts. You don't.
2. **Make spelling matter, anywhere.**

Everything else is judged against that.

There's a second thing it must survive: **a bad week.** A system that only works
when life is calm gets abandoned. So coming back after days away shows you
*today* — never a wall of accusations.

---

## 2. What it actually is

A small web app that runs on your own computer. No account, no company's servers,
no subscription.

- A tiny local server (`server.js`) written with nothing but Node's built-in
  parts — **zero third-party packages**.
- Your data is one plain file you own: `data/organiser-data.json`, written
  safely (a crash can't half-write it), with automatic backups.
- Attached files — photos of work, documents — sit in ordinary readable folders
  next to it, with their real names.
- The AI runs **locally** through Ollama. Nothing you type or paste is sent to
  anyone.

If this project vanished tomorrow, you'd still have a folder of your own files
that opens without us.

---

## 3. The rooms (tabs)

One question per room, so no page becomes a wall.

| Tab | What it answers |
|---|---|
| **Home** | What needs me right now? |
| **Day** | How does today lay out in time? |
| **Week** | What's coming in the next seven days? |
| **Month** | How do things sit next to each other? (a real calendar grid) |
| **Class** | Where does the whole class stand on each skill? |
| **Students** | What's happening with one person, and what's the evidence? |
| **People** | Who are my colleagues and parents, and what's live between us? |
| **Portfolio** | What proof do I have against each professional standard? |
| **Goals** | What am I working towards, and what's the next step? |
| **Looking back** | Where has my time and attention actually gone? |

Every page has a capture box, so you never navigate somewhere to add something.

---

## 4. Everything that's built

### The way in
- **One box, anywhere.** Type or paste on any tab. The AI splits it and routes
  each piece to the right place: a **task**, a **student record**, a **goal**, or
  a **work handover** logged against a person.
- **The check-back.** Tasks pause for a glance-and-tap before filing — one plain
  summary line, everything pre-filled, nothing required, all controls hidden
  behind "Adjust details". Blank is always fine.
- **Paste a conversation.** Drop in a WeChat thread or email chain: it reads who
  said what, turns what *you* were asked or promised into your tasks with the
  person's name attached, logs anything about a student as a record, ignores the
  greetings, and writes it in English even if the chat wasn't.
- **Nothing is ever lost.** If the AI is off or unreachable, whatever you typed
  is kept as a plain task or parked to sort later.

### Deciding what matters
- **What matters today** — a short, capped shortlist built from four signals:
  urgency (a real deadline), importance (yours, never guessed from a label),
  milestone-pull (it moves a goal you chose), and a promise to a person. Hard
  deadlines due today always come first. It only suggests; nothing moves itself.
- **Effort** — every task carries quick / medium / draining, so light things are
  findable on a low-energy day.
- **A tag is a category, never an importance level.** Deliberate: nobody else can
  make something matter in *your* system just by calling it "work".

### Not losing things
- **Needs finishing** — the loudest thing on the page. Something drafted but not
  sent is tracked as *unfinished*, never quietly complete.
- **Reminders that come and find you.** Open loops and hard deadlines get a
  reminder time suggested automatically (earlier than the deadline, so nobody
  else's "done yet?" is your first warning). When it's due, a **real Windows
  notification** appears — even with the browser closed. Each fires once. No
  nagging.
- **Past a deadline** — one missed deadline at a time, with three ways out: new
  date, make it soft, or handled. Never a red graveyard.

### The work side
- **Students** — one-line records (under 30 seconds), seen through filters: one
  person's timeline, one kind across everyone, a tag, a time window, open
  follow-ups. Tick "needs a follow-up" and it becomes a real task with a morning
  reminder. Details and profiles fill in **gradually** — never a form.
- **Evidence and levels.** Paste your school's skills list and any record can
  carry a skill and a level (numbers for your quick read). A person's "levels so
  far" is always the *latest* evidence, never an average — and each is clickable
  through to the records and the actual work behind it.
- **Attach the work itself** — photos and files, stored in plain folders by
  student and by standard.
- **Parent-meeting export** — one printable page per student in **parent
  wording** (never your raw numbers), with the dated evidence and work photos
  embedded. Plus **"Get ready for parent meetings"**: a checklist flagging
  unconfirmed AI records, skills whose newest evidence isn't confirmed, gaps,
  and levels getting old — then **export all students** in one go.
- **Portfolio** — the UK Teachers' Standards (editable), evidence per point,
  its own to-do list per standard, and a one-tap "done → evidence" bridge.
- **People** — colleagues and parents: how to reach them, what they can
  realistically help with, what you've promised them, and a factual log of work
  passed each way.

### Trust
- **"AI-sorted · check me"** — anything the AI inferred wears a chip until you
  confirm it. It never blocks anything; it just means you always know which
  lines were heard rather than written by you. Unconfirmed records are excluded
  from parent exports.
- **Nothing files silently** that would be costly to get wrong: an unrecognised
  student ID comes back blank rather than guessed.

### Living with it
- **Two computers** via one shared folder (OneDrive/Dropbox). If both ever touch
  the file, the app refuses to overwrite and keeps your edit safely rather than
  losing it. Open pages refresh themselves when the file changes.
- **Edit anything, any time** — title, date, time, importance, effort, tags,
  deadline, goal, standard — from any row.

---

## 5. What we think it will do

**Honestly expected:**

- **Capture stops being a decision.** The reason to reach for it is that it costs
  nothing — no folder to choose, no field to fill, spelling irrelevant.
- **The drafted-but-unsent trap closes.** This is the one aimed squarely at real
  damage: prepped work that vanishes until someone asks. The system holds it and
  pings before it's late.
- **Parent meetings stop being a scramble.** Evidence accumulates as a by-product
  of ordinary logging, and the export assembles itself.
- **Standards stop being a September panic.** Evidence lands as you go.
- **You can check a feeling against facts** — whether work really is landing on
  you, or whether you're assuming it.
- **A bad week doesn't end it.** Come back and it shows you today.

**What it won't do:**

- It **can't see results, only what you record.** It's a mirror for your own
  steering, never a referee to prove your worth to anyone.
- It **won't nag, score, or rank you** — no streaks, no missed-day counters, no
  progress bar that can't fill.
- It **can't make you do things.** It removes friction and forgetting; the doing
  is still yours.

---

## 6. Honest limits

- **Reminders reach one computer** — the one running the app. Nothing reaches
  your phone. That's the price of no cloud.
- **Reminders fire from deadlines and unfinished things**, not from importance
  alone. A task marked "matters a lot" with no date won't ping.
- **The AI is a local model.** It's good at sorting and extraction, not perfect —
  which is exactly why the check-back and the "check me" chips exist.
- **Sync isn't live.** Close it on one machine, let the folder sync, open it on
  the other.
- **Voice is switched off**, awaiting an in-house version. There's deliberately
  no cloud dictation.
- **Student data:** it stays on your machine — but if the folder syncs, the notes
  sync too. Practice with fake IDs until you know what your school's policy
  allows outside their official system.

---

## 7. The rules it was built under

Kept here because they explain nearly every design choice:

1. **The app sorts; the user doesn't.**
2. **Spelling never matters.**
3. **No hard-coding.** The code knows only generic shapes — records, points,
   people, levels. Every domain word (student IDs, standards, note kinds, level
   scales) is *your editable data*. Point it at plumbing jobs or a different
   curriculum and it works unchanged.
4. **Name the load, not the person.** Describe the plan as oversized; never imply
   you can't cope.
5. **Never a bar that can't fill.** Progress always measures the *next*
   milestone, never the whole goal.
6. **Describe, never judge.** The mirror shows the shape of your time; it never
   scores you — or anyone else.
7. **Control by undo, not permission.** Small reversible things happen; big or
   personal ones ask. Undo is always one tap.
8. **Designed for the return, not the streak.**
9. **If it takes more than 30 seconds, it's wrong** — a chore gets abandoned.

---

## 8. Where things live

```
Start Organiser.bat        ← double-click to run it
Install Auto-Start.bat     ← optional: run quietly at log-in, so reminders fire
server.js                  ← the little local server (no dependencies)
public/                    ← the screens
data/organiser-data.json   ← everything you've written
data/files/students/<ID>/  ← a student's attached work
data/files/portfolio/<TS>/ ← evidence for each standard
data/backups/              ← automatic safety copies
.env                       ← switches the AI on (and later, dictation)
```

**A full backup is a copy of the whole `data` folder** — that's your writing and
your files together.

---

*Built iteratively over many sessions, each one starting from real use rather
than a feature list. The design tracker that drove it is the source of truth for
why things are the way they are.*
