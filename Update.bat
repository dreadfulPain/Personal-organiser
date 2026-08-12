@echo off
title Update the Organiser
cd /d "%~dp0"

echo.
echo   Getting the latest version...
echo.
echo   Your own data is NOT touched by this. Everything you have written lives
echo   in the "data" folder, which updates never overwrite.
echo.

git rev-parse --is-inside-work-tree >/dev/null 2>&1
if errorlevel 1 goto nogit

git pull
if errorlevel 1 goto failed

echo.
echo   Up to date. Close the black "Personal Organiser" window if it is open,
echo   then double-click "Start Organiser" again to run the new version.
echo.
pause
exit /b 0

:nogit
echo   This folder was not set up with git, so there is nothing to pull.
echo.
echo   You can still update by downloading the folder again from GitHub - but
echo   COPY YOUR "data" FOLDER SOMEWHERE SAFE FIRST and put it back afterwards,
echo   or you will lose everything you have written.
echo.
pause
exit /b 1

:failed
echo.
echo   Could not get the update. Usually that means no internet, or you have
echo   edited a file yourself and git does not want to overwrite it.
echo   Nothing has been changed and your data is untouched.
echo.
pause
exit /b 1
