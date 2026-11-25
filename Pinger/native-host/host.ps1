# Pinger Native Messaging Host v2.0.0 (PowerShell fallback)
# Ping, Tracert, TCP Port Test ve DNS Lookup araclarini calistirir.

$ErrorActionPreference = "Continue"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:WorkerRs = $null
$script:WorkerPs = $null
$script:WorkerHandle = $null
$script:LineQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$script:InputQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$script:WatchTarget = ""
$script:FailCount = 0
$script:WasDown = $false
$script:WatchEnabled = $false
$script:NotifyEnabled = $true

function Write-NativeMessage([hashtable]$Obj) {
  $json = ($Obj | ConvertTo-Json -Compress -Depth 8)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $len = [BitConverter]::GetBytes([int]$bytes.Length)
  $out = [Console]::OpenStandardOutput()
  $out.Write($len, 0, 4)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}

function Show-WinToast([string]$Target, [string]$StatusText, [string]$IconKind = "Info") {
  if (-not $script:NotifyEnabled) { return }
  try {
    $safe = $Target -replace "'", ""
    $safeMsg = $StatusText -replace "'", ""
    $sysIcon = if ($IconKind -eq "Warning") { "Warning" } else { "Information" }
    $tipIcon = if ($IconKind -eq "Warning") { "Warning" } else { "Info" }
    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; `$n=New-Object System.Windows.Forms.NotifyIcon; `$n.Icon=[System.Drawing.SystemIcons]::$sysIcon; `$n.Visible=`$true; `$n.ShowBalloonTip(8000,'Pinger','$safe $safeMsg',[System.Windows.Forms.ToolTipIcon]::$tipIcon); Start-Sleep -Seconds 9; `$n.Dispose()"
    ) | Out-Null
  } catch { }
}

function Handle-WatchMetric([bool]$Ok) {
  if (-not $script:WatchEnabled) { return }
  if (-not $Ok) {
    $script:FailCount++
    if ($script:FailCount -eq 3 -and -not $script:WasDown) {
      $script:WasDown = $true
      Write-NativeMessage @{ type = "down"; target = $script:WatchTarget }
      Show-WinToast -Target $script:WatchTarget -StatusText "yanit vermiyor (3+ timeout)" -IconKind "Warning"
    }
    return
  }
  if ($script:WasDown) {
    Write-NativeMessage @{ type = "recovered"; target = $script:WatchTarget }
    Show-WinToast -Target $script:WatchTarget -StatusText "tekrar cevap vermeye basladi" -IconKind "Info"
    $script:WasDown = $false
  }
  $script:FailCount = 0
}

function Stop-Tool {
  $script:WatchEnabled = $false
  if ($null -ne $script:WorkerPs) {
    try { $script:WorkerPs.Stop() } catch { }
    try { $script:WorkerPs.Dispose() } catch { }
    $script:WorkerPs = $null
  }
  if ($null -ne $script:WorkerRs) {
    try { $script:WorkerRs.Close() } catch { }
    try { $script:WorkerRs.Dispose() } catch { }
    $script:WorkerRs = $null
  }
  $script:WorkerHandle = $null
}

function Start-WorkerScript([scriptblock]$Block, [object[]]$ArgsList) {
  Stop-Tool
  $rs = [runspacefactory]::CreateRunspace()
  $rs.Open()
  $ps = [powershell]::Create()
  $ps.Runspace = $rs
  [void]$ps.AddScript($Block)
  foreach ($arg in $ArgsList) {
    [void]$ps.AddArgument($arg)
  }
  $script:WorkerRs = $rs
  $script:WorkerPs = $ps
  $script:WorkerHandle = $ps.BeginInvoke()
}

function Test-ValidTarget([string]$Target) {
  $t = $Target.Trim()
  if (-not $t -or $t.Length -gt 253 -or $t -notmatch '^[A-Za-z0-9\-.:]+$') {
    return $null
  }
  return $t
}

function Resolve-PortList([object]$RawPorts) {
  $src = if ($null -ne $RawPorts -and ([string]$RawPorts).Trim()) { [string]$RawPorts } else { "80,443,22,3389,8080" }
  $tokens = $src -split '[\s,;]+' | Where-Object { $_ }
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $list = [System.Collections.Generic.List[int]]::new()
  foreach ($tok in $tokens) {
    $num = 0
    if ([int]::TryParse($tok, [ref]$num) -and $num -ge 1 -and $num -le 65535 -and $seen.Add($num)) {
      $list.Add($num)
      if ($list.Count -ge 32) { break }
    }
  }
  return $list.ToArray()
}

