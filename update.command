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

# ---- ONE NETWORK REQUEST, ASKED ABOUT AND THEN TRIED THREE WAYS -------------
#
# WORK OUT WHY BEFORE TRYING ANYTHING. This used to say "usually no internet, or
# a file you have edited" to every failure there is. Somebody on a school network
# got a refused TLS handshake — the secure connection to GitHub interrupted
# partway through, which is what a network that inspects traffic does, and what
# GitHub does from some countries — and was told to check their internet, which
# was fine, and to look for a file they had edited, which they hadn't.
#
# So the server is asked and its answer decides what happens next. Climbing
# through security layers in front of somebody whose real problem is a file they
# edited would be the same wrong diagnosis with a progress bar on it.
#
# THEN, IF IT IS THE HANDSHAKE, the same request with one more thing turned off
# each time. Nothing here writes a file, so a try that fails costs a moment and
# nothing else — which is why none of them stops to ask permission first.
#
#   HTTP/1.1  the newer protocol is agreed inside the handshake itself, and a
#             network that inspects traffic often mishandles that part
#   OpenSSL   on Windows this is the whole fix, because the layer git uses there
#             by default is the one refusing. Here git is usually built against
#             OpenSSL already, so it changes nothing — kept so that both twins
#             behave the same way and one explanation covers both.
GITOPT=""
NETWHY=""
net() {
  GITOPT=""
  NETWHY=""
  git "$@" && return 0
  echo
  echo "  Working out what went wrong..."
  if WHY="$(git ls-remote "$REPO" HEAD 2>&1)"; then PROBEFAILED=""; else PROBEFAILED=1; fi
  if ! printf '%s' "$WHY" | grep -qiE "schannel|ssl|tls|handshake|certificate"; then
    if printf '%s' "$WHY" | grep -qiE "could not resolve|failed to connect|timed out|unable to access"; then
      NETWHY=nonet
    fi
    return 1
  fi
  NETWHY=tls
  echo
  echo "  The secure connection to GitHub was refused. There are ways round"
  echo "  that, and none of them changes anything on this computer, so I am"
  echo "  simply trying them."
  echo
  echo "  Without the newer connection protocol, which a network that inspects"
  echo "  traffic often mishandles..."
  GITOPT="-c http.version=HTTP/1.1"
  # shellcheck disable=SC2086
  git $GITOPT "$@" && return 0
  echo
  echo "  Still no. With a different security layer..."
  GITOPT="-c http.sslBackend=openssl"
  # NOT EVERY COPY OF GIT HAS THAT ONE BUILT IN, and one that hasn't stops with
  # "Unsupported SSL backend" — a sentence about how git was assembled, not
  # about anybody's network, and it would say it twice if the last try ran. So
  # what it said is kept, the word "fatal" on screen is explained rather than
  # left sitting there, and the setting is never written until it has actually
  # worked: written blind it stops every request in the folder for good.
  # shellcheck disable=SC2086
  if TRIED="$(git $GITOPT "$@" 2>&1)"; then echo "$TRIED"; return 0; fi
  echo "$TRIED"
  if printf '%s' "$TRIED" | grep -qi "unsupported ssl backend"; then
    echo
    echo "  This copy of git has only the one security layer built into it, so"
    echo "  that way round is not available here. Nothing is wrong with it."
    GITOPT=""
    return 1
  fi
  echo
  echo "  And both together..."
  GITOPT="-c http.sslBackend=openssl -c http.version=HTTP/1.1"
  # shellcheck disable=SC2086
  git $GITOPT "$@" && return 0
  GITOPT=""
  return 1
}

# Whatever got through is what next time starts with, so the waiting happens
# once rather than every time. FOR THIS FOLDER ONLY — not a global change to
# somebody's machine to get one repository working.
remember() {
  [ -n "$GITOPT" ] || return 0
  case "$GITOPT" in *sslBackend*) git config http.sslBackend openssl >/dev/null 2>&1 ;; esac
  case "$GITOPT" in *http.version*) git config http.version HTTP/1.1 >/dev/null 2>&1 ;; esac
  echo
  echo "  That worked, and I have remembered how for this folder, so the next"
  echo "  update should go straight through."
}

saidwhy() {
  case "$NETWHY" in
    tls)
      echo
      echo "  --------------------------------------------------------------"
      echo "  The secure connection to GitHub was interrupted, and the ways"
      echo "  round it did not get through either."
      echo
      echo "  Your internet is working — this is the encrypted handshake being"
      echo "  refused partway through. Two things cause it almost every time:"
      echo "    - a school or office network that inspects traffic"
      echo "    - GitHub being unreachable from where you are"
      echo
      echo "  Worth trying, in this order:"
      echo "    1. Run this again in a minute. It is often intermittent."
      echo "    2. Use your phone's hotspot instead of the school wifi. A"
      echo "       network that inspects traffic will refuse this however it"
      echo "       is asked, and one that doesn't usually just works."
      echo
      echo "  Nothing was changed. Your data folder and your settings are"
      echo "  untouched, and the app still runs exactly as it did — it is"
      echo "  only the new version that could not be fetched."
      echo "  --------------------------------------------------------------"
      ;;
    nonet)
      echo
      echo "  Couldn't reach GitHub at all — the connection didn't get that far."
      echo "  Usually no internet, or a network that blocks it."
      echo "  Nothing was changed and your data is untouched."
      ;;
    *)
      echo
      echo "  Could not finish, and it is not the network — GitHub answered."
      echo "  Usually that is a file in the app's own folder that you edited,"
      echo "  which git will not overwrite. Git's own message is just above."
      echo "  Nothing was changed and your data is untouched."
      # AND WHAT THE SERVER SAID, only when the server is what went wrong. When
      # the fault is a file on this computer the probe SUCCEEDS, and printing
      # its answer put a healthy list of branches on screen under the words
      # "what it said" — which reads as the error, and is not one.
      if [ -n "$PROBEFAILED" ]; then
        echo
        echo "  And what GitHub said when asked:"
        echo "$WHY"
      fi
      ;;
  esac
  finish 1
}

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
  git init || { echo; echo "  Couldn't start. Your data and settings are untouched."; finish 1; }
  git remote remove origin >/dev/null 2>&1 || true
  git remote add origin "$REPO" ||
    { echo; echo "  Couldn't start. Your data and settings are untouched."; finish 1; }
  # THE SAME WALL ON A FIRST CONNECT AS ON EVERY LATER ONE, so the same ways
  # round it. This used to be a bare fetch, so somebody whose network refuses
  # the handshake could not get started at all.
  net fetch origin || saidwhy
  remember
  git checkout -f -B "$BRANCH" "origin/$BRANCH" ||
    { echo; echo "  Couldn't finish. Your data and settings are untouched."; finish 1; }
  echo
  echo "  Connected. From now on, updating is just running this file."
else
  net pull || saidwhy
  remember
fi

echo
echo "  Up to date. Stop the app if it's running, then start it again."
finish 0
