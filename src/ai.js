import { TREX, HERBIVORE, TRICERATOPS, RAPTOR, ARENA, JUICE, WATER, AI_AVOID, DUSK, DINO_VARIANTS, TERRITORY } from "./config.js";
import { loadDino } from "./dino.js";
import { isStaggered } from "./tools.js";
import { biomeAt } from "./map.js";

// ANIMATION-PACED LOCOMOTION (owner: "all dinos should move at their animation
// pace"). The walk/run clips are in-place, so each carries an intrinsic ground
// speed (measured at load: dino.gaitSpeed[gait], world units/sec at rate 1.0).
// Play the clip at rate = moveSpeed / gaitSpeed so the planted foot matches travel
// and never slides — at ANY speed, so the tuned chase/flee speeds are preserved.
// Falls back to a fixed rate if the measurement was unavailable for a clip.
// GAIT_MIN_USABLE: some clips are essentially in-place (e.g. the raptor "Walk" is
// a stalk whose feet barely translate — measured ~0.06 u/s). Dividing by that
// would spin the legs absurdly, so treat anything below this as "no usable ground
// motion" and fall back to the fixed rate. 0.2 u/s sits well below every real gait
// measured in-engine (slowest real one is the sauropod walk at 0.45) and above the
// degenerate in-place clips.
const GAIT_MIN_USABLE = 0.2;
function gaitRate(dino, gait, moveSpeed, fallback) {
  const g = dino.gaitSpeed && dino.gaitSpeed[gait];
  if (!g || g < GAIT_MIN_USABLE) return fallback;
  return moveSpeed / g;
}

// Per-species move-speed scale: heavy/long-strided species should plod, not zip
// (1 = the herd baseline, which the parasaur — the visually-correct reference —
// uses). Because clip cadence tracks speed via gaitRate, slowing these also slows
// their legs into a proper plod. FIRST-PASS values — owner to eyeball + nudge.
const LOCO_SPEED_SCALE = { apatosaurus: 0.5, stegosaurus: 0.6, triceratops: 0.5 };

// Brachiosaurus herd (owner: "bracs travel in herds of 4-5"). A shared roaming
// centre keeps the herd clustered while it ambles across its range.
const HERD_BRACH_MIN = 4, HERD_BRACH_MAX = 5;   // owner: herds of 4-5
const HERD_SPREAD = 14;     // u — radius members scatter around the herd centre (tight sauropod cluster)
const HERD_ROAM_STEP = 20;  // u — how far the herd centre advances toward its roam point each re-target

// Solid obstacle footprints ({x, z, r}) the AI steers around. Injected from the
// world build; the pond is appended so one routine handles every avoidance.
// The island prop layer registers THOUSANDS of footprints (every blocking tree/
// rock cell + the jungle shell + the cliff walls), so they are spatially hashed:
// each obstacle is inserted into every bucket its influence circle (r +
// clearance) touches, and the per-frame queries below read ONE bucket.
const OB_BUCKET = 16;   // u — bucket width; must exceed the largest single-frame query offset
let OBSTACLES = [];
let OB_GRID = new Map();
const OB_EMPTY = [];
export function setObstacles(list) {
  OBSTACLES = [...list, { x: WATER.centerX, z: WATER.centerZ, r: WATER.radius + 1 }];
  OB_GRID = new Map();
  for (const o of OBSTACLES) {
    const pad = o.r + AI_AVOID.clearance + 1;
    const x0 = Math.floor((o.x - pad) / OB_BUCKET), x1 = Math.floor((o.x + pad) / OB_BUCKET);
    const z0 = Math.floor((o.z - pad) / OB_BUCKET), z1 = Math.floor((o.z + pad) / OB_BUCKET);
    for (let bx = x0; bx <= x1; bx++) for (let bz = z0; bz <= z1; bz++) {
      const k = bx + "," + bz;
      let a = OB_GRID.get(k);
      if (!a) OB_GRID.set(k, a = []);
      a.push(o);
    }
  }
}
function obstaclesNear(x, z) {
  return OB_GRID.get(Math.floor(x / OB_BUCKET) + "," + Math.floor(z / OB_BUCKET)) || OB_EMPTY;
}

// Run-scoped dusk factor (0 full day .. 1 deepest dusk). Pushed in each frame
// from the world clock; predators read it to grow bolder as dusk falls.
let DUSK_FACTOR = 0;
export function setDusk(f) { DUSK_FACTOR = f; }

// --- TERRITORIES (owner: keep each species in its area) --------------------
// Each species has a home region (TERRITORY[kind]); the AI keeps a dino roughly
// inside it with a SOFT boundary, not a wall. `territoryFor` resolves a kind's
// region (falls back to a generous arena-centred region so an unlisted kind
// still behaves). `territoryWeight` is 0 well inside the region, ramping to 1 at
// the soft edge and beyond — it drives both an inward pull on the heading and a
// loss of interest in chasing a target that sits outside the region.
const FALLBACK_TERRITORY = { centerX: 0, centerZ: 0, radius: ARENA.radius, edgeSoftness: 24 };
function territoryFor(kind) { return TERRITORY[kind] || FALLBACK_TERRITORY; }

// BIOME MASK (design/MAP_SPEC.md, signed off): "a dino may ONLY enter cells
// whose code is in its biomes list" — the mask is the HARD constraint; the
// radius + soft edge above is just the loose cap. A territory without a
// `biomes` list (the fallback) is unmasked.
function maskAllows(T, x, z) {
  return !T.biomes || T.biomes.includes(biomeAt(x, z));
}

// Rejection-sampling budget when looking for an allowed cell. 40 keeps the
// failure odds negligible even for the sparsest mask (the swamp-only
// ankylosaurus) while staying cheap — spawn/wander-target picks only.
// first-pass for owner eyeball
const MASK_SAMPLE_TRIES = 40;

// Hard backstop, the mask's pushOutOfObstacles: if an integrated move landed on
// a forbidden cell, slide along the biome edge (axis-separated) or revert to the
// pre-move spot. If the PREVIOUS spot was already forbidden (bad spawn, mid-edge
// shove) the move is allowed to stand so the territory pull can walk the dino
// home instead of freezing it. Returns true when the move was blocked/altered —
// callers use that to re-roll an unreachable wander target.
function clampToMask(T, pos, px, pz) {
  if (maskAllows(T, pos.x, pos.z)) return false;
  if (!maskAllows(T, px, pz)) return false;   // already off-mask: let it walk out
  if (maskAllows(T, pos.x, pz)) { pos.z = pz; return true; }
  if (maskAllows(T, px, pos.z)) { pos.x = px; return true; }
  pos.x = px; pos.z = pz;
  return true;
}

