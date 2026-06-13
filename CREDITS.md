# Credits

Third-party assets used in Saurian (Dino Arena: Survival), with sources and
licences. Best-effort attribution, audited 2026-06-12 from embedded glTF
metadata plus the original listings. Where a licence claim could not be
independently confirmed, that is stated. If you are a rights-holder of any
asset below and want different attribution or removal, please open an issue.

## 3D models

### Dinosaurs and player — Quaternius (CC0 / public domain)

All low-poly rigged, animated dinosaurs and the human player model are by
**Quaternius**, released **CC0 (public domain)** — no attribution legally
required, credited here in good faith. Sourced from poly.pizza
(`static.poly.pizza/<uuid>.glb`).

| File | Species / model | Source |
|------|-----------------|--------|
| `assets/models/trex.glb` | T-Rex | Animated Dinosaur Bundle |
| `assets/models/raptor.glb` | Velociraptor | Animated Dinosaur Bundle |
| `assets/models/triceratops.glb` | Triceratops | Animated Dinosaur Bundle |
| `assets/models/stegosaurus.glb` | Stegosaurus | Animated Dinosaur Bundle |
| `assets/models/apatosaurus.glb` | Apatosaurus | Animated Dinosaur Bundle |
| `assets/models/parasaur.glb` | Parasaurolophus | Animated Dinosaur Bundle |
| `assets/models/human.glb` | Adventurer (player) | Quaternius "Adventurer" |

- Bundle: https://poly.pizza/bundle/Animated-Dinosaur-Bundle-SmoLdBLO2K
- Author: https://poly.pizza/u/Quaternius — https://quaternius.com
- Licence: Creative Commons Zero v1.0 Universal (CC0)

The wider roster (`DINO_VARIANTS`) reuses these rigs under distinct tints and
proportions — no additional model files; all credit remains with Quaternius.
The animation clips baked onto the hi-poly models below are also from this
Quaternius set.

### Hi-poly dinosaurs (Sketchfab uploads of Prehistoric Kingdom models)

The four hi-poly animated dinosaurs are downloaded Sketchfab models with the
Quaternius clips retargeted and baked onto their own rigs (see
`HIPOLY_PIPELINE.md`). The Sketchfab listings are labelled **CC-BY-4.0**, but
their descriptions state the models are **from the game Prehistoric Kingdom**
(Blue Meridian / published by Crytivo). A game-asset extraction cannot
validly be relicensed CC-BY by the uploader, so the CC-BY labels on these
listings should not be relied upon; underlying rights presumably remain with
the Prehistoric Kingdom rights-holders. Stated here plainly; contact us for
attribution changes or removal.

| File | Listing title | Uploader | Source |
|------|---------------|----------|--------|
| `assets/models/trex_hi_anim.glb` (+ `assets/reference/trex_hi.glb`) | "Accurate Tyrannosaurus rex" | hsejira | https://sketchfab.com/3d-models/accurate-tyrannosaurus-rex-6f9a8f6ad5ff47e28212a064b6783055 |
| `assets/models/triceratops_hi_anim.glb` (+ `assets/reference/triceratops_hi.glb`) | "Accurate Triceratops horridus" | hsejira | https://sketchfab.com/3d-models/accurate-triceratops-horridus-e797b70c11fd4d3a91783ad41aa32893 |
| `assets/models/brachiosaurus_hi_anim.glb` (+ `assets/reference/brachiosaurus_hi.glb`) | "Accurate Brachiosaurus altithorax" | hsejira | https://sketchfab.com/3d-models/accurate-brachiosaurus-altithorax-5c8127f0f136447888f3c73a8cac34bc |
| `assets/models/raptor_hi_anim.glb` | "Velociraptor Accurate Rigged (Dust Devil skin)" | BB-N8 | https://sketchfab.com/3d-models/velociraptor-accurate-rigged-dust-devil-skin-5266290699c549a198b6a3c3282ab70c |

- Original dinosaur models: **Prehistoric Kingdom** (Blue Meridian / Crytivo)
  — https://www.prehistorickingdom.com
- The "Tyrannosaurus rex" listing description: "Tyrannosaurus rex from
  Prehistoric Kingdom" (verified on the listing page). The raptor listing
  likewise states it is from Prehistoric Kingdom; "Dust Devil" is one of that
  game's skins. The Triceratops and Brachiosaurus listings are by the same
  uploader (hsejira) in the same "Accurate …" series and are presumed the
  same provenance.

