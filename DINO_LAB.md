# Dino-lab — procedural dino → in-game, end-to-end

How to take a procedural swept-loft creature and get it **animating in the game**
on a Quaternius glb rig, plus how to verify it. This is the repeatable process; a
future session should start here rather than rediscovering it.

## The pipeline (what makes a procmesh animate in-game)

1. **Build** the creature in `src/procmesh/<species>.js` — one continuous swept
   loft per fleshy mass (`loft-core.mjs`), a separate sculpted skull, merged by
   material. Export `buildCreature(scene, opts)`.
2. **Tag + describe for skinning** — set `root.metadata.skin`:
   - `skinnedMeshes`: the merged meshes the rig deforms; each carries a per-vertex
     `metadata.partIds` array (which body part each vertex belongs to).
   - `headMeshes`: rigid bits (eyes/pupils) baked onto the Head bone.
   - `boneRest`: **{ boneName: [x,y,z] }** — every glb bone's rest position in OUR
     model space (`.L` mirrors `.R`). Names match the glb's Quaternius rig.
   - `parts`: the part-id enum (BODY/HEAD/ARM_R/ARM_L/LEG_R/LEG_L).
   Parts gate which bones a vertex may bind to (`PART_BONES` in `glb-skin.mjs`,
   keyed by bone name — shared across species because Quaternius reuses names).
3. **Register** in `src/dino.js` → `PROC_BUILDERS[kind]`. The loader builds the
   procmesh, calls `skinProceduralToRig`, hides the low-poly glb, and the glb's own
   skeleton + clips (Idle/Walk/Run/Jump/Attack/Death) drive our mesh.
4. **Scale**: the visible mesh is OURS, so normalise by our model height
   (`targetHeight / ourMeshHeight`), NOT the glb's — a procmesh built at a different
   unit scale comes out tiny/huge otherwise. (T-Rex is the exception: it was
   authored at glb-native scale, so it keeps the glb-height path.)

`glb-skin.mjs` reads `boneRest` from metadata (falling back to its built-in T-Rex
table), builds a target skeleton refit onto our anatomy, skins by proximity within
each part, and live-mirrors the source bone poses every frame.

## ⭐ Better next time: build the skin layer ON the rigged glb

The raptor was built standalone at an arbitrary unit scale, then retrofitted to the
rig — so proportions/scale didn't match and needed correcting. **Next time: import
the rigged glb FIRST, read its bone rest positions, and build the procedural mesh
directly around those joints.** Then dimensions match from the start, the
`boneRest` table falls out of the glb itself, and iteration is much faster.

## ⭐ Future priority — map the remaining core dinos onto existing rigs

Don't author a bespoke rig per species. Reuse a Quaternius glb rig whose skeleton
is close, skin the procedural mesh onto it, and adjust in-game:
- **Scale** up/down per species (e.g. **Dreadnoughtus** huge off a sauropod/biped
  rig; the AI already scales the root).
- **Limb/segment lengths** via the `boneRest` table and/or a per-axis `stretch`
  (see `DINO_VARIANTS` in `config.js`) so a reused rig reads as a different animal.
Remaining to wire this way: **Dreadnoughtus, Spinosaurus, Therizinosaurus,
Quetzalcoatlus** (Velociraptor + T-Rex done; Plesiosaur swims, separate path).

## Verify — `tools/dino-lab.html`

Serve the repo (`python3 -m http.server 8011`) and open:

```
tools/dino-lab.html?module=velociraptor.js&glb=assets/models/raptor.glb&clip=Walk&palette=chestnut&mode=both
```

- `module` procmesh under `src/procmesh/` · `glb` rigged asset · `clip` substring
  (Walk/Run/Idle/Attack/Jump/Death) · `palette` colourway · `mode` `ours|glb|both`
  (both = our skinned mesh beside the source glb, animating together) · `t` freezes
  at a cycle fraction `0..1` (omit to play live; when set, title flips to `READY`
  for a headless screenshot driver).

Headless still (cache-safe Chrome, software GL):

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --use-gl=swiftshader --enable-unsafe-swiftshader --disable-gpu --no-sandbox \
  --window-size=1100,560 --user-data-dir=/tmp/dinolab --virtual-time-budget=11000 \
  --screenshot=/tmp/out.png \
  "http://127.0.0.1:8011/tools/dino-lab.html?mode=both&clip=Walk&t=0.45"
```

Check: limbs bind to the right bones (no belly-grabs-leg), feet plant, head/tail
follow, scale matches the glb, clip plays cleanly.
