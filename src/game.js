import { buildWorld } from "./world.js";
import { buildEnv } from "./env.js";
import { createPlayer, createFollowCamera } from "./player.js";
import { createTrex, createHerd, createRaptorPack, setObstacles, setDusk } from "./ai.js";
import { createAquatic } from "./aquatic.js";
import { createEggs } from "./eggs.js";
import { createPickups } from "./pickups.js";
import { createInventory } from "./inventory.js";
import { createTools, applyStagger } from "./tools.js";
import { loadCrashedPlane, loadStegoSkeleton, loadOldTree } from "./setdressing.js";
import { createInput } from "./input.js";
import { createTouchControls } from "./touch.js";
import { createHUD } from "./hud.js";
import { createAudio } from "./audio.js";
import { createFx } from "./fx.js";
import { createMinimap } from "./minimap.js";
import { PLAYER, TREX, EGGS, JUICE, AUDIO, PICKUPS, DUSK, RAPTOR, SCORE, TOOLS } from "./config.js";

// Nearest uncollected egg to a position, or null if none remain.
function nearestEgg(eggs, pos) {
  let best = null, bd = Infinity;
  for (const e of eggs.eggs) {
    if (e.collected) continue;
    const d = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
    if (d < bd) { bd = d; best = e.mesh.position; }
  }
  return best;
}