### Set-dressing, vegetation and props (Sketchfab)

All licence/author data below is taken from metadata embedded in the
downloaded files at export time, i.e. what the Sketchfab listing declared.
Listings marked "page-verified" were re-checked against the live listing on
2026-06-12; the rest are credited from embedded metadata in good faith.

Attribution format: "Title" by Author, via Sketchfab. CC-BY-4.0 items are
licensed under https://creativecommons.org/licenses/by/4.0/ (models may be
repacked/compressed; otherwise unmodified unless noted).

| File | Title | Author | Licence | Source |
|------|-------|--------|---------|--------|
| `assets/models/cliff.glb` | "Cliff" | DJMaesen (sketchfab.com/bumstrum) | CC-BY-4.0 | https://sketchfab.com/3d-models/cliff-082da1166a814c6e9c9e6c1b38159e4e |
| `assets/models/crashed_plane.glb` | "Crashed_[X]_Airplane-01" | -X-ScornGames | CC-BY-4.0 (AI-generated — Tripo material signature in file) | https://sketchfab.com/3d-models/crashed-x-airplane-01-c69d225443724acbadb0568158ad9598 |
| `assets/models/dead_pilot.glb` | "Tactical Soldier In Combat Gear" | restore50 | CC-BY-4.0 (page-verified; listing marked "Generated with AI") | https://sketchfab.com/3d-models/tactical-soldier-in-combat-gear-970fbda053024c20a84a0714e4538887 |
| `assets/models/dead_tree.glb` | "Dead Tree" | hayabuzaa | CC-BY-4.0 | https://sketchfab.com/3d-models/dead-tree-5bed8d70d0004c17b9ba319a4d9ed581 |
| `assets/models/desert__rocks__stones__pack.glb` | "Desert \| Rocks \| Stones \| Pack" | Erroratten | CC-BY-4.0 | https://sketchfab.com/3d-models/desert-rocks-stones-pack-c2208f5ccc004f1681d27de67fe75799 |
| `assets/models/desert_shrubs.glb` | "Desert Shrubs" | evolveduk | Sketchfab Standard (free download; NOT Creative Commons — see licence notes) | https://sketchfab.com/3d-models/desert-shrubs-3f116a7e0c464f2798fe25c7dae4fabb |
| `assets/models/desert_old_tree.glb`, `assets/models/old_tree.glb` | "Old Tree 3d model free" | iGauravRajput | CC-BY-4.0 | https://sketchfab.com/3d-models/old-tree-3d-model-free-c3c76aade9ec42b9a452034a825d623f |
| `assets/models/fern.glb` | "Realistic HD Common polypody fern (37/55)" | PlantCatalog | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-hd-common-polypody-fern-3755-eb8b02d83476411faeb72e4befd58d1f |
| `assets/models/fern2.glb` | "Realistic HD Common polypody fern (10/55)" | PlantCatalog | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-hd-common-polypody-fern-1055-8c84a0419762417fb22a85f4fc829e02 |
| `assets/models/fishing_boat.glb` | "Low Poly Old Rusty Fishing Boat" | Ottto3d | CC-BY-4.0 | https://sketchfab.com/3d-models/low-poly-old-rusty-fishing-boat-3713c37983ea4c04b87fe173e2631b76 |
| `assets/models/forest_trees.glb` | "Low Poly Forest Tree Pack" | 99.Miles | CC-BY-4.0 | https://sketchfab.com/3d-models/low-poly-forest-tree-pack-5ff5a51e74324845a4e4905f182dfb2b |
| `assets/models/free_cliff_rock.glb` | "Free_cliff_rock" | Kwinto | CC-BY-4.0 | https://sketchfab.com/3d-models/free-cliff-rock-75fb6b34dc0d46259dedc8c7cd94e7b7 |
| `assets/models/geranium.glb` | "Realistic HD Chinese jungle geranium (6/10)" | PlantCatalog | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-hd-chinese-jungle-geranium-610-38916dda0334496c98b3aa19772fb3c7 |
| `assets/models/geranium2.glb` | "Realistic HD Chinese jungle geranium (2/10)" | PlantCatalog | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-hd-chinese-jungle-geranium-210-268a0cc517c24094b66b27b6b8047d7c |
| `assets/models/gps_device.glb` | "GPS device" | Mikhail Antonov (sketchfab.com/xeofox) | CC-BY-4.0 | https://sketchfab.com/3d-models/gps-device-8d739b084bb44ad7b900fe0d0649d579 |
| `assets/models/health_pack.glb` | "Health / Medical Pack" | amftwg | CC-BY-4.0 | https://sketchfab.com/3d-models/health-medical-pack-67ac86b4022b403dbf0dc0c66dee0ade |
| `assets/models/jungle_tree.glb` | "Realistic Jungle Tree" | Garecra | CC-BY-4.0 (see licence notes — Quixel Megascans material IDs) | https://sketchfab.com/3d-models/realistic-jungle-tree-78dc7da4047b4fff8cb83c7159f52699 |
| `assets/models/locust_tree_pack.glb` | "Locust Tree Pack" | Jagobo | CC-BY-4.0 | https://sketchfab.com/3d-models/locust-tree-pack-7784d6ccdf314618aa3eb390808521c6 |
| `assets/models/lupine.glb` | "Realistic HD Large-leaved lupine (10/18)" | PlantCatalog | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-hd-large-leaved-lupine-1018-aa7d756c0b754b2daa7b0d1a40435221 |
| `assets/models/monstera.glb` | "Monstera Adansonii" | The_Structure_World | CC-BY-4.0 | https://sketchfab.com/3d-models/monstera-adansonii-08e02f5b80c34cb9b09c0a6a48deba9d |
| `assets/models/raptor_nest.glb` | "Raptor nest" | Cradle of the Cube (sketchfab.com/Observer_Terminator) | Listed CC-BY-4.0 (page-verified) — but see licence notes: probable game extraction | https://sketchfab.com/3d-models/raptor-nest-7b5b8bb7f07349ea92a313de6079c620 |
| `assets/models/realistic_trees_pack_of_2_free.glb` | "Realistic Trees Pack of 2 Free" | Nicholas-3D (sketchfab.com/Nicholas01) | CC-BY-4.0 | https://sketchfab.com/3d-models/realistic-trees-pack-of-2-free-08b4a9eac77a40419fd59402cc7b2deb |
| `assets/models/stego_skeleton.glb` | "Stegosaurus skeleton" | Olof Moleman (sketchfab.com/lordtrilobite) | **CC-BY-NC-4.0** (non-commercial — see licence notes) | https://sketchfab.com/3d-models/stegosaurus-skeleton-bca2e8f0a4e84cdda146bbd286f0e84a |

