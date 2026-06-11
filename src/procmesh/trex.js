// Procedural Tyrannosaurus rex built from swept "loft" surfaces.
//
// Build spec: procgen/PRD-trex.md (index: procgen/BUILD_SPECS.md)
//
// Contract (see procgen/harness.html): export buildCreature(scene), read
// window.BABYLON (global; do NOT import it), build the creature centred near
// the origin with feet at about y=0, facing +Z, parent everything under one
// root, and return that root. The harness owns camera, lights, ground, shadow.
//
// Build strategy — the anti-Michelin-man approach: every fleshy mass is ONE
// continuous lofted surface. A loft sweeps a superelliptical cross-section
// (independent width / top-height / bottom-height / squareness per station)
// along a Catmull-Rom spine curve, emitting a single watertight-ish mesh with
// analytically-welded smooth normals. The whole torso+neck+head+tail is one
// loft; each leg (thigh→shank→metatarsus) is one loft; the jaw, arms, toes
// are small lofts. No chains of spheres, no butted capsules, no seams.
//
// Proportions reference — "Scotty" (RSM P2523.8), largest known T. rex:
// skull 1.39 m bone / ~1.5 m fleshed ≈ 0.12 of total length L (~13 m);
// neck short and thick ≈ 0.08 L; hip height ~4 m ≈ 0.31 L; femur ~0.10 L;
// tail ≈ half of L, deep at the base; torso cross-section a keel ellipse,
// max depth ~1.8–2.0 m vs max width ~1.2–1.4 m (≈1.4:1 deeper than wide);
// mass ~8,870 kg. Model unit ≈ metres; total length here ≈ 14.
//
// Visual (PRD §Visual appearance): olive-brown hide (#6e654f) with circumferential
// countershading (pale belly, dark spine), organic mottle + scale speckle; ivory
// teeth inside jaws; dark keratin claws; brown eyes in sockets under brow.

// Body-part tag per vertex, emitted during the build and preserved through
// MergeMeshes (vertex order = concatenation order of the part meshes). The
// glb-skin aligner reads these to restrict each vertex's candidate bones to
// its own limb/region, so a belly vert never grabs a leg bone, the two legs
// never bleed into each other, etc. Geometry/material/bind look are unchanged.
export const TREX_PART = { BODY: 0, HEAD: 1, ARM_R: 2, ARM_L: 3, LEG_R: 4, LEG_L: 5 };

// Semantic joints in our model space (Y-up, +Z forward). Correspondences the
// aligner overlays onto the asset's bones to scale/rotate/translate our mesh
// onto the rig's bind pose.
export const TREX_JOINTS = {
  hips: [0, 3.45, -1.05], head: [0, 4.45, 4.35], tailTip: [0, 2.955, -7.45],
  foot: [0, 0.12, -0.45], neck: [0, 4.15, 3.55], shoulders: [0, 3.60, 2.35],
};

