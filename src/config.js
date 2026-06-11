// Central tunables. Every value here is a deliberate design choice for a
// stylised arcade chase game — not derived from any external benchmark.
// Adjust here only; nothing below should hardcode gameplay numbers.

// WORLD overhaul: the arena is DOUBLED from radius 90 -> 180 (owner: "expand the
// map by double the size"). Everything that derives from the radius — terrain
// generation, heightAt, biome zone placement, dino/egg/prop spawn ranges, the
// minimap, AI wander/return bounds — reads ARENA.radius, so they all scale. The
// scatter COUNTS are raised ~4x (area scales with radius^2) so the bigger map
// doesn't read empty; all instanced, so the draw cost stays flat.
export const ARENA = {
  radius: 180,         // playable circle radius (world units) — DOUBLED from 90
  groundSize: 440,     // ground plane edge length (= 2 × the old 220, tracks the radius)
  fogDensity: 0.012,   // exponential fog
  treeCount: 260,      // scattered trees (~4× the old 70 — area grew 4× with the doubled radius; instanced)
  rockCount: 130,      // scattered rocks (~4× the old 36; instanced)
  grassPatches: 1200,  // mid-field grass cards (~4× the old 320; instanced)
};

// CRASHED PLANE — static set-dressing at the player spawn (the jungle-clearing
// wreck the survivor wakes beside). Pure visual: no physics, no AI, no collider.
// The source glb's bbox is tiny (~0.6u), so the loader normalises by the model's
// own longest axis to targetLength — never a hardcoded scale.
export const CRASHED_PLANE = {
  url: "assets/models/crashed_plane.glb",
  targetLength: 9,        // metres along the longest axis — a small light aircraft (Cessna 172 ≈ 8.3 m); task brief "~8-10 m"
  // Offset from the player spawn (world origin). The plane is ~9 m long (half ≈
  // 4.5 m); player collider radius is PLAYER.radius (1.1). 7 m clears the fuselage
  // half-extent + the collider + a margin so the survivor wakes BESIDE the wreck,
  // not inside it.
  offset: { x: 6, z: -4 },
  yaw: 2.3,               // radians — heading (arbitrary); the wreck just lies flat on the ground
  // Owner: lay it FLAT on the ground — no pitch, no roll.
  pitch: 0,               // radians (flat)
  roll: 0,                // radians (flat)
  sink: 0.3,              // metres pushed below ground so the belly/wing beds into the soil, not floating
};

// DESERT SET-DRESSING — a small fossil vignette in the dry zone (ENV.dryZone,
// centre -70,-120, radius 60): a half-excavated Stegosaurus SKELETON sunk on its
// side in the sand, with an old dead tree standing a few metres beside it. Both
// are pure scenery: no AI, no physics, no collider (they don't block movement),
// they just cast/receive shadows like the crashed plane. Position is an absolute
// world (x,z); the loaders normalise by each model's OWN longest axis to the
// target metres (the source bboxes are arbitrary units), so no hardcoded scale.

// STEGOSAURUS SKELETON — a fossil HALF-BURIED in the desert sand, NOT standing.
// The source glb's long axis (nose-to-tail) ≈ 6.7 native units; normalised to
// targetLength metres. Laid on its side (roll ≈ 86°) with a slight extra pitch +
// off-axis yaw so it reads as a fallen, sunk carcass, then SUNK so only a
// fraction of its (rolled) height shows above the sand — a part-excavated dig.
export const STEGO_SKELETON = {
  url: "assets/models/stego_skeleton.glb",
  position: { x: -70, z: -118 },  // desert core (ENV.dryZone centre -70,-120), inside arena radius 180
  targetLength: 8,        // metres along the longest axis — a real Stegosaurus is ~7-9 m nose-to-tail
  // Fallen-on-its-side attitude. Roll ~86° lays it on a flank; a small pitch +
  // off-axis yaw stop it looking deliberately placed (it slumped and sank).
  pitch: 0.12,            // radians — slight nose-down slump
  yaw: 0.7,               // radians — fossil lies at an angle to the world axes
  roll: 1.5,              // radians (~86°) — laid on its side, NOT upright
  // buriedFraction of the prop's final (rolled) height is sunk below the sand,
  // so only the top ~45% (upper ribcage / plates / a limb) protrudes — a
  // half-excavated fossil rather than a skeleton resting on the surface.
  buriedFraction: 0.55,   // 0..1 of the rolled bbox height pushed under the sand surface
};

// OLD DEAD TREE — a bare, sun-bleached tree standing UPRIGHT on the sand a few
// metres from the fossil. The source glb's tallest axis ≈ 1.9 native units;
// normalised to targetHeight metres. Slight yaw so it isn't axis-aligned.
export const OLD_TREE = {
  url: "assets/models/old_tree.glb",
  position: { x: -66, z: -122 },  // ~4.5 m from the skeleton — a desert vignette pairing
  targetHeight: 8,        // metres tall — a real mature tree is ~6-10 m
  yaw: 2.1,               // radians — arbitrary heading so it doesn't face the axes
  sink: 0.2,              // metres pushed below ground so the trunk base beds into the sand, not floating
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
  regenDelay: 6,       // sec unhurt before slow passive health regen begins
  regenRate: 4,        // health/sec regenerated once safe (~25s near-death to full)
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
  // (The raptor-era ROAR (Q) was removed when the player became a human — a
  // human can't bellow a T-Rex into a stagger; dash is the personal escape tool.)
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
  patrolSpeed: 4,        // slow, deliberate prowl
  // The T-Rex is a STALKER, not a sprinter (real ~20km/h ambush hunter). Its
  // steady approach is SLOW — a walking player (7) outpaces it, a sprinter
  // leaves it for dead — so it closes quietly then AMBUSHES with a short fast
  // lunge. Tension without a relentless race.
  chaseSpeed: 8.5,       // stalk/approach speed (was 11)
  chaseSpeedRamp: 0.5,   // +units/sec per wave
  // AMBUSH: crept within ambushRange, it explodes into a brief burst (the lunge)
  // to land a bite, then must recover before lunging again.
  ambushRange: 14,
  ambushSpeed: 17,       // burst speed during the lunge (beats a sprint momentarily)
  ambushSeconds: 0.9,
  ambushCooldown: 4.5,   // recovery before it can ambush again
  // DISENGAGE: once the player breaks line and gets clear it gives up and won't
  // re-aggro for a few seconds even if it can still see you — a real escape.
  disengageCooldown: 6,
  sightRange: 34,
  loseInterestRange: 40, // breaks off sooner — get this far and it loses you
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
  // just the player. This delivers the stated design ("a T-Rex hunts you and the
  // herd") and creates emergent strategy — herbivores are living decoys. While
  // NOT locked onto the player (player out of close range), a T-Rex that sees a
  // closer herbivore peels off to hunt it: bites it down, which drops meat the
  // player can then scavenge. Lure the predator onto a stegosaurus to buy
  // yourself a breather, or steal its kill. All arcade-feel choices, tuned
  // against the existing chase economy.
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
  // only if the player crowds it at point-blank (it whirls to defend).
  // Provenance: design choice, tuned so one full feeding window roughly equals
  // a one-strike-saved comeback, not a free kill.
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
  strength: 2.6,         // how hard the TANGENTIAL (around-the-obstacle) steer bends the heading
  // Jitter fix (see avoidObstacles): steer AROUND obstacles tangentially and
  // commit to one side for a few frames instead of re-deciding every frame, so
  // a dino skirting a tree no longer vibrates as away-push and goal-pull flip.
  radialKeep: 0.6,       // small straight-away component kept so it doesn't creep into the obstacle (< strength, which slides it past)
  commitFrames: 30,      // frames a chosen skirt-side is held before re-deciding (~0.25-0.5s depending on FPS) — long enough to clear a footprint, short enough to react to a new one
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
  // Locomotion polish (wishlist item 3 — "doesn't move very well"). After a
  // charge the triceratops needs a beat to wheel its bulk back around before it
  // resumes fleeing/wandering, otherwise it snaps instantly from a flat-out
  // charge into a reverse sprint and reads as juddering. recoverSeconds is a
  // short settle where it decelerates and re-points; turnLerp gives the big
  // quadruped a faster pivot than the herd default (0.08 looked sluggish/sliding
  // for its size). Both arcade-feel choices tuned by eye against the gait.
  recoverSeconds: 0.5,    // post-charge settle before normal AI resumes
  turnLerp: 0.14,         // its own turn rate (> HERBIVORE.turnLerp 0.08 — crisper pivot)
  walkClipSpeed: 1.05,    // Walk clip playback so the feet track wanderSpeed (was the shared 0.8 — looked like foot-slide on the heavy frame)
};

