# hapi 自动更新编译并运行 hub 的脚本
# 用法: .\dev.ps1
# 功能: 终止旧 hub 进程 → 安装依赖 → 构建 web → 生成嵌入资源 → 后台启动 hub

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$LogFile = "$ProjectRoot\hub.log"

# 终止已有的 hapi hub 进程（占用 3006 端口）
Write-Host "[0/4] 检查并终止旧 hub 进程..." -ForegroundColor Yellow
$lines = netstat -ano | Select-String ":3006\s+.*LISTENING"
if ($lines) {
    $pids = $lines | ForEach-Object {
        if ($_ -match '\s(\d+)\s*$') { $Matches[1] }
    } | Select-Object -Unique
    foreach ($p in $pids) {
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  终止进程: $($proc.ProcessName) (PID: $p)" -ForegroundColor Yellow
            Stop-Process -Id $p -Force
        }
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "  无旧进程" -ForegroundColor DarkGray
}

Write-Host "[1/4] 安装依赖..." -ForegroundColor Cyan
bun install --cwd $ProjectRoot

Write-Host "[2/4] 构建 web..." -ForegroundColor Cyan
bun run --cwd $ProjectRoot build:web

Write-Host "[3/4] 生成嵌入式 web 资源..." -ForegroundColor Cyan
bun run --cwd "$ProjectRoot\hub" generate:embedded-web-assets

Write-Host "[4/4] 后台启动 hapi hub..." -ForegroundColor Green
$hubProcess = Start-Process -FilePath "bun" `
    -ArgumentList "run","--cwd","$ProjectRoot\hub","start" `
    -WorkingDirectory "$ProjectRoot\hub" `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError "$ProjectRoot\hub.err.log" `
    -PassThru -WindowStyle Hidden

# 等待几秒确认进程存活
Start-Sleep -Seconds 3
if (!$hubProcess.HasExited) {
    Write-Host "  hub 已在后台启动 (PID: $($hubProcess.Id))" -ForegroundColor Green
    Write-Host "  日志: $LogFile" -ForegroundColor DarkGray
    Write-Host "  错误日志: $ProjectRoot\hub.err.log" -ForegroundColor DarkGray
} else {
    Write-Host "  hub 启动失败，退出码: $($hubProcess.ExitCode)" -ForegroundColor Red
    Write-Host "  查看错误日志: $ProjectRoot\hub.err.log" -ForegroundColor Red
    exit 1
}

Write-Host "`n完成! hub 运行在 http://localhost:3006" -ForegroundColor Green
