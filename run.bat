@echo off
cd /d "%~dp0"
call pnpm install --ignore-scripts
call node .\scripts\dev.mjs
