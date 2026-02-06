# HAPI 构建和运行脚本
# 用法: powershell -ExecutionPolicy Bypass -File build-and-run.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== HAPI 构建脚本 ===" -ForegroundColor Cyan

# 设置工作目录
Set-Location $PSScriptRoot

# 步骤1: 构建 hub
Write-Host "`n[1/3] 构建 hub 模块..." -ForegroundColor Yellow
Set-Location hub
bun run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Hub 构建失败!" -ForegroundColor Red
    exit 1
}
Set-Location ..

# 步骤2: 构建 web
Write-Host "`n[2/3] 构建 web 模块..." -ForegroundColor Yellow
Set-Location web
bun run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web 构建失败!" -ForegroundColor Red
    exit 1
}
Set-Location ..

# 步骤3: 运行 hub
Write-Host "`n[3/3] 启动 hub..." -ForegroundColor Yellow
Set-Location hub
bun run start
