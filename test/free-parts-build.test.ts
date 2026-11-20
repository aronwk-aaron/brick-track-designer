// (expert, stage 4) Rails and sleepers laid by hand, built (freeparts.ts, build.ts freeSolids, withFree,
// freeLeftovers): over a track's part, part of it (its share, from above the underside's hollow up), the part still one
// solid; off every part, a part of its own lying on the bed; half on, half off: the part takes its share, the rest
// prints on its own. Without any, the files are byte for byte what they were.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import type { Design, DRoute } from '../src/app/design';
import type { FreeItem } from '../src/app/freeparts';
import { solid } from './assembled.shared';

type Built = ReturnType<typeof buildDesign>;
const hashes = (b: Built) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex')).sort();
function solidAt(b: Built, x: number, y: number, z: number): boolean {
  let n = 0;
  for (const p of b.pieces) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 9) {
      const ax = v[i] - x, ay = v[i + 1] - y, bx = v[i + 3] - x, by = v[i + 4] - y, cx = v[i + 6] - x, cy = v[i + 7] - y;
      const d0 = ax * by - ay * bx, d1 = bx * cy - by * cx, d2 = cx * ay - cy * ax;
      if (!((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0))) continue;
      const t = d0 + d1 + d2, zz = (d1 * v[i + 2] + d2 * v[i + 5] + d0 * v[i + 8]) / t;
      if (zz > z) n++;
    }
  }
  return n % 2 === 1;
}
const loose = (w: Awaited<ReturnType<typeof kernel>>, b: Built) => b.pieces.flatMap((p) => { const m = p.positions.length ? solid(w, p.positions) : undefined; if (!m) return p.positions.length ? [`${p.name}: not a closed solid`] : []; const n = m.decompose().filter((q) => q.volume() > 0.01).length; m.delete(); return n > 1 ? [`${p.name}: ${n} pieces`] : []; });
/** A part's file's lowest z (it lies on the bed: 0). */
const fileLow = (p: Built['pieces'][number]) => { const dv = new DataView(p.stl.buffer, p.stl.byteOffset, p.stl.byteLength), n = dv.getUint32(80, true); let lo = Infinity; for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) lo = Math.min(lo, dv.getFloat32(84 + t * 50 + 12 + k * 12 + 8, true)); return lo; };
const straight: DRoute = { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] };
const one = (free?: FreeItem[]): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', printBedX: 400, printBedY: 400 }, routes: [straight], ...(free && { expert: { free } }) });
const HEAD = 7.5;

describe('rails and sleepers laid by hand, built', { timeout: 600000 }, () => {
  it('a rail down the middle of a track: part of its part, one solid; none: as it was', async () => {
    const w = await kernel();
    clearBuildCache();
    const plain = buildDesign(w, one());
    const b = buildDesign(w, one([{ id: 'f1', kind: 'rail', a: [0, 4], b: [0, 20] }]));
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.map((p) => p.name)).toEqual(plain.pieces.map((p) => p.name));
    expect(solidAt(plain, 0.37, 12 * 8 + 0.37, HEAD)).toBe(false);
    expect(solidAt(b, 0.37, 12 * 8 + 0.37, HEAD), 'the rail laid by hand').toBe(true);
    expect(solidAt(b, 0.37, 2 * 8 + 0.37, HEAD), 'not past its end').toBe(false);
    // (the underside's hollow under it as it was: nothing in it below 2 mm)
    expect(solidAt(b, 0.37, 12 * 8 + 0.37, 1.0)).toBe(solidAt(plain, 0.37, 12 * 8 + 0.37, 1.0));
    expect(loose(w, b)).toEqual([]);
    expect(hashes(buildDesign(w, one()))).toEqual(hashes(plain));
  });
  it('a rail and a sleeper off the track: each a part of its own, on the bed', async () => {
    const w = await kernel();
    const b = buildDesign(w, one([{ id: 'f1', kind: 'rail', a: [20, 0], b: [20, 10] }, { id: 'f2', kind: 'sleeper', at: [30, 5], heading: 0, len: 8 }]));
    const fr = b.pieces.filter((p) => p.name.startsWith('free-'));
    expect(fr.map((p) => p.name).sort()).toEqual(['free-f1', 'free-f2']);
    for (const p of fr) expect(Math.abs(fileLow(p)), `${p.name} lies on the bed`).toBeLessThan(1e-3);
    expect(solidAt(b, 20 * 8 + 0.37, 5 * 8 + 0.37, HEAD)).toBe(true);
    expect(solidAt(b, 30 * 8 + 0.37, 5 * 8 + 0.37, 1.6)).toBe(true);
    expect(loose(w, b)).toEqual([]);
  });
  it('a rail across the track, its ends past the sleepers: all of it the part\'s, its ends standing on the bed', async () => {
    const w = await kernel();
    const b = buildDesign(w, one([{ id: 'f1', kind: 'rail', a: [-7, 10], b: [7, 10] }]));
    expect(b.pieces.filter((p) => p.name.startsWith('free-')).map((p) => p.name)).toEqual([]);
    expect(solidAt(b, 0.37, 10 * 8 + 0.37, HEAD), 'over the track').toBe(true);
    for (const x of [-6, 6]) { expect(solidAt(b, x * 8 + 0.37, 10 * 8 + 0.37, HEAD), `its end at ${x}`).toBe(true); expect(solidAt(b, x * 8 + 0.37, 10 * 8 + 3.2, 0.3), `its foot on the bed at ${x}`).toBe(true); }
    expect(loose(w, b)).toEqual([]);
  });
  it('a rail across two tracks side by side, built as one part: all of it that part\'s', async () => {
    const w = await kernel();
    const d = one([{ id: 'f1', kind: 'rail', a: [-7, 10], b: [19, 10] }]);
    d.routes = [straight, { ...straight, name: 'Beside', x: 12 }];
    const b = buildDesign(w, d);
    expect(b.pieces.filter((p) => p.name.startsWith('free-')).map((p) => p.name)).toEqual([]);
    for (const x of [-6, 6, 18]) expect(solidAt(b, x * 8 + 0.37, 10 * 8 + 0.37, HEAD), `rail at ${x}`).toBe(true);
    expect(loose(w, b)).toEqual([]);
  });

  it('a hand cut where a rail is laid across the track: not made, and said; one part, never two in each other', async () => {
    const w = await kernel();
    const d = one([{ id: 'f1', kind: 'rail', a: [-7, 16], b: [7, 16] }]);
    d.routes = [{ ...straight, cuts: [16] }];
    d.options = { ...d.options, splitTrack: 'lengths' };
    const b = buildDesign(w, d);
    expect(b.info.warnings.some((x) => /hand cut at 0, 16 \(studs\) isn't made: a rail or sleeper laid by hand lies across it/.test(x)), b.info.warnings.join(' | ')).toBe(true);
    // (no part ends within 2 studs of the rail: the cut wasn't made there, nor one of the app's)
    const ends = b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); } return [lo / 8, hi / 8]; });
    expect(ends.filter((y) => y > 13.5 && y < 18.5), ends.join(', ')).toEqual([]);
    expect(loose(w, b)).toEqual([]);
  });
});
