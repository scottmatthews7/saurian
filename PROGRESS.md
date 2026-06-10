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

## Next (session 15)
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
- Consider dusk also speeding the ROAR cooldown (a defensive payoff to match the
  offensive bank bonus), and a moonrise/torch-lit-nest readability aid.

## Run it
```
cd /Users/scottmatthews/personal_repos/dino-arena-a
python3 -m http.server 8124
# open http://localhost:8124/
# Controls: WASD move · Shift sprint · Space jump · Click/J bite · Q roar · F dash · M mute · P pause · R restart
# Touch (phones/tablets): left joystick to move (push full to sprint), ROAR/BITE/JUMP buttons; tap to start/restart
```

## Debug harness
Append `?probe`/`?smoke` to the URL — the init scripts used this session auto-start
and auto-move so a single `evaluate_script` can read `window.__probeResult` before any
peer hijacks the tab. Re-paste from git history of this file's prior version if needed.
