import { TREX, HERBIVORE, TRICERATOPS, RAPTOR, ARENA, JUICE, WATER, AI_AVOID, DUSK, DINO_VARIANTS } from "./config.js";
import { loadDino } from "./dino.js";
import { isStaggered } from "./tools.js";

// Solid obstacle footprints ({x, z, r}) the AI steers around. Injected from the
// world build; the pond is appended so one routine handles every avoidance.
let OBSTACLES = [];
export function setObstacles(list) {
  OBSTACLES = [...list, { x: WATER.centerX, z: WATER.centerZ, r: WATER.radius + 1 }];
}

// Run-scoped dusk factor (0 full day .. 1 deepest dusk). Pushed in each frame
// from the world clock; predators read it to grow bolder as dusk falls.
let DUSK_FACTOR = 0;
export function setDusk(f) { DUSK_FACTOR = f; }

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
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
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

// AI agents: one apex T-Rex predator with a patrol/chase/attack FSM, and a
// herd of herbivores that wander and flee from threats (player + trex).

// The herd roster mixes the four original animated herbivores with the new
// herbivore VARIANTS (wishlist item 4c) so a run shows a wider species spread.
// Variants reuse a base rig but get their own diet/behaviour from DINO_VARIANTS.
const HERB_KINDS = [
  "triceratops", "stegosaurus", "apatosaurus", "parasaur",
  "spinosaurus", "ankylosaurus", "pachycephalosaurus", "brachiosaurus", "compsognathus",
];

// Per-kind target model height (world units). Variants carry their own `height`
// in DINO_VARIANTS; the four originals are listed here. Falls back to 3.
const HERB_HEIGHTS = { triceratops: 2.6, stegosaurus: 2.8, apatosaurus: 5.5, parasaur: 3.2 };
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
  if (state.prey && !state.prey.dead) {
    const pp = state.prey.dino.root.position;
    if (Math.hypot(pp.x - pos.x, pp.z - pos.z) <= loseRange) return state.prey;
  }
  // Acquire: nearest live herbivore in prey-sight that is clearly nearer than the raptor.
  let best = null, bd = Infinity;
  for (const h of herd) {
    if (h.dead) continue;
    const hp = h.dino.root.position;
    const d = Math.hypot(hp.x - pos.x, hp.z - pos.z);
    if (d < TREX.preySightRange && d < distP - TREX.preyCloserBy && d < bd) { bd = d; best = h; }
  }
  return best;
}

function rand(a, b) { return a + Math.random() * (b - a); }
function randPointInArena() {
  const r = Math.sqrt(Math.random()) * (ARENA.radius - 6);
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export async function createTrex(scene, shadow, groundFn) {
  const dino = await loadDino(scene, "trex", 4.2, shadow);
  const start = randPointInArena();
  dino.root.position.set(start.x, groundFn(start.x, start.z), start.z);

  const state = {
    dino, kind: "trex",
    facing: 0,
    health: TREX.maxHealth,
    target: randPointInArena(),
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
    // It ignores the player for a beat after losing them (aggroCd) so a clean
    // getaway sticks — but it'll still peel off to hunt the herd meanwhile.
    const seesPlayer = !player.dead && distP < sightRange && state.aggroCd <= 0;
    if (state.prey || seesPlayer) state.mode = "chase";
    else if (state.mode === "chase" && distP > loseRange) {
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
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 4) state.target = randPointInArena();
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    const dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, TREX.turnLerp);
    dino.setYaw(state.facing);

    if (speed > 0) {
      pos.x += dir.dx * speed * dt;
      pos.z += dir.dz * speed * dt;
      dino.play("Run", { speed: state.mode === "chase" ? (enraged ? 1.5 : 1.2) : 0.85 });
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
    if (state.health <= 0) { state.dead = true; dino.play("Death", { loop: false }); }
  };

  // Soft restart: revive at a fresh spot, full health, back on patrol.
  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = TREX.maxHealth;
    state.mode = "patrol";
    state.target = randPointInArena();
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
  const center = randPointInArena();
  const members = [];
  for (let i = 0; i < n; i++) {
    const m = await createRaptor(scene, shadow, groundFn, pack, i, n, center);
    members.push(m);
  }
  pack.members = members;
  return members;
}

async function createRaptor(scene, shadow, groundFn, pack, slot, packCount, center) {
  const dino = await loadDino(scene, "raptor", RAPTOR.modelHeight, shadow);
  const jitter = () => (Math.random() - 0.5) * 10;
  dino.root.position.set(
    Math.max(-ARENA.radius + 4, Math.min(ARENA.radius - 4, center.x + jitter())),
    0,
    Math.max(-ARENA.radius + 4, Math.min(ARENA.radius - 4, center.z + jitter())),
  );
  dino.root.position.y = groundFn(dino.root.position.x, dino.root.position.z);

  const state = {
    dino, kind: "raptor",
    facing: rand(0, 6),
    health: RAPTOR.maxHealth,
    maxHealth: RAPTOR.maxHealth,
    target: randPointInArena(),
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
    const seesPlayer = !player.dead && distP < sightRange && state.aggroCd <= 0;
    if (seesPlayer) state.mode = "chase";
    else if (state.mode === "chase" && distP > loseRange) {
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
      // FLANKING: each member holds a FIXED, evenly-spaced slot on a ring around
      // the player (slot i of packCount → angle i·2π/packCount, plus a small
      // stable per-member jitter so the ring isn't robotic). It steers to that
      // ring point to encircle, then drops the slot and darts straight in once
      // inside lungeRange. Fixed slots keep the swarm fanned out instead of two
      // members converging on the same bearing.
      if (distP > RAPTOR.lungeRange) {
        const slotAngle = (state.slot / state.packCount) * Math.PI * 2 + state.slotWobble;
        goal = {
          x: pp.x + Math.sin(slotAngle) * RAPTOR.surroundRadius,
          z: pp.z + Math.cos(slotAngle) * RAPTOR.surroundRadius,
        };
      } else {
        goal = { x: pp.x, z: pp.z };   // committed — straight in for the nip
      }
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
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 4) state.target = randPointInArena();
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    const dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, RAPTOR.turnLerp);
    dino.setYaw(state.facing);

    if (speed > 0) {
      pos.x += dir.dx * speed * dt;
      pos.z += dir.dz * speed * dt;
      dino.play("Run", { speed: state.mode === "chase" ? 1.5 : 1.0 });
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
    if (state.health <= 0) { state.dead = true; dino.play("Death", { loop: false }); }
  };

  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = state.maxHealth;
    state.mode = "patrol";
    state.target = randPointInArena();
    state.attackTimer = 0;
    state.speedBonus = 0;
    state.lastStrikeId = -1;
    state.dead = false;
    pack.calledOut = false;
    dino.play("Idle");
  };

  return state;
}

