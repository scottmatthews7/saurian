import { ARENA, DAYNIGHT, DUSK, ATMOSPHERE, WATER, OCEAN, PTERO_DIVE, ENV, MAP, TREE_PACKS, PROPS, UNDERSTORY, SPAWN } from "./config.js";
import { buildFlyer } from "./flyer.js";
import { initMap, biomeAt, loadIslandMap, getMuddyPath } from "./map.js";

// Smooth basin profile for the pond: 1 at the centre, easing to 0 at the rim.
// Carved into the terrain heightmap so the pool sits in a real depression.
function basinFactor(x, z) {
  const d = Math.hypot(x - WATER.centerX, z - WATER.centerZ);
  if (d >= WATER.radius) return 0;
  const t = 1 - d / WATER.radius;
  return t * t * (3 - 2 * t); // smoothstep
}

// --- ISLAND FIELD (terrain from the design/ biome grid) ----------------------
// The island's shape now comes from map.grid.json via map.js. At build time we
// rasterise per-cell base heights (MAP.cellHeights) + blend masks into Float32
// fields at 1u resolution, then box-blur them (MAP.heightBlurPasses /
// maskBlurPasses) so the rasterised cell edges feather into organic slopes —
// the already-jagged grid coast reads as a natural waterline, never a
// stair-step. ONE bilinear sampler feeds the ground vertex loop AND heightAt,
// so the render and placement/collision heights can never desync.
const FIELD = {
  // 40u of open-sea margin past the grid on every side (grid X −246..246,
  // Z −396..576) so the seabed runs out under the ocean plane — first-pass for owner eyeball
  x0: -286, z0: -436, w: 572, h: 1052,
  height: null,   // blurred base terrain height per 1u cell
  dune: null,     // 0..1 dune-undulation weight (desert D + rocky pass R)
  sand: null,     // 0..1 in-shader sand-albedo replace weight (MAP.sandWeights)
  rock: null,     // 0..1 in-shader "kill the green texture" weight (R, M, P) —
                  // the grass detail albedo is replaced by the painted vertex
                  // colour there, so rock/dirt floors aren't hued green
  dry: null,      // 0..1 desert membership (D) — desert air / dry-veg systems
  jungle: null,   // 0..1 jungle membership (J) — understorey/species systems
};

// Separable clamped box blur, in place. Cheap (running sums) even over the
// full 572x1052 field.
function boxBlurField(arr, w, h, radius, passes) {
  const tmp = new Float32Array(arr.length);
  const win = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < h; r++) {           // horizontal: arr -> tmp
      const off = r * w;
      let sum = 0;
      for (let c = -radius; c <= radius; c++) sum += arr[off + Math.min(w - 1, Math.max(0, c))];
      for (let c = 0; c < w; c++) {
        tmp[off + c] = sum / win;
        sum += arr[off + Math.min(w - 1, c + radius + 1)] - arr[off + Math.max(0, c - radius)];
      }
    }
    for (let c = 0; c < w; c++) {           // vertical: tmp -> arr
      let sum = 0;
      for (let r = -radius; r <= radius; r++) sum += tmp[Math.min(h - 1, Math.max(0, r)) * w + c];
      for (let r = 0; r < h; r++) {
        arr[r * w + c] = sum / win;
        sum += tmp[Math.min(h - 1, r + radius + 1) * w + c] - tmp[Math.max(0, r - radius) * w + c];
      }
    }
  }
}

// Bilinear sample of a field array at world (x, z), clamped at the margins
// (everything past the field is open sea, so the edge value is correct).
function sampleField(arr, x, z) {
  const fx = Math.min(FIELD.w - 1.001, Math.max(0, x - FIELD.x0 - 0.5));
  const fz = Math.min(FIELD.h - 1.001, Math.max(0, z - FIELD.z0 - 0.5));
  const c0 = fx | 0, r0 = fz | 0, tx = fx - c0, tz = fz - r0;
  const i = r0 * FIELD.w + c0;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz)
       + (arr[i + FIELD.w] * (1 - tx) + arr[i + FIELD.w + 1] * tx) * tz;
}

// STAGE SHIM — the radial dryZone/jungleZone geometry left config.js with the
// island remap, but the SCATTER systems below (rebuilt in the prop stage) still
// consume centre+radius+style fields. Style values are the pre-remap config
// values verbatim; the geometry is re-aimed at the grid regions' centroids by
// buildIslandField so the existing desert dressing lands on the real desert.
const JUNGLE_ZONE = {
  centerX: 0, centerZ: -250, radius: 60, // overwritten from the grid J cells below
  groundTint: [0.42, 0.56, 0.36],
  grassDensityMul: 2.0,
  junglePalette: [
    [0.36, 0.56, 0.32], [0.30, 0.48, 0.28], [0.44, 0.62, 0.36], [0.26, 0.42, 0.26],
  ],
};
const DRY_ZONE_GEO = { centerX: 0, centerZ: 430, radius: 70 }; // overwritten from the grid D cells below

// Zone membership now reads the blurred grid masks (0 before the field exists,
// which only matters if something samples before buildWorld awaits initMap).
const dryZoneFactor = (x, z) => (FIELD.dry ? sampleField(FIELD.dry, x, z) : 0);
const jungleZoneFactor = (x, z) => (FIELD.jungle ? sampleField(FIELD.jungle, x, z) : 0);

