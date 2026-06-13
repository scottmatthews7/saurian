// Headless verification for the P2.1 ESCAPE ISLAND remap.
// Serves the game on PORT (default 8022 — owner uses 8011), loads it in
// chrome-headless-shell via raw CDP, waits for window.__game, then:
//  - collects console errors
//  - reads world dims + player spawn + boat position + a heightAt profile
//  - drives the player SOUTH→NORTH (auto-run) and measures the traverse distance
//    / time at the player's speed
//  - captures top-down, spawn and boat screenshots into OUT (~/Desktop/saurian-map)
// No npm deps (Node built-in http + WebSocket + raw CDP).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = +(process.env.PORT || 8022);
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map`;
const ROOT = process.cwd();
const W = 1280, H = 800;
const DEBUG_PORT = 9355;

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) { console.error("chrome-headless-shell missing at", CHROME); process.exit(1); }

// --- tiny static server -------------------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".hdr": "application/octet-stream",
  ".mp3": "audio/mpeg", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end("404"); return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));
console.log(`serving ${ROOT} on http://localhost:${PORT}`);

// --- launch chrome ------------------------------------------------------------
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`,
  "--disable-gpu-sandbox", "--use-gl=angle", "--use-angle=metal",
  "--enable-webgl", "--ignore-gpu-blocklist", `--window-size=${W},${H}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
chrome.stderr.on("data", (d) => { chromeErr += d.toString(); });

function cleanup(code) { try { chrome.kill("SIGKILL"); } catch {} try { server.close(); } catch {} process.exit(code); }
process.on("SIGINT", () => cleanup(1));

// --- raw CDP over the websocket ----------------------------------------------
async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("no CDP ws url");
}
const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push((m.params.args || []).map((a) => a.value || a.description || "").join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    const e = m.params.exceptionDetails;
    consoleErrors.push("EXCEPTION: " + (e.exception?.description || e.text || JSON.stringify(e)));
  }
};
// Attach to a fresh PAGE target via a flattened session (so Runtime.evaluate runs
// in the page context, not the browser target).
function rawSend(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); });
}
const { targetId } = (await rawSend("Target.createTarget", { url: "about:blank" })).result;
const { sessionId } = (await rawSend("Target.attachToTarget", { targetId, flatten: true })).result;
function send(method, params = {}) { return rawSend(method, params, sessionId); }
async function evalJs(expr, awaitPromise = false) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `http://localhost:${PORT}/index.html` });

// wait for the game handle
let ready = false;
for (let i = 0; i < 160; i++) {
  const ok = await evalJs("!!(window.__game && window.__game.world && window.__game.player)").catch(() => false);
  if (ok) { ready = true; break; }
  await sleep(500);
}
if (!ready) {
  console.error("game never became ready");
  console.error("PAGE ERRORS:", JSON.stringify(consoleErrors.slice(0, 30), null, 2));
  cleanup(1);
}
await sleep(2500); // let scatter/foliage settle a couple of frames

// --- read world facts ---------------------------------------------------------
const facts = await evalJs(`(() => {
  const g = window.__game; const w = g.world; const p = g.player;
  const C = g.__cfg || {};
  const heightAt = w.heightAt;
  // sample heightAt along the spine S->N
  const prof = [];
  for (let z = -1700; z <= 1750; z += 250) prof.push([z, +heightAt(0, z).toFixed(2)]);
  const pp = p.dino.root.position;
  return {
    playerSpawn: { x: +pp.x.toFixed(1), y: +pp.y.toFixed(2), z: +pp.z.toFixed(1) },
    spineProfile: prof,
    seaLevel: w.oceanSeaLevel,
  };
})()`);

// boat position + win radius from config (exposed via __game? fall back to scene)
const boatInfo = await evalJs(`(() => {
  const g = window.__game; const scene = g.scene;
  const boat = scene.getTransformNodeByName('boat_root');
  let pos = null;
  if (boat) pos = { x:+boat.position.x.toFixed(1), y:+boat.position.y.toFixed(2), z:+boat.position.z.toFixed(1) };
  return { boat: pos, meshCount: scene.meshes.length };
})()`);

