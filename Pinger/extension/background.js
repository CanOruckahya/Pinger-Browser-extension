const NATIVE_HOST = "com.pinger.host";
const RECENT_KEY = "pingerRecentTargets";
const SETTINGS_KEY = "pingerSettings";

const DEFAULT_SETTINGS = {
  showTimestamp: false,
  notify: true,
  pingCount: 0,
  defaultPorts: "80,443,22,3389,8080",
  uiMode: "basic",
};

/** Chrome + Firefox: session yoksa local'e dus */
const sessionStore = chrome.storage.session || chrome.storage.local;

function sessionGet(keys) {
  return sessionStore.get(keys);
}
function sessionSet(obj) {
  return sessionStore.set(obj);
}
function sessionRemove(keys) {
  return sessionStore.remove(keys);
}

const IP_V4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IP_V6 =
  /^(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$/;

const ALLOWED_TOOLS = new Set(["ping", "tracert", "port", "dns"]);

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "pinger-ping",
      title: 'Pingle: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-tracert",
      title: 'Tracert: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-port",
      title: 'Port Tara: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-dns",
      title: 'DNS Lookup: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-ping-link",
      title: "Pingle (link)",
      contexts: ["link"],
    });
  });
}

ensureContextMenu();
chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);

function normalizeTarget(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/^["'`\[\(\{<]+/, "").replace(/["'`\]\)\}>,;]+$/, "");
  text = text.replace(/^https?:\/\//i, "");
  text = text.split("/")[0].split("?")[0].split("#")[0].trim();
  const bracket = text.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) text = bracket[1];
  else if (IP_V4.test(text.split(":")[0]) && text.includes(":")) {
    text = text.split(":")[0];
  }
  text = text.trim();
  if (IP_V4.test(text) || IP_V6.test(text)) return text;
  if (
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
      text
    )
  ) {
    return text;
  }
  return null;
}

/** Metin içinden ilk IPv4'ü veya hostname'i çıkar */
function extractIp(raw) {
  if (!raw) return null;
  const direct = normalizeTarget(raw);
  if (direct) return direct;
  const m = String(raw).match(
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/
  );
  return m ? m[0] : null;
}

async function getRecentTargets() {
  try {
    const data = await chrome.storage.local.get(RECENT_KEY);
    return Array.isArray(data[RECENT_KEY]) ? data[RECENT_KEY] : [];
  } catch (_) {
    return [];
  }
}

async function saveRecentTarget(target) {
  if (!target) return [];
  const prev = await getRecentTargets();
  const next = [target, ...prev.filter((item) => item !== target)].slice(0, 8);
  await chrome.storage.local.set({ [RECENT_KEY]: next }).catch(() => {});
  return next;
}

async function getSettings() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...(partial || {}) };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next }).catch(() => {});
  return next;
}

async function openInPagePanel(target, tool = "ping") {
  const mode = ALLOWED_TOOLS.has(tool) ? tool : "ping";
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      !tab?.id ||
      tab.url?.startsWith("edge://") ||
      tab.url?.startsWith("chrome://") ||
      tab.url?.startsWith("about:") ||
      tab.url?.startsWith("moz-extension://") ||
      tab.url?.startsWith("chrome-extension://")
    ) {
      return false;
    }
    await chrome.tabs.sendMessage(tab.id, {
      type: "OPEN_SIDE_PANEL",
      target,
      tool: mode,
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function openPingWindow(target, tool = "ping") {
  const mode = ALLOWED_TOOLS.has(tool) ? tool : "ping";
  await sessionSet({ pendingTarget: target, pendingTool: mode });

  if (target !== "__invalid__") {
    const ok = await openInPagePanel(target, mode);
    if (ok) return;
  }

  const width = 420;
  const height = 580;
  const left = 1420;
  const top = 60;

  const existing = await sessionGet("pingWindowId");
  if (existing.pingWindowId != null) {
    try {
      await chrome.windows.update(existing.pingWindowId, { focused: true });
      chrome.runtime
        .sendMessage({ type: "START_PING", target, tool: mode })
        .catch(() => {});
      return;
    } catch (_) {}
  }

  const q = new URLSearchParams({
    target: target === "__invalid__" ? "" : target,
    tool: mode,
    auto: "1",
  });

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`ping.html?${q}`),
    type: "popup",
    width,
    height,
    left,
    top,
    focused: true,
  });

  await sessionSet({ pingWindowId: win.id });
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { pingWindowId } = await sessionGet("pingWindowId");
  if (pingWindowId === windowId) {
    await sessionRemove("pingWindowId");
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const menuToolMap = {
    "pinger-ping": "ping",
    "pinger-tracert": "tracert",
    "pinger-port": "port",
    "pinger-dns": "dns",
    "pinger-ping-link": "ping",
  };
  const tool = menuToolMap[info.menuItemId];
  if (!tool) return;

  const raw =
    info.menuItemId === "pinger-ping-link"
      ? info.linkUrl || info.selectionText
      : info.selectionText;

  const target = extractIp(raw) || normalizeTarget(raw);
  if (!target) {
    await sessionSet({
      pendingTarget: null,
      lastError: `"${(raw || "").trim()}" geçerli bir IP/host değil.`,
    });
    await openPingWindow("__invalid__", tool);
    return;
  }
  await sessionSet({ lastError: null });
  await openPingWindow(target, tool);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING_TARGET") {
    const target = extractIp(msg.target) || normalizeTarget(msg.target);
    if (!target) {
      sendResponse({ ok: false, error: "Geçersiz IP/host" });
      return false;
    }
    const tool = ALLOWED_TOOLS.has(msg.tool) ? msg.tool : "ping";
    if (msg.inline) {
      sendResponse({ ok: true, target, tool });
      return false;
    }
    openPingWindow(target, tool).then(() =>
      sendResponse({ ok: true, target, tool })
    );
    return true;
  }
  if (msg?.type === "PING_VIA_NATIVE") {
    handleNativePing(msg)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: String(err?.message || err) });
      });
    return true;
  }
  if (msg?.type === "STOP_NATIVE_PING") {
    stopNativePing()
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: String(err?.message || err) });
      });
    return true;
  }
  if (msg?.type === "GET_PENDING") {
    sessionGet(["pendingTarget", "pendingTool", "lastError"]).then((data) =>
      sendResponse(data)
    );
    return true;
  }
  if (msg?.type === "GET_RECENT") {
    getRecentTargets().then((targets) => sendResponse({ targets }));
    return true;
  }
  if (msg?.type === "SAVE_RECENT") {
    saveRecentTarget(msg.target).then((targets) => sendResponse({ targets }));
    return true;
  }
  if (msg?.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }
  if (msg?.type === "SAVE_SETTINGS") {
    saveSettings(msg.settings).then((settings) => sendResponse({ settings }));
    return true;
  }
  if (msg?.type === "GET_STATE") {
    sendResponse({ state: activeState });
    return false;
  }
});

