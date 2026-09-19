@echo off
setlocal
title Zerar o sistema para comecar do zero
echo ========================================================
echo   ZERAR O SISTEMA PARA COMECAR DO ZERO
echo ========================================================
echo.
echo Isto apaga TODOS os dados e volta ao estado de fabrica:
echo   - atendimentos, caixa, gastos e relatorios
echo   - cadastro de barbeiros e servicos
echo   - senha da Area do Dono
echo   - fotos de perfil
echo.
echo O sistema volta a ter apenas o dono padrao
echo (Michael Barber) e os 4 servicos iniciais.
echo.
echo Antes de apagar, uma copia do banco atual sera deixada em
echo   backend\barbearia-ANTES-DO-RESET-DATA.db
echo.
echo ATENCAO: se o sistema estiver aberto, pressione ENTER na
echo janela dele para salvar e fechar, e rode isto de novo.
echo.

REM Verifica se o sistema esta aberto (porta 3000)
netstat -an | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo [ERRO] O sistema esta aberto neste momento.
    echo Pressione ENTER na janela do sistema para salvar e fechar,
    echo depois execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

set /p confirm=Digite ZERAR e pressione ENTER para confirmar: 
if /i not "%confirm%"=="ZERAR" (
    echo.
    echo Nada foi apagado.
    echo.
    pause
    exit /b 0
)

cd /d "%~dp0"

REM Copa de seguranca do banco atual
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "dt=%%d"
if exist "backend\barbearia.db" (
    copy /y "backend\barbearia.db" "backend\barbearia-ANTES-DO-RESET-%dt%.db" >nul
    echo.
    echo [OK] Copa de seguranca: barbearia-ANTES-DO-RESET-%dt%.db
)

REM Apaga os dados
del /f /q "backend\barbearia.db" >nul 2>nul
if exist "backend\backups" rmdir /s /q "backend\backups"
if exist "frontend\assets\perfil" rmdir /s /q "frontend\assets\perfil"

echo.
echo [OK] Sistema zerado!
echo Abra iniciar_sistema.bat para comecar do zero. Na primeira
echo abertura ele recria o dono padrao e os servicos iniciais.
echo.
echo Depois: configure a senha da Area do Dono e o Saldo inicial.
echo.
pause
endlocal