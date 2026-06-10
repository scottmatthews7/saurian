// Headless scene probe: loads the harness and dumps scene diagnostics so we can
// debug a blank render (mesh count, ground bounds, camera, sun dir, fog).
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8127";
const shot = process.argv[2] || "high";
const DEBUG_PORT = 9334;

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`,
  "--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist",
  "--window-size=1280,720", "--no-first-run", "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

async function ws() {
  for (let i = 0; i < 50; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(100);
  }
  throw new Error("no devtools");
}
const url = await ws();
const sock = new WebSocket(url);
await new Promise((r) => sock.addEventListener("open", r));
let id = 0; const pend = new Map();
sock.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, sessionId })); });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId);
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/desert_shot.html?shot=${shot}` }, sessionId);

for (let i = 0; i < 100; i++) {
  await sleep(120);
  const r = await send("Runtime.evaluate", { expression: "window.__ready===true||!!window.__err", returnByValue: true }, sessionId);
  if (r.result.value) break;
}
const probe = `(() => {
  const s = window.__dbg && window.__dbg.scene;
  if (!s) return JSON.stringify({err: window.__err, noscene:true});
  const cam = s.activeCamera;
  const g = s.getMeshByName("ground");
  let gb = null;
  if (g) { g.computeWorldMatrix(true); const bi = g.getBoundingInfo().boundingBox; gb = {min:bi.minimumWorld.asArray().map(n=>+n.toFixed(1)), max:bi.maximumWorld.asArray().map(n=>+n.toFixed(1))}; }
  const sun = s.getLightByName("sun");
  return JSON.stringify({
    err: window.__err,
    meshes: s.meshes.length,
    activeMeshes: s.getActiveMeshes().length,
    cam: cam ? {pos: cam.position.asArray().map(n=>+n.toFixed(1)), tgt: (cam.target||cam.getTarget&&cam.getTarget()||{asArray:()=>[0,0,0]}).asArray? cam.target.asArray().map(n=>+n.toFixed(1)):null} : null,
    groundBounds: gb,
    sunDir: sun ? sun.direction.asArray().map(n=>+n.toFixed(2)) : null,
    sunInt: sun ? +sun.intensity.toFixed(2) : null,
    fogMode: s.fogMode, fogDensity: +s.fogDensity.toFixed(4),
    fogColor: s.fogColor.asArray().map(n=>+n.toFixed(2)),
    clear: s.clearColor.asArray().map(n=>+n.toFixed(2)),
  });
})()`;
const out = await send("Runtime.evaluate", { expression: probe, returnByValue: true }, sessionId);
console.log(out.result.value || JSON.stringify(out.result));
sock.close(); chrome.kill("SIGTERM"); await sleep(150); process.exit(0);