// Survival time, formatted for the HUD/banner: "47s" under a minute, "2:07" after.
function formatTime(seconds) {
  const s = Math.floor(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  player.setDeepWaterFn(world.isDeepWater);            // deep water => the human SWIMS
  player.setWaterSurfaceFn(() => world.waterSurfaceY); // float at the surface while swimming
  player.warpTo(0, world.heightAt(0, 0), 0);

  // Crashed plane — static set-dressing the survivor wakes beside at spawn. Pure
  // scenery (no AI/physics), but a solid box collider blocks movement, so add its
  // footprint to the obstacle list and re-arm AI avoidance.
  const plane = await loadCrashedPlane(scene, world.shadow, world.heightAt);
  world.obstacles.push(plane.obstacle);
  setObstacles(world.obstacles);

  // Desert fossil vignette — a half-buried Stegosaurus skeleton + an old dead
  // tree beside it (static scenery, no collider/AI; shadows like the plane).
  await loadStegoSkeleton(scene, world.shadow, world.heightAt);
  await loadOldTree(scene, world.shadow, world.heightAt);

  const camRig = createFollowCamera(scene, player);

  setLoad("Waking the T-Rex…");
  const trex = await createTrex(scene, world.shadow, world.heightAt);

  setLoad("Releasing the herd…");
  const herd = await createHerd(scene, world.shadow, world.heightAt);

  setLoad("Something stirs in the lake…");
  const aquatic = createAquatic(scene, world.shadow, world);

  setLoad("Scattering eggs…");
  const eggs = createEggs(scene, world.shadow, world.heightAt);
  const pickups = createPickups(scene, world.shadow, world.heightAt);

  // Primitive tools + backpack inventory (wishlist item 6). The backpack holds
  // collected weapons; tools.js scatters pickups, shows the equipped weapon
  // in-hand, throws rocks, and deters predators with a lit torch.
  const inventory = createInventory();
  const tools = createTools(scene, world.shadow, world.heightAt, inventory);
  inventory.onChange = (inv) => hud.setHotbar(inv);
  hud.setHotbar(inventory);

  // --- wire feedback callbacks (audio + particles + screen shake) ---
  const B2 = window.BABYLON;
  // Survival scoring: points accrue from time alive (faster at dusk), pickups,
  // and close calls. Kept as a float internally; floored for display.
  const score = { points: 0 };
  const addScore = (gained) => {
    score.points += gained;
    hud.setScore(Math.floor(score.points));
  };
  // Eggs are consumables: the heal/stamina lands inside eggs.update; here the
  // FX/SFX/score read the find.
  eggs.onPickup = (pos, golden) => {
    audio.pickup(golden);
    fx.pickupBurst(pos, golden ? new B2.Color4(1, 0.82, 0.25, 1) : new B2.Color4(1, 0.9, 0.5, 1));
    addScore(golden ? SCORE.goldenPickup : SCORE.eggPickup);
    if (golden) hud.popup(`GOLDEN EGG! +${SCORE.goldenPickup} · +${EGGS.goldenHeal} HP`, "gold");
    else hud.popup(`+${SCORE.eggPickup} · +${EGGS.heal} HP`, "score");
  };
  pickups.onHeal = (pos) => {
    audio.heal();
    fx.pickupBurst(pos, new B2.Color4(0.3, 1, 0.4, 1));
    addScore(SCORE.meatPickup);
    hud.popup(`+${SCORE.meatPickup} · +${PICKUPS.meatHeal} HP`, "heal");
  };
  // Tools feedback: a pickup chime + popup naming the weapon; a whoosh on throw;
  // a thud + spray when a thrown rock connects.
  tools.onPickup = (pos, kind) => {
    audio.pickup(false);
    fx.pickupBurst(pos, new B2.Color4(0.85, 0.8, 0.7, 1));
    hud.popup(`PICKED UP ${(TOOLS.kinds[kind] || {}).label || kind} — press 1-6 to equip`, "good");
  };
  tools.onThrow = () => audio.swing();
  tools.onProjectileHit = (pos) => {
    audio.thud();
    fx.pickupBurst(pos, new B2.Color4(0.9, 0.85, 0.7, 1));
    fx.addShake(JUICE.strikeConnectShake);
  };
  // A perfect dodge: dash i-frames negated a predator's attack. Skill pays.
  player.onCloseCall = (pos) => {
    fx.pickupBurst(pos, new B2.Color4(0.45, 0.85, 1, 1));
    addScore(SCORE.closeCall);
    hud.popup(`CLOSE CALL! +${SCORE.closeCall}`, "good");
  };
  // A punch/kick swing: an airy whoosh (the impact thud lands separately when
  // a strike actually connects, in the strike resolution below).
  player.onAttack = () => audio.swing();
  // Splash + spray when the player wades into the pond.
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
  herd.forEach((h) => {
    h.onCharge = () => { audio.bite(); fx.addShake(JUICE.chargeShake); };
    h.onDown = (pos) => {
      audio.hurt();
      fx.pickupBurst(pos, new B2.Color4(0.8, 0.2, 0.15, 1));
      pickups.spawn(pos.x, pos.z);
    };
  });

  // Aquatic predator: a watery breach when it surfaces (a telegraph for the
  // player at the bank), a chomp + shake on a bite, and a final splash as it
  // sinks back under. Reuses the existing splash/bite SFX + spray bursts.
  aquatic.onSurface = (pos) => {
    audio.splash();
    audio.vocalise("trex", 1.0, 0.4);   // low predator growl on the breach (no roar)
    fx.pickupBurst(pos, new B2.Color4(0.45, 0.7, 0.95, 1));
  };
  aquatic.onBite = () => { /* player.onHurt already fires audio.hurt + shake + flash */ };
  aquatic.onSubmerge = (pos) => {
    audio.splash();
    fx.pickupBurst(pos, new B2.Color4(0.4, 0.62, 0.82, 1));
  };

  // Predators are a list so later waves can add a second T-Rex.
  const predators = [];
  const wirePredator = (p) => {
    // The predator's own guttural voice when it locks on (T-Rex rumble / raptor
    // screech) — there is no separate roar.
    p.onRoar = () => audio.vocalise(p.kind, 1.0, 0.3);
    // The T-Rex bit a herbivore (herd predation): a chomp SFX + a red spray so
    // the player reads the predator culling the herd elsewhere on the field.
    p.onPreyBite = (pos) => {
      audio.bite();
      fx.pickupBurst(pos, new B2.Color4(0.75, 0.18, 0.15, 1));
    };
    // It felled its prey and settled in to FEED — the vulnerable window. A
    // distant guttural growl + a dark spray mark the gorging so the player can
    // read (and rush) the opening on the radar.
    p.onFeed = (pos) => {
      audio.vocalise(p.kind, 1.0, 0.3);
      fx.pickupBurst(pos, new B2.Color4(0.45, 0.08, 0.1, 1));
    };
    predators.push(p);
  };
  wirePredator(trex);
  let secondSpawned = false;
  let packSpawned = false;

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
    paused: false,
    elapsed: 0,
    wave: 0,
  };
  // Fresh keys for the survival era: the old dinoArenaBestTime was a FASTEST
  // win (banking game) — meaningless as a longest-survival best, so it is not
  // migrated. Best survival time = LONGEST run.
  const BEST_TIME_KEY = "saurianBestSurvival";
  const BEST_SCORE_KEY = "saurianBestScore";
  const readBest = () => { const v = +localStorage.getItem(BEST_TIME_KEY); return v > 0 ? v : null; };
  const readBestScore = () => { const v = +localStorage.getItem(BEST_SCORE_KEY); return v > 0 ? v : null; };
  let stepTimer = 0;        // counts down to the next footfall SFX
  let tensionTimer = 0;
  let vocalTimer = AUDIO.vocalIntervalMax; // counts down to the next ambient creature call
  let bigStepTimer = AUDIO.bigStepInterval; // counts down to the next sauropod footfall thud
  // Fires a one-shot "the predators grow bolder" cue the first time dusk deepens
  // past DUSK.duskThreshold in a run. A roar + popup so the player reads it.
  let duskAnnounced = false;

  hud.setObjective("Survive as long as you can. Don't get eaten.");
  {
    const bt = readBest(), bs = readBestScore();
    const bestLine = (bt || bs)
      ? `Best: ${bt ? formatTime(bt) + " survived" : "—"}${bs ? " · " + bs.toLocaleString() + " pts" : ""}`
      : "";
    hud.showTitle(bestLine);
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
      hud.setDusk(dusk);

      // Survival score: every second alive pays, and seconds survived at dusk
      // pay up to double (the risk/reward mirror of the bolder predators).
      addScore(SCORE.survivalPerSec * (1 + DUSK.survivalBonus * dusk) * dt);
      if (!duskAnnounced && dusk >= DUSK.duskThreshold) {
        duskAnnounced = true;
        hud.popup("DUSK FALLS — predators grow bolder", "warn");
        audio.vocalise("trex", 1.0, 0.4);   // a low predator growl marks the turn
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
            audio.vocalise("trex", 1.0, 0.4);   // the new T-Rex announces itself with a growl
          });
        }
        // A coordinated RAPTOR PACK joins from its wave — fast flanking hunters
        // that surround the player (a different threat from the lone tank T-Rex).
        if (!packSpawned && wave >= RAPTOR.secondPackWave) {
          packSpawned = true;
          const packN = RAPTOR.packMin + Math.floor(Math.random() * (RAPTOR.packMax - RAPTOR.packMin + 1));
          createRaptorPack(scene, world.shadow, world.heightAt, packN).then((members) => {
            members.forEach((m) => { m.speedBonus = game.wave * TREX.chaseSpeedRamp; wirePredator(m); });
            audio.vocalise("raptor", 1.0, 0.2);   // the pack yips on arrival (its own screech)
            hud.popup("RAPTOR PACK — they hunt together!", "warn");
          });
        }
      }

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
      aquatic.update(dt, player);   // lake lurker: submerged patrol -> surface/lunge -> submerge
      eggs.update(dt, player);
      pickups.update(dt, player);

      // Tools (item 6): weapon pickups, in-hand mesh + swing, thrown rocks,
      // torch deterrence. Throw on G / right-click (spends a rock). Stagger
      // timers (set by a heavy hit / thrown rock) tick down here so the AI's
      // hold-when-staggered guard releases on schedule.
      if (input.consumeThrow()) tools.throwEquipped(player);
      tools.update(dt, player, predators, herd);
      tools.tickStagger(dt, predators);
      tools.tickStagger(dt, herd);

      // pterosaur dive attack — a telegraphed screech then a swoop from above
      world.updateThreats(dt, player,
        () => audio.screech(),
        (pos) => fx.pickupBurst(pos, new B2.Color4(0.7, 0.2, 0.2, 1)));

      // footstep dust + sound while moving on the ground
      const pPos = player.dino.root.position;
      fx.footDust(dt, pPos, player.moving && player.grounded);
      fx.dashTrail(pPos, player.dashActive > 0);
      // Footstep SFX synced to locomotion: a footfall on cadence, faster +
      // louder when sprinting, none when idle or airborne. Reset the timer when
      // not stepping so the first footfall after stopping/landing lands promptly
      // rather than mid-interval.
      if (player.moving && player.grounded) {
        const sprinting = player.sprinting;
        const interval = sprinting ? AUDIO.footstepSprintInterval : AUDIO.footstepWalkInterval;
        let volume = sprinting ? AUDIO.footstepSprintVolume : AUDIO.footstepWalkVolume;
        if (player.wading) volume = AUDIO.footstepWadeVolume;
        stepTimer -= dt;
        if (stepTimer <= 0) {
          stepTimer = interval;
          audio.footstep(volume, sprinting, player.wading);
        }
      } else {
        stepTimer = 0;
      }

      // Player panting: breath loop fades in while sprinting/dashing, heavier as
      // stamina drains (and especially near exhaustion), easing back when calm.
      const exerting = (player.sprinting || player.dashActive > 0) && player.grounded;
      const breathIntensity = player.exhausted
        ? 1
        : 1 - player.stamina / PLAYER.staminaMax; // 0 fresh .. 1 empty
      audio.panting(exerting, breathIntensity);

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

      // Ambient creature vocalisations: the arena periodically roars/calls. Each
      // call is distance-attenuated to the player (closer = louder). A predator
      // bearing down on you calls MORE OFTEN and louder + more menacing the
      // nearer it gets; otherwise a random predator/herbivore calls on a relaxed
      // randomised cadence so the valley feels alive without being metronomic.
      // Giant-sauropod footfalls: a low ground-thud on an amble cadence from the
      // nearest live apatosaurus in earshot (T-Rex is silent — padded feet).
      bigStepTimer -= dt;
      if (bigStepTimer <= 0) {
        bigStepTimer = AUDIO.bigStepInterval;
        let nearest = Infinity;
        for (const h of herd) {
          if (h.dead || h.kind !== "apatosaurus") continue;
          const hp = h.dino.root.position;
          const d = Math.hypot(hp.x - pp0.x, hp.z - pp0.z);
          if (d < nearest) nearest = d;
        }
        if (nearest < AUDIO.bigStepRange) {
          audio.bigStep(1 - nearest / AUDIO.bigStepRange);
        }
      }

      vocalTimer -= dt;
      if (vocalTimer <= 0) {
        // Distance attenuation helper: full gain on top of you, fading to a
        // floor by vocalFalloffRange, silent beyond it.
        const gainFor = (d) => {
          if (d >= AUDIO.vocalFalloffRange) return 0;
          const t = 1 - d / AUDIO.vocalFalloffRange;            // 1 near .. 0 far
          return AUDIO.vocalMinGain + (1 - AUDIO.vocalMinGain) * t;
        };
        const trexClosing = chasing != null; // a predator is hunting the player
        if (trexClosing) {
          // Menacing predator vocalisation (its own per-species sound),
          // intensifying with closeness. Faster cadence the nearer it gets.
          const closeness = Math.max(0, 1 - primaryD / TREX.sightRange);
          const enraged = primary.enraged ? 0.3 : 0;
          audio.vocalise(primary.kind, Math.max(AUDIO.vocalMinGain, gainFor(primaryD)),
            Math.min(1, closeness + enraged));
          vocalTimer = AUDIO.vocalNearInterval +
            (1 - closeness) * (AUDIO.vocalIntervalMin - AUDIO.vocalNearInterval);
        } else {
          // Calm arena: pick a random live creature and let it call with its own
          // species sound (T-Rex rumble / herbivore bellow / raptor screech).
          const callers = [];
          for (const p of predators) if (!p.dead) callers.push(p);
          for (const h of herd) if (!h.dead) callers.push(h);
          if (callers.length) {
            const pick = callers[(Math.random() * callers.length) | 0];
            const cp = pick.dino.root.position;
            const d = Math.hypot(cp.x - pp0.x, cp.z - pp0.z);
            const g = gainFor(d);
            if (g > 0) audio.vocalise(pick.kind, g, 0.15);
          }
          vocalTimer = AUDIO.vocalIntervalMin +
            Math.random() * (AUDIO.vocalIntervalMax - AUDIO.vocalIntervalMin);
        }
      }

      // player strike (punch/kick): one clean, frame-rate-independent hit per
      // target per swing. `lastStrikeId` on each target gates it so a single
      // swing lands exactly PLAYER.attackDamage once, no matter the frame rate.
      // Felled herbivores drop meat that heals the player.
      if (player.attacking > 0) {
        // Equipped-weapon modifier (item 6): a melee weapon does MORE damage /
        // longer reach than the bare punch+kick (PLAYER baseline, the fallback).
        const weapon = inventory.equipped();
        const strikeDamage = weapon ? weapon.damage : PLAYER.attackDamage;
        const strikeRange = weapon ? weapon.range : PLAYER.attackRange;
        // `t` may be a glb-backed dino (position at t.dino.root) or the
        // procedural aquatic predator (position at t.root). Read whichever it has.
        const tryStrike = (t) => {
          if (t.dead || t.lastStrikeId === player.strikeId) return;
          const tp = (t.dino ? t.dino.root : t.root).position;
          if (Math.hypot(pPos.x - tp.x, pPos.z - tp.z) < strikeRange) {
            t.lastStrikeId = player.strikeId;
            // FEEDING FRENZY payoff: a T-Rex struck while head-down feeding takes
            // bonus damage — the brave-player punish window. Loud feedback so the
            // player learns the opening pays.
            const feeding = t.feeding > 0;
            t.takeDamage(strikeDamage * (feeding ? TREX.feedVulnMultiplier : 1));
            // Heavy weapons (club, rock-bonk) STAGGER: freeze the predator briefly.
            if (weapon && weapon.stagger) applyStagger(t);
            audio.thud();        // the blow lands: a meaty impact, not a chomp
            if (feeding) {
              hud.popup("FEEDING FRENZY — flank hit!", "good");
              fx.addShake(JUICE.feedHitShake);
            } else if (!player.strikeConnected) {
              player.strikeConnected = true; fx.addShake(JUICE.strikeConnectShake);
            }
          }
        };
        for (const p of predators) tryStrike(p);
        for (const h of herd) tryStrike(h);
        tryStrike(aquatic);   // you CAN fight the lake creature off from the bank
      }

      // HUD — show the most-threatening (nearest live) predator's health
      hud.setHealth(player.health, PLAYER.maxHealth);
      hud.setStamina(player.stamina, PLAYER.staminaMax, player.exhausted);
      hud.setDash(1 - player.dashTimer / PLAYER.dashCooldown);
      hud.setTrex(primary ? primary.health : 0, TREX.maxHealth);
      hud.setSurvival(formatTime(game.elapsed));

      // Death ends the run: show the survival time + score and persist bests
      // (longest survival, highest score).
      if (player.dead) {
        game.over = true;
        audio.stopPanting();
        audio.lose();
        const t = game.elapsed;
        const points = Math.floor(score.points);
        const prev = readBest();
        const isBest = prev == null || t > prev;
        if (isBest) localStorage.setItem(BEST_TIME_KEY, t.toFixed(1));
        const prevScore = readBestScore();
        const bestScore = prevScore == null || points > prevScore;
        if (bestScore) localStorage.setItem(BEST_SCORE_KEY, String(points));
        const bestLine = isBest ? "New best survival! " : `Best: ${formatTime(prev)}. `;
        // Acknowledge a brave run: surviving into dusk earns a flourish.
        const duskTag = world.getDusk() >= DUSK.duskThreshold ? "🌆 You held out into dusk! " : "";
        hud.showBanner("DEVOURED",
          `You survived ${formatTime(t)} · score ${points.toLocaleString()}${bestScore ? " (best!)" : ""}. ${duskTag}${bestLine}Press R to retry.`,
          "lose");
      }

      // compass + timer guide on the objective pill: point at the nearest egg
      // (a heal + stamina top-up is always the next stop on a survival run).
      const pp = player.dino.root.position;
      const t = nearestEgg(eggs, pp);
      if (t) {
        const camFwd = camRig.cam.getForwardRay().direction;
        const camBearing = Math.atan2(camFwd.x, camFwd.z);
        const worldBearing = Math.atan2(t.x - pp.x, t.z - pp.z);
        const heading = worldBearing - camBearing;   // 0 = straight ahead (up)
        hud.setGuide(`Nearest egg · ${formatTime(game.elapsed)}`, heading);
      } else {
        hud.setGuide(`Survive · ${formatTime(game.elapsed)}`, null);
      }
    }

    // radar — updated whenever the game is running (even after death)
    minimap.update(player, predators, herd, eggs, pickups, aquatic);
  });

  // Soft restart — re-rolls a fresh run in place without reloading the page
  // (keeps the loaded GLBs and the unlocked AudioContext).
  const resetGame = () => {
    // dispose any extra predators spawned on later waves (2nd T-Rex + raptor
    // pack); keep the first (the original lone T-Rex)
    while (predators.length > 1) predators.pop().dino.dispose();
    secondSpawned = false;
    packSpawned = false;
    predators.forEach((p) => p.reset());
    herd.forEach((h) => h.reset());
    aquatic.reset();
    eggs.reset();
    pickups.reset();
    inventory.reset();   // empty the backpack + re-scatter the weapons
    tools.reset();
    world.resetDusk();   // fresh run starts in full daylight again
    world.resetThreats(); // abort any in-flight pterosaur dive from the old run
    setDusk(0); hud.setDusk(0); duskAnnounced = false;
    const c = world.heightAt(0, 0);
    player.reset(0, c, 0);
    score.points = 0;
    game.over = false; game.paused = false;
    game.elapsed = 0; game.wave = 0;
    stepTimer = 0; tensionTimer = 0; vocalTimer = AUDIO.vocalIntervalMax;
    hud.setScore(0);
    hud.setSurvival(formatTime(0));
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
    // Hotbar select (item 6): number keys 1..N equip that backpack slot; 0
    // unequips back to bare hands. Re-pressing the equipped slot also unequips.
    if (k >= "1" && k <= "9") inventory.select(parseInt(k, 10) - 1);
    if (k === "0") inventory.unequip();
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
  // camRig exposed so headless harnesses can park/drive the post-processed game
  // camera for verification screenshots.
  window.__game = { engine, scene, game, score, player, predators, herd, aquatic, eggs, pickups, inventory, tools, world, hud, audio, resetGame, camRig };

  return { engine, scene };
}
