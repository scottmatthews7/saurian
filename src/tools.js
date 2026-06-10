import { TOOLS, ARENA, WATER, OCEAN } from "./config.js";

// PRIMITIVE TOOLS / WEAPONS (wishlist item 6). Owns everything visual + spatial:
//  - procedural weapon meshes (spear / club / rock / torch),
//  - weapons scattered in the world to walk over and collect,
//  - the EQUIPPED weapon shown in the human's hand (parented to the wrist bone)
//    and its swing visual driven off the player's attack window,
//  - thrown-rock projectiles (stagger + chip damage),
//  - torch deterrence (a fear push applied to nearby predators).
//
// The inventory STATE lives in inventory.js; this module renders it and resolves
// the world interactions. Combat damage/range modifiers come from the equipped
// weapon's config (TOOLS.kinds) and are read by the game's strike resolution.

const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 2;
// Keep weapon scatter off the beach + out of the sea (reachable + on land).
const inOcean = (x, z) => x > (OCEAN.shoreX + Math.sin(z * 0.045) * 6 + Math.cos(z * 0.017) * 4);
const offLimits = (x, z) => inPond(x, z) || inOcean(x, z);

// --- procedural weapon mesh builders -------------------------------------
// Each returns a small TransformNode holding the weapon, authored so its grip
// sits near the local origin and its business end points along +Z (so it reads
// when parented to a hand that faces forward). Kept low-poly + flat-shaded to
// match the stylised look and stay cheap.

function makeMaterials(scene) {
  const B = window.BABYLON;
  const wood = new B.StandardMaterial("toolWood", scene);
  wood.diffuseColor = new B.Color3(0.40, 0.27, 0.16);
  wood.specularColor = new B.Color3(0.1, 0.08, 0.05);
  const stone = new B.StandardMaterial("toolStone", scene);
  stone.diffuseColor = new B.Color3(0.55, 0.55, 0.58);
  stone.specularColor = new B.Color3(0.2, 0.2, 0.2);
  const dark = new B.StandardMaterial("toolDark", scene);
  dark.diffuseColor = new B.Color3(0.18, 0.16, 0.14);
  const flame = new B.StandardMaterial("toolFlame", scene);
  flame.diffuseColor = new B.Color3(1.0, 0.55, 0.12);
  flame.emissiveColor = new B.Color3(1.0, 0.5, 0.1);
  return { wood, stone, dark, flame };
}

function buildWeaponMesh(scene, kind, mats) {
  const B = window.BABYLON;
  const node = new B.TransformNode("weapon_" + kind, scene);
  const parts = [];
  if (kind === "spear") {
    const shaft = B.MeshBuilder.CreateCylinder("spearShaft", { height: 2.4, diameter: 0.1 }, scene);
    shaft.rotation.x = Math.PI / 2;       // lie along +Z
    shaft.position.z = 0.9;
    shaft.material = mats.wood;
    const tip = B.MeshBuilder.CreateCylinder("spearTip", { height: 0.5, diameterBottom: 0.22, diameterTop: 0 }, scene);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 2.25;
    tip.material = mats.stone;
    parts.push(shaft, tip);
  } else if (kind === "club") {
    const handle = B.MeshBuilder.CreateCylinder("clubHandle", { height: 1.1, diameter: 0.13 }, scene);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.45;
    handle.material = mats.wood;
    const head = B.MeshBuilder.CreateCylinder("clubHead", { height: 0.8, diameterBottom: 0.42, diameterTop: 0.5 }, scene);
    head.rotation.x = Math.PI / 2;
    head.position.z = 1.25;
    head.material = mats.wood;
    parts.push(handle, head);
  } else if (kind === "rock") {
    const r = B.MeshBuilder.CreateIcoSphere("rock", { radius: 0.34, subdivisions: 1 }, scene);
    r.scaling.set(1, 0.85, 1.1);
    r.material = mats.stone;
    parts.push(r);
  } else if (kind === "torch") {
    const handle = B.MeshBuilder.CreateCylinder("torchHandle", { height: 1.3, diameter: 0.12 }, scene);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.5;
    handle.material = mats.wood;
    const wrap = B.MeshBuilder.CreateCylinder("torchWrap", { height: 0.35, diameter: 0.26 }, scene);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.z = 1.15;
    wrap.material = mats.dark;
    const fire = B.MeshBuilder.CreateCylinder("torchFire", { height: 0.55, diameterBottom: 0.3, diameterTop: 0 }, scene);
    fire.rotation.x = Math.PI / 2;
    fire.position.z = 1.5;
    fire.material = mats.flame;
    fire.isPickable = false;
    node.__fire = fire;   // animated flicker target
    parts.push(handle, wrap, fire);
  }
  parts.forEach((p) => { p.isPickable = false; p.parent = node; });
  node.__parts = parts;
  return node;
}

