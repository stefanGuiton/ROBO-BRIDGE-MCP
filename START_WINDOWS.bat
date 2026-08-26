@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run SETUP_WINDOWS.bat first.
  exit /b 1
)
call .venv\Scripts\activate.bat
python scripts\run_foundation.py
