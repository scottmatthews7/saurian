import { ARENA, DAYNIGHT, DUSK, ATMOSPHERE, WATER, OCEAN, PTERO_DIVE, ENV } from "./config.js";
import { buildFlyer } from "./flyer.js";

// Smooth basin profile for the pond: 1 at the centre, easing to 0 at the rim.
// Carved into the terrain heightmap so the pool sits in a real depression.
function basinFactor(x, z) {
  const d = Math.hypot(x - WATER.centerX, z - WATER.centerZ);
  if (d >= WATER.radius) return 0;
  const t = 1 - d / WATER.radius;
  return t * t * (3 - 2 * t); // smoothstep
}

// Microclimate zone membership: 1 at the zone centre, feathering to 0 across
// edgeFeather just outside the radius, so each patch blends into the grassland.
// Used by the dry rocky corner and the jungle thicket (the pond + reeds is the
// third, wetland, microclimate) — all pockets WITHIN the one world.
function zoneFactor(Z, x, z) {
  const d = Math.hypot(x - Z.centerX, z - Z.centerZ);
  if (d <= Z.radius) return 1;
  if (d >= Z.radius + Z.edgeFeather) return 0;
  const t = 1 - (d - Z.radius) / Z.edgeFeather;
  return t * t * (3 - 2 * t);
}
const dryZoneFactor = (x, z) => zoneFactor(ENV.dryZone, x, z);
const jungleZoneFactor = (x, z) => zoneFactor(ENV.jungleZone, x, z);

// OCEAN coast profile (task 2): the eastern margin descends from the inland
// flats, through a sloping BEACH, down to a seabed below the sea surface. This
// returns the terrain height for a given x (the coast runs ~north-south at
// OCEAN.shoreX) and a blend weight 0..1 of how "coastal" the point is, so the
// vertex loop + heightAt can blend the land height TOWARD the coast profile.
// MUST be applied identically in the vertex loop AND heightAt (else props /
// collisions float or sink at the shore — the same desync risk as the dunes).
//
// Bands east of the coastline (increasing x past shoreX):
//   0 .. beachWidth     → beach: ramps from seaLevel+~1 down to the waterline
//   beachWidth ..       → seabed: drops to seaLevel − seabedDepth (open water)
// West of the coastline it returns weight 0 (land untouched).
function oceanProfile(x, z) {
  // a gently wavy coastline so the beach isn't a dead-straight line
  const coast = OCEAN.shoreX + Math.sin(z * 0.045) * 6 + Math.cos(z * 0.017) * 4;
  const e = x - coast;                // metres east of the (wavy) coastline
  if (e <= -OCEAN.beachWidth) return { h: 0, w: 0 };  // well inland — untouched
  let h;
  if (e <= 0) {
    // upper beach: from the inland flats (≈ seaLevel + a small berm) easing down
    // to the waterline at the coastline. Smoothstep for a soft brow, no step.
    const t = (e + OCEAN.beachWidth) / OCEAN.beachWidth;  // 0 at inland edge .. 1 at waterline
    const s = t * t * (3 - 2 * t);
    h = (OCEAN.seaLevel + 1.2) * (1 - s) + OCEAN.seaLevel * s;
  } else {
    // seabed: drop from the waterline to the deep seabed across the surf width,
    // then hold deep (navigable open water for the future plesiosaur).
    const t = Math.min(1, e / (OCEAN.surfWidth + OCEAN.beachWidth));
    const s = t * t * (3 - 2 * t);
    h = OCEAN.seaLevel * (1 - s) + (OCEAN.seaLevel - OCEAN.seabedDepth) * s;
  }
  // weight ramps in across the inland beach edge so the land blends to the coast
  const w = Math.min(1, (e + OCEAN.beachWidth) / OCEAN.beachWidth);
  return { h, w: Math.max(0, w) };
}

