// The parts' files are the solids as built: read as a slicer reads them (corners the same where exactly the same),
// each is closed, has no triangle without area, and holds what the part is and its breakaway supports, no more.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** The volume inside a triangle soup (9 numbers a triangle). */
const vol = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i + 9 <= v.length; i += 9)
    s += (v[i] * (v[i + 4] * v[i + 8] - v[i + 5] * v[i + 7]) - v[i + 1] * (v[i + 3] * v[i + 8] - v[i + 5] * v[i + 6]) + v[i + 2] * (v[i + 3] * v[i + 7] - v[i + 4] * v[i + 6])) / 6;
  return s;
};

describe('the parts\' files', { timeout: 300000 }, () => {
  it('the 45° double slip, track only: each file closed, no triangle without area, the part and its supports', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      clearBuildCache();
      const b = buildDesign(await kernel(), structuredClone(TEMPLATES['Double slip (45°, R40)']));
      for (const p of b.pieces.filter((q) => q.stl.length)) {
        const dv = new DataView(p.stl.buffer, p.stl.byteOffset, p.stl.byteLength), n = dv.getUint32(80, true);
        const ids = new Map<string, number>(), tris: number[] = [], xs: number[] = [];
        for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
          const o = 84 + t * 50 + 12 + k * 12, q = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)], key = q.join(',');
          let id = ids.get(key);
          if (id === undefined) { id = ids.size; ids.set(key, id); }
          tris.push(id); xs.push(...q);
        }
        const edges = new Map<string, number>();
        let degenerate = 0;
        for (let t = 0; t < tris.length; t += 3) {
          const [a, c, d] = [tris[t], tris[t + 1], tris[t + 2]];
          if (a === c || c === d || d === a) degenerate++;
          for (const [i, j] of [[a, c], [c, d], [d, a]]) edges.set(`${i},${j}`, (edges.get(`${i},${j}`) ?? 0) + 1);
        }
        const open = [...edges].filter(([k, c]) => { const [i, j] = k.split(','); return (edges.get(`${j},${i}`) ?? 0) !== c; }).length;
        expect([p.name, degenerate, open]).toEqual([p.name, 0, 0]);
        // (the file moved onto the bed: its volume the part's as built, and its breakaway supports')
        expect(vol(xs)).toBeCloseTo(vol(p.positions) + (p.supports ? vol(p.supports) : 0), 1);
      }
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