// RAPTOR PACK predator (wishlist item 4d). The raptor.glb is free now the player
// is a human. Raptors hunt in a coordinated pack: fast, weaker than the T-Rex,
// and they SURROUND the player — each pack member is assigned a slot angle around
// the target and converges on its flank rather than all piling onto the same
// point, so they cut off escape lanes. All arcade-feel, anchored on the existing
// chase economy (T-Rex base chase 11 u/s, player sprint 16.5, walk 7):
export const RAPTOR = {
  packSize: 4,            // 3-5 hunt together; a swarm needs numbers (see packMin/packMax)
  packMin: 3,
  packMax: 5,
  // Turkey-sized (per the player's note): real Velociraptor stood ~0.5m at the
  // hip / ~0.7m head-height — a small, light ankle-biter, NOT a man-sized raptor.
  // The player model is 2.0u ≈ 1.8m, so ~1.1u/metre; 0.7m ≈ 0.75u standing height.
  modelHeight: 0.75,      // turkey-sized — small + quick (was 2.0u, far too big)
  chaseSpeed: 13.5,       // quick — faster than the T-Rex's 11, still below the player's 16.5 sprint so a clean sprint escapes; the threat is the swarm closing, not a straight-line outrun
  patrolSpeed: 6,
  sightRange: 34,
  loseInterestRange: 44,  // get this far and the pack loses you
  disengageCooldown: 5,   // sec the pack ignores you after giving up — a getaway sticks
  attackRange: 1.8,       // tiny jaws — must get right on your ankles to nip (vs the 5.0 T-Rex bite)
  attackCooldown: 0.8,    // quick repeated nips
  attackDamage: 5,        // very weak per nip (vs the T-Rex's 22) — a full 4-swarm peaks ~20/round only if they ALL connect; you punch them off easily
  maxHealth: 24,          // fragile: 1 player bite at attackDamage 34 fells one — easy to scatter, dangerous only as a group
  turnLerp: 0.18,         // very nimble little hunter
  // Flanking: each pack member is assigned a FIXED, evenly-spaced slot angle on a
  // ring around the player and steers to hold that slot, so the swarm fans out
  // and encircles instead of stacking on one point. Inside lungeRange a member
  // drops its slot and darts straight in for the nip.
  surroundRadius: 6,      // the standoff ring the swarm tries to hold around you
  slotJitter: 0.35,       // radians of wobble on each member's slot so the ring isn't robotically rigid
  lungeRange: 5,          // inside this a member commits straight in for the nip
  // No enrage/comeback mechanic — a wounded swarm is just a smaller swarm; the
  // pressure is numbers. The pack yips once as a group on first lock-on.
  secondPackWave: 2,      // a pack joins from this difficulty wave (~60s), after the lone T-Rex establishes
};

// New animated species added to the roster (wishlist item 4c). poly.pizza has
// exactly ONE animated CC0 dinosaur set — the Quaternius Animated Dinosaur
// Bundle — and we already ship all six of it (no animated Spinosaurus/Anky/etc.
// exist there to download). So rather than ship STATIC reskins (the wishlist
// forbids static), each new species REUSES an existing rigged+animated Quaternius
// mesh under a distinct tint + body-proportion signature so it animates with the
// shared Idle/Walk/Run/Attack/Death clip set but reads as a different animal.
// `base` is the existing kind whose glb/rig is reused; `tint`/`emissive` recolour
// it; `stretch` reshapes the body (x=width, y=height, z=length multipliers on top
// of the height-normalised scale) to shift the silhouette. All design choices.
export const DINO_VARIANTS = {
  // Spinosaurus — long-snouted sail-back; reuse the T-Rex biped, longer + darker,
  // a touch teal. A second large herbivore-hunting bruiser in the herd-predation
  // role is overkill, so it slots in as a big, slow, TANKY herbivore that charges
  // like the triceratops when cornered (a sail-backed wall, not a chaser).
  spinosaurus: {
    base: "trex",
    height: 4.0,
    stretch: { x: 0.9, y: 1.0, z: 1.35 },   // longer body + snout
    tint: { r: 0.20, g: 0.32, b: 0.40 },    // slate teal
    emissive: { r: 0.02, g: 0.05, b: 0.07 },
    diet: "herbivore",
    canCharge: true,
    // DISABLED (owner: "there's still the old low poly t rexes running around").
    // The Spinosaurus reuses the low-poly trex.glb recoloured+stretched and is
    // NOT proceduralized, so on the map it reads as a low-poly T-Rex roaming
    // about. The procedural-mesh swap in dino.js is gated to kind==="trex" only,
    // so this variant never gets the high-quality mesh. Until a procedural
    // Spinosaurus exists it is removed from the spawn roster (ai.js filters on
    // this flag) so the ONLY T-Rex-shaped creature in-game is the one procedural
    // predator. Its TERRITORY (wetland) is kept below for when it returns.
    // TODO(spino): re-enable once procmesh/spinosaurus.js exists and dino.js
    // swaps it in like the T-Rex — then drop this flag.
    disabled: true,
  },
  // Ankylosaurus — squat armoured tank; reuse the stegosaurus quadruped, wider +
  // lower, mossy grey-green. Slow, very tanky herbivore that holds ground.
  ankylosaurus: {
    base: "stegosaurus",
    height: 2.4,
    stretch: { x: 1.3, y: 0.8, z: 1.05 },   // broad, low-slung
    tint: { r: 0.34, g: 0.36, b: 0.26 },    // mossy olive-grey
    emissive: { r: 0.03, g: 0.03, b: 0.02 },
    diet: "herbivore",
    healthMul: 1.6,                          // armoured: tankier than the herd baseline
  },
  // Pachycephalosaurus — dome-headed biped; reuse the parasaur rig, shorter +
  // stockier, warm tan. A skittish herbivore that headbutt-charges when cornered.
  pachycephalosaurus: {
    base: "parasaur",
    height: 2.6,
    stretch: { x: 1.05, y: 0.92, z: 0.95 },
    tint: { r: 0.55, g: 0.42, b: 0.26 },    // warm tan
    emissive: { r: 0.05, g: 0.035, b: 0.02 },
    diet: "herbivore",
    canCharge: true,
  },
  // Brachiosaurus — towering long-neck; reuse the apatosaurus rig, taller, paler
  // blue-grey. A huge, placid herbivore (a living landmark + decoy for the T-Rex).
  brachiosaurus: {
    base: "apatosaurus",
    height: 7.0,
    stretch: { x: 1.0, y: 1.25, z: 1.0 },    // even taller
    tint: { r: 0.46, g: 0.52, b: 0.58 },     // pale blue-grey
    emissive: { r: 0.04, g: 0.05, b: 0.06 },
    diet: "herbivore",
    healthMul: 1.4,
  },
  // Compsognathus — tiny fast scavenger; reuse the raptor rig, much smaller, a
  // greenish-yellow. Skittish herbivore that darts about (no charge — it bolts).
  compsognathus: {
    base: "raptor",
    height: 0.9,
    stretch: { x: 0.9, y: 0.9, z: 0.95 },
    tint: { r: 0.55, g: 0.58, b: 0.22 },     // olive-yellow
    emissive: { r: 0.04, g: 0.045, b: 0.015 },
    diet: "herbivore",
    speedMul: 1.4,                           // little and quick — flees faster than the herd
  },
};

