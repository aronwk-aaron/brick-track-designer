// (snap-clamp.test.ts) The clamp on the templates.
import { built, describe, expect, it, man, snapOpts, stl, TEMPLATES } from './snap.shared';

describe('the snap clamp on the templates', { timeout: 600000 }, () => {
  for (const [name, o] of [['Left switch (LEGO)', {}], ['Right switch (LEGO)', {}], ['Wye switch', {}], ['Crossover (R40)', {}], ['Double slip (45°, R40)', {}],
    ['Left switch (LEGO)', { bladeStyle: 'sprung' }], ['Right switch (LEGO)', { bladeStyle: 'sprung' }], ['Crossover (R40)', { bladeStyle: 'sprung' }]] as [string, object][])
    it(`${name}${'bladeStyle' in o ? ', sprung blades' : ''}: a clamp at each set of points, clear of everything, each a part that fits the bed`, async () => {
    const { w, b, springs, throws, blades, track } = await built(TEMPLATES[name], { ...snapOpts, ...o });
    expect(springs.length).toBe(throws.length);
    expect(b.info.warnings.filter((x) => /snap clamp/.test(x))).toEqual([]);
    const levers = b.pieces.filter((q) => /lever|bracket/.test(q.name));
    for (const sp of springs) {
      const m = man(w, sp.positions), pr = stl(w, sp.stl), bb = pr.boundingBox();
      expect(m.decompose().length, sp.name).toBe(3);
      expect(m.intersect(track).volume(), sp.name).toBeLessThan(0.01);
      for (const q of [...blades, ...throws, ...levers]) expect(m.intersect(man(w, q.positions)).volume(), `${sp.name} in ${q.name}`).toBeLessThan(0.01);
      expect(Math.min(...throws.map((q) => m.minGap(man(w, q.positions), 2))), sp.name).toBeLessThan(0.05);
      // (as printed: on the bed, three bodies, small)
      expect(pr.decompose().length).toBe(3);
      expect(bb.min[2]).toBeCloseTo(0, 3);
      expect(Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1])).toBeLessThan(40);
    }
  });
});
