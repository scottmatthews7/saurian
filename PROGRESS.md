# Progress

## Done (session 17 — dinos-pass branch: roster + behaviour)
Wishlist items 3, 4, 4c, 4d. Branch `dinos-pass` (isolated worktree; coordinator
merges). Edited only: `dino.js`, `ai.js`, `config.js` (DINO section), new
`flyer.js`, a localised mesh-swap in `world.js`, minimal spawn-wiring in
`game.js`. Did NOT touch audio/player/the env.

- **(4d) RAPTOR PACK predator** (`ai.js createRaptorPack`, `config RAPTOR`): a
  3-5 raptor swarm spawns from difficulty wave 2. Each member holds a FIXED
  evenly-spaced slot on a ring (`surroundRadius`) around the player + a small
  per-member jitter, so the pack ENCIRCLES instead of stacking on one bearing;
  inside `lungeRange` it drops the slot and darts straight in. Reuses raptor.glb
  and exposes the same state shape as the T-Rex predator, so the game's predator
  list / roar / minimap / HUD all work unchanged. **Turkey-sized** per user
  feedback: `modelHeight 0.75u` (≈0.7m — verified ~37% of the human's 2.0u in
  the browser), weak swarm tuning (5 dmg/nip, 24 HP = one player bite fells one,
  1.8u reach). Distinctive vs the lone tank T-Rex.
- **(4c) Wider animated roster** (`config DINO_VARIANTS`, `dino.js`, `ai.js`):
  **HARD ASSET FINDING** — poly.pizza hosts exactly ONE animated CC0 dinosaur set
  (the Quaternius bundle we already ship all 6 of); NO animated Spinosaurus/Anky/
  Pachy/Brachio/Compso/Pteranodon exists there (verified by scraping the species
  searches + Quaternius profile + Ultimate Monsters bundle and inspecting every
  glb's animation list — the rest are static legacy meshes the wishlist forbids).
  So the roster was widened by REUSING the 6 animated rigs under a tint +
  body-stretch signature: each new species animates via the shared clip set but
  reads distinct. Herd now spans 9 species (Spinosaurus, Ankylosaurus,
  Pachycephalosaurus, Brachiosaurus, Compsognathus added), each with a
  diet/behaviour. See CREDITS.md. No new model files. (Therizinosaurus: still no
  rigged CC0 model — skipped per the wishlist.)
- **(3) Triceratops locomotion** (`ai.js`, `config TRICERATOPS`): its own crisper
  `turnLerp` 0.14 (vs herd 0.08), `walkClipSpeed` matched to ground speed (kills
  foot-slide), and a post-charge `recover` settle so it no longer judders from a
  flat-out charge into a reverse sprint. PLUS the **obstacle-avoidance JITTER fix**
  (the "buzzing near a tree/rock" the coordinator flagged): rewrote
  `avoidObstacles` to steer TANGENTIALLY around an obstacle on a COMMITTED side
  (held `AI_AVOID.commitFrames`) with a small `radialKeep`, instead of the purely
  radial away-push that flipped sign vs the goal-pull every frame. Verified
  in-browser: a triceratops pinned against a tree (worst case, goal directly
  behind it) holds a stable heading (avg Δ 0.03 rad/frame, no sign-flip
  vibration) and skirts past calmly.
- **(4) Pterosaur flyer** (new `src/flyer.js` + localised `world.js` swap): a
  proper procedural winged pterosaur — tapered body spindle, long beak, swept
  head crest, two flapping MEMBRANE wings (forearm spar + skinned triangle) —
  replacing the old cone-body + box-wings bird. `buildFlyer(scene)` returns a
  drop-in `{ root, setDiving, flap(dt) }`; the world flock + dive-attack FSM are
  otherwise untouched (cruise vs frantic-dive flap rate; red dive material).

### Verified (session 17)
- All `src/*.js` pass `node --check`; all 4 headless tests
  (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) still pass.
- Live in-browser (isolated context on a private port 8177, separate from the
  other worktrees' 8219/8181 — **note the shared Chrome is contended by 2 other
  dino agents; pages get evicted/port-confused, so confirm `location.port` before
  trusting a probe**): 0 console errors; herd loads all 9 species each animating
  with its base rig's clips; raptor pack spawns in-game (measured world height
  0.75u vs player 2.0u, HP 24); raptors converge to the surround ring; the flyer
  flock builds (49 flyer/wing meshes); triceratops obstacle-jitter resolved.
- **Audio note (coordinator, mid-session):** mute test pages immediately on load
  (user on a call). My 8177 test pages are now closed; future pages should be
  launched muted / M-key first.

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

## Done (session 5) — polish pass
- **Balance — deterministic bite** (`game.js`, `player.js`, `ai.js`): the bite
  was applying `attackDamage*dt*3` *every frame* of the window — frame-rate
  dependent and well below the configured 34/bite. Now each swing lands exactly
  `PLAYER.attackDamage` once per target, gated by a per-swing `biteId` +
  per-target `lastBiteId`. So config means what it says: ~5 bites to fell a
  T-Rex (140hp), 2 for a herbivore (60hp). Small camera kick (`JUICE.
  biteConnectShake`) the first time a swing connects = tactile confirmation.
- **Feel — auto-follow camera** (`player.js createFollowCamera`, `CAMERA.
  autoFollowLerp/manualHoldSeconds`): the camera now gently eases to sit behind
  the raptor's movement heading so you always see where you flee in a chase.
  Suspends for ~1.6s after any manual drag/wheel so deliberate look-around still
  works. **Verified `camBehindDot=1.0`** running forward.
- **Visual — gradient skydome** (`world.js makeSkyGradient`): a painted vertical
  zenith→horizon gradient texture (cooler blue up top, warm pale at the horizon),
  tinted by the day/night cycle via emissive colour. Real depth vs the old flat
  fill. (Screenshot-confirmed.)
- **Lighting fixes found while verifying** (`world.js`, `game.js`, `DAYNIGHT`):
  (1) the day/night clock advanced while the player sat on the **title screen**,
  so runs could start in gloom — now frozen until the run is live; (2) the cycle
  dipped the arena toward darkness mid-run — `cycleSeconds` 120→**240** and a
  `minDayLight` floor + remap keep it a gentle afternoon mood shift, never
  nightfall. **Verified bright noon at run start** (sun 1.7, sky 0.55/0.72/0.90).
