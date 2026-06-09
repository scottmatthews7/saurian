import { ARENA, MINIMAP } from "./config.js";

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
    update(player, predators, herd, eggs) {
      ctx.clearRect(0, 0, size, size);

      // arena disc
      ctx.beginPath();
      ctx.arc(c, c, mapR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20,40,30,0.55)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

      // nest ring at centre
      ctx.beginPath();
      ctx.arc(c, c, 5 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,205,88,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // eggs (uncollected)
      if (eggs) {
        for (const e of eggs.eggs) {
          if (e.collected || e.banked) continue;
          dot(e.mesh.position.x, e.mesh.position.z, "#ffd95a", 2.5);
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
          dot(p.x, p.z, t.mode === "chase" ? "#ff4d4d" : "#c0392b", 4);
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
