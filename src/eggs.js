import { EGGS, ARENA, WATER } from "./config.js";

const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 2;

// CONSUMABLE egg pickups scattered in the arena (the old return-to-nest
// banking loop is gone). Walking over an egg eats it on the spot: health +
// stamina restored (golden eggs are a bigger boost; see config.EGGS). A
// consumed egg respawns somewhere fresh after EGGS.respawnSeconds so a long
// survival run never empties the valley.

export function createEggs(scene, shadow, groundFn) {
  const B = window.BABYLON;

  const eggMat = new B.StandardMaterial("eggMat", scene);
  eggMat.diffuseColor = new B.Color3(0.95, 0.9, 0.75);
  eggMat.emissiveColor = new B.Color3(0.5, 0.45, 0.2).scale(EGGS.glowIntensity);
  eggMat.specularColor = new B.Color3(0.6, 0.6, 0.5);

  // Golden egg material — brighter, warmer, with a stronger glow.
  const goldMat = new B.StandardMaterial("goldEggMat", scene);
  goldMat.diffuseColor = new B.Color3(1.0, 0.82, 0.25);
  goldMat.emissiveColor = new B.Color3(1.0, 0.75, 0.15).scale(EGGS.glowIntensity);
  goldMat.specularColor = new B.Color3(1.0, 0.9, 0.5);

  // Roll a fresh spawn for an egg slot: golden-ness, position, material, light.
  // Used at creation, on respawn, and on a soft restart.
  const rollEgg = (e) => {
    const golden = Math.random() < EGGS.goldenChance;
    let x, z;
    do {
      // Golden eggs scatter far out (a risk/reward run); ordinary ones anywhere
      // in the mid-field. Never in the pond.
      const r = golden
        ? ARENA.radius - 20 + Math.random() * 12
        : 20 + Math.random() * (ARENA.radius - 26);
      const a = Math.random() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (inPond(x, z));
    e.golden = golden;
    e.collected = false;
    e.respawnT = 0;
    e.baseY = groundFn(x, z) + 0.9;
    e.mesh.material = golden ? goldMat : eggMat;
    e.mesh.scaling.setAll(golden ? 1.25 : 1);
    e.mesh.position.set(x, e.baseY, z);
    e.mesh.setEnabled(true);
    e.light.diffuse = golden ? new B.Color3(1, 0.8, 0.3) : new B.Color3(1, 0.9, 0.5);
    e.light.intensity = golden ? 1.0 : 0.6;
    e.light.range = golden ? 14 : 10;
    e.light.position.copyFrom(e.mesh.position);
    e.light.setEnabled(true);
  };

  const eggs = [];
  for (let i = 0; i < EGGS.count; i++) {
    const mesh = B.MeshBuilder.CreateSphere("egg" + i, { diameterX: 1, diameterY: 1.4, diameterZ: 1 }, scene);
    shadow.addShadowCaster(mesh);
    const light = new B.PointLight("eggLight" + i, B.Vector3.Zero(), scene);
    const e = { mesh, light, baseY: 0, golden: false, collected: false, respawnT: 0 };
    rollEgg(e);
    eggs.push(e);
  }

  const state = {
    eggs,
    bobT: 0,
    onPickup: null,   // (position, golden) -> void, set by game for SFX/FX/score
    update(dt, player) {
      state.bobT += dt;
      const pp = player.dino.root.position;
      for (let i = 0; i < eggs.length; i++) {
        const e = eggs[i];
        if (e.collected) {
          // Respawn countdown: re-roll the slot somewhere fresh when it lapses.
          e.respawnT -= dt;
          if (e.respawnT <= 0) rollEgg(e);
          continue;
        }
        const bob = e.golden ? EGGS.bobHeight * 1.5 : EGGS.bobHeight;
        e.mesh.position.y = e.baseY + Math.sin(state.bobT * 2 + i) * bob;
        e.mesh.rotation.y += dt * (e.golden ? 1.6 : 1);
        e.light.position.copyFrom(e.mesh.position);
        if (e.golden) e.light.intensity = 0.85 + 0.35 * Math.sin(state.bobT * 4 + i);
        const d = Math.hypot(pp.x - e.mesh.position.x, pp.z - e.mesh.position.z);
        if (d < EGGS.pickupRange && !player.dead) {
          e.collected = true;
          e.respawnT = EGGS.respawnSeconds;
          e.mesh.setEnabled(false);
          e.light.setEnabled(false);
          // Eat it on the spot: health + stamina back (golden = bigger boost).
          player.heal(e.golden ? EGGS.goldenHeal : EGGS.heal);
          player.restoreStamina(e.golden ? EGGS.goldenStamina : EGGS.stamina);
          if (state.onPickup) state.onPickup(e.mesh.position.clone(), e.golden);
        }
      }
    },
    remaining() { return eggs.filter((e) => !e.collected).length; },
    // Soft restart: re-roll every egg so each run scatters anew.
    reset() {
      eggs.forEach(rollEgg);
    },
  };
  return state;
}
