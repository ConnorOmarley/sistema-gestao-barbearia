@echo off
title Barbearia Michael Barber - Sistema de Gestao
echo ========================================================
echo   BARBEARIA MICHAEL BARBER - SISTEMA DE CAIXA
echo ========================================================
echo.
echo Iniciando o servidor local...
echo.

cd /d "%~dp0backend"
start /b "" node server.js

timeout /t 2 /nobreak >nul

echo Abrindo o sistema no navegador...
start http://localhost:3000

echo.
echo ========================================================
echo   SISTEMA EM FUNCIONAMENTO (100%% OFFLINE)
echo   Pressione qualquer tecla ou feche esta janela para encerrar.
echo ========================================================
pause >nul
