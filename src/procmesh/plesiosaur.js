// Procedural plesiosaur (elasmosaurid) for the OCEAN apex creature — a swept-loft
// build adapted from procgen/plesiosaur.js (small head, very long slender neck,
// broad rounded turtle trunk, four wing-like paddle flippers, short tail).
//
// Unlike the static procgen export (which MERGES everything into one rigid
// mesh), this build keeps the NECK as a chain of pivoted transform nodes and
// each FLIPPER on its own pivot, so the in-game aquatic AI can animate them
// procedurally (neck rears/sways, flippers paddle) with no skeleton — exactly
// the marine-reptile motion the game wants.
//
// Reads window.BABYLON (global; do NOT import it). Faces +Z: head toward +Z at
// the tip of the long neck, tail toward -Z. Built around the origin at the
// procgen unit scale (total length ~11.5 u); the caller scales the root.
//
// Returns the animatable rig:
//   { root, neckPivot, segPivots, headPivot, flippers:{FR,FL,HR,HL},
//     materials, shadowCasters, dispose }
// segPivots[i].rotation.x drives the neck arc; flippers.*.rotation.x paddles.

import { makeLoft } from "../loft-core.mjs";
import { applyPlesiosaurHide } from "../skin-textures.mjs";

// Neck spine control points (procgen plesiosaur.js, shoulders -> head crest),
// in model space. The trunk loft ends at the fore-chest (~z 1.2); the neck
// arcs up and forward from there to the small head. We rebuild the neck as a
// segment chain that follows this same arc in its rest pose, so it reads as the
// one stiff swan arc when at rest and can straighten/rear under animation.
const NECK_SPINE = [
  { y: 0.90, z: 1.20, hw: 0.42 }, // fore-chest / neck base (matches trunk end)
  { y: 1.08, z: 1.60, hw: 0.34 },
  { y: 1.16, z: 2.40, hw: 0.31 },
  { y: 1.40, z: 3.10, hw: 0.27 },
  { y: 1.82, z: 3.75, hw: 0.23 },
  { y: 2.36, z: 4.30, hw: 0.19 },
  { y: 2.92, z: 4.70, hw: 0.16 },
  { y: 3.38, z: 5.00, hw: 0.135 },
  { y: 3.62, z: 5.35, hw: 0.12 }, // crest of the arc (neck tip / head base)
];

