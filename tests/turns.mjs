import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// GOING ROUND, SO THAT NOBODY QUIETLY FALLS OFF THE END.
//
// The Turns page promises one thing: "Longest since their last turn goes first
// — that one rule is what stops anyone quietly falling off the end." It is a
// pastoral safety net, and the cost of it being subtly wrong is a child nobody
// spoke to for a term.
//
// Walked through with a form group of eight, and the rule holds: four turns
// taken, and the four who had one drop to the bottom while the four who
// haven't rise. A turn that couldn't happen — they weren't free — keeps their
// place, because that wasn't their doing; and after three of those the page
// says so rather than offering the same time for ever:
//
//   The time isn't working.
//   Three tries that couldn't happen isn't bad luck any more.
//
// What the walkthrough DID find was the tags. Every row read "(9A)" — eight in
// the queue, two up today, the stuck one, and twice in a single sentence about
// swapping — because this page was told to keep tags always, on the reasoning
// that a rota is colleagues from anywhere whose names get muddled. True of a
// duty rota, wrong for the class round the page's own description is about.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const PUB = path.join(REPO_ROOT, "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const sb = { console, Date, Math, JSON, Set, Map, Object, Number, String, Array, Boolean,
  RegExp, isNaN, parseInt, parseFloat, Intl };
sb.window = sb;
vm.createContext(sb);
["names.js", "rota.js"].forEach((f) => vm.runInContext(read(f), sb));
const R = sb.OrganiserRota;
const N = sb.OrganiserNames;

const CLASS = ["Li Wei", "Zhang Min", "Chen Hao", "Wang Yu", "Sofia Rossi", "Ahmed Hassan",
  "Yuki Tanaka", "Omar Farouk"].map((n, i) => ({ id: "s" + i, name: n, group: "9A" }));
const ROUND = {
  id: "r1", title: "check in with 9A", memberIds: CLASS.map((c) => c.id),
  perDay: 2, minutes: 5, everyDays: 14, optional: true, lastDone: {}, tried: {},
};
const day = (n) => `2026-09-${String(n).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
sec("Longest since their last turn goes first");
{
  const order = R.queue(ROUND, day(1)).map((x) => x.id);
  ok("everyone is in the queue to start with", order.length === 8, String(order.length));

  // Four turns, over four days.
  let r = ROUND;
  const seen = [];
  for (let i = 1; i <= 4; i++) {
    const up = R.queue(r, day(i))[0];
    seen.push(up.id);
    r = R.mark(r, up.id, day(i));
  }
  ok("four different people got a turn", new Set(seen).size === 4, JSON.stringify(seen));

  const after = R.queue(r, day(5)).map((x) => x.id);
  const front = after.slice(0, 4);
  ok("nobody who has had one is near the front",
     front.every((id) => !seen.includes(id)), JSON.stringify(front));
  ok("and the ones who have had one are at the back",
     after.slice(4).every((id) => seen.includes(id)), JSON.stringify(after.slice(4)));
}

sec("And a turn that couldn't happen is not a turn");
{
  // "They weren't free" is not their doing, so it must not cost them their
  // place — that is the whole rule this page exists for. Getting this backwards
  // would push somebody to the back of the queue for being at the dentist.
  let r = ROUND;
  const who = R.queue(r, day(1))[0].id;
  r = R.tryFailed(r, who, day(1));
  const still = R.queue(r, day(2))[0].id;
  ok("they are still at the front", still === who, `${still} took their place`);

  // Twice more, and it is not bad luck any more.
  r = R.tryFailed(r, who, day(2));
  r = R.tryFailed(r, who, day(3));
  const stuck = R.neverCatching(r, 3);
  ok("three tries is noticed", stuck.length === 1 && stuck[0].id === who, JSON.stringify(stuck));
  ok("and counted", stuck[0].tries === 3, String(stuck[0].tries));
  // AND THEY STILL KEEP THEIR PLACE. Being hard to catch must not be the thing
  // that finally drops somebody off the end.
  ok("and they have still not lost their turn", R.queue(r, day(4))[0].id === who,
     R.queue(r, day(4))[0].id);
  // Two is bad luck; three is a pattern. Firing on two would make this noise.
  ok("two tries is still just bad luck", R.neverCatching(R.tryFailed(ROUND, who, day(1)), 3).length === 0);

  // And the page says it, in the words the walkthrough saw.
  const html = read("rota.html");
  ok("the page has somewhere to say it", /roStuck/.test(html), "nothing shows a stuck turn");
  ok("and says what to do about it", /doesn't suit them|different one/i.test(html),
     "it names the problem without naming the fix");
}

// ---------------------------------------------------------------------------
sec("A tag everybody in the round shares is left off");
{
  // Eleven rows of "(9A)" on a page about one class. A tag is there to separate
  // people; one everybody shares separates nobody and is only more to read on a
  // list you scan down.
  const ids = CLASS.map((c) => c.id);
  const shared = N.sharedTag(CLASS, ids);
  ok("a class round shares its class", shared === "9A", shared);
  ok("so the rows are just names", N.saidAs(CLASS, ids[0], { sharedBy: shared }) === "Li Wei",
     N.saidAs(CLASS, ids[0], { sharedBy: shared }));

  // AND THE CASE THE TAGS EXIST FOR IS UNTOUCHED. Two people called Nick on a
  // staff rota is exactly what this must never flatten.
  const STAFF = [
    { id: "n1", name: "Nick", group: "colleague", tag: "Head of Y9" },
    { id: "n2", name: "Nick", group: "colleague", tag: "Science" },
    { id: "n3", name: "Sarah Kane", group: "colleague" },
  ];
  const mixed = N.sharedTag(STAFF, ["n1", "n2", "n3"]);
  ok("a mixed rota shares nothing", mixed === "", mixed);
  ok("so both Nicks are told apart",
     N.saidAs(STAFF, "n1", { sharedBy: mixed }) === "Nick (Head of Y9)" &&
     N.saidAs(STAFF, "n2", { sharedBy: mixed }) === "Nick (Science)",
     `${N.saidAs(STAFF, "n1", { sharedBy: mixed })} / ${N.saidAs(STAFF, "n2", { sharedBy: mixed })}`);
}

sec("And the page asks the round who is in it");
{
  // It answered "nobody", which meant tags were kept on every page whatever the
  // round was. The round knows its own members; there is nothing to assume.
  const src = read("rotapage.js");
  const fn = (src.match(/const shownIds = \(\) => \{[\s\S]*?\n  \};/) || [""])[0];
  ok("shownIds is answered from the round", /memberIds/.test(fn),
     "it still returns a fixed list");
  ok("and no longer returns nothing at all",
     !/const shownIds = \(\) => \[\];/.test(src), "it is back to keeping every tag");
  ok("and every name on the page still goes through one place",
     !/OrganiserNames\.nameOf\(/.test(src.replace(/\/\/.*$/gm, "")),
     "a name is being written some other way again");
}

done();
