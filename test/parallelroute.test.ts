import { describe, expect, it } from 'vitest';
import type { Design, DRoute } from '../src/app/design';
import { endOf } from '../src/app/design';
import { LIMITS } from '../src/app/limits';
import { parallelRoute } from '../src/app/parallelroute';

const route = (extra: Partial<DRoute> = {}): DRoute => ({ name: 'A', x: 5, y: -3, heading: 30, segs: [{ kind: 'straight', studs: 10 }, { kind: 'curve', radius: 40, angle: 45 }, { kind: 'straight', studs: 6 }, { kind: 'curve', radius: 56, angle: -90 }, { kind: 'straight', studs: 3 }], ...extra });
const des = (r: DRoute): Design => ({ version: 1, gaugeStuds: 4, routes: [r] });

describe('a parallel track', () => {
  for (const side of ['left', 'right'] as const) for (const spacing of [8, 16, 12.5]) {
    it(`${side}, ${spacing} studs: its ends are exactly that far from the original's, square to it`, () => {
      const r = route(), d = des(r), res = parallelRoute(d, r, side, spacing);
      if ('problem' in res) throw new Error(res.problem);
      const p = res.route, d2 = { ...d, routes: [r, p] };
      for (const [a, b] of [[{ x: r.x, y: r.y, heading: r.heading }, { x: p.x, y: p.y, heading: p.heading }], [endOf(d2, 0), endOf(d2, 1)]]) {
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(spacing, 2);
        expect(b.heading).toBeCloseTo(a.heading, 2);
        // (square to the track: the line between the ends is square to its heading)
        const h = (a.heading * Math.PI) / 180, along = (b.x - a.x) * -Math.sin(h) + (b.y - a.y) * Math.cos(h);
        expect(along).toBeCloseTo(0, 2);
        // (and on the asked side: left is where a turn to the left is heading)
        const left = (b.x - a.x) * -Math.cos(h) + (b.y - a.y) * -Math.sin(h);
        expect(left > 0).toBe(side === 'left');
      }
      expect(p.name).not.toBe('A');
    });
  }
  it('keeps straights as long and curves at their angle, with the radius ± the spacing', () => {
    const r = route(), res = parallelRoute(des(r), r, 'left', 8);
    expect('route' in res && res.route.segs).toEqual([{ kind: 'straight', studs: 10 }, { kind: 'curve', radius: 32, angle: 45 }, { kind: 'straight', studs: 6 }, { kind: 'curve', radius: 64, angle: -90 }, { kind: 'straight', studs: 3 }]);
  });
  it('refuses, saying why, when a curve would go under the least radius', () => {
    const r = route({ segs: [{ kind: 'curve', radius: 16, angle: 90 }] });
    const res = parallelRoute(des(r), r, 'left', 8);
    expect(res).toHaveProperty('problem');
    expect('problem' in res && res.problem).toContain(`R${LIMITS.radius[0]}`);
    expect(parallelRoute(des(r), r, 'right', 8)).toHaveProperty('route');
  });
  it('refuses a radius over the most, and a spacing outside its range', () => {
    const r = route({ segs: [{ kind: 'curve', radius: 996, angle: 10 }] });
    expect(parallelRoute(des(r), r, 'right', 16)).toHaveProperty('problem');
    expect(parallelRoute(des(route()), route(), 'left', LIMITS.spacing[0] - 1)).toHaveProperty('problem');
    expect(parallelRoute(des(route()), route(), 'left', LIMITS.spacing[1] + 1)).toHaveProperty('problem');
  });
  it('carries the settings along', () => {
    const r = route({ guardRails: true, system: 'monorail', monoHeight: 3, throwSide: 'left' });
    const res = parallelRoute(des(r), r, 'left', 16);
    expect('route' in res && [res.route.guardRails, res.route.system, res.route.monoHeight, res.route.throwSide]).toEqual([true, 'monorail', 3, undefined]);
  });
});

// Two tracks exactly a sleeper's length (8 studs) apart touch edge to edge: that is not "run over each other".
describe('a parallel pair 8 studs apart', () => {
  it('raises no issue ring (the curve came out a hair under 8 studs); closer, it does', async () => {
    const { buildDesign } = await import('../src/app/build');
    const { kernel } = await import('../src/geom/kernel');
    const r: DRoute = { name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 45 }] };
    const w = await kernel();
    for (const [spacing, rings] of [[8, 0], [7.5, 1]] as const) {
      const d = des(r), res = parallelRoute(d, r, 'left', spacing);
      if ('problem' in res) throw new Error(res.problem);
      const b = buildDesign(w, { ...d, routes: [r, res.route] });
      expect(b.overlay.issues.filter((q) => /over each other/.test(q.text)).length > 0, `${spacing} studs`).toBe(rings > 0);
    }
  }, 60000);
});
