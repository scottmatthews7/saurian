// Central tunables. Every value here is a deliberate design choice for a
// stylised arcade chase game — not derived from any external benchmark.
// Adjust here only; nothing below should hardcode gameplay numbers.

export const ARENA = {
  radius: 90,          // playable circle radius (world units)
  groundSize: 220,     // ground plane edge length
  fogDensity: 0.012,   // exponential fog
  treeCount: 70,       // scattered trees/rocks
  rockCount: 36,
  grassPatches: 320,
};

export const PLAYER = {
  // Speeds are grounded in real top speeds and the game's existing unit scale.
  // Provenance: a human sprints ~30 km/h, a T-Rex tops out ~20 km/h, so a human
  // sprint should beat the rex by ~1.5x. The internal scale is anchored on the
  // T-Rex base chase of 11 u/s (TREX.chaseSpeed, unchanged). 1.5 × 11 = 16.5, so
  // sprint = 16.5 u/s. Walk/jog must stay BELOW the rex so a stamina-drained
  // player gets run down: walk 7 u/s ≈ 12.7 km/h (a brisk human jog), well under
  // the rex's 11 u/s — when sprint stamina empties you drop to this and it closes.
  walkSpeed: 7,        // units/sec (~12.7 km/h jog, below the T-Rex's 11)
  runSpeed: 16.5,      // hold Shift — sprint ~30 km/h, 1.5x the T-Rex's 20 km/h (11 u/s)
  turnLerp: 0.18,      // rotation smoothing 0..1
  jumpSpeed: 9,
  gravity: -22,
  radius: 1.1,         // collision ellipsoid
  height: 2.0,
  maxHealth: 100,
  attackRange: 4.5,
  attackCooldown: 0.7, // sec
  attackDamage: 34,    // damage dealt to a predator on a landed punch/kick
  invulnAfterHit: 1.0, // i-frames after taking damage (sec)
  attackLockSeconds: 0.45, // movement-lock duration of a strike (the swing window)
  lungeSpeed: 9,       // forward burst (units/sec) during the swing window
  lungeSeconds: 0.18,  // how long the lunge push lasts within the swing
  // Sprint stamina — the core cat-and-mouse lever. The human's 16.5 u/s sprint
  // (1.5x the T-Rex's 11) opens a gap fast, BUT the rex has superior endurance:
  // sprint is stamina-gated so you can't run forever. When stamina empties you
  // drop to walk (7 u/s, below the rex) and it closes the gap — a skilled player
  // escapes by managing bursts, a careless one who holds Shift gets caught.
  // Provenance (the cat-and-mouse maths against the rex's 11 u/s chase):
  //  - full sprint lasts staminaMax/staminaDrain = 100/25 = 4s, covering ~66 u
  //    at 16.5 while the rex covers ~44 u → a clean ~22 u lead per burst.
  //  - on exhaustion you can't sprint again until stamina rebuilds past
  //    staminaSprintMin (35). From empty at staminaRegen 18/s that's ~1.9s of
  //    forced walk; over that window the rex (11) gains on the walker (7) at
  //    4 u/s, clawing back ~7.6 u. So each burst+recovery cycle nets the player
  //    a shrinking lead — manageable with timing, fatal if spammed. A deliberate
  //    arcade-feel tuning: the human is faster but the rex never tires.
  staminaMax: 100,
  staminaDrain: 25,     // per second while sprinting (~4s of full sprint)
  staminaRegen: 18,     // per second while not sprinting (~5.5s to a full refill)
  staminaSprintMin: 35, // must rebuild stamina past this after exhaustion before sprinting again — the recovery window where the rex closes
  // Carry weight, applied as speed *= 1/(1+n*carrySlow). Re-tuned for the human's
  // 16.5 u/s sprint (was 0.18 against the raptor's 14) to preserve the original
  // risk tiering against the unchanged chase economy (T-Rex base 11, dusk peak
  // 13.5): at 0.22, 1 egg = 16.5/1.22 = 13.5 u/s (outruns the base rex by day,
  // matched at deepest dusk — escapable with skill, dash the late counter),
  // 2 eggs = 16.5/1.44 = 11.5 (just above base, tense), 3 eggs = 16.5/1.66 = 9.9
  // (below base — greedy and you get run down). Empty-handed sprint (16.5) always
  // beats any chase, so sprinting unburdened outruns the rex; carrying slows you.
  carrySlow: 0.22,      // speed multiplier per egg carried, applied as 1/(1+n*x)
  // (The raptor-era ROAR (Q) was removed when the player became a human — a
  // human can't bellow a T-Rex into a stagger. Its chase-breaking role now
  // belongs to the ward beacons; dash is the personal escape tool.)
  // DASH / dodge roll (F) — a skill-based reactive escape distinct from
  // sprint (sustained, stamina-gated travel). A
  // short, fast forward burst with brief invulnerability: time it to slip a
  // T-Rex bite or a pterosaur swoop. It trades against sprint by sharing the
  // stamina pool, so you can't both dash and sustain a sprint indefinitely.
  // All values are arcade-feel design choices, tuned alongside the existing
  // chase numbers (T-Rex base chase 11, dusk peak 13.5, human sprint 16.5):
  dashSpeed: 30,        // units/sec during the burst — well above any chase speed so it always opens a gap
  dashSeconds: 0.28,    // burst duration (~8.4 units travelled), enough to clear a bite's reach (attackRange 5)
  dashIFrames: 0.32,    // invuln window — covers the burst + a sliver after, so a frame-perfect dodge negates a hit
  dashCost: 35,         // stamina spent per dash (~1.4s of sprint at drain 25) — equals the post-exhaustion sprint floor, so a dash eats a full recovery's worth of stamina; a real trade against your escape sprint
  dashCooldown: 1.6,    // sec between dashes — reactive but not a constant glide
};

