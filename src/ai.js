import { TREX, HERBIVORE, TRICERATOPS, ARENA, JUICE } from "./config.js";
import { loadDino } from "./dino.js";

// AI agents: one apex T-Rex predator with a patrol/chase/attack FSM, and a
// herd of herbivores that wander and flee from threats (player + trex).

const HERB_KINDS = ["triceratops", "stegosaurus", "apatosaurus", "parasaur"];

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
    onBite: null,    // (set by game) called when the trex lands a bite on the player
    onRoar: null,    // called when entering chase
  };

  state.update = function (dt, player) {
    dino.updateFlash(dt);
    if (state.dead) return;
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    const B = window.BABYLON;
    const pos = dino.root.position;
    const pp = player.dino.root.position;
    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);

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

    // FSM
    const wasChasing = state.mode === "chase";
    if (!player.dead && distP < TREX.sightRange) state.mode = "chase";
    else if (state.mode === "chase" && distP > TREX.loseInterestRange) state.mode = "patrol";
    if (!wasChasing && state.mode === "chase" && state.onRoar) state.onRoar();

    let goal, speed;
    if (state.mode === "chase") {
      goal = { x: pp.x, z: pp.z };
      speed = TREX.chaseSpeed + state.speedBonus + (enraged ? TREX.enrageSpeedBonus : 0);
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

    const dx = goal.x - pos.x, dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx / dist, dz / dist);
    state.facing = lerpAngle(state.facing, targetYaw, TREX.turnLerp);
    dino.setYaw(state.facing);

    if (speed > 0) {
      pos.x += (dx / dist) * speed * dt;
      pos.z += (dz / dist) * speed * dt;
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
    state.attackTimer = 0;
    state.speedBonus = 0;
    state.enraged = false;
    state.enrageGlow = 0;
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
    health: 60,
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

    const threats = [pp];
    if (trex && !trex.dead) threats.push(trex.dino.root.position);

    // nearest threat
    let nearest = null, nd = Infinity;
    for (const t of threats) {
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < nd) { nd = d; nearest = t; }
    }
    state.fleeing = nd < HERBIVORE.fleeRange;

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

    const dx = goal.x - pos.x, dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx / dist, dz / dist);
    state.facing = lerpAngle(state.facing, targetYaw, HERBIVORE.turnLerp);
    dino.setYaw(state.facing);

    pos.x += (dx / dist) * speed * dt;
    pos.z += (dz / dist) * speed * dt;
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

  // Soft restart: revive, full health, fresh wander target.
  state.reset = function () {
    const p = randPointInArena();
    dino.root.position.set(p.x, groundFn(p.x, p.z), p.z);
    state.health = 60;
    state.dead = false;
    state.fleeing = false;
    state.charging = 0;
    state.chargeCd = 0;
    state.chargeHitDone = false;
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
