# Pinger Native Messaging Host (PowerShell fallback)
# ping.exe pipe buffer sorunu icin .NET Ping + Flush kullanir

$ErrorActionPreference = "Continue"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:ChildJob = $null
$script:StopFlag = $false
$script:LineQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:InputQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$script:WatchTarget = ""
$script:FailCount = 0
$script:WasDown = $false
$script:WatchEnabled = $false

function Write-NativeMessage([hashtable]$Obj) {
  $json = ($Obj | ConvertTo-Json -Compress -Depth 8)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $len = [BitConverter]::GetBytes([int]$bytes.Length)
  $out = [Console]::OpenStandardOutput()
  $out.Write($len, 0, 4)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}

function Show-WinToast([string]$Target) {
  try {
    $safe = $Target -replace "'", ""
    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; `$n=New-Object System.Windows.Forms.NotifyIcon; `$n.Icon=[System.Drawing.SystemIcons]::Information; `$n.Visible=`$true; `$n.ShowBalloonTip(8000,'Pinger','$safe cevap vermeye basladi',[System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 9; `$n.Dispose()"
    ) | Out-Null
  } catch { }
}

function Note-WatchLine([string]$Line) {
  if (-not $script:WatchEnabled) { return }
  $lower = $Line.ToLowerInvariant()
  $ok = ($lower -like "*reply from*") -or (($lower -like "*ttl=*") -and (($lower -like "*time=*") -or ($lower -like "*bytes=*")))
  $fail = ($lower -like "*timed out*") -or ($lower -like "*unreachable*") -or ($lower -like "*general failure*")
  if ($fail) {
    $script:FailCount++
    if ($script:FailCount -ge 3) { $script:WasDown = $true }
    return
  }
  if ($ok) {
    if ($script:WasDown) {
      Write-NativeMessage @{ type = "recovered"; target = $script:WatchTarget }
      Show-WinToast -Target $script:WatchTarget
      $script:WasDown = $false
    }
    $script:FailCount = 0
  }
}

function Stop-Tool {
  $script:StopFlag = $true
  $script:WatchEnabled = $false
  if ($null -ne $script:ChildJob) {
    try { Stop-Job -Job $script:ChildJob -Force -ErrorAction SilentlyContinue } catch { }
    try { Remove-Job -Job $script:ChildJob -Force -ErrorAction SilentlyContinue } catch { }
    $script:ChildJob = $null
  }
}

function Start-PingLoop([string]$Target) {
  Stop-Tool
  $script:StopFlag = $false
  $script:FailCount = 0
  $script:WasDown = $false
  $script:WatchTarget = $Target
  $script:WatchEnabled = $true
  if ($Target -notmatch '^[A-Za-z0-9\-.:]+$') {
    Write-NativeMessage @{ type = "error"; message = "Gecersiz hedef." }
    return
  }

  Write-NativeMessage @{ type = "started"; target = $Target; tool = "ping" }

  $script:ChildJob = Start-Job -ScriptBlock {
    param($Target, $Queue)
    $p = New-Object System.Net.NetworkInformation.Ping
    while ($true) {
      try {
        $r = $p.Send($Target, 2000)
        if ($r.Status -eq "Success") {
          $ttl = 0
          if ($r.Options) { $ttl = $r.Options.Ttl }
          $line = "Reply from $($r.Address): bytes=$($r.Buffer.Length) time=$($r.RoundtripTime)ms TTL=$ttl"
        } else {
          $line = "Request timed out. ($($r.Status))"
        }
      } catch {
        $line = "Request timed out."
      }
      [void]$Queue.Enqueue($line)
      Start-Sleep -Milliseconds 1000
    }
  } -ArgumentList $Target, $script:LineQueue
}

