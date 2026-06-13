// Central tunables. Every value here is a deliberate design choice for a
// stylised arcade chase game — not derived from any external benchmark.
// Adjust here only; nothing below should hardcode gameplay numbers.

// SIGNED-OFF ISLAND MAP (design/MAP_SPEC.md, 2026-06-12). The authoritative
// geometry is the 1u biome GRID in design/map.grid.json + the per-cell prop
// layer in design/map.props.json + the placed assets/territories/spawn in
// design/map.json. src/map.js loads them at boot; world.js builds the terrain,
// ground paint, props and walls from them. ARENA.radius remains only a big
// failsafe disc clamp (the grid's impassable cells are the real boundary).
export const ARENA = {
  radius: 700,         // failsafe bounding-disc clamp — encloses the whole grid (492x972 cells)
  groundSize: 1400,    // legacy size driver for the sky dome / pollen box (the terrain itself is sized from the grid)
  fogDensity: 0.012,   // exponential fog
  // Grass cards SWAY every frame near the camera (windUpdate) — see ENV.
  grassPatches: 2000,  // mid-field grass cards over the savannah/clearing (instanced) — first-pass for owner eyeball
};

// MAP — how the design/ grid becomes terrain + ground paint + walls. All values
// first-pass for owner eyeball unless annotated otherwise.
export const MAP = {
  gridUrl: "design/map.grid.json",
  propsUrl: "design/map.props.json",
  // Per-cell base terrain height (metres) by biome code, BEFORE smoothing.
  // Forest/savannah/jungle/swamp floors are FLAT (spec); desert + rocky add the
  // dune undulation on top (dune weight mask); mountains rise into a wall the
  // cliff glbs dress; sea drops to a seabed (OCEAN.seaLevel is -1.4).
  cellHeights: {
    "~": -8.5,   // seabed (~7 m of water off the coast) — first-pass for owner eyeball
    B: 0.1,      // beach: low sand berm just above the waterline
    D: 2.0, R: 2.4, G: 2.0, F: 2.0, J: 2.0, C: 2.0, P: 2.0,
    S: 0.6,      // swamp sits low + wet (the murky pool is carved deeper by WATER)
    M: 26,       // mountain mass height — first-pass for owner eyeball (cliff glbs face the walls)
  },
  heightBlurPasses: 3, heightBlurRadius: 3,  // box-blur smoothing of the cell heights (organic coast/feet slopes) — first-pass
  maskBlurPasses: 2, maskBlurRadius: 4,      // smoothing for the dune/desert-air weight masks — first-pass
  // GROUND PAINT: per-biome albedo tint multiplied onto the tiled grass detail
  // texture (exactly how the old grassTint vertex colour worked — the savannah
  // entry IS ENV.grassTint so the approved grassland look carries over verbatim).
  // sandWeights drive the in-shader sand REPLACE (the approved desert system).
  // All non-savannah tints are first-pass for owner eyeball.
  tints: {
    G: [0.66, 0.72, 0.52],   // savannah = ENV.grassTint (owner-approved, verbatim)
    C: [0.68, 0.72, 0.50],   // clearing: same grass, a touch dustier/trodden
    F: [0.42, 0.54, 0.36],   // forest floor: deeper green
    J: [0.26, 0.38, 0.26],   // thick jungle: dark humid floor
    S: [0.38, 0.40, 0.28],   // swamp: murky olive-brown
    P: [0.36, 0.27, 0.17],   // muddy path: wet brown dirt (distinct from grass)
    R: [0.62, 0.60, 0.55],   // rocky pass: grey stone rubble
    M: [0.52, 0.50, 0.46],   // mountain: bare grey
    D: [0.92, 0.80, 0.58],   // desert (under the sand replace — ENV.dryZone tint)
    B: [0.95, 0.88, 0.68],   // beach (under the sand replace)
    "~": [0.55, 0.50, 0.42], // seabed: wet sand
  },
  sandWeights: { D: 1, B: 1, "~": 0.6 },   // where the in-shader SAND albedo replaces the grass detail
  jungleShellDepth: 4,        // J tree cells within this many cells of a non-J cell get REAL trees (1,009 measured — spec budget 1,000-1,500); the interior is faked
  mountainRockShellDepth: 4,  // mountain prop-rocks render only this close to the visible face
  // Faked jungle interior: a dark canopy mass of unlit blobs over the interior
  // tree cells (the player can never enter — only the shell is seen up close).
  canopy: {
    cellStride: 6,             // one canopy blob per ~6x6 interior cells — first-pass
    height: 11,                // blob centre height above ground (≈ jungle tree canopy line)
    color: [0.10, 0.17, 0.10], // near-black jungle green
  },
  // Mountain walls from cliff.glb (design/map.json wallAssets).
  cliff: {
    url: "assets/models/cliff.glb",
    targetHeight: 26,        // metres tall per cliff piece — first-pass for owner eyeball
    spacing: 26,             // min gap (u) between placed cliff pieces along the wall
    sink: 2.5,               // metres bedded into the rising mountain terrain
    obstacleRadius: 9,       // AI-avoidance footprint radius (u) per piece — first-pass for owner eyeball
  },
  // Chunked thin-instance scatter: placements batch into square tiles this wide;
  // a whole tile toggles with the per-prop distance cull. First-pass for owner eyeball.
  scatterChunk: 48,
};

