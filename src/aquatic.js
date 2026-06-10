// AQUATIC PREDATOR (wishlist item 5). A plesiosaur-like lake lurker: it patrols
// SUBMERGED inside the pond (only a faint wake on the surface betrays it), then
// SURFACES and LUNGES at a player who lingers at the water's edge or swims in
// the deep — before submerging again. The water's edge is no longer a free
// hazard to skirt; something is hunting from it.
//
// Built procedurally (no glb) like the pterosaur flyer: a humped torso, a long
// tapering neck of segments that rears up on a surface, a snouted head with
// amber eyes, and two paddle flippers. Animated by node transforms each frame
// (neck arc, flipper paddle, surface bob) — cheap, no skeleton.
//
// It exposes a small predator-like surface ({ root, update, reset, takeDamage,
// health, maxHealth, dead, mode, kind, position }) so game.js can wire it with
// minimal hooks: call update each frame, let the player strike it, draw it on
// the radar. It is NOT pushed into the shared `predators` list (that list runs
// T-Rex/herd-prey/feeding logic the lake creature doesn't use).

import { AQUATIC, WATER } from "./config.js";

// State machine phases. Telegraphed: a surface (rear up, dodge window) precedes
// the committed lunge, so a sharp player can back off the bank in time.
const PHASE = {
  SUBMERGED: "submerged",   // lurking + slow patrol under the surface
  SURFACING: "surfacing",   // breached, neck rearing — the telegraph
  LUNGE: "lunge",           // committed strike surge toward the player
  SUBMERGING: "submerging", // sinking back down after a strike (cooldown)
};

