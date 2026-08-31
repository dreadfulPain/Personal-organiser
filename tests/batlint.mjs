import { fileURLToPath as __f } from "node:url";
import { dirname as __d, join as __j } from "node:path";
const REPO_ROOT = __j(__d(__f(import.meta.url)), "..");
// The /dev/null bug shipped because nothing checked the .bat files. This does.
import fs from "node:fs";
const REPO = REPO_ROOT;
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${e ? "\n      " + e : ""}`); } };

for (const f of fs.readdirSync(REPO).filter((x) => x.endsWith(".bat"))) {
  const raw = fs.readFileSync(`${REPO}/${f}`, "utf8");
  console.log(`\n${f}`);
  ok("CRLF line endings", !/[^\r]\n/.test(raw));
  // THE BUG: a Unix path in a Windows script. cmd tries to make a file in a
  // "dev" folder that isn't there and prints "cannot find the path specified".
  ok("no Unix /dev/null", !/\/dev\/null/.test(raw), (/.*\/dev\/null.*/.exec(raw) || [])[0]);
  ok("no Unix redirects at all", !/\s2>\s*\/|\s>\s*\//.test(raw));
  ok("no forward-slash paths", !/(?:^|\s)\.\/|(?:^|\s)\/[a-z]+\//m.test(raw.replace(/https?:\/\/\S+/g, "")));

  const labels = new Set([...raw.matchAll(/^:(\w+)/gm)].map((m) => m[1]));
  const gotos = [...raw.matchAll(/goto\s+(\w+)/gi)].map((m) => m[1]);
  const missing = gotos.filter((g) => !labels.has(g));
  ok("every goto has a label", missing.length === 0, missing.join(", "));
  // Only scripts that touch files NEXT TO THEM need this. "Remove Auto-Start"
  // only deletes an absolute %APPDATA% path, so it correctly has no cd.
  // A script that writes .env is writing NEXT TO ITSELF, and without a cd that
  // lands wherever the double-click happened to start from — which on Windows
  // is often C:\Windows\System32. Added when a setup script that writes the
  // settings file passed this check by not mentioning any of the other three.
  const usesOwnFolder = /node server\.js|git |%~dp0[^"]|"\.env/.test(raw);
  if (usesOwnFolder) ok("it changes to its own folder first", /cd \/d "%~dp0"/.test(raw));
  else ok("no cd needed — it only uses absolute paths", /%APPDATA%|%USERPROFILE%/.test(raw));
  ok("it pauses so the window can be read", /\bpause\b/.test(raw));
}

const u = fs.readFileSync(`${REPO}/Update.bat`, "utf8");
console.log("\nUpdate.bat behaviour");
ok("checks git is installed", /where git >nul 2>nul/.test(u));
ok("detects a ZIP folder", /if not exist "\.git" goto setup/.test(u));
ok("asks before repairing", /set \/p "ANSWER=/.test(u));
ok("and honours a no", /if \/i not "%ANSWER%"=="y" goto declined/.test(u));
ok("says data is kept", /KEEPS  your "data" folder/.test(u));
ok("says app files are replaced", /REPLACES the app's own files/.test(u));
ok("targets the right branch", /set "BRANCH=claude\/friendly-hawking-0mVNx"/.test(u));
ok("and the right repo", /dreadfulPain\/Personal-organiser\.git/.test(u));

const m = fs.readFileSync(`${REPO}/update.command`, "utf8");
console.log("\nupdate.command (mac/linux)");
ok("uses /dev/null, correctly, here", /\/dev\/null/.test(m));
ok("no Windows nul redirect", !/>nul/.test(m));
ok("same repair path", /git checkout -f -B "\$BRANCH"/.test(m));
ok("same branch", /BRANCH="claude\/friendly-hawking-0mVNx"/.test(m));


// ---------------------------------------------------------------------------
// WHAT THE UPDATER SAYS WHEN IT CAN'T UPDATE.
//
// It used to say "usually that is no internet, or a file you have edited" to
// every failure there is. Somebody on a school network got a TLS handshake
// refusal — the secure connection to GitHub interrupted partway through, which
// is what a network that inspects traffic does — and was told to check their
// internet, which was fine, and to look for a file they had edited, which they
// hadn't. A wrong diagnosis sends somebody looking in the wrong place, which
// costs more than no diagnosis at all.
console.log("\nWhat the updaters say when they fail");
for (const f of ["Update.bat", "update.command"]) {
  const raw = fs.readFileSync(`${REPO}/${f}`, "utf8");
  ok(`${f}: it asks the server why before answering`, /ls-remote/.test(raw),
     "it guesses instead of asking");
  ok(`${f}: a refused handshake is told apart`, /handshake/i.test(raw), "no such case");
  ok(`${f}: and not blamed on the internet`,
     /internet is working/i.test(raw), "still says check your internet");
  ok(`${f}: a network that can't reach it at all is its own case`,
     /didn't get that far|Could not resolve/i.test(raw), "the two are still one message");
  // AND THE ONE IT USED TO ASSUME is still there, for when GitHub DID answer.
  ok(`${f}: a file you edited is still said, when it fits`,
     /you (have )?edited/i.test(raw), "the original cause was dropped");
  ok(`${f}: and every path says the data is untouched`,
     (raw.match(/untouched/gi) || []).length >= 3, "some way out doesn't reassure");
}

// ---------------------------------------------------------------------------
// AND THE TWO TWINS DO THE SAME THINGS.
//
// What each one DOES is run and checked in updater.mjs. What is checked here is
// that they still agree: a fix that lands on Windows and not on the Mac is how
// one of these quietly becomes the worse file, and nobody has both to compare.
console.log("\nBoth updaters know the same ways round a refused handshake");
for (const f of ["Update.bat", "update.command"]) {
  const raw = fs.readFileSync(`${REPO}/${f}`, "utf8");
  ok(`${f}: it can ask for the other security layer`,
     /http\.sslBackend=openssl/.test(raw), "no way round schannel");
  ok(`${f}: and for the older connection protocol`,
     /http\.version=HTTP\/1\.1/.test(raw), "no way round a middlebox that mangles h2");
  ok(`${f}: and remembers whichever worked`,
     /git config http\.sslBackend/.test(raw) && /git config http\.version/.test(raw),
     "the waiting happens every time");
  // AND ASKS NOBODY'S PERMISSION TO TRY THEM. "Try the other security layer?
  // (y/n)" is not a question somebody who wanted the new version can answer,
  // and it is asked at the moment they are least able to answer it.
  ok(`${f}: without asking permission to try them`,
     !/security layer now\?|other security layer\? \(/.test(raw), "it still asks");
  // AND ON A FIRST CONNECT TOO — the one person for whom none of the rest of
  // the file has ever run is the one who cannot get started.
  ok(`${f}: on a first connect as well as a later one`,
     /(call :net|net) fetch origin/.test(raw), "a first connect still gets a bare fetch");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
