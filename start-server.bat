@echo off
setlocal
set "DIR=%~dp0"
set "NODE="

:: 优先使用 PATH 中的 node，否则扫描 WorkBuddy 管理版（按版本目录自动匹配）
where node >nul 2>nul && set "NODE=node"
if not defined NODE (
  for /d %%v in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%v\node.exe" set "NODE=%%v\node.exe"
  )
)
if not defined NODE (
  echo [ERROR] Node.js not found. Install from https://nodejs.org or keep WorkBuddy installed, then re-run install-desktop.bat.
  pause
  exit /b 1
)

cd /d "%DIR%"
start "" /min "%NODE%" server.js
exit /b 0
