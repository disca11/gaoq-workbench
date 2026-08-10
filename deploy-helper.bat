@echo off
setlocal
:: 一键推送代码到 GitHub（部署用）
:: 用法：先按 deploy-guide.md 注册 GitHub 并生成 Token，再双击本文件按提示输入
title 高全的工作台 - 推送到 GitHub

set /p GHUSER=GitHub 用户名（如 disca11）: 
set /p REPO=仓库名（如 gaoq-workbench）: 
set /p PAT=GitHub Personal Access Token（含 repo 权限，ghp_ 开头）: 

cd /d "%~dp0"

git remote remove origin >nul 2>&1
git remote add origin https://%GHUSER%:%PAT%@github.com/%GHUSER%/%REPO%.git
git branch -M main
echo.
echo 正在推送（若提示是否继续信任，选 yes）...
git push -u origin main

echo.
if errorlevel 1 (
  echo [失败] 请检查用户名/仓库名/Token 是否正确，仓库需在 GitHub 网页上先建好（空仓库即可）。
) else (
  echo [成功] 代码已推到 GitHub。接下来去 Render 新建 Blueprint 选这个仓库即可。
)
echo 推送用的 Token 已写进本地 remote，用完后建议运行：git remote remove origin
pause