// 0 (comfortably inside) .. 1 (at/over the soft edge) for a point vs a region.
function territoryWeight(T, x, z) {
  const d = Math.hypot(x - T.centerX, z - T.centerZ);
  const soft = T.radius - T.edgeSoftness;        // inside this radius = fully home
  if (d <= soft) return 0;
  return Math.min(1, (d - soft) / T.edgeSoftness);
}

// Bend a desired move (unit dir dx,dz) back toward the territory centre as the
// dino nears/exceeds its region edge. Inside the comfort zone it's a no-op; in
// the soft band it blends an inward component in proportional to how far out it
// is; past the hard leash (edgeSoftness × leashHardMul beyond the radius) the
// inward pull dominates so it firmly turns home. Returns a renormalised unit dir.
function applyTerritory(T, pos, dx, dz) {
  const w = territoryWeight(T, pos.x, pos.z);
  if (w <= 0) return { dx, dz };
  // inward unit vector (toward the region centre)
  const ix = T.centerX - pos.x, iz = T.centerZ - pos.z;
  const il = Math.hypot(ix, iz) || 1;
  const inx = ix / il, inz = iz / il;
  // Hard leash: past the radius + edgeSoftness×leashHardMul, force a strong pull.
  const overHard = Math.hypot(pos.x - T.centerX, pos.z - T.centerZ)
    - (T.radius + T.edgeSoftness * (TERRITORY.leashHardMul || 2));
  const hard = overHard > 0 ? 1 : 0;
  // Blend: soft band eases the inward pull in by w; the hard leash slams it to 1.
  const k = Math.max(w, hard);
  const mx = dx * (1 - k) + inx * k;
  const mz = dz * (1 - k) + inz * k;
  const m = Math.hypot(mx, mz) || 1;
  return { dx: mx / m, dz: mz / m };
}

// True if a CHASE target sits outside this dino's territory far enough that it
// should lose interest and break off (so a predator won't chase the player
// across the whole map). Uses the same soft edge but tests the TARGET point.
// A target standing on a cell the dino's BIOME MASK forbids is also "beyond":
// the predator could never reach it, so it breaks off instead of grinding
// against the biome edge (e.g. raptors give up once you step onto savannah).
function targetBeyondTerritory(T, tx, tz) {
  return territoryWeight(T, tx, tz) >= 1 || !maskAllows(T, tx, tz);
}

// Steer a move (unit dir dx,dz) away from nearby obstacle footprints. Adds an
// outward push from each footprint within its clearance band, then renormalises.
// A steering nudge, not hard collision — keeps the cheap direct-move AI cheap.
//
// Jitter fix: a PURELY RADIAL push (straight away from the obstacle centre)
// fights the goal-pull head-on when the goal sits directly behind the obstacle —
// the two near-cancel and flip sign frame-to-frame, so the dino vibrates in
// place. The fix is to steer TANGENTIALLY (around the obstacle) on a committed
// side, not straight away: each agent remembers which way it last skirted an
// obstacle (`steerState.side`, +1/-1) and holds that side for a short commit
// window so it doesn't re-decide and reverse every frame. The radial term is
// kept small (just enough to not creep inward); the tangential term does the
// work of sliding past. `steerState` is per-agent (defaults are seeded lazily).
function avoidObstacles(pos, dx, dz, steerState) {
  // Find the most-intruding obstacle this frame (the one we must skirt).
  let worst = null, worstW = 0;
  const near = obstaclesNear(pos.x, pos.z);
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    const ox = pos.x - o.x, oz = pos.z - o.z;
    const d = Math.hypot(ox, oz);
    const margin = o.r + AI_AVOID.clearance;
    if (d >= margin || d < 0.001) continue;
    const w = (margin - d) / margin;        // 0 at margin .. 1 at centre
    if (w > worstW) { worstW = w; worst = { o, ox, oz, d, w }; }
  }
  if (!worst) {
    // Clear of everything — let the avoidance commitment lapse so the next
    // encounter can pick a fresh side.
    if (steerState) steerState.commit = Math.max(0, (steerState.commit || 0) - 1);
    return { dx, dz };
  }

  const { ox, oz, d, w } = worst;
  // Outward (radial) unit vector and its two tangents (left/right around the
  // obstacle). Pick the tangent that best agrees with the desired heading so we
  // slide past toward the goal, and COMMIT to that side until we're clear.
  const rx = ox / d, rz = oz / d;          // away from centre
  const t1x = -rz, t1z = rx;               // tangent (one way round)
  let side;
  if (steerState && steerState.commit > 0) {
    side = steerState.side;                // hold the committed side
  } else {
    // choose the tangent more aligned with where we want to go
    side = (dx * t1x + dz * t1z) >= 0 ? 1 : -1;
    if (steerState) { steerState.side = side; steerState.commit = AI_AVOID.commitFrames; }
  }
  if (steerState && steerState.commit > 0) steerState.commit -= 1;

  const tx = t1x * side, tz = t1z * side;
  // Blend: mostly tangential (slide around), a little radial (don't creep in).
  const mx = dx + (tx * AI_AVOID.strength + rx * AI_AVOID.radialKeep) * w;
  const mz = dz + (tz * AI_AVOID.strength + rz * AI_AVOID.radialKeep) * w;
  const m = Math.hypot(mx, mz) || 1;
  return { dx: mx / m, dz: mz / m };
}

// Hard de-penetration: dinos integrate position directly (no moveWithCollisions),
// so the soft steer above can still let a goal behind an obstacle draw a creature
// into the footprint, where it orbits/buzzes. After integrating, project the
// position back out to each footprint's boundary. The push is always OUTWARD to a
// fixed radius, so it cannot oscillate; combined with the tangential steer the
// creature simply glides along the edge instead of pressing in. Clamps to each
// obstacle's own radius — no extra tuning constant.
function pushOutOfObstacles(pos) {
  const near = obstaclesNear(pos.x, pos.z);
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    const ox = pos.x - o.x, oz = pos.z - o.z;
    const d = Math.hypot(ox, oz);
    if (d >= o.r || d < 1e-4) continue;   // outside the footprint (or dead-centre): leave it
    const k = o.r / d;                    // scale the offset out to the boundary
    pos.x = o.x + ox * k;
    pos.z = o.z + oz * k;
  }
}

