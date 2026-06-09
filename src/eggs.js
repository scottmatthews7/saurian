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

  // Carried-egg visuals: a small pool of glowing eggs that hover above the
  // raptor's back while carrying, so the load is visible, not just a HUD count.
  const carriedVisuals = [];
  for (let i = 0; i < EGGS.count; i++) {
    const cv = B.MeshBuilder.CreateSphere("carry" + i, { diameterX: 0.6, diameterY: 0.85, diameterZ: 0.6 }, scene);
    cv.material = eggMat;
    cv.isPickable = false;
    cv.setEnabled(false);
    carriedVisuals.push(cv);
  }

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
    carried: [],      // stack of carried egg indices (length === carrying)
    get carrying() { return state.carried.length; },
    banked: 0,
    bobT: 0,
    onPickup: null,   // (position) -> void, set by game for SFX/FX
    onBank: null,     // (count) -> void
    onDrop: null,     // (position) -> void
    update(dt, player) {
      state.bobT += dt;
      const pp = player.dino.root.position;
      for (let i = 0; i < eggs.length; i++) {
        const e = eggs[i];
        if (e.banked || e.collected) continue;
        e.mesh.position.y = e.baseY + Math.sin(state.bobT * 2 + i) * EGGS.bobHeight;
        e.mesh.rotation.y += dt;
        e.light.position.copyFrom(e.mesh.position);
        const d = Math.hypot(pp.x - e.mesh.position.x, pp.z - e.mesh.position.z);
        if (d < EGGS.pickupRange && !player.dead) {
          e.collected = true;
          e.mesh.setEnabled(false);
          e.light.setEnabled(false);
          state.carried.push(i);
          if (state.onPickup) state.onPickup(e.mesh.position.clone());
        }
      }
      // bank when near nest
      if (state.carried.length > 0) {
        const dn = Math.hypot(pp.x, pp.z);
        if (dn < 5) {
          const n = state.carried.length;
          state.banked += n;
          state.carried.forEach((idx) => { eggs[idx].banked = true; });
          state.carried = [];
          if (state.onBank) state.onBank(n);
        }
      }

      // position the carried-egg visuals hovering over the raptor's back
      const n = state.carried.length;
      const yaw = player.facing || 0;
      const backX = -Math.sin(yaw), backZ = -Math.cos(yaw); // behind the dino
      for (let k = 0; k < carriedVisuals.length; k++) {
        const cv = carriedVisuals[k];
        if (k >= n) { if (cv.isEnabled()) cv.setEnabled(false); continue; }
        if (!cv.isEnabled()) cv.setEnabled(true);
        const tier = Math.floor(k / 2);
        const side = (k % 2 === 0 ? -0.35 : 0.35);
        cv.position.set(
          pp.x + backX * (0.4 + tier * 0.45) + Math.cos(yaw) * side,
          pp.y + 1.6 + tier * 0.5 + Math.sin(state.bobT * 4 + k) * 0.08,
          pp.z + backZ * (0.4 + tier * 0.45) - Math.sin(yaw) * side,
        );
        cv.rotation.y += dt * 1.5;
      }
    },
    // Drop one carried egg back into the world near a position (on a hit).
    dropCarried(position, groundY) {
      const idx = state.carried.pop();
      if (idx === undefined) return false;
      const e = eggs[idx];
      const a = Math.random() * Math.PI * 2;
      const x = position.x + Math.cos(a) * 3, z = position.z + Math.sin(a) * 3;
      e.collected = false;
      e.baseY = (groundY != null ? groundY : position.y) + 0.9;
      e.mesh.position.set(x, e.baseY, z);
      e.light.position.copyFrom(e.mesh.position);
      e.mesh.setEnabled(true);
      e.light.setEnabled(true);
      if (state.onDrop) state.onDrop(e.mesh.position.clone());
      return true;
    },
    remaining() { return eggs.filter((e) => !e.collected && !e.banked).length; },
  };
  return state;
}
