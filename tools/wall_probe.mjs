// Diagnostic: locate the invisible wall + measure terrain gradients + T-Rex bbox.
// Boots the full game (world_verify.html), then in-page:
//  (1) samples heightAt on a grid to find steep cells (cliffs => invisible walls)
//  (2) builds a player-identical collider and drives moveWithCollisions across
//      several traverses, logging where forward input yields ~0 progress
//  (3) measures the live T-Rex bbox (length + height) next to the human.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8197";
const W = 1280, H = 720, DEBUG_PORT = 9371;
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
await send("Runtime.enable", {}, sessionId);
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
for (let i = 0; i < 400; i++) { await sleep(150); if (await ev("!!(window.__verify&&window.__verify.ready)").catch(() => false)) break; }
await sleep(1200);
console.log("boot err:", await ev("window.__verify && window.__verify.err"));

// (1) + (2): gradient grid + collider traverses
const result = await ev(`(()=>{
  const g = window.__game, B = window.BABYLON, scene = g.scene;
  const h = g.world.heightAt;
  const R = 178;

  // --- gradient grid: max abs height delta to a neighbour, step 2u ---
  const step = 2, ramp = 1.1; // ramp = PLAYER.radius (collider footprint)
  let worst = [];
  for (let x = -R; x <= R; x += step) {
    for (let z = -R; z <= R; z += step) {
      if (Math.hypot(x,z) > R) continue;
      const c = h(x,z);
      const ds = [h(x+step,z), h(x-step,z), h(x,z+step), h(x,z-step)];
      let md = 0; for (const v of ds) md = Math.max(md, Math.abs(v-c));
      if (md > 1.5) worst.push({x,z,c:+c.toFixed(2),slope:+(md/step).toFixed(2),drop:+md.toFixed(2)});
    }
  }
  worst.sort((a,b)=>b.drop-a.drop);

  // --- collider traverse: replicate the player's collider exactly ---
  const P = { radius: 1.1, height: 2.0 };
  function makeCollider(){
    const c = B.MeshBuilder.CreateBox("probe", { size: 0.1 }, scene);
    c.isVisible = false; c.checkCollisions = true;
    c.ellipsoid = new B.Vector3(P.radius, P.height/2, P.radius);
    c.ellipsoidOffset = new B.Vector3(0, P.height/2, 0);
    return c;
  }
  const col = makeCollider();
  // drive: from (sx,sz) heading (dx,dz) unit, walkSpeed 7, dt 1/60, N steps.
  // each step: snap y to ground floor (as player does), then moveWithCollisions
  // horizontally; record progress along heading.
  function traverse(sx, sz, dx, dz, steps){
    col.position.set(sx, h(sx,sz), sz);
    const speed = 7, dt = 1/60;
    let stalls = [];
    let prevProg = 0;
    for (let i=0;i<steps;i++){
      // ground snap like player (grounded path)
      col.position.y = h(col.position.x, col.position.z);
      const disp = new B.Vector3(dx*speed*dt, 0, dz*speed*dt);
      const before = { x: col.position.x, z: col.position.z };
      col.moveWithCollisions(disp);
      const moved = Math.hypot(col.position.x-before.x, col.position.z-before.z);
      const want = speed*dt;
      if (moved < want*0.4) {
        stalls.push({ x:+col.position.x.toFixed(1), z:+col.position.z.toFixed(1),
          moved:+moved.toFixed(3), want:+want.toFixed(3), gy:+h(col.position.x,col.position.z).toFixed(2) });
      }
    }
    return { end:{x:+col.position.x.toFixed(1),z:+col.position.z.toFixed(1)},
             dist:+Math.hypot(col.position.x-sx, col.position.z-sz).toFixed(1),
             stallCount: stalls.length, firstStalls: stalls.slice(0,3) };
  }

  const runs = {};
  // spawn drives in 4 dirs (long)
  runs["spawn+X"] = traverse(0,0, 1,0, 3000);
  runs["spawn-X"] = traverse(0,0, -1,0, 3000);
  runs["spawn+Z"] = traverse(0,0, 0,1, 3000);
  runs["spawn-Z"] = traverse(0,0, 0,-1, 3000);
  // toward each biome
  runs["toJungleN"] = traverse(0,0, 0.08,0.997, 3000);   // jungle ~(10,120)
  runs["toPondW"]   = traverse(0,0, -0.81,0.58, 2500);    // pond ~(-78,56)
  runs["toDesertSW"]= traverse(0,0, -0.5,-0.86, 3000);    // desert ~(-70,-120)
  runs["toCoastE"]  = traverse(0,0, 1,0, 3000);           // ocean east x>120
  // desert internal traverse (drive across the dunes both ways)
  runs["desertScanX"] = traverse(-110,-120, 1,0, 2500);
  runs["desertScanZ"] = traverse(-70,-160, 0,1, 2500);
  // coast approach close-up
  runs["beachApproach"] = traverse(95,0, 1,0, 1500);

  col.dispose();
  return JSON.stringify({ worstGradients: worst.slice(0,25), runs });
})()`);
console.log("\n=== GRADIENT + TRAVERSE ===\n" + result);

// (3) T-Rex bbox vs human
const trex = await ev(`(()=>{
  const g = window.__game, B = window.BABYLON;
  const rex = g.predators.find(p=>p.kind==='trex'&&!p.dead);
  if(!rex) return 'no rex';
  const bb=(node)=>{let mn=new B.Vector3(1e9,1e9,1e9),mx=new B.Vector3(-1e9,-1e9,-1e9);
    node.getChildMeshes(false).forEach(m=>{if(!m.getBoundingInfo||m.getTotalVertices()===0||!m.isEnabled())return;
    m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;
    mn=B.Vector3.Minimize(mn,b.minimumWorld);mx=B.Vector3.Maximize(mx,b.maximumWorld);});
    return {len:+(Math.max(mx.x-mn.x,mx.z-mn.z)).toFixed(2),
            wid:+(Math.min(mx.x-mn.x,mx.z-mn.z)).toFixed(2),
            hgt:+(mx.y-mn.y).toFixed(2)};};
  return JSON.stringify({ trex: bb(rex.dino.root), human: bb(g.player.dino.root),
    trexScale:+rex.dino.scale.toFixed(4) });
})()`);
console.log("\n=== TREX BBOX ===\n" + trex);

const fps = await ev("+window.__game.engine.getFps().toFixed(1)");
console.log("\nfps", fps);
ws.close(); chrome.kill("SIGTERM"); await sleep(200); process.exit(0);
