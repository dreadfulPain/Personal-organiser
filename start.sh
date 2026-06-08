#!/bin/bash
# Linux: run `chmod +x start.sh` once, then `./start.sh` (or double-click if your
# file manager allows running scripts).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Install it (e.g. from your package manager or https://nodejs.org) then try again."
  exit 1
fi

echo "Starting your organiser... a browser tab will open in a moment."
echo "Keep this window open while you use it. Close it to stop."
node server.js
