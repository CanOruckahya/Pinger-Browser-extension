const params = new URLSearchParams(location.search);
const elTitle = document.getElementById("title");
const elIp = document.getElementById("ip");
const elStatus = document.getElementById("status");
const elDot = document.getElementById("statusDot");
const elLog = document.getElementById("log");
const btnRun = document.getElementById("btnRun");
const btnStop = document.getElementById("btnStop");
const btnMode = document.getElementById("btnMode");
const btnNotify = document.getElementById("btnNotify");
const btnTimestamp = document.getElementById("btnTimestamp");
const btnCopy = document.getElementById("btnCopy");
const btnClear = document.getElementById("btnClear");
const pingOpts = document.getElementById("pingOpts");
const portOpts = document.getElementById("portOpts");
const hintOpts = document.getElementById("hintOpts");
const portsInput = document.getElementById("portsInput");
const recentRow = document.getElementById("recentRow");
const canvas = document.getElementById("sparkline");
const ctx = canvas.getContext("2d");

const statLoss = document.getElementById("statLoss");
const statLast = document.getElementById("statLast");
const statAvg = document.getElementById("statAvg");
const statMinMax = document.getElementById("statMinMax");
const setupBanner = document.getElementById("setupBanner");
const btnCopyInstall = document.getElementById("btnCopyInstall");

const EASY_INSTALL_CMD =
  "irm https://raw.githubusercontent.com/CanOruckahya/Pinger-Browser-extension/main/scripts/easy-install.ps1 | iex";

const TAB_BTNS = Array.from(document.querySelectorAll(".tab"));
const COUNT_PILLS = Array.from(document.querySelectorAll(".pill"));

const TOOL_TITLES = {
  ping: "Pinger",
  tracert: "Tracert",
  port: "Port Test",
  dns: "DNS Lookup",
};

let tool = ["ping", "tracert", "port", "dns"].includes(params.get("tool"))
  ? params.get("tool")
  : "ping";
let running = false;
let pingCount = 0;
let showTimestamp = false;
let notifyEnabled = true;
let uiMode = "basic";
let activeRunId = 0;
let userStopped = false;

let stats = {
  sent: 0,
  lost: 0,
  rtts: [],
  samples: [], // { ok: bool, rtt: number | null }
};

if (params.get("target") && params.get("target") !== "__invalid__") {
  elIp.value = params.get("target");
}

function setStatus(text, kind = "") {
  elStatus.textContent = text;
  elStatus.className = "status" + (kind ? ` ${kind}` : "");
  elDot.className = "dot" + (kind ? ` ${kind}` : "");
}

