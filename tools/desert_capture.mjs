// Headless desert screenshot driver. Launches chrome-headless-shell (NO visible
// window — owner RAM is tight), loads the desert_shot.html harness for each
// requested shot, waits for window.__ready, captures the WebGL canvas via CDP,
// and writes PNGs. No npm deps: uses Node 22's built-in WebSocket + raw CDP.
//
// Usage: node tools/desert_capture.mjs [shot ...]
//   shots default to: eye eye2 high edge
//   env: PORT (default 8127), OUT (default tools/shots)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8127";
const OUT = process.env.OUT || "tools/shots";
const W = 1280, H = 720;
const shots = process.argv.slice(2);
if (shots.length === 0) shots.push("eye", "eye2", "high", "edge");

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) { console.error("chrome-headless-shell missing at", CHROME); process.exit(1); }

const DEBUG_PORT = 9333;
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--disable-gpu-sandbox",
  "--use-gl=angle",
  "--use-angle=metal",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  `--window-size=${W},${H}`,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
chrome.stderr.on("data", (d) => { chromeErr += d.toString(); });

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error("chrome devtools endpoint never came up\n" + chromeErr);
}

// Minimal CDP client over the browser-level websocket.
function makeCdp(ws) {
  let id = 0;
  const pending = new Map();
  const sessionListeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      const ls = sessionListeners.get(msg.sessionId) || [];
      for (const l of ls) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  const onEvent = (sessionId, fn) => {
    const ls = sessionListeners.get(sessionId) || [];
    ls.push(fn); sessionListeners.set(sessionId, ls);
  };
  return { send, onEvent };
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
const cdp = makeCdp(ws);

// One target/tab reused across shots.
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
await cdp.send("Page.enable", {}, sessionId);
await cdp.send("Runtime.enable", {}, sessionId);
const consoleErrors = [];
cdp.onEvent(sessionId, (m) => {
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
  if (m.method === "Runtime.exceptionThrown")
    consoleErrors.push("EXCEPTION: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
});

async function evalReady() {
  const r = await cdp.send("Runtime.evaluate", {
    expression: "JSON.stringify({ready: window.__ready === true, err: window.__err || null})",
    returnByValue: true,
  }, sessionId);
  return JSON.parse(r.result.value);
}

for (const shot of shots) {
  const url = `http://127.0.0.1:${PORT}/tools/desert_shot.html?shot=${shot}`;
  await cdp.send("Page.navigate", { url }, sessionId);
  // wait for the harness to render its READY_FRAMES
  let ready = false, lastErr = null;
  for (let i = 0; i < 200; i++) {
    await sleep(120);
    const st = await evalReady().catch(() => ({ ready: false }));
    lastErr = st.err;
    if (st.err) break;
    if (st.ready) { ready = true; break; }
  }
  if (!ready) { console.error(`[${shot}] NOT READY err=${lastErr}`); continue; }
  await sleep(150);
  const cap = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, sessionId)
    .catch(async () => cdp.send("Page.captureScreenshot", { format: "png" }, sessionId));
  const path = `${OUT}/${shot}.png`;
  writeFileSync(path, Buffer.from(cap.data, "base64"));
  console.log(`[${shot}] saved ${path}`);
}

if (consoleErrors.length) {
  console.error("CONSOLE ERRORS:\n" + consoleErrors.slice(0, 20).join("\n"));
} else {
  console.log("no console errors");
}
ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(0);
