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

console.log("config sanity:");
check("ward radius is a local pocket, not arena-wide", BEACONS.wardRadius < ARENA.radius / 2,
  `ward=${BEACONS.wardRadius} arena/2=${ARENA.radius / 2}`);
check("ring sits between the nest and the rim",
  BEACONS.ringRadius > 10 && BEACONS.ringRadius < ARENA.radius);
check("sanctuary heal + score are positive payoffs",
  BEACONS.sanctuaryHeal > 0 && BEACONS.sanctuaryScore > 0);

console.log(failures === 0 ? "\nALL BEACON TESTS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
