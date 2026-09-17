# The Organiser — what it is, what's in it, and what we think it will do

*A plain-English account of the whole thing, written to be read on its own.*

---

## 1. Why it exists

> **The organiser's purpose is to help the user use available time early enough
> that important work is prepared before it becomes urgent, while making
> capturing, storing and finding information require as little effort as
> possible.**

Two halves, and both have to hold at once. The first is the point of the thing:
the hours before something is due are the hours it can be done well in, and a
planner that only tells you what is due tomorrow has left you the panic and
taken the preparation. The second is the price of admission. An organiser that
buys you that foresight by charging you for every thought you put into it is one
you stop using by week three, and then it buys you nothing.

And two things that foresight is **for**, because an organiser that buys you
time and then spends it for you has done nothing:

> **Protect departure time.** Use time at work first for work that benefits from
> being done at work; move portable work elsewhere rather than extending the
> workday.

Not all work is equal in where it can be done. Photocopying, the conversation
with the head of year, the thing that needs the cupboard key or the classroom
itself — those hours are the only hours those jobs have. Planning and marking
will follow you home whatever happens. An hour at a desk after four o'clock
spent on something that would have travelled is an hour of the immovable work
pushed into tomorrow **and** an hour of your evening gone: the same hour lost
twice. So when the app arranges a day, the question is not only what is most
urgent but what this place is for, and leaving on time is a constraint the plan
is built around rather than what is left when the plan runs out.

> **The organiser must know when enough has been done.** It should explicitly
> tell the user when current obligations and preparation are sufficiently under
> control that they can stop working and rest without needing to keep mentally
> checking what they may have forgotten.

This is the one that makes the rest worth having. The cost of a job you have not
written down is not the job — it is carrying it: the background checking that
runs through the evening, through Sunday, at three in the morning, because
nothing can tell you whether you have missed something. A system that holds
everything and never says *this is enough* has replaced one kind of vigilance
with another, and the person is still not resting.

So **stopping is a thing the app has to say out loud.** Not a silence where the
list happens to be empty, and not praise: a plain statement that what is due
soon is prepared, that nothing has been dropped, and that the checking can stop
until tomorrow. It has to be honest — if there is something, it says so — and it
has to be safe to believe, which is why everything else in this document is so
careful about what the app claims to know.

### What those two need, which is being built before the planner that uses it

Neither principle is built. Both are only possible if four things are true of
the data *before* anything tries to be clever with it, so they are being put in
as the timetable is built rather than retrofitted onto a planner that has
already learned to ignore them.

**Protected time is a thing, not an absence.** A gap is only free if nothing is
in it **and** nothing is protecting it. Lunch, a deliberate breather, the hour
after you leave — those are not empty space for an optimiser to pour work into,
and an optimiser that has to *remember* to leave them alone will eventually
forget. So a block says what it is (`kind`: teaching, duty, break, other) and,
separately, whether a planner may have the time (`protected`). Two questions,
because lunch is a break and protected, a hospital appointment is neither a
break nor teaching and is certainly protected, and a free period you intend to
work in is a break and is not.

**Departure time is a boundary, not an activity.** Leaving at four is not a
thing you do for zero minutes at four o'clock; it is the edge of the day. It
belongs to the working day rather than to the list of blocks in it.

**Work knows where it can be done.** School-only or portable is the single fact
that makes *protect departure time* computable at all: without it the app cannot
tell an hour that had to be spent at school from an hour that followed you home
for no reason.

**And work knows what it is for, and how ready is ready enough.** Roughly:
*needed by · effort · where it can be done · what lesson or event it supports ·
what counts as prepared*. Not a form to fill in — the app sorts, you don't — but
fields the sorter can fill and you can correct, the same way a task's date and
effort already work.

The point of all four: the app cannot say *"you are prepared through Thursday,
nothing important becomes urgent tonight, stop"* unless it knows what was owed,
what it was owed to, how ready counts as ready, and which of the remaining hours
were never available to work in.

### A timetable is a grid, and a fortnight is a shape it can have

A page came back as eight blocks where it had eighteen cells, and nothing looked
wrong: the times were right, the days were right, and a week with eighteen
lessons read as a week with eight. Three things had to be true before the grid
survived, and they are worth keeping true.

**A cell belongs to a column; a run of text does not.** A PDF hands back one run
per word. Placed in a column each on its own, a cell wider than its column is
read as the next day's lesson and that day's real lesson is glued onto the end
of it — one wide cell, two cells lost. A new cell needs *white space with a
column boundary in it*. Not a gap on its own: a cell that nearly fills its
column leaves a small one, and a word that has spilled leaves a large one.

