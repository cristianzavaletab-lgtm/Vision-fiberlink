@echo off
title FiberlinkDesk - Instalador de Agente
color 0A

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║     FiberlinkDesk - Instalador de Agente      ║
echo  ║     Control Remoto de Equipos                 ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: Check Node.js
echo [1/4] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Node.js NO esta instalado.
    echo  Descargalo de: https://nodejs.org
    echo  Instala la version LTS y vuelve a ejecutar este script.
    echo.
    pause
    exit /b 1
)
echo  ✅ Node.js encontrado

:: Install dependencies
echo.
echo [2/4] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo  ❌ Error instalando dependencias
    pause
    exit /b 1
)
echo  ✅ Dependencias instaladas

:: Install robotjs for remote control
echo.
echo [3/4] Instalando modulo de control remoto (robotjs)...
call npm install robotjs --save 2>nul
if %errorlevel% neq 0 (
    echo  ⚠️  robotjs no se pudo instalar.
    echo  El agente funcionara sin control remoto (solo monitoreo).
    echo  Para habilitar control remoto, instala las herramientas de compilacion:
    echo  npm install --global windows-build-tools
) else (
    echo  ✅ Control remoto habilitado
)

:: Remind about config
echo.
echo [4/4] Configuracion...
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║  IMPORTANTE: Antes de iniciar, abre el        ║
echo  ║  archivo config.json y cambia "serverIP"       ║
echo  ║  por la IP de tu computadora principal         ║
echo  ║  (donde corre el servidor FiberlinkDesk).      ║
echo  ║                                               ║
echo  ║  Ejemplo: "serverIP": "192.168.1.50"          ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: Ask to start
set /p INICIAR="¿Deseas iniciar el agente ahora? (S/N): "
if /i "%INICIAR%"=="S" (
    echo.
    echo  🚀 Iniciando agente FiberlinkDesk...
    echo  (No cierres esta ventana)
    echo.
    call npm start
) else (
    echo.
    echo  Para iniciar el agente despues, ejecuta:
    echo  npm start
    echo.
)

pause