function Start-PingLoop([string]$Target, [int]$Count) {
  $script:FailCount = 0
  $script:WasDown = $false
  $script:WatchTarget = $Target
  $script:WatchEnabled = $true

  Write-NativeMessage @{ type = "started"; target = $Target; tool = "ping" }

  $block = {
    param($Target, $MaxCount, $Queue)
    $p = New-Object System.Net.NetworkInformation.Ping
    $seq = 0
    while ($MaxCount -eq 0 -or $seq -lt $MaxCount) {
      $seq++
      try {
        $r = $p.Send($Target, 2000)
        if ($r.Status -eq "Success") {
          $ttl = 0
          if ($r.Options) { $ttl = $r.Options.Ttl }
          $addr = $r.Address.ToString()
          $rtt = [int]$r.RoundtripTime
          $line = "Reply from $($addr): bytes=$($r.Buffer.Length) time=$($rtt)ms TTL=$ttl"
          [void]$Queue.Enqueue(@{ kind = "line"; text = $line })
          [void]$Queue.Enqueue(@{ kind = "metric"; ok = $true; rtt = $rtt; ttl = $ttl; address = $addr; seq = $seq })
        } else {
          $line = "Request timed out. ($($r.Status))"
          [void]$Queue.Enqueue(@{ kind = "line"; text = $line })
          [void]$Queue.Enqueue(@{ kind = "metric"; ok = $false; rtt = $null; ttl = $null; address = $Target; seq = $seq })
        }
      } catch {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "Request timed out." })
        [void]$Queue.Enqueue(@{ kind = "metric"; ok = $false; rtt = $null; ttl = $null; address = $Target; seq = $seq })
      }
      if ($MaxCount -eq 0 -or $seq -lt $MaxCount) {
        Start-Sleep -Milliseconds 1000
      }
    }
  }
  Start-WorkerScript -Block $block -ArgsList @($Target, $Count, $script:LineQueue)
}

function Start-TracertLoop([string]$Target) {
  $script:WatchEnabled = $false
  Write-NativeMessage @{ type = "started"; target = $Target; tool = "tracert" }

  $block = {
    param($Target, $Queue)
    [void]$Queue.Enqueue(@{ kind = "line"; text = "Tracing route to $Target (max 30 hops)..." })
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
      $hopDisplay = "*"
      if ($addr) {
        $hopDisplay = $addr
        try {
          $task = [System.Net.Dns]::GetHostEntryAsync($addr)
          if ($task.Wait(350) -and $task.Result -and $task.Result.HostName -and $task.Result.HostName -ne $addr) {
            $hopDisplay = "$($task.Result.HostName) [$addr]"
          }
        } catch { }
      }
      [void]$Queue.Enqueue(@{ kind = "line"; text = ("{0,2}  {1,-10} {2,-10} {3,-10}  {4}" -f $ttl, $times[0], $times[1], $times[2], $hopDisplay) })
      if ($ok) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "Trace complete." })
        break
      }
    }
  }
  Start-WorkerScript -Block $block -ArgsList @($Target, $script:LineQueue)
}

function Start-PortScanLoop([string]$Target, [int[]]$Ports) {
  $script:WatchEnabled = $false
  Write-NativeMessage @{ type = "started"; target = $Target; tool = "port" }

  $block = {
    param($Target, $Ports, $Queue)
    [void]$Queue.Enqueue(@{ kind = "line"; text = "TCP Port Scan: $Target ($($Ports.Count) ports, timeout 2000ms)..." })
    $openCount = 0
    foreach ($port in $Ports) {
      $tcp = $null
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar = $tcp.BeginConnect($Target, $port, $null, $null)
        $wait = $ar.AsyncWaitHandle.WaitOne(2000, $false)
        if ($wait -and $tcp.Connected) {
          $tcp.EndConnect($ar)
          $sw.Stop()
          $openCount++
          [void]$Queue.Enqueue(@{ kind = "line"; text = ("[OPEN]    {0}:{1,-5}  ({2}ms)" -f $Target, $port, $sw.ElapsedMilliseconds) })
        } else {
          $sw.Stop()
          [void]$Queue.Enqueue(@{ kind = "line"; text = ("[CLOSED]  {0}:{1,-5}  (Timeout / Filtered)" -f $Target, $port) })
        }
      } catch {
        $sw.Stop()
        [void]$Queue.Enqueue(@{ kind = "line"; text = ("[CLOSED]  {0}:{1,-5}  (Refused / Unreachable)" -f $Target, $port) })
      } finally {
        if ($null -ne $tcp) { try { $tcp.Close() } catch { } }
      }
    }
    [void]$Queue.Enqueue(@{ kind = "line"; text = ("Port scan complete: {0}/{1} open." -f $openCount, $Ports.Count) })
  }
  Start-WorkerScript -Block $block -ArgsList @($Target, $Ports, $script:LineQueue)
}