**A cell too long for its column is drawn on two lines,** and the second line
has no time in it. Thrown out with the headings and the page numbers, every long
subject came through cut off at the fold — "Science &", "Writing – Odd /" —
which reads exactly like a reader that found one thing per row and stopped.

**Each page is its own table.** A timetable arrives at the front of a pack with
twelve pages of class lists behind it. Read as one table, the timetable's
columns are decided partly by pages that have no columns. A page of names, asked
on its own, produces nothing — which is the right answer.

**And the check has to be a grid.** Nineteen rows in a list cannot be checked
against a timetable; eight right-looking rows and nineteen right-looking rows
read the same. Before anything is saved the week is drawn as a week, with the
count of filled squares, so a missing lesson is visible without reading a row.

**Parity is data, not a note in a name.** `parity` on a block says which half of
the fortnight it runs in; `weekOne` on one date says which weeks are odd, and
everything counts from there. Until somebody says, parity is **unknown — which
is not "neither"**: both halves of a slot are shown, because half a timetable
quietly missing is far worse than two lessons in one slot. And a make-up day
carries its own parity, because *"even week Tuesday schedule"* is two facts and
the week is the half you have no memory to fall back on.

### And a PDF has no rows, no columns and no words

Everything above assumed the reader was handed lines of text with cells in them.
A real timetable is handed over as none of those, and each of the three had to be
rebuilt before a single lesson was read correctly.

**No words.** A document may position every glyph itself, stepping sideways
before each one by the width of the one before it. Measured against the point
size alone that is a column break at every letter, and the page arrives as "S",
"ch", "e", "d", "u", "le" — fragments the grid reader correctly refuses, which
is how a table came to be read as a run of sentences. A break is now a move that
*clears what was just drawn*, by more than a space.

**No rows.** A line ends wherever a text object ends, and some documents wrap
every fragment in one. Five day names at the same height arrived as five rows of
one word, so the table had no header and every lesson was placed by guesswork.
Two pieces of text at the same height are one line of the page. (Only where the
document said the height: one that walks down the page with relative nudges
never sets it, and reading "no height" as height nought collapses a whole
document into one line.)

**No cells.** A cell may be drawn as five fragments scattered up and down inside
its square, with the period's own time sitting in the middle of them rather than
at the top. There is no row to read at all, so the grid is rebuilt from its
anchors: the day names give the columns, the times give the rows, and everything
else belongs to the nearest of each.

Two rules there were got wrong twice before they were got right, and both are
worth keeping:

- **A row's boundary is the widest blank strip between two times** — not halfway
  between them. The time sits in the *middle* of its row and rows are not the
  same height, so halfway lands inside the taller one. Not "a gap bigger than a
  line" either: that needs a number, and on a real page the space between rows is
  barely half again the space between lines inside a cell.
- **A column is the nearest day, not the last heading before it.** These cells
  are centred and drift, so Friday's lesson starts to the left of Friday's
  heading and a left-edge rule files it under Thursday.

### A wall timetable with pencil on it

The Day and Week pages are drawn to one picture: **the printed timetable, the
handwritten changes on top of it, and the work still to do.** They are three
different kinds of thing and they had all been drawn as rows in a list.

- **The print** is the same every week and you stopped reading it years ago. It
  is the quiet layer, and it earns its quiet by having nothing added to it.
- **The pencil** — a one-off, a lesson swapped, a morning the parents are in — is
  the half you came to the page for, so it carries a rail, a tint and a word
  (`Added today`, `Changed`).
- **The work** is not an appointment. A lesson at nine happens at nine whether or
  not you are ready; marking a set of books is something you do, in an order,
  at an hour the app has only guessed at. So a job carries a tick box where a
  lesson carries its time — a difference you see before reading a word of it.
- **And time you keep looks kept.** Protected time is hatched and says *spoken
  for*, because "unavailable" drawn as a blank is a blank somebody fills.

None of the four is done with colour alone: about one man in twelve cannot
separate two hues and nobody can on a photocopy, so each carries a word and a
shape as well.

**Replacement is not addition.** If the ordinary week has something at an hour
today does not, and something else is on at that hour instead, that is one event
seen from two sides — `Read Aloud → Assembly`, not "no Read Aloud" on one line
and "Assembly 08:15" on another. It is only ever read as a swap when *both*
halves are true: something laid across a lesson that is still running is a
clash, and drawing it as a replacement would be the app telling you a lesson is
cancelled when nobody has cancelled it.