export const TREX = {
  patrolSpeed: 5,
  chaseSpeed: 11,        // base; ramps with difficulty
  chaseSpeedRamp: 0.6,   // +units/sec per wave
  sightRange: 38,
  loseInterestRange: 55,
  attackRange: 5.0,
  attackCooldown: 1.4,
  attackDamage: 22,      // damage to player on contact bite
  maxHealth: 140,
  turnLerp: 0.06,
  secondSpawnWave: 3,    // a second T-Rex joins the hunt from this wave (~90s)
  // A wounded T-Rex enrages: below this health fraction it gains a speed boost
  // and a sustained angry glow — a comeback threat when you nearly have it.
  enrageThreshold: 0.4,
  enrageSpeedBonus: 3,
  // HERD PREDATION — the T-Rex is a true apex predator: it hunts the herd, not
  // just the raptor. This delivers the stated design ("a T-Rex hunts you and the
  // herd") and creates emergent strategy — herbivores are living decoys. While
  // NOT locked onto the player (no cursed lure, player out of close range), a
  // T-Rex that sees a closer herbivore peels off to hunt it: bites it down,
  // which drops meat the raptor can then scavenge. Lure the predator onto a
  // stegosaurus to buy yourself a breather, or steal its kill. All arcade-feel
  // choices, tuned against the existing chase economy.
  preySightRange: 30,      // < player sightRange (38): the herd must be clearly nearer than a distant raptor to pull aggro
  preyCloserBy: 8,         // world units the herd must be NEARER than the player before the T-Rex switches off the raptor — keeps the player the priority when both are close
  preyBite: 30,            // damage per bite to a herbivore (herbivore maxHealth 60 = ~2 bites, same economy as the player's strike)
  preyAttackRange: 5.5,    // contact range to bite the prey (~its own attackRange, herbivores are large)
  preyAttackCooldown: 1.1, // sec between prey bites (a touch faster than its player bite — it's committed to the kill)
  playerPriorityRange: 16, // if the raptor is within this, the T-Rex always prefers the player over any prey — you can't hide behind a herbivore at point-blank
  // FEEDING FRENZY — the predator's vulnerable window. When a T-Rex fells its
  // prey it stops to FEED on the carcass: head-down, planted, distracted. This
  // closes the herd-predation loop into a skill play — a brave player can rush
  // in and punish the exposed flank for bonus damage. The predator drops feeding
  // only if the player crowds it at point-blank (it whirls to defend) or a ward
  // beacon forces a break. Provenance: design choice, tuned so one full
  // feeding window roughly equals a one-strike-saved comeback, not a free kill.
  feedSeconds: 3.5,         // how long the T-Rex feeds on a fresh kill, planted at the carcass
  feedVulnMultiplier: 2,    // player strike damage is doubled while the T-Rex feeds (head-down, exposed) — the payoff for a brave punish
  feedBreakRange: 2.5,      // point-blank: only if the player crowds RIGHT on top of it (< PLAYER.attackRange 4.5) does it whirl off the meal to defend — so you CAN land a flank strike from the edge of your reach, but stacking on it loses the window
};

