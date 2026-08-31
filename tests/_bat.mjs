// ENOUGH OF cmd.exe TO RUN THE UPDATER.
//
// Update.bat is the one file here that cannot be checked by reading it. It has
// labels, subroutines, errorlevel, and four ways of writing an `if` — and it is
// the file somebody runs when the app is already not working. Worse, the fix to
// it SHIPS THROUGH IT: get it wrong and the person who most needs the repair
// is the one who cannot receive it.
//
// The suites here already build a browser stand-in for the same reason: a
// control that exists in a module but was never wired to the page looks exactly
// like a control that works. A branch in a batch file that goes to a label that
// isn't there looks exactly the same until somebody double-clicks it.
//
// THE ONE RULE THAT MAKES THIS SAFE: anything it does not understand THROWS.
// A stand-in that quietly skips the line it can't parse would report a clean
// run of a script it never really executed, which is worse than no check.

// What a line does, once the redirections are off it.
const REDIR = /\s*(?:\d?>>?\s*(?:nul|"[^"]*"|\S+)|2>&1)/gi;

export function runBat(text, world) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const labels = new Map();
  lines.forEach((l, i) => {
    const m = /^\s*:([A-Za-z_]\w*)\s*$/.exec(l);
    if (m) labels.set(m[1].toLowerCase(), i);
  });

  const env = Object.assign({ TEMP: "T", APPDATA: "A", USERPROFILE: "U" }, world.env || {});
  const out = [];
  const say = (s) => out.push(s);
  let errorlevel = 0;
  let echoOn = true;
  const stack = [{ pc: 0, args: "" }];
  const trail = [];
  let steps = 0;

  const expand = (s, fr) =>
    String(s)
      .replace(/%\*/g, fr.args)
      .replace(/%~dp0/g, "")
      .replace(/%(\w+)%/g, (_, n) => (env[n] === undefined ? "" : env[n]));

  // `goto` and `call` both name a label; a name that isn't there is the single
  // most likely way to break one of these files, so it is loud.
  const jump = (name) => {
    const at = labels.get(String(name).replace(/^:/, "").toLowerCase());
    if (at === undefined) throw new Error(`goto/call to a label that isn't there: ${name}`);
    return at + 1;
  };

  while (stack.length) {
    const fr = stack[stack.length - 1];
    if (fr.pc >= lines.length) { stack.pop(); continue; }
    if (++steps > 20000) throw new Error("the script never finished");
    let line = lines[fr.pc++].trim();
    if (!line || /^rem\b/i.test(line) || /^::/.test(line) || /^:[A-Za-z_]\w*$/.test(line)) continue;
    if (/^@echo\s+off$/i.test(line)) { echoOn = false; continue; }

    // ---- if, in the four shapes this file uses ----
    let guard = true;
    let m;
    // IF [/I] [NOT] ... — the switch comes before the negation, which is the
    // order cmd actually accepts and the order this file is written in.
    while ((m = /^if\s+(?:\/i\s+)?(not\s+)?(?:errorlevel\s+(\d+)|defined\s+(\w+)|exist\s+("?[^"\s]+"?)|("[^"]*"|\S+)\s*==\s*("[^"]*"|\S+))\s+(.*)$/i.exec(line))) {
      const [, not, lvl, defined, exist, lhs, rhs, rest] = m;
      let cond;
      if (lvl !== undefined) cond = errorlevel >= Number(lvl);
      else if (defined !== undefined) cond = env[defined] !== undefined && env[defined] !== "";
      else if (exist !== undefined) cond = !!world.exists(expand(exist.replace(/"/g, ""), fr));
      else {
        const a = expand(lhs.replace(/^"|"$/g, ""), fr);
        const b = expand(rhs.replace(/^"|"$/g, ""), fr);
        cond = a.toLowerCase() === b.toLowerCase();
      }
      if (not) cond = !cond;
      guard = guard && cond;
      line = rest.trim();
    }
    if (!guard) continue;

    // ---- a pipe: only ever `echo X | findstr ...` here ----
    const pipe = /^(echo\s[^|]*)\|\s*(findstr\s.*)$/i.exec(line);
    if (pipe) {
      const left = expand(pipe[1].replace(/^echo\s/i, ""), fr).replace(REDIR, "").trim();
      errorlevel = world.findstrIn(left, pipe[2].replace(REDIR, "")) ? 0 : 1;
      continue;
    }

    const bare = line.replace(REDIR, "").trim();
    const redirs = line.match(REDIR) || [];
    const toFile = (redirs.find((r) => /"/.test(r)) || "").replace(/[^"]*"([^"]*)".*/, "$1");

    if (/^echo\.$/i.test(bare)) { say(""); continue; }
    if (/^echo\s/i.test(bare)) { say(expand(bare.replace(/^echo\s/i, ""), fr)); continue; }
    if (/^(title|cd)\b/i.test(bare)) continue;
    if (/^pause$/i.test(bare)) continue;
    if (/^set\s/i.test(bare)) {
      const sp = /^set\s+(\/p\s+)?"?([^=\s"]+)=([^"]*)"?\s*$/i.exec(bare);
      if (!sp) throw new Error(`set it doesn't understand: ${bare}`);
      const [, prompt, name, value] = sp;
      if (prompt) { say(expand(value, fr)); env[name] = world.typed(); }
      else if (value === "") delete env[name];
      else env[name] = expand(value, fr);
      continue;
    }
    if (/^goto\s/i.test(bare)) {
      const to = bare.replace(/^goto\s+/i, "").trim();
      trail.push(to.replace(/^:/, ""));
      fr.pc = jump(to);
      continue;
    }
    if (/^call\s/i.test(bare)) {
      const c = /^call\s+(:\S+)\s*(.*)$/i.exec(bare);
      if (!c) throw new Error(`call it doesn't understand: ${bare}`);
      trail.push("call " + c[1].replace(/^:/, ""));
      stack.push({ pc: jump(c[1]), args: expand(c[2], fr).trim() });
      continue;
    }
    if (/^exit\s+\/b/i.test(bare)) {
      errorlevel = Number((bare.match(/exit\s+\/b\s+(\d+)/i) || [])[1] || 0);
      stack.pop();
      continue;
    }
    // ---- the outside world ----
    const said = world.run(expand(bare, fr), toFile && expand(toFile, fr), env);
    if (said === undefined) throw new Error(`a command it doesn't understand: ${bare}`);
    errorlevel = said.code;
    if (said.out !== undefined && !toFile) say(said.out);
    continue;
  }
  return { out: out.join("\n"), errorlevel, trail, env, echoOn };
}
