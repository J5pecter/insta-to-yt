# SocialRelay V2 — Windows Update Script
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

Write-Host "[SocialRelay] Creating safety backup before update..."
.\infrastructure\scripts\backup.bat

Write-Host "[SocialRelay] Pulling latest source updates..."
git pull --ff-only

Write-Host "[SocialRelay] Updating Python dependencies..."
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location "apps\web"
    npm install
    npm run build
    Pop-Location
}

Write-Host "[SocialRelay] Update complete!" -ForegroundColor Green
