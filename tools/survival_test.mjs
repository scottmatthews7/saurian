// Headless logic test for the SURVIVAL objective (objectives simplified —
// wishlist item 11): consumable eggs + the time/pickup/close-call score
// economy. No Babylon needed — checks the config invariants the gameplay
// rests on, plus the time-score accrual maths mirrored from game.js. Run:
//   node tools/survival_test.mjs

import { EGGS, SCORE, DUSK, PICKUPS, PLAYER } from "../src/config.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

console.log("consumable eggs (heal + stamina economy):");
check("an ordinary egg heals, but less than a meat (eggs are free, meat needs a kill)",
  EGGS.heal > 0 && EGGS.heal < PICKUPS.meatHeal,
  `egg=${EGGS.heal} meat=${PICKUPS.meatHeal}`);
check("a golden egg out-heals meat (the rare premium pickup)",
  EGGS.goldenHeal > PICKUPS.meatHeal,
  `golden=${EGGS.goldenHeal} meat=${PICKUPS.meatHeal}`);
check("egg heals never overshoot max health",
  EGGS.heal <= PLAYER.maxHealth && EGGS.goldenHeal <= PLAYER.maxHealth);
check("an ordinary egg's stamina sip is below a dash's cost (doesn't trivialise stamina)",
  EGGS.stamina > 0 && EGGS.stamina < PLAYER.dashCost,
  `egg=${EGGS.stamina} dashCost=${PLAYER.dashCost}`);
check("a golden egg refills stamina in full (capped at staminaMax)",
  EGGS.goldenStamina === PLAYER.staminaMax,
  `golden=${EGGS.goldenStamina} max=${PLAYER.staminaMax}`);
check("golden chance is a real probability strictly inside (0,1)",
  EGGS.goldenChance > 0 && EGGS.goldenChance < 1);
check("consumed eggs respawn (endless survival needs a sustained pickup economy)",
  EGGS.respawnSeconds > 0);

console.log("survival score economy:");
check("time alive pays", SCORE.survivalPerSec > 0);
check("an egg outranks a meat (meat already pays in a bigger heal)",
  SCORE.eggPickup > SCORE.meatPickup,
  `egg=${SCORE.eggPickup} meat=${SCORE.meatPickup}`);
check("a golden egg outranks an ordinary one",
  SCORE.goldenPickup > SCORE.eggPickup);
check("a close call outranks a routine egg, under a golden find (skill pays, in scale)",
  SCORE.closeCall > SCORE.eggPickup && SCORE.closeCall < SCORE.goldenPickup,
  `closeCall=${SCORE.closeCall}`);

console.log("time-score accrual (mirror of game.js):");
// game.js per-frame accrual: survivalPerSec * (1 + survivalBonus * dusk) * dt
const accrue = (seconds, dusk) => SCORE.survivalPerSec * (1 + DUSK.survivalBonus * dusk) * seconds;
check("10s survived in full day = 10x the per-second rate",
  approx(accrue(10, 0), SCORE.survivalPerSec * 10));
check("deepest dusk pays (1 + survivalBonus)x the day rate",
  approx(accrue(10, 1), SCORE.survivalPerSec * 10 * (1 + DUSK.survivalBonus)));
check("dusk never pays less than day", accrue(10, 0.5) >= accrue(10, 0));

console.log(failures === 0 ? "\nALL SURVIVAL TESTS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
