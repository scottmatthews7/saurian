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
| raptor.glb | Velociraptor | **Player** (agile, fast) |
| trex.glb | T-Rex | **Predator** (hunts player + herd) |
| triceratops.glb | Triceratops | Herbivore (will charge if cornered) |
| stegosaurus.glb | Stegosaurus | Herbivore (slow, tanky) |
| apatosaurus.glb | Apatosaurus | Herbivore (large, passive) |
| parasaur.glb | Parasaurolophus | Herbivore (skittish, flees fast) |

## Game design

**Dino Arena: Survival.** Third-person. You are a raptor in a primeval valley.
- **Objective:** collect glowing eggs scattered across the arena and return them to
  your nest; bank a target number to win the round.
- **Jeopardy:** a roaming T-Rex hunts you (and the herd). Contact drains health.
  Herbivores mostly flee but a cornered Triceratops can charge.
- **Score / progression:** eggs banked, time survived; difficulty ramps (T-Rex speed).
- **Feel:** day/night-ish lighting, fog, shadows, ground foliage, stylised palette.

## No magic numbers policy

Tunables live in `src/config.js` with a comment on provenance (design choice vs.
asset-derived). Speeds/health/counts are explicit, named, and adjustable in one place.
