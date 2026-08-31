import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// THE UPDATER, ACTUALLY RUN.
//
// Somebody double-clicked Update.bat on a school network and got:
//
//     fatal: unable to access '...': schannel: failed to receive handshake,
//     SSL/TLS connection failed
//     Could not finish. Usually that is no internet, or a file you have
//     edited yourself that git will not overwrite.
//
// Their internet was fine and they had edited nothing. schannel is the security
// layer Windows uses and git uses by default; "failed to receive handshake" is
// the encrypted connection being interrupted partway through, which is what a
// network that inspects traffic does, and what GitHub does from some countries.
//
// There ARE ways round it — git can be asked to use its own security layer
// instead of Windows', and to stop asking for the newer connection protocol
// that middleboxes mishandle — and the file already knew about one of them. It
// just stopped to ask "try the other security layer? (y/n)" first, which is not
// a question somebody who wanted the new version can answer.
//
// AND IT IS THE ONE FILE HERE THAT SHIPS THROUGH ITSELF. Get it wrong and the
// person who most needs the repair is the one who cannot receive it — so it is
// run here rather than read.

import fs from "node:fs";
import path from "node:path";
import { runBat } from "./_bat.mjs";
import { checker } from "./_check.mjs";
const { ok, done, sec } = checker();

const BAT = fs.readFileSync(path.join(REPO_ROOT, "Update.bat"), "utf8");

// WHAT THE COMPUTER DOES BACK. Each scenario says what git does when asked —
// which is the only thing that differs between somebody on a school network and
// somebody at home.
function world(how) {
  const files = new Set(how.zip ? [] : [".git"]);
  const asked = [];
  const config = {};
  return {
    asked, config,
    exists: (p) => files.has(p) || (how.probed && /po-update-why/.test(p)),
    typed: () => how.answer || "",
    findstrIn: (text, cmd) => {
      const want = [...String(cmd).matchAll(/\/c:"([^"]*)"/g)].map((x) => x[1]);
      return want.some((w) => text.toLowerCase().includes(w.toLowerCase()));
    },
    run(cmd, toFile) {
      asked.push(cmd);
      if (/^where git/.test(cmd)) return { code: how.noGit ? 1 : 0 };
      if (/^type /.test(cmd)) return { code: 0, out: "(the probe's answer)" };
      // What the last rung printed, which is how "the network refused it" is
      // told apart from "this git was not built with that".
      // findstr reading the probe's saved answer
      if (/^findstr /.test(cmd)) {
        const want = [...cmd.matchAll(/\/c:"([^"]*)"/g)].map((x) => x[1]);
        const said = /po-update-try/.test(cmd) ? String(how.said || "") : String(how.probe || "");
        return { code: want.some((w) => said.toLowerCase().includes(w.toLowerCase())) ? 0 : 1 };
      }
      if (/^git config (\S+) (\S+)/.test(cmd)) {
        const [, k, v] = /^git config (\S+) (\S+)/.exec(cmd);
        config[k] = v;
        return { code: 0 };
      }
      if (/^git ls-remote/.test(cmd)) {
        how.probed = true;
        return { code: how.probeOk ? 0 : 128, out: "" };
      }
      if (/^git init/.test(cmd)) { files.add(".git"); return { code: 0 }; }
      if (/^git remote/.test(cmd)) return { code: 0 };
      if (/^git checkout/.test(cmd)) return { code: how.checkoutFails ? 1 : 0 };
      // THE ONE THAT MATTERS: pull and fetch, which is what the network refuses.
      if (/^git .*\b(pull|fetch)\b/.test(cmd)) {
        const opts = (cmd.match(/-c \S+/g) || []).join(" ");
        return { code: how.getsThrough(opts) ? 0 : 1 };
      }
      return undefined; // anything else is a command this stand-in never saw
    },
  };
}

const run = (how) => {
  const w = world(how);
  const r = runBat(BAT, w);
  return { ...r, config: w.config, asked: w.asked };
};
const never = () => false;
const always = () => true;

