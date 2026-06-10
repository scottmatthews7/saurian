// Loads a Quaternius dino glb and wraps it with a simple animation state
// machine. All six models share the clip set Idle/Walk/Run/Jump/Attack/Death,
// matched by substring so we don't depend on the species prefix.

import { FACING_OFFSET } from "./config.js";

const CLIP_KEYS = ["Idle", "Walk", "Run", "Jump", "Attack", "Death"];

const MODELS = {
  raptor: "assets/models/raptor.glb",
  trex: "assets/models/trex.glb",
  triceratops: "assets/models/triceratops.glb",
  stegosaurus: "assets/models/stegosaurus.glb",
  apatosaurus: "assets/models/apatosaurus.glb",
  parasaur: "assets/models/parasaur.glb",
};

// approximate native model height so we can normalise scale to a target height
const cache = {};

export async function loadDino(scene, kind, targetHeight, shadow) {
  const B = window.BABYLON;
  const url = MODELS[kind];
  if (!url) throw new Error("unknown dino: " + kind);

  const res = await B.SceneLoader.ImportMeshAsync("", "", url, scene);
  const root = new B.TransformNode(kind + "_root", scene);

  // Parent all loaded top-level nodes to our root for uniform transform.
  const loadedRoot = res.meshes[0];
  loadedRoot.parent = root;

  // Normalise scale to targetHeight using bounding box of the whole hierarchy.
  let min = new B.Vector3(Infinity, Infinity, Infinity);
  let max = new B.Vector3(-Infinity, -Infinity, -Infinity);
  res.meshes.forEach((m) => {
    if (!m.getBoundingInfo) return;
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = B.Vector3.Minimize(min, bb.minimumWorld);
    max = B.Vector3.Maximize(max, bb.maximumWorld);
  });
  const nativeH = Math.max(0.001, max.y - min.y);
  const scale = targetHeight / nativeH;
  root.scaling.setAll(scale);

  // Collect the renderable meshes and remember each material's base emissive
  // so a hit-flash can add to it and then restore exactly.
  const flashTargets = [];
  res.meshes.forEach((m) => {
    m.receiveShadows = true;
    if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) {
      shadow.addShadowCaster(m);
    }
    const mat = m.material;
    if (mat && mat.emissiveColor) {
      flashTargets.push({ mat, base: mat.emissiveColor.clone() });
    }
  });

  // Build clip lookup by substring.
  const clips = {};
  for (const key of CLIP_KEYS) {
    const g = res.animationGroups.find((a) => a.name.includes("_" + key));
    if (g) { g.stop(); clips[key] = g; }
  }

  const facingOffset = FACING_OFFSET[kind] || 0;

  const dino = {
    kind, root, clips,
    meshes: res.meshes,
    skeleton: res.skeletons[0] || null,
    current: null,
    scale,
    facingOffset,
    flashT: 0,
    // Set yaw from a gameplay heading; the per-species offset corrects models
    // whose authored forward axis differs from Babylon's +Z.
    setYaw(yaw) { root.rotation.y = yaw + facingOffset; },
    // Tint all materials' emissive toward a colour for `flashT` seconds.
    flash(seconds, color) {
      this.flashT = seconds;
      this._flashColor = color || new window.BABYLON.Color3(1, 0.3, 0.2);
    },
    updateFlash(dt) {
      if (this.flashT <= 0) return;
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT > 0 ? Math.min(1, this.flashT * 6) : 0;
      const c = this._flashColor;
      for (const t of flashTargets) {
        t.mat.emissiveColor.set(
          t.base.r + c.r * k,
          t.base.g + c.g * k,
          t.base.b + c.b * k,
        );
      }
    },
    play(name, { loop = true, speed = 1 } = {}) {
      const g = clips[name] || clips.Idle;
      if (!g) return;
      if (this.current === g && g.isPlaying) { g.speedRatio = speed; return; }
      if (this.current) this.current.stop();
      g.speedRatio = speed;
      g.start(loop, speed, g.from, g.to, false);
      this.current = g;
    },
    // Fully tear down a loaded dino. Disposing only the meshes leaks the
    // animation groups and skeleton, which accumulate across soft restarts that
    // dispose later-wave predators — so dispose those too.
    dispose() {
      res.animationGroups.forEach((g) => g.dispose());
      res.skeletons.forEach((s) => s.dispose());
      res.meshes.forEach((m) => m.dispose());
      root.dispose();
    },
  };
  dino.play("Idle");
  return dino;
}
