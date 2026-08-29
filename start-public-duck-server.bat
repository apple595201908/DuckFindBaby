@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Duck Gene Lab Public HTTPS Server

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 22.13 or newer.
  pause
  exit /b 1
)

if not exist "node_modules\wrangler\bin\wrangler.js" (
  echo Installing project dependencies for the first run...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting the public HTTPS game link...
echo Keep this window and computer running while using the link.
echo.
call npm run public:start

echo.
echo The public link has stopped.
pause