// ---------------------------------------------------------------------------
sec("It runs at all, and every branch in it goes somewhere");
{
  // The stand-in throws on a label that isn't there, a command it has never
  // seen, or a script that doesn't end — so simply getting here is a check.
  const r = run({ getsThrough: always });
  ok("the ordinary update finishes", r.errorlevel === 0, String(r.errorlevel));
  ok("and says so in words somebody can act on", /Up to date/.test(r.out), r.out.slice(-200));
  ok("and says which window to restart", /Start Organiser/.test(r.out), r.out.slice(-200));
  ok("it never asked the network twice when once worked",
     r.asked.filter((c) => /pull|fetch/.test(c)).length === 1,
     r.asked.filter((c) => /pull|fetch/.test(c)).join(" | "));
  ok("and changed no settings", Object.keys(r.config).length === 1 &&
     r.config["gc.auto"] === "0", JSON.stringify(r.config));
}

sec("A refused handshake is tried round, not reported and abandoned");
{
  // THE FAULT. Windows' own security layer is the one being refused; git ships
  // another. Asking again with it is free and changes nothing on the computer.
  const r = run({
    probe: "schannel: failed to receive handshake, SSL/TLS connection failed",
    getsThrough: (opts) => /sslBackend=openssl/.test(opts),
  });
  ok("it gets through", r.errorlevel === 0, r.out.slice(-300));
  ok("without stopping to ask permission first",
     !/\(type y then Enter\)/.test(r.out), "it still asks");
  ok("and says what it is doing while it does it",
     /different security layer/.test(r.out), r.out);
  ok("and it ends up up to date", /Up to date/.test(r.out), r.out.slice(-200));
  // AND REMEMBERS, so the waiting happens once rather than every time.
  ok("what worked is kept for next time", r.config["http.sslBackend"] === "openssl",
     JSON.stringify(r.config));
  ok("and it says it has", /remembered/.test(r.out), r.out.slice(-300));
}

sec("And the other way round it is tried too");
{
  // The newer connection protocol is agreed INSIDE the handshake, so a network
  // that mishandles that part refuses the handshake itself. Not asking for it
  // is sometimes the whole of the fix, and it is the cheaper of the two.
  const r = run({
    probe: "schannel: failed to receive handshake",
    getsThrough: (opts) => /http.version=HTTP\/1.1/.test(opts) && !/sslBackend/.test(opts),
  });
  ok("it gets through on that alone", r.errorlevel === 0, r.out.slice(-300));
  ok("and that is what gets remembered", r.config["http.version"] === "HTTP/1.1" &&
     !r.config["http.sslBackend"], JSON.stringify(r.config));
  // AND IT IS TRIED FIRST, because it is the one that costs nothing.
  const first = r.asked.filter((c) => /pull/.test(c));
  ok("and it was tried before the heavier one", /http.version/.test(first[1] || ""),
     first.join(" | "));
}

sec("And both together, when neither is enough on its own");
{
  const r = run({
    probe: "SSL/TLS connection failed",
    getsThrough: (opts) => /sslBackend/.test(opts) && /http.version/.test(opts),
  });
  ok("it still gets through", r.errorlevel === 0, r.out.slice(-300));
  ok("and both are remembered", r.config["http.sslBackend"] === "openssl" &&
     r.config["http.version"] === "HTTP/1.1", JSON.stringify(r.config));
}

sec("And when none of them works it says so without blaming the wrong thing");
{
  const r = run({ probe: "schannel: failed to receive handshake", getsThrough: never });
  ok("it stops", r.errorlevel === 1, String(r.errorlevel));
  ok("having tried all three", r.asked.filter((c) => /pull/.test(c)).length === 4,
     r.asked.filter((c) => /pull/.test(c)).join(" | "));
  ok("it does not blame the internet", /internet is working/.test(r.out), r.out.slice(-600));
  ok("it names what actually does it", /inspects traffic/.test(r.out), r.out.slice(-600));
  ok("and gives the thing most likely to work", /hotspot/.test(r.out), r.out.slice(-600));
  // A DYSLEXIC TEACHER IS NOT GOING TO GO LOOKING FOR A FILE THEY DIDN'T EDIT.
  ok("and does not send them hunting for a file they edited",
     !/file .*you have\s*$|which git will not overwrite/m.test(r.out.split("--------")[1] || ""),
     r.out);
  ok("and says the app still works", /still runs/.test(r.out), r.out.slice(-600));
  ok("and that nothing was changed", /untouched/.test(r.out), r.out.slice(-600));
}

