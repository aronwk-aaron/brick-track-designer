// Can it be put together? Every moving part must go in the way it's meant
// to (the slider and the points from below; with the layered points from
// above; the bracket and the lever from above) without passing through the
// track, and nothing may overlap the track once in.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES, type Design } from '../src/app/design';

const crossover: Design = { version: 1, gaugeStuds: 4, routes: [
  { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'X', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'curve', radius: 40, angle: 22.5 }] },
] };
const crossoverT = () => crossover;
const cases: [string, Design][] = [
  ['left switch', TEMPLATES['Left switch (LEGO)']],
  ['left switch, points on tines', { ...TEMPLATES['Left switch (LEGO)'], options: { mechStyle: 'tines' } }],
  ['crossover, points on tines', { ...crossoverT(), options: { mechStyle: 'tines' } }],
  ['wye on ballast', { ...TEMPLATES['Wye switch'], options: { ballast: 'buddy' } }],
  ['left switch, lever on a bracket', { ...TEMPLATES['Left switch (LEGO)'], options: { throwStyle: 'bracket' } }],
  ['left switch on ballast, layered points', { ...TEMPLATES['Left switch (LEGO)'], options: { ballast: 'buddy', pointsModule: 'layers', mechStyle: 'tines' } }],
  ['crossover', crossover],
  ['left switch, 4DBrix points', { ...TEMPLATES['Left switch (LEGO)'], options: { mechStyle: '4dbrix' } }],
  ['wye on ballast, 4DBrix points', { ...TEMPLATES['Wye switch'], options: { ballast: 'buddy', mechStyle: '4dbrix' } }],
  ['crossover, 4DBrix points', { ...crossover, options: { mechStyle: '4dbrix' } }],
];

describe('every switch can be put together', { timeout: 120000 }, () => {
  for (const [name, d] of cases)
    it(name, async () => {
      const w = await kernel();
      const b = buildDesign(w, { ...d, options: { printBedX: 2000, printBedY: 2000, ...d.options } });
      const man = (p: { positions: Float32Array }) => {
        const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
        mesh.merge();
        return new w.Manifold(mesh);
      };
      // (the lid goes on last: the parts go in without it, then it goes on from above over them)
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man));
      const moving = b.pieces.filter((q) => /points|throw/.test(q.name)).map(man); // (the lever goes in after the lid)
      const fromTop = d.options?.pointsModule === 'layers', bladesTop = (d.options?.mechStyle ?? '4dbrix') === '4dbrix';
      const problems: string[] = [];
      for (const p of b.pieces.filter((q) => /points|throw|lever|bracket/.test(q.name))) {
        // (4DBrix's blades go in from above, the slider still from below)
        const m = man(p), dir = /lever|bracket/.test(p.name) || fromTop || (bladesTop && !/throw/.test(p.name)) ? 1 : -1;
        for (const dz of [0, 1, 2, 3, 4, 6, 8, 12, 16]) {
          const v = m.translate([0, 0, dir * dz]).intersect(track).volume();
          if (v > 0.5) { problems.push(`${p.name} ${dz} mm ${dir > 0 ? 'up' : 'down'}: ${v.toFixed(1)} mm3 in the track`); break; }
        }
      }
      for (const p of b.pieces.filter((q) => /lid/.test(q.name))) {
        const m = man(p), others = w.Manifold.union([track, ...moving]);
        for (const dz of [0, 1, 2, 4, 8, 16]) { const v = m.translate([0, 0, dz]).intersect(others).volume(); if (v > 0.5) { problems.push(`${p.name} ${dz} mm up: ${v.toFixed(1)} mm3 in the rest`); break; } }
      }
      expect(problems).toEqual([]);
    });
});
