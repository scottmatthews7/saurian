// One-off diagnostic: at jungle hotspots, dump enabled thin-instance hosts
// (instance count x verts) and active-mesh composition. Own server on 8217.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = "8217", DEBUG_PORT = 9352;

const SPOTS = [
  ["clearing_wall", 0, -250, 0, -290],
  ["path", 0, -200, 0, -160],
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

for (const [name, px, pz, tx, tz] of SPOTS) {
  await evalJs(`(()=>{const h=window.__verify.heightAt; window.__verify.warpPlayer && window.__verify.warpPlayer(${px}, ${pz}); window.__verify.lookAt(${px}, h(${px},${pz})+2.2, ${pz}, ${tx}, h(${tx},${tz})+3, ${tz}); return 1;})()`);
  await sleep(2500);
  const s = await evalJs(`(()=>{
    const g = window.__game, sc = g.scene || g.engine.scenes[0];
    const hosts = sc.meshes
      .filter((m) => m.isEnabled() && m.isVisible && m.thinInstanceCount > 0)
      .map((m) => ({ n: m.name, src: m.source ? m.source.name : "", inst: m.thinInstanceCount,
        verts: m.getTotalVertices(), tris: m.getTotalIndices() / 3,
        totTri: Math.round(m.thinInstanceCount * m.getTotalIndices() / 3 / 1000),
        alpha: m.material ? m.material.transparencyMode : null }))
      .sort((a, b) => b.totTri - a.totTri);
    const act = sc.getActiveMeshes().data.slice(0, sc.getActiveMeshes().length);
    const byPrefix = {};
    for (const m of act) {
      const p = m.name.replace(/[0-9]+$/, "");
      byPrefix[p] = (byPrefix[p] || 0) + 1;
    }
    return JSON.stringify({ hosts: hosts.slice(0, 25), activeByPrefix: byPrefix,
      totalThinTrisK: hosts.reduce((n, h) => n + h.totTri, 0) });
  })()`);
  const j = JSON.parse(s);
  console.log("=== " + name + " === total thin-instance tris (k): " + j.totalThinTrisK);
  for (const h of j.hosts) console.log(`  ${h.n.padEnd(22)} src=${String(h.src).padEnd(28)} inst=${String(h.inst).padEnd(5)} tris=${String(h.tris).padEnd(7)} totK=${h.totTri} alpha=${h.alpha}`);
  console.log("  activeByPrefix:", JSON.stringify(j.activeByPrefix));
}
cleanup();
process.exit(0);
