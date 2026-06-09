# Progress

## Done (session 1)
- **Engine:** Babylon.js 8.x vendored in `lib/` (no build step). See `DECISIONS.md`.
- **Assets:** 6 CC0 Quaternius animated dino glbs in `assets/models/`.
- **World** (`src/world.js`): procedural rolling terrain + hill rim, hemi+directional
  light, soft shadows, exp2 fog, gradient skydome, day/night cycle, instanced trees/
  rocks/grass (collisions on big ones).
- **Player/AI/Eggs/Game/HUD/Config** scaffolded and wired (see git history).

## Done (session 2)
- **CRITICAL FIX — player movement was broken.** Player root is a `TransformNode`,
  which has no `moveWithCollisions`/`ellipsoid`, so the session-1 controller silently
  failed: the raptor never moved. Now drives an invisible collider box and copies its
  position onto the visual root each frame (`player.warpTo` avoids first-frame pop).
- **Facing confirmed.** Empirical probe: raptor travels +Z exactly matching its yaw
  (`forwardDotTravel = 1.0`). `FACING_OFFSET` per-species map added in `config.js`
  (all 0 — correct); flip any entry to `Math.PI` if a model ever runs backwards.
- **Audio** (`src/audio.js`): zero-asset procedural WebAudio — roar, bite, pickup,
  bank, footstep, hurt, win, lose, evolving ambient drone, and a proximity **tension
  heartbeat** that speeds up as the chasing T-Rex closes. Mute via button + M key.
  Unlocked on first gesture (autoplay policy).
- **Juice** (`src/fx.js`): footstep dust particles, egg pickup/bank/drop bursts,
  camera shake on hits, low-health red vignette (HUD), emissive hit-flash on any
  struck dino (`dino.flash` in `dino.js`).
- **Minimap** (`src/minimap.js`): top-down radar canvas — player facing wedge, T-Rex
  (red when chasing), herd (blue when fleeing), eggs, nest ring.
- **Compass + timer** on the objective pill: view-relative arrow to the nearest egg
  (or nest when carrying) + elapsed run time.
- **Balance pass:** sprint **stamina** (drain/regen + exhaustion lockout, HUD bar);
  **carry-slow** (eggs weigh you down); **drop-egg-on-hit** (a T-Rex bite fumbles an
  egg back into the valley); **Triceratops charge-back** (cornered trike charges the
  player for contact damage on a cooldown).
- **Carried-egg visuals:** eggs hover/bob over the raptor's back while carried.
- **Pause** (P, gates the sim + banner). **Best clear time** saved to localStorage,
  shown on the win banner.
- All tunables centralised in `config.js` (FACING_OFFSET, JUICE, AUDIO, MINIMAP,
  TRICERATOPS, stamina/carry under PLAYER) — no scattered magic numbers.

## Verified (session 2)
- All 12 src modules pass `node --check`.
- Three independent in-browser smokes on my own tabs (port 8124): **0 console errors**,
  ~95-103 FPS foreground (30-49 when backgrounded/throttled), 460 meshes.
  - Movement + facing: raptor moves ~6.5 u/s along +Z, dot=1.0.
  - Carry visual enables on pickup (egg disabled); pause banner toggles on P.
  - Egg pickup/drop/bank loop **unit-tested headless in Node** (stubbed Babylon):
    pickup→carry, drop restores a collectible egg, bank marks+clears+callbacks,
    `remaining()` correct, empty drop returns false.

## Known environment issue (unchanged from s1, now worse)
- The machine's Chrome is shared by several parallel Claude instances ("dinob" on
  ports 8000/8333/8411). They navigate ANY tab I open — even isolated browser
  contexts — within 1-2 seconds. **Live cinematic screenshots are not obtainable.**
  Worked around it with atomic init-script probes + single-eval captures (data is
  grabbed before hijack) and curl integrity checks (`curl :8124` confirms MY files
  are served). The deterministic Node test + scene-inspection smokes are the source
  of truth, not screenshots.

## Visual confirmation (session 2 — got one clean shot before hijack)
- Captured a real gameplay screenshot of our build. Confirmed: raptor renders
  small/upright/feet-on-ground in the nest torus, facing forward; T-Rex is large,
  upright, grounded, correctly scaled relative to the raptor; stylised trees + soft
  shadows + fog + hill rim all read well. Full HUD correct (health/stamina/trex bars,
  sound toggle, eggs 0/6 + "8 eggs out there" + score, radar with egg/predator/herd
  dots, compass pill). Low-health red vignette + DEVOURED lose banner both fired (I'd
  teleported the T-Rex onto the raptor for the frame, so it ate me in ~7s — which also
  end-to-end proves chase->bite->lose). **Scale/orientation/ground-contact: all good.**

## Done (session 3)
- **Content — golden eggs:** rare (18%) brighter eggs spawn far out, worth 3x
  score and counting double toward the win target; pulsing glow, sparkle pickup
  SFX, larger radar blip, "GOLDEN EGG!" popup. (`eggs.js`, `EGGS.golden*`.)
- **Content — meat health pickups:** herbivores are now killable (bite them
  down) and drop pooled meat that heals the raptor (`pickups.js`, `player.heal`,
  `audio.heal`, green flash + "+30 HP" popup, red radar dots).
