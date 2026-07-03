@echo off
title VisionControl - Generador de Instalador del Agente
color 0B

echo.
echo  =============================================================
echo       VisionControl - Constructor del Agente Excel y Soporte
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
echo  agent\build\VisionControlAgent Setup 1.0.0.exe
echo.
echo  Instrucciones de uso:
echo  1. Instala este archivo solo en maquinas autorizadas por la empresa.
echo  2. Configura URL del servidor, token interno, carpetas Excel y soporte remoto.
echo  3. El agente quedara visible en la bandeja del sistema.
echo  4. El soporte remoto requiere configuracion autorizada, aviso visible y registro.
echo.
pause
