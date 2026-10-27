// A lever with no place clear of trains beside its points (its side set by
// hand, a track running alongside there) goes further out, past that track,
// its slider under it in two parts (switch/base.ts fdbSplit): the bar in a
// closed tunnel, the posts on a short piece dropped in at the points. That
// track's rails and studs are left whole.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS } from '../src/app/design';
import { assemblySuite } from './assembly.shared';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchPlan } from '../src/switch/base';

// (M with a branch B leaving it to the right, its lever set to the left; N alongside on the left, 8 studs over)
export const boxedIn = (options: Design['options'] = {}): Design => ({ version: 1, gaugeStuds: 4, options: { ballast: 'ballast', pointBlades: 1, ...options }, routes: [
  { name: 'M', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 72 }] },
  { name: 'B', x: 0, y: 4, heading: 0, throwSide: 'left', segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
  { name: 'N', x: -8, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 72 }] },
] });

const meshOf = (w: Awaited<ReturnType<typeof kernel>>, p: { positions: Float32Array }) => {
  const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
  mesh.merge();
  return new w.Manifold(mesh);
};

describe('a lever past the track beside it', { timeout: 300000 }, () => {
  // (sprung blades, the default; and rigid ones)
  for (const [blades, o] of [['sprung', {}], ['rigid', { bladeStyle: 'simple' }]] as const)
    it(`${blades} blades: the lever out past N, the slider in two parts; N's rails and studs whole over the arm`, async () => {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, { ...boxedIn(o), options: { ...boxedIn(o).options, printBedX: 256, printBedY: 256 } });
      expect(b.info.warnings.filter((x: string) => /lever/.test(x))).toEqual([]);
      const bar = b.pieces.find((p) => p.name === 'points-throw')!, posts = b.pieces.find((p) => p.name === 'points-throw-posts');
      expect(posts).toBeDefined();
      // (the lever past N: left of N's left rail; N's centre line at x -64)
      const lever = meshOf(w, b.pieces.find((p) => /lever/.test(p.name))!).boundingBox();
      expect(lever.max[0]).toBeLessThan(-64 - 20);
      // (each part fits the print bed, as printed)
      for (const p of [bar, posts!]) { const bb = meshOf(w, p).boundingBox(); expect(Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1])).toBeLessThan(256); }
      // (N's rails over the arm as anywhere else along it: the same, above the bed's top, at the arm and well away from it)
      const track = w.Manifold.union(b.pieces.filter((p) => !/points|throw|lever|bracket|lid/.test(p.name)).map((p) => meshOf(w, p)));
      const sl = meshOf(w, bar).boundingBox(), yArm = (sl.min[1] + sl.max[1]) / 2;
      const railAt = (y: number) => [-84, -44].map((x) => track.intersect(w.Manifold.cube([10, 16, 7]).translate([x - 5, y - 8, 3.25])).volume());
      const atArm = railAt(yArm), away = railAt(yArm + 160);
      for (const k of [0, 1]) expect(atArm[k]).toBeCloseTo(away[k], 0);
      // (and N's studs on it: as many on its bed across the arm as a stud row anywhere along)
      const studs = (y: number) => track.intersect(w.Manifold.cube([60, 8, 1.6]).translate([-94, y - 4, 3.4])).volume();
      expect(studs(yArm)).toBeGreaterThan(0.6 * studs(yArm + 160));
    });

  // (in the plan: whether the arm's under other track, and whether the slider can go under it there)
  const right: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: -22.5 }, { kind: 'straight', length: 150 }] };
  const straight: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'straight', length: 300 }] };
  const beside: Route = { id: 'N', start: [-64, -100, 0], segments: [{ kind: 'straight', length: 500 }] };
  const under = (o: Partial<BaseParams>, out: number, by = beside) => {
    const v = switchPlan([right, straight], [[0, 1, 12, -1, undefined, { leverOffset: out }]], { ...BASE_DEFAULTS, mechStyle: 'plates', bladeStyle: OPTION_DEFAULTS.bladeStyle, pointBlades: 1, ...o }, 1, [by]).sets[0];
    return [v.under, v.underOk];
  };
  it('the arm under the track beside it: the slider can go under it on ballast (blades on top, or tines), not on track alone', () => {
    // (N further off, past the lever: not under it)
    expect(under({ generateBallast: true }, 8, { ...beside, start: [-120, -100, 0] })).toEqual([false, false]);
    expect(under({ generateBallast: true }, 72)).toEqual([true, true]);
    expect(under({ generateBallast: true, bladeStyle: 'simple' }, 72)).toEqual([true, true]);
    expect(under({ generateBallast: true, mechStyle: 'tines' }, 72)).toEqual([true, true]);
    // (sprung blades on track alone: its groove's open at the top; rigid ones: the bed's above the other track's sleepers)
    expect(under({ generateBallast: false }, 72)).toEqual([true, false]);
    expect(under({ generateBallast: false, bladeStyle: 'simple' }, 72)).toEqual([true, false]);
  });
});

assemblySuite([['lever past the track beside it, sprung blades', boxedIn()], ['lever past the track beside it, rigid blades', boxedIn({ bladeStyle: 'simple' })]]);
