# Pinger v2.0.0 - Tek Satir Kolay Kurulum (Easy Install)
# Kullanim:
#   irm https://raw.githubusercontent.com/CanOruckahya/Pinger-Browser-extension/main/scripts/easy-install.ps1 | iex

$ErrorActionPreference = "Stop"

$FixedId = "gfepdmddjmpndndaacmopoppcpkcdfjb"
$FirefoxId = "pinger@local"
$HostName = "com.pinger.host"
$ZipUrl = "https://github.com/CanOruckahya/Pinger-Browser-extension/archive/refs/heads/main.zip"

$InstallRoot = Join-Path $env:LOCALAPPDATA "Pinger"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pinger-install-" + [System.Guid]::NewGuid().ToString("N"))

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PINGER v2.0.0 - Tek Satir Kolay Kurulum" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

try {
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
  $ZipPath = Join-Path $TempRoot "pinger.zip"
  $ExtractDir = Join-Path $TempRoot "extract"

  Write-Host "[1/4] En guncel Pinger paketi indiriliyor..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing

  Write-Host "[2/4] Dosyalar cikariliyor -> $InstallRoot" -ForegroundColor Yellow
  Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

  $RepoRoot = Get-ChildItem -Path $ExtractDir -Directory | Select-Object -First 1
  if (-not $RepoRoot) {
    throw "Arsiv icinde proje klasoru bulunamadi."
  }
  $SourcePinger = Join-Path $RepoRoot.FullName "Pinger"
  if (-not (Test-Path $SourcePinger)) {
    throw "Pinger alt klasoru bulunamadi: $SourcePinger"
  }

  if (Test-Path $InstallRoot) {
    Remove-Item -Path $InstallRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $SourcePinger "*") -Destination $InstallRoot -Recurse -Force

  Write-Host "[3/4] Native Messaging Host kaydediliyor (Sabit ID: $FixedId)..." -ForegroundColor Yellow
  $HostDir = Join-Path $InstallRoot "native-host"
  $HostBat = ((Join-Path $HostDir "host.bat") -replace "\\", "/")
  $JsonChrome = Join-Path $HostDir "com.pinger.host.json"
  $JsonFirefox = Join-Path $HostDir "com.pinger.host.firefox.json"

  $ChromiumManifest = [ordered]@{
    name            = $HostName
    description     = "Pinger native host"
    path            = $HostBat
    type            = "stdio"
    allowed_origins = @("chrome-extension://$FixedId/")
  } | ConvertTo-Json

  $FirefoxManifest = [ordered]@{
    name               = $HostName
    description        = "Pinger native host"
    path               = $HostBat
    type               = "stdio"
    allowed_extensions = @($FirefoxId)
  } | ConvertTo-Json

  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($JsonChrome, $ChromiumManifest, $utf8NoBom)
  [System.IO.File]::WriteAllText($JsonFirefox, $FirefoxManifest, $utf8NoBom)

  $ChromiumRegPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
  )
  foreach ($rp in $ChromiumRegPaths) {
    New-Item -Path $rp -Force | Out-Null
    Set-ItemProperty -Path $rp -Name "(default)" -Value $JsonChrome
  }

  $FirefoxRegPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
  New-Item -Path $FirefoxRegPath -Force | Out-Null
  Set-ItemProperty -Path $FirefoxRegPath -Name "(default)" -Value $JsonFirefox

  Write-Host "[4/4] Extension klasor yolu panoya kopyalaniyor..." -ForegroundColor Yellow
  $ExtDir = Join-Path $InstallRoot "extension"
  Set-Clipboard -Value $ExtDir

  Write-Host ""
  Write-Host "[OK] Kurulum tamamlandi!" -ForegroundColor Green
  Write-Host "     Kurulum Dizini    : $InstallRoot" -ForegroundColor Gray
  Write-Host "     Extension Klasoru : $ExtDir (Panoya kopyalandi!)" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Son Adim (yalnizca ilk kurulumda 1 kez):" -ForegroundColor White
  Write-Host "  1) Chrome/Edge/Brave icinde chrome://extensions veya edge://extensions acin"
  Write-Host "  2) Sag ustten 'Gelistirici modu'nu acin"
  Write-Host "  3) 'Paketlenmemis oge yukle' -> acilan pencerede 'extension' klasorunu secin:"
  Write-Host "     (Yol panoya kopyalandi: Ctrl+V -> Enter -> Klasor Sec, veya elle $ExtDir)" -ForegroundColor Cyan
  Write-Host "  (Firefox: about:debugging#/runtime/this-firefox -> $ExtDir\manifest.json)"
  Write-Host ""
}
finally {
  if (Test-Path $TempRoot) {
    Remove-Item -Path $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
