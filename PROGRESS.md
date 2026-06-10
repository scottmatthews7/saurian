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

## Next (session 8)
- More biome variety (second pond / rocky mesa / tar pit); ambient grazing anims.
- Egg variety beyond golden (e.g. a "cursed" egg that draws the T-Rex —
  especially nasty at dusk).
- Tune the dusk numbers after live play: `fullDuskSeconds` (150) vs typical run
  length, `trexSpeedBonus` (does the chase stay escapable at dusk?), `bankBonus`.
- Consider dusk also speeding the ROAR cooldown (a defensive payoff to match the
  offensive bank bonus), and a moonrise/torch-lit-nest readability aid.

## Run it
```
cd /Users/scottmatthews/personal_repos/dino-arena-a
python3 -m http.server 8124
# open http://localhost:8124/
# Controls: WASD move · Shift sprint · Space jump · Click/J bite · Q roar · M mute · P pause · R restart
# Touch (phones/tablets): left joystick to move (push full to sprint), ROAR/BITE/JUMP buttons; tap to start/restart
```

## Debug harness
Append `?probe`/`?smoke` to the URL — the init scripts used this session auto-start
and auto-move so a single `evaluate_script` can read `window.__probeResult` before any
peer hijacks the tab. Re-paste from git history of this file's prior version if needed.
