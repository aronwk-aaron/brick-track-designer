// A double slip (as the reference double slip R104): two tracks crossing at
// 22.5 degrees and a slip road each way. Its four sets of points are in the
// middle, each set's toes past where the other track crosses in, and the
// other track's rails cross the blades only near their heels (notched there).
// Blades on top don't fit between its rails: built on tines under the bed.
// One blade a set (single point), on top: each set's plate beside the next
// set's, the room between them shared out (network.ts): no plate in another,
// wherever each set is thrown; sprung plates don't fit there, so rigid ones.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';

type Built = ReturnType<typeof buildDesign>;
/** Blade against blade, between sets: each pair, each closed and open (each set thrown on its own), the most they overlap (mm3). */
function bladesMeet(w: Awaited<ReturnType<typeof kernel>>, b: Built) {
  const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
  const bl = b.pieces.filter((p) => p.turn).map((p) => ({ set: p.name.replace(/-[ab]$/, ''), m: man(p.positions), t: p.turn! }));
  const turn = (x: (typeof bl)[number], a: number) => x.m.translate([-x.t.at[0], -x.t.at[1], 0]).rotate([0, 0, a]).translate([x.t.at[0], x.t.at[1], 0]);
  let most = 0;
  for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
    if (bl[i].set === bl[j].set) continue;
    for (const ai of [0, bl[i].t.swing ?? 0]) for (const aj of [0, bl[j].t.swing ?? 0]) most = Math.max(most, turn(bl[i], ai).intersect(turn(bl[j], aj)).volume());
  }
  return { most, n: bl.length };
}

describe('double slip', () => {
  for (const [name, more, note] of [['two blades a set: on tines', {}, true], ['one blade a set (single point): on top', { pointBlades: 1 as const }, false],
    ['sprung blades on ballast: rigid in the slip (no room for the sprung plates beside the next set\'s)', { pointBlades: 1 as const, bladeStyle: 'sprung' as const, ballast: 'ballast' as const }, false]] as const)
    it(`${name}: four sets of points, nothing in the track`, async () => {
      const w = await kernel(), b = buildDesign(w, { ...TEMPLATES['Double slip (22.5°)'], options: { printBedX: 2000, printBedY: 2000, ...more } });
      expect(b.overlay.issues).toEqual([]);
      expect(b.info.warnings.some((x) => /built on tines under the bed, the blades notched/.test(x))).toBe(note);
      if ('bladeStyle' in more) expect(b.info.warnings.some((x) => /blades are rigid.*next points' blades/.test(x))).toBe(true);
      // (one blade a set: each set's plate clear of the next set's, closed and open)
      if ('pointBlades' in more) { const mt = bladesMeet(w, b); expect(mt.n).toBe(4); expect(mt.most).toBeLessThan(0.01); }
      const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever/.test(p.name)).map((p) => man(p.positions)));
      const moving = b.pieces.filter((p) => /points/.test(p.name));
      expect(moving.filter((p) => /lever/.test(p.name)).length).toBe(4);
      for (const p of moving) expect(man(p.positions).intersect(track).volume(), p.name).toBeLessThan(0.5);
    }, 300000);

  it('sprung blades on track alone: rigid in the slip, each set\'s plate clear of the next set\'s closed and open; nothing in the track', async () => {
    const w = await kernel(), b = buildDesign(w, { ...TEMPLATES['Double slip (22.5°)'], options: { printBedX: 2000, printBedY: 2000, pointBlades: 1, bladeStyle: 'sprung' } });
    expect(b.info.warnings.some((x) => /blades are rigid.*next points' blades/.test(x))).toBe(true);
    const mt = bladesMeet(w, b);
    expect(mt.n).toBe(4);
    expect(mt.most).toBeLessThan(0.01);
    const man = (P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
    const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever/.test(p.name)).map((p) => man(p.positions)));
    for (const p of b.pieces.filter((q) => /points/.test(q.name) && !/throw|lever/.test(q.name))) expect(man(p.positions).intersect(track).volume(), p.name).toBeLessThan(0.5);
  }, 300000);
});