// AI agents: one apex T-Rex predator with a patrol/chase/attack FSM, and a
// herd of herbivores that wander and flee from threats (player + trex).

// The herd roster mixes the four original animated herbivores with the new
// herbivore VARIANTS (wishlist item 4c) so a run shows a wider species spread.
// Variants reuse a base rig but get their own diet/behaviour from DINO_VARIANTS.
//
// DISABLED variants (DINO_VARIANTS[kind].disabled) are filtered out: the
// Spinosaurus reuses the low-poly trex.glb and reads as a stray low-poly T-Rex
// (owner: "there's still the old low poly t rexes running around"), so it is
// removed from the roster until a procedural Spinosaurus mesh exists. After
// this filter the ONLY T-Rex-shaped creature in-game is the one procedural
// predator (createTrex). The compsognathus reuses the raptor rig (small biped),
// not trex, so it is NOT a low-poly theropod and stays in.
const HERB_KINDS = [
  "triceratops", "stegosaurus", "apatosaurus", "parasaur",
  "spinosaurus", "ankylosaurus", "pachycephalosaurus", "brachiosaurus", "compsognathus",
].filter((k) => !(DINO_VARIANTS[k] && DINO_VARIANTS[k].disabled));

// Per-kind target model height (world units). Variants carry their own `height`
// in DINO_VARIANTS; the four originals are listed here. Falls back to 3.
// Target render heights (bbox u). Anchored to the human (1.99u measured ≈ 1.8m).
// NB bbox height ≠ standing height for some rigs (the T-Rex bbox is tail-inflated;
// it stands ~5.75u at TREX_RENDER_HEIGHT 16 — lifesize, see that comment). The
// sauropod slot (now the hi-poly BRACHIOSAURUS) is neck-dominated so its bbox ≈ its
// standing head height: 20u so it TOWERS far above the T-Rex's ~5.75u standing
// height. Stego is tall for its back plates (~4m). First-pass — owner eyeballs.
const HERB_HEIGHTS = { triceratops: 3.2, stegosaurus: 4.2, apatosaurus: 20.0, parasaur: 3.3 };
function herbHeight(kind) {
  const v = DINO_VARIANTS[kind];
  return (v && v.height) || HERB_HEIGHTS[kind] || 3;
}

// Which herbivore kinds can turn and charge when cornered. The triceratops is
// the original; the sail-backed Spinosaurus and dome-headed Pachycephalosaurus
// charge too (DINO_VARIANTS.canCharge). Everything else flees.
function herbCanCharge(kind) {
  if (kind === "triceratops") return true;
  const v = DINO_VARIANTS[kind];
  return !!(v && v.canCharge);
}

// Choose the herbivore a T-Rex should hunt this frame (or null to hunt/seek the
// player). Keeps a committed prey until it dies, escapes past loseRange, or the
// raptor demands priority; otherwise acquires the nearest live herbivore that is
// within preySightRange AND clearly nearer than the player (preyCloserBy).
export function pickPrey(state, pos, distP, herd, sightRange, loseRange, lockedToPlayer) {
  if (lockedToPlayer || !herd) return null;
  // Keep current prey if still valid (alive + not escaped).
  if (state.prey && !state.prey.dead && state.prey.kind !== "apatosaurus") {
    const pp = state.prey.dino.root.position;
    if (Math.hypot(pp.x - pos.x, pp.z - pos.z) <= loseRange) return state.prey;
  }
  // Acquire: nearest live herbivore in prey-sight that is clearly nearer than the raptor.
  let best = null, bd = Infinity;
  for (const h of herd) {
    // A T-Rex never takes on the brachiosaurus — a 30-tonne sauropod isn't prey.
    if (h.dead || h.kind === "apatosaurus") continue;
    const hp = h.dino.root.position;
    const d = Math.hypot(hp.x - pos.x, hp.z - pos.z);
    if (d < TREX.preySightRange && d < distP - TREX.preyCloserBy && d < bd) { bd = d; best = h; }
  }
  return best;
}

function rand(a, b) { return a + Math.random() * (b - a); }
// A random point inside a species' TERRITORY (clamped to the arena), used for
// spawns and wander targets so each dino lives in its region. Sampled within
// the comfort radius (radius − edgeSoftness) so wander targets don't sit out on
// the soft edge.
// Rejection-sampled against the BIOME MASK so spawns and wander targets always
// sit on an allowed cell; falls back to the territory centre (map.json centres
// are validated to sit on allowed cells).
function randPointInTerritory(T) {
  const comfort = Math.max(8, T.radius - T.edgeSoftness);
  for (let i = 0; i < MASK_SAMPLE_TRIES; i++) {
    const r = Math.sqrt(Math.random()) * comfort;
    const a = Math.random() * Math.PI * 2;
    let x = T.centerX + Math.cos(a) * r;
    let z = T.centerZ + Math.sin(a) * r;
    // keep inside the playable disc
    const d = Math.hypot(x, z), lim = ARENA.radius - 6;
    if (d > lim) { const k = lim / d; x *= k; z *= k; }
    if (maskAllows(T, x, z)) return { x, z };
  }
  return { x: T.centerX, z: T.centerZ };
}

// Next wander target for a grazing herbivore. A herd member stays near its herd's
// shared roaming centre (which ambles toward a re-rolled roam point), so the herd
// moves as a clustered group; a solo grazer just picks a fresh point in its range.
function nextWanderTarget(state) {
  const h = state.herd;
  if (!h) return randPointInTerritory(state.territory);
  const dx = h.roam.x - h.center.x, dz = h.roam.z - h.center.z;
  const d = Math.hypot(dx, dz);
  if (d < HERD_ROAM_STEP) h.roam = randPointInTerritory(h.territory);  // arrived — pick a new roam point
  else { h.center.x += (dx / d) * HERD_ROAM_STEP; h.center.z += (dz / d) * HERD_ROAM_STEP; }
  // Cluster point near the herd centre, masked like everything else; fall back
  // to a fresh masked territory point if the spread keeps landing off-mask.
  for (let i = 0; i < MASK_SAMPLE_TRIES; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * HERD_SPREAD;
    const x = h.center.x + Math.cos(a) * r, z = h.center.z + Math.sin(a) * r;
    if (maskAllows(state.territory, x, z)) return { x, z };
  }
  return randPointInTerritory(state.territory);
}

