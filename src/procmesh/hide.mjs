// Shared procedural DINOSAUR HIDE for glb-rendered species (smoothed glb + this).
// Gives a textured, colour-VARYING skin instead of one flat colour:
//   - a tiled polygonal pebbly SCALE albedo (per-scale tonal variation),
//   - a pebble-relief NORMAL map (catches light),
//   - per-vertex COUNTERSHADE (dark dorsal -> pale belly) + mottle, multiplied in
//     via useVertexColor — so hue varies top-to-bottom and patch-to-patch.
// Reads window.BABYLON-compatible B passed in. Texture is near-tonal (grey) so the
// vertex colour carries the hue; the two multiply to a varied scaly hide.

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Tonal pebbly-scale albedo (greyish; hue comes from the vertex countershade).
function makeScaleAlbedo(B, scene, scaleSize) {
  const SZ = 256;
  const tex = new B.DynamicTexture("hideAlbedo", { width: SZ, height: SZ }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#b4b0aa"; ctx.fillRect(0, 0, SZ, SZ);
  const cell = scaleSize;
  for (let row = 0; row * cell * 0.86 < SZ + cell; row++) {
    const off = (row & 1) * cell * 0.5;
    for (let col = 0; col * cell < SZ + cell; col++) {
      const cx = col * cell + off + (Math.random() - 0.5) * 4;
      const cy = row * cell * 0.86 + (Math.random() - 0.5) * 4;
      const g = 150 + (Math.random() * 60 - 20) | 0;   // per-scale tonal variation
      ctx.fillStyle = `rgb(${g},${g - 5},${g - 12})`;
      ctx.strokeStyle = "rgba(70,64,56,0.5)"; ctx.lineWidth = 1.3;
      ctx.beginPath();
      const sides = 5 + ((Math.random() * 2) | 0), r = cell * (0.42 + Math.random() * 0.12);
      for (let k = 0; k < sides; k++) {
        const a = (Math.PI * 2 / sides) * k + Math.random() * 0.3;
        const xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.86;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // a few broad mottled blotches for large-scale colour variation
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ, r = 24 + Math.random() * 36;
    const dark = Math.random() < 0.5;
    ctx.fillStyle = dark ? "rgba(60,56,50,0.10)" : "rgba(210,205,195,0.10)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  tex.update();
  return tex;
}

// Pebble-relief normal map (same cell scale as the albedo).
function makeScaleNormal(B, scene, scaleSize) {
  const SZ = 256;
  const tex = new B.DynamicTexture("hideNormal", { width: SZ, height: SZ }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#8080ff"; ctx.fillRect(0, 0, SZ, SZ);
  const cell = scaleSize;
  for (let row = 0; row * cell * 0.86 < SZ + cell; row++) {
    const off = (row & 1) * cell * 0.5;
    for (let col = 0; col * cell < SZ + cell; col++) {
      const cx = col * cell + off, cy = row * cell * 0.86;
      const grd = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, cell * 0.55);
      grd.addColorStop(0, "rgba(150,110,255,0.5)");
      grd.addColorStop(1, "rgba(70,150,255,0.4)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  tex.update();
  return tex;
}

/**
 * Build a hide PBR material. `opts.scaleSize` = scale cell px (smaller = finer
 * scales); `opts.uScale/vScale` tile density; `opts.rough` roughness.
 */
export function makeHideMaterial(B, scene, name, opts = {}) {
  const m = new B.PBRMaterial(name, scene);
  m.metallic = 0; m.roughness = opts.rough ?? 0.95;
  m.useVertexColor = true;
  m.albedoTexture = makeScaleAlbedo(B, scene, opts.scaleSize ?? 16);
  m.albedoTexture.uScale = opts.uScale ?? 10; m.albedoTexture.vScale = opts.vScale ?? 6;
  m.bumpTexture = makeScaleNormal(B, scene, opts.scaleSize ?? 16);
  m.bumpTexture.uScale = opts.uScale ?? 10; m.bumpTexture.vScale = opts.vScale ?? 6;
  m.bumpTexture.level = opts.bump ?? 0.7;
  return m;
}

/**
 * Paint per-vertex COUNTERSHADE on a mesh: dark dorsal -> pale belly by local Y,
 * plus a little mottle, so the hide colour varies across the body. `mid` is the
 * [r,g,b] hide colour; dorsal/belly are derived (or pass them explicitly).
 */
export function applyCountershade(B, mesh, mid, dorsalIn, bellyIn) {
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
  if (!pos) return mesh;
  const n = pos.length / 3;
  // Gradient runs along WORLD Y (the glb's local vertical axis is often NOT Y, so
  // local-Y countershading does nothing). Transform verts to world for the mapping.
  mesh.computeWorldMatrix(true);
  const wm = mesh.getWorldMatrix();
  const wy = new Float32Array(n);
  const tmp = new B.Vector3();
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    B.Vector3.TransformCoordinatesFromFloatsToRef(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], wm, tmp);
    wy[i] = tmp.y; if (tmp.y < yMin) yMin = tmp.y; if (tmp.y > yMax) yMax = tmp.y;
  }
  const span = Math.max(1e-4, yMax - yMin);
  // strong-ish countershade so the variation reads (belly clearly paler, back darker)
  const dorsal = dorsalIn || [mid[0] * 0.58, mid[1] * 0.58, mid[2] * 0.54];
  const belly = bellyIn || [clamp01(mid[0] * 1.7 + 0.06), clamp01(mid[1] * 1.66 + 0.06), clamp01(mid[2] * 1.6 + 0.05)];
  const cols = new Array(n * 4);
  for (let i = 0; i < n; i++) {
    let t = clamp01((wy[i] - yMin) / span);
    t = t * t * (3 - 2 * t);
    let r, g, b;
    if (t < 0.5) { const k = t / 0.5; r = belly[0] + (mid[0] - belly[0]) * k; g = belly[1] + (mid[1] - belly[1]) * k; b = belly[2] + (mid[2] - belly[2]) * k; }
    else { const k = (t - 0.5) / 0.5; r = mid[0] + (dorsal[0] - mid[0]) * k; g = mid[1] + (dorsal[1] - mid[1]) * k; b = mid[2] + (dorsal[2] - mid[2]) * k; }
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const hh = Math.sin(x * 11.3 + z * 7.1 + y * 5.7) * 43758.5453;
    const mott = (hh - Math.floor(hh) - 0.5) * 0.14; // patchy blotching
    cols[i * 4] = clamp01(r + mott); cols[i * 4 + 1] = clamp01(g + mott); cols[i * 4 + 2] = clamp01(b + mott); cols[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(B.VertexBuffer.ColorKind, cols);
  mesh.useVertexColors = true;
  return mesh;
}
