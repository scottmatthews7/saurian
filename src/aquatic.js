// AQUATIC PREDATOR (wishlist item 5). A plesiosaur-like lake lurker: it patrols
// SUBMERGED inside the pond (only a faint wake on the surface betrays it), then
// SURFACES and LUNGES at a player who lingers at the water's edge or swims in
// the deep — before submerging again. The water's edge is no longer a free
// hazard to skirt; something is hunting from it.
//
// Build spec (fossil proportions): dino-arena-a-dinocritic/procgen/PRD-plesiosaur.md
// Reference: Albertonectes vanderveldei TMP 2007.011.0001 — L ≈ 12.1 m;
//   neck ~0.58 L (~7 m), tiny head ~0.03 L, flippers ~0.13 L each;
//   amber predator eyes + fang teeth at the waterline when surfaced.
//
// Visual (PRD §Visual appearance): slate-teal dorsal (#2a3a38–#3d524e), pale
// green-grey ventral; wet sheen when surfaced; ivory fangs; amber emissive eyes.
//
// Built procedurally (no glb) like the pterosaur flyer: a humped torso, a long
// tapering neck of segments that rears up on a surface, a snouted head with
// amber eyes, four paddle flippers, ivory fangs, and a short tail. Animated by node transforms each frame
// (neck arc, flipper paddle, surface bob) — cheap, no skeleton.
//
// It exposes a small predator-like surface ({ root, update, reset, takeDamage,
// health, maxHealth, dead, mode, kind, position }) so game.js can wire it with
// minimal hooks: call update each frame, let the player strike it, draw it on
// the radar. It is NOT pushed into the shared `predators` list (that list runs
// T-Rex/herd-prey/feeding logic the lake creature doesn't use).

