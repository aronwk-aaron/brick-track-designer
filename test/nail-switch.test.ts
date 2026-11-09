import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

describe('nail switches (Throw: Nail switch), as the reference double slips\' inner points', { timeout: 600000 }, () => {
  it('the double slip: no levers, each set\'s slider under its points held by an over-centre spring', async () => {
    const b = buildDesign(await kernel(), TEMPLATES['Double slip (22.5°)']);
    const names = b.pieces.map((p) => p.name);
    expect(names.filter((n) => /lever|bracket/.test(n))).toEqual([]);
    expect(names.filter((n) => /-throw$/.test(n))).toHaveLength(4);
    expect(names.filter((n) => /-spring$/.test(n))).toHaveLength(4);
    // (each slider short: no arm out to a lever, under 40 mm along its throw)
    for (const p of b.pieces.filter((q) => /-throw$/.test(q.name))) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < p.positions.length; i += 3) { x0 = Math.min(x0, p.positions[i]); x1 = Math.max(x1, p.positions[i]); y0 = Math.min(y0, p.positions[i + 1]); y1 = Math.max(y1, p.positions[i + 1]); }
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(45);
    }
  });
});
