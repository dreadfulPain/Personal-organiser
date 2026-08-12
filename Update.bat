@echo off
title Update the Organiser
cd /d "%~dp0"

rem Where updates come from. Both are editable if this ever moves.
set "REPO=https://github.com/dreadfulPain/Personal-organiser.git"
set "BRANCH=claude/friendly-hawking-0mVNx"

echo.
echo   Getting the latest version...
echo.
echo   Your own writing is NOT touched by this. Everything you have typed lives
echo   in the "data" folder, and your settings in ".env" - updates never
echo   overwrite either of them.
echo.

where git >nul 2>nul
if errorlevel 1 goto nogitprogram

if not exist ".git" goto setup

git pull
if errorlevel 1 goto failed
goto done

:setup
echo   --------------------------------------------------------------
echo   This folder was downloaded as a ZIP, so there is nothing to pull
echo   from yet. I can connect it up now, once, and then updating is
echo   just double-clicking this file.
echo.
echo   What that does:
echo     KEEPS  your "data" folder exactly as it is - every task, record
echo            and photo you have saved
echo     KEEPS  your ".env" settings file
echo     REPLACES the app's own files with the latest versions
echo.
echo   Only say yes if you have not edited the app's code yourself.
echo   --------------------------------------------------------------
echo.
set "ANSWER="
set /p "ANSWER=  Connect it up now? (type y then Enter): "
if /i not "%ANSWER%"=="y" goto declined

echo.
echo   Connecting...
git init
if errorlevel 1 goto failed
git remote remove origin >nul 2>nul
git remote add origin "%REPO%"
if errorlevel 1 goto failed
git fetch origin
if errorlevel 1 goto failed
git checkout -f -B "%BRANCH%" "origin/%BRANCH%"
if errorlevel 1 goto failed

echo.
echo   Connected. From now on, updating is just double-clicking this file.

:done
echo.
echo   Up to date. Close the black "Personal Organiser" window if it is open,
echo   then double-click "Start Organiser" again to run the new version.
echo.
pause
exit /b 0

:declined
echo.
echo   Left everything as it is. Nothing was changed.
echo.
pause
exit /b 0

:nogitprogram
echo   Git is not installed on this computer, so updates cannot be fetched.
echo.
echo   Install the free version from https://git-scm.com/download/win
echo   (all the default options are fine), then double-click this file again.
echo.
pause
exit /b 1

:failed
echo.
echo   Could not finish. Usually that is no internet, or a file you have
echo   edited yourself that git will not overwrite.
echo   Your "data" folder and your settings are untouched either way.
echo.
pause
exit /b 1
