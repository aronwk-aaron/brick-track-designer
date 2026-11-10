// (snap-clamp.test.ts) Where the clamp can't go, and the cases the spring before it got wrong.
import { built, describe, expect, it, man, snapOpts, TEMPLATES } from './snap.shared';

describe('the snap clamp where it can\'t go', { timeout: 600000 }, () => {
  it('a three-way, a switch stand, sprung blades with the lever on a bracket or on ballast: no use or no room for it, so built as without it, and said', async () => {
    for (const [name, o, why] of [['Three-way switch (one throw)', {}, /three positions: the snap clamp has two/], ['Left switch (LEGO)', { throwStyle: 'stand' }, /switch stand locks the points/],
      ['Left switch (LEGO)', { bladeStyle: 'sprung', throwStyle: 'bracket' }, /no room for a set of points' snap clamp/], ['Left switch (LEGO)', { bladeStyle: 'sprung', ballast: 'ballast' }, /no room for a set of points' snap clamp/]] as [string, object, RegExp][]) {
      const { b, springs } = await built(TEMPLATES[name], { ...snapOpts, ...o });
      expect(springs, name).toHaveLength(0);
      expect(b.info.warnings.filter((x) => why.test(x)), name).toHaveLength(1);
      const plain = await built(TEMPLATES[name], { ...snapOpts, ...o, throwAction: 'detent' });
      expect(b.pieces.map((q) => [q.name, q.positions.length])).toEqual(plain.b.pieces.map((q) => [q.name, q.positions.length]));
    }
  });
  it('with one moving blade and a lever, the slider reaches the clamp\'s post (the spring before it had its post off the slider\'s end)', async () => {
    const { w, springs, throws } = await built(TEMPLATES['Left switch (LEGO)'], { ...snapOpts, pointBlades: 1 });
    expect(springs).toHaveLength(1);
    expect(man(w, throws[0].positions).decompose().length).toBe(1);
    expect(man(w, springs[0].positions).minGap(man(w, throws[0].positions), 2)).toBeLessThan(0.05);
  });
  it('nail switches: a clamp where there\'s room between the blades; where there isn\'t (sprung blades), the over-centre spring as before, and said', async () => {
    const rigid = await built(TEMPLATES['Left switch (LEGO)'], { ...snapOpts, throwStyle: 'nail' }), sprung = await built(TEMPLATES['Left switch (LEGO)'], { ...snapOpts, bladeStyle: 'sprung', throwStyle: 'nail' });
    expect(man(rigid.w, rigid.springs[0].positions).decompose().length).toBe(3);
    expect(man(sprung.w, sprung.springs[0].positions).decompose().length).toBe(1);
    expect(rigid.b.info.warnings.filter((x) => /clamp/.test(x))).toEqual([]);
    expect(sprung.b.info.warnings.filter((x) => /no room for a set of points' snap clamp/.test(x))).toHaveLength(1);
  });
  it('the over-centre spring with one moving blade and a lever: its post on the slider (it was past the bar\'s end, on nothing)', async () => {
    const { w, springs, throws } = await built(TEMPLATES['Left switch (LEGO)'], { bladeStyle: 'simple', throwAction: 'overcentre', pointBlades: 1 });
    expect(springs).toHaveLength(1);
    expect(man(w, throws[0].positions).decompose().length).toBe(1);
    // (its middle ring round the post: the fit's clearance off it)
    expect(man(w, springs[0].positions).minGap(man(w, throws[0].positions), 2)).toBeLessThan(0.35);
  });
});