// PER-SPECIES TERRITORIES (owner: "restricting dinosaurs to operate in certain
// areas so they're not running around in random areas"). Each species has a
// home REGION on the doubled map: a centre (world x,z) + radius, plus the BIOME
// it belongs to (for the PRD geography sections). The AI enforces this as a SOFT
// boundary (ai.js, applyTerritory): a dino wandering/chasing past its territory
// edge feels an inward pull and loses interest in chasing prey beyond it, so it
// turns back rather than roaming the whole map — but territories are LARGE (not
// cages) so the predator hunt stays fun. Centres/radii track the biome layout
// set above (pond W, desert SW, jungle N, ocean E, open plains centre).
//
//   biome   — the zone this species operates in (matches the PRD geography text)
//   centerX/centerZ/radius — the home region on the radius-180 map
//   edgeSoftness — world units before the edge where the inward pull ramps in
//                  (the soft band; bigger = gentler turn-back)
//   leashHard — absolute outer limit: a dino is never pulled hard until this far
//               past its radius (so a committed chase can briefly overrun the
//               soft edge before being reined in — keeps hunts from feeling
//               like a wall). A multiple of the soft band.
export const TERRITORY = {
  // T-Rex — dry/rocky + open plains. A LARGE central+south-west range so the
  // apex hunt roams the open valley and the desert margin, but not the far
  // northern jungle or the eastern coast.
  trex: { biome: "dry rocky margin & open plains", centerX: -40, centerZ: -40, radius: 130, edgeSoftness: 24 },
  // Raptors — the jungle thicket & its edges (north). Fast flankers that stalk
  // out of the treeline; their range hugs the northern jungle.
  raptor: { biome: "jungle thicket & its edges", centerX: 10, centerZ: 110, radius: 95, edgeSoftness: 22 },
  // Sauropods — open plains (the central valley). Big placid grazers stay in
  // the open middle ground.
  apatosaurus: { biome: "open plains", centerX: 0, centerZ: 0, radius: 120, edgeSoftness: 24 },
  brachiosaurus: { biome: "open plains", centerX: 0, centerZ: 0, radius: 120, edgeSoftness: 24 },
  // Stegosaurus / Triceratops — plains & the forest edge (north-of-centre,
  // overlapping the jungle fringe where they browse).
  stegosaurus: { biome: "open plains & forest edge", centerX: 5, centerZ: 55, radius: 110, edgeSoftness: 22 },
  triceratops: { biome: "open plains & forest edge", centerX: 5, centerZ: 55, radius: 110, edgeSoftness: 22 },
  // Parasaurolophus — plains/forest edge, like the other crested browsers.
  parasaur: { biome: "open plains & forest edge", centerX: 5, centerZ: 45, radius: 110, edgeSoftness: 22 },
  // --- Variant herbivores -------------------------------------------------
  // Ankylosaurus — armoured plains grazer (open valley, south-of-centre).
  ankylosaurus: { biome: "open plains", centerX: -10, centerZ: -20, radius: 100, edgeSoftness: 22 },
  // Pachycephalosaurus — dry scrub at the desert edge (south-west fringe).
  pachycephalosaurus: { biome: "dry scrub & plains margin", centerX: -45, centerZ: -75, radius: 90, edgeSoftness: 22 },
  // Compsognathus — skittish little scavengers around the jungle edge.
  compsognathus: { biome: "jungle edge & plains", centerX: 15, centerZ: 80, radius: 100, edgeSoftness: 22 },
  // Spinosaurus — WETLAND/swamp (the western pond), for when it returns (it is
  // currently disabled from spawning; see DINO_VARIANTS.spinosaurus).
  spinosaurus: { biome: "wetland & swamp (western pond)", centerX: -78, centerZ: 56, radius: 70, edgeSoftness: 20 },
  // Plesiosaur (marine) — the eastern OCEAN, for the future marine reptile.
  plesiosaur: { biome: "the eastern ocean", centerX: 150, centerZ: 0, radius: 90, edgeSoftness: 20 },
  // Multiplier on edgeSoftness giving the hard outer leash (how far a committed
  // chase may overrun the soft edge before a firm inward pull). Shared by all.
  leashHardMul: 2.0,
};

// Pterosaur flyer (wishlist item 4 — replace the procedural cone). A proper
// procedural winged flyer built in flyer.js: a tapered body, a long beak, a
// swept-back head crest, and two membrane wings (forearm + spar + skin) that
// flap. These are the build proportions (world units at the flock's native
// scale) and the flap animation rates. All visual design choices.
export const FLYER = {
  bodyLength: 1.8,        // nose-to-tail body spindle length
  bodyRadius: 0.28,       // body girth
  wingSpan: 3.6,          // tip-to-tip span (each wing half = span/2)
  wingChord: 1.0,         // front-to-back depth of the membrane at the root
  beakLength: 0.9,        // long pterosaur beak
  crestSize: 0.55,        // swept head crest (the Pteranodon read)
  flapRateCruise: 5.0,    // rad/sec wing-beat frequency while orbiting
  flapRateDive: 9.0,      // faster, frantic beat during a dive
  flapAmplitude: 0.7,     // radians the wings sweep up/down from level
  membraneAlpha: 0.92,    // wing skin is near-opaque (a touch of translucency reads as membrane)
  bodyColor: { r: 0.22, g: 0.18, b: 0.20 },   // dark leathery body
  membraneColor: { r: 0.34, g: 0.26, b: 0.28 }, // slightly warmer wing skin
};

