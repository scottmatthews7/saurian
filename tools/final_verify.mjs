// FINAL end-to-end verification: boot, journey legs (spawn -> boat) with
// biomeAt assertions + ESCAPED banner, collision spot-checks (J wall, M wall,
// P walkable), 30 s dino mask sim, and the owner's final_*.png review set.
// Mirrors the stage4/stage5 CDP harness (no npm deps).
//
// Usage: node tools/final_verify.mjs
//   env: PORT (default 8219 — NEVER 8011), OUT (default ~/Desktop/saurian-map/build)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_PATH = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8219";
const OUT = process.env.OUT || `${homedir()}/Desktop/saurian-map/build`;
const W = 1280, H = 720;
const DEBUG_PORT = 9449;

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME_PATH)) { console.error("chrome-headless-shell missing at", CHROME_PATH); process.exit(1); }

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const server = spawn("python3", ["-m", "http.server", PORT], { stdio: "ignore" });
const chrome = spawn(CHROME_PATH, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu-sandbox",
  "--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist",
  `--window-size=${W},${H}`, "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
chrome.stderr.on("data", (d) => { chromeErr += d.toString(); });
const cleanup = () => { chrome.kill("SIGTERM"); server.kill("SIGTERM"); };
process.on("exit", cleanup);

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("chrome devtools endpoint never came up\n" + chromeErr);
}

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
let id = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) {
    for (const l of listeners) l(m);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params, sessionId })); });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const consoleErrors = [];
listeners.push((m) => {
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
  if (m.method === "Runtime.exceptionThrown")
    consoleErrors.push("EXCEPTION: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
});

const evalJson = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};
const cap = async (name) => {
  const c = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(c.data, "base64"));
  console.log(`[shot] saved ${OUT}/${name}.png`);
};

// --- boot --------------------------------------------------------------------
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
let ready = false, lastErr = null;
for (let i = 0; i < 400; i++) {
  await sleep(150);
  const st = await evalJson("JSON.stringify({ready: !!(window.__verify&&window.__verify.ready), err: window.__verify&&window.__verify.err||null})").catch(() => null);
  if (!st) continue;
  const j = JSON.parse(st);
  lastErr = j.err;
  if (j.err) break;
  if (j.ready) { ready = true; break; }
}
check("headless boot", ready, lastErr ? "err=" + lastErr : "");
if (!ready) { cleanup(); process.exit(1); }
await sleep(1500);
const V = "window.__verify";

