#!/bin/bash
# TURNING THE SORTING ON, WITHOUT A TERMINAL — see "Set up smart sorting.bat"
# for the whole story. Same steps, same questions, same sizes said up front.
cd "$(dirname "$0")" || exit 1

finish() { echo; read -r -p "  Press enter to close."; exit "${1:-0}"; }

echo
echo "  ---------------------------------------------------------------"
echo "  SMART SORTING"
echo
echo "  Without this, the app reads what you type with patterns: it gets"
echo "  dates and times and names, and it misses more than a model would."
echo "  With it, you can write however it comes out and it works the rest"
echo "  out for itself."
echo
echo "  It all runs ON THIS COMPUTER. Nothing you type is sent anywhere,"
echo "  ever - that is the whole reason it is set up this way."
echo
echo "  This will need to download about 3 GB. On a slow connection that"
echo "  is a long wait, so start it when you can leave it running."
echo "  ---------------------------------------------------------------"
echo
read -r -p "  Set it up now? (type y then Enter): " GO
case "$GO" in
  y | Y) ;;
  *) echo; echo "  Left everything as it is. The app works without this."; finish 0 ;;
esac

# ---- 1. Is Ollama here? -----------------------------------------------------
OLLAMA=""
command -v ollama >/dev/null 2>&1 && OLLAMA="ollama"
[ -z "$OLLAMA" ] && [ -x "/usr/local/bin/ollama" ] && OLLAMA="/usr/local/bin/ollama"
[ -z "$OLLAMA" ] && [ -x "/opt/homebrew/bin/ollama" ] && OLLAMA="/opt/homebrew/bin/ollama"
[ -z "$OLLAMA" ] && [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ] && OLLAMA="/Applications/Ollama.app/Contents/Resources/ollama"

if [ -n "$OLLAMA" ]; then
  echo
  echo "  Ollama is already installed. Good - skipping that part."
else
  echo
  echo "  Ollama is the bit that runs the model on your computer. It isn't"
  echo "  installed yet. I can download it (about 700 MB) and open it for"
  echo "  you - you drag it into Applications the usual way."
  echo
  read -r -p "  Download Ollama? (type y then Enter): " GO
  case "$GO" in
    y | Y) ;;
    *) echo; echo "  Left everything as it is."; finish 0 ;;
  esac
  echo
  echo "  Downloading Ollama... leave this window alone while it runs."
  if ! curl -L --fail -o "/tmp/Ollama.zip" "https://ollama.com/download/Ollama-darwin.zip"; then
    echo
    echo "  The download didn't finish - usually no internet, or a firewall."
    echo "  Nothing was changed. You can also get it from"
    echo "  https://ollama.com/download and then run this file again."
    finish 1
  fi
  unzip -o -q "/tmp/Ollama.zip" -d "/tmp/ollama-dl" && open "/tmp/ollama-dl"
  echo
  echo "  Drag Ollama into your Applications folder, open it once, then"
  read -r -p "  press Enter here to carry on."
  command -v ollama >/dev/null 2>&1 && OLLAMA="ollama"
  [ -z "$OLLAMA" ] && [ -x "/usr/local/bin/ollama" ] && OLLAMA="/usr/local/bin/ollama"
  if [ -z "$OLLAMA" ]; then
    echo
    echo "  Ollama still isn't showing up. Open it once from Applications,"
    echo "  then run this file again. Nothing was changed."
    finish 1
  fi
fi

# ---- 2. Which model ---------------------------------------------------------
# SMALL BY DEFAULT — a laptop runs the big one at a crawl, and a sorter you wait
# ten seconds for is a sorter you stop using.
echo
echo "  ---------------------------------------------------------------"
echo "  WHICH MODEL"
echo "    1  qwen3:4b   about 2.6 GB  - fits any laptop, fast        (recommended)"
echo "    2  qwen3:14b  about 9 GB    - reads better, needs a good graphics card"
echo "  ---------------------------------------------------------------"
read -r -p "  Which? (1 or 2, then Enter - just Enter for 1): " PICK
MODEL="qwen3:4b"
[ "$PICK" = "2" ] && MODEL="qwen3:14b"

echo
echo "  Pulling $MODEL ... this is the big download. Leave it running."
if ! "$OLLAMA" pull "$MODEL"; then
  echo
  echo "  The model didn't download - usually the connection dropped."
  echo "  Nothing was changed. Run this file again to pick up where it"
  echo "  left off; anything already downloaded is kept."
  finish 1
fi

# ---- 3. Reading photographs (optional) --------------------------------------
echo
echo "  ---------------------------------------------------------------"
echo "  READING PHOTOGRAPHS (optional)"
echo "  With one more model you can photograph a timetable on a wall and"
echo "  the app will read it. About 4.7 GB, and you can do this later."
echo "  ---------------------------------------------------------------"
read -r -p "  Add that too? (type y then Enter, or just Enter to skip): " GO
case "$GO" in
  y | Y)
    echo
    echo "  Pulling llava ... leave it running."
    "$OLLAMA" pull llava || true
    ;;
esac

# ---- 4. Write the settings --------------------------------------------------
# KEEPS EVERY OTHER LINE: the settings file may hold things this script knows
# nothing about, and rewriting it wholesale would throw them away.
echo
echo "  Writing your settings..."
if [ -f ".env" ]; then
  grep -v -i -E '^(AI_ENGINE|AI_MODEL)=' ".env" > ".env.new" || true
  mv ".env.new" ".env"
else
  echo '# Written by set-up-smart-sorting.command. Safe to edit by hand.' > ".env"
fi
{
  echo "AI_ENGINE=ollama"
  echo "AI_MODEL=$MODEL"
} >> ".env"

echo
echo "  ---------------------------------------------------------------"
echo "  Done. Sorting is set up with $MODEL."
echo
echo "  Close the organiser if it is open, then start it again. The dot"
echo "  at the top right of every page will say \"sorting on\"."
echo "  ---------------------------------------------------------------"
finish 0