- **Fresh idea — intimidating ROAR (Q)** (`config.PLAYER.roar*`, `player.onRoar`
  in `game.js`, `ai.js roarReact`, HUD Roar bar, touch ROAR button): an active
  panic/utility tool on an 8s cooldown. A T-Rex within `roarRadius` is staggered
  (frozen, pursuit broken, dazed-blue flash) for `roarStagger`s; nearby
  herbivores bolt in terror. Costs nothing but the cooldown → a tactical "get off
  me" button. HUD Roar charge bar pulses READY when off cooldown.
  **Verified:** roar flips a chasing T-Rex to patrol, staggers 1.32s (moved 0.0u
  while staggered), panics a herbivore, engages the 8s cooldown.

## Verified (session 5)
- All 14 src modules pass `node --check`.
- Each change probed individually in-browser (isolated context, port 8124):
  **0 console errors/warnings** throughout; 639 meshes; bite deals exactly 34
  once per swing (health flat across the whole window — not per-frame); camera
  sits behind heading; sky gradient + daylight confirmed by screenshot; roar
  staggers/panics + recharges.
- **Housekeeping:** closed ~22 of my own stale dino-arena-a tabs that were
  throttling measured FPS (left peer/dinob tabs alone). FPS still read low (~22)
  on the final pass only because an active peer held window focus and throttled
  the background tab — the build is unchanged from the ~95-103 FPS solo number.
- **Env note (unchanged & still biting):** parallel `dinob` instances grab the
  selected tab within ~1-2s and re-navigate it; verification uses short
  single-shot evals on the isolated `dino-arena-a` context, guarded by a
  `location.href` check.

## Done (session 6) — day/night gameplay arc
- **Predators bolder at dusk** (`config.DUSK`, `world.js`, `ai.js`, `game.js`,
  `hud.js`, `index.html`): the headline ask. Each run now has a *run-scoped dusk
  arc* — full daylight for `startSeconds` (25s), then a smoothstep ramp to
  deepest dusk by `fullDuskSeconds` (150s). This is **separate from the slow
  ambient `DAYNIGHT` cycle** so a single 60-120s session actually feels it.
  - `world.getDusk()` exposes the 0..1 dusk factor; `world.resetDusk()` on soft
    restart. The arc dims the arena toward `minLight` (0.45 — floored, so it's an
    evening look, never blindness) and **warms the sun/sky/fog toward amber**.
  - As dusk deepens the **T-Rex grows bolder**: `+trexSightBonus` sight range,
    `+trexLoseBonus` lose-interest range, `+trexSpeedBonus` chase speed (all
    blended by the dusk factor in `ai.js`; module-level `setDusk()` pushed each
    frame from `game.js`). The **herd gets jumpier** (`+herbFleeBonus` flee range).
  - **Readability:** a HUD "Daylight → Dusk" bar (depletes as dusk falls) with a
    ☀️/🌆 icon + label that flip at `duskThreshold` (0.5); a screen-edge amber
    `#duskTint` vignette; and a one-shot **"DUSK FALLS — predators grow bolder"**
    popup + roar at the threshold so a fresh player reads the escalation.
- **Dusk payoff — late banks pay double** (`DUSK.bankBonus`, `game.js` onBank):
  banking eggs scales from 1x (day) to **2x** at deepest dusk, with a 🌆 tag on
  the score popup. Makes dusk *risk/reward* (exciting), not pure punishment.
