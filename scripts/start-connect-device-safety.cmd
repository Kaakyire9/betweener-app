@echo off
setlocal
cd /d "%~dp0.."
node scripts\start-connect-device-safety.cjs %*
set "launcherExit=%ERRORLEVEL%"
if not "%launcherExit%"=="0" pause
exit /b %launcherExit%
