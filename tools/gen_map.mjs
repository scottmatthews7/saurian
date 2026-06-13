// Generate the AUTHORITATIVE map spec as a BIOME GRID (one biome per cell) plus
// point overlays. A coding agent implements world.js straight from these:
//   design/map.grid.json — the biome grid: rows of single-char codes (the spec)
//   design/map.json      — units, legend, assets (glb + pos), territories, spawn, path
//   design/map.svg       — the grid rendered in colour + overlays (editable/preview)
//
// COORDINATES: world X (east+), Z (north+), in WORLD UNITS, 1u = 0.9 m (2u human = 1.8 m).
//   Grid: cell = CELL u. Cell [row][col] CENTRE = (Xmin+(col+0.5)*CELL, Zmax-(row+0.5)*CELL).
//   row 0 = NORTH edge. SVG is north-up (svgX=worldX, svgY=-worldZ).
// Each cell belongs to exactly ONE biome (assigned by priority below). Boundaries
// come out naturally jagged because the source zones are organic + the cell is small.
import { writeFileSync } from "node:fs";

const M_PER_U = 0.9, CELL = 1;            // 1 cell = 1 world unit = 0.9 m (exact distance)
const Xmin = -246, Xmax = 246, Zmax = 576, Zmin = -396;
const COLS = Math.round((Xmax - Xmin) / CELL), ROWS = Math.round((Zmax - Zmin) / CELL);
const rleRow = (s) => { const o = []; for (let i = 0; i < s.length;) { let n = 1; while (s[i + n] === s[i]) n++; o.push([n, s[i]]); i += n; } return o; };  // -> [[count,code],...]

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function blob(cx, cz, rx, ry, seed, n = 26) {
  const r = rng(seed); const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28; const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 + 0.15 * Math.sin(3 * a + p1) + 0.085 * Math.sin(5 * a + p2) + 0.05 * Math.sin(7 * a + p3) + (r() - 0.5) * 0.03; out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * ry * k]); }
  return out;
}
function pip([x, y], poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
function distSeg([px, py], [ax, ay], [bx, by]) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
function distLine(p, line) { let m = Infinity; for (let i = 0; i < line.length - 1; i++) m = Math.min(m, distSeg(p, line[i], line[i + 1])); return m; }

// ---------- LEGEND (code -> biome, colour, impassable) ----------
const LEGEND = {
  "~": { biome: "sea", fill: "#37657f", impassable: true },
  "G": { biome: "savannah", fill: "#88a64c", impassable: false },   // default ground (grass + scattered trees)
  "F": { biome: "forest", fill: "#2f7d3a", impassable: false },
  "J": { biome: "thickjungle", fill: "#173f1e", impassable: true },  // tree-wall (ALL jungle is thick — owner)
  "S": { biome: "swamp", fill: "#3e4a2a", impassable: false },
  "M": { biome: "mountain", fill: "#7c7468", impassable: true },     // wall
  "R": { biome: "rocky", fill: "#8f8c86", impassable: false },       // the valley/pass
  "D": { biome: "desert", fill: "#d6b66b", impassable: false },
  "B": { biome: "beach", fill: "#e7daa6", impassable: false },
  "C": { biome: "clearing", fill: "#a3b277", impassable: false },   // grass floor (owner)
  "P": { biome: "muddypath", fill: "#6b4f2a", impassable: false },   // corridor through the jungle wall
};

// ---------- SOURCE ZONES (organic; rasterised below) ----------
// Island outline — explicit coastline spanning the WHOLE island (south jungle lobe
// z≈-388 to north beach tip z≈+574), jittered. (A single ellipse can't make the
// elongated vase shape and was cutting the desert/beach off into the sea.)
const cr = rng(7);
// south end TRIMMED to just behind the clearing — the jungle is only a tree WALL
// (~30u thick) that blocks the player; no deep south lobe wasting tree assets
const coast = [
  [0, -298], [75, -285], [120, -200], [100, -120], [170, -30], [238, 80], [212, 185], [185, 255], [178, 335],
  [120, 420], [98, 480], [135, 525], [112, 562], [55, 572], [0, 574], [-55, 572], [-112, 562], [-135, 525],
  [-98, 480], [-120, 420], [-178, 335], [-185, 255], [-212, 185], [-238, 80], [-170, -30], [-100, -120], [-120, -200], [-75, -285],
].map(([x, z]) => [x + (cr() - 0.5) * 7, z + (cr() - 0.5) * 7]);
const Z = {                                                               // named zone polygons
  thickjungle: blob(-56, -250, 74, 90, 11), jungle: blob(56, -250, 74, 90, 12),
  forest: blob(-165, 70, 115, 66, 13),   // west edge overshoots the coast -> forest runs to the sea
  savannah: blob(0, 35, 188, 205, 14), swamp: blob(125, 98, 28, 28, 15),
  // mountains HUG the rocky pass: their inner edges overlap the rocky polygon so no
  // grass ever sits between wall and pass; they extend out past the coast (sea-clamped),
  // walling the flanks. Rocky = the navigable valley corridor between them.
  mountainW: blob(-148, 300, 98, 82, 16), rocky: blob(0, 310, 58, 85, 17), mountainE: blob(148, 300, 98, 82, 18),
  desert: blob(0, 432, 60, 56, 19), beach: blob(0, 528, 128, 34, 20),
};
const clearing = blob(0, -250, 13, 13, 21, 16);
// muddy path — one gentle natural S-curve through the jungle wall, clearing -> jungle
// N edge; densely sampled sine so the rasterised corridor is smooth, ±20u swing
const ROUTE = Array.from({ length: 14 }, (_, i) => {
  const t = i / 13;
  // First lobe swings WEST (-x) so the trail leaves the clearing on the opposite
  // side from the crashed plane (at +8,-244) — the player no longer walks through
  // the fuselage to reach the path. Mirror of the old +x S-curve; same endpoints.
  return [-20 * Math.sin(t * 2 * Math.PI), -250 + t * 100];
});
const PATH_HALF = 2.4;   // corridor through the jungle wall; min walkable width 3.4u (player body 2.2u fits + margin)

// assign exactly one biome code to a world point (priority order)
function codeAt(x, z) {
  const p = [x, z];
  if (!pip(p, coast)) return "~";
  if (pip(p, clearing)) return "C";
  if (distLine(p, ROUTE) < PATH_HALF) return "P";
  if (pip(p, Z.mountainW) || pip(p, Z.mountainE)) return "M";
  // the WHOLE south section is jungle, coast to coast — no grassland strips beside
  // the wall (owner). Wavy edge so the jungle->savannah line stays organic.
  if (z < -165 + 6 * Math.sin(x * 0.07) + 4 * Math.sin(x * 0.023)) return "J";
  if (pip(p, Z.thickjungle) || pip(p, Z.jungle)) return "J";   // ONE thick jungle, not half-half
  if (z > 555) return "B";                  // sand to the island's north tip (band overlaps the beach blob)
  if (pip(p, Z.beach)) return "B";
  if (pip(p, Z.desert)) return "D";
  if (pip(p, Z.rocky)) return "R";
  if (pip(p, Z.swamp)) return "S";
  if (pip(p, Z.forest)) return "F";
  // NO grass from the rocky part onwards (owner): unnamed ground north of the
  // pass mouth is mountain wall (hugs the rock), then desert sand up to the beach
  if (z > 370) return "D";
  if (z > 238) return "M";
  return "G";   // savannah/grass = default ground
}

// ---------- RASTERISE ----------
const grid = [];
for (let r = 0; r < ROWS; r++) {
  let row = "";
  for (let c = 0; c < COLS; c++) row += codeAt(Xmin + (c + 0.5) * CELL, Zmax - (r + 0.5) * CELL);
  grid.push(row);
}

// ---------- PROP LAYER (per-cell trees / rocks / foliage) ----------
// One prop code per cell ("." = empty). BLOCKING props are obstacles for the player
// AND for dinos — pathing must steer around those cells. Non-blocking = walk-through
// foliage. Densities are first-pass for owner eyeball (per-biome fraction of cells).
const PROPS = {
  "T": { props: ["jungle_tree.glb"], blocking: true },
  "t": { props: ["forest_trees.glb"], blocking: true },
  "a": { props: ["locust_tree_pack.glb", "realistic_trees_pack_of_2_free.glb"], blocking: true },   // MIX AND MATCH both styles across the savannah (owner)
  "m": { props: ["monstera.glb"], blocking: false },
  "f": { props: ["fern.glb", "fern2.glb"], blocking: false },
  "g": { props: ["geranium.glb", "geranium2.glb"], blocking: false },
  "L": { props: ["lupine.glb"], blocking: false },
  "r": { props: ["desert__rocks__stones__pack.glb", "procedural rock (world.js)"], blocking: true },
  "d": { props: ["desert_old_tree.glb", "dead_tree.glb"], blocking: true },
  "s": { props: ["desert_shrubs.glb"], blocking: false },
};
const PROP_DENSITY = {   // biome code -> [[prop code, fraction of cells], ...]
  J: [["T", 0.30], ["m", 0.08], ["f", 0.08]],
  F: [["t", 0.05], ["f", 0.09], ["g", 0.03]],  // forest trees: thinned to 0.05 (was 0.12 -> 0.084 -> 0.05; owner "still super dense")
  G: [["a", 0.005], ["r", 0.002], ["L", 0.015]],
  S: [["f", 0.10]], R: [["r", 0.03]], M: [["r", 0.25]], D: [["d", 0.004], ["r", 0.01], ["s", 0.02]],
  // beach, clearing, muddy path, sea: NO props (clean sand / set-dressing / corridor)
};
const propRng = rng(99);
const propGrid = grid.map((row) => {
  let out = "";
  for (const ch of row) {
    const table = PROP_DENSITY[ch];
    let code = ".";
    if (table) { const x = propRng(); let acc = 0; for (const [pc, frac] of table) { acc += frac; if (x < acc) { code = pc; break; } } }
    out += code;
  }
  return out;
});

// ---------- point overlays ----------
// [dino, centreX, centreZ, radius, allowed cell codes] — a dino may ONLY enter cells
// whose code is in its list; the radius is a loose cap, the BIOME MASK is the real
// constraint (owner: dinos must never wander somewhere they'd bash into scenery).
// M1 = ONLY the dinos already spawning in the game (ai.js HERB_KINDS minus disabled
// variants + trex + raptor pack). Dropped: plesiosaur (no sea dinos), spinosaurus +
// brachiosaurus variant (disabled in config.js; the apatosaurus SLOT renders the
// hi-poly brachiosaurus model). Centres deliberately spread — no concentric rings.
const TERRITORIES = [
  ["raptor", 0, -230, 800, "JCPDR"],   // lives in the jungle AND the rocks/desert
  ["compsognathus", 40, -120, 90, "G"],
  ["parasaur", -30, -60, 95, "G"], ["stegosaurus", -112, 70, 72, "F"],
  ["trex", 0, 35, 185, "G"], ["apatosaurus", 5, 90, 150, "G"],
  ["triceratops", -20, 0, 120, "G"], ["ankylosaurus", 125, 95, 50, "S"],
  ["pachycephalosaurus", 0, 432, 70, "D"],
];
const ASSETS = [
  ["crashed_plane", "crashed_plane.glb", "#b0392b", 8, -244, "in the clearing; survivor wakes beside it"],
  ["dead_pilot", "dead_pilot.glb", "#c9a24b", -8, -256, "prone on the ground, NW of the plane"],
  ["gps_device", "gps_device.glb", "#3fd0a0", -8, -256, "hovering + spinning ABOVE the pilot"],
  ["health_pack", "health_pack.glb", "#d04545", 2, -250, "beside the plane; hovering/spinning pickup"],
  ["raptor_nest", "raptor_nest.glb", "#a06a3a", -40, -283, "in the thick-jungle tree-wall, off the clearing"],
  ["fishing_boat", "fishing_boat.glb", "#ffd400", 0, 582, "floating IN THE SEA just off the beach tip. Heading: STERN points out to sea (almost directly away from the beach) with a ~10 degree offset. Sits at a proper draft (hull NOT sunk deep) and BOBS gently. THE GOAL — win when the player reaches its radius from the waterline."],
];
const SPAWN = [0, -250];

// ---------- map.grid.json + map.json ----------
writeFileSync("design/map.grid.json", JSON.stringify({
  units: { metresPerUnit: M_PER_U, cell: CELL, cols: COLS, rows: ROWS, Xmin, Zmax,
    cellCentre: "world = (Xmin+(col+0.5)*cell, Zmax-(row+0.5)*cell); row0=NORTH" },
  legend: Object.fromEntries(Object.entries(LEGEND).map(([k, v]) => [k, { biome: v.biome, impassable: v.impassable }])),
  playableRule: "a cell is playable iff its code is NOT impassable (impassable: ~ J M). Sea/mountains/jungle-wall block; the muddy path (P) is the only way through the jungle wall.",
  gridEncoding: "rle-rows: each row is an array of [count,code] runs, left->right; row 0 = north. Expand: row.flatMap(([n,ch])=>ch.repeat(n)).",
  grid: grid.map(rleRow),
}, null, 2));
writeFileSync("design/map.props.json", JSON.stringify({
  units: "same grid as design/map.grid.json (cols/rows/cell/Xmin/Zmax)",
  legend: PROPS,
  densities: PROP_DENSITY,
  rule: "one prop code per cell ('.'=empty). BLOCKING prop cells are obstacles for the player AND all dinos — pathing must steer around them, on top of the biome masks. Non-blocking foliage is walk-through. Beach/clearing/path/sea carry no props.",
  gridEncoding: "rle-rows, same as map.grid.json",
  grid: propGrid.map(rleRow),
}, null, 2));

writeFileSync("design/map.json", JSON.stringify({
  units: { metresPerUnit: M_PER_U, axes: "X east+, Z north+, Y up", note: "biome regions are in design/map.grid.json" },
  scaleKmNS: +(((Zmax - Zmin) / (1000 / M_PER_U))).toFixed(2),
  legend: LEGEND,
  spawn: { x: SPAWN[0], z: SPAWN[1], note: "player crash-land start, inside the clearing (cell code C)" },
  assets: ASSETS.map(([id, glb, , x, z, note]) => ({ id, glb: `assets/models/${glb}`, x, z, note })),
  territoriesRule: "a dino may ONLY enter cells whose code is in its biomes list, within radius of its centre",
  territories: TERRITORIES.map(([dino, x, z, radius, codes]) => ({ dino, centerX: x, centerZ: z, radius, biomes: [...codes] })),
  wallAssets: { mountain: "assets/models/cliff.glb", junglewall: "assets/models/jungle_tree.glb", note: "build the impassable walls (M faces, jungle edge) from these models" },
  muddyPath: { halfWidthU: PATH_HALF, note: "the ONLY corridor through the impassable jungle tree-wall; ends at the jungle's north edge -> opens onto savannah", waypoints: ROUTE.map(([x, z]) => ({ x, z })) },
}, null, 2));

// ---------- map.grid.csv (one biome code per cell; row 0 = NORTH, col 0 = WEST) ----------
writeFileSync("design/map.grid.csv", grid.map((row) => row.split("").join(",")).join("\n") + "\n");
writeFileSync("design/map.legend.csv", "code,biome,hex,impassable\n" +
  Object.entries(LEGEND).map(([k, v]) => `${k},${v.biome},${v.fill},${v.impassable}`).join("\n") + "\n");

// ---------- map.svg (grid in colour, run-length per row + overlays) ----------
const sX = (x) => +x.toFixed(1), sY = (z) => +(-z).toFixed(1);
let cells = "";
for (let r = 0; r < ROWS; r++) {
  let c = 0;
  while (c < COLS) {
    const code = grid[r][c]; let run = 1; while (c + run < COLS && grid[r][c + run] === code) run++;
    if (code !== "~") {   // sea is the background rect
      const wx = Xmin + c * CELL, wzTop = Zmax - r * CELL;
      cells += `<rect x="${sX(wx)}" y="${sY(wzTop)}" width="${run * CELL}" height="${CELL}" fill="${LEGEND[code].fill}"${LEGEND[code].impassable ? ' fill-opacity="1"' : ''}/>`;
    }
    c += run;
  }
}
// playable-area outline — EXACT boundary of the region reachable on foot from the
// spawn (flood fill over non-impassable cells, then trace the edge loops)
function playableOutline() {
  const seen = new Uint8Array(ROWS * COLS);
  const [sr, sc] = [Math.floor(Zmax - SPAWN[1]), Math.floor(SPAWN[0] - Xmin)];
  const stack = [[sr, sc]];
  seen[sr * COLS + sc] = 1;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || seen[nr * COLS + nc]) continue;
      if (LEGEND[grid[nr][nc]].impassable) continue;
      seen[nr * COLS + nc] = 1;
      stack.push([nr, nc]);
    }
  }
  // boundary edges between reachable and not, as vertex adjacency (vertex = "vx,vy")
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!seen[r * COLS + c]) continue;
    const open = (nr, nc) => nr >= 0 && nc >= 0 && nr < ROWS && nc < COLS && seen[nr * COLS + nc];
    if (!open(r - 1, c)) link(`${c},${r}`, `${c + 1},${r}`);
    if (!open(r + 1, c)) link(`${c},${r + 1}`, `${c + 1},${r + 1}`);
    if (!open(r, c - 1)) link(`${c},${r}`, `${c},${r + 1}`);
    if (!open(r, c + 1)) link(`${c + 1},${r}`, `${c + 1},${r + 1}`);
  }
  // walk the edges into closed loops, merging collinear runs
  const used = new Set();
  const ek = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const loops = [];
  for (const [start, nbrs] of adj) {
    for (const first of nbrs) {
      if (used.has(ek(start, first))) continue;
      const loop = [start];
      let prev = start, cur = first;
      used.add(ek(start, first));
      while (cur !== start) {
        loop.push(cur);
        const next = (adj.get(cur) || []).find((n) => n !== prev && !used.has(ek(cur, n)));
        if (!next) break;
        used.add(ek(cur, next));
        prev = cur; cur = next;
      }
      if (cur === start && loop.length > 2) {
        const pts = loop.map((s) => s.split(",").map(Number));
        const merged = pts.filter((p, i) => {
          const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
          return (a[0] - p[0]) * (b[1] - p[1]) !== (a[1] - p[1]) * (b[0] - p[0]);
        });
        loops.push(merged);
      }
    }
  }
  return loops;
}
const playablePath = playableOutline()
  .map((loop) => "M" + loop.map(([vx, vy]) => `${vx + Xmin},${vy - Zmax}`).join("L") + "Z")
  .join("");