// Dune undulation for the desert zone: low-frequency layered sines so each dune
// spans many ground quads (no stair-stepping). Returns the raw rise in metres;
// callers weight it by dryZoneFactor so dunes only exist in-zone and feather
// out at the edge. MUST be applied identically in the vertex loop AND heightAt
// (else rocks/grass/collisions float or sink — the top desert bug risk).
function duneHeight(x, z) {
  const D = ENV.dryZone;
  return (
    Math.sin(x * D.duneFreqA) * Math.cos(z * D.duneFreqA) +
    0.5 * Math.sin(x * D.duneFreqB + z * D.duneFreqB * 0.7)
  ) * D.duneAmp;
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
    // Desert dunes: rolling undulation, weighted by zone membership so the
    // dunes only rise inside the dry zone and feather out at its edge. MUST
    // mirror heightAt below (placement/collision desync otherwise).
    const dzH = dryZoneFactor(x, z);
    if (dzH > 0) h += dzH * duneHeight(x, z);
    // OCEAN coast: blend the land height toward the beach/seabed profile on the
    // eastern margin. MUST mirror heightAt below (placement/collision desync).
    const oc = oceanProfile(x, z);
    if (oc.w > 0) h = h * (1 - oc.w) + oc.h * oc.w;
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
    // Microclimates: blend toward the arid tint in the dry rocky corner and
    // the deeper wet green in the jungle thicket.
    const dz = dryZoneFactor(x, z);
    if (dz > 0) {
      const dGT = ENV.dryZone.groundTint;
      r = r * (1 - dz) + dGT[0] * dz;
      g = g * (1 - dz) + dGT[1] * dz;
      b = b * (1 - dz) + dGT[2] * dz;
    }
    const jz = jungleZoneFactor(x, z);
    if (jz > 0) {
      const jGT = ENV.jungleZone.groundTint;
      r = r * (1 - jz) + jGT[0] * jz;
      g = g * (1 - jz) + jGT[1] * jz;
      b = b * (1 - jz) + jGT[2] * jz;
    }
    // BEACH: paint the coastal band as SAND — dry dune sand on the upper beach,
    // darker WET sand at/below the waterline — so the shore reads as a clear
    // sand beach, not grass running into the sea. The sand weight ramps in fast
    // (sqrt) across the dune line so the band is unambiguously sand, not a faint
    // tint; only the outermost feather stays green to soften the inland edge.
    if (oc.w > 0) {
      const wet = h <= OCEAN.seaLevel + 0.2 ? 1 : 0;   // at/under the waterline = damp sand
      const bc = wet ? OCEAN.wetSandColor : OCEAN.beachColor;
      const bw = Math.min(1, Math.sqrt(oc.w) * 1.25);  // strong sand across the band
      r = r * (1 - bw) + bc.r * bw;
      g = g * (1 - bw) + bc.g * bw;
      b = b * (1 - bw) + bc.b * bw;
    }
    const ci = (i / 3) * 4;
    // Repurpose the vertex-colour ALPHA channel to carry the dry-zone weight so
    // the ground material plugin can blend in the sand albedo + ripple normal
    // per-vertex without a second full-ground mesh/draw.
    colors[ci] = r; colors[ci + 1] = g; colors[ci + 2] = b; colors[ci + 3] = dz;
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
    h = h * Math.min(1, d / ARENA.radius * 1.2) + rim - basinFactor(x, z) * WATER.depth;
    // MIRROR of the dune term baked into the ground vertex loop above. Keep
    // these two expressions identical or placement/collision desyncs.
    const dz = dryZoneFactor(x, z);
    if (dz > 0) h += dz * duneHeight(x, z);
    // MIRROR of the ocean coast blend (vertex loop above) — same desync rule.
    const oc = oceanProfile(x, z);
    if (oc.w > 0) h = h * (1 - oc.w) + oc.h * oc.w;
    return h;
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

  // --- Ocean / sea (task 2) -----------------------------------------------
  // The large eastern sea: an open-water plane east of the coastline with a
  // gentle animated swell + a foam line at the waterline, sitting in the
  // carved beach/seabed the coast profile dug above. Distinct from the inland
  // pond; left clear for a future marine reptile.
  const ocean = buildOcean(scene);

  // Water helpers consumed by the player controller, the aquatic predator and
  // the AI avoidance. `inWater` is the shallow-wading test (unchanged). The
  // basin is a smoothstep bowl WATER.depth deep at the centre; `waterDepthAt`
  // returns the local water column depth (0 at/over the rim) so the player can
  // branch shallow-wade vs deep-swim, and `isDeepWater` is that branch.
  const inWater = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius - 1;
  const waterDepthAt = (x, z) => {
    const d = Math.hypot(x - WATER.centerX, z - WATER.centerZ);
    if (d >= WATER.radius) return 0;
    // water surface (waterY) minus the carved basin floor at this point.
    const floorY = heightAt(x, z);
    return Math.max(0, waterY - floorY);
  };
  const isDeepWater = (x, z) =>
    Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius * WATER.deepFraction;
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
    ocean.update(dt);   // animate the sea swell + foam shimmer
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
    let fogR = fc[0] * 0.7 + skyR * 0.3;
    let fogG = fc[1] * 0.7 + skyG * 0.3;
    let fogB = fc[2] * 0.7 + skyB * 0.3;
    let clR = skyR, clG = skyG, clB = skyB;
    let sunR = sun.diffuse.r, sunG = sun.diffuse.g, sunB = sun.diffuse.b;

    // --- Desert air: warm the fog + sun + low sky by CAMERA proximity to the
    // dry zone (fog/sun are global, so we blend by where the camera is — exactly
    // like the dusk arc). Entering the zone: the horizon haze goes hot ochre, the
    // sun key warms to amber, the air thickens slightly (dust), the sky band near
    // the horizon warms. This is the single biggest "this is a desert" cue.
    const cam = scene.activeCamera;
    const camDryW = cam ? dryZoneFactor(cam.position.x, cam.position.z) : 0;
    if (camDryW > 0) {
      const D = ENV.dryZone;
      const fg = D.fogColor, sw = D.sunWarmTint;
      fogR = fogR * (1 - camDryW) + fg[0] * camDryW;
      fogG = fogG * (1 - camDryW) + fg[1] * camDryW;
      fogB = fogB * (1 - camDryW) + fg[2] * camDryW;
      // warm the low sky / clear toward the hot horizon haze too (readable edge)
      clR = clR * (1 - camDryW) + fg[0] * camDryW;
      clG = clG * (1 - camDryW) + fg[1] * camDryW;
      clB = clB * (1 - camDryW) + fg[2] * camDryW;
      // amber sun key (multiplicative nudge so it composes with dusk, not fights)
      sunR = sunR * (1 - camDryW) + Math.max(sunR, sw[0]) * camDryW;
      sunG = sunG * (1 - camDryW) + sw[1] * camDryW;
      sunB = sunB * (1 - camDryW) + sw[2] * camDryW;
      // dustier air inside the zone (slightly denser, hazier)
      scene.fogDensity = ENV.fogDensity + D.hazeDensityBonus * camDryW;
      // warm the hemispheric ground bounce so shadowed sand reads warm, not cold
      hemi.groundColor = new B.Color3(0.34 * (1 - camDryW) + 0.42 * camDryW,
                                      0.30 * (1 - camDryW) + 0.30 * camDryW,
                                      0.22 * (1 - camDryW) + 0.18 * camDryW);
    } else {
      scene.fogDensity = ENV.fogDensity;
    }
    sun.diffuse.set(sunR, sunG, sunB);
    scene.fogColor.set(fogR, fogG, fogB);
    scene.clearColor.set(clR, clG, clB, 1);
  };

  // Soft restart must also rewind the ambient day clock, else repeated retries
  // drift `t` toward evening and the arena darkens run-on-run (the dusk arc is
  // the only intended darkening; the ambient cycle should reopen bright).
  const resetDusk = () => { runSeconds = 0; duskFactor = 0; t = DAY_START; };

  return {
    ground, shadow, heightAt, update, inWater, waterDepthAt, isDeepWater,
    waterCenter, waterSurfaceY: waterY,
    // Ocean info for the minimap + the future marine reptile: the navigable open
    // water lies east of the (mean) coastline at world X = OCEAN.shoreX.
    oceanShoreX: OCEAN.shoreX, oceanSeaLevel: OCEAN.seaLevel,
    isInOcean: (x, z) => x > (OCEAN.shoreX + Math.sin(z * 0.045) * 6 + Math.cos(z * 0.017) * 4),
    obstacles, resetDusk,
    getDusk: () => duskFactor,
    updateThreats: (dt, player, onScreech, onHit) =>
      atmosphere.updateThreats(dt, player, onScreech, onHit),
    resetThreats: () => atmosphere.resetThreats(),
  };
}

