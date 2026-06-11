# User Wishlist — dino-arena-a (priority order)

The player loves this game (best physics of the three). Working through these
one agent at a time (one agent per repo — concurrent edits clobber).

**LICENCE: CC-BY is now allowed** (player approved), not just CC0. Prefer
poly.pizza models that download directly (CC0 or CC-BY). For any CC-BY asset,
add the author + licence to a `CREDITS.md` in this repo. This unlocks
higher-fidelity rigged dinos than the CC0-only set.

**NEXT UP:** (1) [DONE — session 17] FOOTSTEP + dino AUDIO — real CC0/royalty-free
samples (Kenney footsteps, Mixkit/OGA creatures + breath), per-species dino sounds,
distance-attenuated, player panting. Audition + final-pick via `audio-picker.html`.
(2) OPEN-SOURCE + DEPLOY
PREP (high priority — player wants the repo PUBLIC + contributions):
   - LICENSE: MIT for our code. Keep Babylon.js's own licence/notice (it's
     vendored). Add NOTICE/THIRD_PARTY for Babylon + all CC0/CC-BY model & audio
     assets with author + licence + link.
   - On-SCREEN credits line (title screen) listing CC-BY authors — required once
     public.
   - CONTRIBUTING.md (how to run, project structure, how to add a dino/feature,
     coding conventions, the config.js "no magic numbers" rule), CODE_OF_CONDUCT.
   - README polished for newcomers (what it is, play link, screenshots/GIF, run
     steps, contribute link).
   - Deploy: verify ALL asset paths relative; add deploy config — a netlify.toml
     and/or GitHub Pages workflow — plus DEPLOY.md (itch.io zip + Netlify drop +
     Pages steps). Confirm it runs from a clean static serve.
   - .gitignore sane (node_modules, .agentlock, OS cruft).
   Do NOT push to GitHub from the agent — the coordinator handles the public push
   after review. PUBLIC REPO NAME: `saurian`. GitHub account: scottmatthews7.
   (Only dino-arena-a goes public; the README/title can rename the game to Saurian.)

1. **[in progress] Replace player raptor with a rigged human**; sprinting human
   outruns the T-Rex (~30 vs 20 km/h, ~1.5×) but stamina-gated so the tireless
   rex reels you back when you gas out.

1b. **Player appearance — clean-shaven + blond (requested).** Current model is a
   dark-haired BEARDED adventurer; player wants no beard, blond hair, youthful
   (Leonardo-DiCaprio-Titanic vibe). A true likeness is impossible on a CC0 model —
   don't attempt a portrait. Instead: if hair/beard are separate meshes/materials,
   recolour hair blond + remove/hide the beard + lighten skin slightly. If the
   beard is baked into the texture, SOURCE a clean-shaven fair-haired CC0 character
   instead and swap it in (keep the rig/anim wiring working). Tell the user which.

2. **[DONE — session 17, env-pass branch] Environment realism pass (HIGH PRIORITY — player wants PHOTOREALISM).**
   Push the ENVIRONMENT as close to photoreal as Babylon-in-a-browser allows
   (dinos stay low-poly — expect some mismatch; make the world itself genuinely
   high-fidelity):
   - Real photo-scanned-style PBR ground (high-res albedo + normal + roughness +
     AO), e.g. CC0 textures from ambientCG/Poly Haven.
   - HDRI environment map (Poly Haven CC0 .hdr/.env) for image-based lighting +
     realistic sky + reflections.
   - SSAO, ACES tonemap, colour grade, depth of field, bloom; realistic fog.
   - Realistic foliage: textured grass/fern billboards + better tree
     albedo/normal; instanced for perf. Target 60fps on a Mac.
   - PBR ground material with albedo + normal/roughness (textured soil/grass), not
     flat vertex colour.
   - Natural desaturated palette — olive/sage/moss + brown/earth variation; kill
     the cartoon-bright green.
   - HDRI / gradient sky + image-based lighting; SSAO; ACES + a colour-grade pass;
     softer richer fog with depth.
   - Tree detail: varied canopies, trunk colour + size variety, subtle wind sway;
     denser ground cover (ferns/grass clumps) with distance fade.
   - Keep it performant on a Mac (target 60fps); use instancing for foliage.

