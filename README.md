# Personal Organiser

A calm, neurodivergent-friendly organiser. You dump messy, misspelled,
unstructured thoughts at it; it understands them, sorts them into the right
places, and shows you your life in a way that feels manageable.

> Say it messily → it understands → it organises → you feel oriented.

This is the **first build**: the one loop that proves the idea works.

---

## What it does right now

1. **The dump** — one box. Type anything, however it comes out. Spelling
   doesn't matter, and you never have to say what *kind* of thing it is.
2. **The understanding** — Claude reads your messy line, splits it into separate
   items, fixes spelling silently, works out whether each is a task / event /
   reminder / note, and turns vague time words ("tuesday", "soon") into real
   dates.
3. **The check-back** — it shows you what it understood so you can glance, fix a
   word or a date, remove anything wrong, and confirm — before anything is filed.
4. **The view** — your items live in three calm zones: **Today**, **Coming up**,
   and **Someday**. Big text, generous spacing — glance and feel oriented.
5. **Completing things** — tick something off and it's **gone** from the active
   view (clean slate), but kept in a quiet **Looking back** list — a mirror, not
   a scoreboard.

### The two halves

The app is split exactly along the line that matters:

- **Seeing** (the zones, ticking off, all your data) is **fully offline**. It
  reads from your browser and never pauses — internet down doesn't stop you
  looking at your life or ticking things off.
- **Putting in** (understanding a messy dump) is the one **online** step. If
  you're offline or no key is set, your dump is **saved to sort later** instead
  of being lost.

---

## Running it

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
# 1. install dependencies
npm install

# 2. add your Anthropic API key
cp .env.example .env
#    then open .env and paste your key (get one at https://console.anthropic.com/)

# 3. start it
npm start
```

Then open **http://localhost:3000**.

You can open and use the app (see your zones, tick things off) without a key —
you just can't sort new dumps until a key is set.

---

## Notes & limits (on purpose, for now)

- **Your data lives in this browser.** It's stored locally on this computer.
  Clearing your browser data would clear it. Proper saving/syncing is a later
  step.
- **Typing only** for now (voice is next).
- Deliberately **not** in this build yet: editing filed items, recurring items,
  reminders/notifications, search, the "insights" mirror, and goal-breakdown
  (taking a big goal and handing back just the first step) — that last one is
  the next big feature.

## Changing the model

The understanding is done by Claude. The model is set in one place near the top
of `server.js` (the `MODEL` constant). It defaults to the most capable model for
the best understanding of messy input; switch it to a smaller model id there if
you'd prefer faster, cheaper sorting.
