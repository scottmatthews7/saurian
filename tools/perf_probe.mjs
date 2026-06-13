// Frame-rate probe: boots the game headless, warps the camera to each map
// hotspot, samples FPS + scene load for a few seconds, prints a table.
// Usage: node tools/perf_probe.mjs   (own server on 8216; never the owner's 8011)
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = "8216", DEBUG_PORT = 9351;

// hotspots on the NEW island (world x,z + a camera look direction)
const SPOTS = [
  ["clearing_wall", 0, -250, 0, -290],   // stand at spawn, face the south tree wall
  ["clearing_north", 0, -250, 0, -210],  // face the path mouth
  ["path", 0, -200, 0, -160],
  ["savannah", 0, 35, 0, 100],
  ["forest_edge", -100, 70, -160, 70],
  ["pass", 0, 310, 0, 360],
  ["desert", 0, 432, 0, 480],
  ["beach", 0, 530, 0, 575],
];

const server = spawn("python3", ["-m", "http.server", PORT], { stdio: "ignore" });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu-sandbox",
  "--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist",
  "--window-size=1280,720", "about:blank",
], { stdio: "ignore" });
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
  throw new Error("no devtools endpoint");
}
const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params, sessionId })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
let ready = false;
for (let i = 0; i < 400 && !ready; i++) {
  await sleep(200);
  ready = await evalJs("!!(window.__verify && window.__verify.ready)").catch(() => false);
}
if (!ready) { console.error("game never became ready"); cleanup(); process.exit(1); }
await sleep(1500);

console.log("spot            | fps   | frame ms | active/total meshes | verts (k) | draws");
console.log("----------------|-------|----------|---------------------|-----------|------");
for (const [name, px, pz, tx, tz] of SPOTS) {
  await evalJs(`(()=>{const h=window.__verify.heightAt; window.__verify.warpPlayer && window.__verify.warpPlayer(${px}, ${pz}); window.__verify.lookAt(${px}, h(${px},${pz})+2.2, ${pz}, ${tx}, h(${tx},${tz})+3, ${tz}); return 1;})()`).catch((e) => console.error(name, "warp failed:", e.message));
  await sleep(2200);   // settle: culling, instance buffers, GC
  const s = await evalJs(`(async()=>{
    const g = window.__game, e = g.engine, sc = g.scene || e.scenes[0];
    const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const obs = sc.onAfterRenderObservable.add(() => { if (++frames >= 120 || performance.now() - t0 > 3000) { sc.onAfterRenderObservable.remove(obs); res(); } }); });
    const ms = (performance.now() - t0) / frames;
    return JSON.stringify({ fps: +e.getFps().toFixed(1), ms: +ms.toFixed(2),
      active: sc.getActiveMeshes().length, total: sc.meshes.length,
      verts: Math.round(sc.getTotalVertices() / 1000),
      draws: sc.getEngine()._drawCalls ? sc.getEngine()._drawCalls.current : -1 });
  })()`).catch((e) => JSON.stringify({ err: e.message.slice(0, 60) }));
  const j = JSON.parse(s);
  console.log(j.err
    ? `${name.padEnd(16)}| ERR ${j.err}`
    : `${name.padEnd(16)}| ${String(j.fps).padEnd(6)}| ${String(j.ms).padEnd(9)}| ${String(j.active + "/" + j.total).padEnd(20)}| ${String(j.verts).padEnd(10)}| ${j.draws}`);
}
cleanup();
process.exit(0);
