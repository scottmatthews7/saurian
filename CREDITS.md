# Credits

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
