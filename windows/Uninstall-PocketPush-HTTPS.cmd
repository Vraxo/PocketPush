@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-PocketPush-HTTPS.ps1"
if errorlevel 1 (
  echo.
  echo PocketPush HTTPS removal failed. Review the error above.
  pause
)
