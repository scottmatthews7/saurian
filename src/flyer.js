// Procedural PTEROSAUR flyer (wishlist item 4 — replaces the old cone-and-boxes
// bird). Builds a proper winged silhouette: a tapered body spindle, a long beak,
// a swept-back head crest (the Pteranodon read), and two membrane wings made of
// an upper-arm spar plus a thin skinned membrane that flaps about a shoulder
// pivot. No skeleton/glb — it's cheap set-dressing geometry, animated by rotating
// the wing pivots each frame. One builder per flock member.

import { FLYER } from "./config.js";

// Shared materials, created once per scene so the whole flock reuses them.
function flyerMaterials(scene) {
  const B = window.BABYLON;
  if (scene.__flyerMats) return scene.__flyerMats;
  const body = new B.StandardMaterial("flyerBody", scene);
  body.diffuseColor = new B.Color3(FLYER.bodyColor.r, FLYER.bodyColor.g, FLYER.bodyColor.b);
  body.specularColor = B.Color3.Black();
  const membrane = new B.StandardMaterial("flyerMembrane", scene);
  membrane.diffuseColor = new B.Color3(FLYER.membraneColor.r, FLYER.membraneColor.g, FLYER.membraneColor.b);
  membrane.specularColor = B.Color3.Black();
  membrane.alpha = FLYER.membraneAlpha;
  membrane.backFaceCulling = false;   // a thin wing reads from both sides
  // Threat material: a committed dive glows angry red so a swoop reads as danger.
  const dive = new B.StandardMaterial("flyerDive", scene);
  dive.diffuseColor = new B.Color3(0.5, 0.1, 0.1);
  dive.emissiveColor = new B.Color3(0.5, 0.05, 0.05);
  dive.specularColor = B.Color3.Black();
  scene.__flyerMats = { body, membrane, dive };
  return scene.__flyerMats;
}

// Build one wing half as a flat triangular membrane + a leading-edge spar,
// parented to a shoulder pivot at the body so it can flap. `side` is -1 (left)
// or +1 (right). Returns the pivot TransformNode.
function buildWing(scene, parent, side, mats) {
  const B = window.BABYLON;
  const halfSpan = FLYER.wingSpan / 2;
  const chord = FLYER.wingChord;

  const pivot = new B.TransformNode("wingPivot", scene);
  pivot.parent = parent;

  // Membrane: a custom flat triangle from the shoulder out to the wingtip,
  // tapering from full chord at the root to a point at the tip — the classic
  // pterosaur wing skin stretched between the long finger and the body.
  const x = side * halfSpan;
  const positions = [
    0, 0, chord * 0.4,        // root front (toward the nose)
    0, 0, -chord * 0.6,       // root back (toward the tail)
    x, 0, -chord * 0.1,       // wingtip
  ];
  const indices = side > 0 ? [0, 1, 2] : [0, 2, 1];  // wind so the face points up
  const membrane = new B.Mesh("wingMembrane", scene);
  const vd = new B.VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = [];
  B.VertexData.ComputeNormals(positions, indices, vd.normals);
  vd.applyToMesh(membrane);
  membrane.material = mats.membrane;
  membrane.parent = pivot;
  membrane.isPickable = false;

  // Leading-edge spar (the arm/finger bone) — a thin box along the span.
  const spar = B.MeshBuilder.CreateBox("wingSpar",
    { width: halfSpan, height: FLYER.bodyRadius * 0.4, depth: FLYER.bodyRadius * 0.5 }, scene);
  spar.position.set(x / 2, 0, chord * 0.35);
  spar.material = mats.body;
  spar.parent = pivot;
  spar.isPickable = false;

  return pivot;
}

// Build a complete pterosaur. Returns { root, setDiving(bool), flap(dt, diving) }.
// The whole thing is parented under `root` so the flock code can position/rotate
// it exactly like the old bird (drop-in replacement).
export function buildFlyer(scene) {
  const B = window.BABYLON;
  const mats = flyerMaterials(scene);
  const root = new B.TransformNode("flyer", scene);

  // Body spindle (tapered both ends) lying along +Z (forward).
  const body = B.MeshBuilder.CreateCylinder("flyerBodyMesh",
    { height: FLYER.bodyLength, diameterTop: FLYER.bodyRadius * 0.4,
      diameter: FLYER.bodyRadius * 2, diameterBottom: FLYER.bodyRadius * 0.3, tessellation: 8 }, scene);
  body.rotation.x = Math.PI / 2;   // lay the cylinder along Z
  body.material = mats.body;
  body.parent = root;
  body.isPickable = false;

  // Head + long beak at the front (+Z). The beak is a slim cone.
  const beak = B.MeshBuilder.CreateCylinder("flyerBeak",
    { height: FLYER.beakLength, diameterTop: 0.02, diameterBottom: FLYER.bodyRadius * 0.7, tessellation: 6 }, scene);
  beak.rotation.x = Math.PI / 2;
  beak.position.z = FLYER.bodyLength / 2 + FLYER.beakLength / 2;
  beak.material = mats.body;
  beak.parent = root;
  beak.isPickable = false;

  // Swept-back head crest (the Pteranodon signature): a thin triangular fin
  // angled up and back from the skull.
  const crest = new B.Mesh("flyerCrest", scene);
  const cs = FLYER.crestSize;
  const cz = FLYER.bodyLength / 2;   // base near the head
  const cpos = [
    0, FLYER.bodyRadius, cz,                 // skull base front
    0, FLYER.bodyRadius, cz - cs * 0.5,      // skull base back
    0, FLYER.bodyRadius + cs, cz - cs,       // crest tip (up + back)
  ];
  const cidx = [0, 1, 2, 0, 2, 1];   // double-sided
  const cvd = new B.VertexData();
  cvd.positions = cpos; cvd.indices = cidx; cvd.normals = [];
  B.VertexData.ComputeNormals(cpos, cidx, cvd.normals);
  cvd.applyToMesh(crest);
  crest.material = mats.body;
  crest.parent = root;
  crest.isPickable = false;

  // Two flapping wings at the shoulders (just behind the head).
  const shoulderZ = FLYER.bodyLength * 0.12;
  const wingL = buildWing(scene, root, -1, mats);
  const wingR = buildWing(scene, root, +1, mats);
  wingL.position.set(-FLYER.bodyRadius * 0.6, FLYER.bodyRadius * 0.3, shoulderZ);
  wingR.position.set(FLYER.bodyRadius * 0.6, FLYER.bodyRadius * 0.3, shoulderZ);

  const meshes = [body, beak, crest];
  let flapPhase = Math.random() * Math.PI * 2;
  let diving = false;

  return {
    root,
    bodyMeshes: meshes,    // so the flock can swap to the dive (red) material
    setDiving(on) {
      diving = on;
      const m = on ? mats.dive : mats.body;
      for (const mesh of meshes) mesh.material = m;
    },
    // Advance the wing-beat. Cruise flaps gently; a dive flaps fast + frantic.
    flap(dt) {
      const rate = diving ? FLYER.flapRateDive : FLYER.flapRateCruise;
      flapPhase += dt * rate;
      const a = Math.sin(flapPhase) * FLYER.flapAmplitude;
      wingL.rotation.z = a;        // wings sweep up/down about the shoulder
      wingR.rotation.z = -a;
    },
  };
}
