// WHICH PARTS OF YOUR LIFE A PIECE OF WORK BELONGS TO.
//
// MORE THAN ONE AT A TIME. A training session at school is work AND it makes
// you better at the job — it is genuinely both, and forcing a choice would make
// the answer wrong whichever way you picked. So a piece of work carries a LIST
// of areas, never one. That single fact is most of the design.
//
// HOW IT WORKS OUT WHICH, in the order it tries — cheapest and most certain
// first, guessing last:
//
//   1. WHAT IT CAME FROM. Work made from a goal takes the goal's areas; work
//      owed to a block on your timetable takes the block's. Label a goal
//      "professional" once and every step of it is professional, for ever,
//      with nothing to remember. This is by far the best answer and it's free.
//   2. WORDS YOU'VE TAUGHT IT. Each area keeps a handful of hints. If a hint
//      turns up in what you wrote, that area is suggested.
//   3. NOTHING. If neither of those says anything, it stays unlabelled and the
//      app says so. An unlabelled job is honest; a wrongly labelled one quietly
//      poisons the only measurement that can tell a chosen Sunday from a habit.
//
// AND IT LEARNS. Correct a label and the distinctive words of that job join
// that area's hints, so the next one like it lands right. Same shape as the way
// names.js learns a spelling: the app gets better because you used it, not
// because someone sat down and configured it.
//
// §0.2 HOLDS ABSOLUTELY HERE, and this is the file where it's most tempting to
// break it. There is no list of school words in this code. There is no "work",
// no "personal", no "professional". Those are names YOU give, with hints YOU
// (or a model, or the learning) supply. Point it at a plumber's week and it
// works identically — which is the test that it isn't secretly hard-coded.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  const MAX_HINTS = 40;

  function normaliseArea(a) {
    if (!a || typeof a !== "object") return null;
    const name = String(a.name || "").trim().slice(0, 40);
    if (!name) return null;
    const hints = (Array.isArray(a.hints) ? a.hints : [])
      .map((h) => String(h || "").trim().toLowerCase())
      .filter((h) => h.length > 2)
      .slice(0, MAX_HINTS);
    return { id: a.id || name.toLowerCase(), name, hints: [...new Set(hints)] };
  }
  function normalise(list) {
    return (Array.isArray(list) ? list : []).map(normaliseArea).filter(Boolean);
  }

  // An item's areas, whatever shape they were saved in. `area` was a single
  // string before it was obvious that one is never enough.
  function on(item) {
    if (!item) return [];
    const list = Array.isArray(item.areas) ? item.areas : item.area ? [item.area] : [];
    return [...new Set(list.map((x) => String(x || "").trim()).filter(Boolean))];
  }

  // Words worth remembering out of a line of text: long enough to mean
  // something, and not the glue that every sentence has.
  const GLUE = new Set(
    ("the a an and or of for to at in on by with about from is was be do did get got put this that "
      + "my me you your it them they we us our new old all any some not no yes into out up down off "
      + "will would can could should have has had make made take took give gave").split(" ")
  );
  function wordsOf(text) {
    return [...new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}一-鿿]+/u)
        .filter((w) => w.length > 2 && !GLUE.has(w))
    )];
  }

  // ---- 1. inherited -------------------------------------------------------
  // What a piece of work came from is a far better signal than anything in its
  // wording, and it costs nothing to ask.
  function inherited(item, ctx) {
    const c = ctx || {};
    const out = [];
    if (item && item.goalId && typeof c.goalAreas === "function") {
      (c.goalAreas(item.goalId) || []).forEach((a) => out.push(a));
    }
    if (item && item.blockId && typeof c.blockAreas === "function") {
      (c.blockAreas(item.blockId) || []).forEach((a) => out.push(a));
    }
    return [...new Set(out.map((x) => String(x || "").trim()).filter(Boolean))];
  }

  // ---- 2. suggested from hints -------------------------------------------
  function fromHints(text, areas) {
    const words = new Set(wordsOf(text));
    const hay = " " + String(text || "").toLowerCase() + " ";
    return normalise(areas)
      .filter((a) =>
        a.hints.some((h) =>
          // A multi-word hint has to appear as a phrase; a single word has to be
          // a whole word, so "art" doesn't match "start".
          h.includes(" ") ? hay.includes(" " + h + " ") || hay.includes(" " + h) : words.has(h)
        )
      )
      .map((a) => a.id);
  }

  // THE ANSWER, with where it came from — because "why is this labelled work?"
  // has to be answerable, or the labels are just decoration.
  function suggest(item, areas, ctx) {
    const inh = inherited(item, ctx);
    if (inh.length) return { areas: inh, from: "what it came from" };
    const hinted = fromHints(
      [item && item.title, item && item.whenText].filter(Boolean).join(" "),
      areas
    );
    if (hinted.length) return { areas: hinted, from: "words you've taught it" };
    return { areas: [], from: "" };
  }

  // Already labelled by hand? Then that's the answer and nothing overrides it.
  function areasFor(item, areas, ctx) {
    const own = on(item);
    if (own.length) return { areas: own, from: "you said so" };
    return suggest(item, areas, ctx);
  }

  // ---- 3. and it learns ---------------------------------------------------
  // Correcting a label teaches the words. Deliberately conservative: only words
  // that aren't already hints for a DIFFERENT area, because a word that means
  // two things is a word that will keep getting it wrong.
  function learn(areas, areaId, text) {
    const list = normalise(areas);
    const target = list.find((a) => a.id === areaId);
    if (!target) return list;
    const taken = new Set(list.filter((a) => a.id !== areaId).flatMap((a) => a.hints));
    const fresh = wordsOf(text).filter((w) => !taken.has(w) && !target.hints.includes(w));
    target.hints = [...target.hints, ...fresh].slice(-MAX_HINTS);
    return list;
  }

  // When you correct a label, the word that got it WRONG should stop suggesting
  // that area — otherwise the same mistake repeats for ever.
  function unlearn(areas, areaId, text) {
    const list = normalise(areas);
    const target = list.find((a) => a.id === areaId);
    if (!target) return list;
    const bad = new Set(wordsOf(text));
    target.hints = target.hints.filter((h) => !bad.has(h));
    return list;
  }

  // Plain words for what it did, so a wrong label is easy to spot and correct.
  function words(result, areas) {
    const list = normalise(areas);
    const names = (result.areas || [])
      .map((id) => (list.find((a) => a.id === id) || {}).name || id)
      .filter(Boolean);
    if (!names.length) return "not labelled — say which part of your life this belongs to and it'll learn";
    const joined = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    return result.from ? `${joined} — ${result.from}` : joined;
  }

  window.OrganiserAreas = {
    normalise, normaliseArea, on, wordsOf, inherited, fromHints, suggest, areasFor, learn, unlearn, words,
  };
})();
