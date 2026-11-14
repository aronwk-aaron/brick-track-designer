// Aaron's 196s R568 crossover (his saved design, trimmed to its south end: test/fixtures/196s-r568-south.btd.json;
// two straights 16 studs apart, R568 branches leaving each, on ballast with the buddy, 'edges' grip, anti-stud
// bottoms, a 64 baseplate, a 128 x 128 print bed, his levers' sides and offsets): "there aren't studs on the top of the
// outside of the rails where the switches are". The bed's studs stopped along the points: crossingPiece kept every stud
// out of the box round what the points add (their bed, out to the sleepers' ends, and the arm), so the row outside
// each stock rail broke off from the toe to the heel. Now it runs on, off only round the throw's arm (network.ts
// studsOffOf), on the stud grid (crossing.ts); none overlap or touch, none is cut.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { studFaults, studsOf } from './studs-apart.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const D: Design = JSON.parse(fs.readFileSync(new URL('./fixtures/196s-r568-south.btd.json', import.meta.url), 'utf8'));
type Pt = [number, number];

describe('studs outside the rails along the points (196s R568)', { timeout: 600000 }, () => {
  it('the rows outside the stock rails run on along both points, clear of the throw\'s arm', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(D));
      const o = { studD: 4.8, studFit: 0.18 };
      // (the routes' middles: the straights at x = -64 and +64 mm, the branches round R568 = 4544.5 mm from y = 8)
      const R = 568.0625 * 8, arcs = [-64 + R, 64 - R];
      const lat = (q: Pt) => Math.min(Math.abs(Math.abs(q[0]) - 64), ...arcs.map((cx) => Math.abs(Math.hypot(q[0] - cx, q[1] - 8) - R)));
      // (the studs on the top, inside the sleepers' ends (32 out); none of them cut where the print bed's cuts part the
      // track: each a stud's radius inside its part's box. The ballast's steps aren't checked: one on the mid step beside a
      // branch, at 25.6, 153.6, is cut at 152 on main too)
      const cut: string[] = [];
      const top: Pt[] = b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => {
        const P = p.positions, r = (o.studD + o.studFit) / 2 - 0.05, on = studsOf(w, p, o).studs.flat().filter((q) => lat(q) < 32);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
        for (const q of on) if (q[0] - r < x0 || q[0] + r > x1 || q[1] - r < y0 || q[1] + r > y1) cut.push(`${p.name}: ${q.map((v) => v.toFixed(1)).join(', ')}`);
        return on;
      });
      expect(cut, 'studs cut by a part\'s edge').toEqual([]);
      const near = (x: number, y: number) => top.some((q) => Math.abs(q[0] - x) < 0.3 && Math.abs(q[1] - y) < 0.3);
      // (the straights at x = -64 and +64 mm, their sleepers 64 wide: a row 28 out, past the stock rail; the points from
      // y 16 to 250, their throw's arm across y 16 to 40)
      const missing: string[] = [];
      for (const x of [-92, 92]) for (let y = 44; y <= 244; y += 8) if (!near(x, y)) missing.push(`${x}, ${y}`);
      expect(missing, 'outside the straights\' stock rails').toEqual([]);
      for (const x of [-92, 92]) for (const y of [20, 28, 36]) expect(near(x, y), `none on the arm at ${x}, ${y}`).toBe(false);
      // (and on the branch's side, the straight's row there (28 in, on the grid) on along the points until the branch's rail
      // comes too near; off the grid, along the branch, none: the bed's cuts run on the grid's lines)
      const branch: string[] = [];
      for (const x of [-36, 36]) for (let y = 44; y <= 116; y += 8) if (!near(x, y)) branch.push(`${x}, ${y}`);
      expect(branch, 'beside the branches\' stock rails').toEqual([]);
      expect(studFaults(w, b.pieces, () => o), 'studs that touch').toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