sec("And a git that hasn't got the other security layer says so, calmly");
{
  // THE TRAP UNDER ALL OF THIS. `git config http.sslBackend openssl` is accepted
  // without a murmur by a git that cannot do it, and then every request in that
  // folder stops with:
  //
  //     fatal: Unsupported SSL backend 'openssl'. Supported SSL backends: gnutls
  //
  // So it is never set until it has actually worked, and a build without it is
  // told apart from a network refusing the connection — they are not the same
  // thing and only one of them is worth a hotspot.
  const r = run({
    probe: "schannel: failed to receive handshake",
    said: "fatal: Unsupported SSL backend 'openssl'. Supported SSL backends: gnutls",
    getsThrough: never,
  });
  ok("it stops", r.errorlevel === 1, String(r.errorlevel));
  ok("and does not try the same unavailable thing again",
     r.asked.filter((c) => /sslBackend/.test(c)).length === 1,
     r.asked.filter((c) => /pull/.test(c)).join(" | "));
  ok("it explains the word fatal rather than leaving it there",
     /only the one security layer/.test(r.out), r.out.slice(-700));
  ok("and says nothing is wrong with their git", /Nothing is wrong with it/.test(r.out),
     r.out.slice(-700));
  ok("and still gives the advice that does work", /hotspot/.test(r.out), r.out.slice(-700));
  ok("and never wrote the setting that would have broken the folder",
     !r.config["http.sslBackend"], JSON.stringify(r.config));
}

sec("And a fault that is not the network is not treated as one");
{
  // THE WRONG DIAGNOSIS WITH A PROGRESS BAR ON IT. Climbing through security
  // layers in front of somebody whose real problem is a file they edited is the
  // same mistake this file was rewritten to stop making — so the server is
  // asked FIRST, and only its answer starts the climb.
  const r = run({ probe: "", probeOk: true, getsThrough: never });
  ok("it stops", r.errorlevel === 1, String(r.errorlevel));
  ok("without climbing through security layers",
     r.asked.filter((c) => /pull/.test(c)).length === 1,
     r.asked.filter((c) => /pull/.test(c)).join(" | "));
  ok("it says the network was not the problem", /not the network/.test(r.out), r.out.slice(-400));
  ok("and names the thing it usually is", /you have\s*\n?.*edited|edited/.test(r.out), r.out.slice(-400));
  ok("and points at the message git already printed", /just above/.test(r.out), r.out.slice(-400));
  // AND DOES NOT PRINT A HEALTHY ANSWER UNDER THE WORD "SAID". The probe
  // SUCCEEDS in this case, so printing what it returned put a list of branches
  // on screen where the error should be.
  ok("and does not show the probe's answer as if it were the error",
     !/what GitHub said/i.test(r.out), r.out.slice(-400));
  ok("and the data is still said to be safe", /untouched/.test(r.out), r.out.slice(-400));
}