// CONSUMABLE eggs (objectives simplified — wishlist item 11). The old
// return-to-nest/banking loop is gone: an egg is now eaten the moment you walk
// over it, restoring health + stamina on the spot. Rare golden eggs are a
// bigger boost. Amounts are tuned against the existing pickup economy:
export const EGGS = {
  count: 8,              // eggs in the arena at once (carried over from the banking era)
  pickupRange: 2.8,      // walk-over radius (matches PICKUPS.meatRange)
  bobHeight: 0.4,
  glowIntensity: 0.8,
  goldenChance: 0.18,    // probability an egg spawns golden (unchanged)
  // Ordinary egg: half a meat's heal (PICKUPS.meatHeal 30) — eggs are plentiful
  // (8 up at once + respawn) and free to grab, where meat needs a kill. The
  // stamina sip is just under a dash's cost (PLAYER.dashCost 35, ~1.2s of
  // sprint at drain 25): a meaningful escape top-up that doesn't make stamina
  // management moot.
  heal: 15,              // health restored by an ordinary egg
  stamina: 30,           // stamina restored by an ordinary egg
  // Golden egg: the premium pickup — out-heals meat (30) and refills stamina to
  // full (PLAYER.staminaMax 100), a genuine get-out-of-trouble find. Spawns far
  // out, so it stays a risk/reward run.
  goldenHeal: 40,        // health restored by a golden egg (> meat's 30)
  goldenStamina: 100,    // stamina restored by a golden egg (a full refill)
  // Endless survival needs a sustained pickup economy: a consumed egg respawns
  // somewhere fresh after this long. One difficulty wave (30s) per egg keeps the
  // valley stocked without making heals constant.
  respawnSeconds: 30,
};

// SURVIVAL SCORING (the interim objective until the A→B porter campaign):
// survive as long as possible. Score accrues from time survived, pickups
// grabbed, and close calls. All values anchor on the old banking economy where
// one ordinary egg was worth 100 points:
export const SCORE = {
  survivalPerSec: 10,    // base score per second alive (10s survived = one old egg)
  eggPickup: 100,        // ordinary egg (the old per-egg baseValue retained)
  goldenPickup: 300,     // golden egg (the old 3x golden multiplier retained)
  meatPickup: 50,        // meat scores half an egg — it already pays in a bigger heal
  // A CLOSE CALL is a predator attack negated by dash i-frames (a perfect
  // dodge). Worth more than a routine egg, less than a golden find — skill pays.
  closeCall: 150,
};

// Meat pickups: a fleeing herbivore the raptor bites drops meat that heals on
// pickup, giving a reason to engage the herd rather than only run. Design.
export const PICKUPS = {
  meatHeal: 30,          // health restored per meat
  meatRange: 2.8,
  meatLifetime: 22,      // sec before it despawns
};

// PRIMITIVE TOOLS + BACKPACK INVENTORY (wishlist item 6). Primitive weapons are
// scattered in the arena to walk over and collect into a backpack; the active
// one is selected from a hotbar (number keys) and shown in the human's hand.
// With a melee weapon equipped, the strike does MORE damage / longer reach than
// the bare punch+kick (PLAYER.attackDamage 34 / attackRange 4.5, which stays the
// unarmed fallback). A rock is thrown as a projectile. A torch deters predators.
//
// All combat numbers anchor on the existing economy so weapons feel like a clear
// upgrade without trivialising the fight:
//  - Unarmed baseline: 34 dmg, 4.5 reach (PLAYER). Fells a 24-HP raptor in one
//    hit, a 60-HP herbivore in two, a 140-HP T-Rex in ~5.
//  - Spear: long reach, solid damage — the safe anti-raptor poke (keeps the
//    swarm at arm's length). Reach 6.5 > unarmed 4.5.
//  - Club: short reach, big damage + a real stagger — the heavy bruiser that
//    rocks a predator back.
//  - Rock: thrown projectile, one-shot consumable per pickup; staggers + chips.
//  - Torch: weak melee but DETERS predators (a fear radius that pushes raptors
//    back), and a warm light. Cheap deterrence, not a damage weapon.
export const TOOLS = {
  pickupRange: 2.6,        // walk-over radius to collect a weapon (≈ EGGS.pickupRange 2.8 / PICKUPS.meatRange 2.8)
  bobHeight: 0.3,          // idle bob amplitude of a dropped weapon (≈ EGGS.bobHeight 0.4, a touch calmer)
  worldCount: 5,           // primitive weapons scattered in the arena at once
  respawnSeconds: 30,      // a collected weapon respawns fresh after this (mirrors EGGS.respawnSeconds 30 — keeps the valley stocked on a long run)
  backpackSlots: 6,        // hotbar / backpack capacity (1..6 number keys; 4 weapon kinds + room for dupes)

  // STAGGER: a melee hit can briefly freeze a predator's approach (it reels). A
  // window where it can't advance/attack — the player's reward for landing a
  // heavy blow. Bare hands don't stagger; weapons do (per-weapon `stagger`).
  staggerSeconds: 0.7,     // how long a staggered predator is frozen (≈ the player's own attackLock 0.45 + a beat; long enough to read + reposition)

  // Thrown ROCK projectile. Flies flat-ish toward the aim heading, staggers and
  // chips whatever it hits, then is spent. Speed/range are eyeballed against the
  // arena scale (radius 90) and the dash burst (dashSpeed 30) so a throw clearly
  // outpaces a chasing predator and reaches across a mid-distance gap.
  rockSpeed: 34,           // units/sec projectile speed (> dashSpeed 30 so it reads as a fast throw)
  rockRange: 28,           // max travel before it falls spent (≈ TREX.sightRange 34 — reaches a predator just spotting you)
  rockHitRange: 2.2,       // contact radius of the flying rock against a target
  rockGravity: -9,         // gentle arc so the throw dips over distance (well under PLAYER.gravity -22 — a lobbed stone, not a bullet)

  // TORCH deterrence: predators within this radius are pushed back (a fear nudge
  // applied in their AI via a repulsion from the lit torch). Cheap — a position
  // push, no new pathing. Range sits between a raptor's bite (1.8) and the
  // T-Rex's (5.0) so it keeps the swarm at bay but a committed T-Rex can still
  // close through it.
  torchDeterRange: 7,      // world units the lit torch pushes predators back within
  torchDeterStrength: 6,   // units/sec outward shove on a deterred predator (< chaseSpeed 8.5 so a T-Rex still grinds forward, raptors at 13.5 are slowed not stopped)

  // Per-weapon kinds. `damage`/`range` override the unarmed PLAYER baseline while
  // equipped; `stagger` true means a landed hit freezes a predator for
  // staggerSeconds. `throwable` rocks are consumed on throw. `deter` torches push
  // predators back. Damage/range are all anchored on the unarmed 34/4.5:
  kinds: {
    spear:  { label: "Spear",  damage: 42, range: 6.5, stagger: false },  // long poke, +reach for safe anti-raptor jabs (range 6.5 > unarmed 4.5)
    club:   { label: "Club",   damage: 55, range: 4.0, stagger: true },   // heavy bruiser: big damage + a real stagger, short reach
    rock:   { label: "Rock",   damage: 30, range: 4.0, stagger: true, throwable: true },  // melee bonk OR a thrown projectile (staggers); chips ~1/4 of a T-Rex bar on a throw
    torch:  { label: "Torch",  damage: 20, range: 4.2, stagger: false, deter: true },     // weak melee but DETERS predators + lights the area
  },
};