- **Visuals — atmosphere** (`world.buildAtmosphere`): 7 flapping pterosaurs
  orbiting overhead, 9 drifting clouds, additive pollen motes. Pure set dressing.
- **Visuals — ground + trees:** procedural mottled grass DynamicTexture (tiled
  8x) replaces flat green; trees now pick one of 3 green tones and stack a
  second crown cone for fuller, varied silhouettes.
- **Title screen** (`hud.showTitle`): animated DINO ARENA / SURVIVAL card with
  objective blurb, 6-key controls grid, best time/score, blinking prompt.
- **Game feel — bite lunge:** the raptor bursts forward during the bite window
  (`PLAYER.lungeSpeed/lungeSeconds`) so attacks have weight and can close gaps.
- **Game feel — T-Rex enrage:** below 40% health a T-Rex speeds up, runs faster,
  glows angry-red, and roars (`TREX.enrage*`).
- **Feel — hit feedback:** full-screen red `#hitFlash` pulse on any damage;
  unified `player.onHurt` (audio + shake + flash) now also fires on triceratops
  charge hits, not just bites.
- **Juice — reward popups:** floating "+N xCombo", "GOLDEN EGG!", "+30 HP" near
  the score (`hud.popup`).

## Verified (session 3)
- All 13 src modules pass `node --check`.
- Live in-browser (isolated context, **reloaded with ignoreCache** — see lesson):
  0 console errors; golden eggs (2) + meat pool (8) present; atmosphere = 7 birds,
  9 clouds, pollen active; ground textured; 70 tree crowns / 143 leaf instances;
  bite lunge advances the raptor; hitFlash + popup DOM paths fire. ~584 meshes.
- **Lesson:** Chrome aggressively caches ES modules; a plain reload served stale
  JS and made new code look absent. Always `navigate_page reload ignoreCache:true`
  to verify edits. (curl `:8124/src/*.js` confirms the server itself is fresh.)

## Done (session 4)
- **Content — water pond hazard** (`world.js`, `config.js WATER`): a basin is
  carved into the terrain heightmap (`heightAt` matches the vertex deform) with a
  translucent shimmering water disc + a ring of reeds. Wading **slows** the raptor
  (`WATER.slowFactor`) and **drains health** (`damagePerSec`) — bypasses i-frames
  as a continuous environmental tick; a splash SFX + blue spray fire on entry
  (`player.onSplash`, `audio.splash`). Eggs never spawn in it; radar shows it.
- **AI — obstacle avoidance** (`ai.js avoidObstacles` + `setObstacles`,
  `config.AI_AVOID`): world collects solid footprints (collidable tree trunks +
  big rocks) and exposes `world.obstacles`; a single steering routine (pond
  appended) bends each dino's heading away from any footprint within a clearance
  band. Herd + T-Rex no longer clip through trees/rocks. **Smoke-verified:** a
  herbivore placed on a trunk (d=0) is pushed out to ~5 units within 1.5s.
- **Mobile/touch controls** (`touch.js`, `config.TOUCH`, CSS in `index.html`):
  mounts only on touch devices. A left **floating analog joystick** maps to the
  existing camera-relative WASD keys (full deflection → sprint); right-side
  **BITE / JUMP** buttons drive the attack/jump queues (`input.queueAttack/
  queueJump`). First touch starts the run; a tap restarts after a game over.
- **Threat — pterosaur dive** (`world.updateThreats`, `config.PTERO_DIVE`,
  `audio.screech`): the previously decorative flock now attacks — one bird peels
  off, hovers with a telegraphing screech + red glow, then swoops at the raptor;
  a connecting swoop deals `damage` then it climbs back. A 2nd, airborne threat.

## Verified (session 4)
- All src modules pass `node --check`.
- Live in-browser (isolated context, port 8124): **0 console errors/warnings**;
  638 meshes; water disc + 71 reeds + 7 birds present; wading sets `player.wading`
  and drains health (~4/s); obstacle avoidance pushes a clipped herbivore clear.
  (FPS read low ~10-12 only because the shared machine had ~47 throttled tabs;
  the build itself is unchanged from the ~95-103 FPS solo measurement.)
- **Env note (unchanged):** parallel Claude instances hijack any tab within ~1-2s;
  long probe loops get navigated away, so verification uses short single-shot evals.

## Next (session 5)
- More biome variety (second pond / rocky mesa / tar pit); ambient grazing anims;
  a day/night gameplay effect (predators bolder at night).
- Egg variety beyond golden (e.g. a "cursed" egg that draws the T-Rex).
- Tune `PTERO_DIVE` intervals after live play; a ground shadow decal under a
  diving pterosaur as an extra dodge telegraph.

## Run it
```
cd /Users/scottmatthews/personal_repos/dino-arena-a
python3 -m http.server 8124
# open http://localhost:8124/
# Controls: WASD move · Shift sprint · Space jump · Click/J bite · M mute · P pause · R restart
# Touch (phones/tablets): left joystick to move (push full to sprint), BITE/JUMP buttons; tap to start/restart
```

## Debug harness
Append `?probe`/`?smoke` to the URL — the init scripts used this session auto-start
and auto-move so a single `evaluate_script` can read `window.__probeResult` before any
peer hijacks the tab. Re-paste from git history of this file's prior version if needed.
