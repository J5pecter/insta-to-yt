@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
set BACKUP_DIR=storage\backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [SocialRelay] Creating atomic SQLite backup...
.\.venv\Scripts\python.exe -c "import sqlite3; con = sqlite3.connect('data/socialrelay.db'); con.execute('VACUUM INTO ''%BACKUP_DIR%\\socialrelay_db_%TIMESTAMP%.db'''); con.close(); print('[SocialRelay] Backup created at %BACKUP_DIR%\\socialrelay_db_%TIMESTAMP%.db')"

echo [SocialRelay] Backup completed.
