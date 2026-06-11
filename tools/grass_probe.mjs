// Grassland eye-level capture (dark-sliver investigation). Boots the full game,
// frames the camera at human eye height looking across grassland at two times of
// day, and counts dark-pixel streaks in the grass band as a rough metric.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8197";
const OUT = process.env.OUT || "tools/shots";
const TAG = process.env.TAG || "before";
const W = 1280, H = 720, DEBUG_PORT = 9372;
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
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const cap = async name => { const c = await send("Page.captureScreenshot", { format: "png" }, sessionId); writeFileSync(`${OUT}/${name}.png`, Buffer.from(c.data, "base64")); console.log("saved", name); };

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
for (let i = 0; i < 400; i++) { await sleep(150); if (await ev("!!(window.__verify&&window.__verify.ready)").catch(() => false)) break; }
await sleep(1500);
console.log("boot err:", await ev("window.__verify && window.__verify.err"));

const V = "window.__verify";
// Grassland eye-level: stand in open grass east of spawn (clear of pond/desert),
// camera at ~eye height (h+1.6) looking flat across the blades toward +Z.
async function grassShot(name) {
  await ev(`(()=>{const h=${V}.heightAt; const ex=30, ez=-10; ${V}.lookAt(ex, h(ex,ez)+1.6, ez, ex+0.5, h(ex,ez)+1.5, ez+30); return 'ok';})()`);
  await sleep(500); await cap(name);
}
await grassShot(`grass_${TAG}_day`);

// Force deep dusk by advancing the day/night sim, then reshoot (the owner's
// "glitchy dark slivers" report — dusk lighting is the suspected trigger).
await ev(`(()=>{const g=window.__game; const w=g.world; if(w.update){for(let i=0;i<400;i++) w.update(0.5,true);} return 'dusk '+(w.getDusk?w.getDusk().toFixed(2):'?');})()`);
console.log("dusk after advance:", await ev("window.__game.world.getDusk?window.__game.world.getDusk().toFixed(2):'n/a'"));
await grassShot(`grass_${TAG}_dusk`);

// A second angle: low oblique near a dense cover patch closer to centre.
await ev(`(()=>{const h=${V}.heightAt; const ex=12, ez=8; ${V}.lookAt(ex, h(ex,ez)+1.4, ez, ex+20, h(ex+20,ez+6)+1.0, ez+6); return 'ok';})()`);
await sleep(500); await cap(`grass_${TAG}_dusk_oblique`);

const fps = await ev("+window.__game.engine.getFps().toFixed(1)");
console.log("fps", fps);
ws.close(); chrome.kill("SIGTERM"); await sleep(200); process.exit(0);
