import { JUICE } from "./config.js";

// Visual feedback effects: footstep dust, egg pickup bursts, and a reusable
// camera-shake offset. Uses Babylon particle systems with a shared texture.

export function createFx(scene) {
  const B = window.BABYLON;

  // A soft round sprite generated at runtime (no asset file).
  const tex = makeDotTexture(scene);

  // ---- Footstep dust -----------------------------------------------------
  // A single pooled particle system we emit from at the player's feet.
  const dust = new B.ParticleSystem("dust", 200, scene);
  dust.particleTexture = tex;
  dust.emitter = new B.Vector3(0, 0, 0);
  dust.minEmitBox = new B.Vector3(-0.3, 0, -0.3);
  dust.maxEmitBox = new B.Vector3(0.3, 0.1, 0.3);
  dust.color1 = new B.Color4(0.7, 0.62, 0.45, 0.5);
  dust.color2 = new B.Color4(0.55, 0.48, 0.36, 0.35);
  dust.colorDead = new B.Color4(0.5, 0.45, 0.35, 0);
  dust.minSize = 0.4; dust.maxSize = 1.1;
  dust.minLifeTime = 0.3; dust.maxLifeTime = 0.6;
  dust.emitRate = 0;
  dust.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
  dust.gravity = new B.Vector3(0, 1.5, 0);
  dust.direction1 = new B.Vector3(-0.6, 0.4, -0.6);
  dust.direction2 = new B.Vector3(0.6, 1.0, 0.6);
  dust.minEmitPower = 0.5; dust.maxEmitPower = 1.4;
  dust.start();

  let dustTimer = 0;

  // ---- Dash trail --------------------------------------------------------
  // A pooled additive system that leaves a brief cyan streak behind the raptor
  // for the duration of a dash burst, so the dodge reads as a quick smear.
  const trail = new B.ParticleSystem("dashTrail", 120, scene);
  trail.particleTexture = tex;
  trail.emitter = new B.Vector3(0, 0, 0);
  trail.minEmitBox = new B.Vector3(-0.25, 0.2, -0.25);
  trail.maxEmitBox = new B.Vector3(0.25, 1.0, 0.25);
  trail.color1 = new B.Color4(0.5, 0.9, 1, 0.7);
  trail.color2 = new B.Color4(0.3, 0.7, 1, 0.5);
  trail.colorDead = new B.Color4(0.4, 0.8, 1, 0);
  trail.minSize = 0.4; trail.maxSize = 1.0;
  trail.minLifeTime = 0.15; trail.maxLifeTime = 0.3;
  trail.emitRate = 0;
  trail.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  trail.gravity = new B.Vector3(0, 0.5, 0);
  trail.direction1 = new B.Vector3(-0.3, 0, -0.3);
  trail.direction2 = new B.Vector3(0.3, 0.4, 0.3);
  trail.minEmitPower = 0.1; trail.maxEmitPower = 0.5;
  trail.start();

  // ---- Pickup burst ------------------------------------------------------
  function pickupBurst(position, color) {
    const ps = new B.ParticleSystem("pickup", 60, scene);
    ps.particleTexture = tex;
    ps.emitter = position.clone();
    ps.minEmitBox = new B.Vector3(-0.2, -0.2, -0.2);
    ps.maxEmitBox = new B.Vector3(0.2, 0.2, 0.2);
    const c = color || new B.Color4(1, 0.9, 0.5, 1);
    ps.color1 = c;
    ps.color2 = new B.Color4(c.r, c.g * 0.8, c.b * 0.6, 1);
    ps.colorDead = new B.Color4(c.r, c.g, c.b, 0);
    ps.minSize = 0.3; ps.maxSize = 0.8;
    ps.minLifeTime = 0.25; ps.maxLifeTime = JUICE.pickupPopSeconds;
    ps.blendMode = B.ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new B.Vector3(0, -2, 0);
    ps.direction1 = new B.Vector3(-2, 2, -2);
    ps.direction2 = new B.Vector3(2, 4, 2);
    ps.minEmitPower = 1.5; ps.maxEmitPower = 3.5;
    ps.manualEmitCount = 40;
    ps.emitRate = 0;
    ps.disposeOnStop = true;
    ps.start();
    ps.manualEmitCount = 40;
    // stop emitting after a tick; let existing particles fade then dispose
    setTimeout(() => ps.stop(), 60);
    setTimeout(() => ps.dispose(), (JUICE.pickupPopSeconds + 0.3) * 1000);
  }

  // ---- Camera shake ------------------------------------------------------
  let shake = 0;
  const shakeOffset = new B.Vector3(0, 0, 0);

  return {
    // Emit a couple of dust puffs at a foot position while running.
    footDust(dt, position, running) {
      if (!running) { dust.emitRate = 0; return; }
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = JUICE.dustInterval;
        dust.emitter = position;
        dust.manualEmitCount = 6;
        dust.emitRate = 0;
      }
    },
    // Emit cyan motes along the raptor's path while a dash burst is active.
    dashTrail(position, active) {
      if (!active) return;
      trail.emitter = position;
      trail.manualEmitCount = 5;
      trail.emitRate = 0;
    },
    pickupBurst,
    addShake(mag) { shake = Math.max(shake, mag); },
    // Returns a small random offset and decays the shake; caller adds to cam.
    updateShake(dt) {
      if (shake <= 0) { shakeOffset.setAll(0); return shakeOffset; }
      shake = Math.max(0, shake - JUICE.camShakeDecay * dt);
      shakeOffset.set(
        (Math.random() * 2 - 1) * shake,
        (Math.random() * 2 - 1) * shake,
        (Math.random() * 2 - 1) * shake,
      );
      return shakeOffset;
    },
  };
}

function makeDotTexture(scene) {
  const B = window.BABYLON;
  const size = 64;
  const dt = new B.DynamicTexture("dot", { width: size, height: size }, scene, false);
  const ctx = dt.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dt.hasAlpha = true;
  dt.update();
  return dt;
}
