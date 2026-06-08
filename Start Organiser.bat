@echo off
rem Double-click this to start your organiser. It opens in your browser and
rem saves your data to a real file you own. Keep the window open while using it.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is needed to run your organiser, and it isn't installed yet.
  echo   Get it free from https://nodejs.org  (click the big "LTS" button),
  echo   then double-click this file again.
  echo.
  pause
  exit /b
)

echo.
echo   Starting your organiser... a browser tab will open in a moment.
echo.
node server.js

echo.
echo   The organiser has stopped. You can close this window.
pause
