@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-PhonePush.ps1"
if errorlevel 1 (
  echo.
  echo PhonePush stopped with an error.
  pause
)
