import { BEACONS, WATER } from "./config.js";

const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 3;

// Ward beacons: unlit braziers ringed around the arena. The raptor lights one
// by walking up to it. A lit beacon wards predators within `wardRadius` (breaks
// their chase) and casts a warm light that pushes back the dusk gloom. Lighting
// the whole ring fires a one-shot sanctuary bonus. See config.BEACONS.

export function createBeacons(scene, shadow, groundFn) {
  const B = window.BABYLON;

  // Cold (unlit) vs warm (lit) bowl materials.
  const coldMat = new B.StandardMaterial("beaconCold", scene);
  coldMat.diffuseColor = new B.Color3(0.22, 0.22, 0.26);
  coldMat.emissiveColor = new B.Color3(0.04, 0.04, 0.06);
  coldMat.specularColor = new B.Color3(0.1, 0.1, 0.12);

  const warmMat = new B.StandardMaterial("beaconWarm", scene);
  warmMat.diffuseColor = new B.Color3(0.5, 0.32, 0.14);
  warmMat.emissiveColor = new B.Color3(1.0, 0.55, 0.12);
  warmMat.specularColor = new B.Color3(0.9, 0.6, 0.3);

  const stoneMat = new B.StandardMaterial("beaconStone", scene);
  stoneMat.diffuseColor = new B.Color3(0.34, 0.32, 0.3);
  stoneMat.specularColor = B.Color3.Black();

  const beacons = [];
  for (let i = 0; i < BEACONS.count; i++) {
    // Evenly spaced around the ring; nudged off the pond if one lands in it.
    let a = (i / BEACONS.count) * Math.PI * 2 - Math.PI / 2;
    let x = Math.cos(a) * BEACONS.ringRadius;
    let z = Math.sin(a) * BEACONS.ringRadius;
    let guard = 0;
    while (inPond(x, z) && guard++ < 8) {
      a += 0.5;
      x = Math.cos(a) * BEACONS.ringRadius;
      z = Math.sin(a) * BEACONS.ringRadius;
    }
    const gy = groundFn(x, z);

    const root = new B.TransformNode("beacon" + i, scene);
    root.position.set(x, gy, z);

    // Stone plinth + bowl that the fire sits in.
    const plinth = B.MeshBuilder.CreateCylinder("beaconPlinth" + i,
      { height: 1.6, diameterTop: 1.0, diameterBottom: 1.6, tessellation: 8 }, scene);
    plinth.material = stoneMat;
    plinth.position.y = 0.8;
    plinth.parent = root;
    shadow.addShadowCaster(plinth);

    const bowl = B.MeshBuilder.CreateCylinder("beaconBowl" + i,
      { height: 0.7, diameterTop: 1.5, diameterBottom: 0.9, tessellation: 10 }, scene);
    bowl.material = coldMat;
    bowl.position.y = 1.9;
    bowl.parent = root;
    shadow.addShadowCaster(bowl);

    // Warm point light + flame mesh, both disabled until lit.
    const light = new B.PointLight("beaconLight" + i, new B.Vector3(x, gy + 2.4, z), scene);
    light.diffuse = new B.Color3(1.0, 0.62, 0.25);
    light.intensity = 0;
    light.range = BEACONS.lightHeight;
    light.setEnabled(false);

    const flameMat = new B.StandardMaterial("beaconFlame" + i, scene);
    flameMat.emissiveColor = new B.Color3(1.0, 0.55, 0.12);
    flameMat.diffuseColor = new B.Color3(1.0, 0.5, 0.1);
    flameMat.specularColor = B.Color3.Black();
    const flame = B.MeshBuilder.CreateCylinder("beaconFlameMesh" + i,
      { height: 1.4, diameterTop: 0, diameterBottom: 1.0, tessellation: 7 }, scene);
    flame.material = flameMat;
    flame.position.y = 2.7;
    flame.isPickable = false;
    flame.parent = root;
    flame.setEnabled(false);

    beacons.push({ root, bowl, light, flame, x, z, gy, lit: false, fuel: 0 });
  }

  const state = {
    beacons,
    flickerT: 0,
    dusk: 0,              // 0..1, pushed each frame from the game's dusk arc; grows the ward
    onLight: null,        // (position) -> void : a single beacon ignites (fresh light only)
    onSanctuary: null,    // (position) -> void : the whole ring is now lit
    onGutter: null,       // (position) -> void : a lit beacon burned down and went dark
    // True the instant the last beacon lights, so the game fires the bonus once.
    sanctuaryFired: false,

    // Number lit / total, for the HUD.
    get litCount() { return beacons.reduce((n, b) => n + (b.lit ? 1 : 0), 0); },
    // Is any lit beacon guttering (low fuel)? Drives the HUD upkeep warning.
    get anyGuttering() { return beacons.some((b) => b.lit && b.fuel < BEACONS.burnSeconds * BEACONS.lowFuelFrac); },
    // Current dusk-scaled ward radius (shared by warding + radar so they match).
    get wardRadiusNow() { return BEACONS.wardRadius * (1 + BEACONS.wardDuskBonus * state.dusk); },

    setDusk(d) { state.dusk = d; },

    update(dt, player) {
      state.flickerT += dt;
      const pp = player.dino.root.position;
      for (const b of beacons) {
        const d = Math.hypot(pp.x - b.x, pp.z - b.z);
        const inRange = d < BEACONS.lightRange && !player.dead;

        if (!b.lit) {
          // Light on proximity.
          if (inRange) {
            b.lit = true;
            b.fuel = BEACONS.burnSeconds;
            b.bowl.material = warmMat;
            b.light.setEnabled(true);
            b.flame.setEnabled(true);
            if (state.onLight) state.onLight(new B.Vector3(b.x, b.gy + 2.5, b.z));
            // Whole ring lit -> one-shot sanctuary bonus.
            if (!state.sanctuaryFired && state.litCount >= BEACONS.count) {
              state.sanctuaryFired = true;
              if (state.onSanctuary) state.onSanctuary(new B.Vector3(b.x, b.gy + 2.5, b.z));
            }
          }
          continue;
        }

        // Lit: brushing it again tops the fuel back up (free relight, no key).
        if (inRange) b.fuel = BEACONS.burnSeconds;

        // Burn down. When fuel runs out the beacon gutters back to dark.
        b.fuel -= dt;
        if (b.fuel <= 0) {
          b.lit = false;
          b.fuel = 0;
          b.bowl.material = coldMat;
          b.light.setEnabled(false);
          b.light.intensity = 0;
          b.flame.setEnabled(false);
          // Guttering re-opens the sanctuary: relight the ring to re-earn it.
          state.sanctuaryFired = false;
          if (state.onGutter) state.onGutter(new B.Vector3(b.x, b.gy + 2.5, b.z));
          continue;
        }

        // Flame/light size tracks remaining fuel so a dying beacon reads as dying.
        const fuelFrac = b.fuel / BEACONS.burnSeconds;
        // Map fuel 0..1 to a 0.45..1 size band so a low beacon is visibly smaller
        // but never a sliver, then add the alive flicker.
        const size = 0.45 + 0.55 * fuelFrac;
        const fl = size * (0.85 + 0.15 * Math.sin(state.flickerT * 12 + b.x));
        b.light.intensity = 1.3 * fl;
        b.flame.scaling.y = fl;
        b.flame.scaling.x = b.flame.scaling.z = size * (0.9 + 0.1 * Math.sin(state.flickerT * 9 + b.z));
        b.flame.rotation.y += dt * 3;
      }
    },

    // Repel predators sitting inside any lit beacon's dusk-scaled ward: break the
    // chase and refresh a short stagger (the predator's breakChase). Called from
    // the game loop with the live predator list. Mutates predator state.
    wardPredators(predators) {
      const wr = state.wardRadiusNow;
      const wr2 = wr * wr;
      for (const b of beacons) {
        if (!b.lit) continue;
        for (const p of predators) {
          if (p.dead || !p.breakChase) continue;
          const tp = p.dino.root.position;
          if ((tp.x - b.x) ** 2 + (tp.z - b.z) ** 2 < wr2) p.breakChase(BEACONS.wardStagger);
        }
      }
    },

    // Soft restart: snuff every beacon out so the ring is a fresh objective.
    reset() {
      state.sanctuaryFired = false;
      state.dusk = 0;
      for (const b of beacons) {
        b.lit = false;
        b.fuel = 0;
        b.bowl.material = coldMat;
        b.light.setEnabled(false);
        b.light.intensity = 0;
        b.flame.setEnabled(false);
      }
    },
  };
  return state;
}
