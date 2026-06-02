@echo off
title Asistente Hanza AI - Lanzador
echo =====================================================================
echo          INICIANDO SERVIDOR Y TUNEL PARA EL ASISTENTE HANZA
echo =====================================================================
echo.
echo [1/2] Iniciando el servidor de Node.js (Express + IA)...
echo Se abrira una nueva ventana negra. Dejala abierta, ahi veras los logs/errores.
start "Servidor Hanza AI" cmd /k "npm run dev"

echo.
echo [2/2] Creando tunel publico con localtunnel...
echo Se abrira otra ventana negra. Dejala abierta. 
echo Copia la URL que empiece con 'https://...' (por ejemplo: https://smart-hanza.loca.lt)
echo y configurala en el panel de Meta.
start "Tunel Localtunnel" cmd /k "npx localtunnel --port 3000 --subdomain hanza-bot"

echo.
echo =====================================================================
echo ¡TODO LISTO! 
echo Ya podes cerrar esta ventana. Deja las otras dos abiertas para que ande.
echo =====================================================================
echo.
pause
