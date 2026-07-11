@echo off
title Personal Organiser - install auto-start
cd /d "%~dp0"

echo.
echo  This makes the organiser start quietly in the background when you log in,
echo  so reminders can come and find you even before you open the page.
echo  Nothing else changes - open it the same ways as always.
echo.

set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Personal Organiser.vbs"

rem Writes a tiny hidden-start script into your own Startup folder, with this
rem folder's location baked in. No admin rights needed. Undo it any time by
rem double-clicking "Remove Auto-Start.bat".
> "%TARGET%" echo Set sh = CreateObject("WScript.Shell")
>> "%TARGET%" echo sh.CurrentDirectory = "%~dp0"
>> "%TARGET%" echo sh.Run "cmd /c set NO_OPEN=1&& node server.js", 0, False

if exist "%TARGET%" (
  echo  Done. From your next log-in the organiser runs quietly in the background.
  echo  Open the page any time at http://localhost:3000 or with "Start Organiser.bat".
  echo.
  echo  Starting it in the background right now as well...
  wscript "%TARGET%"
) else (
  echo  Something went wrong - the auto-start file could not be written.
)
echo.
pause
