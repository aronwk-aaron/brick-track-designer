// A double slip (as the reference double slip R104): two tracks crossing at
// 22.5 degrees and a slip road each way. Its four sets of points are in the
// middle, each set's toes past where the other track crosses in, and the
// other track's rails cross the blades only near their heels (notched there).
// Blades on top don't fit between its rails: built on tines under the bed.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';

describe('double slip', () => {
  for (const [name, more, note] of [['two blades a set: on tines', {}, true], ['one blade a set (single point): on top', { pointBlades: 1 as const }, false],
    ['sprung blades on ballast: sprung in the slip too (their plates cut clear of the other track, the pockets\' walls kept)', { pointBlades: 1 as const, bladeStyle: 'sprung' as const, ballast: 'ballast' as const }, false]] as const)
    it(`${name}: four sets of points, nothing in the track`, async () => {
      const w = await kernel(), b = buildDesign(w, { ...TEMPLATES['Double slip (22.5°)'], options: { printBedX: 2000, printBedY: 2000, ...more } });
      expect(b.overlay.issues).toEqual([]);
      expect(b.info.warnings.some((x) => /built on tines under the bed, the blades notched/.test(x))).toBe(note);
      if ('bladeStyle' in more) expect(b.info.warnings.some((x) => /blades are rigid/.test(x))).toBe(false);
      const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever/.test(p.name)).map((p) => man(p.positions)));
      const moving = b.pieces.filter((p) => /points/.test(p.name));
      expect(moving.filter((p) => /lever/.test(p.name)).length).toBe(4);
      for (const p of moving) expect(man(p.positions).intersect(track).volume(), p.name).toBeLessThan(0.5);
    }, 300000);

  it('sprung blades on track alone: no room for the lips over their fronts (the other sets\' blades, the other track), said; nothing in the track', async () => {
    const w = await kernel(), b = buildDesign(w, { ...TEMPLATES['Double slip (22.5°)'], options: { printBedX: 2000, printBedY: 2000, pointBlades: 1, bladeStyle: 'sprung' } });
    expect(b.info.warnings.some((x) => /has no lip to hold it down/.test(x))).toBe(true);
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever/.test(p.name)).map((p) => man(p.positions)));
    for (const p of b.pieces.filter((q) => /points/.test(q.name) && !/throw|lever/.test(q.name))) expect(man(p.positions).intersect(track).volume(), p.name).toBeLessThan(0.5);
  }, 300000);
});