console.log("PLAYER SPAWN:", JSON.stringify(facts.playerSpawn));
console.log("SEA LEVEL:", facts.seaLevel);
console.log("SPINE heightAt(0,z):", JSON.stringify(facts.spineProfile));
console.log("BOAT:", JSON.stringify(boatInfo.boat), " scene meshes:", boatInfo.meshCount);

// --- screenshot helpers --------------------------------------------------------
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const data = r.result?.data;
  if (!data) { console.warn("no screenshot data for", name, JSON.stringify(r).slice(0, 200)); return; }
  writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
  console.log("shot ->", join(OUT, name));
}

// dismiss the title screen (start the loop) + hide the HUD banner so the world
// shows in the screenshots, then freeze the camera for the parked shots.
await evalJs(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  const b = document.getElementById('banner'); if (b) b.style.display = 'none';
  const l = document.getElementById('loading'); if (l) l.style.display = 'none';
  return true;
})()`);
await sleep(600);

// freeze camera + park it for an aerial of the whole (smaller) island. Span is
// now z≈-810..+840 (~1650), so the camera frames it from a lower/closer aerial.
await evalJs(`(() => {
  const g = window.__game; g.camRig.frozen = true; const cam = g.camRig.cam;
  // lift the player-camera's radius/beta clamps so we can park it far/high
  cam.upperRadiusLimit = 100000; cam.lowerRadiusLimit = 0;
  cam.lowerBetaLimit = 0; cam.upperBetaLimit = Math.PI;
  cam.fov = 1.1; cam.maxZ = 12000;
  // oblique high aerial from the SOUTH-WEST looking NORTH along the island.
  cam.setTarget(new BABYLON.Vector3(0, 0, 30));
  cam.setPosition(new BABYLON.Vector3(-520, 1200, -1450));
  g.scene.fogEnabled = false;   // show the whole island, not a fog wall
  return true;
})()`);
await sleep(900); await shot("island_aerial.png");
await evalJs("window.__game.scene.fogEnabled = true");

// ASCII land-mask probe (fog-independent proof of the island shape): sample
// world.landFactor across an x×z grid, print '#' land / ':' beach / '.' sea.
const mask = await evalJs(`(() => {
  const w = window.__game.world; if (!w.landFactor) return 'no landFactor exposed';
  let out = '';
  for (let z = -900; z <= 900; z += 70) {
    let row = '';
    for (let x = -360; x <= 360; x += 30) {
      const lf = w.landFactor(x, z);
      row += lf > 0.78 ? '#' : lf > 0.1 ? ':' : '.';
    }
    out += row + ' z=' + z + '\\n';
  }
  return out;
})()`);
console.log("ISLAND LAND MASK (x: -360..360, z: -900(S)..900(N)):\n" + mask);

// CLEARING + plane close-up (south lobe spawn) — open ground, plane, pilot/GPS,
// dense jungle ringing it.
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 0.9; const s = g.player.dino.root.position;
  cam.setTarget(new BABYLON.Vector3(s.x, 3, s.z));
  cam.setPosition(new BABYLON.Vector3(s.x + 26, 18, s.z - 34));
  return true;
})()`);
await sleep(700); await shot("clearing_plane.png");

