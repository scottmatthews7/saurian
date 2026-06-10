import { buildWorld } from "./world.js";
import { buildEnv } from "./env.js";
import { createPlayer, createFollowCamera } from "./player.js";
import { createTrex, createHerd, setObstacles, setDusk, setLure } from "./ai.js";
import { createEggs } from "./eggs.js";
import { createBeacons } from "./beacons.js";
import { createPickups } from "./pickups.js";
import { createInput } from "./input.js";
import { createTouchControls } from "./touch.js";
import { createHUD } from "./hud.js";
import { createAudio } from "./audio.js";
import { createFx } from "./fx.js";
import { createMinimap } from "./minimap.js";
import { PLAYER, TREX, EGGS, JUICE, AUDIO, PICKUPS, DUSK, BEACONS } from "./config.js";

// Nearest uncollected egg to a position, or null if none remain.
function nearestEgg(eggs, pos) {
  let best = null, bd = Infinity;
  for (const e of eggs.eggs) {
    if (e.collected || e.banked) continue;
    const d = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
    if (d < bd) { bd = d; best = e.mesh.position; }
  }
  return best;
}

export async function startGame() {
  const B = window.BABYLON;
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new B.Scene(engine);
  scene.collisionsEnabled = true;
  scene.gravity = new B.Vector3(0, -0.5, 0);

  const loadingEl = document.getElementById("loading");
  const setLoad = (t) => { if (loadingEl) loadingEl.querySelector(".loadMsg").textContent = t; };

  setLoad("Building the valley…");
  const world = buildWorld(scene);
  setObstacles(world.obstacles);  // AI steers around trees, big rocks, the pond

  const input = createInput(canvas);
  const touch = createTouchControls(input);  // mounts only on touch devices
  const hud = createHUD();
  const audio = createAudio();
  const fx = createFx(scene);
  const minimap = createMinimap();

  setLoad("Waking the survivor…");
  const player = await createPlayer(scene, world.shadow, input);
  player.setGroundFn(world.heightAt);
  player.setWaterFn(world.inWater);
  player.warpTo(0, world.heightAt(0, 0), 0);

  const camRig = createFollowCamera(scene, player);

  setLoad("Waking the T-Rex…");
  const trex = await createTrex(scene, world.shadow, world.heightAt);

  setLoad("Releasing the herd…");
  const herd = await createHerd(scene, world.shadow, world.heightAt);

  setLoad("Scattering eggs…");
  const eggs = createEggs(scene, world.shadow, world.heightAt);
  const pickups = createPickups(scene, world.shadow, world.heightAt);
  const beacons = createBeacons(scene, world.shadow, world.heightAt);

  // --- wire feedback callbacks (audio + particles + screen shake) ---
  const B2 = window.BABYLON;
  // scoring + combo: chained banks within comboWindow grow a multiplier
  const score = { points: 0, combo: 1, lastBankAt: -999 };
  eggs.onPickup = (pos, golden, cursed) => {
    audio.pickup(golden || cursed);
    const col = cursed ? new B2.Color4(0.8, 0.2, 1, 1)
      : golden ? new B2.Color4(1, 0.82, 0.25, 1)
      : new B2.Color4(1, 0.9, 0.5, 1);
    fx.pickupBurst(pos, col);
    if (cursed) { hud.popup("CURSED EGG — they're coming!", "warn"); audio.roar(); }
    else if (golden) hud.popup("GOLDEN EGG!", "gold");
  };
  eggs.onBank = ({ count, value, cursed }) => {
    audio.bank();
    fx.pickupBurst(eggs.nest.position, cursed ? new B2.Color4(0.8, 0.3, 1, 1) : new B2.Color4(0.5, 1, 0.6, 1));
    const sinceLast = game.elapsed - score.lastBankAt;
    score.combo = sinceLast <= EGGS.comboWindow
      ? Math.min(EGGS.comboMax, score.combo + EGGS.comboStep)
      : 1;
    score.lastBankAt = game.elapsed;
    // Dusk bank bonus: banking as dusk deepens is worth more (risk/reward).
    const dusk = world.getDusk();
    const duskMul = 1 + DUSK.bankBonus * dusk;
    // value is in "egg units" (golden eggs are worth goldenValueMul each)
    const gained = Math.round(value * EGGS.baseValue * score.combo * duskMul);
    score.points += gained;
    hud.setScore(score.points, score.combo);
    const duskTag = dusk >= DUSK.duskThreshold ? " 🌆" : "";
    const cursedTag = cursed ? " ☠" : "";
    hud.popup(`+${gained.toLocaleString()}${score.combo > 1 ? ` ×${score.combo}` : ""}${cursedTag}${duskTag}`, cursed ? "gold" : "score");
  };
  eggs.onDrop = (pos) => fx.pickupBurst(pos, new B2.Color4(1, 0.5, 0.3, 1));
  pickups.onHeal = (pos) => {
    audio.heal();
    fx.pickupBurst(pos, new B2.Color4(0.3, 1, 0.4, 1));
    hud.popup(`+${PICKUPS.meatHeal} HP`, "heal");
  };
  // Ward beacons: a warm chime + amber burst when one ignites; a bigger payoff
  // (heal + score + flourish) when the full ring is lit.
  beacons.onLight = (pos) => {
    audio.beacon();
    fx.pickupBurst(pos, new B2.Color4(1, 0.6, 0.2, 1));
    const lit = beacons.litCount;
    if (lit < BEACONS.count) hud.popup(`BEACON LIT ${lit}/${BEACONS.count}`, "heal");
  };
  beacons.onSanctuary = (pos) => {
    audio.win();
    fx.pickupBurst(pos, new B2.Color4(1, 0.85, 0.4, 1));
    fx.addShake(JUICE.roarShake);
    player.heal(BEACONS.sanctuaryHeal);
    score.points += BEACONS.sanctuaryScore;
    hud.setScore(score.points, score.combo);
    hud.popup(`SANCTUARY! +${BEACONS.sanctuaryScore} · +${BEACONS.sanctuaryHeal} HP`, "gold");
  };
  // A lit beacon burned down: a soft dying puff + cue so the player knows the
  // ring needs relighting (the upkeep loop).
  beacons.onGutter = (pos) => {
    audio.beacon();
    fx.pickupBurst(pos, new B2.Color4(0.5, 0.5, 0.55, 1));
    hud.popup("BEACON GUTTERED OUT", "warn");
  };
  player.onAttack = () => audio.bite();
  // Splash + spray when the raptor wades into the pond.
  player.onSplash = (pos) => {
    audio.splash();
    fx.pickupBurst(pos, new B2.Color4(0.45, 0.7, 0.95, 1));
  };
  // Universal hurt feedback fires for any damage source (bite or charge hit).
  player.onHurt = () => { audio.hurt(); fx.addShake(JUICE.camShakeOnHit); hud.hitFlash(); };
  // Dash: a quick whoosh + a cyan dust kick at the launch point.
  player.onDash = (pos) => {
    audio.whoosh();
    fx.pickupBurst(pos, new B2.Color4(0.45, 0.85, 1, 1));
  };
  // Intimidating roar: stagger any T-Rex in range and panic nearby herbivores.
  player.onRoar = (pos) => {
    audio.roar();
    fx.addShake(JUICE.roarShake);
    fx.pickupBurst(pos, new B2.Color4(1, 0.85, 0.4, 1));
    const r2 = PLAYER.roarRadius * PLAYER.roarRadius;
    for (const p of predators) {
      if (p.dead || !p.roarReact) continue;
      const tp = p.dino.root.position;
      if ((tp.x - pos.x) ** 2 + (tp.z - pos.z) ** 2 < r2) p.roarReact(PLAYER.roarStagger);
    }
    for (const h of herd) {
      if (h.dead || !h.roarReact) continue;
      const tp = h.dino.root.position;
      if ((tp.x - pos.x) ** 2 + (tp.z - pos.z) ** 2 < r2) h.roarReact(PLAYER.roarStagger);
    }
  };
  herd.forEach((h) => {
    h.onCharge = () => { audio.bite(); fx.addShake(JUICE.chargeShake); };
    h.onDown = (pos) => {
      audio.hurt();
      fx.pickupBurst(pos, new B2.Color4(0.8, 0.2, 0.15, 1));
      pickups.spawn(pos.x, pos.z);
    };
  });

  // Predators are a list so later waves can add a second T-Rex.
  const predators = [];
  const wirePredator = (p) => {
    p.onBite = () => {
      // hurt audio/shake/flash come from player.onHurt; here a bite also
      // fumbles a carried egg back into the valley.
      const pp = player.dino.root.position;
      eggs.dropCarried(pp, world.heightAt(pp.x, pp.z));
    };
    p.onRoar = () => audio.roar();
    // The T-Rex bit a herbivore (herd predation): a chomp SFX + a red spray so
    // the player reads the predator culling the herd elsewhere on the field.
    p.onPreyBite = (pos) => {
      audio.bite();
      fx.pickupBurst(pos, new B2.Color4(0.75, 0.18, 0.15, 1));
    };
    // It felled its prey and settled in to FEED — the vulnerable window. A
    // distant roar growl + a dark spray mark the gorging so the player can read
    // (and rush) the opening on the radar.
    p.onFeed = (pos) => {
      audio.roar();
      fx.pickupBurst(pos, new B2.Color4(0.45, 0.08, 0.1, 1));
    };
    predators.push(p);
  };
  wirePredator(trex);
  let secondSpawned = false;

  // mute toggle (button + M key)
  hud.onMuteClick(() => hud.setMuteLabel(audio.toggleMute()));
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") hud.setMuteLabel(audio.toggleMute());
  });
  hud.setMuteLabel(audio.muted);

  // Environment realism pass (HDRI/IBL + SSAO + ACES/colour-grade + bloom + DoF
  // + vignette/grain). All owned by env.js so the realism work merges cleanly.
  buildEnv(scene, camRig.cam);

  if (loadingEl) loadingEl.style.display = "none";

  // --- game state ---
  const game = {
    over: false,
    won: false,
    paused: false,
    elapsed: 0,
    wave: 0,
  };
  const BEST_TIME_KEY = "dinoArenaBestTime";
  const BEST_SCORE_KEY = "dinoArenaBestScore";
  const readBest = () => { const v = +localStorage.getItem(BEST_TIME_KEY); return v > 0 ? v : null; };
  const readBestScore = () => { const v = +localStorage.getItem(BEST_SCORE_KEY); return v > 0 ? v : null; };
  // Footstep cadence reuses the dust interval so puffs and thuds stay in sync.
  const STEP_INTERVAL = JUICE.dustInterval;
  let stepTimer = 0;
  let tensionTimer = 0;
  // Fires a one-shot "the predators grow bolder" cue the first time dusk deepens
  // past DUSK.duskThreshold in a run. A roar + popup so the player reads it.
  let duskAnnounced = false;

  hud.setObjective(`Bank ${EGGS.targetToWin} eggs at your nest. Don't get eaten.`);
  {
    const bt = readBest(), bs = readBestScore();
    const bestLine = (bt || bs)
      ? `Best: ${bt ? bt.toFixed(0) + "s" : "—"}${bs ? " · " + bs.toLocaleString() + " pts" : ""}`
      : "";
    hud.showTitle(EGGS.targetToWin, bestLine);
  }
  let started = false;
  const startGameLoop = () => {
    if (started) return;
    started = true;
    hud.hideBanner();
    audio.unlock();        // AudioContext needs a user gesture
    audio.startAmbient();
  };
  window.addEventListener("keydown", startGameLoop, { once: true });
  canvas.addEventListener("pointerdown", startGameLoop, { once: true });
  // Touch devices: the joystick/buttons sit above the canvas, so also start on
  // the first touch anywhere on the page.
  if (touch.mounted) window.addEventListener("pointerdown", startGameLoop, { once: true });

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    // Freeze the day/night clock until a run is live so the title screen stays
    // bright; atmosphere + water still animate inside world.update either way.
    world.update(dt, started && !game.paused && !game.over);
    const shake = fx.updateShake(dt);
    camRig.update(shake, dt);

    if (!started || game.paused) return;

    if (!game.over) {
      game.elapsed += dt;

      // Day/night gameplay: push the run's dusk factor into the AI (predators
      // grow bolder) and the HUD time-of-day bar. One-shot cue when dusk deepens.
      const dusk = world.getDusk();
      setDusk(dusk);
      // Cursed-egg lure: while carried, every T-Rex homes in on the raptor.
      setLure(eggs.carryingCursed);
      beacons.setDusk(dusk);   // a lit beacon's ward grows with dusk (defensive mirror of the bank bonus)
      hud.setDusk(dusk);
      if (!duskAnnounced && dusk >= DUSK.duskThreshold) {
        duskAnnounced = true;
        hud.popup("DUSK FALLS — predators grow bolder", "warn");
        audio.roar();
      }

      // difficulty ramp: every 30s predators get a bit faster
      const wave = Math.floor(game.elapsed / 30);
      if (wave > game.wave) {
        game.wave = wave;
        const bonus = wave * TREX.chaseSpeedRamp;
        predators.forEach((p) => { p.speedBonus = bonus; });
        // a second T-Rex joins the hunt at the configured wave
        if (!secondSpawned && wave >= TREX.secondSpawnWave) {
          secondSpawned = true;
          createTrex(scene, world.shadow, world.heightAt).then((p2) => {
            p2.speedBonus = game.wave * TREX.chaseSpeedRamp;
            wirePredator(p2);
            audio.roar();
          });
        }
      }

      player.carrying = eggs.carrying;   // drives carry-slow in the controller
      player.update(dt);
      // the nearest live predator is what the herd flees and the HUD tracks
      let primary = null, primaryD = Infinity;
      const pp0 = player.dino.root.position;
      for (const p of predators) {
        p.update(dt, player, herd);
        if (p.dead) continue;
        const d = Math.hypot(p.dino.root.position.x - pp0.x, p.dino.root.position.z - pp0.z);
        if (d < primaryD) { primaryD = d; primary = p; }
      }
      herd.forEach((h) => h.update(dt, player, primary));
      eggs.update(dt, player);
      pickups.update(dt, player);
      // Ward beacons: light on proximity, then repel any predator inside a lit
      // beacon's ward (breaks the chase). Warded after the predators moved so a
      // T-Rex that steps into the ward is staggered out of it next frame.
      beacons.update(dt, player);
      beacons.wardPredators(predators);

      // pterosaur dive attack — a telegraphed screech then a swoop from above
      world.updateThreats(dt, player,
        () => audio.screech(),
        (pos) => fx.pickupBurst(pos, new B2.Color4(0.7, 0.2, 0.2, 1)));

      // footstep dust + sound while running on the ground
      const pPos = player.dino.root.position;
      fx.footDust(dt, pPos, player.moving && player.grounded);
      fx.dashTrail(pPos, player.dashActive > 0);
      if (player.sprinting && player.grounded) {
        stepTimer -= dt;
        if (stepTimer <= 0) { stepTimer = STEP_INTERVAL; audio.step(); }
      }

      // tension heartbeat from the nearest predator chasing the PLAYER — a T-Rex
      // off hunting a herbivore (prey set) is not bearing down on you, so it
      // mustn't trigger the heartbeat.
      const chasing = primary && primary.mode === "chase" && !primary.prey && !(primary.feeding > 0) ? primary : null;
      if (chasing) {
        const closeness = Math.max(0, 1 - primaryD / TREX.sightRange); // 0 far .. 1 on top
        tensionTimer -= dt;
        if (tensionTimer <= 0) {
          tensionTimer = AUDIO.tensionIntervalFar -
            closeness * (AUDIO.tensionIntervalFar - AUDIO.tensionIntervalNear);
          audio.tension(closeness);
        }
      } else {
        tensionTimer = 0;
      }

      // player bite: one clean, frame-rate-independent hit per target per swing.
      // `lastBiteId` on each target gates it so a single chomp lands exactly
      // PLAYER.attackDamage once, no matter the frame rate. Felled herbivores
      // drop meat that heals the raptor.
      if (player.attacking > 0) {
        const tryBite = (t) => {
          if (t.dead || t.lastBiteId === player.biteId) return;
          const tp = t.dino.root.position;
          if (Math.hypot(pPos.x - tp.x, pPos.z - tp.z) < PLAYER.attackRange) {
            t.lastBiteId = player.biteId;
            // FEEDING FRENZY payoff: a T-Rex bitten while head-down feeding takes
            // bonus damage — the brave-raptor punish window. Loud feedback so the
            // player learns the opening pays.
            const feeding = t.feeding > 0;
            t.takeDamage(PLAYER.attackDamage * (feeding ? TREX.feedVulnMultiplier : 1));
            if (feeding) {
              hud.popup("FEEDING FRENZY — flank hit!", "good");
              fx.addShake(JUICE.feedHitShake);
            } else if (!player.biteConnected) {
              player.biteConnected = true; fx.addShake(JUICE.biteConnectShake);
            }
          }
        };
        for (const p of predators) tryBite(p);
        for (const h of herd) tryBite(h);
      }

      // expire the combo display once the chain window lapses
      if (score.combo > 1 && game.elapsed - score.lastBankAt > EGGS.comboWindow) {
        score.combo = 1;
        hud.setScore(score.points, score.combo);
      }

      // HUD — show the most-threatening (nearest live) predator's health
      hud.setHealth(player.health, PLAYER.maxHealth);
      hud.setStamina(player.stamina, PLAYER.staminaMax, player.exhausted);
      hud.setRoar(1 - player.roarTimer / PLAYER.roarCooldown);
      hud.setDash(1 - player.dashTimer / PLAYER.dashCooldown);
      hud.setTrex(primary ? primary.health : 0, TREX.maxHealth);
      hud.setEggs(eggs.banked, EGGS.targetToWin, eggs.carrying, eggs.remaining());
      hud.setBeacons(beacons.litCount, BEACONS.count, beacons.anyGuttering);

      // win / lose
      if (eggs.banked >= EGGS.targetToWin) {
        game.over = true; game.won = true;
        audio.win();
        const t = game.elapsed;
        const prev = readBest();
        const isBest = prev == null || t < prev;
        if (isBest) localStorage.setItem(BEST_TIME_KEY, t.toFixed(1));
        const prevScore = readBestScore();
        const bestScore = prevScore == null || score.points > prevScore;
        if (bestScore) localStorage.setItem(BEST_SCORE_KEY, String(score.points));
        const bestLine = isBest ? "New best time! " : `Best: ${prev.toFixed(0)}s. `;
        // Acknowledge a brave finish: winning once dusk has fallen earns a flourish.
        const duskWin = world.getDusk() >= DUSK.duskThreshold ? "🌆 You held out into dusk! " : "";
        hud.showBanner("YOU SURVIVED",
          `${duskWin}${bestLine}Score ${score.points.toLocaleString()}${bestScore ? " (best!)" : ""} · ${t.toFixed(0)}s · ${eggs.banked} eggs. Press R to play again.`,
          "win");
      } else if (player.dead) {
        game.over = true;
        audio.lose();
        hud.showBanner("DEVOURED", `You lasted ${game.elapsed.toFixed(0)}s · score ${score.points.toLocaleString()} · ${eggs.banked} eggs banked. Press R to retry.`, "lose");
      }

      // compass + timer guide on the objective pill
      const pp = player.dino.root.position;
      let tx, tz, label;
      if (eggs.carrying > 0) {
        tx = 0; tz = 0;
        // A cursed egg keeps the danger legible the whole time it's carried —
        // the pickup popup fades, but the guide pill stays loud while it's on you.
        label = eggs.carryingCursed
          ? `☠ CURSED — every T-Rex hunts you! Bank it at the nest`
          : `Carrying ${eggs.carrying} — bank at the nest`;
      } else {
        const t = nearestEgg(eggs, pp);
        if (t) { tx = t.x; tz = t.z; label = `Nearest egg · ${eggs.banked}/${EGGS.targetToWin} banked`; }
      }
      if (label) {
        const camFwd = camRig.cam.getForwardRay().direction;
        const camBearing = Math.atan2(camFwd.x, camFwd.z);
        const worldBearing = Math.atan2(tx - pp.x, tz - pp.z);
        const heading = worldBearing - camBearing;   // 0 = straight ahead (up)
        hud.setGuide(`${label} · ${game.elapsed.toFixed(0)}s`, heading);
      }
    }

    // radar — updated whenever the game is running (even after win/lose)
    minimap.update(player, predators, herd, eggs, pickups, beacons);
  });

  // Soft restart — re-rolls a fresh run in place without reloading the page
  // (keeps the loaded GLBs and the unlocked AudioContext).
  const resetGame = () => {
    // dispose any extra predators spawned on later waves; keep the first
    while (predators.length > 1) predators.pop().dino.dispose();
    secondSpawned = false;
    predators.forEach((p) => p.reset());
    herd.forEach((h) => h.reset());
    eggs.reset();
    pickups.reset();
    beacons.reset();
    world.resetDusk();   // fresh run starts in full daylight again
    world.resetThreats(); // abort any in-flight pterosaur dive from the old run
    setDusk(0); hud.setDusk(0); duskAnnounced = false;
    setLure(false);
    const c = world.heightAt(0, 0);
    player.reset(0, c, 0);
    score.points = 0; score.combo = 1; score.lastBankAt = -999;
    game.over = false; game.won = false; game.paused = false;
    game.elapsed = 0; game.wave = 0;
    stepTimer = 0; tensionTimer = 0;
    hud.setScore(0, 1);
    hud.hideBanner();
  };

  // On touch devices, tapping anywhere once the run is over restarts it (no
  // keyboard for R). The flag stops the same tap from also restarting twice.
  if (touch.mounted) {
    window.addEventListener("pointerdown", () => {
      if (started && game.over) resetGame();
    });
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "r" && game.over) resetGame();
    if (k === "p" && started && !game.over) {
      game.paused = !game.paused;
      if (game.paused) hud.showBanner("PAUSED", "Press P to resume.", "start");
      else hud.hideBanner();
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // Debug handle for in-browser smoke tests (harmless to leave exposed).
  window.__game = { engine, scene, game, score, player, predators, herd, eggs, pickups, beacons, world, hud, resetGame };

  return { engine, scene };
}
