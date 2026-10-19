// Compare two STL meshes by vertical columns: on an xy grid, the solid
// stretches along each column (by winding, from the raw triangles, so no
// vertex merging or booleans are needed), and their symmetric difference.
// Reports the difference volume and where it is (clusters of columns).
// Usage: tsx scripts/colcmp.ts a.stl b.stl [step mm, default 0.2]
import { readFileSync } from 'node:fs';

type Tri = number[]; // 9 numbers
function load(path: string): Tri[] {
  const d = readFileSync(path), n = d.readUInt32LE(80), out: Tri[] = [];
  for (let t = 0; t < n; t++) {
    const v: number[] = [];
    for (let k = 0; k < 9; k++) v.push(d.readFloatLE(84 + t * 50 + 12 + k * 4));
    out.push(v);
  }
  return out;
}

/** Per column (key i*ny + j): crossings [z, +1 entering / -1 leaving]. */
function columns(tris: Tri[], x0: number, y0: number, step: number, nx: number, ny: number) {
  const cols = new Map<number, [number, number][]>();
  for (const t of tris) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); // 2x signed area in xy
    if (Math.abs(nz) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / step)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / step));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / step)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / step));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const px = x0 + i * step, py = y0 + j * step;
      // barycentric
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / nz;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / nz;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * az + w1 * bz + w2 * cz, key = i * ny + j;
      let c = cols.get(key); if (!c) cols.set(key, c = []);
      c.push([z, nz < 0 ? +1 : -1]); // facing down: entering the solid going up
    }
  }
  return cols;
}
/** Inside intervals of a column, by winding number > 0. */
function intervals(cr: [number, number][] | undefined): [number, number][] {
  if (!cr) return [];
  cr.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let w = 0, start = 0;
  for (const [z, d] of cr) {
    const was = w > 0; w += d;
    if (!was && w > 0) start = z; else if (was && w <= 0) out.push([start, z]);
  }
  return out;
}
const len = (iv: [number, number][]) => iv.reduce((a, [p, q]) => a + q - p, 0);
/** z range where two interval sets differ. */
function zdiff(a: [number, number][], b: [number, number][]): [number, number] {
  const pts = [...a.flat(), ...b.flat()].sort((p, q) => p - q);
  const inside = (iv: [number, number][], z: number) => iv.some(([p, q]) => z > p && z < q);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const m = (pts[k] + pts[k + 1]) / 2;
    if (pts[k + 1] - pts[k] > 1e-6 && inside(a, m) !== inside(b, m)) { lo = Math.min(lo, pts[k]); hi = Math.max(hi, pts[k + 1]); }
  }
  return [lo, hi];
}
function inter(a: [number, number][], b: [number, number][]) {
  let i = 0, j = 0, s = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) s += hi - lo;
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return s;
}

export function compare(aPath: string, bPath: string, step = 0.2) {
  const A = load(aPath), B = load(bPath);
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const t of [...A, ...B]) for (let k = 0; k < 9; k += 3) { mnx = Math.min(mnx, t[k]); mxx = Math.max(mxx, t[k]); mny = Math.min(mny, t[k + 1]); mxy = Math.max(mxy, t[k + 1]); }
  const x0 = mnx + 0.01371, y0 = mny + 0.00913; // off any grid the meshes are built on
  const nx = Math.ceil((mxx - x0) / step) + 1, ny = Math.ceil((mxy - y0) / step) + 1;
  const ca = columns(A, x0, y0, step, nx, ny), cb = columns(B, x0, y0, step, nx, ny);
  const keys = new Set([...ca.keys(), ...cb.keys()]);
  let extra = 0, missing = 0, va = 0, vb = 0;
  const bad: { x: number; y: number; d: number; z: [number, number] }[] = [];
  for (const k of keys) {
    const ia = intervals(ca.get(k)), ib = intervals(cb.get(k)), both = inter(ia, ib);
    const la = len(ia), lb = len(ib);
    va += la; vb += lb; extra += la - both; missing += lb - both;
    if (la - both + lb - both > 0.05) bad.push({ x: x0 + Math.floor(k / ny) * step, y: y0 + (k % ny) * step, d: la - both + lb - both, z: zdiff(ia, ib) });
  }
  const area = step * step;
  // clusters of differing columns (within 2mm)
  const clusters: { x0: number; x1: number; y0: number; y1: number; v: number; z0: number; z1: number }[] = [];
  for (const b of bad) {
    const c = clusters.find((q) => b.x >= q.x0 - 2 && b.x <= q.x1 + 2 && b.y >= q.y0 - 2 && b.y <= q.y1 + 2);
    if (c) { c.x0 = Math.min(c.x0, b.x); c.x1 = Math.max(c.x1, b.x); c.y0 = Math.min(c.y0, b.y); c.y1 = Math.max(c.y1, b.y); c.v += b.d * area; c.z0 = Math.min(c.z0, b.z[0]); c.z1 = Math.max(c.z1, b.z[1]); }
    else clusters.push({ x0: b.x, x1: b.x, y0: b.y, y1: b.y, v: b.d * area, z0: b.z[0], z1: b.z[1] });
  }
  clusters.sort((p, q) => q.v - p.v);
  return { va: va * area, vb: vb * area, extra: extra * area, missing: missing * area, clusters };
}

if (process.argv[1]?.endsWith('colcmp.ts')) {
  const r = compare(process.argv[2], process.argv[3], Number(process.argv[4] ?? 0.2));
  console.log(`vol ${r.va.toFixed(2)} / ${r.vb.toFixed(2)}  extra ${r.extra.toFixed(3)}  missing ${r.missing.toFixed(3)} mm3`);
  for (const c of r.clusters.slice(0, 8)) console.log(`  ${c.v.toFixed(3)} mm3 at x ${c.x0.toFixed(1)}..${c.x1.toFixed(1)}, y ${c.y0.toFixed(1)}..${c.y1.toFixed(1)}, z ${c.z0.toFixed(2)}..${c.z1.toFixed(2)}`);
}
