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
| **Day** | What's my plan for today? (already built when you open it) |
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
- **Long pastes are sorted one job at a time.** Asking a local model to split,
  label, translate and date a whole thread in one go is where it fails — and it
  fails *silently*, returning perfectly valid JSON with two of the four items
  quietly missing. Above a set length the app switches to small steps instead:
  the text is split **in plain code** (no model, so a dropped line is
  impossible), each piece is asked one short question at a time, and only the
  pieces that survive get translated. It's slower, so it says which step it's
  on.
- **And then it checks its own work.** One last pass compares the original
  against what came out and reports anything not represented — as a **quote from
  your text**, never as an item it made up. Greetings and small talk are
  explicitly ignorable, so it doesn't cry wolf. If it finds nothing it says so
  quietly; if it finds something, that's the one line worth reading out of a
  long paste.
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
- **Never during a lesson.** Reminders hold while you're inside anything your
  timetable calls fixed, and land the moment it ends. If several piled up they
  arrive as *one* notification at the next gap, not a burst. A reminder you
  can't act on at 10:15 only teaches you to ignore reminders.
- **Importance gets a clock.** Something marked "matters a lot" that's sat
  untouched for ten days gets one quiet nudge, then goes silent for good.
- **"Not now" is one button.** No menu to pick from while you're busy — the app
  works out the next moment you're actually free and brings it back then.
- **A count of how many times you've pushed something back**, shown as a plain
  number. At three, three exits appear: **drop it**, **make it soft** (keeps the
  task, stops the pinging), or **break it up** (the pieces inherit its date,
  tags, goal and standard). Three pushes usually means *too big*, not
  *unimportant* — deleting would be the wrong move.
- **Past a deadline** — one missed deadline at a time, with three ways out: new
  date, make it soft, or handled. Never a red graveyard.
- **Work a block owes you.** The app can only ever track what got captured — so
  a lesson that exists on your timetable but was never typed in as a task was
  invisible to every safety net here. Now any block can be marked *"I have to
  get something ready before this one"*, and the task comes from the block
  instead of from your memory: due a set number of days before, pinging the
  evening it's due. Three guards keep it from becoming a flood — **off by
  default per block** (plenty are shared, covered, or need nothing), generated
  **a week ahead rather than a term** (a repeating lesson would otherwise make
  180 identical tasks), and one per occurrence so opening the app twice can't
  make two. **"Not now" won't push one past the thing it's for** — if there's no
  free time left before it starts, it says so instead of agreeing to a "later"
  that can't happen. And one whose moment has passed untouched is quietly let
  go; anything you engaged with — pushed back, edited, ticked — is yours and
  stays.

### The shape of the day
- **Your week, once a term.** Paste your timetable in any layout and the local
  AI turns it into rows — **shown as an editable table before anything saves**,
  so you fix what's wrong. Or import a `.ics` calendar, which is read by plain
  code with no AI involved at all (term dates are facts; a fact shouldn't arrive
  through a guess). Anything unreadable is *named*, never silently dropped.
- **Fixed vs soft.** A fixed block is a fact and holds reminders back. A soft
  block is the app guessing ("usually home by five") and is drawn dashed — it
  never silences anything. If those two ever looked the same, the plan would
  stop being trustworthy.
- **A plan that's already made.** Open the Day tab and today is laid out: fixed
  blocks first, then the gaps filled — hard deadlines due today first, then
  effort matched to the size of the gap, then whatever else matters. Move
  things, drop things, add things, then press **"That's my day"**. Nothing locks
  after that; days move.
- **About two thirds full, on purpose.** A day packed wall to wall collapses at
  the first interruption, and then the plan is a liar.
- **"Needs a proper slot."** A draining task isn't crammed into fifteen minutes.
  If today has no long enough stretch it says so, and offers to find the first
  day that does.
- **It learns how long things take without ever asking.** Starting guesses come
  from the effort you already set; ticking something off inside its slot is a
  free measurement. Every learned duration is a *guess* and displays as one.

