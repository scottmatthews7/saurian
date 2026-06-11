/** Procedural PBR skin textures for foundry creatures (deterministic, no assets). */

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintHexScales(ctx, w, h, rng, { base, dark, light, scalePx = 14 }) {
  const rows = Math.ceil(h / (scalePx * 0.86)) + 2;
  const cols = Math.ceil(w / scalePx) + 2;
  for (let row = 0; row < rows; row++) {
    const off = (row & 1) * (scalePx * 0.5);
    for (let col = 0; col < cols; col++) {
      const cx = col * scalePx + off;
      const cy = row * scalePx * 0.86;
      const t = rng();
      const fill = t < 0.35 ? dark : t < 0.72 ? base : light;
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 6;
        const px = cx + Math.cos(a) * scalePx * 0.48;
        const py = cy + Math.sin(a) * scalePx * 0.42;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      if (rng() < 0.22) {
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + rng() * 0.12})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }
}

function paintFeatherBarbs(ctx, w, h, rng, { c1, c2, c3 }) {
  for (let i = 0; i < 4200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 6 + rng() * 22;
    const ang = -0.4 + rng() * 0.25;
    const pick = rng();
    ctx.strokeStyle = pick < 0.4 ? c1 : pick < 0.75 ? c2 : c3;
    ctx.globalAlpha = 0.12 + rng() * 0.18;
    ctx.lineWidth = 0.6 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintLeatherGrain(ctx, w, h, rng) {
  for (let i = 0; i < 1800; i++) {
    const x = rng() * w, y = rng() * h;
    const rw = 8 + rng() * 28, rh = 3 + rng() * 10;
    ctx.fillStyle = `rgba(${40 + (rng() * 30) | 0},${36 + (rng() * 24) | 0},${32 + (rng() * 20) | 0},${0.04 + rng() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildBump(scene, B, name, rng, strength = 2.0) {
  const SZ = 256;
  const tex = new B.DynamicTexture(name, { width: SZ, height: SZ }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, SZ, SZ);
  for (let i = 0; i < 900; i++) {
    const x = rng() * SZ, y = rng() * SZ, r = 2 + rng() * 6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(128,128,128,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const img = ctx.getImageData(0, 0, SZ, SZ);
  const hAt = (x, y) => img.data[((((y % SZ) + SZ) % SZ) * SZ + (((x % SZ) + SZ) % SZ)) * 4];
  const out = ctx.createImageData(SZ, SZ);
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      const dx = ((hAt(x + 1, y) - hAt(x - 1, y)) / 255) * strength;
      const dy = ((hAt(x, y + 1) - hAt(x, y - 1)) / 255) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * SZ + x) * 4;
      out.data[o] = (-dx * inv * 0.5 + 0.5) * 255;
      out.data[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  tex.update(false);
  return tex;
}

/** Swamp crocodilian — bronze flanks, teal-black dorsal, cream belly, wet sheen. */
export function applySpinoHide(scene, B, mat, seed = 42) {
  const rng = makeRng(seed);
  const tex = new B.DynamicTexture("spinoHideTex", { width: 1024, height: 1024 }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#2a3828";
  ctx.fillRect(0, 0, 1024, 1024);

  paintHexScales(ctx, 1024, 1024, rng, {
    base: "#3d4f36",
    dark: "#1e2a1a",
    light: "#5a6b48",
    scalePx: 20,
  });

  for (let i = 0; i < 90; i++) {
    const x = rng() * 1024, y = rng() * 520;
    const rw = 40 + rng() * 120, rh = 18 + rng() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rw, rh));
    g.addColorStop(0, `rgba(${80 + (rng() * 40) | 0},${55 + (rng() * 30) | 0},${28 + (rng() * 20) | 0},0.35)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, rw, rh, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }

  for (let i = 0; i < 55; i++) {
    const y0 = 120 + rng() * 780;
    ctx.strokeStyle = `rgba(${120 + (rng() * 50) | 0},${90 + (rng() * 40) | 0},${45 + (rng() * 25) | 0},${0.12 + rng() * 0.15})`;
    ctx.lineWidth = 3 + rng() * 8;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= 1024; x += 64) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.02 + i) * (8 + rng() * 12));
    }
    ctx.stroke();
  }

  const grd = ctx.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, "rgba(12,28,32,0.55)");
  grd.addColorStop(0.22, "rgba(18,40,36,0.18)");
  grd.addColorStop(0.55, "rgba(0,0,0,0)");
  grd.addColorStop(0.82, "rgba(120,110,82,0.12)");
  grd.addColorStop(1, "rgba(210,198,160,0.28)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 1024, 1024);

  tex.update();
  mat.albedoTexture = tex;
  mat.albedoColor = new B.Color3(0.92, 0.94, 0.88);
  mat.metallic = 0;
  mat.roughness = 0.42;
  mat.bumpTexture = buildBump(scene, B, "spinoBump", makeRng(seed + 1), 2.4);
  mat.bumpTexture.level = 0.85;
}

