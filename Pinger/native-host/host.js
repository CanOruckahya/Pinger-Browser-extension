#!/usr/bin/env node
/**
 * Pinger Native Messaging Host (v2.0.0)
 * Ping, Tracert, TCP Port Test ve DNS Lookup araclarini calistirir.
 * ping.exe pipe buffer'a takildigi icin .NET NetworkInformation + Flush kullanir.
 */
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const DEBUG_ENABLED = process.env.PINGER_DEBUG === "1";
const logPath = path.join(__dirname, "host-debug.log");

function dbg(msg) {
  if (!DEBUG_ENABLED) return;
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

let child = null;
let buffer = Buffer.alloc(0);
let lineBuf = "";
let watchTarget = "";
let failCount = 0;
let wasDown = false;
let watchEnabled = false;
let notifyEnabled = true;

function send(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function psExe() {
  return path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
}

function showWinToast(target, statusText, iconKind = "Info") {
  if (!notifyEnabled) return;
  const safeTarget = String(target || "").replace(/'/g, "");
  const safeText = String(statusText || "").replace(/'/g, "");
  const tipIcon = iconKind === "Warning" ? "Warning" : "Info";
  const sysIcon = iconKind === "Warning" ? "Warning" : "Information";
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::${sysIcon}
$n.Visible = $true
$n.BalloonTipTitle = 'Pinger'
$n.BalloonTipText = '${safeTarget} ${safeText}'
$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::${tipIcon}
$n.ShowBalloonTip(8000)
Start-Sleep -Seconds 9
$n.Dispose()
`.trim();
  try {
    spawn(
      psExe(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", script],
      { windowsHide: true, detached: true, stdio: "ignore" }
    ).unref();
  } catch (err) {
    dbg("toast error: " + err);
  }
}

function handleMetricWatch(ok) {
  if (!watchEnabled) return;
  if (!ok) {
    failCount += 1;
    if (failCount === 3 && !wasDown) {
      wasDown = true;
      send({ type: "down", target: watchTarget });
      showWinToast(watchTarget, "yanit vermiyor (3+ timeout)", "Warning");
    }
    return;
  }
  if (wasDown) {
    send({ type: "recovered", target: watchTarget });
    showWinToast(watchTarget, "tekrar cevap vermeye basladi", "Info");
    wasDown = false;
  }
  failCount = 0;
}

function noteLine(line) {
  if (!watchEnabled) return;
  const lower = line.toLowerCase();
  const ok =
    lower.includes("reply from") ||
    (lower.includes("ttl=") && (lower.includes("time=") || lower.includes("bytes=")));
  const fail =
    lower.includes("timed out") ||
    lower.includes("unreachable") ||
    lower.includes("general failure");

  if (fail) {
    handleMetricWatch(false);
  } else if (ok) {
    handleMetricWatch(true);
  }
}

function stopChild() {
  if (!child) return;
  const proc = child;
  child = null;
  try {
    if (process.platform === "win32" && proc.pid) {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      proc.kill();
    }
  } catch (_) {
    try {
      proc.kill();
    } catch (_) {}
  }
}

function validateTarget(raw) {
  const target = String(raw || "").trim();
  if (!target || target.length > 253 || !/^[A-Za-z0-9\-.:]+$/.test(target)) {
    return null;
  }
  return target;
}

function normalizeCount(rawCount, continuous) {
  if (rawCount !== undefined && rawCount !== null && rawCount !== "") {
    const n = Number(rawCount);
    if (!Number.isInteger(n) || n < 0 || n > 100) return null;
    return n;
  }
  return continuous === false ? 4 : 0;
}

function parsePorts(rawPorts) {
  const source = rawPorts && String(rawPorts).trim() ? String(rawPorts) : "80,443,22,3389,8080";
  const tokens = source.split(/[\s,;]+/).filter(Boolean);
  const seen = new Set();
  const ports = [];
  for (const tok of tokens) {
    const num = Number(tok);
    if (Number.isInteger(num) && num >= 1 && num <= 65535 && !seen.has(num)) {
      seen.add(num);
      ports.push(num);
      if (ports.length >= 32) break;
    }
  }
  return ports;
}

function buildPingScript(target, count) {
  return `
$ErrorActionPreference='Continue'
$t='${target}'
$maxCount=${count}
$p=New-Object System.Net.NetworkInformation.Ping
$seq=0
while($maxCount -eq 0 -or $seq -lt $maxCount){
  $seq++
  try{
    $r=$p.Send($t,2000)
    if($r.Status -eq 'Success'){
      $ttl=0
      if($r.Options){ $ttl=$r.Options.Ttl }
      $addr=$r.Address.ToString()
      $rtt=[int]$r.RoundtripTime
      $line=('Reply from {0}: bytes={1} time={2}ms TTL={3}' -f $addr,$r.Buffer.Length,$rtt,$ttl)
      $metric=@{type='metric';ok=$true;rtt=$rtt;ttl=$ttl;address=$addr;seq=$seq} | ConvertTo-Json -Compress
    } else {
      $line=('Request timed out. ({0})' -f $r.Status)
      $metric=@{type='metric';ok=$false;rtt=$null;ttl=$null;address=$t;seq=$seq} | ConvertTo-Json -Compress
    }
  } catch {
    $line='Request timed out.'
    $metric=@{type='metric';ok=$false;rtt=$null;ttl=$null;address=$t;seq=$seq} | ConvertTo-Json -Compress
  }
  [Console]::Out.WriteLine($line)
  [Console]::Out.WriteLine(('@@METRIC@@' + $metric))
  [Console]::Out.Flush()
  if($maxCount -eq 0 -or $seq -lt $maxCount){
    Start-Sleep -Milliseconds 1000
  }
}
`.trim();
}

function buildTracertScript(target) {
  return `
$ErrorActionPreference='Continue'
$t='${target}'
[Console]::Out.WriteLine(('Tracing route to {0} (max 30 hops)...' -f $t))
[Console]::Out.Flush()
$p=New-Object System.Net.NetworkInformation.Ping
for($ttl=1; $ttl -le 30; $ttl++){
  $opt=New-Object System.Net.NetworkInformation.PingOptions($ttl,$true)
  $buf=New-Object byte[] 32
  $times=@()
  $addr=$null
  $ok=$false
  for($i=0; $i -lt 3; $i++){
    try{
      $r=$p.Send($t,2000,$buf,$opt)
      if($r.Status -eq 'Success' -or $r.Status -eq 'TtlExpired'){
        $times += ('{0} ms' -f $r.RoundtripTime)
        $addr=$r.Address.ToString()
        if($r.Status -eq 'Success'){ $ok=$true }
      } else {
        $times += '*'
      }
    } catch {
      $times += '*'
    }
  }
  $hopDisplay='*'
  if($addr){
    $hopDisplay=$addr
    try{
      $task=[System.Net.Dns]::GetHostEntryAsync($addr)
      if($task.Wait(350) -and $task.Result -and $task.Result.HostName -and $task.Result.HostName -ne $addr){
        $hopDisplay=('{0} [{1}]' -f $task.Result.HostName,$addr)
      }
    } catch {}
  }
  $line=('{0,2}  {1,-10} {2,-10} {3,-10}  {4}' -f $ttl,$times[0],$times[1],$times[2],$hopDisplay)
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
  if($ok){
    [Console]::Out.WriteLine('Trace complete.')
    [Console]::Out.Flush()
    break
  }
}
`.trim();
}

function buildPortScanScript(target, ports) {
  const portLiteral = ports.join(",");
  return `
$ErrorActionPreference='Continue'
$t='${target}'
$ports=@(${portLiteral})
[Console]::Out.WriteLine(('TCP Port Scan: {0} ({1} ports, timeout 2000ms)...' -f $t,$ports.Count))
[Console]::Out.Flush()
$openCount=0
foreach($port in $ports){
  $tcp=$null
  $sw=[System.Diagnostics.Stopwatch]::StartNew()
  try{
    $tcp=New-Object System.Net.Sockets.TcpClient
    $ar=$tcp.BeginConnect($t,$port,$null,$null)
    $wait=$ar.AsyncWaitHandle.WaitOne(2000,$false)
    if($wait -and $tcp.Connected){
      $tcp.EndConnect($ar)
      $sw.Stop()
      $openCount++
      $line=('[OPEN]    {0}:{1,-5}  ({2}ms)' -f $t,$port,$sw.ElapsedMilliseconds)
    } else {
      $sw.Stop()
      $line=('[CLOSED]  {0}:{1,-5}  (Timeout / Filtered)' -f $t,$port)
    }
  } catch {
    $sw.Stop()
    $line=('[CLOSED]  {0}:{1,-5}  (Refused / Unreachable)' -f $t,$port)
  } finally {
    if($tcp){ try{ $tcp.Close() } catch {} }
  }
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}
[Console]::Out.WriteLine(('Port scan complete: {0}/{1} open.' -f $openCount,$ports.Count))
[Console]::Out.Flush()
`.trim();
}

function buildDnsScript(target) {
  return `
$ErrorActionPreference='Continue'
$t='${target}'
[Console]::Out.WriteLine(('DNS Lookup: {0}' -f $t))
[Console]::Out.Flush()
try{
  $parsedIp=$null
  $isIp=[System.Net.IPAddress]::TryParse($t,[ref]$parsedIp)
  $entry=[System.Net.Dns]::GetHostEntry($t)
  if($entry.HostName){
    [Console]::Out.WriteLine(('HostName   : {0}' -f $entry.HostName))
  }
  if($entry.Aliases -and $entry.Aliases.Count -gt 0){
    [Console]::Out.WriteLine(('Aliases    : {0}' -f ($entry.Aliases -join ', ')))
  }
  $addrs=[System.Net.Dns]::GetHostAddresses($t)
  $v4=@($addrs | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } | ForEach-Object { $_.ToString() })
  $v6=@($addrs | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6 } | ForEach-Object { $_.ToString() })
  if($v4.Count -gt 0){
    [Console]::Out.WriteLine(('IPv4 (A)   : {0}' -f ($v4 -join ', ')))
  }
  if($v6.Count -gt 0){
    [Console]::Out.WriteLine(('IPv6 (AAAA): {0}' -f ($v6 -join ', ')))
  }
  if($isIp -and $entry.HostName -eq $t){
    [Console]::Out.WriteLine('Reverse PTR: Kayit bulunamadi')
  }
} catch {
  [Console]::Out.WriteLine(('DNS Error  : {0}' -f $_.Exception.Message))
}
[Console]::Out.WriteLine('DNS lookup complete.')
[Console]::Out.Flush()
`.trim();
}

function processLine(line) {
  if (!line.length) return;
  if (line.startsWith("@@METRIC@@")) {
    try {
      const metric = JSON.parse(line.slice("@@METRIC@@".length));
      send(metric);
      handleMetricWatch(Boolean(metric.ok));
    } catch (_) {}
    return;
  }
  send({ type: "line", text: line });
  if (!watchEnabled) return;
  // Metric olmayan yedek durumlar icin satir bazli kontrol yapma (@@METRIC@@ yoksa kullanilir)
}

function onStdout(chunk) {
  lineBuf += chunk.toString("utf8");
  let idx;
  while ((idx = lineBuf.indexOf("\n")) >= 0) {
    const line = lineBuf.slice(0, idx).replace(/\r$/, "");
    lineBuf = lineBuf.slice(idx + 1);
    processLine(line);
  }
}

function startTool(msg) {
  stopChild();
  lineBuf = "";
  failCount = 0;
  wasDown = false;

  const target = validateTarget(msg.target);
  if (!target) {
    send({ type: "error", message: "Geçersiz hedef (IP veya hostname girin)." });
    return;
  }

  const allowedTools = new Set(["ping", "tracert", "port", "dns"]);
  const tool = allowedTools.has(msg.tool) ? msg.tool : "ping";
  notifyEnabled = msg.notify !== false;
  watchTarget = target;
  watchEnabled = tool === "ping";

  let script;
  if (tool === "tracert") {
    script = buildTracertScript(target);
  } else if (tool === "port") {
    const ports = parsePorts(msg.ports);
    if (ports.length === 0) {
      send({ type: "error", message: "Geçerli port bulunamadı (1-65535)." });
      return;
    }
    script = buildPortScanScript(target, ports);
  } else if (tool === "dns") {
    script = buildDnsScript(target);
  } else {
    const count = normalizeCount(msg.count, msg.continuous);
    if (count === null) {
      send({ type: "error", message: "Geçersiz paket sayısı (0-100)." });
      return;
    }
    script = buildPingScript(target, count);
  }

  child = spawn(
    psExe(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  send({ type: "started", target, tool });
  dbg(`started ${tool} ${target} pid=${child.pid}`);

  child.stdout.on("data", onStdout);
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) send({ type: "line", text });
  });
  child.on("error", (err) => {
    send({ type: "error", message: String(err.message || err) });
    child = null;
  });
  child.on("close", (code) => {
    if (lineBuf.trim()) {
      processLine(lineBuf.trim());
      lineBuf = "";
    }
    send({ type: "stopped", code });
    child = null;
  });
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.action === "start") {
    startTool(msg);
  } else if (msg.action === "stop") {
    stopChild();
    send({ type: "stopped", code: -1 });
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const len = buffer.readUInt32LE(0);
    if (len <= 0 || len > 1048576) {
      dbg("invalid frame length: " + len);
      process.exit(1);
    }
    if (buffer.length < 4 + len) break;
    const json = buffer.slice(4, 4 + len).toString("utf8");
    buffer = buffer.slice(4 + len);
    try {
      handleMessage(JSON.parse(json));
    } catch (err) {
      dbg("parse error: " + err);
      send({ type: "error", message: "Mesaj parse hatası" });
    }
  }
});

process.stdin.on("end", () => {
  stopChild();
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  dbg("uncaught: " + err);
  try {
    send({ type: "error", message: String(err.message || err) });
  } catch (_) {}
});

dbg("host started");
