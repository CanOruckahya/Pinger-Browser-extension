const NATIVE_HOST = "com.pinger.host";
const MENU_ID = "pinger-ping";

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

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Pingle: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-tracert",
      title: 'Tracert: "%s"',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "pinger-ping-link",
      title: "Pingle (link)",
      contexts: ["link"],
    });
  });
}

// Service worker her uyandığında menüyü yeniden yaz
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

/** Metin içinden ilk IPv4'ü çıkar (dashboard hücreleri için) */
function extractIp(raw) {
  if (!raw) return null;
  const direct = normalizeTarget(raw);
  if (direct) return direct;
  const m = String(raw).match(
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/
  );
  return m ? m[0] : null;
}

async function openInPagePanel(target, tool = "ping") {
  const mode = tool === "tracert" ? "tracert" : "ping";
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
  const mode = tool === "tracert" ? "tracert" : "ping";
  await sessionSet({ pendingTarget: target, pendingTool: mode });

  // Önce aynı sekmenin sağ kenar paneli
  if (target !== "__invalid__") {
    const ok = await openInPagePanel(target, mode);
    if (ok) return;
  }

  // Fallback: küçük popup (edge:// vs.)
  const width = 340;
  const height = 380;
  const left = 1500;
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
  let raw = info.selectionText;
  if (info.menuItemId === "pinger-ping-link") {
    raw = info.linkUrl || info.selectionText;
  }
  const allowed = [MENU_ID, "pinger-ping-link", "pinger-tracert"];
  if (!allowed.includes(info.menuItemId)) return;

  const tool = info.menuItemId === "pinger-tracert" ? "tracert" : "ping";
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
    // Content script kendi kenar panelini açar; burada sadece native başlatma yok
    // Eski çağrılar için: sayfada panel açmayı dene
    const target = extractIp(msg.target) || normalizeTarget(msg.target);
    if (!target) {
      sendResponse({ ok: false, error: "Geçersiz IP" });
      return false;
    }
    const tool = msg.tool === "tracert" ? "tracert" : "ping";
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
});

let port = null;

/** Cevap gelince Windows bildirimi (host recovered mesaji) */
function notifyRecovery(target) {
  const ip = target || "IP";
  const message = `${ip} cevap vermeye başladı`;
  try {
    chrome.notifications.create(`pinger-up-${Date.now()}`, {
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
  if (payload.type === "recovered") {
    notifyRecovery(payload.target);
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
    handleWatchPayload(message);
    broadcast({ type: "NATIVE_OUTPUT", payload: message });
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError?.message;
    broadcast({
      type: "NATIVE_DISCONNECTED",
      error:
        err ||
        "Native host bağlantısı koptu. install.bat ile kurup tarayıcıyı yenile.",
    });
    port = null;
  });

  return port;
}

async function handleNativePing(msg) {
  const target = extractIp(msg.target) || normalizeTarget(msg.target);
  if (!target) {
    return { ok: false, error: "Geçersiz IP/host." };
  }
  try {
    const p = ensurePort();
    p.postMessage({
      action: "start",
      target,
      tool: msg.tool === "tracert" ? "tracert" : "ping",
      continuous: msg.continuous !== false && msg.tool !== "tracert",
    });
    return { ok: true, target };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function stopNativePing() {
  try {
    if (port) {
      port.postMessage({ action: "stop" });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
