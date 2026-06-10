// Follow-up shot driver: tighter framing for the shoreline, the T-Rex scale,
// and a clean high overhead. Reuses world_verify.html (the full game). Headless.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8197";
const OUT = process.env.OUT || "tools/shots";
const W = 1280, H = 720, DEBUG_PORT = 9361;
mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) { console.error("chrome missing"); process.exit(1); }
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu-sandbox", "--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", `--window-size=${W},${H}`, "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let cerr = ""; chrome.stderr.on("data", d => cerr += d);
async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(100); } throw new Error("no cdp " + cerr); }
const ws = new WebSocket(await wsUrl()); await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
const send = (method, params = {}, sid) => new Promise((resolve, reject) => { const mid = ++id; pend.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params, sessionId: sid })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) return "EXC:" + r.exceptionDetails.text; return r.result.value; };
const cap = async name => { const c = await send("Page.captureScreenshot", { format: "png" }, sessionId); writeFileSync(`${OUT}/${name}.png`, Buffer.from(c.data, "base64")); console.log("saved", name); };

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
for (let i = 0; i < 400; i++) { await sleep(150); if (await ev("!!(window.__verify&&window.__verify.ready)").catch(() => false)) break; }
await sleep(1500);

const V = "window.__verify";
// shoreline: stand on the beach (x=88, on land) elevated, look east-down at the
// waterline (~x=120) so sand -> surf -> open sea all show.
await ev(`(()=>{const h=${V}.heightAt; ${V}.lookAt(80, h(80,30)+9, 30, 135, -2, 5); return 'shore';})()`);
await sleep(500); await cap("06_shoreline_beach_to_sea");
// shoreline oblique along the coast (shows the sand band running N-S)
await ev(`(()=>{const h=${V}.heightAt; ${V}.lookAt(95, h(95,-60)+12, -60, 125, -1.4, 40); return 'shore2';})()`);
await sleep(500); await cap("06b_coast_oblique");

// T-Rex scale, TIGHT: camera close + low beside the rex & player.
const info = await ev(`(()=>{const g=window.__game;const B=window.BABYLON;
  const rex=g.predators.find(p=>p.kind==='trex'&&!p.dead); if(!rex) return 'no rex';
  const rp=rex.dino.root.position; ${V}.warpPlayer(rp.x+3.5, rp.z+0.5);
  const pp=g.player.dino.root.position; const h=${V}.heightAt;
  const mx=(rp.x+pp.x)/2, mz=(rp.z+pp.z)/2;
  ${V}.lookAt(mx+2, h(mx,mz)+3.5, mz-9, mx, h(mx,mz)+3, mz);
  const bb=(node)=>{let mn=new B.Vector3(1e9,1e9,1e9),mx2=new B.Vector3(-1e9,-1e9,-1e9);node.getChildMeshes(false).forEach(m=>{if(!m.getBoundingInfo||m.getTotalVertices()===0)return;m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;mn=B.Vector3.Minimize(mn,b.minimumWorld);mx2=B.Vector3.Maximize(mx2,b.maximumWorld);});return +(mx2.y-mn.y).toFixed(2);};
  return JSON.stringify({rex:bb(rex.dino.root), player:bb(g.player.dino.root)});
})()`);
console.log("trex scale:", info);
await sleep(700); await cap("07_trex_scale_tight");

// clean overhead, no DoF dominance: very high, straight down — reads the doubled
// disc + biomes + the eastern sea band.
await ev(`${V}.lookAt(0, 480, 0.5, 0, 0, 0); 'over'`);
await sleep(500); await cap("08_overhead_clean");
// minimap close-up (the radar already encodes the doubled map + ocean band)
await cap("08b_with_minimap");

const fps = await ev("+window.__game.engine.getFps().toFixed(1)");
console.log("fps", fps);
ws.close(); chrome.kill("SIGTERM"); await sleep(200); process.exit(0);
