@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Rotate-Pairing-Key.ps1"
if errorlevel 1 (
  echo.
  echo Pairing key rotation failed.
  pause
)
