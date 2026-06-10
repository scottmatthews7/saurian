// Headless logic test for the CURSED egg (session 8). No Babylon — mirrors the
// pure rules in eggs.js (roll classification, value/counts) and ai.js (the lure
// adding cursedLureSpeed to the chase). Keeps the mechanic honest without
// relying on screenshots. Run:  node tools/cursed_egg_test.mjs

import { EGGS, TREX } from "../src/config.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}

// --- mirror of eggs.js rollEgg classification (golden wins the tie) ---------
function classify(goldRoll, cursedRoll) {
  const golden = goldRoll < EGGS.goldenChance;
  const cursed = !golden && cursedRoll < EGGS.cursedChance;
  return { golden, cursed };
}
function valueOf(e) { return e.golden ? EGGS.goldenValueMul : e.cursed ? EGGS.cursedValueMul : 1; }
function countsOf(e) { return e.golden ? EGGS.goldenCounts : e.cursed ? EGGS.cursedCounts : 1; }

console.log("classification:");
check("a low golden roll is golden, never cursed",
  (() => { const e = classify(0, 0); return e.golden && !e.cursed; })());
check("golden and cursed are mutually exclusive (golden wins tie)",
  (() => { const e = classify(0.0, 0.0); return !(e.golden && e.cursed); })());
check("not-golden + low cursed roll is cursed",
  (() => { const e = classify(0.99, 0); return !e.golden && e.cursed; })());
check("high rolls are a plain egg",
  (() => { const e = classify(0.99, 0.99); return !e.golden && !e.cursed; })());

console.log("value / counts:");
check("cursed egg is the biggest score multiplier",
  EGGS.cursedValueMul > EGGS.goldenValueMul && EGGS.cursedValueMul > 1,
  `cursed=${EGGS.cursedValueMul} golden=${EGGS.goldenValueMul}`);
check("cursed value pulled from config (6x)", valueOf({ cursed: true }) === EGGS.cursedValueMul);
check("cursed counts only 1 toward the win target (bravado, not progress)",
  countsOf({ cursed: true }) === 1 && EGGS.cursedCounts === 1);

console.log("lure speed (mirror of ai.js chase term):");
const lureSpeed = TREX.chaseSpeed + EGGS.cursedLureSpeed;   // no dusk/enrage/ramp
check("carrying a cursed egg speeds the base chase",
  lureSpeed > TREX.chaseSpeed, `${lureSpeed} vs ${TREX.chaseSpeed}`);
check("the lure speed bonus is a positive, modest nudge",
  EGGS.cursedLureSpeed > 0 && EGGS.cursedLureSpeed < TREX.chaseSpeed);

console.log(failures === 0 ? "\nALL CURSED-EGG TESTS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
