// Stage-5 verification: dino territory BIOME MASKS + the boat win condition.
// Boots the full game via tools/world_verify.html in chrome-headless-shell
// (CDP, no npm deps — mirrors stage4_verify.mjs), starts a run, then:
//   1. 30 s sim sampling every dino's cell code each second vs its mask.
//   2. Overhead shot of the dino spread (fog off).
//   3. Warps the player to the boat — the ESCAPED banner must appear.
//
// Usage: node tools/stage5_verify.mjs
//   env: PORT (default 8218), OUT (default ~/Desktop/saurian-map/build)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8218";
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map/build`;
const W = 1280, H = 720;
const DEBUG_PORT = 9448;

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

const evalJson = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};

const cap = async (name) => {
  const c = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
  const path = `${OUT}/${name}.png`;
  writeFileSync(path, Buffer.from(c.data, "base64"));
  console.log(`[shot] saved ${path}`);
};

// --- boot the full game ----------------------------------------------------
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
let ready = false, lastErr = null;
for (let i = 0; i < 400; i++) {
  await sleep(150);
  const st = await evalJson("JSON.stringify({ready: !!(window.__verify&&window.__verify.ready), err: window.__verify&&window.__verify.err||null})").catch(() => null);
  if (!st) continue;
  const j = JSON.parse(st);
  lastErr = j.err;
  if (j.err) { console.error("BOOT ERROR:", j.err); break; }
  if (j.ready) { ready = true; break; }
}
if (!ready) { console.error("GAME NOT READY err=", lastErr); ws.close(); chrome.kill("SIGTERM"); process.exit(1); }
console.log("game booted");
await sleep(1000);

// Start the run (the title gate releases on the first keydown).
await evalJson(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); return window.__game.game.over;})()`);
await sleep(500);

// --- 1. 30 s mask sim --------------------------------------------------------
// Same module instances as the live game (identical resolved URLs).
const violations = JSON.parse(await evalJson(`(async()=>{
  const map = await import('/src/map.js');
  const cfg = await import('/src/config.js');
  const g = window.__game;
  const bad = [];
  const samples = { n: 0 };
  for (let s = 0; s < 30; s++) {
    const agents = [...g.predators, ...g.herd];
    for (const a of agents) {
      if (a.dead) continue;
      const T = cfg.TERRITORY[a.kind];
      if (!T || !T.biomes) continue;
      const p = a.dino.root.position;
      const code = map.biomeAt(p.x, p.z);
      samples.n++;
      if (!T.biomes.includes(code)) bad.push({ s, kind: a.kind, x: +p.x.toFixed(1), z: +p.z.toFixed(1), code });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return JSON.stringify({ samples: samples.n, violations: bad });
})()`));
console.log(`[mask sim] ${violations.samples} samples, ${violations.violations.length} violations`);
if (violations.violations.length) console.log(JSON.stringify(violations.violations.slice(0, 40), null, 1));

// --- 2. overhead dino shot (fog off) ----------------------------------------
await evalJson(`(()=>{window.__game.scene.fogEnabled=false; const c=window.__verify.cam; c.maxZ=4000; window.__verify.lookAt(0, 700, 30, 0, 0, 31); return 'overhead';})()`);
await sleep(500); await cap("stage5_dinos_overhead");

// --- 3. the win: warp to ~(0,560) then beside the boat -----------------------
const win = JSON.parse(await evalJson(`(async()=>{
  const g = window.__game;
  window.__verify.warpPlayer(0, 560);
  await new Promise(r => setTimeout(r, 600));
  const before = { won: g.game.won, over: g.game.over };
  window.__verify.warpPlayer(0, 572);   // 10u from the boat (0,582), winRadius 16
  await new Promise(r => setTimeout(r, 800));
  const banner = document.getElementById('banner');
  return JSON.stringify({
    before,
    won: g.game.won, over: g.game.over,
    bannerVisible: banner ? getComputedStyle(banner).display !== 'none' : null,
    bannerText: banner ? banner.textContent.trim().slice(0, 120) : null,
  });
})()`));
console.log("[win]", JSON.stringify(win));

// Frame the player + boat for the win shot. world_verify.html (the headless
// harness) carries no #banner CSS — index.html (the real game) does — so inject
// the minimal overlay rules here so the ESCAPED banner shows in the capture.
await evalJson(`(()=>{
  const st = document.createElement('style');
  st.textContent = '#banner{position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(6,12,10,.72);color:#e8f2ec;font-family:system-ui,sans-serif;z-index:30}.bannerTitle{font-size:72px;font-weight:800;letter-spacing:.06em}.scrKicker{font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#8fd4cf}.scrHook{max-width:560px;opacity:.85}.scrStats{margin-top:10px;font-size:18px}.scrPrompt{margin-top:14px;font-size:14px;opacity:.8}';
  document.head.appendChild(st);
  const h=window.__verify.heightAt; window.__verify.lookAt(14, h(14,560)+8, 560, 0, 0, 578); return 'winshot';})()`);
await sleep(400); await cap("stage5_win");

if (consoleErrors.length) {
  console.error("CONSOLE ERRORS (" + consoleErrors.length + "):\n" + consoleErrors.slice(0, 30).join("\n"));
} else {
  console.log("NO console errors");
}
ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(violations.violations.length || !win.won ? 1 : 0);
