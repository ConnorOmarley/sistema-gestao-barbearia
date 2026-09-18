@echo off
setlocal
title Barbearia Michael Barber - Caixa Portatil
echo ========================================================
echo   BARBEARIA MICHAEL BARBER - SISTEMA DE CAIXA PORTATIL
echo ========================================================
echo.

set "NODE_BIN="
if exist "%~dp0bin\node.exe" (
    set "NODE_BIN=%~dp0bin\node.exe"
    echo [OK] Usando Node.js portatil do Pen Drive.
    goto tem_node
)

where node >nul 2>nul
if errorlevel 1 goto sem_node
set "NODE_BIN=node"
echo [OK] Usando Node.js instalado no computador.
goto tem_node

:sem_node
echo [ERRO] Node.js nao encontrado neste computador e nem na pasta bin!
echo Para usar em qualquer PC sem instalar nada, mantenha o arquivo bin\node.exe.
echo.
pause
exit /b 1

:tem_node
if not exist "%~dp0backend\node_modules\sql.js\dist\sql-wasm.wasm" (
    echo [ERRO] Dependencias ausentes. Prepare a pasta completa com Instalar.bat antes de usar offline.
    pause
    exit /b 1
)
cd /d "%~dp0backend"
"%NODE_BIN%" launcher.js
if errorlevel 1 pause
endlocal