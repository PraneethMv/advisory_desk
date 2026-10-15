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
rem The PDF reader is the only package. Install it once if it is missing.
if not exist "node_modules\pdfjs-dist" (
  echo Installing the PDF reader package...
  set "ADVISORY_NPM=npm.cmd"
  where npm.cmd >nul 2>nul || set "ADVISORY_NPM=%ProgramFiles%\nodejs\npm.cmd"
  call "%ADVISORY_NPM%" install
  if errorlevel 1 (
    echo Package installation failed. Run "npm install" in this folder and try again.
    exit /b 1
  )
)
if exist ".env" (
  "%ADVISORY_NODE%" --env-file=.env server.mjs
) else (
  "%ADVISORY_NODE%" server.mjs
)
exit /b %errorlevel%
