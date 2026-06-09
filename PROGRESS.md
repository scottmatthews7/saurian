# Progress

## Done (session 1)
- **Engine chosen:** Babylon.js 8.x, vendored in `lib/` (no build step). See `DECISIONS.md`.
- **Assets:** 6 CC0 Quaternius animated dino glbs in `assets/models/`
  (raptor, trex, triceratops, stegosaurus, apatosaurus, parasaur). All share clip set
  Idle/Walk/Run/Jump/Attack/Death (matched by substring).
- **World** (`src/world.js`): procedural rolling terrain w/ flattened play area + hill rim,
  hemispheric + directional light, soft shadows (2048, blur ESM), exp2 fog, gradient skydome,
  full day/night cycle (sun arc, sky/fog/intensity tint), scattered instanced trees + rocks
  (with collisions) + grass tufts.
- **Player** (`src/player.js`): third-person raptor. WASD camera-relative, Shift sprint,
  Space jump (gravity), click/J bite. `moveWithCollisions` ellipsoid, arena clamp, smoothed
  yaw, follow ArcRotateCamera with smoothing. Health + i-frames + death.
- **AI** (`src/ai.js`): T-Rex predator FSM (patrol -> chase -> attack) with sight/lose-interest
  ranges, contact bite damage, difficulty speed ramp, takeable damage + death. Herd of 9
  herbivores (4 species) that wander and flee nearest threat (player or trex).
- **Eggs** (`src/eggs.js`): 8 glowing bobbing collectible eggs w/ point lights, central nest
  torus. Walk over to carry, return to nest to bank. Win at 6 banked.
- **Game loop** (`src/game.js`): orchestration, fixed-ish dt, ACES tonemap + bloom + FXAA
  pipeline, start/win/lose banners, R to restart, HUD wiring, difficulty waves every 30s.
- **HUD** (`src/hud.js` + `index.html`): health bar, T-Rex health bar, egg counter, carry hint,
  objective pill, full-screen banners, styled loading screen.
- **Config** (`src/config.js`): all tunables centralised, no scattered magic numbers.

## Verified
- Serves via `python3 -m http.server` (tested on :8124). `index.html` + glbs return 200.
- Loads clean in Chrome: 459 meshes, 66 animation groups (11 dinos x 6 clips), ~95 FPS,
  console clean except a harmless favicon 404. Fixed one bug (clobbered camera observable).
- NOTE: live screenshots were unreliable this session — several *other* Claude instances
  share the same Chrome and kept navigating my tabs to their ports (8011/8211). The eval-based
  checks above ran against the correct page (8124) before contention.

## Next (session 2)
- **Visual verification:** grab a clean gameplay screenshot (use an isolated browser context
  or run when peers are idle) and confirm dinos render at sane scale/orientation. Quaternius
  models sometimes face -Z; if the raptor runs backwards, flip `dino.root` 180° in `dino.js`
  or negate yaw.
- **Tune scale/ground contact:** confirm each species sits on the terrain (feet not floating/
  sunk). `heightAt` is duplicated in `world.js` (closure) — fine, but verify it matches the
  mesh deform exactly. Player ground-snap uses `heightAt`, good.
- **Juice:** footstep dust, egg pickup pop + sound, bite hit flash on T-Rex (hitFlash field
  exists but isn't rendered yet — tint material emissive when >0), camera shake on damage,
  low-health vignette.
- **Audio:** ambient loop + roar/bite/pickup SFX (CC0). Add a mute toggle.
- **Minimap / compass** pointing to nearest egg and the nest.
- **Balance pass:** play a full round, tune speeds/health/egg count/win target.
- **Stretch:** multiple T-Rexes on later waves; herbivore charge-back (triceratops);
  stamina for sprint; pause menu.

## Run it
```
cd /Users/scottmatthews/personal_repos/dino-arena-a
python3 -m http.server 8124
# open http://localhost:8124/
```
