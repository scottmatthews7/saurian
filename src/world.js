import { ARENA, DAYNIGHT, ATMOSPHERE, WATER, PTERO_DIVE } from "./config.js";

// Smooth basin profile for the pond: 1 at the centre, easing to 0 at the rim.
// Carved into the terrain heightmap so the pool sits in a real depression.
function basinFactor(x, z) {
  const d = Math.hypot(x - WATER.centerX, z - WATER.centerZ);
  if (d >= WATER.radius) return 0;
  const t = 1 - d / WATER.radius;
  return t * t * (3 - 2 * t); // smoothstep
}

// Builds terrain, sky, lighting, fog, foliage and the day/night cycle.
// Returns handles the rest of the game needs (ground mesh for collisions,
// shadow generator, an update fn for the day/night cycle).

export function buildWorld(scene) {
  const B = window.BABYLON;

  // --- Sky / clear + fog ---------------------------------------------------
  scene.clearColor = new B.Color4(0.55, 0.72, 0.86, 1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = ARENA.fogDensity;
  scene.fogColor = new B.Color3(0.62, 0.74, 0.84);

  // Gradient skydome: a vertical zenith->horizon gradient painted into a
  // texture (reads far better than a flat fill), tinted by the day/night cycle
  // through the material's emissive colour which multiplies the texture.
  const sky = B.MeshBuilder.CreateSphere("sky", { diameter: ARENA.groundSize * 4, sideOrientation: B.Mesh.BACKSIDE }, scene);
  const skyMat = new B.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.emissiveTexture = makeSkyGradient(scene);
  skyMat.emissiveColor = new B.Color3(0.55, 0.72, 0.9);
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  // --- Lighting ------------------------------------------------------------
  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new B.Color3(0.9, 0.92, 1.0);
  hemi.groundColor = new B.Color3(0.3, 0.35, 0.25);

  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.5, -1, -0.4), scene);
  sun.position = new B.Vector3(60, 120, 60);
  sun.intensity = 1.5;
  sun.diffuse = new B.Color3(1.0, 0.96, 0.86);

  const shadow = new B.ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 32;
  shadow.darkness = 0.35;

  // --- Ground (procedural rolling terrain) --------------------------------
  const ground = B.MeshBuilder.CreateGround("ground", {
    width: ARENA.groundSize, height: ARENA.groundSize,
    subdivisions: 120, updatable: true,
  }, scene);

  // Gentle height noise via layered sines (deterministic, cheap).
  const positions = ground.getVerticesData(B.VertexBuffer.PositionKind);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const d = Math.sqrt(x * x + z * z);
    let h = Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6
          + Math.sin(x * 0.13 + z * 0.07) * 0.7;
    // flatten the central play area, raise distant rim into hills
    const rim = Math.max(0, d - ARENA.radius) * 0.12;
    h = h * Math.min(1, d / ARENA.radius * 1.2) + rim;
    h -= basinFactor(x, z) * WATER.depth; // carve the pond basin
    positions[i + 1] = h;
  }
  ground.updateVerticesData(B.VertexBuffer.PositionKind, positions);
  ground.createNormals(true);
  ground.checkCollisions = true;
  ground.receiveShadows = true;

  const groundMat = new B.StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = makeGroundTexture(scene);
  groundMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
  ground.material = groundMat;

  // sample terrain height for placement
  const heightAt = (x, z) => {
    const d = Math.sqrt(x * x + z * z);
    let h = Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6
          + Math.sin(x * 0.13 + z * 0.07) * 0.7;
    const rim = Math.max(0, d - ARENA.radius) * 0.12;
    return h * Math.min(1, d / ARENA.radius * 1.2) + rim - basinFactor(x, z) * WATER.depth;
  };

  // --- Water pond ----------------------------------------------------------
  // A translucent surface disc sitting in the carved basin. The surface height
  // is the rim ground (basin edge) plus a small level, so it reads as a pool.
  const rimGroundY = heightAt(WATER.centerX + WATER.radius, WATER.centerZ);
  const waterY = rimGroundY + WATER.level;
  const water = B.MeshBuilder.CreateDisc("water", { radius: WATER.radius, tessellation: 48 }, scene);
  water.rotation.x = Math.PI / 2;
  water.position.set(WATER.centerX, waterY, WATER.centerZ);
  water.isPickable = false;
  const waterMat = new B.StandardMaterial("waterMat", scene);
  waterMat.diffuseColor = new B.Color3(0.1, 0.32, 0.42);
  waterMat.emissiveColor = new B.Color3(0.04, 0.12, 0.18);
  waterMat.specularColor = new B.Color3(0.6, 0.8, 0.9);
  waterMat.specularPower = 64;
  waterMat.alpha = 0.72;
  water.material = waterMat;

  // A faint ring of reeds around the shoreline for readability.
  buildReeds(scene, shadow, heightAt);

  // Water helpers consumed by the player controller and AI avoidance.
  const inWater = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius - 1;
  const waterCenter = { x: WATER.centerX, z: WATER.centerZ, radius: WATER.radius };

  const obstacles = scatterFoliage(scene, shadow, heightAt);
  const atmosphere = buildAtmosphere(scene, heightAt);

  // --- Day/night cycle -----------------------------------------------------
  let t = 0.25; // start mid-morning
  let t_water = 0;
  // The day/night clock only advances once a run is live, so the world stays
  // bright while the player reads the title screen (previously it could drift
  // into night before they even started). Atmosphere + water still animate.
  const update = (dt, advanceDayClock = true) => {
    atmosphere.update(dt);
    // subtle water shimmer
    t_water += dt;
    waterMat.emissiveColor.b = 0.16 + 0.05 * Math.sin(t_water * 1.5);
    water.position.y = waterY + Math.sin(t_water * 0.8) * 0.03;
    if (advanceDayClock) t = (t + dt / DAYNIGHT.cycleSeconds) % 1;
    const ang = t * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    sun.direction = new B.Vector3(-sx, -Math.max(0.15, sy), -0.4).normalize();
    // Floor the day factor so the arena stays readable even at the cycle's dim
    // end — the day/night swing is mood, not a darkness-survival mechanic.
    const day = Math.max(DAYNIGHT.minDayLight, sy * 0.5 + 0.5);  // 0.35 dim .. 1 noon
    sun.intensity = 0.2 + day * 1.5;
    const sunsetTint = Math.max(0, 1 - Math.abs(sy) * 3);
    sun.diffuse = new B.Color3(1.0, 0.96 - sunsetTint * 0.3, 0.86 - sunsetTint * 0.5);
    hemi.intensity = 0.18 + day * 0.5;
    const skyR = 0.12 + day * 0.43 + sunsetTint * 0.25;
    const skyG = 0.16 + day * 0.56;
    const skyB = 0.28 + day * 0.62;
    skyMat.emissiveColor.set(skyR, skyG, skyB);
    scene.fogColor.set(skyR * 1.05, skyG * 1.05, skyB * 1.0);
    scene.clearColor.set(skyR, skyG, skyB, 1);
  };

  return {
    ground, shadow, heightAt, update, inWater, waterCenter, waterSurfaceY: waterY,
    obstacles,
    updateThreats: (dt, player, onScreech, onHit) =>
      atmosphere.updateThreats(dt, player, onScreech, onHit),
  };
}

