@echo off
setlocal
title Atualizacao da barbearia
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ferramentas-suporte\suporte.ps1" -Modo atualizar
if errorlevel 1 pause
endlocal
