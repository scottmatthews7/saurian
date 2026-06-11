// Procedural feathered Velociraptor mongoliensis built from swept/lofted surfaces.
//
// Build spec: procgen/PRD-velociraptor.md (index: procgen/BUILD_SPECS.md)
//
// Contract (see procgen/harness.html): export buildCreature(scene), read
// window.BABYLON (a global; do NOT import it), build the creature centred near
// the origin with feet at about y=0, facing +Z, parent everything under one
// root, and return that root. The harness owns camera, lights, ground, shadows.
//
// Build strategy — the anti-Michelin-man approach (same as trex.js): every
// fleshy mass is ONE continuous lofted surface swept along a Catmull-Rom spine
// with welded smooth normals (loft-core.mjs). FEATHERS are flat swept lofted
// planes carrying a procedural FEATHER ALBEDO+ALPHA texture (central rachis,
// diagonal barb striations, transverse hawk bands, dark base, pale tip) so each
// plane reads unambiguously as ONE feather, not a smooth sheet. They are heavily
// shingled (roof-tile overlap) into the wing / tail / dorsal coat. No comb of
// free-floating rods, no bald bat-membrane, no glued sphere/capsule chains.
//
// Modern-reconstruction refinements (PRD §2b): scaly bare LIPPED face with teeth
// HIDDEN behind a clean lip line (no grin); large forward eye; arms FOLD wing-like
// against the flank (palms inward) with the big pennaceous feathers shingled along
// the folded forearm; stiff feathered tail held straight out with a feathered
// tail-tip FAN (Zhenyuanlong-style). Colour: slate-grey dorsal -> pale cream
// ventral countershade, subtle banding on wing/tail.
//
// Proportions — V. mongoliensis, large adult (L ~ 2.07 m). Turkey/wolf-sized,
// lithe, FULLY FEATHERED. See the PRD master table.

import { makeLoft } from "../loft-core.mjs";
//
// Foundry baseline: iter15+ — feather-texture + modern-recon rebuild over iter14.
// Critic gate: PRD-velociraptor.md §6.

// Environment-driven COLOURWAYS — the world assigns one per biome when it spawns a
// raptor: buildCreature(scene, { palette: "chestnut" }). No colour fossilised for
// V. mongoliensis; each is inferred from a relative's preserved melanosomes or the
// habitat (see header). Eye = realistic dark reddish-amber (not bright yellow).
//   jungle / forest  -> "chestnut"  (rusty, Sinosauropteryx; forest camo)
//   desert / rocky    -> "gobi"      (sandy cryptic; its real arid habitat)
//   swamp / low-light -> "blackirid" (glossy blue-black, Microraptor)
export const PALETTES = {
  // eye = iris colour, chosen to CONTRAST with each body (not match it), realistic amber range.
  gobi:      { dorsal: [0.420, 0.340, 0.230], flank: [0.620, 0.520, 0.380], belly: [0.860, 0.800, 0.660], wing: [0.500, 0.400, 0.270], tailf: [0.550, 0.450, 0.310], coat: [0.600, 0.500, 0.360], eye: [0.30, 0.16, 0.05] },
  chestnut:  { dorsal: [0.460, 0.260, 0.160], flank: [0.600, 0.400, 0.280], belly: [0.880, 0.820, 0.700], wing: [0.420, 0.240, 0.150], tailf: [0.500, 0.300, 0.190], coat: [0.580, 0.380, 0.260], eye: [0.80, 0.58, 0.18] },
  blackirid: { dorsal: [0.055, 0.070, 0.105], flank: [0.120, 0.140, 0.185], belly: [0.175, 0.195, 0.235], wing: [0.080, 0.105, 0.165], tailf: [0.100, 0.125, 0.185], coat: [0.120, 0.140, 0.185], eye: [0.78, 0.54, 0.16] },
};

