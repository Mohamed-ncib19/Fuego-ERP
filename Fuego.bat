@echo off
title Fuego - Application Desktop
cd /d "%~dp0"
echo ===================================================
echo     Lancement de l'application Fuego Desktop...
echo ===================================================

if not exist "node_modules" (
  echo Installation des dependances...
  call pnpm install
  if errorlevel 1 goto :error
)

set NEED_BUILD=0
if not exist "packages\shared\dist\index.js" set NEED_BUILD=1
if not exist "apps\backend\dist\main.js" set NEED_BUILD=1
if not exist "apps\renderer\dist\index.html" set NEED_BUILD=1
if not exist "apps\desktop\dist\main.js" set NEED_BUILD=1
if "%NEED_BUILD%"=="1" (
  echo Premiere compilation de l'application...
  call pnpm run build
  if errorlevel 1 goto :error
)

call pnpm start
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Une erreur est survenue. Details : apps\desktop\debug-boot.log
pause
exit /b 1
