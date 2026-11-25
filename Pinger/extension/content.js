(() => {
  // Sadece ana frame — iframe'lerde panel açma
  if (window !== window.top) return;

  const IP_RE =
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;

  const ROOT_ID = "pinger-side-root";
  let root = null;
  let running = false;
  let currentTool = "ping";
  let stats = { sent: 0, lost: 0, rtts: [], samples: [] };

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
        .hidden { display: none !important; }
        .panel {
          position: fixed;
          top: 72px;
          left: auto;
          right: 12px;
          width: 340px;
          max-height: calc(100vh - 24px);
          z-index: 2147483647;
          display: none;
          flex-direction: column;
          gap: 7px;
          padding: 12px;
          background: #0b1017;
          color: #e8eef7;
          border: 1px solid #253142;
          border-radius: 11px;
          box-shadow: 0 14px 44px rgba(0,0,0,.55);
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
        }
        .head:active { cursor: grabbing; }
        .brand { display: flex; align-items: center; gap: 6px; flex: 1; }
        .dot {
          width: 8px; height: 8px; border-radius: 50%; background: #8a9bb2;
        }
        .dot.running { background: #3ecf8e; box-shadow: 0 0 8px #3ecf8e; }
        .dot.error { background: #ff6b6b; box-shadow: 0 0 8px #ff6b6b; }
        .dot.warn { background: #f0b429; }
        .title { margin: 0; font-size: 13.5px; font-weight: 700; }
        .badge {
          font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 999px;
          background: rgba(47,129,247,.16); color: #58a6ff; border: 1px solid rgba(47,129,247,.35);
        }
        .x {
          all: unset;
          cursor: pointer;
          color: #8a9bb2;
          font-size: 18px;
          line-height: 1;
          padding: 2px 6px;
        }
        .x:hover { color: #fff; }
        .tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 3px;
          background: #131a24;
          border: 1px solid #253142;
          border-radius: 7px;
          padding: 2px;
        }
        .tab {
          appearance: none;
          border: none;
          background: transparent;
          color: #8a9bb2;
          font: 600 11px "Segoe UI", system-ui, sans-serif;
          padding: 5px 4px;
          border-radius: 5px;
          cursor: pointer;
        }
        .tab.active { background: #2f81f7; color: #fff; }
        .row { display: flex; gap: 6px; align-items: center; }
        input {
          flex: 1;
          min-width: 0;
          background: #131a24;
          border: 1px solid #253142;
          color: #e8eef7;
          border-radius: 6px;
          padding: 6px 9px;
          font: 12px Consolas, monospace;
        }
        input:focus { outline: none; border-color: #2f81f7; }
        button.act {
          appearance: none;
          border: 1px solid #253142;
          background: #18212e;
          color: #e8eef7;
          font: 600 11px "Segoe UI", system-ui, sans-serif;
          padding: 6px 9px;
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
        .stats-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 5px;
          font: 600 10.5px Consolas, monospace;
        }
        .stat-box {
          background: #131a24;
          border: 1px solid #253142;
          border-radius: 6px;
          padding: 4px 6px;
          text-align: center;
          color: #c5d0dc;
        }
        .chart-wrap {
          background: #131a24;
          border: 1px solid #253142;
          border-radius: 6px;
          padding: 4px 6px;
        }
        canvas { width: 100%; height: 42px; display: block; }
        .status { font-size: 11px; color: #8a9bb2; }
        .status.running { color: #3ecf8e; }
        .status.error { color: #ff6b6b; }
        .status.warn { color: #f0b429; }
        .log {
          margin: 0;
          padding: 8px;
          height: 195px;
          overflow: auto;
          background: #0d121a;
          border: 1px solid #253142;
          border-radius: 6px;
          font: 11px/1.4 Consolas, monospace;
          white-space: pre-wrap;
          word-break: break-word;
          color: #c5d0dc;
        }
        .ok { color: #3ecf8e; }
        .fail { color: #ff6b6b; }
        .info { color: #58a6ff; }
        .warn { color: #f0b429; }
        .meta { color: #8a9bb2; }
        .menu {
          position: fixed;
          z-index: 2147483647;
          display: none;
          min-width: 195px;
          background: #131a24;
          color: #e8eef7;
          border: 1px solid #253142;
          border-radius: 8px;
          box-shadow: 0 10px 28px rgba(0,0,0,.5);
          font: 600 12.5px/1.3 "Segoe UI", system-ui, sans-serif;
          padding: 4px;
        }
        .menu.open { display: block; }
        .mi {
          all: unset;
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 8px 11px;
          border-radius: 6px;
          cursor: pointer;
        }
        .mi:hover { background: #2f81f7; color: #fff; }
        .mi.sep { border-top: 1px solid #253142; margin-top: 3px; padding-top: 9px; }
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
          padding: 5px 11px;
          font: 600 11.5px "Segoe UI", system-ui, sans-serif;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,.4);
        }
        .chip button.sec { background: #2d3a4b; }
      </style>

      <div class="panel" id="panel">
        <div class="head" title="Sürükleyerek taşı">
          <div class="brand">
            <span class="dot" id="statusDot"></span>
            <h1 class="title" id="title">Pinger</h1>
            <span class="badge">v2.0</span>
          </div>
          <button class="x" id="btnClose" type="button" title="Kapat">×</button>
        </div>

        <div class="tabs">
          <button class="tab active" data-tool="ping" type="button">Ping</button>
          <button class="tab" data-tool="tracert" type="button">Tracert</button>
          <button class="tab" data-tool="port" type="button">Port</button>
          <button class="tab" data-tool="dns" type="button">DNS</button>
        </div>

        <div class="row">
          <input id="ip" placeholder="8.8.8.8 veya host" spellcheck="false" />
          <button class="act primary" id="btnRun" type="button">Başlat</button>
        </div>

        <div class="row hidden" id="portRow">
          <span style="font-size:11px;color:#8a9bb2;">Port:</span>
          <input id="portsInput" value="80,443,22,3389,8080" placeholder="80,443,22" spellcheck="false" />
        </div>

        <div class="stats-bar">
          <div class="stat-box" id="statLoss">Kayıp: 0%</div>
          <div class="stat-box" id="statAvg">Ort: -</div>
          <div class="stat-box" id="statLast">Anlık: -</div>
        </div>

        <div class="chart-wrap">
          <canvas id="sparkline" width="314" height="42"></canvas>
        </div>

        <div class="status" id="status">Hazır</div>
        <pre class="log" id="log"></pre>

        <div class="row">
          <button class="act" id="btnStop" type="button" disabled>Durdur</button>
          <button class="act" id="btnCopy" type="button">Kopyala</button>
          <button class="act" id="btnClear" type="button">Temizle</button>
        </div>
      </div>

      <div class="menu" id="menu">
        <button class="mi" id="miPing" type="button">Pingle</button>
        <button class="mi" id="miTrace" type="button">Tracert</button>
        <button class="mi" id="miPort" type="button">Port Tara</button>
        <button class="mi" id="miDns" type="button">DNS Lookup</button>
        <button class="mi sep" id="miCopyIp" type="button">IP'yi Kopyala</button>
      </div>

      <div class="chip" id="chip">
        <button id="chipPing" type="button">Pingle</button>
        <button class="sec" id="chipTrace" type="button">Tracert</button>
        <button class="sec" id="chipPort" type="button">Port</button>
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
    const dot = $("statusDot");
    el.textContent = text;
    el.className = "status" + (kind ? ` ${kind}` : "");
    dot.className = "dot" + (kind ? ` ${kind}` : "");
  }

  function resetMetrics() {
    stats = { sent: 0, lost: 0, rtts: [], samples: [] };
    renderMetrics();
    drawSparkline();
  }

  function renderMetrics() {
    const lossPct = stats.sent > 0 ? Math.round((stats.lost / stats.sent) * 100) : 0;
    $("statLoss").textContent = `Kayıp: ${lossPct}%`;
    if (stats.rtts.length > 0) {
      const avg = Math.round(stats.rtts.reduce((a, b) => a + b, 0) / stats.rtts.length);
      $("statAvg").textContent = `Ort: ${avg}ms`;
    } else {
      $("statAvg").textContent = "Ort: -";
    }
    if (stats.samples.length === 0) {
      $("statLast").textContent = "Anlık: -";
    } else {
      const s = stats.samples[stats.samples.length - 1];
      $("statLast").textContent = s.ok && s.rtt !== null ? `Anlık: ${s.rtt}ms` : "Anlık: Timeout";
    }
  }

  function drawSparkline() {
    const canvas = $("sparkline");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const samples = stats.samples.slice(-30);
    if (samples.length === 0) return;

    const gap = 2;
    const barW = Math.floor((w - gap * 29) / 30);
    const maxRtt = Math.max(50, ...samples.filter((s) => s.ok && s.rtt != null).map((s) => s.rtt));

    samples.forEach((sample, idx) => {
      const x = idx * (barW + gap);
      if (!sample.ok || sample.rtt === null) {
        ctx.fillStyle = "#ff6b6b";
        ctx.fillRect(x, 2, barW, h - 4);
        return;
      }
      const barH = Math.max(4, Math.round((sample.rtt / maxRtt) * (h - 6)));
      ctx.fillStyle =
        sample.rtt < 50 ? "#3ecf8e" : sample.rtt <= 150 ? "#f0b429" : "#fb923c";
      ctx.fillRect(x, h - barH - 2, barW, barH);
    });
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
    if (lower.startsWith("hostname") || lower.startsWith("ipv4") || lower.startsWith("ipv6")) {
      return "info";
    }
    return "";
  }

  function setRunning(on) {
    running = on;
    $("btnRun").disabled = on;
    $("btnStop").disabled = !on;
    $("ip").disabled = on;
    ensureRoot().shadowRoot.querySelectorAll(".tab").forEach((t) => {
      t.disabled = on;
    });
  }

  function selectTool(tool) {
    currentTool = ["ping", "tracert", "port", "dns"].includes(tool) ? tool : "ping";
    const titles = { ping: "Pinger", tracert: "Tracert", port: "Port Test", dns: "DNS Lookup" };
    $("title").textContent = titles[currentTool] || "Pinger";
    $("portRow").classList.toggle("hidden", currentTool !== "port");
    ensureRoot().shadowRoot.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tool === currentTool);
    });
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
    const w = panel.offsetWidth || 340;
    const h = panel.offsetHeight || 420;
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
      const w = panel.offsetWidth || 340;
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
      applyPos(panel, origL + (e.clientX - startX), origT + (e.clientY - startY));
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
    selectTool(tool || currentTool);
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
      setStatus("IP/Host gir", "error");
      return;
    }
    const mode = tool || currentTool;
    openPanel(target, mode);
    $("log").innerHTML = "";
    resetMetrics();

    const ports = $("portsInput").value.trim() || "80,443,22,3389,8080";
    const cmdLine =
      mode === "tracert"
        ? `> tracert ${target}`
        : mode === "port"
        ? `> port-scan ${target} [${ports}]`
        : mode === "dns"
        ? `> dns-lookup ${target}`
        : `> ping ${target} -t`;

    appendLine(cmdLine, "meta");
    setRunning(true);
    setStatus("Çalışıyor…", "running");

    const res = await chrome.runtime.sendMessage({
      type: "PING_VIA_NATIVE",
      target,
      tool: mode,
      continuous: mode === "ping",
      ports: mode === "port" ? ports : undefined,
    });

    if (!res?.ok) {
      setRunning(false);
      setStatus(res?.error || "Native host hatası", "error");
      appendLine(res?.error || "Başlatılamadı", "fail");
    }
  }

  function wirePanel() {
    const sr = ensureRoot().shadowRoot;
    sr.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (!running) selectTool(tab.dataset.tool);
      });
    });

    $("btnClose").addEventListener("click", closePanel);
    $("btnRun").addEventListener("click", () => start(currentTool));
    $("btnStop").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_NATIVE_PING" });
      setRunning(false);
      setStatus("Durduruldu", "warn");
      appendLine("[durduruldu]", "meta");
    });
    $("btnClear").addEventListener("click", () => {
      $("log").innerHTML = "";
      resetMetrics();
    });
    $("btnCopy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("log").innerText);
        $("btnCopy").textContent = "Kopyalandı";
        setTimeout(() => {
          $("btnCopy").textContent = "Kopyala";
        }, 1200);
      } catch (_) {}
    });
    $("ip").addEventListener("keydown", (e) => {
      if (e.key === "Enter") start(currentTool);
    });

    const menuActions = [
      ["miPing", "ping"],
      ["miTrace", "tracert"],
      ["miPort", "port"],
      ["miDns", "dns"],
    ];
    for (const [id, mode] of menuActions) {
      $(id).addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ip = $("menu").dataset.ip;
        hideMenu();
        if (ip) {
          openPanel(ip, mode);
          start(mode);
        }
      });
    }

    $("miCopyIp").addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ip = $("menu").dataset.ip;
      hideMenu();
      if (ip) {
        try {
          await navigator.clipboard.writeText(ip);
        } catch (_) {}
      }
    });

    for (const id of ["chipPing", "chipTrace", "chipPort"]) {
      $(id).addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    const chipActions = [
      ["chipPing", "ping"],
      ["chipTrace", "tracert"],
      ["chipPort", "port"],
    ];
    for (const [id, mode] of chipActions) {
      $(id).addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ip = $("chip").dataset.ip;
        hideChip();
        if (ip) {
          openPanel(ip, mode);
          $("ip").value = ip;
          start(mode);
        }
      });
    }
  }

  function showMenu(x, y, ip) {
    ensureRoot();
    const menu = $("menu");
    menu.dataset.ip = ip;
    $("miPing").textContent = `Pingle: ${ip}`;
    $("miTrace").textContent = `Tracert: ${ip}`;
    $("miPort").textContent = `Port Tara: ${ip}`;
    $("miDns").textContent = `DNS Lookup: ${ip}`;
    menu.classList.add("open");
    const w = 205;
    const h = 190;
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
      if (e.shiftKey) return; // Shift+Sag Tik ile tarayicinin normal menusune izin ver
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
      chip.style.left = `${Math.min(rect.right + 6, innerWidth - 250)}px`;
      chip.style.top = `${Math.max(8, rect.top - 4)}px`;
    }, 10);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "OPEN_SIDE_PANEL") {
      openPanel(msg.target || "", msg.tool || "ping");
      if (msg.target) {
        $("ip").value = msg.target;
        start(msg.tool || "ping");
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "NATIVE_OUTPUT" && msg.payload) {
      ensureRoot();
      if (!$("panel").classList.contains("open")) return;
      const p = msg.payload;
      if (p.type === "line") {
        appendLine(p.text, classifyLine(p.text));
      } else if (p.type === "metric") {
        stats.sent += 1;
        if (p.ok && typeof p.rtt === "number") {
          stats.rtts.push(p.rtt);
          stats.samples.push({ ok: true, rtt: p.rtt });
        } else {
          stats.lost += 1;
          stats.samples.push({ ok: false, rtt: null });
        }
        renderMetrics();
        drawSparkline();
      } else if (p.type === "down") {
        setStatus(`${p.target} yanıt vermiyor!`, "error");
        appendLine(`[UYARI] ${p.target} ardışık 3+ timeout verdi.`, "fail");
      } else if (p.type === "recovered") {
        setStatus(`${p.target} tekrar çevrimiçi`, "running");
        appendLine(`[KURTARILDI] ${p.target} tekrar yanıt vermeye başladı.`, "ok");
      } else if (p.type === "started") {
        setRunning(true);
        setStatus("Çalışıyor…", "running");
      } else if (p.type === "stopped") {
        setRunning(false);
        setStatus("Tamamlandı", "warn");
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
