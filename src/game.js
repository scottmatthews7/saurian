import { buildWorld } from "./world.js";
import { createPlayer, createFollowCamera } from "./player.js";
import { createTrex, createHerd } from "./ai.js";
import { createEggs } from "./eggs.js";
import { createInput } from "./input.js";
import { createHUD } from "./hud.js";
import { PLAYER, TREX, EGGS } from "./config.js";

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

  hud.setObjective(`Bank ${EGGS.targetToWin} eggs at your nest. Don't get eaten.`);
  hud.showBanner("DINO ARENA", "WASD move · Shift sprint · Space jump · Click/J bite · Reach the nest to bank eggs", "start");
  let started = false;
  const startGameLoop = () => { if (!started) { started = true; hud.hideBanner(); } };
  window.addEventListener("keydown", startGameLoop, { once: true });
  canvas.addEventListener("pointerdown", startGameLoop, { once: true });

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    world.update(dt);
    camRig.update();

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
        hud.showBanner("YOU SURVIVED", `Banked ${eggs.banked} eggs in ${game.elapsed.toFixed(0)}s. Press R to play again.`, "win");
      } else if (player.dead) {
        game.over = true;
        hud.showBanner("DEVOURED", `You lasted ${game.elapsed.toFixed(0)}s and banked ${eggs.banked} eggs. Press R to retry.`, "lose");
      } else if (trex.dead) {
        // killing the trex isn't the goal but it removes the threat — reward note
        hud.setObjective(`T-Rex down! Bank ${EGGS.targetToWin} eggs to win.`);
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && game.over) location.reload();
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  return { engine, scene };
}
