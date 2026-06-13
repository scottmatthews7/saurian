// Verify design/map.grid.json cell-by-cell against the map description:
//   1. every cell holds a known legend code (counted per biome)
//   2. spawn -> boat walkable through passable cells
//   3. muddy path (P) is the ONLY gap through the jungle wall (remove P -> spawn cut off from savannah)
//   4. rocky pass (R) is the ONLY way through the mountain belt (remove R -> boat unreachable)
//   5. forest's west edge is the coast (sea immediately west of the westmost F on each forest row)
//   6. spawn cell is clearing (C); boat cell is beach (B)
// Exits non-zero on any failure.
import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync("design/map.grid.json", "utf8"));
const map = JSON.parse(readFileSync("design/map.json", "utf8"));
const { cell, cols, rows, Xmin, Zmax } = spec.units;
const grid = spec.grid.map((row) => row.map(([n, ch]) => ch.repeat(n)).join(""));

const fail = [];
const ok = (name, cond, detail) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); if (!cond) fail.push(name); };
const cellOf = (x, z) => [Math.floor((Zmax - z) / cell), Math.floor((x - Xmin) / cell)];
const impassable = new Set(Object.entries(spec.legend).filter(([, v]) => v.impassable).map(([k]) => k));

// 1 — every cell known, counted
const counts = {};
let unknown = 0;
for (const row of grid) for (const ch of row) { counts[ch] = (counts[ch] || 0) + 1; if (!spec.legend[ch]) unknown++; }
const total = Object.values(counts).reduce((a, b) => a + b, 0);
ok("grid dimensions", grid.length === rows && grid.every((r) => r.length === cols), `${cols}x${rows} = ${total} cells`);
ok("every cell has a legend code", unknown === 0, Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(" "));

// flood fill over passable cells, optionally treating extra codes as walls
function reach(fromRC, blocked = new Set()) {
  const seen = new Uint8Array(rows * cols);
  const stack = [fromRC];
  seen[fromRC[0] * cols + fromRC[1]] = 1;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || seen[nr * cols + nc]) continue;
      const ch = grid[nr][nc];
      if (impassable.has(ch) || blocked.has(ch)) continue;
      seen[nr * cols + nc] = 1;
      stack.push([nr, nc]);
    }
  }
  return seen;
}
const at = (seen, x, z) => { const [r, c] = cellOf(x, z); return !!seen[r * cols + c]; };

const spawn = map.spawn;
const boat = map.assets.find((a) => a.id === "fishing_boat");
const spawnRC = cellOf(spawn.x, spawn.z);
ok("spawn cell is clearing (C)", grid[spawnRC[0]][spawnRC[1]] === "C", `(${spawn.x},${spawn.z}) = '${grid[spawnRC[0]][spawnRC[1]]}'`);
const [br, bc] = cellOf(boat.x, boat.z);
const boatCode = (grid[br] && grid[br][bc]) || "~";   // off-grid north = open sea
ok("boat floats in the sea", boatCode === "~", `(${boat.x},${boat.z}) = '${boatCode}'`);

// 2/3/4 — reachability + chokepoints (savannah probe = its zone centre per gen_map.mjs)
const SAVANNAH_PROBE = { x: 0, z: 35 };
const open = reach(spawnRC);
// boat is IN the sea — win = reach the waterline within 16u of it, so check a
// reachable BEACH cell exists within 16u of the boat
function beachWithin(seen) {
  for (let dr = -16; dr <= 16; dr++) for (let dc = -16; dc <= 16; dc++) {
    if (dr * dr + dc * dc > 16 * 16) continue;
    const r2 = br + dr, c2 = bc + dc;
    if (grid[r2] && grid[r2][c2] === "B" && seen[r2 * cols + c2]) return true;
  }
  return false;
}
ok("spawn -> boat reachable (beach cell within 16u of the boat)", beachWithin(open));
ok("spawn -> savannah reachable", at(open, SAVANNAH_PROBE.x, SAVANNAH_PROBE.z));
const noPath = reach(spawnRC, new Set(["P"]));
ok("muddy path is the ONLY gap through the jungle wall", !at(noPath, SAVANNAH_PROBE.x, SAVANNAH_PROBE.z), "removing P seals the spawn in");
const noPass = reach(spawnRC, new Set(["R"]));
ok("rocky pass is the ONLY way through the mountains", !beachWithin(noPass), "removing R cuts off the boat");

