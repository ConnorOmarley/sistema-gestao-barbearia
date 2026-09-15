@echo off
title Instalacao do Sistema de Gestao da Barbearia
cd /d "%~dp0"

echo ============================================
echo   INSTALACAO DO SISTEMA DE GESTAO
echo ============================================
echo.

rem 1. Verifica se ja existe um Node.js portatil na pasta bin
if exist "%~dp0bin\node.exe" (
    echo Node.js ja esta instalado na pasta bin.
    goto verificar_dependencias
)

rem 2. Verifica se o Node.js esta instalado no sistema
where node >nul 2>&1
if not errorlevel 1 (
    echo Node.js ja esta instalado no sistema. Nenhuma acao necessaria.
    goto verificar_dependencias
)

rem 3. Baixa o Node.js portatil (nao precisa de instalacao nem de admin)
echo Node.js nao encontrado. Baixando versao portatil...
echo Isso pode levar alguns minutos, dependendo da sua internet.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-node.ps1"
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao baixar o Node.js. Verifique sua conexao e tente novamente.
    pause
    exit /b 1
)

:verificar_dependencias
echo.
echo Verificando dependencias do sistema...
if not exist "%~dp0backend\node_modules" (
    echo Instalando as dependencias do sistema (primeira vez)...
    pushd "%~dp0backend"
    call npm install
    popd
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
) else (
    echo Dependencias ja instaladas.
)

echo.
echo ============================================
echo   INSTALACAO CONCLUIDA!
echo   Agora use o arquivo "Iniciar Sistema.bat"
echo   para abrir o sistema.
echo ============================================
echo.
pause

