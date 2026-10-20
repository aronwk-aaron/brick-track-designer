// Each part's overhangs as printed (its STL, in its print frame): the area of
// faces facing down (more than 45° from vertical) above the bed, and where.
// npx tsx scripts/overhangs.mts <design.json | template name> [options JSON]
import { readFileSync } from 'node:fs';
const R = '/home/aronwk/Documents/git/brick-track-designer/src/';
const { kernel } = await import(R + 'geom/kernel.ts');
const { buildDesign } = await import(R + 'app/build.ts');
const { TEMPLATES } = await import(R + 'app/design.ts');
const w = await kernel();
const arg = process.argv[2], d = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : structuredClone(TEMPLATES[arg]);
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}), ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };
const b = buildDesign(w, d);
for (const p of b.pieces.filter((q: any) => process.env.ALL || /points|throw|lever|bracket|stand|spring/.test(q.name))) {
  const dv = new DataView(p.stl.buffer, p.stl.byteOffset), n = dv.getUint32(80, true);
  const tri = (i: number) => [0, 1, 2].map((v) => [0, 1, 2].map((c) => dv.getFloat32(84 + i * 50 + 12 + v * 12 + c * 4, true)));
  let zmin = Infinity; for (let i = 0; i < n; i++) for (const v of tri(i)) zmin = Math.min(zmin, v[2]);
  let area = 0; const at: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [a, bb, c] = tri(i), u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    const zc = (a[2] + bb[2] + c[2]) / 3;
    if (nz / len < -0.71 && zc > zmin + 0.25) { area += len / 2; at.push([(a[0] + bb[0] + c[0]) / 3, (a[1] + bb[1] + c[1]) / 3, zc - zmin]); }
  }
  const box = at.length ? [0, 1, 2].map((k) => `${Math.min(...at.map((q) => q[k])).toFixed(1)}..${Math.max(...at.map((q) => q[k])).toFixed(1)}`).join(' ') : '';
  console.log(p.name, 'overhang', area.toFixed(1), 'mm2', box);
}
