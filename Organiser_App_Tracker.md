# Personal Organiser App — Design Tracker

> A calm, neurodivergent-friendly organiser. You dump messy, misspelled, unstructured thoughts at it; it understands them, sorts them into the right places, and shows you your life in a way that feels manageable.

**Status key:** 🔒 decided · 🟢 in the first small build · 🟡 next · 🔵 later · ❓ open question

**Last updated:** Session 15 (day-timeline view BUILT + AI now extracts times; real use says *seeing isn't enough* — next is the "help me decide" support layer, now spec'd: capacity-aware shortlist + signal-prep + a "name the load, not the person" guard)

---

## 0. THE POINT — Core Pillar 🔒

> *The most important section. Everything is judged against it.*

The app exists to remove friction for a dyslexic / dyscalculic brain. The whole value is: **say it messily → it understands → it organises → I feel oriented.**

Two things the app must NEVER do:
- Make the user decide *what kind* of thing they're entering before they enter it (task vs note vs date). That upfront sorting is exactly the friction that stops them. **The app sorts; the user doesn't.**
- Make spelling matter, anywhere.

### Resolved: what this app is really for 🔒
Not simply "relief vs orientation" — it's **mostly orientation, with relief through completion.** Three concrete needs:

1. **Triage** — too many wants, not enough time. The app helps decide what's worth the limited time *now*, what will quietly get dropped anyway, and what's *urgent* vs what's just being over-polished. **Capacity-aware 🔒 (s15):** triage is bounded by a *limited daily budget* (cf. "spoon theory" — a fixed daily store of mental energy that, once spent, is gone). So "what matters now" must hand back a **short, finishable shortlist for today**, sized to realistic energy — *not* a ranked wall. A small set you can actually clear feeds felt-completion + the clean-slate feeling (#2); an oversized today-list just manufactures guilt (see the progress-bar guard below).
2. **Completion you can feel** — the user likes the *finish it, mark it done, move on* shape. The app must let them **close things generously** and feel genuinely done.
3. **Carried revisits** — most of life is *"good enough for now, improve later."* **"Done for now" IS a real completion** the app holds and may resurface later, so improvement isn't open guilt.

**Design guard 🔒:** Never use a progress bar that can't fill / a task that's never allowed to be complete — for this user that creates low-grade guilt. Always let things *close*.

**Design guard — name the load, not the person 🔒 (s15):** When the app flags overload or breaks a big thing down, it describes *the plan as oversized* (a fact about the work), never implies *the user can't cope* (a verdict on them). "This is a lot" — never "you can't manage this." Tone is part of the design. *(From real use: the load genuinely is high; the app must not turn that into self-judgment. The over-reliance / "crutch" worry stays out of the code, §2.5 — the app only avoids *feeding* it.)*

---

## 0.1 THE ARCHITECTURE — Offline Seeing / Online Sorting 🔒

> *Derived from the most important real-world insight: the paper planner already worked for SEEING; every digital app failed on PUTTING IN.*

**The lesson from paper vs apps:**
- A paper planner worked for the user — open it, see the week, no effort. The **seeing** was effortless.
- Every digital organiser failed — not because of the looking, but because **entry** (tapping into the right field, deciding where it goes) was too much effort. A plain offline organiser is therefore just *a worse paper planner* and does NOT solve the problem.
- But paper can't do the support (breakdown, sorting messy dumps, carried revisits). So: paper = effortless seeing, no support; apps = support, unbearable entry. This app must resolve that.

> **Re-confirmed in real use (s15) 🔒:** with the seeing-half *and* AI sorting both live, the user's verdict was — *"I can see the day's tasks… I could do that already. I need the next step."* That is this very thesis biting: **seeing alone is just a (nicer) paper planner.** What makes the app worth more than paper is the **support** paper can't give — helping *decide / triage / break down*, not just *display*. → the next builds should be **support, not more seeing** (see §0.2 importance/urgency surfacing; ultimately §6 goal-breakdown, §9 milestones).

**The two halves live on opposite sides of the connection line — and that's fine:**

| | What it is | Connection | AI? |
|---|---|---|---|
| **SEEING** | zones, calendar, today's list, ticking off, all data | **fully offline, always, instant** | **none** |
| **PUTTING IN** | messy dump → understood → sorted; goal breakdown | **online** (the magic) | **yes** |

**Non-negotiables 🔒:**
- **Seeing never pauses.** Internet down = irrelevant; it's just reading + ticking, the machine does it alone forever. *The user's life must never stop because a connection dropped.*
- **AI is not a luxury bonus** — it's the fix for the *exact friction* (entry) that made every previous app unusable. Without it, this is just another rejected app.
- **Offline entry must stay as frictionless as paper.** It must NOT degrade into the bad-app "fill in these fields now" experience. → Offline capture = **one box, dump the text, sort it later when back online.** Never fielded entry. As easy as scribbling in a planner.
- **Online = the AI catches up** and sorts the dumped pile properly.