// T-Rex render height (world units). OWNER FIX ("the t rex is too small compared
// to the man"): the man is 2.0u (~1.8m); the old 4.2 left the rex barely twice
// his height — pony-sized for a 9-tonne animal. Raised to 6.0u so it TOWERS over
// the player, sized LIFESIZE for "Scotty"-scale Tyrannosaurus. loadDino scales
// the whole rig UNIFORMLY by targetHeight/nativeBboxHeight, so this value sets
// the rig's overall scale (length and height grow together). Provenance: the
// game scale is ~0.9 m/unit (1.8 m human at 2.0u). A real T-Rex is ~13 m long
// (~14.4u) with a standing head ~5-6 m (~5.5-6.7u). Measured headless, the rig
// at the old 6.0 came out only ~5.4u LONG / ~2.15u tall — barely bigger than the
// human. Because scaling is uniform, length scales linearly with this number:
// to hit 14.4u of length we need 6.0 × 14.4/5.38 ≈ 16.0, which also lifts the
// standing height to ~5.75u (~5.2 m) — both inside the lifesize band. Verified
// beside the 2.0u human in a headless bbox measurement (tools/wall_probe.mjs).
const TREX_RENDER_HEIGHT = 16.0;

export async function createTrex(scene, shadow, groundFn) {
  const dino = await loadDino(scene, "trex", TREX_RENDER_HEIGHT, shadow);
  const territory = territoryFor("trex");   // dry/rocky + open plains (see TERRITORY)
  const start = randPointInTerritory(territory);
  dino.root.position.set(start.x, groundFn(start.x, start.z), start.z);

  const state = {
    dino, kind: "trex",
    territory,
    facing: 0,
    health: TREX.maxHealth,
    target: randPointInTerritory(territory),
    mode: "patrol",
    attackTimer: 0,
    dead: false,
    speedBonus: 0,
    enraged: false,    // true once wounded past the enrage threshold
    enrageGlow: 0,     // re-flash timer for the sustained angry glow
    lastStrikeId: -1,  // last player swing id that hit this target (one hit per swing)
    steer: { side: 1, commit: 0 },  // committed obstacle-skirt side (anti-jitter)
    prey: null,        // herbivore currently hunted instead of the player (or null)
    preyAttackTimer: 0,// cooldown between bites on the hunted herbivore
    feeding: 0,        // sec remaining feeding on a fresh kill — planted + vulnerable
    feedGlow: 0,       // re-flash timer for the gorging glow
    ambushTimer: 0,    // >0 during an ambush lunge burst
    ambushCd: 0,       // recovery before the next ambush
    aggroCd: 0,        // >0 = ignore the player (just disengaged) so an escape sticks
    onBite: null,    // (set by game) called when the trex lands a bite on the player
    onRoar: null,    // called when entering chase
    onPreyBite: null,// (set by game) called when the trex bites a herbivore
    onFeed: null,    // (set by game) called once when it starts feeding on a kill
  };

  state.update = function (dt, player, herd) {
    dino.updateFlash(dt);
    if (state.dead) return;
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    state.preyAttackTimer = Math.max(0, state.preyAttackTimer - dt);
    state.ambushTimer = Math.max(0, state.ambushTimer - dt);
    state.ambushCd = Math.max(0, state.ambushCd - dt);
    state.aggroCd = Math.max(0, state.aggroCd - dt);
    const B = window.BABYLON;
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);

    // STAGGER (item 6): a heavy weapon hit / thrown rock froze the predator — it
    // reels in place, unable to advance or bite, until the timer (ticked by the
    // game) lapses. The reward window for landing a club/rock blow.
    if (isStaggered(state)) {
      pos.y = groundFn(pos.x, pos.z);
      dino.play("Idle");
      return;
    }

    // FEEDING FRENZY: having felled its prey, the T-Rex gorges on the carcass —
    // planted, head-down, distracted, and VULNERABLE (raptor bites do bonus
    // damage; see game.js feed-vuln gate). It abandons the meal only if the
    // raptor crowds inside feedBreakRange (it whirls to defend) — so the punish
    // is a real risk, not a free hit. A gnawing growl + a re-flashed gorging
    // glow read the window; the heartbeat stays quiet (it isn't hunting you).
    if (state.feeding > 0) {
      if (distP < TREX.feedBreakRange) {
        state.feeding = 0;              // raptor too close — break off and defend
      } else {
        state.feeding = Math.max(0, state.feeding - dt);
        state.feedGlow -= dt;
        if (state.feedGlow <= 0) {
          state.feedGlow = 0.4;
          dino.flash(0.3, new B.Color3(0.55, 0.1, 0.12));   // dark, gorging red
        }
        pos.y = groundFn(pos.x, pos.z);
        dino.play("Attack", { speed: 0.5 });                // slow chewing loop
        return;
      }
    }

    // Enrage when wounded: faster, with a sustained angry glow + a roar on the
    // transition. A comeback threat right when you think you've won.
    const enraged = state.health <= TREX.maxHealth * TREX.enrageThreshold;
    if (enraged && !state.enraged) {
      state.enraged = true;
      if (state.onRoar) state.onRoar();
    }
    if (enraged) {
      state.enrageGlow -= dt;
      if (state.enrageGlow <= 0) {
        state.enrageGlow = 0.3;
        dino.flash(0.35, new B.Color3(0.9, 0.1, 0.05));
      }
    }

    // Dusk emboldens the predator: it spots the raptor from further, gives up
    // later, and runs faster. Blended by the run's dusk factor (0 day .. 1 dusk).
    const sightRange = TREX.sightRange + DUSK.trexSightBonus * DUSK_FACTOR;
    const loseRange = TREX.loseInterestRange + DUSK.trexLoseBonus * DUSK_FACTOR;
    const duskSpeed = DUSK.trexSpeedBonus * DUSK_FACTOR;

    // The T-Rex is a true apex predator: when it is NOT locked onto the player
    // it hunts the herd. The player stays the priority — being close
    // (playerPriorityRange) forces a player chase; otherwise a clearly-nearer
    // herbivore (preyCloserBy nearer than the player, within preySightRange)
    // pulls aggro. A hunted herbivore is a living decoy the player can exploit
    // (or whose meat they can steal).
    const lockedToPlayer = distP < TREX.playerPriorityRange;
    state.prey = pickPrey(state, pos, distP, herd, sightRange, loseRange, lockedToPlayer);

    const wasChasing = state.mode === "chase";
    // TERRITORY: the predator won't chase a target that has fled clear out of its
    // home region — it loses interest at its own boundary and turns back rather
    // than running across the whole map (owner's "not running around in random
    // areas"). The territory is large, so a normal hunt is unaffected; this only
    // bites when the player/prey crosses well into another biome.
    const T = state.territory;
    const playerBeyond = targetBeyondTerritory(T, pp.x, pp.z);
    // It ignores the player for a beat after losing them (aggroCd) so a clean
    // getaway sticks — but it'll still peel off to hunt the herd meanwhile.
    const seesPlayer = !player.dead && distP < sightRange && state.aggroCd <= 0 && !playerBeyond;
    if (state.prey || seesPlayer) state.mode = "chase";
    else if (state.mode === "chase" && (distP > loseRange || (playerBeyond && !state.prey))) {
      state.mode = "patrol";
      state.aggroCd = TREX.disengageCooldown; // give up; leave the player alone a while
    }
    if (!wasChasing && state.mode === "chase" && state.onRoar) state.onRoar();

    let goal, speed;
    if (state.mode === "chase" && state.prey) {
      // Hunting a herbivore. Slightly less frantic than a player chase — no dusk
      // speed bonus needed; it's culling the herd, not racing the raptor.
      const preyPos = state.prey.dino.root.position;
      goal = { x: preyPos.x, z: preyPos.z };
      speed = TREX.chaseSpeed + state.speedBonus + (enraged ? TREX.enrageSpeedBonus : 0);
      const distPrey = Math.hypot(preyPos.x - pos.x, preyPos.z - pos.z);
      if (distPrey < TREX.preyAttackRange) {
        speed = 0;
        if (state.preyAttackTimer <= 0) {
          state.preyAttackTimer = TREX.preyAttackCooldown;
          dino.play("Attack", { loop: false, speed: 1.2 });
          state.prey.takeDamage(TREX.preyBite);
          if (state.onPreyBite) state.onPreyBite(preyPos);
          // The killing bite: settle in to feed on the carcass (the vulnerable
          // window). Clear prey so the FSM doesn't re-chase a dead herbivore.
          if (state.prey.dead) {
            state.feeding = TREX.feedSeconds;
            state.feedGlow = 0;
            state.prey = null;
            if (state.onFeed) state.onFeed(pos.clone());
          }
        }
      }
    } else if (state.mode === "chase") {
      goal = { x: pp.x, z: pp.z };
      // STALK + AMBUSH: creep at the slow stalk speed; when within ambushRange
      // and recovered, burst into a fast lunge for ambushSeconds to land a bite.
      if (state.ambushTimer <= 0 && state.ambushCd <= 0 && distP < TREX.ambushRange && distP > TREX.attackRange) {
        state.ambushTimer = TREX.ambushSeconds;
        state.ambushCd = TREX.ambushCooldown;
      }
      const ambushing = state.ambushTimer > 0;
      speed = (ambushing ? TREX.ambushSpeed : TREX.chaseSpeed) + state.speedBonus + duskSpeed
        + (enraged ? TREX.enrageSpeedBonus : 0);
      if (distP < TREX.attackRange) {
        speed = 0;
        if (state.attackTimer <= 0) {
          state.attackTimer = TREX.attackCooldown;
          dino.play("Attack", { loop: false, speed: 1.2 });
          const before = player.health;
          player.takeDamage(TREX.attackDamage);
          if (player.health < before && state.onBite) state.onBite();
        }
      }
    } else {
      goal = state.target;
      speed = TREX.patrolSpeed;
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 4) state.target = randPointInTerritory(T);
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    let dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    // TERRITORY soft boundary: bend the heading back toward home as it nears /
    // exceeds its region edge (no-op while comfortably inside).
    dir = applyTerritory(T, pos, dir.dx, dir.dz);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, TREX.turnLerp);
    dino.setYaw(state.facing);

    if (speed > 0) {
      // Translate along the SMOOTHED facing, not the raw avoidance dir: near an
      // obstacle footprint dir can snap-reverse frame-to-frame (side-commit flip /
      // goal-behind cancellation), which used to lurch the body in place. Following
      // the lerped heading turns that into a gentle arc — no jitter.
      const px = pos.x, pz = pos.z;
      pos.x += Math.sin(state.facing) * speed * dt;
      pos.z += Math.cos(state.facing) * speed * dt;
      pushOutOfObstacles(pos);
      // BIOME MASK backstop: never step onto a forbidden cell. A blocked patrol
      // target is unreachable across the forbidden biome — re-roll it.
      if (clampToMask(T, pos, px, pz) && state.mode === "patrol") state.target = randPointInTerritory(T);
      // Gait by mode: stalk/patrol uses the WALK cycle, chase uses RUN — both
      // speed-matched. (Playing RUN at patrol speed slowed it to a leg-flapping
      // slow-mo; the walk cycle reads correctly at the slow pace.)
      const tgait = state.mode === "chase" ? "Run" : "Walk";
      dino.play(tgait, { speed: gaitRate(dino, tgait, speed, state.mode === "chase" ? (enraged ? 1.5 : 1.2) : 0.85) });
    } else if (state.attackTimer > TREX.attackCooldown - 0.5) {
      // attacking
    } else {
      dino.play("Idle");
    }
    pos.y = groundFn(pos.x, pos.z);
    clampArena(pos);
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    dino.flash(JUICE.hitFlashSeconds, new window.BABYLON.Color3(1.0, 0.25, 0.15));
    if (state.health <= 0) { state.dead = true; dino.die(); }
  };

  // Soft restart: revive at a fresh spot in its territory, full health, on patrol.
  state.reset = function () {
    const p = randPointInTerritory(state.territory);
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = TREX.maxHealth;
    state.mode = "patrol";
    state.target = randPointInTerritory(state.territory);
    state.ambushTimer = 0;
    state.ambushCd = 0;
    state.aggroCd = 0;
    state.attackTimer = 0;
    state.speedBonus = 0;
    state.enraged = false;
    state.enrageGlow = 0;
    state.lastStrikeId = -1;
    state.prey = null;
    state.preyAttackTimer = 0;
    state.feeding = 0;
    state.feedGlow = 0;
    state.dead = false;
    dino.revivePose();
    dino.play("Idle");
  };

  return state;
}