3. **[DONE] Fix Triceratops locomotion** — own crisper turnLerp (0.14 vs herd
   0.08), Walk-clip speed matched to ground speed (kills foot-slide), and a
   post-charge recover settle so it no longer judders from charge→reverse-sprint.
   Also fixed the obstacle-avoidance JITTER (herbivores "buzzed" against
   trees/rocks): rewrote `avoidObstacles` to steer tangentially AROUND obstacles
   on a committed side instead of the radial away-push that flipped sign each
   frame. Verified in-browser: a triceratops parked against a tree now turns away
   calmly (heading stable, avg Δ 0.03 rad/frame) instead of vibrating.

4. **[DONE] Replace the procedural pterosaur** — new `src/flyer.js` builds a
   proper winged pterosaur (tapered body, long beak, swept head crest, two
   flapping membrane wings) replacing the cone + box-wings. Drop-in into the
   world.js flock + dive FSM. Reads as a pterosaur, not primitives.

4c. **[DONE — with a hard asset finding] More + BETTER dinosaur species.**
   FINDING: poly.pizza hosts exactly ONE animated CC0 dinosaur set — the
   Quaternius Animated Dinosaur Bundle — and we already ship all six of it. There
   is NO animated CC0/CC-BY Spinosaurus/Ankylosaurus/Pachycephalosaurus/
   Brachiosaurus/Compsognathus/Pteranodon to download (verified by scraping the
   poly.pizza species searches + Quaternius profile + the Ultimate Monsters bundle
   and inspecting each glb's animation list — the rest are STATIC, mostly legacy
   Poly-by-Google meshes, which the wishlist forbids shipping).
   So rather than ship static reskins, the roster was widened by REUSING the six
   animated Quaternius rigs under distinct tint + body-proportion signatures —
   each new species still animates via the shared clip set but reads as a
   different animal. Added (herd now spans 9 species): **Spinosaurus**
   (T-Rex rig, tanky charger), **Ankylosaurus** (Stego rig, ×1.6-HP tank),
   **Pachycephalosaurus** (Parasaur rig, headbutt-charger), **Brachiosaurus**
   (Apato rig, ×1.4-HP giant), **Compsognathus** (raptor rig, ×1.4-speed darter).
   Each has a diet/behaviour. See CREDITS.md for the rig-reuse table + sources.
   (Therizinosaurus 4b: still no rigged CC0 model — skipped, as the wishlist
   permits.)

4b. **Therizinosaurus (requested).** No CC0 rigged Therizinosaurus exists in our
   set. Try to source one (poly.pizza/Sketchfab CC0, must be rigged with usable
   anims). If a good one can't be found, SKIP rather than ship a fake reskin —
   tell the user what you found either way.