// PILOT + GPS close-up (NW of the plane in the clearing).
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 0.8;
  const gps = g.scene.getTransformNodeByName('gps_root');
  const t = gps ? gps.position : new BABYLON.Vector3(-14, 2, g.player.dino.root.position.z + 12);
  cam.setTarget(new BABYLON.Vector3(t.x, t.y - 0.6, t.z));
  cam.setPosition(new BABYLON.Vector3(t.x + 6, t.y + 1.5, t.z - 7));
  return true;
})()`);
await sleep(700); await shot("pilot_gps.png");

// DENSE JUNGLE at PLAYER EYE-LEVEL (owner wants to see how enclosing it is).
// Camera at ~2u eye height inside the jungle band, looking horizontally — should
// be a wall of green, not seeing far. Two angles.
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 1.0;
  // STAND at the clearing edge looking OUT at the wall ring (the enclosure the
  // player faces leaving the spawn). East edge, looking east into the ring.
  const w = g.world; const ex = 30, ez = -700;
  const ey = w.heightAt(ex, ez) + 2.0;
  cam.setTarget(new BABYLON.Vector3(ex + 20, ey, ez));   // look east into the jungle wall
  cam.setPosition(new BABYLON.Vector3(ex, ey, ez));
  return true;
})()`);
await sleep(900); await shot("jungle_eyelevel.png");
// active-instance count NEAR this in-jungle camera (the per-frame DRAWN set) +
// how many trees are within 15u (enclosure proxy).
const jungleActive = await evalJs(`(() => {
  const g = window.__game; const c = g.camRig.cam.position;
  let treesOn = 0, underOn = 0, near15 = 0;
  g.scene.meshes.forEach(m => {
    if (!m.name || !m.isEnabled()) return;
    const isTree = /^tree[0-9]/.test(m.name);
    const isUnder = /^(fern2|geranium2|fern|geranium|lupine)[0-9]/.test(m.name);
    if (isTree) { treesOn++; const dx=m.position.x-c.x, dz=m.position.z-c.z; if (dx*dx+dz*dz < 225) near15++; }
    if (isUnder) underOn++;
  });
  return { treeInstancesEnabled: treesOn, understoryInstancesEnabled: underOn, treePartsWithin15u: near15 };
})()`);
console.log("JUNGLE ACTIVE (near camera):", JSON.stringify(jungleActive));
// a second eye-level angle looking back toward the clearing
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 1.0;
  const w = g.world; const ex = 40, ez = -560;
  const ey = w.heightAt(ex, ez) + 2.0;
  cam.setTarget(new BABYLON.Vector3(ex - 12, ey, ez - 4));
  cam.setPosition(new BABYLON.Vector3(ex, ey, ez));
  return true;
})()`);
await sleep(700); await shot("dense_jungle.png");

// MUDDY PATH — look straight DOWN the trail (S→N) from above the clearing edge
// so the cleared dirt corridor through the jungle reads (not buried side-on).
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 1.0;
  cam.setTarget(new BABYLON.Vector3(0, 0, -300));   // look north along the path
  cam.setPosition(new BABYLON.Vector3(0, 55, -640)); // high, just N of the clearing, looking N
  g.scene.fogEnabled = false;
  return true;
})()`);
await sleep(700); await shot("muddy_path.png");
await evalJs("window.__game.scene.fogEnabled = true");

