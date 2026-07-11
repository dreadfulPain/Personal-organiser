@echo off
title Personal Organiser - remove auto-start

set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Personal Organiser.vbs"

if exist "%TARGET%" (
  del "%TARGET%"
  echo  Done - the organiser will no longer start by itself when you log in.
  echo  ^(If it is running in the background right now, it stays until you
  echo  restart or sign out.^)
) else (
  echo  Auto-start was not installed - nothing to remove.
)
echo.
pause