export const HERBIVORE = {
  count: 9,
  maxHealth: 60,         // strikes to fell: 2 at PLAYER.attackDamage 34 (drops healing meat)
  wanderSpeed: 3.5,
  fleeSpeed: 9,
  fleeRange: 16,         // starts fleeing player/trex within this
  turnLerp: 0.08,
};

// AI obstacle avoidance: dinos steer away from tree/big-rock footprints (and
// the pond) within this extra clearance so they no longer clip through them.
// A steering nudge, not hard collision — keeps the cheap direct-move AI.
export const AI_AVOID = {
  clearance: 2.5,        // extra units added to each obstacle's radius
  strength: 2.6,         // how hard the outward push bends the heading
};

// A cornered Triceratops turns and charges the player instead of fleeing.
// Design choice to add danger variety; not asset-derived.
export const TRICERATOPS = {
  chargeTriggerRange: 9,  // player this close while fleeing -> may charge
  chargeSpeed: 14,
  chargeDamage: 16,
  chargeCooldown: 4.0,    // sec between charges
  chargeHitRange: 4.0,    // contact range to land the charge hit
  chargeDuration: 1.6,    // how long a charge commitment lasts
};

export const EGGS = {
  count: 8,
  targetToWin: 6,
  pickupRange: 2.8,
  bobHeight: 0.4,
  glowIntensity: 0.8,
  baseValue: 100,        // score per egg banked
  comboWindow: 8,        // sec — bank again within this to grow the combo
  comboStep: 0.5,        // +0.5x multiplier per chained bank
  comboMax: 4,           // multiplier cap
  // A rare golden egg glows brighter, is worth more, and counts double toward
  // the win target — a risk/reward beacon, usually scattered far out.
  goldenChance: 0.18,    // probability an egg spawns golden
  goldenValueMul: 3,     // score multiplier vs a normal egg
  goldenCounts: 2,       // counts as this many toward the win target
  // A rare CURSED egg: a dark, eerie prize. While it is carried EVERY T-Rex
  // homes in on the raptor (its FSM target is forced onto you regardless of
  // sight range) and chases a touch faster — you've rung the dinner bell. It is
  // worth a big score bonus but counts as only 1 toward the win target, so it's
  // a bravado play: grab it, sprint home with the whole arena hunting you, bank
  // it for a windfall. Especially deadly at dusk when predators are already
  // bold. Rolled mutually-exclusive with golden (golden wins the tie). Arcade.
  cursedChance: 0.12,    // probability an egg spawns cursed (rolled after golden)
  cursedValueMul: 6,     // score multiplier vs a normal egg (the windfall)
  cursedCounts: 1,       // counts as this many toward the win target
  cursedLureSpeed: 1.5,  // +chase units/sec a T-Rex gains while you carry a cursed egg
};

// Meat pickups: a fleeing herbivore the raptor bites drops meat that heals on
// pickup, giving a reason to engage the herd rather than only run. Design.
export const PICKUPS = {
  meatHeal: 30,          // health restored per meat
  meatRange: 2.8,
  meatLifetime: 22,      // sec before it despawns
};

// A shallow water pond carved into the valley. Wading through it slows the
// raptor and ticks gentle damage — a terrain hazard to route around (or risk
// crossing as a shortcut). The T-Rex and herd avoid it. Design choice.
export const WATER = {
  centerX: -34,         // pond centre (world units), off to one side of the nest
  centerZ: 28,
  radius: 17,           // surface radius
  depth: 1.6,           // how far below local ground the basin sinks
  slowFactor: 0.45,     // player speed multiplier while wading
  damagePerSec: 4,      // health drained per second submerged
  level: 0.2,           // water surface height above the pond-rim ground
};

