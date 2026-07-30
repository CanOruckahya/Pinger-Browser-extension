const params = new URLSearchParams(location.search);
const elTitle = document.getElementById("title");
const elIp = document.getElementById("ip");
const elStatus = document.getElementById("status");
const elLog = document.getElementById("log");
const btnPing = document.getElementById("btnPing");
const btnTrace = document.getElementById("btnTrace");
const btnStop = document.getElementById("btnStop");

let tool = params.get("tool") === "tracert" ? "tracert" : "ping";
let running = false;

if (params.get("target") && params.get("target") !== "__invalid__") {
  elIp.value = params.get("target");
}

function setStatus(text, kind = "") {
  elStatus.textContent = text;
  elStatus.className = "status" + (kind ? ` ${kind}` : "");
}

function appendLine(text, cls) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text.endsWith("\n") ? text : text + "\n";
  elLog.appendChild(span);
  elLog.scrollTop = elLog.scrollHeight;
}

function clearLog() {
  elLog.innerHTML = "";
}

function classifyLine(line) {
  const lower = line.toLowerCase();
  if (
    lower.includes("ttl=") ||
    lower.includes("bytes=") ||
    lower.includes("reply from") ||
    lower.includes("yanıt") ||
    lower.includes("time=") ||
    /\dms\b/.test(lower)
  ) {
    return "ok";
  }
  if (
    lower.includes("timed out") ||
    lower.includes("zaman aşımı") ||
    lower.includes("unreachable") ||
    lower.includes("ulaşılamıyor") ||
    lower.includes("general failure") ||
    lower.includes("could not find host") ||
    lower.includes("request timed out") ||
    (lower.includes("*") && !lower.includes("ms") && /^\s*\d+/.test(line))
  ) {
    return "fail";
  }
  return "";
}

function setRunning(on) {
  running = on;
  btnPing.disabled = on;
  btnTrace.disabled = on;
  btnStop.disabled = !on;
  elIp.disabled = on;
}

async function start(nextTool) {
  const target = elIp.value.trim();
  if (!target) {
    setStatus("IP gir", "error");
    elIp.focus();
    return;
  }
  tool = nextTool === "tracert" ? "tracert" : "ping";
  elTitle.textContent = tool === "tracert" ? "Tracert" : "Pinger";
  clearLog();
  appendLine(
    tool === "tracert" ? `> tracert ${target}` : `> ping ${target} -t`,
    "meta"
  );
  setRunning(true);
  setStatus("Çalışıyor…", "running");

  const res = await chrome.runtime.sendMessage({
    type: "PING_VIA_NATIVE",
    target,
    tool,
    continuous: tool === "ping",
  });

  if (!res?.ok) {
    setRunning(false);
    setStatus(res?.error || "Native host hatası", "error");
    appendLine(res?.error || "Başlatılamadı", "fail");
  }
}

async function stop() {
  await chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" });
  setRunning(false);
  setStatus("Durduruldu", "warn");
  appendLine("[durduruldu]", "meta");
}

btnPing.addEventListener("click", () => start("ping"));
btnTrace.addEventListener("click", () => start("tracert"));
btnStop.addEventListener("click", () => stop());
elIp.addEventListener("keydown", (e) => {
  if (e.key === "Enter") start("ping");
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "START_PING" && msg.target) {
    elIp.value = msg.target;
    start(msg.tool === "tracert" ? "tracert" : "ping");
    return;
  }
  if (msg?.type === "NATIVE_OUTPUT" && msg.payload) {
    const p = msg.payload;
    if (p.type === "line") appendLine(p.text, classifyLine(p.text));
    else if (p.type === "started") {
      setRunning(true);
      setStatus("Çalışıyor…", "running");
    } else if (p.type === "stopped") {
      setRunning(false);
      setStatus("Bitti", "warn");
    } else if (p.type === "error") {
      setRunning(false);
      setStatus(p.message || "Hata", "error");
      appendLine(p.message || "Hata", "fail");
    }
  }
  if (msg?.type === "NATIVE_DISCONNECTED") {
    setRunning(false);
    setStatus(msg.error || "Bağlantı koptu", "error");
  }
});

async function boot() {
  if (!elIp.value) {
    const data = await chrome.runtime.sendMessage({ type: "GET_PENDING" });
    if (data?.pendingTarget && data.pendingTarget !== "__invalid__") {
      elIp.value = data.pendingTarget;
    }
    if (data?.pendingTool === "tracert") tool = "tracert";
    if (data?.lastError) setStatus(data.lastError, "error");
  }

  elTitle.textContent = tool === "tracert" ? "Tracert" : "Pinger";

  if (elIp.value && params.get("autostart") !== "0") {
    // context menü / sağ tık ile açıldıysa otomatik başlat
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
