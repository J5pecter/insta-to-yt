@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   SocialRelay - Starting Self-Hosted Platform
echo ============================================================

if not exist ".env" (
    echo [.env] Not found. Creating from .env.example...
    copy .env.example .env >nul
)

if not exist ".venv\Scripts\python.exe" (
    echo [.venv] Virtual environment not found. Please install Python and virtual environment.
    pause
    exit /b 1
)

echo Starting SocialRelay backend and dashboard on http://localhost:8000
echo Default admin password: admin1234
start "" http://localhost:8000

.venv\Scripts\python -m uvicorn api.app.main:app --host 0.0.0.0 --port 8000
