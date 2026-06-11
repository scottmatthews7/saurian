// OCEAN APEX CREATURE — a procedural elasmosaurid plesiosaur (the long-necked
// marine reptile) that lurks in the EASTERN OCEAN. It patrols SUBMERGED in open
// water (only a wake betrays it), then SURFACES and rears its long neck (the
// telegraph) and LUNGES at a player who lingers at the coast or swims in the
// sea — before submerging again. The water's edge is no longer a free hazard to
// skirt; something is hunting from it.
//
// The mesh is the procmesh plesiosaur (src/procmesh/plesiosaur.js): a swept-loft
// build with a small head, very long slender neck (a chain of pivoted segments),
// broad rounded turtle trunk, four wing-like paddle flippers, and a short tail.
// No skeleton — the neck-segment + flipper PIVOTS are animated by node
// transforms each frame (neck arc/sway/rear, flippers paddle, body undulation).
//
// It exposes a small predator-like surface ({ root, update, reset, takeDamage,
// health, maxHealth, dead, mode, kind, position }) so game.js can wire it with
// minimal hooks: call update each frame, let the player strike it, draw it on
// the radar. It is NOT pushed into the shared `predators` list.

import { AQUATIC, OCEAN } from "./config.js";
import { buildPlesiosaur } from "./procmesh/plesiosaur.js";

// State machine phases. Telegraphed: a surface (rear up, dodge window) precedes
// the committed lunge, so a sharp player can back off the coast in time.
const PHASE = {
  SUBMERGED: "submerged",   // lurking + slow patrol under the surface
  SURFACING: "surfacing",   // breached, neck rearing — the telegraph
  LUNGE: "lunge",           // committed strike surge toward the player
  SUBMERGING: "submerging", // sinking back down after a strike (cooldown)
};

// The wavy mean coastline x at a given z (mirrors world.js oceanProfile/isInOcean).
// East of this (larger x) is open sea; west is the beach/land.
function coastX(z) {
  return OCEAN.shoreX + Math.sin(z * 0.045) * 6 + Math.cos(z * 0.017) * 4;
}

