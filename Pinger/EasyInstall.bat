@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  Pinger v2.0 - Tek Tikla Sifir-Soru Kurulum (EasyInstall)
REM  Sabit Extension ID sayesinde ID kopyalama gerektirmez.
REM ============================================================

set "ROOT=%~dp0"
for %%I in ("%ROOT%extension") do set "EXTDIR=%%~fI"
set "HOSTDIR=%ROOT%native-host\"
set "HOSTBAT=%HOSTDIR%host.bat"
set "JSON_CHROME=%HOSTDIR%com.pinger.host.json"
set "JSON_FIREFOX=%HOSTDIR%com.pinger.host.firefox.json"
set "IDFILE=%HOSTDIR%last-extension-id.txt"
set "FIXED_ID=gfepdmddjmpndndaacmopoppcpkcdfjb"
set "FF_ID=pinger@local"
set "LOGFILE=%ROOT%install.log"

echo ---------------------------------------------------->>"%LOGFILE%"
echo [%date% %time%] EasyInstall.bat started>>"%LOGFILE%"

if not exist "%HOSTBAT%" (
  echo [HATA] host.bat bulunamadi: %HOSTBAT%
  pause
  exit /b 1
)

set "HOSTBAT_JSON=%HOSTBAT:\=/%"

echo.
echo  =============================================
echo   PINGER v2.0 - Sifir-Soru Kolay Kurulum
echo  =============================================
echo.
echo   Sabit Extension ID : %FIXED_ID%
echo   Firefox ID         : %FF_ID%
echo   Extension Klasoru  : %EXTDIR%
echo.

(
echo {
echo   "name": "com.pinger.host",
echo   "description": "Pinger native host",
echo   "path": "%HOSTBAT_JSON%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%FIXED_ID%/"
echo   ]
echo }
) > "%JSON_CHROME%"

(
echo {
echo   "name": "com.pinger.host",
echo   "description": "Pinger native host",
echo   "path": "%HOSTBAT_JSON%",
echo   "type": "stdio",
echo   "allowed_extensions": [
echo     "%FF_ID%"
echo   ]
echo }
) > "%JSON_FIREFOX%"

echo %FIXED_ID%> "%IDFILE%"

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\Mozilla\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_FIREFOX%" /f >nul

powershell -NoProfile -Command "Set-Clipboard -Value '%EXTDIR%'" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  <nul set /p =%EXTDIR%| clip >nul 2>&1
)

echo  [OK] Native host manifestleri ve Registry kayitlari tamamlandi.
echo  [OK] Extension klasor yolu panoya kopyalandi!
echo.
echo  Son Adim (ilk seferde 1 kez):
echo   1^) Chrome / Edge / Brave icinde chrome://extensions veya edge://extensions acin
echo   2^) Sag ustten "Gelistirici modu"nu acin
echo   3^) "Paketlenmemis oge yukle" -^> acilan pencerede "extension" klasorunu secin:
echo       (Yol panoda: Ctrl+V -^> Enter -^> Klasor Sec, veya elle %EXTDIR%)
echo   (Firefox icin about:debugging#/runtime/this-firefox -^> extension\manifest.json)
echo.
echo [%date% %time%] EasyInstall.bat finished>>"%LOGFILE%"
pause
endlocal
exit /b 0
