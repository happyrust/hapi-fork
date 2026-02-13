# hapi 自动更新编译并运行 hub 的脚本
# 用法: .\dev.ps1
# 功能: 终止旧 hub 进程 → 安装依赖 → 构建 web → 生成嵌入资源 → 启动 hub

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# 终止已有的 hapi hub 进程（占用 3006 端口）
Write-Host "[0/4] 检查并终止旧 hub 进程..." -ForegroundColor Yellow
$lines = netstat -ano | Select-String ":3006\s+.*LISTENING"
if ($lines) {
    $pids = $lines | ForEach-Object {
        if ($_ -match '\s(\d+)\s*$') { $Matches[1] }
    } | Select-Object -Unique
    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  终止进程: $($proc.ProcessName) (PID: $pid)" -ForegroundColor Yellow
            Stop-Process -Id $pid -Force
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

Write-Host "[4/4] 启动 hapi hub..." -ForegroundColor Green
bun run --cwd "$ProjectRoot\hub" start
