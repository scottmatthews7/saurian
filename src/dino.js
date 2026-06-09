// Loads a Quaternius dino glb and wraps it with a simple animation state
// machine. All six models share the clip set Idle/Walk/Run/Jump/Attack/Death,
// matched by substring so we don't depend on the species prefix.

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

  res.meshes.forEach((m) => {
    m.receiveShadows = true;
    if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) {
      shadow.addShadowCaster(m);
    }
  });

  // Build clip lookup by substring.
  const clips = {};
  for (const key of CLIP_KEYS) {
    const g = res.animationGroups.find((a) => a.name.includes("_" + key));
    if (g) { g.stop(); clips[key] = g; }
  }

  const dino = {
    kind, root, clips,
    meshes: res.meshes,
    skeleton: res.skeletons[0] || null,
    current: null,
    scale,
    play(name, { loop = true, speed = 1 } = {}) {
      const g = clips[name] || clips.Idle;
      if (!g) return;
      if (this.current === g && g.isPlaying) { g.speedRatio = speed; return; }
      if (this.current) this.current.stop();
      g.speedRatio = speed;
      g.start(loop, speed, g.from, g.to, false);
      this.current = g;
    },
    dispose() { res.meshes.forEach((m) => m.dispose()); root.dispose(); },
  };
  dino.play("Idle");
  return dino;
}
