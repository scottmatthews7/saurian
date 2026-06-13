// Drive tools/biome_shots.html headless: build each biome vignette from the real
// asset glbs, capture bird's-eye + ground + angle shots per biome.
// Usage: node tools/biome_shots.mjs   (spawns its own static server + chrome shell)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = "8195", DEBUG_PORT = 9347, OUT = "tools/shots/biomes";
const W = 1280, H = 720;

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) { console.error("chrome-headless-shell missing at", CHROME); process.exit(1); }

const server = spawn("python3", ["-m", "http.server", PORT], { stdio: "ignore" });
const chrome = spawn(CHROME, [
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
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      const j = await r.json();
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
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params, sessionId })); });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};
const cap = async (name) => {
  const c = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(c.data, "base64"));
  console.log(`[shot] ${OUT}/${name}.png`);
};

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/biome_shots.html` }, sessionId);
let biomes = null;
for (let i = 0; i < 100 && !biomes; i++) {   // babylon.js is ~8 MB; poll until the page script has run
  await sleep(300);
  biomes = await evalJs("window.__stage ? window.__stage.biomes : null").catch(() => null);
}
if (!biomes) {
  const probe = await evalJs("JSON.stringify({babylon: typeof BABYLON, stage: typeof window.__stage, url: location.href, body: document.body ? document.body.innerHTML.length : -1})").catch((e) => String(e));
  console.error("stage page failed to boot", probe, consoleErrors.slice(0, 5));
  cleanup(); process.exit(1);
}

// [name, camera args] — px,py,pz -> tx,ty,tz; per-biome overrides where the default framing fails
const VIEWS = [
  ["birdseye", [0, 95, -0.1, 0, 0, 0]],
  ["ground", [2, 2.4, -30, 0, 4, 0]],
  ["angle", [28, 14, -28, 0, 3, 0]],
];
const VIEW_OVERRIDES = {
  thickjungle: { ground: [0, 2.4, -43, 0, 9, 5], angle: [30, 18, -38, 0, 8, 0] },
  clearing: { birdseye: [0, 55, -0.1, 0, 0, 0], ground: [14, 2, -12, 6, 1, 4], angle: [-12, 2.5, 8, 8, 2, 2] },
  muddypath: { ground: [0, 2, -32, 0, 3, 20] },
  beach: { ground: [0, 3, -8, 0, 1, 22], angle: [0, 8, -2, 0, 0.5, 26] },   // straight-on: waterline horizontal, slope faces the sea
  rockypass: { ground: [0, 3, -34, 0, 11, 20], angle: [0, 30, -55, 0, 12, 20] },
  forest: { ground: [0, 2.2, -42, 0, 6, 0], angle: [30, 16, -36, 0, 7, 0] },
};

for (const biome of biomes) {
  const t0 = Date.now();
  const okBuild = await evalJs(`window.__stage.build(${JSON.stringify(biome)})`);
  if (!okBuild) { console.error(`[${biome}] BUILD FAILED:`, await evalJs("window.__stage.err")); continue; }
  console.log(`[${biome}] built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sleep(800);
  for (const [view, defArgs] of VIEWS) {
    const args = (VIEW_OVERRIDES[biome] || {})[view] || defArgs;
    await evalJs(`window.__stage.lookAt(${args.join(",")})`);
    await sleep(450);
    await cap(`${biome}_${view}`);
  }
}
if (consoleErrors.length) console.error(`console errors (${consoleErrors.length}):\n` + consoleErrors.slice(0, 10).join("\n"));
else console.log("no console errors");
cleanup();
process.exit(0);