sec("And no network at all is its own answer");
{
  const r = run({ probe: "Could not resolve host: github.com", getsThrough: never });
  ok("it stops", r.errorlevel === 1, String(r.errorlevel));
  ok("without trying to talk its way past a cable that isn't plugged in",
     r.asked.filter((c) => /pull/.test(c)).length === 1,
     r.asked.filter((c) => /pull/.test(c)).join(" | "));
  ok("it says GitHub was never reached", /didn't get that far/.test(r.out), r.out.slice(-300));
  ok("and the data is safe", /untouched/.test(r.out), r.out.slice(-300));
}

sec("And git not being installed is said plainly, with what to do");
{
  const r = run({ noGit: true, getsThrough: never });
  ok("it stops", r.errorlevel === 1, String(r.errorlevel));
  ok("it says git is missing", /Git is not installed/.test(r.out), r.out);
  ok("and where to get it", /git-scm\.com/.test(r.out), r.out);
  ok("and nothing was asked of the network", !r.asked.some((c) => /pull|fetch/.test(c)),
     r.asked.join(" | "));
}

sec("A folder downloaded as a ZIP is connected up, and asked first");
{
  const no = run({ zip: true, answer: "n", getsThrough: always });
  ok("saying no changes nothing", /Left everything as it is/.test(no.out), no.out.slice(-200));
  ok("and asks nothing of the network", !no.asked.some((c) => /fetch/.test(c)),
     no.asked.join(" | "));

  const yes = run({ zip: true, answer: "y", getsThrough: always });
  ok("saying yes connects it", /Connected/.test(yes.out), yes.out.slice(-300));
  ok("and it finishes up to date", yes.errorlevel === 0 && /Up to date/.test(yes.out),
     yes.out.slice(-200));
  ok("and it said what it keeps before asking", /KEEPS  your "data" folder/.test(yes.out),
     yes.out.slice(0, 900));
}

sec("And a first connect meets the same wall, so it gets the same way round it");
{
  // THE GAP THIS FOUND. The ways round a refused handshake were on the update
  // path only, so somebody whose network refuses it and who had downloaded the
  // ZIP could not get started at all — the one person for whom none of the rest
  // of this file has ever run.
  const r = run({
    zip: true, answer: "y",
    probe: "schannel: failed to receive handshake",
    getsThrough: (opts) => /sslBackend=openssl/.test(opts),
  });
  ok("a first connect gets through too", r.errorlevel === 0, r.out.slice(-400));
  ok("and is connected at the end of it", /Connected/.test(r.out), r.out.slice(-400));
  ok("and remembers how, so the next one is quick",
     r.config["http.sslBackend"] === "openssl", JSON.stringify(r.config));
}

// ---------------------------------------------------------------------------
// AND THE MAC TWIN, WHICH CAN SIMPLY BE RUN.
//
// The Windows one has to go through a stand-in for cmd; this one is a shell
// script and the machine running these checks has a shell. So it is executed —
// with a `git` on the path that answers however the scenario says, in a
// throwaway folder, so nothing here touches a real repository.
import { execFileSync } from "node:child_process";
import os from "node:os";

const CMD = path.join(REPO_ROOT, "update.command");

function runShell(how) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "po-upd-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(dir, "app"));
  if (!how.zip) fs.mkdirSync(path.join(dir, "app", ".git"));
  fs.copyFileSync(CMD, path.join(dir, "app", "update.command"));

  // A git that behaves the way the scenario says, and writes down what it was
  // asked — which is the whole of what these checks are about.
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/bash
echo "$*" >> "${dir}/asked.txt"
case "$*" in
  *"ls-remote"*) printf '%s' ${JSON.stringify(how.probe || "")}; exit ${how.probeOk ? 0 : 128} ;;
  *"config gc.auto"*) exit 0 ;;
  *"config "*) echo "$*" >> "${dir}/config.txt"; exit 0 ;;
  *init*|*remote*|*checkout*) exit 0 ;;
esac
case "$*" in
  *pull*|*fetch*) ${how.through} ;;