// SPAWN — the player's crash-land point inside the jungle CLEARING (design/
// map.json spawn). The plane + pilot/GPS/health vignette sit RELATIVE to this.
export const SPAWN = { x: 0, z: -250 };

// BOAT — THE GOAL. Floats IN THE SEA just off the north beach tip (design/
// map.json). Reaching within winRadius of it from the waterline = WIN (game.js).
// Pure scenery otherwise (no AI/physics; a shadow caster). The source glb is
// normalised by its OWN longest axis to targetLength — never a hardcoded scale.
// LICENCE: Sketchfab model, licence UNKNOWN — MUST be licence-checked + credited
// before any public ship (flagged in the report; do not publish until verified).
export const BOAT = {
  url: "assets/models/fishing_boat.glb",
  position: { x: 0, z: 582 },   // design/map.json — in the sea off the beach tip
  targetLength: 14,       // metres along the longest axis — a small fishing boat (~12-15 m)
  // Owner: STERN points out to sea (away from the beach — i.e. roughly north,
  // the sea is past the north beach tip on this map) with ~10° off that axis so
  // it doesn't look mechanically aligned. The model's bow points along its
  // local -X after import; yaw -90°+10° points the bow south at the beach, so
  // the stern faces the open sea (re-verified by screenshot on the new map —
  // the old +90° value pointed the bow seaward).
  yaw: -Math.PI / 2 + (10 * Math.PI) / 180,
  // Riding draft (owner: it sat too deep). Only a shallow fraction of the hull
  // beds below the waterline so it reads as floating, not half-sunk.
  waterlineFraction: 0.12, // first-pass for owner eyeball
  // Gentle at-anchor motion: slow vertical bob + a slight pitch/roll sway
  // (subtler + slower than the GPS hover treatment). First-pass for owner eyeball.
  bobAmplitude: 0.12,     // metres of vertical travel
  bobSpeed: 0.5,          // radians/sec of the bob sine (slow swell)
  swayAmplitude: 0.02,    // radians of pitch/roll sway
  swaySpeed: 0.35,        // radians/sec of the sway sines
  winRadius: 16,          // reaching within this many world units of the boat centre = WIN (spec)
};

// CRASHED PLANE — static set-dressing at the player spawn (the jungle-clearing
// wreck the survivor wakes beside). Pure visual: no physics, no AI, no collider.
// The source glb's bbox is tiny (~0.6u), so the loader normalises by the model's
// own longest axis to targetLength — never a hardcoded scale. Position = SPAWN +
// offset (the wreck lies BESIDE the survivor's crash point on the south lobe).
export const CRASHED_PLANE = {
  url: "assets/models/crashed_plane.glb",
  // Owner: "too small — at least 2× the size". DOUBLED from 9 → 18 m along the
  // longest axis (a bigger downed aircraft wreck, beyond a Cessna 172's ~8.3 m).
  // The loader re-beds it on terrain and rebuilds its box collider + AI obstacle
  // footprint from the SCALED bbox, so doubling this propagates automatically.
  targetLength: 18,       // metres along the longest axis — DOUBLED from 9 (owner: ≥2×)
  // Offset from SPAWN realising the design/map.json placement (plane at 8,-244).
  offset: { x: 8, z: 6 },
  yaw: 2.3,               // radians — heading (arbitrary); the wreck just lies flat on the ground
  // Owner: lay it FLAT on the ground — no pitch, no roll.
  pitch: 0,               // radians (flat)
  roll: 0,                // radians (flat)
  sink: 0.3,              // metres pushed below ground so the belly/wing beds into the soil, not floating
};

