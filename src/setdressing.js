// Static set-dressing props loaded from a glb: pure scenery, no animation/AI.
// Currently the crashed light aircraft the survivor wakes beside in the opening
// clearing. Mirrors the dino loader's import + bbox-normalised scaling (dino.js),
// but the model is inert — it just casts/receives shadows and (optionally) blocks
// movement via a simple box collider rather than the 28k-tri visual mesh.

import { CRASHED_PLANE } from "./config.js";

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
