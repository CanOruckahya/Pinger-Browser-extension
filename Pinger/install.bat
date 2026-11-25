@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  Pinger - Native Host kurulum (Chrome / Edge / Firefox)
REM  PowerShell GEREKMEZ. Extension ID yapistir, dosyalar guncellenir.
REM ============================================================

set "ROOT=%~dp0"
set "HOSTDIR=%ROOT%native-host\"
set "HOSTBAT=%HOSTDIR%host.bat"
set "JSON_CHROME=%HOSTDIR%com.pinger.host.json"
set "JSON_FIREFOX=%HOSTDIR%com.pinger.host.firefox.json"
set "IDFILE=%HOSTDIR%last-extension-id.txt"
set "FF_ID=pinger@local"
set "FIXED_ID=gfepdmddjmpndndaacmopoppcpkcdfjb"
set "LOGFILE=%ROOT%install.log"

echo ---------------------------------------------------->>"%LOGFILE%"
echo [%date% %time%] install.bat started>>"%LOGFILE%"

if not exist "%HOSTBAT%" (
  echo [HATA] host.bat bulunamadi: %HOSTBAT%
  echo [%date% %time%] [HATA] host.bat bulunamadi: %HOSTBAT%>>"%LOGFILE%"
  pause
  exit /b 1
)

REM JSON icin Windows yolu: ters slash -^> duz slash
set "HOSTBAT_JSON=%HOSTBAT:\=/%"

echo.
echo  ========================================
echo   PINGER v2.0 - Native Host Kurulum
echo  ========================================
echo.
echo  1^) Chrome:  chrome://extensions
echo     Edge:    edge://extensions
echo     Gelistirici modu -^> Paketlenmemis yukle -^> extension klasoru
echo     Extension ID'yi kopyala
echo.
echo  2^) Firefox: about:debugging#/runtime/this-firefox
echo     Gecici eklenti yukle -^> extension\manifest.json
echo     Firefox ID sabit: %FF_ID%
echo.

REM --- ID parametresi var mi? (install.bat <ID>) Yoksa sabit ID kullan ---
set "CHROME_ID=%~1"
if not "!CHROME_ID!"=="" (
  echo [INFO] ID argumanla alindi: !CHROME_ID!
  echo [%date% %time%] [INFO] ID argumanla alindi: !CHROME_ID!>>"%LOGFILE%"
) else (
  set "CHROME_ID=%FIXED_ID%"
  echo [INFO] Sabit Extension ID kullaniliyor: !CHROME_ID!
  echo [%date% %time%] [INFO] Sabit Extension ID kullaniliyor: !CHROME_ID!>>"%LOGFILE%"
)

if "%CHROME_ID%"=="" (
  echo.
  echo [HATA] ID bos olamaz.
  echo [%date% %time%] [HATA] ID bos>>"%LOGFILE%"
  pause
  exit /b 1
)

REM Bosluklari temizle
set "CHROME_ID=%CHROME_ID: =%"

echo.
echo  Yaziliyor...
echo  Chrome/Edge ID : %CHROME_ID%
echo  Firefox ID     : %FF_ID%
echo  Host           : %HOSTBAT_JSON%
echo.
echo [%date% %time%] CHROME_ID=%CHROME_ID% HOST=%HOSTBAT_JSON%>>"%LOGFILE%"

REM ---------- Chromium JSON (Chrome + Edge) ----------
(
echo {
echo   "name": "com.pinger.host",
echo   "description": "Pinger native host",
echo   "path": "%HOSTBAT_JSON%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%CHROME_ID%/"
echo   ]
echo }
) > "%JSON_CHROME%"

REM ---------- Firefox JSON ----------
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

REM ID kaydi
echo %CHROME_ID%> "%IDFILE%"

REM ---------- Registry (Chrome / Edge / Firefox / Brave) ----------
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_CHROME%" /f >nul
reg add "HKCU\Software\Mozilla\NativeMessagingHosts\com.pinger.host" /ve /t REG_SZ /d "%JSON_FIREFOX%" /f >nul

echo  [OK] com.pinger.host.json
echo  [OK] com.pinger.host.firefox.json
echo  [OK] Registry: Chrome, Edge, Brave, Firefox
echo.
echo  Sonraki adim:
echo   - Tarayicide eklentiyi YENIDEN YUKLE
echo   - Sayfayi F5 ile yenile
echo   - IP sec -^> Pingle
echo.
echo [%date% %time%] install.bat finished>>"%LOGFILE%"
pause
endlocal
exit /b 0