// SPAWN SET-DRESSING — the canonical map's "dead body with GPS, marked X, just NW
// of the plane" (USER_WISHLIST.md CANONICAL MAP), plus a medkit beside the wreck.
// All three sit RELATIVE to the placed plane: the loaders take the plane's final
// world position and add these offsets, so moving the plane carries them along.
// Offsets are in world units in the ground plane; the loaders bed each prop on
// the terrain via heightAt and normalise it by its OWN longest axis (the source
// bboxes are arbitrary units) — never a hardcoded scale.

// DEAD PILOT — a tactical-soldier model laid PRONE (on its back) on the ground
// just NW of the plane. The source glb imports STANDING with its head-to-foot
// length along Y (≈1.9 native units = its longest axis); the loader normalises
// that longest axis to bodyLength metres, then rotates it -90° about X so the
// upright figure tips onto its back and the body lies flat along the ground.
export const DEAD_PILOT = {
  url: "assets/models/dead_pilot.glb",
  // design/map.json puts the pilot at (-20,-262), but that cell is J (the
  // impassable jungle tree-wall, with a tree ON the cell) — the body would be
  // swallowed by trees the player can never reach, and MAP_SPEC says the pilot
  // vignette is IN the clearing. Nudged to the nearest clearing cells, world
  // (-8,-256), still SW of the plane + apart from the wreck — first-pass for owner eyeball.
  offset: { x: -16, z: -12 },
  // The player/human model is 2.0 u ≈ 1.8 m tall (PLAYER.height), so ~1.1 u/metre.
  // A prone adult body is ~1.8 m head-to-foot ⇒ ~2 u long lying down. Normalising
  // the model's longest (standing-height) axis to 2 u gives a human-scale corpse.
  bodyLength: 2.0,        // metres along the body's longest (head-to-foot) axis
  prone: -Math.PI / 2,    // radians about X — tips the standing figure onto its back
  yaw: 1.2,               // radians heading so it doesn't lie axis-aligned (sprawled)
  sink: 0.1,              // metres pressed into the soil so the back beds, not floating
};

// GPS DEVICE — a small handheld unit HOVERING above the dead pilot: the objective
// the player loots (canonical map: "GPS unlocks radar"). It gently bobs up/down
// and slowly spins like a collectible, and glows so it reads as the objective.
// The bob/spin run on scene.onBeforeRenderObservable inside the loader (no
// game-loop wiring) and are framerate-independent (scaled by engine deltaTime).
export const GPS_DEVICE = {
  url: "assets/models/gps_device.glb",
  // Sits directly over the pilot: same offset as DEAD_PILOT, lifted in the air.
  offset: { x: -16, z: -12 },
  // Owner: at least 50% BIGGER (~0.6 → ~0.95 u) so it reads as a clear device.
  size: 0.95,             // metres along the longest axis — a clearly visible handheld unit
  // Owner: stand it UPRIGHT (screen facing out), not lying flat. A -90° tilt about
  // X stands the (flat-imported) unit on end; the spin then rotates it about its
  // own vertical while staying upright. (Applied in loadGPS.)
  uprightTilt: -Math.PI / 2, // radians about X — stand the unit on end
  hoverHeight: 1.6,       // metres the unit floats above the body
  bobAmplitude: 0.18,     // metres of vertical bob travel (gentle collectible float)
  bobSpeed: 1.6,          // radians/sec of the bob sine (a slow, calm pulse)
  spinSpeed: 0.9,         // radians/sec the unit rotates about its vertical axis (slow spin)
  // Owner: the bright green-cyan emissive made a glowing-blob HALO. Toned right
  // down to a faint near-neutral warm glow — reads as a device catching light,
  // not a neon orb.
  emissive: { r: 0.10, g: 0.11, b: 0.10 },  // very subtle near-neutral self-illumination
};

