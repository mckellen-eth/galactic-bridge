@echo off
setlocal

echo Starting Galactic Bridge...
echo.

REM 1. Check Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

REM 2. Config file — create from template on first run
if not exist "%~dp0.env" (
  if exist "%~dp0.env.example" (
    copy "%~dp0.env.example" "%~dp0.env" >nul
    echo.
    echo ============================================================
    echo   A config file .env was created from .env.example
    echo.
    echo   Open .env and set VITE_REOWN_PROJECT_ID
    echo   Get a free Project ID at https://dashboard.reown.com
    echo.
    echo   Without it the "Connect Wallet" window will be EMPTY.
    echo ============================================================
    echo.
    pause
  )
)

REM 3. Frontend reads its own .env — copy the VITE_ lines from the root config
if exist "%~dp0.env" (
  findstr /b "VITE_" "%~dp0.env" > "%~dp0frontend\.env" 2>nul
)

REM 4. Backend deps — check for the express package, not just the folder
if not exist "%~dp0backend\node_modules\express" (
  echo Installing backend dependencies...
  echo This may take 1-2 minutes on first run.
  pushd "%~dp0backend"
  call npm install
  if errorlevel 1 (
    echo Backend npm install failed. Check your internet connection.
    popd
    pause
    exit /b 1
  )
  popd
  echo Backend dependencies installed.
  echo.
)

REM 5. Frontend deps — check for the vite executable, not just the folder.
REM    A partial/interrupted install leaves node_modules present but without the vite bin.
if not exist "%~dp0frontend\node_modules\.bin\vite.cmd" (
  echo Frontend dependencies missing or incomplete. Installing...
  echo This may take 1-2 minutes on first run.
  if exist "%~dp0frontend\node_modules" (
    echo Removing incomplete node_modules...
    rmdir /s /q "%~dp0frontend\node_modules"
  )
  pushd "%~dp0frontend"
  call npm install
  if errorlevel 1 (
    echo Frontend npm install failed. Check your internet connection.
    popd
    pause
    exit /b 1
  )
  popd
  echo Frontend dependencies installed.
  echo.
)

echo Backend and frontend logs will open in separate windows.
echo.

start "Galactic Bridge Backend" cmd /k "cd /d %~dp0backend && node server.js"
timeout /t 2 /nobreak >nul
start "Galactic Bridge Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend:  http://localhost:3001   (API only - shows "Cannot GET /")
echo Frontend: http://localhost:5173   ^<-- OPEN THIS ONE IN YOUR BROWSER
echo.
echo Wait until the Frontend window prints "Local: http://localhost:5173".
echo.
pause
endlocal