let port = null;
let runSeq = 0;
let activeState = { running: false, target: "", tool: "ping", runId: 0 };
let stopWatchdog = null;

function clearStopWatchdog() {
  if (stopWatchdog) {
    clearTimeout(stopWatchdog);
    stopWatchdog = null;
  }
}

function createBrowserNotification(idPrefix, message) {
  try {
    chrome.notifications.create(`${idPrefix}-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Pinger",
      message,
      priority: 2,
      requireInteraction: false,
    });
  } catch (_) {}
}

function handleWatchPayload(payload) {
  if (!payload) return;
  const target = payload.target || "IP";
  if (payload.type === "down") {
    createBrowserNotification("pinger-down", `${target} yanıt vermiyor (3+ timeout)`);
  } else if (payload.type === "recovered") {
    createBrowserNotification("pinger-up", `${target} tekrar cevap vermeye başladı`);
  }
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  });
}

function ensurePort() {
  if (port) return port;
  port = chrome.runtime.connectNative(NATIVE_HOST);

  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;

    if (message.type === "stopped" || message.type === "error") {
      clearStopWatchdog();
      if (!message.runId || message.runId === activeState.runId || activeState.runId === 0) {
        activeState.running = false;
        activeState.runId = 0;
      }
    } else if (activeState.runId === 0 || (message.runId && message.runId !== activeState.runId)) {
      // Eski veya durdurulmus oturuma ait gecikmis paketi dusur
      return;
    }

    handleWatchPayload(message);
    broadcast({ type: "NATIVE_OUTPUT", payload: message });
  });

  port.onDisconnect.addListener(() => {
    clearStopWatchdog();
    const wasRunning = activeState.running;
    activeState.running = false;
    activeState.runId = 0;
    const err = chrome.runtime.lastError?.message;
    if (wasRunning || err) {
      broadcast({
        type: "NATIVE_DISCONNECTED",
        error:
          err ||
          "Native host bağlantısı koptu. EasyInstall.bat ile kurup tarayıcıyı yenile.",
      });
    }
    port = null;
  });

  return port;
}

async function handleNativePing(msg) {
  const target = extractIp(msg.target) || normalizeTarget(msg.target);
  if (!target) {
    return { ok: false, error: "Geçersiz IP/host." };
  }
  const tool = ALLOWED_TOOLS.has(msg.tool) ? msg.tool : "ping";
  const settings = await getSettings();
  const count =
    msg.count !== undefined && msg.count !== null
      ? Number(msg.count)
      : Number(settings.pingCount || 0);
  const ports = msg.ports || settings.defaultPorts || "80,443,22,3389,8080";
  const notify = msg.notify !== undefined ? Boolean(msg.notify) : Boolean(settings.notify);

  await saveRecentTarget(target);

  clearStopWatchdog();
  const runId = ++runSeq;
  activeState = { running: true, target, tool, runId };

  try {
    const p = ensurePort();
    p.postMessage({
      action: "start",
      runId,
      target,
      tool,
      continuous: tool === "ping" && count === 0 && msg.continuous !== false,
      count: tool === "ping" ? count : undefined,
      ports: tool === "port" ? ports : undefined,
      notify,
    });
    return { ok: true, target, tool, runId };
  } catch (err) {
    activeState = { running: false, target: "", tool: "ping", runId: 0 };
    return { ok: false, error: String(err?.message || err) };
  }
}

async function stopNativePing() {
  const prevId = activeState.runId;
  activeState.running = false;
  activeState.runId = 0;
  clearStopWatchdog();

  try {
    if (port) {
      port.postMessage({ action: "stop" });
      stopWatchdog = setTimeout(() => {
        stopWatchdog = null;
        if (port) {
          try {
            port.disconnect();
          } catch (_) {}
          port = null;
        }
      }, 800);
    }
    broadcast({
      type: "NATIVE_OUTPUT",
      payload: { type: "stopped", code: -1, runId: prevId, forced: true },
    });
    return { ok: true, runId: prevId };
  } catch (err) {
    if (port) {
      try {
        port.disconnect();
      } catch (_) {}
      port = null;
    }
    return { ok: false, error: String(err?.message || err) };
  }
}
