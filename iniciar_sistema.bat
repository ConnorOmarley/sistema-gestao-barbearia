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
if not exist "%~dp0backend\node_modules" (
    echo Instalando dependencias ^(primeira vez^)...
    call "%~dp0Instalar.bat"
)

cd /d "%~dp0backend"
echo Iniciando o servidor local...
echo.
start "" /b "%NODE_BIN%" server.js

timeout /t 2 /nobreak >nul

echo Abrindo o sistema no navegador...
start "" http://localhost:3000

echo.
echo ========================================================
echo   SISTEMA EM FUNCIONAMENTO (100%% OFFLINE / PORTATIL)
echo   Pressione qualquer tecla ou feche esta janela para encerrar.
echo ========================================================
pause >nul
