@echo off
setlocal
title Recuperar manutencao interrompida
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ferramentas-suporte\suporte.ps1" -Modo recuperar
if errorlevel 1 pause
endlocal