// Builds the eastern OCEAN (task 2): a large open-water surface plane east of
// the coastline (the beach/seabed are carved into the terrain by oceanProfile),
// with a gentle vertical SWELL animated on the plane's own vertices, a brighter
// SHALLOW band near the surf, a foam line at the waterline, and reflection-ish
// specular in keeping with the inland pond's water material. Returns { update }.
function buildOcean(scene) {
  const B = window.BABYLON;
  // A big subdivided plane so the swell can ripple its vertices. It spans well
  // past the play radius so the sea reads as open ocean to the horizon.
  const seg = 80;
  const sea = B.MeshBuilder.CreateGround("ocean", {
    width: OCEAN.planeSize, height: OCEAN.planeSize, subdivisions: seg, updatable: true,
  }, scene);
  // Centre the plane east of the coast so its western edge sits roughly at the
  // shore and the bulk extends out to sea.
  sea.position.set(OCEAN.shoreX + OCEAN.planeSize * 0.5 - 40, OCEAN.seaLevel, 0);
  sea.isPickable = false;

  const seaMat = new B.StandardMaterial("oceanMat", scene);
  seaMat.diffuseColor = new B.Color3(OCEAN.deepColor.r, OCEAN.deepColor.g, OCEAN.deepColor.b);
  seaMat.emissiveColor = new B.Color3(OCEAN.deepColor.r * 0.4, OCEAN.deepColor.g * 0.45, OCEAN.deepColor.b * 0.5);
  seaMat.specularColor = new B.Color3(0.7, 0.85, 0.95);  // bright sky reflection glints
  seaMat.specularPower = 96;
  seaMat.alpha = 0.86;
  sea.material = seaMat;

  // Shallow-water tint near the surf + a foam line at the waterline, baked into
  // the plane's vertex colours by world X (distance seaward of the coast).
  const pos = sea.getVerticesData(B.VertexBuffer.PositionKind);
  const cols = new Float32Array((pos.length / 3) * 4);
  const base = sea.position.x;
  for (let i = 0; i < pos.length; i += 3) {
    const wx = base + pos[i];                 // world X of this vertex
    const seaward = wx - OCEAN.shoreX;         // metres east of the mean coast
    // 0 at/inside the surf .. 1 well out to sea (deep)
    const deep = Math.min(1, Math.max(0, seaward / 90));
    const sh = OCEAN.shallowColor, dp = OCEAN.deepColor, fm = OCEAN.foamColor;
    let r = sh.r * (1 - deep) + dp.r * deep;
    let g = sh.g * (1 - deep) + dp.g * deep;
    let b = sh.b * (1 - deep) + dp.b * deep;
    // foam line: a bright band right at the waterline (small |seaward|)
    const foam = Math.max(0, 1 - Math.abs(seaward) / OCEAN.surfWidth);
    const f = foam * foam * 0.8;
    r = r * (1 - f) + fm.r * f;
    g = g * (1 - f) + fm.g * f;
    b = b * (1 - f) + fm.b * f;
    const ci = (i / 3) * 4;
    cols[ci] = r; cols[ci + 1] = g; cols[ci + 2] = b; cols[ci + 3] = 1;
  }
  sea.setVerticesData(B.VertexBuffer.ColorKind, cols);
  sea.useVertexColors = true;

  // Animate a gentle long-period ocean swell on the plane's vertices.
  const basePos = pos.slice();
  let t = 0;
  const k = (Math.PI * 2) / OCEAN.waveLength;
  const update = (dt) => {
    t += dt * OCEAN.waveSpeed;
    const p = sea.getVerticesData(B.VertexBuffer.PositionKind);
    for (let i = 0; i < p.length; i += 3) {
      const x = basePos[i], z = basePos[i + 2];
      // two crossed swells for a non-uniform sea surface
      p[i + 1] = OCEAN.waveAmp * (Math.sin(x * k + t * 2) + 0.6 * Math.cos(z * k * 0.8 - t * 1.4));
    }
    sea.updateVerticesData(B.VertexBuffer.PositionKind, p);
  };
  return { update, mesh: sea };
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

  // Desert sand blend: a PBR material plugin replaces the grass albedo with a
  // warm sand albedo and lifts roughness to matte, masked to the dry zone by a
  // world-position smoothstep — ONE mesh / ONE draw, no second ground plane.
  // Wrapped in try/catch: if the plugin can't compile on a given driver the
  // ground still renders (the warm vertex-colour tint still carries sand hue).
  try { attachSandBlendPlugin(mat, scene); }
  catch (e) { console.warn("[desert] sand blend plugin unavailable:", e && e.message); }
  return mat;
}

