#!/bin/bash
# Mac / Linux twin of Update.bat. Your own data lives in data/, which git never
# touches — updates cannot overwrite what you've written.
cd "$(dirname "$0")" || exit 1
echo
echo "  Getting the latest version..."
echo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "  This folder wasn't set up with git, so there's nothing to pull."
  echo "  You can download it again from GitHub — but COPY YOUR data FOLDER"
  echo "  SOMEWHERE SAFE FIRST and put it back afterwards."
  echo
  read -r -p "  Press enter to close."
  exit 1
fi
if git pull; then
  echo
  echo "  Up to date. Stop the app if it's running, then start it again."
else
  echo
  echo "  Couldn't get the update — usually no internet, or a file you edited."
  echo "  Nothing was changed and your data is untouched."
fi
echo
read -r -p "  Press enter to close."
