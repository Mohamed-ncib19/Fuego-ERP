@echo off
title Fuego - Gestion de Commerce
cd /d "%~dp0"
echo ===================================================
echo     Demarrage de l'application Fuego (Desktop)
echo ===================================================
pnpm dev
if %errorlevel% neq 0 (
  echo Une erreur est survenue lors du lancement.
  pause
)
