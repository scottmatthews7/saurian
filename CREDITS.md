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
