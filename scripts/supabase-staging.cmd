@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0invoke-staging-supabase.ps1" %*
exit /b %ERRORLEVEL%