- **Title screen previews the arc** ("predators grow bolder — but late banks pay
  double") so the plan is clear before the first input. Win banner adds a
  "🌆 You held out into dusk!" flourish when you win after dusk has fallen.
- **Debug handle widened:** `window.__game` now also exposes `world` + `hud`
  (was missing) — far easier in-browser probing for future sessions.

## Verified (session 6)
- All 14 src modules pass `node --check`.
- **Headless logic test** `tools/dusk_test.mjs` (`node tools/dusk_test.mjs`,
  no Babylon): dusk arc (full day at start, deepest at fullDuskSeconds,
  monotonic, smoothstep midpoint = 0.5), predator boldness (sight/lose/speed/
  flee all increase with dusk, none in full day, sight always < lose-interest),
  the light floor, and the bank bonus (1x day → 2x dusk). **All pass.**
- Live in-browser (port 8124, manual-`render()` fast-forward, **0 console
  errors**, 639 meshes):
  - Dusk arc confirmed over a simulated run: daylight bar 100→~14%, sun 1.7→0.48
    (floored, not black), tint 0→0.86, icon ☀️→🌆 at the midpoint, sky warms.
  - HUD `setDusk(0.7)` → bar 30% remaining, 🌆 icon, tint 0.7 (correct).
  - Bank-bonus formula at dusk 0.7 × combo 2 = 340 pts (100·2·1.7) ✓.
  - Title screen renders the dusk-arc line; run starts on input, banner hides.
- **Env note (worse than ever):** the parallel `dinob` instance now spawns NEW
  tabs (reusing its own isolated contexts) pointed at my `:8124` URLs and steals
  the selection within ~1s, so multi-step probes get hijacked mid-flight.
  Worked around it with single-shot evals guarded by a `location.href` check and
  the `window.__game` handle; closed my own `dinoa-dusk` context tab. Left the
  peer's `dinob-*` context tabs alone.

## Done (session 7) — cohesion / polish / stability pass
- **Played a full win and a full death end-to-end** (scripted via `window.__game`):
  win path banks 6 eggs → "YOU SURVIVED" banner + best-time/score saved; death
  path 5×22 T-Rex bites (100→78→56→34→12→0) → "DEVOURED" banner. Both correct.
- **BUG FIX — arena darkened run-on-run.** `resetGame()` rewound the dusk arc but
  NOT the ambient day/night phase `t`, so each soft restart (R) left the cycle a
  little later in the day; after several retries a fresh run opened in gloomy
  twilight (caught on a screenshot: sun had drifted to 0.725 / floor instead of
  the intended 1.7 noon). `world.resetDusk()` now also resets `t` to the bright
  `DAY_START` (0.25). **Verified:** sun holds 1.7 across 15 consecutive resets.
  This was the single biggest new-player cohesion win — first impression is now
  a bright, readable, lush valley (screenshot-confirmed) instead of murk.
- **No-magic-number cleanup:** herbivore HP (60, hardcoded twice in `ai.js`) lifted
  to `HERBIVORE.maxHealth` with a provenance note (2 bites at attackDamage 34).
- **Stability sweep, all green, 0 console errors throughout:** second T-Rex spawns
  at wave 3 and is fully wired (`onBite`); reset drops predators back to 1 (no
  leak); win→reset returns a clean winnable run (HP 100, banked 0, over=false);
  pause (P) toggles on/off; golden-egg RNG verified live (~1.7 gold/run over 12
  rolls, matches the 18% spawn chance).
- **Difficulty reviewed, left as-is:** the session-6/7 tuning holds — T-Rex base
  chase 11 vs raptor sprint 14 (escapable empty-handed), 1 egg = 11.9 (just
  outruns), roar 6s cooldown as the on-chase counterplay, dusk doesn't bite until
  25s and peaks at 150s. A ~5-min session escalates without overwhelming early.
  No number churn — the documented playtesting rationale is sound.

## Verified (session 7)
- All src modules pass `node --check`; `node tools/dusk_test.mjs` passes.
- Live in-browser (isolated context `dinoa-s7`, port 8124, reloaded ignoreCache):
  639 meshes, 72 FPS foregrounded, **0 console errors/warnings** across a full win,
  a full death, 15+ resets, second-spawn, and pause cycling.
- **Env note (unchanged):** parallel `dinob` instances still grab the selected tab
  within ~1-2s; verification uses single-shot evals guarded by a `location.href`
  8124 check and the `window.__game` handle.

## Done (session 8) — the CURSED egg (risk/reward content)
- **New mechanic — cursed egg** (`config.EGGS.cursed*`, `eggs.js`, `ai.js`,
  `game.js`, `minimap.js`, `hud.js`, `index.html`): a rare (12%, rolled
  mutually-exclusive with golden — golden wins the tie) dark-violet egg with an
  eerie magenta throb. **While carried, EVERY T-Rex homes in on the raptor** —
  its FSM target is forced to chase regardless of sight/lose-interest range
  (`ai.setLure(active)`, pushed each frame from `eggs.carryingCursed`) and gains
  `+cursedLureSpeed` (1.5) chase speed. You've rung the dinner bell. Worth a
  big windfall (`cursedValueMul` 6x score) but counts only **1** toward the win
  target — so it's a bravado play, not a progress shortcut: grab it, sprint home
  with the whole arena hunting you, bank it for the payout. **Especially deadly
  at dusk** (predators already faster) — pairs with the existing dusk arc.
  - Readability: dark-violet shell + magenta point light, faster eerier glow
    throb; purple radar blip; on pickup a **"CURSED EGG — they're coming!"**
    warn popup + roar; on bank a ☠-tagged purple burst + score popup; title
    screen now teaches it ("grab a cursed egg ☠ for a huge score — but every
    T-Rex hunts you while you carry it").
- All tunables in `config.EGGS` with provenance notes; lure cleared on bank
  (carrying empties) and on soft restart (`setLure(false)` in `resetGame`).
- **Polish:** the guide/objective pill stays loud the whole carry — reads
  "☠ CURSED — every T-Rex hunts you!" while a cursed egg is on you (the pickup
  popup only flashes for ~1s, so the persistent danger needed a persistent cue).

## Verified (session 8)
- All 14 src modules pass `node --check`; `node tools/dusk_test.mjs` passes;
  new `node tools/cursed_egg_test.mjs` passes (classification mutual-exclusion,
  6x value / counts-1, lure speed nudge).
- Live in-browser (isolated context `dinoa-s8`, port 8124, **0 console
  errors/warnings**, 639 meshes, 77 FPS):
  - **Lure A/B proven:** a T-Rex 164u away (far beyond sight 38) sits in
    `patrol`; the instant a cursed egg is carried it flips to `chase`. Clears on
    bank/reset.
  - Cursed bank windfall = 600 pts (6×100×combo1×dusk1) ✓; banked counts +1;
    `cursedEggMat` present in the scene; carry visual + radar blip render.

## Done (session 9) — DASH / dodge roll (skill-based mobility)
- **New ability — DASH (F)** (`config.PLAYER.dash*`, `input.js`, `player.js`,
  `audio.js whoosh`, `fx.js dashTrail`, `hud.js setDash`, `game.js`, `touch.js`,
  `index.html`): a short, fast forward burst (`dashSpeed` 30 u/s for
  `dashSeconds` 0.28 → ~8.5u travelled) with a brief invulnerability window
  (`dashIFrames` 0.32). The skill payoff: time it to **slip a T-Rex bite or a
  pterosaur swoop**. It's a deliberately *different* tool from the two existing
  actives — roar is AoE crowd-control on a 6s cooldown, sprint is sustained
  stamina-gated travel; dash is a single reactive i-frame escape on a short 1.6s
  cooldown. It **costs `dashCost` 35 stamina** and won't fire while exhausted or
  below cost, so it trades directly against your escape sprint rather than being
  free. Dashes toward held movement input, else straight ahead; snap-faces the
  burst direction so it reads cleanly.
  - Readability/juice: a HUD **Dash charge bar** + READY pulse (mirrors Roar);
    a bright airy **whoosh** SFX (distinct from the watery splash); a cyan dust
    kick at launch + a **trailing cyan after-image streak** for the burst; a
    cyan hit-flash on the raptor; touch **DASH** button; title-screen control
    row ("F · Dash") + the blurb now reads "Run, bite, roar, dash to survive".
- All tunables in `config.PLAYER` with provenance notes tying each number to the
  existing chase economy (T-Rex base 11, dusk peak 13.5, raptor sprint 14): the
  burst always outpaces any chase to open a gap, but the stamina cost + cooldown
  keep it a timed tool, not a constant glide.

## Verified (session 9)
- All 14 src modules pass `node --check`; `node tools/dusk_test.mjs` +
  `node tools/cursed_egg_test.mjs` still pass.
- Live in-browser (isolated context `dinoa-s9`, port 8124, reloaded
  ignoreCache, **0 console errors/warnings**, 639 meshes, 89-120 FPS):
  - Dash burst measured: travelled ~8.5u along the faced heading, ~33.8 stamina
    spent (regen offsets the 35), i-frames raised to 0.27+ mid-dash, cooldown
    engaged to 1.55s, dashActive 0.23→0 (clean end).
  - **Gates A/B proven:** a second dash *during* cooldown does not re-fire; a
    dash *after* the cooldown elapses fires again; dash blocked while exhausted
    and blocked when stamina < cost (35).
  - Trail confirmed: 0 particles idle → 70 mid-dash; disposed/idle after.
- **Env note (unchanged):** parallel `dinob`/peer instances grab the selected
  tab within ~1-2s; verification uses single-shot evals guarded by a
  `location.href` 8124 check and the `window.__game` handle. (The raptor died
  once mid-probe during a long `sleep` — `player.update` stops when `over`, so
  later evals reset the run first; the mechanic itself verified clean.)

## Done (session 10) — WARD BEACONS (spatial safety / dusk-readability payoff)
- **New mechanic — ward beacons** (`src/beacons.js`, `config.BEACONS`, wired in
  `game.js`/`hud.js`/`audio.js`/`minimap.js`/`index.html`): three unlit braziers
  ringed around the arena (`ringRadius` 56, evenly spaced, auto-nudged off the
  pond). The raptor **lights one by walking up to it** (proximity `lightRange`
  11 — no key, so it's touch-friendly). A lit beacon does two intertwined things:
  - **Wards predators:** any T-Rex inside `wardRadius` (18 — deliberately < the
    roar's 22, so it's a local pocket not arena-wide) has its chase broken and a
    short `wardStagger` (0.6s) refreshed every frame it sits in range. Reuses the
    existing `roarReact` stagger — a lit beacon is a moving-but-safe pocket to
    route a chase through, most valuable once dusk emboldens the predators.
  - **Lights the gloom:** a warm point light + flickering flame mesh, so the
    *mechanic* and the *dusk-readability* payoff (the session-9 "torch-lit nest"
    idea) are literally the same object — lit beacons are bright islands in dusk.
  - **Sanctuary bonus:** lighting all three in a run fires a one-shot SANCTUARY
    (`sanctuaryHeal` 25 HP + `sanctuaryScore` 500 pts), a tidy optional objective
    layered over the egg hunt — a reason to clear the ring rather than ignore it.
  - Readability/juice: warm rising chime (`audio.beacon`) + amber burst on each
    light; a "BEACON LIT n/3" popup, a louder win-chime + shake + gold popup on
    sanctuary; HUD `🔥🔥·` beacon-ring counter (glows when full); radar shows lit
    beacons with their ward ring + unlit ones as hollow markers to seek out;
    title screen teaches it. Beacons **snuff out + re-arm on a soft restart**.
- All tunables in `config.BEACONS` with provenance notes tied to the chase
  economy (ward < roar radius, ring between nest and rim). No scattered numbers.

## Verified (session 10)
- All 15 src modules pass `node --check`; `dusk_test` + `cursed_egg_test` still
  pass; new `node tools/beacons_test.mjs` passes (ring placement inside arena +
  off-pond + spread, proximity lighting on/off, ward radius in/out, one-shot
  sanctuary trigger, config sanity).
- Live in-browser (isolated context `dinoa-s10`, port 8124, **0 console
  errors/warnings**, 648 meshes): 3 beacons at radius 56 inside the arena; walking
  onto one lights it (light + flame enabled, `litCount` ticks); a forced-chase
  T-Rex placed in a lit ward is staggered (`staggered` → 0.6 after `wardPredators`);
  lighting the full ring fires sanctuary once (+500 score; +25 HP applied when
  below max, correctly no-ops at full HP); a soft restart snuffs all beacons
  (lit=0, lights/flames off, `sanctuaryFired` re-armed).
- **Env note (unchanged):** parallel `dinob`/peer instances grab the selected tab
  within ~1-2s; verification used single-shot evals guarded by a `location.href`
  8124 check + the `window.__game` handle, then closed my own context tab.

## Done (session 11) — beacon UPKEEP loop + dusk-scaled ward
- **Deepened the ward-beacon system** (`beacons.js`, `config.BEACONS`, `game.js`,
  `hud.js`, `minimap.js`, `index.html`) — picked the two session-11 ideas and built
  *both*, because they reinforce each other into one strategic loop:
  - **Beacons burn down + relight (upkeep tension):** a lit beacon now holds
    `burnSeconds` (45) of fuel, drains each frame, and **gutters back to dark** at
    zero — so the ring is something to *maintain*, not light-once. Brushing a lit
    beacon again tops its fuel to full (free, no key — touch-friendly). The flame +
    point light **shrink with remaining fuel** (mapped to a 0.45..1 size band so a
    dying beacon reads as dying, never a sliver). Guttering re-arms the sanctuary,
    so you re-earn it by keeping the ring alive over a long run.
  - **Ward grows with dusk (defensive mirror of the bank bonus):** the dusk-scaled
    ward radius is `wardRadius * (1 + wardDuskBonus * dusk)` → 18 (day) to **27 at
    deepest dusk**. Beacons matter most exactly when the predators are boldest;
    the radar ward ring uses the same live radius so visuals match the gameplay.
  - **Readability/juice:** HUD beacon counter pulses amber **"Beacon fading —
    relight!"** when any lit beacon is low (`lowFuelFrac` 0.25); a grey dying-puff
    burst + chime + "BEACON GUTTERED OUT" popup on gutter; radar ward-ring + dot
    **fade with fuel** (dot greys when guttering); title screen now teaches the
    burn-down + the wider-at-dusk ward. Reset snuffs all + zeroes fuel + dusk.
- All new tunables in `config.BEACONS` with provenance notes tied to the chase/dusk
  economy (burn outlasts an egg round-trip; ward dusk-bonus mirrors the bank bonus).

## Verified (session 11)
- All 15 src modules pass `node --check`; `dusk_test` + `cursed_egg_test` still
  pass; `beacons_test.mjs` extended with an **upkeep section** (burn-down to gutter,
  guttering low-fuel detection, brush-to-refuel, dusk-scaled ward = base/×1.5) —
  all pass.
- Live in-browser (isolated context `dinoa-s11`, port 8124, **0 console
  errors/warnings**): touching a beacon lights it (fuel 45); draining past burn
  gutters it (lit=false, fuel=0); brushing relights; ward 18→27 day→dusk; the
  `anyGuttering` flag + amber HUD "Beacon fading — relight!" + `onGutter` callback
  all fire at the low-fuel band; soft restart snuffs all (lit=0, fuel=0, dusk=0,
  sanctuary re-armed). Tab closed after probing.
- **Env note (unchanged):** parallel `dinob`/peer instances grab the selected tab
  within ~1-2s; verification used single-shot evals guarded by a `location.href`
  8124 check + the `window.__game` handle.

## Done (session 12) — HERD PREDATION (the T-Rex hunts the herd)
- **New mechanic — the T-Rex is a true apex predator.** Until now the T-Rex only
  ever targeted the raptor; the herd fled its *position* but it never pursued or
  killed a herbivore (the DECISIONS.md design — "a T-Rex hunts you and the herd" —
  was unfulfilled). Now (`ai.js` `pickPrey` + `state.update`, `config.TREX`,
  `game.js`, `minimap.js`) a T-Rex that is **not locked onto the raptor** peels off
  to hunt the herd:
  - **Acquisition** (`pickPrey`): when not lured/point-blank, it acquires the
    nearest live herbivore within `preySightRange` (30, < the 38 player sight so a
    distant raptor still wins attention) that is `preyCloserBy` (8) units **nearer
    than the player**. The raptor stays the priority — a cursed-egg lure or the
    raptor inside `playerPriorityRange` (16) forces a player chase, so you can't
    hide behind a herbivore at point-blank.
  - **The kill:** it commits to a prey (keeps it until it dies, escapes past
    loseRange, or the raptor demands priority), bites it (`preyBite` 30, ~2 bites
    to fell a 60-HP herbivore — same economy as the raptor's chomp) on a
    `preyAttackCooldown` (1.1s). The felled herbivore drops meat via the existing
    `onDown` path — **so the player can scavenge a T-Rex's kill**: a risk/reward
    loop layered onto the chase.
  - **Emergent strategy:** herbivores are now living decoys. Lead a chasing T-Rex
    past the herd and it may break off to hunt easier prey, buying you a breather;
    or steal its kill for the heal. The herd feels alive, not set-dressing.
  - **Readability/juice:** radar draws a prey-hunting T-Rex **amber** ("distracted,
    exploit it") vs **red** (chasing YOU) vs dark-red (patrol); the tension
    heartbeat stays silent while a predator is off hunting the herd (it isn't
    bearing down on you); a chomp SFX + red spray marks each predation bite.
- All tunables in `config.TREX` with provenance tied to the existing chase economy
  (prey sight < player sight, prey needs a real distance edge, raptor priority at
  close range, two-bite kill matches the raptor's). No scattered numbers.

## Verified (session 12)
- All 16 src modules pass `node --check`; `dusk_test` + `cursed_egg_test` +
  `beacons_test` still pass; new `node tools/herd_hunt_test.mjs` exercises the
  **real exported `pickPrey`** (acquire-when-raptor-far, ignore-while-lured,
  out-of-sight, not-clearly-closer, nearest-of-several, keep-committed, drop-dead,
  drop-escaped, abandon-on-priority, config sanity) — all pass.
- Live in-browser (fresh isolated context `dinoa-s12-fresh`, port 8124, **0
  console errors/warnings**, 648 meshes, 66 FPS): with the raptor parked far away,
  a T-Rex placed near a herbivore acquired it as prey, the herbivore fled, two
  bites felled it, **meat dropped** for the player to scavenge, and prey cleared
  after the kill. With the raptor point-blank (inside `playerPriorityRange`) the
  T-Rex **never** hunted the herd and chased the raptor instead (priority guard
  proven). Tab closed after probing.
- **Env gotcha (new, important for next session):** `?probe` did NOT auto-start
  the run in this build — the game loop's `if (!started …) return` guard meant
  `game.elapsed` never advanced and the AI never ticked, which masqueraded as a
  broken feature for several probes. Start the run by dispatching a synthetic
  `keydown`/`pointerdown` (the one-shot `startGameLoop` listeners) before any
  position-set scenario, then verify `game.elapsed` is advancing.

## Done (session 13) — FEEDING FRENZY (the predator's vulnerable window)
- **New mechanic — a kill-feasting T-Rex is exposed.** Built the top session-13
  idea: it *closes the herd-predation loop into a skill play*. Until now a T-Rex
  that culled a herbivore just re-acquired a new target; the kill had no payoff
  for the player. Now (`ai.js` `state.update` + `feeding`/`feedGlow` state,
  `config.TREX`, `config.JUICE`, `game.js`, `minimap.js`, `hud.js`, `index.html`):
  - **Feeding state:** the **killing** prey-bite (prey drops to `dead`) puts the
    T-Rex into `feedSeconds` (3.5) of feeding — planted at the carcass, head-down
    (slow `Attack` chew loop), `prey` cleared so it doesn't re-chase a corpse. A
    new `onFeed` callback fires a bellow + a dark spray at the kill.
  - **The vulnerable window:** a raptor bite landed while the T-Rex feeds deals
    `feedVulnMultiplier` (2×) damage — `PLAYER.attackDamage` 34 → **68** on a
    flank hit. Loud payoff: "FEEDING FRENZY — flank hit!" popup + a heavier
    `feedHitShake` (0.33 vs the normal 0.22).
  - **It's a real risk, not a freebie:** crowding the T-Rex inside `feedBreakRange`
    (2.5 — point-blank, **inside** the raptor's own `attackRange` 5) makes it whirl
    off the meal to defend. So you bite from the *edge* of your reach; stacking on
    top of it loses the window. The break also fires on a roar (existing
    `roarReact` now zeroes `feeding`).
  - **Readability/juice:** a feeding T-Rex reads as a **pulsing GREEN** radar blip
    (vs red=chasing-you / amber=hunting-herd / dark-red=patrol) — "rush this NOW";
    a re-flashed dark-gorging-red glow on the model; the tension heartbeat stays
    **silent** while it feeds (it isn't bearing down on you). Title screen teaches
    the whole herd→feed→flank-bite loop in a new green `.titleFeed` line.
- All tunables in `config.TREX` (`feedSeconds`, `feedVulnMultiplier`,
  `feedBreakRange`) + `config.JUICE.feedHitShake`, each with provenance tied to the
  chase/bite economy. No scattered numbers.

## Verified (session 13)
- All 16 src modules pass `node --check`; `dusk_test` + `cursed_egg_test` +
  `beacons_test` + `herd_hunt_test` all pass; `herd_hunt_test` extended with a
  **feeding-frenzy config sanity** block (feeding window long enough to punish;
  multiplier > 1; break range is point-blank and **inside** the raptor's reach so
  the flank bite is landable).
- Live in-browser (isolated context `dinoa-feed-verify`, port 8131, **0 console
  errors/warnings**): with the raptor parked far away, a T-Rex placed by a 1-HP
  herbivore **chased it, killed it (`herbDead`), and entered feeding**
  (`feeding ≈ 3.41`, `prey` cleared); a flank bite from `attackRange`-edge dealt
  **exactly 68 dmg (= 34 × 2)**; crowding it point-blank (`feedBreakRange`) **broke
  the meal** (`feeding → 0`). Tab closed after probing.
- **Env gotcha (new):** the player drives an invisible collider and copies its
  position onto the visual root each frame — so setting `player.dino.root.position`
  directly is overwritten next frame, AND a partial set (e.g. `warpTo(x, z)` with
  the wrong arity) leaves `position.z = NaN`, which silently poisons **every**
  distance check globally (the AI then never acquires prey, masquerading as a
  broken feature). `warpTo(x, y, z)` takes all three; always pass a valid ground y.
  Confirmed by an empirical probe (`distP` came back `null` → traced to z=undefined).
- **Env gotcha (carried from s12, still true):** parallel `dinob`/peer instances
  grab the selected tab within ~1-2s. The live test ran the whole acquire→kill→
  feed→flank-bite→crowd-break scenario inside a **single** `evaluate_script`
  guarded by a `location.href` `:8131` check + the `window.__game` handle.

## Done (session 14) — polish / bug-hardening pass (no new features)
- **BUG FIX — stuck movement key on focus loss.** The input layer held keys in a
  Set keyed on `keyup`; if the window lost focus (alt-tab, devtools, a peer
  stealing the tab) the `keyup` never fired and a held WASD key stuck — the raptor
  ran forever after focus returned. Added a `window blur → keys.clear()` so focus
  always returns to a neutral stance (`input.js`). Most valuable given the
  documented tab-hijack environment.
- **BUG FIX — dropped eggs could land in the pond or outside the arena.** A T-Rex
  bite fumbles a carried egg back into the valley (`eggs.dropCarried`); it scattered
  to a raw `pos ± 3u` with no pond/rim guard, unlike `rollEgg` — so a fumble near
  the rim or pond edge could drop an egg into the water (drains health to retrieve)
  or past the playable circle. Now retries a few angles to avoid the pond, clamps
  inward to stay in-arena, and sits the egg on the ground at the *actual* drop point
  (`groundFn(x,z)`) instead of floating at the bite-point height.
  **Verified live:** 30 rim drops, all stayed in-arena and out of the pond.
- **BUG FIX — animation-group/skeleton leak on soft restart.** `dino.dispose()`
  disposed only meshes + root; the loaded model's animation groups and skeleton
  leaked. Soft restart disposes any later-wave T-Rex, so the clips accumulated
  run-on-run. Now disposes anim groups + skeletons too. **Verified live:** spawning
  a 2nd T-Rex took anim-groups 66→72; the reset disposed it back to *exactly* 66
  (no growth across cycles).
- **BUG FIX — in-flight pterosaur dive survived a soft restart.** `updateThreats`
  is paused at game-over, leaving a diving bird mid-swoop (nose-down, dive glow on,
  shadow showing); the next run inherited that half-finished dive. Added
  `world.resetThreats()` (aborts the dive via `endDive`, re-arms the timer), called
  from `resetGame`.
- **Verified (session 14):** all 16 src modules pass `node --check`; all four
  headless tests (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) still pass; live
  in-browser on an isolated context (own server :8137, **0 console errors/warnings**,
  648 meshes, ~80-112 FPS): run starts, dropCarried invariants hold, reset returns
  a clean winnable run (HP 100, banked 0, 1 predator), dispose is leak-free.
- **Env note (unchanged):** parallel peers grab the selected tab within ~1-2s;
  verification used single comprehensive evals guarded by a `location.href` :8137
  check + the `window.__game` handle, then closed my own context tab.

## Done (session 15) — final QUALITY pass (no new features)
- **Played a full win and a full death end-to-end** (scripted via a page-resident
  autopilot + `window.__game`): win path banks 7/6 (a golden counts double) →
  "YOU SURVIVED" banner, 2,000 pts, best time/score saved, HP 100; death path
  (T-Rex pinned on the raptor) → HP 0, "DEVOURED" banner at ~6s. Both correct,
  **0 console errors** through both.
- **ONBOARDING CLARITY FIX (the substantive change).** The title screen
  front-loaded *five* paragraphs at near-equal prominence — objective + dusk +
  cursed egg + beacons + feeding frenzy — so a first-time player hit a wall of
  mechanics before moving. Now the primary read is just the **core objective +
  controls**; the four advanced-mechanic lines fold into a collapsed, dimmer
  `<details>` ("More to discover — learn as you play"). **Critical interaction
  verified live:** clicking the disclosure expands it but does **NOT** start the
  run (a `stopPropagation` guard on the summary stops the click reaching the
  one-shot start listeners; `elapsed` stayed 0 after the click). Advanced lines
  dropped 14→13px for a cleaner secondary tier. (`hud.js`, `index.html`.)
- **Stability / perf, all green:** 16 src modules parse; all 4 headless tests
  (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) pass. Live over ~16s of real play:
  **mesh count flat at 648** (no leak across wave events), heap ~125 MB, **0
  console errors/warnings**. Soft-restart returns a clean winnable run (verified
  in the win/death cycles: HP 100, banked 0, 1 predator, over=false). `R` correctly
  no-ops while a run is live (only restarts on game-over).
- **Code read for jank — none actionable.** Reviewed the player controller
  (dash/lunge/wade/i-frame interplay), the game loop, and config: dash punches
  through water at full speed (intended), water drain bypasses i-frames (intended,
  documented), bite/dash mutually gated. Config tunables all carry provenance.
  No bug introduced; left the mature mechanics untouched per "no big new features".
- **Perf caveat (environment, not the build):** foreground FPS read ~43 this
  session, well below the documented 95-103 solo number — but the machine was
  running ~17 other tabs (several parallel Claude instances each rendering a
  Babylon scene), so GPU/CPU was heavily contended. Mesh count + scene content are
  unchanged from the sessions that measured 95-103 in isolation; this is
  contention, not a regression. Did not chase a number I can't reproduce solo.

## Verified (session 15)
- All 16 src modules pass `node --check`; all 4 headless tests pass.
- Live in-browser (isolated context `dinoa-quality`, port 8142, fresh modules via
  a `&cb=` cache-bust): full win + full death + reset, 648 meshes stable, ~125 MB
  heap, **0 console errors**; title disclosure collapsed-by-default, expands on
  click without starting the run.
- **Env note (unchanged & aggressive):** parallel `dinob` instances now spawn new
  pages pointed at my `:8142` URLs and grab devtools selection within ~1s. Worked
  around it by installing a **page-resident `setInterval` autopilot** (survives the
  hijack since it lives in my tab) + tiny single-shot evals guarded by a
  `location.href` `:8142` check; closed my own context page after probing.

## Done (session 16) — PLAYER IS NOW A HUMAN + real-speed chase economy
- **Replaced the player raptor with a rigged CC0 human** (`assets/models/
  human.glb` — the Quaternius "Adventurer", same `static.poly.pizza` source as
  the dinos, CC0). The DINOSAURS are untouched; only the player model changed.
  - Generalised the clip lookup (`dino.js`): a per-kind `CLIP_ALIASES` table maps
    the player's logical states onto the human's `CharacterArmature|<Clip>` scheme
    (vs the dinos' `<Species>_<Key>`). The human has no Jump or bite clip, so
    Jump→`Roll` (a leap), Attack→`Punch_Right`. Lookup now prefers an exact tail
    match before a substring so `|Run` isn't shadowed by `|Run_Left`.
  - `FACING_OFFSET.human` set to **0** (Adventurer authors forward +Z, like the
    dinos). **A first PI guess made him run BACKWARDS** (backpack-first); caught
    via a side-on screenshot, corrected to 0, re-verified facing in run/walk/dash.
  - Player-facing copy updated (human survivor) in README, HUD label, load msg.
- **Real-speed chase economy (config.js, with km/h provenance):** human sprint
  `runSpeed` 14→**16.5** u/s = 1.5× the T-Rex's 11 u/s (≈30 vs 20 km/h). Walk 7
  stays below the rex. Stamina re-tuned for cat-and-mouse: drain 30→25 (~4s
  sprint, ~22u lead/burst), regen 24→18, `staminaSprintMin` 10→**35** (a real
  post-exhaustion recovery walk where the rex closes ~4 u/s). `carrySlow`
  0.18→0.22 preserves the carry risk tiering (1 egg outruns base/matched at dusk,
  3 eggs run down); empty-handed sprint always escapes.

## Verified (session 16)
- All src modules pass `node --check`; all 4 headless tests
  (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) still pass.
- Live in-browser (isolated context `dinoa-human`, port 8155, **0 console
  errors/warnings**, 660 meshes, 120 FPS):
  - Human loads as the player; all 6 logical clips map to the right
    CharacterArmature clips; scale ~1.1, feet on ground (footGap 0).
  - **Facing fixed:** side-on screenshots show chest/face leading the heading
    in run/walk/dash; backpack on his back.
  - **Jump works:** Space → clean hop (peak velY 9, rises ~1.87u, falls, lands
    grounded, Roll anim plays); a mid-air Space does NOT double-jump (the
    `&& state.grounded` guard blocks it — velY keeps decaying through the press).
  - **Full chase end-to-end:** sprint opens a ~23u lead → stamina empties → the
    rex closes ~18u and bites a careless full-Shift player (HP 100→78). Genuine
    cat-and-mouse; a player managing bursts escapes.
- **Env gotcha (important):** several of my probes falsely read "jump/carry
  broken" — the cause each time was the game sitting in the `over` (DEVOURED)
  state, so the loop skips `player.update` and input is never consumed. Always
  confirm `g.game.over === false` (and `elapsed` advancing) before probing a
  player mechanic. Hard-restart via the `R` key, not just `g.resetGame()`.

## Done (session 17) — AUDIO PASS (footsteps + per-species dino sounds + panting)
- **The headline ask — FOOTSTEPS, synced to locomotion.** A footfall fires on
  cadence from the loop (`game.js`): walk ~0.5s/step, sprint ~0.28s/step (faster
  + louder), **none when idle or airborne**, a wet stomp when wading. Tied to
  `player.moving/sprinting/grounded/wading`.
- **Switched from procedural synth to REAL CC0/royalty-free samples** (the
  procedural footsteps sounded like drum beats, roars like static). All loaded as
  WebAudio buffers on unlock, with procedural fallbacks retained if a file is
  blocked/slow. Sources in `CREDITS.md`:
  - **Footsteps:** Kenney CC0 grass pack — 4 variants, picked at random per step
    + ±8% pitch jitter so a run never machine-guns.
  - **Per-species dino vocalisations** (`audio.vocalise(kind, gain, menace)`,
    keyed by the dino `kind`): **T-Rex = eerie low closed-mouth RUMBLE** (pitched-
    down growl/thunder ~148–228 Hz — the Julia-Clarke-et-al. crocodilian/bittern
    approximation, not an open-mouth roar); **raptor = fast high screech** (ready
    for the future pack predator); **herbivores = low bellow/grunt**. Distance-
    attenuated to the player and **more menacing (deeper/slower) as a predator
    closes**; ambient calls on a randomised cadence when calm.
  - **Player panting** (`audio.panting(active, intensity)`): a looping breath
    sample that fades in while sprinting/dashing and gets **faster + heavier as
    stamina drains** (rate 0.85→1.5, gain scaled by exertion), easing back when
    calm. Smooth `setTargetAtTime` ramps — no pops.
- **Smooth envelopes everywhere:** one-shots use short attack/release gain ramps;
  distance/panting gains glide. Mute (button + M) still gates everything.
- **`audio-picker.html`** (repo root, no build step): auditions ~4 candidates per
  category, grouped Footsteps / T-Rex-rumble / T-Rex-classic-roar / Raptor /
  Herbivore / Panting, with Play buttons + source labels + DEFAULT tags. The user
  picks finals; swapping one is a one-line path change in `config.AUDIO.samples`.
  All candidates live in `assets/audio/candidates/`; in-game defaults are copies
  in `assets/audio/`.
- `__game` debug handle widened with `audio` (for in-browser audio verification).

## Verified (session 17)
- All 16 src modules pass `node --check`; all 4 headless tests
  (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) still pass.
- Live in-browser (isolated context `dinoa-probe`, port 8163, page-resident
  autopilot to survive the tab-hijack, **0 console errors/warnings**):
  - `trex.mp3` decodes via WebAudio (4.0s) — real samples load.
  - Footsteps fire on cadence: walk ~0.53s, sprint ~0.26–0.32s, louder when
    sprinting, **0 when idle/after-stop**; buffers (not procedural) play.
  - Panting ramps `intensity` 0 (fresh) → 0.65 (stamina drained) while sprinting.
  - A predator at 14u → `chase` → menacing `trex` vocalise at gain 0.96 / menace
    0.88 (per-kind routing + closeness intensification proven).
  - `audio-picker.html`: 20 candidate rows across 6 groups, 8 DEFAULT-tagged,
    candidate files fetch 200.
- **Audibility caveat:** could not literally *hear* the audio in this headless
  verification environment — confirmed real-sample decode + correct call routing/
  cadence/gain/rate programmatically, and the picker so the user can A/B by ear.
- **Env note (unchanged):** parallel `dinob`/peer instances grab the selected tab
  within ~1–2s; long multi-step evals get closed mid-flight. Worked around it with
  a page-resident `initScript` autopilot writing to `window.__audioProbe` + a tiny
  single-shot read.

## Done (session 18) — HUMANISED the player's abilities (no more bite/roar)
- **The ask:** "the human shouldn't be able to roar or bite to survive lol."
- **BITE → PUNCH/KICK melee** (same input — Click/J — same damage 34 / cooldown
  0.7; real weapons come later with the backpack/tools feature):
  - `dino.js`: added optional `Attack2`/`Attack3` clip keys; the human maps
    Attack→`|Punch_Right`, Attack2→`|Punch_Left`, Attack3→`|Kick_Right` (full
    clip list extracted from the glb's JSON chunk — it also ships Kick_Left,
    HitRecieve etc. for later). Dinos resolve only their single Attack clip.
  - `player.js`: each swing cycles right punch → left punch → kick so combos
    read naturally; `biteId`/`biteConnected` renamed `strikeId`/`strikeConnected`
    (targets' `lastBiteId` → `lastStrikeId` in `ai.js`; `JUICE.biteConnectShake`
    → `strikeConnectShake`).
  - **SFX:** the swing plays a new low airy `audio.swing()` whoosh; a connecting
    hit lands a meaty `audio.thud()` (low pitch-drop + muffled noise slap) — the
    chomp `audio.bite()` is now predators-only (T-Rex bites, trike charge).
- **ROAR (Q) removed from the player entirely:** input (q key + queue/consume),
  `player.roarTimer`/`onRoar` + the game's AoE handler, `PLAYER.roarCooldown/
  roarRadius/roarStagger`, HUD Roar charge bar (hud.js + index.html markup/CSS),
  touch ROAR button (BITE button renamed STRIKE), title-screen "roar" copy +
  Q controls row, README controls/features. The herbivores' roar `panic`
  terror-flee + `roarReact` were dead code with the player roar gone — removed.
- **Ward beacons keep their chase-break:** the predator's stagger hook was
  renamed `roarReact` → `breakChase` (it no longer reacts to any roar) and
  `beacons.wardPredators` calls that; `JUICE.roarShake` → `sanctuaryShake`.
  Beacon behaviour itself untouched.
- **`?mute` URL parameter** (`audio.js`): a page loaded with `?mute` in the
  query starts muted (a dev/test affordance like `?probe` — automated browser
  probes must not blast audio through the user's speakers). Normal play keeps
  the configured default (unmuted); M / the button still toggle. ALL future
  in-browser test pages must be opened with `?mute` appended.

## Verified (session 18)
- All 15 src modules pass `node --check`; all 4 headless tests
  (`dusk`/`cursed_egg`/`beacons`/`herd_hunt`) pass unchanged (none referenced
  the roar).
- Live in-browser (isolated context `dinoa-humanise`, own server :8181, fresh
  files confirmed via curl, **0 console errors/warnings**, 660 meshes):
  - **Punch/kick:** three consecutive swings on a T-Rex landed exactly 34 dmg
    each, cycling `CharacterArmature|Punch_Left` → `|Kick_Right` →
    `|Punch_Right` (140 → 38 HP).
  - **Q does nothing:** no stagger on a T-Rex inside the old 22u radius,
    `player.roarTimer`/`t.roarReact` undefined, no `#roarFill` in the DOM.
  - **Beacons still break chases:** brushing a brazier lights it; a chasing
    T-Rex dropped inside the ward → `staggered 0.6`, mode flipped to `patrol`.
  - **Title screen:** no "roar"/"bite" anywhere; "Run, punch, kick, dash to
    survive" + a "CLICK / J · Punch / Kick" controls row.
- **`?mute` verified both ways:** headless Node (stubbed `location`: `?mute` →
  muted true, toggle works, no param → default unmuted) AND in-browser
  (`?mute` page boots with `audio.muted === true`, HUD shows "🔇 Muted").
- **Env gotchas re-confirmed:** a peer stole the selected tab mid-probe
  (re-select by page id), later NAVIGATED my tab to its own URL (re-open a
  fresh context), and a probe's held synthetic `w` (no keyup) let the rex
  devour the player, gating input until an `R` restart.

## Next (session 17)
- A herbivore "stampede" when one of the herd is taken (the rest bolt as a flock);
  or a brief feeding-frenzy heal-steal: bite the feeding T-Rex AND grab the meat.
- Beacon upkeep could feed a "warmth" meter that the raptor radiates while near a
  lit beacon (regen?); or guttered beacons could be relit faster than first-light.
- Original session-10 ideas still open below.

## Next (older ideas)
- More biome variety (second pond / rocky mesa / tar pit); ambient grazing anims.
- Egg variety beyond golden (e.g. a "cursed" egg that draws the T-Rex —
  especially nasty at dusk).
- Tune the dusk numbers after live play: `fullDuskSeconds` (150) vs typical run
  length, `trexSpeedBonus` (does the chase stay escapable at dusk?), `bankBonus`.
- ~~Consider dusk also speeding the ROAR cooldown~~ (moot — the player roar was
  removed in session 18); a moonrise/torch-lit-nest readability aid still open.

## Run it
```
cd /Users/scottmatthews/personal_repos/dino-arena-a
python3 -m http.server 8124
# open http://localhost:8124/
# Controls: WASD move · Shift sprint · Space jump · Click/J punch/kick · F dash · M mute · P pause · R restart
# Touch (phones/tablets): left joystick to move (push full to sprint), STRIKE/JUMP/DASH buttons; tap to start/restart
```

## Debug harness
Append `?probe`/`?smoke` to the URL — the init scripts used this session auto-start
and auto-move so a single `evaluate_script` can read `window.__probeResult` before any
peer hijacks the tab. Re-paste from git history of this file's prior version if needed.
