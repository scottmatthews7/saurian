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
