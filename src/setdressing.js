// Static set-dressing props loaded from a glb: pure scenery, no animation/AI.
// Currently the crashed light aircraft the survivor wakes beside in the opening
// clearing. Mirrors the dino loader's import + bbox-normalised scaling (dino.js),
// but the model is inert — it just casts/receives shadows and (optionally) blocks
// movement via a simple box collider rather than the 28k-tri visual mesh.

import {
  CRASHED_PLANE, STEGO_SKELETON, OLD_TREE, RAPTOR_NEST,
  DEAD_PILOT, GPS_DEVICE, HEALTH_PACK, BOAT, SPAWN,
} from "./config.js";

// World-space bounding box of a freshly imported mesh hierarchy (min/max corners).
// Skips meshes WITHOUT vertices (empty transform nodes / helper roots): including
// them measured a giant phantom bbox for some glbs (e.g. the GPS), so the prop
// normalised to a microscopic visible mesh. Measuring only real geometry fixes it.
function worldBounds(B, meshes) {
  let min = new B.Vector3(Infinity, Infinity, Infinity);
  let max = new B.Vector3(-Infinity, -Infinity, -Infinity);
  meshes.forEach((m) => {
    if (!m.getBoundingInfo) return;
    if (!m.getTotalVertices || !m.getTotalVertices()) return;  // skip vertexless nodes
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = B.Vector3.Minimize(min, bb.minimumWorld);
    max = B.Vector3.Maximize(max, bb.maximumWorld);
  });
  // Fallback: if nothing had vertices, fall back to all meshes so we never NaN.
  if (!isFinite(min.x)) {
    meshes.forEach((m) => {
      if (!m.getBoundingInfo) return;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      min = B.Vector3.Minimize(min, bb.minimumWorld);
      max = B.Vector3.Maximize(max, bb.maximumWorld);
    });
  }
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

  // Position at the SOUTH SPAWN + offset, on the terrain. Re-measure the
  // SCALED+ROTATED bounds so the lowest point of the (tilted) wreck sits on the
  // ground, then sink it slightly so the belly beds into the soil, not floating.
  const x = SPAWN.x + cfg.offset.x;
  const z = SPAWN.z + cfg.offset.z;
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

  // Invisible box collider, tightened to ~60% of the wreck's full bbox footprint
  // so it hugs the fuselage instead of blocking a big square across the clearing
  // (the spread wings made the bbox far wider than the body — owner).
  const FOOTPRINT = 0.6;
  const placed = worldBounds(B, res.meshes);
  const planeSize = placed.max.subtract(placed.min);
  const box = B.MeshBuilder.CreateBox("crashedPlane_collider", {
    width: planeSize.x * FOOTPRINT, height: planeSize.y, depth: planeSize.z * FOOTPRINT,
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
  const r = 0.5 * Math.hypot(planeSize.x * FOOTPRINT, planeSize.z * FOOTPRINT);
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
    m.checkCollisions = false;   // pure scenery — never blocks the player (owner: run over the dead pilot)
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

// Load the RAPTOR NEST inside the thick-jungle tree-wall just off the clearing
// (design/map.json). Ground-clamped: the lowest point of the yawed nest drops to
// the jungle floor via heightAt, then beds slightly into the soil. Static
// scenery glimpsed through the treeline: no collider, no AI footprint.
export async function loadRaptorNest(scene, shadow, heightAt) {
  const cfg = RAPTOR_NEST;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "raptorNest_root", cfg.targetLength,
  );

  root.rotation = new B.Vector3(0, cfg.yaw, 0);

  const x = cfg.position.x;
  const z = cfg.position.z;
  const groundY = heightAt(x, z);
  root.position.set(x, groundY, z);
  root.computeWorldMatrix(true);

  const posed = worldBounds(B, meshes);
  root.position.y += groundY - posed.min.y - cfg.sink;
  root.computeWorldMatrix(true);

  return { root, meshes };
}

// Load the DEAD PILOT laid PRONE on the ground just NW of the plane. Normalised
// to a human-scale body by its own longest (standing-height) axis, then tipped
// -90° about X so the standing figure lies on its back, given a yaw so it sprawls
// off-axis, and bedded on the terrain so the body rests in the soil. `planeCenter`
// is the plane's placed planar centre ({x, z}); the pilot sits at planeCenter +
// DEAD_PILOT.offset. Static scenery: no collider, no AI footprint (it doesn't
// block movement).
export async function loadDeadPilot(scene, shadow, heightAt, planeCenter) {
  const cfg = DEAD_PILOT;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "deadPilot_root", cfg.bodyLength,
  );

  // Lay it flat: -90° about X tips the upright figure onto its back, then a yaw
  // sprawls it off the world axes. Composed in the MODEL frame first (prone) then
  // world yaw, mirroring the stego-skeleton quaternion order so the prone pose
  // survives the heading rotation.
  const prone = B.Quaternion.RotationAxis(B.Axis.X, cfg.prone);
  const heading = B.Quaternion.RotationAxis(B.Axis.Y, cfg.yaw);
  root.rotationQuaternion = heading.multiply(prone);

  const x = planeCenter.x + cfg.offset.x;
  const z = planeCenter.z + cfg.offset.z;
  const groundY = heightAt(x, z);
  root.position.set(x, groundY, z);
  root.computeWorldMatrix(true);

  // Re-measure the scaled + rotated bounds, drop the lowest point to the ground,
  // then press it slightly into the soil so the body beds rather than floats.
  const posed = worldBounds(B, meshes);
  root.position.y += groundY - posed.min.y - cfg.sink;
  root.computeWorldMatrix(true);

  return { root, meshes, position: { x, z } };
}

// Load the GPS DEVICE hovering above the dead pilot — the objective the player
// loots. Normalised small (a handheld unit) by its own longest axis, RE-CENTRED
// under its root (the source mesh sits offset from the origin) so it spins about
// its own centre, lifted GPS_DEVICE.hoverHeight above the ground, glowing, and
// animated with a gentle bob + slow spin driven by scene.onBeforeRenderObservable
// (self-contained — no game-loop wiring) and scaled by engine deltaTime so it is
// framerate-independent. `pilotPos` is the pilot's placed planar centre ({x, z});
// the unit hovers directly over it. Static scenery: no collider, no AI footprint.
export async function loadGPS(scene, shadow, heightAt, pilotPos) {
  const cfg = GPS_DEVICE;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "gps_root", cfg.size,
  );

  // Re-centre the imported mesh under the root so the unit hovers + spins about
  // its own centre (the source bbox is offset from the origin).
  root.computeWorldMatrix(true);
  const scaled = worldBounds(B, meshes);
  const centre = scaled.min.add(scaled.max).scale(0.5);
  recentreMeshOnRoot(meshes, centre, B);

  // Stand the unit UPRIGHT (owner: it was lying flat — make it stand on end with
  // the screen facing out). The imported unit is FLAT (its long axis horizontal,
  // the thin screen-normal along Y). We insert a TILT node between the root and
  // the geometry that rolls the long axis to VERTICAL (about Z), so the device
  // stands on end. The ROOT then spins about world-Y, and because the tilt node
  // sits under it the device stays upright while it slowly rotates (screen sweeps
  // around to face the player). Two-node setup avoids the Euler-mixing that left
  // a single-node tilt flat.
  const tilt = new B.TransformNode("gps_tilt", scene);
  tilt.parent = root;
  tilt.rotation.z = cfg.uprightTilt || 0;   // roll the long (X) axis up to vertical
  meshes[0].parent = tilt;

  // SUBTLE glow only (owner: the bright green-cyan emissive made a glowing-blob
  // halo). A faint near-neutral emissive — reads as a device catching light.
  meshes.forEach((m) => {
    if (!m.material) return;
    const mat = m.material;
    if (mat.emissiveColor) {
      mat.emissiveColor = new B.Color3(cfg.emissive.r, cfg.emissive.g, cfg.emissive.b);
    }
  });

  const x = pilotPos.x;
  const z = pilotPos.z;
  const baseY = heightAt(x, z) + cfg.hoverHeight;
  root.position.set(x, baseY, z);
  root.computeWorldMatrix(true);

  // Self-contained bob + spin (framerate-independent via engine deltaTime).
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    root.position.y = baseY + Math.sin(t * cfg.bobSpeed) * cfg.bobAmplitude;
    root.rotation.y += cfg.spinSpeed * dt;   // spin about vertical — tilt node keeps it upright
  });

  return { root, meshes };
}