/** Shaggy herbivore — cinnamon, ochre, chocolate mantle, barb streaks. */
export function applyTheriHide(scene, B, mat, seed = 77) {
  const rng = makeRng(seed);
  const tex = new B.DynamicTexture("theriHideTex", { width: 1024, height: 1024 }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#7a5834";
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 650; i++) {
    const x = rng() * 1024, y = rng() * 1024, r = 14 + rng() * 70;
    const warm = rng() < 0.55;
    ctx.fillStyle = warm
      ? `rgba(${110 + (rng() * 40) | 0},${78 + (rng() * 30) | 0},${42 + (rng() * 20) | 0},0.22)`
      : `rgba(${52 + (rng() * 25) | 0},${38 + (rng() * 18) | 0},${24 + (rng() * 12) | 0},0.20)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  paintFeatherBarbs(ctx, 1024, 1024, rng, {
    c1: "rgba(92,62,34,0.9)",
    c2: "rgba(148,108,58,0.85)",
    c3: "rgba(196,158,96,0.75)",
  });

  for (let i = 0; i < 40; i++) {
    const x = rng() * 1024;
    const g = ctx.createLinearGradient(x - 60, 0, x + 60, 1024);
    g.addColorStop(0, "rgba(38,26,14,0.0)");
    g.addColorStop(0.35, `rgba(58,40,22,${0.08 + rng() * 0.12})`);
    g.addColorStop(0.65, "rgba(38,26,14,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, 0, 120, 1024);
  }

  const grd = ctx.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, "rgba(32,20,10,0.50)");
  grd.addColorStop(0.35, "rgba(32,20,10,0.08)");
  grd.addColorStop(0.7, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(220,196,150,0.22)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 1024, 1024);

  tex.update();
  mat.albedoTexture = tex;
  mat.albedoColor = new B.Color3(1.0, 0.96, 0.9);
  mat.metallic = 0;
  mat.roughness = 0.82;
  mat.bumpTexture = buildBump(scene, B, "theriBump", makeRng(seed + 3), 1.6);
  mat.bumpTexture.level = 0.55;
}

export function applyTheriCoat(scene, B, mat, seed = 88) {
  const rng = makeRng(seed);
  const tex = new B.DynamicTexture("theriCoatTex", { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#3d2a18";
  ctx.fillRect(0, 0, 512, 512);
  paintFeatherBarbs(ctx, 512, 512, rng, {
    c1: "rgba(28,18,10,0.95)",
    c2: "rgba(48,32,18,0.9)",
    c3: "rgba(68,48,28,0.85)",
  });
  tex.update();
  mat.albedoTexture = tex;
  mat.albedoColor = new B.Color3(0.85, 0.78, 0.68);
  mat.roughness = 0.98;
}

/** Plesiosaur — wet countershaded hide: slate-teal dorsal, pale green-grey
 *  ventral. The loft UV seam sits at the belly (u=0 and u=1), with the dorsal
 *  ridge at u=0.5, so countershading is a horizontal gradient across the width:
 *  pale at the edges (belly), dark in the middle (back). Subtle scale noise, no
 *  bold markings (open-water camo), low roughness for a wet sheen. */
export function applyPlesiosaurHide(scene, B, mat, seed = 53) {
  const rng = makeRng(seed);
  const W = 1024, H = 1024;
  const tex = new B.DynamicTexture("plesioHideTex", { width: W, height: H }, scene, false);
  const ctx = tex.getContext();

  // base mid slate-teal
  ctx.fillStyle = "#33453f";
  ctx.fillRect(0, 0, W, H);

  // fine scale mottle (subtle — no stripes/spots per PRD)
  paintHexScales(ctx, W, H, rng, {
    base: "#36473f", dark: "#283833", light: "#46594f", scalePx: 13,
  });

  // soft dappled lighting variation along the back
  for (let i = 0; i < 70; i++) {
    const x = rng() * W, y = rng() * H;
    const r = 30 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${30 + (rng() * 24) | 0},${52 + (rng() * 24) | 0},${46 + (rng() * 20) | 0},0.22)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }

  // countershading across the WIDTH (u): pale belly at edges, dark dorsal centre
  const cs = ctx.createLinearGradient(0, 0, W, 0);
  cs.addColorStop(0.0, "rgba(176,192,180,0.85)");   // belly seam (pale)
  cs.addColorStop(0.16, "rgba(138,154,144,0.45)");
  cs.addColorStop(0.34, "rgba(40,58,52,0.10)");
  cs.addColorStop(0.5, "rgba(20,34,30,0.55)");      // dorsal ridge (dark)
  cs.addColorStop(0.66, "rgba(40,58,52,0.10)");
  cs.addColorStop(0.84, "rgba(138,154,144,0.45)");
  cs.addColorStop(1.0, "rgba(176,192,180,0.85)");   // belly seam (pale)
  ctx.fillStyle = cs;
  ctx.fillRect(0, 0, W, H);

  tex.update();
  mat.albedoTexture = tex;
  mat.albedoColor = new B.Color3(1, 1, 1);
  mat.metallic = 0;
  mat.roughness = 0.34;            // wet sheen
  mat.bumpTexture = buildBump(scene, B, "plesioBump", makeRng(seed + 2), 1.4);
  mat.bumpTexture.level = 0.4;
}

/** Pterosaur — sandy leather overlay (multiplies with vertex colours). */
export function applyPterosaurSkinOverlay(scene, B, mat, seed = 19) {
  const rng = makeRng(seed);
  const tex = new B.DynamicTexture("quetzSkinTex", { width: 1024, height: 1024 }, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "#c8b89a";
  ctx.fillRect(0, 0, 1024, 1024);
  paintLeatherGrain(ctx, 1024, 1024, rng);
  paintHexScales(ctx, 1024, 1024, rng, {
    base: "#b8a888",
    dark: "#968872",
    light: "#ddd0b8",
    scalePx: 11,
  });
  for (let i = 0; i < 1200; i++) {
    const x = rng() * 1024, y = rng() * 1024;
    ctx.fillStyle = `rgba(255,248,230,${0.02 + rng() * 0.05})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  tex.update();
  mat.albedoTexture = tex;
  mat.albedoColor = new B.Color3(1, 1, 1);
  mat.roughness = 0.72;
  mat.bumpTexture = buildBump(scene, B, "quetzBump", makeRng(seed + 4), 1.8);
  mat.bumpTexture.level = 0.45;
}
