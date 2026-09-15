@echo off
title Sistema de Gestao da Barbearia
cd /d "%~dp0"
color 0A

echo ============================================
echo   SISTEMA DE GESTAO DA BARBEARIA
echo ============================================
echo.

rem Define qual Node.js usar: o portatil da pasta (se existir) ou o do sistema
set "NODE=node"
if exist "%~dp0nodejs\node.exe" set "NODE=%~dp0nodejs\node.exe"

rem Verifica se o Node.js esta disponivel
if "%NODE%"=="node" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] Node.js nao encontrado.
        echo Execute o arquivo "Instalar.bat" primeiro.
        echo.
        pause
        exit /b 1
    )
)

rem Verifica as dependencias do backend
if not exist "%~dp0backend\node_modules" (
    echo Instalando dependencias...
    pushd "%~dp0backend"
    call npm install
    popd
)

rem Verifica se a porta 3000 ja esta em uso (servidor ja rodando)
netstat -ano | findstr /R ":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 goto servidor_ok

rem Inicia o servidor numa janela separada
echo Iniciando o servidor...
start "Servidor Barbearia" /min cmd /c "cd /d "%~dp0backend" && ""%NODE%"" server.js"
timeout /t 3 /nobreak >nul

:servidor_ok
rem Abre a interface no navegador
echo Abrindo o sistema no navegador...
start "" "%~dp0frontend\index.html"
echo.
echo Sistema aberto! O servidor roda na janela "Servidor Barbearia".
echo NAO feche essa janela enquanto estiver usando o sistema.
echo.
pause