// blocking props in PASSABLE biomes (the gameplay obstacles); walls already read as solid
const PROP_FILL = { T: "#143010", t: "#143010", r: "#4d4a45", d: "#5a4632" };
let propCells = "";
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const pc = propGrid[r][c];
  if (pc === "." || !PROPS[pc].blocking || impassableCell(grid[r][c])) continue;
  propCells += `<rect x="${sX(Xmin + c * CELL)}" y="${sY(Zmax - r * CELL)}" width="${CELL}" height="${CELL}" fill="${PROP_FILL[pc]}"/>`;
}
function impassableCell(ch) { return LEGEND[ch].impassable; }

const terr = TERRITORIES.filter(([, , , r]) => r <= 300).map(([d, x, z, r], i) => `    <circle data-dino="${d}" cx="${sX(x)}" cy="${sY(z)}" r="${r}" stroke="hsl(${(i * 47) % 360} 85% 60%)"/>`).join("\n");
const assets = ASSETS.map(([id, glb, fill, x, z]) => `    <circle data-asset="${id}" data-glb="assets/models/${glb}" cx="${sX(x)}" cy="${sY(z)}" r="${id === "fishing_boat" || id === "crashed_plane" ? 12 : 7}" fill="${fill}" stroke="#000" stroke-width="2"/>`).join("\n");
const labels = [["thick jungle", -85, -272], ["forest", -112, 70], ["savannah", 0, 35], ["swamp", 125, 98], ["mountainW", -150, 300], ["rocky pass", 0, 315], ["mountainE", 150, 300], ["desert", 0, 432], ["beach", 0, 528], ["clearing", 0, -278]].map(([t, x, z]) => `    <text x="${sX(x)}" y="${sY(z)}">${t}</text>`).join("\n");
const swatches = Object.entries(LEGEND).map(([k, v], i) => `    <rect x="-330" y="${-360 + i * 24}" width="18" height="18" fill="${v.fill}"/><text x="-306" y="${-346 + i * 24}" font-size="13" fill="#fff">${v.biome}${v.impassable ? " (impassable)" : ""}</text>`).join("\n")
  + `\n    <line x1="-330" y1="${-351 + Object.keys(LEGEND).length * 24}" x2="-312" y2="${-351 + Object.keys(LEGEND).length * 24}" stroke="#ffe11a" stroke-width="3.5" stroke-dasharray="7 4"/><text x="-306" y="${-346 + Object.keys(LEGEND).length * 24}" font-size="13" fill="#ffe11a">PLAYABLE AREA (reachable on foot)</text>`;

