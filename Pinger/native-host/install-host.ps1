#Requires -Version 5.1
<#
.SYNOPSIS
  Pinger v2.0 native messaging host'unu Windows'a kaydeder (Edge, Chrome, Brave, Firefox).

.USAGE
  .\install-host.ps1 -ExtensionId "abcdefghijklmnopqrstuvwxyzabcdef"
#>
param(
  [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"
$HostDir = $PSScriptRoot
$BatPath = Join-Path $HostDir "host.bat"
$JsonPath = Join-Path $HostDir "com.pinger.host.json"
$FirefoxJsonPath = Join-Path $HostDir "com.pinger.host.firefox.json"
$HostName = "com.pinger.host"
$FirefoxId = "pinger@local"

if (-not (Test-Path $BatPath)) {
  Write-Error "host.bat bulunamadi: $BatPath"
}

if (-not $ExtensionId) {
  Write-Host ""
  Write-Host "Chrome / Edge / Brave extension ID gerekli." -ForegroundColor Yellow
  Write-Host "  edge://extensions veya chrome://extensions -> Pinger -> ID kopyala"
  Write-Host ""
  $ExtensionId = Read-Host "Extension ID"
}

$ExtensionId = $ExtensionId.Trim()
if ($ExtensionId -notmatch '^[a-p]{32}$') {
  Write-Warning "ID genelde 32 karakter (a-p) olur. Yine de devam ediliyor: $ExtensionId"
}

$batFull = ((Resolve-Path $BatPath).Path).Replace("\", "/")

$chromiumManifest = [ordered]@{
  name            = $HostName
  description     = "Pinger native host - Ping, Tracert, TCP Port & DNS lookup"
  path            = $batFull
  type            = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json

$firefoxManifest = [ordered]@{
  name               = $HostName
  description        = "Pinger native host - Ping, Tracert, TCP Port & DNS lookup"
  path               = $batFull
  type               = "stdio"
  allowed_extensions = @($FirefoxId)
} | ConvertTo-Json

# UTF-8 BOM native messaging'i bozar - BOMsuz yaz
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($JsonPath, $chromiumManifest, $utf8NoBom)
[System.IO.File]::WriteAllText($FirefoxJsonPath, $firefoxManifest, $utf8NoBom)

Write-Host "Manifest yazildi: $JsonPath" -ForegroundColor Green
Write-Host "Firefox manifest yazildi: $FirefoxJsonPath" -ForegroundColor Green

$chromiumRegPaths = @(
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
)

foreach ($rp in $chromiumRegPaths) {
  New-Item -Path $rp -Force | Out-Null
  Set-ItemProperty -Path $rp -Name "(default)" -Value $JsonPath
  Write-Host "Registry OK: $rp" -ForegroundColor Green
}

$firefoxRegPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
New-Item -Path $firefoxRegPath -Force | Out-Null
Set-ItemProperty -Path $firefoxRegPath -Name "(default)" -Value $FirefoxJsonPath
Write-Host "Registry OK: $firefoxRegPath" -ForegroundColor Green

Write-Host ""
Write-Host "Kurulum tamam. Tarayicida Pinger eklentisini Yeniden Yukle (Reload)." -ForegroundColor Cyan
