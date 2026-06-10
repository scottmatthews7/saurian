import { TREX, HERBIVORE, TRICERATOPS, ARENA, JUICE, WATER, AI_AVOID, DUSK, EGGS } from "./config.js";
import { loadDino } from "./dino.js";

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

// Cursed-egg lure: while the player carries a cursed egg every T-Rex homes in
// regardless of sight range and chases a little faster. Pushed each frame from
// the game (true while eggs.carryingCursed). A roar-stagger still overrides it.
let LURE_ACTIVE = false;
export function setLure(active) { LURE_ACTIVE = active; }

// Steer a move (unit dir dx,dz) away from nearby obstacle footprints. Adds an
// outward push from each footprint within its clearance band, then renormalises.
// A steering nudge, not hard collision — keeps the cheap direct-move AI cheap.
function avoidObstacles(pos, dx, dz) {
  let mx = dx, mz = dz;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const ox = pos.x - o.x, oz = pos.z - o.z;
    const d = Math.hypot(ox, oz);
    const margin = o.r + AI_AVOID.clearance;
    if (d >= margin || d < 0.001) continue;
    const w = (margin - d) / margin;        // 0 at margin .. 1 at centre
    mx += (ox / d) * w * AI_AVOID.strength;
    mz += (oz / d) * w * AI_AVOID.strength;
  }
  const m = Math.hypot(mx, mz) || 1;
  return { dx: mx / m, dz: mz / m };
}

// AI agents: one apex T-Rex predator with a patrol/chase/attack FSM, and a
// herd of herbivores that wander and flee from threats (player + trex).

