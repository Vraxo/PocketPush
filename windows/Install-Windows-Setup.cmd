@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Windows-Setup.ps1"
if errorlevel 1 (
  echo.
  echo PocketPush setup failed. Review the error above.
  pause
)