// Rasterise + blur the fields from the loaded grid. Requires initMap() done.
function buildIslandField() {
  if (FIELD.height) return;
  const { x0, z0, w, h } = FIELD;
  const height = new Float32Array(w * h), dune = new Float32Array(w * h),
        sand = new Float32Array(w * h), rock = new Float32Array(w * h),
        dry = new Float32Array(w * h), jungle = new Float32Array(w * h);
  const seaH = MAP.cellHeights["~"];
  let dN = 0, dX = 0, dZ = 0, jN = 0, jX = 0, jZ = 0;
  for (let r = 0; r < h; r++) {
    const z = z0 + r + 0.5;
    for (let c = 0; c < w; c++) {
      const x = x0 + c + 0.5;
      const code = biomeAt(x, z);
      const i = r * w + c;
      height[i] = MAP.cellHeights[code] ?? seaH;
      dune[i] = (code === "D" || code === "R") ? 1 : 0;
      sand[i] = MAP.sandWeights[code] || 0;
      rock[i] = (code === "R" || code === "M" || code === "P") ? 1 : 0;
      if (code === "D") { dry[i] = 1; dN++; dX += x; dZ += z; }
      else if (code === "J") { jungle[i] = 1; jN++; jX += x; jZ += z; }
    }
  }
  if (dN) {  // aim the legacy desert-dressing shim at the real desert region
    DRY_ZONE_GEO.centerX = dX / dN; DRY_ZONE_GEO.centerZ = dZ / dN;
    DRY_ZONE_GEO.radius = Math.sqrt(dN / Math.PI);  // equivalent-area disc
  }
  if (jN) {
    JUNGLE_ZONE.centerX = jX / jN; JUNGLE_ZONE.centerZ = jZ / jN;
    JUNGLE_ZONE.radius = Math.sqrt(jN / Math.PI);
  }
  boxBlurField(height, w, h, MAP.heightBlurRadius, MAP.heightBlurPasses);
  boxBlurField(dune, w, h, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlurField(sand, w, h, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlurField(rock, w, h, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlurField(dry, w, h, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlurField(jungle, w, h, MAP.maskBlurRadius, MAP.maskBlurPasses);
  FIELD.height = height; FIELD.dune = dune; FIELD.sand = sand;
  FIELD.rock = rock; FIELD.dry = dry; FIELD.jungle = jungle;
}

// THE terrain height — the single source of truth for ground height (rendered
// verts, placement and collisions all call this; see the desync warnings below).
function terrainHeight(x, z) {
  let hgt = sampleField(FIELD.height, x, z);
  // gentle base noise carried over from the old terrain, damped so the
  // forest/savannah/jungle floors read FLAT per the spec — first-pass for owner eyeball
  hgt += (Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6
        + Math.sin(x * 0.13 + z * 0.07) * 0.7) * 0.25;
  const dw = sampleField(FIELD.dune, x, z);
  if (dw > 0.01) hgt += dw * duneHeight(x, z);  // desert + rocky-pass undulation
  hgt -= basinFactor(x, z) * WATER.depth;       // carve the swamp pool
  return hgt;
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

export async function buildWorld(scene) {
  const B = window.BABYLON;

  // The terrain is built FROM the design/ grid — the map files must be loaded
  // and the height/mask fields rasterised before anything below samples them.
  await initMap();
  buildIslandField();
  // Prop/wall geometry sheets derived from the grids (per-cell placements, the
  // jungle visible shell, the faked interior cells and the mountain wall line).
  const island = await loadIslandMap();

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

  // --- Ground (terrain from the island grid) -------------------------------
  // Sized + centred on the FIELD (the grid plus its sea margin) at 2u vertex
  // spacing — fine enough that the blurred coast/biome edges and the ~2.2u
  // muddy path read through the per-vertex paint. First-pass for owner eyeball.
  const groundCx = FIELD.x0 + FIELD.w / 2, groundCz = FIELD.z0 + FIELD.h / 2;
  const ground = B.MeshBuilder.CreateGround("ground", {
    width: FIELD.w, height: FIELD.h,
    subdivisionsX: FIELD.w / 2, subdivisionsY: FIELD.h / 2, updatable: true,
  }, scene);
  ground.position.set(groundCx, 0, groundCz);

  // Heights come from terrainHeight (the blurred grid field — the SAME function
  // heightAt exposes, so render and collisions can't desync). Vertex COLOURS
  // paint the ground per biome (MAP.tints): the savannah keeps the owner's
  // grass↔soil mottle verbatim; other floors get their own tint + a luminance
  // mottle so nothing reads as a flat fill. The alpha channel carries the SAND
  // weight for the in-shader sand albedo replace (the approved desert system).
  const positions = ground.getVerticesData(B.VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const sT = ENV.soilTint, tintG = MAP.tints.G;
  // Floors that take the grass↔soil mottle treatment (the green family).
  const GREEN_FLOOR = { G: 1, C: 1, F: 1, S: 1, J: 1 };
  // 3x3 biome supersample offsets (u) — feathers the paint across biome edges
  // over ~2-3u so boundaries read organic, not rasterised. First-pass for owner eyeball.
  const SS = [-1.1, 0, 1.1];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] + groundCx, z = positions[i + 2] + groundCz;
    const h = terrainHeight(x, z);
    positions[i + 1] = h;
    // Biome paint: average the tints of the 3x3 1u-spaced samples around the
    // vertex (soft edges), tracking how "green floor" the neighbourhood is.
    let r = 0, g = 0, b = 0, green = 0;
    for (const dx of SS) for (const dzz of SS) {
      const t = MAP.tints[biomeAt(x + dx, z + dzz)] || tintG;
      r += t[0]; g += t[1]; b += t[2];
      if (GREEN_FLOOR[biomeAt(x + dx, z + dzz)]) green++;
    }
    r /= 9; g /= 9; b /= 9; green /= 9;
    // Green floors: the owner-approved grass↔soil mottle, verbatim (plus the
    // soil ring at the swamp-pool shoreline, as around the old pond).
    const pondSoil = basinFactor(x, z) > 0.02 ? 0.6 : 0;
    const mottle = 0.18 * (0.5 + 0.5 * Math.sin(x * 0.4 + 1.7) * Math.cos(z * 0.37));
    const soil = Math.min(1, mottle + pondSoil) * green;
    r = r * (1 - soil) + sT[0] * soil;
    g = g * (1 - soil) + sT[1] * soil;
    b = b * (1 - soil) + sT[2] * soil;
    // Non-green floors (rock/sand/dirt/seabed): a gentle luminance mottle so
    // they're never a flat tint either — first-pass for owner eyeball.
    const lum = 1 + (1 - green) * 0.10 * Math.sin(x * 0.53 + 0.9) * Math.cos(z * 0.47 + 0.3);
    r *= lum; g *= lum; b *= lum;
    // Damp foreshore: at/under the waterline darken sandy ground toward wet
    // sand (the in-shader sand REPLACE — driven by the mask texture in
    // attachSandBlendPlugin — is attenuated there so this tint shows through).
    const sandW = sampleField(FIELD.sand, x, z);
    if (sandW > 0.03 && h <= OCEAN.seaLevel + 0.2) {
      const wc = OCEAN.wetSandColor, ww = Math.min(1, sandW);
      r = r * (1 - ww) + wc.r * ww;
      g = g * (1 - ww) + wc.g * ww;
      b = b * (1 - ww) + wc.b * ww;
    }
    const ci = (i / 3) * 4;
    colors[ci] = r; colors[ci + 1] = g; colors[ci + 2] = b; colors[ci + 3] = 1;
  }
  ground.updateVerticesData(B.VertexBuffer.PositionKind, positions);
  ground.setVerticesData(B.VertexBuffer.ColorKind, colors);
  ground.createNormals(true);
  // The player follows the terrain by SNAPPING its collider to heightAt(x,z)
  // every frame (see player.js groundFloor snap), not by colliding with this
  // mesh. Leaving ground.checkCollisions on made the player's moveWithCollisions
  // ellipsoid WEDGE against the terrain on gentle DOWN-slopes (gravity pushes it
  // into the slope face ahead, the collide-and-slide response cancels the
  // forward step, and the per-frame Y-snap re-seats it — so forward input yields
  // ~zero progress: the owner's "invisible wall", reproduced on the desert→coast
  // descent). The terrain has no genuine cliffs (gradient grid: nothing steeper
  // than ~0.08/unit), so the snap alone follows it cleanly. Trees, rocks and
  // mesas keep their own checkCollisions, so real obstacles still stop the
  // player; deep water and the arena rim are handled in player.js. Result: the
  // whole map is traversable, blocked only by genuine solids.
  ground.checkCollisions = false;
  ground.receiveShadows = true;

  const groundMat = makeGroundPBR(scene);
  ground.material = groundMat;
  ground.useVertexColors = true;

  // Terrain height for placement/collisions — the SAME function the vertex
  // loop above baked, so nothing can float or sink against the render.
  const heightAt = terrainHeight;

  // Muddy-path ribbon: smoothed centreline (no folds), earthy mottled dirt
  // texture, draped on the terrain, ending at the north tree line. The painted
  // P cells alone read as a green gap, not a brown trail, so the ribbon carries
  // the visible path.
  buildMuddyPath(scene, heightAt);

  // --- Water pond ----------------------------------------------------------
  // A translucent surface disc sitting in the carved basin. The surface height
  // is the rim ground (basin edge) plus a small level, so it reads as a pool.
  const rimGroundY = heightAt(WATER.centerX + WATER.radius, WATER.centerZ);
  const waterY = rimGroundY + WATER.level;
  const water = B.MeshBuilder.CreateDisc("water", { radius: WATER.radius, tessellation: 48 }, scene);
  water.rotation.x = Math.PI / 2;
  water.position.set(WATER.centerX, waterY, WATER.centerZ);
  water.isPickable = false;
  // MURKY SWAMP POOL (MAP_SPEC: the swamp is "murky"): the old pond's bright
  // cyan-blue read as a tropical lake from the air (the stage-2 overhead
  // artefact). Dark olive-brown, faint shine — first-pass for owner eyeball.
  const waterMat = new B.StandardMaterial("waterMat", scene);
  waterMat.diffuseColor = new B.Color3(0.16, 0.19, 0.11);
  waterMat.emissiveColor = new B.Color3(0.05, 0.07, 0.03);
  waterMat.specularColor = new B.Color3(0.25, 0.28, 0.22);
  waterMat.specularPower = 48;
  waterMat.alpha = 0.85;
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
  // Grid-driven prop layer (one prop per cell from design/map.props.json):
  // glb trees/shrubs/understory + the procedural rocks, the jungle tree-wall
  // shell, the faked jungle interior canopy and the cliff.glb mountain walls.
  // Blocking placements append AI obstacle footprints to the shared list.
  const props = await scatterIslandProps(scene, heightAt, island, obstacles, foliage.rockShapes);
  const cliffs = await buildMountainWalls(scene, heightAt, island, obstacles);
  buildJungleCanopy(scene, heightAt, island);
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
    foliage.windUpdate(dt);   // subtle ground-cover sway
    props.update(dt);         // throttled distance-cull of the prop-layer chunks
    // subtle water shimmer (green channel — the pool stays murky, never cyan)
    t_water += dt;
    waterMat.emissiveColor.g = 0.06 + 0.02 * Math.sin(t_water * 1.5);
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
    // Ocean info for the minimap + the marine reptile. The sea now surrounds
    // the island: a point is in the ocean iff its grid cell is sea. shoreX is
    // retained only for legacy importers (see OCEAN in config.js).
    oceanShoreX: OCEAN.shoreX, oceanSeaLevel: OCEAN.seaLevel,
    isInOcean: (x, z) => biomeAt(x, z) === "~",
    obstacles, resetDusk,
    propStats: { ...props.stats, cliffs: cliffs.count },
    getDusk: () => duskFactor,
    updateThreats: (dt, player, onScreech, onHit) =>
      atmosphere.updateThreats(dt, player, onScreech, onHit),
    resetThreats: () => atmosphere.resetThreats(),
  };
}

// Draws the muddy path as a thin ribbon draped over the terrain from the map's
// waypoints. The walkable corridor (P cells) is wider than the ribbon; the
// ribbon is inset 1u each side so it reads as a trodden trail centred in the
// gap, never climbing the flanking jungle-wall cells. No collider (the path is
// already passable; the jungle wall on either side does the blocking).
function buildMuddyPath(scene, heightAt) {
  const B = window.BABYLON;
  const spec = getMuddyPath();
  if (!spec || !spec.waypoints || spec.waypoints.length < 2) return null;
  const wp = spec.waypoints;
  const half = Math.max(0.5, (spec.halfWidthU || 2.4) - 1.0);  // inset 1u off each wall

  // Resample the polyline at ~1u so the ribbon drapes over terrain undulation.
  const pts = [];
  for (let i = 0; i < wp.length - 1; i++) {
    const a = wp[i], b = wp[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const steps = Math.max(1, Math.round(Math.hypot(dx, dz)));
    for (let s = 0; s < steps; s++) pts.push({ x: a.x + dx * (s / steps), z: a.z + dz * (s / steps) });
  }
  pts.push({ x: wp[wp.length - 1].x, z: wp[wp.length - 1].z });

  // Smooth the centreline: the waypoints are piecewise-linear, so each one is a
  // CORNER where the perpendicular flips and the two rails cross — that fold is
  // the vertical "slab" artefact. A couple of moving-average passes round the
  // corners so the rails never cross.
  let line = pts;
  for (let pass = 0; pass < 3; pass++) {
    line = line.map((p, i) => (i === 0 || i === line.length - 1) ? p : {
      x: (line[i - 1].x + p.x + line[i + 1].x) / 3,
      z: (line[i - 1].z + p.z + line[i + 1].z) / 3,
    });
  }

  // Start at the JUNGLE EDGE (drop the leading clearing cells by the plane), and
  // END at the north TREE LINE (drop trailing samples that have no jungle/forest
  // flanking them — i.e. the trail has spilled into the open savannah).
  const nearTrees = (x, z) => {
    for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, -4]]) {
      const b = biomeAt(x + dx, z + dz);
      if (b === "J" || b === "F") return true;
    }
    return false;
  };
  let s0 = 0;
  while (s0 < line.length - 2 && biomeAt(line[s0].x, line[s0].z) === "C") s0++;
  let s1 = line.length;
  while (s1 > s0 + 2 && !nearTrees(line[s1 - 1].x, line[s1 - 1].z)) s1--;
  const route = line.slice(s0, s1);
  if (route.length < 2) return null;

  // Two rails, offset along the local perpendicular, each draped to ground.
  const left = [], right = [];
  for (let i = 0; i < route.length; i++) {
    const prev = route[Math.max(0, i - 1)], next = route[Math.min(route.length - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const nx = -tz, nz = tx;
    const lx = route[i].x + nx * half, lz = route[i].z + nz * half;
    const rx = route[i].x - nx * half, rz = route[i].z - nz * half;
    left.push(new B.Vector3(lx, heightAt(lx, lz) + 0.06, lz));
    right.push(new B.Vector3(rx, heightAt(rx, rz) + 0.06, rz));
  }

  const ribbon = B.MeshBuilder.CreateRibbon("muddyPath", { pathArray: [left, right] }, scene);
  ribbon.isPickable = false;
  ribbon.checkCollisions = false;
  ribbon.receiveShadows = true;
  // PBR (not Standard) so the warm sun doesn't blow the tint out to orange. The
  // dryground dirt albedo+normal give earthy grain; a neutral brown tint + larger
  // tiling read as a mottled muddy track, not a flat sandy/orange strip.
  const tp = ENV.texturePath;
  const mkTex = (f) => { const tex = new B.Texture(tp + f, scene); tex.uScale = 2.5; tex.vScale = 14; tex.anisotropicFilteringLevel = 8; return tex; };
  const mat = new B.PBRMaterial("muddyPathMat", scene);
  mat.albedoTexture = mkTex("dryground_albedo.jpg");
  mat.bumpTexture = mkTex("dryground_normal.jpg");
  mat.albedoColor = new B.Color3(0.40, 0.32, 0.23).toLinearSpace();  // earthy brown mud (less orange)
  mat.metallic = 0;
  mat.roughness = 1;            // matte wet dirt, no specular sheen
  mat.backFaceCulling = false;  // ribbon winding faces down on some segments
  ribbon.material = mat;
  return ribbon;
}

// Builds the surrounding OCEAN: a large open-water surface plane covering the
// whole map (the island terrain rises through it; the seabed is carved by the
// grid height field), with a gentle vertical SWELL animated on the plane's own
// vertices, a brighter SHALLOW grade where the seabed nears the surface, and
// reflection-ish specular in keeping with the pond's water material.
function buildOcean(scene) {
  const B = window.BABYLON;
  // A big subdivided plane so the swell can ripple its vertices. It spans well
  // past the island so the sea reads as open ocean to the horizon.
  const seg = 80;
  const sea = B.MeshBuilder.CreateGround("ocean", {
    width: OCEAN.planeSize, height: OCEAN.planeSize, subdivisions: seg, updatable: true,
  }, scene);
  // Centre the plane on the island grid; the sea surrounds the whole island.
  sea.position.set(FIELD.x0 + FIELD.w / 2, OCEAN.seaLevel, FIELD.z0 + FIELD.h / 2);
  sea.isPickable = false;

  const seaMat = new B.StandardMaterial("oceanMat", scene);
  seaMat.diffuseColor = new B.Color3(OCEAN.deepColor.r, OCEAN.deepColor.g, OCEAN.deepColor.b);
  seaMat.emissiveColor = new B.Color3(OCEAN.deepColor.r * 0.4, OCEAN.deepColor.g * 0.45, OCEAN.deepColor.b * 0.5);
  seaMat.specularColor = new B.Color3(0.7, 0.85, 0.95);  // bright sky reflection glints
  seaMat.specularPower = 96;
  seaMat.alpha = 0.86;
  sea.material = seaMat;

  // Shallow-water tint + a foam-ish brightening near the waterline, baked into
  // the plane's vertex colours from the WATER COLUMN DEPTH under each vertex
  // (sea surface minus the grid seabed height) — so the grade follows the
  // organic grid coast on every side of the island, not a straight line.
  const pos = sea.getVerticesData(B.VertexBuffer.PositionKind);
  const cols = new Float32Array((pos.length / 3) * 4);
  const baseX = sea.position.x, baseZ = sea.position.z;
  for (let i = 0; i < pos.length; i += 3) {
    const wx = baseX + pos[i], wz = baseZ + pos[i + 2];
    const depth = OCEAN.seaLevel - sampleField(FIELD.height, wx, wz);
    // 0 right at the waterline .. 1 over the deep seabed — first-pass for owner eyeball
    const deep = Math.min(1, Math.max(0, depth / 6));
    const sh = OCEAN.shallowColor, dp = OCEAN.deepColor, fm = OCEAN.foamColor;
    let r = sh.r * (1 - deep) + dp.r * deep;
    let g = sh.g * (1 - deep) + dp.g * deep;
    let b = sh.b * (1 - deep) + dp.b * deep;
    // foam: a bright lift right where the seabed meets the surface. The plane's
    // vertex spacing (~55u) is far coarser than the coast, so this reads as a
    // soft surf glow, not a crisp line — a flagged polish follow-up.
    const foam = Math.max(0, 1 - Math.abs(depth) / 1.5);
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

  // The blend weights ride a small RG8 MASK TEXTURE rasterised from the grid's
  // blurred fields, sampled in-shader by WORLD position. (The ground's
  // vertex-colour alpha can't carry them: with an opaque material Babylon never
  // defines VERTEXALPHA, so vColor.a is forced to 1.0 in the vertex shader.)
  //   R: sand-albedo replace weight (desert D, beach B, seabed ~), with the
  //      damp-foreshore attenuation baked in so the wet vertex tint shows;
  //   G: "kill the green texture" weight (rocky R, mountain M, path P) — the
  //      grass detail albedo is replaced by the painted vertex colour there.
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const maskData = new Uint8Array(FIELD.w * FIELD.h * 2);
  for (let r = 0; r < FIELD.h; r++) {
    for (let c = 0; c < FIELD.w; c++) {
      const i = r * FIELD.w + c;
      let wgt = FIELD.sand[i];
      if (wgt > 0.03 && FIELD.height[i] <= OCEAN.seaLevel + 0.2) wgt *= 0.35; // wet sand — first-pass for owner eyeball
      maskData[i * 2] = clamp255(wgt);
      maskData[i * 2 + 1] = clamp255(FIELD.rock[i]);
    }
  }
  const maskTex = new B.RawTexture(maskData, FIELD.w, FIELD.h,
    B.Engine.TEXTUREFORMAT_RG, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
  maskTex.wrapU = maskTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;

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
          { name: "sandMaskRect", size: 4, type: "vec4" },  // xy: field origin, zw: 1/size (world→uv)
        ],
        fragment: `#ifdef SANDBLEND
uniform vec3 sandColor;
uniform vec3 sandColorVar;
uniform float sandRoughness;
uniform vec4 sandMaskRect;
uniform sampler2D sandMaskSampler;
vec2 groundMaskW(vec3 p) {
  return texture2D(sandMaskSampler, (p.xz - sandMaskRect.xy) * sandMaskRect.zw).rg;
}
#endif`,
      };
    }
    getSamplers(samplers) { samplers.push("sandMaskSampler"); }
    bindForSubMesh(ubo) {
      ubo.updateColor3("sandColor", new B.Color3(D.sandColor[0], D.sandColor[1], D.sandColor[2]));
      ubo.updateColor3("sandColorVar", new B.Color3(D.sandColorVar[0], D.sandColorVar[1], D.sandColorVar[2]));
      ubo.updateFloat("sandRoughness", D.sandRoughness);
      ubo.updateFloat4("sandMaskRect", FIELD.x0, FIELD.z0, 1 / FIELD.w, 1 / FIELD.h);
      ubo.setTexture("sandMaskSampler", maskTex);
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
    vec2 gmW = groundMaskW(vPositionW);
    // Subtle grain variation from world XZ. Two octaves of value-noise via
    // sines give light/dark patches so the replaced floors aren't a flat fill.
    vec2 wp = vPositionW.xz;
    float grain = 0.6 * sin(wp.x * 0.9 + wp.y * 0.7)
                + 0.4 * sin(wp.x * 0.31 - wp.y * 0.43 + 1.7);
    // Rock/dirt floors (mask G): REPLACE the green grass detail texture with
    // the painted per-vertex biome colour (+ grain) so the rocky pass, the
    // mountain mass and the muddy path read grey/brown, never grass-hued.
#ifdef VERTEXCOLOR
    if (gmW.g > 0.001) {
      vec3 paintCol = clamp(vColor.rgb * (1.0 + 0.12 * grain), 0.0, 1.0);
      surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(paintCol), gmW.g);
    }
#endif
    // Desert/beach/seabed (mask R): REPLACE toward the warm sand albedo,
    // hue-locked to sandColor with only luminance grain.
    if (gmW.r > 0.001) {
      vec3 sandCol = clamp(sandColor + sandColorVar * grain, 0.0, 1.0);
      surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(sandCol), gmW.r);
    }
#endif
`,
        // Roughness lift to matte dry sand. This DOES take effect at
        // UPDATE_METALLICROUGHNESS (the reflectivity block's metallicRoughness flows
        // to reflectivityOut, which the main scope consumes), unlike its albedo.
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef SANDBLEND
    vec2 gmWr = groundMaskW(vPositionW);
    float dryWr = max(gmWr.r, gmWr.g);   // sand AND rock/dirt floors go matte
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
  // Soft + high: at 0.55 alpha / 70u height the squashed spheres read as hard
  // grey UFO discs from the ground and white blotches from overhead. Thinner
  // alpha + a much flatter profile + the raised ATMOSPHERE.cloudHeight push
  // them into the haze so they read as distant cloud. first-pass for owner eyeball
  cloudMat.alpha = 0.25;
  cloudMat.disableLighting = true;
  const clouds = [];
  for (let i = 0; i < ATMOSPHERE.cloudCount; i++) {
    const c = B.MeshBuilder.CreateSphere("cloud" + i, { segments: 6, diameter: 1 }, scene);
    c.material = cloudMat;
    c.isPickable = false;
    const s = 22 + Math.random() * 30;            // first-pass for owner eyeball
    c.scaling.set(s, s * 0.18, s * 0.7);
    // Spread over the WHOLE island span (the old radial 30-150u ring clustered
    // every cloud over the savannah centre — they read as white blotches on the
    // grass in overhead shots). Bounds track the grid field.
    c.position.set(
      FIELD.x0 + 40 + Math.random() * (FIELD.w - 80),
      ATMOSPHERE.cloudHeight + Math.random() * 25,
      FIELD.z0 + 40 + Math.random() * (FIELD.h - 80),
    );
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
        if (c.mesh.position.x > FIELD.x0 + FIELD.w) c.mesh.position.x = FIELD.x0;
      }
    },
    // Pterosaur dive attack. Called from the game loop with the live player and
    // hit/screech callbacks so the swoop can react to the raptor's position.
    updateThreats(dt, player, onScreech, onHit) {
      const D = PTERO_DIVE;
      if (!D.enabled) { if (dive.state !== "idle") endDive(dive.bird); return; } // swoop disabled — flock just circles
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
function makeCardMaterial(scene, name, albedoFile, opacityFile, tint, opts = {}) {
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
  // Crossed-quad cards are double-sided; without two-sided lighting the back
  // face of each quad keeps the front normal and lights as if facing AWAY from
  // the sun, so a blade seen from its back reads near-black. Flip the normal
  // per-face so both sides catch the light.
  m.twoSidedLighting = true;
  m.transparencyMode = B.Material.MATERIAL_ALPHATEST;
  // Per-material alpha-test threshold. The grass-blade opacity map keeps only a
  // narrow white spine per blade at the default 0.4, so the alpha-test discarded
  // all but the blade's dark central vein — thin dark strands. A LOWER cutoff
  // (passed in for grass) keeps more of the fuller blade body. Leaf cards keep
  // the default. See ENV.grassAlphaCutOff.
  m.alphaCutOff = opts.alphaCutOff ?? ENV.alphaCutOff;
  m.useAlphaFromDiffuseTexture = false;
  // DARK-SLIVER FIX (owner: "glitchy dark vertical slivers across the grass").
  // The ground is PBR lit by the HDRI environment (IBL); these cards are
  // StandardMaterial and get NO IBL. WORSE, the grass-blade albedo is itself a
  // dark olive (measured avg ≈ RGB[80,104,51]/255 over the opaque blade pixels),
  // so a near-vertical blade — catching little hemi/sun on its sideways face and
  // no IBL — renders far DARKER than the bright grass ground around it: the dark
  // slivers. Fix (grass only, via opts.brighten): (a) lift the sampled albedo
  // with diffuseTexture.level so the blade colour leaves the dark band, and
  // (b) make the blade SELF-ILLUMINATE from its own (brightened) texture so it
  // never sinks to black on a shadowed/edge-on face — i.e. emissiveTexture =
  // the albedo at emissiveColor = brighten.selfIllum. Together the blades sit in
  // the same brightness band as the lit ground and read as lush grass. Leaf
  // cards (no opts.brighten) keep the original look.
  if (opts.brighten) {
    m.diffuseTexture.level = opts.brighten.texLevel;
    m.emissiveTexture = m.diffuseTexture;     // self-light by the blade's own texture
    const si = opts.brighten.selfIllum;
    m.emissiveColor = new B.Color3(si, si, si);
  }
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
  // Keep foliage on the island: nothing planted in the sea, on the beach sand
  // or up the mountain mass (per-cell prop placement lands in the prop stage —
  // this is just the grid-aware "don't plant in the water/sand" guard).
  const inArena = (x, z) => {
    const code = biomeAt(x, z);
    return code !== "~" && code !== "B" && code !== "M" && !inPond(x, z);
  };
  // --- Rock SOURCES: real CC0 ROCK PBR on IRREGULAR displaced geometry -----
  // Each rock is a subdivided icosphere whose vertices are noise-displaced
  // (jagged, no two alike), wearing a tiled rock albedo+normal+roughness PBR
  // material. PLACEMENT moved to the grid prop layer (scatterIslandProps reads
  // the `r` cells); only the shape/material sources are built here.
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

  // --- Grass: textured alpha-cut GRASS-BLADE cards ------------------------
  // Crossed-quad clumps of real cutout grass blades (Foliage001 atlas), tinted
  // per palette green + size-varied so the ground cover is irregular and lush,
  // not solid cones. One source per palette green × atlas slice; both the
  // mid-field "patches" and the dense near "ground cover" instance off these.
  // Grass blades separate along U (columns) in the Foliage001 atlas, so crop a
  // narrow U band (a few blades) at full V (the tall blade). Two crossed quads.
  const grassCols = [[0.0, 0.28], [0.30, 0.58], [0.60, 0.88], [0.12, 0.42]];
  const grassSources = [];
  // Use the dedicated brighter GRASS palette (not the canopy's foliageGreens) so
  // blades sit in the lit ground's brightness band — see config grassGreens.
  const grassCardOpts = { alphaCutOff: ENV.grassAlphaCutOff, brighten: ENV.grassBrighten };
  ENV.grassGreens.forEach((tint, k) => {
    const mat = makeCardMaterial(scene, "grassCardMat" + k, ENV.grassCardAlbedo, ENV.grassCardOpacity, tint, grassCardOpts);
    const col = grassCols[k % grassCols.length];
    grassSources.push(makeCardClusterSource(scene, "grassClu" + k, mat, 2, 1.6, 1.3, col, [0.0, 1.0], 0));
  });
  // Deeper jungle-green understorey sources for the thicket zone.
  const jungleGrassSources = JUNGLE_ZONE.junglePalette.map((tint, k) =>
    makeCardClusterSource(scene, "jGrassClu" + k,
      makeCardMaterial(scene, "jGrassMat" + k, ENV.grassCardAlbedo, ENV.grassCardOpacity, tint, grassCardOpts),
      2, 1.6, 1.3, grassCols[k % grassCols.length], [0.0, 1.0], 0));
  const coverSwayers = [];
  // Green blades belong only on the GREEN-floor biomes (savannah, clearing,
  // forest, swamp, jungle). Never on rock/mountain/desert/beach/path/sea — the
  // rocky pass in particular was growing floating green tufts on bare stone.
  const GREEN_GRASS = { G: 1, C: 1, F: 1, S: 1, J: 1 };
  const placeGrassCard = (x, z, sMin, sMax, idx, tag) => {
    if (!GREEN_GRASS[biomeAt(x, z)]) return null;
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
  const jzAreaG = (JUNGLE_ZONE.radius / ARENA.radius) ** 2;
  const jzExtraGrass = Math.round(ENV.groundCoverCount * jzAreaG * (JUNGLE_ZONE.grassDensityMul - 1));
  for (let i = 0; i < jzExtraGrass; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * JUNGLE_ZONE.radius;
    const x = JUNGLE_ZONE.centerX + Math.cos(a) * rr;
    const z = JUNGLE_ZONE.centerZ + Math.sin(a) * rr;
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
    for (const sw of coverSwayers) sw.mesh.rotation.z = sw.base + Math.sin(wt + sw.phase) * sw.amp;
  };

  // rockShapes: the grey procedural boulder sources, consumed by the prop
  // layer's `r` cells (spec: the desert keeps THESE rocks, not the red glb pack).
  return { obstacles, windUpdate, rockShapes };
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
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * DRY_ZONE_GEO.radius * rMul;
    return [DRY_ZONE_GEO.centerX + Math.cos(a) * rr, DRY_ZONE_GEO.centerZ + Math.sin(a) * rr];
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
      const a = rng() * Math.PI * 2, rr = (0.35 + 0.65 * rng()) * DRY_ZONE_GEO.radius;
      x = DRY_ZONE_GEO.centerX + Math.cos(a) * rr; z = DRY_ZONE_GEO.centerZ + Math.sin(a) * rr;
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

// ============================================================================
// ISLAND PROP LAYER — grid-driven scatter (design/map.props.json via map.js).
// Every placement comes from the per-cell prop grid; geometry is batched as
// CHUNKED THIN INSTANCES: placements collect into MAP.scatterChunk-wide tiles,
// one thin-instance clone per (tile, source mesh), each tile toggled by a
// throttled per-prop distance cull. Matrices are baked once and frozen; no
// scatter casts shadows (perf rules). Blocking placements append {x,z,r} AI
// footprints to the shared obstacle list (the player is blocked by the same
// cells via the grid test in player.js).
// ============================================================================

// Import a glb pack once.
function importPack(scene, url) {
  const B = window.BABYLON;
  const slash = url.lastIndexOf("/") + 1;
  return B.SceneLoader.ImportMeshAsync("", url.slice(0, slash), url.slice(slash), scene);
}

// Thin instances draw in source order with no per-instance depth sort, so any
// alpha-BLENDED foliage material is coerced to alpha-TEST (sort-free, cheaper;
// the cutout look matches the existing card foliage). Cutoff = Babylon default.
function coerceAlphaTest(B, meshes) {
  for (const m of meshes) {
    const mat = m.material;
    if (mat && mat.needAlphaBlending && mat.needAlphaBlending()) {
      mat.transparencyMode = B.Material.MATERIAL_ALPHATEST;
      mat.alphaCutOff = 0.4;
    }
  }
}

// Build instanceable SOURCES from an imported pack: per tree id, a list of
// {mesh, local} parts where `local` maps the part into a NORMALISED frame —
// the group's bbox bottom-centre at the origin and bbox height = targetHeight.
// A placement matrix then just scales/yaws/translates that frame, and ground
// clamping is exact: the frame's y=0 IS the group's lowest vertex.
function buildPackSources(B, meshes, packDef, sources) {
  const vertexMeshes = meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
  meshes.forEach((m) => { m.isVisible = false; m.isPickable = false; });
  const groups = packDef.kind === "whole"
    ? [{ id: packDef.trees[0].id, meshes: vertexMeshes }]
    : packDef.trees.map((t) => ({
        id: t.id,
        // prefix match: glb node names carry material/index suffixes
        meshes: vertexMeshes.filter((m) => t.parts.some((p) => m.name.startsWith(p))),
      }));
  for (const g of groups) {
    if (!g.meshes.length) {
      console.warn("prop pack source has no meshes:", g.id);
      continue;
    }
    // Drop baked ground-plane quads: some glbs (e.g. jungle_tree_lod2's
    // Material.003) ship a flat horizontal slab at the trunk foot that, once
    // normalised + scaled, reads as a dark ~11m square hovering above the grass.
    // A genuine tree part always has real vertical thickness; a baked floor quad
    // is zero-height. Drop any mesh whose y-extent is degenerate (<0.1% of its
    // own footprint) so only true zero-thickness planes are culled, never bark.
    g.meshes.forEach((m) => m.computeWorldMatrix(true));
    g.meshes = g.meshes.filter((m) => {
      const bb = m.getBoundingInfo().boundingBox;
      const yExt = bb.maximumWorld.y - bb.minimumWorld.y;
      const foot = Math.max(
        bb.maximumWorld.x - bb.minimumWorld.x,
        bb.maximumWorld.z - bb.minimumWorld.z,
      );
      return yExt > 0.001 * foot;
    });
    if (!g.meshes.length) {
      console.warn("prop pack source was all ground-plane quads:", g.id);
      continue;
    }
    let min = new B.Vector3(Infinity, Infinity, Infinity);
    let max = new B.Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of g.meshes) {
      const bb = m.getBoundingInfo().boundingBox;
      min = B.Vector3.Minimize(min, bb.minimumWorld);
      max = B.Vector3.Maximize(max, bb.maximumWorld);
    }
    const k = packDef.targetHeight / Math.max(0.0001, max.y - min.y);
    const frame = B.Matrix.Translation(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2)
      .multiply(B.Matrix.Scaling(k, k, k));
    sources[g.id] = g.meshes.map((m) => ({ mesh: m, local: m.getWorldMatrix().multiply(frame) }));
  }
}

// Bare thin-instance host: a clone of the source mesh (shared geometry +
// material, identity transform, not pickable, no shadows). The caller owns
// the matrix buffer. NOTE a mesh's thin-instance world0-3 buffers live on its
// GEOMETRY, which clones share — so each source part mesh may host exactly
// ONE thin-instance clone (two clones of the same part would overwrite each
// other's matrices and only the last one would ever draw).
function makeThinClone(B, mesh, name, mirrored) {
  const clone = mesh.clone(name, null, true);
  clone.parent = null;
  clone.position.setAll(0);
  clone.rotationQuaternion = null;
  clone.rotation.set(0, 0, 0);
  clone.scaling.setAll(1);
  clone.isVisible = true;
  clone.isPickable = false;
  clone.receiveShadows = false;
  // glTF imports carry a NEGATIVE-determinant root transform (RH->LH mirror).
  // Babylon flips face orientation off the mesh's WORLD matrix determinant —
  // but that mirror is now baked into the thin-instance MATRICES while the
  // clone's own world matrix is identity, so without this override every glb
  // face renders inside-out (black trees/cliffs). Batches share one handedness
  // (same source pipeline), so the first matrix's determinant decides; the
  // procedural rocks/canopy bake positive-determinant matrices and keep theirs.
  if (mirrored) {
    const baseSide = mesh.overrideMaterialSideOrientation
      ?? (mesh.material && mesh.material.sideOrientation)
      ?? B.Material.CounterClockWiseSideOrientation;
    clone.overrideMaterialSideOrientation = baseSide === B.Material.ClockWiseSideOrientation
      ? B.Material.CounterClockWiseSideOrientation
      : B.Material.ClockWiseSideOrientation;
  }
  return clone;
}

// One-shot batch: realise a full matrix list on a part's single clone (for
// builders that never re-pack, e.g. the mountain cliffs).
function makeStaticThinClone(B, mesh, mats, name) {
  const clone = makeThinClone(B, mesh, name, mats[0].determinant() < 0);
  const buf = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => m.copyToArray(buf, i * 16));
  clone.thinInstanceSetBuffer("matrix", buf, 16, true);
  clone.thinInstanceRefreshBoundingInfo();
  clone.freezeWorldMatrix();
  return clone;
}

// The per-cell prop scatter itself. Returns { update, stats }: update runs the
// throttled chunk cull; stats reports placement counts for verification.
async function scatterIslandProps(scene, heightAt, island, obstacles, rockShapes) {
  const B = window.BABYLON;
  const rng = mulberry32(20260613);
  const rand = (a, b) => a + rng() * (b - a);

  // --- load every referenced pack once, build normalised sources -----------
  const sources = {};
  const packKeys = ["jungle", "forest", "locust", "realistic", "deadTree", "desertOldTree", "shrubs"];
  await Promise.all(packKeys.map(async (key) => {
    const def = TREE_PACKS[key];
    const res = await importPack(scene, def.url);
    coerceAlphaTest(B, res.meshes);
    buildPackSources(B, res.meshes, def, sources);
  }));
  // understory variants: one whole-glb source per url (ids f0, f1, g0, ...)
  const understoryIds = {};
  await Promise.all(Object.keys(UNDERSTORY).filter((k) => UNDERSTORY[k].urls).map(async (code) => {
    const cfg = UNDERSTORY[code];
    understoryIds[code] = cfg.urls.map((_, i) => code + i);
    await Promise.all(cfg.urls.map(async (url, i) => {
      const res = await importPack(scene, url);
      coerceAlphaTest(B, res.meshes);
      buildPackSources(B, res.meshes,
        { kind: "whole", targetHeight: cfg.targetHeight, trees: [{ id: code + i }] }, sources);
    }));
  }));

  // --- collect placements into chunk batches --------------------------------
  const CHUNK = MAP.scatterChunk;
  const chunkMap = new Map();   // "code:cx,cz" -> { x, z, cullR, batches }
  const addPlacement = (code, cullR, parts, world) => {
    const x = world.m[12], z = world.m[14];
    const key = code + ":" + Math.floor(x / CHUNK) + "," + Math.floor(z / CHUNK);
    let chunk = chunkMap.get(key);
    if (!chunk) {
      chunkMap.set(key, chunk = {
        x: (Math.floor(x / CHUNK) + 0.5) * CHUNK,
        z: (Math.floor(z / CHUNK) + 0.5) * CHUNK,
        cullR, batches: new Map(),
      });
    }
    for (const part of parts) {
      let arr = chunk.batches.get(part.mesh);
      if (!arr) chunk.batches.set(part.mesh, arr = []);
      arr.push(part.local.multiply(world));
    }
  };
  const yawScaleAt = (x, y, z, yaw, s) =>
    B.Matrix.Scaling(s, s, s).multiply(B.Matrix.RotationY(yaw)).multiply(B.Matrix.Translation(x, y, z));

  const stats = { trees: {}, understory: {}, rocks: 0 };

  // Trees + shrubs (codes T t a d s): variant uniformly off the code's mix
  // list (the savannah list is 3 locust : 2 realistic — the spec's mix).
  for (const code of ["T", "t", "a", "d", "s"]) {
    const cfg = PROPS[code];
    let n = 0;
    for (const p of island.placements[code]) {
      const parts = sources[cfg.trees[(rng() * cfg.trees.length) | 0]];
      if (!parts) continue;
      const s = rand(cfg.minScale, cfg.maxScale);
      addPlacement(code, cfg.cullRadius, parts,
        yawScaleAt(p.x, heightAt(p.x, p.z) - (cfg.sink ?? PROPS.treeSink), p.z, rng() * Math.PI * 2, s));
      if (cfg.blocking) obstacles.push({ x: p.x, z: p.z, r: 1.1 * s });
      n++;
    }
    stats.trees[code] = n;
  }

  // Walk-through understory (codes f g m L) — never blocks, hard 68u cull.
  for (const code of ["f", "g", "m", "L"]) {
    const cfg = UNDERSTORY[code];
    const ids = understoryIds[code] || [];
    let n = 0;
    for (const p of island.placements[code]) {
      const parts = sources[ids[(rng() * ids.length) | 0]];
      if (!parts) continue;
      addPlacement(code, UNDERSTORY.cullRadius, parts,
        yawScaleAt(p.x, heightAt(p.x, p.z) - 0.05, p.z, rng() * Math.PI * 2, rand(cfg.minScale, cfg.maxScale)));
      n++;
    }
    stats.understory[code] = n;
  }

  // Procedural grey rocks (code r — the existing boulder sources, partially
  // buried + fully random orientation exactly like the old placeRock).
  const rockParts = rockShapes.map((m) => ({ mesh: m, local: B.Matrix.Identity() }));
  for (const p of island.placements.r) {
    const s = p.biome === "M"
      ? rand(PROPS.mountainRockScaleMin, PROPS.mountainRockScaleMax)
      : rand(PROPS.rockScaleMin, PROPS.rockScaleMax);
    // Bed the foot into the ground, scaled by rock size: a big boulder on a dune
    // slope lifts ~0.5u on its downhill edge, so sink the centre ~¼ of its scale
    // (was +0.05·s, which LIFTED rocks and left slope-side ones floating).
    const world = B.Matrix.Scaling(s * rand(0.85, 1.2), s * rand(0.6, 1.0), s * rand(0.85, 1.2))
      .multiply(B.Matrix.RotationYawPitchRoll(rand(0, 6), rand(0, 6), rand(0, 6)))
      .multiply(B.Matrix.Translation(p.x, heightAt(p.x, p.z) - s * 0.25, p.z));
    addPlacement("r", PROPS.rockCullRadius, [rockParts[(rng() * rockParts.length) | 0]], world);
    obstacles.push({ x: p.x, z: p.z, r: s * 0.9 });
    stats.rocks++;
  }

  // --- realise chunks + the distance cull -----------------------------------
  // A part mesh can host only ONE thin-instance clone (see makeThinClone), so
  // chunks can't each own a clone. Instead: one full-capacity clone per part;
  // each chunk holds per-part matrix BLOCKS, and the cull re-packs the
  // in-range blocks into the part's buffer + adjusts thinInstanceCount.
  const chunks = [];
  const stores = new Map();   // source part mesh -> { clone, buf, blocks }
  for (const chunk of chunkMap.values()) {
    const parts = [];
    for (const [mesh, mats] of chunk.batches) {
      let store = stores.get(mesh);
      if (!store) stores.set(mesh, store = { mesh, mirrored: mats[0].determinant() < 0, blocks: [] });
      const data = new Float32Array(mats.length * 16);
      mats.forEach((m, i) => m.copyToArray(data, i * 16));
      const block = { data, on: false };
      store.blocks.push(block);
      parts.push({ store, block });
    }
    // half-diagonal slack so a tile only vanishes once ALL of it is out of range
    chunks.push({ x: chunk.x, z: chunk.z, r: chunk.cullR + CHUNK * 0.71, parts, enabled: false });
  }
  let cloneId = 0;
  for (const store of stores.values()) {
    store.clone = makeThinClone(B, store.mesh, "prop_ti_" + cloneId++, store.mirrored);
    store.buf = new Float32Array(store.blocks.reduce((n, b) => n + b.data.length, 0));
    store.clone.thinInstanceSetBuffer("matrix", store.buf, 16, false);
    store.clone.freezeWorldMatrix();
    store.clone.setEnabled(false);
  }
  const repack = (store) => {
    let off = 0;
    for (const b of store.blocks) {
      if (!b.on) continue;
      store.buf.set(b.data, off);
      off += b.data.length;
    }
    if (off === 0) { store.clone.setEnabled(false); return; }
    store.clone.thinInstanceCount = off / 16;
    store.clone.thinInstanceBufferUpdated("matrix");
    store.clone.thinInstanceRefreshBoundingInfo();
    store.clone.setEnabled(true);
  };
  const applyCull = (cx, cz) => {
    const dirty = new Set();
    for (const ch of chunks) {
      const want = (ch.x - cx) ** 2 + (ch.z - cz) ** 2 < ch.r * ch.r;
      if (want === ch.enabled) continue;
      ch.enabled = want;
      for (const p of ch.parts) { p.block.on = want; dirty.add(p.store); }
    }
    for (const store of dirty) repack(store);
  };
  // seat the initial enabled set around the spawn (no camera exists yet)
  applyCull(SPAWN.x, SPAWN.z);

  let cullTimer = 0;
  const update = (dt) => {
    cullTimer -= dt;
    if (cullTimer > 0) return;
    cullTimer = UNDERSTORY.cullInterval;
    const cam = scene.activeCamera;
    if (cam) applyCull(cam.globalPosition.x, cam.globalPosition.z);
  };

  return { update, stats };
}

// MOUNTAIN WALLS — cliff.glb pieces dressing every M-region edge that faces a
// playable cell (map.js mountainEdges, with the outward normal). Greedy
// min-spacing walk along the edge line; varied yaw/scale; ground-clamped and
// sunk into the rising mountain terrain. Always enabled (the wall IS the
// landmark that funnels the player into the rocky pass) — ~30-50 pieces of a
// 5.7k-tri mesh is cheap. Each piece registers an AI obstacle footprint.
async function buildMountainWalls(scene, heightAt, island, obstacles) {
  const B = window.BABYLON;
  const cfg = MAP.cliff;
  const rng = mulberry32(31415);
  const res = await importPack(scene, cfg.url);
  const sources = {};
  buildPackSources(B, res.meshes,
    { kind: "whole", targetHeight: cfg.targetHeight, trees: [{ id: "cliff" }] }, sources);
  const parts = sources.cliff;

  const placed = [];
  const perMesh = new Map();
  for (const e of island.mountainEdges) {
    let clear = true;
    for (const q of placed) {
      if ((q.x - e.x) ** 2 + (q.z - e.z) ** 2 < cfg.spacing * cfg.spacing) { clear = false; break; }
    }
    if (!clear) continue;
    placed.push(e);
    const yaw = Math.atan2(e.nx, e.nz) + (rng() - 0.5) * 0.6;  // face outward, jittered — first-pass for owner eyeball
    const s = 0.8 + rng() * 0.5;                                // varied piece size — first-pass for owner eyeball
    // Seat the base just below the M-cell ground. (An earlier attempt to bed it
    // on the LOWER valley-facing ground dropped the throat cliffs down into the
    // rock-pass ENTRANCE and sealed it — the gap the player walks through relies
    // on the wall pieces sitting up on the mountain shoulder, not in the floor.)
    const world = B.Matrix.Scaling(s, s, s)
      .multiply(B.Matrix.RotationY(yaw))
      .multiply(B.Matrix.Translation(e.x, heightAt(e.x, e.z) - cfg.sink, e.z));
    for (const part of parts) {
      let arr = perMesh.get(part.mesh);
      if (!arr) perMesh.set(part.mesh, arr = []);
      arr.push(part.local.multiply(world));
    }
    obstacles.push({ x: e.x, z: e.z, r: cfg.obstacleRadius * s });
  }
  let i = 0;
  for (const [mesh, mats] of perMesh) makeStaticThinClone(B, mesh, mats, "cliff_ti_" + i++);
  return { count: placed.length };
}

// FAKED JUNGLE INTERIOR — the spec's cheap canopy mass over the ~7k unseen
// interior tree cells: one squashed dark unlit blob per cellStride² block,
// sized to overlap its neighbours so the wall reads deep behind the real
// shell trees without geometry. One mesh + thin instances, never culled.
function buildJungleCanopy(scene, heightAt, island) {
  const B = window.BABYLON;
  const C = MAP.canopy;
  const rng = mulberry32(99);
  const src = B.MeshBuilder.CreateSphere("jungleCanopySrc", { segments: 6, diameter: 1 }, scene);
  const mat = new B.StandardMaterial("jungleCanopyMat", scene);
  mat.diffuseColor = B.Color3.Black();
  mat.specularColor = B.Color3.Black();
  mat.emissiveColor = new B.Color3(C.color[0], C.color[1], C.color[2]);
  mat.disableLighting = true;
  src.material = mat;
  src.isPickable = false;
  src.receiveShadows = false;
  const seen = new Set();
  const mats = [];
  for (const cell of island.jungleInterior) {
    const key = Math.floor(cell.x / C.cellStride) + "," + Math.floor(cell.z / C.cellStride);
    if (seen.has(key)) continue;
    seen.add(key);
    const d = C.cellStride * (1.6 + rng() * 0.8);   // blob diameter overlaps neighbours — first-pass for owner eyeball
    mats.push(B.Matrix.Scaling(d, d * 0.45, d)
      .multiply(B.Matrix.RotationY(rng() * Math.PI))
      .multiply(B.Matrix.Translation(cell.x, heightAt(cell.x, cell.z) + C.height, cell.z)));
  }
  const buf = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => m.copyToArray(buf, i * 16));
  src.thinInstanceSetBuffer("matrix", buf, 16, true);
  src.thinInstanceRefreshBoundingInfo();
  src.freezeWorldMatrix();
  return { count: mats.length };
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
