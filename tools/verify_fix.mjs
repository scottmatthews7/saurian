// Post-fix verification: (a) long traverse spawn->each biome->coast, no stall;
// (b) obstacles (trees/rocks/mesas) STILL block the player; (c) T-Rex lifesize
// bbox beside the human; (d) 0 console errors + fps. Drives a player-identical
// collider (ground now has checkCollisions=false; obstacles keep theirs).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
const CHROME = `${homedir()}/.cache/puppeteer/chrome-headless-shell/mac_arm-140.0.7339.82/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = process.env.PORT || "8197";
const W = 1280, H = 720, DEBUG_PORT = 9381;
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
const consoleErrs = [];
ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") consoleErrs.push((m.params.args || []).map(a => a.value || a.description).join(" ")); if (m.method === "Runtime.exceptionThrown") consoleErrs.push("EXC:" + (m.params?.exceptionDetails?.exception?.description || "")); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/tools/world_verify.html` }, sessionId);
for (let i = 0; i < 400; i++) { await sleep(150); if (await ev("!!(window.__verify&&window.__verify.ready)").catch(() => false)) break; }
await sleep(1200);
console.log("boot err:", await ev("window.__verify && window.__verify.err"));

const out = await ev(`(()=>{
  const g=window.__game,B=window.BABYLON,s=g.scene,h=g.world.heightAt;
  const P={radius:1.1,height:2.0,gravity:-22,walk:7};
  const col=B.MeshBuilder.CreateBox("vf",{size:0.1},s);
  col.isVisible=false;col.checkCollisions=true;
  col.ellipsoid=new B.Vector3(P.radius,P.height/2,P.radius);
  col.ellipsoidOffset=new B.Vector3(0,P.height/2,0);
  // Drive toward a target waypoint; return path stalls (terrain walls) — a stall
  // mid-open-grass is a bug; near an obstacle/water is legitimate.
  function driveTo(sx,sz,tx,tz){
    col.position.set(sx,h(sx,sz),sz);let velY=0;const dt=1/60;let stalls=0,steps=0;
    for(let i=0;i<6000;i++){steps++;
      let dx=tx-col.position.x,dz=tz-col.position.z;const dist=Math.hypot(dx,dz);
      if(dist<1.5)break;dx/=dist;dz/=dist;velY+=P.gravity*dt;
      const b={x:col.position.x,z:col.position.z};
      col.moveWithCollisions(new B.Vector3(dx*P.walk*dt,velY*dt,dz*P.walk*dt));
      const floor=h(col.position.x,col.position.z);
      if(col.position.y<=floor+0.05){col.position.y=floor;velY=0;}
      const rd=Math.hypot(col.position.x,col.position.z);
      if(rd>176){const k=176/rd;col.position.x*=k;col.position.z*=k;}
      if(Math.hypot(col.position.x-b.x,col.position.z-b.z)<P.walk*dt*0.5)stalls++;
    }
    return{end:{x:+col.position.x.toFixed(1),z:+col.position.z.toFixed(1)},
      reached:Math.hypot(tx-col.position.x,tz-col.position.z)<3,stalls,steps};
  }
  // Full tour: spawn -> jungle N -> back through plains -> pond W edge -> desert SW
  //   -> across to the east coast beach. Stop short of pond/ocean water centres.
  const tour={};
  tour.jungle = driveTo(0,0, 12,110);
  tour.plains = driveTo(12,110, 0,0);
  tour.pondEdge = driveTo(0,0, -55,40);     // approach pond, stop at the shallows
  tour.desert  = driveTo(-55,40, -70,-118); // into the desert SW
  tour.coast   = driveTo(-70,-118, 110,-10);// long diagonal to the east beach
  tour.coastN  = driveTo(110,-10, 110,90);  // along the shore north

  // OBSTACLE check: find a tree/rock with checkCollisions, walk straight at it,
  // confirm the collider is STOPPED short (doesn't pass through).
  let obs=null;
  for(const m of s.meshes){const src=m.sourceMesh||m;
    if(src&&src.checkCollisions&&/trunk|rock/.test(m.name)&&m.position){obs={x:m.position.x,z:m.position.z,name:m.name};break;}}
  let obsResult='no obstacle found';
  if(obs){const ang=Math.atan2(obs.z,obs.x);const sx=obs.x-Math.cos(ang)*8,sz=obs.z-Math.sin(ang)*8;
    const r=driveTo(sx,sz,obs.x,obs.z);
    const gap=Math.hypot(obs.x-col.position.x,obs.z-col.position.z);
    obsResult={obs:obs.name,stoppedGap:+gap.toFixed(2),blocked:gap>1.0&&!r.reached};}
  col.dispose();
  return JSON.stringify({tour,obsResult},null,0);
})()`);
console.log("\n=== TOUR + OBSTACLE ===\n" + out);

const trex = await ev(`(()=>{const g=window.__game,B=window.BABYLON;
  const rex=g.predators.find(p=>p.kind==='trex'&&!p.dead);if(!rex)return'no rex';
  const bb=(n)=>{let mn=new B.Vector3(1e9,1e9,1e9),mx=new B.Vector3(-1e9,-1e9,-1e9);
    n.getChildMeshes(false).forEach(m=>{if(!m.getBoundingInfo||m.getTotalVertices()===0||!m.isEnabled())return;
    m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;mn=B.Vector3.Minimize(mn,b.minimumWorld);mx=B.Vector3.Maximize(mx,b.maximumWorld);});
    return{len:+Math.max(mx.x-mn.x,mx.z-mn.z).toFixed(2),wid:+Math.min(mx.x-mn.x,mx.z-mn.z).toFixed(2),hgt:+(mx.y-mn.y).toFixed(2)};};
  return JSON.stringify({trex:bb(rex.dino.root),human:bb(g.player.dino.root),scale:+rex.dino.scale.toFixed(4),
    trex_m:{len:+(Math.max(...[bb(rex.dino.root).len])*0.9).toFixed(1),hgt:+(bb(rex.dino.root).hgt*0.9).toFixed(1)}});
})()`);
console.log("\n=== TREX LIFESIZE ===\n" + trex);
const fps = await ev("+window.__game.engine.getFps().toFixed(1)");
console.log("\nfps", fps, "| consoleErrors", consoleErrs.length, consoleErrs.slice(0,5));
ws.close(); chrome.kill("SIGTERM"); await sleep(200); process.exit(0);