// Re-parent a prop's meshes so their shared bbox centre sits on the root origin.
// Shifts the single top-level mesh (everything else is its descendant) by minus
// the world-space centre, expressed in the root's local frame.
function recentreMeshOnRoot(meshes, worldCentre, B) {
  const top = meshes[0];
  const parent = top.parent;
  // worldCentre is in world space; the root is at the origin with identity
  // rotation at this point, so a direct local shift by -centre re-centres it.
  const local = parent ? B.Vector3.TransformCoordinates(
    worldCentre, B.Matrix.Invert(parent.getWorldMatrix()),
  ) : worldCentre;
  top.position.subtractInPlace(local);
}

// Load the HEALTH PACK (medkit) beside the plane on the terrain. Normalised small
// by its own longest axis, given a slight emissive so it catches the eye, a yaw
// so it isn't axis-aligned, and bedded on the ground. VISUAL-ONLY set-dressing —
// not wired into the pickups heal system (flagged as a follow-up). `planeCenter`
// is the plane's placed planar centre ({x, z}); the medkit sits at planeCenter +
// HEALTH_PACK.offset. No collider, no AI footprint.
export async function loadHealthPack(scene, shadow, heightAt, planeCenter) {
  const cfg = HEALTH_PACK;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "healthPack_root", cfg.size,
  );

  // Re-centre the mesh under the root so it hovers + spins about its own centre.
  root.computeWorldMatrix(true);
  const scaled = worldBounds(B, meshes);
  recentreMeshOnRoot(meshes, scaled.min.add(scaled.max).scale(0.5), B);

  meshes.forEach((m) => {
    if (!m.material || !m.material.emissiveColor) return;
    m.material.emissiveColor = new B.Color3(cfg.emissive.r, cfg.emissive.g, cfg.emissive.b);
  });

  const x = planeCenter.x + cfg.offset.x;
  const z = planeCenter.z + cfg.offset.z;
  const baseY = heightAt(x, z) + cfg.hoverHeight;
  root.position.set(x, baseY, z);
  root.computeWorldMatrix(true);

  // Self-contained bob + spin (collectible style), framerate-independent.
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    root.position.y = baseY + Math.sin(t * cfg.bobSpeed) * cfg.bobAmplitude;
    root.rotation.y += cfg.spinSpeed * dt;
  });

  return { root, meshes, position: { x, z } };
}

