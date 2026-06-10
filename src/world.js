import { ARENA, DAYNIGHT, DUSK, ATMOSPHERE, WATER, PTERO_DIVE, ENV } from "./config.js";

// Smooth basin profile for the pond: 1 at the centre, easing to 0 at the rim.
// Carved into the terrain heightmap so the pool sits in a real depression.
function basinFactor(x, z) {
  const d = Math.hypot(x - WATER.centerX, z - WATER.centerZ);
  if (d >= WATER.radius) return 0;
  const t = 1 - d / WATER.radius;
  return t * t * (3 - 2 * t); // smoothstep
}

// Dry rocky biome membership: 1 at the zone centre, feathering to 0 across
// edgeFeather just outside the radius, so the arid patch blends into the green.
function dryZoneFactor(x, z) {
  const Z = ENV.dryZone;
  const d = Math.hypot(x - Z.centerX, z - Z.centerZ);
  if (d <= Z.radius) return 1;
  if (d >= Z.radius + Z.edgeFeather) return 0;
  const t = 1 - (d - Z.radius) / Z.edgeFeather;
  return t * t * (3 - 2 * t);
}

// Builds terrain, sky, lighting, fog, foliage and the day/night cycle.
// Returns handles the rest of the game needs (ground mesh for collisions,
// shadow generator, an update fn for the day/night cycle).