**And an ordinary day says nothing.** A week that reads "Monday — no changes,
Tuesday — no changes" is four lines of reassurance in front of the one that
matters, and after a fortnight nobody reads any of them. So the Week page says
one quiet word per day and folds the printed timetable behind a line that counts
it — `4 lessons · 1 duty · 2 breaks · 1 kept`. Counted, not dropped: this page
once printed "free" under a day with four lessons on it, and *free* is the
sentence you plan against.

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
| **Working?** | Is anything broken, and how do I fix it? |

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
- **Waiting to hear back.** "I've sent it to Helen, waiting for her reply" is a
  different shape from everything else: you can't finish it, because the next
  move is someone else's. So it gets its own quiet section — never "Needs
  finishing", which would blame you for their silence — and a **rhythm** rather
  than a deadline: every few days it comes back and asks. Four answers, always:
  *it came · nudge them · still waiting · stop asking*. "Nudge them" makes a
  real task for today rather than a feeling. And it counts its own asks out loud
  and **stops by itself** after six, so it can never become endless.
- **Names get checked against People.** When something names a person, the app
  looks them up — in code, not by asking the AI. Already there: linked quietly.
  **Nearly** there — you wrote "Helen" and People has "Helena" — you get asked,
  because a one-letter slip files work against the wrong person and neither of
  you ever finds out. Not there at all: it offers to add them, and never adds
  anyone silently, because a typo would otherwise become a permanent contact.
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
- **When something takes the day over.** A meeting appears; a child needs you.
  Tap **something's come up**, say what it is if you want, and the app steps
  back completely — the plan comes off the screen and **nothing will ping you**,
  because the middle of a crisis is the worst moment to be told about Friday's
  report. Tap **I'm back** and it writes down what actually happened as a real
  block, works out the time that's genuinely left, and rebuilds the rest of the
  day around it — hard deadlines first, as always. Anything that no longer fits
  is listed as **pushed out**, not missed: the time went somewhere real and the
  app knows where, because you told it. Each one gets *find it a day* or
  *tomorrow*.
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
- **Understanding happens in the language it was written in.** The local model
  reads Chinese natively — it doesn't need an English copy to think with, and
  handing it one would only add a lossy layer that every later step then reasons
  about. So the sorting, the labelling and the extraction all read your actual
  WeChat message; translation is a **rendering step for what you read**, not a
  preprocessing step for what the app decides. The practical effect: a wobbly
  translation changes what's on your screen and nothing else — it can't corrupt
  which student a note was filed against.
- **And a translation never loses its original.** Translation is the one step
  with no possible check: you can't verify a translation of something you
  couldn't read, and the mistake is silent and permanent. Tap **original** on
  any record to see all three links — what it read, what that says, and what it
  filed. A wrong translation stays recoverable forever, by you or by anyone who
  reads the language.
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

## 6. On a machine that can't run the AI

Worth knowing exactly how much this costs, because it's less than it sounds.
**Eighteen of the app's twenty-three parts never touch the AI at all** — the
zones, the day plan, the levels and marking, the exports, the reminders, the
meeting readiness, the People matching. Everything you *see and do* is plain
code. The AI is only the **front door**: the "say it messily and it sorts
itself" promise.

So on a laptop with no model:

- **Everything still works**, and nothing is ever lost.
- **The front door still reads the everyday things** — patterns pull out the
  date, the time, the urgency, and anyone already in your People list, offline
  and instantly. *"call the dentist tuesday"* still becomes a dated task with a
  clean title. It leaves blank what it can't see rather than guessing, and it
  goes through the same check-back, so the only real difference is how much
  arrives pre-filled.
- **What you actually lose** is the messy end: pasting a whole WeChat thread and
  having it split into separate items, translation, and the coverage check.
- **Those can wait for the desktop.** Anything typed on the laptop syncs through
  the folder, so a long paste can be dropped into the box at home where the
  model lives.

If the laptop turns out to manage a small model, the **Working?** page tells you
which one to try and exactly how.

---

## 7. Honest limits

- **Reminders reach one computer** — the one running the app. Nothing reaches
  your phone. That's the price of no cloud.
- **There's a page that checks the app for you.** The **Working?** tab runs its
  own checks and writes the answers in plain words: whether the app is running,
  what you've got saved and where, whether sorting is available and — if not —
  exactly what to do about it. **Copy all of this** puts the lot on your
  clipboard in one press, so if you ever need to ask someone for help, that's
  everything they'd ask you for. You should never need a terminal to find out
  what's wrong.