// A sparse ring of reeds around the pond shoreline so the water edge reads
// clearly and the pool feels inhabited. Pure set dressing.
function buildReeds(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const reedSrc = B.MeshBuilder.CreateCylinder("reedSrc",
    { height: 2.2, diameterTop: 0.04, diameterBottom: 0.18, tessellation: 4 }, scene);
  const reedMat = new B.StandardMaterial("reedMat", scene);
  reedMat.diffuseColor = new B.Color3(0.36, 0.46, 0.18);
  reedMat.specularColor = B.Color3.Black();
  reedSrc.material = reedMat;
  reedSrc.isVisible = false;
  const rng = mulberry32(909);
  const count = 70;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.3;
    const r = WATER.radius - 0.5 + rng() * 1.6;
    const x = WATER.centerX + Math.cos(a) * r;
    const z = WATER.centerZ + Math.sin(a) * r;
    const s = 0.6 + rng() * 0.8;
    const inst = reedSrc.createInstance("reed" + i);
    inst.position.set(x, heightAt(x, z) + 1.0 * s, z);
    inst.scaling.setAll(s);
    inst.rotation.set((rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3);
    inst.isPickable = false;
    shadow.addShadowCaster(inst);
  }
}

// Vertical sky gradient painted into a texture. Values are relative multipliers
// (centred near white) so the day/night emissive tint still drives the actual
// colour: the horizon stays bright/warm, the zenith darkens and cools, giving
// real depth instead of a flat dome. V=1 is the zenith, V=0 the lower sky.
function makeSkyGradient(scene) {
  const B = window.BABYLON;
  const W = 8, H = 256;
  const dt = new B.DynamicTexture("skyGrad", { width: W, height: H }, scene, false);
  const ctx = dt.getContext();
  // canvas y=0 is the top of the texture = zenith
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.0, "rgb(200,212,245)");   // zenith: deeper, cooler
  g.addColorStop(0.45, "rgb(228,236,252)");  // mid sky
  g.addColorStop(0.8, "rgb(255,252,246)");   // near horizon: bright, warm
  g.addColorStop(1.0, "rgb(255,250,238)");   // horizon band
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  dt.update();
  dt.wrapU = B.Texture.CLAMP_ADDRESSMODE;
  dt.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  return dt;
}