// ---------------------------------------------------------------------------
// RAPTOR PACK predator (wishlist item 4d). Spawns 2-4 raptors that hunt as a
// coordinated pack: each member holds a slot on a ring around the player and
// converges on its flank, so the pack ENCIRCLES rather than stacking on one
// point. Fast, fragile, weak per bite — the threat is the net, not a lone
// chaser. Each member exposes the same shape as the T-Rex predator state
// (`update`/`dead`/`mode`/`prey`/`feeding`/`reset`/`speedBonus`/`dino`) so the
// game's predator list, roar, minimap and HUD all just work.
export async function createRaptorPack(scene, shadow, groundFn, count) {
  const n = Math.max(RAPTOR.packMin, Math.min(RAPTOR.packMax, count || RAPTOR.packSize));
  // Shared pack object: a spawn anchor + a "locked on" flag so the pack yips
  // once as a group, and the member's slot index drives its flank angle.
  const pack = { calledOut: false };
  // The pack spawns inside the RAPTOR territory (the jungle & its edges) so it
  // hunts from the treeline rather than anywhere on the map.
  const territory = territoryFor("raptor");
  const center = randPointInTerritory(territory);
  const members = [];
  for (let i = 0; i < n; i++) {
    const m = await createRaptor(scene, shadow, groundFn, pack, i, n, center, territory);
    members.push(m);
  }
  pack.members = members;
  return members;
}

