@echo off
title Personal Organiser
cd /d "%~dp0"

echo.
echo   Starting your organiser...
echo   Your browser will open by itself in a few seconds.
echo.
echo   Keep THIS window open while you use the app.
echo   To stop the app, just close this window.
echo.

rem Opens the browser once the app has had a moment to start.
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & explorer http://localhost:3000"

rem This window opens the browser above, so tell the app not to open a second tab.
set "NO_OPEN=1"

node server.js

echo.
if "%errorlevel%"=="9009" echo   Node.js doesn't seem to be installed. Get the free LTS version from https://nodejs.org then double-click this file again.
echo   The organiser has stopped. You can close this window.
echo.
pause