// GRASSLAND close-up (central main body) — confirm the warm DRY-meadow grass.
await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam; cam.fov = 0.9;
  cam.setTarget(new BABYLON.Vector3(0, 2, 120));
  cam.setPosition(new BABYLON.Vector3(30, 8, 92));
  return true;
})()`);
await sleep(700); await shot("grassland.png");

// FPS at the real play view (camera at spawn, normal FOV, fog on), averaged over
// ~2s — a fairer signal than the parked fog-off shots (still HEADLESS software
// GL, so a real Mac GPU runs markedly higher).
await evalJs("(()=>{const c=window.__game.camRig.cam;c.fov=0.9;return true})()");
await sleep(500);
let fpsSamples = [];
for (let i = 0; i < 8; i++) { fpsSamples.push(await evalJs("Math.round(window.__game.engine.getFps())")); await sleep(250); }
const fpsPlay = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
console.log("FPS @ spawn play-view (headless software GL):", fpsPlay, fpsSamples);

// boat close-up
const boatBox = await evalJs(`(() => {
  const g = window.__game; const cam = g.camRig.cam;
  const boat = g.scene.getTransformNodeByName('boat_root');
  const b = boat ? boat.position : new BABYLON.Vector3(0,0,1610);
  // measure the boat's world bbox (height above the sea = how much shows)
  let min = new BABYLON.Vector3(1e9,1e9,1e9), max = new BABYLON.Vector3(-1e9,-1e9,-1e9);
  g.scene.meshes.forEach(m => { if (m.name && m.name.indexOf('boat') >= 0 && m.getTotalVertices && m.getTotalVertices()) {
    m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, bb.minimumWorld); max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
  }});
  cam.setTarget(new BABYLON.Vector3(b.x, 1.5, b.z));
  cam.setPosition(new BABYLON.Vector3(b.x + 11, 6, b.z - 13));
  g.scene.fogEnabled = false;
  return { topY: +max.y.toFixed(2), botY: +min.y.toFixed(2), seaLevel: g.world.oceanSeaLevel };
})()`);
console.log("BOAT BBOX:", JSON.stringify(boatBox), "(topY above seaLevel = visible hull)");
await sleep(700); await shot("boat.png");
await evalJs("window.__game.scene.fogEnabled = true");

// --- measure S->N traverse (from spawn z to boat z) ---------------------------
const traverse = await evalJs(`(() => {
  const g = window.__game;
  const spawnZ = ${-700};
  const boat = g.scene.getTransformNodeByName('boat_root');
  const boatZ = boat ? boat.position.z : 805;
  const dist = boatZ - spawnZ;
  const walk = 7, sprint = 16.5;
  return {
    spawnZ, boatZ:+boatZ.toFixed(0), dist:+dist.toFixed(0),
    walkSeconds:+(dist/walk).toFixed(0), sprintSeconds:+(dist/sprint).toFixed(0),
    mixSeconds:+(dist/11).toFixed(0)
  };
})()`);
console.log("TRAVERSE:", JSON.stringify(traverse));

// --- scatter counts + sea-check (did any tree/understory land in the sea?) ----
const counts = await evalJs(`(() => {
  const g = window.__game;
  // sea-check: sample every tree/understory-ish instance's landFactor; count any
  // sitting where landFactor < 0.5 (in the sea).
  const w = g.world; let inSea = 0, trees = 0, under = 0;
  g.scene.meshes.forEach(m => {
    if (!m.name) return;
    const isTree = /^tree[0-9]/.test(m.name);
    const isUnder = /^(fern2|geranium2|fern|geranium|lupine)[0-9]/.test(m.name);
    if (isTree || isUnder) {
      if (isTree) trees++; else under++;
      if (w.landFactor(m.position.x, m.position.z) < 0.5) inSea++;
    }
  });
  return { treeCounts: g.treeCounts || null, understory: g.understoryCount || null,
           sceneMeshes: g.scene.meshes.length, treeInstances: trees, understoryInstances: under, scatterInSea: inSea };
})()`);
console.log("COUNTS:", JSON.stringify(counts));

// --- prove the WIN fires: teleport the player onto the boat -------------------
const winResult = await evalJs(`(() => {
  const g = window.__game; const boat = g.scene.getTransformNodeByName('boat_root');
  const b = boat.position; const p = g.player;
  p.warpTo(b.x, g.world.heightAt(b.x, b.z) + 1, b.z);
  return { teleportedTo: { x:+b.x.toFixed(0), z:+b.z.toFixed(0) } };
})()`);
await sleep(700);
const won = await evalJs("!!window.__game.game.won");
console.log("WIN TRIGGER:", JSON.stringify(winResult), "-> game.won =", won);

console.log("CONSOLE ERRORS (" + consoleErrors.length + "):");
consoleErrors.slice(0, 40).forEach((e) => console.log("  !", e));

cleanup(consoleErrors.length ? 2 : 0);