async function createRaptor(scene, shadow, groundFn, pack, slot, packCount, center, territory) {
  const dino = await loadDino(scene, "raptor", RAPTOR.modelHeight, shadow);
  const jitter = () => (Math.random() - 0.5) * 10;
  // Jittered spawn around the pack centre, masked: each member must land on an
  // allowed cell (the centre itself is mask-sampled by randPointInTerritory).
  let sx = center.x, sz = center.z;
  for (let i = 0; i < MASK_SAMPLE_TRIES; i++) {
    const jx = Math.max(-ARENA.radius + 4, Math.min(ARENA.radius - 4, center.x + jitter()));
    const jz = Math.max(-ARENA.radius + 4, Math.min(ARENA.radius - 4, center.z + jitter()));
    if (maskAllows(territory, jx, jz)) { sx = jx; sz = jz; break; }
  }
  dino.root.position.set(sx, 0, sz);
  dino.root.position.y = groundFn(dino.root.position.x, dino.root.position.z);

  const state = {
    dino, kind: "raptor",
    territory,
    facing: rand(0, 6),
    health: RAPTOR.maxHealth,
    maxHealth: RAPTOR.maxHealth,
    target: randPointInTerritory(territory),
    mode: "patrol",
    attackTimer: 0,
    dead: false,
    speedBonus: 0,
    // Predator-interface fields the game/minimap/HUD read but the pack doesn't
    // use (no enrage, no herd-prey, no feeding-frenzy for the raptor pack — the
    // pressure is numbers, not a wounded-comeback or a vulnerable gorge window).
    enraged: false,
    prey: null,
    feeding: 0,
    steer: { side: 1, commit: 0 },  // committed obstacle-skirt side (anti-jitter)
    lastStrikeId: -1,
    slot, packCount,
    slotWobble: (Math.random() - 0.5) * 2 * RAPTOR.slotJitter,  // fixed per-member ring jitter
    onBite: null,
    onRoar: null,
    onPreyBite: null,
    onFeed: null,
  };

  state.update = function (dt, player) {
    dino.updateFlash(dt);
    if (state.dead) return;
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);

    // STAGGER (item 6): a heavy hit / thrown rock froze this raptor — it reels in
    // place until the game-ticked timer lapses.
    if (isStaggered(state)) {
      pos.y = groundFn(pos.x, pos.z);
      dino.play("Idle");
      return;
    }

    const sightRange = RAPTOR.sightRange + DUSK.trexSightBonus * DUSK_FACTOR;
    const loseRange = RAPTOR.loseInterestRange + DUSK.trexLoseBonus * DUSK_FACTOR;
    const duskSpeed = DUSK.trexSpeedBonus * DUSK_FACTOR;

    state.aggroCd = Math.max(0, (state.aggroCd || 0) - dt);
    const wasChasing = state.mode === "chase";
    // TERRITORY: the pack won't chase the player clear out of its jungle range —
    // it breaks off at its own boundary and drifts back (owner's "not running
    // around in random areas"). Large range, so a normal hunt is unaffected.
    const T = state.territory;
    const playerBeyond = targetBeyondTerritory(T, pp.x, pp.z);
    const seesPlayer = !player.dead && distP < sightRange && state.aggroCd <= 0 && !playerBeyond;
    if (seesPlayer) state.mode = "chase";
    else if (state.mode === "chase" && (distP > loseRange || playerBeyond)) {
      state.mode = "patrol";
      state.aggroCd = RAPTOR.disengageCooldown; // pack gives up once you're clear
    }
    // The pack yips once as a group the first time any member locks on.
    if (!wasChasing && state.mode === "chase") {
      if (!pack.calledOut) { pack.calledOut = true; if (state.onRoar) state.onRoar(); }
    }
    if (state.mode !== "chase" && pack.members && pack.members.every((m) => m.dead || m.mode !== "chase")) {
      pack.calledOut = false;   // re-arm the group yip once the whole pack disengages
    }

    let goal, speed;
    if (state.mode === "chase") {
      speed = RAPTOR.chaseSpeed + state.speedBonus + duskSpeed;
      // Close STRAIGHT in for the kill. The old "encircle" held each member on a
      // standoff ring at surroundRadius (6) — bigger than lungeRange (5) — so the
      // pack ORBITED the prey at ~6u and never dropped inside to bite, and a member
      // whose slot sat on the far side ran AROUND the player to reach it (owner:
      // "veloci run round in circles"). Members already arrive from spread bearings
      // because the pack is dispersed, so they still fan in naturally.
      goal = { x: pp.x, z: pp.z };
      if (distP < RAPTOR.attackRange) {
        speed = 0;
        if (state.attackTimer <= 0) {
          state.attackTimer = RAPTOR.attackCooldown;
          dino.play("Attack", { loop: false, speed: 1.3 });
          const before = player.health;
          player.takeDamage(RAPTOR.attackDamage);
          if (player.health < before && state.onBite) state.onBite();
        }
      }
    } else {
      goal = state.target;
      speed = RAPTOR.patrolSpeed;
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 4) state.target = randPointInTerritory(T);
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    let dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    // TERRITORY soft boundary: pull the heading back toward the pack's range.
    dir = applyTerritory(T, pos, dir.dx, dir.dz);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, RAPTOR.turnLerp);
    dino.setYaw(state.facing);

    if (speed > 0) {
      // Translate along the smoothed facing (not raw dir) — see T-Rex note: stops
      // the in-place lurch when skirting an obstacle footprint.
      const px = pos.x, pz = pos.z;
      pos.x += Math.sin(state.facing) * speed * dt;
      pos.z += Math.cos(state.facing) * speed * dt;
      pushOutOfObstacles(pos);
      // BIOME MASK backstop (raptors: jungle wall + clearing + path + desert/rocky,
      // never savannah). A blocked patrol target is unreachable — re-roll it.
      if (clampToMask(T, pos, px, pz) && state.mode === "patrol") state.target = randPointInTerritory(T);
      dino.play("Run", { speed: gaitRate(dino, "Run", speed, state.mode === "chase" ? 1.5 : 1.0) });
    } else if (state.attackTimer > RAPTOR.attackCooldown - 0.4) {
      // mid-bite
    } else {
      dino.play("Idle");
    }
    pos.y = groundFn(pos.x, pos.z);
    clampArena(pos);
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    dino.flash(JUICE.hitFlashSeconds, new window.BABYLON.Color3(1.0, 0.25, 0.15));
    if (state.health <= 0) { state.dead = true; dino.die(); }
  };

  state.reset = function () {
    const p = randPointInTerritory(state.territory);
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = state.maxHealth;
    state.mode = "patrol";
    state.target = randPointInTerritory(state.territory);
    state.attackTimer = 0;
    state.speedBonus = 0;
    state.lastStrikeId = -1;
    state.dead = false;
    pack.calledOut = false;
    dino.revivePose();
    dino.play("Idle");
  };

  return state;
}

