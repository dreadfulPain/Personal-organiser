// NAMES → PEOPLE. A person's name is a fact you can check by looking, so this
// is code, not a model call (§ the grounding rule: only ask a model when the
// question is about meaning).
//
// Three answers, and the difference between them is the whole point:
//
//   MATCHED   — "Helen" is already in People. Link it, silently. Nothing to ask.
//   NEARLY    — People has "Helena" and the note said "Helen". THAT is worth
//               asking about, because a one-letter slip files work against the
//               wrong person and neither of you ever finds out.
//   NEW       — nobody like that. Offer to add them; never add them silently,
//               because a typo would quietly become a permanent contact.
//
// It never decides. It hands you the question with the answer pre-filled.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Titles people actually type in front of a name. Stripped so "Dr Patel"
  // finds "Patel" — a school runs on Mr/Ms/Dr, and the name underneath is the
  // same person. Purely linguistic, not domain vocabulary.
  const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof|professor|sir|madam|madame|mme|herr|frau|señor|senor|señora|senora)\.?\s+/i;

  const norm = (s) =>
    String(s || "")
      // Accent-folding: "José" and "Jose" are one person spelled two ways, and
      // in an international school they will be spelled both ways.
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(TITLES, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  // ---- PINYIN ↔ CHARACTERS -------------------------------------------------
  //
  // The same person gets written "Wang Wei", "wangwei" and "王伟" depending on
  // who's typing and which keyboard is to hand. Converting between the two
  // properly needs a table of thousands of characters, which is a dependency in
  // all but name — so this does something smaller and more honest.
  //
  // A starter table of the commonest SURNAMES, used only to raise the question:
  // "you wrote Wang — did you mean 王伟?" It never matches silently across
  // scripts, because that is a guess about someone's identity. You confirm once,
  // and the spelling you used is remembered on that contact — so from then on
  // it's instant, and the app has learned YOUR people rather than pretending to
  // know Chinese. Anything the table misses, you teach it the same way.
  const SURNAMES = {
    wang: "王汪", li: "李黎", zhang: "张張章", liu: "刘劉", chen: "陈陳", yang: "杨楊",
    huang: "黄黃", zhao: "赵趙", wu: "吴吳伍", zhou: "周", xu: "徐许許", sun: "孙孫",
    ma: "马馬", zhu: "朱", hu: "胡", guo: "郭", he: "何", gao: "高", lin: "林",
    luo: "罗羅", zheng: "郑鄭", liang: "梁", xie: "谢謝", song: "宋", tang: "唐",
    deng: "邓鄧", han: "韩韓", feng: "冯馮", cao: "曹", peng: "彭", zeng: "曾",
    xiao: "萧蕭肖", tian: "田", dong: "董", yuan: "袁", pan: "潘", yu: "于余俞虞郁",
    jiang: "蒋蔣姜江", cai: "蔡", du: "杜", ye: "叶葉", cheng: "程", su: "苏蘇",
    wei: "魏韦韋卫衛", lv: "吕呂", lu: "卢盧陆陸鲁魯", ding: "丁", ren: "任",
    yao: "姚", shen: "沈", zhong: "钟鐘", cui: "崔", tan: "谭譚", fan: "范",
    liao: "廖", shi: "石史施", jin: "金", fu: "傅付", fang: "方", bai: "白",
    zou: "邹鄒", meng: "孟", xiong: "熊", qin: "秦", qiu: "邱丘", hou: "侯",
    jia: "贾賈", xue: "薛", yan: "阎閻严嚴颜顏晏", lei: "雷", long: "龙龍",
    duan: "段", hao: "郝", kong: "孔", mao: "毛", shao: "邵", wan: "万萬",
    qian: "钱錢", gu: "顾顧谷", hong: "洪", gong: "龚龔", kang: "康", yin: "尹",
    ceng: "曾", chang: "常", ji: "季纪紀", lai: "赖賴", ni: "倪", ou: "欧歐",
    pang: "庞龐", qi: "戚齐齊", rong: "荣榮", tong: "童", xiang: "向项項",
    yu2: "喻", zhan: "詹", zhuang: "庄莊", nie: "聂聶", mo: "莫", zhai: "翟",
  };
  // Latin letters only, so "wang wei" and "WangWei" both reduce to "wangwei".
  const asLatin = (s) => norm(s).replace(/[^a-z]/g, "");
  // Does a Latin spelling plausibly name this CJK person? True only if the
  // FIRST syllable is a known surname whose characters include their first
  // character — deliberately weak evidence, only ever used to ask.
  function pinyinCouldBe(latin, cjk) {
    const l = asLatin(latin);
    const chars = tight(cjk);
    if (!l || !chars || !UNSPACED.test(chars)) return false;
    for (const [py, set] of Object.entries(SURNAMES)) {
      const key = py.replace(/\d$/, "");
      if (!l.startsWith(key)) continue;
      if (set.includes(chars[0])) return true;
    }
    return false;
  }

  // Every way a contact is written: their name plus any spellings you've taught
  // it. This is what makes pinyin work in the end — not a table, but the app
  // remembering how YOU write each person.
  function formsOf(c) {
    const extra = Array.isArray(c && c.aka) ? c.aka : [];
    return [c && c.name, ...extra].filter(Boolean);
  }

  // Chinese and Japanese names are written without spaces, so the same name
  // typed "王 伟" and "王伟" must not read as two people.
  const tight = (s) => norm(s).replace(/\s+/g, "");
  // Scripts with no word separator. Only for THESE is "one name inside another"
  // evidence of the same person — in Latin script it usually isn't: "Ivanov"
  // sits inside "Ivanova" and they are two people, not a typo.
  const UNSPACED = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

  // Ordinary edit distance, capped — we only care about "one or two slips".
  function distance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // How close is close enough to be worth asking about? Scaled to length: one
  // slip in a short name is a lot, one in a long name is a typo.
  function nearEnough(a, b) {
    const d = distance(a, b);
    if (d === 0) return true;
    const len = Math.max(a.length, b.length);
    if (len <= 4) return false; // "Ben" vs "Ken" are different people, not a typo
    if (len <= 7) return d === 1;
    return d <= 2;
  }

  // Returns { state: "matched" | "nearly" | "new", contact, suggestions }.
  function look(name, contacts) {
    const wanted = norm(name);
    const list = Array.isArray(contacts) ? contacts.filter((c) => c && c.name) : [];
    if (!wanted) return { state: "new", contact: null, suggestions: [] };

    // TWO PEOPLE WITH THE SAME NAME IS NOT A MATCH, IT IS A QUESTION.
    //
    // This took the FIRST exact hit and linked it, silently — while the rule
    // four lines further down, for people found by first name, already said
    // that two candidates must be asked about. The same rule, applied in one
    // branch and not the other, which is how these things always go.
    //
    // The cost of the miss is the whole reason this file exists. A staff list
    // says Nick is running the open evening; two of your people are called
    // Nick and one of them is you; the app picked one and said nothing. Either
    // you have been given a job you never agreed to, or somebody else's job has
    // quietly become yours, and nothing anywhere would ever have told you.
    const exact = list.filter((c) => formsOf(c).some((f) => norm(f) === wanted));
    if (exact.length === 1) return { state: "matched", contact: exact[0], suggestions: [] };
    if (exact.length > 1) return { state: "nearly", contact: null, suggestions: exact.slice(0, 4) };

    // Same name, different spacing — the unspaced-script case, and also how
    // "Wang Wei" finds a contact you taught as "wangwei".
    const packed = tight(name);
    const spaced = list.filter((c) => formsOf(c).some((f) => tight(f) === packed));
    if (spaced.length === 1) return { state: "matched", contact: spaced[0], suggestions: [] };
    if (spaced.length > 1) return { state: "nearly", contact: null, suggestions: spaced.slice(0, 4) };

    // "Helen" matching "Helen Zhou" — a first name is how people actually
    // write, and it's a match, not a near-miss.
    const byFirst = list.filter((c) =>
      formsOf(c).some((f) => {
        const parts = norm(f).split(" ");
        return parts.includes(wanted) || norm(f).startsWith(wanted + " ");
      })
    );
    if (byFirst.length === 1) return { state: "matched", contact: byFirst[0], suggestions: [] };
    // Part of an unspaced name — "王伟" inside "王伟民". Two characters minimum,
    // because one is too ambiguous to act on and would match half the roster.
    if (!byFirst.length && packed.length >= 2 && UNSPACED.test(packed)) {
      const inside = list.filter(
        (c) => UNSPACED.test(tight(c.name)) && (tight(c.name).includes(packed) || packed.includes(tight(c.name)))
      );
      if (inside.length === 1) return { state: "matched", contact: inside[0], suggestions: [] };
      if (inside.length > 1) return { state: "nearly", contact: null, suggestions: inside.slice(0, 4) };
    }
    // Two people called Helen is exactly when you must be asked, not guessed at.
    if (byFirst.length > 1) return { state: "nearly", contact: null, suggestions: byFirst.slice(0, 4) };

    const near = list.filter((c) =>
      formsOf(c).some((f) => nearEnough(wanted, norm(f)) || norm(f).split(" ").some((p) => nearEnough(wanted, p)))
    );
    if (near.length) return { state: "nearly", contact: null, suggestions: near.slice(0, 4) };

    // Last: the cross-script bridge. Only ever "nearly" — identifying a person
    // across two writing systems from a surname alone is a question, never an
    // answer. Confirm once and remember() makes it instant afterwards.
    const bridged = list.filter((c) =>
      formsOf(c).some((f) => pinyinCouldBe(name, f) || pinyinCouldBe(f, name))
    );
    if (bridged.length) return { state: "nearly", contact: null, suggestions: bridged.slice(0, 4), bridge: true };

    return { state: "new", contact: null, suggestions: [] };
  }

  // Every name an entry claims, so one pass can check them all.
  function namesIn(entry) {
    const out = [];
    if (!entry) return out;
    if (entry.kind === "task" && entry.item) {
      if (entry.item.promisedTo) out.push({ field: "promisedTo", name: entry.item.promisedTo });
      if (entry.item.waitingOn) out.push({ field: "waitingOn", name: entry.item.waitingOn });
    }
    if (entry.kind === "handover" && entry.handover && entry.handover.person)
      out.push({ field: "person", name: entry.handover.person });
    return out;
  }

  // ---- names sitting loose in a piece of text --------------------------------
  //
  // A schedule says who is running each session. Read out of a PDF those names
  // arrive mixed into one run of words with the rooms and the groups, because
  // the columns are gone — "Jack D, Joshua K (PS & MS) Dave (HS) Xianmian
  // Building 109". Something has to pick the people out of that.
  //
  // AND IT MUST NOT DECIDE. The rule at the top of this file holds hardest
  // here: never add a person silently, because a wrong guess becomes a
  // permanent contact and a right one you never confirmed is a contact you
  // don't trust. This returns CANDIDATES. Somebody ticks them.
  //
  // What it uses is shape, not vocabulary — §0.2. It knows nothing about
  // schools, rooms or job titles:
  //
  //   · a name is one to three words, each starting with a capital
  //   · nothing with a digit in it (which is most rooms, floors and addresses)
  //   · nothing in full capitals (an acronym: PS, HS, FAO, TBA, IT)
  //   · a run of them separated by commas is a strong sign, because that is how
  //     a list of people is written and almost nothing else is
  const CAP_WORD = /^[A-ZÀ-ɏ][\w'’À-ɏ-]*$/;

  function couldBeName(chunk) {
    const s = String(chunk || "").trim().replace(/[.,;:]+$/, "");
    if (!s || /\d/.test(s)) return "";
    const words = s.split(/\s+/);
    if (!words.length || words.length > 3) return "";
    if (!words.every((w) => CAP_WORD.test(w))) return "";
    // ALL CAPS is an acronym, not a person — and ONE of them anywhere in the
    // run is enough to spoil it. "Dave TBA" is a name and a placeholder that
    // ended up side by side, not somebody called Dave Tba.
    //
    // A single capital letter is an initial and stays: "Jack D" is how a school
    // writes a surname it doesn't want in full.
    if (words.some((w) => w.length > 1 && w === w.toUpperCase())) return "";
    if (s.length < 2 || s.length > 40) return "";
    return s;
  }

  function peopleIn(text) {
    const src = String(text || "");
    if (!src.trim()) return [];
    const seen = new Map();
    const add = (name, strong) => {
      const key = norm(name);
      if (!key) return;
      const had = seen.get(key);
      if (had) { had.times++; if (strong) had.listed = true; return; }
      seen.set(key, { name, times: 1, listed: !!strong });
    };
    // Split on brackets and slashes first — a bracket is nearly always an aside
    // ("(HS)", "(bring your passport)") and never part of a name.
    src.split(/[()\[\]/|\n]+/).forEach((part) => {
      const bits = part.split(/\s*,\s*/).map((b) => b.trim()).filter(Boolean);
      // A comma-separated run of two or more name-shaped bits is a list of
      // people. One on its own could be anything, so it counts for less.
      const shaped = bits.map(couldBeName);
      const strong = bits.length > 1 && shaped.filter(Boolean).length > 1;
      shaped.forEach((s) => { if (s) add(s, strong); });
      // THE FIRST NAME IN THE LIST HAS THE SENTENCE STUCK TO IT.
      //
      // "…New Teachers Jack D, Joshua K" — Joshua comes out clean and Jack
      // doesn't, because he is on the end of everything that came before him.
      // Pulling capitalised runs out of any old text was tried and it produced
      // "Xianmian Building", "Floor" and "Saturday"; this is the narrow version
      // that doesn't.
      //
      // It only looks inside a chunk ALREADY KNOWN to be a list of people, and
      // only for a name the same SHAPE as the ones beside it — a list is
      // written consistently, so if the others are "word plus initial" then the
      // last two words of this one are too.
      // ONE CLEAN SIBLING IS ENOUGH TO GIVE THE SHAPE. "…New Teachers Jack D,
      // Joshua K" has only one name the commas hand over whole, and it is still
      // the shape the other one is written in.
      if (bits.length < 2 || !shaped.some(Boolean)) return;
      const shapes = [...new Set(shaped.filter(Boolean).map((s) => s.split(/\s+/).length))];
      bits.forEach((bit, i) => {
        if (shaped[i]) return;
        const words = bit.split(/\s+/);
        // Longest shape first, and stop at the first one that fits. Trying them
        // all turns "Vincent Wu" into Vincent Wu AND Wu — one person offered
        // twice, once under half their name.
        [...shapes].sort((a, b) => b - a).some((n) => {
          if (words.length <= n) return false;
          const tail = couldBeName(words.slice(-n).join(" "));
          if (tail) add(tail, true);
          return !!tail;
        });
      });
    });
    // NAMES GLUED TO OTHER WORDS ARE LEFT BEHIND, ON PURPOSE.
    //
    // Flattened out of a PDF a name often has a sentence in front of it —
    // "Teachers on the name lists Carre" — and pulling runs of capitalised
    // words out of those was tried: it found four more people and eleven more
    // things that aren't people. "Xianmian Building", "Floor", "Welcome",
    // "Saturday". Twenty-eight chips to find eighteen right ones is worse to
    // read than eighteen chips with one wrong one, and this is a list somebody
    // has to look down.
    //
    // The ones it misses are recoverable and the ones it invents are not: a
    // name typed in by hand takes a second, and once anybody is in People they
    // are matched by look() from then on, silently, every time.
    return [...seen.values()]
      // The ones written as a list first, then the ones said most often.
      .sort((a, b) => (b.listed ? 1 : 0) - (a.listed ? 1 : 0) || b.times - a.times ||
        a.name.localeCompare(b.name));
  }

  // THE PART THAT ACTUALLY SOLVES PINYIN. When you confirm that "Wang Wei" is
  // 王伟, that spelling is kept on the contact — so the next time, and every
  // time after, it's an exact match. The app ends up knowing how you write your
  // own people, which no built-in table could.
  function remember(contact, spelling) {
    if (!contact || !spelling) return false;
    const s = String(spelling).trim();
    if (!s) return false;
    if (!Array.isArray(contact.aka)) contact.aka = [];
    const already = formsOf(contact).some((f) => norm(f) === norm(s) || tight(f) === tight(s));
    if (already) return false;
    contact.aka.push(s.slice(0, 60));
    contact.aka = contact.aka.slice(0, 8);
    return true;
  }

  // WHAT IS THIS PERSON CALLED?
  //
  // Six files each answered this, and by the time anybody counted they had
  // already drifted: five returned `c.name || id`, and the one on the Day page
  // returned `c.name` — so a contact saved without a name rendered the day as
  // "with undefined". An id on screen is a lookup that quietly failed and still
  // looks like a row; the word "undefined" is the same failure without even
  // that much.
  //
  // The id is the honest fallback in every case — for somebody who isn't on
  // your list, and for somebody who is but has no name against them. Inventing
  // a name would be worse than a bare code, and a bare code at least tells you
  // where to go and fix it.
  function nameOf(contacts, id) {
    const key = id == null ? "" : String(id);
    if (!key) return "";
    const c = (Array.isArray(contacts) ? contacts : []).find((x) => x && x.id === id);
    return (c && String(c.name || "").trim()) || key;
  }

  // WHICH ONE? — the question a name on its own cannot answer.
  //
  // There are two people called Nick. One of them is you. A document arrives
  // saying Nick is running the open evening, and there is no way on earth to
  // tell from the word "Nick" whether that is a job you have just been given or
  // somebody else's job entirely. The same goes for HR at this school and HR at
  // the last one, for the two Wangs in 9A, and for every parent who shares a
  // surname with their child's form tutor.
  //
  // So a person is written with the thing that tells them apart, in brackets
  // after the name. What that thing IS is never decided here — §0.2. It is
  // whatever the person using the app said it was:
  //
  //   · the tag they typed on that person — "SHSID", "Head of Y9", "my brother"
  //   · failing that, the group they are in — "9A", "colleague", "parent"
  //
  // And "you" beats both, because that is the one confusion that costs you
  // something you cannot get back: a job you never agreed to, sitting on your
  // list, or somebody else's job quietly becoming yours.
  const TAG_MAX = 24;
  function tagOf(contact) {
    if (!contact) return "";
    if (contact.isMe) return "you";
    const tag = String(contact.tag || "").trim();
    if (tag) return tag.slice(0, TAG_MAX);
    return String(contact.group || "").trim().slice(0, TAG_MAX);
  }

  // HOW A PERSON IS WRITTEN ON SCREEN, everywhere, once.
  //
  // Takes an id OR a bare name, because the app holds both: a record knows a
  // contact's id, while a task that says "promised to Nick" holds nothing but
  // the four letters somebody typed. Both are the same question and they got
  // different answers — the id sites went through nameOf and the name sites
  // printed the raw string, so half the app could tell two people apart and
  // half could not.
  //
  // Bare where there is nothing to add, so a list of one class doesn't turn
  // into "Li Wei (9A), Zhang Min (9A), Chen Hao (9A)" — a tag every single row
  // shares tells you nothing and is just more to read.
  function saidAs(contacts, who, opts) {
    const list = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
    const o = opts || {};
    const key = who == null ? "" : String(who);
    if (!key.trim()) return "";
    // ALREADY SETTLED BEATS WORKING IT OUT AGAIN. Once you have told the app
    // that this task's "Caddy" is that Nick, the answer is a fact it holds, and
    // re-deriving it from four letters every time it draws the row is how a
    // settled thing comes unsettled — a second Caddy joining the school later
    // must not change what this task has always meant.
    let c = (o.id && list.find((x) => x.id === o.id)) || list.find((x) => x.id === who);
    let name = "";
    if (o.id && c) {
      const asWritten = norm(c.name) !== norm(key) && formsOf(c).some((f) => norm(f) === norm(key));
      name = asWritten ? key.trim() : String(c.name || "").trim() || key;
    } else if (c) {
      name = String(c.name || "").trim() || key;
    } else {
      // A NAME, NOT AN ID. Resolved the same way everything else resolves one,
      // so "Nick" finds the same person here as it does anywhere else.
      const hit = look(key, list);
      if (hit.state === "matched" && hit.contact) c = hit.contact;
      // YOUR WORD BACK, NOT THE APP'S PREFERRED ONE.
      //
      // Somebody who introduces themselves as Caddy to avoid being confused
      // with the other Nick gets called Caddy by half the school and Nick by
      // the rest — and both are their name, not a nickname for it. Writing
      // "Caddy" and being shown "Nick" is the app correcting you about what
      // somebody is called.
      //
      // So a name it recognises AS WRITTEN stays as written. A partial or a
      // near miss still fills out — "Sarah" is less than the person's name and
      // opening it out to "Sarah Kane" tells you more, which is the opposite
      // case.
      // A different NAME keeps your word; a different capitalisation does not —
      // "Caddy" and "Nick" are two names and both are theirs, while "li wei"
      // and "Li Wei" are one name typed in a hurry.
      const asWritten = c && norm(c.name) !== norm(key) && formsOf(c).some((f) => norm(f) === norm(key));
      name = asWritten ? key.trim() : c ? String(c.name || "").trim() || key : key;
      // TWO PEOPLE IT COULD BE IS THE WHOLE POINT OF THIS. Saying nothing there
      // would be the app quietly picking one.
      if (!c && hit.state === "nearly" && hit.suggestions.length > 1) {
        const tags = hit.suggestions.map(tagOf).filter(Boolean);
        return tags.length > 1 ? `${key} (which one? ${tags.join(" or ")})` : key;
      }
    }
    const tag = tagOf(c);
    if (!tag) return name;
    // Everyone in view shares it, so it separates nobody — see above.
    if (o.sharedBy && o.sharedBy === tag) return name;
    return `${name} (${tag})`;
  }

  // A TAG EVERYBODY IN VIEW SHARES SEPARATES NOBODY. On 9A's register every
  // single row would read "(9A)" — four more characters per line, on a page
  // somebody is scanning down, carrying no information at all. Handed the list
  // that is about to be drawn, this says what to leave off.
  function sharedTag(contacts, whos) {
    const list = Array.isArray(whos) ? whos : [];
    if (list.length < 2) return "";
    const tags = new Set(
      list.map((w) => {
        const c = (Array.isArray(contacts) ? contacts : []).find((x) => x && x.id === w);
        return tagOf(c);
      })
    );
    if (tags.size !== 1) return "";
    const only = [...tags][0];
    // "you" is never suppressed. If a list is somehow all you, that is worth
    // seeing rather than hiding.
    return only === "you" ? "" : only;
  }

  // WHO CANNOT BE TOLD APART. Two people whose names read the same AND whose
  // tags read the same are, on screen, one person — which is worse than having
  // no tags at all, because the brackets promise a distinction that isn't
  // there. Handed back so the People page can say so and offer to fix it.
  function muddled(contacts) {
    const list = Array.isArray(contacts) ? contacts.filter((c) => c && c.name) : [];
    const by = new Map();
    // WHAT IS ON THE SCREEN, not what matches. norm() folds away the Mr/Ms/Dr
    // on purpose, because "Dr Patel" and "Patel" are one person to look up — but
    // "Mr. Chen" and "Ms. Chen" are two people you can tell apart at a glance,
    // and warning that they read the same is simply untrue. Whether somebody can
    // be distinguished is a question about the words in front of them.
    const asShown = (t) => String(t == null ? "" : t).toLowerCase().replace(/\s+/g, " ").trim();
    list.forEach((c) => {
      const key = `${asShown(c.name)}|${asShown(tagOf(c))}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(c);
    });
    return [...by.values()].filter((g) => g.length > 1);
  }

  window.OrganiserNames = {
    nameOf, tagOf, saidAs, sharedTag, muddled,
    look, namesIn, peopleIn, couldBeName, remember, formsOf, pinyinCouldBe, distance, nearEnough, norm };
})();