// A shallow water pond carved into the valley. Wading through it slows the
// raptor and ticks gentle damage — a terrain hazard to route around (or risk
// crossing as a shortcut). The T-Rex and herd avoid it. Design choice.
export const WATER = {
  // INLAND pond/wetland — distinct from the new eastern OCEAN (see OCEAN below).
  // On the doubled map (radius 180) it sits in the WEST half so it doesn't crowd
  // the spawn or the ocean; scaled up to read on the bigger valley.
  centerX: -78,         // pond centre (world units), west of the nest
  centerZ: 56,
  radius: 26,           // surface radius (up from 17 to suit the doubled map)
  depth: 1.6,           // how far below local ground the basin sinks
  slowFactor: 0.45,     // player speed multiplier while WADING (shallow edge)
  damagePerSec: 4,      // health drained per second while shallow-wading
  level: 0.2,           // water surface height above the pond-rim ground
  // DEEP water: past this fraction of the radius (toward the centre) the basin
  // is deep enough to swim rather than wade. The basin profile is a smoothstep
  // bowl WATER.depth deep at the centre, easing to 0 at the rim, so the inner
  // disc is where the human's feet leave the bottom. Design choice tuned so the
  // shallow wading ring (where the old slow+drain hazard still applies) stays a
  // readable band around a genuine swimmable middle.
  deepFraction: 0.6,    // 0..1 of the radius inside which water counts as deep (swim)
  swimSlowFactor: 0.55, // player speed multiplier while SWIMMING (slower than land, a touch quicker than the wade crawl)
  swimSurfaceOffset: -0.45, // how far the swimming human's root sits below the water surface (head/shoulders out)
};

// OCEAN / SEA on the EAST edge of the doubled map (owner: "adding an ocean").
// Distinct from the inland WATER pond/wetland above: this is open sea — a large
// water plane filling the eastern margin, a sloping sandy BEACH where the land
// meets it, and gentle animated waves + reflection in keeping with the pond's
// water style. It is the future home of a marine reptile (plesiosaur), so a
// clear, navigable open-water region is left beyond the shore. Built in world.js.
//
// Geometry: the shoreline is a roughly north-south coast at world X = shoreX.
// East of shoreX the terrain ramps DOWN through a beach band into the seabed,
// and the sea surface sits at seaLevel. All values are art-direction choices for
// the doubled arena (radius 180), eyeballed against the existing pond water.
export const OCEAN = {
  shoreX: 120,            // world X of the mean coastline (east of this = sea); inside the radius-180 disc so beach+water are reachable
  beachWidth: 40,         // world units of sloping SAND from the dry dune line down to the waterline (a clearly visible beach)
  seaLevel: -1.4,         // sea surface height (below the inland flats so the coast reads as a descent to the sea)
  seabedDepth: 4.0,       // how far below seaLevel the seabed drops past the surf (deep, navigable open water for the future plesiosaur)
  surfWidth: 10,          // width of the wet foreshore/surf band just seaward of the waterline (darker damp sand + foam line)
  // The visible sea plane extends well past the play radius so the horizon reads
  // as open ocean, not a pond with an edge. It is unlit + fogged like the sky.
  planeSize: 900,         // edge length of the sea surface plane (>> arena so no visible far edge)
  waveAmp: 0.18,          // metres of gentle vertical swell on the sea surface
  waveLength: 22,         // world units between wave crests (long ocean swell)
  waveSpeed: 0.6,         // crests/sec drift speed of the swell
  deepColor: { r: 0.06, g: 0.22, b: 0.30 },   // open-sea teal (a touch deeper/bluer than the pond)
  shallowColor: { r: 0.16, g: 0.42, b: 0.46 },// brighter shallow water near the surf
  beachColor: { r: 0.80, g: 0.72, b: 0.54 },   // pale dune sand of the dry beach
  wetSandColor: { r: 0.55, g: 0.48, b: 0.38 }, // darker damp sand of the foreshore/surf band
  foamColor: { r: 0.92, g: 0.95, b: 0.96 },    // near-white foam line at the waterline
};

// AQUATIC PREDATOR (the OCEAN apex creature). A procedural elasmosaurid
// plesiosaur (src/procmesh/plesiosaur.js) that lives in the EASTERN OCEAN (east
// of OCEAN.shoreX). It patrols SUBMERGED in open water (only a wake shows), then
// SURFACES and rears its long neck, and LUNGES at a player near the coast or in
// the sea before submerging again — so the water's edge feels dangerous. No glb;
// the neck-segment + flipper pivots are animated by node transforms.
// All values are arcade-feel design choices, tuned against the existing chase
// economy (player walk 7 / sprint 16.5, T-Rex bite 22) and the OCEAN geometry
// (shoreX 120, seaLevel -1.4, seabed -5.4, plesiosaur biome centre 150,0 r90).
export const AQUATIC = {
  // --- Build scale ---------------------------------------------------------
  // The procmesh plesiosaur is built at the procgen unit scale (~11.5 u long,
  // neck crest ~3.7 u high). Open water lets it be large: scaled up so it reads
  // as a genuine sea monster. Art-direction choice for the doubled arena.
  modelScale: 2.0,        // uniform scale on the procmesh root
  // Derived footprint helpers (model-units * modelScale). bodyRadius is the
  // half-girth used for in/out-of-water clamps; reach uses the scaled head span.
  bodyRadius: 2.0,        // ~half the scaled trunk width, for shore clamps
  bodyLength: 8.0,        // scaled trunk+neck planar footprint, for "arrived" tests
  surfacedNeckRise: 7.4,  // ~3.7 model-u neck crest * modelScale (informational)
  // --- Colours (PRD §Visual appearance; consumed by the hit-flash) ---------
  eyeColor: { r: 0.784, g: 0.471, b: 0.094 },    // amber #c87818 + emissive
  // --- Lurk / surface geometry (world units, sea-scaled) -------------------
  submergedDepth: 2.2,    // how far the root sinks below the sea surface when lurking
  surfacedRise: 0.6,      // how far the body rises above the sea surface when breached
  // --- Patrol region (OCEAN) ----------------------------------------------
  patrolCenterX: 150,     // matches the plesiosaur biome centre (config DINO biomes)
  patrolCenterZ: 0,
  patrolRadius: 30,       // radius of the open-water roam disc east of the shore
  // --- AI state machine ----------------------------------------------------
  // submerged patrol -> (player near coast/in sea) surface + lunge -> bite ->
  // submerge -> cooldown. It stays seaward of the shoreline (it's a sea creature).
  patrolSpeed: 4.0,       // slow submerged prowl toward roaming targets in open water
  lungeSpeed: 18,         // fast surge during a surfacing lunge (beats a swimming player)
  shoreLureRange: 14,     // player within this of the COAST (or in the sea) can trigger a surface ambush
  surfaceSeconds: 1.0,    // telegraph: it breaches + rears the neck before the strike commits (dodge window)
  lungeSeconds: 1.2,      // duration of the committed lunge surge after the telegraph
  attackRange: 8.0,       // contact range for the head-strike bite (scaled long neck)
  attackDamage: 26,       // bite damage on the player (> T-Rex 22 — punishing if you linger at the coast)
  swimVulnMultiplier: 1.6, // bite damage multiplier while the player is SWIMMING (you're in its element)
  attackCooldown: 1.3,    // sec between bites if the player stays in reach
  submergeSeconds: 5.0,   // sec it lurks submerged after a strike before it can ambush again (the safe window)
  reachBeyondShore: 4.0,  // world units inland of the coastline the head can still strike at the surf
  maxHealth: 120,         // tanky open-water apex; fightable from the beach but no quick kill
  turnLerp: 0.05,         // slow, ponderous turning underwater
};

