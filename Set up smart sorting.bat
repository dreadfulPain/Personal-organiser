@echo off
setlocal enabledelayedexpansion
title Personal Organiser - set up smart sorting
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  TURNING THE SORTING ON, WITHOUT A TERMINAL.
rem
rem  Somebody used this app for weeks believing their messy sentences were being
rem  read by a model. They weren't - nothing was installed, so every sort fell
rem  through to the patterns. Then they tried to install it by hand, got
rem  "couldn't find qwen3:14b", and stopped.
rem
rem  None of that is their job. This does the whole thing: fetches Ollama if it
rem  isn't there, pulls a model that fits their machine, and writes the settings
rem  file. It says the size of every download BEFORE starting it, and it asks
rem  before each one.
rem
rem  OPTIONAL, ALWAYS. The app works with none of this; it just reads what you
rem  type less well. Nothing here is required and nothing here is undoable.
rem ---------------------------------------------------------------------------

echo.
echo   ---------------------------------------------------------------
echo   SMART SORTING
echo.
echo   Without this, the app reads what you type with patterns: it gets
echo   dates and times and names, and it misses more than a model would.
echo   With it, you can write however it comes out and it works the rest
echo   out for itself.
echo.
echo   It all runs ON THIS COMPUTER. Nothing you type is sent anywhere,
echo   ever - that is the whole reason it is set up this way.
echo.
echo   This will need to download about 3 GB. On a slow connection that
echo   is a long wait, so start it when you can leave it running.
echo   ---------------------------------------------------------------
echo.
set "GO="
set /p "GO=  Set it up now? (type y then Enter): "
if /i not "%GO%"=="y" goto declined

rem ---- 1. Is Ollama here? ----------------------------------------------------
set "OLLAMA="
where ollama >nul 2>nul && set "OLLAMA=ollama"
if not defined OLLAMA if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"

if defined OLLAMA (
  echo.
  echo   Ollama is already installed. Good - skipping that part.
  goto haveollama
)

echo.
echo   Ollama is the bit that runs the model on your computer. It isn't
echo   installed yet. I can download it ^(about 700 MB^) and start its
echo   installer for you - you click through the normal install window.
echo.
set "GO="
set /p "GO=  Download and install Ollama? (type y then Enter): "
if /i not "%GO%"=="y" goto declined

echo.
echo   Downloading Ollama... leave this window alone while it runs.
curl.exe -L --fail -o "%TEMP%\OllamaSetup.exe" https://ollama.com/download/OllamaSetup.exe
if errorlevel 1 goto nodownload
echo.
echo   Starting the installer. Click through it, then come back here.
start /wait "" "%TEMP%\OllamaSetup.exe"

set "OLLAMA="
where ollama >nul 2>nul && set "OLLAMA=ollama"
if not defined OLLAMA if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not defined OLLAMA goto notinstalled

:haveollama
rem ---- 2. Which model ---------------------------------------------------------
rem  SMALL BY DEFAULT. A laptop without a dedicated graphics card runs the big
rem  one at a crawl, and a sorter you wait ten seconds for is a sorter you stop
rem  using. The small one is a little less accurate and a lot faster.
echo.
echo   ---------------------------------------------------------------
echo   WHICH MODEL
echo     1  qwen3:4b   about 2.6 GB  - fits any laptop, fast        (recommended)
echo     2  qwen3:14b  about 9 GB    - reads better, needs a good graphics card
echo   ---------------------------------------------------------------
set "PICK=1"
set /p "PICK=  Which? (1 or 2, then Enter - just Enter for 1): "
set "MODEL=qwen3:4b"
if "%PICK%"=="2" set "MODEL=qwen3:14b"

echo.
echo   Pulling %MODEL% ... this is the big download. Leave it running.
"%OLLAMA%" pull %MODEL%
if errorlevel 1 goto nopull

rem ---- 3. Reading photographs (optional) -------------------------------------
echo.
echo   ---------------------------------------------------------------
echo   READING PHOTOGRAPHS ^(optional^)
echo   With one more model you can photograph a timetable on a wall and
echo   the app will read it. About 4.7 GB, and you can do this later.
echo   ---------------------------------------------------------------
set "GO="
set /p "GO=  Add that too? (type y then Enter, or just Enter to skip): "
if /i "%GO%"=="y" (
  echo.
  echo   Pulling llava ... leave it running.
  "%OLLAMA%" pull llava
)

rem ---- 4. Write the settings --------------------------------------------------
rem  KEEPS EVERY OTHER LINE. The settings file may hold things this script knows
rem  nothing about, and rewriting it wholesale would throw them away.
echo.
echo   Writing your settings...
if exist ".env" (
  > ".env.new" (
    for /f "usebackq delims=" %%L in (".env") do (
      set "LINE=%%L"
      echo !LINE! | findstr /b /i /c:"AI_ENGINE=" >nul || (
        echo !LINE! | findstr /b /i /c:"AI_MODEL=" >nul || echo !LINE!
      )
    )
  )
  >> ".env.new" echo AI_ENGINE=ollama
  >> ".env.new" echo AI_MODEL=%MODEL%
  move /y ".env.new" ".env" >nul
) else (
  > ".env" echo # Written by "Set up smart sorting.bat". Safe to edit by hand.
  >> ".env" echo AI_ENGINE=ollama
  >> ".env" echo AI_MODEL=%MODEL%
)

echo.
echo   ---------------------------------------------------------------
echo   Done. Sorting is set up with %MODEL%.
echo.
echo   Close the organiser if it is open, then start it again. The dot
echo   at the top right of every page will say "sorting on".
echo   ---------------------------------------------------------------
echo.
pause
exit /b 0

:declined
echo.
echo   Left everything as it is. The app works without this - it just
echo   reads what you type less well. Run this file any time.
echo.
pause
exit /b 0

:nodownload
echo.
echo   The download didn't finish - usually no internet, or a firewall.
echo   Nothing was changed. You can also get it yourself from
echo   https://ollama.com/download and then run this file again.
echo.
pause
exit /b 1

:notinstalled
echo.
echo   Ollama still isn't showing up. If the installer is still open,
echo   finish it and run this file again. Nothing was changed.
echo.
pause
exit /b 1

:nopull
echo.
echo   The model didn't download - usually the connection dropped.
echo   Nothing was changed. Run this file again to pick up where it
echo   left off; anything already downloaded is kept.
echo.
pause
exit /b 1
