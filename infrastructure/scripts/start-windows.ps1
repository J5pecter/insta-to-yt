# SocialRelay V2 — Windows Start Script
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Error "Virtual environment not found. Run .\infrastructure\scripts\setup-windows.ps1 first."
}

Write-Host "[SocialRelay] Starting FastAPI, Embedded Worker, and Scheduler on http://localhost:8000 ..." -ForegroundColor Cyan
Start-Process "http://localhost:8000"
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
