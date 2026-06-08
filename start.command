#!/bin/bash
# Mac: double-click to start (you may need to run `chmod +x start.command` once,
# and the first time, right-click > Open to get past the security prompt).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Get it free from https://nodejs.org then try again."
  read -r -p "Press enter to close."
  exit 1
fi

echo "Starting your organiser... a browser tab will open in a moment."
echo "Keep this window open while you use it. Close it to stop."
node server.js
