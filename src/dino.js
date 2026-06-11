// Loads a Quaternius dino glb and wraps it with a simple animation state
// machine. All six models share the clip set Idle/Walk/Run/Jump/Attack/Death,
// matched by substring so we don't depend on the species prefix.

import { FACING_OFFSET, DINO_VARIANTS } from "./config.js";
import { buildCreature } from "./procmesh/trex.js";
import { buildCreature as buildRaptor } from "./procmesh/velociraptor.js";
import { skinProceduralToRig } from "./procmesh/glb-skin.mjs";
import { makeHideMaterial, applyCountershade } from "./procmesh/hide.mjs";

// Per-INDIVIDUAL variation so a herd doesn't look like clones: each spawn draws a
// size from a normal distribution about the species mean, and a small colour/shade
// jitter. SIZE_SIGMA = std-dev as a fraction of mean height (clamped to +/-2 sigma).
const SIZE_SIGMA = 0.12;       // ~12% size spread per species
const COLOR_JITTER = 0.10;     // +/-10% per-individual hide-tone variation
// Approx standard normal via the central-limit trick (sum of 3 uniforms), clamped.
function gaussian() {
  const n = (Math.random() + Math.random() + Math.random() - 1.5) / 0.866; // ~N(0,1)
  return Math.max(-2, Math.min(2, n));
}

// Smooth-shade a flat low-poly mesh WITHOUT welding (welding would corrupt skin
// weights): accumulate each triangle's face normal into a bucket keyed by vertex
// POSITION, then assign every vertex the averaged normal for its position. Split
// vertices at the same point thus share a normal => smooth shading; geometry and
// matricesIndices/Weights are untouched.
function smoothNormalsByPosition(B, mesh) {
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
  const idx = mesh.getIndices();
  if (!pos || !idx) return;
  const n = pos.length / 3;
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const acc = new Map(); // position key -> [nx,ny,nz]
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // face normal (area-weighted)
    for (const vi of [a, b, c]) {
      const k = key(vi);
      const e = acc.get(k) || [0, 0, 0];
      e[0] += nx; e[1] += ny; e[2] += nz; acc.set(k, e);
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const e = acc.get(key(i)) || [0, 1, 0];
    const len = Math.hypot(e[0], e[1], e[2]) || 1;
    out[i * 3] = e[0] / len; out[i * 3 + 1] = e[1] / len; out[i * 3 + 2] = e[2] / len;
  }
  mesh.setVerticesData(B.VertexBuffer.NormalKind, out);
}

// HERO predators wear a procedural swept-loft mesh skinned onto the glb's own rig +
// clips (glb-skin.mjs) — worth the cost where a smooth high-poly silhouette matters.
// Every OTHER species keeps its glb mesh, just SMOOTH-SHADED + recoloured + given
// eyes (see SPECIES_LOOK) — clean, cheap, ships. (Spino's sail comes later.)
const PROC_BUILDERS = {
  // T-Rex now ships as the hi-poly textured glb with baked clips (MODELS.trex), so
  // it loads natively — no procmesh swap. (trex.js procmesh kept for reference.)
  raptor: (scene) => buildRaptor(scene, { palette: "chestnut" }), // jungle/forest colourway
};

// Look for glb-rendered species: flat recolour + eye placement on the Head bone.
// `color` = hide albedo; `eye` = {size, fwd, out, up} offset from the Head bone in
// head-local space (metres, pre-scale); `dark` darkens the eye. Tuned per rig.
// color = mid hide tone; dorsal/belly derived if omitted. eye offsets are
// FRACTIONS of the head-neck bone distance (scale-invariant). scaleSize = scale
// texture cell px (smaller => finer scales). Tuned per rig in dino-lab.
const SPECIES_LOOK = {
  // color = mid hide tone; scaleSize = scale-texture cell px. (No eyes added — the
  // glb head already has a sculpted eye-socket dimple.) dorsal/belly auto-derived.
  apatosaurus: { color: [0.36, 0.32, 0.26], scaleSize: 18 },  // Dreadnoughtus warm grey-brown
  brachiosaurus: { color: [0.46, 0.50, 0.55], scaleSize: 18 },
  triceratops: { color: [0.42, 0.35, 0.27], scaleSize: 14 },
  stegosaurus: { color: [0.40, 0.42, 0.30], scaleSize: 14 },
  parasaur: { color: [0.48, 0.39, 0.27], scaleSize: 13 },
};

// Attack2/Attack3 are optional melee variants: only the human ships extra
// strike clips (punch left / kick), so for the dinos those keys simply never
// resolve and the single Attack clip is used.
const CLIP_KEYS = ["Idle", "Walk", "Run", "Jump", "Attack", "Attack2", "Attack3", "Death"];

