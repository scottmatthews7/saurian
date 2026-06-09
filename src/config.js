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
  // Sprint stamina — turns infinite-sprint escape into a managed resource so
  // the T-Rex stays threatening. Values chosen for ~3.3s of sprint then a
  // recovery window; a deliberate arcade-feel design choice.
  staminaMax: 100,
  staminaDrain: 30,     // per second while sprinting
  staminaRegen: 18,     // per second while not sprinting
  staminaSprintMin: 10, // need at least this much to start sprinting again
  carrySlow: 0.6,       // speed multiplier per egg carried, applied as 1/(1+n*x)
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
};

export const HERBIVORE = {
  count: 9,
  wanderSpeed: 3.5,
  fleeSpeed: 9,
  fleeRange: 16,         // starts fleeing player/trex within this
  turnLerp: 0.08,
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
};

export const CAMERA = {
  distance: 14,
  height: 7,
  lerp: 0.12,
  fov: 0.9,
};

export const DAYNIGHT = {
  cycleSeconds: 120,     // full day length
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
};

export const AUDIO = {
  masterVolume: 0.6,
  musicVolume: 0.25,
  startMuted: false,
  // Tension heartbeat interval (sec) interpolates from far to point-blank.
  tensionIntervalFar: 1.1,
  tensionIntervalNear: 0.35,
};

export const MINIMAP = {
  size: 150,            // px on screen
  worldToMap: null,     // computed from ARENA.radius at runtime
};