// Procedural mottled grass texture so the ground reads as a living field
// rather than a flat colour. Painted once into a DynamicTexture and tiled.
function makeGroundTexture(scene) {
  const B = window.BABYLON;
  const S = 512;
  const dt = new B.DynamicTexture("groundTex", { width: S, height: S }, scene, true);
  const ctx = dt.getContext();
  // base grass
  ctx.fillStyle = "#5a8038";
  ctx.fillRect(0, 0, S, S);
  // layered blotches: lighter grass, darker grass, dry dirt
  const blob = (color, count, rMin, rMax) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = rMin + Math.random() * (rMax - rMin);
      ctx.globalAlpha = 0.18 + Math.random() * 0.22;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  };
  blob("#6f9a44", 320, 6, 26);   // light grass
  blob("#46682c", 300, 6, 30);   // dark grass
  blob("#7a6438", 90, 4, 18);    // dry dirt
  blob("#8aa758", 200, 2, 8);    // bright flecks
  ctx.globalAlpha = 1;
  dt.update();
  dt.uScale = dt.vScale = 8;  // tile across the large ground plane
  return dt;
}

// Visual set dressing that lives above the playfield: a circling pterosaur
// flock, drifting clouds, and floating pollen. None of it collides.
function buildAtmosphere(scene, heightAt) {
  const B = window.BABYLON;

  // ---- Pterosaur flock (stylised: a body + two flapping wings) ----------
  const birdMat = new B.StandardMaterial("birdMat", scene);
  birdMat.diffuseColor = new B.Color3(0.16, 0.15, 0.18);
  birdMat.specularColor = B.Color3.Black();

  const birds = [];
  for (let i = 0; i < ATMOSPHERE.birdCount; i++) {
    const root = new B.TransformNode("bird" + i, scene);
    const body = B.MeshBuilder.CreateCylinder("birdBody" + i,
      { height: 1.6, diameterTop: 0, diameterBottom: 0.5, tessellation: 5 }, scene);
    body.rotation.x = Math.PI / 2;
    body.material = birdMat;
    body.parent = root;
    body.isPickable = false;
    const wingL = B.MeshBuilder.CreateBox("wingL" + i, { width: 2.4, height: 0.06, depth: 0.8 }, scene);
    const wingR = B.MeshBuilder.CreateBox("wingR" + i, { width: 2.4, height: 0.06, depth: 0.8 }, scene);
    wingL.material = wingR.material = birdMat;
    wingL.parent = wingR.parent = root;
    wingL.position.x = -1.3; wingR.position.x = 1.3;
    wingL.isPickable = wingR.isPickable = false;
    birds.push({
      root, wingL, wingR, body,
      phase: (i / ATMOSPHERE.birdCount) * Math.PI * 2,
      radius: ATMOSPHERE.birdRadius * (0.7 + 0.3 * (i % 3) / 2),
      height: ATMOSPHERE.birdHeight + (i % 3) * 4,
      flap: Math.random() * Math.PI * 2,
      diving: false,        // skipped by the passive orbit while it swoops
    });
  }

  // Diving-bird material so a committed swoop reads as a threat (angry red).
  const diveMat = new B.StandardMaterial("birdDiveMat", scene);
  diveMat.diffuseColor = new B.Color3(0.5, 0.1, 0.1);
  diveMat.emissiveColor = new B.Color3(0.5, 0.05, 0.05);
  diveMat.specularColor = B.Color3.Black();

  // Ground shadow decal under a diving pterosaur — a dodge telegraph that
  // tracks the bird's ground projection and shrinks as it descends.
  const diveShadow = B.MeshBuilder.CreateDisc("diveShadow", { radius: 1, tessellation: 24 }, scene);
  diveShadow.rotation.x = Math.PI / 2;
  diveShadow.isPickable = false;
  const dsMat = new B.StandardMaterial("diveShadowMat", scene);
  dsMat.diffuseColor = B.Color3.Black();
  dsMat.specularColor = B.Color3.Black();
  dsMat.disableLighting = true;
  dsMat.alpha = 0.35;
  diveShadow.material = dsMat;
  diveShadow.setEnabled(false);
  // Position the decal under a bird, sizing it by altitude (lower = smaller +
  // darker, so it tightens onto the impact point as the swoop closes).
  function placeDiveShadow(b) {
    const gy = heightAt ? heightAt(b.root.position.x, b.root.position.z) : 0;
    const alt = Math.max(1, b.root.position.y - gy);
    const s = 1.2 + alt * 0.12;
    diveShadow.scaling.setAll(s);
    dsMat.alpha = Math.max(0.12, 0.5 - alt * 0.012);
    diveShadow.position.set(b.root.position.x, gy + 0.06, b.root.position.z);
  }

  // ---- Dive-attack FSM ---------------------------------------------------
  // idle -> (timer) -> telegraph -> dive -> climb -> idle. One bird at a time.
  const dive = {
    state: "idle",
    timer: PTERO_DIVE.minInterval,
    bird: null,
    t: 0,
    hitDone: false,
    targetX: 0, targetZ: 0, targetY: 0,
  };
  function randInterval() {
    return PTERO_DIVE.minInterval +
      Math.random() * (PTERO_DIVE.maxInterval - PTERO_DIVE.minInterval);
  }

  // ---- Drifting clouds (squashed, unlit, additive-soft) -----------------
  const cloudMat = new B.StandardMaterial("cloudMat", scene);
  cloudMat.diffuseColor = new B.Color3(1, 1, 1);
  cloudMat.emissiveColor = new B.Color3(0.85, 0.88, 0.95);
  cloudMat.specularColor = B.Color3.Black();
  cloudMat.alpha = 0.55;
  cloudMat.disableLighting = true;
  const clouds = [];
  for (let i = 0; i < ATMOSPHERE.cloudCount; i++) {
    const c = B.MeshBuilder.CreateSphere("cloud" + i, { segments: 6, diameter: 1 }, scene);
    c.material = cloudMat;
    c.isPickable = false;
    const s = 14 + Math.random() * 22;
    c.scaling.set(s, s * 0.4, s * 0.7);
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 120;
    c.position.set(Math.cos(a) * r, ATMOSPHERE.cloudHeight + Math.random() * 25, Math.sin(a) * r);
    clouds.push({ mesh: c, drift: 0.4 + Math.random() * 0.6 });
  }

  // ---- Floating pollen motes catching the light -------------------------
  const pollen = new B.ParticleSystem("pollen", 240, scene);
  const pdt = new B.DynamicTexture("pollenDot", { width: 32, height: 32 }, scene, false);
  const pctx = pdt.getContext();
  const pg = pctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  pg.addColorStop(0, "rgba(255,255,255,1)");
  pg.addColorStop(1, "rgba(255,255,255,0)");
  pctx.fillStyle = pg; pctx.fillRect(0, 0, 32, 32); pdt.hasAlpha = true; pdt.update();
  pollen.particleTexture = pdt;
  pollen.emitter = new B.Vector3(0, 4, 0);
  pollen.minEmitBox = new B.Vector3(-ARENA.radius, 0, -ARENA.radius);
  pollen.maxEmitBox = new B.Vector3(ARENA.radius, 14, ARENA.radius);
  pollen.color1 = new B.Color4(1, 0.95, 0.7, 0.5);
  pollen.color2 = new B.Color4(0.9, 1, 0.8, 0.35);
  pollen.colorDead = new B.Color4(1, 1, 0.8, 0);
  pollen.minSize = 0.08; pollen.maxSize = 0.22;
  pollen.minLifeTime = 4; pollen.maxLifeTime = 8;
  pollen.emitRate = 30;
  pollen.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  pollen.gravity = new B.Vector3(0, 0.1, 0);
  pollen.direction1 = new B.Vector3(-0.3, 0.2, -0.3);
  pollen.direction2 = new B.Vector3(0.3, 0.5, 0.3);
  pollen.minEmitPower = 0.2; pollen.maxEmitPower = 0.6;
  pollen.start();

  let tt = 0;
  function endDive(b) {
    if (b) { b.diving = false; b.body.material = birdMat; b.root.rotation.x = 0; }
    diveShadow.setEnabled(false);
    dive.state = "idle";
    dive.bird = null;
    dive.timer = randInterval();
  }
  return {
    update(dt) {
      tt += dt;
      for (const b of birds) {
        if (b.diving) continue;   // a diving bird is driven by updateThreats
        const a = b.phase + tt * ATMOSPHERE.birdSpeed;
        const x = Math.cos(a) * b.radius, z = Math.sin(a) * b.radius;
        b.root.position.set(x, b.height + Math.sin(tt * 0.5 + b.phase) * 2, z);
        // face along the tangent of the orbit
        b.root.rotation.y = -a + Math.PI / 2;
        b.flap += dt * 6;
        const flap = Math.sin(b.flap) * 0.6;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
      }
      for (const c of clouds) {
        c.mesh.position.x += c.drift * dt;
        if (c.mesh.position.x > 150) c.mesh.position.x = -150;
      }
    },
    // Pterosaur dive attack. Called from the game loop with the live player and
    // hit/screech callbacks so the swoop can react to the raptor's position.
    updateThreats(dt, player, onScreech, onHit) {
      const D = PTERO_DIVE;
      if (player.dead) { if (dive.state !== "idle") endDive(dive.bird); return; }
      const pp = player.dino.root.position;

      if (dive.state === "idle") {
        dive.timer -= dt;
        if (dive.timer <= 0) {
          // pick the orbiting bird nearest the player to peel off
          let best = null, bd = Infinity;
          for (const b of birds) {
            if (b.diving) continue;
            const d = Math.hypot(b.root.position.x - pp.x, b.root.position.z - pp.z);
            if (d < bd) { bd = d; best = b; }
          }
          if (best) {
            dive.bird = best; best.diving = true; best.body.material = diveMat;
            dive.state = "telegraph"; dive.t = D.telegraphTime; dive.hitDone = false;
            if (onScreech) onScreech();
          } else {
            dive.timer = 1;
          }
        }
        return;
      }

      const b = dive.bird;
      if (!b) { dive.state = "idle"; return; }
      b.flap += dt * 14;            // fast, agitated wingbeats during the attack
      const flap = Math.sin(b.flap) * 0.9;
      b.wingL.rotation.z = flap; b.wingR.rotation.z = -flap;

      if (dive.state === "telegraph") {
        // hover and lock onto the player's current spot, pulsing the glow
        dive.t -= dt;
        diveMat.emissiveColor.r = 0.4 + 0.4 * Math.sin(tt * 20);
        diveShadow.setEnabled(true);
        placeDiveShadow(b);
        const dx = pp.x - b.root.position.x, dz = pp.z - b.root.position.z;
        b.root.rotation.y = Math.atan2(dx, dz);
        if (dive.t <= 0) {
          dive.targetX = pp.x; dive.targetZ = pp.z;
          dive.targetY = pp.y + 1.2;   // aim for the raptor's body
          dive.state = "dive";
        }
        return;
      }

      if (dive.state === "dive") {
        const dx = dive.targetX - b.root.position.x;
        const dy = dive.targetY - b.root.position.y;
        const dz = dive.targetZ - b.root.position.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const step = D.diveSpeed * dt;
        b.root.position.x += (dx / d) * step;
        b.root.position.y += (dy / d) * step;
        b.root.position.z += (dz / d) * step;
        b.root.rotation.y = Math.atan2(dx, dz);
        b.root.rotation.x = -0.7;   // nose-down dive pitch
        placeDiveShadow(b);
        // contact check against the live player (target may have moved)
        if (!dive.hitDone) {
          const pd = Math.hypot(pp.x - b.root.position.x, pp.z - b.root.position.z);
          if (pd < D.hitRange && Math.abs(b.root.position.y - pp.y) < 3) {
            dive.hitDone = true;
            const before = player.health;
            player.takeDamage(D.damage);
            if (player.health < before && onHit) onHit(b.root.position.clone());
          }
        }
        if (d <= step * 1.2 || b.root.position.y <= dive.targetY + 0.1) dive.state = "climb";
        return;
      }

      if (dive.state === "climb") {
        if (diveShadow.isEnabled()) diveShadow.setEnabled(false);
        const targetY = b.height;
        b.root.position.y += D.climbSpeed * dt;
        b.root.rotation.x = 0.4;    // nose-up climb
        // glide back toward the orbit ring tangentially
        const ang = Math.atan2(b.root.position.z, b.root.position.x);
        const tx = Math.cos(ang) * b.radius, tz = Math.sin(ang) * b.radius;
        b.root.position.x += (tx - b.root.position.x) * Math.min(1, 2 * dt);
        b.root.position.z += (tz - b.root.position.z) * Math.min(1, 2 * dt);
        if (b.root.position.y >= targetY) {
          // re-seat its orbit phase so the passive loop picks up smoothly
          b.phase = ang - tt * ATMOSPHERE.birdSpeed;
          endDive(b);
        }
        return;
      }
    },
  };
}

