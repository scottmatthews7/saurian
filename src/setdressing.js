// Static set-dressing props loaded from a glb: pure scenery, no animation/AI.
// Currently the crashed light aircraft the survivor wakes beside in the opening
// clearing. Mirrors the dino loader's import + bbox-normalised scaling (dino.js),
// but the model is inert — it just casts/receives shadows and (optionally) blocks
// movement via a simple box collider rather than the 28k-tri visual mesh.

import { CRASHED_PLANE, STEGO_SKELETON, OLD_TREE } from "./config.js";

// World-space bounding box of a freshly imported mesh hierarchy (min/max corners).
function worldBounds(B, meshes) {
  let min = new B.Vector3(Infinity, Infinity, Infinity);
  let max = new B.Vector3(-Infinity, -Infinity, -Infinity);
  meshes.forEach((m) => {
    if (!m.getBoundingInfo) return;
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = B.Vector3.Minimize(min, bb.minimumWorld);
    max = B.Vector3.Maximize(max, bb.maximumWorld);
  });
  return { min, max };
}

// Load the crashed plane at the player spawn (world origin) + the configured
// offset, normalising its tiny native bbox up to CRASHED_PLANE.targetLength along
// its longest axis, tilting it to a crashed attitude, and bedding it onto the
// terrain via heightAt. Returns the root node plus an obstacle footprint
// ({x, z, r}) so the caller can register it for AI avoidance.
export async function loadCrashedPlane(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const cfg = CRASHED_PLANE;

  const lastSlash = cfg.url.lastIndexOf("/") + 1;
  const rootUrl = cfg.url.slice(0, lastSlash);
  const file = cfg.url.slice(lastSlash);
  const res = await B.SceneLoader.ImportMeshAsync("", rootUrl, file, scene);

  const root = new B.TransformNode("crashedPlane_root", scene);
  res.meshes[0].parent = root;

  // Scale by the model's OWN longest axis (the source bbox is tiny) so the prop
  // reads as a real ~9 m aircraft regardless of the asset's native units.
  const native = worldBounds(B, res.meshes);
  const size = native.max.subtract(native.min);
  const longest = Math.max(size.x, size.y, size.z);
  root.scaling.setAll(cfg.targetLength / Math.max(0.0001, longest));

  // Crashed attitude: yaw the heading, then a nose-down pitch + banked roll.
  root.rotation = new B.Vector3(cfg.pitch, cfg.yaw, cfg.roll);

  // Position at spawn + offset, on the terrain. Re-measure the SCALED+ROTATED
  // bounds so the lowest point of the (tilted) wreck sits on the ground, then
  // sink it slightly so the belly beds into the soil rather than floating.
  const x = cfg.offset.x;
  const z = cfg.offset.z;
  const groundY = heightAt(x, z);
  root.position.set(x, groundY, z);
  root.computeWorldMatrix(true);
  const tilted = worldBounds(B, res.meshes);
  // Drop so the lowest tilted point rests on the ground, then sink slightly.
  root.position.y += groundY - tilted.min.y - cfg.sink;
  root.computeWorldMatrix(true);

  // Shadows like the other props; the visual mesh stays non-colliding (a 28k-tri
  // collider would be wasteful — a box proxy carries collision instead).
  res.meshes.forEach((m) => {
    if (!m.getTotalVertices || !m.getTotalVertices()) return;
    m.receiveShadows = true;
    m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m);
  });

  // Invisible box collider matching the wreck's final world footprint, so the
  // player and dinos collide with the plane without testing the detailed mesh.
  const placed = worldBounds(B, res.meshes);
  const planeSize = placed.max.subtract(placed.min);
  const box = B.MeshBuilder.CreateBox("crashedPlane_collider", {
    width: planeSize.x, height: planeSize.y, depth: planeSize.z,
  }, scene);
  box.position.set(
    (placed.min.x + placed.max.x) / 2,
    (placed.min.y + placed.max.y) / 2,
    (placed.min.z + placed.max.z) / 2,
  );
  box.isVisible = false;
  box.isPickable = false;
  box.checkCollisions = true;

  // Footprint radius for AI avoidance: half the horizontal diagonal of the box.
  const r = 0.5 * Math.hypot(planeSize.x, planeSize.z);
  return { root, collider: box, obstacle: { x, z, r } };
}

