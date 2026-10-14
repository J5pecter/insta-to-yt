@echo off
title Set up the free local AI
cd /d "%~dp0"

where ollama >nul 2>nul
if errorlevel 1 goto :noollama

set "MODEL=gemma3:4b"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /c:"LOCAL_AI_MODEL=" ".env"`) do if not "%%b"=="" set "MODEL=%%b"

echo.
echo  Downloading the local AI model "%MODEL%" - one time only, about 2-4 GB.
echo  This can take a while. You can watch the progress below.
echo.
ollama pull %MODEL%
if errorlevel 1 goto :pullfailed

echo.
echo  Done! Now make sure your .env file has:  AI_PROVIDER=local
echo  Then start the app with start.bat. The top bar should say "Local AI".
pause
exit /b

:noollama
echo.
echo  Ollama (the free program that runs the local AI) is not installed yet.
echo  Your browser will open the download page. Install it, then run this file again.
echo.
start https://ollama.com/download
pause
exit /b 1

:pullfailed
echo.
echo  The download did not finish. Check that the Ollama app is running (look for the
echo  llama icon near the clock) and your internet works, then run this file again.
pause
exit /b 1
