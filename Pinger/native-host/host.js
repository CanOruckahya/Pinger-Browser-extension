#!/usr/bin/env node
/**
 * Pinger Native Messaging Host
 * ping.exe pipe'da buffer'a takıldığı için .NET Ping / TTL hop kullanır.
 */
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const logPath = path.join(__dirname, "host-debug.log");
function dbg(msg) {
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

function send(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function showWinToast(target) {
  const safe = String(target).replace(/'/g, "");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.BalloonTipTitle = 'Pinger'
$n.BalloonTipText = '${safe} cevap vermeye basladi'
$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
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
    failCount += 1;
    if (failCount >= 3) wasDown = true;
    return;
  }
  if (ok) {
    if (wasDown) {
      send({ type: "recovered", target: watchTarget });
      showWinToast(watchTarget);
      wasDown = false;
    }
    failCount = 0;
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

function psExe() {
  return path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
}

function buildPingScript(target) {
  // Her satırdan sonra Flush — pipe buffer takılması olmasın
  return `
$ErrorActionPreference='Continue'
$t='${target}'
$p=New-Object System.Net.NetworkInformation.Ping
while($true){
  try{
    $r=$p.Send($t,2000)
    if($r.Status -eq 'Success'){
      $ttl=0
      if($r.Options){ $ttl=$r.Options.Ttl }
      $line=('Reply from {0}: bytes={1} time={2}ms TTL={3}' -f $r.Address,$r.Buffer.Length,$r.RoundtripTime,$ttl)
    } else {
      $line=('Request timed out. ({0})' -f $r.Status)
    }
  } catch {
    $line='Request timed out.'
  }
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
`.trim();
}

function buildTracertScript(target) {
  return `
$ErrorActionPreference='Continue'
$t='${target}'
[Console]::Out.WriteLine(('Tracing route to {0}...' -f $t))
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
  $hop= if($addr){ $addr } else { '*' }
  $line=('{0,2}  {1,-10} {2,-10} {3,-10}  {4}' -f $ttl,$times[0],$times[1],$times[2],$hop)
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

function onStdout(chunk) {
  lineBuf += chunk.toString("utf8");
  let idx;
  while ((idx = lineBuf.indexOf("\n")) >= 0) {
    const line = lineBuf.slice(0, idx).replace(/\r$/, "");
    lineBuf = lineBuf.slice(idx + 1);
    if (line.length) {
      send({ type: "line", text: line });
      noteLine(line);
    }
  }
}

function startTool(target, tool, continuous) {
  stopChild();
  lineBuf = "";
  failCount = 0;
  wasDown = false;
  watchTarget = target;
  watchEnabled = tool !== "tracert";

  if (!/^[A-Za-z0-9\-.:]+$/.test(target)) {
    send({ type: "error", message: "Geçersiz hedef." });
    return;
  }

  const isTracert = tool === "tracert";
  let script;
  if (isTracert) {
    script = buildTracertScript(target);
  } else if (continuous === false) {
    script = `
$ErrorActionPreference='Continue'
$t='${target}'
$p=New-Object System.Net.NetworkInformation.Ping
1..4 | ForEach-Object {
  try {
    $r=$p.Send($t,2000)
    if($r.Status -eq 'Success'){
      $ttl=0
      if($r.Options){ $ttl=$r.Options.Ttl }
      [Console]::Out.WriteLine(('Reply from {0}: bytes={1} time={2}ms TTL={3}' -f $r.Address,$r.Buffer.Length,$r.RoundtripTime,$ttl))
    } else {
      [Console]::Out.WriteLine('Request timed out.')
    }
  } catch {
    [Console]::Out.WriteLine('Request timed out.')
  }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 500
}
`.trim();
  } else {
    script = buildPingScript(target);
  }

  child = spawn(
    psExe(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  send({ type: "started", target, tool: isTracert ? "tracert" : "ping" });
  dbg(`started ${tool} ${target} pid=${child.pid}`);

  child.stdout.on("data", onStdout);
  child.stderr.on("data", onStdout);
  child.on("error", (err) => {
    send({ type: "error", message: String(err.message || err) });
    child = null;
  });
  child.on("close", (code) => {
    if (lineBuf.trim()) {
      send({ type: "line", text: lineBuf.trim() });
      noteLine(lineBuf.trim());
      lineBuf = "";
    }
    send({ type: "stopped", code });
    child = null;
  });
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.action === "start") {
    startTool(
      String(msg.target || ""),
      msg.tool === "tracert" ? "tracert" : "ping",
      msg.continuous !== false
    );
  } else if (msg.action === "stop") {
    stopChild();
    send({ type: "stopped", code: -1 });
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const len = buffer.readUInt32LE(0);
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