export function buildCreature(scene) {
  const B = window.BABYLON;
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const root = new B.TransformNode("trex", scene);
  const P = TREX_PART;

  // ====================================================================
  // LOFT CORE
  // stations: [{ p:Vector3 centre, w, hT, hB, sq }]
  //   w  = half-width (local right = +X-ish)
  //   hT = half-height above centre, hB = below (lets belly sag, skull flatten)
  //   sq = superellipse exponent (2 = ellipse, >2 = squarer sides)
  // The path may bend freely in the YZ plane (all our parts live in x≈const
  // planes, so the frame's right-hint of +X never degenerates).
  // ====================================================================
  function loft(name, stations, opts = {}) {
    const ringN = opts.ringN ?? 28;        // points around each ring
    const spans = opts.samplesPerSpan ?? 6; // resample density along path
    const sq0 = 2;

    // --- Catmull-Rom resample of centres + per-station scalars -----------
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    const S = stations;
    const samples = []; // { c:V3, w, hT, hB, sq }
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1],
            d = S[Math.min(S.length - 1, i + 2)];
      const last = (i === S.length - 2);
      const stepN = last ? spans + 1 : spans; // include final endpoint once
      for (let s = 0; s < stepN; s++) {
        const t = s / spans;
        samples.push({
          c: V(cr(a.p.x, b.p.x, c.p.x, d.p.x, t),
               cr(a.p.y, b.p.y, c.p.y, d.p.y, t),
               cr(a.p.z, b.p.z, c.p.z, d.p.z, t)),
          w:  cr(a.w, b.w, c.w, d.w, t),
          hT: cr(a.hT ?? a.h, b.hT ?? b.h, c.hT ?? c.h, d.hT ?? d.h, t),
          hB: cr(a.hB ?? a.h, b.hB ?? b.h, c.hB ?? c.h, d.hB ?? d.h, t),
          sq: cr(a.sq ?? sq0, b.sq ?? sq0, c.sq ?? sq0, d.sq ?? sq0, t),
        });
      }
    }
    const pathN = samples.length;

    // --- frames: tangent from neighbours, right ≈ +X, up = t × r ---------
    const frames = [];
    for (let i = 0; i < pathN; i++) {
      const a = samples[Math.max(0, i - 1)].c;
      const b = samples[Math.min(pathN - 1, i + 1)].c;
      const tang = b.subtract(a).normalize();
      let right = V(1, 0, 0);
      right = right.subtract(tang.scale(B.Vector3.Dot(right, tang))).normalize();
      const up = B.Vector3.Cross(tang, right).normalize();
      frames.push({ tang, right, up });
    }

    // --- vertices: ringN+1 points per ring (seam duplicated for UV) ------
    // θ starts at the BOTTOM (-π/2) so the UV seam hides on the belly line.
    const positions = [], uvs = [];
    for (let i = 0; i < pathN; i++) {
      const s = samples[i], f = frames[i];
      for (let j = 0; j <= ringN; j++) {
        const th = -Math.PI / 2 + (j / ringN) * Math.PI * 2;
        const co = Math.cos(th), si = Math.sin(th);
        const k = 2 / s.sq;
        const cx = Math.sign(co) * Math.pow(Math.abs(co), k);
        const cy = Math.sign(si) * Math.pow(Math.abs(si), k);
        const h = cy >= 0 ? s.hT : s.hB;
        const p = s.c.add(f.right.scale(s.w * cx)).add(f.up.scale(h * cy));
        positions.push(p.x, p.y, p.z);
        uvs.push(j / ringN, i / (pathN - 1));
      }
    }

    // --- indices ----------------------------------------------------------
    const indices = [];
    const W = ringN + 1;
    for (let i = 0; i < pathN - 1; i++) {
      for (let j = 0; j < ringN; j++) {
        const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // --- smooth welded normals via parametric finite differences ----------
    // N = normalize( dP/dθ × dP/dpath ) computed with ring wraparound, so the
    // duplicated seam vertices get IDENTICAL normals — no lighting seam.
    const normals = new Array(positions.length);
    const P = (i, j) => {
      const o = (i * W + ((j % ringN) + ringN) % ringN) * 3;
      return V(positions[o], positions[o + 1], positions[o + 2]);
    };
    for (let i = 0; i < pathN; i++) {
      for (let j = 0; j <= ringN; j++) {
        const dRing = P(i, j + 1).subtract(P(i, j - 1));
        const i0 = Math.max(0, i - 1), i1 = Math.min(pathN - 1, i + 1);
        const dPath = P(i1, j).subtract(P(i0, j));
        let n = B.Vector3.Cross(dRing, dPath);
        const len = n.length();
        if (len < 1e-8) n = frames[i].tang.scale(i === 0 ? -1 : 1);
        else n = n.scale(1 / len);
        const o = (i * W + j) * 3;
        normals[o] = n.x; normals[o + 1] = n.y; normals[o + 2] = n.z;
      }
    }

    const mesh = new B.Mesh(name, scene);
    const vd = new B.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(mesh);
    return mesh;
  }

  // ====================================================================
  // MATERIALS
  // ====================================================================
  const hide = new B.PBRMaterial("trexHide", scene);
  hide.metallic = 0;
  hide.roughness = 0.78;
  {
    const SZ = 1024;
    const tex = new B.DynamicTexture("hideTex", { width: SZ, height: SZ }, scene, false);
    const ctx = tex.getContext();
    // base: olive grey-brown
    ctx.fillStyle = "#6e654f";
    ctx.fillRect(0, 0, SZ, SZ);
    // u (texture x) runs around the ring: 0 = belly, 0.5 = spine, 1 = belly.
    // Darker olive-brown over the back, pale buff on the belly. v (texture y)
    // runs along the body, v=0 (canvas bottom) = tail tip: the dorsal stripe
    // fades over the outer tail so the tapering tail never reads as a dark
    // fin blade, and the soft stop ramp avoids hard banding edges.
    const grd = ctx.createLinearGradient(0, 0, SZ, 0);
    grd.addColorStop(0.0,  "rgba(196,184,152,0.70)"); // belly
    grd.addColorStop(0.18, "rgba(168,156,126,0.45)");
    grd.addColorStop(0.32, "rgba(120,110,84,0.32)");
    grd.addColorStop(0.42, "rgba(66,60,42,0.45)");
    grd.addColorStop(0.50, "rgba(46,42,30,0.62)");    // spine, darkest
    grd.addColorStop(0.58, "rgba(66,60,42,0.45)");
    grd.addColorStop(0.68, "rgba(120,110,84,0.32)");
    grd.addColorStop(0.82, "rgba(168,156,126,0.45)");
    grd.addColorStop(1.0,  "rgba(196,184,152,0.70)"); // belly
    ctx.fillStyle = grd;
    // tail-fade: full strength to v≈0.3, smoothstep-easing to 85% at the tip.
    // Painted per pixel row so there are no visible band edges. The floor is
    // kept HIGH: the dark-top/pale-bottom gradient is the main roundness cue
    // on the tail — flattening it makes the (round) tail read like a flat fin.
    for (let row = 0; row < SZ; row++) {
      const v = 1 - (row + 0.5) / SZ;         // canvas top (v=1, snout) → bottom (v=0, tail)
      const t = Math.min(1, v / 0.3);
      const e = t * t * (3 - 2 * t);          // smoothstep
      ctx.globalAlpha = 0.85 + 0.15 * e;
      ctx.fillRect(0, row, SZ, 1);
    }
    ctx.globalAlpha = 1;
    // dense small mottled blotches (organic, no banding)
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const r = 4 + Math.random() * 16;
      ctx.fillStyle = Math.random() < 0.55
        ? "rgba(56,50,36,0.10)" : "rgba(168,156,126,0.08)";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // fine scale speckle
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const g = 80 + Math.random() * 80;
      ctx.fillStyle = `rgba(${g | 0},${(g * 0.93) | 0},${(g * 0.72) | 0},0.13)`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    tex.update(false);
    hide.albedoTexture = tex;
  }
  {
    // procedural scale-bump normal map: random raised/sunken discs as a height
    // field, converted to tangent-space normals by central differences.
    const SZ = 512;
    const tex = new B.DynamicTexture("hideBump", { width: SZ, height: SZ }, scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, SZ, SZ);
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const r = 3 + Math.random() * 8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, Math.random() < 0.5
        ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)");
      g.addColorStop(1, "rgba(128,128,128,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const img = ctx.getImageData(0, 0, SZ, SZ);
    const hAt = (x, y) => img.data[((((y % SZ) + SZ) % SZ) * SZ + (((x % SZ) + SZ) % SZ)) * 4];
    const out = ctx.createImageData(SZ, SZ);
    const STRENGTH = 2.0;
    for (let y = 0; y < SZ; y++) {
      for (let x = 0; x < SZ; x++) {
        const dx = ((hAt(x + 1, y) - hAt(x - 1, y)) / 255) * STRENGTH;
        const dy = ((hAt(x, y + 1) - hAt(x, y - 1)) / 255) * STRENGTH;
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
    hide.bumpTexture = tex;
    hide.bumpTexture.level = 0.7;
  }

  const clawMat = new B.PBRMaterial("trexClaw", scene);
  clawMat.albedoColor = new B.Color3(0.16, 0.13, 0.10);
  clawMat.metallic = 0; clawMat.roughness = 0.45;

  const toothMat = new B.PBRMaterial("trexTooth", scene);
  toothMat.albedoColor = new B.Color3(0.86, 0.81, 0.68);
  toothMat.metallic = 0; toothMat.roughness = 0.35;

  const mouthMat = new B.PBRMaterial("trexMouth", scene);
  mouthMat.albedoColor = new B.Color3(0.10, 0.04, 0.04);
  mouthMat.metallic = 0; mouthMat.roughness = 0.9;

  const eyeMat = new B.PBRMaterial("trexEye", scene);
  eyeMat.albedoColor = new B.Color3(0.45, 0.28, 0.08);
  eyeMat.metallic = 0; eyeMat.roughness = 0.2;
  eyeMat.emissiveColor = new B.Color3(0.13, 0.08, 0.03); // faint life catchlight

  const pupilMat = new B.PBRMaterial("trexPupil", scene);
  pupilMat.albedoColor = new B.Color3(0.05, 0.03, 0.02);
  pupilMat.metallic = 0; pupilMat.roughness = 0.15;

  const hideParts = [], clawParts = [], toothParts = [];
  const hidePids = [], clawPids = [], toothPids = [];
  const headMeshes = []; // eyes + mouth: rigid-skinned to the head bone later
  const addHide = (m, pid = P.BODY) => { hideParts.push(m); hidePids.push(pid); return m; };
  const addClaw = (m, pid = P.BODY) => { clawParts.push(m); clawPids.push(pid); return m; };
  const addTooth = (m, pid = P.HEAD) => { toothParts.push(m); toothPids.push(pid); return m; };

  // ====================================================================
  // BODY — one loft from tail tip to snout tip. Spine held HORIZONTAL,
  // tail out as a counterweight, short S-curved neck, deep skull.
  // Units ≈ metres; total length ≈ 13, hip height ≈ 3.1.
  // ====================================================================
  // Tail: ROUND/OVAL cross-section all the way out (w ≈ h beyond mid-tail) with
  // a convex taper — never hT >> w, which reads as a flat fin from 3/4 views.
  // The outer half is kept SLIM in plan view (no paddle/leaf from top-down) and
  // the extra station near the tip pins the Catmull-Rom so the tip can't
  // overshoot into a notched/split silhouette.
  const body = loft("body", [
    { p: V(0, 2.955, -7.45), w: 0.012, h: 0.012 },            // tail end cap (near-point ring:
                                                              // an open 0.04 ring notches the
                                                              // silhouette + catches light)
    { p: V(0, 2.96, -7.40), w: 0.04, h: 0.04 },               // tail tip (round)
    { p: V(0, 2.99, -7.15), w: 0.12, h: 0.12 },               // tip control (no spline kink)
    { p: V(0, 3.02, -6.95), w: 0.19, hT: 0.19, hB: 0.19 },    // outer tail (round, slim)
    { p: V(0, 3.10, -6.35), w: 0.33, hT: 0.34, hB: 0.33 },    // (round, convex taper)
    { p: V(0, 3.20, -5.05), w: 0.55, hT: 0.58, hB: 0.55 },    // mid tail (oval, slim plan)
    { p: V(0, 3.31, -3.70), w: 0.74, hT: 0.78, hB: 0.72 },    // (oval, not bladed)
    { p: V(0, 3.40, -2.35), w: 0.88, hT: 0.94, hB: 0.86 },    // tail base (fat, near-round)
    { p: V(0, 3.45, -1.05), w: 1.00, hT: 1.12, hB: 1.24, sq: 2.1 }, // hips
    { p: V(0, 3.40, 0.25),  w: 0.96, hT: 1.14, hB: 1.58, sq: 2.15 }, // belly (keel-deep, ~1.4:1)
    { p: V(0, 3.45, 1.40),  w: 0.90, hT: 1.08, hB: 1.54, sq: 2.15 }, // chest (keel-deep)
    { p: V(0, 3.60, 2.35),  w: 0.78, hT: 0.84, hB: 1.18 },    // shoulders
    { p: V(0, 3.92, 3.05),  w: 0.66, hT: 0.62, hB: 0.92 },    // neck base (deep throat)
    { p: V(0, 4.28, 3.60),  w: 0.60, hT: 0.48, hB: 0.66 },    // mid neck (thick S)
    { p: V(0, 4.46, 4.30),  w: 0.62, hT: 0.54, hB: 0.68, sq: 2.5 }, // head base (nuchal dip)
    { p: V(0, 4.52, 4.85),  w: 0.74, hT: 0.72, hB: 0.84, sq: 3.1 }, // cranium / cheeks (boxy, deep)
    { p: V(0, 4.50, 5.32),  w: 0.68, hT: 0.60, hB: 0.80, sq: 3.2 }, // over eyes / lacrimal (flat roof)
    { p: V(0, 4.42, 5.82),  w: 0.52, hT: 0.44, hB: 0.76, sq: 2.9 }, // nasal dip / maxilla (deep)
    { p: V(0, 4.38, 6.30),  w: 0.42, hT: 0.34, hB: 0.64, sq: 2.6 }, // snout (blunt, deep)
    { p: V(0, 4.36, 6.68),  w: 0.14, hT: 0.10, hB: 0.26 },    // nose cap (blunt)
    { p: V(0, 4.33, 6.74),  w: 0.015, hT: 0.015, hB: 0.02 },  // nose end cap (near-point ring:
                                                              // the open ring's forward-lit band
                                                              // read as a white blaze face-on)
  ], { ringN: 40, samplesPerSpan: 8 });
  addHide(body, P.BODY);

  // nostril ridges — small bumps either side of the snout top
  for (const s of [1, -1]) {
    const nostril = loft(`nostril${s}`, [
      { p: V(s * 0.13, 4.70, 6.00), w: 0.03, h: 0.03 },
      { p: V(s * 0.15, 4.78, 6.22), w: 0.07, hT: 0.05, hB: 0.06 },
      { p: V(s * 0.12, 4.66, 6.45), w: 0.03, h: 0.03 },
    ], { ringN: 10, samplesPerSpan: 5 });
    addHide(nostril, P.HEAD);
  }

  // ====================================================================
  // LOWER JAW — slightly open; slimmer than the upper so teeth overbite.
  // ====================================================================
  const jaw = loft("jaw", [
    { p: V(0, 4.00, 4.50), w: 0.08, h: 0.08 },                 // hinge (buried)
    { p: V(0, 3.72, 4.95), w: 0.54, hT: 0.16, hB: 0.50, sq: 2.7 }, // rear jaw (deep surangular)
    { p: V(0, 3.58, 5.55), w: 0.44, hT: 0.14, hB: 0.38, sq: 2.5 },
    { p: V(0, 3.53, 6.15), w: 0.31, hT: 0.12, hB: 0.30, sq: 2.2 },
    { p: V(0, 3.51, 6.50), w: 0.09, h: 0.10 },                 // chin tip
    { p: V(0, 3.50, 6.55), w: 0.015, h: 0.015 },               // chin end cap (close the ring)
  ], { ringN: 22, samplesPerSpan: 6 });
  addHide(jaw, P.HEAD);

  // mouth interior — dark mass filling the gape so it never reads hollow
  const mouth = B.MeshBuilder.CreateSphere("mouth", { diameter: 1, segments: 14 }, scene);
  mouth.scaling = V(0.42, 0.32, 1.55);
  mouth.position = V(0, 3.72, 5.35);
  mouth.material = mouthMat;
  mouth.parent = root;
  headMeshes.push(mouth);

  // ====================================================================
  // TEETH — cones hanging from the maxilla rim and rising from the jaw.
  // ====================================================================
  function toothRow(count, z0, z1, yAt, xAt, len0, dir) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const z = z0 + (z1 - z0) * t;
      const len = len0 * (1.0 - 0.35 * t) * (i % 2 ? 0.8 : 1.0); // uneven row
      for (const s of [1, -1]) {
        const x = s * xAt(t);
        const tooth = B.MeshBuilder.CreateCylinder(`tooth${dir}${i}${s}`,
          { diameterTop: 0, diameterBottom: 0.085, height: len, tessellation: 6 }, scene);
        tooth.rotation.x = dir > 0 ? 0 : Math.PI;
        tooth.position = V(x, yAt(t) + dir * len * 0.5, z);
        addTooth(tooth, P.HEAD);
      }
    }
  }
  // upper row: follows the maxilla's lower edge (bottom of the body loft),
  // which now dips mid-snout then rises at the premaxilla.
  toothRow(9, 5.10, 6.28,
    (t) => 3.80 - 0.14 * t + 0.20 * t * t, // gum dips mid-maxilla, lifts at tip
                                           // (extra front lift tucks the premaxilla
                                           // teeth up so they don't read as a
                                           // tusk-curtain from the front)
    (t) => 0.45 - 0.24 * t,            // narrows toward the snout tip
    0.32, -1);
  // lower row: rises from the jaw rim, slightly inset
  toothRow(7, 5.20, 6.15,
    (t) => 3.72 - 0.11 * t,
    (t) => 0.36 - 0.15 * t,
    0.20, +1);

  // ====================================================================
  // EYES + BROW RIDGES — embedded in the skull side, bony boss above.
  // ====================================================================
  // T. rex had the largest eyes of any land animal (~13 cm ball) set FORWARD-
  // FACING in sockets under a heavy bony brow. Eyeball oversized for read
  // (~0.019 L), bulging proud of the lacrimal under a low swept brow ridge,
  // with a dark cornea offset along a strongly forward gaze so the binocular
  // predator stare reads from the front.
  for (const s of [1, -1]) {
    const eye = B.MeshBuilder.CreateSphere(`eye${s}`, { diameter: 0.27, segments: 16 }, scene);
    eye.position = V(s * 0.60, 4.70, 5.36);
    eye.material = eyeMat;
    eye.parent = root;
    headMeshes.push(eye);
    // cornea/pupil: dark glossy cap sitting on the eyeball along the gaze
    // direction (mostly forward, slightly outward) — legible from the front.
    const gaze = V(s * 0.24, 0.0, 0.97).normalize();
    const pupil = B.MeshBuilder.CreateSphere(`pupil${s}`, { diameter: 0.17, segments: 12 }, scene);
    pupil.position = eye.position.add(gaze.scale(0.10));
    pupil.material = pupilMat;
    pupil.parent = root;
    headMeshes.push(pupil);
    // brow boss: a LOW swept bony ridge hugging the skull side above the eye
    // (postorbital bar). Kept below the skull roofline so it never breaks the
    // top silhouette as "ears" from the front; deep underside overhangs the
    // eyeball so the ball reads set in a shaded socket.
    const brow = loft(`brow${s}`, [
      { p: V(s * 0.50, 4.84, 4.92), w: 0.07, h: 0.05 },
      { p: V(s * 0.56, 4.90, 5.18), w: 0.20, hT: 0.08, hB: 0.14 },
      { p: V(s * 0.54, 4.88, 5.44), w: 0.16, hT: 0.07, hB: 0.12 },
      { p: V(s * 0.44, 4.78, 5.66), w: 0.06, h: 0.04 },
    ], { ringN: 12, samplesPerSpan: 5 });
    addHide(brow, P.HEAD);
  }

  // ====================================================================
  // HIND LEGS — one continuous loft per leg: massive thigh → knee →
  // drumstick shank → slim ankle → near-vertical metatarsus → foot.
  // Digitigrade; foot lands under the body's balance point.
  // ====================================================================
  function buildLeg(s) { // s = +1 right, -1 left
    const legPid = s > 0 ? P.LEG_R : P.LEG_L;
    const leg = loft(`leg${s}`, [
      { p: V(s * 0.64, 3.30, -0.90), w: 0.40, hT: 0.60, hB: 0.70 }, // buried in hip
      { p: V(s * 0.92, 2.60, -0.55), w: 0.52, hT: 1.00, hB: 0.72 }, // massive thigh
      { p: V(s * 0.98, 2.05, 0.18),  w: 0.36, hT: 0.54, hB: 0.38 }, // knee (forward)
      { p: V(s * 0.96, 1.18, -0.28), w: 0.27, hT: 0.42, hB: 0.31 }, // shank (drumstick)
      { p: V(s * 0.90, 0.66, -0.66), w: 0.18, hT: 0.23, hB: 0.23 }, // ankle
      { p: V(s * 0.84, 0.32, -0.50), w: 0.20, hT: 0.25, hB: 0.21 }, // metatarsus
      { p: V(s * 0.80, 0.17, -0.27), w: 0.25, hT: 0.19, hB: 0.17 }, // foot top
    ], { ringN: 22, samplesPerSpan: 6 });
    addHide(leg, legPid);
    buildFoot(s, legPid);
  }

  // ONE canonical foot definition (right side, s=+1); the left foot is the
  // exact mirror of it (x → −x, fan angle → −angle, claw yaw → −yaw), so both
  // feet are guaranteed identical and can never drift apart.
  // Three forward toes + a small raised inner dewclaw (hallux) pointing back.
  const FOOT = {
    toes: [{ a: -0.42, l: 0.72 }, { a: 0, l: 0.95 }, { a: 0.42, l: 0.70 }],
    toeBaseX: 0.88, toeSpacingX: 0.16, toeBaseZ: -0.25,
    clawLen: 0.38, clawDia: 0.16, clawPitch: Math.PI / 2 + 0.55,
    hallux: { bx: 0.66, bz: -0.36, ex: 0.58, ez: -0.62 }, // inner rear stub
  };
  function buildFoot(s, legPid) {
    for (let t = 0; t < FOOT.toes.length; t++) {
      const { a: a0, l } = FOOT.toes[t];
      const a = a0 * s; // mirrored fan
      const bx = s * (FOOT.toeBaseX + (t - 1) * FOOT.toeSpacingX);
      const bz = FOOT.toeBaseZ;
      const ex = bx + Math.sin(a) * l;
      const ez = bz + Math.cos(a) * l;
      const toe = loft(`toe${s}_${t}`, [
        { p: V(bx, 0.20, bz), w: 0.11, h: 0.12 },
        { p: V((bx + ex) / 2, 0.14, (bz + ez) / 2), w: 0.12, hT: 0.12, hB: 0.14 },
        { p: V(ex, 0.11, ez), w: 0.09, hT: 0.09, hB: 0.11 },
        { p: V(ex + Math.sin(a) * 0.12, 0.10, ez + Math.cos(a) * 0.12), w: 0.025, h: 0.025 },
      ], { ringN: 12, samplesPerSpan: 5 });
      addHide(toe, legPid);
      const cl = B.MeshBuilder.CreateCylinder(`claw${s}_${t}`,
        { diameterTop: 0, diameterBottom: FOOT.clawDia, height: FOOT.clawLen, tessellation: 8 }, scene);
      cl.rotation.x = FOOT.clawPitch;
      cl.rotation.y = a;
      cl.position = V(ex + Math.sin(a) * 0.24, 0.07, ez + Math.cos(a) * 0.24);
      addClaw(cl, legPid);
    }
    // dewclaw / hallux: small raised stub on the inner rear of the foot,
    // pointing backward, claw clear of the ground.
    const H = FOOT.hallux;
    const stub = loft(`hallux${s}`, [
      { p: V(s * H.bx, 0.26, H.bz), w: 0.06, h: 0.07 },
      { p: V(s * (H.bx + H.ex) / 2, 0.21, (H.bz + H.ez) / 2), w: 0.065, h: 0.07 },
      { p: V(s * H.ex, 0.18, H.ez), w: 0.03, h: 0.03 },
    ], { ringN: 10, samplesPerSpan: 5 });
    addHide(stub, legPid);
    const hc = B.MeshBuilder.CreateCylinder(`halluxClaw${s}`,
      { diameterTop: 0, diameterBottom: 0.08, height: 0.18, tessellation: 6 }, scene);
    hc.rotation.x = -(Math.PI / 2 + 0.45); // apex backward, tipped down
    hc.position = V(s * (H.ex - 0.01), 0.15, H.ez - 0.10);
    addClaw(hc, legPid);
  }
  buildLeg(1);
  buildLeg(-1);

  // ====================================================================
  // ARMS — tiny two-fingered forelimbs tucked under the chest.
  // ====================================================================
  function buildArm(s) {
    const armPid = s > 0 ? P.ARM_R : P.ARM_L;
    const arm = loft(`arm${s}`, [
      { p: V(s * 0.64, 3.30, 2.40), w: 0.18, h: 0.23 },        // buried in chest
      { p: V(s * 0.94, 2.95, 2.38), w: 0.16, hT: 0.18, hB: 0.18 }, // upper arm (back-down)
      { p: V(s * 1.00, 2.62, 2.42), w: 0.115, h: 0.125 },       // elbow (flexed)
      { p: V(s * 0.94, 2.50, 2.78), w: 0.095, h: 0.105 },       // forearm (forward)
      { p: V(s * 0.90, 2.42, 3.02), w: 0.065, h: 0.07 },        // wrist
    ], { ringN: 12, samplesPerSpan: 5 });
    addHide(arm, armPid);
    for (const f of [0.06, -0.06]) {
      const fc = B.MeshBuilder.CreateCylinder(`finger${s}${f}`,
        { diameterTop: 0, diameterBottom: 0.07, height: 0.26, tessellation: 6 }, scene);
      fc.rotation.x = Math.PI / 2 + 0.5;
      fc.position = V(s * 0.90 + f, 2.38, 3.12); // base buried in the wrist
      addClaw(fc, armPid);
    }
  }
  buildArm(1);
  buildArm(-1);

  // ====================================================================
  // MERGE per material (keeps smooth normals; MergeMeshes does not weld
  // or recompute, it just concatenates buffers).
  // ====================================================================
  // Per-vertex part tags, in the SAME order MergeMeshes concatenates the parts
  // (so they line up with the merged vertex buffer). Built before the merge
  // disposes the source meshes.
  const flatIds = (parts, pids) => {
    const out = [];
    for (let k = 0; k < parts.length; k++) {
      const n = parts[k].getTotalVertices();
      for (let v = 0; v < n; v++) out.push(pids[k]);
    }
    return new Uint8Array(out);
  };
  const hideIds = flatIds(hideParts, hidePids);
  const toothIds = flatIds(toothParts, toothPids);
  const clawIds = flatIds(clawParts, clawPids);

  const hideMesh = B.Mesh.MergeMeshes(hideParts, true, true, undefined, false, false);
  hideMesh.name = "trexHideMesh"; hideMesh.material = hide; hideMesh.parent = root;
  hideMesh.metadata = { partIds: hideIds };

  const teeth = B.Mesh.MergeMeshes(toothParts, true, true, undefined, false, false);
  teeth.name = "trexTeeth"; teeth.material = toothMat; teeth.parent = root;
  teeth.metadata = { partIds: toothIds };

  const claws = B.Mesh.MergeMeshes(clawParts, true, true, undefined, false, false);
  claws.name = "trexClaws"; claws.material = clawMat; claws.parent = root;
  claws.metadata = { partIds: clawIds };

  // Skin hints for the glb-rig aligner (procgen/glb-skin.mjs). Additive — the
  // static gallery/harness ignore metadata and frame the bind pose unchanged.
  root.metadata = {
    skin: {
      skinnedMeshes: [hideMesh, teeth, claws], // carry per-vertex partIds
      headMeshes,                              // eyes + mouth: rigid to head bone
      joints: TREX_JOINTS,
      parts: TREX_PART,
    },
  };

  return root;
}
