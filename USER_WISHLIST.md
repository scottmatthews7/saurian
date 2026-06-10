# User Wishlist — dino-arena-a (priority order)

The player loves this game (best physics of the three). Working through these
one agent at a time (one agent per repo — concurrent edits clobber).

**LICENCE: CC-BY is now allowed** (player approved), not just CC0. Prefer
poly.pizza models that download directly (CC0 or CC-BY). For any CC-BY asset,
add the author + licence to a `CREDITS.md` in this repo. This unlocks
higher-fidelity rigged dinos than the CC0-only set.

**NEXT UP (do immediately after the current player-fix agent finishes):**
FOOTSTEP AUDIO — synced to the human's walk vs sprint cadence (faster/louder when
sprinting), via the existing procedural audio.js. The player has asked for this
repeatedly; ship it first, standalone, before the bigger items.

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

2. **Environment realism pass (HIGH PRIORITY — player wants PHOTOREALISM).**
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

6b. **Audio: footsteps + dinosaur sounds.** Footstep audio synced to the human's
   walk/sprint cadence (and surface), plus richer dinosaur vocalisations — roars,
   calls, distance-attenuated, more menacing as a predator nears. Extend the
   existing procedural audio.js; CC0 samples ok if better than procedural.

7. **Standalone health pickups** — placed in the world / along the A→B route
   (the old health came from biting herbivores, which won't work as a human).
   Walk over to heal; fits the pickups-en-route design below.

7. **THE BIG PIVOT — level-based A→B gauntlet, pickups en route.**
   - Each level: spawn at A, reach the goal at B alive = level clear.
   - Eggs/fossils become OPTIONAL collectibles along the route (score/bonus), not
     the win condition.
   - **Procedural map each run** — terrain, obstacle + dino placement, and route
     regenerate every level.
   - **Progressive difficulty** — each level harder: more/faster predators, longer
     or more hazardous route, tighter stamina economy, worse conditions (dusk/rain).
   - Keep the great physics + chase feel intact.
