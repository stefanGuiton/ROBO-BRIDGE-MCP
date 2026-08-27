@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required for verification. & exit /b 1)
where python >nul 2>nul || where py >nul 2>nul || (echo Python 3.10+ is required for the local web server and verifier. & exit /b 1)
echo Checking LOGO ROBO...
python scripts\verify.py 2>nul || py -3 scripts\verify.py
if errorlevel 1 exit /b 1
echo.
echo LOGO ROBO setup verification complete.
echo No package installation is required. NVIDIA Newton has been removed.