### Why this also answers the over-reliance worry 🔒 (see §7)
Building it local-first / offline-capable / user-owned (not phoning out to a company's servers to function) means it's **more** self-reliant, not less. It's an aid the user *controls* — like glasses or a ramp — not a cloud dependency. This directly honours the *fair* version of the wife's concern ("don't be helplessly dependent on something that could vanish") while rejecting the unfair version ("struggling without aids is a virtue").

---

## 0.2 NO HARD-CODING — The App Knows Only Abstract Shapes 🔒🔒

> *The deepest design rule. A previous attempt (in Codex) FAILED because it hard-coded a specific situation into the app's logic — so when the situation changed, it broke. This must never happen.*

**The inversion:** the app must know **nothing** about any real-world domain. No "job hunting," no "schools," no "applications," no "CV." Those words appear **nowhere in the code.** A real-world situation is **only data** — produced by the AI understanding what the user said — that **flows through a small set of generic shapes.** Swap teaching → plumbing, or job-hunting → wedding-planning, and the same shapes hold because the app never knew the difference.

**How we use real situations (CRITICAL):** real examples are **test cases to check the shapes are big enough — NEVER things to build toward.** For any situation, ask: *what general shape is this an instance of?* If it reduces to an existing shape → good. If it needs a new shape → we found a hole. Building *toward* a situation = the Codex mistake.

### The generic shapes so far 🔒
*(derived by reducing the user's real job-hunt situation — every part reduced cleanly to these, needing zero job-hunting concepts; that's the design passing its test)*

- **Pipeline / staged item** — a tracked thing that moves through stages, where some stages *wait* and some need a *nudge*. (Job applications = instance. Also: sales leads, dating, story submissions.)
- **Goal with branches / parallel sub-paths** — one goal, multiple children that serve it differently; some paths the user *drives*, some they *set running for others to act on*. (Controlled school hunt vs intro-video-for-agents = instance.)
- **Someday / low-priority item** — shouldn't clutter today, mustn't be lost. (LinkedIn/TES update = instance.) Covered by triage + someday zone.
- **Carried future-recurring item** — a thing due far in the future whose *stress is in carrying it*. The app **holds it so the user can put it down now**, surfacing it when relevant. (LinkedIn/TES "I'll redo this in 2 years" = instance.) = carried revisits (§0).
- **Multi-parent item** — one item belonging to more than one goal at once. (Training serves job-hunt AND standalone professional development = instance.)
- **Milestoned ongoing goal** — a never-ending "always improving" goal carved into completion points. (Training, prof. development = instance.) = milestones (§9).
- **Item with attached artifacts** 🔵 — an item can hold files/notes/proof; artifacts can be *collected and filtered* later. (Evidence-keeping = instance. A **CV is just a view/filter over collected "evidence" artifacts** — NOT a separate feature, and NOT a separate app.)
- **Compose-a-document-from-artifacts** 🔵 — take a *filtered set of artifacts* and hand them to the AI with a "compose into X" instruction → get a formatted document. (A **CV** = this shape aimed at job-evidence; "CV" is the value of X, supplied as *data*, never baked in. Same machinery makes a portfolio, progress report, grant application, etc.) **Guard:** build the *generic* compose shape, NEVER a hard-coded "Generate CV" feature that knows CV structure — that would be the Codex mistake again. **Free workaround until mature (do this first):** the user can simply *export the evidence and feed it to an AI* themselves — costs nothing, works today; the in-app version only removes a copy-paste step, it is **not new capability.** So this is a *late* convenience, not a near-term build.
- **Day-timeline view** ✅ **BUILT (s15)** *(shape added s12)* — timed items laid out on a single day so the user can **see free slots**, not just the task list. **Built as:** a calm ordered list of today's timed items with the **gaps between them called out** ("~3 hours until the next thing") — *not* a dense 24h grid — plus a separate **"Anytime today"** list; the user can **give any floating task a time** (or change/clear it) and tick things done right there → user-driven day-*planning*, nothing auto-moves (control pillar §0/§1). Unlocked by extending the AI to also pull a clock **time** (`3pm`→`15:00`) next to the date (empty when none, or for vague parts-of-day like "tonight"). Pure *seeing* + you-decide time-setting; offline. Guards held (calm list, no grid). **Real-use caveat (s15):** laying the day out is *still seeing* — on its own it did **not** make the app feel "livable" (see §0.1 re-confirmation + changelog s15). It's a genuinely better *seeing* (you can now plan *in* it), but the livability gap is decision-**support**.
- **Importance/urgency surfacing + SUGGESTED scheduling** 🟡 *(added s14; promoted to NEXT s15)* — the user asked the app to "see which tasks are more important or urgent and move them around the planner." Two halves, judged separately: **(a) surfacing** what matters most (importance vs urgency — the classic lens; directly serves the §0 triage need) = **strongly aligned, do this.** **(b) auto-moving** items around the calendar = **GUARDED HARD:** silently rearranging the user's day crosses the control pillar (§0/§1: AI *proposes*, user *decides*) and risks recreating the obligation-wall. Allowed form: the app *highlights* what's most important/urgent and *offers* a suggested plan / slots things into free gaps — **the user accepts or tweaks; nothing moves on its own.** Suggest, never impose. **(s15 — now front-runner):** real daily use put this at the **top of the queue** — after the timeline shipped, the user said seeing the laid-out day still "isn't enough… I need the next step," i.e. *help me decide.* The **surfacing** half is precisely that help. **Capacity-aware output 🔒 (s15):** what it surfaces is a **short, finishable shortlist for today** sized to a limited daily energy budget (cf. "spoon theory", §0) — small by default, **never a ranked wall**, and with **no depleting "energy meter"** (that would be the can't-fill guilt bar §0 forbids). **Optional "lighter day" control 🔵 (s15):** a later, opt-in toggle that shrinks the shortlist on low-energy days — guards: always optional (never a field you must fill), never a depleting gauge, never guilt. Near-term needs no input — just keep today's set small by default.
- **Goal-and-parts VIEW** 🔵 *(added s14)* — a *way of seeing* the big-task ↔ small-task links that the data shapes above (goal-with-branches, multi-parent, milestoned goal) already capture. The user asked for "identify large tasks and how small tasks link to them" — **the structure already exists in the shapes; what's new is displaying it.** Pure *seeing*. **Guard:** show the link lightly ("part of: Job hunt"), NOT a nested project tree / Gantt chart — trees are exactly how task apps become the wall the user fled. The AI may *propose* groupings ("these 3 look like parts of one bigger thing?") but the user confirms.

### One app, not many 🔒
Evidence-keeping and CV-building are **the same engine** (artifacts + a filtered view), so they belong in **this** app, not a spun-off second app. **BUT build them later** — the user has a documented pattern (the whole reason this app exists) of spawning grand new scope before finishing the current thing. **Same app (shapes match); later (finishing beats expanding).** Capture the shape now so the foundation doesn't preclude it; build none of it until the core loop is real and in daily use.

---

## 0.3 HOW THE AI IS POWERED — Swappable Engine + Build Order 🔒

> *Resolved after the first Claude Code build came back needing a paid Anthropic API key — which clashed with the offline + no-over-reliance goals. "How the AI is powered" is a real architectural choice; here it is.*

**The AI is a SWAPPABLE PART 🔒.** The app sends a messy line to "an AI box" and gets clean typed items back. What's *inside* the box can change without rebuilding anything around it:
- **Option A — paid cloud (Anthropic key):** works, genuinely *cents/month* at personal scale (billed per use), but fiddly + a cloud dependency. Cost is NOT the barrier; the philosophy clash (offline / over-reliance) is.
- **Option B — free cloud tier (e.g. Gemini):** no card, small setup; still cloud-dependent and tiers can change. **Easiest to start.**
- **Option C — local AI on the user's own machine (e.g. Ollama / LM Studio):** truly offline, no key, no cost, no company, **fully owned** — matches the whole tracker philosophy + answers the over-reliance concern best. **Correction (verified):** this is NOT "local Claude" — Anthropic doesn't release Claude's weights, so on-device Claude is impossible. It means a capable **open-weight model** (e.g. Llama / Mistral / Qwen), now competitive with mid-tier cloud models for a task like sorting text. Trade-off: less clever than top cloud models, and needs a capable-enough machine. **CHOSEN & WORKING 🔒 (s13).** Machine checked — i9-14900KF, 32 GB RAM, **RTX 4070 SUPER (12 GB VRAM)**: comfortably strong, so B was skipped and we went straight to C. **Ollama** installed (the engine; runs a local socket at port **11434** that imitates the standard cloud-AI socket → the swappable box is untouched). **Model chosen: `qwen3:14b`** (best instruction-follower that fits 12 GB VRAM; ~9 GB on disk, Q4-squashed). **Tested s13:** sorted a sample dump into the right zones correctly. *(The number that mattered was VRAM, not RAM — the GPU does the thinking; normal RAM is just headroom.)*
- **Option D — no automated AI; user pastes dumps into a normal AI chat by hand**, then puts the clean items into the offline app. Zero setup, free, today. The proof-of-magic-by-hand path.

**BUILD ORDER 🔒 (de-risk for free; milestone principle applied to the app itself):**
1. **No-AI seeing-half first** — *built & in real use.* Proven foundation before any setup hill.
2. ~~Free cloud (Option B) on-ramp~~ → **SKIPPED (s13):** machine is strong enough to go straight to local.
3. **Local AI (Option C)** — ✅ **WIRED & PROVEN (s14).** App's AI box connects to local Ollama (`localhost:11434`, `qwen3:14b`). Messy dump → clean typed dated items, in-app, offline, no key. All 3 prompt rules implemented and verified live. Still swappable (LM Studio / Anthropic via `.env`); AI is optional (off = by-hand, unchanged); if Ollama is down the dump is parked, not lost. **(s15:** the AI now also extracts a **time**, not just a date — see §0.2 day-timeline.)
Each step is independently usable; nothing is wasted.

### The 3 prompt rules for wiring the AI 🔒 (decided s13)
*The model is never changed — these are all in **how the app asks it.** The app wraps your raw text in these instructions before sending to the brain at localhost:11434.*
1. **Feed it the date & time, every time.** The model has **no clock and no memory** — each message starts blank. So the app must prepend something like *"Today is Monday 15 June 2026, 15:30."* Without this it just guesses what "tuesday" means (it literally agonised over this in the s13 test). With it, relative words ("tonight", "tuesday", "next week") resolve to real dates. *(s15: implemented as the browser sending its real local "now" + the ISO date on every request.)*
2. **Demand a fixed output shape, not prose.** Tell it to reply as a strict tidy structure (zone + text + date + time per item) so the app can read it reliably — a form, not an essay. (Practically: JSON.)
3. **Quiet the thinking-out-loud.** Qwen 3 "thinks" aloud by default — useful for a human watching, noise for the app. Switch it off (or have the app ignore everything before the final answer). *(s15: implemented as Ollama `think:false` plus stripping any `<think>…</think>` as a backstop.)*

### Multi-device reality 🔒 (clarified s13)
The AI does **not** "live on a shared drive." The drive only stores the model *file*; the **thinking happens on a device's GPU** (the chef, not the recipe book). Two real ways to use the AI on more than one device: **(a)** install Ollama + pull the model on each *capable* device (each thinks for itself, fully offline — but no phones / weak laptops); **(b)** run it once on the strong desktop and have other devices on the home wifi *phone in* to its socket (desktop = the one brain; app just points at the desktop's address instead of "localhost"; catch: desktop must be on; outside-the-house access = more setup, later). **Do NOT put the 9 GB model in OneDrive** — it fights the sync. The tiny offline app + data file syncing via OneDrive is fine; only the heavy brain must stay near a chef.

**Note:** the user reasoned their way to "no-AI first" themselves — it's the right move, and the same milestone/smallest-usable-piece discipline the whole app exists to provide.

---

**1. The dump 🔒**
One obvious place to talk or type. Not a form, no fields. Just one spot. You say/type one messy sentence that may contain several different things, e.g. *"tysday i gotta call the denist and also mums bday is comin up."*

**2. The understanding 🔒 (the heart of the app)**
AI (Claude inside the app) reads the messy line and:
- splits it into separate items,
- works out the *type* of each (task / date / reminder / note),
- fixes spelling silently,
- converts vague time words ("tuesday", "soon", "next week") into real dates *(and explicit clock times into real times — s15)*.
One sentence can become 2–3 organised entries. This is an AI job, not simple app logic — it's what makes the app special and also the hardest part.

**3. The check-back 🔒**
Before filing anything, show what it understood and let the user confirm or fix it.
e.g. *"Got it: ① Call dentist — Tuesday. ② Mum's birthday — coming up. Right?"*
Why this matters: AI understanding isn't perfect; silent misfiling would destroy trust. Must feel **light** — a glance and a tap, not a chore.

**4. The view 🔒**
Items live in an "everything, organised" screen built as a few **calm visual zones**, not one long list:
- **Today**
- **Coming up**
- **Someday / no date** (floaty stuff)
Big readable text, generous spacing, clear grouping. The goal is to glance and feel *oriented*, not confronted with a pile. **The organising IS the product.** *(s15: a separate **Today timeline** view now lays today out by time — see §0.2.)*

**5. Completing things — two modes 🔒**
The user wants done items **gone from the active view** (clear the decks, empty today's list, feel the clean slate) — *and* the data **kept somewhere separate** for reflection.
- **Doing mode** wants emptiness: done = **gone**, fully removed from the active zones. Do NOT leave completed items cluttering the active list "so they count."
- **Reflecting mode** wants the record: completed items flow into a quiet, separate place the user visits only when they want to look back — a **mirror, not a trophy cabinet.** Purpose is the triage need (§0): where does time go, what keeps getting dropped, where could things improve.
- **Resolved (s12) 🔒:** "Looking back" gets its **own separate page**, NOT a section under the zones on the main screen. Real use showed done items visibly piling up at the bottom of the front page — exactly the clutter the done=gone rule forbids. The mirror gets its own room; the front page stays only the active zones.

**Design guard for the data mirror 🔒:** It must stay the *encouraging* kind, not a report card that makes a messy-but-trying person feel judged. → **Capture the data from day one (cheap); design how to *show* it slowly and carefully (the risky part). Insights are 🔵 later, not early.**

**6. Goal breakdown — possibly THE core feature 🔒**
The user thinks big, then the *scale* of the idea overwhelms them, and they defeat themselves before starting (clearly visible in how they approached their game ideas). The app's most life-changing job may be: **take a grand plan and hand back a single first step.**
- **Hard rule 🔒:** when breaking a goal down, **show only the next 1–2 steps**, never the whole tree. Handing an overwhelm-prone brain a 30-item breakdown just *relocates* the overwhelm. The full breakdown can exist underneath; what's *shown* is "here's where to start."
- This is the same medicine that worked for the user on the game projects ("what's the smallest piece that proves this"), baked into the app.
- **(s15 note):** this is the deepest form of the *support* the §0.1 real-use insight calls for — the thing paper can never do. A strong candidate for the build right after importance/urgency surfacing.

**7. Unplanned-progress capture 🟡**
Later: the user often does something that contributes to a goal but *wasn't a planned task* (e.g. "spent the afternoon sketching faction ideas"). The understanding engine, pointed at *progress* instead of input, should recognise this belongs to a goal/step and slot it in + update things — so progress is captured even when life doesn't happen in the planned order. Feeds triage + the data mirror (real progress, not just intended progress).

**8. Dependencies — background engine, NOT an early feature 🔵**
Real concept: **task dependencies** (some steps can't start until others finish; some goals branch into parallel tasks that must all complete before the next step). The PM term is a *dependency graph / critical path* (Gantt / PERT charts).
- **Yes, the app can understand this** — but as a **quiet background engine**, used to decide *which next step is actually available right now* (never surface a step that's still blocked). This is just *how* the app picks the 1–2 steps it already shows (§6). Framed this way it's the engine behind the small view, not a new feature.
- **The visual graph is OPTIONAL and tucked away** — openable in reflecting mode when the user *wants* the big picture, exactly like the data mirror. **Never shown by default.**
- **⚠ Overwhelm warning (critical):** a full branching graph is *the overwhelm drawn as a picture* — and scale-of-plan is precisely what defeats this user before they start. Building the graph as a front-and-centre or early feature would trigger the exact thing the whole app exists to prevent. **Do NOT build the graph early. The next-step view is always the front door; the graph is an optional back room.**

**9. Milestones + milestone-progress-bar — possibly THE key motivational feature 🟢🔒**
> *The user's own best idea. The opposite of the overwhelm reflex: instead of showing the whole mountain, it carves the mountain into finishable pieces.*

- **Milestones** cut a large or never-ending ("always improvable") goal into **completion points** — each one a *usable product / a thing to be proud of*, even though the larger goal continues.
- **Why it's so important for THIS user:** it's the bridge between the user's love of *finish → mark done → move on* and the reality that most goals never truly finish. Milestones deliver the **quest-complete hit repeatedly** on a goal that technically never ends. "Improve it later" becomes the *next milestone* (a fresh quest), not a permanent open wound — interlocks directly with **carried revisits (§0)** and **felt completion (§0)**.
- **The progress bar — strict rule 🔒:** the bar measures distance to the **next milestone, NEVER to the final goal.**
  - Bar-to-final-product = bad: never fills → permanent guilt reminder. **Forbidden.**
  - Bar-to-next-milestone = good: fills *soon*, hits 100%, gives a real completion, then **resets for the next milestone.** Short, fillable, satisfying, repeatable, *encouraging.*
- **What the user actually sees:** current milestone + a bar filling toward it + the 1–2 next steps that move the bar. The complex structure stays underneath; this may be all the user ever needs to look at (and largely removes the need for the §8 graph).
- **Caveat 🔒:** placing milestones and weighting step→bar progress is an **AI/breakdown job** (part of the online layer, §6) — it will sometimes pick odd stopping points and **the user must be able to nudge/adjust milestones.** Not free magic; expect to correct it occasionally so it doesn't feel broken.

---

## 2. Decided So Far 🔒

- **Platform:** laptop/computer first. (Good speech-to-text in browser, real keyboard for typing backup, big screen for the zoned view.)
- **Input:** both voice and typing, with **voice as the primary path**, typing as backup. Lean on the device's/browser's *built-in* speech-to-text rather than building our own.
- **Content types:** tasks, appointments/dates, reminders, and notes — all dumped the same way, sorted by the app.
- **View priority:** "everything, organised" — but organised into calm zones so seeing it all stays manageable.

---

## 2.5 Personal Context That Shapes the Design 🔒

> *Why the architecture is what it is — kept so the "why" isn't lost.*

- The user is neurodivergent (dyslexia, dyscalculia, possibly more). Tools that bridge these gaps are **accommodations, not laziness** — like glasses or a ramp. "Try harder / read more / practise handwriting" is well-meaning but misunderstands that effort against a neurological wall is just exhaustion.
- There is real tension at home: a partner who worries about **over-reliance on AI**. Two things are tangled in that worry:
  - *Fair:* don't be helplessly dependent on something that could vanish. → **Honoured** by local-first / offline-capable / user-owned design (§0.1).
  - *Unfair:* struggling without aids is virtuous. → **Rejected** — the point of the app is to remove unnecessary struggle.
- **Design consequence:** the app should itself be *evidence* — proof the user built a tool they **own and control** to help themselves, not a cloud dependency. This is a genuine design driver, not just background.
- *(The relationship/human side is its own thing, deserving its own care — not an app problem to solve in code.)*

---

## 3. The Smallest First Build (proof-of-magic) 🟢

> Same discipline that worked on the game project: build the one moment that proves the idea before anything else.

**The one loop to prove:**
> One messy line → understood → confirmed → shows up in the right zone.

✅ **ACHIEVED (s14).** Real input *"message the recruiter today, messge vanke HR tomorrow, call mum on the 22nd"* → split into 3 clean items, typo fixed ("messge vanke" → "Message Vanke HR"), every date resolved correctly (today→15 Jun, tomorrow→16 Jun, 22nd→22 Jun), shown in a "look right?" confirm step with editable zone+date and a "your words:" trace, nothing committed without the user's Add. **The magic loop is closed and working.** Everything from here is enhancement, not foundation.

If dumping *"tysday call dentist"* and watching it become a clean **Call dentist — Tuesday** entry feels like **relief**, the whole app is worth building. If that single moment doesn't feel good, no extra features will save it.

**Deliberately NOT in the first build (to keep scope honest):**
- Voice input (prove it with typing first → voice is 🟡)
- Saving/sync across devices (browser-only first → proper storage is 🟡/🔵)
- Editing, recurring items, notifications, search (all 🔵)

---

## 4. Known Tradeoffs & Realities (named honestly)

- **Data storage 🔒 (DECIDED s10, PROVEN WORKING s11):** Browser-only storage is **too fragile to trust with real life** — an organiser you can't trust is *worse than nothing*. Trustworthy storage was made a **hard requirement before real daily use.**
  - **Order locked:** storage **rock-solid FIRST**, then AI separately (two independent hills).
  - **Built & verified (s11):** data now lives in a **real file the user owns** — `data/organiser-data.json` inside the app folder. Auto-saves (no save button), atomic write (no half-saves), automatic backups in `data/backups/` (pre-change + daily), plus in-app **Back up now** / **Restore** buttons. No third-party packages, runs on Node alone, no internet. **Trust test passed:** added an item, fully closed browser + server, restarted → item still there. User confirmed: trustworthy.
  - **Cross-device, owned, no cloud-lock:** keeping the app folder in OneDrive/Dropbox/Drive syncs the data file across devices with no third-party account — honours "owned + eventually cross-device" (§0.1). Built behind a seam so smoother sync can slot in later.
  - **Preview vs saved:** opening `index.html` directly = **"Preview mode"** (not saved); running the server = real saving. The double-click-vs-server storage split is now gone (the file is the single source of truth).
- **Ambition level:** This is a bigger project than the roguelike. The "understand messy input" part needs an app that can call an AI to do the understanding — more moving parts than a self-contained HTML file. This is genuinely the "second project," appropriately more ambitious.
- **The "everything" tension:** Wanting to see everything pulls against the need to avoid an overwhelming wall. Resolved by *grouping into zones*, not by hiding things. Getting the organisation right is most of what makes the app good or bad.

---

## 5. Open Questions ❓

- ~~Relief vs orientation~~ → **Resolved (§0):** mostly orientation via triage, relief via felt completion.
- ~~What happens to a done item~~ → **Resolved (§ flow step 5):** gone from active view, kept in a separate reflecting space.
- ~~Is "Looking back" wanted?~~ → **Resolved (s12):** yes — but on its **own page**, never on the main screen.
- How light can the check-back step be while still keeping the user in control?
- How should "Coming up" be split — by day, by this-week/next-week, or by urgency?
- For triage: should the app actively *suggest* what to drop / what's over-polished, or just lay things out so the user decides? (Active suggestions are powerful but risk feeling judgemental — handle like the data mirror.) **(s15 lean:)** real use says lay-out-only is *not enough* — the user explicitly wants the app to **help decide**, not just display. So: yes to active surfacing of what matters; keep it *suggestion*, never judgment, never auto-move.
- What should the "done for now → maybe revisit" resurfacing actually feel like? When/how does a parked item come back without becoming nagging?
- Where does it eventually live so data isn't lost / is reachable from more than one place?
- Does it ever proactively *remind* (notifications), or is it always something you open and look at?

---

## 6. Changelog

- **Session 1:** Established the core pillar (say messy → understand → organise → feel oriented; app sorts, user never does; spelling never matters). Agreed the end-to-end flow (dump → understand → check-back → zoned view). Locked platform (laptop-first), input (voice-primary + typing, using built-in speech-to-text), content types, and the calm-zones view. Defined the smallest proof-of-magic build. Named the data-storage and scope tradeoffs. Left "relief vs orientation" as the key open question.
- **Session 2:** Resolved the core purpose — *mostly orientation via triage, relief via felt completion.* Three needs locked: triage, completion-you-can-feel, and carried revisits. Added design guard against never-filling progress bars. Defined two completion modes: done = **gone** from active view, but **kept** in a separate reflecting/mirror space. Flagged that insights must stay encouraging → capture data early, design display slowly.
- **Session 3:** Locked the **offline-seeing / online-sorting architecture** (§0.1), derived from the key real-world insight: the paper planner already nailed effortless *seeing*; every app failed on *putting in*. Seeing = fully offline/no-AI/never pauses; putting-in = the AI layer that fixes the exact entry-friction that killed past apps; offline entry = "one box, sort later," never fielded. Added goal-breakdown as possibly THE core feature (hard rule: show only next 1–2 steps). Added unplanned-progress capture (🟡). Captured the personal/over-reliance context as a real design driver (§2.5) — local-first ownership honours the *fair* version of the partner's concern.
- **Session 4:** Added **task dependencies** as a *background engine* (§8) — used quietly to decide which next step is actually available, i.e. the engine behind the existing 1–2-step view, NOT a new front-facing feature. The visual dependency/progress **graph is optional, reflecting-mode only, never default**, with an explicit overwhelm warning: a branching graph is scale-as-a-picture and would trigger the exact defeat-before-starting the app exists to prevent. Flagged 🔵 — do not build early.
- **Session 5:** Added **milestones + milestone-progress-bar** (§9) — the user's own best idea and possibly THE key motivational feature. Milestones carve large/never-ending goals into finishable *completion points* (each a usable, proud-of-able thing), delivering the finish-it-and-move-on hit repeatedly; interlocks with carried revisits + felt completion. **Strict rule:** the progress bar always measures distance to the *next milestone*, never the final goal (a bar-to-final never fills = guilt; a bar-to-milestone fills, completes, resets = encouraging). This largely removes the need for the §8 graph. Caveat: milestone placement is an AI/breakdown job and must be user-adjustable.
- **Session 6:** Locked the **NO HARD-CODING rule** (§0.2) — the deepest design rule, in response to the previous Codex attempt failing by baking a specific situation into the logic. The app knows only **generic abstract shapes**; real situations are *only data* flowing through them; real examples are *test cases*, never build targets. Derived the first shape set by reducing the user's real job-hunt situation — every part (school pipeline, intro-video branch, LinkedIn/TES someday + carried-future item, training as multi-parent + milestoned ongoing goal) reduced cleanly to existing shapes with **zero** job-hunting concepts needed (design passed its generality test). Resolved evidence + CV: **same engine** (artifacts + filtered view), **same app** (not a spun-off second app), but **build later** — capture the shape now, don't build until the core loop is in daily use.
- **Session 7:** Added the **compose-a-document-from-artifacts** shape (§0.2) — a CV generator is legitimate ONLY as this generic shape (filtered artifacts + "compose into X" where X is data, not baked in); a hard-coded CV feature is forbidden (Codex mistake). Noted the **free workaround to use first**: export evidence and feed it to an AI manually — costs nothing, works today; the in-app version saves only a copy-paste step, not capability → it's a *late convenience*, not a near-term build. Flagged the gentle pattern: evidence/CV has now grown across three turns (separate app → part of app → generator inside app) — a real pain point, hence worth watching as a scope-recruiting magnet.
- **Session 8:** First Claude Code build came back (committed to a branch, built faithfully along the §0.1 architecture; needs a paid Anthropic key + runs as a local server to do the sorting). Resolved **how the AI is powered** (§0.3): the AI is a **swappable part**; four options (paid cloud / free cloud / local / by-hand). **Locked build order:** (1) use the **no-AI seeing-half that already works today** and confirm seeing-in-zones actually helps, before any setup; (2) then add sorting via the **easy free tier**, built swappable; (3) eventually swap in **local AI** for true offline + owned. User arrived at "no-AI first" themselves — correct, and the milestone discipline applied to the app itself.
- **Session 9:** **MILESTONE — seeing-half running on the user's Windows laptop**, opened by double-clicking `public/index.html` (no key/server/cloud). Node v24 already installed; downloaded branch ZIP, extracted, opened. Offline-capture rule observed working live (an unsortable dump parked under "Waiting to be sorted," lost nothing). User verdict: "looks ok, would know more once I start using it" — correct; next = real use. Parked question: is "Looking back" wanted? (unsure — leave it, let use decide.)
- **Session 10:** User correctly judged **fragile browser storage = untrustworthy for real life** (worse than nothing). **Locked (§4):** storage **rock-solid FIRST, then AI** (two independent hills). Direction: a store the user **owns**, never loses data, architected so **cross-device is addable later** (build single-machine first; sync is a later milestone; cross-device sync tension with no-cloud noted).
- **Session 11:** **MILESTONE — trustworthy storage built & PROVEN.** Claude Code replaced browser storage with an owned JSON file + atomic writes + auto-backups + in-app backup/restore, Node-only. **Got it running despite a broken launcher:** the `Start Organiser.bat` double-click launcher is **buggy** (prints only "then double-click this file again / Press any key" with no setup text, then exits — does NOT start the app). Worked around it by running `node server.js` directly from a manually-opened command prompt → "Your organiser is running" → `localhost:3000`. **Trust test passed:** added an item, fully closed everything, restarted → item survived. User confirmed trustworthy. **OUTSTANDING BUG to fix later:** the `.bat` launcher (so the user gets back a reliable one-double-click open instead of needing the command line). Not blocking — `node server.js` is the working way in for now.
- **Session 12:** **Launcher FIXED** (Claude Code, from a drafted prompt + draft .bat using `%~dp0` so no hard-coded paths) — one double-click now starts the server and opens the browser; the s11 outstanding bug is closed. **Real use has begun** and produced three findings: (1) done items visibly clogged the bottom of the main screen → **decided 🔒: "Looking back" moves to its own separate page** (the purest form of the mirror rule — and answers the s9 parked question: yes it's wanted, just not on the front page); (2) user wants **AI sorting ASAP, leaning local** → concrete local path named (**LM Studio**, runs open-weight models, imitates the standard API socket so the swappable box is untouched); RAM check pending (16 GB comfortable / 8 GB tight); build order amended: straight-to-C allowed if RAM permits; (3) new idea from use: a **day-timeline view** to see free slots — good parts: pure offline *seeing*, serves triage directly, reduces to a clean generic shape (timed items on a timeline, no hard-coding risk); guarded: needs the calm treatment (day-grids are how calendar apps become walls) and depends on items having times → **build after AI sorting**, captured as a 🔵 shape in §0.2.
- **Session 13:** **Local AI confirmed, installed, and tested.** Machine checked (i9-14900KF / 32 GB RAM / **RTX 4070 SUPER 12 GB VRAM**) — strong, so the free-cloud on-ramp (Option B) was **skipped**; went straight to local (Option C). Learned the deciding number is **VRAM**, not RAM (the GPU does the thinking). **Ollama** installed; **`qwen3:14b`** pulled and chosen (best instruction-follower fitting 12 GB). **Live test passed:** it sorted "call dentist tuesday / learn guitar / bins tonight" into the right zones — but visibly *guessed* at "tuesday" because it has no clock. From that, the user correctly deduced the app must tell it the date. → **3 prompt rules locked (§0.3):** (1) feed date+time every message (no clock, no memory), (2) demand a fixed output shape / JSON not prose, (3) quiet the think-aloud. Also **clarified the multi-device reality (§0.3):** the AI runs on a GPU, not "on a drive" — share it by running on the strong desktop and phoning in over the socket, never by syncing the model in OneDrive.
- **Session 14:** 🎉 **MILESTONE — AI sorting wired in and PROVEN.** After a false start (app ran old by-hand code — tell was the button still saying "Add" not "Sort it"; fix was making the `.env` from `.env.example` + restart; also reassured the user the busy-looking `.env.example` was correct — only the two un-`#`'d lines are live). Once on: real dump *"message the recruiter today, messge vanke HR tomorrow, call mum on the 22nd"* → **3 clean items**, typo fixed, all dates correct (today→15 Jun via the date-injection rule working live), shown in a "look right?" confirm step with editable zone/date + a "your words:" trace. **Proof-of-magic (§3) achieved; core app complete.** Build-queue item "Looking back → own page" was shipped by Code (s12/13). **User then raised 3 v2 ideas** — honest mapping: (1) "full day laid out" = the **day-timeline view already parked** (§0.2), now unlocked; (2) "identify large tasks + how small tasks link" = **mostly already captured** by existing data shapes (goal-with-branches / multi-parent / milestoned goal) — the new part is a light **goal-and-parts VIEW** (§0.2), a nice sign the abstract shapes were right; (3) "see importance/urgency + move tasks around the planner" = **genuinely new** → added as a shape (§0.2) with a **hard guard**: surfacing what matters = yes; *auto-moving* the day = no — the app *suggests* a plan, the user accepts/tweaks (control pillar). All three deferred behind living-with-the-sorting first.
- **Session 15:** **Day-timeline view BUILT + AI time-extraction added.** The AI now also pulls a clock **time** from a dump ("dentist tuesday at 3pm" → 15:00; vague "tonight" stays timeless), threaded through the schema, prompt (with a worked example), the check-back (editable) and the zone rows. New **Today timeline** page (reached by a quiet link): today's timed items in order with the **gaps between them shown** ("~3 hours until the next thing"), a separate **"Anytime today"** list, and the ability to **give a floating task a time / change it / tick it done** right there — a calm ordered list, deliberately **NOT** a 24h grid; user-driven planning, nothing auto-moves. Built/verified server-side (time passes through, pages serve, timed+untimed items round-trip); on-screen rendering left for the user to confirm. **KEY real-use insight (the important bit):** offered the choice of next step (timeline vs goal-breakdown vs …), the user picked the timeline — but on using it said *"it's not at a level usable to live in. I can see the day's tasks… I could do that already. I need the next step."* This is **§0.1 proven in the wild**: the seeing-half — *even with effortless AI entry* — is still just a nicer paper planner; the missing value is the **support** (help deciding), not more **displaying**. → **Re-prioritised:** the **"help me decide" layer is the real next build** — **importance/urgency surfacing** (§0.2, now 🟡) first (the strongly-aligned "surface what matters, never auto-move" half), pointing deeper at **goal-breakdown (§6)** and **milestones (§9)** — the support paper can never give. The timeline stands as a genuinely better *seeing* (you can plan *in* it now), but it is not, on its own, the livability fix. **Design decisions for the triage build (s15, end of session):** (a) the "what matters now" output must be a **short, finishable shortlist sized to a limited daily energy budget** ("spoon theory") — small by default, never a ranked wall, never a depleting meter; (b) new guard **"name the load, not the person"** (§0) — describe the plan as oversized, never the user as incapable; (c) before surfacing, **prep the signals** — AI-proposed **importance** + free-form **tags** (context/grouping only; not hard-coded; not the importance formula) + a **deadline-vs-set-time** flag, all AI-filled during the sort and user-adjustable. The over-reliance/"crutch" worry stays out of the code (§2.5); the app only avoids *feeding* it (tone guard + local-owned design). *(Source: a Claude reply about an oversized outreach plan + spoon theory — most of it reduced cleanly to existing shapes, a good generality check; it sharpened triage rather than adding a new shape.)*

---

*This tracker is the source of truth. Keep the latest version saved; upload it into a new chat (or into Claude Code) to continue from where we left off.*

---

## ▶ NEXT SESSION — start here

**Where things stand (after s15):** core loop done (capture → local AI sort → confirm → calm zones), trustworthy owned storage, one-double-click launch, **"Looking back"** and **"Today timeline"** each on their own page, the AI now extracts **dates *and* times**, all offline/owned. Data in `data/organiser-data.json`.

**The live signal (s15) 🔒 — read this first:** *seeing* the day — even a nicely laid-out timeline — **is not enough to live in.** The user said it plainly: "I can see the day's tasks… I could do that already. I need the next step." Per §0.1, the next step is the app **helping decide** — the *support* a paper planner can't give. **Build support next, not more views.**

**Recommended next build → the "what matters now" layer (triage; §0.2, §0 need #1).** Two small steps:
  1. **Prep the signals first (s15 plan):** have the AI also output — and the app store — an **importance** level (matters a lot / normal / minor; AI-proposed, user-adjustable), free-form **tags** (labels for *context + grouping* — NEVER hard-coded meanings, NEVER "more tags = more important"; §0.2), and a **deadline vs set-time** flag (sharpens urgency; dates/times are already stored). All filled by the AI *during the sort* — no new fields to fill — and shown lightly in the zones so you start *seeing* important/urgent.
  2. **Then the surfacing:** the app *highlights* what matters and hands back a **short, finishable shortlist for today** — capacity-aware, small by default (§0 spoons), never a ranked wall, never a depleting meter. It **suggests**; you decide; **nothing auto-moves** (control pillar §0/§1).
- Honest note: importance is a judgment, not a fact — rough now, genuinely good once the app knows your **goals** (§6/§9).

**Then, the deepest support (the features paper fundamentally can't do — likely where "livable" really comes from for this user):**
- **Goal-breakdown (§6)** — hand back only the next 1–2 steps of a big thing.
- **Milestones + fillable progress bar (§9)** — repeatable "quest complete" on goals that never truly end.

**Still parked (🔵 — do NOT build yet):** goal-and-parts view (§0.2); evidence/CV compose (§0.2); dependency graph (§8, optional back-room only); voice input (🟡).

**To make the timeline earn its keep meanwhile:** dump things with times ("dentist tues 3pm"), or open the timeline and tap *set a time* on today's tasks — it fills out as items get times.