// WARD BEACONS — unlit braziers ringed around the arena. Run up to one to
// light it (proximity, no key — touch-friendly). A lit beacon does two things:
// (1) casts a warding glow that breaks any T-Rex chase inside `wardRadius` and
//     shoves it back to patrol (a short stagger), refreshed while in
//     range — so a lit beacon is a moving-but-safe pocket to route a chase
//     through, especially valuable once dusk emboldens the predators;
// (2) literally lights the dusk gloom near it (a warm point light) so the
//     beacon mechanic and the dusk-readability payoff are the same object.
// Lighting all three in a run fires a one-shot SANCTUARY bonus (heal + score).
// They re-arm (snuff out) on a soft restart. All values arcade-feel choices,
// tuned against the chase economy (T-Rex base chase 11):
export const BEACONS = {
  count: 3,                // braziers ringed around the arena
  ringRadius: 56,          // world units from centre they sit on (mid-field, between nest and rim)
  lightRange: 11,          // proximity to ignite an unlit beacon (a touch wider than the egg pickup so it's easy to brush)
  wardRadius: 18,          // world units a lit beacon repels predators within (deliberately local — a pocket, not arena-wide)
  wardStagger: 0.6,        // sec of stagger refreshed each tick a T-Rex sits in the ward (short; re-applied while in range)
  lightHeight: 6,          // warm point-light range (units) cast around a lit beacon to push back the dusk gloom
  sanctuaryHeal: 25,       // HP restored once all beacons are lit (reward for clearing the ring)
  sanctuaryScore: 500,     // bonus score for lighting the full ring (a tidy objective payoff)
  // Upkeep loop: a lit beacon BURNS DOWN and gutters out, so the ring is something
  // to maintain, not light-once-and-forget. Brushing a lit/guttering beacon again
  // tops its fuel back to full. Tuned so a beacon comfortably outlasts a single
  // egg round-trip but a full ring needs revisiting over a long run.
  burnSeconds: 45,         // sec a freshly-lit beacon burns before guttering out (a generous round-trip's worth)
  lowFuelFrac: 0.25,       // fuel fraction below which a beacon reads "guttering" (dimmer flame + radar warning)
  // Defensive dusk mirror of the bank-bonus: a lit beacon's ward GROWS with dusk,
  // so beacons matter most exactly when the predators are boldest. wardRadius is
  // the daytime base; at deepest dusk it scales by (1 + wardDuskBonus).
  wardDuskBonus: 0.5,      // +50% ward radius at deepest dusk (18 -> 27 units), a deliberate counter to the dusk speed/sight boldness
};

export const CAMERA = {
  distance: 14,
  height: 7,
  lerp: 0.12,
  fov: 0.9,
  // Auto-follow: while moving (and not just after a manual drag) the camera
  // eases to sit behind the raptor's heading so you always see where you run —
  // important in a chase. Gentler than the position lerp so it never fights you.
  autoFollowLerp: 0.035,    // per-frame easing of the orbit angle toward behind-heading
  manualHoldSeconds: 1.6,   // suspend auto-follow this long after a manual camera drag
};

export const DAYNIGHT = {
  // Full day length. Long enough that a typical 60-120s run sees only a gentle
  // afternoon shift, not a plunge into darkness mid-game (the cycle is ambient
  // mood, not a gameplay mechanic). Raised from 120 after the arena was reading
  // too dark mid-run.
  cycleSeconds: 240,
  minDayLight: 0.35,     // floor on the day factor so the arena never goes truly dark while playing
};

// Run-scoped DUSK arc — the actual day/night *gameplay* mechanic. Independent of
// the slow ambient DAYNIGHT cycle: every run starts in bright afternoon and
// marches toward dusk over `fullDuskSeconds`, giving each session a readable,
// escalating arc. As dusk deepens (duskFactor 0..1) predators grow bolder. The
// world never goes pitch black — `minLight` floors the visible darkness so it
// stays playable; the danger, not the gloom, is the point. All arcade-feel.
export const DUSK = {
  startSeconds: 25,       // sec of full daylight before dusk begins creeping in
  fullDuskSeconds: 150,   // sec from run start to deepest dusk (duskFactor = 1)
  minLight: 0.45,         // light floor at deepest dusk (0 = black, 1 = noon)
  warmth: 0.35,           // how far the sky/fog shifts toward warm orange at full dusk
  // How much boldness the T-Rex gains at full dusk (multipliers/additions blended
  // by duskFactor). Sight reaches further, it loses interest later and runs faster.
  trexSightBonus: 16,     // +world units of sight range at full dusk
  trexLoseBonus: 14,      // +world units of lose-interest range at full dusk
  trexSpeedBonus: 2.5,    // +chase units/sec at full dusk
  herbFleeBonus: 6,       // +herbivore flee range at full dusk (the herd gets jumpy too)
  // duskFactor at which the run flips to a visible "dusk" presentation (icon/label)
  // AND fires the one-shot "predators grow bolder" cue. Shared so HUD + game agree.
  duskThreshold: 0.5,
  // Risk/reward payoff: banking eggs as dusk deepens is worth more. The score
  // multiplier scales from 1x (full day) to 1 + bankBonus at deepest dusk, so
  // brave late play pays off — dusk is exciting, not only punishing. Arcade.
  bankBonus: 1.0,         // +100% bank value at deepest dusk (so up to 2x)
};