export function buildWorld(scene) {
  const B = window.BABYLON;

  // --- Sky / clear + fog ---------------------------------------------------
  // Richer, depth-graded exp2 fog in a desaturated sage-grey haze (ENV) so the
  // distance fades softly instead of hitting a wall. The HDRI sky (env.js)
  // sits behind the painted gradient dome below.
  scene.clearColor = new B.Color4(0.55, 0.72, 0.86, 1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = ENV.fogDensity;
  scene.fogColor = new B.Color3(ENV.fogColor[0], ENV.fogColor[1], ENV.fogColor[2]);

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

  // Gentle height noise via layered sines (deterministic, cheap). We also bake
  // a per-vertex GRASS<->SOIL blend into vertex colours: lush desaturated grass
  // on the flats, earthy soil on the steep rim slopes and the pond edge. The
  // PBR material multiplies its real albedo by these so one tiled texture set
  // reads as a varied natural ground (no flat colour, no neon green).
  const positions = ground.getVerticesData(B.VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const gT = ENV.grassTint, sT = ENV.soilTint;
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
    // Soil weight: high on the raised rim and right around the pond shoreline,
    // plus a little procedural mottling so patches of bare earth show through.
    const rimSoil = Math.min(1, Math.max(0, (d - ARENA.radius * 0.78) / (ARENA.radius * 0.4)));
    const pondSoil = basinFactor(x, z) > 0.02 ? 0.6 : 0;
    const mottle = 0.18 * (0.5 + 0.5 * Math.sin(x * 0.4 + 1.7) * Math.cos(z * 0.37));
    const soil = Math.min(1, rimSoil + pondSoil + mottle);
    let r = gT[0] * (1 - soil) + sT[0] * soil;
    let g = gT[1] * (1 - soil) + sT[1] * soil;
    let b = gT[2] * (1 - soil) + sT[2] * soil;
    // Dry rocky biome: blend toward the arid ground tint inside the zone.
    const dz = dryZoneFactor(x, z);
    if (dz > 0) {
      const dGT = ENV.dryZone.groundTint;
      r = r * (1 - dz) + dGT[0] * dz;
      g = g * (1 - dz) + dGT[1] * dz;
      b = b * (1 - dz) + dGT[2] * dz;
    }
    const ci = (i / 3) * 4;
    colors[ci] = r; colors[ci + 1] = g; colors[ci + 2] = b; colors[ci + 3] = 1;
  }
  ground.updateVerticesData(B.VertexBuffer.PositionKind, positions);
  ground.setVerticesData(B.VertexBuffer.ColorKind, colors);
  ground.createNormals(true);
  ground.checkCollisions = true;
  ground.receiveShadows = true;

  const groundMat = makeGroundPBR(scene);
  ground.material = groundMat;
  ground.useVertexColors = true;

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

  const foliage = scatterFoliage(scene, shadow, heightAt);
  const obstacles = foliage.obstacles;
  const atmosphere = buildAtmosphere(scene, heightAt);

  // --- Day/night cycle + run-scoped dusk arc -------------------------------
  const DAY_START = 0.25; // mid-morning phase — the bright noon look the run opens on
  let t = DAY_START;      // ambient cycle phase (mood only)
  let t_water = 0;
  let runSeconds = 0;     // live run time driving the dusk arc
  let duskFactor = 0;     // 0 full day .. 1 deepest dusk (the gameplay knob)
  // The day/night clock + dusk arc only advance once a run is live, so the world
  // stays bright on the title screen. Atmosphere + water still animate either way.
  const update = (dt, advanceDayClock = true) => {
    atmosphere.update(dt);
    foliage.windUpdate(dt);   // subtle canopy + ground-cover sway
    // subtle water shimmer
    t_water += dt;
    waterMat.emissiveColor.b = 0.16 + 0.05 * Math.sin(t_water * 1.5);
    water.position.y = waterY + Math.sin(t_water * 0.8) * 0.03;
    if (advanceDayClock) {
      t = (t + dt / DAYNIGHT.cycleSeconds) % 1;
      runSeconds += dt;
    }
    // Dusk arc: full day for startSeconds, then a smooth ramp to 1 by
    // fullDuskSeconds. This is the gameplay-facing time-of-day, separate from
    // the slow ambient `t` so a single run actually feels it.
    const raw = (runSeconds - DUSK.startSeconds) /
      Math.max(0.001, DUSK.fullDuskSeconds - DUSK.startSeconds);
    const clamped = Math.min(1, Math.max(0, raw));
    duskFactor = clamped * clamped * (3 - 2 * clamped); // smoothstep

    const ang = t * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    sun.direction = new B.Vector3(-sx, -Math.max(0.15, sy), -0.4).normalize();
    // Ambient day factor (mood) floored so the slow cycle never darkens play.
    const ambientDay = Math.max(DAYNIGHT.minDayLight, sy * 0.5 + 0.5);
    // Dusk dims the arena toward `minLight` (floored — danger, not blindness).
    const day = ambientDay * (1 - (1 - DUSK.minLight) * duskFactor);
    sun.intensity = 0.2 + day * 1.5;
    const sunsetTint = Math.max(0, 1 - Math.abs(sy) * 3);
    // Warm the sun + sky toward orange as dusk deepens (readable "it's getting late").
    const warm = DUSK.warmth * duskFactor;
    sun.diffuse = new B.Color3(1.0, 0.96 - sunsetTint * 0.3 - warm * 0.25, 0.86 - sunsetTint * 0.5 - warm * 0.5);
    hemi.intensity = 0.18 + day * 0.5;
    const skyR = (0.12 + day * 0.43 + sunsetTint * 0.25) + warm * 0.25;
    const skyG = (0.16 + day * 0.56) - warm * 0.06;
    const skyB = (0.28 + day * 0.62) - warm * 0.22;
    skyMat.emissiveColor.set(skyR, skyG, skyB);
    // Fog stays in the desaturated sage-grey haze (ENV.fogColor) but drifts a
    // little with the sky/dusk so it never fights the time-of-day — a richer,
    // depth-graded haze rather than a bright cartoon wall.
    const fc = ENV.fogColor;
    scene.fogColor.set(
      fc[0] * 0.7 + skyR * 0.3,
      fc[1] * 0.7 + skyG * 0.3,
      fc[2] * 0.7 + skyB * 0.3,
    );
    scene.clearColor.set(skyR, skyG, skyB, 1);
  };

  // Soft restart must also rewind the ambient day clock, else repeated retries
  // drift `t` toward evening and the arena darkens run-on-run (the dusk arc is
  // the only intended darkening; the ambient cycle should reopen bright).
  const resetDusk = () => { runSeconds = 0; duskFactor = 0; t = DAY_START; };

  return {
    ground, shadow, heightAt, update, inWater, waterCenter, waterSurfaceY: waterY,
    obstacles, resetDusk,
    getDusk: () => duskFactor,
    updateThreats: (dt, player, onScreech, onHit) =>
      atmosphere.updateThreats(dt, player, onScreech, onHit),
    resetThreats: () => atmosphere.resetThreats(),
  };
}

// A sparse ring of reeds around the pond shoreline so the water edge reads
// clearly and the pool feels inhabited. Pure set dressing.
function buildReeds(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const reedSrc = B.MeshBuilder.CreateCylinder("reedSrc",
    { height: 2.2, diameterTop: 0.04, diameterBottom: 0.18, tessellation: 4 }, scene);
  const reedMat = new B.StandardMaterial("reedMat", scene);
  reedMat.diffuseColor = new B.Color3(0.34, 0.40, 0.22); // desaturated sage reed
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

// Photoreal PBR ground material: tiled CC0 albedo + normal + roughness + AO
// (ambientCG, see CREDITS.md), tinted toward a desaturated natural palette and
// modulated per-vertex (grass <-> soil) by the baked vertex colours. Replaces
// the old flat painted DynamicTexture. Lit by the HDRI environment (env.js) +
// the directional sun, so it picks up real normal-mapped relief and AO.
function makeGroundPBR(scene) {
  const B = window.BABYLON;
  const base = ENV.texturePath;
  const tile = ENV.groundTiling;
  const tex = (file, isData = false) => {
    const t = new B.Texture(base + file, scene, null, false);
    t.uScale = t.vScale = tile;
    t.anisotropicFilteringLevel = 8;  // crisp grazing-angle detail across the big plane
    return t;
  };

  const mat = new B.PBRMaterial("groundPBR", scene);
  mat.albedoTexture = tex(ENV.grassTextures.albedo);
  mat.bumpTexture = tex(ENV.grassTextures.normal);
  mat.bumpTexture.level = ENV.groundNormalStrength;
  // ambientCG normals are OpenGL convention (NormalGL), which Babylon expects.
  // Dielectric ground: no metalness, roughness driven by the standalone map.
  mat.metallic = 0;
  // ambientCG Roughness.jpg is a standalone greyscale map. Feed it as the
  // metallicTexture and tell PBR to read roughness from green (== red == value
  // for a greyscale source) and metalness from blue (=0 here).
  mat.metallicTexture = tex(ENV.grassTextures.roughness);
  mat.useRoughnessFromMetallicTextureGreen = true;
  mat.useRoughnessFromMetallicTextureAlpha = false;
  mat.useMetallnessFromMetallicTextureBlue = true;
  // Baked AO map via the ambient slot.
  mat.ambientTexture = tex(ENV.grassTextures.ao);
  mat.ambientTextureStrength = 1.0;
  mat.useAmbientInGrayScale = true;
  // IBL contribution scaled to taste (matte outdoor ground).
  mat.environmentIntensity = ENV.iblIntensity;
  return mat;
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
    // Soft restart: abort any in-flight dive so the new run starts with the
    // flock peacefully orbiting (no bird left nose-down with the dive glow on).
    resetThreats() {
      if (dive.state !== "idle") endDive(dive.bird);
      dive.timer = randInterval();
    },
  };
}

// An alpha-cut card material: a CC0 cutout atlas (Color + separate Opacity),
// cut by ALPHA-TEST (not blending — sort-free + cheap), double-sided, tinted
// per palette entry. Lit by the scene so cards catch the sun + IBL.
function makeCardMaterial(scene, name, albedoFile, opacityFile, tint) {
  const B = window.BABYLON;
  const base = ENV.texturePath;
  const m = new B.StandardMaterial(name, scene);
  const alb = new B.Texture(base + albedoFile, scene);
  m.diffuseTexture = alb;
  m.opacityTexture = new B.Texture(base + opacityFile, scene);
  m.opacityTexture.getAlphaFromRGB = true;   // opacity map is greyscale RGB
  m.diffuseColor = new B.Color3(tint[0], tint[1], tint[2]);
  m.specularColor = B.Color3.Black();
  m.backFaceCulling = false;                  // cards visible from both sides
  m.transparencyMode = B.Material.MATERIAL_ALPHATEST;
  m.alphaCutOff = ENV.alphaCutOff;
  m.useAlphaFromDiffuseTexture = false;
  return m;
}

// A crossed-quad card cluster (N planes fanned about Y) so a billboard reads as
// a 3D clump from any angle, not a flat sprite. `vBand`=[v0,v1] crops the UVs to
// ONE row of the atlas (the atlases stack their cutouts vertically, so a V-crop
// isolates a single full grass blade / leaf spray rather than slicing through
// all of them). `pitch` tilts the quads (drooping conifer sprays vs upright
// grass). Returns an invisible source mesh ready to instance.
function makeCardClusterSource(scene, name, mat, quads, w, h, uBand, vBand, pitch) {
  const B = window.BABYLON;
  const [u0, u1] = uBand, [v0, v1] = vBand;
  const parts = [];
  for (let q = 0; q < quads; q++) {
    const p = B.MeshBuilder.CreatePlane(name + "_q" + q, { width: w, height: h }, scene);
    p.rotation.y = (q / quads) * Math.PI;     // fan the quads around Y
    if (pitch) p.rotation.x = pitch;          // droop/tilt
    p.bakeCurrentTransformIntoVertices();
    // crop UVs to the chosen atlas sub-region (isolate ONE cutout: grass blades
    // separate along U/columns, leaf sprays stack along V/rows).
    const uv = p.getVerticesData(B.VertexBuffer.UVKind);
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = u0 + uv[i] * (u1 - u0);
      uv[i + 1] = v0 + uv[i + 1] * (v1 - v0);
    }
    p.setVerticesData(B.VertexBuffer.UVKind, uv);
    parts.push(p);
  }
  const merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  merged.name = name;
  merged.material = mat;
  merged.isVisible = false;
  merged.alwaysSelectAsActiveMesh = true;
  return merged;
}