### The work side
- **Students** — one-line records (under 30 seconds), seen through filters: one
  person's timeline, one kind across everyone, a tag, a time window, open
  follow-ups. Tick "needs a follow-up" and it becomes a real task with a morning
  reminder. Details and profiles fill in **gradually** — never a form.
- **Evidence and levels.** Paste your school's skills list and any record can
  carry a skill and a level. A person's level is always the *latest* evidence,
  never an average — and it's clickable through to the records and the actual
  work behind it.
- **The skill as a line.** Each skill is a row of boxes with the student sitting
  in one, so "where are they, and where should they be?" is one glance instead
  of a number in a list. The same row shape on the Class tab shows where
  everyone sits. **The target level is marked** — on a four-point scale that's
  3, not 4, and the scale is deliberately *not* coloured red-to-green, because a
  temperature ramp makes reaching the goal look like a near-miss.
- **Level names and descriptions, both optional.** Name the levels if you like.
  For any skill you can write what each level looks like — and writing *only*
  the target box is a complete approach in its own right, a third of the work.
  Written once per skill and reused for years; never a per-task rubric.
- **Marking a whole class in one pass.** Pick the skill once, its description
  stays on screen while you judge, then one tap per child. A photo is optional
  and one tap away. It saves as it goes, so closing the tab loses nothing.
  Recording the **same level again is a confirmation, not new evidence** — it
  stamps the record that's there instead of adding another, because six
  worksheets at an unchanged level aren't six pieces of evidence; the valuable
  one is the piece that *moved* them. **Attaching a photo always writes a
  record, though**, even at an unchanged level: if you first judged a 3 from
  watching and now you're holding written work at 3, that work is exactly what
  an export needs, and it's dated the day you took it. At the end it names who
  still has no record for that skill at all.
- **Confidence is not evidence.** A level confirmed five times by watching reads
  as your most settled judgement and is your thinnest — there's nothing to put
  on the table. So "has a level" and "has work attached" are counted as two
  different things everywhere: the marking row says *nothing on file* beside the
  confirmation count (the one moment it's cheap to fix, since the book is in
  your hand), and a student can't come up **ready** for a meeting on confident
  levels alone.
- **The whole trail, kept.** Every level ever recorded sits one tap behind the
  current one, dated, each linking to its own work. Nothing is overwritten and
  there's no way to delete it from these views — "here's September, here's now"
  is a far stronger parent conversation than one current number, and a
  questioned judgement needs the working, not just the conclusion.
- **One skill, many frameworks.** A skill is written in your words and carries
  any number of framework codes — a US standard, a national curriculum
  objective, an IB practice. Changing school means re-tagging, not rewriting,
  and every piece of evidence underneath keeps working.
- **Attach the work itself** — photos and files, stored in plain folders by
  student and by standard.
- **Parent-meeting export** — one printable page per student in **parent
  wording** (never your raw numbers), with the dated evidence and work photos
  embedded. Plus **"Get ready for parent meetings"**: a checklist flagging
  unconfirmed AI records, skills whose newest evidence isn't confirmed, gaps,
  and levels getting old — then **export all students** in one go.
- **Before a meeting, unasked.** Put a meeting on your week and name who it's
  about, and Home starts telling you what you *actually* have for those people
  days ahead — separately listing what you have and what you haven't. It is
  careful about the difference between "nothing to raise" and "nothing written
  down", because those look identical from the outside and only one of them is
  fine. Every gap it names turns into a real task in one tap, dated to land the
  day before.
