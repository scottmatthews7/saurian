# Saurian — Map specification (what the island should look like)

**SIGNED OFF by the owner 2026-06-12.** This spec + design/ files are the build contract.

The authoritative geometry is **`design/map.grid.json`** (a 1-unit biome grid) +
**`design/map.json`** (assets, territories, spawn, path, scale). This doc is the
human-readable description; `design/map.svg` is the colour render. Regenerate all
three with `node tools/gen_map.mjs`. Read it back with `node tools/map_svg.mjs`.

## Scale & coordinates
- World units; **1u = 0.9 m** (the 1.8 m human is 2u). X = east+, Z = north+, Y = up.
- The map is a **biome grid: 1 cell = 1u = 0.9 m**, cols 492 (X −246→246), rows 972
  (Z −396→576). `cell[row][col]` centre = `(Xmin+(col+0.5), Zmax−(row+0.5))`; row 0 = north.
- Island ≈ **0.86 km N–S**. Every cell holds exactly one biome code (legend below).

## The shape & journey (south → north)
A portrait island, sea on all sides. You crash in dense jungle at the **south** and
must cross to a **boat moored on the north beach** to escape. The silhouette swells
from a small south jungle lobe → a wide central body → pinches through a mountain-
walled pass → a small desert neck → the beach tip.

1. **Clearing (start)** — a tiny open patch (~r12u, code `C`) at the south, with the
   crashed plane, the dead pilot + hovering GPS, and a health pack. The player spawns here.
2. **Jungle tree-wall** — ONE **thick jungle** (`J`, no light/dark halves), an **impassable**
   dense wall of trees completely ringing the clearing, so you feel boxed in, deep in
   jungle. The wall runs all the way to the **south coast** (no ground behind the spawn).
   The **only** way out is the **muddy path** (`P`), a **narrow ~2 m (2.2u)** winding
   dirt trail that runs north through the wall and **opens directly onto the savannah**.
3. **Savannah** (`G`, the default ground) — the large central crossing: lush grass with
   a smattering of trees, ~original-arena size (~r180u). The open killing-field where
   the T-Rex and the sauropod/triceratops herds roam. The jungle edge leads straight
   into it (no bare ground between).
4. **Forest** (W, `F`) and **Swamp** (E, `S`, ~50m across, murky) sit off the savannah's
   flanks as side-areas. The forest's **west edge is the coastline** — nothing but sea
   to its west.
5. **Mountain pass** — two **impassable** mountain masses (`M`) wall the W and E and
   **hug the central rocky pass** (`R`) with no grass between them. The rocky pass is
   the only navigable corridor (~100u wide) funnelling you north — a natural choke.
6. **Desert** (`D`) — the arid band filling everything between the mountain belt and the
   beach (NO grass anywhere from the rocky part onwards — unnamed ground there is
   mountain wall, then desert sand).
7. **Beach** (`B`) — a sand band covering the **whole north tip** (no grass past it);
   the **boat (the goal)** is moored on it at the seaward edge (hull on the sand, not
   floating out at sea). Reach it = win.
8. **Sea** (`~`, impassable) surrounds everything.

## Ground & water treatment
- **Every biome gets a RICH ground texture** (multi-scale variation/mottling) — never a
  flat tint. Forest, savannah and jungle floors are FLAT; the desert keeps its dune
  undulation and the rocky pass gets the same treatment.
- **Desert = the existing game's desert, carried over verbatim** (sand colour/texture,
  dunes, bleached bones, skeleton vignette, and the grey veined PROCEDURAL rocks — NOT
  the red glb rock pack) — but its LOW-POLY TREES are swapped for our glbs
  (desert_old_tree, dead_tree). Owner reference: `design/reference/existing_desert.png`.
- **Savannah grass = the existing game's grass blades + ground, verbatim** (owner likes
  them); only the trees change: MIX AND MATCH locust_tree_pack + realistic_trees_pack_of_2_free across the savannah. Owner reference:
  `design/reference/existing_grassland.png`.
