@echo off
title Fuego - Application Desktop
cd /d "%~dp0"
echo ===================================================
echo     Lancement de l'application Fuego Desktop...
echo ===================================================
pnpm start
if %errorlevel% neq 0 (
  echo Une erreur est survenue lors de l'execution.
  pause
)
