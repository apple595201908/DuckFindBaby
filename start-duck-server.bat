@echo off
setlocal
cd /d "%~dp0"
title Duck Gene Lab Analytics Server

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 22.13 or newer.
  pause
  exit /b 1
)
echo Starting Duck Gene Lab personal server...
echo Keep this window open while players are using the game.
echo.
call npm run analytics:start

if errorlevel 1 (
  echo.
  echo The server stopped because of an error.
  pause
)