// right-margin key: territory dash colours + asset dot colours
const rightKey =
  `    <text x="252" y="-360" font-size="14" fill="#fff" font-weight="bold">DINO TERRITORIES (dashed circles)</text>\n`
  + TERRITORIES.map(([d], i) => `    <line x1="252" y1="${-340 + i * 20}" x2="272" y2="${-340 + i * 20}" stroke="hsl(${(i * 47) % 360} 85% 60%)" stroke-width="3" stroke-dasharray="6 4"/><text x="278" y="${-335 + i * 20}" font-size="13" fill="#fff">${d}</text>`).join("\n")
  + `\n    <text x="252" y="${-340 + TERRITORIES.length * 20 + 14}" font-size="14" fill="#fff" font-weight="bold">PLACED OBJECTS (dots)</text>\n`
  + ASSETS.map(([id, , fill], i) => `    <circle cx="260" cy="${-340 + TERRITORIES.length * 20 + 32 + i * 20}" r="6" fill="${fill}" stroke="#000" stroke-width="1.5"/><text x="274" y="${-336 + TERRITORIES.length * 20 + 32 + i * 20}" font-size="13" fill="#fff">${id}</text>`).join("\n")
  + `\n    <circle cx="260" cy="${-340 + TERRITORIES.length * 20 + 32 + ASSETS.length * 20}" r="5" fill="#fff" stroke="#000" stroke-width="1.5"/><text x="274" y="${-336 + TERRITORIES.length * 20 + 32 + ASSETS.length * 20}" font-size="13" fill="#fff">player spawn</text>`;
