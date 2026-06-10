// Headless logic test for WARD BEACONS (session 10). No Babylon — mirrors the
// pure rules in beacons.js: proximity lighting, the ward-radius predator check,
// the all-lit sanctuary trigger, and config sanity. Run: node tools/beacons_test.mjs

import { BEACONS, WATER, ARENA } from "../src/config.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}

// --- mirror of beacons.js ring placement (with pond nudge) ------------------
const inPond = (x, z) => Math.hypot(x - WATER.centerX, z - WATER.centerZ) < WATER.radius + 3;
function placeRing() {
  const out = [];
  for (let i = 0; i < BEACONS.count; i++) {
    let a = (i / BEACONS.count) * Math.PI * 2 - Math.PI / 2;
    let x = Math.cos(a) * BEACONS.ringRadius, z = Math.sin(a) * BEACONS.ringRadius;
    let guard = 0;
    while (inPond(x, z) && guard++ < 8) { a += 0.5; x = Math.cos(a) * BEACONS.ringRadius; z = Math.sin(a) * BEACONS.ringRadius; }
    out.push({ x, z, lit: false });
  }
  return out;
}

// pure rule mirrors
const canLight = (b, px, pz) => Math.hypot(px - b.x, pz - b.z) < BEACONS.lightRange;
const inWard = (b, tx, tz) => (tx - b.x) ** 2 + (tz - b.z) ** 2 < BEACONS.wardRadius ** 2;

console.log("placement:");
const ring = placeRing();
check("spawns the configured number of beacons", ring.length === BEACONS.count);
check("all beacons sit inside the arena", ring.every((b) => Math.hypot(b.x, b.z) < ARENA.radius - 2),
  ring.map((b) => Math.hypot(b.x, b.z).toFixed(1)).join(","));
check("no beacon sits in the pond", ring.every((b) => !inPond(b.x, b.z)));
check("beacons are spread apart (not stacked)",
  (() => { for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++)
    if (Math.hypot(ring[i].x - ring[j].x, ring[i].z - ring[j].z) < BEACONS.ringRadius) return false; return true; })());

console.log("lighting (proximity):");
check("a beacon lights when the raptor is within lightRange",
  canLight(ring[0], ring[0].x + BEACONS.lightRange - 1, ring[0].z));
check("a beacon does NOT light from beyond lightRange",
  !canLight(ring[0], ring[0].x + BEACONS.lightRange + 1, ring[0].z));

console.log("ward:");
check("a predator inside wardRadius is warded",
  inWard(ring[0], ring[0].x + BEACONS.wardRadius - 1, ring[0].z));
check("a predator beyond wardRadius is not warded",
  !inWard(ring[0], ring[0].x + BEACONS.wardRadius + 1, ring[0].z));

console.log("sanctuary (all-lit, one-shot):");
(() => {
  const bs = placeRing();
  let fired = 0;
  const litCount = () => bs.reduce((n, b) => n + (b.lit ? 1 : 0), 0);
  const tryFire = () => { if (fired === 0 && litCount() >= BEACONS.count) fired = litCount(); };
  bs[0].lit = true; tryFire();
  check("sanctuary does not fire before the whole ring is lit", fired === 0, `fired=${fired}`);
  bs[1].lit = true; tryFire();
  bs[2].lit = true; tryFire();
  check("sanctuary fires exactly when all beacons are lit", fired === BEACONS.count);
})();

console.log("upkeep (burn down / relight / dusk ward — session 11):");
(() => {
  // Mirror beacons.js: a lit beacon holds `fuel` seconds, drains by dt, gutters
  // out at <=0; brushing within lightRange tops fuel back to full.
  const b = { lit: true, fuel: BEACONS.burnSeconds, x: 0, z: 0 };
  const step = (dt, px, pz) => {
    const inRange = Math.hypot(px - b.x, pz - b.z) < BEACONS.lightRange;
    if (inRange) b.fuel = BEACONS.burnSeconds;
    b.fuel -= dt;
    if (b.fuel <= 0) { b.lit = false; b.fuel = 0; }
  };
  // Burn most of the way down without brushing.
  for (let t = 0; t < BEACONS.burnSeconds - 1; t++) step(1, 999, 999);
  check("a lit beacon is still lit just before its fuel runs out", b.lit, `fuel=${b.fuel.toFixed(1)}`);
  check("the beacon reads as guttering on low fuel",
    b.fuel < BEACONS.burnSeconds * BEACONS.lowFuelFrac);
  // Brush it -> tops back to full.
  step(0, b.x, b.z);
  check("brushing a lit beacon refuels it to full", b.fuel === BEACONS.burnSeconds);
  // Now let it run all the way out.
  for (let t = 0; t < BEACONS.burnSeconds + 1; t++) step(1, 999, 999);
  check("a beacon gutters out once fuel is exhausted", !b.lit && b.fuel === 0);
})();

(() => {
  // Dusk-scaled ward: radius = base * (1 + wardDuskBonus * dusk).
  const wardAt = (dusk) => BEACONS.wardRadius * (1 + BEACONS.wardDuskBonus * dusk);
  check("ward radius equals the base in full daylight", wardAt(0) === BEACONS.wardRadius);
  check("ward radius grows at dusk", wardAt(1) > wardAt(0));
  check("deepest-dusk ward = base * (1 + wardDuskBonus)",
    Math.abs(wardAt(1) - BEACONS.wardRadius * (1 + BEACONS.wardDuskBonus)) < 1e-9);
})();

console.log("config sanity:");
check("ward radius is a local pocket, not arena-wide", BEACONS.wardRadius < ARENA.radius / 2,
  `ward=${BEACONS.wardRadius} arena/2=${ARENA.radius / 2}`);
check("ring sits between the nest and the rim",
  BEACONS.ringRadius > 10 && BEACONS.ringRadius < ARENA.radius);
check("sanctuary heal + score are positive payoffs",
  BEACONS.sanctuaryHeal > 0 && BEACONS.sanctuaryScore > 0);
check("burn time outlasts a generous round-trip but is finite",
  BEACONS.burnSeconds > 10 && BEACONS.burnSeconds < 600);
check("low-fuel fraction is a sensible warning band",
  BEACONS.lowFuelFrac > 0 && BEACONS.lowFuelFrac < 0.5);

console.log(failures === 0 ? "\nALL BEACON TESTS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