// Load the BOAT — THE GOAL (design/map.json). The rusty fishing boat floats IN
// THE SEA just off the north beach tip, normalised by its own longest axis to
// BOAT.targetLength, yawed so the STERN points out to sea (~10° off the axis),
// and dropped so only waterlineFraction of the hull beds below the sea surface
// (riding the waterline, not half-sunk). At anchor it BOBS gently: a slow Y sine
// plus a slight pitch/roll sway, both framerate-independent and subtler/slower
// than the GPS hover. Static scenery + a shadow caster. Returns the root + its
// planar centre so game.js can run the WIN proximity check.
export async function loadBoat(scene, shadow, heightAt, seaLevel) {
  const cfg = BOAT;
  const { B, root, meshes } = await loadStaticProp(
    scene, shadow, cfg, "boat_root", cfg.targetLength,
  );

  root.rotation = new B.Vector3(0, cfg.yaw, 0);

  const x = cfg.position.x, z = cfg.position.z;
  root.position.set(x, seaLevel, z);
  root.computeWorldMatrix(true);

  // Riding draft: drop so the hull bottom sits waterlineFraction*hullHeight
  // below seaLevel — the hull rides the waterline rather than sitting sunk.
  const posed = worldBounds(B, meshes);
  const hullHeight = posed.max.y - posed.min.y;
  root.position.y += seaLevel - posed.min.y - cfg.waterlineFraction * hullHeight;
  root.computeWorldMatrix(true);

  // Gentle at-anchor motion about the placed rest pose: slow vertical bob +
  // slight pitch/roll sway. Pitch and roll run at different phases so the deck
  // describes a lazy circle instead of a metronome tick. Framerate-independent
  // via engine deltaTime, mirroring the GPS hover pattern but slower + subtler.
  const restY = root.position.y;
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    root.position.y = restY + Math.sin(t * cfg.bobSpeed) * cfg.bobAmplitude;
    root.rotation.x = Math.sin(t * cfg.swaySpeed) * cfg.swayAmplitude;
    root.rotation.z = Math.sin(t * cfg.swaySpeed * 0.8 + 1.3) * cfg.swayAmplitude; // first-pass for owner eyeball
  });

  return { root, meshes, position: { x, z } };
}