function Start-DnsLookupLoop([string]$Target) {
  $script:WatchEnabled = $false
  Write-NativeMessage @{ type = "started"; target = $Target; tool = "dns" }

  $block = {
    param($Target, $Queue)
    [void]$Queue.Enqueue(@{ kind = "line"; text = "DNS Lookup: $Target" })
    try {
      $parsedIp = $null
      $isIp = [System.Net.IPAddress]::TryParse($Target, [ref]$parsedIp)
      $entry = [System.Net.Dns]::GetHostEntry($Target)
      if ($entry.HostName) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "HostName   : $($entry.HostName)" })
      }
      if ($entry.Aliases -and $entry.Aliases.Count -gt 0) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "Aliases    : $($entry.Aliases -join ', ')" })
      }
      $addrs = [System.Net.Dns]::GetHostAddresses($Target)
      $v4 = @($addrs | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } | ForEach-Object { $_.ToString() })
      $v6 = @($addrs | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6 } | ForEach-Object { $_.ToString() })
      if ($v4.Count -gt 0) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "IPv4 (A)   : $($v4 -join ', ')" })
      }
      if ($v6.Count -gt 0) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "IPv6 (AAAA): $($v6 -join ', ')" })
      }
      if ($isIp -and $entry.HostName -eq $Target) {
        [void]$Queue.Enqueue(@{ kind = "line"; text = "Reverse PTR: Kayit bulunamadi" })
      }
    } catch {
      [void]$Queue.Enqueue(@{ kind = "line"; text = "DNS Error  : $($_.Exception.Message)" })
    }
    [void]$Queue.Enqueue(@{ kind = "line"; text = "DNS lookup complete." })
  }
  Start-WorkerScript -Block $block -ArgsList @($Target, $script:LineQueue)
}

function Flush-LineQueue {
  $item = $null
  while ($script:LineQueue.TryDequeue([ref]$item)) {
    if ($item.kind -eq "metric") {
      Write-NativeMessage @{
        type    = "metric"
        ok      = [bool]$item.ok
        rtt     = $item.rtt
        ttl     = $item.ttl
        address = $item.address
        seq     = $item.seq
      }
      Handle-WatchMetric -Ok ([bool]$item.ok)
    } else {
      Write-NativeMessage @{ type = "line"; text = [string]$item.text }
    }
  }
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
        ($null -eq $script:WorkerHandle -or $script:WorkerHandle.IsCompleted) -and
        $script:LineQueue.Count -eq 0) {
      break
    }

    $msg = $null
    while ($script:InputQueue.TryDequeue([ref]$msg)) {
      switch ([string]$msg.action) {
        "start" {
          $target = Test-ValidTarget -Target ([string]$msg.target)
          if (-not $target) {
            Write-NativeMessage @{ type = "error"; message = "Gecersiz hedef (IP veya hostname girin)." }
            continue
          }
          $script:NotifyEnabled = ($null -eq $msg.notify) -or ([bool]$msg.notify)
          $tool = if ($null -ne $msg.tool) { [string]$msg.tool } else { "ping" }
          if ($tool -eq "tracert") {
            Start-TracertLoop -Target $target
          } elseif ($tool -eq "port") {
            $ports = Resolve-PortList -RawPorts $msg.ports
            if ($ports.Count -eq 0) {
              Write-NativeMessage @{ type = "error"; message = "Gecerli port bulunamadi (1-65535)." }
              continue
            }
            Start-PortScanLoop -Target $target -Ports $ports
          } elseif ($tool -eq "dns") {
            Start-DnsLookupLoop -Target $target
          } else {
            $count = 0
            if ($null -ne $msg.count -and ([string]$msg.count) -ne "") {
              $parsedCount = 0
              if (-not [int]::TryParse([string]$msg.count, [ref]$parsedCount) -or $parsedCount -lt 0 -or $parsedCount -gt 100) {
                Write-NativeMessage @{ type = "error"; message = "Gecersiz paket sayisi (0-100)." }
                continue
              }
              $count = $parsedCount
            } elseif ($null -ne $msg.continuous -and -not [bool]$msg.continuous) {
              $count = 4
            }
            Start-PingLoop -Target $target -Count $count
          }
        }
        "stop" {
          Stop-Tool
          Write-NativeMessage @{ type = "stopped"; code = -1 }
        }
      }
    }

    Flush-LineQueue

    if ($null -ne $script:WorkerHandle -and $script:WorkerHandle.IsCompleted) {
      Start-Sleep -Milliseconds 30
      Flush-LineQueue
      Write-NativeMessage @{ type = "stopped"; code = 0 }
      Stop-Tool
    }

    Start-Sleep -Milliseconds 30
  }
}
finally {
  Stop-Tool
  try { $ps.Stop() } catch { }
  try { $ps.Dispose() } catch { }
  try { $rs.Close() } catch { }
}
