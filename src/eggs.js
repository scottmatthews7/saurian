import { EGGS, ARENA } from "./config.js";

// Glowing collectible eggs scattered in the arena, plus the home nest.
// Player walks over an egg to carry it; returning to the nest banks it.

export function createEggs(scene, shadow, groundFn) {
  const B = window.BABYLON;

  // Nest at centre
  const nest = B.MeshBuilder.CreateTorus("nest", { diameter: 6, thickness: 1.4, tessellation: 18 }, scene);
  nest.position.set(0, groundFn(0, 0) + 0.3, 0);
  const nestMat = new B.StandardMaterial("nestMat", scene);
  nestMat.diffuseColor = new B.Color3(0.4, 0.28, 0.12);
  nestMat.emissiveColor = new B.Color3(0.15, 0.1, 0.03);
  nest.material = nestMat;
  shadow.addShadowCaster(nest);

  const eggMat = new B.StandardMaterial("eggMat", scene);
  eggMat.diffuseColor = new B.Color3(0.95, 0.9, 0.75);
  eggMat.emissiveColor = new B.Color3(0.5, 0.45, 0.2).scale(EGGS.glowIntensity);
  eggMat.specularColor = new B.Color3(0.6, 0.6, 0.5);

  const eggs = [];
  for (let i = 0; i < EGGS.count; i++) {
    const r = 20 + Math.random() * (ARENA.radius - 26);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const mesh = B.MeshBuilder.CreateSphere("egg" + i, { diameterX: 1, diameterY: 1.4, diameterZ: 1 }, scene);
    mesh.material = eggMat;
    const baseY = groundFn(x, z) + 0.9;
    mesh.position.set(x, baseY, z);
    shadow.addShadowCaster(mesh);

    // glow light
    const light = new B.PointLight("eggLight" + i, mesh.position.clone(), scene);
    light.diffuse = new B.Color3(1, 0.9, 0.5);
    light.intensity = 0.6;
    light.range = 10;

    eggs.push({ mesh, light, baseY, collected: false, banked: false });
  }

  const state = {
    nest, eggs,
    carrying: 0,
    banked: 0,
    bobT: 0,
    onPickup: null,   // (position) -> void, set by game for SFX/FX
    onBank: null,     // (count) -> void
    update(dt, player) {
      state.bobT += dt;
      const pp = player.dino.root.position;
      for (let i = 0; i < eggs.length; i++) {
        const e = eggs[i];
        if (e.banked) continue;
        if (!e.collected) {
          e.mesh.position.y = e.baseY + Math.sin(state.bobT * 2 + i) * EGGS.bobHeight;
          e.mesh.rotation.y += dt;
          e.light.position.copyFrom(e.mesh.position);
          const d = Math.hypot(pp.x - e.mesh.position.x, pp.z - e.mesh.position.z);
          if (d < EGGS.pickupRange && !player.dead) {
            e.collected = true;
            e.mesh.setEnabled(false);
            e.light.setEnabled(false);
            state.carrying++;
            if (state.onPickup) state.onPickup(e.mesh.position.clone());
          }
        }
      }
      // bank when near nest
      if (state.carrying > 0) {
        const dn = Math.hypot(pp.x, pp.z);
        if (dn < 5) {
          const n = state.carrying;
          state.banked += n;
          state.carrying = 0;
          if (state.onBank) state.onBank(n);
        }
      }
    },
    remaining() { return eggs.filter((e) => !e.collected && !e.banked).length; },
  };
  return state;
}
