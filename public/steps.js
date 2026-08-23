// THE LIST OF THINGS TO SET UP, AND HOW MANY OF THEM THERE ARE.
//
// The number used to be typed into the prose. The home page said "Four things
// to set up" and then named three; the setup page said "Four things, once" and
// showed four. Nobody had lied — a step had been added and two sentences hadn't
// heard about it. Somebody who cannot hold a count in their head reads "four"
// against a list of three and assumes the fault is theirs, which is the exact
// feeling this whole app exists to avoid.
//
// So the count and the names are the same fact now, read off the list, and the
// two sentences are built rather than written. Add a step and both change.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Each step: what it is, why it is worth doing, where it happens, and how to
  // tell whether it has been. The "done" test reads real data — never a flag
  // saying it was done, which can be true of an empty result.
  const STEPS = [
    {
      title: "Your timetable",
      why:
        "Your lessons, form time, duties and meetings. Everything else works around " +
        "these: the day plans into the gaps between them, the week stops calling a " +
        "teaching day free, and nothing gets booked over a lesson.",
      how: "Paste it from a spreadsheet, open the PDF, or import a calendar file.",
      go: "timeline.html#setup",
      goWords: "Set up my timetable",
      done: (d) => (d.schedule || []).filter((b) => b && !b.blocksDay && !b.noLessons).length,
      doneWords: (n) => `${n} block${n === 1 ? "" : "s"} in.`,
    },
    {
      title: "Your term dates",
      why:
        "When term starts and ends, INSET days, holidays. Without them a timetable " +
        "repeats every week for ever, so the summer shows as fully booked and the " +
        "month view says you have no free time when you have six weeks of it.",
      how: "Paste or open the calendar the school sent you.",
      go: "timeline.html#calendar",
      goWords: "Read in the school calendar",
      done: (d) =>
        (d.schedule || []).filter((b) => b && (b.noLessons || b.blocksDay || b.from || b.to)).length,
      doneWords: (n) => `${n} date${n === 1 ? "" : "s"} the timetable knows about.`,
    },
    {
      title: "Your classes",
      why:
        "Who is in each group. The register works from this, and so does anything " +
        "that says a name rather than a code.",
      how: "Copy the names out of your register and paste the lot in — one per line, " +
        "or two columns for name and class.",
      go: "people.html#class",
      goWords: "Paste a class in",
      done: (d) => (d.contacts || []).length,
      doneWords: (n) => `${n} ${n === 1 ? "person" : "people"} on your list.`,
    },
    {
      title: "The parts of your life",
      why:
        "Work, home, whatever else you keep separate. Only useful if you want the app " +
        "to keep them apart — plenty of people never need this one.",
      how: "Name them however you name them.",
      go: "index.html",
      goWords: "Home",
      optional: true,
      done: (d) => (d.areas || []).length,
      doneWords: (n) => `${n} named.`,
    },
  ];

  // Written out, not as a digit: "Four things" reads as a quantity, "4 things"
  // reads as something to work out. Past ten it goes back to digits, which is
  // both honest and a sign the list has got out of hand.
  const WORDS = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
                 "Eight", "Nine", "Ten"];
  const countWord = (n) => (n < WORDS.length ? WORDS[n] : String(n));

  // "your timetable, your term dates, your classes and the parts of your life"
  // — an Oxford-comma-free English list, mid-sentence, so the titles come down
  // to lower case on the way in.
  function listInWords(titles) {
    const t = titles.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
    if (t.length <= 1) return t[0] || "";
    return t.slice(0, -1).join(", ") + " and " + t[t.length - 1];
  }

  window.OrganiserSteps = {
    list: STEPS,
    count: () => STEPS.length,
    countWord: () => countWord(STEPS.length),
    names: () => STEPS.map((s) => s.title),
    namesSentence: () => listInWords(STEPS.map((s) => s.title)),
  };

  // FILLED IN, NOT WRITTEN OUT. Any page that wants to say how many there are
  // marks the spot and this puts the number in — so the sentence on the home
  // page and the sentence on the setup page cannot say different things again.
  // Both carry sensible words in the HTML so the page still reads correctly
  // with no script at all.
  function fillIn() {
    document.querySelectorAll(".nh-count").forEach((el) => {
      el.textContent = countWord(STEPS.length);
    });
    document.querySelectorAll(".nh-names").forEach((el) => {
      el.textContent = listInWords(STEPS.map((s) => s.title));
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fillIn);
  } else {
    fillIn();
  }
})();