4d. **[DONE] Raptor PACKS as a predator.** `createRaptorPack` in ai.js spawns a
   3-5 raptor swarm from difficulty wave 2. Each member holds a fixed,
   evenly-spaced slot on a ring around the player so the pack ENCIRCLES rather
   than stacking, then darts straight in inside lunge range. Reuses raptor.glb +
   the predator-state interface (drops into the game's predator list / roar /
   minimap / HUD unchanged). Per user feedback: raptors are TURKEY-SIZED
   (modelHeight 0.75u ≈ 0.7m, verified ~37% of the human's height in-browser) and
   tuned as a weak swarm — 5 dmg/nip, 24 HP (one player bite fells one), short
   1.8u reach. Distinctive threat vs the lone tank T-Rex.
   (Deinonychus, the man-sized scientifically-correct pack-hunter: SKIPPED — no
   clean animated CC0 model in our set, and adding one needs a separate
   brain/height; left out per the "optional, only if it slots in cleanly" note.)

5. **Aquatic dinosaurs in the lake** (+ player SWIMMING, low priority: in deep
   water the human swims instead of sinking — swim state/anim, slower than land,
   vulnerable to aquatic predators; bundle with the lake work) — add lake-dwelling creatures (e.g. a
   long-necked plesiosaur / a surfacing predator) that lurk and surface; make the
   water's edge feel dangerous.

6. **Primitive tools + backpack inventory.** The human can pick up primitive
   tools/weapons scattered in the world (e.g. sharpened stick/spear, rock, club,
   torch), carry them in a backpack, and **select the active one from an inventory
   UI** (hotbar / number keys + a backpack panel). Equipped weapon lets him fight
   off raptors (a melee swing that staggers/damages a predator). Show the equipped
   item in-hand on the human. Keep it readable and fun, not fiddly.

6b. **[DONE — session 17] Audio: footsteps + dinosaur sounds.** Real CC0/royalty-free
   samples (Kenney CC0 footsteps; Mixkit + OpenGameArt CC0 creatures/breath — see
   CREDITS.md) loaded as WebAudio buffers. Footsteps synced to walk/sprint cadence
   (faster/louder sprinting, pitch-jittered, none idle/airborne); per-species dino
   vocalisations (T-Rex eerie low rumble, raptor screech, herbivore bellow) keyed by
   `kind`, distance-attenuated + more menacing as a predator closes; player panting
   loop tied to sprint + stamina; smooth gain ramps throughout (no pops). Procedural
   fallbacks retained. `audio-picker.html` lets the user audition ~4 candidates per
   category (incl. eerie-rumble vs classic-roar T-Rex) and choose the finals.

7. **Standalone health pickups + SLOW HEALTH REGEN.** Health should slowly
   regenerate over time when not recently hit (gentle passive recovery — back off
   from danger and you heal up). Plus health packs placed in the world / along the
   A→B route for a faster top-up (the old health came from biting herbivores, which
   won't work as a human). Walk over packs to heal; fits the pickups-en-route loop.

7. **THE CORE GAME VISION — "dino porter" (Death-Stranding-with-dinos).**
   *** DEFERRED — DO NOT BUILD THE CAMPAIGN/LEVEL SYSTEM YET. *** Player wants the
   moment-to-moment "walk around and survive dinos" gameplay to be genuinely FUN
   first (movement feel, dinos, combat/tools, audio, environment). Only build this
   A→B/porter structure once that core loop is fun. This is the eventual frame:
   Carry a heavy pack of supplies from A to B across dino country, surviving.
   - **Deliver cargo A→B**: spawn at A loaded with supplies; reach the drop-off at
     B with as much intact as possible = level clear. This is the win condition.
   - **Load vs speed is the central tension** (ties into the human/T-Rex chase we
     built): a heavy pack slows you + drains stamina faster, so you CANNOT outrun
     the T-Rex while overloaded. Strategic choice — pace/route carefully, or DROP
     cargo to sprint away (and lose that delivery). Pack weight = real tradeoff.
   - **Scavenge en route**: eggs (bonus/value), health packs, and extra
     supplies/cargo to pick up and carry. Backpack inventory (item 6) is how you
     manage what you're hauling + your tools.
   - **Procedural route each run** — terrain, hazards, predator placement, A & B
     positions regenerate every level.
   - **3 ROUNDS MAX** — the campaign is exactly 3 deliveries, then a real win/
     "you survived" ending (not endless). Round 1 = approachable, Round 2 = tense,
     Round 3 = brutal finale.
   - **Progressive difficulty across the 3 rounds** — each: longer/harder route,
     more & faster predators (T-Rex + raptor packs + aquatic + air), tighter
     stamina, worse conditions (dusk/rain), heavier required loads.
   - Keep the great physics + chase feel intact. Merge items 6 (backpack/tools) and
     1b/7 here — backpack, cargo, pickups and A→B are ONE coherent loop.

8. **Screen-shake near massive dinos (lower priority).** Camera trembles when a
   giant sauropod is close (scaling with proximity / its footfalls) — the ground
   should feel like it's shaking. Note: T-Rex has padded feet (user note) — no
   thud/shake from the rex; the shake belongs to the giants.

9. **BIGGER BIOME-DIVERSE MAP + gentle hills (user-validated plan).** Do AFTER
   the env branch merges (same world.js territory). Grow the arena and add slight
   rolling hills (real ground-height sampling everywhere — player, dinos, eggs,
   props follow terrain; AI sane on slopes). Then lay the world out as a MIXTURE
   of biomes (user: "a mixture of all!"):
   - Forest pockets + clearings (tactical cover vs sightlines)
   - An open savanna stretch (long sightlines, long chases)
   - A dense jungle zone (claustrophobic, surprise encounters)
   - The dry rocky arid zone (already with env agent)
   - MULTIPLE distinct water bodies, different styles per area (user wants
     variety): a glassy reflective lake, a murky swamp (ominous, fits future
     aquatic dinos), and a rippling pond with shore foam.
   - VARIABLE WEATHER system: drifting mist banks, clear hazy spells, occasional
     light rain passes — cycles over time.
   - Ground decor EVERYWHERE (user: "all of the above"): bones/skeletons + old
     kill sites, fallen mossy logs + root tangles, mushroom + fern understory in
     groves, wildflowers in clearings.
   - VALIDATION VIA MAP EDITOR (user request): ship the best-attempt varied map
     AND a `map-editor.html` — a top-down layout view where the user can DRAG
     the major features around (lakes, forest groves, jungle zone, rocky zone,
     savanna, nest/spawn) and save. Layout persists (localStorage or a JSON file
     they can commit) and the game builds the world from it. The user validates
     by rearranging, not by reading descriptions.

10. **TREE CLIMBING to evade the T-Rex (requested; design decided).** The human
   can climb suitable trees (interact near trunk → climb up; climb down or drop).
   While treed, the T-Rex SHAKES THE TREE: it rams the trunk on a cadence and the
   player must time/hold their grip (grip input or stamina) or be shaken off into
   danger. Evasion works but is active and tense — not an AFK safe spot. Raptors
   (turkey-sized) can't reach you up a tree either but may circle below. Needs:
   climbable-tree flagging, climb state/anim on the player, rex tree-shake AI +
   shake impulse, fall-off, HUD grip cue.

11. **[DONE — session 19] SIMPLIFY OBJECTIVES (user-decided, do right after the three-branch merge).**
   - EGGS: remove the return-to-nest/banking mechanic entirely (nest, banking,
     combo, cursed-egg lure, bank-based win). Eggs become CONSUMABLE pickups:
     walk over one → +health and +some stamina. Golden egg = bigger boost.
   - BEACONS: CUT entirely (user: confused by them; escape is covered by
     sprint/dash/tree-climbing). Remove beacon code, HUD, spawns.
   - Interim win/lose: survival time + score until the A→B porter campaign
     becomes the objective.

12. **Dino health bars (engaged only).** A small health bar floating above each
   dinosaur, shown ONLY when engaged — i.e. while it's chasing/attacking the
   player or has recently taken damage from the player; hidden otherwise. Billboard
   to the camera, colour by fraction, fade in/out. (Predator + herbivore.)

13. **Plane-crash spawn.** The player starts each run as if they've just survived
   a PLANE CRASH — a crashed-plane wreck prop at the spawn point (smoke/debris),
   the human getting up from it. Fits the "stranded in dino country" survival
   framing. Optional: a brief intro beat/sound on spawn.

14. **Fixed map layout (authored in layout-designer.html).** Bake this layout into
   config (fixed for all players): WETLAND/pond to the N, JUNGLE thicket to the W,
   DRY ROCKY (big) to the S, NEW SEA on the EAST edge, spawn at centre. Exact
   coords to come from the designer (Copy values); current seed approx: pond
   (-6,-56) r28, jungle (-55,-18) r45, dry (8,56) r60, sea (92,4) r46.

15. **SEA biome (east edge).** A large sea/ocean on the eastern edge of the map —
   home to the BIG marine reptiles. Open water, distinct from the inland wetland.

16. **Aquatic predator = long-necked PLESIOSAUR.** The current lake creature looks
   rubbish — replace it with a proper plesiosaur/elasmosaurus (long neck, 4
   flippers, ref image): sources a CC0/CC-BY model or builds a good procedural one.
   Lives in the SEA (and surfaces menacingly); big and dangerous near the water.

17. **Spinosaurus in the wetland/swamp.** The Spino (from the foundry) inhabits the
   wetland/swampy area as its apex predator.

18. **Jungle thicket much DENSER / more jungly.** It currently isn't jungly enough —
   crank tree + canopy + undergrowth density way up inside the jungle zone so it
   reads as a proper dense jungle.

19. **Character select (pick your character).** Let the player choose who they play
   as on the title/start screen. At least three options: (a) the current blond
   clean-shaven guy (item 1b), (b) an OLD EXPLORER with GREY HAIR (weathered,
   adventurer outfit), (c) a WOMAN explorer. Reuse the same Adventurer base mesh
   where possible — distinguish by recolour (hair/skin) + minor mesh tweaks, not
   full model swaps, to stay cheap. Selection drives the in-game player model.

20. **PROCESS — fossil-accurate proportions for EVERY procedural dino.** Before
   (or while) building each creature with the Fable-5 swept-geometry method, look
   up the LATEST fossil records and take the LARGEST specimen found. Pull BOTH:
   (a) the measured SKELETON dimensions, and (b) the predicted FLESHED/living body
   dimensions (with muscle + soft tissue). Convert to proportional ratios (fraction
   of total length) and bake them into that creature's module header + build spec so
   every dino is built to reliable, real proportions — not eyeballed. Done for the
   T-Rex (Scotty / RSM P2523.8: ~13 m, ~4 m hip, ~8,870 kg, skull 1.39 m, femur
   1.33 m, deep keel chest ~1.4:1 deeper-than-wide). **Specs written** for all
   five remaining creatures in `dino-arena-a-dinocritic/procgen/PRD-*.md` +
   `BUILD_SPECS.md` (Spino, Therizino, Quetzalcoatlus, Albertonectes plesiosaur,
   Dreadnoughtus). Next: rebuild modules to those ratios + critic loop.

21. **First-person view.** Add a first-person camera mode (look out through the
   human's eyes) as an option alongside the current third-person follow camera —
   toggleable. Hide/handle the player mesh head in FP; keep the look controls and
   sprint/dash/attack working. Heightens the survival immersion (a T-Rex bearing
   down on you fills the screen).

22. **OPENING SEQUENCE — plane-crash intro + diegetic gear pickups (game-design,
   supersedes/expands item 13).** The run begins as a survival scene the player
   pieces together:
   - **Crashed plane:** the player wakes/stands ~**50 m** from a crashed prop
     **Cessna** (a recognisable small single-prop light aircraft — wreck, broken,
     no survivors; smoke/debris optional). The player is NOT at the plane — they
     spawn 50 m out and see it.
   - **Health pack (inside the plane):** a med/health pack sits inside the Cessna.
     The player walks to the wreck, picks it up, and it goes into their **pack
     (inventory)** — equippable + **used on demand** (heals when the player chooses,
     not auto). One-or-few use consumable.
   - **Pilot's body (~20 m from the plane):** a clearly-**dead pilot** lying on the
     ground — **no blood**, but unmistakably dead (slumped/still). Sombre, not gory.
   - **GPS device (on the pilot):** a GPS unit **floats/glows above the pilot's
     body** as a pickup. If the player finds + collects it, they **equip it and
     gain the radar/minimap screen.** ⇒ the radar is now GATED behind finding the
     GPS — it is NOT shown by default; no GPS = no radar (heightens the "lost,
     piece it together" survival feel).
   - Ties the whole opening together: crash → scavenge the wreck (health) → find
     the pilot (GPS/radar) → then survive. Replaces the always-on radar + the bare
     plane-crash spawn (item 13).