- **Sorting needs Ollama actually running.** Being set up in `.env` isn't the
  same as being switched on, and the app now checks rather than assuming: it
  will tell you *"Ollama isn't answering at http://localhost:11434 — is it
  running?"* or *"Ollama is running, but qwen3:14b isn't pulled. Run: ollama
  pull qwen3:14b"*. Either way capture still works and nothing you typed is
  lost — it's saved to sort later.
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
  which is exactly why the check-back and the "check me" chips exist. It now
  says *which* one answered and how long it took — "Read by qwen3:8b via Ollama
  in 51.0s" — because the same document on two computers took fifty-one seconds
  and eighteen minutes, and with nothing named there is no telling a fast
  machine from a small model.
- **One line of a calendar can hold an entry and its exception, and the reader
  hands both to both.** "National Day: Oct. 1-Oct. 7 (Sep. 20 is a working day,
  even week Tuesday schedule; Oct. 10 is a working day…)" is a holiday and two
  make-up days on one line. Each becomes its own row correctly — but each one's
  *supporting context* is the whole line, so the holiday's ground says both
  "Holidays" and "working day… schedule". Two answers at once is ambiguity, so
  the app declines to settle it and asks. That is the safe way to be wrong, and
  it costs one extra click on a row it could in principle work out. Splitting a
  line into the clause each row came from is the fix; it is a change to how the
  reader carves up a line, not to any of the checks, and it is not made yet.
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
- **A gap is still only "nothing booked".** The Day page draws an empty stretch
  as free, and it isn't necessarily: a free period, a supervision duty, a lunch
  you keep and five minutes of walking between rooms are four different things
  and only the last two can be told apart today (`kind`, `protected`). Until a
  gap can say which it is, nothing should read an empty square as *work can go
  here* — which is exactly what a planner would do with it.
- **Only "odd" and "even".** A fortnight written as *Week 1 / Week 2* or *A week
  / B week* is the same idea and just as common, and both spellings are also how
  somebody writes a lesson called "Week 1 Review" or a set called "Set A". That
  wants a real document in front of it rather than a guess.
- **A class roster is not imported as a class.** Pages of names now correctly
  produce no timetable at all, which is the fix — but they are also genuinely
  useful, and reading them into People or a class list is a separate job nobody
  has started. The timetable importer no longer guesses at people either: it used
  to offer "Primary", "English", "Section" and "Homework" as eight names to add,
  because beside a lesson those words are a department, a room and a subject.
- **A lesson's room is still part of its name.** "English(G1\\N) Primary Section
  111" is the whole of what the cell says, and all of it is kept rather than
  guessed at — but the room belongs in `where`, where the day can use it. Nothing
  splits it yet.
- **THE BIG ONE: a timetable, a holiday and a one-off are all just dated blocks.**
  A vacation is stored as one all-day block per day, so half-term is sixty-odd
  rows to scroll past in the setup list, and a PD day becomes an appointment from
  midnight to 23:59 rather than a day that says "working, no normal lessons".
  What it should be is a weekly template, then date and range overrides on top of
  it, then one-off changes — resolved into a day when a day is asked for. The
  recurring week should be bounded by the term rather than running for ever and
  being suppressed sixty times. This is the next piece of work and it is a real
  redesign, not a tidy-up.

---

## 8. The rules it was built under

Kept here because they explain nearly every design choice:

1. **The app sorts; the user doesn't.**
2. **Spelling never matters.**
3. **No hard-coding.** The code knows only generic shapes — records, points,
   people, levels. Every domain word (student IDs, standards, note kinds, level
   scales) is *your editable data*. Point it at plumbing jobs or a different
   curriculum and it works unchanged.

   **With one line drawn through it, added after a real failure.** The app may
   know what *its own* answers mean; it may not know what *the world's* events
   mean. "Mid-Autumn Festival is a holiday", "a PD day means no lessons" — that
   is one school's world, it is endless, it is wrong at the next school, and it
   is the app deciding your term from a noun. Still forbidden, and there is none
   of it in the code.

   But the app invented the six answers on its own buttons. When it asks a model
   whether a day is a *day off*, and a verifier that knows nothing at all lets
   through "Orientation: Feb 18–19 → day off" because the quote is real and in
   the right place, the rule has stopped protecting anybody: it has just made a
   small local model the only judge of meaning in the system, and on a real
   calendar that put five wrong days into somebody's term. So the verifier knows
   that "closed", "holiday", "vacation" support its own category *day off* and
   that "working day" contradicts it — twenty-odd phrases, about the operation
   and never the occasion, listed in one place and biased towards asking.

   The test is: **could this list be wrong at a different school?** A list of
   festivals could. A list of words meaning *closed* could not.
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

## 9. Where things live

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