esac
exit 0
`, { mode: 0o755 });

  let out = "";
  let code = 0;
  try {
    out = execFileSync("bash", [path.join(dir, "app", "update.command")], {
      cwd: path.join(dir, "app"),
      env: { ...process.env, PATH: bin + ":" + process.env.PATH },
      input: (how.answer || "") + "\n\n\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
    code = e.status;
  }
  const readIf = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "");
  return { out, code, asked: readIf("asked.txt"), config: readIf("config.txt") };
}

sec("The Mac twin does the same things, run for real");
{
  const fine = runShell({ through: "exit 0" });
  ok("an ordinary update finishes", fine.code === 0, String(fine.code) + fine.out.slice(-200));
  ok("and says so", /Up to date/.test(fine.out), fine.out.slice(-200));
  ok("asking the network once", (fine.asked.match(/pull/g) || []).length === 1, fine.asked);

  // A REFUSED HANDSHAKE, and the way round it taken without being asked.
  const tls = runShell({
    probe: "schannel: failed to receive handshake, SSL/TLS connection failed",
    through: 'case "$*" in *sslBackend*) exit 0 ;; *) exit 1 ;; esac',
  });
  ok("a refused handshake is tried round", tls.code === 0, String(tls.code) + tls.out.slice(-400));
  ok("without asking permission", !/type y then Enter/.test(tls.out.split("Working out")[1] || ""),
     tls.out.slice(-400));
  ok("and what worked is remembered", /http\.sslBackend openssl/.test(tls.config), tls.config);

  // AND A FAULT THAT IS NOT THE NETWORK IS NOT CLIMBED THROUGH.
  const local = runShell({ probe: "refs/heads/main", probeOk: true, through: "exit 1" });
  ok("a local fault stops at once", local.code === 1, String(local.code));
  ok("without trying security layers", (local.asked.match(/pull/g) || []).length === 1, local.asked);
  ok("and says the network was not it", /not the network/.test(local.out), local.out.slice(-400));
  ok("and does not print a healthy answer as the error",
     !/what GitHub said/i.test(local.out), local.out.slice(-400));

  // NO NETWORK AT ALL.
  const down = runShell({ probe: "Could not resolve host: github.com", through: "exit 1" });
  ok("no network is its own answer", /didn't get that far/.test(down.out), down.out.slice(-300));
  ok("and is not climbed through either", (down.asked.match(/pull/g) || []).length === 1, down.asked);

  // AND ALL THREE WAYS FAILING.
  const stuck = runShell({ probe: "SSL/TLS connection failed", through: "exit 1" });
  ok("all of them failing says what to do", /hotspot/.test(stuck.out), stuck.out.slice(-500));
  ok("and does not blame the internet", /internet is working/.test(stuck.out), stuck.out.slice(-500));
  ok("having tried all of them", (stuck.asked.match(/pull/g) || []).length === 4, stuck.asked);


  // AND A GIT WITHOUT THAT SECURITY LAYER, which is most of them outside
  // Windows. `git config http.sslBackend openssl` is accepted without a murmur
  // by a git that cannot do it, and then every request in the folder stops with
  // "fatal: Unsupported SSL backend". So it is never written until it worked.
  const nobackend = runShell({
    probe: "schannel: failed to receive handshake",
    through: `case "$*" in *sslBackend*) echo "fatal: Unsupported SSL backend 'openssl'. Supported SSL backends:" >&2; exit 128 ;; *) exit 1 ;; esac`,
  });
  ok("a git without that layer says so plainly",
     /only the one security layer/.test(nobackend.out), nobackend.out.slice(-600));
  ok("and doesn't try it twice",
     (nobackend.asked.match(/sslBackend/g) || []).length === 1, nobackend.asked);
  ok("and never writes the setting that would break the folder",
     !/sslBackend/.test(nobackend.config), nobackend.config);
  ok("and still says what does work", /hotspot/.test(nobackend.out), nobackend.out.slice(-600));

  // A FIRST CONNECT HITS THE SAME WALL AND GETS THE SAME WAY ROUND IT.
  const first = runShell({
    zip: true, answer: "y",
    probe: "schannel: failed to receive handshake",
    through: 'case "$*" in *sslBackend*) exit 0 ;; *) exit 1 ;; esac',
  });
  ok("a first connect gets through too", /Connected/.test(first.out), first.out.slice(-400));
  ok("and remembers how", /http\.sslBackend openssl/.test(first.config), first.config);
}

done();
