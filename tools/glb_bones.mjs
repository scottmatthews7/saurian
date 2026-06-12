// Dump a glb's skeleton: bone name <- parent, and each bone's REST WORLD position
// in model space (metres), derived from the skin inverseBindMatrices (no browser).
// Usage: node tools/glb_bones.mjs assets/models/apatosaurus.glb
import { readFileSync } from "node:fs";

const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
// binary chunk follows the JSON chunk
const binChunkOff = 20 + jsonLen;
const binLen = buf.readUInt32LE(binChunkOff);
const binStart = binChunkOff + 8;
const bin = buf.slice(binStart, binStart + binLen);

const nodes = json.nodes || [];
const parent = {};
nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
const skin = (json.skins || [])[0];
const joints = skin.joints;

// read inverseBindMatrices accessor (MAT4 float32, 16 floats per joint)
const acc = json.accessors[skin.inverseBindMatrices];
const bv = json.bufferViews[acc.bufferView];
const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
function ibm(i) {
  const m = new Array(16);
  for (let k = 0; k < 16; k++) m[k] = bin.readFloatLE(base + i * 64 + k * 4);
  return m; // column-major
}
// invert a 4x4 (column-major) and return translation of the inverse
function invTranslation(m) {
  // general 4x4 inverse (column-major indices)
  const inv = new Array(16);
  inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
  det = 1.0 / det;
  // translation column of the inverse = elements 12,13,14 (need inv[3],inv[7],inv[11] too)
  inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
  return [inv[12] * det, inv[13] * det, inv[14] * det];
}

const out = {};
const rows = [];
joints.forEach((j, i) => {
  const name = nodes[j].name;
  const pj = parent[j];
  const pn = pj != null && nodes[pj] ? nodes[pj].name : "(root)";
  const p = invTranslation(ibm(i)).map((v) => +v.toFixed(3));
  out[name] = p;
  rows.push(`${name}  <-  ${pn}   [${p.join(", ")}]`);
});
console.log("joints:", joints.length);
console.log(rows.join("\n"));
console.log("\nJSON:\n" + JSON.stringify(out));
console.log("\nclips:", (json.animations || []).map((a) => a.name).join(", "));
