# Map spec — grid style (HANDOFF: build world.js from this)

The island layout is an AUTHORITATIVE biome grid: one biome code per 1u cell.
A coding agent implements the world straight from these files — no prose needed.

## Files
- `design/map.grid.json` — **the spec**. Units, legend (code → biome + impassable),
  and the grid itself (RLE rows: `[[count,code],…]`, expand with
  `row.map(([n,ch])=>ch.repeat(n)).join("")`). Row 0 = NORTH, col 0 = WEST.
- `design/map.props.json` — prop layer, same grid: one tree/rock/foliage code per cell;
  blocking codes are obstacles for the player AND dinos.
- `design/map.json` — overlays: spawn, assets (glb + world pos + placement notes),
  dino territories (centre + radius + allowed-biome masks), muddy-path waypoints,
  playable boundary.
- `design/map.svg` — visual render (browser-viewable preview, north-up).
- `design/map.grid.csv` + `map.legend.csv` — same grid for spreadsheet inspection/editing.

## Coordinates
World X east+, Z north+, 1u = 0.9 m (2u human = 1.8 m). Cell `[row][col]` centre:
`x = Xmin + (col+0.5)*cell`, `z = Zmax − (row+0.5)*cell` (constants in map.grid.json units).

## Rules the world MUST satisfy
- A cell is playable iff its code is not impassable (impassable: `~` sea, `J`/`j`
  jungle tree-wall, `M` mountain).
- The muddy path `P` is the ONLY corridor through the jungle wall around the
  spawn clearing; the rocky pass `R` is the ONLY way through the mountain belt.
- Spawn is in the clearing `C`; the fishing boat (win condition) sits on beach `B`.

## Workflow
- `node tools/gen_map.mjs` — regenerate all design/ outputs from the source zones
  (edit the zone blobs / ROUTE / TERRITORIES / ASSETS in that file to redesign).
- `node tools/map_check.mjs` — cell-by-cell verification of the rules above
  (counts every cell, flood-fills spawn→boat, proves the P and R chokepoints,
  checks forest hugs the west coast). MUST pass before handing off or building.
