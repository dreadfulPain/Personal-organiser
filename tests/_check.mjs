// The three lines every suite here writes out for itself, written once.
// Nothing clever: a counter, a line each, and a summary the runner can read.
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