export function buildPlesiosaur(scene) {
  const B = window.BABYLON;
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const root = new B.TransformNode("plesiosaur", scene);
  const loft = makeLoft(scene, B, { quality: "realtime" });
  const shadowCasters = [];

  // ---- Materials (shared procgen wet countershaded hide + amber eyes + fangs)
  const hide = new B.PBRMaterial("plesioHide", scene);
  applyPlesiosaurHide(scene, B, hide);

  const toothMat = new B.PBRMaterial("plesioTooth", scene);
  toothMat.albedoColor = new B.Color3(0.91, 0.89, 0.85); // ivory
  toothMat.metallic = 0; toothMat.roughness = 0.35;

  const eyeMat = new B.PBRMaterial("plesioEye", scene);
  eyeMat.albedoColor = new B.Color3(0.78, 0.47, 0.09);   // amber
  eyeMat.emissiveColor = new B.Color3(0.45, 0.24, 0.03); // predator read at waterline
  eyeMat.metallic = 0; eyeMat.roughness = 0.15;

  const mouthMat = new B.PBRMaterial("plesioMouth", scene);
  mouthMat.albedoColor = new B.Color3(0.10, 0.04, 0.04);
  mouthMat.metallic = 0; mouthMat.roughness = 0.9;

  const skin = (m) => { m.material = hide; m.parent = root; m.isPickable = false; return m; };

  // ====================================================================
  // TRUNK + TAIL — one continuous loft: short pointed tail -> broad rounded
  // turtle-like trunk -> blunt fore-chest where the neck takes over. Static
  // (parented to root); the body's heading + bob is driven by moving the root.
  // ====================================================================
  const trunk = loft("plesioTrunk", [
    { p: V(0, 0.42, -4.60), w: 0.03, h: 0.03 },                     // tail tip
    { p: V(0, 0.48, -3.95), w: 0.14, hT: 0.13, hB: 0.12 },
    { p: V(0, 0.58, -3.20), w: 0.26, hT: 0.24, hB: 0.23 },
    { p: V(0, 0.68, -2.40), w: 0.42, hT: 0.38, hB: 0.38 },         // tail pinches off the trunk
    { p: V(0, 0.76, -1.60), w: 0.88, hT: 0.60, hB: 0.60, sq: 2.1 }, // pelvic girdle
    { p: V(0, 0.82, -0.70), w: 1.00, hT: 0.70, hB: 0.66, sq: 2.1 }, // mid trunk (widest)
    { p: V(0, 0.84, 0.20),  w: 0.92, hT: 0.64, hB: 0.60, sq: 2.1 }, // shoulder girdle
    { p: V(0, 0.86, 0.70),  w: 0.82, hT: 0.54, hB: 0.56, sq: 2.05 },// blunt fore-chest
    { p: V(0, 0.90, 1.20),  w: 0.70, hT: 0.44, hB: 0.55, sq: 2.3 }, // neck base (loft ends here)
  ], { ringN: 28, samplesPerSpan: 6 });
  skin(trunk);
  shadowCasters.push(trunk);

  // ====================================================================
  // NECK — a chain of pivoted segments following NECK_SPINE in rest pose. Each
  // pivot sits at a spine knot; its child loft tube reaches to the next knot.
  // Bending each pivot's X rotation arcs/rears the whole neck (animated by AI).
  // ====================================================================
  // Each pivot sits at the TIP of its parent's tube (local +Z = parent segLen),
  // and carries the RELATIVE pitch turn between consecutive spine directions, so
  // the chain stays end-to-end (no gaps) and follows the arc at rest. The base
  // pivot sits at the first spine knot and carries the first segment's pitch.
  const segLens = [];
  const segPitch = [];      // absolute pitch of each segment direction (X rot, -atan2(dy,dz))
  for (let i = 0; i < NECK_SPINE.length - 1; i++) {
    const a = NECK_SPINE[i], b = NECK_SPINE[i + 1];
    const dy = b.y - a.y, dz = b.z - a.z;
    segLens.push(Math.hypot(dy, dz));
    segPitch.push(-Math.atan2(dy, dz));
  }

  const neckPivot = new B.TransformNode("plesioNeckBase", scene);
  neckPivot.parent = root;
  neckPivot.position.copyFrom(V(0, NECK_SPINE[0].y, NECK_SPINE[0].z));
  neckPivot.rotation.x = segPitch[0]; // orient into the first segment's direction

  const segPivots = [];
  let parentNode = neckPivot;
  for (let i = 0; i < NECK_SPINE.length - 1; i++) {
    const a = NECK_SPINE[i], b = NECK_SPINE[i + 1];
    const segLen = segLens[i];
    const piv = new B.TransformNode("plesioNeckSeg" + i, scene);
    piv.parent = parentNode;
    if (i > 0) {
      piv.position.set(0, 0, segLens[i - 1]);            // sit at parent tube's tip
      piv.rotation.x = segPitch[i] - segPitch[i - 1];    // relative bend at this joint
    }
    // a short tapering tube from the pivot (local origin) along local +Z
    const seg = loft("plesioNeckMesh" + i, [
      { p: V(0, 0, 0),          w: a.hw,            h: a.hw },
      { p: V(0, 0, segLen * 0.5), w: (a.hw + b.hw) / 2, h: (a.hw + b.hw) / 2 },
      { p: V(0, 0, segLen),     w: b.hw,            h: b.hw },
    ], { ringN: 18, samplesPerSpan: 4 });
    seg.material = hide; seg.parent = piv; seg.isPickable = false;
    segPivots.push(piv);
    parentNode = piv;
  }

  // ====================================================================
  // HEAD — small snouted skull at the neck tip, with amber eyes, brow ridges,
  // a slim lower jaw in a slight gape, a dark mouth interior, and fangs. All
  // parented to the last neck pivot so it tracks the neck tip on every frame.
  // ====================================================================
  const headPivot = segPivots[segPivots.length - 1];
  const last = NECK_SPINE[NECK_SPINE.length - 1];
  const lastSegLen = Math.hypot(last.y - NECK_SPINE[NECK_SPINE.length - 2].y,
                                last.z - NECK_SPINE[NECK_SPINE.length - 2].z);
  // Build the head in the headPivot's LOCAL space. The pivot's +Z points along
  // the last neck segment; the head continues forward from the tube's tip.
  const z0 = lastSegLen; // tip of the last neck tube, local +Z
  const head = loft("plesioHead", [
    { p: V(0, 0, z0 + 0.00), w: last.hw,  hT: last.hw,  hB: last.hw },  // head base
    { p: V(0, 0.04, z0 + 0.35), w: 0.155, hT: 0.13,  hB: 0.12, sq: 2.4 }, // cranium (widest)
    { p: V(0, 0.02, z0 + 0.60), w: 0.125, hT: 0.10,  hB: 0.10, sq: 2.3 }, // over the eyes
    { p: V(0, -0.02, z0 + 0.85), w: 0.09, hT: 0.07,  hB: 0.075, sq: 2.2 },// snout
    { p: V(0, -0.04, z0 + 1.05), w: 0.035, hT: 0.03, hB: 0.04 },          // snout tip
  ], { ringN: 18, samplesPerSpan: 4 });
  head.material = hide; head.parent = headPivot; head.isPickable = false;

  // slim lower jaw in a slight gape
  const jaw = loft("plesioJaw", [
    { p: V(0, -0.02, z0 + 0.18), w: 0.06, h: 0.05 },
    { p: V(0, -0.06, z0 + 0.40), w: 0.13, hT: 0.045, hB: 0.07, sq: 2.4 },
    { p: V(0, -0.08, z0 + 0.62), w: 0.10, hT: 0.04, hB: 0.055, sq: 2.2 },
    { p: V(0, -0.10, z0 + 0.82), w: 0.035, h: 0.03 },
  ], { ringN: 14, samplesPerSpan: 4 });
  jaw.material = hide; jaw.parent = headPivot; jaw.isPickable = false;

  // dark mouth interior so the gape never reads hollow
  const mouth = B.MeshBuilder.CreateSphere("plesioMouth", { diameter: 1, segments: 10 }, scene);
  mouth.scaling = V(0.20, 0.10, 0.55);
  mouth.position = V(0, -0.03, z0 + 0.55);
  mouth.material = mouthMat; mouth.parent = headPivot; mouth.isPickable = false;

  // amber eyes + bony brow ridges, forward on the small skull
  for (const s of [1, -1]) {
    const eye = B.MeshBuilder.CreateSphere("plesioEye", { diameter: 0.095, segments: 10 }, scene);
    eye.position = V(s * 0.105, 0.075, z0 + 0.40);
    eye.material = eyeMat; eye.parent = headPivot; eye.isPickable = false;
    const brow = loft("plesioBrow" + s, [
      { p: V(s * 0.085, 0.12, z0 + 0.22), w: 0.022, h: 0.02 },
      { p: V(s * 0.105, 0.145, z0 + 0.37), w: 0.05, hT: 0.04, hB: 0.045 },
      { p: V(s * 0.09, 0.12, z0 + 0.50), w: 0.02, h: 0.02 },
    ], { ringN: 10, samplesPerSpan: 4 });
    brow.material = hide; brow.parent = headPivot; brow.isPickable = false;
  }

  // interlocking elasmosaurid fangs along the slight gape
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    for (const s of [1, -1]) {
      // upper row hangs from the maxilla, pointing down
      const up = B.MeshBuilder.CreateCylinder("plesioFangU" + i + s,
        { diameterTop: 0, diameterBottom: 0.026, height: 0.085 * (1 - 0.3 * t), tessellation: 6 }, scene);
      up.rotation.x = Math.PI;
      up.position = V(s * (0.105 - 0.011 * i), 0.0 - 0.03, z0 + 0.37 + i * 0.082);
      up.material = toothMat; up.parent = headPivot; up.isPickable = false;
      // lower row rises from the jaw rim
      const lo = B.MeshBuilder.CreateCylinder("plesioFangL" + i + s,
        { diameterTop: 0, diameterBottom: 0.022, height: 0.07 * (1 - 0.3 * t), tessellation: 6 }, scene);
      lo.position = V(s * (0.085 - 0.009 * i), -0.07 + 0.025, z0 + 0.42 + i * 0.075);
      lo.material = toothMat; lo.parent = headPivot; lo.isPickable = false;
    }
  }

  // ====================================================================
  // FOUR PADDLE FLIPPERS — large wing-like hydrofoils, fore + hind pairs. Each
  // blade is lofted along its own +Z then mounted on a pivot whose yaw fans it
  // out from the flank; rotating the pivot's X axis sweeps the paddle stroke.
  // (matches procgen buildFlipper proportions + banking).
  // ====================================================================
  const flippers = {};
  function buildFlipper(side, fore) {
    const piv = new B.TransformNode("plesioFlipper" + (fore ? "F" : "H") + side, scene);
    piv.parent = root;
    piv.position = fore ? V(side * 0.80, 0.64, 0.20) : V(side * 0.74, 0.60, -1.35);
    piv.rotation.y = side * Math.PI * (fore ? 0.57 : 0.59); // fore near-lateral, hind swept back
    const blade = loft("plesioBlade" + (fore ? "F" : "H") + side, [
      { p: V(0, 0.03, -0.10), w: 0.34, hT: 0.10, hB: 0.10 },   // root (buried in flank)
      { p: V(0, 0.01, 0.30),  w: 0.42, hT: 0.09, hB: 0.09 },
      { p: V(0, -0.06, 0.80), w: 0.44, hT: 0.075, hB: 0.075 }, // broad mid-blade
      { p: V(0, -0.16, 1.30), w: 0.35, hT: 0.055, hB: 0.055 },
      { p: V(0, -0.28, 1.70), w: 0.21, h: 0.035 },
      { p: V(0, -0.38, 1.95), w: 0.06, h: 0.018 },             // rounded drooping tip
    ], { ringN: 20, samplesPerSpan: 5 });
    blade.rotation.z = -side * 0.30; // bank so the pale underside shows (reads as a wing)
    blade.material = hide; blade.parent = piv; blade.isPickable = false;
    return piv;
  }
  flippers.FR = buildFlipper(1, true);
  flippers.FL = buildFlipper(-1, true);
  flippers.HR = buildFlipper(1, false);
  flippers.HL = buildFlipper(-1, false);

  return {
    root,
    neckPivot,
    segPivots,
    headPivot,
    flippers,
    materials: { hide, eyeMat, toothMat, mouthMat },
    shadowCasters,
    dispose() { root.dispose(false, true); },
  };
}