- **Files you can open without the app.** "Save into folders" writes a dated
  spreadsheet of results (CSV, with the byte marker Excel needs or Chinese
  characters come out as rubbish) and a page per student that opens in Word —
  into `data/exports/`, in folders you can navigate in Explorer. Each export is
  a **new dated file**, never an overwrite, so nothing you've hand-edited is
  wiped.
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
- **It checks its own claims against your words — in code, not with another AI
  call.** Before a date, a name, or a "promised to" is filed, the app searches
  your text for something that could have produced it. If it can't find one, the
  value is *kept* (it may well be right) but the chip gets louder: **"check the
  date · not in your words"**. That's a different sentence from the ordinary
  chip, because "the AI read this off your text" and "the AI produced this and I
  can't tell where from" are different risks and used to look identical. A
  search can't hallucinate, costs nothing, and can't fail the same way as the
  thing it's checking — which a second AI call could.
- **A translation never loses its original.** Translation is the one step with
  no possible check: you can't verify a translation of something you couldn't
  read, and the mistake is silent and permanent. So the source is kept, stored
  alongside — tap **original** on any record to see exactly what it read. A
  wrong translation stays recoverable forever, by you or by anyone who reads the
  language.
- **A row the timetable reader couldn't parse is shown, not dropped.** You can
  check a table for what's *wrong*, but never for what *isn't there*. Anything
  it stumbled on is listed with the reason.
- **Nothing about a named child leaves unread.** Everywhere else a one-tap
  confirm is right. The parent export is the exception: before it writes, it
  shows you the actual sentences that will appear, at full size. Not a new
  habit — one read of a page you were going to read anyway, at the moment it
  matters.
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
  of ordinary logging, and the export assembles itself. More to the point, the
  app tells you days ahead when it *hasn't* — so "I thought I was on top of my
  docs" can't turn into standing in front of a parent with nothing.
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
- It **can tell you a plan is missing. It cannot tell you a plan is thin** —
  written, ticked, and not actually good enough. Only you, or a colleague
  reading it, can judge that, and no amount of building changes it. The app can
  hold you to a standard once you know what the standard is; it can't invent
  one for you.

---

## 6. Honest limits

- **Reminders reach one computer** — the one running the app. Nothing reaches
  your phone. That's the price of no cloud.
- **Importance pings once, and only once.** A task marked "matters a lot" with
  no date gets a single nudge after ten quiet days, then never asks again. It
  still sits high on the shortlist.
- **The day plan is only as good as your timetable.** Until you've set your week
  up, there are no gaps to plan into, quiet time can't work out when a lesson
  is, and "not now" falls back to a plain two hours.
- **Estimates are guesses and always say so.** They start from the effort you
  set and sharpen slowly. They will be wrong sometimes; the plan is built to
  survive that by staying two-thirds full.
- **The AI is a local model.** It's good at sorting and extraction, not perfect —
  which is exactly why the check-back and the "check me" chips exist.
- **The step-by-step sorter costs time and calls.** A long thread is dozens of
  model calls rather than one. There's a hard ceiling: past it, the rest is
  parked for you to sort by hand — a big paste becoming "here's a pile" is a
  fine outcome, a frozen app is not.
- **The length threshold is a guess until you measure it.** `/compare.html` runs
  the same paste through both the old single call and the new pipeline side by
  side. That's how the number gets set — not by anyone's intuition, including
  mine.
- **Sync isn't live.** Close it on one machine, let the folder sync, open it on
  the other.
- **Exports are copies, not the truth.** `organiser-data.json` is the real thing.
  If you hand-edit an exported spreadsheet, the next export sits beside it as a
  new dated file rather than overwriting you — but your edit doesn't come back
  into the app.
- **No real `.xlsx` or `.docx`.** Both are zipped folders of XML and writing them
  properly would mean adding a dependency. CSV opens in Excel; HTML opens in
  Word and prints correctly. That's a deliberate trade, not an oversight.
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
data/exports/              ← spreadsheets and pages you can open without the app
data/backups/              ← automatic safety copies
.env                       ← switches the AI on (and later, dictation)
```

**A full backup is a copy of the whole `data` folder** — that's your writing and
your files together.

---

*Built iteratively over many sessions, each one starting from real use rather
than a feature list. The design tracker that drove it is the source of truth for
why things are the way they are.*