// PBR material plugin that turns the ground to warm SAND inside the dry zone.
// The zone weight is derived in-shader from WORLD POSITION (robust — independent
// of the vertex-colour alpha, which doubles as mesh opacity). Both the albedo
// swap and the roughness lift are injected at CUSTOM_FRAGMENT_UPDATE_METALLIC-
// ROUGHNESS: that point reliably weaves into the compiled PBR fragment in this
// packaged Babylon build (the albedo-stage marker does not), and surfaceAlbedo
// is still the live local that feeds lighting there.
function attachSandBlendPlugin(mat, scene) {
  const B = window.BABYLON;
  const D = ENV.dryZone;

  class SandBlendPlugin extends B.MaterialPluginBase {
    constructor(m) {
      super(m, "SandBlend", 280, { SANDBLEND: true });
      this._enable(true);
    }
    prepareDefines(defines) { defines.SANDBLEND = true; }
    getClassName() { return "SandBlendPlugin"; }
    getUniforms() {
      return {
        ubo: [
          { name: "sandColor", size: 3, type: "vec3" },     // warm tan base the albedo is REPLACED toward
          { name: "sandColorVar", size: 3, type: "vec3" },  // per-texel variation amplitude
          { name: "sandRoughness", size: 1, type: "float" },
          { name: "dryCenter", size: 2, type: "vec2" },
          { name: "dryRadii", size: 2, type: "vec2" },  // x: radius, y: radius+feather
        ],
        fragment: `#ifdef SANDBLEND
uniform vec3 sandColor;
uniform vec3 sandColorVar;
uniform float sandRoughness;
uniform vec2 dryCenter;
uniform vec2 dryRadii;
float dryZoneW(vec3 p) {
  return 1.0 - smoothstep(dryRadii.x, dryRadii.y, distance(p.xz, dryCenter));
}
#endif`,
      };
    }
    bindForSubMesh(ubo) {
      ubo.updateColor3("sandColor", new B.Color3(D.sandColor[0], D.sandColor[1], D.sandColor[2]));
      ubo.updateColor3("sandColorVar", new B.Color3(D.sandColorVar[0], D.sandColorVar[1], D.sandColorVar[2]));
      ubo.updateFloat("sandRoughness", D.sandRoughness);
      ubo.updateFloat2("dryCenter", D.centerX, D.centerZ);
      ubo.updateFloat2("dryRadii", D.radius, D.radius + D.edgeFeather);
    }
    getCustomCode(shaderType) {
      if (shaderType !== "fragment") return null;
      return {
        // ALBEDO override — REPLACE (not multiply) the grass albedo with a warm
        // SAND albedo inside the dry zone. Injected at CUSTOM_FRAGMENT_UPDATE_ALBEDO,
        // which sits inside albedoOpacityBlock right after surfaceAlbedo has been
        // built from (albedoTexture × vColor vertex tint) and whose result flows on
        // to the lighting. The OLD code injected at UPDATE_METALLICROUGHNESS and
        // wrote a local surfaceAlbedo that this build DISCARDS — so the sand swap
        // never reached the lit surface and the ground stayed green grass at eye
        // level (verified: an unconditional write there had zero visible effect).
        //
        // surfaceAlbedo here is in LINEAR space (the texture was toLinearSpace'd),
        // so the sRGB-authored sandColor is converted with toLinearSpace before the
        // mix. The hue is locked to the warm tan; only the sand texture's LUMINANCE
        // DEVIATION adds subtle light/dark grain. Sampled by WORLD position so we
        // don't depend on the build-specific albedo UV varying name. LERP grass->
        // sand by the dry-zone weight so the biome edge still feathers.
        CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef SANDBLEND
    float dryW = dryZoneW(vPositionW);
    if (dryW > 0.001) {
      // Subtle dune-grain variation from world XZ (procedural, no sampler — a
      // texture2D inside this inlined block fails to compile in this build). Two
      // octaves of value-noise via sines give light/dark sand patches so the floor
      // isn't a flat fill, without ever introducing green.
      vec2 wp = vPositionW.xz;
      float grain = 0.6 * sin(wp.x * 0.9 + wp.y * 0.7)
                  + 0.4 * sin(wp.x * 0.31 - wp.y * 0.43 + 1.7);
      vec3 sandCol = clamp(sandColor + sandColorVar * grain, 0.0, 1.0);
      surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(sandCol), dryW);
    }
#endif
`,
        // Roughness lift to matte dry sand. This DOES take effect at
        // UPDATE_METALLICROUGHNESS (the reflectivity block's metallicRoughness flows
        // to reflectivityOut, which the main scope consumes), unlike its albedo.
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef SANDBLEND
    float dryWr = dryZoneW(vPositionW);
    if (dryWr > 0.001) {
      metallicRoughness.g = mix(metallicRoughness.g, sandRoughness, dryWr);
    }
#endif
`,
      };
    }
  }
  new SandBlendPlugin(mat);
  // Attaching a plugin after material creation doesn't invalidate the cached
  // shader/defines, so force a recompile to collect the injected code + uniforms.
  mat.markAsDirty(B.Material.AllDirtyFlag);
}

