import { PLAYER, CAMERA, ARENA, WATER } from "./config.js";
import { loadDino } from "./dino.js";

// Third-person raptor controller: WASD relative to camera, Shift to sprint,
// Space to jump, click / J to bite. Uses Babylon moveWithCollisions.

export async function createPlayer(scene, shadow, input) {
  const B = window.BABYLON;
  const dino = await loadDino(scene, "raptor", PLAYER.height, shadow);
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
    attacking: 0,        // remaining attack-anim lock
    moving: false,
    sprinting: false,
    stamina: PLAYER.staminaMax,
    exhausted: false,    // true until stamina recovers past the sprint floor
    carrying: 0,         // eggs carried (set by game each frame, drives carrySlow)
    dead: false,
    wading: false,       // true while standing in the pond
    onAttack: null,      // fired when a bite starts (set by game for SFX)
    onHurt: null,        // fired whenever damage actually lands (any source)
    onSplash: null,      // fired on the frame we enter the water
    pos: collider.position,
  };

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

    // --- movement input (camera-relative) ---
    const fwd = camForward();
    const right = new B.Vector3(fwd.z, 0, -fwd.x);
    let move = B.Vector3.Zero();
    if (input.keys.has("w")) move.addInPlace(fwd);
    if (input.keys.has("s")) move.subtractInPlace(fwd);
    if (input.keys.has("d")) move.addInPlace(right);
    if (input.keys.has("a")) move.subtractInPlace(right);

    const moving = move.lengthSquared() > 0.001 && state.attacking <= 0;
    const wantSprint = input.keys.has("shift");

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

    // wading through the pond: slow the raptor and tick gentle damage. A splash
    // event fires on entry so the game can play SFX + a particle burst.
    const wading = inWater(collider.position.x, collider.position.z);
    if (wading && !state.wading && state.onSplash) state.onSplash(collider.position.clone());
    state.wading = wading;
    if (wading) {
      // bypasses i-frames intentionally: a slow continuous environmental drain.
      state.health = Math.max(0, state.health - WATER.damagePerSec * dt);
      if (state.health <= 0 && !state.dead) {
        state.dead = true;
        if (state.onHurt) state.onHurt();
        dino.play("Death", { loop: false });
      }
    }

    // carrying eggs slows you down — a risk/reward weight on the return trip.
    const carryMul = 1 / (1 + state.carrying * PLAYER.carrySlow);
    const waterMul = wading ? WATER.slowFactor : 1;
    const speed = (sprint ? PLAYER.runSpeed : PLAYER.walkSpeed) * carryMul * waterMul;
    state.moving = moving;
    state.sprinting = sprint;

    if (moving) {
      move.normalize();
      const targetYaw = Math.atan2(move.x, move.z);
      state.facing = lerpAngle(state.facing, targetYaw, PLAYER.turnLerp);
    }
    dino.setYaw(state.facing);

    // gravity + jump
    state.velY += PLAYER.gravity * dt;
    if (input.consumeJump() && state.grounded && state.attacking <= 0) {
      state.velY = PLAYER.jumpSpeed;
      state.grounded = false;
      dino.play("Jump", { loop: false });
    }

    const horiz = moving ? move.scale(speed * dt) : B.Vector3.Zero();
    // Bite lunge: a short forward burst at the start of the attack window so
    // the bite has weight and can close distance onto a backing-away target.
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
    } else if (moving) {
      dino.play("Run", { speed: sprint ? 1.4 : 1.0 });
    } else {
      dino.play("Idle");
    }

    // --- attack ---
    if (input.consumeAttack() && state.attackTimer <= 0 && state.grounded) {
      state.attackTimer = PLAYER.attackCooldown;
      state.attacking = ATTACK_LOCK;
      dino.play("Attack", { loop: false, speed: 1.4 });
      if (state.onAttack) state.onAttack();
    }
  };

  state.takeDamage = function (amount) {
    if (state.invuln > 0 || state.dead) return;
    state.health = Math.max(0, state.health - amount);
    state.invuln = PLAYER.invulnAfterHit;
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

  // ground height helper (matches world.heightAt; injected at game wiring)
  let groundFloor = () => 0;
  state.setGroundFn = (fn) => { groundFloor = (p) => fn(p.x, p.z); };

  // water test (matches world.inWater; injected at game wiring)
  let inWater = () => false;
  state.setWaterFn = (fn) => { inWater = fn; };

  // Place both collider and visual at a world position (avoids first-frame pop).
  state.warpTo = (x, y, z) => {
    collider.position.set(x, y, z);
    dino.root.position.set(x, y, z);
  };

  // Soft restart: restore all combat/movement state and re-centre.
  state.reset = (x, y, z) => {
    state.health = state.maxHealthValue;
    state.velY = 0;
    state.grounded = true;
    state.facing = 0;
    state.attackTimer = 0;
    state.invuln = 0;
    state.attacking = 0;
    state.stamina = PLAYER.staminaMax;
    state.exhausted = false;
    state.carrying = 0;
    state.wading = false;
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
  cam.attachControl(scene.getEngine().getRenderingCanvas(), true);

  const smoothTarget = new B.Vector3(0, 2, 0);

  return {
    cam,
    update(shake) {
      const p = target.dino.root.position;
      smoothTarget.x += (p.x - smoothTarget.x) * CAMERA.lerp;
      smoothTarget.y += (p.y + 3 - smoothTarget.y) * CAMERA.lerp;
      smoothTarget.z += (p.z - smoothTarget.z) * CAMERA.lerp;
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