// HEALTH PACK — a small medkit beside the plane, on the terrain (canonical map:
// "health pack in the wreck → into the pack"). VISUAL-ONLY set-dressing for now
// (not wired as a functional heal — flagged as a follow-up); a slight emissive so
// it's noticeable beside the wreck.
export const HEALTH_PACK = {
  url: "assets/models/health_pack.glb",
  // design/map.json puts the medkit at (26,-262) — a J (impassable jungle-wall)
  // cell the player can never reach. Nudged inside the clearing to world
  // (2,-250), beside the wreck clear of the wing line — first-pass for owner eyeball.
  offset: { x: -6, z: -6 },
  // Owner: cardboard-box sized + FLOAT + slow spin (collectible style), like the
  // GPS — prioritise visibility over realism.
  size: 0.6,              // metres along the longest axis — clearly visible collectible
  hoverHeight: 1.5,       // metres it floats above the ground (collectible float)
  bobAmplitude: 0.18,     // metres of vertical bob travel
  bobSpeed: 1.6,          // radians/sec of the bob sine
  spinSpeed: 1.0,         // radians/sec it rotates about its vertical axis
  emissive: { r: 0.55, g: 0.08, b: 0.08 },  // red self-illumination so the medkit reads as an objective
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
  position: { x: -26, z: 452 },  // desert sand near the desert centre (~0,432), west of the direct route (grid code D) — first-pass for owner eyeball
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

// OLD DEAD TREE — the desert vignette partner to the skeleton (restored: the
// island remap dropped this block but setdressing.js/game.js still load it).
// Re-aimed at the skeleton's NEW desert spot (grid code D) — first-pass for owner eyeball.
export const OLD_TREE = {
  url: "assets/models/old_tree.glb",
  position: { x: -22, z: 448 },  // ~5 m from the relocated skeleton — the same vignette pairing
  targetHeight: 8,        // metres tall — a real mature tree is ~6-10 m
  yaw: 2.1,               // radians — arbitrary heading so it doesn't face the axes
  sink: 0.2,              // metres pushed below ground so the trunk base beds into the sand, not floating
};

// RAPTOR NEST — in the thick-jungle tree-wall just off the clearing (design/
// map.json). Static scenery the player glimpses through the treeline; the
// raptor territory is anchored nearby. Normalised by its own longest axis.
export const RAPTOR_NEST = {
  url: "assets/models/raptor_nest.glb",
  position: { x: -40, z: -283 },  // design/map.json — inside the jungle wall, off the clearing
  targetLength: 2.6,      // metres across — a large raptor nest (first-pass for owner eyeball)
  yaw: 0.8,               // radians — arbitrary heading so it doesn't face the axes
  sink: 0.08,             // metres bedded into the jungle floor
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
  // Island grid walls (impassable J/M biomes + blocking-prop cells): how far
  // ahead of the player's centre the cell test probes. Small so the ~2.2u muddy
  // path stays comfortably walkable — first-pass for owner eyeball.
  wallFeather: 0.35,
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
    // DISABLED: the sauropod slot (kind "apatosaurus") now loads the hi-poly
    // textured brachiosaurus_hi_anim.glb directly (MODELS.apatosaurus), so this
    // tint+stretch variant on the low-poly rig would spawn a redundant, distorted
    // second long-neck painted over the same model. Retired into the one hi-poly
    // brachiosaurus. (Owner: "replace the slot".)
    disabled: true,
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

// PER-SPECIES TERRITORIES — design/map.json (SIGNED OFF). Each dino gets a
// centre + radius + a BIOME MASK (`biomes`: the grid cell codes it may enter).
// The MASK is the real constraint (M1: "a dino may ONLY enter cells whose code
// is in its biomes list") — ai.js enforces it as a hard movement bound; the
// radius is just a loose cap with the existing soft-pull behaviour.
//   edgeSoftness — world units before the radius edge where the soft inward
//                  pull ramps in (first-pass for owner eyeball, ~20% of radius).
export const TERRITORY = {
  // M1 roster ONLY (9 entries, design/map.json). Centres validated against the
  // grid by tools/map_check.mjs.
  raptor: { biomes: ["J", "C", "P", "D", "R"], centerX: 0, centerZ: -230, radius: 800, edgeSoftness: 60 },
  compsognathus: { biomes: ["G"], centerX: 40, centerZ: -120, radius: 90, edgeSoftness: 25 },
  parasaur: { biomes: ["G"], centerX: -30, centerZ: -60, radius: 95, edgeSoftness: 25 },
  stegosaurus: { biomes: ["F"], centerX: -112, centerZ: 70, radius: 72, edgeSoftness: 20 },
  trex: { biomes: ["G"], centerX: 0, centerZ: 35, radius: 185, edgeSoftness: 40 },
  apatosaurus: { biomes: ["G"], centerX: 5, centerZ: 90, radius: 150, edgeSoftness: 35 },
  triceratops: { biomes: ["G"], centerX: -20, centerZ: 0, radius: 120, edgeSoftness: 30 },
  ankylosaurus: { biomes: ["S"], centerX: 125, centerZ: 95, radius: 50, edgeSoftness: 15 },
  pachycephalosaurus: { biomes: ["D"], centerX: 0, centerZ: 432, radius: 70, edgeSoftness: 20 },
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
  // SWAMP POOL — the murky water at the heart of the spec's swamp (`S` cells,
  // centroid ~125,98, ~50 m across). The existing pond system carries over as
  // the swamp's wading hazard: slow + a gentle health drain, reeds at the rim.
  centerX: 125,         // swamp centroid (grid S region)
  centerZ: 98,
  radius: 22,           // murky pool within the ~60u-wide swamp — first-pass for owner eyeball
  depth: 1.2,           // basin carve below the (already low) swamp floor
  slowFactor: 0.45,     // player speed multiplier while WADING
  damagePerSec: 4,      // health drained per second while wading the murk
  level: 0.2,           // water surface height above the pool-rim ground
  // Wade-only murk: no deep-swim core (the swamp is a hazard, not a lake).
  deepFraction: 0,      // 0 = nowhere counts as deep water (swim system dormant)
  swimSlowFactor: 0.55, // (retained for the player's dormant swim branch)
  swimSurfaceOffset: -0.45,
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
  // P2.1: the SEA now surrounds the whole island (see world.js landFactor); it is
  // no longer an eastern-only coast. `shoreX` is RETAINED only because eggs.js /
  // tools.js / minimap.js / aquatic.js (off-limits to the island remap) still
  // import it. It now means the EAST coast of the main body (x > shoreX = open
  // sea): it keeps the plesiosaur patrolling the eastern sea, and eggs/tools off
  // the east water. (Eggs/tools still scatter on a legacy radial disc, so some
  // land in the surrounding sea — a flagged follow-up; the eggs objective is the
  // deprecated interim survival mode, superseded by the boat-escape win.)
  shoreX: 200,            // east coast of the main body (x > this = open sea, for the legacy importers) — scaled
  beachWidth: 40,         // (legacy, retained for imports)
  seaLevel: -1.4,         // sea surface height (the island's coast descends to this)
  seabedDepth: 4.0,       // (legacy; ISLAND.seabedDepth drives the new seabed)
  surfWidth: 10,          // (legacy)
  // The visible sea plane spans the whole bounding disc so the horizon reads as
  // open ocean surrounding the island.
  planeSize: 4400,        // edge length of the sea surface plane (>> the island so no visible far edge)
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
  // --- Patrol region (the EAST/NORTH SEA, off the beach toward the boat) ----
  patrolCenterX: 280,     // seaward of the east coast (shoreX 200), open water (scaled)
  patrolCenterZ: 700,     // toward the north end, off the beach below the boat (canonical: Plesiosaur offshore)
  patrolRadius: 110,      // radius of the open-water roam disc
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
  // GROUND grass tint — RESTORED to the owner's ORIGINAL initial-commit (HEAD)
  // olive-sage (owner was happy with this colour at HEAD; the goal is "looks like
  // before"). The matte material (high roughness, zero specular — see
  // makeGroundPBR) keeps it from going glossy/wet.
  grassTint: [0.66, 0.72, 0.52],  // olive-sage (HEAD)
  soilTint: [0.60, 0.52, 0.42],   // warm earthy brown (HEAD)

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
  fogColor: [0.70, 0.74, 0.72],  // desaturated sage-grey haze (HEAD — restored)

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
  // Grass sway is the dominant per-frame CPU cost, so only cards WITHIN this
  // radius of the camera are swayed each frame (distant grass holds its tilt —
  // imperceptible at distance/through fog). Lets us keep dense grass cheap.
  grassSwayRadius: 55,     // world units around the camera within which grass sways
  // Ground cover is dense now (the sway is radius-limited + the cards are matrix-
  // free only near the camera), so the count can be generous again.
  groundCoverCount: 2600,  // dense near-ground grass clump instances
  groundCoverFadeStart: 70, // (legacy — origin-distance fade removed for the long island; frustum culling handles far cover)
  groundCoverFadeEnd: 150,  // (legacy)
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
  // Retuned WARM + DRY to match the new grassTint (owner: no moist/sickly green).
  // R ≈ G, low blue — sun-dried meadow blades, varied light↔deeper, never neon.
  // RESTORED to HEAD (owner's original grass-blade greens).
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
    // The DESERT is now the grid's `D` cells (design/map.grid.json) — no radial
    // zone. This block keeps the owner-approved desert LOOK (sand, dunes, bones,
    // dry palette, warm air) consumed by world.js against the grid masks.

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

    // --- Drought vegetation (sparse, bleached — never emerald) -----------
    // Straw/ochre/sage tints for the dry tussocks (research veg palette).
    dryPalette: [
      [0.76, 0.66, 0.36],   // #C2A85C dry straw tussock
      [0.85, 0.78, 0.56],   // #D8C68E bleached dead grass
      [0.54, 0.55, 0.42],   // #8A8C6A dusty sage / saxaul
      [0.55, 0.51, 0.46],   // #8C8175 dead grey wood / skeletal shrub
    ],
    tuftCount: 260,             // dry-grass tussocks scattered over the D cells — first-pass for owner eyeball
    shrubCount: 55,             // dead skeletal shrubs in-zone
    boneColor: [0.90, 0.87, 0.79],  // #E6DECB sun-bleached bone white (hero-prop pop)
    boneClusterCount: 9,        // half-buried bleached skeletons (ribcage arc + skull + vertebrae) for character

    // --- Sandstone mesas (pre-remap values, restored verbatim — world.js
    // scatterDesertFeatures still consumes them; mesaCount stays 0 per owner) --
    sandstoneColor: [0.78, 0.50, 0.34],     // #C8805A sunlit warm terracotta sandstone (softened from the old neon orange)
    sandstoneBandColor: [0.64, 0.34, 0.22], // #A45638 iron-rich red strata band
    mesaCount: 0,               // mesas/buttes REMOVED per owner (still read as "huge towers"); desert is dunes + boulders + scrub + bones only
    mesaMinHeight: 7, mesaMaxHeight: 16,  // metres — varied, modest (no more 22m towers)
    mesaMinRadius: 7, mesaMaxRadius: 18,  // metres — BROAD bases (so the silhouette is a butte/mesa, not a pillar)
    mesaStrataBands: 4,         // horizontal sedimentary strata layers stacked up each mesa (the layered-rock read)

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

};

// TREE PACKS — a registry of downloaded tree glbs (all optimised: simplify +
// webp). world.js (scatterTrees) loads each referenced pack ONCE, builds one
// hidden instanceable SOURCE per `tree` id, and thin-instances them per biome
// (BIOME_TREES). Two source kinds:
//   kind "parts": the tree is built from named meshes (trunk + branches) that
//     have mismatched vertex attributes (can't merge) — instanced as a group.
//   kind "whole": the whole glb's vertex meshes ARE one tree — instanced together.
// `targetHeight` normalises each source by its own bbox height.
// LICENCE: all download/Sketchfab sources — MUST be licence-checked + credited
// before any public ship (flagged in the report).
export const TREE_PACKS = {
  forest: {
    url: "assets/models/forest_trees.glb", kind: "parts", targetHeight: 11,
    trees: [
      { id: "forest0", parts: ["Tree_Trunk_01", "Tree_Branches_01"] },
      { id: "forest1", parts: ["Tree_Trunk_02", "Tree_Branches_02"] },
    ],
  },
  // The big realistic banyan/jungle tree (358MB→17MB→93k tris _lod bake). The
  // 93k bake still cost ~28M tris/frame at the clearing (~400 thin instances ×
  // 71k-tri bark mesh — 23-27fps headless). _lod2 is a HYBRID rebake to ~13.5k
  // tris/tree (clearing 60fps): split by material alphaMode, bark (OPAQUE)
  // gltfpack -si 0.05 -se 0.3 (the seam-heavy bark only collapses with a
  // generous error bound), foliage (MASK) only -si 0.5 -se 0.05 so the leaf
  // mass that sells the wall survives, then recombined (single scene/buffer).
  // A/B'd against the 93k bake at the clearing framings — visually matching.
  // Originals kept (jungle_tree.glb, jungle_tree_lod.glb).
  jungle: {
    url: "assets/models/jungle_tree_lod2.glb", kind: "whole", targetHeight: 16,
    trees: [{ id: "jungleTree" }],
  },
  // SAVANNAH trees — MIX of the locust pack (3 trees) + the realistic pack (2
  // trees), per the spec. Parts grouped per tree from the glb node hierarchy.
  locust: {
    url: "assets/models/locust_tree_pack.glb", kind: "parts", targetHeight: 12,
    trees: [
      { id: "locust0", parts: ["Object_4", "Object_6"] },
      { id: "locust1", parts: ["Object_8", "Object_10"] },
      { id: "locust2", parts: ["Object_12", "Object_14"] },
    ],
  },
  // The source pack is ~430k tris PER TREE (vertex-split chunks, not LODs) —
  // unusable scattered; the _lod bake (meshopt simplify, ~41k/tree) ships instead.
  realistic: {
    url: "assets/models/realistic_trees_pack_of_2_free_lod.glb", kind: "parts", targetHeight: 13,
    trees: [
      { id: "real0", parts: ["Object_4", "Object_5", "Object_6", "Object_7", "Object_13", "Object_14", "Object_15"] },
      { id: "real1", parts: ["Object_9", "Object_10", "Object_11", "Object_17", "Object_18", "Object_19"] },
    ],
  },
  // Monstera (climbing aroid) — a low broad-leaved JUNGLE understory plant.
  monstera: {
    url: "assets/models/monstera.glb", kind: "whole", targetHeight: 2.4,
    trees: [{ id: "monstera" }],
  },
  // DESERT trees (spec: desert_old_tree + dead_tree). Bare, sun-bleached.
  deadTree: {
    url: "assets/models/dead_tree.glb", kind: "whole", targetHeight: 7,
    trees: [{ id: "deadTree" }],
  },
  desertOldTree: {
    url: "assets/models/desert_old_tree.glb", kind: "whole", targetHeight: 8,
    trees: [{ id: "desertOldTree" }],
  },
  // DESERT shrubs (walk-through, prop code `s`) — separate species meshes in
  // one glb, each its own variant source.
  shrubs: {
    url: "assets/models/desert_shrubs.glb", kind: "parts", targetHeight: 1.3,
    trees: [
      { id: "shrubAgave", parts: ["agave_2"] },
      { id: "shrubYucca", parts: ["yacca leaf 01_3"] },
      { id: "shrubCreosote", parts: ["creosote branch 02_7"] },
      { id: "shrubCholla", parts: ["cholla 01_9"] },
      { id: "shrubOcotillo", parts: ["ocotillo branch 01_5"] },
    ],
  },
};

// PROP LAYER SCATTER (design/map.props.json — one prop code per cell). Each
// code maps to its source ids (TREE_PACKS / understory glbs / procedural
// rocks), a per-instance scale range and a distance-cull radius. Blocking codes
// register obstacle footprints for the AI AND keep mesh collision for the
// player. Scale ranges + cull radii are first-pass for owner eyeball.
export const PROPS = {
  // Jungle wall (shell only). Scale trimmed 0.8-1.3 → 0.6-0.95: at the old range the
  // banyan canopies (spread ≈ height) roofed the whole r12 clearing — no sky, the
  // spawn read as under-canopy instead of a walled opening. first-pass for owner eyeball
  T: { trees: ["jungleTree", "jungleTree", "forest0", "forest1"], minScale: 0.6, maxScale: 0.95, cullRadius: 90, blocking: true },
  t: { trees: ["forest0", "forest1"], minScale: 0.8, maxScale: 1.6, cullRadius: 120, blocking: true, sink: 2.8 },                    // forest — extra sink: these glbs have prominent exposed roots
  a: { trees: ["locust0", "locust1", "locust2", "real0", "real1"], minScale: 0.8, maxScale: 1.4, cullRadius: 170, blocking: true, sink: 2.8 }, // savannah mix — same root-burying sink
  d: { trees: ["deadTree", "desertOldTree"], minScale: 0.8, maxScale: 1.3, cullRadius: 170, blocking: true },                       // desert dead trees
  s: { trees: ["shrubAgave", "shrubYucca", "shrubCreosote", "shrubCholla", "shrubOcotillo"], minScale: 0.7, maxScale: 1.4, cullRadius: 110, blocking: false }, // desert shrubs
  // r = procedural grey rocks (world.js boulder system — spec: NOT the red glb pack)
  rockScaleMin: 0.9, rockScaleMax: 2.4,
  rockCullRadius: 170,    // rocks draw within this radius of the camera — first-pass for owner eyeball
  mountainRockScaleMin: 1.8, mountainRockScaleMax: 4.2,  // bigger debris on the mountain faces
  jitter: 0.35,           // cell-centre jitter (u) so placements don't read as a grid
  treeSink: 1.5,          // metres trees bed below the surface (owner: bury the glb root flares)
};

// UNDERSTORY foliage (walk-through plants, prop codes m/f/g/L). HIGH-POLY +
// multi-part, so instanced AND DISTANCE-CULLED to a radius around the camera
// (only nearby ones drawn) + matrix-frozen. Placement comes from the prop grid
// (jungle f/m cells render only on the visible shell — the interior is unseen).
export const UNDERSTORY = {
  f: { urls: ["assets/models/fern.glb", "assets/models/fern2.glb"], targetHeight: 1.3, minScale: 0.9, maxScale: 2.0 },
  g: { urls: ["assets/models/geranium.glb", "assets/models/geranium2.glb"], targetHeight: 1.1, minScale: 0.9, maxScale: 1.8 },
  m: { urls: ["assets/models/monstera.glb"], targetHeight: 2.2, minScale: 0.8, maxScale: 1.6 },
  L: { urls: ["assets/models/lupine.glb"], targetHeight: 1.0, minScale: 0.8, maxScale: 1.5 },
  // Only instances within this radius of the camera are enabled (drawn) each
  // frame — high-poly plants never all draw at once. Re-evaluated on a throttle.
  cullRadius: 68,         // world units around the camera within which understory is visible
  cullInterval: 0.2,      // sec between cull re-evaluations (throttle)
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
  // First-person on the muddy path: while the player stands on a P (path) cell
  // the camera drops to eye level looking down the trail, restoring the orbit on
  // leaving. Owner-requested. Eye ≈1.7m of the 2.0u-tall human; tiny radius so
  // the view sits at the head; beta just under the 1.45 limit (near-horizontal).
  fpvEyeHeight: 1.7,        // u above the player's feet for the first-person eye
  fpvRadius: 0.4,           // orbit radius in first-person (camera at the head)
  fpvBeta: 1.45,            // near-horizontal pitch — look along the trail, not down
  modeLerp: 0.1,            // per-frame ease of radius/beta between the two modes
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
  cloudHeight: 150,      // raised from 70 — at 70u they hung in the eyeline and read as UFO discs; first-pass for owner eyeball
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
  vocalFalloffRange: 6,         // u — only audible when CLOSE (owner: "~5 metres"; 5m≈5.5u at 2u≈1.8m). Was 90 (whole arena → constant roars everywhere).
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
  bigStepRange: 6,        // thuds audible only when CLOSE (owner: ~5 metres). Was 50.
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
