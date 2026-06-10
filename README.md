# Saurian

A browser dinosaur survival game built with Babylon.js (no build step — the engine
is vendored in `lib/`, the game is plain ES modules in `src/`). CC0 animated dino
models, procedural world, real CC0 audio samples. Runs from any static file server.

## Run it

From this directory:

```
python3 -m http.server 8000
```

Then open: **http://localhost:8000/**

(Any free port works — e.g. `python3 -m http.server 8155` → `http://localhost:8155/`.)
Press any key or click the title screen to begin.

## Goal

You are a human survivor stranded in a primeval valley. **Survive as long as you
can.** A roaming T-Rex (and, later, a raptor pack) wants you dead. Sprint and you
outrun the rex (~30 km/h vs its ~20) — but sprint is stamina-limited, and when it
empties you drop to a jog the rex can run down. Eat the glowing **eggs** scattered
about (health + stamina back; rare **golden** eggs are a big boost) and scavenge
**meat** from kills to stay alive. Score accrues from time survived (double at
dusk), pickups, and close calls — death ends the run ("DEVOURED") and your longest
survival + best score are saved.

## Controls

| Key            | Action          |
| -------------- | --------------- |
| `WASD`         | Move            |
| `Shift`        | Sprint (stamina)|
| `Space`        | Jump            |
| `Click` / `J`  | Punch / Kick    |
| `F`            | Dash (dodge)    |
| `P`            | Pause           |
| `M`            | Mute            |
| `R`            | Restart (after game over) |

On touch devices a left analog joystick (push full to sprint) and on-screen
STRIKE / JUMP / DASH buttons appear automatically; tap to start or restart.

## Features

- **Procedural 3D world** — rolling terrain, hill rim, trees/rocks/grass, fog, a
  gradient skydome and a gentle day/night light cycle.
- **Dusk arc** — each run escalates: predators grow bolder as dusk falls, but every
  second survived at dusk pays double. A HUD daylight bar tracks it.
- **Smart AI** — a chasing T-Rex with sight/lose-interest ranges, a flanking raptor
  pack, a fleeing herbivore herd, obstacle avoidance, and a pterosaur flock that
  dives at you.
- **Herd predation + feeding frenzy** — the T-Rex hunts the herd too; lead it onto
  a herbivore and it peels off. While it feeds on a kill it glows green on the
  radar — rush in and strike its flank for double damage.
- **Consumable pickups** — walk over an egg to eat it (+health, +stamina); rare
  **golden** eggs far out in the wilds heal big and refill stamina; felled
  herbivores drop healing meat. Consumed eggs respawn, so a long run stays fed.
- **Player kit** — sprint with stamina + exhaustion, bare-handed punches and kicks,
  and a dash with brief invulnerability to dodge bites (a perfect dodge scores a
  CLOSE CALL bonus).
- **Hazards** — a water pond that slows you and drains health.
- **Juice** — dust, hit-flashes, camera shake, low-health vignette, floating score
  popups, an auto-follow chase camera, and a top-down radar minimap.
- **Audio** — real CC0 samples (footsteps, per-species dino calls, panting) over a
  procedural WebAudio bed, and a tension heartbeat that quickens as the T-Rex closes in.
- **Scoring** — time survived + pickups + close calls; longest survival and best
  score saved to local storage and shown on the title and death screens.

## Project layout

- `index.html` — entry point, HUD markup, styles.
- `src/` — game modules (`game.js` is the entry; `world`, `player`, `ai`, `eggs`,
  `pickups`, `hud`, `audio`, `fx`, `minimap`, `touch`, `config`, …).
- `lib/` — vendored Babylon.js engine + loaders.
- `assets/models/` — CC0 Quaternius dino glbs.
- `tools/` — headless logic tests (`node tools/<name>_test.mjs`).
- `PROGRESS.md` / `DECISIONS.md` — build log and engine-choice rationale.