// ENVIRONMENT REALISM (wishlist item 2). Owns the photoreal world pass: PBR
// ground textures, HDRI image-based lighting, the desaturated natural palette,
// and the post-processing stack (SSAO, ACES + colour grade, bloom, depth of
// field, fog). Kept in one block so the env pass merges cleanly. All values are
// deliberate art-direction choices for a naturalistic primeval-valley look —
// not derived from any benchmark.
export const ENV = {
  // --- PBR ground textures (CC0, ambientCG — see CREDITS.md) -------------
  // A tiled real grass material set (albedo + normal + roughness + AO) replaces
  // the old flat painted colour. The grass↔soil variation is layered on top via
  // baked vertex colours (grassTint↔soilTint below) rather than a second
  // texture, which keeps it to one material/draw and reads well at this scale.
  texturePath: "assets/textures/",
  grassTextures: {
    albedo: "grass_albedo.jpg", normal: "grass_normal.jpg",
    roughness: "grass_roughness.jpg", ao: "grass_ao.jpg",
  },
  groundTiling: 18,        // UV repeats across the ground plane (close-up detail without obvious tiling)
  groundNormalStrength: 0.9, // 0..1+ scale on the normal map's perturbation
  // Desaturated natural ground tints multiplied onto the albedo to push the
  // palette toward olive/sage/moss + earthy brown (kills the cartoon-bright
  // green of the old material). <1 darkens/desaturates the photo albedo.
  grassTint: [0.66, 0.72, 0.52],  // olive-sage
  soilTint: [0.60, 0.52, 0.42],   // warm earthy brown

  // --- HDRI environment (CC0, Poly Haven — see CREDITS.md) ---------------
  hdriPath: "assets/env/sky.hdr",
  hdriSize: 256,           // prefiltered cube size for IBL (256 is plenty for a matte world; keeps load/VRAM low)
  iblIntensity: 0.85,      // environment lighting intensity multiplier
  skyboxBlur: 0.12,        // micro-blur on the visible sky so it reads as a soft distant sky, not a sharp photo
  // USER PICK: the visible SKY is the painted GRADIENT dome (world.js), not the
  // HDRI skybox. The HDRI is still loaded for image-based lighting + reflections
  // (it grounds the PBR materials), but its skybox mesh is hidden so the chosen
  // gradient sky shows through. Flip to true to see the photographic HDRI dome.
  showHdriSkybox: false,

  // --- Fog (richer, depth-graded) ----------------------------------------
  fogDensity: 0.0085,      // exp2 fog — softer/further than the old 0.012 so distance reads with depth, not a wall
  fogColor: [0.70, 0.74, 0.72],  // desaturated sage-grey haze (matches the palette)

  // --- Post-processing pipeline ------------------------------------------
  // ACES tonemap + a gentle filmic colour grade, SSAO for contact shadowing,
  // bloom on highlights, a shallow depth of field, and a faint vignette/grain
  // for a photographic finish. Tuned for "markedly more realistic" while
  // staying performant on a Mac (target 60fps).
  exposure: 1.1,
  contrast: 1.18,
  // Colour grade (ColorCurves): a touch of global desaturation + a cool-shadow
  // / warm-highlight split for a filmic, naturalistic look.
  globalSaturation: 78,    // <100 desaturates globally (kills cartoon vividness)
  globalHue: 8,            // slight warm hue shift
  highlightsSaturation: 64,
  shadowsHue: 210,         // push shadows slightly cool/blue
  shadowsSaturation: 24,
  bloomThreshold: 0.82,
  bloomWeight: 0.28,
  bloomScale: 0.5,
  // SSAO2 — screen-space ambient occlusion for grounded contact shadows.
  ssaoRatio: 0.75,         // render SSAO at 75% res for perf (full-res is wasteful for a soft AO)
  ssaoRadius: 2.2,         // world-space sample radius
  ssaoStrength: 1.1,       // occlusion darkening strength
  ssaoSamples: 16,         // samples per pixel (16 is a good quality/perf balance)
  ssaoBlur: 2,             // bilateral blur passes
  // Depth of field — a subtle cinematic focus, foreground/horizon softened.
  dofFocusDistance: 18000, // mm — focus plane ~18m out (the gameplay middle distance)
  dofFocalLength: 50,      // mm — a natural ~50mm lens
  dofFStop: 6.0,           // higher = deeper focus (subtle blur, not a macro toy look)
  vignetteWeight: 1.4,     // gentle darkened corners
  grainIntensity: 6,       // faint film grain for a photographic texture

  // --- Textured foliage (alpha-cut billboards, CC0 ambientCG) -------------
  // Kills the smooth "playmobil" solid-colour cones/spheres. Trunks get real
  // bark albedo+normal+roughness; canopies + grass become alpha-cut TEXTURED
  // CARDS (cross-quad clusters of cutout leaf/grass sprays) with per-instance
  // green tint + size variety so each plant is irregular, not a clone. All
  // instanced; ground cover fades out with distance for perf.
  barkTextures: {
    albedo: "bark_albedo.jpg", normal: "bark_normal.jpg", roughness: "bark_roughness.jpg",
  },
  barkTiling: 2,           // bark UV repeats up the trunk
  // Rocks: real CC0 rock PBR on noise-displaced icosphere boulders (no smooth
  // dodecahedra), partially buried, varied sizes/orientations.
  rockTextures: {
    albedo: "rock_albedo.jpg", normal: "rock_normal.jpg", roughness: "rock_roughness.jpg",
  },
  rockTiling: 1.4,         // rock UV repeats across a boulder
  rockColor: [0.66, 0.64, 0.60], // desaturated warm-grey stone tint on the albedo
  rockVariants: 5,         // distinct displaced boulder shapes (instanced)
  // Alpha-cut atlases: a Color + a separate Opacity map (cut via alpha-test,
  // not blending — cheap and sort-free).
  leafCardAlbedo: "leaf_albedo.png",       // green conifer foliage sprays (LeafSet019)
  leafCardOpacity: "leaf_opacity.png",
  grassCardAlbedo: "grass_blade_albedo.png", // green grass blades (Foliage001)
  grassCardOpacity: "grass_blade_opacity.png",
  alphaCutOff: 0.4,        // alpha-test threshold for the cutout cards (leaves/canopy)
  // GRASS dark-sliver fix (owner: "glitchy dark vertical slivers across the
  // grass"). The grass-blade albedo is a DARK olive (measured avg ≈
  // RGB[80,104,51]/255 over the opaque pixels) and the cards get no IBL, so the
  // thin blades rendered far darker than the bright PBR grass ground = dark
  // slivers. Two grass-only knobs (see makeCardMaterial in world.js):
  //  - grassAlphaCutOff: lower than the leaf 0.4 so more of the fuller blade body
  //    survives the alpha-test (less of a thin spine).
  //  - grassBrighten: lift the sampled albedo (texLevel) and self-illuminate the
  //    blade from its own brightened texture (selfIllum) so it sits in the lit
  //    ground's brightness band instead of going dark. Values chosen empirically
  //    against the ground in headless eye-level shots (tools/grass_probe.mjs):
  //    texLevel 1.8 / selfIllum 1.0 reads as lush green grass without neon glow.
  grassAlphaCutOff: 0.2,
  grassBrighten: { texLevel: 1.8, selfIllum: 1.0 },
  cardsPerCanopy: 5,       // textured leaf cards crossed per tree (irregular, broken-up crown)
  windStrength: 0.06,      // radians of canopy/grass sway amplitude
  windSpeed: 1.3,          // sway frequency (rad/sec)
  groundCoverCount: 3200,  // grass-card clump instances (~3× for the doubled map; instanced — cheap)
  groundCoverFadeStart: 70, // world units from centre where ground cover starts thinning
  groundCoverFadeEnd: 150,  // fully faded beyond this (keeps far ground uncluttered + fast)
  // Per-instance desaturated green tints multiplied onto the leaf/grass cards
  // so no two plants share an exact colour — sage/moss/olive, never neon.
  foliageGreens: [
    [0.62, 0.70, 0.46],   // sage
    [0.50, 0.60, 0.38],   // moss
    [0.70, 0.74, 0.52],   // dry olive
    [0.44, 0.54, 0.34],   // deep olive
  ],
  // GRASS-BLADE tints, kept SEPARATE from foliageGreens (which also tints the
  // tree canopy). The canopy reads fine, but the grass blades — thin vertical
  // StandardMaterial cards with no IBL — were tinted with the darker greens
  // above and read as "dark vertical slivers" against the brighter PBR grass
  // ground (grassTint ≈ [0.66,0.72,0.52]). These tints are lifted to sit in the
  // ground's brightness band (centred on grassTint, varied around it) so the
  // blades read as grass, not dark spikes. Chosen empirically against the
  // ground in headless eye-level shots (tools/grass_probe.mjs).
  grassGreens: [
    [0.66, 0.72, 0.50],   // matches the ground grass tint
    [0.58, 0.68, 0.44],   // a touch deeper
    [0.72, 0.76, 0.54],   // lighter sun-caught
    [0.62, 0.70, 0.48],   // mid sage
  ],
  trunkColor: [0.42, 0.34, 0.26], // bark tint multiplied onto the albedo
  deadTrunkColor: [0.40, 0.36, 0.30], // greyer, sun-bleached bark for dead/gnarled trees
  // USER PICK: more TREE VARIETY — distinct species silhouettes, not one model
  // rescaled. Each tree rolls a type from this weighted set; the dry zone biases
  // toward gnarled/dead. (weights are relative; conifer + broadleaf dominate the
  // green areas, gnarled/palm add silhouette variety.)
  treeTypeWeights: { conifer: 4, broadleaf: 4, gnarled: 2, palm: 1.5 },
  // DESERT BIOME ZONE (the "dry zone") — a BOLD arid patch of the map. The
  // previous treatment (a faint tan tint + denser boulders) read as too subtle:
  // it shared the grassland's mid-value palette and had no colour cast, no dunes
  // and no silhouette landmarks, so you couldn't tell you'd entered it. This
  // block now commits to the Gobi/Djadokhta "Flaming Cliffs" look: warm golden
  // sand ground, gentle dunes, reddish banded sandstone mesas/buttes, sparse
  // bleached drought vegetation + bones, and a warm hazy desert air. Every
  // colour below is the research palette converted to 0..1 RGB (these are
  // albedo TINTS multiplied onto the textures, so they read a touch lighter than
  // the raw hex once lit). Each numeric is annotated with its source.
  dryZone: {
    // Re-placed for the DOUBLED map: pushed out into the SOUTH-WEST quadrant,
    // clear of the eastern ocean and the western pond, and grown so it reads as
    // a real desert region on the big valley rather than a small patch.
    centerX: -70, centerZ: -120, // south-west arid region
    radius: 60,                  // world units of the arid region (up from 34 for the doubled map)
    edgeFeather: 20,             // soft blend band so the biome edge isn't a hard ring

    // --- Ground: warm NATURAL sand --------------------------------------
    // OWNER FIX ("too yellow ... away from the neon saturated gold to a
    // believable warm desert sand, natural tan, not highlighter-yellow"). The
    // old gold (#E8B96A pushed to a super-1.0-R tint [1.30,0.86,0.34]) read as a
    // neon highlighter once lit. Retuned to a believable warm SAND/khaki tan
    // around #C7B083 — desaturated (R and B much closer together kills the gold
    // cast), so it reads as real dune sand at eye level. groundTint multiplies
    // the grey-tan dryground albedo (vertex-colour fallback); sandColor is the
    // hue the in-shader plugin REPLACES the albedo toward (the actual eye-level
    // read). Both pulled to the same natural tan family.
    groundTint: [0.92, 0.80, 0.58],   // warm natural tan (kept just over the IBL wash, no longer super-gold)
    // Real SAND albedo the ground plugin LERPs the grass albedo TOWARD inside the
    // zone. Natural warm sand #C7B083 (believable tan, not gold). The sand albedo
    // TEXTURE's per-texel luminance modulates this base so the grain still reads
    // (light/dark sand specks), but the HUE is locked to this tan.
    sandColor: [0.78, 0.69, 0.51],    // #C7B083 natural warm sand/khaki — the eye-level read (desaturated from the old gold)
    sandColorVar: [0.08, 0.06, 0.05], // subtle per-texel warm/cool variation amplitude
    sandTextures: { albedo: "dryground_albedo.jpg" }, // warm sand albedo blended in by the ground plugin
    sandTiling: 26,             // tighter than the grass tiling (18) so sand grain reads finer/closer
    sandRoughness: 0.92,        // matte dry sand (near-fully rough; sand barely speculars)

    // --- Dunes: gentle height undulation, in-zone only -------------------
    // Low-frequency layered sines so a dune spans many ground quads (~1.8u/quad
    // at subdivisions:120) — no stair-stepping, per the brief's crispness note.
    // Amplitude kept modest so the flat play area stays traversable.
    duneAmp: 2.2,               // metres of dune rise at zone centre (rolling relief, still traversable)
    duneFreqA: 0.05,            // primary dune wavelength (~126u) — broad swells
    duneFreqB: 0.11,            // secondary cross-ripple wavelength (~57u) — breaks up the swells

    // --- Sandstone mesas/buttes (the bold orange-red silhouettes) --------
    // OWNER FIX ("huge weird towers in there ... reshape into believable
    // buttes/mesas — broader bases, layered horizontal strata, wind-eroded
    // tapered tops, VARIED heights/widths, not uniform tall cylinders"). The old
    // mesas were tall + thin (h 12-22 vs r 3.5-8 → up to a ~6:1 tower) which read
    // as pillars. Retuned to believable Monument-Valley proportions: BROAD bases,
    // MODEST heights (height ≈ 0.6-1.4× the radius, so they're wider than tall or
    // roughly square — buttes, not towers), and a much WIDER spread of sizes so
    // no two match. Count kept low so they punctuate the skyline, not dominate.
    rockDensityMul: 2.6,        // small sandstone boulders this much denser than baseline
    sandstoneColor: [0.78, 0.50, 0.34],     // #C8805A sunlit warm terracotta sandstone (softened from the old neon orange)
    sandstoneBandColor: [0.64, 0.34, 0.22], // #A45638 iron-rich red strata band
    mesaCount: 0,               // mesas/buttes REMOVED per owner (still read as "huge towers"); desert is now dunes + boulders + scrub + bones only
    mesaMinHeight: 7, mesaMaxHeight: 16,  // metres — varied, modest (no more 22m towers)
    mesaMinRadius: 7, mesaMaxRadius: 18,  // metres — BROAD bases (so the silhouette is a butte/mesa, not a pillar)
    mesaStrataBands: 4,         // horizontal sedimentary strata layers stacked up each mesa (the layered-rock read)

    // --- Drought vegetation (sparse, bleached — never emerald) -----------
    grassDensityMul: 0.25,      // green ground cover thins to this fraction (arid) — kills lush green (unchanged)
    deadTreeBias: 0.95,         // nearly every in-zone tree is gnarled/dead deadwood (was 0.85)
    // Straw/ochre/sage tints for the dry tussocks + dead shrubs (research veg palette).
    dryPalette: [
      [0.76, 0.66, 0.36],   // #C2A85C dry straw tussock
      [0.85, 0.78, 0.56],   // #D8C68E bleached dead grass
      [0.54, 0.55, 0.42],   // #8A8C6A dusty sage / saxaul
      [0.55, 0.51, 0.46],   // #8C8175 dead grey wood / skeletal shrub
    ],
    tuftCount: 220,             // dry-grass tussocks scattered in-zone (scaled up for the bigger radius-60 zone)
    shrubCount: 55,             // dead skeletal shrubs in-zone (scaled up)
    boneColor: [0.90, 0.87, 0.79],  // #E6DECB sun-bleached bone white (hero-prop pop)
    boneClusterCount: 9,        // half-buried bleached skeletons (ribcage arc + skull + vertebrae) for character

    // --- Warm desert air: fog + light tint, blended by camera proximity --
    // Softened from the old hot-ochre [0.95,0.74,0.52]: a dustier, less saturated
    // warm haze so the air reads as desert heat-haze, not a yellow wash (part of
    // the owner's "too yellow" fix — the fog tint bled gold over everything).
    fogColor: [0.86, 0.78, 0.64],   // warm dusty haze (desaturated from the old hot ochre)
    sunWarmTint: [1.0, 0.85, 0.66], // warm amber sun key (gentler than the old #FFC078)
    hazeDensityBonus: 0.0035,       // added to fogDensity (0.0085) when fully in-zone → a warm dust
                                    // haze that softens the far grassland edge without burying the
                                    // hero mesas (reduced from 0.006: the old value over-murked the
                                    // bigger radius-60 zone and read as a yellow wash)
  },

  // --- JUNGLE THICKET MICROCLIMATE (USER request: microclimates WITHIN the
  // one world, not separate worlds). A second zone beside the dry rocky patch:
  // a dense, humid pocket of the valley — deeper lush ground tint, thick
  // broadleaf/palm canopy, heavy understorey. With the dry zone (arid corner)
  // and the pond + reed ring (wetland), the single map now reads as three
  // distinct microclimates inside one grassland valley. Layout/gameplay
  // untouched. All values are art-direction choices mirroring dryZone's knobs.
  jungleZone: {
    // Re-placed for the DOUBLED map: NORTH region, clear of the SW desert, the
    // W pond and the E ocean. Grown to suit the big valley.
    centerX: 10, centerZ: 120,  // north thicket
    radius: 52,                 // world units of the thicket (up from 30 for the doubled map)
    edgeFeather: 18,            // soft blend into the grassland
    groundTint: [0.42, 0.56, 0.36],  // deeper, wetter green blended into the ground here
    treeDensityMul: 2.2,        // extra trees clustered inside the thicket
    grassDensityMul: 2.0,       // understorey thickens (extra ground-cover cards)
    junglePalette: [            // deeper jungle greens for trees/grass INSIDE the zone
      [0.36, 0.56, 0.32], [0.30, 0.48, 0.28], [0.44, 0.62, 0.36], [0.26, 0.42, 0.26],
    ],
    // species mix inside the thicket: broadleaf + palm dominate, no dead trees
    treeTypeWeights: { conifer: 0.5, broadleaf: 5, gnarled: 0, palm: 3 },
  },
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
  // Risk/reward payoff: every second survived as dusk deepens is worth more.
  // The time-score multiplier scales from 1x (full day) to 1 + survivalBonus at
  // deepest dusk, so holding out into the dangerous hours pays — dusk is
  // exciting, not only punishing. (Replaces the banking era's bank bonus.)
  survivalBonus: 1.0,     // +100% time score at deepest dusk (so up to 2x)
};