function scatterFoliage(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  // Solid obstacle footprints (centre + repulsion radius) the AI steers around.
  const obstacles = [];
  const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 2;
  const inArena = (x, z) => Math.sqrt(x * x + z * z) < ARENA.radius - 4 && !inPond(x, z);

  // --- Trees (stylised: trunk + foliage cones), instanced -----------------
  const trunk = B.MeshBuilder.CreateCylinder("trunkSrc", { height: 4, diameterTop: 0.5, diameterBottom: 0.9, tessellation: 6 }, scene);
  const trunkMat = new B.StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = new B.Color3(0.32, 0.22, 0.13);
  trunkMat.specularColor = B.Color3.Black();
  trunk.material = trunkMat;
  trunk.isVisible = false;

  // Three leaf source cones in varied greens for colour variety across the
  // forest; each tree picks one and stacks a smaller second tier on top.
  const leafGreens = [
    new B.Color3(0.18, 0.42, 0.2),
    new B.Color3(0.14, 0.34, 0.16),
    new B.Color3(0.24, 0.48, 0.22),
  ];
  const leafSources = leafGreens.map((col, k) => {
    const m = B.MeshBuilder.CreateCylinder("leavesSrc" + k, { height: 5, diameterTop: 0, diameterBottom: 5, tessellation: 7 }, scene);
    const mat = new B.StandardMaterial("leafMat" + k, scene);
    mat.diffuseColor = col;
    mat.specularColor = B.Color3.Black();
    m.material = mat;
    m.isVisible = false;
    return m;
  });

  for (let i = 0; i < ARENA.treeCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z) || Math.sqrt(x * x + z * z) < 18);
    const s = rand(0.8, 1.6);
    const y = heightAt(x, z);
    const t = trunk.createInstance("trunk" + i);
    t.position.set(x, y + 2 * s, z); t.scaling.setAll(s); t.checkCollisions = true;
    shadow.addShadowCaster(t);
    obstacles.push({ x, z, r: 1.1 * s });
    const src = leafSources[i % leafSources.length];
    const l = src.createInstance("leaves" + i);
    l.position.set(x, y + 5.0 * s, z); l.scaling.setAll(s * rand(0.9, 1.3));
    l.rotation.y = rand(0, Math.PI);
    shadow.addShadowCaster(l);
    // a smaller second tier crowns the tree for a fuller conifer silhouette
    const l2 = src.createInstance("leavesTop" + i);
    l2.position.set(x, y + 7.6 * s, z); l2.scaling.setAll(s * rand(0.55, 0.75));
    l2.rotation.y = rand(0, Math.PI);
    shadow.addShadowCaster(l2);
  }

  // --- Rocks --------------------------------------------------------------
  const rockSrc = B.MeshBuilder.CreatePolyhedron("rockSrc", { type: 1, size: 1 }, scene);
  const rockMat = new B.StandardMaterial("rockMat", scene);
  rockMat.diffuseColor = new B.Color3(0.42, 0.42, 0.45);
  rockMat.specularColor = new B.Color3(0.1, 0.1, 0.1);
  rockSrc.material = rockMat;
  rockSrc.isVisible = false;
  for (let i = 0; i < ARENA.rockCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z));
    const s = rand(0.6, 2.4);
    const r = rockSrc.createInstance("rock" + i);
    r.position.set(x, heightAt(x, z) + s * 0.4, z);
    r.scaling.set(s, s * rand(0.6, 1), s * rand(0.8, 1.2));
    r.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1));
    r.checkCollisions = s > 1.2;
    if (s > 1.2) obstacles.push({ x, z, r: s });
    shadow.addShadowCaster(r);
  }

  // --- Grass tufts (thin instanced quads) ---------------------------------
  const blade = B.MeshBuilder.CreateCylinder("bladeSrc", { height: 1, diameterTop: 0, diameterBottom: 0.5, tessellation: 4 }, scene);
  const grassMat = new B.StandardMaterial("grassMat", scene);
  grassMat.diffuseColor = new B.Color3(0.3, 0.55, 0.24);
  grassMat.specularColor = B.Color3.Black();
  blade.material = grassMat;
  blade.isVisible = false;
  for (let i = 0; i < ARENA.grassPatches; i++) {
    let x = rand(-ARENA.radius, ARENA.radius), z = rand(-ARENA.radius, ARENA.radius);
    if (!inArena(x, z)) continue;
    const s = rand(0.6, 1.6);
    const g = blade.createInstance("grass" + i);
    g.position.set(x, heightAt(x, z) + s * 0.5, z);
    g.scaling.set(s, s, s);
    g.isPickable = false;
  }

  return obstacles;
}

// small deterministic PRNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
