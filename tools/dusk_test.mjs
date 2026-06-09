// Headless logic test for the run-scoped dusk arc and the boldness it grants.
// No Babylon needed — mirrors the pure math in world.js (dusk factor) and
// ai.js (how dusk blends the T-Rex sight/lose/speed and herbivore flee). Run:
//   node tools/dusk_test.mjs
// Keeps the day/night *gameplay* mechanic honest without relying on screenshots.

import { DUSK, TREX, HERBIVORE } from "../src/config.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// --- mirror of world.js dusk factor (smoothstep ramp over the run) ----------
function duskFactorAt(runSeconds) {
  const raw = (runSeconds - DUSK.startSeconds) /
    Math.max(0.001, DUSK.fullDuskSeconds - DUSK.startSeconds);
  const c = Math.min(1, Math.max(0, raw));
  return c * c * (3 - 2 * c);
}

// --- mirror of ai.js dusk-blended boldness ----------------------------------
const trexSight = (f) => TREX.sightRange + DUSK.trexSightBonus * f;
const trexLose = (f) => TREX.loseInterestRange + DUSK.trexLoseBonus * f;
const trexSpeed = (f) => TREX.chaseSpeed + DUSK.trexSpeedBonus * f;
const herbFlee = (f) => HERBIVORE.fleeRange + DUSK.herbFleeBonus * f;

console.log("dusk arc:");
check("full daylight at run start", approx(duskFactorAt(0), 0));
check("still full daylight through the grace window",
  approx(duskFactorAt(DUSK.startSeconds), 0));
check("deepest dusk at fullDuskSeconds", approx(duskFactorAt(DUSK.fullDuskSeconds), 1));
check("stays at deepest dusk after fullDuskSeconds",
  approx(duskFactorAt(DUSK.fullDuskSeconds + 60), 1));
const mid = duskFactorAt((DUSK.startSeconds + DUSK.fullDuskSeconds) / 2);
check("monotonic & mid-run is partway (smoothstep midpoint = 0.5)", approx(mid, 0.5, 1e-6));
// monotonic increase sample
let prev = -1, mono = true;
for (let s = 0; s <= DUSK.fullDuskSeconds + 10; s += 2) {
  const f = duskFactorAt(s);
  if (f < prev - 1e-9) mono = false;
  prev = f;
}
check("dusk factor never decreases over a run", mono);

console.log("predator boldness (day -> dusk):");
check("T-Rex sees further at dusk", trexSight(1) > trexSight(0),
  `${trexSight(0)} -> ${trexSight(1)}`);
check("T-Rex loses interest later at dusk", trexLose(1) > trexLose(0),
  `${trexLose(0)} -> ${trexLose(1)}`);
check("T-Rex chases faster at dusk", trexSpeed(1) > trexSpeed(0),
  `${trexSpeed(0)} -> ${trexSpeed(1)}`);
check("herd spooks from further at dusk", herbFlee(1) > herbFlee(0),
  `${herbFlee(0)} -> ${herbFlee(1)}`);
check("no boldness bonus in full daylight",
  approx(trexSight(0), TREX.sightRange) && approx(trexSpeed(0), TREX.chaseSpeed));
// sight must stay below lose-interest at every dusk level (no flicker)
let sightOk = true;
for (let f = 0; f <= 1.0001; f += 0.05) if (trexSight(f) >= trexLose(f)) sightOk = false;
check("sight range stays below lose-interest at all dusk levels", sightOk);

console.log("light floor:");
const lightAt = (f) => 1 * (1 - (1 - DUSK.minLight) * f); // ambientDay=1 (noon)
check("never darker than minLight floor", approx(lightAt(1), DUSK.minLight),
  `floor=${DUSK.minLight}, got ${lightAt(1)}`);
check("dusk announce threshold inside (0,1)",
  DUSK.duskThreshold > 0 && DUSK.duskThreshold < 1);

console.log(failures === 0 ? "\nALL DUSK TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