const HERB_KINDS = ["triceratops", "stegosaurus", "apatosaurus", "parasaur"];

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
    lastBiteId: -1,    // last player swing id that hit this target (one hit per swing)
    staggered: 0,      // sec remaining frozen/dazed by the player's roar
    prey: null,        // herbivore currently hunted instead of the player (or null)
    preyAttackTimer: 0,// cooldown between bites on the hunted herbivore
    onBite: null,    // (set by game) called when the trex lands a bite on the player
    onRoar: null,    // called when entering chase
    onPreyBite: null,// (set by game) called when the trex bites a herbivore
  };

  state.update = function (dt, player, herd) {
    dino.updateFlash(dt);
    if (state.dead) return;
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    state.preyAttackTimer = Math.max(0, state.preyAttackTimer - dt);
    const B = window.BABYLON;
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);

    // Staggered by the player's roar: dazed in place (pursuit broken) until the
    // timer lapses, then it resumes hunting. Keeps the ground animation idle.
    if (state.staggered > 0) {
      state.staggered = Math.max(0, state.staggered - dt);
      pos.y = groundFn(pos.x, pos.z);
      dino.play("Idle");
      return;
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

    // The T-Rex is a true apex predator: when it is NOT locked onto the raptor
    // it hunts the herd. The raptor stays the priority — the cursed lure or the
    // raptor being close (playerPriorityRange) forces a player chase; otherwise
    // a clearly-nearer herbivore (preyCloserBy nearer than the player, within
    // preySightRange) pulls aggro. A hunted herbivore is a living decoy the
    // player can exploit (or whose meat they can steal).
    const lockedToPlayer = LURE_ACTIVE || distP < TREX.playerPriorityRange;
    state.prey = pickPrey(state, pos, distP, herd, sightRange, loseRange, lockedToPlayer);

    // FSM. The cursed-egg lure forces chase regardless of distance — the egg
    // rings the dinner bell, so sight/lose-interest ranges no longer apply.
    const wasChasing = state.mode === "chase";
    const seesPlayer = !player.dead && (LURE_ACTIVE || distP < sightRange);
    if (state.prey || seesPlayer) state.mode = "chase";
    else if (state.mode === "chase" && distP > loseRange) state.mode = "patrol";
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
        }
      }
    } else if (state.mode === "chase") {
      goal = { x: pp.x, z: pp.z };
      speed = TREX.chaseSpeed + state.speedBonus + duskSpeed
        + (enraged ? TREX.enrageSpeedBonus : 0)
        + (LURE_ACTIVE ? EGGS.cursedLureSpeed : 0);
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
    const dir = avoidObstacles(pos, dx0 / dist, dz0 / dist);
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

  // React to the player's intimidating roar: stagger (pursuit broken) and drop
  // back to patrol so the chase resets. A dazed-blue flash reads the daze.
  state.roarReact = function (seconds) {
    if (state.dead) return;
    state.staggered = Math.max(state.staggered, seconds);
    state.mode = "patrol";
    state.target = randPointInArena();
    state.prey = null;
    dino.flash(0.3, new window.BABYLON.Color3(0.3, 0.4, 0.9));
  };

  // Soft restart: revive at a fresh spot, full health, back on patrol.
  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = TREX.maxHealth;
    state.mode = "patrol";
    state.target = randPointInArena();
    state.attackTimer = 0;
    state.speedBonus = 0;
    state.enraged = false;
    state.enrageGlow = 0;
    state.lastBiteId = -1;
    state.staggered = 0;
    state.prey = null;
    state.preyAttackTimer = 0;
    state.dead = false;
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
  const heights = { triceratops: 2.6, stegosaurus: 2.8, apatosaurus: 5.5, parasaur: 3.2 };
  const dino = await loadDino(scene, kind, heights[kind] || 3, shadow);
  const start = randPointInArena();
  dino.root.position.set(start.x, groundFn(start.x, start.z), start.z);

  const state = {
    dino, kind,
    facing: rand(0, 6),
    target: randPointInArena(),
    fleeing: false,
    charging: 0,        // remaining charge-commit time (triceratops only)
    chargeCd: 0,
    chargeHitDone: false,
    dead: false,
    health: HERBIVORE.maxHealth,
    lastBiteId: -1,     // last player swing id that hit this target (one hit per swing)
    panic: 0,           // sec of forced terror-flee directly away from the player (the roar)
    onCharge: null,     // (set by game) called when a charge starts
    onDown: null,       // (position) called when killed by the player
  };

  const canCharge = kind === "triceratops";

  state.update = function (dt, player, trex) {
    dino.updateFlash(dt);
    if (state.dead) return;
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    state.chargeCd = Math.max(0, state.chargeCd - dt);
    state.panic = Math.max(0, state.panic - dt);

    // Roar panic: bolt directly away from the player at flee speed, overriding
    // wander/charge, until the panic timer lapses.
    if (state.panic > 0) {
      const adx = pos.x - pp.x, adz = pos.z - pp.z;
      const ad = Math.hypot(adx, adz) || 1;
      const dir = avoidObstacles(pos, adx / ad, adz / ad);
      state.facing = lerpAngle(state.facing, Math.atan2(dir.dx, dir.dz), 0.25);
      dino.setYaw(state.facing);
      pos.x += dir.dx * HERBIVORE.fleeSpeed * dt;
      pos.z += dir.dz * HERBIVORE.fleeSpeed * dt;
      pos.y = groundFn(pos.x, pos.z);
      clampArena(pos);
      state.fleeing = true;
      dino.play("Run", { speed: 1.4 });
      return;
    }

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

    // --- charge handling (triceratops) ---
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
      speed = HERBIVORE.fleeSpeed;
    } else {
      goal = state.target;
      speed = HERBIVORE.wanderSpeed;
      if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 3) state.target = randPointInArena();
    }

    const dx0 = goal.x - pos.x, dz0 = goal.z - pos.z;
    const dist = Math.hypot(dx0, dz0) || 1;
    const dir = avoidObstacles(pos, dx0 / dist, dz0 / dist);
    const targetYaw = Math.atan2(dir.dx, dir.dz);
    state.facing = lerpAngle(state.facing, targetYaw, HERBIVORE.turnLerp);
    dino.setYaw(state.facing);

    pos.x += dir.dx * speed * dt;
    pos.z += dir.dz * speed * dt;
    pos.y = groundFn(pos.x, pos.z);
    clampArena(pos);

    dino.play(state.fleeing ? "Run" : "Walk", { speed: state.fleeing ? 1.3 : 0.8 });
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

  // React to the player's roar: a few seconds of terror-flee straight away.
  state.roarReact = function (seconds) {
    if (state.dead) return;
    state.panic = Math.max(state.panic, seconds);
    state.charging = 0;
    dino.flash(0.25, new window.BABYLON.Color3(0.9, 0.9, 0.3));
  };

  // Soft restart: revive, full health, fresh wander target.
  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = HERBIVORE.maxHealth;
    state.dead = false;
    state.fleeing = false;
    state.charging = 0;
    state.chargeCd = 0;
    state.chargeHitDone = false;
    state.lastBiteId = -1;
    state.panic = 0;
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
