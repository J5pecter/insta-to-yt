@echo off
title Insta to YouTube
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo First start: installing what the app needs. This takes a few minutes...
  python -m venv .venv || goto :nopython
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :failed
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  A settings file called .env was created and will open in Notepad.
  echo  Set ADMIN_PASSWORD ^(and your keys^), save it, then run start.bat again.
  echo.
  start notepad ".env"
  pause
  exit /b
)

".venv\Scripts\python.exe" -m app
pause
exit /b

:nopython
echo Python is not installed. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1

:failed
echo Installing failed. Check your internet connection and run start.bat again.
pause
exit /b 1
