// Single-point switches (pointBlades 1, switch/base.ts singlePoint): only the
// blade on the curved route moves; the straight route's rail on that side is
// fixed, starting a flangeway clear of its stock rail. One blade part, which
// clears the base closed and open.
import { describe, expect, it } from 'vitest';
import { railPoint, routeLat, type Route } from '../src/route/route';
import { BASE_DEFAULTS, switchGeometry, switchPlan } from '../src/switch/base';
import { HEAD_HW } from '../src/switch/context';
import { kernel } from '../src/geom/kernel';
import { R, Scad, T } from '../src/geom/scad';

const straight: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 300 }] };
const left: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 150 }] };
const right: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: -22.5 }, { kind: 'straight', length: 150 }] };
const p = { ...BASE_DEFAULTS, mechStyle: 'plates' as const, throwAction: 'detent' as const, bladeStyle: 'simple' as const, pointBlades: 1 as const };

describe('single-point switches', () => {
  for (const [name, routes, dir, fixed] of [['left', [straight, { ...straight, id: 'B', segments: left.segments }], 1, 0], ['right', [right, { ...straight, id: 'B' }], -1, 1]] as const)
    it(`${name} switch: the straight route's blade fixed, a flangeway clear of its stock rail; one blade part, clear of the base`, async () => {
      const plan = switchPlan(routes as unknown as Route[], [[0, 1, 12]], p, dir), v = plan.sets[0], G = plan.G;
      expect(v.fixed).toBe(fixed);
      // (the fixed rail starts before the heel, where it's clear of its stock rail by the flangeway)
      const [rt, o, stock] = fixed === 0 ? [v.ra, -G, v.rb] : [v.rb, +G, v.ra];
      expect(v.sMate!).toBeLessThan(v.sHeel);
      expect(Math.abs(routeLat(stock, railPoint(rt, v.sMate!, o)) - o)).toBeGreaterThanOrEqual(2 * HEAD_HW + p.flangeway - 1e-6);
      expect(plan.railFixS(fixed === 0 ? 0 : 1, o)).toBeCloseTo(v.sMate!, 6);
      const s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
      const parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
      expect(parts.length).toBe(1);
      expect(turns.length).toBe(1);
      for (const a of [0, turns[0].swing]) {
        const at = T(R(T(parts[0], [-turns[0].at[0], -turns[0].at[1], 0]), [0, 0, a]), [turns[0].at[0], turns[0].at[1], 0]);
        expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      }
    }, 120000);

  it('a three-way keeps both blades, and says so', () => {
    const arc = (id: string, a: number): Route => ({ id, start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: a }, { kind: 'straight', length: 150 }] });
    const plan = switchPlan([arc('R', -22.5), { ...straight, id: 'S' }, arc('L', 22.5)], [[0, 2, 12, undefined, 1]], p, 1);
    expect(plan.sets[0].fixed).toBeUndefined();
    expect(plan.notes.join(' ')).toMatch(/three-way's points keep both blades/);
  });
});
