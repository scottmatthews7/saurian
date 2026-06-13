// Headless capture of the four UI screens (loading / start / win / death).
// Drives tools/ui_shots.html (hud.js + index.html markup, game modules stubbed)
// so the screens verify even while the world code is mid-rewrite, then attempts
// a real index.html boot to check for console errors and capture live screens.
//
// Usage: node tools/ui_shots.mjs
//   env: PORT (default 8077), OUT (default ~/Desktop/saurian-map/ui_screens)
// No npm deps: Node's built-in WebSocket + raw CDP (mirrors world_verify.mjs).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8077";
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map/ui_screens`;
const W = 1440, H = 810;
const DEBUG_PORT = 9479;

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) { console.error("chrome-headless-shell missing at", CHROME); process.exit(1); }

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

async function openTab() {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  const errors = [];
  cdp.onEvent(sessionId, (m) => {
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
    if (m.method === "Runtime.exceptionThrown")
      errors.push("EXCEPTION: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  });
  const evalJs = async (expr) => {
    const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
    return r.result.value;
  };
  const cap = async (name) => {
    const c = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(c.data, "base64"));
    console.log(`[shot] ${OUT}/${name}.png`);
  };
  return { sessionId, errors, evalJs, cap };
}

// --- 1. harness: drive the screens directly --------------------------------
const tab = await openTab();
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/ui_shots.html` }, tab.sessionId);
let ready = false;
for (let i = 0; i < 100; i++) {
  await sleep(100);
  if (await tab.evalJs("!!window.__ready").catch(() => false)) { ready = true; break; }
}
if (!ready) { console.error("harness never became ready"); ws.close(); chrome.kill("SIGTERM"); process.exit(1); }

// loading screen, mid-stage text as game.js would set it
await tab.evalJs(`document.querySelector('#loading .loadMsg').textContent = 'Waking the T-Rex…'; 'ok'`);
await sleep(1000); // let the entrance settle
await tab.cap("loading");

// start screen
await tab.evalJs(`document.getElementById('loading').style.display = 'none';
  window.__hud.showTitle('Best: 2:07 survived · 1,240 pts'); 'ok'`);
await sleep(1100);
await tab.cap("start");

// victory screen (sub mirrors the game's end-of-run string shape)
await tab.evalJs(`window.__hud.showBanner('ESCAPED',
  'You survived 4:12 · score 3,860 (best!). Press R to run it again.', 'win'); 'ok'`);
await sleep(1100);
await tab.cap("win");

// death screen
await tab.evalJs(`window.__hud.showBanner('DEVOURED',
  'You survived 2:07 · score 1,240 (best!). Best: 2:31. Press R to retry.', 'lose'); 'ok'`);
await sleep(1100);
await tab.cap("death");

// pause screen (same code path the game uses)
await tab.evalJs(`window.__hud.showBanner('PAUSED', 'Press P to resume.', 'start'); 'ok'`);
await sleep(1100);
await tab.cap("pause");

console.log(tab.errors.length
  ? "HARNESS CONSOLE ERRORS:\n" + tab.errors.join("\n")
  : "harness: no console errors");

// --- 2. real boot: index.html as shipped ------------------------------------
const live = await openTab();
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` }, live.sessionId);
await sleep(600);
await live.cap("loading_live");
let booted = false, bootErr = null;
for (let i = 0; i < 300; i++) {
  await sleep(150);
  const st = await live.evalJs(`JSON.stringify({
    hidden: (document.getElementById('loading')||{}).style?.display === 'none',
    err: document.getElementById('loading')?.classList.contains('err')
      ? document.querySelector('#loading .loadMsg').textContent : null })`).catch(() => null);
  if (!st) continue;
  const j = JSON.parse(st);
  if (j.err) { bootErr = j.err; break; }
  if (j.hidden) { booted = true; break; }
}
if (booted) {
  await sleep(1200); // title screen + entrance
  await live.cap("start_live");
  console.log("live boot OK");
} else {
  console.error("live boot did not complete:", bootErr || "timeout");
  await live.cap("boot_state");
}
console.log(live.errors.length
  ? "LIVE CONSOLE ERRORS (" + live.errors.length + "):\n" + live.errors.slice(0, 20).join("\n")
  : "live: no console errors");

ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(0);
