@echo off
setlocal
cd /d "%~dp0"
python scripts\run_foundation.py 2>nul || py -3 scripts\run_foundation.py
