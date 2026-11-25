@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  Pinger v2.0 - Native Host Kaldirma (Chrome / Edge / Brave / Firefox)
REM ============================================================

set "HOST_NAME=com.pinger.host"

echo.
echo  ========================================
echo   PINGER v2.0 - Native Host Kaldirma
echo  ========================================
echo.

reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1
reg delete "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1
reg delete "HKCU\Software\Mozilla\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1

echo  [OK] Chrome, Edge, Brave ve Firefox kayit defteri anahtarlari temizlendi.
echo.
pause
endlocal
exit /b 0
