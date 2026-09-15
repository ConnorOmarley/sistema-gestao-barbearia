@echo off
setlocal
title Barbearia Michael Barber - Caixa Portatil
echo ========================================================
echo   BARBEARIA MICHAEL BARBER - SISTEMA DE CAIXA PORTATIL
echo ========================================================
echo.

:: 1. Verificar executavel do Node (Portatil no Pen Drive ou Instalado no Windows)
set "NODE_BIN="
if exist "%~dp0bin\node.exe" (
    set "NODE_BIN=%~dp0bin\node.exe"
    echo [OK] Usando Node.js portatil do Pen Drive.
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_BIN=node"
        echo [OK] Usando Node.js instalado no computador.
    ) else (
        echo [ERRO] Node.js nao encontrado neste computador e nem na pasta bin!
        echo Para usar em qualquer PC sem instalar nada, mantenha o arquivo bin\node.exe.
        echo.
        pause
        exit /b 1
    )
)

echo Iniciando o servidor local...
echo.

cd /d "%~dp0backend"
start /b "" "%NODE_BIN%" server.js

timeout /t 2 /nobreak >nul

echo Abrindo o sistema no navegador...
start http://localhost:3000

echo.
echo ========================================================
echo   SISTEMA EM FUNCIONAMENTO (100%% OFFLINE / PORTATIL)
echo   Pressione qualquer tecla ou feche esta janela para encerrar.
echo ========================================================
pause >nul