export function buildCreature(scene, opts = {}) {
  const B = window.BABYLON;
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const root = new B.TransformNode("velociraptor", scene);
  const loft = makeLoft(scene, B, { quality: "realtime" });
  const PAL = PALETTES[opts.palette] || PALETTES.chestnut; // default: jungle/forest raptor

  // ====================================================================
  // PALETTE — slate-grey dorsal -> pale cream ventral (countershaded), with
  // subtle banding carried by the feather texture. Dark scaly face, near-black
  // claws, amber eye.
  // ====================================================================
  const C3 = (a) => new B.Color3(a[0], a[1], a[2]);
  const DORSAL = C3(PAL.dorsal); // back/crown
  const FLANK  = C3(PAL.flank);  // mid flank
  const BELLY  = C3(PAL.belly);  // pale countershaded ventral
  const WING   = C3(PAL.wing);   // wing feather
  const TAILF  = C3(PAL.tailf);  // tail feather
  const COAT   = C3(PAL.coat);   // contour-coat feather

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const sstep = (a, b, x) => smooth((x - a) / (b - a));
  const lerpC = (a, b, t) => new B.Color3(
    a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  const mottle = (c, x, y, z, amt) => {
    const h = Math.sin(x * 21.7 + z * 11.3 + y * 7.9) * 43758.5453;
    const n = (h - Math.floor(h) - 0.5) * amt;
    return new B.Color3(clamp01(c.r + n), clamp01(c.g + n), clamp01(c.b + n));
  };

  // ====================================================================
  // PROCEDURAL TEXTURES
  // ====================================================================
  // Single-feather albedo+alpha texture. Drawn upright: root at the bottom
  // (v=0), tip at the top (v=1), central rachis at u=0.5. Carries barb
  // striations, transverse hawk bands, dark base and pale tip; alpha = the
  // feather outline (transparent outside) so each shingled plane reads as a
  // distinct feather with a fringed edge. Multiplied by the per-feather vertex
  // colour (which carries the regional slate hue).
  function makeFeatherTexture() {
    const SZ = 256;
    const tex = new B.DynamicTexture("featherTex", { width: SZ, height: SZ }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, SZ, SZ);
    const cx = SZ * 0.5;
    const hwAt = (v) => {
      const ramp = Math.min(1, v / 0.10);
      const taper = 1 - Math.pow(Math.max(0, (v - 0.55) / 0.45), 1.4) * 0.86;
      return SZ * 0.42 * Math.max(0.04, ramp * taper);
    };
    const steps = 48;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const v = i / steps, y = SZ * (1 - v), x = cx - hwAt(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const v = i / steps, y = SZ * (1 - v);
      const x = cx + hwAt(v) * (i % 2 ? 1 : 0.9); // ragged trailing barb edge
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(0, 0, SZ, SZ);
    // value gradient: dark base -> bold pale tip (high contrast so it reads)
    const g = ctx.createLinearGradient(0, SZ, 0, 0);
    g.addColorStop(0.0, "rgba(40,40,40,0.42)");      // softer dark base (blend tiles)
    g.addColorStop(0.30, "rgba(90,90,90,0.12)");
    g.addColorStop(0.74, "rgba(255,255,255,0.14)");
    g.addColorStop(0.90, "rgba(255,255,255,0.62)"); // pale edge
    g.addColorStop(1.0, "rgba(255,255,255,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SZ, SZ);
    // rachis
    ctx.strokeStyle = "rgba(56,56,56,0.6)";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(cx, SZ);
    ctx.lineTo(cx, SZ * 0.04);
    ctx.stroke();
    // barb striations: from rachis outward + upward, both sides — bolder, clustered
    for (let i = 0; i < 200; i++) {
      const v = i / 200, y = SZ * (1 - v), hw = hwAt(v);
      ctx.lineWidth = 0.8 + (i % 4 === 0 ? 1.0 : 0);
      for (const dir of [1, -1]) {
        ctx.strokeStyle = `rgba(70,70,70,${0.22 + (i % 3) * 0.07})`;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + dir * hw, y - hw * 0.55);
        ctx.stroke();
      }
    }
    // transverse hawk bands — bold, dark
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const y = SZ * (1 - (b + 0.4) / bands);
      ctx.fillStyle = "rgba(30,30,30,0.30)"; // softer bands so adjacent feathers blend
      ctx.fillRect(0, y - SZ * 0.026, SZ, SZ * 0.044);
    }
    ctx.restore();
    tex.update();
    tex.hasAlpha = true;
    return tex;
  }

  // Body contour-coat texture: fine barb streaks + faint banding on a light-grey
  // base, tiled, so the body silhouette never reads as a smooth bare tube. Hue
  // comes from the vertex countershade.
  function makeCoatTexture() {
    const SZ = 256;
    const tex = new B.DynamicTexture("coatTex", { width: SZ, height: SZ }, scene, true);
    const ctx = tex.getContext();
    ctx.fillStyle = "#c4c4c4";
    ctx.fillRect(0, 0, SZ, SZ);
    // overlapping contour-feather scallops (faint) so the coat reads shingled
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ, r = 6 + Math.random() * 12;
      const g = 150 + (Math.random() * 50) | 0;
      ctx.strokeStyle = `rgba(${g},${g},${g + 4},0.20)`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(x, y + r, r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    // fine barb streaks (bolder + denser than before so the body isn't a smooth tube)
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const len = 5 + Math.random() * 13, ang = -0.5 + Math.random() * 0.22;
      const g = 70 + (Math.random() * 80) | 0;
      ctx.strokeStyle = `rgba(${g},${g},${g + 6},${0.14 + Math.random() * 0.18})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    for (let b = 0; b < 5; b++) {
      const y = (b + 0.5) / 5 * SZ;
      ctx.fillStyle = "rgba(54,54,58,0.16)";
      ctx.fillRect(0, y - 3, SZ, 6);
    }
    // FINE DOWNY FUZZ in the albedo — dense short value strokes so the skin looks
    // fuzzy/feathery even under flat lighting (relief alone vanishes at distance).
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const a = -1.3 + Math.random() * 0.5, len = 2 + Math.random() * 4; // mostly down-swept lay
      const g = 80 + (Math.random() * 110) | 0; // light + dark specks = grain
      ctx.strokeStyle = `rgba(${g},${g},${g + 5},0.28)`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    tex.update();
    return tex;
  }

  // Coat NORMAL map — gives the body feathered RELIEF so it catches light instead
  // of reading as a smooth tube. Base = flat (#8080ff); each barb streak tilts the
  // normal across its length (a tiny raised vane edge). Same streak layout/scale as
  // the albedo coat so relief and colour line up.
  function makeCoatNormal() {
    const SZ = 256;
    const tex = new B.DynamicTexture("coatNrm", { width: SZ, height: SZ }, scene, true);
    const ctx = tex.getContext();
    ctx.fillStyle = "#8080ff"; // flat normal
    ctx.fillRect(0, 0, SZ, SZ);
    // Coarse directional barb ridges (the feather-grain lay).
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const len = 5 + Math.random() * 13, ang = -0.5 + Math.random() * 0.22;
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(150,110,255,0.30)";   // +x/-y face
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.strokeStyle = "rgba(70,150,255,0.30)";    // -x/+y face (offset 1px)
      ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + dx + 1, y + dy + 1); ctx.stroke();
    }
    // FINE DOWNY FUZZ — dense short strokes in every direction = a soft fuzzy
    // grain (not smooth, not plumage). This is what makes the skin read feathery.
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const a = Math.random() * Math.PI * 2, len = 1.5 + Math.random() * 3.0;
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(150,108,255,0.22)";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.strokeStyle = "rgba(68,150,255,0.22)";
      ctx.beginPath(); ctx.moveTo(x - dx * 0.4, y - dy * 0.4); ctx.lineTo(x, y); ctx.stroke();
    }
    tex.update();
    return tex;
  }

  // Fine scale texture for the bare scaly face/snout (tight pebbled grain).
  function makeScaleTexture() {
    const SZ = 256;
    const tex = new B.DynamicTexture("scaleTex", { width: SZ, height: SZ }, scene, true);
    const ctx = tex.getContext();
    ctx.fillStyle = "#9a9aa0";
    ctx.fillRect(0, 0, SZ, SZ);
    const px = 7;
    for (let row = 0; row * px * 0.86 < SZ + px; row++) {
      const off = (row & 1) * px * 0.5;
      for (let col = 0; col * px < SZ + px; col++) {
        const cxs = col * px + off, cys = row * px * 0.86;
        const t = Math.random();
        const g = t < 0.4 ? 120 : t < 0.75 ? 150 : 175;
        ctx.fillStyle = `rgb(${g},${g},${g + 4})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k - Math.PI / 6;
          const xx = cxs + Math.cos(a) * px * 0.48, yy = cys + Math.sin(a) * px * 0.42;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    tex.update();
    return tex;
  }

  // ====================================================================
  // MATERIALS
  // ====================================================================
  const featherTex = makeFeatherTexture();
  const featherMat = new B.PBRMaterial("raptorFeather", scene);
  featherMat.metallic = 0; featherMat.roughness = 0.82;
  featherMat.useVertexColor = true;
  featherMat.albedoTexture = featherTex;
  featherMat.useAlphaFromAlbedoTexture = true;
  featherMat.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHATEST;
  featherMat.albedoTexture.hasAlpha = true;
  featherMat.backFaceCulling = false;
  featherMat.twoSidedLighting = true;

  const coatMat = new B.PBRMaterial("raptorCoat", scene); // body skin (fuzzy down)
  coatMat.metallic = 0; coatMat.roughness = 0.97; // very matte — no rubbery sheen
  coatMat.useVertexColor = true;
  coatMat.albedoTexture = makeCoatTexture();
  coatMat.albedoTexture.uScale = 8; coatMat.albedoTexture.vScale = 7;
  coatMat.bumpTexture = makeCoatNormal();        // fine DOWNY FUZZ relief (not a smooth tube)
  coatMat.bumpTexture.uScale = 8; coatMat.bumpTexture.vScale = 7;
  coatMat.bumpTexture.level = 1.5;

  const faceMat = new B.PBRMaterial("raptorFace", scene); // bare scaly lipped face
  faceMat.metallic = 0; faceMat.roughness = 0.5;
  faceMat.useVertexColor = true;
  faceMat.albedoTexture = makeScaleTexture();
  faceMat.albedoTexture.uScale = 4; faceMat.albedoTexture.vScale = 6;

  const bareMat = new B.PBRMaterial("raptorBare", scene); // scaly lower leg / hand
  bareMat.albedoColor = new B.Color3(0.40, 0.40, 0.42);
  bareMat.metallic = 0; bareMat.roughness = 0.55;

  const clawMat = new B.PBRMaterial("raptorClaw", scene);
  clawMat.albedoColor = new B.Color3(0.075, 0.065, 0.06);
  clawMat.metallic = 0; clawMat.roughness = 0.35;

  const eyeMat = new B.PBRMaterial("raptorEye", scene);
  eyeMat.albedoColor = new B.Color3(PAL.eye[0], PAL.eye[1], PAL.eye[2]);
  eyeMat.metallic = 0; eyeMat.roughness = 0.42;   // matte iris — no hot glossy hotspot
  eyeMat.emissiveColor = new B.Color3(0.0, 0.0, 0.0); // NOT self-lit (was glowing yellow)

  const pupilMat = new B.PBRMaterial("raptorPupil", scene);
  pupilMat.albedoColor = new B.Color3(0.02, 0.02, 0.02);
  pupilMat.metallic = 0; pupilMat.roughness = 0.2;
  pupilMat.backFaceCulling = false; // disc visible whichever way it faces
  pupilMat.emissiveColor = new B.Color3(0.0, 0.0, 0.0);

  const toothMat = new B.PBRMaterial("raptorTooth", scene); // ivory teeth
  toothMat.albedoColor = new B.Color3(0.86, 0.83, 0.72);
  toothMat.metallic = 0; toothMat.roughness = 0.35;

  const mouthMat = new B.PBRMaterial("raptorMouth", scene); // dark mouth interior / gums
  mouthMat.albedoColor = new B.Color3(0.10, 0.045, 0.05);
  mouthMat.metallic = 0; mouthMat.roughness = 0.6;

  // ====================================================================
  // COLLECTORS — merged per material at the end.
  // ====================================================================
  const featherParts = [], coatParts = [], faceParts = [], bareParts = [], clawParts = [];
  // Lower jaw kept SEPARATE (its own mesh on a hinge pivot) so the mouth can be
  // animated open/closed later. jawToothParts = lower teeth that ride with it.
  const jawParts = [], jawToothParts = [];
  const toothParts = [], mouthParts = [];
  const rigidMeshes = []; // eyes / pupils — placed, not merged with skin

  function tint(mesh, fn) {
    const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
    if (!pos) return mesh;
    const n = pos.length / 3;
    const cols = new Array(n * 4);
    for (let i = 0; i < n; i++) {
      const c = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1;
    }
    mesh.setVerticesData(B.VertexBuffer.ColorKind, cols);
    return mesh;
  }

  // Body plumage countershade: dorsal-slate -> ventral-cream along Y.
  function bodyColour(x, y, z) {
    const tc = clamp01((y - 0.400) / 0.160);
    let c = tc < 0.5 ? lerpC(BELLY, FLANK, tc / 0.5)
                     : lerpC(FLANK, DORSAL, (tc - 0.5) / 0.5);
    return mottle(c, x, y, z, 0.04);
  }

  // Bare scaly face/snout: dark slate-grey, with a darker clean LIP SEAM along
  // the jaw line (y~0.503) so the closed mouth reads as lipped, teeth hidden.
  function faceColour(x, y, z) {
    let c = new B.Color3(0.215, 0.222, 0.235);
    const lip = 1 - Math.min(1, Math.abs(y - 0.486) / 0.008);
    c = lerpC(c, new B.Color3(0.04, 0.04, 0.045), lip * 0.9); // bold dark mouth line
    c = lerpC(c, new B.Color3(0.30, 0.31, 0.325), clamp01((y - 0.486) / 0.09) * 0.40);
    // pale cheek marking below + behind the large eye (ref: pale facial markings)
    const cheek = clamp01(1 - Math.hypot((z - 0.628) / 0.052, (y - 0.522) / 0.024));
    c = lerpC(c, new B.Color3(0.60, 0.61, 0.63), cheek * 0.5);
    // nostril — dark opening set partway along the snout
    const nos = clamp01(1 - Math.hypot((z - 0.700) / 0.018, (y - 0.522) / 0.012));
    c = lerpC(c, new B.Color3(0.05, 0.05, 0.055), nos * 0.85);
    return mottle(c, x, y, z, 0.025);
  }

  // ---- feather vane: flat tapered swept plane root->tip carrying the feather
  // texture. Geometry is a gently tapered ribbon; the texture's alpha defines
  // the actual feather outline + fringe. Explicit UVs map root->tip = v,
  // lead->trail = u. `nrm` is the broad-face normal; `curl` droops the tip. ----
  function featherPlane(name, rootP, dir, len, halfWMax, nrm, curl, baseCol, opts = {}) {
    const N = 8;
    const leadF = opts.lead ?? 0.5, trailF = opts.trail ?? 0.5;
    const rdir = dir.normalize();
    const nUnit = nrm.normalize();
    let side = B.Vector3.Cross(rdir, nUnit);
    if (side.length() < 1e-5) side = V(1, 0, 0);
    side = side.normalize();
    const leadPts = [], trailPts = [], rib = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = rootP.add(rdir.scale(len * t)).add(nUnit.scale(-curl * t * t));
      rib.push(p);
      const ramp = sstep(0, 0.06, t);
      const fall = 1 - sstep(0.55, 1.0, t) * 0.42; // gentle taper; alpha shapes the rest
      const W = 2 * halfWMax * ramp * fall;
      leadPts.push(p.add(side.scale(W * leadF)));
      trailPts.push(p.add(side.scale(-W * trailF)));
    }
    const mesh = B.MeshBuilder.CreateRibbon(name, {
      pathArray: [leadPts, trailPts], closeArray: false, closePath: false,
    }, scene);
    const uvs = [];
    for (let p = 0; p < 2; p++) for (let i = 0; i < N; i++) uvs.push(p, i / (N - 1));
    mesh.setVerticesData(B.VertexBuffer.UVKind, uvs);
    const r0 = rib[0], axis = rib[N - 1].subtract(r0);
    const axisLen2 = Math.max(1e-6, axis.lengthSquared());
    tint(mesh, (x, y, z) => {
      const t = clamp01(B.Vector3.Dot(V(x, y, z).subtract(r0), axis) / axisLen2);
      const c = lerpC(baseCol, lerpC(baseCol, DORSAL, 0.5), smooth(t) * 0.32);
      return mottle(c, x, y, z, 0.03);
    });
    featherParts.push(mesh);
    return mesh;
  }

  // ---- claw: short tapered loft along an arc in the x=const plane. ----
  function clawLoft(name, basePos, ang0, sweep, len, baseDia, segs = 6) {
    let pz = basePos.z, py = basePos.y, ang = ang0;
    const dAng = sweep / segs, step = len / segs;
    const sts = [{ p: V(basePos.x, py, pz), w: baseDia / 2, h: baseDia / 2 }];
    for (let i = 0; i < segs; i++) {
      pz += Math.cos(ang) * step; py += Math.sin(ang) * step; ang += dAng;
      const f = 1 - (i + 1) / (segs + 0.4);
      sts.push({ p: V(basePos.x, py, pz), w: Math.max(0.001, baseDia / 2 * f), h: Math.max(0.001, baseDia / 2 * f) });
    }
    const m = loft(name, sts, { ringN: 8, samplesPerSpan: 3 });
    clawParts.push(m);
    return m;
  }

  // ====================================================================
  // BODY — one continuous loft: tail tip -> tail -> hips -> trunk -> S-neck ->
  // back of cranium (just BEHIND the eyes). The scaly face is a separate loft
  // continuing from the shared cranium ring forward to the snout tip. Horizontal
  // spine at y~0.50. Lithe + NARROW (depth > width). L ~ 2.0.
  // ====================================================================
  const body = loft("body", [
    { p: V(0, 0.505, -0.860), w: 0.006, h: 0.006 },                      // tail tip (SHORTER tail)
    { p: V(0, 0.505, -0.700), w: 0.020, hT: 0.024, hB: 0.024 },
    { p: V(0, 0.504, -0.520), w: 0.040, hT: 0.048, hB: 0.046 },
    { p: V(0, 0.503, -0.340), w: 0.062, hT: 0.072, hB: 0.068, sq: 2.05 },// thick tail base
    { p: V(0, 0.502, -0.170), w: 0.084, hT: 0.094, hB: 0.090, sq: 2.1 }, // haunch (chunky)
    { p: V(0, 0.500,  0.000), w: 0.096, hT: 0.106, hB: 0.102, sq: 2.25 },// hips (broad)
    { p: V(0, 0.496,  0.150), w: 0.094, hT: 0.100, hB: 0.110, sq: 2.25 },// belly (deep, compact)
    { p: V(0, 0.505,  0.300), w: 0.082, hT: 0.096, hB: 0.092, sq: 2.15 },// chest / shoulders (muscular)
    { p: V(0, 0.528,  0.380), w: 0.064, hT: 0.070, hB: 0.070 },          // neck base (SHORT + thick)
    { p: V(0, 0.558,  0.450), w: 0.052, hT: 0.056, hB: 0.058 },          // neck S apex
    { p: V(0, 0.554,  0.510), w: 0.052, hT: 0.056, hB: 0.058 },          // neck -> head
    { p: V(0, 0.548,  0.560), w: 0.062, hT: 0.060, hB: 0.058, sq: 2.7 }, // back of cranium (DEEP, shared w/ face)
  ], { ringN: 30, samplesPerSpan: 7 });
  tint(body, bodyColour);
  coatParts.push(body);

  // ---- scaly bare face/snout — continues from the cranium ring forward. Long,
  // low, narrow, up-curved. Teeth HIDDEN behind a clean lip line (no grin).
  // Upper skull + UPPER JAW. The ventral profile (y - hB) is the scaly LIP that
  // drapes OVER the tooth row, so a closed mouth reads lipped (no grin) per the
  // 2023 recon; the teeth only show when the jaw drops. hB is deepened across the
  // tooth-bearing snout so the lip covers the tooth tips.
  const face = loft("face", [
    { p: V(0, 0.554, 0.510), w: 0.052, hT: 0.056, hB: 0.058 },           // neck (tangent helper, overlaps body)
    { p: V(0, 0.548, 0.560), w: 0.062, hT: 0.060, hB: 0.058, sq: 2.7 },  // back of cranium (DEEP back-skull, shared)
    { p: V(0, 0.546, 0.612), w: 0.056, hT: 0.058, hB: 0.060, sq: 2.5 },  // orbit (tall, big eye under brow)
    { p: V(0, 0.534, 0.668), w: 0.044, hT: 0.044, hB: 0.062, sq: 2.3 },  // snout base — DEEP robust muzzle, lip drapes over teeth
    { p: V(0, 0.524, 0.732), w: 0.030, hT: 0.034, hB: 0.052, sq: 2.2 },  // mid snout — lipped
    { p: V(0, 0.518, 0.784), w: 0.024, hT: 0.028, hB: 0.044, sq: 2.2 },  // fore snout — lipped, blunt
    { p: V(0, 0.512, 0.816), w: 0.019, hT: 0.024, hB: 0.032, sq: 2.0 },  // muzzle end — rounding begins
    { p: V(0, 0.508, 0.834), w: 0.011, hT: 0.018, hB: 0.020, sq: 1.7 },  // ROUNDED blunt tip — domed close
  ], { ringN: 26, samplesPerSpan: 6 });
  tint(face, faceColour);
  faceParts.push(face);

  // ====================================================================
  // EYES — large, forward, set in the socket under a light scaly brow.
  // PUPIL size: no fossil pupil, but Velociraptor's scleral-ring/orbit ratio reads
  // NOCTURNAL (Schmitz & Motani 2011), so a relatively LARGE ROUND pupil (avian,
  // not a slit) — set to ~0.55 of the visible iris (nocturnal-raptor range).
  // ====================================================================
  // Eyeball ~13% of skull length (research + reference art: the ORBIT is large but
  // the eyeball fills only part of it). iter48 head with the corrected eye size.
  const EYE_R = 0.018;
  const PUPIL_R = EYE_R * 0.55;   // large nocturnal round pupil (Schmitz & Motani 2011)
  for (const s of [1, -1]) {
    const eyeR = EYE_R;
    const eye = B.MeshBuilder.CreateSphere(`eye${s}`, { diameter: 2 * eyeR, segments: 16 }, scene);
    const eyeC = V(s * 0.047, 0.548, 0.610);
    eye.position = eyeC;
    eye.material = eyeMat; eye.parent = root; rigidMeshes.push(eye);
    // Pupil is a FLAT DISC lying ON the eye surface (facing the gaze), NOT a ball
    // stuck on the eyeball. Radius from the raptor pupil estimate (see PUPIL spec).
    const gaze = V(s * 0.52, 0.04, 0.86).normalize();
    const pupil = B.MeshBuilder.CreateDisc(`pupil${s}`, { radius: PUPIL_R, tessellation: 24 }, scene);
    pupil.position = eyeC.add(gaze.scale(eyeR + 0.001)); // FLAT on the surface, just proud (visible, not hidden inside)
    // Orient the disc (local +Z normal) to face along the gaze — built explicitly
    // so it lies flush on the eye instead of edge-on to the camera.
    const pr = B.Vector3.Cross(B.Vector3.Up(), gaze).normalize();
    const pu = B.Vector3.Cross(gaze, pr).normalize();
    const pm = B.Matrix.Identity();
    B.Matrix.FromXYZAxesToRef(pr, pu, gaze, pm);
    pupil.rotationQuaternion = B.Quaternion.FromRotationMatrix(pm);
    pupil.parent = root;
    pupil.material = pupilMat; rigidMeshes.push(pupil);
    // PRONOUNCED bony brow hood — projects forward + out over the eye for a fierce
    // hooded look (ref: Prehistoric Planet raptor).
    const brow = loft(`brow${s}`, [
      { p: V(s * 0.036, 0.564, 0.586), w: 0.006, h: 0.005 },
      { p: V(s * 0.052, 0.570, 0.610), w: 0.013, hT: 0.008, hB: 0.007 }, // proud over the (smaller) eye
      { p: V(s * 0.046, 0.559, 0.638), w: 0.006, h: 0.005 },
    ], { ringN: 8, samplesPerSpan: 3 });
    tint(brow, faceColour); faceParts.push(brow);
    // crown / nape fuzz — feathers START BEHIND the eye over the back of the skull
    // (ref: bare scaly face, feathered head-back). Small back-swept contour planes.
    for (let k = 0; k < 3; k++) {
      const t = k / 2;
      const rootP = V(s * (0.022 + 0.010 * t), 0.572 - 0.006 * t, 0.566 - 0.040 * t);
      featherPlane(`crown${s}_${k}`, rootP, V(s * 0.30, 0.05, -0.95), 0.075, 0.024,
        V(s * 0.85, 0.45, 0.0), 0.01, COAT);
    }
  }

  // ====================================================================
  // MOUTH — dropped lower jaw + dark interior + a tooth row, so the mouth reads
  // unmistakably as a PARTED, toothed predator mouth (front + 3/4 + side).
  // ====================================================================
  // Lower jaw (mandible): CLOSED at the hinge, parting only slightly toward the
  // front — a confident slightly-open mouth, not a wide gape.
  // Organic ROUNDED mandible (sq~2 = ellipse, no boxy slab). The ascending ramus
  // rises into the cheek (top buried in the cranium = attached); the lower margin
  // is a gentle CONVEX curve (deepest mid-rear, tapering both ways) — a jaw lobe,
  // not a hanging paddle. Built as its OWN mesh on a hinge pivot (see merge).
  const jaw = loft("jaw", [
    // Articulation at the BACK of the skull (behind the orbit, at lower-orbit
    // height) — per the skull research, not mid-head and not hanging low.
    { p: V(0, 0.520, 0.566), w: 0.026, hT: 0.013, hB: 0.013, sq: 1.8 }, // condyle — rounded knob at the rear hinge (lower-orbit level)
    { p: V(0, 0.504, 0.612), w: 0.034, hT: 0.012, hB: 0.030, sq: 2.0 }, // adductor — jaw deepens just ahead of the hinge
    { p: V(0, 0.491, 0.680), w: 0.027, hT: 0.011, hB: 0.024, sq: 2.0 }, // ramus (deepest point of the lower margin)
    { p: V(0, 0.484, 0.740), w: 0.020, hT: 0.010, hB: 0.018, sq: 2.0 }, // mid (top meets upper gum)
    { p: V(0, 0.477, 0.788), w: 0.013, hT: 0.010, hB: 0.015 },          // fore (closed to gum, no droop)
    { p: V(0, 0.481, 0.832), w: 0.006, hT: 0.009, hB: 0.012 },          // chin tip (reaches snout tip — mouth closed)
  ], { ringN: 20, samplesPerSpan: 5 });
  tint(jaw, faceColour); jawParts.push(jaw);

  // Thin dark mouth interior — only a sliver between the closed lips (reads as a
  // mouth line, no see-through), widening a touch at the front parting.
  const maw = loft("maw", [
    { p: V(0, 0.490, 0.660), w: 0.024, hT: 0.002, hB: 0.005 },
    { p: V(0, 0.485, 0.728), w: 0.017, hT: 0.003, hB: 0.006 },
    { p: V(0, 0.481, 0.788), w: 0.010, hT: 0.003, hB: 0.006 },
  ], { ringN: 14, samplesPerSpan: 4 });
  maw.material = mouthMat; mouthParts.push(maw);

  // Small recurved teeth — only a HINT along the FRONT of the jaw (a few peeking
  // below the lip line), not a full barcode grin.
  function tooth(name, basePos, dir, len, baseDia, target = toothParts) {
    const d = dir.normalize();
    const m = loft(name, [
      { p: basePos, w: baseDia / 2, h: baseDia / 2 },
      { p: basePos.add(d.scale(len * 0.5)), w: baseDia * 0.30, h: baseDia * 0.30 },
      { p: basePos.add(d.scale(len)), w: 0.0006, h: 0.0006 },
    ], { ringN: 6, samplesPerSpan: 2 });
    target.push(m);
    return m;
  }
  // Approx upper-jaw half-width at z (places teeth at the jaw margin).
  const snoutHalfW = (z) => {
    if (z <= 0.612) return 0.056;
    if (z <= 0.668) return 0.056 + (0.044 - 0.056) * (z - 0.612) / 0.056;
    if (z <= 0.732) return 0.044 + (0.030 - 0.044) * (z - 0.668) / 0.064;
    return Math.max(0.008, 0.030 + (0.017 - 0.030) * (z - 0.732) / 0.056);
  };
  // Full interlocking tooth rows. UPPER = maxilla margin, point DOWN, on the skull.
  // LOWER = dentary margin, point UP, pushed to jawToothParts so they swing with
  // the jaw mesh when it opens. Mid-row teeth are the longest (recurved canines).
  const upperGumY = 0.485;                                   // maxilla alveolar margin (~flat)
  const lowerTopY = (z) => 0.500 + (0.487 - 0.500) * clamp01((z - 0.66) / (0.80 - 0.66));
  for (const s of [1, -1]) {
    // Short teeth that stay BEHIND the lip when closed (hidden at rest) but are
    // there to show when the jaw drops. Rooted slightly up inside the gum.
    const NU = 7;
    for (let k = 0; k < NU; k++) {
      const z = 0.665 + k * (0.800 - 0.665) / (NU - 1);
      const hw = snoutHalfW(z) * 0.86;
      const len = 0.009 - 0.002 * Math.abs(k - (NU - 1) / 2) / ((NU - 1) / 2);
      tooth(`utooth${s}_${k}`, V(s * hw, upperGumY + 0.004, z), V(s * 0.05, -1.0, 0.12), len, 0.008);
    }
    const NL = 7;
    for (let k = 0; k < NL; k++) {
      const z = 0.655 + k * (0.792 - 0.655) / (NL - 1);
      const hw = snoutHalfW(z) * 0.80;
      const len = 0.008 - 0.002 * Math.abs(k - (NL - 1) / 2) / ((NL - 1) / 2);
      tooth(`ltooth${s}_${k}`, V(s * hw, lowerTopY(z), z), V(s * 0.05, 1.0, -0.10), len, 0.007, jawToothParts);
    }
  }

  // ====================================================================
  // HIND LEGS — slender bird legs, digitigrade. Feathered thigh ("trousers")
  // over a bare scaly metatarsus + foot. Built once per side (mirrored).
  // ====================================================================
  function buildLeg(s) {
    const thigh = loft(`thigh${s}`, [
      { p: V(s * 0.056, 0.500, -0.012), w: 0.058, hT: 0.072, hB: 0.070 }, // hip socket (buried)
      { p: V(s * 0.086, 0.420,  0.052), w: 0.056, hT: 0.066, hB: 0.060 }, // femoral mass
      { p: V(s * 0.100, 0.338,  0.108), w: 0.044, hT: 0.050, hB: 0.046 }, // knee (forward)
      { p: V(s * 0.094, 0.250,  0.060), w: 0.034, hT: 0.040, hB: 0.038 }, // upper tibia (back)
      { p: V(s * 0.090, 0.182,  0.022), w: 0.024, hT: 0.026, hB: 0.025 }, // lower tibia
    ], { ringN: 18, samplesPerSpan: 5 });
    tint(thigh, bodyColour); coatParts.push(thigh);

    const shank = loft(`shank${s}`, [
      { p: V(s * 0.090, 0.182,  0.022), w: 0.018, hT: 0.019, hB: 0.019 }, // lower tibia
      { p: V(s * 0.087, 0.108, -0.018), w: 0.013, hT: 0.014, hB: 0.014 }, // ankle (heel back)
      { p: V(s * 0.085, 0.050,  0.026), w: 0.012, hT: 0.013, hB: 0.012 }, // metatarsus
      { p: V(s * 0.083, 0.012,  0.070), w: 0.014, hT: 0.011, hB: 0.010 }, // foot base
    ], { ringN: 14, samplesPerSpan: 5 });
    shank.material = bareMat; bareParts.push(shank);

    // contour "trouser" feathers over the thigh + knee (hides the junction).
    const trA = V(s * 0.072, 0.470, 0.020), trB = V(s * 0.098, 0.300, 0.090);
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      const rootP = B.Vector3.Lerp(trA, trB, t);
      featherPlane(`trouser${s}_${k}`, rootP, V(s * 0.18, -0.55, -0.55), 0.13 - 0.02 * t, 0.032,
        V(s * 0.85, 0.25, 0.2), 0.02, COAT);
    }

    // ---- foot: stand on digits III + IV; digit II raised (sickle); I rear dewclaw
    const footY = 0.012;
    const toe = (nm, pts, w0) => {
      const sts = pts.map((p, i) => ({ p, w: w0 * (1 - i / (pts.length + 0.5)), h: w0 * 0.85 * (1 - i / (pts.length + 0.5)) }));
      const m = loft(nm, sts, { ringN: 8, samplesPerSpan: 3 });
      m.material = bareMat; bareParts.push(m);
    };
    toe(`toe3_${s}`, [
      V(s * 0.085, footY + 0.004, 0.090), V(s * 0.085, footY, 0.160), V(s * 0.085, footY, 0.220),
    ], 0.013);
    clawLoft(`claw3_${s}`, V(s * 0.085, footY, 0.220), -0.25, -0.5, 0.030, 0.012);
    toe(`toe4_${s}`, [
      V(s * 0.085, footY + 0.004, 0.088), V(s * 0.106, footY, 0.142), V(s * 0.122, footY, 0.188),
    ], 0.012);
    clawLoft(`claw4_${s}`, V(s * 0.122, footY, 0.188), -0.25, -0.5, 0.026, 0.011);
    // digit II — RAISED, bears the big sickle killing-claw (held off the ground)
    toe(`toe2_${s}`, [
      V(s * 0.081, footY + 0.006, 0.078), V(s * 0.067, 0.045, 0.108), V(s * 0.059, 0.062, 0.128),
    ], 0.012);
    clawLoft(`sickle_${s}`, V(s * 0.059, 0.062, 0.132), -0.15, -1.7, 0.072, 0.020, 7);
    // digit I — small rear dewclaw
    toe(`toe1_${s}`, [
      V(s * 0.079, 0.040, 0.042), V(s * 0.075, 0.034, 0.014),
    ], 0.009);
    clawLoft(`claw1_${s}`, V(s * 0.075, 0.034, 0.014), Math.PI - 0.3, -0.4, 0.018, 0.009, 5);
  }
  buildLeg(1);
  buildLeg(-1);

  // ====================================================================
  // ARMS — VISIBLE folded forelimbs proud of the flank (the chunky body would
  // otherwise swallow them). Each arm: humerus angled down-back to the elbow,
  // forearm down-FORWARD (bird fold), then a HAND of three dark-clawed fingers
  // projecting forward-down at the front (clearly visible from side/3-4/front).
  // The big pennaceous wing feathers mount on the trailing edge + sweep BACK so
  // they read as a folded feathered wing ON the arm — without burying the hand.
  // ====================================================================
  function buildArm(s) {
    const shoulder = V(s * 0.082, 0.524, 0.314); // proud of the flank
    const elbow    = V(s * 0.104, 0.456, 0.236); // humerus down-back
    const wrist    = V(s * 0.100, 0.426, 0.316); // forearm down-forward (the fold)
    const arm = loft(`arm${s}`, [
      { p: V(s * 0.064, 0.532, 0.330), w: 0.018, hT: 0.020, hB: 0.020 }, // shoulder root (into body)
      { p: shoulder,                   w: 0.017, hT: 0.019, hB: 0.019 },
      { p: elbow,                      w: 0.014, hT: 0.015, hB: 0.015 }, // elbow (visible point)
      { p: B.Vector3.Lerp(elbow, wrist, 0.5), w: 0.012, hT: 0.013, hB: 0.013 },
      { p: wrist,                      w: 0.010, hT: 0.011, hB: 0.011 }, // wrist
    ], { ringN: 12, samplesPerSpan: 4 });
    tint(arm, bodyColour); coatParts.push(arm);

    // HAND — three clawed fingers projecting forward-down (palms inward). Bare
    // scaly with dark curved claws, clearly visible at the front of the chest.
    const handP = V(s * 0.098, 0.420, 0.330);
    const fing = [
      { dx:  0.000, dy: -0.034, z: 0.376, dia: 0.009, len: 0.024 }, // longest (digit II)
      { dx:  0.012, dy: -0.026, z: 0.362, dia: 0.008, len: 0.020 },
      { dx: -0.010, dy: -0.024, z: 0.358, dia: 0.008, len: 0.018 },
    ];
    for (let i = 0; i < fing.length; i++) {
      const f = fing[i];
      const tip = V(handP.x + s * f.dx, handP.y + f.dy, f.z);
      const fm = loft(`fing${s}_${i}`, [
        { p: handP, w: f.dia, h: f.dia },
        { p: tip, w: f.dia * 0.5, h: f.dia * 0.5 },
      ], { ringN: 7, samplesPerSpan: 3 });
      fm.material = bareMat; bareParts.push(fm);
      clawLoft(`fclaw${s}_${i}`, tip, -1.0, -0.9, f.len, 0.007, 5); // dark curved claw
    }

    // WING feathers — root along forearm (wrist->elbow, primaries) and humerus
    // (elbow->shoulder, secondaries); broad face out, trailing BACK + down so the
    // folded wing hangs behind the arm and the hand stays exposed at the front.
    const wingNrm = V(s * 1.0, 0.10, 0.0);
    const NP = 9;
    for (let k = 0; k < NP; k++) {
      const t = k / (NP - 1);          // 0 = wrist/primary (long), 1 = shoulder/secondary
      const rootP = t < 0.5 ? B.Vector3.Lerp(wrist, elbow, t / 0.5)
                            : B.Vector3.Lerp(elbow, shoulder, (t - 0.5) / 0.5);
      const len = 0.40 - 0.15 * t;
      const halfW = 0.055 - 0.010 * t;
      featherPlane(`prim${s}_${k}`, rootP, V(s * 0.05, -0.16, -1.0), len, halfW,
        wingNrm, 0.03 * (1 - t), WING);
    }
    // covert underlayer over the humerus roots (broad, swept back, flush).
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      const rootP = B.Vector3.Lerp(elbow, shoulder, t);
      featherPlane(`cov${s}_${k}`, rootP, V(s * 0.04, -0.18, -1.0), 0.22, 0.050,
        V(s * 0.99, 0.06, 0.0), 0.015, WING);
    }
  }
  buildArm(1);
  buildArm(-1);

  // ====================================================================
  // TAIL FEATHERS — clothe the slim stiff tail as ONE feathered tail: side
  // cladding flush along each side (broad face sideways), heavily Z-overlapped
  // (roof-tile shingle), plus soft dorsal/ventral edge feathers so the top and
  // bottom edges read as overlapping feather tips. Slim core; the feathers give
  // the depth. Ends in a feathered tail-tip FAN (Zhenyuanlong-style).
  // ====================================================================
  {
    const tailBaseZ = -0.16, tailTipZ = -0.78, tailLen = tailBaseZ - tailTipZ; // 0.62
    const yC = 0.503;
    // NO side cladding (broad side planes read as armour blocks). The tail CORE is
    // the smooth body loft; feather it ONLY as a thin sagittal fringe along the
    // top + bottom centreline — from the side this is a clean feathered edge, the
    // sides stay smooth. Reads as a stiff feathered tail, not a segmented tube.
    const TM = 9;
    for (let m = 0; m < TM; m++) {
      const t = m / (TM - 1);
      const z = tailBaseZ - t * tailLen;
      const prof = 1 - sstep(0.62, 1.0, t) * 0.55;        // shrink toward the tip
      const len = (0.18 + 0.04 * (1 - t)) * prof;
      featherPlane(`tailD_${m}`, V(0, yC + 0.018 * prof, z), V(0, 0.12, -1.0),
        len, 0.05 * prof, V(1, 0, 0), 0.0, TAILF);        // dorsal fin fringe
      featherPlane(`tailV_${m}`, V(0, yC - 0.020 * prof, z), V(0, -0.12, -1.0),
        len * 0.85, 0.042 * prof, V(1, 0, 0), 0.0, TAILF); // ventral fringe
    }
    // tail-tip FAN — the boldest plumage; broad, smooth frond.
    const tipP = V(0, yC, -0.78);
    const NF = 7;
    for (let k = 0; k < NF; k++) {
      const t = k / (NF - 1);
      const ang = (t - 0.5) * 1.1;
      const dir = V(0, Math.sin(ang) * 0.85, -1.0);
      const len = 0.27 - 0.07 * Math.abs(t - 0.5) * 2;
      featherPlane(`tailfan_${k}`, tipP, dir, len, 0.055, V(1, 0, 0), 0.02, TAILF);
    }
    for (const s of [1, -1]) {
      for (let k = 0; k < 2; k++) {
        const t = k / 1;
        featherPlane(`tailfanL${s}_${k}`, tipP, V(s * 0.45, (t - 0.5) * 0.3, -1.0),
          0.22, 0.050, V(0, 1, 0), 0.02, TAILF);
      }
    }
  }

  // ====================================================================
  // BODY CONTOUR COAT — shingled rows of short back-swept contour feathers over
  // the neck (behind the eyes), back and flanks so the whole silhouette reads
  // feathered. Broad faces out; short, overlapping, gently back-swept.
  // ====================================================================
  {
    // FEWER, BROADER, back-swept crest feathers — a smooth dorsal mane, not a
    // row of spikes / centipede ridge.
    // Thin, low, overlapping sagittal vanes along the back centreline = a clean
    // feathered topline (a low mane), smooth flanks. NOT broad up-plates.
    const spine = [
      { z: 0.470, y: 0.590 }, { z: 0.390, y: 0.598 }, { z: 0.300, y: 0.602 },
      { z: 0.200, y: 0.604 }, { z: 0.090, y: 0.603 }, { z: -0.020, y: 0.598 },
      { z: -0.120, y: 0.590 },
    ];
    spine.forEach((r, i) => {
      // low + back-swept (small up-tilt) so the mane lies along the back rather
      // than poking up as triangles.
      featherPlane(`spine_${i}`, V(0, r.y - 0.004, r.z), V(0, 0.045, -1.0), 0.15, 0.034,
        V(1, 0, 0), 0.04, COAT);
    });
  }
  for (const s of [1, -1]) {
    // DENSE shingled contour coat — overlapping back-swept rows covering neck,
    // shoulder, flank (×2), belly-side and hip so NO broad smooth tube shows.
    // Kept short/flush/back-swept (broad face out, low curl) to read as plumage,
    // not a centipede ridge.
    const rows = [
      // a:start  b:end  dir(back-swept)  nrm(broad-face-out)  n  len  hw  curl
      { a: V(s*0.034, 0.566, 0.522), b: V(s*0.050, 0.538, 0.394), dir: V(s*0.20,-0.10,-0.95), nrm: V(s*0.90, 0.42, 0.0),  n: 8, len: 0.12, hw: 0.042, curl: 0.020 }, // neck upper
      { a: V(s*0.042, 0.540, 0.514), b: V(s*0.058, 0.514, 0.392), dir: V(s*0.24,-0.18,-0.92), nrm: V(s*0.94, 0.22, 0.0),  n: 7, len: 0.11, hw: 0.038, curl: 0.015 }, // neck lower
      { a: V(s*0.066, 0.524, 0.332), b: V(s*0.094, 0.510, 0.060), dir: V(s*0.10,-0.10,-0.95), nrm: V(s*0.95, 0.26, 0.0),  n: 9, len: 0.15, hw: 0.036, curl: 0.020 }, // shoulder / upper flank
      { a: V(s*0.080, 0.488, 0.302), b: V(s*0.102, 0.488, 0.010), dir: V(s*0.10,-0.18,-0.95), nrm: V(s*0.97, 0.12, 0.05), n: 9, len: 0.15, hw: 0.034, curl: 0.015 }, // mid flank
      { a: V(s*0.072, 0.454, 0.272), b: V(s*0.090, 0.454, 0.020), dir: V(s*0.10,-0.30,-0.90), nrm: V(s*0.96,-0.04, 0.05), n: 8, len: 0.13, hw: 0.032, curl: 0.010 }, // lower flank / belly side
      { a: V(s*0.084, 0.502, 0.010), b: V(s*0.064, 0.492,-0.150), dir: V(s*0.12,-0.16,-0.95), nrm: V(s*0.95, 0.22, 0.0),  n: 6, len: 0.14, hw: 0.034, curl: 0.015 }, // hip
    ];
    rows.forEach((r, ri) => {
      for (let k = 0; k < r.n; k++) {
        const p = B.Vector3.Lerp(r.a, r.b, k / (r.n - 1));
        featherPlane(`coat${s}_${ri}_${k}`, p, r.dir, r.len, r.hw, r.nrm, r.curl, COAT);
      }
    });
  }

  // ====================================================================
  // MERGE per material (keeps smooth normals; MergeMeshes concatenates).
  // ====================================================================
  for (const m of featherParts) m.material = featherMat;
  const wingMesh = B.Mesh.MergeMeshes(featherParts, true, true, undefined, false, false);
  wingMesh.name = "raptorFeather"; wingMesh.material = featherMat; wingMesh.parent = root;

  for (const m of coatParts) m.material = coatMat;
  const coatMesh = B.Mesh.MergeMeshes(coatParts, true, true, undefined, false, false);
  coatMesh.name = "raptorCoat"; coatMesh.material = coatMat; coatMesh.parent = root;

  for (const m of faceParts) m.material = faceMat;
  const faceMesh = B.Mesh.MergeMeshes(faceParts, true, true, undefined, false, false);
  faceMesh.name = "raptorFace"; faceMesh.material = faceMat; faceMesh.parent = root;

  let bareMesh = null, clawsMesh = null, mouthMesh = null, teethMesh = null;
  if (bareParts.length) {
    for (const m of bareParts) m.material = bareMat;
    bareMesh = B.Mesh.MergeMeshes(bareParts, true, true, undefined, false, false);
    bareMesh.name = "raptorBare"; bareMesh.material = bareMat; bareMesh.parent = root;
  }
  if (clawParts.length) {
    for (const m of clawParts) m.computeWorldMatrix(true);
    clawsMesh = B.Mesh.MergeMeshes(clawParts, true, true, undefined, false, false);
    clawsMesh.name = "raptorClaws"; clawsMesh.material = clawMat; clawsMesh.parent = root;
  }
  if (mouthParts.length) {
    for (const m of mouthParts) m.material = mouthMat;
    mouthMesh = B.Mesh.MergeMeshes(mouthParts, true, true, undefined, false, false);
    mouthMesh.name = "raptorMouth"; mouthMesh.material = mouthMat; mouthMesh.parent = root;
  }
  if (toothParts.length) {
    for (const m of toothParts) m.computeWorldMatrix(true);
    teethMesh = B.Mesh.MergeMeshes(toothParts, true, true, undefined, false, false);
    teethMesh.name = "raptorTeeth"; teethMesh.material = toothMat; teethMesh.parent = root;
  }

  // ====================================================================
  // LOWER JAW — its OWN mesh. A hinge pivot at the jaw articulation lets the
  // standalone harness rotate the mouth open (opts.jawOpen). In-game the jaw is
  // skinned to the Head bone (the Quaternius rig has no jaw bone), so it rides the
  // head; the pivot is exposed in metadata for future bespoke jaw animation.
  // ====================================================================
  const jawHinge = V(0, 0.518, 0.566); // back of skull, lower-orbit height
  let jawMesh = null, jteethMesh = null;
  if (jawParts.length) {
    for (const m of jawParts) m.material = faceMat;
    jawMesh = B.Mesh.MergeMeshes(jawParts, true, true, undefined, false, false);
    jawMesh.name = "raptorJaw"; jawMesh.material = faceMat; jawMesh.parent = root;
  }
  if (jawToothParts.length) {
    for (const m of jawToothParts) m.computeWorldMatrix(true);
    jteethMesh = B.Mesh.MergeMeshes(jawToothParts, true, true, undefined, false, false);
    jteethMesh.name = "raptorJawTeeth"; jteethMesh.material = toothMat; jteethMesh.parent = root;
  }
  const jawPivot = new B.TransformNode("raptorJawPivot", scene);
  jawPivot.position = jawHinge; jawPivot.parent = root;
  for (const m of [jawMesh, jteethMesh]) if (m) {
    m.setPivotPoint(jawHinge);                 // rotate about the hinge, verts stay in model space
    if (opts.jawOpen) m.rotation.x = opts.jawOpen;
  }

  // ====================================================================
  // SKIN METADATA — per-vertex part ids + the raptor bone-rest table, so
  // glb-skin.mjs can retarget our mesh onto raptor.glb's Quaternius rig + clips
  // (same contract the in-game T-Rex uses). Parts gate which bones a vertex may
  // bind to; classified by position (legs below the body, arms off the flank,
  // head/jaw forward). The harness ignores all of this.
  // ====================================================================
  const PARTS = { BODY: 0, HEAD: 1, ARM_R: 2, ARM_L: 3, LEG_R: 4, LEG_L: 5 };
  const classify = (x, y, z) => {
    if (z > 0.515) return PARTS.HEAD;                                              // head / face / jaw / neck-to-head
    if (y < 0.455 && z > -0.05 && z < 0.24 && Math.abs(x) > 0.030) return x > 0 ? PARTS.LEG_R : PARTS.LEG_L; // hind limbs
    if (Math.abs(x) > 0.060 && y > 0.40 && y < 0.56 && z > 0.20 && z < 0.37) return x > 0 ? PARTS.ARM_R : PARTS.ARM_L; // folded forelimbs
    return PARTS.BODY;                                                             // trunk / neck / tail / hips
  };
  const tagParts = (mesh) => {
    if (!mesh) return mesh;
    const p = mesh.getVerticesData(B.VertexBuffer.PositionKind);
    if (!p) return mesh;
    const ids = new Array(p.length / 3);
    for (let i = 0; i < ids.length; i++) ids[i] = classify(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    mesh.metadata = Object.assign({}, mesh.metadata, { partIds: ids });
    return mesh;
  };
  const skinnedMeshes = [coatMesh, wingMesh, faceMesh, jawMesh, bareMesh, clawsMesh, teethMesh, jteethMesh, mouthMesh].filter(Boolean);
  skinnedMeshes.forEach(tagParts);

  // Bone-rest positions in OUR model space (metres; +Z forward, Y up), read off
  // the loft stations; .L mirrors .R. Names match raptor.glb's Quaternius rig.
  const VR = {
    root: [0, 0.06, -0.10], Body: [0, 0.50, 0.04], Hips: [0, 0.50, -0.02], Torso: [0, 0.50, 0.18],
    Shoulders: [0, 0.52, 0.31], Neck: [0, 0.55, 0.45], Head: [0, 0.548, 0.61], Back: [0, 0.50, -0.14],
    Tail1: [0, 0.503, -0.34], Tail2: [0, 0.505, -0.52], Tail3: [0, 0.505, -0.66], Tail4: [0, 0.505, -0.76], Tail5: [0, 0.505, -0.86],
    "BackLeg.R": [0.056, 0.500, -0.01], "BackUpLeg.R": [0.090, 0.400, 0.05], "BackLowLeg.R": [0.092, 0.230, 0.05], "BackFoot.R": [0.085, 0.050, 0.07],
    "FrontLeg.R": [0.064, 0.530, 0.330], "FrontUpLeg.R": [0.082, 0.524, 0.314], "FrontLowLeg.R": [0.104, 0.456, 0.236], "FrontFoot.R": [0.099, 0.421, 0.323],
  };
  for (const k of Object.keys(VR)) {
    if (k.endsWith(".R")) { const v = VR[k]; VR[k.slice(0, -2) + ".L"] = [-v[0], v[1], v[2]]; }
  }

  root.metadata = Object.assign({}, root.metadata, {
    skin: { skinnedMeshes, headMeshes: rigidMeshes, parts: PARTS, boneRest: VR },
    jaw: { pivot: jawPivot, meshes: [jawMesh, jteethMesh].filter(Boolean), hinge: jawHinge, axis: "x", openRadians: 0.5 },
  });

  return root;
}
