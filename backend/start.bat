@echo off
title SIH PS Helper Backend
cd /d "%~dp0"
echo.
echo  ????????????????????????????????????????
echo  ?   SIH PS Helper ? Python Backend     ?
echo  ?   http://127.0.0.1:7842              ?
echo  ????????????????????????????????????????
echo.

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

:: Install dependencies if needed
echo [*] Checking dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [*] Installing dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo [*] Starting server on http://127.0.0.1:7842 ...
echo [*] Press Ctrl+C to stop.
echo.
python server.py

pause
