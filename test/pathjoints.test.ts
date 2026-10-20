// Stepped cuts (pathsplit.ts) joined as the straight cuts are: axle holes, peg
// and clip, dovetails, rail-end tongues along the path's straight runs; and
// the parts still go together (nothing of one inside its neighbour but the
// joints' own snap fit, which the straight cuts have too).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad, type Man } from '../src/geom/scad';
import { DEFAULTS, Track } from '../src/geom/track';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { pathSplit } from '../src/geom/pathsplit';
import { buildDesign } from '../src/app/build';
import { crossover } from './assembly.shared';

// (a peg and clip's snap fit: 1.4 mm3 of the peg in the clip; a rail-end tongue's: 0.55)
const SNAP = { coupler: 1.45, tongue: 0.6 };

describe('stepped cuts are joined', { timeout: 120000 }, () => {
  for (const [joint, flatRails] of [['lego', true], ['lego', false], ['dovetail', false]] as const)
    it(`${joint}${flatRails ? ', rails cut flat (axle holes)' : ''}`, async () => {
      const w = await kernel(), s = new Scad(w), routes = toRoutes(TEMPLATES['22.5° crossing']);
      const m = crossingPiece(s, routes, { ...CROSSING_DEFAULTS, ballast: 'buddy' });
      const t = new Track(s, { ...DEFAULTS, gaugeStuds: 4 });
      // (a keep-out on the straight way across: the cut steps round it)
      const keep: [number, number, number][] = [[16, 96, 12]];
      const got = pathSplit(s, m, routes, t.c.railOffset, keep, 1, 96, { join: { t, joint, flatRails } })!;
      const plain = pathSplit(s, m, routes, t.c.railOffset, keep, 1, 96)!;
      expect(got.parts).toHaveLength(2);
      expect(got.runs.filter((r) => r.d[0] === 0).length).toBeGreaterThan(0); // (a step in it)
      expect(got.couplers).toBeGreaterThan(0);
      if (!flatRails) expect(got.tongues).toBeGreaterThan(0); else expect(got.tongues).toBe(0);
      const [a, b] = got.parts, vol = (ps: Man[]) => ps.reduce((v, p) => v + p.volume(), 0);
      const over = a.intersect(b).volume();
      if (flatRails) {
        expect(over).toBeLessThan(0.5);
        // (an axle hole each, two studs into each part: some 15 mm2 by 32 mm)
        expect(vol(plain.parts) - vol(got.parts)).toBeGreaterThan(300 * got.couplers);
      } else expect(over).toBeLessThan((joint === 'lego' ? got.couplers * SNAP.coupler : 0) + got.tongues * SNAP.tongue + 0.5);
    });
});

describe('a crossover cut to a small bed', { timeout: 300000 }, () => {
  it('fits the bed, its parts go together, and no cut crosses a slider', async () => {
    const w = await kernel();
    const b = buildDesign(w, { ...crossover, options: { printBedX: 128, printBedY: 128, ballast: 'buddy', cutRails: 'flat' } });
    expect(b.info.warnings).toEqual([]);
    const man = (p: { positions: Float32Array }) => {
      const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
      mesh.merge();
      return new w.Manifold(mesh);
    };
    const parts = b.pieces.filter((p) => /^track/.test(p.name)).map(man), problems: string[] = [];
    expect(parts.length).toBeGreaterThan(2);
    for (const [k, m] of parts.entries()) {
      const bb = m.boundingBox(), dx = bb.max[0] - bb.min[0], dy = bb.max[1] - bb.min[1];
      if (dx > 128 || dy > 128) problems.push(`part ${k + 1} is ${dx.toFixed(0)} x ${dy.toFixed(0)}`);
    }
    // (axle holes and plain rails: nothing of one part inside the next)
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const v = parts[i].intersect(parts[j]).volume();
      if (v > 0.5) problems.push(`parts ${i + 1} and ${j + 1} overlap by ${v.toFixed(1)} mm3`);
    }
    // (the slider lies in its tunnel in one part: no cut through it)
    const tops = parts.map((m) => m.project());
    for (const p of b.pieces.filter((q) => /throw/.test(q.name))) {
      const f = man(p).project(), on = tops.filter((tp) => tp.intersect(f).area() > 1).length;
      if (on !== 1) problems.push(`${p.name} lies over ${on} parts`);
    }
    expect(problems.join('; ')).toBe('');
  });
});