// start the run (title gate releases on first keydown)
await evalJson(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'})); return 1;})()`);
await sleep(500);

// --- collision spot-checks (before the dinos wander far) ----------------------
// J wall blocks: park camera south so "w" walks north into the first J column.
const jProbe = JSON.parse(await evalJson(`(async () => {
  const g = window.__game;
  const { biomeAt } = await import("/src/map.js");
  const x = -12;
  let wallZ = null;
  for (let z = -250; z < -180; z++) { if (biomeAt(x, z) === "J") { wallZ = z; break; } }
  if (wallZ === null) return JSON.stringify({ fail: "no J wall found" });
  const startZ = wallZ - 4;
  ${V}.warpPlayer(x, startZ);
  const h = ${V}.heightAt;
  ${V}.lookAt(x, h(x, startZ - 14) + 6, startZ - 14, x, h(x, startZ) + 2, startZ + 10);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  await new Promise((r) => setTimeout(r, 2500));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
  const p = g.player.dino.root.position;
  return JSON.stringify({ wallZ, endZ: +p.z.toFixed(2), endBiome: biomeAt(p.x, p.z),
    blocked: p.z < wallZ + 0.2 && biomeAt(p.x, p.z) !== "J" });
})()`));
check("J cell blocks player", !!jProbe.blocked, JSON.stringify(jProbe));

// M wall blocks: from the rocky pass walk east into the mountain flank.
const mProbe = JSON.parse(await evalJson(`(async () => {
  const g = window.__game;
  const { biomeAt } = await import("/src/map.js");
  const z = 310;
  let wallX = null;
  for (let x = 0; x < 120; x++) { if (biomeAt(x, z) === "M") { wallX = x; break; } }
  if (wallX === null) return JSON.stringify({ fail: "no M wall found" });
  const startX = wallX - 4;
  ${V}.warpPlayer(startX, z);
  const h = ${V}.heightAt;
  ${V}.lookAt(startX - 14, h(startX - 14, z) + 6, z, startX + 10, h(startX, z) + 2, z);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  await new Promise((r) => setTimeout(r, 2500));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
  const p = g.player.dino.root.position;
  return JSON.stringify({ wallX, endX: +p.x.toFixed(2), endBiome: biomeAt(p.x, p.z),
    blocked: p.x < wallX + 0.2 && biomeAt(p.x, p.z) !== "M" });
})()`));
check("M cell blocks player", !!mProbe.blocked, JSON.stringify(mProbe));

// P walkable: drive the muddy path waypoint chain. Legs are SUBDIVIDED into
// ~2u sub-targets: the corridor is only 2 cells wide and kinked, so beelining
// a far waypoint drifts the player into the J column where the axis-clamp
// dead-stops it — tracking the segment line stays inside the corridor.
const pProbe = JSON.parse(await evalJson(`(async () => {
  const g = window.__game;
  const { biomeAt, getMuddyPath } = await import("/src/map.js");
  const wps = (getMuddyPath() || {}).waypoints || [];
  if (!wps.length) return JSON.stringify({ fail: "no muddyPath waypoints" });
  const pts = [wps[0]];
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1], b = wps[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let k = 1; k <= n; k++) pts.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  ${V}.warpPlayer(pts[0].x, pts[0].z);
  const h = ${V}.heightAt;
  let reached = 0;
  for (let leg = 1; leg < pts.length; leg++) {
    const tgt = pts[leg];
    for (let step = 0; step < 12; step++) {
      const p = g.player.dino.root.position;
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      if (d < 1.5) break;
      const dx = (tgt.x - p.x) / d, dz = (tgt.z - p.z) / d;
      ${V}.lookAt(p.x - dx * 12, h(p.x, p.z) + 6, p.z - dz * 12, tgt.x, h(tgt.x, tgt.z) + 2, tgt.z);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
      await new Promise((r) => setTimeout(r, 250));
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
    const p = g.player.dino.root.position;
    if (Math.hypot(tgt.x - p.x, tgt.z - p.z) < 1.5) reached = leg; else break;
  }
  return JSON.stringify({ subTargets: pts.length, reached, walked: reached >= pts.length - 1 });
})()`));
check("P path walkable", !!pProbe.walked, JSON.stringify(pProbe));

// --- 30 s dino mask sim (stage-5 sampler) -------------------------------------
await evalJson(`${V}.warpPlayer(0, -250); 'reset'`);
const sim = JSON.parse(await evalJson(`(async()=>{
  const map = await import('/src/map.js');
  const cfg = await import('/src/config.js');
  const g = window.__game;
  const bad = [];
  let n = 0;
  for (let s = 0; s < 30; s++) {
    for (const a of [...g.predators, ...g.herd]) {
      if (a.dead) continue;
      const T = cfg.TERRITORY[a.kind];
      if (!T || !T.biomes) continue;
      const p = a.dino.root.position;
      const code = map.biomeAt(p.x, p.z);
      n++;
      if (!T.biomes.includes(code)) bad.push({ s, kind: a.kind, x: +p.x.toFixed(1), z: +p.z.toFixed(1), code });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return JSON.stringify({ samples: n, violations: bad });
})()`));
check("dino mask sim (30 s)", sim.violations.length === 0,
  `${sim.samples} samples, ${sim.violations.length} violations` +
  (sim.violations.length ? " " + JSON.stringify(sim.violations.slice(0, 10)) : ""));

// --- journey legs: biomeAt at each warp ---------------------------------------
const LEGS = [
  ["spawn", 0, -250, "C"],
  ["path mouth", 9.3, -242.3, "P"],
  ["savannah", 0, 35, "G"],
  ["pass", 0, 310, "R"],
  ["desert", 0, 432, "D"],
  ["beach", 0, 560, "B"],
];
for (const [name, x, z, want] of LEGS) {
  const got = JSON.parse(await evalJson(`(async()=>{
    const { biomeAt } = await import("/src/map.js");
    ${V}.warpPlayer(${x}, ${z});
    await new Promise(r => setTimeout(r, 300));
    const p = window.__game.player.dino.root.position;
    return JSON.stringify({ code: biomeAt(p.x, p.z), alive: !window.__game.game.over || window.__game.game.won });
  })()`));
  check(`journey leg ${name} biome=${want}`, got.code === want, `got ${got.code}`);
}

// --- screenshots (scenic set, before the win ends the run) --------------------
await evalJson("(() => { const c = window.__game.camRig.cam; c.upperRadiusLimit = 2000; c.lowerRadiusLimit = 0.5; c.maxZ = 4000; return 1; })()");
await evalJson(`${V}.warpPlayer(0, -250); 'reset'`);
await sleep(400);

// overhead island, fog off (stage3 framing)
await evalJson(`(()=>{window.__game.scene.fogEnabled=false; ${V}.lookAt(0, 760, 89.9, 0, 0, 90); return 1;})()`);
await sleep(900); await cap("final_overhead");
await evalJson("window.__game.scene.fogEnabled=true; 1");

// clearing with assets, elevated over the south wall, fog off (stage4 framing)
await evalJson(`(()=>{window.__game.scene.fogEnabled=false; const h=${V}.heightAt; ${V}.lookAt(-1, h(-1,-264)+24, -264, 2, h(2,-247)+1, -247); return 1;})()`);
await sleep(500); await cap("final_clearing_assets");
await evalJson("window.__game.scene.fogEnabled=true; 1");

// muddy path: oblique AERIAL, fog off — at ground level the wall trees roof the
// 2u corridor completely (every in-corridor camera sits inside foliage), so the
// shot that actually reads is the pale mud ribbon snaking north from the
// clearing through the dark jungle mass — first-pass for owner eyeball
await evalJson(`(()=>{window.__game.scene.fogEnabled=false; const h=${V}.heightAt; ${V}.warpPlayer(10,-230); ${V}.lookAt(0, 120, -285, 14, h(14,-200), -200); return 1;})()`);
await sleep(900); await cap("final_path");
await evalJson("window.__game.scene.fogEnabled=true; 1");

// savannah with dinos: frame the nearest live big herbivore/predator cluster
const savFrame = JSON.parse(await evalJson(`(()=>{
  const g = window.__game;
  const wild = [...g.predators, ...g.herd].filter(a => !a.dead && a.kind !== 'raptor');
  let best = null, bestD = 1e9;
  for (const a of wild) {
    const p = a.dino.root.position;
    const d = Math.hypot(p.x - 0, p.z - 35);
    if (d < bestD) { bestD = d; best = { x: p.x, z: p.z, kind: a.kind }; }
  }
  return JSON.stringify(best || {});
})()`));
if (savFrame.kind) {
  // elevated 3/4 (16u up, 34u back) so savannah tree canopies don't block the
  // line of sight — first-pass for owner eyeball
  await evalJson(`(()=>{const h=${V}.heightAt; ${V}.warpPlayer(${savFrame.x}, ${savFrame.z - 20});
    ${V}.lookAt(${savFrame.x}, h(${savFrame.x}, ${savFrame.z - 34}) + 16, ${savFrame.z - 34},
                ${savFrame.x}, h(${savFrame.x}, ${savFrame.z}) + 2, ${savFrame.z}); return 1;})()`);
  await sleep(900); await cap("final_savannah_dinos");
  console.log("[savannah frame] aimed at", JSON.stringify(savFrame));
} else {
  check("savannah dino framing", false, "no live non-raptor dino found");
}

// forest (stego territory -112,70): camera lifted over the canopy line at the
// biome edge, looking into the tree mass — first-pass for owner eyeball
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.warpPlayer(-60,70); ${V}.lookAt(-52, h(-52,70)+22, 70, -112, h(-112,70)+2, 70); return 1;})()`);
await sleep(900); await cap("final_forest");

// swamp (anky territory 125,95) — first-pass for owner eyeball
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.warpPlayer(96,72); ${V}.lookAt(96, h(96,72)+8, 72, 125, h(125,95)+1, 95); return 1;})()`);
await sleep(900); await cap("final_swamp");

