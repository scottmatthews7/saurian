// Stage-4 verification: the placed story assets (plane/pilot/GPS/health pack,
// raptor nest, stego skeleton, the boat at sea). Boots the full game via
// tools/world_verify.html in chrome-headless-shell (CDP, no npm deps — mirrors
// world_verify.mjs), frames each asset, captures PNGs, reports console errors.
//
// Usage: node tools/stage4_verify.mjs
//   env: PORT (default 8217), OUT (default ~/Desktop/saurian-map/build)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8217";
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map/build`;
const W = 1280, H = 720;
const DEBUG_PORT = 9447;

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
await sleep(1500);

const V = "window.__verify";

// 1. clearing vignette — plane (8,-244) + pilot/GPS (-8,-256) + health (2,-250).
// Elevated just over the south tree wall, fog off (the wall otherwise blocks
// any ground-level wide frame of the ~r12u clearing).
await evalJson(`(()=>{window.__game.scene.fogEnabled=false; const h=${V}.heightAt; ${V}.lookAt(-1, h(-1,-264)+24, -264, 2, h(2,-247)+1, -247); return 'clearing';})()`);
await sleep(400); await cap("stage4_clearing_assets");

// 1b. low closer pass on the pilot + GPS so the hover/spin reads.
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.lookAt(0, h(0,-249)+3, -249, -8, h(-8,-256)+1.4, -256); return 'pilot';})()`);
await sleep(400); await cap("stage4_pilot_gps");

// 2. raptor nest (-40,-283) — in the jungle wall off the clearing.
await evalJson(`(()=>{window.__game.scene.fogEnabled=true; const h=${V}.heightAt; ${V}.lookAt(-32, h(-32,-272)+6, -272, -40, h(-40,-283)+0.8, -283); return 'nest';})()`);
await sleep(400); await cap("stage4_nest");

// 3. stego skeleton (-26,452) + old tree (-22,448) in the new desert, from the north.
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.lookAt(-26, h(-26,464)+6, 464, -26, h(-26,452)+0.3, 452); return 'skeleton';})()`);
await sleep(400); await cap("stage4_skeleton");

// 4. boat (0,582) — 3/4 from the beach SE so stern-seaward + draft read together.
await evalJson(`(()=>{${V}.lookAt(16, 5, 558, 0, -0.8, 582); return 'boat';})()`);
await sleep(400); await cap("stage4_boat");

// 4b. boat side-on from the east to read bow/stern + draft.
await evalJson(`(()=>{${V}.lookAt(35, 5, 582, 0, -1, 582); return 'boat-side';})()`);
await sleep(400); await cap("stage4_boat_side");

// 4c. bob sanity: sample the boat's Y + sway over ~3 s.
const bob = await evalJson(`(async()=>{const r=window.__game.scene.getTransformNodeByName('boat_root'); const ys=[]; for(let i=0;i<13;i++){ys.push(+r.position.y.toFixed(3)); await new Promise(s=>setTimeout(s,250));} return JSON.stringify({yMin:Math.min(...ys),yMax:Math.max(...ys),rx:+r.rotation.x.toFixed(3),rz:+r.rotation.z.toFixed(3)});})()`);
console.log("[boat bob]", bob);

if (consoleErrors.length) {
  console.error("CONSOLE ERRORS (" + consoleErrors.length + "):\n" + consoleErrors.slice(0, 30).join("\n"));
} else {
  console.log("NO console errors");
}
ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(0);
