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

### Audio pass — organic Freesound replacements

The owner flagged the previous procedural-synth and repurposed sounds (splash, hurt,
bite, screech, creature call, big steps, stegosaurus/apatosaurus vocals, all UI
and all pickups except tension) as too synthetic / "8-bit". They were replaced with
real organic recordings from [Freesound](https://freesound.org). All picks below are
**CC0 (public domain)** — no attribution legally required, credited here as good
practice. HQ preview MP3s were used. The matching procedural recipe is kept in
`src/audio.js` as a load-failure fallback for each. The runner-up A/B candidates live in
`assets/audio/candidates/*_alt.mp3` and are auditionable in `audio-dashboard.html`.

**Owner audition pass (latest):** the T-Rex / predator vocal was promoted to the
DeqstersLab "Monster Guttural Growl, Dry" (#734900) as the in-game default — this
guttural rumble IS the T-Rex voice; there is **no separate roar** (the old `roar`
method and dashboard row were removed; every predator cue now plays the creature's own
`vocalise()`). The PJ_Bear "ominous_growl" (#708960) is now the A/B alternative.
Bite, screech and the big-step thud were re-sourced to more organic clips: a wet
meaty flesh squelch (bite), a harsh reptilian creature screech-rasp (screech), and a
deep hollow organic earth-boom (big step) — none clicky/robotic or clean birdsong.

**Owner audition pass — round 3 (latest):** seven cues re-sourced or re-wired per the
owner's verdict.
- **Footstep-wading** now reuses the SAME splash sample as `splash()` for its wet layer
  (no separate water sound).
- **Hurt** now randomly alternates per hit between the two MrFossy pain grunts
  (#547197 / #547205) — both are wired into the engine (`hurt` + `hurtAlt`).
- **Stegosaurus / Apatosaurus** re-sourced to distinct deep saurian calls (NOT cattle /
  elephant): stego = noahpardo "Deep Groan 2" (#345727, smaller/grunt-ier), apato = Thanra
  "Monster bellowing" (#245429, a vast deep moan).
- **Bite** re-sourced to a solid crunchy flesh-and-bone chomp — Breviceps "Biting on bones"
  (#445987) — not a wet squelch.
- **Screech** is the QUETZALCOATLUS / azhdarchid pterosaur call. Azhdarchids had no avian
  syrinx; current thinking (and Prehistoric Planet's archosaur-analog approach) favours
  LOW croaks / booms / hisses over a bird-of-prey screech. Re-sourced to birdOfTheNorth
  "monster croak" (#582914) — a deep croaky boom.
- **Creature call** re-sourced from a cow moo to Chobiboko "monster roar in distance"
  (#261147) — a distant menacing non-bovine call.
- **Win** replaced with a bigger triumphant orchestral sting — FunWithSound "Music Dramatic
  Orchestral Ending" (#588390).
- **Lose** kept as a GONG (owner's pick) but swapped for a longer, deeper, more reverberant
  one — thma "gong hit loud close" (#245878, ~37s decay).
- **Big step** unchanged (owner: GOOD).

**Owner audition pass — round 4 (latest):** two cues re-wired per the owner's verdict.
- **Apatosaurus** — the owner loved the round-3 ALT (joelu2001 "Distant Sinister Moan"
  #360593), so it is **promoted to the default** vocal. It was too long (20.8s), so it was
  **trimmed with ffmpeg to ~3.5s** (a tight 8.3–11.8s window of the moan + a 0.6s fade-out)
  for an in-game call. The old default (Thanra "Monster bellowing" #245429) is demoted to the
  alt. (The separate `creaturecall` alt still points at the full #360593 — untouched.)
- **Screech** (Quetzalcoatlus / azhdarchid call) — the round-3 "monster croak" (#582914) was
  rejected as not working. Re-sourced to genuinely organic ratite/reptile recordings (the
  cassowary is the standard azhdarchid analog — a real, deep, dangerous ratite with no avian
  syrinx, à la Prehistoric Planet): **default** = TheKingOfGeeks360 "Ratites - Cassowary, Groan"
  (#843486, a real cassowary groan), **alt** = Ovkovko "CrocodilianTypeGrowl" (#825609, a deep
  resonant reptilian grumble). Both deep, guttural, low-mid weight — NOT a clean bird-of-prey
  screech and NOT the old croak. (A third candidate auditioned but not wired: the same author's
  shorter "Ratites - Cassowary" grunt #826080.)

All round-3 and round-4 picks are now **CC0** (the previous CC-BY screech runner-up, Robinhood76
"monster bird creaking" #276493, was replaced by the round-4 CC0 screech set above).

| Sound (engine method) | File | Freesound | Author | Licence |
|---|---|---|---|---|
| Splash (`splash`) | `splash.mp3` | "water splash 2" [#398039](https://freesound.org/s/398039/) | swordofkings128 | CC0 |
| Splash — alt | `candidates/splash_alt.mp3` | "Water Splash" [#829676](https://freesound.org/s/829676/) | AardsReal | CC0 |
| Hurt A (`hurt`) | `hurt.mp3` | "AdultMale PainGrunt 18" [#547197](https://freesound.org/s/547197/) | MrFossy | CC0 |
| Hurt B (`hurt`, wired in) | `hurt_alt.mp3` | "AdultMale PainGrunt 07" [#547205](https://freesound.org/s/547205/) | MrFossy | CC0 |
| Bite (`bite`) | `bite.mp3` | "Biting on bones" [#445987](https://freesound.org/s/445987/) | Breviceps | CC0 |
| Bite — alt | `candidates/bite_alt.mp3` | "Hard Candy / Bone Crunch" [#392883](https://freesound.org/s/392883/) | clif_creates | CC0 |
| Screech (`screech`) | `screech.mp3` | "Ratites - Cassowary, Groan" [#843486](https://freesound.org/s/843486/) | TheKingOfGeeks360 | CC0 |
| Screech — alt | `candidates/screech_alt.mp3` | "CrocodilianTypeGrowl" [#825609](https://freesound.org/s/825609/) | Ovkovko | CC0 |
| T-Rex rumble (`vocalise("trex")`) | `trex.mp3` | "Monster Guttural Growl, Dry" [#734900](https://freesound.org/s/734900/) | DeqstersLab | CC0 |
| T-Rex — alt | `candidates/trex_alt.mp3` | "ominous_growl" [#708960](https://freesound.org/s/708960/) | PJ_Bear | CC0 |
| Stegosaurus (`vocalise("stegosaurus")`) | `stegosaurus.mp3` | "Deep Groan 2" [#345727](https://freesound.org/s/345727/) | noahpardo | CC0 |
| Stegosaurus — alt | `candidates/stegosaurus_alt.mp3` | "Deep Groan 3" [#345734](https://freesound.org/s/345734/) | noahpardo | CC0 |
| Apatosaurus (`vocalise("apatosaurus")`) | `apatosaurus.mp3` | "Distant Sinister Moan" [#360593](https://freesound.org/s/360593/), trimmed to ~3.5s + fade-out | joelu2001 | CC0 |
| Apatosaurus — alt | `candidates/apatosaurus_alt.mp3` | "Monster bellowing" [#245429](https://freesound.org/s/245429/) | Thanra | CC0 |
| Creature call (`creatureCall`) | `creaturecall.mp3` | "monster roar in distance" [#261147](https://freesound.org/s/261147/) | Chobiboko | CC0 |
| Creature call — alt | `candidates/creaturecall_alt.mp3` | "Distant Sinister Moan" [#360593](https://freesound.org/s/360593/) | joelu2001 | CC0 |
| Big step (`bigStep`) | `bigstep.mp3` | "Boom_01" [#336487](https://freesound.org/s/336487/) | Faulkin | CC0 |
| Big step — alt | `candidates/bigstep_alt.mp3` | "DinoSteps1" [#77027](https://freesound.org/s/77027/) | andysm | CC0 |
| Pickup — egg (`pickup(false)`) | `pickup.mp3` | "Kalimba C3" [#536549](https://freesound.org/s/536549/) | dvdfu | CC0 |
| Pickup — golden (`pickup(true)`) | `pickup_golden.mp3` | "crystal bell" [#614832](https://freesound.org/s/614832/) | arseniiv | CC0 |
| Heal (`heal`) | `heal.mp3` | "temple bowl" [#810426](https://freesound.org/s/810426/) | midge-f | CC0 |
| UI tap (`ui`) | `ui_tap.mp3` | "wood_block" [#555545](https://freesound.org/s/555545/) | stwime | CC0 |
| Win (`win`) | `win.mp3` | "Music Dramatic Orchestral Ending" [#588390](https://freesound.org/s/588390/) | FunWithSound | CC0 |
| Lose (`lose`) | `lose.mp3` | "gong hit loud close" [#245878](https://freesound.org/s/245878/) | thma | CC0 |

**Kept (not flagged / owner's pick):** Tension heartbeat (procedural), the dash Whoosh /
melee Swing & Thud (procedural), the Kenney footsteps, OpenGameArt panting, the Raptor
and Triceratops/Parasaur vocals.

**T-Rex note:** `trex.mp3` (now the DeqstersLab guttural growl) is an organic low growl
played back slowed (`AUDIO.trexRumbleRate = 0.85`, deepened further by `menace`) to
approximate the eerie closed-mouth infrasound rumble hypothesised for tyrannosaurs
(Julia Clarke et al. — crocodilian rumble + bittern boom), rather than a Hollywood
open-mouth roar. There is no roar sample or roar method — this rumble is the only
predator voice.

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
