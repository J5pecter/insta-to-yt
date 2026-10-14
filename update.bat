@echo off
cd /d "%~dp0"
echo Updating the downloader (fixes most "Instagram stopped working" problems)...
".venv\Scripts\python.exe" -m pip install --upgrade yt-dlp
pause
