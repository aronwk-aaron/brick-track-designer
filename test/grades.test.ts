import { describe, expect, it } from 'vitest';
import { buildDesign, gradeOf, legoParts } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

describe('train track on a grade', { timeout: 300000 }, () => {
  it('2.5%: a plate a 16-stud straight; lifted in the view, printed level, risers in the parts list', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'Up', x: 0, y: 0, heading: 0, monoHeight: 0, monoHeightEnd: 4, segs: [{ kind: 'straight', studs: 64 }] }] };
      expect(gradeOf(d.routes[0])).toBeCloseTo(2.5, 6);
      const b = buildDesign(await kernel(), d);
      expect(b.info.warnings).toEqual([]);
      // (the four straights: each a plate higher than the last, in the view)
      const tops = b.pieces.filter((p) => p.positions.length && p.lego?.[0].part === '53401').map((p) => { let z = -Infinity; for (let i = 2; i < p.positions.length; i += 3) z = Math.max(z, p.positions[i]); return z; }).sort((a, c) => a - c);
      expect(tops).toHaveLength(4);
      for (let k = 1; k < 4; k++) expect(tops[k] - tops[k - 1]).toBeCloseTo(3.2, 1);
      // (risers every 16 studs: 0, 1, 2, 3, 4 plates: 3 + 1 plates, one brick each for 3 and 4)
      const q = Object.fromEntries(legoParts(b.pieces).map((p) => [p.part, p.qty]));
      expect([q['3007'], q['3034']]).toEqual([2, 4]);
      // (steeper: a warning)
      const steep = buildDesign(await kernel(), { ...d, routes: [{ ...d.routes[0], monoHeightEnd: 8 }] });
      expect(steep.info.warnings.some((s) => /climbs 5\.0%: too steep/.test(s))).toBe(true);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
