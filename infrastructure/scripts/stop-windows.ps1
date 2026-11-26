# SocialRelay V2 — Windows Stop Script
Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "uvicorn api\.app\.main:app"
} | Stop-Process -Force
Write-Host "[SocialRelay] Stopped SocialRelay server." -ForegroundColor Yellow
