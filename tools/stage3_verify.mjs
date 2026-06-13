// Stage-3 headless verification: walls, jungle shell, per-cell props.
// Boots the full game via tools/world_verify.html on a PRIVATE port (8214 —
// never the owner's 8011), then: reports prop/obstacle counts, probes that the
// jungle WALL blocks the player while the muddy path corridor stays open, and
// captures overhead + clearing + savannah shots to ~/Desktop/saurian-map/build.
// Mirrors tools/world_verify.mjs (raw CDP, no npm deps).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8214";
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map/build`;
const W = 1280, H = 720;
const DEBUG_PORT = 9344;

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
for (let i = 0; i < 600; i++) {
  await sleep(200);
  const st = await evalJson("JSON.stringify({ready: !!(window.__verify&&window.__verify.ready), err: window.__verify&&window.__verify.err||null})").catch(() => null);
  if (!st) continue;
  const j = JSON.parse(st);
  lastErr = j.err;
  if (j.err) { console.error("BOOT ERROR:", j.err); break; }
  if (j.ready) { ready = true; break; }
}
if (!ready) { console.error("GAME NOT READY err=", lastErr); ws.close(); chrome.kill("SIGTERM"); process.exit(1); }
console.log("game booted");
await sleep(2000);

// --- prop / obstacle stats ---------------------------------------------------
console.log("[propStats]", await evalJson("JSON.stringify(window.__game.world.propStats)"));
console.log("[obstacles]", await evalJson("window.__game.world.obstacles.length"));

// --- jungle wall blocks the player ------------------------------------------
// Park the camera due south of the player so "w" walks NORTH, warp the player
// just south of the first J cell north-west of the clearing, hold "w", and
// assert it never crosses into the wall. Then release.
const wallProbe = await evalJson(`(async () => {
  const g = window.__game;
  const { biomeAt } = await import("/src/map.js");
  // find the J wall column north-west of the spawn (x = -12)
  const x = -12;
  let wallZ = null;
  for (let z = -250; z < -180; z++) { if (biomeAt(x, z) === "J") { wallZ = z; break; } }
  if (wallZ === null) return JSON.stringify({ fail: "no wall found" });
  const startZ = wallZ - 4;
  window.__verify.warpPlayer(x, startZ);
  const h = window.__verify.heightAt;
  window.__verify.lookAt(x, h(x, startZ - 14) + 6, startZ - 14, x, h(x, startZ) + 2, startZ + 10);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  await new Promise((r) => setTimeout(r, 2500));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
  const p = g.player.dino.root.position;
  return JSON.stringify({
    startZ, wallZ, endX: +p.x.toFixed(2), endZ: +p.z.toFixed(2),
    endBiome: biomeAt(p.x, p.z),
    blocked: p.z < wallZ + 0.2 && biomeAt(p.x, p.z) !== "J",
  });
})()`);
console.log("[jungle wall probe]", wallProbe);

// --- muddy path is walkable ---------------------------------------------------
// Warp onto the path's south end and drive along its waypoints (camera parked
// behind the player each leg so "w" walks toward the next waypoint). Assert
// real progress along the corridor.
const pathProbe = await evalJson(`(async () => {
  const g = window.__game;
  const { biomeAt, getMuddyPath } = await import("/src/map.js");
  const wp = getMuddyPath();
  const pts = (wp && wp.waypoints) || [];
  if (!pts.length) return JSON.stringify({ fail: "no muddyPath waypoints in map.json" });
  window.__verify.warpPlayer(pts[0].x, pts[0].z);
  const h = window.__verify.heightAt;
  let reached = 0;
  for (let leg = 1; leg < pts.length; leg++) {
    const tgt = pts[leg];
    for (let step = 0; step < 40; step++) {
      const p = g.player.dino.root.position;
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      if (d < 2.5) break;
      // park the camera behind the player, facing the waypoint -> "w" walks at it
      const dx = (tgt.x - p.x) / d, dz = (tgt.z - p.z) / d;
      window.__verify.lookAt(p.x - dx * 12, h(p.x, p.z) + 6, p.z - dz * 12, tgt.x, h(tgt.x, tgt.z) + 2, tgt.z);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
      await new Promise((r) => setTimeout(r, 250));
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
    const p = g.player.dino.root.position;
    if (Math.hypot(tgt.x - p.x, tgt.z - p.z) < 2.5) reached = leg; else break;
  }
  const p = g.player.dino.root.position;
  return JSON.stringify({
    waypoints: pts.length, reached,
    end: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), biome: biomeAt(p.x, p.z) },
    walkedThePath: reached >= pts.length - 1,
  });
})()`);
console.log("[muddy path probe]", pathProbe);

// --- shots --------------------------------------------------------------------
const V = "window.__verify";
// lift the gameplay orbit clamp (radius 7-26) so the overhead framing sticks
await evalJson("(() => { const c = window.__game.camRig.cam; c.upperRadiusLimit = 2000; c.lowerRadiusLimit = 0.5; return 'limits'; })()");
// reset player to spawn so shots aren't mid-path
await evalJson(`${V}.warpPlayer(0, -250); 'reset'`);
await sleep(600);

// 1. overhead — whole island
await evalJson(`${V}.lookAt(0, 760, 89.9, 0, 0, 90); 'overhead'`);
await sleep(800); await cap("stage3_overhead");

// 2. clearing ground view — from the spawn looking at the jungle wall + path mouth
await evalJson(`(() => { const h=${V}.heightAt; ${V}.lookAt(0, h(0,-262)+3, -262, 0, h(0,-240)+6, -240); return 'clearing'; })()`);
await sleep(800); await cap("stage3_clearing");

// 3. savannah ground view — mid-savannah looking north across the tree mix
await evalJson(`(() => { const h=${V}.heightAt; ${V}.warpPlayer(0, -40); ${V}.lookAt(0, h(0,-60)+4, -60, 10, h(10,0)+5, 0); return 'savannah'; })()`);
await sleep(1200); await cap("stage3_savannah");

// 4. mountain pass — rocky corridor with the cliff walls either side
await evalJson(`(() => { const h=${V}.heightAt; ${V}.warpPlayer(0, 250); ${V}.lookAt(0, h(0,230)+8, 230, 0, h(0,300)+14, 300); return 'pass'; })()`);
await sleep(1200); await cap("stage3_pass");

// FPS estimate
console.log("[fps]", await evalJson("window.__game && window.__game.engine ? +window.__game.engine.getFps().toFixed(1) : -1"));

if (consoleErrors.length) {
  console.error("CONSOLE ERRORS (" + consoleErrors.length + "):\n" + consoleErrors.slice(0, 30).join("\n"));
} else {
  console.log("NO console errors");
}
ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(consoleErrors.length ? 2 : 0);