function scatterFoliage(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  const tex = (file, tile) => { const t = new B.Texture(ENV.texturePath + file, scene); t.uScale = t.vScale = tile; t.anisotropicFilteringLevel = 8; return t; };
  // Solid obstacle footprints (centre + repulsion radius) the AI steers around.
  const obstacles = [];
  const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 2;
  const inArena = (x, z) => Math.sqrt(x * x + z * z) < ARENA.radius - 4 && !inPond(x, z);
  // Things that sway in the wind (cards tilt about Z).
  const swayers = [];

  // --- Trunks: real CC0 BARK PBR (albedo + normal + roughness) ------------
  const trunk = B.MeshBuilder.CreateCylinder("trunkSrc", { height: 4, diameterTop: 0.42, diameterBottom: 0.95, tessellation: 8 }, scene);
  const barkMat = new B.PBRMaterial("barkMat", scene);
  barkMat.albedoTexture = tex(ENV.barkTextures.albedo, ENV.barkTiling);
  barkMat.bumpTexture = tex(ENV.barkTextures.normal, ENV.barkTiling);
  barkMat.metallic = 0; barkMat.roughness = 1;
  barkMat.metallicTexture = tex(ENV.barkTextures.roughness, ENV.barkTiling);
  barkMat.useRoughnessFromMetallicTextureGreen = true;
  barkMat.useMetallnessFromMetallicTextureBlue = true;
  barkMat.albedoColor = new B.Color3(ENV.trunkColor[0], ENV.trunkColor[1], ENV.trunkColor[2]);
  barkMat.environmentIntensity = ENV.iblIntensity;
  trunk.material = barkMat;
  trunk.isVisible = false;

  // Bleached/grey bark for dead + gnarled trees (same bark maps, drier tint).
  const deadBarkMat = new B.PBRMaterial("deadBarkMat", scene);
  deadBarkMat.albedoTexture = tex(ENV.barkTextures.albedo, ENV.barkTiling);
  deadBarkMat.bumpTexture = tex(ENV.barkTextures.normal, ENV.barkTiling);
  deadBarkMat.metallic = 0; deadBarkMat.roughness = 1;
  deadBarkMat.albedoColor = new B.Color3(ENV.deadTrunkColor[0], ENV.deadTrunkColor[1], ENV.deadTrunkColor[2]);
  deadBarkMat.environmentIntensity = ENV.iblIntensity;
  // Dead trunk source (instances can't override their source's material, so
  // gnarled trees need their own bleached-bark trunk source to instance from).
  const deadTrunk = B.MeshBuilder.CreateCylinder("deadTrunkSrc", { height: 4, diameterTop: 0.30, diameterBottom: 0.85, tessellation: 7 }, scene);
  deadTrunk.material = deadBarkMat; deadTrunk.isVisible = false;
  // A bare branch-stub source (thin tapered bark cylinder) for gnarled/dead
  // trees — instanced, angled per branch.
  const branch = B.MeshBuilder.CreateCylinder("branchSrc", { height: 3, diameterTop: 0.08, diameterBottom: 0.3, tessellation: 5 }, scene);
  branch.material = deadBarkMat; branch.isVisible = false;

  // --- Canopy: textured alpha-cut LEAF cards (green leaf sprays) -----------
  // One drooping-spray cluster source per palette green; each crops to one row
  // of the leaf atlas (a single full branch spray) so cards read as foliage.
  const leafRows = [[0.04, 0.30], [0.36, 0.62], [0.70, 0.97]]; // the 3 sprays in the atlas
  const leafSources = [];
  ENV.foliageGreens.forEach((tint, k) => {
    const mat = makeCardMaterial(scene, "leafCardMat" + k, ENV.leafCardAlbedo, ENV.leafCardOpacity, tint);
    const row = leafRows[k % leafRows.length];
    leafSources.push(makeCardClusterSource(scene, "leafClu" + k, mat, 3, 5.5, 2.4, [0.02, 0.98], row, -0.45));
  });
  // Big upright frond cards for palms (steep pitch, large).
  const frondSources = ENV.foliageGreens.map((tint, k) =>
    makeCardClusterSource(scene, "frondClu" + k, makeCardMaterial(scene, "frondMat" + k, ENV.leafCardAlbedo, ENV.leafCardOpacity, tint),
      2, 6.5, 3.0, [0.02, 0.98], leafRows[k % leafRows.length], -0.15));
  const pickGreen = (base) => leafSources[(base + (rng() < 0.4 ? 1 + (rng() < 0.5 ? 1 : 0) : 0)) % leafSources.length];

  // Per-species crown builders. Each gets the trunk-top + scale and stacks
  // textured cards (or bare branches) into a distinct silhouette.
  function addCard(src, x, y, z, cs, ampMul, tag) {
    const l = src.createInstance(tag);
    l.position.set(x, y, z); l.scaling.setAll(cs); l.rotation.y = rng() * Math.PI * 2;
    l.isPickable = false; shadow.addShadowCaster(l);
    swayers.push({ mesh: l, base: 0, phase: rng() * Math.PI * 2, amp: ENV.windStrength * ampMul });
    return l;
  }
  const SPECIES = {
    // tall, narrow, multi-tier drooping crown
    conifer(x, y, z, s, base, i) {
      const top = y + 3.8 * s, H = 4.0 * s, R = 1.7 * s, n = ENV.cardsPerCanopy + 1;
      for (let c = 0; c < n; c++) {
        const tier = c / n, ring = R * (1 - tier * 0.85) * rand(0.4, 1.0), a = rng() * 6.283;
        addCard(pickGreen(base), x + Math.cos(a) * ring, top + tier * H + rand(-0.2, 0.2) * s, z + Math.sin(a) * ring,
          s * rand(0.7, 1.15) * (1 - tier * 0.35), rand(0.8, 1.4), "leaves" + i + "_" + c);
      }
    },
    // shorter trunk, wide rounded low dome of cards
    broadleaf(x, y, z, s, base, i) {
      const top = y + 3.0 * s, H = 2.6 * s, R = 2.6 * s, n = ENV.cardsPerCanopy + 2;
      for (let c = 0; c < n; c++) {
        const tier = c / n, ring = R * (1 - tier * 0.55) * rand(0.5, 1.0), a = rng() * 6.283;
        addCard(pickGreen(base), x + Math.cos(a) * ring, top + tier * H + rand(-0.2, 0.2) * s, z + Math.sin(a) * ring,
          s * rand(0.85, 1.3) * (1 - tier * 0.2), rand(0.9, 1.5), "leaves" + i + "_" + c);
      }
    },
    // bare gnarled/dead: a few splayed branch stubs, no foliage (or a wisp)
    gnarled(x, y, z, s, base, i) {
      const nB = 3 + Math.floor(rng() * 3);
      for (let b = 0; b < nB; b++) {
        const br = branch.createInstance("branch" + i + "_" + b);
        const a = rng() * 6.283, lean = rand(0.5, 1.1);
        br.position.set(x, y + (2.5 + rng() * 1.5) * s, z);
        br.scaling.set(s * rand(0.6, 1.0), s * rand(0.7, 1.2), s * rand(0.6, 1.0));
        br.rotation.set(Math.cos(a) * lean, rng() * 6.283, Math.sin(a) * lean);
        br.isPickable = false; shadow.addShadowCaster(br);
      }
      // a sparse dead wisp at the top sometimes
      if (rng() < 0.3) addCard(pickGreen(base), x, y + 4.5 * s, z, s * 0.7, 1.2, "leaves" + i + "_w");
    },
    // tall thin trunk, crown only at the very top: big fronds fanning up/out
    palm(x, y, z, s, base, i) {
      const top = y + 5.2 * s, n = 6;
      for (let c = 0; c < n; c++) {
        const a = (c / n) * 6.283 + rng() * 0.4;
        const f = frondSources[(base + c) % frondSources.length].createInstance("leaves" + i + "_" + c);
        f.position.set(x + Math.cos(a) * 1.1 * s, top + rand(-0.2, 0.3) * s, z + Math.sin(a) * 1.1 * s);
        f.scaling.setAll(s * rand(0.85, 1.1));
        f.rotation.y = a; f.rotation.x = -0.5 - rng() * 0.3; // arch outward+down
        f.isPickable = false; shadow.addShadowCaster(f);
        swayers.push({ mesh: f, base: f.rotation.z, phase: rng() * 6.283, amp: ENV.windStrength * 1.6 });
      }
    },
  };
  // weighted species roll
  const wEntries = Object.entries(ENV.treeTypeWeights);
  const wTotal = wEntries.reduce((a, [, w]) => a + w, 0);
  const rollSpecies = () => {
    let r = rng() * wTotal;
    for (const [k, w] of wEntries) { if ((r -= w) <= 0) return k; }
    return wEntries[0][0];
  };

  for (let i = 0; i < ARENA.treeCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z) || Math.sqrt(x * x + z * z) < 18);
    const y = heightAt(x, z);
    const dz = dryZoneFactor(x, z);
    // Dry zone biases toward gnarled/dead trees; green areas use the weighted mix.
    const species = (dz > 0.4 && rng() < ENV.dryZone.deadTreeBias) ? "gnarled" : rollSpecies();
    // palms a touch taller/thinner; gnarled a touch shorter; others varied
    const s = rand(0.7, 1.9) * (species === "palm" ? 1.15 : species === "gnarled" ? 0.9 : 1);
    const t = (species === "gnarled" ? deadTrunk : trunk).createInstance("trunk" + i);
    t.position.set(x, y + 2 * s, z);
    const thin = species === "palm" ? 0.6 : species === "gnarled" ? 0.8 : 1;
    t.scaling.set(s * rand(0.85, 1.15) * thin, s * rand(0.9, 1.3) * (species === "palm" ? 1.4 : 1), s * rand(0.85, 1.15) * thin);
    t.checkCollisions = true;
    shadow.addShadowCaster(t);
    obstacles.push({ x, z, r: 1.1 * s });
    SPECIES[species](x, y, z, s, i % leafSources.length, i);
  }

  // --- Rocks: real CC0 ROCK PBR on IRREGULAR displaced geometry ------------
  // Smooth dodecahedra are gone. Each rock is a subdivided icosphere whose
  // vertices are noise-displaced (jagged, no two alike), wearing a tiled rock
  // albedo+normal+roughness PBR material. Rocks sit PARTIALLY BURIED (their
  // centre dropped below ground) at varied sizes/orientations.
  const rockMat = new B.PBRMaterial("rockMat", scene);
  rockMat.albedoTexture = tex(ENV.rockTextures.albedo, ENV.rockTiling);
  rockMat.bumpTexture = tex(ENV.rockTextures.normal, ENV.rockTiling);
  rockMat.metallic = 0; rockMat.roughness = 1;
  rockMat.metallicTexture = tex(ENV.rockTextures.roughness, ENV.rockTiling);
  rockMat.useRoughnessFromMetallicTextureGreen = true;
  rockMat.useMetallnessFromMetallicTextureBlue = true;
  rockMat.albedoColor = new B.Color3(ENV.rockColor[0], ENV.rockColor[1], ENV.rockColor[2]);
  rockMat.environmentIntensity = ENV.iblIntensity;
  // A small library of distinct displaced boulder shapes, instanced for perf.
  const rockShapes = [];
  for (let v = 0; v < ENV.rockVariants; v++) {
    const ico = B.MeshBuilder.CreateIcoSphere("rockSrc" + v, { radius: 1, subdivisions: 3, flat: true }, scene);
    const vp = ico.getVerticesData(B.VertexBuffer.PositionKind);
    for (let i = 0; i < vp.length; i += 3) {
      const nx = vp[i], ny = vp[i + 1], nz = vp[i + 2];
      // layered value noise via sines keyed on the variant for distinct shapes
      const d = 1
        + 0.32 * Math.sin(nx * 3.1 + v * 2.0) * Math.cos(nz * 2.7 + v)
        + 0.20 * Math.sin(ny * 4.3 + v) * Math.sin(nx * 2.1)
        + 0.12 * Math.cos(nz * 5.7 + v * 3);
      vp[i] = nx * d; vp[i + 1] = ny * d * 0.82; vp[i + 2] = nz * d; // squash slightly
    }
    ico.setVerticesData(B.VertexBuffer.PositionKind, vp);
    ico.createNormals(true);
    ico.material = rockMat;
    ico.isVisible = false;
    rockShapes.push(ico);
  }
  const placeRock = (x, z, idx) => {
    const s = rand(0.7, 2.6);
    const r = rockShapes[idx % rockShapes.length].createInstance("rock" + idx);
    // partially buried: drop the centre below the surface so it emerges from soil
    r.position.set(x, heightAt(x, z) + s * 0.45 - s * 0.4, z);
    r.scaling.set(s * rand(0.85, 1.2), s * rand(0.6, 1.0), s * rand(0.85, 1.2));
    r.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    r.checkCollisions = s > 1.3;
    if (s > 1.3) obstacles.push({ x, z, r: s * 0.9 });
    shadow.addShadowCaster(r);
  };
  // Base scatter across the arena.
  for (let i = 0; i < ARENA.rockCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z));
    placeRock(x, z, i);
  }
  // Dry rocky biome: denser boulders clustered in the arid zone.
  const dzExtra = Math.round(ARENA.rockCount * (ENV.dryZone.rockDensityMul - 1));
  for (let i = 0; i < dzExtra; i++) {
    let x, z, tries = 0;
    do {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * ENV.dryZone.radius;
      x = ENV.dryZone.centerX + Math.cos(a) * rr; z = ENV.dryZone.centerZ + Math.sin(a) * rr;
    } while (!inArena(x, z) && ++tries < 6);
    if (inArena(x, z)) placeRock(x, z, ARENA.rockCount + i);
  }

  // --- Grass: textured alpha-cut GRASS-BLADE cards ------------------------
  // Crossed-quad clumps of real cutout grass blades (Foliage001 atlas), tinted
  // per palette green + size-varied so the ground cover is irregular and lush,
  // not solid cones. One source per palette green × atlas slice; both the
  // mid-field "patches" and the dense near "ground cover" instance off these.
  // Grass blades separate along U (columns) in the Foliage001 atlas, so crop a
  // narrow U band (a few blades) at full V (the tall blade). Two crossed quads.
  const grassCols = [[0.0, 0.28], [0.30, 0.58], [0.60, 0.88], [0.12, 0.42]];
  const grassSources = [];
  ENV.foliageGreens.forEach((tint, k) => {
    const mat = makeCardMaterial(scene, "grassCardMat" + k, ENV.grassCardAlbedo, ENV.grassCardOpacity, tint);
    const col = grassCols[k % grassCols.length];
    grassSources.push(makeCardClusterSource(scene, "grassClu" + k, mat, 2, 1.6, 1.3, col, [0.0, 1.0], 0));
  });
  const coverSwayers = [];
  const placeGrassCard = (x, z, sMin, sMax, idx, tag) => {
    const src = grassSources[Math.floor(rng() * grassSources.length)];
    const s = rand(sMin, sMax);
    const g = src.createInstance(tag + idx);
    g.position.set(x, heightAt(x, z) + s * 0.55, z);
    g.scaling.set(s * rand(0.8, 1.4), s * rand(0.8, 1.5), s * rand(0.8, 1.4)); // clumped + height-varied
    g.rotation.y = rng() * Math.PI;
    g.isPickable = false;
    coverSwayers.push({ mesh: g, base: 0, phase: rng() * Math.PI * 2, amp: ENV.windStrength * rand(1.0, 1.8) });
    return g;
  };
  // Dry zone keeps grass sparse (arid). Returns true if this spot should be
  // skipped given the zone's grassDensityMul.
  const dryThins = (x, z) => {
    const dz = dryZoneFactor(x, z);
    return dz > 0 && rng() > (1 - dz) + dz * ENV.dryZone.grassDensityMul;
  };
  // Mid-field scatter (uniform, like the old grassPatches).
  for (let i = 0; i < ARENA.grassPatches; i++) {
    const x = rand(-ARENA.radius, ARENA.radius), z = rand(-ARENA.radius, ARENA.radius);
    if (!inArena(x, z) || dryThins(x, z)) continue;
    placeGrassCard(x, z, 0.7, 1.7, i, "grass");
  }
  // Dense near ground cover, distance-faded for perf (lush foreground, cheap far).
  for (let i = 0; i < ENV.groundCoverCount; i++) {
    const x = rand(-ARENA.radius, ARENA.radius), z = rand(-ARENA.radius, ARENA.radius);
    if (!inArena(x, z) || dryThins(x, z)) continue;
    const d = Math.sqrt(x * x + z * z);
    const fade = 1 - Math.min(1, Math.max(0,
      (d - ENV.groundCoverFadeStart) / (ENV.groundCoverFadeEnd - ENV.groundCoverFadeStart)));
    if (rng() > fade) continue;            // probabilistic thinning with distance
    placeGrassCard(x, z, 0.5, 1.1, i, "cover");
  }

  // Wind sway: ease each registered card's tilt with a phase-offset sine so the
  // whole valley breathes gently. Cheap (a sin per swayer).
  let wt = 0;
  const windUpdate = (dt) => {
    wt += dt * ENV.windSpeed;
    for (const sw of swayers) sw.mesh.rotation.z = sw.base + Math.sin(wt + sw.phase) * sw.amp;
    for (const sw of coverSwayers) sw.mesh.rotation.z = sw.base + Math.sin(wt + sw.phase) * sw.amp;
  };

  return { obstacles, windUpdate };
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