function Start-TracertLoop([string]$Target) {
  Stop-Tool
  $script:StopFlag = $false
  $script:WatchEnabled = $false
  if ($Target -notmatch '^[A-Za-z0-9\-.:]+$') {
    Write-NativeMessage @{ type = "error"; message = "Gecersiz hedef." }
    return
  }

  Write-NativeMessage @{ type = "started"; target = $Target; tool = "tracert" }

  $script:ChildJob = Start-Job -ScriptBlock {
    param($Target, $Queue)
    [void]$Queue.Enqueue("Tracing route to $Target...")
    $p = New-Object System.Net.NetworkInformation.Ping
    for ($ttl = 1; $ttl -le 30; $ttl++) {
      $opt = New-Object System.Net.NetworkInformation.PingOptions($ttl, $true)
      $buf = New-Object byte[] 32
      $times = @()
      $addr = $null
      $ok = $false
      for ($i = 0; $i -lt 3; $i++) {
        try {
          $r = $p.Send($Target, 2000, $buf, $opt)
          if ($r.Status -eq "Success" -or $r.Status -eq "TtlExpired") {
            $times += "$($r.RoundtripTime) ms"
            $addr = $r.Address.ToString()
            if ($r.Status -eq "Success") { $ok = $true }
          } else {
            $times += "*"
          }
        } catch {
          $times += "*"
        }
      }
      $hop = if ($addr) { $addr } else { "*" }
      [void]$Queue.Enqueue(("{0,2}  {1,-10} {2,-10} {3,-10}  {4}" -f $ttl, $times[0], $times[1], $times[2], $hop))
      if ($ok) {
        [void]$Queue.Enqueue("Trace complete.")
        break
      }
    }
  } -ArgumentList $Target, $script:LineQueue
}

# stdin reader
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$ps = [powershell]::Create()
$ps.Runspace = $rs
[void]$ps.AddScript({
  param($Queue)
  $stdin = [Console]::OpenStandardInput()
  while ($true) {
    $lenBuf = New-Object byte[] 4
    $read = 0
    while ($read -lt 4) {
      $n = $stdin.Read($lenBuf, $read, 4 - $read)
      if ($n -le 0) { return }
      $read += $n
    }
    $length = [BitConverter]::ToInt32($lenBuf, 0)
    if ($length -le 0 -or $length -gt 1048576) { return }
    $buf = New-Object byte[] $length
    $read = 0
    while ($read -lt $length) {
      $n = $stdin.Read($buf, $read, $length - $read)
      if ($n -le 0) { return }
      $read += $n
    }
    $json = [System.Text.Encoding]::UTF8.GetString($buf)
    try {
      $obj = $json | ConvertFrom-Json
      [void]$Queue.Enqueue($obj)
    } catch { }
  }
}).AddArgument($script:InputQueue)

$handle = $ps.BeginInvoke()

try {
  while ($true) {
    if ($handle.IsCompleted -and $script:InputQueue.Count -eq 0 -and
        ($null -eq $script:ChildJob -or $script:ChildJob.State -ne "Running") -and
        $script:LineQueue.Count -eq 0) {
      break
    }

    $msg = $null
    while ($script:InputQueue.TryDequeue([ref]$msg)) {
      switch ([string]$msg.action) {
        "start" {
          $tool = "ping"
          if ($null -ne $msg.tool) { $tool = [string]$msg.tool }
          if ($tool -eq "tracert") {
            Start-TracertLoop -Target ([string]$msg.target)
          } else {
            Start-PingLoop -Target ([string]$msg.target)
          }
        }
        "stop" {
          Stop-Tool
          Write-NativeMessage @{ type = "stopped"; code = -1 }
        }
      }
    }

    $line = $null
    while ($script:LineQueue.TryDequeue([ref]$line)) {
      Write-NativeMessage @{ type = "line"; text = $line }
      Note-WatchLine -Line $line
    }

    if ($null -ne $script:ChildJob -and $script:ChildJob.State -ne "Running") {
      Start-Sleep -Milliseconds 50
      $line = $null
      while ($script:LineQueue.TryDequeue([ref]$line)) {
        Write-NativeMessage @{ type = "line"; text = $line }
        Note-WatchLine -Line $line
      }
      Write-NativeMessage @{ type = "stopped"; code = 0 }
      try { Remove-Job -Job $script:ChildJob -Force -ErrorAction SilentlyContinue } catch { }
      $script:ChildJob = $null
    }

    Start-Sleep -Milliseconds 40
  }
}
finally {
  Stop-Tool
  try { $ps.Stop() } catch { }
  try { $ps.Dispose() } catch { }
  try { $rs.Close() } catch { }
}
