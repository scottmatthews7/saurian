# Decisions

## Engine: Babylon.js (vendored, no build step)

**Choice:** Babylon.js 8.x, loaded from a vendored `lib/babylon.js` + `lib/babylonjs.loaders.min.js`.
Pure ES modules in the browser, no bundler, no npm. Served by `python3 -m http.server`.

**Why Babylon over the alternatives (and why NOT three.js+cannon):**
- Brief forbids the Sketchbook stack (three.js + cannon) used in `../dino-sandbox`.
- Babylon is a batteries-included engine: built-in glTF/glb loader with skeletal
  animation, a scene graph, PBR + standard materials, shadow generators, post-process
  pipeline, GUI, and a usable built-in physics-free collision system
  (`moveWithCollisions` + ellipsoids). That lets us hit "playable + visually decent"
  fast without bolting on a separate physics lib.
- No build step keeps the "serve a folder" constraint trivially satisfied and the
  next session's iteration loop fast.

**Physics:** Babylon's `moveWithCollisions` capsule/ellipsoid collisions for the
player and AI — deterministic, cheap, no external dependency. Full rigid-body
physics is overkill for an arena chase game.

## Assets: Quaternius Animated Dinosaur Bundle (CC0)

Six animated `.glb` dinos pulled from `static.poly.pizza` (same source the sandbox used).
All share a clip set: `*_Idle`, `*_Walk`, `*_Run`, `*_Jump`, `*_Attack`, `*_Death`
(apatosaurus reuses `Stegosaurus_Death`). Clips are matched by substring.

| File | Species | Role |
|------|---------|------|
| raptor.glb | Velociraptor | (was the player; now unused — kept as an asset) |
| trex.glb | T-Rex | **Predator** (hunts player + herd) |
| triceratops.glb | Triceratops | Herbivore (will charge if cornered) |
| stegosaurus.glb | Stegosaurus | Herbivore (slow, tanky) |
| apatosaurus.glb | Apatosaurus | Herbivore (large, passive) |
| parasaur.glb | Parasaurolophus | Herbivore (skittish, flees fast) |

## Player: Quaternius "Adventurer" human (CC0)

The player is now a rigged **human** (`assets/models/human.glb`), the Quaternius
"Adventurer" pulled from the same `static.poly.pizza` source as the dinos
(`static.poly.pizza/bbe369ee-a686-42c7-adad-14356f5f2f15.glb`, CC0). It ships a
rich clip set under a different naming scheme — `CharacterArmature|<Clip>` rather
than the dinos' `<Species>_<Key>` — and has no Walk-vs-Run distinction problem
(both exist) but **no Jump or bite clip**. So the player's logical states map via
a per-kind `CLIP_ALIASES` table in `dino.js`:

| Player state | Human clip | Note |
|---|---|---|
| Idle | `CharacterArmature\|Idle` | exact match, not `Idle_Gun` etc. |
| Walk | `CharacterArmature\|Walk` | |
| Run | `CharacterArmature\|Run` | exact-tail match beats `Run_Left`/`Run_Right` |
| Jump | `CharacterArmature\|Roll` | no jump clip; the dodge-roll reads as a leap |
| Attack | `CharacterArmature\|Punch_Right` | no bite; a right punch is the melee "attack" |
| Death | `CharacterArmature\|Death` | |

The clip lookup was generalised: each logical key resolves to a search substring
(default `_<Key>` for dinos, overridden per-kind), preferring an exact tail match
before a plain substring so `|Run` isn't shadowed by `|Run_Left`.

**Facing:** `FACING_OFFSET.human = 0`. The Adventurer authors forward toward +Z,
same as the dinos (matches the `atan2(dx,dz)->rotation.y` convention). An initial
PI guess made him run BACKWARDS (backpack-first) — corrected to 0 and confirmed
by side-on screenshots in run/walk/dash. The dinos are unchanged.

## Game design

**Dino Arena: Survival.** Third-person. You are a human survivor in a primeval valley.
- **Objective:** collect glowing eggs scattered across the arena and return them to
  your nest; bank a target number to win the round.
- **Jeopardy:** a roaming T-Rex hunts you (and the herd). Contact drains health.
  Herbivores mostly flee but a cornered Triceratops can charge.
- **Score / progression:** eggs banked, time survived; difficulty ramps (T-Rex speed).
- **Feel:** day/night-ish lighting, fog, shadows, ground foliage, stylised palette.

## Chase economy: human sprint vs T-Rex endurance

Real top speeds anchor the player speeds: a human sprints ~30 km/h, a T-Rex
~20 km/h, so a human sprint should beat the rex by ~1.5x. The internal unit
scale is anchored on the unchanged T-Rex base chase of **11 u/s** (= ~20 km/h):

- `PLAYER.runSpeed = 16.5` u/s — 1.5 × 11 (~30 km/h). Empty-handed sprint always
  outruns any chase (even the dusk peak of 13.5).
- `PLAYER.walkSpeed = 7` u/s (~12.7 km/h jog) — **below** the rex, so a
  stamina-drained player gets run down.

The rex's edge is **endurance**: the human sprint is stamina-gated, the rex never
tires. Tuned for cat-and-mouse (`PLAYER.stamina*`):
- drain 25/s → ~4s of full sprint, opening a ~22 u lead per burst;
- on exhaustion, sprint is locked until stamina rebuilds past `staminaSprintMin`
  35 (~1.9s of forced walk at regen 18/s), during which the rex (11) gains on the
  walker (7) at 4 u/s. So each burst+recovery cycle nets a shrinking lead —
  manageable with timing, fatal if you just hold Shift.

`carrySlow` raised 0.18→0.22 to keep the carry risk tiering against the faster
sprint: 1 egg = 13.5 u/s (outruns the base rex, matched at dusk), 2 = 11.5 (just
above base), 3 = 9.9 (run down). Empty-handed always escapes; carrying slows you.

Verified end-to-end in-browser: sprint-away opens the gap → stamina empties →
the rex closes and bites a careless full-Shift player.

## No magic numbers policy

Tunables live in `src/config.js` with a comment on provenance (design choice vs.
asset-derived). Speeds/health/counts are explicit, named, and adjustable in one place.
