@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if %errorlevel% equ 0 (
  set "ADVISORY_NODE=node.exe"
) else (
  set "ADVISORY_NODE=%ProgramFiles%\nodejs\node.exe"
)
if not exist "%ProgramFiles%\nodejs\node.exe" (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo Node.js 24 or later is required. Install Node.js LTS and try again.
    exit /b 1
  )
)
if exist ".env" (
  "%ADVISORY_NODE%" --env-file=.env server.mjs
) else (
  "%ADVISORY_NODE%" server.mjs
)
exit /b %errorlevel%