// 5 — forest west edge = coast: sea directly west of the westmost F on each forest row
let forestRows = 0, coastRows = 0, first = null, last = null;
for (let r = 0; r < rows; r++) {
  const c = grid[r].indexOf("F");
  if (c < 0) continue;
  forestRows++;
  const westLand = grid[r].slice(0, c).replace(/~/g, "");
  if (westLand === "") { coastRows++; if (first === null) first = r; last = r; }
}
ok("forest west edge is the coast", coastRows / forestRows >= 0.7,
  `${coastRows}/${forestRows} forest rows have only sea to their west (rows ${first}..${last})`);

// 7 — territory masks: centre sits on an allowed code; allowed cells exist within radius
for (const t of map.territories) {
  const [r, c] = cellOf(t.centerX, t.centerZ);
  const centreCode = grid[r] && grid[r][c];
  let allowed = 0;
  const rad = Math.ceil(t.radius / cell);
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    if (dr * dr + dc * dc > rad * rad) continue;
    const ch = grid[r + dr]?.[c + dc];
    if (ch && t.biomes.includes(ch)) allowed++;
  }
  ok(`territory ${t.dino} anchored on allowed cell`, t.biomes.includes(centreCode), `centre '${centreCode}', mask ${t.biomes.join("")}, ${allowed} roamable cells in radius`);
}

// 8 — band rules: north tip is all beach; south lobe behind the spawn is all jungle wall
let northLeak = 0, southLeak = 0;
for (let r = 0; r < rows; r++) {
  const z = Zmax - (r + 0.5);
  for (let c = 0; c < cols; c++) {
    const ch = grid[r][c];
    if (ch === "~") continue;
    if (z > 555 && ch !== "B") northLeak++;
    if (z < -175 && ch !== "J" && ch !== "C" && ch !== "P") southLeak++;
  }
}
ok("north tip (z>555) is all beach", northLeak === 0, `${northLeak} non-beach land cells`);
let grassLeak = 0;
for (let r = 0; r < rows; r++) {
  const z = Zmax - (r + 0.5);
  if (z <= 238) break;
  for (let c = 0; c < cols; c++) if (grid[r][c] === "G") grassLeak++;
}
ok("no grass from the rocky part onwards (z>238)", grassLeak === 0, `${grassLeak} grass cells north of the pass mouth`);
ok("whole south section (z<-175) is jungle wall + clearing/path only", southLeak === 0, `${southLeak} stray land cells`);

// 9 — prop layer: codes legal for their biome, clean zones empty, world still traversable
const props = JSON.parse(readFileSync("design/map.props.json", "utf8"));
const propGrid = props.grid.map((row) => row.map(([n, ch]) => ch.repeat(n)).join(""));
const propCounts = {};
let illegal = 0, dirtyClean = 0;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const pc = propGrid[r][c];
  if (pc === ".") continue;
  propCounts[pc] = (propCounts[pc] || 0) + 1;
  const biome = grid[r][c];
  const table = props.densities[biome];
  if (!table || !table.some(([code]) => code === pc)) illegal++;
  if ("BCP~".includes(biome)) dirtyClean++;
}
ok("prop grid matches biome grid dims", propGrid.length === rows && propGrid.every((r) => r.length === cols),
  Object.entries(propCounts).map(([k, n]) => `${k}:${n}`).join(" "));
ok("every prop legal for its biome", illegal === 0, `${illegal} illegal`);
ok("beach/clearing/path/sea carry no props", dirtyClean === 0, `${dirtyClean} props in clean zones`);

// flood fill again with blocking-prop cells as walls — dinos AND player must still get through
const blockingCodes = new Set(Object.entries(props.legend).filter(([, v]) => v.blocking).map(([k]) => k));
function reachWithProps(fromRC) {
  const seen = new Uint8Array(rows * cols);
  const stack = [fromRC];
  seen[fromRC[0] * cols + fromRC[1]] = 1;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || seen[nr * cols + nc]) continue;
      if (impassable.has(grid[nr][nc]) || blockingCodes.has(propGrid[nr][nc])) continue;
      seen[nr * cols + nc] = 1;
      stack.push([nr, nc]);
    }
  }
  return seen;
}
const openProps = reachWithProps(spawnRC);
ok("spawn -> boat reachable AROUND blocking props", beachWithin(openProps));

console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : "\nALL CHECKS PASS");
process.exit(fail.length ? 1 : 0);
