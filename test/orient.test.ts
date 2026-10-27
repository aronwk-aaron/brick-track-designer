// Routes drawn either way round make the same points (orient, before the solver).
import { describe, expect, it } from 'vitest';
import { orient } from '../src/app/build';
import { type Design, toRoutes } from '../src/app/design';
import { solve } from '../src/route/solver';
import { routeLength, routePose } from '../src/route/route';
import { reversedRoute } from '../src/switch/reverse';
import { readFileSync } from 'node:fs';

const fixture = (n: string): Design => JSON.parse(readFileSync(new URL(`./fixtures/complex/${n}.json`, import.meta.url), 'utf8'));
const toes = (d: Design) => {
  const rs = orient(toRoutes(d)), sol = solve(rs, { gauge: 40, step: 0.5 });
  return [...new Set(sol.splits.map((sp) => { const q = routePose(rs[sp.routes[0]], sp.merge ? sp.spans[0][1] : sp.spans[0][0]); return `${Math.round(q[0])},${Math.round(q[1])}`; }))].sort();
};

describe('routes drawn either way round', () => {
  it('a double crossover with one track and both crossovers drawn backwards: all four points', () => {
    expect(toes(fixture('double-crossover-r56-reversed'))).toEqual(toes(fixture('double-crossover-r56')));
    expect(toes(fixture('double-crossover-r56'))).toHaveLength(4);
  });
  it('a ladder with its main line and some yard tracks drawn backwards: the same points', () => {
    expect(toes(fixture('ladder-r40-reversed'))).toEqual(toes(fixture('ladder-r40')));
  });
  it('a wye with one leg drawn from its far end back to the toe: a wye', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [
      { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }, { kind: 'straight', studs: 16 }] },
      { name: 'R', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
    ] };
    const rs = toRoutes(d);
    const back = { ...d, routes: [d.routes[0], { ...d.routes[1], ...(() => { const r = reversedRoute(rs[1]); return { x: r.start[0] / 8, y: r.start[1] / 8, heading: r.start[2], segs: r.segments.map((sg) => (sg.kind === 'straight' ? { kind: 'straight' as const, studs: sg.length / 8 } : { kind: 'curve' as const, radius: sg.radius / 8, angle: sg.angle })) }; })() }] };
    expect(toes(back)).toEqual(toes(d));
    expect(toes(d)).toHaveLength(1);
  });
  it('turns the branch, not the track it leaves', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [
      { name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
      { name: 'Branch', x: 0, y: 16, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'straight', studs: 16 }] },
    ] };
    const rs = toRoutes(d), back = orient([rs[0], reversedRoute(rs[1])]);
    expect(back[0]).toEqual(rs[0]);
    expect(routeLength(back[1])).toBeCloseTo(routeLength(rs[1]));
    expect(back[1].start[1]).toBeCloseTo(rs[1].start[1]);
  });
});
