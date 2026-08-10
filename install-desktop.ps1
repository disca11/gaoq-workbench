$ErrorActionPreference = 'Stop'
param([string]$WorkbenchUrl = "http://localhost:8787")
$dir = $PSScriptRoot

# 0) 解析工作台地址：命令行参数 > 同目录 workbench-url.txt 首行(非注释) > 默认本机
$urlFile = Join-Path $dir 'workbench-url.txt'
if ($WorkbenchUrl -eq 'http://localhost:8787' -and (Test-Path $urlFile)) {
  $first = (Get-Content -Path $urlFile -TotalCount 1 -ErrorAction SilentlyContinue)
  if ($first) {
    $first = $first.Trim()
    if ($first -and -not $first.StartsWith('#')) { $WorkbenchUrl = $first }
  }
}

# 1) 探测 Node：优先 PATH，否则用 USERPROFILE 下的 WorkBuddy 管理版（按版本目录自动匹配，不写死中文路径）
$node = $null
if (Get-Command node -ErrorAction SilentlyContinue) { $node = 'node' }
else {
  $base = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path $base) {
    $cands = @(Get-ChildItem -Path $base -Filter node.exe -Recurse -ErrorAction SilentlyContinue)
    if ($cands.Count) { $node = $cands[0].FullName }
  }
}
if (-not $node) {
  Write-Host 'Node.js not found. 请先安装 Node.js (https://nodejs.org)，或确保 WorkBuddy 已安装（自带管理版 Node），然后重新运行本安装器。' -ForegroundColor Red
  Read-Host '按 Enter 退出'
  exit 1
}
Write-Host ('[OK] 已找到 Node: ' + $node) -ForegroundColor Green

# 2) 探测浏览器（优先 Edge/Chrome 的 --app 独立窗口模式）
function Find-Browser {
  $cands = @(
    'msedge',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'chrome',
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    'chromium'
  )
  foreach ($p in $cands) {
    $c = Get-Command $p -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    if (Test-Path $p) { return $p }
  }
  return $null
}
$browser = Find-Browser
if (-not $browser) {
  Write-Host '未检测到 Edge/Chrome，将用系统默认浏览器打开（独立窗口模式可能不可用）。' -ForegroundColor Yellow
  $browser = 'cmd /c start'
}

# 3) 生成 start-workbench.vbs
#    本地模式（地址含 localhost/127）：先隐藏启动本机同步服务，再开 App 窗口
#    公网模式（如 Render 地址）：直接开 App 窗口指向公网地址，数据在云端，本机无需常开服务
$vbsPath = Join-Path $dir 'start-workbench.vbs'
$isLocal = $WorkbenchUrl -match 'localhost|127\.'
if ($isLocal) {
  $serverLaunch = 'W.Run "cmd /c cd /d """ & DIR & """ && start-server.bat", 0, False'
  $sleepMs = 2500
} else {
  $serverLaunch = ''
  $sleepMs = 1200
}
$vbsTpl = @"
Set W = CreateObject("WScript.Shell")
Set F = CreateObject("Scripting.FileSystemObject")
Dim DIR : DIR = F.GetParentFolderName(W.ScriptFullName)
$serverLaunch
W.Sleep $sleepMs
W.Run "__BROWSER__ --app=__URL__", 1, False
"@
$vbs = $vbsTpl -replace '__BROWSER__', $browser -replace '__URL__', $WorkbenchUrl
Set-Content -Path $vbsPath -Value $vbs -Encoding ASCII

# 4) 桌面快捷方式 -> vbs
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '高全的工作台.lnk'
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $vbsPath
$s.WorkingDirectory = $dir
$s.Description = '高全的工作台 - 启动同步服务并打开'
$s.WindowStyle = 7
$s.Save()

# 5) 登录自启：把 vbs 复制到启动文件夹
$startup = [Environment]::GetFolderPath('Startup')
Copy-Item -Path $vbsPath -Destination (Join-Path $startup 'start-workbench.vbs') -Force

Write-Host ''
Write-Host '[OK] 安装完成：' -ForegroundColor Green
Write-Host ('  桌面图标   : ' + $lnk)
Write-Host ('  开机自启   : ' + $startup + '\start-workbench.vbs')
Write-Host '正在启动工作台...' -ForegroundColor Cyan
& $vbsPath
Read-Host '按 Enter 关闭安装器'