// rocky pass, looking north up the corridor — first-pass for owner eyeball
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.warpPlayer(0,290); ${V}.lookAt(0, h(0,290)+5, 290, 0, h(0,330)+8, 330); return 1;})()`);
await sleep(900); await cap("final_pass");

// desert with the stego skeleton (stage4 framing)
await evalJson(`(()=>{const h=${V}.heightAt; ${V}.warpPlayer(-26,464); ${V}.lookAt(-26, h(-26,464)+6, 464, -26, h(-26,452)+0.3, 452); return 1;})()`);
await sleep(900); await cap("final_desert_skeleton");

// beach + boat 3/4 (stage4 framing)
await evalJson(`(()=>{${V}.warpPlayer(0,548); ${V}.lookAt(16, 5, 558, 0, -0.8, 582); return 1;})()`);
await sleep(900); await cap("final_beach_boat");

// --- the win: warp to the boat, assert the ESCAPED banner ---------------------
const win = JSON.parse(await evalJson(`(async()=>{
  const g = window.__game;
  ${V}.warpPlayer(0, 560);
  await new Promise(r => setTimeout(r, 600));
  ${V}.warpPlayer(0, 572);
  await new Promise(r => setTimeout(r, 800));
  const banner = document.getElementById('banner');
  return JSON.stringify({ won: g.game.won, over: g.game.over,
    bannerVisible: banner ? getComputedStyle(banner).display !== 'none' : null,
    bannerText: banner ? banner.textContent.trim().slice(0, 120) : null });
})()`));
check("boat leg wins (ESCAPED)", !!(win.won && win.bannerVisible), JSON.stringify(win));

// banner shot — world_verify.html carries no #banner CSS, inject the minimal rules
await evalJson(`(()=>{
  const st = document.createElement('style');
  st.textContent = '#banner{position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(6,12,10,.72);color:#e8f2ec;font-family:system-ui,sans-serif;z-index:30}.bannerTitle{font-size:72px;font-weight:800;letter-spacing:.06em}.scrKicker{font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#8fd4cf}.scrHook{max-width:560px;opacity:.85}.scrStats{margin-top:10px;font-size:18px}.scrPrompt{margin-top:14px;font-size:14px;opacity:.8}';
  document.head.appendChild(st);
  const h=${V}.heightAt; ${V}.lookAt(14, h(14,560)+8, 560, 0, 0, 578); return 1;})()`);
await sleep(500); await cap("final_escaped");

// --- console errors ------------------------------------------------------------
check("zero console errors", consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.slice(0, 10).join(" | ") : "");

console.log("\n=== SUMMARY ===");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
const fails = results.filter((r) => !r.pass).length;
console.log(fails ? `${fails} FAIL(S)` : "ALL CHECKS PASS");
ws.close();
cleanup();
await sleep(200);
process.exit(fails ? 1 : 0);