export function createAquatic(scene, shadow, world) {
  const B = window.BABYLON;
  const surfaceY = world.waterSurfaceY;

  // ---- Build the creature ------------------------------------------------
  const root = new B.TransformNode("aquatic_root", scene);

  const skin = new B.StandardMaterial("aquaticSkin", scene);
  skin.diffuseColor = new B.Color3(AQUATIC.bodyColor.r, AQUATIC.bodyColor.g, AQUATIC.bodyColor.b);
  skin.specularColor = new B.Color3(0.4, 0.5, 0.5);   // wet sheen
  skin.specularPower = 48;
  const belly = new B.StandardMaterial("aquaticBelly", scene);
  belly.diffuseColor = new B.Color3(AQUATIC.bellyColor.r, AQUATIC.bellyColor.g, AQUATIC.bellyColor.b);
  belly.specularColor = B.Color3.Black();
  const eyeMat = new B.StandardMaterial("aquaticEye", scene);
  eyeMat.diffuseColor = new B.Color3(AQUATIC.eyeColor.r, AQUATIC.eyeColor.g, AQUATIC.eyeColor.b);
  eyeMat.emissiveColor = new B.Color3(AQUATIC.eyeColor.r * 0.6, AQUATIC.eyeColor.g * 0.5, 0.04);
  eyeMat.specularColor = B.Color3.Black();

  // Humped torso spindle lying along +Z (forward).
  const body = B.MeshBuilder.CreateCylinder("aquaticBody", {
    height: AQUATIC.bodyLength, diameterTop: AQUATIC.bodyRadius * 1.1,
    diameter: AQUATIC.bodyRadius * 2, diameterBottom: AQUATIC.bodyRadius * 0.8, tessellation: 10,
  }, scene);
  body.rotation.x = Math.PI / 2;
  body.material = skin;
  body.parent = root;
  body.isPickable = false;

  // Paler belly underside (a squashed half-sphere tucked beneath the torso).
  const bellyMesh = B.MeshBuilder.CreateSphere("aquaticBelly", { diameter: AQUATIC.bodyRadius * 1.9, segments: 8 }, scene);
  bellyMesh.scaling.set(1, 0.45, AQUATIC.bodyLength / (AQUATIC.bodyRadius * 1.9));
  bellyMesh.position.y = -AQUATIC.bodyRadius * 0.45;
  bellyMesh.material = belly;
  bellyMesh.parent = root;
  bellyMesh.isPickable = false;

  // ---- Neck: a chain of tapering segments pivoting at the shoulders so it
  // arcs up out of the water on a surface and lashes forward on a lunge. ----
  const neckPivot = new B.TransformNode("aquaticNeckPivot", scene);
  neckPivot.parent = root;
  neckPivot.position.set(0, AQUATIC.bodyRadius * 0.4, AQUATIC.bodyLength / 2);
  const segLen = AQUATIC.neckLength / AQUATIC.neckSegments;
  const segPivots = [];
  let parent = neckPivot;
  for (let i = 0; i < AQUATIC.neckSegments; i++) {
    const piv = new B.TransformNode("aquaticNeckSeg" + i, scene);
    piv.parent = parent;
    if (i > 0) piv.position.z = segLen;   // each segment sits at the tip of the previous
    const t = i / AQUATIC.neckSegments;
    const dia = AQUATIC.bodyRadius * (0.9 - 0.45 * t);  // taper toward the head
    const seg = B.MeshBuilder.CreateCylinder("aquaticNeckMesh" + i,
      { height: segLen * 1.05, diameter: dia, tessellation: 8 }, scene);
    seg.rotation.x = Math.PI / 2;          // lie along the segment's +Z
    seg.position.z = segLen / 2;
    seg.material = skin;
    seg.parent = piv;
    seg.isPickable = false;
    segPivots.push(piv);
    parent = piv;
  }

  // ---- Head at the neck tip: a snouted block + two amber eyes. ----
  const headPivot = segPivots[segPivots.length - 1];
  const head = B.MeshBuilder.CreateCylinder("aquaticHead",
    { height: AQUATIC.headLength, diameterTop: AQUATIC.bodyRadius * 0.18, diameter: AQUATIC.bodyRadius * 0.5, tessellation: 8 }, scene);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0, segLen + AQUATIC.headLength / 2);
  head.material = skin;
  head.parent = headPivot;
  head.isPickable = false;
  const eyeR = AQUATIC.bodyRadius * 0.1;
  for (const sx of [-1, 1]) {
    const eye = B.MeshBuilder.CreateSphere("aquaticEyeMesh", { diameter: eyeR * 2, segments: 6 }, scene);
    eye.position.set(sx * AQUATIC.bodyRadius * 0.18, AQUATIC.bodyRadius * 0.12, segLen + AQUATIC.headLength * 0.25);
    eye.material = eyeMat;
    eye.parent = headPivot;
    eye.isPickable = false;
  }

  // ---- Two paddle flippers either side of the torso (they oar back/forth). ----
  function buildFlipper(side) {
    const piv = new B.TransformNode("aquaticFlipperPivot", scene);
    piv.parent = root;
    piv.position.set(side * AQUATIC.bodyRadius * 0.9, -AQUATIC.bodyRadius * 0.2, 0);
    const fin = B.MeshBuilder.CreateBox("aquaticFlipper",
      { width: AQUATIC.flipperLength, height: AQUATIC.bodyRadius * 0.18, depth: AQUATIC.bodyRadius * 0.9 }, scene);
    fin.position.x = side * AQUATIC.flipperLength / 2;
    fin.material = skin;
    fin.parent = piv;
    fin.isPickable = false;
    return piv;
  }
  const flipperL = buildFlipper(-1);
  const flipperR = buildFlipper(1);

  // Shadow casting (the body + neck) so it reads grounded when surfaced.
  if (shadow) {
    shadow.addShadowCaster(body);
    shadow.addShadowCaster(bellyMesh);
  }

  // Collect materials whose emissive we flash red on a hit (skin + belly).
  const flashTargets = [skin, belly].map((m) => ({ mat: m, base: m.emissiveColor.clone() }));

  // ---- Place inside the lake at a submerged start --------------------------
  const lakeCenter = { x: WATER.centerX, z: WATER.centerZ };
  function randPointInLake(frac) {
    const r = Math.sqrt(Math.random()) * WATER.radius * (frac ?? 0.7);
    const a = Math.random() * Math.PI * 2;
    return { x: lakeCenter.x + Math.cos(a) * r, z: lakeCenter.z + Math.sin(a) * r };
  }
  const submergedY = () => surfaceY - AQUATIC.submergedDepth;

  const state = {
    kind: "aquatic",
    root,
    health: AQUATIC.maxHealth,
    maxHealth: AQUATIC.maxHealth,
    dead: false,
    mode: PHASE.SUBMERGED,        // exposed for the radar (surfaced = a visible threat)
    facing: Math.random() * Math.PI * 2,
    target: randPointInLake(0.6),
    phaseTimer: 0,               // counts the current phase's duration
    cooldown: 0,                 // submerge cooldown before it can ambush again
    attackTimer: 0,              // bite cadence while in reach
    bob: Math.random() * Math.PI * 2,
    flashT: 0,
    lastStrikeId: -1,            // one player strike lands once per swing
    position: root.position,     // alias so callers can read it like a dino
    onSurface: null,             // (pos) fired when it breaches (game: SFX + spray)
    onBite: null,                // fired when a bite lands on the player
    onSubmerge: null,            // (pos) fired when it sinks back down
  };

  // Position the body at a submerged start (the basin floor area, sunk).
  root.position.set(state.target.x, submergedY(), state.target.z);

  // Distance from a point to the NEAREST water edge: negative inside the lake
  // (how deep past the rim), positive outside (how far from the bank). Lets the
  // ambush trigger on a player loitering at the shoreline, not just in the water.
  function distPastShore(x, z) {
    return Math.hypot(x - lakeCenter.x, z - lakeCenter.z) - WATER.radius;
  }

  // Drive the neck into an arc: `rear` 0 = neck laid flat forward (submerged),
  // 1 = neck reared up and curving (surfaced/striking). `lash` adds a forward
  // whip on the lunge. Each segment takes a share so the neck reads as a curve.
  function poseNeck(rear, lash) {
    neckPivot.rotation.x = -rear * 1.1;          // base of the neck lifts
    for (let i = 0; i < segPivots.length; i++) {
      const t = i / segPivots.length;
      // upper segments curl forward (head looks down toward the prey on a strike)
      segPivots[i].rotation.x = rear * (0.28 - t * 0.5) - lash * 0.25;
    }
  }

  // Paddle the flippers (continuous oar) at a rate; bigger sweep when surging.
  function paddle(dt, rate, amp) {
    state.bob += dt * rate;
    const a = Math.sin(state.bob) * amp;
    flipperL.rotation.x = a;
    flipperR.rotation.x = -a;
  }

  // Move the body toward a goal on the water plane, clamped inside the lake, and
  // turn to face travel. Returns the planar distance covered toward the goal.
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
      // keep it inside the lake (a touch in from the rim so the body stays wet)
      const rr = Math.hypot(pos.x - lakeCenter.x, pos.z - lakeCenter.z);
      const maxR = WATER.radius - AQUATIC.bodyRadius;
      if (rr > maxR) {
        const k = maxR / rr;
        pos.x = lakeCenter.x + (pos.x - lakeCenter.x) * k;
        pos.z = lakeCenter.z + (pos.z - lakeCenter.z) * k;
      }
    }
    return d;
  }

  state.update = function (dt, player) {
    // hit-flash decay
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
    // How close the player is to the lake (negative = in the water).
    const shoreDist = distPastShore(pp.x, pp.z);
    const playerAtWater = !player.dead && shoreDist < AQUATIC.shoreLureRange;

    if (state.mode === PHASE.SUBMERGED) {
      state.mode = PHASE.SUBMERGED;
      // Lurk + slow patrol. If the player is at the water and the ambush is off
      // cooldown, slide UNDER them then breach. Otherwise drift to a roam point.
      let goalX, goalZ;
      if (playerAtWater && state.cooldown <= 0) {
        // stalk toward the point in the lake nearest the player (or the player
        // if they're in the water) so the surface erupts right beside them.
        const toP = Math.hypot(pp.x - lakeCenter.x, pp.z - lakeCenter.z);
        const k = toP > 0 ? Math.min(1, (WATER.radius - AQUATIC.bodyRadius) / toP) : 0;
        goalX = lakeCenter.x + (pp.x - lakeCenter.x) * k;
        goalZ = lakeCenter.z + (pp.z - lakeCenter.z) * k;
        const stalkDist = Math.hypot(goalX - pos.x, goalZ - pos.z);
        moveToward(goalX, goalZ, AQUATIC.patrolSpeed * 1.8, dt, AQUATIC.turnLerp * 2);
        // once lined up beneath/at the strike point, breach
        if (stalkDist < AQUATIC.bodyLength) {
          state.mode = PHASE.SURFACING;
          state.phaseTimer = AQUATIC.surfaceSeconds;
          if (state.onSurface) state.onSurface(pos.clone());
        }
      } else {
        goalX = state.target.x; goalZ = state.target.z;
        if (moveToward(goalX, goalZ, AQUATIC.patrolSpeed, dt, AQUATIC.turnLerp) < AQUATIC.bodyLength) {
          state.target = randPointInLake(0.6);
        }
      }
      // ease the body down to lurking depth; neck laid flat; gentle paddle + bob
      pos.y += (submergedY() - pos.y) * Math.min(1, 4 * dt) + Math.sin(state.bob * 0.5) * 0.004;
      poseNeck(0, 0);
      paddle(dt, 2.2, 0.25);
      return;
    }

    if (state.mode === PHASE.SURFACING) {
      // Telegraph: rise + rear the neck (dodge window). Track the player's bearing
      // with the head so the coming lunge points at them.
      state.phaseTimer -= dt;
      const rear = 1 - Math.max(0, state.phaseTimer) / AQUATIC.surfaceSeconds; // 0..1 over the rise
      const targetY = surfaceY + AQUATIC.surfacedRise * 0.35;
      pos.y += (targetY - pos.y) * Math.min(1, 5 * dt);
      // face the player while rearing
      const dx = pp.x - pos.x, dz = pp.z - pos.z;
      state.facing = lerpAngle(state.facing, Math.atan2(dx, dz), AQUATIC.turnLerp * 3);
      root.rotation.y = state.facing;
      poseNeck(rear, 0);
      paddle(dt, 3.5, 0.4);
      if (state.phaseTimer <= 0) {
        state.mode = PHASE.LUNGE;
        state.phaseTimer = AQUATIC.lungeSeconds;
      }
      return;
    }

    if (state.mode === PHASE.LUNGE) {
      // Committed strike: surge toward the player (allowed to lunge OUT of the
      // water at the bank up to reachBeyondShore), neck whipping forward to bite.
      state.phaseTimer -= dt;
      // clamp the lunge goal to a touch past the shoreline toward the player so
      // it can snap a shore-loiterer but doesn't beach itself far inland.
      let goalX = pp.x, goalZ = pp.z;
      const sd = distPastShore(pp.x, pp.z);
      if (sd > AQUATIC.reachBeyondShore) {
        const fromC = Math.hypot(pp.x - lakeCenter.x, pp.z - lakeCenter.z) || 1;
        const k = (WATER.radius + AQUATIC.reachBeyondShore) / fromC;
        goalX = lakeCenter.x + (pp.x - lakeCenter.x) * k;
        goalZ = lakeCenter.z + (pp.z - lakeCenter.z) * k;
      }
      // surge along the surface (don't clamp hard inside — allow the small
      // beyond-shore reach), turning fast toward the strike point.
      const dx = goalX - pos.x, dz = goalZ - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      state.facing = lerpAngle(state.facing, Math.atan2(dx / d, dz / d), AQUATIC.turnLerp * 4);
      root.rotation.y = state.facing;
      pos.x += (dx / d) * AQUATIC.lungeSpeed * dt;
      pos.z += (dz / d) * AQUATIC.lungeSpeed * dt;
      const surgeBeyond = Math.min(d, AQUATIC.reachBeyondShore + WATER.radius);
      pos.y += (surfaceY + AQUATIC.surfacedRise * 0.5 - pos.y) * Math.min(1, 6 * dt);
      const lash = Math.sin((1 - Math.max(0, state.phaseTimer) / AQUATIC.lungeSeconds) * Math.PI); // whip mid-lunge
      poseNeck(0.7, lash);
      paddle(dt, 7, 0.6);
      // bite contact (head reach added on top of the body distance)
      const headReach = AQUATIC.attackRange;
      if (distP < headReach && state.attackTimer <= 0 && !player.dead) {
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
      // Sink back under, retract the neck, drift back toward the lake interior.
      state.phaseTimer -= dt;
      const toC = moveToward(lakeCenter.x, lakeCenter.z, AQUATIC.patrolSpeed, dt, AQUATIC.turnLerp);
      pos.y += (submergedY() - pos.y) * Math.min(1, 3 * dt);
      poseNeck(Math.max(0, state.phaseTimer / 0.6) * 0.5, 0);
      paddle(dt, 3, 0.3);
      if (state.phaseTimer <= 0 || toC < AQUATIC.bodyLength) {
        state.mode = PHASE.SUBMERGED;
        state.target = randPointInLake(0.6);
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
      // sink the carcass under the surface and lay the neck flat.
      root.position.y = submergedY() - 0.4;
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
    state.target = randPointInLake(0.6);
    state.facing = Math.random() * Math.PI * 2;
    root.position.set(state.target.x, submergedY(), state.target.z);
    poseNeck(0, 0);
    for (const t of flashTargets) t.mat.emissiveColor.copyFrom(t.base);
  };

  state.dispose = function () {
    root.dispose(false, true);
  };

  return state;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