// Atmosphere: stylised non-gameplay set dressing. A pterosaur flock circles
// overhead, low drifting clouds, and floating pollen motes catch the light.
// Pure visual polish — none of it collides or affects the sim.
export const ATMOSPHERE = {
  birdCount: 7,          // circling pterosaurs
  birdHeight: 34,        // altitude they cruise at
  birdRadius: 60,        // orbit radius around the arena centre
  birdSpeed: 0.12,       // radians/sec around the orbit
  cloudCount: 9,
  cloudHeight: 70,
};

// Pterosaur dive attack: occasionally a member of the flock peels off and
// swoops at the raptor. A telegraphed screech precedes the dive so it can be
// dodged; contact at the bottom of the swoop deals a small hit, then it climbs
// back to the orbit. A second airborne threat besides the ground predators.
export const PTERO_DIVE = {
  minInterval: 9,     // sec — minimum gap between dive attempts
  maxInterval: 16,    // sec — maximum gap
  telegraphTime: 1.1, // sec of warning screech/glow before the swoop commits
  diveSpeed: 38,      // units/sec on the way down toward the player
  climbSpeed: 22,     // units/sec returning to the orbit
  hitRange: 3.2,      // contact range at the bottom of the swoop
  damage: 12,         // health lost on a connecting swoop
  hitCooldown: 1.0,   // sec lockout so one swoop lands at most one hit
};

// Per-species facing correction (radians) applied on top of the gameplay yaw.
// Quaternius glb dinos import facing +Z in Babylon's left-handed scene, which
// matches our atan2(dx, dz) -> rotation.y convention, so the default is 0.
// If a species visibly runs backwards in the ?probe harness, set its entry to
// Math.PI here — no code change needed. Verified via window.__probeResult.
export const FACING_OFFSET = {
  // The Quaternius "Adventurer" (human player) authors its forward toward +Z,
  // same as the dinos (matches our atan2(dx,dz)->rotation.y convention), so no
  // correction is needed. Verified by a side-on screenshot: with offset 0 the
  // human's chest/face lead his travel heading. (An earlier PI guess made him
  // visibly run BACKWARDS — backpack-first — so this is 0, not PI.)
  human: 0,
  raptor: 0,
  trex: 0,
  triceratops: 0,
  stegosaurus: 0,
  apatosaurus: 0,
  parasaur: 0,
};

// Juice / feedback tunables — all deliberate arcade-feel choices.
export const JUICE = {
  camShakeOnHit: 0.5,       // shake magnitude when player is hit
  camShakeDecay: 4.0,       // per-second decay of shake
  hitFlashSeconds: 0.18,    // emissive flash duration on a struck dino
  dustInterval: 0.16,       // sec between footstep dust puffs while running
  pickupPopSeconds: 0.4,    // egg pickup burst lifetime
  lowHealthThreshold: 0.35, // fraction below which the red vignette appears
  chargeShake: 0.3,         // camera shake when a triceratops charges
  strikeConnectShake: 0.22, // small kick when the player's punch/kick lands (tactile confirmation; < a hit-taken)
  feedHitShake: 0.33,       // bigger kick when the player lands a strike on a FEEDING T-Rex (the bonus-damage flank hit reads heavier)
  sanctuaryShake: 0.45,     // strong brief kick selling the full-ring sanctuary payoff
};

