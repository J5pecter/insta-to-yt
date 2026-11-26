# SocialRelay V2 — Windows Setup Script
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

Write-Host "[SocialRelay] Checking prerequisites..." -ForegroundColor Cyan
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python 3.11+ is required on PATH."
}

if (-not (Test-Path ".venv")) {
    Write-Host "[SocialRelay] Creating Python virtual environment..."
    python -m venv .venv
}

Write-Host "[SocialRelay] Installing Python dependencies..."
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Create runtime directories outside public source control
$AppData = Join-Path $env:LOCALAPPDATA "SocialRelay"
New-Item -ItemType Directory -Force -Path $AppData, "$AppData\data", "$AppData\storage\originals", "$AppData\storage\processed", "$AppData\storage\thumbnails", "$AppData\storage\temporary", "$AppData\storage\backups", "$AppData\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "data", "storage\originals", "storage\processed", "storage\thumbnails", "storage\temporary", "storage\backups" | Out-Null

# Generate .env with secure local keys if missing
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    $FernetKey = .\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    $SessionKey = .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
    (Get-Content ".env") -replace "CHANGE_ME_GENERATE_WITH_FERNET_KEY", $FernetKey `
        -replace "change-this-to-a-very-secure-random-string-at-least-32-chars", $SessionKey | Set-Content ".env"
    Write-Host "[SocialRelay] Generated .env with unique local encryption keys." -ForegroundColor Green
}

Write-Host "[SocialRelay] Initializing database..."
.\.venv\Scripts\python.exe -c "from api.app.models import init_db; init_db()"

Write-Host "[SocialRelay] Verifying FFmpeg..."
.\.venv\Scripts\python.exe -c "from api.app.services.media.processor import video_processor; print('FFmpeg:', video_processor.ffmpeg_bin)"

if ((Get-Command npm -ErrorAction SilentlyContinue) -and (-not (Test-Path "apps\web\dist\index.html"))) {
    Write-Host "[SocialRelay] Building frontend..."
    Push-Location "apps\web"
    npm install
    npm run build
    Pop-Location
}

Write-Host "[SocialRelay] Setup complete! Run .\infrastructure\scripts\start-windows.ps1 to launch." -ForegroundColor Green
