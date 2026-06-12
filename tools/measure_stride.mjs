// Measure each gait clip's intrinsic GROUND SPEED, so the game can drive a dino's
// movement at its real animation pace (no foot-slide). The walk/run clips are
// IN-PLACE (the root never translates), so the ground speed a gait implies is the
// speed the PLANTED (support) foot sweeps backwards. We do forward kinematics on
// the skeleton at sampled times, find the support foot each frame (lowest, with
// the most horizontal travel), and take the median of its horizontal speed over
// the cycle = the clip's intrinsic ground speed in the model's NATIVE units/sec at
// playback rate 1.0. We also report nativeHeight (rest-pose mesh bbox) so the game
// can convert to world units: intrinsicWorld = intrinsicNative * (targetHeight/nativeHeight).
//
// Usage: node tools/measure_stride.mjs <glb> [glb...]
import { readFileSync } from "node:fs";

const SAMPLES = 64; // timesteps per cycle — dense enough to resolve stance vs swing

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb: " + path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

// Read a float accessor into an array of numbers (SCALAR) or arrays (VEC*).
function readAccessor(json, bin, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || comps * 4;
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const row = [];
    for (let c = 0; c < comps; c++) row.push(bin.readFloatLE(base + i * stride + c * 4));
    out.push(comps === 1 ? row[0] : row);
  }
  return out;
}

// --- minimal 4x4 column-major matrix maths -------------------------------
const mIdent = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
// compose translation t[3], quaternion q[4]=(x,y,z,w), scale s[3]
function compose(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
const mPos = (m) => [m[12], m[13], m[14]];

// --- sampler interpolation ----------------------------------------------
function makeSampler(json, bin, sampler) {
  const times = readAccessor(json, bin, sampler.input);
  const vals = readAccessor(json, bin, sampler.output);
  const step = sampler.interpolation === "STEP";
  return { times, vals, step };
}
function sampleVec(s, t) {
  const { times, vals } = s;
  if (t <= times[0]) return vals[0];
  if (t >= times[times.length - 1]) return vals[vals.length - 1];
  let i = 1;
  while (times[i] < t) i++;
  const t0 = times[i - 1], t1 = times[i];
  const u = s.step ? 0 : (t - t0) / (t1 - t0);
  const a = vals[i - 1], b = vals[i];
  return a.map((v, k) => v + (b[k] - v) * u);
}
function sampleQuat(s, t) {
  const { times, vals } = s;
  if (t <= times[0]) return vals[0];
  if (t >= times[times.length - 1]) return vals[vals.length - 1];
  let i = 1;
  while (times[i] < t) i++;
  const t0 = times[i - 1], t1 = times[i];
  const u = s.step ? 0 : (t - t0) / (t1 - t0);
  let a = vals[i - 1], b = vals[i];
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) { b = b.map((v) => -v); dot = -dot; } // shortest path
  const q = a.map((v, k) => v + (b[k] - v) * u); // nlerp — fine for measurement
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / n);
}

