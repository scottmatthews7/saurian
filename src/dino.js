// Loads a Quaternius dino glb and wraps it with a simple animation state
// machine. All six models share the clip set Idle/Walk/Run/Jump/Attack/Death,
// matched by substring so we don't depend on the species prefix.

import { FACING_OFFSET, DINO_VARIANTS } from "./config.js";

// Attack2/Attack3 are optional melee variants: only the human ships extra
// strike clips (punch left / kick), so for the dinos those keys simply never
// resolve and the single Attack clip is used.
const CLIP_KEYS = ["Idle", "Walk", "Run", "Jump", "Attack", "Attack2", "Attack3", "Death"];

const MODELS = {
  raptor: "assets/models/raptor.glb",
  trex: "assets/models/trex.glb",
  triceratops: "assets/models/triceratops.glb",
  stegosaurus: "assets/models/stegosaurus.glb",
  apatosaurus: "assets/models/apatosaurus.glb",
  parasaur: "assets/models/parasaur.glb",
  human: "assets/models/human.glb",
};

// Resolve the glb URL for a kind. Variant species (DINO_VARIANTS) reuse a base
// kind's rigged+animated mesh (no animated CC0 model exists for them), so they
// load the base glb and get recoloured/reshaped after import.
function modelUrl(kind) {
  if (MODELS[kind]) return MODELS[kind];
  const v = DINO_VARIANTS[kind];
  if (v && MODELS[v.base]) return MODELS[v.base];
  return null;
}

// Per-kind clip-name overrides. The six Quaternius dinos share the
// `<Species>_<Key>` convention, so each logical key matches the substring
// `_<Key>` (the default below). The human (Quaternius "Adventurer") uses a
// different naming scheme — `CharacterArmature|<Clip>` — and has no Jump clip,
// so a Roll stands in for the jump leap. The human's melee is bare-handed
// punches and kicks (Attack/Attack2/Attack3 cycle per swing in the player
// controller). Each entry is the exact substring matched against an
// animation-group name.
const CLIP_ALIASES = {
  human: {
    Idle: "|Idle",     // matches CharacterArmature|Idle (not Idle_Gun etc.)
    Walk: "|Walk",
    Run: "|Run",       // CharacterArmature|Run — first match wins over Run_Left etc.
    Roll: "|Roll",     // dodge-roll — used by the DASH (not the jump: a roll
                       // frozen mid-air read as a broken half-somersault)
    Attack: "|Punch_Right",  // bare-handed melee: right punch…
    Attack2: "|Punch_Left",  // …left punch…
    Attack3: "|Kick_Right",  // …and a kick, cycled per swing
    Death: "|Death",
  },
};

// approximate native model height so we can normalise scale to a target height
const cache = {};

export async function loadDino(scene, kind, targetHeight, shadow) {
  const B = window.BABYLON;
  const url = modelUrl(kind);
  if (!url) throw new Error("unknown dino: " + kind);
  const variant = DINO_VARIANTS[kind] || null;

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
  // A variant reshapes its silhouette via a per-axis stretch on top of the
  // uniform height-normalised scale, so a reused rig reads as a different
  // species (e.g. a longer Spinosaurus body, a low broad Ankylosaurus).
  const st = variant && variant.stretch;
  if (st) root.scaling.set(scale * (st.x ?? 1), scale * (st.y ?? 1), scale * (st.z ?? 1));
  else root.scaling.setAll(scale);

  // Collect the renderable meshes and remember each material's base emissive
  // so a hit-flash can add to it and then restore exactly.
  const flashTargets = [];
  res.meshes.forEach((m) => {
    m.receiveShadows = true;
    if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) {
      shadow.addShadowCaster(m);
    }
    const mat = m.material;
    // Variant recolour: tint the base albedo and set a faint emissive so the
    // reused rig reads as its own species. Babylon glb materials are PBR
    // (albedoColor) or Standard (diffuseColor) — handle both. The emissive base
    // is captured AFTER tinting so the hit-flash still adds/restores correctly.
    if (mat && variant) {
      if (variant.tint) {
        const c = new B.Color3(variant.tint.r, variant.tint.g, variant.tint.b);
        if (mat.albedoColor) mat.albedoColor = c;
        if (mat.diffuseColor) mat.diffuseColor = c;
      }
      if (variant.emissive && mat.emissiveColor) {
        mat.emissiveColor.set(variant.emissive.r, variant.emissive.g, variant.emissive.b);
      }
    }
    if (mat && mat.emissiveColor) {
      flashTargets.push({ mat, base: mat.emissiveColor.clone() });
    }
  });

  // Build clip lookup. Each logical key maps to a search substring (the
  // default `_<Key>` dino convention, overridden per-kind in CLIP_ALIASES).
  // Prefer an exact tail match (name ends with the alias) so `|Run` doesn't
  // get shadowed by `|Run_Left`; fall back to a plain substring otherwise.
  const aliases = CLIP_ALIASES[kind] || {};
  const clips = {};
  for (const key of CLIP_KEYS) {
    const needle = aliases[key] || ("_" + key);
    let g = res.animationGroups.find((a) => a.name.endsWith(needle));
    if (!g) g = res.animationGroups.find((a) => a.name.includes(needle));
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
