// ISLAND MAP RUNTIME — loads the SIGNED-OFF biome grid (design/map.grid.json),
// the per-cell prop layer (design/map.props.json) and the placement sheet
// (design/map.json), then derives everything the rest of the game samples:
// per-cell biome/prop lookup, the smoothed terrain height field,
// dune/desert-air weights, the ground tint texture, prop placements, the
// jungle shell (the real-tree budget) and the mountain wall line.
//
// Grid convention (design/MAP_SPEC.md): 1 cell = 1u = 0.9 m, row 0 = NORTH,
// cell[row][col] centre = (Xmin + col + 0.5, Zmax − row − 0.5).

import { MAP, OCEAN } from "./config.js";

// Companion to MAP.gridUrl / MAP.propsUrl (config.js): spawn, assets,
// territories, wall assets and the muddy path.
const MAP_JSON_URL = "design/map.json";

// small deterministic PRNG (same recipe as world.js — placement must be stable)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Separable box blur over a rows×cols Float32 field (repeated passes ≈ Gaussian).
function boxBlur(field, rows, cols, radius, passes) {
  const tmp = new Float32Array(field.length);
  const span = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let r = 0; r < rows; r++) {
      const off = r * cols;
      let acc = 0;
      for (let c = -radius; c <= radius; c++) acc += field[off + Math.min(cols - 1, Math.max(0, c))];
      for (let c = 0; c < cols; c++) {
        tmp[off + c] = acc / span;
        const cAdd = Math.min(cols - 1, c + radius + 1);
        const cSub = Math.max(0, c - radius);
        acc += field[off + cAdd] - field[off + cSub];
      }
    }
    // vertical
    for (let c = 0; c < cols; c++) {
      let acc = 0;
      for (let r = -radius; r <= radius; r++) acc += tmp[Math.min(rows - 1, Math.max(0, r)) * cols + c];
      for (let r = 0; r < rows; r++) {
        field[r * cols + c] = acc / span;
        const rAdd = Math.min(rows - 1, r + radius + 1);
        const rSub = Math.max(0, r - radius);
        acc += tmp[rAdd * cols + c] - tmp[rSub * cols + c];
      }
    }
  }
}

// Multi-source BFS distance (in cells, 4-neighbour) from every seed cell,
// capped at maxDepth. Returns Int16Array (0 = seed, -1 = beyond the cap).
function bfsDistance(seeds, rows, cols, passable, maxDepth) {
  const dist = new Int16Array(rows * cols).fill(-1);
  let frontier = [];
  for (const i of seeds) { dist[i] = 0; frontier.push(i); }
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const i of frontier) {
      const r = (i / cols) | 0, c = i % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (dist[j] !== -1 || !passable(j)) continue;
        dist[j] = d;
        next.push(j);
      }
    }
    frontier = next;
  }
  return dist;
}

// --- shared map state (populated once by initMap) ---------------------------
const expandRow = (row) => row.map(([n, ch]) => ch.repeat(n)).join("");

let _cols = 0, _rows = 0, _Xmin = 0, _Zmax = 0;
let _biome = null;     // array of row strings (fast charAt, no per-call allocation)
let _props = null;
let _impassable = Object.create(null);     // biome code -> true (grid legend)
let _blockingProp = Object.create(null);   // prop code -> true (props legend)
let _gridUnits = null;
let _placementSheet = null;                // design/map.json payload
let _ready = null;

// Async init — fetches all three design files once (idempotent; later calls
// return the same promise). All synchronous lookups below are valid after it.
export function initMap() {
  if (_ready) return _ready;
  _ready = Promise.all([
    fetch(MAP.gridUrl).then((r) => r.json()),
    fetch(MAP.propsUrl).then((r) => r.json()),
    fetch(MAP_JSON_URL).then((r) => r.json()),
  ]).then(([gridSpec, propSpec, placementSheet]) => {
    _gridUnits = gridSpec.units;
    ({ cols: _cols, rows: _rows, Xmin: _Xmin, Zmax: _Zmax } = _gridUnits);
    _biome = gridSpec.grid.map(expandRow);
    _props = propSpec.grid.map(expandRow);
    for (const [code, def] of Object.entries(gridSpec.legend)) {
      if (def.impassable) _impassable[code] = true;
    }
    for (const [code, def] of Object.entries(propSpec.legend)) {
      if (def.blocking) _blockingProp[code] = true;
    }
    _placementSheet = placementSheet;
  });
  return _ready;
}

