// Read design/map.svg (the editable map canvas) and emit the zones as structured
// world-coordinate data the model/generator can consume. The owner edits the SVG
// visually (Inkscape/Figma) or as text; this turns it back into biomes + dino
// territories + features in WORLD units.
//
// Coordinate mapping (NORTH-UP SVG):  worldX = svgX ,  worldZ = -svgY
//
// Usage:
//   node tools/map_svg.mjs [path/to/map.svg]     -> JSON to stdout
//   node tools/map_svg.mjs --territory           -> just the TERRITORY config block
import { readFileSync } from "node:fs";

const path = process.argv.find((a) => a.endsWith(".svg")) || "design/map.svg";
const wantTerritory = process.argv.includes("--territory");
const svg = readFileSync(path, "utf8");

const W = (svgY) => -Number(svgY);                       // svgY -> worldZ
const num = (s) => (s === undefined ? undefined : Number(s));
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : undefined;
};
// Editors (Inkscape/Figma) often record a drag as transform="translate(dx,dy)"
// or an identity matrix(1,0,0,1,e,f) instead of updating cx/cy. Bake that offset
// in so dragging shapes "just works". (Rotation/scale matrices aren't handled —
// warn so they're caught rather than silently mis-read.)
function translateOf(tag) {
  const t = attr(tag, "transform");
  if (!t) return { tx: 0, ty: 0 };
  let m = t.match(/translate\(\s*(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)\s*\)/) ||
          t.match(/translate\(\s*(-?\d*\.?\d+)\s*\)/);
  if (m) return { tx: Number(m[1]), ty: m[2] !== undefined ? Number(m[2]) : 0 };
  m = t.match(/matrix\(\s*1[ ,]+0[ ,]+0[ ,]+1[ ,]+(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)\s*\)/);
  if (m) return { tx: Number(m[1]), ty: Number(m[2]) };
  console.error(`WARN: unhandled transform on a shape ("${t}") — its position may be off. Re-save with Inkscape "Store transformation: Optimized".`);
  return { tx: 0, ty: 0 };
}
// all element tags (open or self-closing) of the given name
const tagsOf = (name) => svg.match(new RegExp(`<${name}\\b[^>]*>`, "g")) || [];

const biomes = [];
const territories = [];
const features = [];
const routes = [];

for (const name of ["ellipse", "circle", "rect", "path", "polygon"]) {
  for (const tag of tagsOf(name)) {
    const biome = attr(tag, "data-biome");
    const dino = attr(tag, "data-dino");
    const feature = attr(tag, "data-feature");
    const route = attr(tag, "data-route");
    const { tx, ty } = translateOf(tag);
    const X = (v) => v + tx, Y = (v) => v + ty;            // bake any drag-translate into svg coords

    const cx = num(attr(tag, "cx")), cy = num(attr(tag, "cy"));
    const r = num(attr(tag, "r")), rx = num(attr(tag, "rx")), ry = num(attr(tag, "ry"));

    // polygon `points` or path `d` -> world-space {x,z} boundary vertices
    const polyOf = () => {
      const raw = attr(tag, "points") || attr(tag, "d");
      if (!raw) return null;
      const nums = (raw.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: X(nums[i]), z: W(Y(nums[i + 1])) });
      return pts.length ? pts : null;
    };
    const centroid = (pts) => ({
      centerX: +(pts.reduce((s, p) => s + p.x, 0) / pts.length).toFixed(1),
      centerZ: +(pts.reduce((s, p) => s + p.z, 0) / pts.length).toFixed(1),
    });

    if (dino && cx !== undefined) {
      territories.push({ dino, centerX: X(cx), centerZ: W(Y(cy)), radius: r ?? Math.max(rx, ry) });
    } else if (biome) {
      const b = { biome };
      const poly = polyOf();
      if (poly) { b.polygon = poly; Object.assign(b, centroid(poly)); }            // reshaped boundary
      else if (cx !== undefined) { b.centerX = X(cx); b.centerZ = W(Y(cy)); b.rx = rx ?? r; b.ry = ry ?? r; }
      else if (attr(tag, "x") !== undefined) {
        b.x = X(num(attr(tag, "x"))); b.width = num(attr(tag, "width"));
        b.y = Y(num(attr(tag, "y"))); b.height = num(attr(tag, "height"));
        b.note = "rect (sea/background) — bounds in svg space";
      }
      biomes.push(b);
    } else if (route) {
      routes.push({ route, waypoints: polyOf() || [] });
    } else if (feature && cx !== undefined) {
      features.push({ feature, x: X(cx), z: W(Y(cy)) });
    }
  }
}

if (wantTerritory) {
  // Emit a ready-to-paste TERRITORY config block (edgeSoftness kept as a sensible default).
  const lines = territories.map(
    (t) => `  ${t.dino}: { centerX: ${t.centerX}, centerZ: ${t.centerZ}, radius: ${t.radius}, edgeSoftness: 55 },`
  );
  console.log("export const TERRITORY = {\n" + lines.join("\n") + "\n};");
} else {
  console.log(JSON.stringify({ source: path, biomes, territories, features, routes }, null, 2));
}
