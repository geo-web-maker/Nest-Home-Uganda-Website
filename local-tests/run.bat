@echo off
REM Windows launcher: runs run.sh through Git Bash or WSL.
set ARGS=%*
if "%ARGS%"=="" set ARGS=quick
where bash >nul 2>nul
if %errorlevel%==0 (
  bash "%~dp0run.sh" %ARGS%
) else (
  echo Bash was not found. Install Git for Windows ^(includes Git Bash^) or enable WSL, then run this again.
  exit /b 1
)
