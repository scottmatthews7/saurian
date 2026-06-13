# Saurian (dino-arena-a) — Backlog, in PRIORITY order

Working method: one agent per repo/worktree (concurrent same-dir edits clobber);
the coordinator merges. **Licence:** MIT for our code; CC0/CC-BY assets allowed,
credited in `CREDITS.md` (+ an on-screen credits line once public).

## ★ THE VISION — escape the island
You survive a plane crash in the **jungle** and must cross the island —
jungle → forest/grassland → (swamp, lake off-route) → desert → rocky pass → beach —
surviving its dinosaurs, to reach a **boat** and escape. A ~5-minute
Death-Stranding-with-dinos traverse. Everything below serves this.

---

## P1 — FIX what's broken (blocks play) — IN PROGRESS
- **Map traversal + glitches** (`mapfix` agent): an invisible wall stops the player
  in open ground (jungle AND desert — likely a steep heightAt step the collider
  can't climb after the map doubled); glitchy dark vertical slivers in the grass;
  and make the **T-Rex LIFESIZE** vs the 1.8 m human (Scotty ~13 m long, head ~5–6 m).
- **Stays a WEB APP** (owner REVERTED the downloadable-desktop-app decision,
  2026-06-12). The "can't all load" problem is now solved by the **asset budget /
  LOD / streaming** pass alone (cap what loads at once; stream the far island; LOD
  distant scatter) — no Tauri/Electron wrapper. Owner is fine with a 1–2 min load.

## P2 — BUILD the campaign (the core vision)
1. **World re-layout to the canonical island** (see *CANONICAL MAP* below), sized so
   a direct plane→boat run is **~5 min** of walk/sprint. Supersedes the radial arena
   and the old radial fixed-layout (ex-items 14–18).
2. **Dino placement** across the regions (see *APPROVED DINO PLACEMENT* below).
3. **Opening sequence** (ex-item 22): spawn ~50 m from the crashed prop **Cessna**;
   a **health pack** in the wreck → into the pack, used on demand; a **dead pilot**
   ~20 m off with a **floating GPS** that **unlocks the radar** (radar GATED — off by
   default). Replaces the bare plane-crash spawn + always-on radar.
4. **Win = reach the boat; lose = devoured.** Replaces the survival-timer interim
   objective. (The fuller "3-round procedural porter" campaign is a later evolution
   — deferred until this single-island escape loop is fun.)

## P3 — DINO QUALITY
- **Raptor feather-texture** iteration — IN PROGRESS (indicative textured feathers +
  tail fan + scaly lipped face, toward the modern reconstruction).
- **Current-science PRDs (§2b)** now written for every creature — build/iterate the
  modules to them.
- **Procedural land dinos** (raptor/spino/theri/quetzal/dread) are committed on their
  branches; owner kept the procedural **T-Rex** + **plesiosaur** in-game and the rest
  on-branch — wire each in per-creature as it reaches quality (or concede to sculpted/
  sourced models for the most feather-heavy ones).
- **PROCESS (ex-item 20):** for every procedural dino, research the LARGEST fossil
  specimen and bake BOTH skeleton + fleshed proportions (as ratios of length) into its
  PRD before building. Don't eyeball.
- **⭐ NEXT (in-game pipeline — see `DINO_LAB.md`):** Velociraptor is now skinned +
  animating in-game (procmesh → `metadata.skin` → `glb-skin.mjs` → `dino.js`
  `PROC_BUILDERS`). **FIRST RELEASE SCOPE (owner): build procmeshes ONLY on top of
  the 6 glb rigs we already have** — `trex, raptor, triceratops, stegosaurus,
  apatosaurus, parasaur`. trex + raptor done → **next: triceratops, stegosaurus,
  apatosaurus, parasaurolophus**, each built on its OWN rig's joints. Defer
  Spinosaurus / Therizinosaurus / Quetzalcoatlus / Dreadnoughtus to a later release
  (they'd reuse one of the 6 rigs — scaled up, limbs adjusted via `boneRest` /
  per-axis `stretch` — or get new rigs then). Build each procmesh **directly on the
  rigged glb's joints** so dimensions match from the start. Verify with
  `tools/dino-lab.html?mode=both`.
- **⭐ REBUILD the Velociraptor on raptor.glb's joints:** the current veloci was built
  standalone then retrofitted to the rig, so its proportions don't perfectly match
  (body reads long/low vs the glb in `dino-lab` `mode=both`). Re-author the procmesh
  around raptor.glb's actual bone rest positions (read them from the glb) so the
  fleshed silhouette tracks the rig. **Keep ONLY the skin + feathers treatment**
  (fuzzy-down coat, dense shingled feathers, the 3 colourways) — **do NOT carry over
  the iter48 head; rebuild the head fresh** to the glb proportions.
- **RELEASE-PREP — world roster = the 6-rig species only:** at release-prep, take the
  **non-rig creatures out of the world — the bespoke plesiosaur (ocean) and the
  pterosaur flyer (flock + dive)** — since the first release ships only the 6
  glb-rig-backed procmesh species (+ their DINO_VARIANTS, which all stay). Owner: just
  NOTE for now, don't touch the world yet; prefer DISABLE (flag off spawns, keep code)
  over deleting when the time comes. Re-add plesiosaur/flyer in a later release.

## P4 — GAMEPLAY FEATURES (after the campaign skeleton works)
- **Health pickups en route** + slow regen (passive regen DONE; world/route packs
  pending — folds into the opening health pack).
- **First-person view** toggle (ex-item 21) — look through the human's eyes; a T-Rex
  fills the screen.
- **Dino health bars**, engaged-only (ex-item 12) — billboard, colour by fraction.
- **Screen-shake near sauropods** (ex-item 8) — giants shake the ground; T-Rex is
  silent-footed (no shake).
- **Tree-climbing to evade the T-Rex** (ex-item 10) — active/tense (rex shakes the
  trunk), not an AFK safe spot.
- **Character select** (ex-item 19): blond clean-shaven guy / old grey explorer /
  woman — recolour + minor tweaks on the one Adventurer mesh. Includes the
  blond/clean-shaven appearance fix (ex-item 1b).

## P5 — PUBLISH (open-source + deploy)
- **Deploy config DONE:** GitHub Pages workflow + `.nojekyll` + `DEPLOY.md` + OG
  preview card → play link `https://scottmatthews7.github.io/saurian/`.
- **Remaining:** NOTICE/THIRD_PARTY + finalise `CREDITS.md` (every asset + licence);
  `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md`; polished `README` (what it is, play link,
  screenshots/GIF, run + contribute); on-screen title-screen credits line. **Then the
  owner does the public push** (not the agent). Public repo: `saurian` / scottmatthews7.

---

## CANONICAL MAP LAYOUT (reference — owner sketch, for P2.1)

A LINEAR, portrait island running SOUTH (start) → NORTH (escape). Scale: a
DIRECT-line plane→boat run takes **~5 minutes** of walk/sprint (size the S→N axis to
player effective traverse speed × 300 s; measure in-game — much bigger than the
current radius-180 arena).

Regions, south → north along the route:
- **START LOCATION (south lobe)** — a small jungle peninsula on a neck:
  - **Plane** — the crashed Cessna at centre, a small pond beside it.
  - **Dead body with GPS** — marked X, just NW of the plane (GPS unlocks radar).
  - **Jungle clearing** — open ground around the plane.
  - **Thick jungle** — dense jungle ringing the clearing.
- **MAIN ISLAND (middle):** **Forest** (SW, inner clearing) · **Lake** (W, N of
  forest) · **Swamp** (SE/E) · **Grassland** (large central-upper expanse).
- **NORTH (narrows to the tip):** **Desert** (upper-mid) · **Rocky pass** (NE) ·
  **Beach** (NE, below the boat) · **Sea** (NE/top) · **Boat (THE GOAL)** at the
  north tip in a small inlet — reaching it = WIN.
- **Direct route:** plane (S) → thick jungle → forest/grassland → desert → rocky
  pass → beach → boat (N). Lake (W) + swamp (E) are off-route side areas.

## APPROVED DINO PLACEMENT (reference — owner signed off, for P2.2)
Semi-realistic; start = gentle learning beat; predators gate the route legs,
herbivores cluster where they'd graze.
- **Thick jungle (START):** raptors LURK but ESCALATE as you push deeper — NOT on
  spawn. A peaceful **Parasaurolophus** cruises the clearing + **Compsognathus** skitter.
- **Forest:** **Therizinosaurus** (territorial), **Velociraptor** packs; **Stegosaurus** browsing.
- **Lake (W):** calm drinking spot — **Triceratops** + **Parasaurolophus** gather.
- **Grassland (main crossing):** **T-Rex** apex (open chases); sauropod herds
  **Apatosaurus / Brachiosaurus / Dreadnoughtus**; **Triceratops** herds (defensive if crowded).
- **Swamp (E):** **Spinosaurus** apex; **Ankylosaurus** in the wet margins.
- **Desert:** **Quetzalcoatlus** overhead (FIRM: nests on the beach, flies over the
  upper grassland + desert, never lands); **Pachycephalosaurus** in dry scrub. LOW density.
- **Rocky pass:** **Velociraptor** ambush; treacherous footing (choke).
- **Beach:** **Quetzalcoatlus** nest (on eggs) + **Plesiosaur** offshore.
- **Sea → Boat:** **Plesiosaur**; final sprint to escape.

---

## ✅ DONE (archive)
- Player = rigged human; sprint outruns the T-Rex, stamina-gated (ex-1).
- Environment realism pass — PBR ground, HDRI, post-FX, foliage (ex-2).
- Triceratops locomotion + herbivore obstacle-avoidance jitter fix (ex-3).
- Proper winged pterosaur `flyer.js` (ex-4); roster widened via rig-reuse variants (ex-4c).
- Raptor PACKS predator (ex-4d).
- AUDIO rounds 1–4: organic CC0 samples — footsteps, per-species vocals, cassowary
  screech, bone-crunch bite, 5 s sauropod moan, random hurt grunts, wading=splash,
  orchestral win, gong lose, roar cut, T-Rex eerie rumble. MERGED to main (ex-6b).
- Objectives simplified: eggs = consumable pickups, beacons cut (ex-11); eggs WHITE (ex-24).
- Slow passive health regen.
- Tools + backpack + weapon combat (ex-6); held/world weapon sizing fixed.
- **Animation gate PASSED** — procedural mesh skins to the Quaternius rig + clips.
- **Procedural T-Rex in-game** (swept-loft, polished, lifesize pending P1) + skinned to rig.
- **World overhaul** — 2× map, east ocean, desert retune, dino territories, low-poly
  spino-variant disabled. MERGED. (Desert towers since REMOVED per owner.)
- **Procedural plesiosaur** swimming in the ocean. MERGED.
- 6 procedural dino builds on branches: Quetzalcoatlus, Velociraptor, Spinosaurus,
  Therizinosaurus, Plesiosaur, Dreadnoughtus + T-Rex polish.
- Deploy config (GitHub Pages + OG card).

## BUILD METHOD — every dino needs a real SKULL (not a loft-taper cone)
Systemic issue: swept-loft dinos build the head as the body/neck loft tapering to a
point → it reads as a CONE/blob, not a head (the raptor's recurring "cone head").
FIX (applies to ALL procedural dinos): build the head as a SEPARATE, sculpted SKULL
component, merged to the neck — NOT the end of the body tube. A reusable skull
builder per species:
- Deeper rounded **braincase/cranium** at the back (volume behind/above the eye).
- A shaped **muzzle/snout** off the front (species shape: deep croc snout for Spino,
  boxy for T-Rex, narrow down-tipped for raptor, toothless beak for Quetzal, etc.).
- A distinct **lower JAW** with a visible mouth gap + teeth/beak.
- **Eye sockets + brow ridge** so the eye sits in a real orbit.
PLAN: the raptor head pass is the prototype → extract a reusable `skull` builder →
re-run each dino's build (T-Rex, Spino, Theri, Quetzal, Dread, Raptor) with a proper
skull. Add this requirement to every PRD's build-technique section.
