@echo off
title Autonomy Baby - Exhibition Server
cd /d "%~dp0"
echo =============================================================
echo   AUTONOMY BABY - REIMAGINING AUTONOMY (SOCIETY 5.0)
echo   Starting local installation server...
echo =============================================================
echo.

start "" "http://localhost:3000"
node server.js
pause
