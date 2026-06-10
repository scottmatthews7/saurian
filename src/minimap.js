import { ARENA, MINIMAP, WATER, BEACONS } from "./config.js";

// Top-down radar drawn on a 2D canvas overlay. Shows the arena disc, the
// player (with facing wedge), the T-Rex, the herd, eggs, and the nest.

export function createMinimap() {
  const canvas = document.getElementById("minimap");
  if (!canvas) return { update() {} };
  const ctx = canvas.getContext("2d");
  const size = MINIMAP.size;
  canvas.width = size;
  canvas.height = size;
  const c = size / 2;
  // world radius (incl. a little margin) maps to map radius
  const mapR = c - 6;
  const scale = mapR / ARENA.radius;
  const toMap = (x, z) => [c + x * scale, c + z * scale];

  function dot(x, z, color, r) {
    const [mx, my] = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    update(player, predators, herd, eggs, pickups, beacons) {
      ctx.clearRect(0, 0, size, size);

      // arena disc
      ctx.beginPath();
      ctx.arc(c, c, mapR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20,40,30,0.55)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

      // water pond
      {
        const [wx, wy] = toMap(WATER.centerX, WATER.centerZ);
        ctx.beginPath();
        ctx.arc(wx, wy, WATER.radius * scale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(40,110,150,0.6)";
        ctx.fill();
      }

      // nest ring at centre
      ctx.beginPath();
      ctx.arc(c, c, 5 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,205,88,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // ward beacons — a lit beacon shows its ward radius ring + a bright dot;
      // an unlit one is a dim hollow marker to seek out.
      if (beacons) {
        const wardR = beacons.wardRadiusNow || BEACONS.wardRadius;
        for (const b of beacons.beacons) {
          const [bx, by] = toMap(b.x, b.z);
          if (b.lit) {
            // Ward ring + dot fade with remaining fuel so a guttering beacon reads.
            const frac = Math.max(0.15, b.fuel / BEACONS.burnSeconds);
            ctx.beginPath();
            ctx.arc(bx, by, wardR * scale, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,170,60,${(0.18 * frac).toFixed(3)})`;
            ctx.fill();
            dot(b.x, b.z, frac < BEACONS.lowFuelFrac ? "#aa8855" : "#ffb347", 3.5);
          } else {
            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,180,90,0.7)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // eggs (uncollected) — golden eggs render larger and brighter
      if (eggs) {
        for (const e of eggs.eggs) {
          if (e.collected || e.banked) continue;
          if (e.cursed) dot(e.mesh.position.x, e.mesh.position.z, "#c14dff", 4);
          else if (e.golden) dot(e.mesh.position.x, e.mesh.position.z, "#ffb31a", 4);
          else dot(e.mesh.position.x, e.mesh.position.z, "#ffd95a", 2.5);
        }
      }

      // meat pickups
      if (pickups) {
        for (const it of pickups.items) {
          if (!it.active) continue;
          dot(it.mesh.position.x, it.mesh.position.z, "#ff6b5a", 2.5);
        }
      }

      // herd
      if (herd) {
        for (const h of herd) {
          if (h.dead) continue;
          const p = h.dino.root.position;
          dot(p.x, p.z, h.fleeing ? "#8fd0ff" : "#7fc97f", 2.5);
        }
      }

      // predators (one or more T-Rexes)
      if (predators) {
        for (const t of predators) {
          if (t.dead) continue;
          const p = t.dino.root.position;
          // Red = chasing YOU; amber = distracted hunting the herd (exploit it);
          // dark red = patrolling.
          const col = t.prey ? "#ff9a3c" : t.mode === "chase" ? "#ff4d4d" : "#c0392b";
          dot(p.x, p.z, col, 4);
        }
      }

      // player with facing wedge
      if (player) {
        const p = player.dino.root.position;
        const [px, py] = toMap(p.x, p.z);
        const yaw = player.facing;
        // world forward for yaw is (sin yaw, cos yaw); map x<-worldX, y<-worldZ.
        const fx = Math.sin(yaw), fy = Math.cos(yaw);
        const rx = fy, ry = -fx; // perpendicular (right)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(px + fx * 7, py + fy * 7);          // nose
        ctx.lineTo(px - fx * 4 + rx * 4, py - fy * 4 + ry * 4);
        ctx.lineTo(px - fx * 4 - rx * 4, py - fy * 4 - ry * 4);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}
