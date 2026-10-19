// Designs into pieces: a switch wherever routes split.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';

describe('designs into pieces', () => {
  it('the LEGO left switch is one switch: base, points, throw, lever, as switch.scad builds it', async () => {
    const b = buildDesign(await kernel(), TEMPLATES['Left switch (LEGO)']);
    expect(b.info.warnings).toEqual([]);
    expect(b.pieces.map((p) => p.name)).toEqual(['switch-base', 'switch-points', 'switch-throw', 'switch-lever']);
    // (the same routes as switch.scad's left R40 s_curve: its tube underside base)
    expect(b.info.volume).toBeGreaterThan(54980);
  });
  for (const [name, n, sets] of [['Right switch (LEGO)', 1, 1], ['Wye switch', 1, 1], ['Three-way switch', 1, 2]] as const)
    it(`${name}: ${n} switch, ${sets} points set${sets > 1 ? 's' : ''}`, async () => {
      const b = buildDesign(await kernel(), TEMPLATES[name]);
      expect(b.info.warnings).toEqual([]);
      expect(b.info.switches).toBe(n);
      expect(b.pieces.filter((p) => /points/.test(p.name))).toHaveLength(sets);
    });
  it('a branch drawn off the middle of a track: plain track up to it, then a switch', async () => {
    const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, routes: [
      { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
      { name: 'Branch', x: 0, y: 16, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
    ] });
    expect(b.info.warnings).toEqual([]);
    expect(b.info.switches).toBe(1);
    expect(b.pieces[0].name).toBe('track');
  });
});
