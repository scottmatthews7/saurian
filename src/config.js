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
  walkSpeed: 7,        // units/sec
  runSpeed: 14,        // hold Shift
  turnLerp: 0.18,      // rotation smoothing 0..1
  jumpSpeed: 9,
  gravity: -22,
  radius: 1.1,         // collision ellipsoid
  height: 2.0,
  maxHealth: 100,
  attackRange: 4.5,
  attackCooldown: 0.7, // sec
  attackDamage: 34,    // damage dealt to a predator on a landed bite
  invulnAfterHit: 1.0, // i-frames after taking damage (sec)
  attackLockSeconds: 0.45, // movement-lock duration of a bite (the bite window)
  lungeSpeed: 9,       // forward burst (units/sec) during the bite window
  lungeSeconds: 0.18,  // how long the lunge push lasts within the bite
  // Sprint stamina — turns infinite-sprint escape into a managed resource so
  // the T-Rex stays threatening. Values chosen for ~3.3s of sprint then a
  // recovery window; a deliberate arcade-feel design choice.
  staminaMax: 100,
  staminaDrain: 30,     // per second while sprinting (~3.3s of full sprint)
  // Regen raised 18->24 in session 7. Playtesting (steering bot + frame traces)
  // showed a sustained T-Rex chase was inescapable: the exhaustion lockout pinned
  // the raptor at walk speed (7) while the T-Rex sustains 11 u/s, so it stayed in
  // attack range biting every 1.4s with no way to open a gap. Faster regen
  // (~4.2s to refill) lets a player who buys a moment with a ROAR actually sprint
  // home, without removing the drain pressure that keeps infinite-sprint off.
  staminaRegen: 24,     // per second while not sprinting
  staminaSprintMin: 10, // need at least this much to start sprinting again
  // Carry weight, applied as speed *= 1/(1+n*carrySlow). Tuned in session 7
  // playtesting: at 0.6 a single carried egg dropped sprint to 8.75 u/s — below
  // the T-Rex's 11 u/s base chase — so the moment you grabbed ANY egg while
  // hunted you could never reach the nest (verified unwinnable via a steering
  // bot). At 0.18: 1 egg = 11.9 u/s (just outruns the base T-Rex — escapable
  // with skill), 2 eggs = 10.3 (tense, roughly matched), 3 = 9.1 (greedy = you
  // can't escape). Keeps the risk/reward weight; restores a winnable run. At
  // full dusk the T-Rex chase reaches 13.5, so even 1 egg can't be outrun then —
  // roar becomes the intended late-game counterplay.
  carrySlow: 0.18,      // speed multiplier per egg carried, applied as 1/(1+n*x)
  // Intimidating ROAR (Q) — an active panic/utility tool. On a cooldown the
  // raptor bellows: a chasing T-Rex inside the radius is briefly staggered
  // (its pursuit broken), and nearby herbivores bolt in terror. Costs nothing
  // but the cooldown, so it's a tactical "get off me" button, not spammable.
  // All values are arcade-feel design choices.
  // Cooldown lowered 8->6 in session 7. The roar is the *designed* escape from a
  // sustained chase (you can't simply outrun the T-Rex once it's on you), so it
  // needs to come round often enough to chain: roar -> sprint in the stagger
  // window -> roar again as it re-closes. At 8s with a 1.4s stagger it was usable
  // only ~17% of the time and a chase from across the arena was a death sentence.
  // 6s still leaves a clear vulnerable window, so it's a tool, not a panic button.
  roarCooldown: 6,      // sec between roars
  roarRadius: 22,       // world units of effect
  roarStagger: 1.4,     // sec a caught T-Rex is frozen/dazed
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
};

export const HERBIVORE = {
  count: 9,
  maxHealth: 60,         // bites to fell: 2 at PLAYER.attackDamage 34 (drops healing meat)
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
  biteConnectShake: 0.22,   // small kick when the raptor's bite lands (tactile confirmation; < a hit-taken)
  roarShake: 0.45,          // strong brief kick selling the intimidating roar
};

export const AUDIO = {
  masterVolume: 0.6,
  musicVolume: 0.25,
  startMuted: false,
  // Tension heartbeat interval (sec) interpolates from far to point-blank.
  tensionIntervalFar: 1.1,
  tensionIntervalNear: 0.35,
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
