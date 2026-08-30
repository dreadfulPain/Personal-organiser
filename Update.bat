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

rem NO AUTOMATIC HOUSEKEEPING IN A FOLDER THAT SYNCS.
rem
rem Git tidies its own storage every so often after a pull, and the last step of
rem that is deleting files it has just finished copying elsewhere. In a folder
rem inside OneDrive or Dropbox those files are held open by the sync program, so
rem the deletion fails and git stops to ask "Deletion of directory failed. Should
rem I try again? (y/n)" - which is alarming, is about nothing, and lands in the
rem middle of an update on somebody who only wanted the new version.
rem
rem Nothing is lost either way: the tidying is optional and the folder is a copy
rem of what is on the server. Turned off here so the question never comes up.
git config gc.auto 0 >nul 2>nul

git pull
if errorlevel 1 goto whyfailed
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

:whyfailed
rem WORK OUT WHY BEFORE GUESSING AT IT.
rem
rem This used to say "usually that is no internet, or a file you have edited" to
rem every failure there is. Somebody on a school network got a TLS handshake
rem refusal - the secure connection to GitHub being interrupted, which is what a
rem network that inspects traffic does, and what GitHub does in some countries -
rem and was told to check their internet, which was fine, and to look for a file
rem they had edited, which they hadn't.
rem
rem So: ask the server once more, keep what it says, and read it.
echo.
echo   Working out what went wrong...
git ls-remote "%REPO%" HEAD >"%TEMP%\po-update-why.txt" 2>&1
findstr /i /c:"schannel" /c:"SSL" /c:"TLS" /c:"handshake" /c:"certificate" "%TEMP%\po-update-why.txt" >nul && goto tlsfailed
findstr /i /c:"Could not resolve" /c:"unable to access" /c:"timed out" /c:"Failed to connect" "%TEMP%\po-update-why.txt" >nul && goto netfailed
goto failed

:tlsfailed
echo.
echo   --------------------------------------------------------------
echo   The secure connection to GitHub was interrupted.
echo.
echo   Your internet is working - this is the encrypted handshake being
echo   refused partway through. Two things cause it almost every time:
echo     - a school or office network that inspects traffic
echo     - GitHub being unreliable from where you are
echo.
echo   Worth trying, in this order:
echo     1. Run this again in a minute. It is often intermittent.
echo     2. Use your phone's hotspot instead of the school wifi.
echo     3. Let me try a different security layer - see below.
echo   --------------------------------------------------------------
echo.
set "TRY="
set /p "TRY=  Try the other security layer now? (type y then Enter): "
if /i not "%TRY%"=="y" goto untouched

echo.
echo   Trying again with OpenSSL instead of Windows' own...
git -c http.sslBackend=openssl pull
if errorlevel 1 goto stillfailed

rem It worked, so remember it FOR THIS FOLDER ONLY - not a global setting
rem change on somebody's machine to fix one repository.
git config http.sslBackend openssl >nul 2>nul
echo.
echo   That worked, and I have remembered it for this folder, so the next
echo   update should just work.
goto done

:stillfailed
echo.
echo   That didn't work either. Nothing was changed.
echo   The phone-hotspot one is the most likely to work - a school network
echo   that inspects traffic will stop this however it is asked.
echo.
pause
exit /b 1

:netfailed
echo.
echo   Couldn't reach GitHub at all - the connection didn't get that far.
echo   Usually no internet, or a network that blocks it. Nothing was
echo   changed, and your "data" folder and settings are untouched.
echo.
pause
exit /b 1

:untouched
echo.
echo   Left it there. Nothing was changed, and your "data" folder and
echo   your settings are untouched.
echo.
pause
exit /b 1

:failed
echo.
echo   Could not finish, and it is not the network - GitHub answered.
echo   Usually that is a file in the app's own folder that you have
echo   edited, which git will not overwrite.
echo   Your "data" folder and your settings are untouched either way.
echo.
echo   What it actually said:
type "%TEMP%\po-update-why.txt"
echo.
pause
exit /b 1
