(() => {
  // Sadece ana frame — iframe'lerde panel açma
  if (window !== window.top) return;

  const IP_RE =
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;

  const ROOT_ID = "pinger-side-root";
  let root = null;
  let running = false;

  function extractIp(text) {
    if (!text) return null;
    const m = String(text).match(IP_RE);
    return m ? m[0] : null;
  }

  function getSelectionText() {
    const sel = window.getSelection();
    return sel ? String(sel.toString() || "") : "";
  }

  function textNearPoint(x, y) {
    let node = null;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      node = range && range.startContainer;
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      node = pos && pos.offsetNode;
    }
    if (!node) {
      const el = document.elementFromPoint(x, y);
      return el ? el.textContent || el.innerText || "" : "";
    }
    const parent = node.nodeType === 3 ? node.parentElement : node;
    return `${node.textContent || ""} ${parent ? parent.textContent || "" : ""}`;
  }

  function ensureRoot() {
    if (root && document.documentElement.contains(root)) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.attachShadow({ mode: "open" });

    root.shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
        .panel {
          position: fixed;
          top: 72px;
          left: auto;
          right: 12px;
          width: 300px;
          max-height: calc(100vh - 24px);
          z-index: 2147483647;
          display: none;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: #0f1419;
          color: #e7edf5;
          border: 1px solid #2a3441;
          border-radius: 10px;
          box-shadow: 0 12px 40px rgba(0,0,0,.5);
        }
        .panel.open { display: flex; }
        .panel.dragging { opacity: 0.92; user-select: none; }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          cursor: grab;
          padding-bottom: 2px;
          border-bottom: 1px solid transparent;
        }
        .head:active { cursor: grabbing; }
        .title { margin: 0; font-size: 14px; font-weight: 700; flex: 1; }
        .x {
          all: unset;
          cursor: pointer;
          color: #8b9bb0;
          font-size: 18px;
          line-height: 1;
          padding: 2px 6px;
        }
        .x:hover { color: #fff; }
        .row { display: flex; gap: 6px; }
        input {
          flex: 1;
          min-width: 0;
          background: #171d25;
          border: 1px solid #2a3441;
          color: #e7edf5;
          border-radius: 6px;
          padding: 7px 9px;
          font: 12px Consolas, monospace;
        }
        button.act {
          appearance: none;
          border: 1px solid #2a3441;
          background: #222b36;
          color: #e7edf5;
          font: 600 11px "Segoe UI", system-ui, sans-serif;
          padding: 7px 9px;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
        }
        button.act.primary {
          background: #2f81f7;
          border-color: #2563c7;
          color: #fff;
        }
        button.act:disabled { opacity: .45; cursor: not-allowed; }
        .status { font-size: 11px; color: #8b9bb0; }
        .status.running { color: #3ecf8e; }
        .status.error { color: #ff6b6b; }
        .status.warn { color: #f0b429; }
        .log {
          margin: 0;
          padding: 8px;
          height: 220px;
          overflow: auto;
          background: #121820;
          border: 1px solid #2a3441;
          border-radius: 6px;
          font: 11px/1.4 Consolas, monospace;
          white-space: pre-wrap;
          word-break: break-word;
          color: #c5d0dc;
        }
        .ok { color: #3ecf8e; }
        .fail { color: #ff6b6b; }
        .meta { color: #8b9bb0; }
        .menu {
          position: fixed;
          z-index: 2147483647;
          display: none;
          min-width: 170px;
          background: #171d25;
          color: #e7edf5;
          border: 1px solid #2a3441;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,.45);
          font: 600 13px/1.3 "Segoe UI", system-ui, sans-serif;
          padding: 4px;
        }
        .menu.open { display: block; }
        .mi {
          all: unset;
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .mi:hover { background: #2f81f7; color: #fff; }
        .chip {
          position: fixed;
          z-index: 2147483646;
          display: none;
          gap: 4px;
        }
        .chip.open { display: flex; }
        .chip button {
          background: #2f81f7;
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 6px 12px;
          font: 600 12px "Segoe UI", system-ui, sans-serif;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,.35);
        }
        .chip button.sec { background: #3d4d61; }
      </style>

      <div class="panel" id="panel">
        <div class="head" title="Surukleyerek tasi">
          <h1 class="title" id="title">Pinger</h1>
          <button class="x" id="btnClose" type="button" title="Kapat">×</button>
        </div>
        <div class="row">
          <input id="ip" placeholder="1.2.3.4" spellcheck="false" />
          <button class="act primary" id="btnPing" type="button">Pingle</button>
          <button class="act" id="btnTrace" type="button">Tracert</button>
        </div>
        <div class="status" id="status">Hazır</div>
        <pre class="log" id="log"></pre>
        <div class="row">
          <button class="act" id="btnStop" type="button" disabled>Durdur</button>
          <button class="act" id="btnClear" type="button">Temizle</button>
        </div>
      </div>

      <div class="menu" id="menu">
        <button class="mi" id="miPing" type="button">Pingle</button>
        <button class="mi" id="miTrace" type="button">Tracert</button>
      </div>

      <div class="chip" id="chip">
        <button id="chipPing" type="button">Pingle</button>
        <button class="sec" id="chipTrace" type="button">Tracert</button>
      </div>
    `;

    document.documentElement.appendChild(root);
    wirePanel();
    wireDrag();
    return root;
  }

  function $(id) {
    return ensureRoot().shadowRoot.getElementById(id);
  }

  function setStatus(text, kind = "") {
    const el = $("status");
    el.textContent = text;
    el.className = "status" + (kind ? ` ${kind}` : "");
  }

  function appendLine(text, cls) {
    const log = $("log");
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text.endsWith("\n") ? text : text + "\n";
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
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
    )
      return "ok";
    if (
      lower.includes("timed out") ||
      lower.includes("zaman aşımı") ||
      lower.includes("unreachable") ||
      lower.includes("ulaşılamıyor") ||
      lower.includes("request timed out") ||
      lower.includes("general failure") ||
      (lower.includes("*") && !lower.includes("ms") && /^\s*\d+/.test(line))
    )
      return "fail";
    return "";
  }

  function setRunning(on) {
    running = on;
    $("btnPing").disabled = on;
    $("btnTrace").disabled = on;
    $("btnStop").disabled = !on;
    $("ip").disabled = on;
  }

  const POS_KEY = "pinger-panel-pos";

  function loadPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p.left === "number" && typeof p.top === "number") return p;
    } catch (_) {}
    return null;
  }

  function savePos(left, top) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
    } catch (_) {}
  }

  function clampPos(left, top, panel) {
    const w = panel.offsetWidth || 300;
    const h = panel.offsetHeight || 360;
    const maxL = Math.max(8, window.innerWidth - w - 8);
    const maxT = Math.max(8, window.innerHeight - h - 8);
    return {
      left: Math.min(maxL, Math.max(8, left)),
      top: Math.min(maxT, Math.max(8, top)),
    };
  }

  function applyPos(panel, left, top) {
    const c = clampPos(left, top, panel);
    panel.style.left = `${c.left}px`;
    panel.style.top = `${c.top}px`;
    panel.style.right = "auto";
    return c;
  }

  function restoreOrDefaultPos() {
    const panel = $("panel");
    const saved = loadPos();
    if (saved) {
      applyPos(panel, saved.left, saved.top);
    } else {
      // varsayilan: sag ust
      const w = panel.offsetWidth || 300;
      applyPos(panel, window.innerWidth - w - 12, 72);
    }
  }

  function wireDrag() {
    const panel = $("panel");
    const head = panel.querySelector(".head");
    const btnClose = $("btnClose");
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origL = 0;
    let origT = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      applyPos(panel, origL + dx, origT + dy);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("dragging");
      const left = parseFloat(panel.style.left) || 0;
      const top = parseFloat(panel.style.top) || 0;
      const c = applyPos(panel, left, top);
      savePos(c.left, c.top);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };

    head.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target === btnClose || btnClose.contains(e.target)) return;
      e.preventDefault();
      dragging = true;
      panel.classList.add("dragging");
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origL = rect.left;
      origT = rect.top;
      // right'tan left'e gec
      panel.style.left = `${origL}px`;
      panel.style.top = `${origT}px`;
      panel.style.right = "auto";
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    });

    window.addEventListener("resize", () => {
      if (!panel.classList.contains("open")) return;
      const left = parseFloat(panel.style.left);
      const top = parseFloat(panel.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        const c = applyPos(panel, left, top);
        savePos(c.left, c.top);
      } else {
        restoreOrDefaultPos();
      }
    });
  }

  function openPanel(ip, tool) {
    ensureRoot();
    const panel = $("panel");
    panel.classList.add("open");
    restoreOrDefaultPos();
    if (ip) $("ip").value = ip;
    $("title").textContent = tool === "tracert" ? "Tracert" : "Pinger";
    hideMenu();
    hideChip();
  }

  function closePanel() {
    if (!root) return;
    $("panel").classList.remove("open");
    if (running) {
      chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" }).catch(() => {});
      setRunning(false);
    }
  }

  async function start(tool) {
    ensureRoot();
    const target = $("ip").value.trim();
    if (!target) {
      setStatus("IP gir", "error");
      return;
    }
    openPanel(target, tool);
    $("log").innerHTML = "";
    appendLine(
      tool === "tracert" ? `> tracert ${target}` : `> ping ${target} -t`,
      "meta"
    );
    setRunning(true);
    setStatus("Çalışıyor…", "running");
    $("title").textContent = tool === "tracert" ? "Tracert" : "Pinger";

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

  function wirePanel() {
    $("btnClose").addEventListener("click", closePanel);
    $("btnPing").addEventListener("click", () => start("ping"));
    $("btnTrace").addEventListener("click", () => start("tracert"));
    $("btnStop").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" });
      setRunning(false);
      setStatus("Durduruldu", "warn");
      appendLine("[durduruldu]", "meta");
    });
    $("btnClear").addEventListener("click", () => {
      $("log").innerHTML = "";
    });
    $("ip").addEventListener("keydown", (e) => {
      if (e.key === "Enter") start("ping");
    });

    $("miPing").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ip = $("menu").dataset.ip;
      hideMenu();
      if (ip) {
        openPanel(ip, "ping");
        start("ping");
      }
    });
    $("miTrace").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ip = $("menu").dataset.ip;
      hideMenu();
      if (ip) {
        openPanel(ip, "tracert");
        start("tracert");
      }
    });

    $("chipPing").addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    $("chipTrace").addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    $("chipPing").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ip = $("chip").dataset.ip;
      hideChip();
      if (ip) {
        openPanel(ip, "ping");
        $("ip").value = ip;
        start("ping");
      }
    });
    $("chipTrace").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ip = $("chip").dataset.ip;
      hideChip();
      if (ip) {
        openPanel(ip, "tracert");
        $("ip").value = ip;
        start("tracert");
      }
    });
  }

  function showMenu(x, y, ip) {
    ensureRoot();
    const menu = $("menu");
    menu.dataset.ip = ip;
    $("miPing").textContent = `Pingle  ${ip}`;
    $("miTrace").textContent = `Tracert  ${ip}`;
    menu.classList.add("open");
    const w = 180;
    const h = 84;
    let left = x;
    let top = y;
    if (left + w > innerWidth - 8) left = innerWidth - w - 8;
    if (top + h > innerHeight - 8) top = y - h - 4;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  function hideMenu() {
    if (!root) return;
    $("menu").classList.remove("open");
  }

  function hideChip() {
    if (!root) return;
    $("chip").classList.remove("open");
  }

  document.addEventListener(
    "contextmenu",
    (e) => {
      // Panel / menü içi sağ tık
      if (root && (e.composedPath?.().includes(root) || root.contains(e.target))) {
        return;
      }
      const ip =
        extractIp(getSelectionText()) ||
        extractIp(textNearPoint(e.clientX, e.clientY));
      if (!ip) {
        hideMenu();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      showMenu(e.clientX, e.clientY, ip);
    },
    true
  );

  document.addEventListener(
    "mousedown",
    (e) => {
      if (!root) return;
      const path = e.composedPath?.() || [];
      if (path.includes(root) || root.contains(e.target)) return;
      hideMenu();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideMenu();
      hideChip();
    }
  });

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      const text = getSelectionText();
      const ip = extractIp(text);
      ensureRoot();
      const chip = $("chip");
      if (!ip) {
        chip.classList.remove("open");
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      chip.dataset.ip = ip;
      $("chipPing").textContent = `Pingle ${ip}`;
      chip.classList.add("open");
      chip.style.left = `${Math.min(rect.right + 6, innerWidth - 200)}px`;
      chip.style.top = `${Math.max(8, rect.top - 4)}px`;
    }, 10);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "OPEN_SIDE_PANEL") {
      openPanel(msg.target || "", msg.tool === "tracert" ? "tracert" : "ping");
      if (msg.target) {
        $("ip").value = msg.target;
        start(msg.tool === "tracert" ? "tracert" : "ping");
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "NATIVE_OUTPUT" && msg.payload) {
      ensureRoot();
      if (!$("panel").classList.contains("open")) return;
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
      if (!root) return;
      setRunning(false);
      setStatus(msg.error || "Bağlantı koptu", "error");
    }
  });
})();
