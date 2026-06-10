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

3. **Fix Triceratops locomotion** — it "doesn't move very well." Investigate
   facing offset / wrong clip / speed; make it walk/turn cleanly like the others.

4. **Replace the procedural pterosaur** — it "looks like geometric objects (a
   cone)." Build a proper winged flyer (membrane wings, beak, crest, flap anim)
   or source a CC0 model. Should read as a pterosaur, not primitives.

4c. **More + BETTER dinosaur species (requested; CC-BY now allowed).** Actively
   source higher-fidelity rigged+ANIMATED dinos — CC-BY is fine, credit in
   CREDITS.md. Prefer better-looking models than the CC0 toy set where available;
   also widen the roster (Spinosaurus, Ankylosaurus, Pachycephalosaurus,
   Brachiosaurus, Compsognathus, Pteranodon, etc.). Download the .glb directly
   (poly.pizza CC0/CC-BY curl straight in) and drop into assets/models. Only add
   models that ANIMATE (skip static). Assign each a diet/behaviour so they slot
   into the existing brains. Report exactly what you added + sources.

4b. **Therizinosaurus (requested).** No CC0 rigged Therizinosaurus exists in our
   set. Try to source one (poly.pizza/Sketchfab CC0, must be rigged with usable
   anims). If a good one can't be found, SKIP rather than ship a fake reskin —
   tell the user what you found either way.

4d. **Raptor PACKS as a predator (requested).** The raptor model is now free
   (player is a human). Add raptors as a fast, pack-hunting predator: 2-4 hunting
   together, flanking/surrounding the player, quicker but weaker than the T-Rex,
   coordinating their attacks. Reuse the existing raptor.glb + predator brain.
   Great threat variety vs the lone tank T-Rex. (Confirmed: this game, the human
   survival one.)

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