export async function createHerd(scene, shadow, groundFn) {
  const herd = [];
  for (let i = 0; i < HERBIVORE.count; i++) {
    const kind = HERB_KINDS[i % HERB_KINDS.length];
    const h = await createHerbivore(scene, shadow, groundFn, kind);
    herd.push(h);
  }
  return herd;
}

async function createHerbivore(scene, shadow, groundFn, kind) {
  const variant = DINO_VARIANTS[kind] || null;
  const dino = await loadDino(scene, kind, herbHeight(kind), shadow);
  // Per-variant stat mods: tankier armour (healthMul), quicker little darters
  // (speedMul). Defaults to the HERBIVORE baseline for the four originals.
  const maxHealth = Math.round(HERBIVORE.maxHealth * ((variant && variant.healthMul) || 1));
  const speedMul = (variant && variant.speedMul) || 1;
  const start = randPointInArena();
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
    facing: rand(0, 6),
    target: randPointInArena(),
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
      pos.x += (cdx / cd) * TRICERATOPS.chargeSpeed * dt;
      pos.z += (cdz / cd) * TRICERATOPS.chargeSpeed * dt;
      pos.y = groundFn(pos.x, pos.z);
      clampArena(pos);
      if (!state.chargeHitDone && cd < TRICERATOPS.chargeHitRange && !player.dead) {
        state.chargeHitDone = true;
        player.takeDamage(TRICERATOPS.chargeDamage);
      }
      dino.play("Run", { speed: 1.5 });
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
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 3) state.target = randPointInArena();
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    const dir = avoidObstacles(pos, dx0 / dist, dz0 / dist, state.steer);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, turnLerp);
    dino.setYaw(state.facing);

    pos.x += dir.dx * speed * dt;
    pos.z += dir.dz * speed * dt;
    pos.y = groundFn(pos.x, pos.z);
    clampArena(pos);

    dino.play(state.fleeing ? "Run" : "Walk", { speed: state.fleeing ? 1.3 : walkClipSpeed });
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    dino.flash(JUICE.hitFlashSeconds, new window.BABYLON.Color3(0.9, 0.3, 0.2));
    if (state.health <= 0) {
      state.dead = true;
      dino.play("Death", { loop: false });
      if (state.onDown) state.onDown(dino.root.position.clone());
    }
  };

  // Soft restart: revive, full health, fresh wander target.
  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = state.maxHealth;
    state.dead = false;
    state.fleeing = false;
    state.charging = 0;
    state.chargeCd = 0;
    state.chargeHitDone = false;
    state.lastStrikeId = -1;
    state.recover = 0;
    state.target = randPointInArena();
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