const kmU = 1000 / M_PER_U;

// view bounds: cover the grid AND every overlay (plesiosaur territory sits north of Zmax), +20u pad
const PAD = 20;
const zTop = Math.max(Zmax, ...TERRITORIES.map(([, , z, r]) => z + r), ...ASSETS.map(([, , , , z]) => z)) + PAD;
const zBot = Math.min(Zmin, ...TERRITORIES.map(([, , z, r]) => z - r)) - PAD;
const vbX = -340, vbW = 880, vbY = -zTop, vbH = zTop - zBot;   // right margin holds the territory/asset key

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- AUTHORITATIVE MAP — biome GRID (one biome/cell). Implement from design/map.grid.json + design/map.json.
     World X east+, Z north+; 1u=0.9m. Grid cell=${CELL}u. Impassable: sea ~, thick jungle J, mountain M.
     Playable = any non-impassable cell. Muddy path P = only gap through the jungle wall. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}" font-family="sans-serif">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${LEGEND['~'].fill}"/>
  <g>${cells}</g>
  <g class="props">${propCells}</g>
  <path data-playable="true" d="${playablePath}" fill="none" stroke="#ffe11a" stroke-width="3.5" stroke-dasharray="14 8"/>
  <g class="territories" fill="none" stroke-width="3" stroke-dasharray="9 6">
${terr}
  </g>
  <g class="assets">
${assets}
    <circle data-feature="spawn" cx="${sX(SPAWN[0])}" cy="${sY(SPAWN[1])}" r="5" fill="#fff" stroke="#000" stroke-width="2"/>
  </g>
  <g font-size="16" fill="#0a1c08" text-anchor="middle" font-weight="bold">
${labels}
  </g>
${swatches}
${rightKey}
  <text x="0" y="${sY(548) - 16}" font-size="13" fill="#fff" text-anchor="middle">▲ N — boat moored to beach (escape)</text>
</svg>
`;
writeFileSync("design/map.svg", svg);
console.log(`grid ${COLS}x${ROWS} cell=${CELL}u (${(CELL * M_PER_U).toFixed(1)}m) -> map.grid.json + map.props.json + map.json + map.svg | ${TERRITORIES.length} territories, ${ASSETS.length} assets`);
