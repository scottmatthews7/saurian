import { PICKUPS } from "./config.js";

// Meat pickups dropped by herbivores the raptor bites down. Walking over one
// heals the player and despawns it. Pooled so spawning never allocates meshes
// mid-game. A glowing red ember bob distinguishes meat from eggs.

export function createPickups(scene, shadow, groundFn) {
  const B = window.BABYLON;

  const meatMat = new B.StandardMaterial("meatMat", scene);
  meatMat.diffuseColor = new B.Color3(0.7, 0.18, 0.16);
  meatMat.emissiveColor = new B.Color3(0.35, 0.05, 0.04);
  meatMat.specularColor = new B.Color3(0.4, 0.2, 0.2);

  // a modest pool — at most a handful of meat lying around at once
  const POOL = 8;
  const items = [];
  for (let i = 0; i < POOL; i++) {
    const mesh = B.MeshBuilder.CreateSphere("meat" + i,
      { diameterX: 0.9, diameterY: 0.6, diameterZ: 0.7, segments: 8 }, scene);
    mesh.material = meatMat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    shadow.addShadowCaster(mesh);
    items.push({ mesh, active: false, baseY: 0, life: 0 });
  }

  const state = {
    items,
    bobT: 0,
    onHeal: null,   // (position) -> void, set by game for SFX/FX
    spawn(x, z) {
      const slot = items.find((it) => !it.active);
      if (!slot) return false;
      const y = groundFn(x, z) + 0.5;
      slot.active = true;
      slot.baseY = y;
      slot.life = PICKUPS.meatLifetime;
      slot.mesh.position.set(x, y, z);
      slot.mesh.setEnabled(true);
      return true;
    },
    update(dt, player) {
      state.bobT += dt;
      const pp = player.dino.root.position;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.active) continue;
        it.life -= dt;
        if (it.life <= 0) { it.active = false; it.mesh.setEnabled(false); continue; }
        it.mesh.position.y = it.baseY + Math.sin(state.bobT * 3 + i) * 0.15;
        it.mesh.rotation.y += dt * 1.5;
        // fade-flicker as it nears expiry
        it.mesh.visibility = it.life < 4 ? 0.5 + 0.5 * Math.sin(state.bobT * 12) : 1;
        if (player.dead) continue;
        const d = Math.hypot(pp.x - it.mesh.position.x, pp.z - it.mesh.position.z);
        if (d < PICKUPS.meatRange && player.health < player.maxHealthValue) {
          it.active = false;
          it.mesh.setEnabled(false);
          player.heal(PICKUPS.meatHeal);
          if (state.onHeal) state.onHeal(it.mesh.position.clone());
        }
      }
    },
  };
  return state;
}