### Procedural (no external asset)

The pterosaur flyer (`src/flyer.js`), plesiosaur, procedural dino variants and
all remaining geometry are built in-engine — no licence applies.

## Licence notes (factual)

- **Hi-poly dinosaurs** (`trex_hi_anim`, `raptor_hi_anim`,
  `triceratops_hi_anim`, `brachiosaurus_hi_anim` and the `assets/reference/`
  source copies): extracted from the game **Prehistoric Kingdom**; the
  Sketchfab CC-BY labels are not a valid grant from the rights-holder.
- **`stego_skeleton.glb`**: licensed **CC-BY-NC-4.0** — the licence permits
  non-commercial use only.
- **`desert_shrubs.glb`**: Sketchfab **Standard** licence (not Creative
  Commons). It permits incorporating the model into one's own creations but
  not redistribution of the asset file itself; this game serves the raw
  `.glb`. The listing is also tagged "rdr2" (Red Dead Redemption 2) — the
  vegetation set may be derived from that game; unconfirmed.
- **`raptor_nest.glb`**: the file's material is named
  `MI_Gameplay_RaptorNest_A` (Unreal Engine material-instance naming), the
  listing is tagged "fornite", and the uploader's name references Fortnite's
  "Cube's Cradle". Strong indication it was extracted from **Fortnite**
  (Epic Games); the CC-BY label would not be a valid grant in that case.
  Unconfirmed but stated plainly.
- **`jungle_tree.glb`**: material names embed Quixel **Megascans** asset IDs
  (e.g. `Banyan_Bark_tfhjaeju`), i.e. the model is built from Megascans
  surfaces, which the uploader cannot relicense CC-BY. The mesh itself may be
  the uploader's own work.
- **`crashed_plane.glb`** and **`dead_pilot.glb`** are AI-generated
  (Tripo signature / Sketchfab "Generated with AI" label respectively).

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
