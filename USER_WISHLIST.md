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

9. **Bigger map + gentle hills (requested).** Grow the arena (ARENA.radius /
   groundSize up) and add slight rolling hills to the terrain. Requires real
   ground-height sampling everywhere (player, dinos, eggs, props all follow the
   terrain — no floating/clipping), and AI pathing must stay sane on slopes.
   Coordinate with the env realism pass (same world.js territory) — do AFTER the
   env branch merges to avoid conflicts.

10. **TREE CLIMBING to evade the T-Rex (requested; design decided).** The human
   can climb suitable trees (interact near trunk → climb up; climb down or drop).
   While treed, the T-Rex SHAKES THE TREE: it rams the trunk on a cadence and the
   player must time/hold their grip (grip input or stamina) or be shaken off into
   danger. Evasion works but is active and tense — not an AFK safe spot. Raptors
   (turkey-sized) can't reach you up a tree either but may circle below. Needs:
   climbable-tree flagging, climb state/anim on the player, rex tree-shake AI +
   shake impulse, fall-off, HUD grip cue.
