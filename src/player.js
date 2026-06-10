import { PLAYER, CAMERA, ARENA, WATER } from "./config.js";
import { loadDino } from "./dino.js";

// Third-person human controller: WASD relative to camera, Shift to sprint,
// Space to jump, click / J to punch/kick. Uses Babylon moveWithCollisions.

export async function createPlayer(scene, shadow, input) {
  const B = window.BABYLON;
  const dino = await loadDino(scene, "human", PLAYER.height, shadow);
  dino.root.position.set(0, 2, 0);
  const ATTACK_LOCK = PLAYER.attackLockSeconds;

  // TransformNode has no moveWithCollisions, so we drive an invisible collider
  // mesh and copy its position onto the visual dino root each frame.
  const collider = B.MeshBuilder.CreateBox("playerCollider", { size: 0.1 }, scene);
  collider.isVisible = false;
  collider.isPickable = false;
  collider.checkCollisions = true;
  collider.position.copyFrom(dino.root.position);
  collider.ellipsoid = new B.Vector3(PLAYER.radius, PLAYER.height / 2, PLAYER.radius);
  collider.ellipsoidOffset = new B.Vector3(0, PLAYER.height / 2, 0);

  const state = {
    dino,
    velY: 0,
    grounded: true,
    facing: 0,           // yaw radians
    health: PLAYER.maxHealth,
    maxHealthValue: PLAYER.maxHealth,
    attackTimer: 0,
    invuln: 0,
    sinceHit: 999,       // seconds since last damage — gates slow passive regen
    attacking: 0,        // remaining attack-anim lock
    strikeId: 0,         // increments each swing; lets the game land one hit per target per strike
    strikeConnected: false, // true once a swing has dealt damage (drives the impact SFX/feel)
    dashTimer: 0,        // dash cooldown remaining (sec)
    dashActive: 0,       // remaining dash-burst duration (sec); >0 means mid-dash
    dashDir: { x: 0, z: 1 }, // unit heading the current dash drives along
    dashGuard: 0,        // dash i-frame window remaining; an attack landing inside it is a CLOSE CALL
    closeCallCredited: false, // one close call max per dash (multi-hit swarms don't multi-score)
    onDash: null,        // fired when a dash triggers (game applies FX/SFX)
    onCloseCall: null,   // fired when dash i-frames negate an actual attack (game scores it)
    moving: false,
    sprinting: false,
    stamina: PLAYER.staminaMax,
    exhausted: false,    // true until stamina recovers past the sprint floor
    dead: false,
    wading: false,       // true while standing in the shallow edge of the pond
    swimming: false,     // true while in DEEP water (swim instead of wade/sink) — more vulnerable to aquatic predators
    onAttack: null,      // fired when a punch/kick starts (set by game for SFX)
    onHurt: null,        // fired whenever damage actually lands (any source)
    onSplash: null,      // fired on the frame we enter the water
    pos: collider.position,
  };

  // Melee swing animation cycle: every clip the model ships for the logical
  // attack (the human has right punch / left punch / kick; a dino just its one
  // Attack clip). Cycled per swing so repeated strikes read as combinations.
  const strikeClips = ["Attack", "Attack2", "Attack3"].filter((k) => dino.clips[k]);
  if (!strikeClips.length) strikeClips.push("Attack");

  function camForward() {
    const cam = scene.activeCamera;
    const f = cam.getForwardRay().direction;
    f.y = 0; f.normalize();
    return f;
  }

  state.update = function (dt) {
    dino.updateFlash(dt);
    if (state.dead) return;
    state.attackTimer = Math.max(0, state.attackTimer - dt);
    state.invuln = Math.max(0, state.invuln - dt);
    state.attacking = Math.max(0, state.attacking - dt);
    // Slow passive health regen: kicks in only after you've gone unhurt for a
    // few seconds (back off from danger and you recover over time).
    state.sinceHit += dt;
    if (state.sinceHit > PLAYER.regenDelay && state.health < state.maxHealthValue) {
      state.health = Math.min(state.maxHealthValue, state.health + PLAYER.regenRate * dt);
    }
    state.dashTimer = Math.max(0, state.dashTimer - dt);
    state.dashActive = Math.max(0, state.dashActive - dt);
    state.dashGuard = Math.max(0, state.dashGuard - dt);

    // --- movement input (camera-relative) ---
    const fwd = camForward();
    const right = new B.Vector3(fwd.z, 0, -fwd.x);
    let move = B.Vector3.Zero();
    if (input.keys.has("w")) move.addInPlace(fwd);
    if (input.keys.has("s")) move.subtractInPlace(fwd);
    if (input.keys.has("d")) move.addInPlace(right);
    if (input.keys.has("a")) move.subtractInPlace(right);

    const moving = move.lengthSquared() > 0.001 && state.attacking <= 0;
    const wantSprint = input.sprintHeld;

    // --- stamina: drain while sprinting, regen otherwise; lock out sprint
    // until stamina recovers past the floor once exhausted. ---
    const canSprint = wantSprint && moving && state.stamina > 0 && !state.exhausted;
    if (canSprint) {
      state.stamina = Math.max(0, state.stamina - PLAYER.staminaDrain * dt);
      if (state.stamina <= 0) state.exhausted = true;
    } else {
      state.stamina = Math.min(PLAYER.staminaMax, state.stamina + PLAYER.staminaRegen * dt);
      if (state.exhausted && state.stamina >= PLAYER.staminaSprintMin) state.exhausted = false;
    }
    const sprint = canSprint;

    // Water handling: the shoreline shallows are a WADING hazard (slow + a gentle
    // continuous drain, unchanged), but the deep middle of the lake is a SWIM —
    // the human floats and paddles slowly across instead of trudging the bottom.
    // A splash event fires on entering the water either way (SFX + spray).
    const inAnyWater = inWater(collider.position.x, collider.position.z);
    const deep = inAnyWater && isDeepWater(collider.position.x, collider.position.z);
    if (inAnyWater && !state.wading && !state.swimming && state.onSplash) {
      state.onSplash(collider.position.clone());
    }
    const wading = inAnyWater && !deep;
    const swimming = deep;
    state.wading = wading;
    state.swimming = swimming;
    if (wading) {
      // bypasses i-frames intentionally: a slow continuous environmental drain.
      // (Deep-water swimming does NOT drain — the danger there is the lake
      // predator, not the water itself.)
      state.health = Math.max(0, state.health - WATER.damagePerSec * dt);
      state.sinceHit = 0;
      if (state.health <= 0 && !state.dead) {
        state.dead = true;
        if (state.onHurt) state.onHurt();
        dino.play("Death", { loop: false });
      }
    }

    const waterMul = swimming ? WATER.swimSlowFactor : wading ? WATER.slowFactor : 1;
    const speed = (sprint ? PLAYER.runSpeed : PLAYER.walkSpeed) * waterMul;
    state.moving = moving;
    state.sprinting = sprint;

    if (moving) {
      move.normalize();
      const targetYaw = Math.atan2(move.x, move.z);
      state.facing = lerpAngle(state.facing, targetYaw, PLAYER.turnLerp);
    }
    dino.setYaw(state.facing);

    // DASH / dodge roll (F): a short fast burst along the heading with brief
    // invulnerability. Off-cooldown, costs stamina, and not while exhausted or
    // mid-swing — so it trades against sprint rather than being free. Dashes
    // toward the current move input if any, else straight ahead (facing).
    if (input.consumeDash() && state.dashTimer <= 0 && state.dashActive <= 0
        && !state.exhausted && state.stamina >= PLAYER.dashCost && state.attacking <= 0) {
      state.dashTimer = PLAYER.dashCooldown;
      state.dashActive = PLAYER.dashSeconds;
      state.stamina = Math.max(0, state.stamina - PLAYER.dashCost);
      state.invuln = Math.max(state.invuln, PLAYER.dashIFrames);
      // The dash guard mirrors the i-frame window but is dash-specific: an
      // attack landing inside it scores a CLOSE CALL (a perfect dodge).
      state.dashGuard = PLAYER.dashIFrames;
      state.closeCallCredited = false;
      const dx = moving ? move.x : Math.sin(state.facing);
      const dz = moving ? move.z : Math.cos(state.facing);
      const dl = Math.hypot(dx, dz) || 1;
      state.dashDir.x = dx / dl; state.dashDir.z = dz / dl;
      // snap-face the dash direction so the burst reads cleanly
      state.facing = Math.atan2(state.dashDir.x, state.dashDir.z);
      dino.setYaw(state.facing);
      dino.flash(0.2, new B.Color3(0.4, 0.9, 1));
      dino.play("Roll", { loop: false, speed: 1.2 }); // the dash IS a dodge-roll
      if (state.onDash) state.onDash(collider.position.clone());
    }

    // gravity + jump
    state.velY += PLAYER.gravity * dt;
    if (input.consumeJump() && state.grounded && state.attacking <= 0) {
      state.velY = PLAYER.jumpSpeed;
      state.grounded = false;
      // The human model has no jump clip. A slow-motion run stride reads as a
      // natural leap (the old Roll mapping froze mid-somersault in the air).
      dino.play("Run", { speed: 0.35 });
    }

    const horiz = moving ? move.scale(speed * dt) : B.Vector3.Zero();
    // Dash burst: while a dash is active, drive a strong push along the locked
    // dash heading (independent of held keys) so it always covers ground.
    if (state.dashActive > 0) {
      const d = PLAYER.dashSpeed * dt;
      horiz.x = state.dashDir.x * d;
      horiz.z = state.dashDir.z * d;
    }
    // Strike lunge: a short forward burst at the start of the attack window so
    // the punch/kick has weight and can close distance onto a backing-away target.
    if (state.attacking > ATTACK_LOCK - PLAYER.lungeSeconds) {
      const lunge = PLAYER.lungeSpeed * dt;
      horiz.x += Math.sin(state.facing) * lunge;
      horiz.z += Math.cos(state.facing) * lunge;
    }
    const disp = new B.Vector3(horiz.x, state.velY * dt, horiz.z);
    collider.moveWithCollisions(disp);

    // ground check
    if (collider.position.y <= groundFloor(collider.position) + 0.05) {
      collider.position.y = groundFloor(collider.position);
      state.velY = 0;
      state.grounded = true;
    }
    // Swimming: float at the water surface (head/shoulders out) rather than
    // sinking to the carved basin floor. Overrides the ground snap above so the
    // human bobs on the deep water instead of walking the bottom.
    if (swimming) {
      collider.position.y = waterSurfaceY() + WATER.swimSurfaceOffset;
      state.velY = 0;
      state.grounded = true;   // treat as grounded so jump/attack logic stays sane
    }

    // keep inside arena
    const d = Math.hypot(collider.position.x, collider.position.z);
    if (d > ARENA.radius - 2) {
      const k = (ARENA.radius - 2) / d;
      collider.position.x *= k; collider.position.z *= k;
    }

    // sync the visual dino to the collider (yaw is applied separately)
    dino.root.position.copyFrom(collider.position);

    // --- animation state ---
    if (state.attacking > 0) {
      // attack clip already playing
    } else if (!state.grounded) {
      // jump clip plays out
    } else if (state.dashActive > 0) {
      // mid-dash: the Roll one-shot is playing — don't stomp it with Run
    } else if (swimming) {
      // Swim pose: the human has no swim clip, so a slow Run stride reads as a
      // paddle/breaststroke crawl through the water (matched to the slow swim
      // speed so the limbs don't foot-slide), or a slow Idle tread when still.
      dino.play(moving ? "Run" : "Idle", { speed: moving ? 0.6 : 0.5 });
    } else if (moving) {
      dino.play("Run", { speed: sprint ? 1.4 : 1.0 });
    } else {
      dino.play("Idle");
    }

    // --- attack (bare-handed punch/kick) ---
    if (input.consumeAttack() && state.attackTimer <= 0 && state.grounded) {
      state.attackTimer = PLAYER.attackCooldown;
      state.attacking = ATTACK_LOCK;
      state.strikeId++;          // a fresh swing: every target becomes hittable once
      state.strikeConnected = false;
      // cycle right punch -> left punch -> kick so combos read naturally
      dino.play(strikeClips[state.strikeId % strikeClips.length], { loop: false, speed: 1.4 });
      if (state.onAttack) state.onAttack();
    }
  };

  state.takeDamage = function (amount) {
    if (state.dead) return;
    // A perfect dodge: the attack landed inside the dash's i-frame window.
    // Negate it and credit one CLOSE CALL per dash (the game scores it).
    if (state.dashGuard > 0) {
      if (!state.closeCallCredited) {
        state.closeCallCredited = true;
        if (state.onCloseCall) state.onCloseCall(collider.position.clone());
      }
      return;
    }
    if (state.invuln > 0) return;
    state.health = Math.max(0, state.health - amount);
    state.invuln = PLAYER.invulnAfterHit;
    state.sinceHit = 0;  // taking damage resets the regen delay
    dino.flash(0.25, new B.Color3(0.9, 0.05, 0.05));
    if (state.onHurt) state.onHurt();
    if (state.health <= 0) {
      state.dead = true;
      dino.play("Death", { loop: false });
    }
  };

  state.heal = function (amount) {
    if (state.dead) return;
    state.health = Math.min(state.maxHealthValue, state.health + amount);
    dino.flash(0.2, new B.Color3(0.1, 0.7, 0.2));
  };

  // Restore stamina (an egg's pick-me-up). Clears exhaustion the same way the
  // natural regen does once the sprint floor is recovered.
  state.restoreStamina = function (amount) {
    if (state.dead) return;
    state.stamina = Math.min(PLAYER.staminaMax, state.stamina + amount);
    if (state.exhausted && state.stamina >= PLAYER.staminaSprintMin) state.exhausted = false;
  };

  // ground height helper (matches world.heightAt; injected at game wiring)
  let groundFloor = () => 0;
  state.setGroundFn = (fn) => { groundFloor = (p) => fn(p.x, p.z); };

  // water test (matches world.inWater; injected at game wiring)
  let inWater = () => false;
  state.setWaterFn = (fn) => { inWater = fn; };

  // Deep-water test + surface height for the swim branch (matches
  // world.isDeepWater / world.waterSurfaceY; injected at game wiring). Default
  // to "never deep" so a player with no lake still behaves exactly as before.
  let isDeepWater = () => false;
  state.setDeepWaterFn = (fn) => { isDeepWater = fn; };
  let waterSurfaceY = () => 0;
  state.setWaterSurfaceFn = (fn) => { waterSurfaceY = fn; };

  // Place both collider and visual at a world position (avoids first-frame pop).
  state.warpTo = (x, y, z) => {
    collider.position.set(x, y, z);
    dino.root.position.set(x, y, z);
  };

  // Soft restart: restore all combat/movement state and re-centre.
  state.reset = (x, y, z) => {
    state.health = state.maxHealthValue;
    state.sinceHit = 999;
    state.velY = 0;
    state.grounded = true;
    state.facing = 0;
    state.attackTimer = 0;
    state.invuln = 0;
    state.attacking = 0;
    state.strikeId = 0;
    state.strikeConnected = false;
    state.dashTimer = 0;
    state.dashActive = 0;
    state.dashGuard = 0;
    state.closeCallCredited = false;
    state.stamina = PLAYER.staminaMax;
    state.exhausted = false;
    state.wading = false;
    state.swimming = false;
    state.dead = false;
    state.warpTo(x, y, z);
    dino.setYaw(0);
    dino.play("Idle");
  };

  return state;
}

