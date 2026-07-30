#Requires -Version 5.1
<#
.SYNOPSIS
  Pinger native messaging host'unu Windows'a kaydeder (Edge + Chrome).

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
$HostName = "com.pinger.host"

if (-not (Test-Path $BatPath)) {
  Write-Error "host.bat bulunamadi: $BatPath"
}

if (-not $ExtensionId) {
  Write-Host ""
  Write-Host "Edge extension ID gerekli." -ForegroundColor Yellow
  Write-Host "  edge://extensions  -> Pinger -> Kimlik (ID) kopyala"
  Write-Host ""
  $ExtensionId = Read-Host "Extension ID"
}

$ExtensionId = $ExtensionId.Trim()
if ($ExtensionId -notmatch '^[a-p]{32}$') {
  Write-Warning "ID genelde 32 karakter (a-p) olur. Yine de devam ediliyor: $ExtensionId"
}

$batFull = (Resolve-Path $BatPath).Path

$manifestObj = [ordered]@{
  name            = $HostName
  description     = "Pinger native host - runs ping.exe for the Edge extension"
  path            = $batFull
  type            = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest = $manifestObj | ConvertTo-Json

# UTF-8 BOM native messaging'i bozar - BOMsuz yaz
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($JsonPath, $manifest, $utf8NoBom)
Write-Host "Manifest yazildi: $JsonPath" -ForegroundColor Green
Write-Host $manifest

$regPaths = @(
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
)

foreach ($rp in $regPaths) {
  New-Item -Path $rp -Force | Out-Null
  Set-ItemProperty -Path $rp -Name "(default)" -Value $JsonPath
  Write-Host "Registry OK: $rp" -ForegroundColor Green
}

Write-Host ""
Write-Host "Kurulum tamam. Edge'de extension'i Reload et." -ForegroundColor Cyan
Write-Host "Test: dashboard'ta bir IP sec -> sag tik -> Pingle"
