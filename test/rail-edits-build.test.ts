// (expert, stage 5b) Rails edited by hand, built: a gap, guard rails along a stretch on one side, a check rail added
// by hand, square rail ends at a cut, and a frog's flangeway open or run through. Each is where it says in the
// printed part; taken off again, the files are byte for byte what they were.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, type DRoute, TEMPLATES } from '../src/app/design';

type Built = ReturnType<typeof buildDesign>;
const hashes = (b: Built) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex')).sort();
/** Is there printed material at x, y, z (mm)? A ray straight up from there crosses the parts' surfaces an odd number of times. */
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
const one = (routes: DRoute[], more: Partial<Design['options']> = {}): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', splitTrack: 'bed', printBedX: 400, printBedY: 400, ...more }, routes });
// (heights, mm: the bed's top 3.2; a rail's foot to 3.6 up, 3 mm either side of its line at 20 mm; its web 1.25 either
// side, up to 9.4; a check rail's and a guard rail's tops)
const HEAD = 6.5, LOW = 4.2;
// (probes off the sweeps' rows of vertices and the rails' own lines, so a ray never runs down a triangle's edge)
const Y = (studs: number) => studs * 8 + 0.37, RX = 20.6;

describe('rails edited by hand, built', { timeout: 600000 }, () => {
  it('a gap through both rails at 16 studs, the left one at 24 (2 mm): no rail there, rail either side', async () => {
    const w = await kernel();
    clearBuildCache();
    const plain = buildDesign(w, one([straight()]));
    const b = buildDesign(w, one([straight({ railEdits: { gaps: [{ at: 16, side: 'both' }, { at: 24, side: 'left', w: 2 }] } })]));
    expect(b.info.warnings).toEqual([]);
    for (const x of [-RX, RX]) {
      expect(solidAt(plain, x, Y(16) - 0.2, HEAD)).toBe(true);
      expect(solidAt(b, x, Y(16) - 0.2, HEAD), `gap at ${x}`).toBe(false);
      expect(solidAt(b, x, Y(16) - 0.2, LOW), `no rail down to the bed at ${x}`).toBe(false);
      expect(solidAt(b, x, Y(16) + 1.2, HEAD), `rail past it at ${x}`).toBe(true);
    }
    expect(solidAt(b, -RX, Y(24) + 0.2, HEAD)).toBe(false);
    expect(solidAt(b, RX, Y(24) + 0.2, HEAD)).toBe(true);
    // (the bed under it is whole)
    expect(solidAt(b, -RX, Y(16) - 0.2, 2.8)).toBe(solidAt(plain, -RX, Y(16) - 0.2, 2.8));
    // (taken off again: byte for byte)
    expect(hashes(buildDesign(w, one([straight()])))).toEqual(hashes(plain));
  });
  it('guard rails inside the right rail from 8 to 24 studs; a check rail added inside the left from 12 to 20', async () => {
    const w = await kernel();
    const plain = buildDesign(w, one([straight()]));
    const b = buildDesign(w, one([straight({ railEdits: { guards: [{ from: 8, to: 24, side: 'right' }], checks: [{ from: 12, to: 20, side: 'left' }] } })]));
    expect(b.info.warnings).toEqual([]);
    // (the guard rail 0.8 studs in from the right rail's head: its line at 20 - 2.5 - 6.4 = 11.1 mm)
    expect(solidAt(b, 11.4, Y(16), LOW + 1)).toBe(true);
    expect(solidAt(b, -11.4, Y(16), LOW + 1)).toBe(false);
    expect(solidAt(b, 11.4, Y(5), LOW + 1)).toBe(false);
    expect(solidAt(plain, 11.4, Y(16), LOW + 1)).toBe(false);
    // (the check rail 3 mm in from the left rail's head: from -15.75 to -14.75 mm)
    expect(solidAt(b, -15.1, Y(16), LOW)).toBe(true);
    expect(solidAt(b, -15.1, Y(10), LOW)).toBe(false);
    expect(solidAt(b, 15.1, Y(16), LOW)).toBe(false);
    expect(solidAt(plain, -15.1, Y(16), LOW)).toBe(false);
  });
  it('square rail ends where a part is cut through: different files from tongued, and back again when taken off', async () => {
    // (two tracks 9 studs apart, one part, 48 studs long on a 256 mm bed: cut across, the rails with tongues there)
    const w = await kernel(), opt = { printBedX: 256, printBedY: 256 }, two = (more: Partial<DRoute> = {}) => [straight(more, 48), straight({ name: 'B', x: 9, ...more }, 48)];
    const plain = buildDesign(w, one(two(), opt)), sq = buildDesign(w, one(two({ railEdits: { ends: 'square' } }), opt));
    expect(plain.pieces.length).toBeGreaterThan(1);
    expect(sq.pieces.length).toBe(plain.pieces.length);
    expect(hashes(sq)).not.toEqual(hashes(plain));
    clearBuildCache();
    expect(hashes(buildDesign(w, one(two(), opt)))).toEqual(hashes(plain));
  });
  it('a long straight built in lengths keeps its gap and its check rail', async () => {
    const w = await kernel(), opt = { printBedX: 256, printBedY: 256 };
    const b = buildDesign(w, one([straight({ railEdits: { gaps: [{ at: 40, side: 'right' }], checks: [{ from: 10, to: 16, side: 'left' }] } }, 64)], opt));
    expect(b.pieces.length).toBeGreaterThan(1);
    expect(solidAt(b, RX, Y(40) - 0.2, HEAD)).toBe(false);
    expect(solidAt(b, RX, Y(39), HEAD)).toBe(true);
    expect(solidAt(b, -15.1, Y(13), LOW)).toBe(true);
  });
  it('a frog\'s flangeway cut open to the bed, or the rail run through it uncut (and warned of)', async () => {
    const w = await kernel(), d = structuredClone(TEMPLATES['90° crossing']);
    const plain = buildDesign(w, structuredClone(d));
    const g = plain.overlay.items.find((it) => it.kind === 'groove')!;
    expect(g).toBeDefined();
    const [x, y] = g.at;
    // (the groove's middle: its head cut down 3 mm, the rail below it there)
    expect(solidAt(plain, x, y, 8.6)).toBe(false);
    expect(solidAt(plain, x, y, LOW)).toBe(true);
    const open = buildDesign(w, { ...structuredClone(d), trackwork: { groove: { [g.key]: { open: true } } } });
    expect(solidAt(open, x, y, LOW)).toBe(false);
    const thr = buildDesign(w, { ...structuredClone(d), trackwork: { groove: { [g.key]: { through: true } } } });
    expect(solidAt(thr, x, y, 7.5)).toBe(true);
    expect(thr.info.warnings.join('\n')).toMatch(/rail runs through the frog by hand: wheels on .* can't pass there/);
    clearBuildCache();
    expect(hashes(buildDesign(w, structuredClone(d)))).toEqual(hashes(plain));
  });
});
