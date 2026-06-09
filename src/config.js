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
};

export const HERBIVORE = {
  count: 9,
  wanderSpeed: 3.5,
  fleeSpeed: 9,
  fleeRange: 16,         // starts fleeing player/trex within this
  turnLerp: 0.08,
};

export const EGGS = {
  count: 8,
  targetToWin: 6,
  pickupRange: 2.8,
  bobHeight: 0.4,
  glowIntensity: 0.8,
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
};

export const AUDIO = {
  masterVolume: 0.6,
  musicVolume: 0.25,
  startMuted: false,
};

export const MINIMAP = {
  size: 150,            // px on screen
  worldToMap: null,     // computed from ARENA.radius at runtime
};