const MODELS = {
  raptor: "assets/models/raptor.glb",
  trex: "assets/models/trex_hi_anim.glb", // hi-poly textured T-Rex, Quaternius clips retargeted+baked onto its own rig (see HIPOLY_PIPELINE.md)
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
  const sizeMul = 1 + gaussian() * SIZE_SIGMA; // per-individual size (normal dist about the species mean)

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

  // PROCEDURAL T-REX: the headline predator wears our high-quality swept-loft
  // mesh (procmesh/trex.js, ~63k verts, smooth skin) instead of the low-poly glb,
  // skinned onto the glb's OWN skeleton + clips so the existing AI clip playback
  // drives it. Gated to kind==='trex' only — every other species keeps its glb
  // mesh. The glb's visual meshes are hidden but its skeleton/animationGroups stay
  // live (they deform our mesh via the retarget in procmesh/glb-skin.mjs).
  let procSkin = null;       // { skinned, dispose } when we swapped in our mesh
  if (PROC_BUILDERS[kind] && res.skeletons[0]) {
    const procRoot = PROC_BUILDERS[kind](scene);
    // The T-Rex procmesh is authored at glb-native scale, so its glb-height scale
    // (above) is correct. Other procmesh kinds (e.g. the raptor) are built at their
    // own unit scale, so re-normalise by OUR model height — the visible mesh —
    // else they come out tiny/huge. Measured before skinning, procRoot at identity.
    if (kind !== "trex") {
      let pmin = new B.Vector3(Infinity, Infinity, Infinity);
      let pmax = new B.Vector3(-Infinity, -Infinity, -Infinity);
      procRoot.getChildMeshes().forEach((m) => {
        if (!m.getBoundingInfo || (m.getTotalVertices && !m.getTotalVertices())) return;
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        pmin = B.Vector3.Minimize(pmin, bb.minimumWorld);
        pmax = B.Vector3.Maximize(pmax, bb.maximumWorld);
      });
      const ourH = Math.max(0.001, pmax.y - pmin.y);
      const pscale = targetHeight / ourH;
      if (st) root.scaling.set(pscale * (st.x ?? 1), pscale * (st.y ?? 1), pscale * (st.z ?? 1));
      else root.scaling.setAll(pscale);
    }
    const glbRenderable = res.meshes.filter(
      (m) => m.getTotalVertices && m.getTotalVertices() > 0,
    );
    // Reference-relative retarget: read source bone poses relative to the GAME
    // root (the node the AI scales/moves/yaws) and parent our mesh under it. This
    // strips the gameplay transform out of the retarget while KEEPING the glb's
    // glTF Y-up conversion baked into __root__ (which sits below root), so the
    // mirror operates in clean Babylon world orientation exactly like the proven
    // harness. The AI's per-frame root motion then carries our mesh along via the
    // shared parent, never leaking into the rig.
    procSkin = skinProceduralToRig(scene, procRoot, {
      skeleton: res.skeletons[0],
      renderableMeshes: glbRenderable,
    }, root);
    glbRenderable.forEach((m) => m.setEnabled(false)); // hide the low-poly glb mesh
    procRoot.dispose(true, false);                     // our meshes are reparented onto the skin armature; drop only the now-empty root node (no recurse)
  }

  // Collect the renderable meshes and remember each material's base emissive
  // so a hit-flash can add to it and then restore exactly. For the procedural
  // T-Rex the visible meshes (and flash/shadow targets) are OUR skinned meshes,
  // not the now-hidden glb ones.
  // Apply the per-individual size on top of whatever scaling was set above.
  root.scaling.scaleInPlace(sizeMul);

  const flashTargets = [];
  const look = SPECIES_LOOK[kind];
  const visibleMeshes = procSkin ? procSkin.skinned : res.meshes;
  visibleMeshes.forEach((m) => {
    m.receiveShadows = true;
    if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) {
      shadow.addShadowCaster(m);
    }
    // GLB SPECIES: SMOOTH-SHADE the low-poly mesh. Quaternius meshes are
    // flat-shaded with SPLIT vertices, so we average face normals across all verts
    // sharing a position (welding would break skinning) — kills the facets while
    // leaving geometry + skin weights intact.
    if (!procSkin && m.getTotalVertices && m.getTotalVertices() > 0) {
      smoothNormalsByPosition(B, m);
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
    if (mat && mat.emissiveColor && !(look && !procSkin)) {
      flashTargets.push({ mat, base: mat.emissiveColor.clone() });
    }
  });

  // GLB SPECIES skin: replace the flat glb material with a procedural HIDE —
  // pebbly scale texture + relief + per-vertex COUNTERSHADE (dark dorsal -> pale
  // belly) + mottle, so the colour VARIES across the body (not one flat tone).
  // One material per dino (shared across its meshes); countershade is per-mesh.
  if (!procSkin && look) {
    const baseMid = (variant && variant.tint) ? [variant.tint.r, variant.tint.g, variant.tint.b] : look.color;
    // per-individual hide-tone jitter (a shared brightness shift + small per-channel)
    const shift = 1 + gaussian() * COLOR_JITTER;
    const mid = baseMid.map((c) => Math.max(0, Math.min(1, c * shift + gaussian() * 0.02)));
    const hideMat = makeHideMaterial(B, scene, kind + "_hide", { scaleSize: look.scaleSize ?? 16, rough: 0.9 + Math.random() * 0.08 });
    if (variant && variant.emissive) hideMat.emissiveColor.set(variant.emissive.r, variant.emissive.g, variant.emissive.b);
    flashTargets.push({ mat: hideMat, base: hideMat.emissiveColor.clone() });
    visibleMeshes.forEach((m) => {
      if (!m.getTotalVertices || !m.getTotalVertices()) return;
      m.material = hideMat;
      applyCountershade(B, m, mid, look.dorsal, look.belly);
    });
    // No eye spheres: the glb head already has a sculpted eye-socket dimple, which
    // reads under the hide shading. (Owner: do not add eyes.)
  }

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
      // Procedural T-Rex: stop the per-frame mirror and drop our target
      // skeleton + skinned meshes before tearing down the glb rig.
      if (procSkin) {
        procSkin.skinned.forEach((m) => m.dispose());
        procSkin.dispose();
      }
      res.animationGroups.forEach((g) => g.dispose());
      res.skeletons.forEach((s) => s.dispose());
      res.meshes.forEach((m) => m.dispose());
      root.dispose();
    },
  };
  dino.play("Idle");
  return dino;
}
