// (expert, stage 3) One running rail at a time, built: a stretch of one rail taken out is no rail there, down to the
// bed's top, the other rail and the bed whole; a rail cut back at the track's end; nothing else of the part changes
// (its volume less only the rail taken out); put back, the files are byte for byte what they were.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import type { Design, DRoute } from '../src/app/design';
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
const straight = (more: Partial<DRoute> = {}, studs = 32): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const one = (routes: DRoute[]): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', printBedX: 400, printBedY: 400 }, routes });
/** Each printed part is one solid: nothing left loose where a rail is taken out (its stub in an end connector goes with it). */
const loose = (w: Awaited<ReturnType<typeof kernel>>, b: Built) => b.pieces.flatMap((p) => { const m = p.positions.length ? solid(w, p.positions) : undefined; if (!m) return []; const n = m.decompose().filter((q) => q.volume() > 0.01).length; m.delete(); return n > 1 ? [`${p.name}: ${n} pieces`] : []; });
const HEAD = 6.5, LOW = 4.2, BED = 2.8, Y = (studs: number) => studs * 8 + 0.37, RX = 20.6;

describe('one running rail at a time, built', { timeout: 600000 }, () => {
  it('the left rail taken out from 10 to 14 studs and cut back 4 at the start: no rail there, the right rail and the bed whole', async () => {
    const w = await kernel();
    clearBuildCache();
    const plain = buildDesign(w, one([straight()]));
    const b = buildDesign(w, one([straight({ railEdits: { out: [{ side: 'left', from: 0, to: 4 }, { side: 'left', from: 10, to: 14 }] } })]));
    expect(b.info.warnings).toEqual([]);
    for (const at of [12, 2]) {
      expect(solidAt(plain, -RX, Y(at), HEAD)).toBe(true);
      expect(solidAt(b, -RX, Y(at), HEAD), `no left rail at ${at}`).toBe(false);
      expect(solidAt(b, -RX, Y(at), LOW), `none down to the bed at ${at}`).toBe(false);
      expect(solidAt(b, RX, Y(at), HEAD), `the right rail at ${at}`).toBe(true);
      expect(solidAt(b, -RX, Y(at), BED), `the bed under it at ${at}`).toBe(solidAt(plain, -RX, Y(at), BED));
    }
    for (const at of [8, 16, 30]) expect(solidAt(b, -RX, Y(at), HEAD), `the left rail on at ${at}`).toBe(true);
    // (one part, as before, and one solid: the left rail's stub in the end connector at the start went with it)
    expect(b.pieces.length).toBe(plain.pieces.length);
    expect(loose(w, b)).toEqual([]);
    // (put back: byte for byte)
    expect(hashes(buildDesign(w, one([straight()])))).toEqual(hashes(plain));
  });
  it('the whole right rail taken out: no right rail anywhere, the left whole', async () => {
    const w = await kernel();
    const b = buildDesign(w, one([straight({ railEdits: { out: [{ side: 'right', from: 0, to: 32 }] } })]));
    expect(b.info.warnings).toEqual([]);
    for (const at of [1, 16, 31]) { expect(solidAt(b, RX, Y(at), HEAD), `no right rail at ${at}`).toBe(false); expect(solidAt(b, -RX, Y(at), HEAD), `left rail at ${at}`).toBe(true); }
    expect(loose(w, b)).toEqual([]);
  });
  it('across a cut between two parts: each part has its share taken out', async () => {
    const w = await kernel();
    clearBuildCache();
    const d = one([straight({ cuts: [16], railEdits: { out: [{ side: 'left', from: 12, to: 20 }] } })]);
    d.options = { ...d.options, splitTrack: 'lengths' };
    const b = buildDesign(w, d);
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.filter((p) => p.positions.length).length).toBeGreaterThanOrEqual(2);
    for (const at of [13, 15, 17.5, 19]) expect(solidAt(b, -RX, Y(at), HEAD), `no left rail at ${at}`).toBe(false);
    for (const at of [10, 22]) expect(solidAt(b, -RX, Y(at), HEAD), `left rail at ${at}`).toBe(true);
  });
});
