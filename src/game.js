import { buildWorld } from "./world.js";
import { createPlayer, createFollowCamera } from "./player.js";
import { createTrex, createHerd } from "./ai.js";
import { createEggs } from "./eggs.js";
import { createInput } from "./input.js";
import { createHUD } from "./hud.js";
import { createAudio } from "./audio.js";
import { createFx } from "./fx.js";
import { createMinimap } from "./minimap.js";
import { PLAYER, TREX, EGGS, JUICE } from "./config.js";

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

  const input = createInput(canvas);
  const hud = createHUD();
  const audio = createAudio();
  const fx = createFx(scene);
  const minimap = createMinimap();

  setLoad("Hatching the raptor…");
  const player = await createPlayer(scene, world.shadow, input);
  player.setGroundFn(world.heightAt);
  player.dino.root.position.y = world.heightAt(0, 0);

  const camRig = createFollowCamera(scene, player);

  setLoad("Waking the T-Rex…");
  const trex = await createTrex(scene, world.shadow, world.heightAt);

  setLoad("Releasing the herd…");
  const herd = await createHerd(scene, world.shadow, world.heightAt);

  setLoad("Scattering eggs…");
  const eggs = createEggs(scene, world.shadow, world.heightAt);

  // --- wire feedback callbacks (audio + particles + screen shake) ---
  const B2 = window.BABYLON;
  eggs.onPickup = (pos) => { audio.pickup(); fx.pickupBurst(pos, new B2.Color4(1, 0.9, 0.5, 1)); };
  eggs.onBank = () => { audio.bank(); fx.pickupBurst(eggs.nest.position, new B2.Color4(0.5, 1, 0.6, 1)); };
  player.onAttack = () => audio.bite();
  trex.onBite = () => { audio.hurt(); fx.addShake(JUICE.camShakeOnHit); };
  trex.onRoar = () => audio.roar();

  // mute toggle (button + M key)
  hud.onMuteClick(() => hud.setMuteLabel(audio.toggleMute()));
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") hud.setMuteLabel(audio.toggleMute());
  });
  hud.setMuteLabel(audio.muted);

  // post-processing: subtle bloom + tonemapping for "decent visuals"
  const pipeline = new B.DefaultRenderingPipeline("pipe", true, scene, [camRig.cam]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.75;
  pipeline.bloomWeight = 0.35;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.contrast = 1.15;
  pipeline.imageProcessing.exposure = 1.05;
  pipeline.fxaaEnabled = true;

  if (loadingEl) loadingEl.style.display = "none";

  // --- game state ---
  const game = {
    over: false,
    won: false,
    elapsed: 0,
    wave: 0,
  };
  // Footstep cadence reuses the dust interval so puffs and thuds stay in sync.
  const STEP_INTERVAL = JUICE.dustInterval;
  let stepTimer = 0;

  hud.setObjective(`Bank ${EGGS.targetToWin} eggs at your nest. Don't get eaten.`);
  hud.showBanner("DINO ARENA", "WASD move · Shift sprint · Space jump · Click/J bite · M mute · Reach the nest to bank eggs", "start");
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

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    world.update(dt);
    const shake = fx.updateShake(dt);
    camRig.update(shake);

    if (!started) return;

    if (!game.over) {
      game.elapsed += dt;
      // difficulty ramp: every 30s the trex gets a bit faster
      const wave = Math.floor(game.elapsed / 30);
      if (wave > game.wave) { game.wave = wave; trex.speedBonus = wave * TREX.chaseSpeedRamp; }

      player.update(dt);
      trex.update(dt, player);
      herd.forEach((h) => h.update(dt, player, trex));
      eggs.update(dt, player);

      // footstep dust + sound while running on the ground
      const pPos = player.dino.root.position;
      fx.footDust(dt, pPos, player.moving && player.grounded);
      if (player.sprinting && player.grounded) {
        stepTimer -= dt;
        if (stepTimer <= 0) { stepTimer = STEP_INTERVAL; audio.step(); }
      }

      // player bite can damage the trex if close + facing
      if (player.attacking > 0.3 && !trex.dead) {
        const pp = player.dino.root.position, tp = trex.dino.root.position;
        if (Math.hypot(pp.x - tp.x, pp.z - tp.z) < PLAYER.attackRange) {
          trex.takeDamage(PLAYER.attackDamage * dt * 3); // sustained over the bite window
        }
      }

      // HUD
      hud.setHealth(player.health, PLAYER.maxHealth);
      hud.setTrex(trex.health, TREX.maxHealth);
      hud.setEggs(eggs.banked, EGGS.targetToWin, eggs.carrying, eggs.remaining());

      // win / lose
      if (eggs.banked >= EGGS.targetToWin) {
        game.over = true; game.won = true;
        audio.win();
        hud.showBanner("YOU SURVIVED", `Banked ${eggs.banked} eggs in ${game.elapsed.toFixed(0)}s. Press R to play again.`, "win");
      } else if (player.dead) {
        game.over = true;
        audio.lose();
        hud.showBanner("DEVOURED", `You lasted ${game.elapsed.toFixed(0)}s and banked ${eggs.banked} eggs. Press R to retry.`, "lose");
      } else if (trex.dead) {
        // killing the trex isn't the goal but it removes the threat — reward note
        hud.setObjective(`T-Rex down! Bank ${EGGS.targetToWin} eggs to win.`);
      }
    }

    // radar — updated whenever the game is running (even after win/lose)
    minimap.update(player, trex, herd, eggs);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && game.over) location.reload();
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  return { engine, scene };
}
