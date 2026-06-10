// Headless logic test for HERD PREDATION (session 12) — the T-Rex hunts the
// herd, not just the raptor. Exercises the real `pickPrey` from ai.js (no
// Babylon: it only reads positions). Run:  node tools/herd_hunt_test.mjs

import { pickPrey } from "../src/ai.js";
import { TREX, PLAYER } from "../src/config.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}

// Fake herbivore at (x,z): { dead, dino.root.position }.
function herb(x, z, dead = false) {
  return { dead, dino: { root: { position: { x, z } } } };
}
const trexPos = { x: 0, z: 0 };
// Generous ranges so loseRange never spuriously drops a kept prey in these tests.
const SIGHT = TREX.sightRange, LOSE = TREX.loseInterestRange;

console.log("acquisition:");
check("hunts a nearby herbivore when the raptor is far",
  pickPrey({ prey: null }, trexPos, 60, [herb(10, 0)], SIGHT, LOSE, false) !== null);

check("ignores the herd entirely while locked onto the player (point-blank priority)",
  pickPrey({ prey: null }, trexPos, 60, [herb(10, 0)], SIGHT, LOSE, true) === null);

check("won't acquire a herbivore beyond preySightRange",
  pickPrey({ prey: null }, trexPos, 999, [herb(TREX.preySightRange + 5, 0)], SIGHT, LOSE, false) === null);

check("won't peel off the player for a herbivore that isn't clearly closer",
  // herb at 10, player at 12 -> only 2 closer, < preyCloserBy (8): stay on player
  pickPrey({ prey: null }, trexPos, 12, [herb(10, 0)], SIGHT, LOSE, false) === null,
  `preyCloserBy=${TREX.preyCloserBy}`);

check("acquires when the herbivore IS clearly closer than the player",
  // herb at 5, player at 40 -> 35 closer, well past preyCloserBy
  pickPrey({ prey: null }, trexPos, 40, [herb(5, 0)], SIGHT, LOSE, false) !== null);

check("picks the NEAREST eligible herbivore",
  (() => {
    const near = herb(6, 0), far = herb(20, 0);
    return pickPrey({ prey: null }, trexPos, 60, [far, near], SIGHT, LOSE, false) === near;
  })());

console.log("commitment / drop:");
check("keeps a committed prey that is still alive and in range",
  (() => {
    const p = herb(15, 0);
    // even though the raptor is now nearer (distP small) we keep the locked prey,
    // because lockedToPlayer is false and the prey is still valid
    return pickPrey({ prey: p }, trexPos, 30, [p], SIGHT, LOSE, false) === p;
  })());

check("drops a dead prey",
  (() => {
    const p = herb(15, 0, true);
    return pickPrey({ prey: p }, trexPos, 60, [p], SIGHT, LOSE, false) !== p;
  })());

check("drops a prey that has escaped past loseRange",
  (() => {
    const p = herb(LOSE + 10, 0);
    // escaped, and no other herbivore in range -> null
    return pickPrey({ prey: p }, trexPos, 60, [p], SIGHT, LOSE, false) === null;
  })());

check("abandons the hunt the instant the raptor demands priority",
  (() => {
    const p = herb(15, 0);
    return pickPrey({ prey: p }, trexPos, 5, [p], SIGHT, LOSE, true) === null;
  })());

console.log("config sanity:");
check("prey sight is tighter than player sight (a distant raptor still wins attention)",
  TREX.preySightRange < TREX.sightRange,
  `prey=${TREX.preySightRange} player=${TREX.sightRange}`);
check("a herbivore needs a real distance edge to pull aggro (preyCloserBy positive)",
  TREX.preyCloserBy > 0);
check("the raptor is the priority at close range (playerPriorityRange positive)",
  TREX.playerPriorityRange > 0);
check("two prey bites fell a herbivore (matches the raptor's chomp economy)",
  TREX.preyBite * 2 >= 60, `preyBite=${TREX.preyBite}, herbivore maxHealth 60`);

console.log("feeding frenzy config sanity:");
check("feeding lasts long enough to rush in and punish (>= one bite window)",
  TREX.feedSeconds >= 2, `feedSeconds=${TREX.feedSeconds}`);
check("feeding makes the T-Rex genuinely more vulnerable (multiplier > 1)",
  TREX.feedVulnMultiplier > 1, `feedVulnMultiplier=${TREX.feedVulnMultiplier}`);
check("the flank bite is landable: break range is point-blank, INSIDE the raptor's attack reach (you bite from the edge; only crowding on top loses the window)",
  TREX.feedBreakRange > 0 && TREX.feedBreakRange < PLAYER.attackRange,
  `feedBreakRange=${TREX.feedBreakRange}, player attackRange=${PLAYER.attackRange}`);

console.log(failures === 0 ? "\nALL HERD-HUNT TESTS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
