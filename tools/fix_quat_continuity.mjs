// Fix quaternion-sign DISCONTINUITY in a glb's rotation animation tracks.
// Baked Blender->glTF clips can emit consecutive rotation keyframes in opposite
// hemispheres (q and -q are the same rotation). glTF LINEAR interpolation then
// takes the long way between them, so playback VIBRATES even though each
// individual frame is correct (a frozen/stepped frame looks fine). Walk each
// rotation track and negate any keyframe whose dot with the previous is < 0, so
// successive quats stay on the shortest path.  Usage: node fix_quat_continuity.mjs <glb> [outGlb]
import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3] || inPath; // default: overwrite
const buf = readFileSync(inPath);

const MAGIC = buf.readUInt32LE(0); // 0x46546C67 'glTF'
if (MAGIC !== 0x46546c67) throw new Error("not a glb");
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
const binChunkOff = 20 + jsonLen;
const binLen = buf.readUInt32LE(binChunkOff);
const binStart = binChunkOff + 8;
const bin = buf.subarray(binStart, binStart + binLen); // a view into buf — writes patch in place

let fixedTracks = 0, fixedKeys = 0;
for (const anim of json.animations || []) {
  for (const ch of anim.channels) {
    if (!ch.target || ch.target.path !== "rotation") continue;
    const sampler = anim.samplers[ch.sampler];
    const acc = json.accessors[sampler.output];
    if (acc.type !== "VEC4" || acc.componentType !== 5126) continue; // FLOAT VEC4 only
    const bv = json.bufferViews[acc.bufferView];
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 16; // tightly packed VEC4 f32 = 16
    const n = acc.count;
    let prev = [bin.readFloatLE(base), bin.readFloatLE(base + 4), bin.readFloatLE(base + 8), bin.readFloatLE(base + 12)];
    let trackFixed = false;
    for (let i = 1; i < n; i++) {
      const o = base + i * stride;
      const q = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8), bin.readFloatLE(o + 12)];
      const dot = q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3];
      if (dot < 0) {
        bin.writeFloatLE(-q[0], o); bin.writeFloatLE(-q[1], o + 4); bin.writeFloatLE(-q[2], o + 8); bin.writeFloatLE(-q[3], o + 12);
        q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3];
        fixedKeys++; trackFixed = true;
      }
      prev = q;
    }
    if (trackFixed) fixedTracks++;
  }
}

writeFileSync(outPath, buf);
console.log(`${inPath}: unrolled ${fixedKeys} keyframes across ${fixedTracks} rotation tracks -> ${outPath}`);