// Visual set dressing that lives above the playfield: a circling pterosaur
// flock, drifting clouds, and floating pollen. None of it collides.
function buildAtmosphere(scene, heightAt) {
  const B = window.BABYLON;

  // ---- Pterosaur flock (proper winged flyers — see flyer.js) ------------
  // Each flock member is a built pterosaur (body, beak, swept crest, membrane
  // wings) sized up to the flock scale. The dive glow lives on the flyer's
  // shared dive material, so we keep a handle to it for the telegraph pulse.
  // Orbit radius tracks the doubled map (ARENA.radius × birdOrbitMul) instead of
  // a fixed 60, so the flock circles the whole valley, not a small central ring.
  const birdOrbit = ARENA.radius * (ATMOSPHERE.birdOrbitMul || 0.55);
  const birds = [];
  for (let i = 0; i < ATMOSPHERE.birdCount; i++) {
    const flyer = buildFlyer(scene);
    flyer.root.scaling.setAll(1.6);   // scale the native ~1.8u body up for the sky flock
    birds.push({
      root: flyer.root, flyer,
      phase: (i / ATMOSPHERE.birdCount) * Math.PI * 2,
      radius: birdOrbit * (0.7 + 0.3 * (i % 3) / 2),
      height: ATMOSPHERE.birdHeight + (i % 3) * 4,
      diving: false,        // skipped by the passive orbit while it swoops
    });
  }
  // The shared dive material (red glow) — pulse its emissive during a telegraph.
  const diveMat = scene.__flyerMats.dive;

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
    if (b) { b.diving = false; b.flyer.setDiving(false); b.root.rotation.x = 0; }
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
        b.flyer.flap(dt);   // gentle cruise wing-beat
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
            dive.bird = best; best.diving = true; best.flyer.setDiving(true);
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
      b.flyer.flap(dt);            // fast, agitated wingbeats during the attack (dive rate)

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
  // Keep foliage off the beach + out of the sea: nothing planted across most of
  // the sand (from ~80% of the beach width inland of the coast), so the shore
  // reads as a clean sand beach, not grass crowding the waterline.
  const inOcean = (x, z) =>
    x > (OCEAN.shoreX + Math.sin(z * 0.045) * 6 + Math.cos(z * 0.017) * 4) - OCEAN.beachWidth * 0.8;
  const inArena = (x, z) => Math.sqrt(x * x + z * z) < ARENA.radius - 4 && !inPond(x, z) && !inOcean(x, z);
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
  // Deeper jungle-green sources for trees INSIDE the jungle thicket zone.
  const jungleLeafSources = ENV.jungleZone.junglePalette.map((tint, k) =>
    makeCardClusterSource(scene, "jLeafClu" + k, makeCardMaterial(scene, "jLeafMat" + k, ENV.leafCardAlbedo, ENV.leafCardOpacity, tint),
      3, 5.5, 2.4, [0.02, 0.98], leafRows[k % leafRows.length], -0.45));
  const jungleFrondSources = ENV.jungleZone.junglePalette.map((tint, k) =>
    makeCardClusterSource(scene, "jFrondClu" + k, makeCardMaterial(scene, "jFrondMat" + k, ENV.leafCardAlbedo, ENV.leafCardOpacity, tint),
      2, 6.5, 3.0, [0.02, 0.98], leafRows[k % leafRows.length], -0.15));
  // The active palette swaps to the jungle set while building thicket trees.
  let activePalette = { leaf: leafSources, frond: frondSources };
  const pickGreen = (base) => activePalette.leaf[(base + (rng() < 0.4 ? 1 + (rng() < 0.5 ? 1 : 0) : 0)) % activePalette.leaf.length];

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
        const f = activePalette.frond[(base + c) % activePalette.frond.length].createInstance("leaves" + i + "_" + c);
        f.position.set(x + Math.cos(a) * 1.1 * s, top + rand(-0.2, 0.3) * s, z + Math.sin(a) * 1.1 * s);
        f.scaling.setAll(s * rand(0.85, 1.1));
        f.rotation.y = a; f.rotation.x = -0.5 - rng() * 0.3; // arch outward+down
        f.isPickable = false; shadow.addShadowCaster(f);
        swayers.push({ mesh: f, base: f.rotation.z, phase: rng() * 6.283, amp: ENV.windStrength * 1.6 });
      }
    },
  };
  // weighted species roll (per-weight-table so each microclimate has its own mix)
  const rollFrom = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = rng() * total;
    for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
    return entries[0][0];
  };

  // Plants one tree at (x,z): rolls a species from the local microclimate
  // (dry corner → mostly gnarled/dead; jungle thicket → broadleaf/palm in the
  // deeper jungle palette; open grassland → the baseline mix).
  const buildTree = (x, z, i) => {
    const y = heightAt(x, z);
    const dz = dryZoneFactor(x, z);
    const jz = jungleZoneFactor(x, z);
    let species;
    if (dz > 0.4 && rng() < ENV.dryZone.deadTreeBias) species = "gnarled";
    else if (jz > 0.4) species = rollFrom(ENV.jungleZone.treeTypeWeights);
    else species = rollFrom(ENV.treeTypeWeights);
    const inJungle = jz > 0.4;
    activePalette = inJungle
      ? { leaf: jungleLeafSources, frond: jungleFrondSources }
      : { leaf: leafSources, frond: frondSources };
    // palms a touch taller/thinner; gnarled a touch shorter; others varied
    const s = rand(0.7, 1.9) * (species === "palm" ? 1.15 : species === "gnarled" ? 0.9 : 1);
    const t = (species === "gnarled" ? deadTrunk : trunk).createInstance("trunk" + i);
    t.position.set(x, y + 2 * s, z);
    const thin = species === "palm" ? 0.6 : species === "gnarled" ? 0.8 : 1;
    t.scaling.set(s * rand(0.85, 1.15) * thin, s * rand(0.9, 1.3) * (species === "palm" ? 1.4 : 1), s * rand(0.85, 1.15) * thin);
    t.checkCollisions = true;
    shadow.addShadowCaster(t);
    obstacles.push({ x, z, r: 1.1 * s });
    SPECIES[species](x, y, z, s, i % activePalette.leaf.length, i);
    activePalette = { leaf: leafSources, frond: frondSources };
  };

  // Base scatter across the arena.
  for (let i = 0; i < ARENA.treeCount; i++) {
    let x, z;
    do { x = rand(-ARENA.radius, ARENA.radius); z = rand(-ARENA.radius, ARENA.radius); }
    while (!inArena(x, z) || Math.sqrt(x * x + z * z) < 18);
    buildTree(x, z, i);
  }
  // Jungle thicket densification: extra trees clustered inside the zone so the
  // thicket reads as a genuinely denser canopy than the open grassland. Count
  // derives from the zone's share of the arena area × (treeDensityMul − 1), so
  // density inside the zone lands at ~treeDensityMul × the baseline.
  const jzArea = (ENV.jungleZone.radius / ARENA.radius) ** 2;
  const jzExtraTrees = Math.round(ARENA.treeCount * jzArea * (ENV.jungleZone.treeDensityMul - 1));
  for (let i = 0; i < jzExtraTrees; i++) {
    let x, z, tries = 0;
    do {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * ENV.jungleZone.radius;
      x = ENV.jungleZone.centerX + Math.cos(a) * rr; z = ENV.jungleZone.centerZ + Math.sin(a) * rr;
    } while ((!inArena(x, z) || Math.sqrt(x * x + z * z) < 18) && ++tries < 8);
    if (inArena(x, z) && Math.sqrt(x * x + z * z) >= 18) buildTree(x, z, ARENA.treeCount + i);
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
  // Deeper jungle-green understorey sources for the thicket zone.
  const jungleGrassSources = ENV.jungleZone.junglePalette.map((tint, k) =>
    makeCardClusterSource(scene, "jGrassClu" + k,
      makeCardMaterial(scene, "jGrassMat" + k, ENV.grassCardAlbedo, ENV.grassCardOpacity, tint),
      2, 1.6, 1.3, grassCols[k % grassCols.length], [0.0, 1.0], 0));
  const coverSwayers = [];
  const placeGrassCard = (x, z, sMin, sMax, idx, tag) => {
    // inside the jungle thicket the understorey uses the deeper jungle greens
    const pool = jungleZoneFactor(x, z) > 0.4 ? jungleGrassSources : grassSources;
    const src = pool[Math.floor(rng() * pool.length)];
    const s = rand(sMin, sMax);
    const g = src.createInstance(tag + idx);
    g.position.set(x, heightAt(x, z) + s * 0.55, z);
    g.scaling.set(s * rand(0.8, 1.4), s * rand(0.8, 1.5), s * rand(0.8, 1.4)); // clumped + height-varied
    g.rotation.y = rng() * Math.PI;
    g.isPickable = false;
    coverSwayers.push({ mesh: g, base: 0, phase: rng() * Math.PI * 2, amp: ENV.windStrength * rand(1.0, 1.8) });
    return g;
  };
  // Dry zone suppresses the GREEN grass-blade cards entirely: ANY dry-zone
  // membership (core OR feather band) skips the lush green scatter, so no green
  // blades appear on the sand — the desert grows its OWN dry tufts/shrubs/bones
  // via scatterDesertFeatures. The ground albedo itself still feathers smoothly
  // grass->sand across the edge band, so dropping the green cards out to the full
  // feather radius reads as a clean sand transition, not a hard ring.
  const dryThins = (x, z) => dryZoneFactor(x, z) > 0;
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
  // Jungle thicket understorey: extra ground cover clustered inside the zone
  // (count from the zone's area share × (grassDensityMul − 1), same derivation
  // as the thicket's extra trees) — the floor in there reads thick and humid.
  const jzAreaG = (ENV.jungleZone.radius / ARENA.radius) ** 2;
  const jzExtraGrass = Math.round(ENV.groundCoverCount * jzAreaG * (ENV.jungleZone.grassDensityMul - 1));
  for (let i = 0; i < jzExtraGrass; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * ENV.jungleZone.radius;
    const x = ENV.jungleZone.centerX + Math.cos(a) * rr;
    const z = ENV.jungleZone.centerZ + Math.sin(a) * rr;
    if (!inArena(x, z)) continue;
    placeGrassCard(x, z, 0.6, 1.4, i, "jcover");
  }

  // --- Desert hero features: banded sandstone mesas/buttes, drought tufts +
  // dead shrubs, and half-buried bleached bones. All instanced + clustered in
  // the dry zone via the same disc sampler as the boulder densification. The
  // mesas are the bold orange-red silhouettes that make the biome unmistakable
  // from across the map; the tufts/shrubs/bones add dryness storytelling.
  scatterDesertFeatures({
    scene, shadow, rng, rand, heightAt, inArena, obstacles,
    sandstoneTex: tex, coverSwayers,
  });

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

// Builds the desert's hero set-dressing inside ENV.dryZone: banded reddish
// SANDSTONE mesas/buttes (flat-topped, instanced silhouettes that read as the
// Gobi "Flaming Cliffs"), sparse drought VEGETATION (dry-grass tufts + dead
// skeletal shrubs), and half-buried bleached BONE clusters. Everything is
// instanced off a few invisible source meshes (negligible draw cost) and
// clustered with the same disc sampler the boulder densification uses. Large
// mesas register as obstacles so the AI steers around them.
function scatterDesertFeatures({ scene, shadow, rng, rand, heightAt, inArena, obstacles, sandstoneTex, coverSwayers }) {
  const B = window.BABYLON;
  const D = ENV.dryZone;
  const tex = sandstoneTex;
  // disc sampler around the zone centre (sqrt for uniform area distribution)
  const sampleInZone = (rMul = 1) => {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * D.radius * rMul;
    return [D.centerX + Math.cos(a) * rr, D.centerZ + Math.sin(a) * rr];
  };

  // --- Sandstone PBR: reuse the rock albedo/normal/roughness maps but tint warm
  // orange-terracotta. A second "band" material (deeper rust) stripes the lower
  // third of each mesa for the horizontal strata that read as sedimentary.
  // Mesas are big, so tile the rock detail more than a boulder (else the strata
  // smear). uScale wider than vScale stretches the grain into HORIZONTAL bands,
  // reinforcing the sedimentary read.
  const mesaTileU = ENV.rockTiling * 4, mesaTileV = ENV.rockTiling * 7;
  const makeSandstoneMat = (name, col) => {
    const m = new B.PBRMaterial(name, scene);
    const set = (file) => { const t = new B.Texture(ENV.texturePath + file, scene); t.uScale = mesaTileU; t.vScale = mesaTileV; t.anisotropicFilteringLevel = 8; return t; };
    m.albedoTexture = set(ENV.rockTextures.albedo);
    m.bumpTexture = set(ENV.rockTextures.normal);
    m.bumpTexture.level = 1.3;  // crisper wind-cut relief on the cliff faces
    m.metallic = 0; m.roughness = 1;
    m.metallicTexture = set(ENV.rockTextures.roughness);
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.albedoColor = new B.Color3(col[0], col[1], col[2]);
    m.environmentIntensity = ENV.iblIntensity;
    return m;
  };
  const sandstoneMat = makeSandstoneMat("sandstoneMat", D.sandstoneColor);
  const sandstoneBandMat = makeSandstoneMat("sandstoneBandMat", D.sandstoneBandColor);

  // MESA STRATUM source: a single wind-eroded cylinder of unit height/radius
  // that one instance becomes one horizontal sedimentary LAYER. A butte is built
  // by stacking several of these — each layer slightly narrower than the one
  // below — so the silhouette steps inward like real layered sandstone (broad
  // base, tapered top) and the alternating tints read as horizontal strata. The
  // OLD mesa was a single tall thin cylinder (the "weird tower"); this is the
  // owner's "broader bases, layered horizontal strata, wind-eroded tapered tops".
  const makeStratumSource = (name, mat, topScale) => {
    const c = B.MeshBuilder.CreateCylinder(name, {
      height: 1, diameterTop: 2 * topScale, diameterBottom: 2, tessellation: 11,
    }, scene);
    // wind-erode the sides: per-angle in/out noise so each layer's edge is
    // gullied, not a clean lathe — and the noise differs per source so stacked
    // layers don't share an identical outline.
    const seed = name.length * 1.7;
    const vp = c.getVerticesData(B.VertexBuffer.PositionKind);
    for (let i = 0; i < vp.length; i += 3) {
      const x = vp[i], z = vp[i + 2];
      const ang = Math.atan2(z, x);
      const erode = 1 + 0.10 * Math.sin(ang * 5 + seed) + 0.06 * Math.cos(ang * 9 + 1.3 + seed);
      vp[i] = x * erode; vp[i + 2] = z * erode;
    }
    c.setVerticesData(B.VertexBuffer.PositionKind, vp);
    c.createNormals(true);
    c.material = mat; c.isVisible = false;
    return c;
  };
  // Two layer sources (each material) with a gentle upward taper, plus a broad
  // low talus apron and a slightly domed cap source for the eroded top.
  const stratumLight = makeStratumSource("stratumLight", sandstoneMat, 0.94);
  const stratumDark = makeStratumSource("stratumDark", sandstoneBandMat, 0.94);
  const talusSrc = makeStratumSource("mesaTalus", sandstoneBandMat, 0.25);   // debris cone apron
  const capSrc = makeStratumSource("mesaCap", sandstoneMat, 0.55);           // eroded, tapered top cap

  const nBands = Math.max(2, D.mesaStrataBands || 4);
  let mIdx = 0;
  const placeMesa = (x, z) => {
    const gy = heightAt(x, z) - 0.4;   // sink the foot slightly into the sand
    const h = rand(D.mesaMinHeight, D.mesaMaxHeight);
    const baseRad = rand(D.mesaMinRadius, D.mesaMaxRadius);
    // VARIED form: a per-mesa "squatness" — some broad and low (classic mesa),
    // some a touch taller/narrower (a butte) — so no two read the same. Height
    // is always modest vs the base (≤ ~1.4× the diameter) so none is a pillar.
    const topRadFrac = rand(0.45, 0.7);   // how far the top steps in from the base
    const layerH = h / nBands;
    let y = gy;
    for (let b = 0; b < nBands; b++) {
      const t0 = b / nBands, t1 = (b + 1) / nBands;
      // radius steps in with height (broad base -> narrower top), smoothly
      const rBot = baseRad * (1 - (1 - topRadFrac) * t0);
      const rTop = baseRad * (1 - (1 - topRadFrac) * t1);
      const rMid = (rBot + rTop) * 0.5;
      // alternate the two sandstone tints layer-to-layer = visible strata
      const src = b % 2 === 0 ? stratumLight : stratumDark;
      const layer = src.createInstance("mesaL" + mIdx + "_" + b);
      layer.position.set(x, y + layerH * 0.5, z);
      // scale: x/z = this layer's radius, y = its slice height; tiny per-layer
      // rotation so the eroded outlines don't line up into a smooth lathe
      layer.scaling.set(rMid, layerH * 1.02, rMid);
      layer.rotation.y = rng() * Math.PI * 2;
      layer.checkCollisions = b === 0;       // base layer carries collision
      shadow.addShadowCaster(layer);
      y += layerH;
    }
    // eroded cap: a low domed top so the summit isn't a perfectly flat disc
    const capR = baseRad * topRadFrac;
    const cap = capSrc.createInstance("mesaCap" + mIdx);
    cap.position.set(x, y + capR * 0.12, z);
    cap.scaling.set(capR, capR * 0.4, capR);
    cap.rotation.y = rng() * Math.PI * 2;
    shadow.addShadowCaster(cap);
    // broad talus debris apron skirting the foot (darker rust, low + wide)
    const talus = talusSrc.createInstance("talus" + mIdx);
    talus.position.set(x, gy + baseRad * 0.12, z);
    talus.scaling.set(baseRad * 1.5, baseRad * 0.45, baseRad * 1.5);
    talus.rotation.y = rng() * Math.PI;
    shadow.addShadowCaster(talus);
    // a big obstacle so the AI (and player collisions) treat the mesa as solid
    obstacles.push({ x, z, r: baseRad * 1.05 });
    mIdx++;
  };
  // Place mesas with a minimum spacing so they spread into a skyline rather
  // than piling up; bias toward the outer 35–100% of the radius so the centre
  // stays open to run through.
  const mesaSpots = [];
  const minMesaGap = D.mesaMaxRadius * 2.4;
  for (let i = 0; i < D.mesaCount; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 40) {
      const a = rng() * Math.PI * 2, rr = (0.35 + 0.65 * rng()) * D.radius;
      x = D.centerX + Math.cos(a) * rr; z = D.centerZ + Math.sin(a) * rr;
      if (!inArena(x, z)) continue;
      ok = mesaSpots.every((p) => Math.hypot(p.x - x, p.z - z) > minMesaGap);
    }
    if (ok) { mesaSpots.push({ x, z }); placeMesa(x, z); }
  }

  // --- Bleached BONES (owner: "the skeletons don't look realistic"). Reworked
  // to read as a believable bleached carcass: a CURVED RIBCAGE ARC (a row of
  // ribs that spring up + inward from a spine line, tapering fore-to-aft like a
  // real cage), a recognisable elongated SKULL (long snout + dome + lower jaw)
  // at the head end, and a few half-buried VERTEBRAE marching down the spine.
  // All instanced off a handful of primitive sources (negligible draw).
  const boneMat = new B.PBRMaterial("boneMat", scene);
  boneMat.albedoColor = new B.Color3(D.boneColor[0], D.boneColor[1], D.boneColor[2]);
  boneMat.metallic = 0; boneMat.roughness = 0.85;
  boneMat.environmentIntensity = ENV.iblIntensity;
  // Rib source: a tube bent into a ~210° arc so a single instance is one rib
  // that springs up from the spine, curves over and tucks back down — the
  // characteristic rib hoop. Built once via a curved path, instanced per rib.
  const ribPath = [];
  for (let i = 0; i <= 12; i++) {
    const a = (-0.08 + 1.16 * (i / 12)) * Math.PI;   // ~210° of arc
    ribPath.push(new B.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.95, 0));
  }
  const ribSrc = B.MeshBuilder.CreateTube("ribSrc", { path: ribPath, radius: 0.075, tessellation: 6, cap: B.Mesh.CAP_ALL }, scene);
  ribSrc.material = boneMat; ribSrc.isVisible = false;
  // Vertebra source: a small flattened drum (a spinal segment).
  const vertSrc = B.MeshBuilder.CreateCylinder("vertSrc", { height: 0.28, diameter: 0.34, tessellation: 8 }, scene);
  vertSrc.material = boneMat; vertSrc.isVisible = false;
  // Skull sources: an elongated cranium (stretched sphere) + a tapered snout
  // (cone) + a slim lower jaw (a thin box), assembled per cluster.
  const craniumSrc = B.MeshBuilder.CreateSphere("craniumSrc", { diameter: 1, segments: 10 }, scene);
  craniumSrc.material = boneMat; craniumSrc.isVisible = false;
  const snoutSrc = B.MeshBuilder.CreateCylinder("snoutSrc", { height: 1, diameterTop: 0.12, diameterBottom: 0.55, tessellation: 8 }, scene);
  snoutSrc.material = boneMat; snoutSrc.isVisible = false;
  const jawSrc = B.MeshBuilder.CreateBox("jawSrc", { width: 0.42, height: 0.12, depth: 1.0 }, scene);
  jawSrc.material = boneMat; jawSrc.isVisible = false;
  let bIdx = 0;
  const placeBones = (x, z) => {
    const dir = rng() * Math.PI * 2, cd = Math.cos(dir), sd = Math.sin(dir);
    const s = rand(0.9, 1.5);
    const spineStep = 0.62 * s;
    const nRibs = 5 + Math.floor(rng() * 3);
    // RIBCAGE: ribs along the spine line, paired left+right, tapering toward the
    // tail so the cage reads as a curved barrel half-buried in the sand.
    for (let r = 0; r < nRibs; r++) {
      const off = (r - (nRibs - 1) / 2) * spineStep;        // distance along spine
      const rx = x + cd * off, rz = z + sd * off;
      // cage taper: biggest at the chest (front), smaller toward the tail
      const cage = 0.7 + 0.5 * (1 - Math.abs(off) / (nRibs * spineStep * 0.5));
      for (const sideSign of [1, -1]) {
        const rib = ribSrc.createInstance("rib" + bIdx + "_" + r + "_" + sideSign);
        // half-buried: drop the springing point below the surface so only the
        // upper hoop of the arc shows above the sand.
        rib.position.set(rx, heightAt(rx, rz) - 0.45 * s * cage, rz);
        rib.scaling.set(s * cage, s * cage * rand(0.9, 1.05), s * cage);
        // orient: the arc plane faces across the spine; mirror per side; a touch
        // of fore-aft lean per rib so they aren't robotically parallel.
        rib.rotation.set(0, dir + (sideSign > 0 ? 0 : Math.PI), sideSign * (0.5 + rand(-0.12, 0.12)));
        rib.isPickable = false;
      }
      // a vertebra knuckle on the spine between the rib pairs
      if (r < nRibs - 1) {
        const vx = x + cd * (off + spineStep * 0.5), vz = z + sd * (off + spineStep * 0.5);
        const v = vertSrc.createInstance("vert" + bIdx + "_" + r);
        v.position.set(vx, heightAt(vx, vz) + 0.02 * s, vz);
        v.scaling.setAll(s * rand(0.8, 1.1));
        v.rotation.set(Math.PI / 2, dir, 0);   // drum axis along the spine
        v.isPickable = false;
      }
    }
    // SKULL at the head end (one spine-step beyond the front rib), oriented along
    // the spine: dome cranium + tapered snout + a slim lower jaw resting in sand.
    const headOff = ((nRibs - 1) / 2 + 1.1) * spineStep;
    const hx = x + cd * headOff, hz = z + sd * headOff;
    const hy = heightAt(hx, hz);
    const cran = craniumSrc.createInstance("cran" + bIdx);
    cran.position.set(hx, hy + 0.18 * s, hz);
    cran.scaling.set(s * 0.62, s * 0.55, s * 0.85);     // longer than wide (a skull, not a ball)
    cran.rotation.y = dir;
    cran.isPickable = false;
    const snout = snoutSrc.createInstance("snout" + bIdx);
    // lay the cone on its side pointing forward along the spine
    snout.position.set(hx + cd * 0.62 * s, hy + 0.08 * s, hz + sd * 0.62 * s);
    snout.scaling.set(s * 0.9, s * 1.1, s * 0.9);
    snout.rotation.set(Math.PI / 2, 0, dir);            // axis along +spine
    snout.isPickable = false;
    const jaw = jawSrc.createInstance("jaw" + bIdx);
    jaw.position.set(hx + cd * 0.35 * s, hy - 0.12 * s, hz + sd * 0.35 * s);
    jaw.scaling.set(s, s, s);
    jaw.rotation.y = dir + rand(-0.25, 0.25);           // jaw slightly agape in the sand
    jaw.isPickable = false;
    bIdx++;
  };
  for (let i = 0; i < D.boneClusterCount; i++) {
    let x, z, tries = 0;
    do { [x, z] = sampleInZone(0.85); } while (!inArena(x, z) && ++tries < 8);
    if (inArena(x, z)) placeBones(x, z);
  }

  // --- Drought vegetation: dry-grass tufts + dead skeletal shrubs. Built from
  // cheap primitive cards/branches tinted from the dry palette. Tufts do NOT
  // cast shadows (hundreds would tax the shadow map); only shrubs do.
  const dryMat = (name, col, rough) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = new B.Color3(col[0], col[1], col[2]);
    m.specularColor = B.Color3.Black();
    m.backFaceCulling = false;
    return m;
  };
  // Tuft: a small fan of 3 thin tapered blades (cones) in straw/sage.
  const tuftMats = D.dryPalette.slice(0, 3).map((c, k) => dryMat("tuftMat" + k, c));
  const tuftSrcs = tuftMats.map((m, k) => {
    const blade = B.MeshBuilder.CreateCylinder("tuftSrc" + k, { height: 1, diameterTop: 0, diameterBottom: 0.12, tessellation: 4 }, scene);
    blade.material = m; blade.isVisible = false;
    return blade;
  });
  let tIdx = 0;
  const placeTuft = (x, z) => {
    const gy = heightAt(x, z);
    const k = Math.floor(rng() * tuftSrcs.length);
    const s = rand(0.6, 1.2);
    const n = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < n; b++) {
      const blade = tuftSrcs[k].createInstance("tuft" + tIdx + "_" + b);
      const a = rng() * Math.PI * 2, lean = rand(0.1, 0.5), spread = rand(0, 0.25);
      blade.position.set(x + Math.cos(a) * spread, gy + 0.5 * s, z + Math.sin(a) * spread);
      blade.scaling.set(s * rand(0.7, 1.1), s * rand(0.8, 1.4), s * rand(0.7, 1.1));
      blade.rotation.set(Math.cos(a) * lean, rng() * 6.28, Math.sin(a) * lean);
      blade.isPickable = false;
      coverSwayers.push({ mesh: blade, base: blade.rotation.z, phase: rng() * 6.28, amp: ENV.windStrength * rand(1.4, 2.2) });
    }
    tIdx++;
  };
  for (let i = 0; i < D.tuftCount; i++) {
    let x, z, tries = 0;
    do { [x, z] = sampleInZone(1.0); } while (!inArena(x, z) && ++tries < 6);
    if (inArena(x, z)) placeTuft(x, z);
  }

  // Dead shrub: a gnarled cluster of bare grey branch stubs (saxaul skeleton).
  const deadWoodMat = dryMat("deadShrubMat", D.dryPalette[3]);
  const shrubBranch = B.MeshBuilder.CreateCylinder("shrubBranchSrc", { height: 1, diameterTop: 0.03, diameterBottom: 0.16, tessellation: 5 }, scene);
  shrubBranch.material = deadWoodMat; shrubBranch.isVisible = false;
  let sIdx = 0;
  const placeShrub = (x, z) => {
    const gy = heightAt(x, z);
    const s = rand(0.8, 1.6);
    const n = 4 + Math.floor(rng() * 4);
    for (let b = 0; b < n; b++) {
      const br = shrubBranch.createInstance("shrub" + sIdx + "_" + b);
      const a = rng() * Math.PI * 2, lean = rand(0.4, 1.0);
      br.position.set(x, gy + rand(0.3, 0.9) * s, z);
      br.scaling.set(s * rand(0.6, 1.0), s * rand(0.9, 1.6), s * rand(0.6, 1.0));
      br.rotation.set(Math.cos(a) * lean, rng() * 6.28, Math.sin(a) * lean);
      br.isPickable = false;
      shadow.addShadowCaster(br);
    }
    sIdx++;
  };
  for (let i = 0; i < D.shrubCount; i++) {
    let x, z, tries = 0;
    do { [x, z] = sampleInZone(1.0); } while (!inArena(x, z) && ++tries < 6);
    if (inArena(x, z)) placeShrub(x, z);
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
