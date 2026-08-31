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

call :net pull
if not errorlevel 1 goto pulled
if "%NETWHY%"=="tls" goto tlsfailed
if "%NETWHY%"=="nonet" goto netfailed
goto failed

:pulled
if defined GITOPT call :remember
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
rem THE SAME WALL ON THE FIRST CONNECT AS ON EVERY LATER ONE, so the same ways
rem round it. This used to be a bare fetch, so somebody whose network refuses
rem the handshake could not get started at all.
call :net fetch origin
if not errorlevel 1 goto fetched
if "%NETWHY%"=="tls" goto tlsfailed
if "%NETWHY%"=="nonet" goto netfailed
goto failed

:fetched
if defined GITOPT call :remember
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

:tlsfailed
echo.
echo   --------------------------------------------------------------
echo   The secure connection to GitHub was interrupted, and the three
echo   ways round it did not get through either.
echo.
echo   Your internet is working - this is the encrypted handshake being
echo   refused partway through. Two things cause it almost every time:
echo     - a school or office network that inspects traffic
echo     - GitHub being unreachable from where you are
echo.
echo   Worth trying, in this order:
echo     1. Run this again in a minute. It is often intermittent.
echo     2. Use your phone's hotspot instead of the school wifi. A network
echo        that inspects traffic will refuse this however it is asked,
echo        and one that doesn't usually just works.
echo     3. If git on this computer is a few years old, installing the
echo        latest from https://git-scm.com/download/win fixes this on
echo        its own surprisingly often.
echo.
echo   Nothing was changed. Your "data" folder and your settings are
echo   untouched, and the app still runs exactly as it did - it is only
echo   the new version that could not be fetched.
echo   --------------------------------------------------------------
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

:failed
echo.
echo   Could not finish, and it is not the network - GitHub answered.
echo   Usually that is a file in the app's own folder that you have
echo   edited, which git will not overwrite.
echo   Your "data" folder and your settings are untouched either way.
echo.
echo   Git's own message is just above this, under "Getting the latest
echo   version" - that line names the file it stopped on.
rem
rem AND WHAT THE SERVER SAID, only when the server is what went wrong. The probe
rem below asks GitHub whether it is reachable; when the fault is a file on this
rem computer that probe SUCCEEDS, and printing its answer here put a healthy
rem list of branches on screen under the words "what it actually said" - which
rem reads as the error, and is not one.
if defined PROBEFAILED echo.
if defined PROBEFAILED echo   And what GitHub said when asked:
if defined PROBEFAILED type "%TEMP%\po-update-why.txt"
echo.
pause
exit /b 1

rem ---- ONE NETWORK REQUEST, ASKED ABOUT AND THEN TRIED FOUR WAYS ------------
rem
rem WORK OUT WHY BEFORE TRYING ANYTHING.
rem
rem This used to say "usually that is no internet, or a file you have edited" to
rem every failure there is. Somebody on a school network got a TLS handshake
rem refusal - the secure connection to GitHub interrupted, which is what a
rem network that inspects traffic does, and what GitHub does in some countries -
rem and was told to check their internet, which was fine, and to look for a file
rem they had edited, which they hadn't.
rem
rem So the server is asked once more and what it says decides what happens next.
rem Climbing through security layers in front of somebody whose real problem is a
rem file they edited would be the same wrong diagnosis with a progress bar on it.
rem
rem THEN, IF IT IS THE HANDSHAKE, THE SAME REQUEST WITH ONE MORE THING TURNED
rem OFF EACH TIME. A refused handshake is not one fault but a family of them,
rem and which one it is cannot be seen from here.
rem
rem   HTTP/1.1  the newer protocol is agreed inside the handshake itself, and a
rem             network that inspects traffic often mishandles that part - so
rem             not asking for it can be the whole of the fix
rem   OpenSSL   schannel, the security layer Windows uses and git uses by
rem             default, is the one refusing here. Git ships another, and it
rem             does not have the same faults.
rem
rem NONE OF THIS STOPS TO ASK FIRST. It used to offer "try the other security
rem layer? (y/n)", which is not a question somebody who wanted the new version
rem can answer, asked at the moment they are least able to answer it. Nothing
rem here writes a file, so a rung that fails costs a moment and nothing else.
rem
rem %* is the git command to make - "pull", or "fetch origin" on a first connect.
:net
set "GITOPT="
set "NETWHY="
git %*
if not errorlevel 1 exit /b 0

echo.
echo   Working out what went wrong...
set "PROBEFAILED="
git ls-remote "%REPO%" HEAD >"%TEMP%\po-update-why.txt" 2>&1
if errorlevel 1 set "PROBEFAILED=1"
findstr /i /c:"schannel" /c:"SSL" /c:"TLS" /c:"handshake" /c:"certificate" "%TEMP%\po-update-why.txt" >nul
if errorlevel 1 goto :netother
set "NETWHY=tls"

echo.
echo   The secure connection to GitHub was refused. There are three ways
echo   round that, and none of them changes anything on this computer, so
echo   I am simply trying them.
echo.
echo   Without the newer connection protocol, which a network that
echo   inspects traffic often mishandles...
set "GITOPT=-c http.version=HTTP/1.1"
git %GITOPT% %*
if not errorlevel 1 exit /b 0
echo.
echo   Still no. With a different security layer - the one Windows uses is
echo   the one being refused, and git ships another that isn't...
set "GITOPT=-c http.sslBackend=openssl"
git %GITOPT% %*
if not errorlevel 1 exit /b 0
echo.
echo   And both together...
set "GITOPT=-c http.sslBackend=openssl -c http.version=HTTP/1.1"
git %GITOPT% %*
if not errorlevel 1 exit /b 0
set "GITOPT="
exit /b 1

:netother
findstr /i /c:"Could not resolve" /c:"unable to access" /c:"timed out" /c:"Failed to connect" "%TEMP%\po-update-why.txt" >nul
if not errorlevel 1 set "NETWHY=nonet"
exit /b 1

rem Whatever got through is what next time starts with, so the waiting happens
rem once rather than every time. FOR THIS FOLDER ONLY - not a global change to
rem somebody's machine to get one repository working.
:remember
echo %GITOPT% | findstr /c:"sslBackend" >nul
if not errorlevel 1 git config http.sslBackend openssl >nul 2>nul
echo %GITOPT% | findstr /c:"http.version" >nul
if not errorlevel 1 git config http.version HTTP/1.1 >nul 2>nul
echo.
echo   That worked, and I have remembered how for this folder, so the next
echo   update should go straight through.
exit /b 0
