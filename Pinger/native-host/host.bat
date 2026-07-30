@echo off
setlocal
REM Once Node dene; yoksa PowerShell host (ekstra kurulum yok)
where node >nul 2>&1
if %ERRORLEVEL%==0 (
  node "%~dp0host.js"
  exit /b %ERRORLEVEL%
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0host.ps1"
exit /b %ERRORLEVEL%
