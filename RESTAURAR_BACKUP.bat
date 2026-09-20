@echo off
setlocal
title Restaurar copia da barbearia
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ferramentas-suporte\suporte.ps1" -Modo restaurar
if errorlevel 1 pause
endlocal
