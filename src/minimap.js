import { MINIMAP, BOAT, MAP, WATER } from "./config.js";
import { getUnits, biomeAt } from "./map.js";

// Top-down map drawn from the REAL island grid (same biomes/colours as
// design/map.svg), with the boat goal marker and live player/dino markers.
// Gated by the GPS pickup (game.js only calls update + shows the wrapper once
// the player has looted the device — the GPS IS the map).

// Minimap sea teal — tints["~"] is a pale wet-sand seabed, too washed-out for
// the open water read here.
const SEA = [0.10, 0.22, 0.28];

export function createMinimap() {
  const canvas = document.getElementById("minimap");
  if (!canvas) return { update() {} };
  const ctx = canvas.getContext("2d");
  const size = MINIMAP.size;
  canvas.width = size;
  canvas.height = size;

  // Built lazily on first update so the grid is guaranteed loaded. tf carries
  // the world->map transform (north / high-z at the TOP, matching the svg).
  let tf = null, base = null;

  function buildTransform() {
    const U = getUnits();
    const xMin = U.Xmin, xMax = U.Xmin + U.cols;
    const zTop = Math.max(U.Zmax, BOAT.position.z + 12);  // include the offshore boat
    const zBot = U.Zmax - U.rows;
    const wW = xMax - xMin, wH = zTop - zBot, pad = 5;
    const scale = Math.min((size - 2 * pad) / wW, (size - 2 * pad) / wH);
    const offX = (size - wW * scale) / 2, offY = (size - wH * scale) / 2;
    tf = {
      scale, offX, offY, xMin, zTop,
      toMap: (x, z) => [offX + (x - xMin) * scale, offY + (zTop - z) * scale],
    };
  }

  const tint = (code) => (code == null || code === "~") ? SEA : (MAP.tints[code] || MAP.tints.G);

  function buildBase() {
    const off = document.createElement("canvas");
    off.width = size; off.height = size;
    const octx = off.getContext("2d");
    const img = octx.createImageData(size, size);
    const d = img.data;
    // Sample the biome at each pixel's world position (one-time).
    for (let py = 0; py < size; py++) {
      const z = tf.zTop - (py - tf.offY) / tf.scale;
      for (let px = 0; px < size; px++) {
        const x = tf.xMin + (px - tf.offX) / tf.scale;
        const c = tint(biomeAt(x, z));
        const i = (py * size + px) * 4;
        d[i] = c[0] * 255; d[i + 1] = c[1] * 255; d[i + 2] = c[2] * 255; d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    // The inland pond is carved into a green biome (no own code) — paint it.
    const [wx, wy] = tf.toMap(WATER.centerX, WATER.centerZ);
    octx.beginPath();
    octx.arc(wx, wy, WATER.radius * tf.scale, 0, Math.PI * 2);
    octx.fillStyle = "rgba(40,95,125,0.9)";
    octx.fill();
    base = off;
  }

  function dot(x, z, color, r) {
    const [mx, my] = tf.toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    update(player, predators, herd, eggs, pickups, aquatic) {
      if (!tf) { buildTransform(); buildBase(); }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);

      // eggs (uncollected) — golden eggs larger/brighter
      if (eggs) for (const e of eggs.eggs) {
        if (e.collected) continue;
        dot(e.mesh.position.x, e.mesh.position.z, e.golden ? "#ffb31a" : "#ffd95a", e.golden ? 3 : 2);
      }
      // meat pickups
      if (pickups) for (const it of pickups.items) {
        if (it.active) dot(it.mesh.position.x, it.mesh.position.z, "#ff6b5a", 2);
      }
      // herd
      if (herd) for (const h of herd) {
        if (!h.dead) dot(h.dino.root.position.x, h.dino.root.position.z, h.fleeing ? "#8fd0ff" : "#7fc97f", 2.5);
      }
      // predators — green pulse = feeding (rush it); red = chasing; amber =
      // hunting the herd; dark red = patrolling.
      if (predators) for (const t of predators) {
        if (t.dead) continue;
        const p = t.dino.root.position;
        if (t.feeding > 0) dot(p.x, p.z, "#7be36a", 4 + 2 * (0.5 + 0.5 * Math.sin(performance.now() / 120)));
        else dot(p.x, p.z, t.prey ? "#ff9a3c" : t.mode === "chase" ? "#ff4d4d" : "#c0392b", 4);
      }
      // aquatic predator — hidden while submerged
      if (aquatic && !aquatic.dead && aquatic.mode !== "submerged") {
        const p = aquatic.root.position;
        dot(p.x, p.z, "#39e0d6", 4 + 2 * (0.5 + 0.5 * Math.sin(performance.now() / 110)));
      }

      // THE BOAT — the escape goal: a gold ringed marker.
      {
        const [bx, by] = tf.toMap(BOAT.position.x, BOAT.position.z);
        ctx.strokeStyle = "#ffd95a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#ffd95a";
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill();
      }

      // player with facing wedge (z is flipped on the map: world +z -> screen up)
      if (player) {
        const p = player.dino.root.position;
        const [px, py] = tf.toMap(p.x, p.z);
        const yaw = player.facing;
        const fx = Math.sin(yaw), fy = -Math.cos(yaw);
        const rx = -fy, ry = fx;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(px + fx * 6, py + fy * 6);
        ctx.lineTo(px - fx * 3.5 + rx * 3.5, py - fy * 3.5 + ry * 3.5);
        ctx.lineTo(px - fx * 3.5 - rx * 3.5, py - fy * 3.5 - ry * 3.5);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}
