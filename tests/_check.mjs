// The three lines every suite here writes out for itself, written once.
// Nothing clever: a counter, a line each, and a summary the runner can read.

// TAKING THE COMMENTS OUT, so a check reads what the code DOES rather than what
// it says about itself. Half the suites here need that — "nothing in this file
// mentions fetch" is a sentence about code, and this file is written in long
// prose comments that would set it off constantly.
//
// Nineteen suites had their own copy of this line and every one of them had the
// same hole. `image/*` — in the list of file types the picker offers — reads as
// the start of a block comment, so everything from there to the next `*/` was
// deleted before any check ever saw it: 94 lines of capture.js, 17 of people.js,
// 10 of class.js. One of the checks reading through that hole is the one that
// says the pastoral notes never reach the network.
//
// A block comment OPENS at the start of a line, or after a space or a bracket.
// `image/*` does not — there is a letter in front of it.
export const codeOf = (s) =>
  String(s || "")
    .replace(/(^|[\s({[,;=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^\s*\/\/.*$/gm, "");

export function checker() {
  let pass = 0, fail = 0;
  const ok = (name, cond, saw) => {
    if (cond) { pass++; console.log("  ok  " + name); }
    else { fail++; console.log("FAIL  " + name + (saw ? "\n      " + String(saw).slice(0, 300) : "")); }
  };
  const done = () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  };
  return { ok, done, sec: (s) => console.log("\n" + s) };
}