- **The ocean moves** (the game's existing animated water) and the **waterline is
  organic — never a straight line**; the beach slopes down into it.

## Boundaries
Organic/natural — the source zones are wobbly blobs, rasterised at 1u so edges come out
naturally jagged, not geometric. **Default ground is grass**: any playable cell not in a
named biome is savannah, never bare/beige. Only desert + beach are sand. Adjacent zones
abut (no gaps).

## Playable area
A cell is playable **iff its biome is not impassable**. Impassable = `~` sea, `J`
jungle tree-wall, `M` mountain. **M1: the player cannot enter the jungle AT ALL** —
`J` is solid collision, no slipping between trees; inside the jungle region only the
clearing (`C`) and muddy path (`P`) cells are walkable. The yellow dashed outline on `map.svg` is the EXACT
boundary of the on-foot-reachable region, traced from the grid. So the navigable region = clearing → muddy-path corridor
→ savannah/forest/swamp → rocky pass (between the mountains) → desert → beach. The boat
sits at the north end of that.

## Legend (cell codes)
`~` sea (impassable) · `G` savannah/grass (default) · `F` forest · `J` thick jungle
(impassable wall) · `S` swamp · `M` mountain (impassable
wall) · `R` rocky (the pass/valley) · `D` desert · `B` beach · `C` clearing · `P` muddy path.

## Assets (placed models — see `design/map.json` for exact x,z + glb)
crashed_plane, dead_pilot, gps_device (hovering+spinning over the pilot), health_pack
(hovering pickup), raptor_nest (in the thick-jungle wall off the clearing), fishing_boat
(moored to the beach = the goal). Spawn = inside the clearing (0, −250).

## Dino territories — biome-masked (M1: in-game roster ONLY)
9 territories in `design/map.json`, each `centre + radius + biomes` (allowed cell codes).
**A dino may ONLY enter cells whose code is in its biomes list** — the mask is the real
constraint, the radius just a loose cap. Centres are spread out (no concentric rings).
M1 ships only the dinos ALREADY spawning in the game: raptor `JCPDR` (lives in the jungle AND
the rocks/desert); compsognathus `G`; parasaur `G`; stegosaurus `F`;
T-Rex + apatosaurus (renders the hi-poly brachiosaurus) + triceratops `G` (savannah
only); ankylosaurus `S`; pachycephalosaurus `D`. Dropped: plesiosaur (no sea dinos),
spinosaurus + brachiosaurus variant (disabled in config.js).

## Jungle performance budget
The jungle has ~8,100 tree cells but the player can NEVER enter it (M1) — only its
outer face is visible. So: build REAL trees only on the visible shell (the rows facing
the clearing, the muddy path walls, and the outer edge seen from the savannah/sea);
fill the interior with cheap fakes (a dark canopy mesh, billboards/imposters, or
nothing + fog). Use thin instances for the real trees and the engine's existing
distance-cull / frozen-matrix patterns. Real-tree count should land ~1,000-1,500,
not 8,100.

## Prop layer — `design/map.props.json`
A second grid (same dims) gives **one prop code per cell**: trees (`T` jungle, `t`
forest/savannah, `d` desert dead-trees), rocks (`r`, procedural from world.js), and
walk-through foliage (`m` monstera, `f` ferns, `g` geraniums, `L` lupines). `.` = empty.
**Blocking props (trees, rocks) are obstacles for the player AND all dinos — dino
pathing must steer around those cells (with clearance) so dinos never bash into trees
and jitter/vibrate against scenery**, on top of the biome masks. Beach, clearing, muddy
path and sea carry no props. Densities are per-biome and first-pass for owner eyeball.

## Implementing it (for the coding agent)
1. Build terrain/biome lookup from `map.grid.json` (expand the RLE rows; sample by cell).
2. Treat `~ J M` cells as impassable (block player movement / collide).
3. Paint ground per biome code; scatter the matching foliage (jungle = dense tree-wall,
   savannah = grass + sparse trees, forest = trees, desert = sand+dunes, etc.).
4. Place the assets from `map.json` at their x,z; spawn the player in the clearing.
5. Carve the muddy path (`P`) as walkable ground through the jungle wall.
6. Win when the player reaches within the boat's radius.