export function createAquatic(scene, shadow, world) {
  const B = window.BABYLON;
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const surfaceY = OCEAN.seaLevel; // the sea surface (the creature's waterline)

  // ---- Build the procedural plesiosaur, scaled up for open water ----------
  const rig = buildPlesiosaur(scene);
  const root = rig.root;
  root.scaling.setAll(AQUATIC.modelScale);
  const { neckPivot, segPivots, headPivot, flippers, materials } = rig;

  // Capture each neck segment's REST pitch so animation bends RELATIVE to the
  // resting swan arc (the procmesh seeds rotation.x per segment to follow the
  // arc). Same for the neck base. This keeps the silhouette correct at rest.
  const neckBaseRest = neckPivot.rotation.x;
  const segRest = segPivots.map((p) => p.rotation.x);

  if (shadow) for (const m of rig.shadowCasters) shadow.addShadowCaster(m);

  // The hide material whose emissive we flash red on a hit.
  const flashTargets = [materials.hide].map((m) => ({ mat: m, base: m.emissiveColor.clone() }));

  // ---- Open-water region (the eastern ocean) ------------------------------
  const center = { x: AQUATIC.patrolCenterX, z: AQUATIC.patrolCenterZ };
  function randPointInOcean(frac) {
    // a point in the open-water roam disc, kept seaward of the coast.
    const r = Math.sqrt(Math.random()) * AQUATIC.patrolRadius * (frac ?? 0.8);
    const a = Math.random() * Math.PI * 2;
    let x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const minX = coastX(z) + AQUATIC.bodyRadius; // stay off the beach
    if (x < minX) x = minX;
    return { x, z };
  }
  const submergedY = () => surfaceY - AQUATIC.submergedDepth;

  // Distance SEAWARD past the coastline: positive in the sea (how far out),
  // negative on the beach/land (how far inland). Lets the ambush trigger on a
  // player loitering at the coast, not just one in the water.
  function distSeaward(x, z) {
    return x - coastX(z);
  }

  const state = {
    kind: "aquatic",
    root,
    health: AQUATIC.maxHealth,
    maxHealth: AQUATIC.maxHealth,
    dead: false,
    mode: PHASE.SUBMERGED,        // exposed for the radar (surfaced = a visible threat)
    facing: Math.random() * Math.PI * 2,
    target: randPointInOcean(0.6),
    phaseTimer: 0,
    cooldown: 0,
    attackTimer: 0,
    bob: Math.random() * Math.PI * 2,
    swim: 0,                      // body-undulation phase
    flashT: 0,
    lastStrikeId: -1,
    position: root.position,
    onSurface: null,
    onBite: null,
    onSubmerge: null,
  };

  // Start submerged at a roam point in open water.
  root.position.set(state.target.x, submergedY(), state.target.z);

  // Drive the neck into an arc: `rear` 0 = neck at rest (laid along the swan arc,
  // head low/forward when submerged-flattened), 1 = neck reared up. `lash` adds
  // a forward whip on the lunge. Each segment takes a share so the neck reads as
  // a smooth curve; offsets are RELATIVE to the captured rest pose.
  function poseNeck(rear, lash) {
    // When submerged we flatten the arc forward (negative offset straightens it
    // along the water); when surfacing we add positive lift to rear it upright.
    neckPivot.rotation.x = neckBaseRest + rear * 0.5 - (1 - rear) * 0.35;
    for (let i = 0; i < segPivots.length; i++) {
      const t = i / segPivots.length;
      // surfacing curls the upper neck up; lunge whips the head down/forward
      const lift = rear * (0.18 + t * 0.10) - (1 - rear) * (0.10 - t * 0.04);
      segPivots[i].rotation.x = segRest[i] + lift - lash * (0.10 + t * 0.18);
    }
  }

  // Sway the neck side-to-side (yaw) for a living, searching look while patrolling.
  function swayNeck(amp) {
    for (let i = 0; i < segPivots.length; i++) {
      const t = i / segPivots.length;
      segPivots[i].rotation.y = Math.sin(state.swim * 0.8 + t * 1.6) * amp * (0.3 + t);
    }
  }

  // Paddle the flippers (continuous oar) at a rate; bigger sweep when surging.
  function paddle(dt, rate, amp) {
    state.bob += dt * rate;
    const a = Math.sin(state.bob) * amp;
    flippers.FR.rotation.x = a;
    flippers.FL.rotation.x = -a;
    flippers.HR.rotation.x = -a * 0.85;
    flippers.HL.rotation.x = a * 0.85;
  }

  // Gentle whole-body roll/undulation so the trunk reads as swimming, not sliding.
  function undulate(dt, amp) {
    state.swim += dt;
    root.rotation.z = Math.sin(state.swim * 1.1) * amp;
  }

  // Move the body toward a goal on the sea plane, kept seaward of the coast and
  // within the patrol disc's outer leash, turning to face travel. Returns the
  // planar distance to the goal.
  function moveToward(goalX, goalZ, speed, dt, turnLerp) {
    const pos = root.position;
    let dx = goalX - pos.x, dz = goalZ - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx / d, dz / d);
    state.facing = lerpAngle(state.facing, yaw, turnLerp);
    root.rotation.y = state.facing;
    if (speed > 0) {
      pos.x += (dx / d) * speed * dt;
      pos.z += (dz / d) * speed * dt;
      // keep it seaward of the coast (stay wet)
      const minX = coastX(pos.z) + AQUATIC.bodyRadius;
      if (pos.x < minX) pos.x = minX;
    }
    return d;
  }

  state.update = function (dt, player) {
    if (state.flashT > 0) {
      state.flashT = Math.max(0, state.flashT - dt);
      const k = state.flashT > 0 ? Math.min(1, state.flashT * 6) : 0;
      for (const t of flashTargets) t.mat.emissiveColor.set(t.base.r + 0.9 * k, t.base.g + 0.08 * k, t.base.b + 0.04 * k);
    }
    if (state.dead) return;

    state.cooldown = Math.max(0, state.cooldown - dt);
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    const pos = root.position;
    const pp = player.dino.root.position;
    const distP = Math.hypot(pp.x - pos.x, pp.z - pos.z);
    // How far seaward the player is (negative = on the beach/inland).
    const sea = distSeaward(pp.x, pp.z);
    const playerAtWater = !player.dead && sea > -AQUATIC.shoreLureRange;

    if (state.mode === PHASE.SUBMERGED) {
      // Lurk + slow patrol. If the player is at the coast/in the sea and the
      // ambush is off cooldown, slide toward them then breach. Else drift to a
      // roam point in open water.
      let goalX, goalZ;
      if (playerAtWater && state.cooldown <= 0) {
        // stalk toward a point just seaward of the player so the surface erupts
        // beside them (clamped seaward of the coast).
        goalZ = pp.z;
        goalX = Math.max(pp.x, coastX(pp.z) + AQUATIC.bodyRadius);
        const stalkDist = Math.hypot(goalX - pos.x, goalZ - pos.z);
        moveToward(goalX, goalZ, AQUATIC.patrolSpeed * 1.8, dt, AQUATIC.turnLerp * 2);
        if (stalkDist < AQUATIC.bodyLength) {
          state.mode = PHASE.SURFACING;
          state.phaseTimer = AQUATIC.surfaceSeconds;
          if (state.onSurface) state.onSurface(pos.clone());
        }
      } else {
        goalX = state.target.x; goalZ = state.target.z;
        if (moveToward(goalX, goalZ, AQUATIC.patrolSpeed, dt, AQUATIC.turnLerp) < AQUATIC.bodyLength) {
          state.target = randPointInOcean(0.8);
        }
      }
      // ease the body down to lurking depth; neck laid flat; gentle paddle + bob
      pos.y += (submergedY() - pos.y) * Math.min(1, 4 * dt) + Math.sin(state.bob * 0.5) * 0.01;
      poseNeck(0, 0);
      swayNeck(0.10);
      paddle(dt, 2.2, 0.25);
      undulate(dt, 0.04);
      return;
    }

    if (state.mode === PHASE.SURFACING) {
      // Telegraph: rise + rear the neck (dodge window). Track the player's bearing
      // with the head so the coming lunge points at them.
      state.phaseTimer -= dt;
      const rear = 1 - Math.max(0, state.phaseTimer) / AQUATIC.surfaceSeconds; // 0..1 over the rise
      const targetY = surfaceY + AQUATIC.surfacedRise;
      pos.y += (targetY - pos.y) * Math.min(1, 5 * dt);
      const dx = pp.x - pos.x, dz = pp.z - pos.z;
      state.facing = lerpAngle(state.facing, Math.atan2(dx, dz), AQUATIC.turnLerp * 3);
      root.rotation.y = state.facing;
      poseNeck(rear, 0);
      swayNeck(0.06 * (1 - rear));
      paddle(dt, 3.5, 0.4);
      undulate(dt, 0.03);
      if (state.phaseTimer <= 0) {
        state.mode = PHASE.LUNGE;
        state.phaseTimer = AQUATIC.lungeSeconds;
      }
      return;
    }

    if (state.mode === PHASE.LUNGE) {
      // Committed strike: surge toward the player (allowed to reach a little
      // inland of the coast up to reachBeyondShore), neck whipping forward to bite.
      state.phaseTimer -= dt;
      // clamp the lunge goal so the head can snap a coast-loiterer but the body
      // doesn't beach itself far up the sand.
      let goalX = pp.x, goalZ = pp.z;
      const minX = coastX(pp.z) - AQUATIC.reachBeyondShore;
      if (goalX < minX) goalX = minX;
      const dx = goalX - pos.x, dz = goalZ - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      state.facing = lerpAngle(state.facing, Math.atan2(dx / d, dz / d), AQUATIC.turnLerp * 4);
      root.rotation.y = state.facing;
      pos.x += (dx / d) * AQUATIC.lungeSpeed * dt;
      pos.z += (dz / d) * AQUATIC.lungeSpeed * dt;
      pos.y += (surfaceY + AQUATIC.surfacedRise * 0.8 - pos.y) * Math.min(1, 6 * dt);
      const lash = Math.sin((1 - Math.max(0, state.phaseTimer) / AQUATIC.lungeSeconds) * Math.PI); // whip mid-lunge
      poseNeck(0.7, lash);
      paddle(dt, 7, 0.6);
      undulate(dt, 0.05);
      // bite contact (the scaled head reach added on top of the body distance)
      if (distP < AQUATIC.attackRange && state.attackTimer <= 0 && !player.dead) {
        state.attackTimer = AQUATIC.attackCooldown;
        const before = player.health;
        const mult = player.swimming ? AQUATIC.swimVulnMultiplier : 1;
        player.takeDamage(AQUATIC.attackDamage * mult);
        if (player.health < before && state.onBite) state.onBite();
      }
      if (state.phaseTimer <= 0) {
        state.mode = PHASE.SUBMERGING;
        state.phaseTimer = 0.6;
        state.cooldown = AQUATIC.submergeSeconds;
        if (state.onSubmerge) state.onSubmerge(pos.clone());
      }
      return;
    }

    if (state.mode === PHASE.SUBMERGING) {
      // Sink back under, retract the neck, drift back toward open water.
      state.phaseTimer -= dt;
      const toC = moveToward(center.x, center.z, AQUATIC.patrolSpeed, dt, AQUATIC.turnLerp);
      pos.y += (submergedY() - pos.y) * Math.min(1, 3 * dt);
      poseNeck(Math.max(0, state.phaseTimer / 0.6) * 0.5, 0);
      swayNeck(0.08);
      paddle(dt, 3, 0.3);
      undulate(dt, 0.04);
      if (state.phaseTimer <= 0 || toC < AQUATIC.bodyLength) {
        state.mode = PHASE.SUBMERGED;
        state.target = randPointInOcean(0.8);
      }
      return;
    }
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    state.flashT = 0.25;
    if (state.health <= 0) {
      state.dead = true;
      root.position.y = submergedY() - 0.6;
      poseNeck(0, 0);
    }
  };

  state.reset = function () {
    state.health = state.maxHealth;
    state.dead = false;
    state.mode = PHASE.SUBMERGED;
    state.cooldown = 0;
    state.attackTimer = 0;
    state.phaseTimer = 0;
    state.lastStrikeId = -1;
    state.target = randPointInOcean(0.8);
    state.facing = Math.random() * Math.PI * 2;
    root.position.set(state.target.x, submergedY(), state.target.z);
    root.rotation.z = 0;
    poseNeck(0, 0);
    for (const t of flashTargets) t.mat.emissiveColor.copyFrom(t.base);
  };

  state.dispose = function () { rig.dispose(); };

  return state;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
