@echo off
setlocal
cd /d "%~dp0"
if not exist .venv (
  py -3.12 -m venv .venv 2>nul || py -3.11 -m venv .venv 2>nul || py -3.10 -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r physics\newton-service\requirements.txt
python scripts\verify.py
if errorlevel 1 exit /b 1
echo.
echo Foundation setup complete.
echo Newton is optional and is not installed by this script.
