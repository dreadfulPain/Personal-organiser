#!/bin/bash
# Mac / Linux twin of Update.bat. Your writing lives in data/ and your settings
# in .env — both are excluded from the repository, so updates cannot touch them.
cd "$(dirname "$0")" || exit 1

REPO="https://github.com/dreadfulPain/Personal-organiser.git"
BRANCH="claude/friendly-hawking-0mVNx"

echo
echo "  Getting the latest version..."
echo
echo "  Your own writing is NOT touched by this — it lives in the data folder,"
echo "  and your settings in .env. Updates never overwrite either."
echo

finish() { echo; read -r -p "  Press enter to close."; exit "${1:-0}"; }

if ! command -v git >/dev/null 2>&1; then
  echo "  Git isn't installed, so updates can't be fetched."
  echo "  On a Mac, running  xcode-select --install  will add it."
  finish 1
fi

# NO AUTOMATIC HOUSEKEEPING IN A FOLDER THAT SYNCS — see Update.bat for the
# whole story. Git tidies its own storage every so often after a pull, and the
# last step of that is deleting files it has just finished copying elsewhere. In
# a folder inside OneDrive or Dropbox the sync program is holding those files
# open, so the deletion fails and git stops to ask whether to try again — in the
# middle of an update, on somebody who only wanted the new version. Nothing is
# lost either way, so the question is simply turned off.
git config gc.auto 0 >/dev/null 2>&1 || true

if [ ! -d .git ]; then
  echo "  --------------------------------------------------------------"
  echo "  This folder was downloaded as a ZIP, so there's nothing to pull"
  echo "  from yet. I can connect it up now, once."
  echo
  echo "    KEEPS    your data folder — every task, record and photo"
  echo "    KEEPS    your .env settings"
  echo "    REPLACES the app's own files with the latest versions"
  echo
  echo "  Only say yes if you haven't edited the app's code yourself."
  echo "  --------------------------------------------------------------"
  echo
  read -r -p "  Connect it up now? (type y then Enter): " ANSWER
  case "$ANSWER" in
    y | Y) ;;
    *) echo; echo "  Left everything as it is. Nothing was changed."; finish 0 ;;
  esac
  echo
  echo "  Connecting..."
  git init &&
    { git remote remove origin >/dev/null 2>&1 || true; } &&
    git remote add origin "$REPO" &&
    git fetch origin &&
    git checkout -f -B "$BRANCH" "origin/$BRANCH" || {
      echo
      echo "  Couldn't finish. Your data and settings are untouched."
      finish 1
    }
  echo
  echo "  Connected. From now on, updating is just running this file."
elif ! git pull; then
  # WORK OUT WHY BEFORE GUESSING AT IT — see Update.bat for the whole story.
  # "Usually no internet" was said to somebody whose internet was fine and whose
  # secure connection to GitHub was being interrupted by the network they were
  # on. So: ask the server once more, keep what it says, and read it.
  echo
  echo "  Working out what went wrong..."
  WHY="$(git ls-remote "$REPO" HEAD 2>&1)"
  if echo "$WHY" | grep -qiE "ssl|tls|handshake|certificate"; then
    echo
    echo "  --------------------------------------------------------------"
    echo "  The secure connection to GitHub was interrupted."
    echo
    echo "  Your internet is working — this is the encrypted handshake being"
    echo "  refused partway through. Two things cause it almost every time:"
    echo "    - a school or office network that inspects traffic"
    echo "    - GitHub being unreliable from where you are"
    echo
    echo "  Worth trying, in this order:"
    echo "    1. Run this again in a minute. It is often intermittent."
    echo "    2. Use your phone's hotspot instead of the school wifi."
    echo "  --------------------------------------------------------------"
    echo "  Nothing was changed and your data is untouched."
    finish 1
  fi
  if echo "$WHY" | grep -qiE "could not resolve|failed to connect|timed out|unable to access"; then
    echo
    echo "  Couldn't reach GitHub at all — the connection didn't get that far."
    echo "  Usually no internet, or a network that blocks it."
    echo "  Nothing was changed and your data is untouched."
    finish 1
  fi
  echo
  echo "  Could not finish, and it is not the network — GitHub answered."
  echo "  Usually that is a file in the app's own folder that you edited,"
  echo "  which git will not overwrite."
  echo "  Nothing was changed and your data is untouched."
  echo
  echo "  What it actually said:"
  echo "$WHY"
  finish 1
fi

echo
echo "  Up to date. Stop the app if it's running, then start it again."
finish 0
