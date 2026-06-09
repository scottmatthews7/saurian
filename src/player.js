import { PLAYER, CAMERA, ARENA } from "./config.js";
import { loadDino } from "./dino.js";

// Third-person raptor controller: WASD relative to camera, Shift to sprint,
// Space to jump, click / J to bite. Uses Babylon moveWithCollisions.

export async function createPlayer(scene, shadow, input) {
  const B = window.BABYLON;
  const dino = await loadDino(scene, "raptor", PLAYER.height, shadow);
  dino.root.position.set(0, 2, 0);

  const collider = dino.root; // we move the root and rely on ellipsoid
  collider.ellipsoid = new B.Vector3(PLAYER.radius, PLAYER.height / 2, PLAYER.radius);
  collider.ellipsoidOffset = new B.Vector3(0, PLAYER.height / 2, 0);

  const state = {
    dino,
    velY: 0,
    grounded: true,
    facing: 0,           // yaw radians
    health: PLAYER.maxHealth,
    attackTimer: 0,
    invuln: 0,
    attacking: 0,        // remaining attack-anim lock
    dead: false,
    pos: collider.position,
  };

  function camForward() {
    const cam = scene.activeCamera;
    const f = cam.getForwardRay().direction;
    f.y = 0; f.normalize();
    return f;
  }

  state.update = function (dt) {
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
    const sprint = input.keys.has("shift");
    const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;

    if (moving) {
      move.normalize();
      const targetYaw = Math.atan2(move.x, move.z);
      state.facing = lerpAngle(state.facing, targetYaw, PLAYER.turnLerp);
    }
    dino.root.rotation.y = state.facing;

    // gravity + jump
    state.velY += PLAYER.gravity * dt;
    if (input.consumeJump() && state.grounded && state.attacking <= 0) {
      state.velY = PLAYER.jumpSpeed;
      state.grounded = false;
      dino.play("Jump", { loop: false });
    }

    const horiz = moving ? move.scale(speed * dt) : B.Vector3.Zero();
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
      state.attacking = 0.45;
      dino.play("Attack", { loop: false, speed: 1.4 });
    }
  };

  state.takeDamage = function (amount) {
    if (state.invuln > 0 || state.dead) return;
    state.health = Math.max(0, state.health - amount);
    state.invuln = PLAYER.invulnAfterHit;
    if (state.health <= 0) {
      state.dead = true;
      dino.play("Death", { loop: false });
    }
  };

  // ground height helper (matches world.heightAt; injected at game wiring)
  let groundFloor = () => 0;
  state.setGroundFn = (fn) => { groundFloor = (p) => fn(p.x, p.z); };

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
    update() {
      const p = target.dino.root.position;
      smoothTarget.x += (p.x - smoothTarget.x) * CAMERA.lerp;
      smoothTarget.y += (p.y + 3 - smoothTarget.y) * CAMERA.lerp;
      smoothTarget.z += (p.z - smoothTarget.z) * CAMERA.lerp;
      cam.target.copyFrom(smoothTarget);
    },
  };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