function analyse(path) {
  const { json, bin } = readGlb(path);
  const nodes = json.nodes;
  const N = nodes.length;
  // parent map
  const parent = new Array(N).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const roots = [];
  for (let i = 0; i < N; i++) if (parent[i] === -1) roots.push(i);

  const baseTRS = nodes.map((n) => ({
    t: n.translation || [0, 0, 0],
    r: n.rotation || [0, 0, 0, 1],
    s: n.scale || [1, 1, 1],
  }));

  // world matrices for a given per-node TRS override map
  function worldMatrices(anim) {
    const local = nodes.map((n, i) => {
      const a = anim[i];
      const t = a && a.t ? a.t : baseTRS[i].t;
      const r = a && a.r ? a.r : baseTRS[i].r;
      const s = a && a.s ? a.s : baseTRS[i].s;
      return compose(t, r, s);
    });
    const world = new Array(N);
    const visit = (i, pm) => {
      world[i] = mMul(pm, local[i]);
      (nodes[i].children || []).forEach((c) => visit(c, world[i]));
    };
    roots.forEach((r) => visit(r, mIdent()));
    return world;
  }

  // Size reference = the SKELETON's rest vertical extent, measured in the same FK
  // space as the foot motion below (so the ratio is scale-consistent regardless of
  // each model's authored unit scale / inverse-bind quirks). The skin joints span
  // foot-to-head, so this ~ the rendered body height.
  const restWorld = worldMatrices([]);
  const jointSet = new Set();
  for (const sk of json.skins || []) for (const j of sk.joints) jointSet.add(j);
  const joints = jointSet.size ? [...jointSet] : nodes.map((_, i) => i).filter((i) => nodes[i].mesh === undefined);
  let minY = Infinity, maxY = -Infinity;
  for (const j of joints) { const y = restWorld[j][13]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const nativeHeight = maxY - minY;

  const out = { file: path.split("/").pop(), nativeHeight: +nativeHeight.toFixed(4), gaits: {} };

  for (const anim of json.animations || []) {
    if (!/Walk|Run/i.test(anim.name)) continue;
    // per-node channels
    const chan = nodes.map(() => ({}));
    let dur = 0;
    for (const ch of anim.channels) {
      const s = makeSampler(json, bin, anim.samplers[ch.sampler]);
      dur = Math.max(dur, s.times[s.times.length - 1]);
      chan[ch.target.node][ch.target.path] = s;
    }
    // sample joint world positions over one cycle
    const frames = [];
    for (let f = 0; f < SAMPLES; f++) {
      const t = (dur * f) / SAMPLES;
      const animTRS = nodes.map((_, i) => {
        const c = chan[i];
        return {
          t: c.translation ? sampleVec(c.translation, t) : null,
          r: c.rotation ? sampleQuat(c.rotation, t) : null,
          s: c.scale ? sampleVec(c.scale, t) : null,
        };
      });
      frames.push(worldMatrices(animTRS).map(mPos));
    }
    // per-joint vertical mean + horizontal path length over the cycle
    const stats = [];
    for (let j = 0; j < N; j++) {
      if (nodes[j].mesh !== undefined) { stats.push(null); continue; }
      let yMean = 0, path = 0;
      for (let f = 0; f < SAMPLES; f++) {
        yMean += frames[f][j][1];
        const g = frames[(f + 1) % SAMPLES][j];
        const p = frames[f][j];
        path += Math.hypot(g[0] - p[0], g[2] - p[2]);
      }
      stats.push({ j, yMean: yMean / SAMPLES, path });
    }
    const live = stats.filter(Boolean);
    const ys = live.map((s) => s.yMean);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    const footBand = yLo + (yHi - yLo) * 0.25; // lowest quarter of the rig = feet
    const pathMax = Math.max(...live.map((s) => s.path));
    const feet = live.filter((s) => s.yMean <= footBand && s.path >= pathMax * 0.3).map((s) => s.j);

    // ground speed = median horizontal speed of the SUPPORT foot (lowest foot each
    // frame). The planted foot sweeps backward at ground speed; swing legs are
    // faster/forward, so the median of the lowest-foot speed tracks the stance.
    const dt = dur / SAMPLES;
    const speeds = [];
    for (let f = 0; f < SAMPLES; f++) {
      let lowest = -1, ly = Infinity;
      for (const j of feet) if (frames[f][j][1] < ly) { ly = frames[f][j][1]; lowest = j; }
      if (lowest < 0) continue;
      const p = frames[f][lowest], g = frames[(f + 1) % SAMPLES][lowest];
      speeds.push(Math.hypot(g[0] - p[0], g[2] - p[2]) / dt);
    }
    speeds.sort((a, b) => a - b);
    const median = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;

    const key = /Run/i.test(anim.name) ? "Run" : "Walk";
    out.gaits[key] = {
      clip: anim.name,
      dur: +dur.toFixed(3),
      footJoints: feet.length,
      intrinsicNative: +median.toFixed(4),       // native units/sec at rate 1.0
      intrinsicPerHeight: +(median / nativeHeight).toFixed(4), // scale-free: ground units per body-height per sec
    };
  }
  return out;
}

const files = process.argv.slice(2);
const results = files.map((f) => { try { return analyse(f); } catch (e) { return { file: f, error: e.message }; } });
console.log(JSON.stringify(results, null, 2));
