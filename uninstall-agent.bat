@echo off
setlocal
fltmc >nul 2>&1
if errorlevel 1 (
  echo Dang yeu cau quyen Administrator...
  PowerShell.exe -NoProfile -Command "Start-Process PowerShell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0uninstall-agent.ps1\"'"
  exit /b
)
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-agent.ps1"
if errorlevel 1 (
  echo.
  echo Go cai dat that bai hoac can quyen Administrator.
)
pause
