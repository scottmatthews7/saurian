# Hi-poly dino pipeline — retarget + bake downloaded models onto our clips

How we turn a **downloaded, textured, rigged-but-CLIP-LESS** dinosaur glb into a
drop-in animated game asset, by baking our Quaternius clips onto the model's OWN
rig (keeping its mesh, texture and artist skin weights). Proven on the T-Rex
(`assets/models/trex_hi_anim.glb`, shipped). This is the standard route for every
hi-poly model from here on.

## Why this and not the alternatives
- The downloaded "accurate" models have **real UVs + painted textures + proper rigs
  (Eye/Jaw bones)** and 10–30× the polys of the low-poly Quaternius set — but **no
  animation clips**, and their rigs don't match Quaternius bone names.
- Re-skinning the mesh onto our Quaternius rig by proximity (the procmesh route)
  **discards the artist weights → legs/hips tear**. Don't do that for these.
- Keeping the model's own rig + weights and **baking** our clips onto it gives
  flawless deformation and a clean glb that `loadDino` plays natively.

## Tools
- Blender 5.1+ headless: `/Applications/Blender.app/Contents/MacOS/Blender --background --python <script.py>`
- `tools/glb_bones.mjs <file.glb>` — dumps a glb's bone hierarchy + rest world
  positions + clip names (no browser). Use it to read both rigs.

## The clip-source map (which Quaternius rig drives which hi model)
Each hi model borrows the clips from the Quaternius rig with the closest body plan:

| in-game kind | hi-poly source (Downloads) | clip donor (assets/models) | output |
|---|---|---|---|
| trex | accurate_tyrannosaurus_rex | trex.glb | trex_hi_anim.glb ✅ shipped |
| raptor | velociraptor_accurate_rigged_dust_devil_skin | raptor.glb | raptor_hi_anim.glb |
| triceratops | accurate_triceratops_horridus | triceratops.glb | triceratops_hi_anim.glb |
| apatosaurus (sauropod slot) | accurate_brachiosaurus_altithorax | apatosaurus.glb | brachiosaurus_hi_anim.glb |
| (later) spinosaurus | accurate_spinosaurus | trex.glb | — |
| (later) giganotosaurus | accurate_giganotosaurus | trex.glb | — |

Quaternius clip set (per rig): `<Species>_{Idle,Walk,Run,Jump,Attack,Death}`.

## The Blender method (per model)
1. **Import the TARGET with `guess_original_bind_pose=False`.** ⚠️ CRITICAL. These
   models store verts at a large "bind" scale and deform down via the inverse-bind
   matrices, with degenerate leaf bones. Blender's default import keeps bind≠rest
   and the mesh explodes when any bone rotates. `guess_original_bind_pose=False`
   collapses bind==rest at the correct display scale — then baked rotations deform
   correctly and re-export round-trips. (glTF-Blender-IO PR #941.)
2. Import the SOURCE (Quaternius clip donor) glb — its named bones + 6 actions.
3. **Build the bone map** source→target. The hi rigs have anonymised bone names
   (`n50_028`…), so identify the target's chains STRUCTURALLY from the hierarchy +
   rest positions: the long root→head chain = spine/neck/head; symmetric down-going
   chains off the root = the legs; the back-going chain = the tail; small
   upper-front chains = the arms. Map the Quaternius named bones (Hips/Torso/
   Shoulders/Neck/Head, Tail1-5, Back/Front Up/Low Leg + Foot .L/.R) onto them.
4. **Retarget, rotation-only, per bone per frame**, in the bone's local basis:
   `tgt.matrix_basis_rot = C · src.matrix_basis_rot · Cᵀ`, where
   `C = tgtRestWorldRot⁻¹ · srcRestWorldRot` (precompute once per mapped pair).
   This conjugates the source's local-to-rest rotation into the target's rest
   frame, handling the differing rest poses. **Do NOT drive the root/pelvis
   orientation** (drive Hips only) — avoids a global tilt; leave root translation
   to the game.
5. **Bake** each retargeted action onto the target armature (visual keying, clear
   constraints). **Name the actions** so `loadDino` matches: it looks for the
   substring `_Walk`/`_Run`/`_Idle`/`_Jump`/`_Attack`/`_Death` (e.g. `TRex_Walk`).
6. **Export** only the target armature + mesh + 6 baked actions → `<model>_hi_anim.glb`
   (glTF, +Y up, keep skinning + texture; drop the source armature).

## Wire into the game (`src/dino.js`)
- `MODELS.<kind> = "assets/models/<model>_hi_anim.glb"`.
- Remove `<kind>` from `PROC_BUILDERS` (if present) so it loads natively via its
  baked clips — no procmesh swap, no SPECIES_LOOK recolour.
- Check `FACING_OFFSET[kind]` (these models face +Z/head-forward = 0) and that
  `targetHeight` scaling looks right; the model loads at its own height → target.

## Verify before committing
Serve the repo (`python3 -m http.server 8011`) and load via the real path:
`glb-look-test.html?kind=<kind>&clip=Walk&t=0.4&alpha=0&beta=1.4` (frozen) — confirm
clean deformation (no tears/noodles), upright body, correct facing, texture present,
all 6 clips. The T-Rex GIF dump trick (a `__grab(t)` helper stepped over ~24 frames,
stitched with ffmpeg) gives looping previews. **Owner reviews the animation before
any commit.**

## Licence — check before shipping each model
The "accurate_…" (hsejira) Sketchfab originals are typically **CC-BY 4.0** → fine
with attribution in `CREDITS.md`. Some Sketchfab uploads are ripped commercial
("Primal Carnage") assets — **do not ship those**. Verify each model's Sketchfab
page before it goes in the public build.