// Atmosphere: stylised non-gameplay set dressing. A pterosaur flock circles
// overhead, low drifting clouds, and floating pollen motes catch the light.
// Pure visual polish — none of it collides or affects the sim.
export const ATMOSPHERE = {
  birdCount: 7,          // circling pterosaurs
  birdHeight: 34,        // altitude they cruise at
  birdRadius: 60,        // orbit radius around the arena centre
  birdSpeed: 0.12,       // radians/sec around the orbit
  cloudCount: 14,        // more clouds for the bigger sky
  cloudHeight: 70,
  birdOrbitMul: 0.55,    // bird orbit radius = ARENA.radius × this (tracks the doubled map; was a fixed 60)
};

// Pterosaur dive attack: occasionally a member of the flock peels off and
// swoops at the raptor. A telegraphed screech precedes the dive so it can be
// dodged; contact at the bottom of the swoop deals a small hit, then it climbs
// back to the orbit. A second airborne threat besides the ground predators.
export const PTERO_DIVE = {
  enabled: false,     // OFF (owner): pterosaurs stay circling in the sky, never swoop at the player
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
  // Variant species reuse a base rig (see DINO_VARIANTS), so they inherit that
  // base's authored +Z forward — all 0, same convention as the originals.
  spinosaurus: 0,
  ankylosaurus: 0,
  pachycephalosaurus: 0,
  brachiosaurus: 0,
  compsognathus: 0,
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
  // The arena periodically vocalises: predators growl/rumble, herbivores call. Each is
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
    // Per-creature-kind vocalisation. Keyed by the dino `kind` string. All organic
    // animal recordings sourced from Freesound (see CREDITS.md). Distinct samples so
    // species sound different; predators get rate-deepened by `menace` at playback.
    creatures: {
      trex: "assets/audio/trex.mp3",            // eerie low closed-mouth growl/rumble
      raptor: "assets/audio/raptor.mp3",        // raptor screech (unflagged — kept)
      // Herbivores: triceratops + parasaur share a bellow; stego/apato get distinct lows.
      triceratops: "assets/audio/herbivore_a.mp3",
      parasaur: "assets/audio/herbivore_a.mp3",
      stegosaurus: "assets/audio/stegosaurus.mp3", // distinct bull bellow
      apatosaurus: "assets/audio/apatosaurus.mp3", // deepest — real elephant low
    },
    // Giant-sauropod footfall thud — a real heavy organic ground impact (not a
    // repurposed bellow), played on the step cadence of nearby big dinos.
    bigStep: "assets/audio/bigstep.mp3",
    // Generic herbivore call (used by creatureCall() when no per-species sample).
    herbivore: "assets/audio/creaturecall.mp3",
    // One-shot event sounds. Each replaces a flagged procedural synth with an
    // organic recording; the procedural recipe is kept as a fallback if a file
    // fails to load. Played through playBuffer() so they keep the same
    // click-free attack/release envelope as every other sample.
    oneshots: {
      splash: "assets/audio/splash.mp3",
      hurt: "assets/audio/hurt.mp3",
      hurtAlt: "assets/audio/hurt_alt.mp3", // second pain grunt; hurt() picks one of the two at random

      bite: "assets/audio/bite.mp3",
      screech: "assets/audio/screech.mp3",
      pickup: "assets/audio/pickup.mp3",         // kalimba note (organic)
      pickupGolden: "assets/audio/pickup_golden.mp3", // crystal bell
      heal: "assets/audio/heal.mp3",             // temple/singing bowl swell
      ui: "assets/audio/ui_tap.mp3",             // soft woody tap
      lose: "assets/audio/lose.mp3",             // gong
      win: "assets/audio/win.mp3",               // bright approval bell
    },
  },
  // New trex sample is an organic low growl; play it slightly SLOWED to deepen it
  // toward the eerie closed-mouth infrasound rumble (crocodilian/booming-bittern
  // hypothesis, Julia Clarke et al.) rather than a Hollywood roar.
  trexRumbleRate: 0.85,
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