/**
 * Build the tools system: scattered weapon pickups, the in-hand equipped mesh,
 * thrown-rock projectiles, and torch deterrence.
 *
 * @param {object} scene Babylon scene.
 * @param {object} shadow Shadow generator (pickups cast shadows).
 * @param {function} groundFn (x, z) -> ground height.
 * @param {object} inventory The player's backpack (inventory.js).
 * @returns {object} tools state with update/handToBone/spawnScatter/reset.
 */
export function createTools(scene, shadow, groundFn, inventory) {
  const B = window.BABYLON;
  const mats = makeMaterials(scene);
  const KINDS = Object.keys(TOOLS.kinds);

  // Held/world weapons are modelled at near-real-metre sizes (spear ~2.9u long)
  // but the player is only ~2u tall, so shown raw they dwarf him. Scale every
  // weapon mesh — in hand and on the ground — to ~a third of the player so a
  // club reads as a club (~0.7u), per the owner's "realistic" choice.
  const WEAPON_SCALE = 0.42;

  // --- scattered world pickups ---------------------------------------------
  // One reusable mesh per scatter slot; the kind is re-rolled on spawn/respawn.
  const scatter = [];
  for (let i = 0; i < TOOLS.worldCount; i++) {
    scatter.push({ kind: null, node: null, baseY: 0, active: false, respawnT: 0 });
  }

  const rollScatter = (slot, forceKind) => {
    if (slot.node) { slot.node.dispose(); slot.node = null; }
    const kind = forceKind || KINDS[(Math.random() * KINDS.length) | 0];
    let x, z;
    do {
      const r = 14 + Math.random() * (ARENA.radius - 22);   // mid-field, not on top of spawn, not at the rim
      const a = Math.random() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (offLimits(x, z));
    const node = buildWeaponMesh(scene, kind, mats);
    node.scaling.setAll(WEAPON_SCALE);   // hand-sized on the ground too, not chest-high
    node.__parts.forEach((p) => { if (p.getTotalVertices && p.getTotalVertices() > 0) shadow.addShadowCaster(p); });
    const y = groundFn(x, z) + 0.35;
    node.position.set(x, y, z);
    node.rotation.z = 0.5;        // tilt so it reads as dropped, not floating upright
    slot.kind = kind;
    slot.node = node;
    slot.baseY = y;
    slot.active = true;
    slot.respawnT = 0;
  };
  scatter.forEach((s) => rollScatter(s));

  // --- in-hand equipped mesh -----------------------------------------------
  // A single mesh re-built when the equipped kind changes, attached to the
  // human's right wrist bone (falls back to a root offset if no bone is found).
  let handNode = null;
  let handKind = null;       // kind currently shown in-hand
  let handParent = null;     // the wrist TransformNode (or dino.root) we attach to
  let dinoScale = 1;

  const detachHand = () => {
    if (handNode) { handNode.dispose(); handNode = null; }
    handKind = null;
  };

  // Resolve a parent node for the in-hand mesh: the right-wrist bone's linked
  // TransformNode (glTF skinned rigs expose one), else the dino root.
  const resolveHandParent = (dino) => {
    dinoScale = dino.scale || 1;
    const skel = dino.skeleton;
    if (skel) {
      const bone = skel.bones.find((b) => b.name === "Wrist.R")
        || skel.bones.find((b) => /wrist\.r|hand\.r|wrist|hand/i.test(b.name));
      const tn = bone && bone.getTransformNode ? bone.getTransformNode() : null;
      if (tn) return { node: tn, onBone: true };
    }
    return { node: dino.root, onBone: false };
  };

  const buildHand = (kind, dino) => {
    detachHand();
    if (!kind) return;
    const { node: parent, onBone } = resolveHandParent(dino);
    handParent = parent;
    const mesh = buildWeaponMesh(scene, kind, mats);
    mesh.parent = parent;
    if (onBone) {
      // Counter the wrist bone's ABSOLUTE world scale. The old 1/dinoScale only
      // undid the root height-normalisation, NOT the rig's native bone scale, so
      // weapons came out ~native size (a club as tall as the player). Then size
      // the held weapon to ~a third of the ~2u player (club ~0.7u, spear ~1.2u).
      parent.computeWorldMatrix(true);
      const bs = parent.absoluteScaling;
      const boneScale = (Math.abs(bs.x) + Math.abs(bs.y) + Math.abs(bs.z)) / 3 || 1;
      mesh.scaling.setAll(WEAPON_SCALE / boneScale);
      mesh.position.set(0, 0.05 / boneScale, 0.05 / boneScale);
      mesh.rotation.set(Math.PI * 0.5, 0, 0);
    } else {
      // Root-offset fallback: sit it at the right side, chest height, pointing
      // forward (the human faces +Z in model space).
      mesh.position.set(0.5, 1.1, 0.3);
      mesh.rotation.set(0, 0, -0.3);
    }
    handNode = mesh;
    handKind = kind;
  };

  // --- thrown-rock projectiles ---------------------------------------------
  const PROJ_POOL = 4;
  const projectiles = [];
  for (let i = 0; i < PROJ_POOL; i++) {
    const m = B.MeshBuilder.CreateIcoSphere("thrownRock" + i, { radius: 0.3, subdivisions: 1 }, scene);
    m.material = mats.stone;
    m.isPickable = false;
    m.setEnabled(false);
    projectiles.push({ mesh: m, active: false, vx: 0, vy: 0, vz: 0, life: 0, hitIds: null });
  }

  let throwSeq = 0;   // increments per throw so each projectile lands one hit per target

  // --- swing visual --------------------------------------------------------
  // The equipped weapon arcs through the strike window. Driven off the player's
  // `attacking` timer (1 -> 0 across the swing); a sweep on the wrist's forward
  // axis reads as a swing without touching the rig's punch animation.
  let lastSwingId = -1;

  const state = {
    scatter,
    projectiles,
    onPickup: null,    // (pos, kind) -> void: SFX/FX
    onThrow: null,     // (pos) -> void
    onProjectileHit: null, // (pos) -> void

    // Throw the equipped rock toward the player's facing. Spends one from the
    // backpack. No-op if the equipped weapon isn't throwable.
    throwEquipped(player) {
      const eq = inventory.equipped();
      if (!eq || !eq.throwable) return false;
      const slot = projectiles.find((p) => !p.active);
      if (!slot) return false;
      const pp = player.dino.root.position;
      const yaw = player.facing;
      const dirx = Math.sin(yaw), dirz = Math.cos(yaw);
      slot.active = true;
      slot.life = TOOLS.rockRange / TOOLS.rockSpeed;   // travel time to fall spent
      slot.vx = dirx * TOOLS.rockSpeed;
      slot.vz = dirz * TOOLS.rockSpeed;
      slot.vy = 2;                                     // slight initial lift for the lob arc
      slot.hitIds = ++throwSeq;
      slot.mesh.position.set(pp.x + dirx * 1.2, pp.y + 1.4, pp.z + dirz * 1.2);
      slot.mesh.setEnabled(true);
      inventory.consumeEquipped();
      if (state.onThrow) state.onThrow(slot.mesh.position.clone());
      return true;
    },

    update(dt, player, predators, herd) {
      const pp = player.dino.root.position;
      state.bobT = (state.bobT || 0) + dt;

      // keep the in-hand mesh matching the equipped kind
      const eqKind = inventory.equippedKind();
      if (eqKind !== handKind) buildHand(eqKind, player.dino);

      // SWING: arc the held weapon across the player's attack window. The player
      // increments strikeId per swing; map `attacking` (lock fraction) to a sweep.
      if (handNode) {
        const swinging = player.attacking > 0;
        if (swinging) {
          // 0 at the start of the swing -> 1 at the end
          const t = 1 - player.attacking / 0.45;   // PLAYER.attackLockSeconds
          // overhand sweep: wind up, chop down, settle
          const arc = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
          handNode.__swing = arc;
        } else {
          handNode.__swing = (handNode.__swing || 0) * Math.max(0, 1 - dt * 8);
        }
        const sw = handNode.__swing || 0;
        // apply the sweep as an extra pitch on top of the seated rotation
        const baseX = handParent && handParent !== player.dino.root ? Math.PI * 0.5 : 0;
        handNode.rotation.x = baseX - sw * 1.4;
        // flicker the torch flame
        if (handNode.__fire) {
          const f = 0.85 + 0.3 * Math.sin(state.bobT * 18);
          handNode.__fire.scaling.set(f, 1 + 0.2 * Math.sin(state.bobT * 13), f);
        }
      }

      // --- world pickups: bob, spin, walk-over collect, respawn ---
      for (const s of scatter) {
        if (!s.active) {
          s.respawnT -= dt;
          if (s.respawnT <= 0) rollScatter(s);
          continue;
        }
        s.node.position.y = s.baseY + Math.sin(state.bobT * 2 + s.baseY) * TOOLS.bobHeight;
        s.node.rotation.y += dt * 1.2;
        if (s.node.__fire) {
          const f = 0.85 + 0.3 * Math.sin(state.bobT * 16 + s.baseY);
          s.node.__fire.scaling.set(f, 1 + 0.2 * Math.sin(state.bobT * 11), f);
        }
        if (player.dead) continue;
        const d = Math.hypot(pp.x - s.node.position.x, pp.z - s.node.position.z);
        if (d < TOOLS.pickupRange) {
          if (inventory.add(s.kind)) {
            const pos = s.node.position.clone();
            const kind = s.kind;
            s.active = false;
            s.respawnT = TOOLS.respawnSeconds;
            s.node.setEnabled(false);
            if (state.onPickup) state.onPickup(pos, kind);
          }
          // backpack full: leave it on the ground to grab later
        }
      }

      // --- thrown projectiles: integrate, hit, expire ---
      for (const p of projectiles) {
        if (!p.active) continue;
        p.life -= dt;
        p.vy += TOOLS.rockGravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 9;
        const gy = groundFn(p.mesh.position.x, p.mesh.position.z);
        let spent = p.life <= 0 || p.mesh.position.y <= gy + 0.2;
        // collision against predators (and herbivores) — one hit per target per throw
        const targets = [...(predators || []), ...(herd || [])];
        for (const t of targets) {
          if (t.dead) continue;
          if (t.__lastThrowId === p.hitIds) continue;
          const tp = t.dino.root.position;
          if (Math.hypot(p.mesh.position.x - tp.x, p.mesh.position.z - tp.z) < TOOLS.rockHitRange
              && Math.abs(p.mesh.position.y - (tp.y + 1)) < 3) {
            t.__lastThrowId = p.hitIds;
            t.takeDamage(TOOLS.kinds.rock.damage);
            applyStagger(t);
            if (state.onProjectileHit) state.onProjectileHit(p.mesh.position.clone());
            spent = true;
            break;
          }
        }
        if (spent) { p.active = false; p.mesh.setEnabled(false); }
      }

      // --- torch deterrence: push nearby predators back while a torch is lit ---
      const eq = inventory.equipped();
      if (eq && eq.deter) {
        for (const t of (predators || [])) {
          if (t.dead) continue;
          const tp = t.dino.root.position;
          const dx = tp.x - pp.x, dz = tp.z - pp.z;
          const dd = Math.hypot(dx, dz);
          if (dd > 0.001 && dd < TOOLS.torchDeterRange) {
            const push = TOOLS.torchDeterStrength * (1 - dd / TOOLS.torchDeterRange) * dt;
            tp.x += (dx / dd) * push;
            tp.z += (dz / dd) * push;
          }
        }
      }
    },

    // Tick down any active stagger timers on a target list (called by the game so
    // a single helper owns the freeze; see applyStagger / isStaggered).
    tickStagger(dt, list) {
      for (const t of list) {
        if (t && t.__stagger > 0) t.__stagger = Math.max(0, t.__stagger - dt);
      }
    },

    reset() {
      detachHand();
      for (const p of projectiles) { p.active = false; p.mesh.setEnabled(false); }
      scatter.forEach((s) => rollScatter(s));
    },
  };

  return state;
}

// A struck predator reels: freeze its approach for staggerSeconds. The AI reads
// `__stagger > 0` (via isStaggered) and holds position; the game ticks it down.
export function applyStagger(target) {
  target.__stagger = TOOLS.staggerSeconds;
}

export function isStaggered(target) {
  return (target.__stagger || 0) > 0;
}