export function createFollowCamera(scene, target) {
  const B = window.BABYLON;
  const cam = new B.ArcRotateCamera("cam", -Math.PI / 2, 1.05, CAMERA.distance,
    new B.Vector3(0, 2, 0), scene);
  cam.fov = CAMERA.fov;
  cam.lowerRadiusLimit = 7;
  cam.upperRadiusLimit = 26;
  cam.lowerBetaLimit = 0.35;
  cam.upperBetaLimit = 1.45;
  cam.wheelPrecision = 12;
  const canvas = scene.getEngine().getRenderingCanvas();
  cam.attachControl(canvas, true);

  const smoothTarget = new B.Vector3(0, 2, 0);

  // Suspend auto-follow briefly after a manual camera interaction (drag / wheel)
  // so deliberate look-around isn't fought by the auto-orient.
  let manualHold = 0;
  let dragging = false;
  canvas.addEventListener("pointerdown", (e) => { if (e.button !== 0) dragging = true; });
  window.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointermove", () => { if (dragging) manualHold = CAMERA.manualHoldSeconds; });
  canvas.addEventListener("wheel", () => { manualHold = CAMERA.manualHoldSeconds; }, { passive: true });

  return {
    cam,
    update(shake, dt) {
      const p = target.dino.root.position;
      smoothTarget.x += (p.x - smoothTarget.x) * CAMERA.lerp;
      smoothTarget.y += (p.y + 3 - smoothTarget.y) * CAMERA.lerp;
      smoothTarget.z += (p.z - smoothTarget.z) * CAMERA.lerp;

      // Auto-follow: ease the orbit angle to sit behind the raptor's heading
      // while it's moving, unless the player is steering the camera by hand.
      manualHold = Math.max(0, manualHold - (dt || 0));
      if (manualHold <= 0 && target.moving && !dragging) {
        // ArcRotateCamera alpha at which the camera looks along +heading and so
        // sits behind a raptor facing `target.facing` (atan2(x,z) convention).
        const desiredAlpha = -target.facing - Math.PI / 2;
        cam.alpha = lerpAngle(cam.alpha, desiredAlpha, CAMERA.autoFollowLerp);
      }

      if (shake) {
        cam.target.set(smoothTarget.x + shake.x, smoothTarget.y + shake.y, smoothTarget.z + shake.z);
      } else {
        cam.target.copyFrom(smoothTarget);
      }
    },
  };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
