import { ARENA, DAYNIGHT } from "./config.js";

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

  // Gradient skydome
  const sky = B.MeshBuilder.CreateSphere("sky", { diameter: ARENA.groundSize * 4, sideOrientation: B.Mesh.BACKSIDE }, scene);
  const skyMat = new B.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
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
    positions[i + 1] = h;
  }
  ground.updateVerticesData(B.VertexBuffer.PositionKind, positions);
  ground.createNormals(true);
  ground.checkCollisions = true;
  ground.receiveShadows = true;

  const groundMat = new B.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new B.Color3(0.36, 0.5, 0.26);
  groundMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
  ground.material = groundMat;

  // sample terrain height for placement
  const heightAt = (x, z) => {
    const d = Math.sqrt(x * x + z * z);
    let h = Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6
          + Math.sin(x * 0.13 + z * 0.07) * 0.7;
    const rim = Math.max(0, d - ARENA.radius) * 0.12;
    return h * Math.min(1, d / ARENA.radius * 1.2) + rim;
  };

  scatterFoliage(scene, shadow, heightAt);

  // --- Day/night cycle -----------------------------------------------------
  let t = 0.25; // start mid-morning
  const update = (dt) => {
    t = (t + dt / DAYNIGHT.cycleSeconds) % 1;
    const ang = t * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    sun.direction = new B.Vector3(-sx, -Math.max(0.15, sy), -0.4).normalize();
    const day = Math.max(0, sy);          // 0 night .. 1 noon
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

  return { ground, shadow, heightAt, update };
}

function scatterFoliage(scene, shadow, heightAt) {
  const B = window.BABYLON;
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  const inArena = (x, z) => Math.sqrt(x * x + z * z) < ARENA.radius - 4;

  // --- Trees (stylised: trunk + foliage cones), instanced -----------------
  const trunk = B.MeshBuilder.CreateCylinder("trunkSrc", { height: 4, diameterTop: 0.5, diameterBottom: 0.9, tessellation: 6 }, scene);
  const trunkMat = new B.StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = new B.Color3(0.32, 0.22, 0.13);
  trunkMat.specularColor = B.Color3.Black();
  trunk.material = trunkMat;
  trunk.isVisible = false;

  const leaves = B.MeshBuilder.CreateCylinder("leavesSrc", { height: 5, diameterTop: 0, diameterBottom: 5, tessellation: 7 }, scene);
  const leafMat = new B.StandardMaterial("leafMat", scene);
  leafMat.diffuseColor = new B.Color3(0.18, 0.42, 0.2);
  leafMat.specularColor = B.Color3.Black();
  leaves.material = leafMat;
  leaves.isVisible = false;

  for (let i = 0; i < ARENA.treeCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z) || Math.sqrt(x * x + z * z) < 18);
    const s = rand(0.8, 1.6);
    const y = heightAt(x, z);
    const t = trunk.createInstance("trunk" + i);
    t.position.set(x, y + 2 * s, z); t.scaling.setAll(s); t.checkCollisions = true;
    shadow.addShadowCaster(t);
    const l = leaves.createInstance("leaves" + i);
    l.position.set(x, y + 5.5 * s, z); l.scaling.setAll(s * rand(0.9, 1.3));
    l.rotation.y = rand(0, Math.PI);
    shadow.addShadowCaster(l);
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
