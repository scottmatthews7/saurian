// Shared loft core — the T-Rex "anti-Michelin-man" surface builder, extracted so
// every creature module sweeps ONE continuous superellipse-ringed skin per body
// region instead of gluing primitive chains. Logic is byte-equivalent to the
// reference implementation in trex.js (which stays frozen as its own copy).
//
// A loft sweeps a superelliptical cross-section (independent half-width / top /
// bottom height / squareness per station) along a Catmull-Rom spine, emitting a
// single mesh with analytically-welded smooth normals (no lighting seam).
//
// Usage:
//   import { makeLoft, QUALITY } from "./loft-core.mjs";
//   const loft = makeLoft(scene, B, { quality: "realtime" });
//   const body = loft("body", [{ p: V(...), w, hT, hB, sq }, ...], { ringN: 32 });
//
// Station fields:
//   p  : B.Vector3 ring centre
//   w  : half-width (local right ≈ +X)
//   hT : half-height above centre, hB : below (belly sag / flat skull). `h`
//        sets both if hT/hB are omitted.
//   sq : superellipse exponent (2 = ellipse, >2 = squarer/croc-flat sides)

export const QUALITY = {
  fast: { ringN: 16, samplesPerSpan: 4 },     // editing / quick critic shots
  realtime: { ringN: 28, samplesPerSpan: 6 }, // in-game target (matches trex.js)
  hero: { ringN: 40, samplesPerSpan: 8 },     // showcase renders
};

export function makeLoft(scene, B, opts = {}) {
  const V = (x, y, z) => new B.Vector3(x, y, z);
  const preset = QUALITY[opts.quality] || QUALITY.realtime;

  return function loft(name, stations, o = {}) {
    const ringN = o.ringN ?? preset.ringN;
    const spans = o.samplesPerSpan ?? preset.samplesPerSpan;
    const sq0 = 2;

    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    const S = stations;
    const samples = [];
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1],
            d = S[Math.min(S.length - 1, i + 2)];
      const last = (i === S.length - 2);
      const stepN = last ? spans + 1 : spans;
      for (let s = 0; s < stepN; s++) {
        const t = s / spans;
        samples.push({
          c: V(cr(a.p.x, b.p.x, c.p.x, d.p.x, t),
               cr(a.p.y, b.p.y, c.p.y, d.p.y, t),
               cr(a.p.z, b.p.z, c.p.z, d.p.z, t)),
          w:  cr(a.w, b.w, c.w, d.w, t),
          hT: cr(a.hT ?? a.h, b.hT ?? b.h, c.hT ?? c.h, d.hT ?? d.h, t),
          hB: cr(a.hB ?? a.h, b.hB ?? b.h, c.hB ?? c.h, d.hB ?? d.h, t),
          sq: cr(a.sq ?? sq0, b.sq ?? sq0, c.sq ?? sq0, d.sq ?? sq0, t),
        });
      }
    }
    const pathN = samples.length;

    const frames = [];
    for (let i = 0; i < pathN; i++) {
      const a = samples[Math.max(0, i - 1)].c;
      const b = samples[Math.min(pathN - 1, i + 1)].c;
      const tang = b.subtract(a).normalize();
      let right = V(1, 0, 0);
      right = right.subtract(tang.scale(B.Vector3.Dot(right, tang))).normalize();
      const up = B.Vector3.Cross(tang, right).normalize();
      frames.push({ tang, right, up });
    }

    // θ starts at the BOTTOM (-π/2) so the UV seam hides on the belly line.
    const positions = [], uvs = [];
    for (let i = 0; i < pathN; i++) {
      const s = samples[i], f = frames[i];
      for (let j = 0; j <= ringN; j++) {
        const th = -Math.PI / 2 + (j / ringN) * Math.PI * 2;
        const co = Math.cos(th), si = Math.sin(th);
        const k = 2 / s.sq;
        const cx = Math.sign(co) * Math.pow(Math.abs(co), k);
        const cy = Math.sign(si) * Math.pow(Math.abs(si), k);
        const h = cy >= 0 ? s.hT : s.hB;
        const p = s.c.add(f.right.scale(s.w * cx)).add(f.up.scale(h * cy));
        positions.push(p.x, p.y, p.z);
        uvs.push(j / ringN, i / (pathN - 1));
      }
    }

    const indices = [];
    const W = ringN + 1;
    for (let i = 0; i < pathN - 1; i++) {
      for (let j = 0; j < ringN; j++) {
        const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Welded normals via parametric finite differences with ring wraparound, so
    // duplicated seam vertices get IDENTICAL normals — no lighting seam.
    const normals = new Array(positions.length);
    const P = (i, j) => {
      const o = (i * W + ((j % ringN) + ringN) % ringN) * 3;
      return V(positions[o], positions[o + 1], positions[o + 2]);
    };
    for (let i = 0; i < pathN; i++) {
      for (let j = 0; j <= ringN; j++) {
        const dRing = P(i, j + 1).subtract(P(i, j - 1));
        const i0 = Math.max(0, i - 1), i1 = Math.min(pathN - 1, i + 1);
        const dPath = P(i1, j).subtract(P(i0, j));
        let n = B.Vector3.Cross(dRing, dPath);
        const len = n.length();
        if (len < 1e-8) n = frames[i].tang.scale(i === 0 ? -1 : 1);
        else n = n.scale(1 / len);
        const o = (i * W + j) * 3;
        normals[o] = n.x; normals[o + 1] = n.y; normals[o + 2] = n.z;
      }
    }

    const mesh = new B.Mesh(name, scene);
    const vd = new B.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(mesh);
    return mesh;
  };
}
