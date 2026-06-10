# Credits

## Audio

Real audio samples used for footsteps, dinosaur vocalisations and player
breathing (extending the procedural Web Audio fallbacks in `src/audio.js`).
Files live in `assets/audio/` (in-game defaults) and
`assets/audio/candidates/` (the full audition set surfaced by
`audio-picker.html`).

| Sound | File(s) | Source | Licence |
|---|---|---|---|
| Footsteps (grass) | `footstep_grass_00{0..3}` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 (public domain) |
| T-Rex rumble (eerie, pitched-down) | `trex_rumble_{a,b,c}` | [Mixkit Free SFX](https://mixkit.co/free-sound-effects/) — growl / thunder, pitched down ~−7 semitones locally | Mixkit Free License (royalty-free) |
| T-Rex classic roar | `trex_classic_{a,b}` | [Mixkit Free SFX](https://mixkit.co/free-sound-effects/) — lion roar | Mixkit Free License (royalty-free) |
| Raptor screech | `raptor_screech_{a..d}` | [Mixkit Free SFX](https://mixkit.co/free-sound-effects/) — creature shriek | Mixkit Free License (royalty-free) |
| Herbivore bellow | `herb_bellow_{a..d}` | [Mixkit Free SFX](https://mixkit.co/free-sound-effects/) — animal bellow / low | Mixkit Free License (royalty-free) |
| Player panting | `pant_a` | [OpenGameArt — "Breathing tired"](https://opengameart.org/content/breathing-tired) | CC0 (public domain) |
| Player panting (alts) | `pant_{b,c}` | [Mixkit Free SFX](https://mixkit.co/free-sound-effects/) — breath | Mixkit Free License (royalty-free) |

Notes:
- **Kenney** and the **OpenGameArt "Breathing tired"** assets are CC0 — no
  attribution required, credited here as courtesy.
- **Mixkit** samples are covered by the
  [Mixkit Free License](https://mixkit.co/license/) — free to use, including
  commercially, no attribution required. Credited here as courtesy.
- The T-Rex eerie rumbles were derived locally from royalty-free growl/thunder
  samples by pitch-shifting down and low-pass filtering (ffmpeg) to approximate
  the closed-mouth, infrasound-rich vocalisation hypothesised for tyrannosaurs
  (Julia Clarke et al. — crocodilian rumble + bittern boom).

## Models

3D models are documented in `DECISIONS.md` (Quaternius CC0 dinosaur bundle +
the Quaternius "Adventurer" human, both from `static.poly.pizza`).

## 3D models

### Quaternius — Animated Dinosaur Bundle + Adventurer (CC0 / Public Domain)

All rigged, animated dinosaurs and the human player model are by **Quaternius**,
released **CC0 (Public Domain)** — no attribution legally required, credited here
in good faith. Sourced from poly.pizza (`static.poly.pizza/<uuid>.glb`).

| File | Species / model | poly.pizza |
|------|-----------------|-----------|
| `assets/models/trex.glb` | T-Rex | Animated Dinosaur Bundle |
| `assets/models/raptor.glb` | Velociraptor | Animated Dinosaur Bundle |
| `assets/models/triceratops.glb` | Triceratops | Animated Dinosaur Bundle |
| `assets/models/stegosaurus.glb` | Stegosaurus | Animated Dinosaur Bundle |
| `assets/models/apatosaurus.glb` | Apatosaurus | Animated Dinosaur Bundle |
| `assets/models/parasaur.glb` | Parasaurolophus | Animated Dinosaur Bundle |
| `assets/models/human.glb` | Adventurer (player) | Quaternius "Adventurer" |

- Bundle: https://poly.pizza/bundle/Animated-Dinosaur-Bundle-SmoLdBLO2K
- Author profile: https://poly.pizza/u/Quaternius — also https://quaternius.com
- Licence: Creative Commons Zero v1.0 Universal (CC0)

### Roster note — why the new species reuse these rigs

poly.pizza hosts exactly **one** animated CC0 dinosaur set — the Quaternius
Animated Dinosaur Bundle above — and this game already ships all six of it. There
is **no** animated CC0 (or CC-BY) Spinosaurus / Ankylosaurus / Pachycephalosaurus
/ Brachiosaurus / Compsognathus / Pteranodon on poly.pizza to download (the rest
of the dinosaur search results are static, mostly legacy Poly-by-Google meshes —
the wishlist forbids shipping static reskins).

So the wider roster (`DINO_VARIANTS` in `src/config.js`) is built by **reusing the
above Quaternius rigs** under a distinct tint + body-proportion signature, so each
new species still animates with the shared Idle/Walk/Run/Attack/Death clip set but
reads as a different animal. No new model files are added — all credit remains
with Quaternius (CC0). Variants and the rig each reuses:

| Variant species | Reuses rig | Behaviour |
|-----------------|-----------|-----------|
| Spinosaurus | T-Rex (longer, slate-teal) | tanky herbivore, charges when cornered |
| Ankylosaurus | Stegosaurus (broad, low, mossy) | tank herbivore (×1.6 health) |
| Pachycephalosaurus | Parasaurolophus (stocky, tan) | herbivore, headbutt-charges |
| Brachiosaurus | Apatosaurus (taller, blue-grey) | placid giant herbivore (×1.4 health) |
| Compsognathus | Velociraptor (tiny, olive-yellow) | fast little darter herbivore (×1.4 speed) |

### Pterosaur flyer — procedural (no asset)

The winged pterosaur flyer (`src/flyer.js`) that replaced the old cone-and-box
bird is **procedural geometry built in-engine** (body spindle, beak, swept head
crest, flapping membrane wings) — no external model, no licence required.

Third-party assets used in Dino Arena: Survival, with their sources and licences.

## Models (Quaternius, CC0)
- Animated dinosaurs (raptor, T-Rex, triceratops, stegosaurus, apatosaurus,
  parasaurolophus) and the "Adventurer" human player — Quaternius, via
  `static.poly.pizza`. Public domain (CC0). https://quaternius.com

## Environment textures (CC0)
Added for the environment realism pass. All from ambientCG, released under the
Creative Commons CC0 1.0 licence (public domain — no attribution required;
credited here as good practice). https://ambientcg.com

- **Grass004** (1K JPG) — PBR ground grass albedo/normal/roughness/AO
  (`assets/textures/grass_*.jpg`). Source: https://ambientcg.com/view?id=Grass004
- **Ground054** (1K JPG) — dry/rocky ground for the arid biome + picker variant
  (`assets/textures/dryground_*.jpg`). Source: https://ambientcg.com/view?id=Ground054
- **Bark012** (1K JPG) — tree-trunk bark albedo/normal/roughness
  (`assets/textures/bark_*.jpg`). Source: https://ambientcg.com/view?id=Bark012
- **Rock023** (1K JPG) — boulder rock albedo/normal/roughness
  (`assets/textures/rock_*.jpg`). Source: https://ambientcg.com/view?id=Rock023
- **Foliage001** (1K PNG, alpha-cut atlas) — grass-blade billboard cards
  (`assets/textures/grass_blade_*.png`). Source: https://ambientcg.com/view?id=Foliage001
- **LeafSet019** (1K PNG, alpha-cut atlas) — green leaf-spray canopy cards
  (`assets/textures/leaf_*.png`). Source: https://ambientcg.com/view?id=LeafSet019

## HDRI environment map (CC0)
Added for image-based lighting + realistic sky/reflections in the environment
realism pass. From Poly Haven, released under CC0 (public domain).
https://polyhaven.com

- **Kloofendal 48d Partly Cloudy (Pure Sky)** (1K HDR) — image-based lighting
  (`assets/env/sky.hdr`). Author: Greg Zaal / Poly Haven.
  Source: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- **Kloppenheim 06 (Pure Sky)** (1K HDR) — alternate sky option in the
  environment picker (`assets/env/sky2.hdr`). Poly Haven.
  Source: https://polyhaven.com/a/kloppenheim_06_puresky

Note: the visible in-game sky is the painted gradient dome (user pick); the
HDRIs drive image-based lighting + reflections and are selectable in the picker.