// Shared glb import + own-longest-axis normalisation for a static prop. Imports
// the mesh hierarchy, parents it under a fresh root, scales by the model's OWN
// longest axis up to targetLength metres (the source bbox is in arbitrary
// units), and enables shadow cast/receive like the plane. Returns the root, the
// imported meshes, and the loader's Babylon namespace so the caller can pose +
// bed the prop. The visual mesh stays non-colliding (these props don't block
// movement).
async function loadStaticProp(scene, shadow, cfg, rootName, targetLongest) {
  const B = window.BABYLON;
  const lastSlash = cfg.url.lastIndexOf("/") + 1;
  const rootUrl = cfg.url.slice(0, lastSlash);
  const file = cfg.url.slice(lastSlash);
  const res = await B.SceneLoader.ImportMeshAsync("", rootUrl, file, scene);

  const root = new B.TransformNode(rootName, scene);
  res.meshes[0].parent = root;

  const native = worldBounds(B, res.meshes);
  const size = native.max.subtract(native.min);
  const longest = Math.max(size.x, size.y, size.z);
  root.scaling.setAll(targetLongest / Math.max(0.0001, longest));

  res.meshes.forEach((m) => {
    if (!m.getTotalVertices || !m.getTotalVertices()) return;
    m.receiveShadows = true;
    m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m);
  });

  return { B, root, meshes: res.meshes };
}

// Load the half-buried Stegosaurus SKELETON in the desert. Normalised to a real
// ~8 m fossil by its own longest axis, laid on its side (roll) with a slight
// pitch + yaw so it reads as fallen, then SUNK so only the upper portion of the
// rolled ribcage/plates protrudes above the sand — a part-excavated dig, not a
// standing skeleton. Static scenery: no collider, no AI footprint.
export async function loadStegoSkeleton(scene, shadow, heightAt) {
  const cfg = STEGO_SKELETON;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "stegoSkeleton_root", cfg.targetLength,
  );

  // Lay the fossil on its FLANK, not standing. The model imports standing with
  // its nose-to-tail length along Z and its standing height along Y, so a 90°
  // roll about the model's own length (Z) axis tips it onto its side. We compose
  // the attitude explicitly with quaternions so the flank-roll is applied in the
  // MODEL frame FIRST (before yaw), avoiding the Euler-order trap where a yaw
  // re-points the roll axis and leaves the creature upright. Order applied to a
  // model-frame vector: flank-roll (about Z) -> slump pitch (about X) -> heading
  // yaw (about world Y).
  const flank = B.Quaternion.RotationAxis(B.Axis.Z, cfg.roll);   // 90° onto its side
  const slump = B.Quaternion.RotationAxis(B.Axis.X, cfg.pitch);  // slight nose-down lean
  const heading = B.Quaternion.RotationAxis(B.Axis.Y, cfg.yaw);  // world heading
  root.rotationQuaternion = heading.multiply(slump).multiply(flank);

  const x = cfg.position.x;
  const z = cfg.position.z;
  const groundY = heightAt(x, z);
  root.position.set(x, groundY, z);
  root.computeWorldMatrix(true);

  // Re-measure the scaled + ROLLED bounds, then drop the lowest point to the
  // sand and sink by buriedFraction of the (now-low, on-its-side) height so only
  // the top fraction of the fossil shows above the surface.
  const posed = worldBounds(B, meshes);
  const rolledHeight = posed.max.y - posed.min.y;
  root.position.y += groundY - posed.min.y - cfg.buriedFraction * rolledHeight;
  root.computeWorldMatrix(true);

  return { root, meshes };
}

// Load the old dead TREE upright on the desert sand a few metres from the
// fossil. Normalised to a real ~8 m tree by its own tallest axis, given a slight
// yaw, and bedded so the trunk base sits in the sand. Static scenery: no
// collider, no AI footprint.
export async function loadOldTree(scene, shadow, heightAt) {
  const cfg = OLD_TREE;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "oldTree_root", cfg.targetHeight,
  );

  root.rotation = new B.Vector3(0, cfg.yaw, 0);

  const x = cfg.position.x;
  const z = cfg.position.z;
  const groundY = heightAt(x, z);
  root.position.set(x, groundY, z);
  root.computeWorldMatrix(true);

  // Bed the trunk base: drop the lowest point to the sand, then sink slightly.
  const posed = worldBounds(B, meshes);
  root.position.y += groundY - posed.min.y - cfg.sink;
  root.computeWorldMatrix(true);

  return { root, meshes };
}
