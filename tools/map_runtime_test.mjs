// Node smoke test for src/map.js — stubs fetch to read the design files from
// disk, then checks the synchronous lookups against known map landmarks.
// Run: node tools/map_runtime_test.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
globalThis.fetch = async (url) => ({
  json: async () => JSON.parse(await readFile(new URL(url, `file://${root}`), "utf8")),
});

const map = await import("../src/map.js");
await map.initMap();

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const spawn = map.getSpawn();
check("spawn is (0,-250)", spawn.x === 0 && spawn.z === -250, JSON.stringify(spawn));
check("biomeAt(spawn) = C", map.biomeAt(spawn.x, spawn.z) === "C", map.biomeAt(spawn.x, spawn.z));
check("biomeAt(0,35) = G", map.biomeAt(0, 35) === "G", map.biomeAt(0, 35));
check("biomeAt(0,582) = ~ (off-grid north)", map.biomeAt(0, 582) === "~", map.biomeAt(0, 582));
check("biomeAt(0,300) in {M,R}", ["M", "R"].includes(map.biomeAt(0, 300)), map.biomeAt(0, 300));
check("isImpassable('J')", map.isImpassable("J") === true, "expected true");
check("!isImpassable('G')", map.isImpassable("G") === false, "expected false");

let foundP = false;
for (let x = -25; x <= 25 && !foundP; x++) {
  for (let z = -210; z <= -190; z++) {
    if (map.biomeAt(x, z) === "P") { foundP = true; break; }
  }
}
check("P cell near (0,-200) within |x|<=25", foundP, "none found in z [-210,-190]");

check("isBlockingProp('T')", map.isBlockingProp("T") === true, "expected true");
check("!isBlockingProp('f')", map.isBlockingProp("f") === false, "expected false");
check("propAt off-grid = .", map.propAt(0, 9999) === ".", map.propAt(0, 9999));

const units = map.getUnits();
check("units 492x972", units.cols === 492 && units.rows === 972, JSON.stringify(units));
check("territories non-empty", map.getTerritories().length > 0, "empty");
check("muddyPath has waypoints", map.getMuddyPath().waypoints.length > 0, "empty");
check("wallAssets has mountain", typeof map.getWallAssets().mountain === "string", "missing");
check("assets non-empty", map.getAssets().length > 0, "empty");

console.log(failures ? `${failures} FAILURE(S)` : "ALL PASS");
process.exit(failures ? 1 : 0);
