# Saurian — session handoff (2026-06-12)

Read this first, then `USER_WISHLIST.md` (priorities) and `HIPOLY_PIPELINE.md` (dino baking).
Owner: Scott. Style: British English, concise/telegraphic, direct, no pleasantries.

## What this is / how to run
- Babylon.js browser dino-survival game. ES modules, **static-served, no build step**.
- Run: `python3 -m http.server 8011` in the repo root → open **http://127.0.0.1:8011/**. Hard-reload Cmd-Shift-R to pick up edits (files served live from disk).
- Owner tests in their OWN browser on 8011. Don't kill their Chrome or their 8011 server. Clean up stale headless-chrome shells from agents.

## Git state — IMPORTANT
- On branch **`session-dino-and-spawn-props`** (off main). One commit landed:
  **`2567063`** — the DINO work only (ai.js, dino.js, triceratops/brachiosaurus
  hi-poly glbs, tools/measure_stride.mjs + glb_bones.mjs). Pre-commit hooks pass
  (note: codespell rejects "brach" — write "brachiosaurus").
- **Everything else is still uncommitted** in the working tree: the island remap
  (world.js, config.js ISLAND/biomes/grass, game.js boat+win, setdressing.js) AND
  the spawn props (pilot/GPS/health). Owner explicitly **held the island/props** —
  they're ONE inseparable rewrite across 4 files (props reference SPAWN + share diff
  hunks with the boat/win), so they commit together as the "new world" unit once the
  island's signed off. Don't try to peel them apart.
- Cleanup done this session: deleted dead test-harness HTMLs + `src/procmesh/dreadnoughtus.js`;
  archived pre-bake source meshes to **`assets/reference/`** (trex_hi/triceratops_hi/brachiosaurus_hi).
- Owner reviews animations/look in-browser BEFORE any commit. Don't commit unprompted.
- When you commit: branch off main first; **selective `git add` only (never `-A`)**;
  **NO `Co-Authored-By` trailers**; `assets/` is excluded from pre-commit hooks.

## NEW canonical MAP SPEC (`design/`) — the next big task
The owner redesigned the island; it is specified (not yet built in-game). Authoritative:
- **`design/map.grid.json`** — a **1-unit biome GRID** (1 cell = 1u = 0.9m), 492×972,
  RLE rows of single-char codes (legend inside). Each cell = exactly one biome.
  Impassable codes: `~` sea, `J`/`j` jungle tree-wall, `M` mountain. Playable = any
  non-impassable cell.
- **`design/map.json`** — units, legend, **assets** (glb + world x,z + note),
  **territories** (12, centre+radius), **spawn**, **muddyPath** waypoints, **playableBoundary**.
- **`design/MAP_SPEC.md`** — the detailed human description (read this).
- **`design/map.svg`** — colour render/preview.
- **`tools/gen_map.mjs`** — regenerates all three from the zone spec (organic blobs
  rasterised to the grid). Edit the spec there + re-run. `tools/map_svg.mjs` reads SVG back.