function nowTimePrefix() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}] `;
}

function appendLine(text, cls) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  const line = showTimestamp && cls !== "meta" ? `${nowTimePrefix()}${text}` : text;
  span.textContent = line.endsWith("\n") ? line : line + "\n";
  elLog.appendChild(span);
  elLog.scrollTop = elLog.scrollHeight;
}

function clearLog() {
  elLog.innerHTML = "";
}

function resetMetrics() {
  stats = { sent: 0, lost: 0, rtts: [], samples: [] };
  renderStats();
  drawSparkline();
}

function renderStats() {
  const { sent, lost, rtts } = stats;
  const lossPct = sent > 0 ? Math.round((lost / sent) * 100) : 0;
  statLoss.textContent = `${sent} / ${lossPct}%`;
  statLoss.className = "stat-v" + (lossPct > 20 ? " fail" : lossPct > 0 ? " warn" : sent > 0 ? " ok" : "");

  if (stats.samples.length === 0) {
    statLast.textContent = "-";
    statLast.className = "stat-v";
  } else {
    const lastSample = stats.samples[stats.samples.length - 1];
    if (!lastSample.ok || lastSample.rtt === null) {
      statLast.textContent = "Timeout";
      statLast.className = "stat-v fail";
    } else {
      statLast.textContent = `${lastSample.rtt} ms`;
      statLast.className =
        "stat-v " + (lastSample.rtt < 50 ? "ok" : lastSample.rtt <= 150 ? "warn" : "fail");
    }
  }

  if (rtts.length === 0) {
    statAvg.textContent = "-";
    statMinMax.textContent = "-";
  } else {
    const sum = rtts.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / rtts.length);
    const min = Math.min(...rtts);
    const max = Math.max(...rtts);
    statAvg.textContent = `${avg} ms`;
    statMinMax.textContent = `${min} / ${max}`;
  }
}

function drawSparkline() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Arka plan grid cizgileri
  ctx.strokeStyle = "rgba(138, 155, 178, 0.14)";
  ctx.lineWidth = 1;
  for (const frac of [0.25, 0.5, 0.75]) {
    const y = Math.round(h * frac) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const samples = stats.samples.slice(-30);
  if (samples.length === 0) {
    ctx.fillStyle = "rgba(138, 155, 178, 0.45)";
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("Paket bekleniyor...", w / 2, h / 2 + 4);
    return;
  }

  const maxSlots = 30;
  const gap = 3;
  const barW = Math.floor((w - gap * (maxSlots - 1)) / maxSlots);
  const maxRtt = Math.max(50, ...samples.filter((s) => s.ok && s.rtt != null).map((s) => s.rtt));

  samples.forEach((sample, idx) => {
    const x = idx * (barW + gap);
    if (!sample.ok || sample.rtt === null) {
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(x, 4, barW, h - 8);
      return;
    }
    const barH = Math.max(5, Math.round((sample.rtt / maxRtt) * (h - 10)));
    const y = h - barH - 4;
    ctx.fillStyle =
      sample.rtt < 50 ? "#3ecf8e" : sample.rtt <= 150 ? "#f0b429" : "#fb923c";
    ctx.fillRect(x, y, barW, barH);
  });
}

function classifyLine(line) {
  const lower = line.toLowerCase();
  if (lower.startsWith("[open]") || lower.includes("trace complete") || lower.includes("lookup complete")) {
    return "ok";
  }
  if (
    lower.startsWith("[closed]") ||
    lower.includes("timed out") ||
    lower.includes("zaman aşımı") ||
    lower.includes("unreachable") ||
    lower.includes("ulaşılamıyor") ||
    lower.includes("general failure") ||
    lower.includes("dns error") ||
    (lower.includes("*") && !lower.includes("ms") && /^\s*\d+/.test(line))
  ) {
    return "fail";
  }
  if (
    lower.includes("ttl=") ||
    lower.includes("bytes=") ||
    lower.includes("reply from") ||
    /\dms\b/.test(lower)
  ) {
    return "ok";
  }
  if (lower.startsWith("hostname") || lower.startsWith("ipv4") || lower.startsWith("ipv6") || lower.startsWith("aliases")) {
    return "info";
  }
  if (lower.startsWith("reverse ptr")) {
    return "warn";
  }
  return "";
}

function setRunning(on) {
  running = on;
  btnRun.disabled = on;
  btnStop.disabled = !on;
  elIp.disabled = on;
  for (const tab of TAB_BTNS) {
    tab.disabled = on;
  }
}

function selectTool(nextTool) {
  tool = ["ping", "tracert", "port", "dns"].includes(nextTool) ? nextTool : "ping";
  elTitle.textContent = TOOL_TITLES[tool] || "Pinger";

  for (const t of TAB_BTNS) {
    t.classList.toggle("active", t.dataset.tool === tool);
  }

  pingOpts.classList.toggle("hidden", tool !== "ping");
  portOpts.classList.toggle("hidden", tool !== "port");
  hintOpts.classList.toggle("hidden", tool === "ping" || tool === "port");

  if (tool === "tracert") {
    hintOpts.textContent = "Hedefe giden yönlendirici adımlarını (maks. 30 hop) gösterir.";
  } else if (tool === "dns") {
    hintOpts.textContent = "IPv4 / IPv6 adreslerini veya IP için Reverse PTR kaydını çözer.";
  }
}

function selectPingCount(cnt) {
  pingCount = Number(cnt) || 0;
  for (const p of COUNT_PILLS) {
    p.classList.toggle("active", Number(p.dataset.count) === pingCount);
  }
}

function applyUiMode(mode) {
  uiMode = mode === "advanced" ? "advanced" : "basic";
  const isBasic = uiMode === "basic";
  document.documentElement.classList.toggle("basic-mode", isBasic);
  document.body.classList.toggle("basic-mode", isBasic);
  if (btnMode) {
    btnMode.textContent = isBasic ? "Advanced" : "Basic";
    btnMode.title = isBasic ? "Gelişmiş arayüze geç" : "Sade (Basic) arayüze geç";
  }
  btnRun.textContent = isBasic ? "Pingle" : "Başlat";
  if (isBasic && !running) {
    selectTool("ping");
  }
}

function renderRecent(targets) {
  recentRow.innerHTML = "";
  const list = (targets || []).slice(0, 6);
  if (list.length === 0) {
    recentRow.classList.add("hidden");
    return;
  }
  recentRow.classList.remove("hidden");
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-chip";
    btn.textContent = item;
    btn.addEventListener("click", () => {
      if (running) return;
      elIp.value = item;
      start(tool);
    });
    recentRow.appendChild(btn);
  }
}

async function refreshRecent() {
  const res = await chrome.runtime.sendMessage({ type: "GET_RECENT" }).catch(() => null);
  if (res?.targets) renderRecent(res.targets);
}

async function saveSettings(partial) {
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: partial }).catch(() => {});
}

async function start(nextTool) {
  const target = elIp.value.trim();
  if (!target) {
    setStatus("IP/Host gir", "error");
    elIp.focus();
    return;
  }
  selectTool(nextTool || tool);
  clearLog();
  resetMetrics();

  const ports = portsInput.value.trim() || "80,443,22,3389,8080";
  const headerCmd =
    tool === "tracert"
      ? `> tracert ${target}`
      : tool === "port"
      ? `> port-scan ${target} [${ports}]`
      : tool === "dns"
      ? `> dns-lookup ${target}`
      : pingCount === 0
      ? `> ping ${target} -t`
      : `> ping ${target} -n ${pingCount}`;

  appendLine(headerCmd, "meta");
  userStopped = false;
  activeRunId = 0;
  setRunning(true);
  setStatus("Çalışıyor…", "running");

  const res = await chrome.runtime.sendMessage({
    type: "PING_VIA_NATIVE",
    target,
    tool,
    count: tool === "ping" ? pingCount : undefined,
    continuous: tool === "ping" && pingCount === 0,
    ports: tool === "port" ? ports : undefined,
    notify: notifyEnabled,
  });

  refreshRecent();

  if (!res?.ok) {
    setRunning(false);
    setStatus(res?.error || "Native host hatası", "error");
    appendLine(res?.error || "Başlatılamadı", "fail");
    if (setupBanner) setupBanner.classList.remove("hidden");
  } else if (res.runId) {
    activeRunId = res.runId;
  }
}

async function stop() {
  userStopped = true;
  activeRunId = 0;
  setRunning(false);
  setStatus("Durduruldu", "warn");
  appendLine("[durduruldu]", "meta");
  await chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" }).catch(() => {});
}

for (const tab of TAB_BTNS) {
  tab.addEventListener("click", () => {
    if (!running) selectTool(tab.dataset.tool);
  });
}

for (const pill of COUNT_PILLS) {
  pill.addEventListener("click", () => {
    selectPingCount(pill.dataset.count);
    saveSettings({ pingCount });
  });
}

btnRun.addEventListener("click", () => start(tool));
btnStop.addEventListener("click", () => stop());
btnClear.addEventListener("click", () => {
  clearLog();
  resetMetrics();
});

btnTimestamp.addEventListener("click", () => {
  showTimestamp = !showTimestamp;
  btnTimestamp.classList.toggle("active", showTimestamp);
  saveSettings({ showTimestamp });
});

btnNotify.addEventListener("click", () => {
  notifyEnabled = !notifyEnabled;
  btnNotify.classList.toggle("active", notifyEnabled);
  btnNotify.textContent = notifyEnabled ? "🔔" : "🔕";
  saveSettings({ notify: notifyEnabled });
});

if (btnMode) {
  btnMode.addEventListener("click", () => {
    const nextMode = uiMode === "basic" ? "advanced" : "basic";
    applyUiMode(nextMode);
    saveSettings({ uiMode: nextMode });
  });
}

btnCopy.addEventListener("click", async () => {
  const summary = `Hedef: ${elIp.value.trim()} | Paket/Kayıp: ${statLoss.textContent} | Ort: ${statAvg.textContent} | Min/Maks: ${statMinMax.textContent}`;
  const text = `${summary}\n${"-".repeat(48)}\n${elLog.innerText}`;
  try {
    await navigator.clipboard.writeText(text);
    const old = btnCopy.textContent;
    btnCopy.textContent = "✅ Kopyalandı";
    setTimeout(() => {
      btnCopy.textContent = old;
    }, 1200);
  } catch (_) {}
});

portsInput.addEventListener("change", () => {
  saveSettings({ defaultPorts: portsInput.value.trim() || "80,443,22,3389,8080" });
});

if (btnCopyInstall) {
  btnCopyInstall.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(EASY_INSTALL_CMD);
      const old = btnCopyInstall.textContent;
      btnCopyInstall.textContent = "✅ Kopyalandı";
      setTimeout(() => {
        btnCopyInstall.textContent = old;
      }, 1500);
    } catch (_) {}
  });
}

elIp.addEventListener("keydown", (e) => {
  if (e.key === "Enter") start(tool);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "START_PING" && msg.target) {
    elIp.value = msg.target;
    start(msg.tool || tool);
    return;
  }
  if (msg?.type === "NATIVE_OUTPUT" && msg.payload) {
    const p = msg.payload;
    if (p.type !== "stopped" && p.type !== "error") {
      if (userStopped) return;
      if (activeRunId && p.runId && p.runId !== activeRunId) return;
    } else if (activeRunId && p.runId && p.runId !== activeRunId) {
      return;
    }

    if (p.type === "line") {
      if (setupBanner) setupBanner.classList.add("hidden");
      if (!running) {
        activeRunId = p.runId || activeRunId;
        setRunning(true);
        setStatus("Çalışıyor…", "running");
      }
      appendLine(p.text, classifyLine(p.text));
    } else if (p.type === "metric") {
      if (setupBanner) setupBanner.classList.add("hidden");
      if (!running) {
        activeRunId = p.runId || activeRunId;
        setRunning(true);
        setStatus("Çalışıyor…", "running");
      }
      stats.sent += 1;
      if (p.ok && typeof p.rtt === "number") {
        stats.rtts.push(p.rtt);
        stats.samples.push({ ok: true, rtt: p.rtt });
      } else {
        stats.lost += 1;
        stats.samples.push({ ok: false, rtt: null });
      }
      renderStats();
      drawSparkline();
    } else if (p.type === "down") {
      setStatus(`${p.target} yanıt vermiyor!`, "error");
      appendLine(`[UYARI] ${p.target} ardışık 3+ timeout verdi.`, "fail");
    } else if (p.type === "recovered") {
      setStatus(`${p.target} tekrar çevrimiçi`, "running");
      appendLine(`[KURTARILDI] ${p.target} tekrar yanıt vermeye başladı.`, "ok");
    } else if (p.type === "started") {
      if (setupBanner) setupBanner.classList.add("hidden");
      activeRunId = p.runId || activeRunId;
      setRunning(true);
      setStatus("Çalışıyor…", "running");
    } else if (p.type === "stopped") {
      activeRunId = 0;
      setRunning(false);
      if (!userStopped && !p.forced) {
        setStatus("Tamamlandı", "warn");
      }
    } else if (p.type === "error") {
      activeRunId = 0;
      setRunning(false);
      setStatus(p.message || "Hata", "error");
      appendLine(p.message || "Hata", "fail");
    }
  }
  if (msg?.type === "NATIVE_DISCONNECTED") {
    setRunning(false);
    setStatus(msg.error || "Bağlantı koptu", "error");
    if (setupBanner) setupBanner.classList.remove("hidden");
  }
});

async function boot() {
  drawSparkline();

  const settingsRes = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
  let loadedMode = "basic";
  if (settingsRes?.settings) {
    const s = settingsRes.settings;
    showTimestamp = Boolean(s.showTimestamp);
    notifyEnabled = s.notify !== false;
    pingCount = Number(s.pingCount || 0);
    loadedMode = s.uiMode === "advanced" ? "advanced" : "basic";
    if (s.defaultPorts) portsInput.value = s.defaultPorts;
    btnTimestamp.classList.toggle("active", showTimestamp);
    btnNotify.classList.toggle("active", notifyEnabled);
    btnNotify.textContent = notifyEnabled ? "🔔" : "🔕";
    selectPingCount(pingCount);
  }

  await refreshRecent();

  const stateRes = await chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => null);
  const activeState = stateRes?.state;

  if (activeState?.running) {
    userStopped = false;
    activeRunId = activeState.runId || 0;
    if (activeState.target) elIp.value = activeState.target;
    if (activeState.tool) tool = activeState.tool;
  } else if (!elIp.value) {
    const data = await chrome.runtime.sendMessage({ type: "GET_PENDING" }).catch(() => null);
    if (data?.pendingTarget && data.pendingTarget !== "__invalid__") {
      elIp.value = data.pendingTarget;
    }
    if (data?.pendingTool) tool = data.pendingTool;
    if (data?.lastError) setStatus(data.lastError, "error");
  }

  if (tool !== "ping") {
    loadedMode = "advanced";
  }
  applyUiMode(loadedMode);
  selectTool(tool);

  if (activeState?.running) {
    setRunning(true);
    setStatus("Çalışıyor…", "running");
    appendLine(`> Aktif oturuma bağlanıldı: ${activeState.target}`, "meta");
  } else if (elIp.value && params.get("autostart") !== "0") {
    if (params.has("target") || params.get("auto") === "1") {
      start(tool);
    }
  }
}

boot();

window.addEventListener("beforeunload", () => {
  if (running) {
    chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" }).catch(() => {});
  }
});