import { AQUATIC, WATER } from "./config.js";
import { makeLoft } from "./loft-core.mjs";

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
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const surfaceY = world.waterSurfaceY;

  // ---- Build the creature ------------------------------------------------
  const root = new B.TransformNode("aquatic_root", scene);
  const loft = makeLoft(scene, B, { quality: "realtime" });

  // Countershaded wet hide (PBR) — slate-teal dorsal, pale green-grey ventral
  // baked as a gradient across the loft ring (seam at the belly), so a single
  // material gives open-water camouflage without a second belly mesh. Matches
  // the procgen plesiosaur (procgen/plesiosaur.js + PRD-plesiosaur.md).
  function makeCountershade() {
    const W = 256, H = 64;
    const d = AQUATIC.bodyColor, v = AQUATIC.bellyColor;
    const rgb = (c, k = 1) => `rgb(${(c.r * 255 * k) | 0},${(c.g * 255 * k) | 0},${(c.b * 255 * k) | 0})`;
    const tex = new B.DynamicTexture("aquaticHideTex", { width: W, height: H }, scene, false);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, W, 0); // u runs around the ring
    g.addColorStop(0.0, rgb(v));         // belly seam (pale)
    g.addColorStop(0.18, rgb(v, 0.85));
    g.addColorStop(0.36, rgb(d, 1.25));
    g.addColorStop(0.5, rgb(d));         // dorsal ridge (dark)
    g.addColorStop(0.64, rgb(d, 1.25));
    g.addColorStop(0.82, rgb(v, 0.85));
    g.addColorStop(1.0, rgb(v));         // belly seam (pale)
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    tex.update();
    return tex;
  }

  const hide = new B.PBRMaterial("aquaticHide", scene);
  hide.albedoTexture = makeCountershade();
  hide.albedoColor = new B.Color3(1, 1, 1);
  hide.metallic = 0;
  hide.roughness = 0.34;          // wet sheen
  hide.specularIntensity = 0.7;
  const eyeMat = new B.PBRMaterial("aquaticEye", scene);
  eyeMat.albedoColor = new B.Color3(AQUATIC.eyeColor.r, AQUATIC.eyeColor.g, AQUATIC.eyeColor.b);
  eyeMat.emissiveColor = new B.Color3(AQUATIC.eyeColor.r * 0.75, AQUATIC.eyeColor.g * 0.5, 0.05);
  eyeMat.metallic = 0;
  eyeMat.roughness = 0.18;
  const toothMat = new B.PBRMaterial("aquaticTooth", scene);
  toothMat.albedoColor = new B.Color3(AQUATIC.toothColor.r, AQUATIC.toothColor.g, AQUATIC.toothColor.b);
  toothMat.metallic = 0;
  toothMat.roughness = 0.4;

  const R = AQUATIC.bodyRadius;

  // Compact oval torpedo trunk with a subtle dorsal hump — ONE lofted spindle
  // (no separate belly mesh; countershading lives in the hide texture). +Z fwd.
  const body = loft("aquaticBody", [
    { p: V(0, 0, -0.62), w: R * 0.16, h: R * 0.16 },
    { p: V(0, 0, -0.35), w: R * 0.72, hT: R * 0.62, hB: R * 0.58, sq: 2.1 },
    { p: V(0, R * 0.08, 0.0), w: R * 1.0, hT: R * 0.82, hB: R * 0.72, sq: 2.1 },
    { p: V(0, R * 0.08, 0.35), w: R * 0.74, hT: R * 0.62, hB: R * 0.56 },
    { p: V(0, R * 0.30, 0.62), w: R * 0.42, hT: R * 0.42, hB: R * 0.40 },
  ], { ringN: 24, samplesPerSpan: 6 });
  body.material = hide;
  body.parent = root;
  body.isPickable = false;

  // Short tail tapering to a point (PRD: ~0.25 L), lofted off the trunk rear.
  const tail = loft("aquaticTail", [
    { p: V(0, 0, -0.55), w: R * 0.2, hT: R * 0.22, hB: R * 0.2 },
    { p: V(0, -0.01, -0.55 - AQUATIC.tailLength * 0.4), w: R * 0.12, h: R * 0.12 },
    { p: V(0, -0.02, -0.55 - AQUATIC.tailLength * 0.8), w: R * 0.05, h: R * 0.05 },
    { p: V(0, -0.03, -0.55 - AQUATIC.tailLength), w: 0.015, h: 0.015 },
  ], { ringN: 16, samplesPerSpan: 5 });
  tail.material = hide;
  tail.parent = root;
  tail.isPickable = false;

  // ---- Neck: a chain of tapering segments pivoting at the shoulders so it
  // arcs up out of the water on a surface and lashes forward on a lunge. ----
  const neckPivot = new B.TransformNode("aquaticNeckPivot", scene);
  neckPivot.parent = root;
  neckPivot.position.set(0, AQUATIC.bodyRadius * 0.4, AQUATIC.bodyLength / 2);
  const segLen = AQUATIC.neckLength / AQUATIC.neckSegments;
  // half-width taper down the neck: thick at the base, narrow at the skull.
  const neckHW = (t) => R * (0.46 - 0.34 * t);
  const segPivots = [];
  let parent = neckPivot;
  for (let i = 0; i < AQUATIC.neckSegments; i++) {
    const piv = new B.TransformNode("aquaticNeckSeg" + i, scene);
    piv.parent = parent;
    if (i > 0) piv.position.z = segLen;   // each segment sits at the tip of the previous
    const r0 = neckHW(i / AQUATIC.neckSegments);
    const r1 = neckHW((i + 1) / AQUATIC.neckSegments);
    // a short lofted tube along the segment's local +Z; matching end diameters
    // across joints keep the segmented neck reading as one smooth stiff arc.
    const seg = loft("aquaticNeckMesh" + i, [
      { p: V(0, 0, 0), w: r0, h: r0 },
      { p: V(0, 0, segLen * 0.5), w: (r0 + r1) / 2, h: (r0 + r1) / 2 },
      { p: V(0, 0, segLen), w: r1, h: r1 },
    ], { ringN: 16, samplesPerSpan: 4 });
    seg.material = hide;
    seg.parent = piv;
    seg.isPickable = false;
    segPivots.push(piv);
    parent = piv;
  }

  // ---- Head at the neck tip: a tiny lofted snouted skull + amber eyes. ----
  const headPivot = segPivots[segPivots.length - 1];
  const HL = AQUATIC.headLength;
  const rTip = neckHW(1);
  const head = loft("aquaticHead", [
    { p: V(0, 0, segLen + 0.01), w: rTip, h: rTip },
    { p: V(0, R * 0.03, segLen + HL * 0.45), w: R * 0.16, hT: R * 0.14, hB: R * 0.15, sq: 2.2 }, // skull
    { p: V(0, -R * 0.01, segLen + HL * 0.8), w: R * 0.1, hT: R * 0.08, hB: R * 0.1 },            // snout
    { p: V(0, -R * 0.02, segLen + HL * 1.08), w: R * 0.04, h: R * 0.045 },                       // snout tip
  ], { ringN: 16, samplesPerSpan: 4 });
  head.material = hide;
  head.parent = headPivot;
  head.isPickable = false;
  const eyeR = AQUATIC.bodyRadius * 0.085;
  for (const sx of [-1, 1]) {
    const eye = B.MeshBuilder.CreateSphere("aquaticEyeMesh", { diameter: eyeR * 2, segments: 8 }, scene);
    eye.position.set(sx * AQUATIC.bodyRadius * 0.15, AQUATIC.bodyRadius * 0.12, segLen + HL * 0.5);
    eye.material = eyeMat;
    eye.parent = headPivot;
    eye.isPickable = false;
  }
  // Interlocking fangs — visible when the head surfaces at the waterline.
  for (let i = 0; i < 6; i++) {
    const tz = segLen + HL * (0.4 + i * 0.1);
    const taper = 1 - i / 7;
    for (const sx of [-1, 1]) {
      const fang = B.MeshBuilder.CreateCylinder("aquaticFang", {
        diameterTop: 0, diameterBottom: AQUATIC.bodyRadius * 0.05 * taper,
        height: AQUATIC.bodyRadius * 0.18 * taper, tessellation: 5,
      }, scene);
      fang.position.set(sx * AQUATIC.bodyRadius * 0.1, -AQUATIC.bodyRadius * 0.05, tz);
      fang.rotation.x = Math.PI * 0.55;
      fang.material = toothMat;
      fang.parent = headPivot;
      fang.isPickable = false;
    }
  }

  // ---- Four paddle flippers (fore + hind pairs, elasmosaurid symmetry). ----
  // Each blade is lofted along its own +Z then yawed so its length points out
  // along ±X from the pivot (a +Z sweep avoids the loft frame degenerating when
  // the path runs along the +X right-hint). The pivot animates the paddle.
  const FL = AQUATIC.flipperLength;
  function buildFlipper(side, zPos) {
    const piv = new B.TransformNode("aquaticFlipperPivot", scene);
    piv.parent = root;
    piv.position.set(side * AQUATIC.bodyRadius * 0.78, -AQUATIC.bodyRadius * 0.2, zPos);
    const blade = loft("aquaticFlipper", [
      { p: V(0, 0, -0.08), w: R * 0.14, h: R * 0.06 },   // rounded root
      { p: V(0, 0, FL * 0.25), w: R * 0.4, h: R * 0.09 },
      { p: V(0, 0, FL * 0.55), w: R * 0.42, h: R * 0.09 }, // broad mid-blade
      { p: V(0, 0, FL * 0.85), w: R * 0.3, h: R * 0.06 },
      { p: V(0, 0, FL * 1.05), w: R * 0.12, h: R * 0.04 }, // rounded distal tip
    ], { ringN: 14, samplesPerSpan: 4 });
    blade.rotation.y = -side * Math.PI / 2; // local +Z -> outward ±X
    blade.material = hide;
    blade.parent = piv;
    blade.isPickable = false;
    return piv;
  }
  const flipperL = buildFlipper(-1, 0);
  const flipperR = buildFlipper(1, 0);
  const flipperLRear = buildFlipper(-1, -AQUATIC.bodyLength * 0.35);
  const flipperRRear = buildFlipper(1, -AQUATIC.bodyLength * 0.35);

  // Shadow casting (the body + tail) so it reads grounded when surfaced.
  if (shadow) {
    shadow.addShadowCaster(body);
    shadow.addShadowCaster(tail);
  }

  // The hide material whose emissive we flash red on a hit.
  const flashTargets = [hide].map((m) => ({ mat: m, base: m.emissiveColor.clone() }));

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
    flipperLRear.rotation.x = -a * 0.85;
    flipperRRear.rotation.x = a * 0.85;
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