Layout S→N: clearing (south, plane/pilot/gps/health) ⟶ impassable jungle tree-wall
(muddy path = only exit) ⟶ lush savannah crossing ⟶ forest(W)/swamp(E) ⟶ impassable
mountains hugging the rocky valley/pass ⟶ desert ⟶ beach + **boat moored on it (the
win)**. Island ≈ 0.86 km N–S. Assets incl. `raptor_nest.glb` in the jungle.
**TASK: implement `world.js` from this spec** (build terrain/biome from the grid,
block impassable cells, place assets, spawn in the clearing, win at the boat).
NB: nothing has been reverted. The game currently still runs the **remap island**
(the agent's shrunk savannah/mountains/boat island), sitting UNCOMMITTED in the
working tree (`world.js`/`config.js`/`game.js` modified). This grid spec is the NEXT
iteration that will replace it once implemented — until then the remap island stands.
See `design/MAP_SPEC.md` §"Implementing it".

## What got done this session (all uncommitted)
**Dinos (`src/ai.js`, `src/dino.js`):**
- Scale anchored to human (2u≈1.8m). T-Rex stays **16u** (`TREX_RENDER_HEIGHT`; bbox is tail-inflated → ~5.75u standing = lifesize, DON'T shrink it). Brach (apatosaurus slot) **20u**, stego 4.2, tricer 3.2, parasaur 3.3. `HERB_HEIGHTS` in ai.js.
- **Animation-paced locomotion** (fixes foot-slide): `measureGaitWorldSpeed` in dino.js measures each clip's support-foot ground speed at load; `gaitRate()` in ai.js plays clips at `moveSpeed/gaitSpeed` so feet plant at any speed. `LOCO_SPEED_SCALE` slows heavy herbivores.
- **Obstacle jitter fix**: dinos translate along smoothed `facing` (not raw dir) + `pushOutOfObstacles()` hard footprint clamp.
- Brach **always walks** (never runs). T-Rex **never targets brach** (`pickPrey` skips apatosaurus). Brach spawns in **herds of 4-5** (`createHerd` + `nextWanderTarget` + `HERD_*` consts).
- **Death pose**: `dino.die()` topples the rig onto its side + settles (the baked Death clips are in-place); `dino.revivePose()` resets on respawn. `DEATH_FALL_SECONDS`/`DEATH_ROLL` in dino.js.
- Brach wired into the sauropod slot: `MODELS.apatosaurus = brachiosaurus_hi_anim.glb`, removed from `SPECIES_LOOK`, `DINO_VARIANTS.brachiosaurus` disabled.

**Hi-poly dinos (assets/models, via Blender bake — see HIPOLY_PIPELINE.md):** trex/raptor/triceratops/brachiosaurus `_hi_anim.glb`. Triceratops front-leg scissor was re-baked (world-X mirror on the 8 front-leg bones). All quat-continuity-fixed (`tools/fix_quat_continuity.mjs` — MANDATORY after any bake).

**Set-dressing (`src/setdressing.js`, `src/game.js`, `src/config.js`):** crashed plane (2×, 18m), prone dead pilot, floating+spinning GPS (upright, ~0.95u), floating health pack (visual-only), stego skeleton, old tree.

**Audio (`src/config.js`):** `vocalFalloffRange` + `bigStepRange` → 6u (only audible up close, owner's "~5m").

**Island remap (`src/world.js`, `src/config.js`, `game.js`, `setdressing.js`) — done by a background agent:**
- Linear portrait escape island, S→N, **1650u span ≈ 2.3min** traverse. `landFactor()` mask. Biomes S→N: jungle (spawn) → forest → grassland + lake/swamp → desert → rocky pass → beach → sea → **boat** (north tip). Reach within 16u of `fishing_boat.glb` → "YOU ESCAPED" win.
- Plane in an open **clearing**; dense jungle rings it; winding ~6u **muddy path** is the only exit north.
- ALL procedural trees replaced by instanced downloaded packs (`BIOME_TREES`, extensible): jungle_tree (banyan), monstera, forest_trees; fern/geranium understory; lupine grassland flowers.
- **Grass reverted to the ORIGINAL HEAD olive-sage palette** (`ENV.grassTint [0.66,0.72,0.52]`) + matte material — the agent had wrongly recoloured it; restored verbatim.
- Perf: distance-cull all scatter (~70u), grass sways only within 55u, frozen static matrices, no scatter shadows. Territories re-placed to the new biomes (config `TERRITORY`).

Verified: clean load, **zero console errors**. Screenshots in `~/Desktop/saurian-map/`.

## Open / next (in rough priority)
1. **"Can't all load" → asset-budget / LOD / streaming pass** (USER_WISHLIST P1). Owner REVERTED the downloadable-app idea (2026-06-12) — STAYS A WEB APP, no Tauri/Electron. Reduce what loads at once (cap assets, stream the far island, LOD distant scatter). Owner OK with 1-2min load. Meaty — scope as its own effort.
2. **Raptor patrol cohesion** (task #19, in_progress): chase-circling is fixed, but raptors still wander SOLO when not chasing. Give the pack a shared roaming centre (reuse `nextWanderTarget`/herd pattern) so they patrol together.
3. **Legacy-map systems** (`src/eggs.js`, `src/tools.js`, `src/aquatic.js`, `src/minimap.js`): still assume the OLD radial/eastern-ocean map — eggs/thrown-tools may land in the sea, lake-lurker patrols a stale band. Port them onto `landFactor`. (Eggs are deprecated — boat-win supersedes.)
4. **Licence audit before public ship**: boat, jungle/forest tree packs, HD foliage (fern/geranium/lupine), soldier/pilot, GPS are download/Sketchfab-sourced — unknown licences. Verify + credit in `CREDITS.md`. JW Primal Ops / "Primal Carnage" rips must NOT ship.
5. Health pack is **visual-only** — wire it as a functional heal pickup. GPS "unlocks radar" gameplay (spec) not wired.

## Conventions / gotchas
- **No magic numbers without sign-off**; many current tuning values are first-pass for owner eyeball: `LOCO_SPEED_SCALE`, `HERD_*`, `DEATH_FALL_SECONDS`/`DEATH_ROLL`, `HERB_HEIGHTS`, ISLAND dims, jungle density.
- **Background agents own their files while running** — don't concurrently edit `world.js`/`config.js`/etc. or you clobber them; coordinate via SendMessage or wait. Tell the owner NOT to reload 8011 while an agent is mid-rewriting world.js (they'll see broken WIP).
- Headless-Chrome screenshots can't show foot-slide / animation vibration (playback artifacts) — only frozen frames; verify those in the live engine or have the owner eyeball.
- `tools/measure_stride.mjs` measures gait speeds offline (note: unreliable for inverse-bind-scaled rigs like the raptor — the in-engine measurement in dino.js is the source of truth).
- `tools/island_verify.mjs` (new) — headless island verification harness.

## Useful commands
- Bone/clip dump: `node tools/glb_bones.mjs <file.glb>`
- Quat-continuity fix (after every bake): `node tools/fix_quat_continuity.mjs assets/models/<x>.glb`
- Gait measure: `node tools/measure_stride.mjs <glb...>`