export async function createHerd(scene, shadow, groundFn) {
  const herd = [];
  // Solo grazers: one of each kind in rotation. The brachiosaurus is skipped here
  // and spawned as a cohesive HERD below (owner: "bracs travel in herds of 4-5").
  for (let i = 0; i < HERBIVORE.count; i++) {
    const kind = HERB_KINDS[i % HERB_KINDS.length];
    if (kind === "apatosaurus") continue;
    herd.push(await createHerbivore(scene, shadow, groundFn, kind));
  }
  // Brachiosaurus herd: 4-5 sharing a roaming centre so they amble together.
  if (HERB_KINDS.includes("apatosaurus")) {
    const T = territoryFor("apatosaurus");
    const c = randPointInTerritory(T);
    const brachHerd = { center: { x: c.x, z: c.z }, roam: randPointInTerritory(T), territory: T };
    const n = HERD_BRACH_MIN + Math.floor(Math.random() * (HERD_BRACH_MAX - HERD_BRACH_MIN + 1));
    for (let i = 0; i < n; i++) herd.push(await createHerbivore(scene, shadow, groundFn, "apatosaurus", brachHerd));
  }
  return herd;
}

async function createHerbivore(scene, shadow, groundFn, kind, herd = null) {
  const variant = DINO_VARIANTS[kind] || null;
  const dino = await loadDino(scene, kind, herbHeight(kind), shadow);
  // Per-variant stat mods: tankier armour (healthMul), quicker little darters
  // (speedMul). Defaults to the HERBIVORE baseline for the four originals.
  const maxHealth = Math.round(HERBIVORE.maxHealth * ((variant && variant.healthMul) || 1));
  const speedMul = ((variant && variant.speedMul) || 1) * (LOCO_SPEED_SCALE[kind] || 1);
  const territory = territoryFor(kind);   // each species grazes in its own region
  // Herd members spawn clustered around the herd centre; solo grazers anywhere
  // in range. Both ON an allowed cell (BIOME MASK); a herd member that can't
  // find one in the cluster falls back to the (mask-validated) herd centre.
  let start = null;
  if (herd) {
    start = { x: herd.center.x, z: herd.center.z };
    for (let i = 0; i < MASK_SAMPLE_TRIES; i++) {
      const x = herd.center.x + (Math.random() * 2 - 1) * HERD_SPREAD;
      const z = herd.center.z + (Math.random() * 2 - 1) * HERD_SPREAD;
      if (maskAllows(territory, x, z)) { start = { x, z }; break; }
    }
  } else {
    start = randPointInTerritory(territory);
  }
  dino.root.position.set(start.x, groundFn(start.x, start.z), start.z);

  // A charger uses its own crisper turn rate + a post-charge recover settle so it
  // doesn't snap from a flat-out charge straight into a reverse sprint (the
  // judder that read as "doesn't move very well"). Non-chargers keep the herd
  // default turn. Variant chargers reuse the triceratops locomotion tuning.
  const canCharge = herbCanCharge(kind);
  const turnLerp = canCharge ? TRICERATOPS.turnLerp : HERBIVORE.turnLerp;
  const walkClipSpeed = kind === "triceratops" ? TRICERATOPS.walkClipSpeed : 0.8;

  const state = {
    dino, kind,
    territory,
    herd,
    facing: rand(0, 6),
    target: randPointInTerritory(territory),
    fleeing: false,
    charging: 0,        // remaining charge-commit time (chargers only)
    chargeCd: 0,
    chargeHitDone: false,
    recover: 0,         // post-charge settle: decelerate + re-point before normal AI resumes
    steer: { side: 1, commit: 0 },  // committed obstacle-skirt side (anti-jitter)
    dead: false,
    maxHealth,
    health: maxHealth,
    lastStrikeId: -1,   // last player swing id that hit this target (one hit per swing)
    onCharge: null,     // (set by game) called when a charge starts
    onDown: null,       // (position) called when killed by the player
  };
  state.target = nextWanderTarget(state);   // herd-aware first target (clustered if in a herd)

  state.update = function (dt, player, trex) {
    dino.updateFlash(dt);
    if (state.dead) return;
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    state.chargeCd = Math.max(0, state.chargeCd - dt);
    state.recover = Math.max(0, state.recover - dt);

    const threats = [pp];
    if (trex && !trex.dead) threats.push(trex.dino.root.position);

    // nearest threat
    let nearest = null, nd = Infinity;
    for (const t of threats) {
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < nd) { nd = d; nearest = t; }
    }
    // The herd gets jumpier at dusk too — they spook from further away.
    state.fleeing = nd < HERBIVORE.fleeRange + DUSK.herbFleeBonus * DUSK_FACTOR;

    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);

    // --- charge handling (chargers) ---
    if (state.charging > 0) {
      state.charging -= dt;
      // barrel toward the player's current position
      const cdx = pp.x - pos.x, cdz = pp.z - pos.z;
      const cd = Math.hypot(cdx, cdz) || 1;
      const yaw = Math.atan2(cdx / cd, cdz / cd);
      state.facing = lerpAngle(state.facing, yaw, 0.25);
      dino.setYaw(state.facing);
      const cpx = pos.x, cpz = pos.z;
      pos.x += (cdx / cd) * TRICERATOPS.chargeSpeed * dt;
      pos.z += (cdz / cd) * TRICERATOPS.chargeSpeed * dt;
      pushOutOfObstacles(pos);
      clampToMask(state.territory, pos, cpx, cpz);  // a charge still can't leave the mask
      pos.y = groundFn(pos.x, pos.z);
      clampArena(pos);
      if (!state.chargeHitDone && cd < TRICERATOPS.chargeHitRange && !player.dead) {
        state.chargeHitDone = true;
        player.takeDamage(TRICERATOPS.chargeDamage);
      }
      dino.play("Run", { speed: gaitRate(dino, "Run", TRICERATOPS.chargeSpeed, 1.5) });
      if (state.charging <= 0) state.recover = TRICERATOPS.recoverSeconds;  // settle after the charge
      return;
    }

    // Post-charge recover: a brief settle where the big body decelerates and
    // wheels back toward its heading before the flee/wander AI resumes. Without
    // it the charger snapped instantly into a reverse sprint and juddered.
    if (state.recover > 0) {
      dino.setYaw(state.facing);
      pos.y = groundFn(pos.x, pos.z);
      dino.play("Walk", { speed: walkClipSpeed * 0.6 });
      return;
    }

    // trigger a charge: cornered (player close) and off cooldown
    if (canCharge && !player.dead && state.chargeCd <= 0 &&
        distP < TRICERATOPS.chargeTriggerRange && nearest === pp) {
      state.charging = TRICERATOPS.chargeDuration;
      state.chargeCd = TRICERATOPS.chargeCooldown;
      state.chargeHitDone = false;
      dino.flash(0.2, new window.BABYLON.Color3(0.8, 0.5, 0.1));
      if (state.onCharge) state.onCharge();
      return;
    }

    let goal, speed;
    if (state.fleeing && nearest) {
      goal = { x: pos.x + (pos.x - nearest.x), z: pos.z + (pos.z - nearest.z) };
      speed = HERBIVORE.fleeSpeed * speedMul;
    } else {
      goal = state.target;
      speed = HERBIVORE.wanderSpeed * speedMul;
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 3) state.target = nextWanderTarget(state);
    }
    // The brachiosaurus never runs — a sauropod just ambles away at walk pace even
    // when spooked (owner: "it should always walk"). Keep the flee heading, drop to
    // walk speed.
    if (kind === "apatosaurus") speed = HERBIVORE.wanderSpeed * speedMul;

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    let dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    // TERRITORY soft boundary, applied only while GRAZING (not fleeing) — a
    // panicked herbivore is allowed to bolt past its edge, but its normal wander
    // keeps it in its grazing region rather than drifting across the map. (We
    // don't pull a fleeing animal back, or it'd turn into the predator.)
    if (!state.fleeing) dir = applyTerritory(state.territory, pos, dir.dx, dir.dz);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, turnLerp);
    dino.setYaw(state.facing);

    // Translate along the smoothed facing (not raw dir) — see T-Rex note: stops
    // the in-place lurch when skirting an obstacle footprint.
    const px = pos.x, pz = pos.z;
    pos.x += Math.sin(state.facing) * speed * dt;
    pos.z += Math.cos(state.facing) * speed * dt;
    pushOutOfObstacles(pos);
    // BIOME MASK backstop: even a fleeing herbivore can't bolt into a forbidden
    // biome (the mask is hard); a blocked graze target gets re-rolled.
    if (clampToMask(state.territory, pos, px, pz) && !state.fleeing) state.target = nextWanderTarget(state);
    pos.y = groundFn(pos.x, pos.z);
    clampArena(pos);

    const gait = (state.fleeing && kind !== "apatosaurus") ? "Run" : "Walk";  // brachiosaurus never runs
    dino.play(gait, { speed: gaitRate(dino, gait, speed, gait === "Run" ? 1.3 : walkClipSpeed) });
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    dino.flash(JUICE.hitFlashSeconds, new window.BABYLON.Color3(0.9, 0.3, 0.2));
    if (state.health <= 0) {
      state.dead = true;
      dino.die();
      if (state.onDown) state.onDown(dino.root.position.clone());
    }
  };

  // Soft restart: revive in its territory, full health, fresh wander target.
  state.reset = function () {
    const p = randPointInTerritory(state.territory);
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = state.maxHealth;
    state.dead = false;
    state.fleeing = false;
    state.charging = 0;
    state.chargeCd = 0;
    state.chargeHitDone = false;
    state.lastStrikeId = -1;
    state.recover = 0;
    state.target = randPointInTerritory(state.territory);
    dino.revivePose();
    dino.play("Idle");
  };
  return state;
}

function clampArena(pos) {
  const d = Math.hypot(pos.x, pos.z);
  if (d > ARENA.radius - 2) {
    const k = (ARENA.radius - 2) / d;
    pos.x *= k; pos.z *= k;
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
