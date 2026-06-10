# Dino Arena: Survival

A browser dinosaur survival game built with Babylon.js (no build step — the engine
is vendored in `lib/`, the game is plain ES modules in `src/`). CC0 animated dino
models, procedural world, procedural audio. Runs from any static file server.

## Run it

From this directory:

```
python3 -m http.server 8000
```

Then open: **http://localhost:8000/**

(Any free port works — e.g. `python3 -m http.server 8155` → `http://localhost:8155/`.)
Press any key or click the title screen to begin.

## Goal

You are a raptor. **Collect 6 glowing eggs and bank them at your nest** before a
roaming T-Rex eats you. Carrying eggs slows you down; a T-Rex bite can make you
fumble one back into the valley. Reach 6 banked to win ("YOU SURVIVED"); hit 0
health to lose ("DEVOURED").

## Controls

| Key            | Action          |
| -------------- | --------------- |
| `WASD`         | Move            |
| `Shift`        | Sprint (stamina)|
| `Space`        | Jump            |
| `Click` / `J`  | Bite            |
| `Q`            | Roar            |
| `F`            | Dash (dodge)    |
| `P`            | Pause           |
| `M`            | Mute            |
| `R`            | Restart (after game over) |

On touch devices a left analog joystick (push full to sprint) and on-screen
ROAR / BITE / JUMP / DASH buttons appear automatically; tap to start or restart.

## Features

- **Procedural 3D world** — rolling terrain, hill rim, trees/rocks/grass, fog, a
  gradient skydome and a gentle day/night light cycle.
- **Dusk arc** — each run escalates: predators grow bolder as dusk falls, but late
  egg banks pay double. A HUD daylight bar tracks it.
- **Smart AI** — a chasing T-Rex with sight/lose-interest ranges, a fleeing
  herbivore herd, obstacle avoidance, and a pterosaur flock that dives at you.
- **Herd predation + feeding frenzy** — the T-Rex hunts the herd too; lead it onto
  a herbivore and it peels off. While it feeds on a kill it glows green on the
  radar — rush in and flank-bite for double damage.
- **Egg variety** — ordinary eggs, rare **golden** eggs (big score), and rare
  **cursed** eggs (huge score, but every T-Rex hunts you while you carry one).
- **Ward beacons** — light three braziers by walking into them; a lit beacon repels
  the T-Rex (wider at dusk) and lights the gloom. They burn down — relight them.
  Light all three for a one-shot sanctuary bonus.
- **Player kit** — sprint with stamina + exhaustion, a roar that staggers a chasing
  T-Rex and panics the herd, and a dash with brief invulnerability to dodge bites.
- **Hazards** — a water pond that slows you and drains health.
- **Juice** — dust, hit-flashes, camera shake, low-health vignette, floating score
  popups, an auto-follow chase camera, and a top-down radar minimap.
- **Procedural audio** — zero-asset WebAudio: roars, bites, ambient drone, and a
  tension heartbeat that quickens as the T-Rex closes in.
- **Scoring** — combo multiplier for chained banks, best clear time and best score
  saved to local storage and shown on the win banner.

## Project layout

- `index.html` — entry point, HUD markup, styles.
- `src/` — game modules (`game.js` is the entry; `world`, `player`, `ai`, `eggs`,
  `beacons`, `hud`, `audio`, `fx`, `minimap`, `touch`, `config`, …).
- `lib/` — vendored Babylon.js engine + loaders.
- `assets/models/` — CC0 Quaternius dino glbs.
- `tools/` — headless logic tests (`node tools/<name>_test.mjs`).
- `PROGRESS.md` / `DECISIONS.md` — build log and engine-choice rationale.
