@echo off
title VisionControl - Generador de Instalador del Agente
color 0B

echo.
echo  =============================================================
echo       VisionControl - Constructor del Instalador del Agente
echo  =============================================================
echo.

echo [1/3] Verificando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] No se pudieron instalar las dependencias.
    pause
    exit /b 1
)

echo.
echo [2/3] Compilando el Agente y generando el .exe...
echo Esto puede tomar un minuto...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Ocurrió un error al compilar el agente. Revisa los logs.
    pause
    exit /b 1
)

echo.
echo  =============================================================
echo  ✅ CONSTRUCCION EXITOSA
echo  =============================================================
echo.
echo  El archivo instalador se encuentra en la carpeta:
echo  📂 agent\build\VisionControlAgent Setup 1.0.0.exe
echo.
echo  Instrucciones de uso:
echo  1. Copia este archivo .exe a las computadoras de los empleados.
echo  2. Al ejecutarlo por primera vez, pedira la URL del servidor.
echo  3. Una vez ingresada, correra en segundo plano (Stealth Mode).
echo.
pause