// --- synchronous per-frame lookups -------------------------------------------
export function biomeAt(x, z) {
  const c = Math.floor(x - _Xmin), r = Math.floor(_Zmax - z);
  return (r < 0 || c < 0 || r >= _rows || c >= _cols) ? "~" : _biome[r][c];
}

export function propAt(x, z) {
  const c = Math.floor(x - _Xmin), r = Math.floor(_Zmax - z);
  return (r < 0 || c < 0 || r >= _rows || c >= _cols) ? "." : _props[r][c];
}

export const isImpassable = (code) => _impassable[code] === true;
export const isBlockingProp = (code) => _blockingProp[code] === true;

// --- design/map.json accessors ------------------------------------------------
export const getSpawn = () => _placementSheet.spawn;
export const getAssets = () => _placementSheet.assets;
export const getTerritories = () => _placementSheet.territories;
export const getMuddyPath = () => _placementSheet.muddyPath;
export const getWallAssets = () => _placementSheet.wallAssets;
export const getUnits = () => _gridUnits;

export async function loadIslandMap() {
  await initMap();
  const cols = _cols, rows = _rows, Xmin = _Xmin, Zmax = _Zmax;
  const biome = _biome, props = _props;

  const cellX = (c) => Xmin + c + 0.5;
  const cellZ = (r) => Zmax - r - 0.5;
  const colOf = (x) => Math.floor(x - Xmin);
  const rowOf = (z) => Math.floor(Zmax - z);
  const codeAtCell = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols) ? "~" : biome[r][c];
  const codeAt = (x, z) => codeAtCell(rowOf(z), colOf(x));
  const isBlocked = (x, z) => isImpassable(codeAt(x, z));

  // --- smoothed terrain height field --------------------------------------
  const height = new Float32Array(rows * cols);
  const duneW = new Float32Array(rows * cols);     // desert + rocky undulation weight
  const desertW = new Float32Array(rows * cols);   // desert-air (fog/sun) weight
  const landW = new Float32Array(rows * cols);     // 1 land / 0 sea (waterline + ocean tint)
  const H = MAP.cellHeights;
  for (let r = 0; r < rows; r++) {
    const row = biome[r];
    const off = r * cols;
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      height[off + c] = H[ch] !== undefined ? H[ch] : H.G;
      if (ch === "D" || ch === "R") duneW[off + c] = 1;
      if (ch === "D") desertW[off + c] = 1;
      if (ch !== "~") landW[off + c] = 1;
    }
  }
  boxBlur(height, rows, cols, MAP.heightBlurRadius, MAP.heightBlurPasses);
  boxBlur(duneW, rows, cols, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlur(desertW, rows, cols, MAP.maskBlurRadius, MAP.maskBlurPasses);
  boxBlur(landW, rows, cols, MAP.maskBlurRadius, MAP.maskBlurPasses);

  // Bilinear sample of a per-cell field at a world position (cell centres are
  // the sample points; clamped at the grid edge — beyond it the sea continues).
  function sampleField(field, x, z) {
    const fx = Math.min(cols - 1.001, Math.max(0, x - Xmin - 0.5));
    const fz = Math.min(rows - 1.001, Math.max(0, Zmax - z - 0.5));
    const c0 = fx | 0, r0 = fz | 0;
    const tx = fx - c0, tz = fz - r0;
    const i = r0 * cols + c0;
    const a = field[i], b = field[i + 1];
    const d = field[i + cols], e = field[i + cols + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
  }

  // Off-grid (beyond the sampled sea margin) the seabed continues flat.
  const seabed = H["~"];
  const inGrid = (x, z) => x >= Xmin && x <= Xmin + cols && z >= Zmax - rows && z <= Zmax;
  const baseHeightAt = (x, z) => (inGrid(x, z) ? sampleField(height, x, z) : seabed);
  const duneWeightAt = (x, z) => (inGrid(x, z) ? sampleField(duneW, x, z) : 0);
  const desertWeightAt = (x, z) => (inGrid(x, z) ? sampleField(desertW, x, z) : 0);
  const landWeightAt = (x, z) => (inGrid(x, z) ? sampleField(landW, x, z) : 0);

  // --- ground tint texture data (1 texel per cell, sampled in-shader) -----
  // RGB = the per-biome albedo tint multiplier; A = the sand-replace weight.
  // Texel row 0 maps to v=0 which the ground shader maps to grid row 0 (north).
  const tintData = new Uint8Array(rows * cols * 4);
  for (let r = 0; r < rows; r++) {
    const row = biome[r];
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      const tint = MAP.tints[ch] || MAP.tints.G;
      const sand = MAP.sandWeights[ch] || 0;
      const i = (r * cols + c) * 4;
      tintData[i] = Math.round(tint[0] * 255);
      tintData[i + 1] = Math.round(tint[1] * 255);
      tintData[i + 2] = Math.round(tint[2] * 255);
      tintData[i + 3] = Math.round(sand * 255);
    }
  }

  // --- jungle shell (real trees only on the visible face — spec budget) ---
  // Distance (in cells) of each J cell from the nearest non-J cell: depth 1..
  // shellDepth = real trees; deeper = faked interior (canopy mass).
  const nonJSeeds = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (biome[r][c] !== "J") nonJSeeds.push(r * cols + c);
  }
  const jShell = bfsDistance(nonJSeeds, rows, cols,
    (j) => biome[(j / cols) | 0][j % cols] === "J", MAP.jungleShellDepth);

  // Mountain face depth — prop rocks render only this close to the playable side.
  const playableSeeds = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = biome[r][c];
    if (ch !== "M" && ch !== "~") playableSeeds.push(r * cols + c);
  }
  const mShell = bfsDistance(playableSeeds, rows, cols,
    (j) => biome[(j / cols) | 0][j % cols] === "M", MAP.mountainRockShellDepth);

  // --- prop placements ------------------------------------------------------
  // One placement per prop cell, jittered off the cell centre (deterministic).
  const rng = mulberry32(20260612);
  const jit = () => (rng() * 2 - 1) * (MAP.jitter || 0.35);
  const placements = { T: [], t: [], a: [], d: [], s: [], r: [], f: [], g: [], m: [], L: [] };
  const jungleInterior = [];   // faked-interior tree cells (canopy mass)
  for (let r = 0; r < rows; r++) {
    const prow = props[r], brow = biome[r];
    for (let c = 0; c < cols; c++) {
      const p = prow[c];
      if (p === ".") continue;
      const b = brow[c];
      const x = cellX(c) + jit(), z = cellZ(r) + jit();
      if (p === "T") {
        const depth = jShell[r * cols + c];
        if (depth >= 0) placements.T.push({ x, z, depth });
        else jungleInterior.push({ x: cellX(c), z: cellZ(r) });
        continue;
      }
      if ((p === "f" || p === "m") && b === "J") {
        // jungle understory: only the visible shell (interior is unseen)
        if (jShell[r * cols + c] < 0) continue;
      }
      if (p === "r") {
        if (b === "M" && mShell[r * cols + c] < 0) continue;  // hidden mountain interior
        placements.r.push({ x, z, biome: b });
        continue;
      }
      if (placements[p]) placements[p].push({ x, z, biome: b });
    }
  }

  // --- mountain wall line (cliff.glb anchors) ------------------------------
  // M cells adjacent to a playable cell, with the outward (toward-playable)
  // direction so each cliff piece faces out of the wall.
  const mountainEdges = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (biome[r][c] !== "M") continue;
    let nx = 0, nz = 0, open = false;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ch = codeAtCell(r + dr, c + dc);
      if (ch !== "M" && ch !== "~") { open = true; nx += dc; nz += -dr; }
    }
    if (open) mountainEdges.push({ x: cellX(c), z: cellZ(r), nx, nz });
  }

  // --- per-biome cell lists for random scatter (grass cards, tufts, bones) --
  const cellLists = {};
  const cellsOf = (code) => {
    if (!cellLists[code]) {
      const list = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (biome[r][c] === code) list.push({ x: cellX(c), z: cellZ(r) });
      }
      cellLists[code] = list;
    }
    return cellLists[code];
  };

  return {
    cols, rows, Xmin, Zmax,
    codeAt, isBlocked,
    baseHeightAt, duneWeightAt, desertWeightAt, landWeightAt,
    seaLevel: OCEAN.seaLevel,
    tintData,
    placements, jungleInterior, mountainEdges,
    cellsOf,
  };
}