export const AUDIO = {
  masterVolume: 0.6,
  musicVolume: 0.25,
  startMuted: false,
  // Tension heartbeat interval (sec) interpolates from far to point-blank.
  tensionIntervalFar: 1.1,
  tensionIntervalNear: 0.35,

  // --- Footsteps (synced to the human's locomotion in the game loop) ---
  // Cadence = seconds between footfalls. A human walk cadence is ~0.55s/step,
  // a run ~0.32s/step (≈110 vs 185 steps/min — real walking/running cadence,
  // Murray 1967 / running gait literature), so sprinting is faster + louder.
  // These are the gameplay feel values, not a literal biomech sim.
  footstepWalkInterval: 0.5,    // sec between steps at walk speed
  footstepSprintInterval: 0.28, // sec between steps at sprint (faster cadence)
  footstepWalkVolume: 0.12,     // quieter, softer walk thud
  footstepSprintVolume: 0.24,   // louder, harder sprint impact
  footstepWadeVolume: 0.3,      // a wet stomp when wading through the pond

  // --- Ambient creature vocalisations (periodic roars/calls in the loop) ---
  // The arena periodically vocalises: predators roar, herbivores call. Each is
  // distance-attenuated to the player (closer = louder) and the predator gets
  // more frequent + louder as it closes. Intervals are randomised within a band
  // so calls don't sound metronomic.
  vocalIntervalMin: 3.5,        // sec — shortest gap between ambient calls (far/calm)
  vocalIntervalMax: 7.0,        // sec — longest gap between ambient calls
  vocalNearInterval: 1.6,       // sec — call gap when a predator is right on you
  vocalFalloffRange: 90,        // u — beyond this an off-screen call is inaudible
  vocalMinGain: 0.12,           // floor so a distant call is faint but present
  // Smoothing time-constant (sec) for distance-attenuated roar/call gain ramps —
  // setTargetAtTime time constant so a call swells in / fades out, never pops.
  vocalGainGlide: 0.04,

  // --- Player panting / breathing (loop tied to sprint + stamina) ---
  // A breathing loop fades in while sprinting/dashing and gets heavier as
  // stamina drains, easing back to silence as it recovers. Smooth gain ramps.
  pantMaxVolume: 0.5,           // gain at full exertion (empty stamina, sprinting)
  pantMinRate: 0.85,            // playbackRate (slower breaths) when freshly sprinting
  pantMaxRate: 1.5,             // playbackRate (fast panting) at/near exhaustion
  pantFadeGlide: 0.25,          // sec time-constant for the breath fade in/out

  // Real CC0/royalty-free sample files (Kenney CC0 footsteps; Mixkit + OpenGameArt
  // for creatures/breath — see CREDITS.md). Loaded as WebAudio buffers and played
  // per event with slight pitch randomisation. Swap a default by repointing a path
  // here to a file in assets/audio/candidates/ after the user auditions the picker.
  samples: {
    footsteps: [
      "assets/audio/footstep_0.mp3",
      "assets/audio/footstep_1.mp3",
      "assets/audio/footstep_2.mp3",
      "assets/audio/footstep_3.mp3",
    ],
    pant: "assets/audio/pant.mp3",
    // Per-creature-kind vocalisation. Keyed by the dino `kind` string.
    creatures: {
      trex: "assets/audio/trex.mp3",            // eerie low closed-mouth rumble
      raptor: "assets/audio/raptor.mp3",        // user pick: raptor_screech_c
      // Herbivores split across two user-picked bellows so species sound distinct.
      triceratops: "assets/audio/herbivore_a.mp3",
      parasaur: "assets/audio/herbivore_a.mp3",
      stegosaurus: "assets/audio/herbivore_b.mp3",
      apatosaurus: "assets/audio/herbivore_b.mp3",
    },
    // Giant-sauropod footfall thud (user pick: herb_bellow_c repurposed),
    // played on the step cadence of nearby big dinos.
    bigStep: "assets/audio/bigstep.mp3",
  },
  // User feedback: baked trex rumble was pitched down too far — lift at playback.
  trexRumbleRate: 1.25,
  bigStepInterval: 1.2,   // sec between sauropod footfall thuds (amble cadence)
  bigStepRange: 50,       // thuds audible within this many world units
};

// On-screen touch controls (phones/tablets). The joystick maps to WASD so all
// movement logic is reused; deadZone avoids drift, sprintMag is the deflection
// fraction at which sprint engages. Design choices for a comfortable thumb feel.
export const TOUCH = {
  joyRadius: 60,    // px — max knob travel from the stick centre
  deadZone: 0.22,   // fraction of radius below which input is ignored
  sprintMag: 0.92,  // deflection fraction (0..1) that triggers sprint
};

export const MINIMAP = {
  size: 150,            // px on screen
  worldToMap: null,     // computed from ARENA.radius at runtime
};
