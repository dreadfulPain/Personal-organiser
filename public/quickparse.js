// THE FRONT DOOR, WITHOUT A MODEL.
//
// Almost the whole app is plain code — the zones, the day plan, the levels, the
// exports, the reminders. The AI is only the way things get IN: "say it messily
// and it sorts itself". On a machine that can't run a model, that one promise
// is what breaks, and the app drops to "here's your sentence as a task title,
// fill the rest in yourself".
//
// But most of what anyone types is not messy at all. "call the dentist tuesday"
// or "email Wei about the trip by friday" is a small, regular grammar, and a
// regex reads it perfectly in no time at all. This handles that — so a laptop
// with no AI keeps most of the front door, and even a machine WITH one doesn't
// wait three seconds for something a pattern could answer instantly.
//
// TWO RULES, the same ones the AI half lives under:
//   - It never files anything. Everything it finds lands in the check-back for
//     you to glance at, exactly like a model's answer.
//   - It never invents. A person only comes from YOUR People list; a date only
//     from words that are actually in the text. What it can't see, it leaves
//     empty rather than guessing.
//
// No domain words: nothing here knows what a lesson or a student is.
//
// Plain script (works under file://), like everything else.

(function () {
  "use strict";

  const pad2 = (n) => String(n).padStart(2, "0");
  // ITS OWN, DELIBERATELY. dates.js is the layer that turns things into words
  // for a person; this file is the layer underneath, and every other module
  // stands on it. Depending upwards would mean the spine could not be run — or
  // tested — without the presentation on top of it, which is the wrong way up.
  // Checked as a pair by tests/onecopy.mjs so the two cannot drift apart.
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const plus = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return isoOf(d);
  };
  // The same, counted from a date rather than from today — "a week on Friday"
  // is seven days after the Friday, not seven days after now.
  const plusFrom = (iso, n) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  };

  const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const SHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 5 - 1, fri: 5, sat: 6 };
  const CN_DAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

  function nextWeekday(dow, forceNext) {
    const d = new Date();
    const delta = (dow - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (delta === 0 && !forceNext ? 0 : delta === 0 ? 7 : delta) + (forceNext && delta !== 0 ? 0 : 0));
    if (forceNext && delta === 0) d.setDate(d.getDate());
    return isoOf(d);
  }

  // Returns { date, time, matched } — matched is the exact text it read it off,
  // so the caller can strip it out of the title.
  function readWhen(text) {
    const t = " " + text.toLowerCase() + " ";
    let date = "";
    let matched = "";
    const take = (re, fn) => {
      if (date) return;
      const m = re.exec(t);
      if (!m) return;
      const got = fn(m);
      if (got) {
        date = got;
        matched = m[0].trim();
      }
    };

    // BEFORE the plain "today" and "tomorrow" below, which sit inside them —
    // take() keeps the first pattern that hits, so "a week today" was reading as
    // today and "a week tomorrow" as tomorrow.
    take(/\ba week (today|tomorrow)\b/, (m) => plus(m[1] === "tomorrow" ? 8 : 7));
    take(/\ba fortnight (today|tomorrow)\b/, (m) => plus(m[1] === "tomorrow" ? 15 : 14));
    take(/\b(today|tonight|this evening)\b|今天|今晚|今日/, () => plus(0));
    take(/\bday after tomorrow\b|后天|後天/, () => plus(2));
    take(/\b(tomorrow|tmrw|tmw)\b|明天|明日/, () => plus(1));
    take(/\byesterday\b|昨天/, () => plus(-1));
    // A WEEK FURTHER OUT THAN THE NEXT ONE. These come FIRST, because take()
    // keeps the first pattern that hits and every shorter phrase is sitting
    // inside these ones. "A week on Friday", asked on a Friday, was reading as
    // today; "hand the reports in a week on Friday" was reading the "in a week"
    // and stopping there, a week early.
    const DAY_RE = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|weds?|thur?s?|fri|sat";
    const dayNum = (w) => (DAYS[w] !== undefined ? DAYS[w] : SHORT[w]);
    take(new RegExp(`\\ba week (?:on|from)\\s+(${DAY_RE})\\b`), (m) => plusFrom(nextWeekday(dayNum(m[1])), 7));
    take(new RegExp(`\\ba fortnight (?:on|from)\\s+(${DAY_RE})\\b`), (m) => plusFrom(nextWeekday(dayNum(m[1])), 14));
    // "Friday week" is the same thing said the other way round.
    take(new RegExp(`\\b(${DAY_RE})\\s+week\\b`), (m) => plusFrom(nextWeekday(dayNum(m[1])), 7));
    take(/\bin a fortnight\b|\bin two weeks\b/, () => plus(14));
    // The last day of this month — "the reports are due end of the month".
    take(/\bend of (?:the )?month\b|月底/, () => {
      const n = new Date();
      const last = new Date(n.getFullYear(), n.getMonth() + 1, 0);
      return isoOf(last);
    });

    take(/\bin (\d+) days?\b/, (m) => plus(Math.min(365, +m[1])));
    take(/\bin (a|one|\d+) weeks?\b/, (m) => plus(7 * (m[1] === "a" || m[1] === "one" ? 1 : Math.min(52, +m[1]))));
    take(/\bnext week\b|下周|下週|下星期/, () => plus(7));
    take(/\bend of (the )?week\b/, () => nextWeekday(5));

    // "next friday" / "on friday" / "fri"
    take(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/, (m) => nextWeekday(DAYS[m[2]], !!m[1]));
    take(/\b(next\s+)?(sun|mon|tues?|weds?|thur?s?|fri|sat)\b/, (m) => {
      const d = SHORT[m[2]];
      return d === undefined ? "" : nextWeekday(d, !!m[1]);
    });
    take(/(下)?(周|週|星期)([一二三四五六日天])/, (m) => nextWeekday(CN_DAYS[m[3]], !!m[1]));
    take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => `${m[1]}-${m[2]}-${m[3]}`);
    take(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/, (m) => `${new Date().getFullYear()}-${pad2(+m[1])}-${pad2(+m[2])}`);
    // "14 sep" / "sep 14" / "14th september" / "the 10th OF september" / with a year.
    //
    // THE "of" IS NOT OPTIONAL DECORATION. "the 10th of September" is one of the
    // two ordinary ways to write a date in English and it was read as no date at
    // all — so a parents evening typed exactly as anyone would type it went in
    // with nothing against it and never appeared on a calendar.
    //
    // The year is taken when it's given, because filing next February's date
    // under this year puts it in the past, where the app then describes it as
    // something you are still waiting on.
    const MO = MONTHS.join("|");
    const yearOf = (y) => (y ? Number(y) : new Date().getFullYear());
    take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MO})[a-z]*\\.?(?:,?\\s+(\\d{4}))?\\b`), (m) => {
      const mo = MONTHS.indexOf(m[2]) + 1;
      return `${yearOf(m[3])}-${pad2(mo)}-${pad2(+m[1])}`;
    });
    // The (?!\d) is load-bearing: without it "March 2026" reads as the 20th of
    // March with 26 left over.
    take(new RegExp(`\\b(${MO})[a-z]*\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4}))?\\b`), (m) => {
      const mo = MONTHS.indexOf(m[1]) + 1;
      return `${yearOf(m[3])}-${pad2(mo)}-${pad2(+m[2])}`;
    });
    // Bare numbers: day-first, which is how it's written outside the US. Only
    // when it can't be anything else, so a wrong reading is rare and visible.
    // A DASH IS USUALLY A RANGE. "exercise 4-6" and "periods 1-3" are far more
    // common than a dashed date, so a bare "10-09" is deliberately not read —
    // guessing there would turn a page reference into a deadline. With a year
    // on the end there is nothing else it can be, so that one is taken.
    take(/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/, (m) => {
      const day = +m[1];
      const mo = +m[2];
      if (day > 31 || mo > 12) return "";
      const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return `${yr}-${pad2(mo)}-${pad2(day)}`;
    });
    take(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/, (m) => {
      const day = +m[1];
      const mo = +m[2];
      if (day > 31 || mo > 12) return "";
      const yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
      return `${yr}-${pad2(mo)}-${pad2(day)}`;
    });

    let time = "";
    const tm =
      /\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\b/.exec(t) ||
      /\b(?:at\s+)(\d{1,2})\s*(am|pm)\b/.exec(t) ||
      /\b(\d{1,2})\s*(am|pm)\b/.exec(t);
    if (tm) {
      let h = +tm[1];
      const mins = /^\d{2}$/.test(tm[2] || "") ? +tm[2] : 0;
      const ap = (tm[3] || tm[2] || "").toString();
      if (/pm/.test(ap) && h < 12) h += 12;
      if (/am/.test(ap) && h === 12) h = 0;
      if (h <= 23) time = `${pad2(h)}:${pad2(mins)}`;
    }
    return { date, time, matched, timeText: tm ? tm[0].trim() : "" };
  }

  // "after the parent meeting on friday", "not before monday" — the earliest
  // this could POSSIBLY be done, which is a different fact from when it's due.
  // Without it the app will happily plan you to write up a meeting three days
  // before the meeting happens.
  //
  // Deliberately narrow: the phrase has to be a real lead-in AND there has to be
  // a real date within reach of it. Getting this wrong only ever delays a job,
  // never hides a deadline — and a notBefore later than the deadline is treated
  // as a misread and ignored downstream.
  const LEADIN = /\b(?:after|once|not before|no earlier than|following)\s+|之后|以后|過後/i;
  function readNotBefore(text) {
    const s = String(text || "");
    // "THE DAY AFTER TOMORROW" IS THE NAME OF A DAY, not a thing you can only
    // start after. Read as a lead-in, the "after tomorrow" was cut out before
    // the date reader ever saw it, and the phrase came back with no date at all.
    // The idiom is "<a day word> after <a day word>" and nothing else looks
    // like it.
    if (/\b(?:the\s+)?day\s+after\s+(?:tomorrow|today)\b/i.test(s)) return { date: "", matched: "" };
    const m = LEADIN.exec(s);
    if (!m) return { date: "", matched: "" };
    // CJK lead-ins trail the date ("周五之后"); English ones lead it.
    const cjk = /之后|以后|過後/.test(m[0]);
    const from = cjk ? Math.max(0, m.index - 20) : m.index + m[0].length;
    const span = cjk ? s.slice(from, m.index) : s.slice(from, from + 40);
    const w = readWhen(span);
    if (!w.date) return { date: "", matched: "" };
    // Take the WHOLE phrase, not just the lead-in plus the date. "after the
    // parent meeting on friday" has to come out in one piece, or that friday is
    // still sitting there for the date reader to pick up as the deadline.
    const rel = span.indexOf(w.matched);
    const matched = cjk
      ? s.slice(rel >= 0 ? from + rel : from, m.index + m[0].length)
      : s.slice(m.index, from + (rel >= 0 ? rel + w.matched.length : 0));
    return { date: w.date, matched: matched.trim() };
  }

  // Only ever people you already have. It cannot invent a colleague, which is
  // the whole reason this is safe to run without anyone checking a model.
  // A doing word pointed straight at somebody — the thing you do TO a person,
  // as opposed to a name that merely turns up in a sentence.
  const TO_A_PERSON =
    /\b(email|e-?mail|call|ring|phone|message|text|ask|tell|remind|chase|thank|invite|see|meet|pay|send|write to|reply to|respond to|get back to|speak to|talk to)\s+(?:to\s+|up\s+)?$/i;
  // The same idea where the script has no spaces to hang it on.
  const TO_A_PERSON_CJK = /给|找|联系|聯繫|告诉|告訴|问|問|提醒|回复|回覆|通知|发给|發給|打给|打給/;

  function readPeople(text, contacts) {
    const out = { person: "", waitingOn: "", directed: false };
    const N = window.OrganiserNames;
    if (!N || !Array.isArray(contacts) || !contacts.length) return out;
    // Ordinary words that turn up inside names ("Dave THE plumber") and would
    // otherwise match half the roster.
    const SKIP = new Set(
      ("the a an and or of for to at in on by with about from is was be do did get got put "
        + "my me you your it this that then them they we us our new old all any some not no yes")
        .split(" ")
    );
    const words = String(text)
      .split(/[^\p{L}\p{N}一-鿿]+/u)
      .filter((w) => w.length > 1 && !SKIP.has(w.toLowerCase()));
    // Try two-word runs first, so "Helen Zhou" beats "Helen".
    const tries = [];
    for (let i = 0; i < words.length; i++) {
      if (words[i + 1]) tries.push(words[i] + " " + words[i + 1]);
      tries.push(words[i]);
    }
    for (const t of tries) {
      const found = N.look(t, contacts);
      if (found.state !== "matched") continue;
      // It must be who they're CALLED, not a word buried in their name.
      const whole = N.norm(found.contact.name);
      const asked = N.norm(t);
      // Chinese has no spaces, so "给王伟发消息" arrives as one token and the
      // name sits inside it. For those scripts containment IS the match — the
      // guard above exists to stop English middle-words, not this.
      const unspaced = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(asked);
      const inside = unspaced && asked.replace(/\s/g, "").includes(whole.replace(/\s/g, ""));
      if (whole === asked || whole.startsWith(asked + " ") || inside || (N.formsOf(found.contact) || []).some((f) => N.norm(f) === asked)) {
        out.person = found.contact.name;
        // WAS THE SENTENCE AIMED AT THEM, or were they merely in it?
        //
        // "email Helen about the trip" is something you owe Helen. "Li Wei
        // struggled with negative numbers today" is something you noticed about
        // Li Wei, and naming a student is the single most ordinary thing a
        // teacher types. Both used to come back wearing "promised to" — one of
        // them a commitment nobody made, sorted up the list for it.
        const at = String(text).toLowerCase().indexOf(t.toLowerCase());
        // Chinese has no spaces, so there is no gap in front of the name to
        // look at — the marker for "this is aimed at somebody" is a word like
        // 给 or 联系 sitting anywhere in the sentence instead.
        out.directed = unspaced
          ? TO_A_PERSON_CJK.test(String(text))
          : at > 0 && TO_A_PERSON.test(String(text).slice(0, at));
        break;
      }
    }
    // "waiting for X" / "waiting to hear from X" / "chasing X"
    const w = /(?:waiting (?:for|on)|waiting to hear (?:back )?from|chasing|chased|asked)\s+(.+)/i.exec(text);
    if (w) {
      const rest = w[1].trim().split(/\s+/);
      const clean = (x) => (x || "").replace(/[,.;:!?'"]+$/, "");
      let who = clean(rest[0]);
      // A second word only if it's genuinely a name — capitalised, or CJK.
      if (rest[1] && /^[A-Z\u4e00-\u9fff]/.test(rest[1])) who += " " + clean(rest[1]);
      const found = N.look(who, contacts);
      out.waitingOn = found.state === "matched" ? found.contact.name : /^[A-Z一-鿿]/.test(who) ? who : "";
    } else if (out.person && /\bwaiting\b|\bno (?:reply|answer|response)\b|hasn't (?:replied|got back)/i.test(text)) {
      out.waitingOn = out.person;
    }
    return out;
  }

  // The Chinese words sit OUTSIDE the \b(...)\b group on purpose. \b is an ASCII
  // word boundary: it needs a letter/digit on one side, so it never matches next
  // to 重/紧/急 and every Chinese urgency word here silently read as "normal".
  // Same shape as the date patterns above — English inside the boundaries, CJK
  // as plain alternatives.
  const HIGH = /\b(urgent|urgently|asap|important|critical|priority|must|deadline)\b|重要|紧急|急/i;
  const LOW = /\b(sometime|someday|whenever|no rush|if i (?:get|have) time|eventually|low priority)\b/i;
  // "SOMEDAY" IS NOT "TODAY". Narrower than LOW on purpose — "low priority" is
  // about how much it matters, this is about when, and they are different
  // questions. Something you told the app today is for today unless you said
  // otherwise, and this is how you say otherwise.
  const SOMEDAY = /\b(sometime|some ?day|one day|whenever|no rush|eventually|at some point|when i (?:get|have) (?:a )?(?:time|chance|minute)|if i (?:get|have) time)\b|有空|以后再说/i;
  const HARD = /\b(deadline|due|must be|has to be|no later than|by end of|cut off|cutoff)\b/i;
  // Somebody actually said they would. Ordinary English for having given your
  // word — not merely for having mentioned a person.
  const PROMISE =
    /\b(promis\w+|i said i|said i(?:'?d| would| will)|told (?:\w+ ){1,3}i|owe \w+|get back to|come back to|report back|let (?:\w+ ){1,3}know)\b|答应|说好/i;
  // AN ARRANGEMENT, rather than work with a date on it.
  //
  // The words come from YOUR list — scheduleConfig.fixedWords, handed in on the
  // context — because there is no fixed set of them. This was four words baked
  // into the code, so a lesson observation, a parents evening and a duty were
  // all read as work to be done early. The four are still the fallback for
  // anything that hasn't got a config to hand.
  //
  // "meet the deadline" is not an arrangement, and it says so itself: HARD
  // matches it, and a sentence about a deadline is about a deadline.
  const ARRANGE_FALLBACK = ["meet", "meets", "meeting", "appointment", "interview"];
  function saysArranged(text, words) {
    // AN EMPTY LIST IS A REAL ANSWER. It means "read nothing as fixed, I will
    // say so myself", and the config keeps it for exactly that reason — so it
    // must not quietly become the fallback here. Only the absence of a list at
    // all (a caller with no config to hand) falls back.
    const list = Array.isArray(words) ? words : ARRANGE_FALLBACK;
    const hay = " " + String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ") + " ";
    return list.some((w) => {
      const t = String(w || "").trim().toLowerCase();
      if (!t) return false;
      // A phrase is looked for as a phrase; a single word only as a whole word,
      // so "meet" never matches inside "meeting the standard".
      return hay.includes(" " + t + " ");
    });
  }
  const QUICK = /\b(quick|quickly|just|briefly|two minutes|5 ?min)\b/i;
  const BIG = /\b(whole|all of|write up|draft|plan out|big|entire|redo)\b/i;

  // ---- the throat-clearing at the front --------------------------------------
  //
  // "I need to sign into 365" is a task called "sign into 365". The first three
  // words are how a person starts a sentence, not part of the job, and a list
  // where every line begins "I need to" is four words of nothing before the
  // thing you're looking for — on every row, every time you scan it.
  //
  // Only ever taken off the FRONT, and only when something is left. Not
  // language the app knows about: a phrase that means "what follows is the
  // thing", which is as true of a shopping list as of a lesson.
  const LEAD_IN =
    /^\s*(?:i\s+(?:need|have|want|ought|forgot|must|should|will|shall)\s+to|i\s+must|i\s+should|remember\s+to|don'?t\s+forget\s+to|note\s+to\s+self:?|todo:?|to\s?do:?|task:?|make\s+sure\s+(?:to|i)|need\s+to|got\s+to|gotta|please)\s+/i;

  function dropLeadIn(s) {
    let out = String(s || "");
    // Twice at most: "todo: I need to …" is a real thing people write.
    for (let i = 0; i < 2; i++) {
      const cut = out.replace(LEAD_IN, "");
      if (cut === out || !cut.trim()) break;
      out = cut;
    }
    return out.trim() || String(s || "").trim();
  }

  // ---- one line that is plainly two jobs -------------------------------------
  //
  // "finish updating my laptop and sign into 365" is two things. Kept as one it
  // gets ticked off when half of it is done, which is worse than useless — it
  // is a job you now believe is finished.
  //
  // THE WHOLE DIFFICULTY IS "and". It joins jobs ("update the laptop and sign
  // in") and it joins nouns ("can it handle the app and ai"), and getting that
  // wrong in the second direction turns one task into two nonsense ones. So a
  // split happens only when what comes after the join STARTS WITH A DOING WORD.
  //
  // That list is language, not subject matter — the same standing as the day
  // names and month names elsewhere in here. Nothing in it knows what the job
  // is about, and a plumber's week splits exactly as well as a teacher's.
  const DOING = new RegExp(
    "^(?:" + [
      "add", "ask", "book", "bring", "buy", "call", "cancel", "change", "chase", "check",
      "clean", "clear", "collect", "confirm", "contact", "copy", "do", "download", "draft",
      "email", "finish", "fill", "find", "fix", "get", "give", "go", "hand", "install",
      "join", "learn", "let", "look", "mail", "make", "mark", "meet", "message", "move",
      "order", "organise", "organize", "pack", "pay", "phone", "pick", "plan", "post",
      "prepare", "print", "put", "read", "register", "remind", "renew", "reply", "report",
      "return", "review", "ring", "run", "send", "set", "share", "sign", "sort", "speak",
      "start", "submit", "sync", "take", "talk", "tell", "text", "tidy", "update",
      "upload", "visit", "wash", "watch", "write",
    ].join("|") + ")\\b",
    "i"
  );

  // Where a line could break: a comma, a semicolon, "and", "then", "&".
  const JOIN = /\s*(?:,\s*(?:and\s+|then\s+)?|;\s*|\s+and\s+|\s+then\s+|\s*&\s+)/gi;

  // Does this start with a doing word? Used by anything that has to tell an
  // instruction from a description — "bring your passport" from "Health Check".
  const startsWithDoing = (s) => DOING.test(dropLeadIn(String(s || "").trim()));

  // One line → the jobs in it. Almost always one.
  function pieces(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const out = [];
    let last = 0;
    let m;
    JOIN.lastIndex = 0;
    while ((m = JOIN.exec(raw))) {
      const after = raw.slice(m.index + m[0].length);
      const before = raw.slice(last, m.index).trim();
      // Both halves have to look like jobs. A tail that starts with a doing
      // word, and a head long enough to be one — "go and get it" is one job
      // said in the ordinary way, not two.
      if (DOING.test(dropLeadIn(after)) && before.split(/\s+/).length >= 3 &&
          after.split(/\s+/).length >= 2) {
        out.push(before);
        last = m.index + m[0].length;
      }
    }
    if (!out.length) return [raw];
    out.push(raw.slice(last).trim());
    return out.filter(Boolean);
  }

  // Words that cannot be the last thing in a sentence. If taking the date out
  // would leave the line ending on one of these, the date was load-bearing and
  // the line is left exactly as it was typed.
  const DANGLES = /\b(till|until|on|by|before|after|from|to|at|in|of|for|and|but|or|with|the|a|an|is|are|was|were|be|than|then|that|this|its|it's)$/i;

  // Take `phrase` out of `text` — but only when it sits at one end and what is
  // left still reads as something. Anywhere else, or anything less, and the
  // line comes back untouched.
  function cutIfClean(text, phrase, leaders) {
    const esc = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "due THE 25th of September" — the article sits between the word that
    // introduces the date and the date itself, and leaving it behind gives you
    // "write the mid-term reports, due the".
    const lead = `(?:\\b(?:${leaders})\\s+)?(?:the\\s+)?`;
    const tail = new RegExp(`\\s*${lead}${esc}\\s*$`, "i");
    if (tail.test(text)) {
      const left = text.replace(tail, "").replace(/[\s,;:-]+$/, "").trim();
      if (left && !DANGLES.test(left)) return left;
      return text;
    }
    const head = new RegExp(`^\\s*${lead}${esc}\\s*[,:：-]?\\s*`, "i");
    if (head.test(text)) {
      const left = text.replace(head, "").trim();
      if (left) return left;
    }
    return text;
  }

  // One line of plain text → the same shape the AI half returns, so both roads
  // into the app produce the identical thing and the check-back can't tell them
  // apart. Fields it can't see are left empty; nothing is ever guessed.
  function parse(text, ctx) {
    const raw = String(text || "").trim();
    const contacts = (ctx && ctx.contacts) || [];
    // Read "after friday" FIRST and take it out of the way, or the date reader
    // grabs that friday as the deadline — the exact opposite of what was meant.
    const not = readNotBefore(raw);
    const forWhen = not.matched ? raw.replace(not.matched, " ") : raw;
    const when = readWhen(forWhen);
    const who = readPeople(raw, contacts);

    // Take the time phrase out of the title — "call the dentist on tuesday"
    // should become "call the dentist", not repeat itself.
    //
    // BUT ONLY WHERE IT LEAVES A SENTENCE BEHIND. This used to cut the phrase
    // out wherever it sat, which is the very thing the "urgent" rule below
    // refuses to do: "meet my mentor sarah thursday morning" came back as "meet
    // my mentor sarah morning", and "the kids dont start till sept 1st" as "the
    // kids dont start till". Words you typed, changed into something you
    // didn't, on the one screen that asks you to confirm it read you right.
    let title = raw;
    if (when.timeText) title = cutIfClean(title, when.timeText, "at|from|by|around|about");
    // "till" and "until" are deliberately NOT lead-ins here. "start till sept
    // 1st" would otherwise be cut as one phrase, leaving "the kids dont start"
    // — which reads fine and means the opposite of what was written.
    // "deadline" and "due" only introduce a date — take the date and leave them
    // behind and you get "fill in the risk assessment for the trip, deadline".
    if (when.matched) title = cutIfClean(title, when.matched, "on|by|before|for|due|deadline|deadline is|due date");
    // "urgent: send the form" — the "urgent" has already been READ, into
    // importance. Leaving it in the title says it twice, and the title is what
    // follows the task into every reminder, every export, every printed list.
    // Only a PREFIX label goes: "this one is urgent" is a sentence you wrote,
    // and cutting a word out of the middle of it would leave nonsense.
    // A colon is unambiguous, so no space is needed after it — Chinese doesn't
    // put one. A dash does need one, or "re-do the display" loses its "re".
    const label = /^\s*(\p{L}+)\s*(?:[:：]\s*|[-–—]\s+)/u.exec(title);
    if (label && (HIGH.test(label[1]) || LOW.test(label[1])) && title.slice(label[0].length).trim()) {
      title = title.slice(label[0].length).trim();
    }

    // "I need to" is not part of the job. Everything else is left exactly as you
    // typed it — including the capital letter you didn't use. Tidying that would
    // be the app editing your words, and the promise here is the opposite one:
    // if it found nothing to read, you get your sentence back untouched.
    title = dropLeadIn(title);
    title = title.replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
    if (!title) title = raw;

    return {
      // NOT CUT. This used to be title.slice(0, 160) — three lines under a
      // comment promising your sentence back untouched, which it then cut off
      // mid-word with nothing to show that it had. Long is a display problem,
      // and a display problem is not solved by deleting what somebody wrote.
      title,
      // A meeting happens AT its time; a task is finished BEFORE one. The
      // difference decides whether the planner may move it earlier, so it is
      // read here and shown in the check-back as "Event" — where you can see
      // it and change it before anything is kept.
      type:
        saysArranged(raw, ctx && ctx.fixedWords) && !HARD.test(raw) && (when.date || when.time)
          ? "appointment"
          : "task",
      date: when.date,
      // Earliest it could happen. Never later than the deadline — if reading it
      // produced a contradiction, the reading was wrong, so it's dropped.
      notBefore: not.date && !(when.date && not.date > when.date) ? not.date : "",
      time: when.time,
      deadlineType: HARD.test(raw) && when.date ? "hard" : "soft",
      importance: HIGH.test(raw) ? "high" : LOW.test(raw) ? "low" : "normal",
      effort: QUICK.test(raw) ? "quick" : BIG.test(raw) ? "draining" : "medium",
      tags: [],
      whenText: when.matched || "",
      goalId: "",
      standardId: "",
      openLoop: false,
      // A NAME IN A SENTENCE IS NOT A PROMISE. Any mention of somebody on your
      // list used to become "promised to" them — so "Li Wei struggled with
      // negative numbers today" came back as a job you owed Li Wei, wearing a
      // chip saying so and sorted up the list for it. Naming a student is the
      // single most ordinary thing a teacher types.
      //
      // A promise needs somebody to have made one.
      promisedTo: who.waitingOn ? "" : PROMISE.test(raw) || who.directed ? who.person : "",
      waitingOn: who.waitingOn,
      remindAt: "",
      remindedAt: null,
      // DID YOU SAY IT COULD WAIT? Only ever set from your own words. What the
      // app does with a task that has no date at all is decided where the task
      // is filed, not here — this half never invents a date, it only reports
      // whether you said one and whether you said it wasn't urgent.
      someday: SOMEDAY.test(raw),
      // Says plainly where this came from, so the check-back can be honest
      // about how much thought went into it.
      by: "patterns",
    };
  }

  // Did it actually find anything, or is this just the raw sentence back? Used
  // to word the check-back honestly rather than implying it understood.
  function foundAnything(item) {
    return !!(item.date || item.time || item.promisedTo || item.waitingOn || item.importance !== "normal");
  }

  // EVERY JOB IN ONE LINE, each read the same way a single one would be.
  //
  // The date is read from the WHOLE line before it is cut up, then given to
  // every piece — "update the laptop and sign into 365 by friday" has one
  // Friday in it and both halves are due then. Read per-piece, the first half
  // would have no date at all.
  function parseAll(text, ctx) {
    const raw = String(text || "").trim();
    // A LINE BREAK IS A NEW THOUGHT.
    //
    // This only ever split a line on "and" / "then", so six things typed on six
    // lines came back as one item with newlines inside it. It looked fine while
    // the server was running, because the server's splitter was doing the work
    // — which meant the front door of the app quietly stopped working the
    // moment you opened the page by double-clicking it, the one mode this file
    // exists to support.
    //
    // Done by RECURSION on purpose: everything below inherits a date from the
    // whole text, which is right for "call the dentist and book the flights on
    // tuesday" and wrong across a line break. Line two implies nothing about
    // line one, so each line is parsed as if it were all you typed.
    const lines = raw.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines.flatMap((l) => parseAll(l, ctx));
    const parts = pieces(raw);
    if (parts.length <= 1) return [parse(raw, ctx)];
    const whole = parse(raw, ctx);
    return parts.map((p) => {
      const one = parse(p, ctx);
      return {
        ...one,
        date: one.date || whole.date,
        time: one.time || whole.time,
        notBefore: one.notBefore || whole.notBefore,
        deadlineType: one.date ? one.deadlineType : whole.deadlineType,
        importance: one.importance !== "normal" ? one.importance : whole.importance,
        promisedTo: one.promisedTo || whole.promisedTo,
        waitingOn: one.waitingOn || whole.waitingOn,
        // What it was cut out of, so the check-back can show you the sentence
        // you actually typed next to what it made of it.
        sourceText: raw,
      };
    });
  }

  window.OrganiserQuickParse = {
    parse, parseAll, pieces, dropLeadIn, startsWithDoing, readWhen, readPeople, foundAnything,
  };
})();
