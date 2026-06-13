// Headless verification driver for the WORLD overhaul. Launches
// chrome-headless-shell (NO visible window — headless RULE: --headless=new),
// loads tools/world_verify.html (the FULL game), waits for window.__verify.ready,
// then: frames a set of camera shots and captures PNGs, samples dino positions
// over time to prove territories hold, and reports console errors + FPS.
//
// Usage: node tools/world_verify.mjs
//   env: PORT (default 8191), OUT (default tools/shots)
// No npm deps — Node's built-in WebSocket + raw CDP (mirrors desert_capture.mjs).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8191";
const OUT = process.env.OUT || "tools/shots";
const W = 1280, H = 720;
const DEBUG_PORT = 9343;

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

// let the sim run a moment so dinos start moving + textures resolve
await sleep(1500);

// --- shots -----------------------------------------------------------------
// Each entry: [name, camera setup expression using window.__verify]. The
// expression returns a string for logging. ARENA radius is 180.
const V = "window.__verify";

// 1. doubled map — high overhead establishing shot of the whole arena.
// The exp2 fog (ENV.fogDensity 0.0085) fully obscures the ground from any
// camera a few hundred units up — an overhead at height is inside the fog by
// design. Disable fog for THIS shot only (fogEnabled isn't touched by the
// daynight loop, so it toggles cleanly).
await evalJson(`(()=>{window.__game.scene.fogEnabled = false; ${V}.lookAt(0, 320, -0.1, 0, 0, 0); return 'overhead';})()`);
await sleep(400); await cap("01_overhead_doubled_map");
await evalJson(`(()=>{window.__game.scene.fogEnabled = true; return 'fog restored';})()`);

// 2. ocean + shoreline — stand on the east coast looking out to sea
await evalJson(`(()=>{const h=${V}.heightAt; const cx=120, cz=0; ${V}.lookAt(cx-40, h(cx-40,cz)+10, cz, cx+60, ${V}.B ? 0 : 0, cz); return 'ocean';})()`);
await sleep(400); await cap("02_ocean_shoreline");

// 2b. ocean low angle from the beach
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.lookAt(100, h(100,20)+4, 20, 150, -1, -10); return 'beach';})()`);
await sleep(400); await cap("02b_ocean_beach");

// 3. desert — eye level inside the dry zone (centre -70,-120)
await evalJson(`(()=>{const h=${V}.heightAt; const cx=-70, cz=-120; ${V}.lookAt(cx-45, h(cx-45,cz+30)+2.4, cz+30, cx+30, h(cx,cz)+6, cz-20); return 'desert-eye';})()`);
await sleep(400); await cap("03_desert_eye_level");

// 3b. desert — elevated establishing of the mesas
await evalJson(`(()=>{const h=${V}.heightAt; const cx=-70, cz=-120; ${V}.lookAt(cx+70, h(cx+70,cz+70)+40, cz+70, cx, h(cx,cz), cz); return 'desert-high';})()`);
await sleep(400); await cap("03b_desert_mesas_high");

// 3c. desert — low angle on a bone cluster region (sample several spots)
await evalJson(`(()=>{const h=${V}.heightAt; const cx=-70, cz=-120; ${V}.lookAt(cx-10, h(cx-10,cz-10)+3, cz-10, cx+20, h(cx,cz)+1, cz+10); return 'desert-bones';})()`);
await sleep(400); await cap("03c_desert_ground_bones");

// 4. T-Rex scale beside the player — warp player near the rex, frame both low
const scaleInfo = await evalJson(`(()=>{
  const g = window.__game; const B = window.BABYLON;
  const rex = g.predators.find(p=>p.kind==='trex' && !p.dead);
  if(!rex) return 'no rex';
  const rp = rex.dino.root.position;
  // put the player right beside the rex
  ${V}.warpPlayer(rp.x + 3, rp.z + 1);
  const pp = g.player.dino.root.position;
  // frame side-on, low, both in shot
  const h = ${V}.heightAt;
  const midx=(rp.x+pp.x)/2, midz=(rp.z+pp.z)/2;
  ${V}.lookAt(midx, h(midx,midz)+3, midz-14, midx, h(midx,midz)+3.2, midz);
  // measure rendered heights via bounding boxes
  const bb=(node)=>{let mn=new B.Vector3(1e9,1e9,1e9),mx=new B.Vector3(-1e9,-1e9,-1e9);
    node.getChildMeshes(false).forEach(m=>{if(!m.getBoundingInfo||m.getTotalVertices()===0)return;m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;mn=B.Vector3.Minimize(mn,b.minimumWorld);mx=B.Vector3.Maximize(mx,b.maximumWorld);});
    return +(mx.y-mn.y).toFixed(2);};
  return JSON.stringify({rexHeight: bb(rex.dino.root), playerHeight: bb(g.player.dino.root)});
})()`);
console.log("[trex scale]", scaleInfo);
await sleep(600); await cap("04_trex_scale_vs_player");

// 5. territory log — sample positions over time, report per-dino max distance
//    from its territory centre vs its radius.
const territoryLog = await evalJson(`(async()=>{
  const g = window.__game;
  const TERR = (await import('/src/config.js')).TERRITORY;
  const samples = [];
  const maxDist = {};   // kind -> max dist from territory centre seen
  for (let i=0;i<40;i++){
    for (const p of g.predators){ if(!p||p.dead) continue; const q=p.dino.root.position; const T=TERR[p.kind]; if(!T)continue; const d=Math.hypot(q.x-T.centerX,q.z-T.centerZ); maxDist['pred:'+p.kind]=Math.max(maxDist['pred:'+p.kind]||0,+d.toFixed(1)); }
    for (const hh of g.herd){ if(!hh||hh.dead) continue; const q=hh.dino.root.position; const T=TERR[hh.kind]; if(!T)continue; const d=Math.hypot(q.x-T.centerX,q.z-T.centerZ); maxDist['herb:'+hh.kind]=Math.max(maxDist['herb:'+hh.kind]||0,+d.toFixed(1)); }
    await new Promise(r=>setTimeout(r,250));
  }
  // build a report: kind, maxDist, territoryRadius, hardLeash, OK?
  const report = {};
  const seen = new Set();
  for (const p of g.predators){ if(p&&!p.dead) seen.add('pred:'+p.kind); }
  for (const hh of g.herd){ if(hh&&!hh.dead) seen.add('herb:'+hh.kind); }
  for (const key of seen){ const kind=key.split(':')[1]; const T=TERR[kind]; if(!T)continue;
    const hard=T.radius+T.edgeSoftness*(TERR.leashHardMul||2);
    report[key]={maxDist:maxDist[key]||0, radius:T.radius, hardLeash:+hard.toFixed(0), withinHard:(maxDist[key]||0)<=hard+2}; }
  return JSON.stringify(report,null,2);
})()`);
console.log("[territory log over ~10s]\n" + territoryLog);
await cap("05_after_territory_sampling");

// FPS estimate
const fps = await evalJson("window.__game && window.__game.engine ? +window.__game.engine.getFps().toFixed(1) : -1");
console.log("[fps]", fps);

if (consoleErrors.length) {
  console.error("CONSOLE ERRORS (" + consoleErrors.length + "):\n" + consoleErrors.slice(0, 30).join("\n"));
} else {
  console.log("NO console errors");
}
ws.close();
chrome.kill("SIGTERM");
await sleep(200);
process.exit(0);
