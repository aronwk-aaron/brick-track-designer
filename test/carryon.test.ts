// A track drawn short of where another joins its line is carried on to the join (app/carryon.ts): which are, by how
// much, and which aren't (track on in line after a gap, a join right at the end, a track that runs on already).
import { describe, expect, it } from 'vitest';
import { carriedOn } from '../src/app/carryon';
import { type Design, toRoutes } from '../src/app/design';
import { routeLength, routePose } from '../src/route/route';

const turn = (Math.acos(1 - 16 / 80) * 180) / Math.PI;
const D = (routes: Design['routes']) => toRoutes({ version: 1, gaugeStuds: 4, routes });
const left = (studs: number) => ({ name: 'Left', x: -16, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs }] });
// (an R40 crossover to a track 16 studs to the left: it reaches that track's line 56 studs on)
const crossover = { name: 'Crossover', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve' as const, radius: 40, angle: turn }, { kind: 'curve' as const, radius: 40, angle: -turn }] };

describe('a track short of where another joins it', () => {
  it('is carried on to the join and 3 studs past it, to whole studs, and said', () => {
    const { routes, warnings } = carriedOn(D([left(48), crossover]), 40);
    expect(routeLength(routes[0]) / 8).toBeCloseTo(59, 6);
    expect(routePose(routes[0], 0).slice(0, 2)).toEqual([-128, 0]);
    expect(warnings).toEqual(['Left ends 8 studs short of where Crossover joins it at -16, 56 (studs): it\'s built 11 studs longer, past the points there; lengthen Left by 11 studs']);
  });
  it('at its start too: built back from there, its end where it was', () => {
    // (Left from 8 to 56 studs; the crossover drawn back down the layout, reaching Left's line at 0, before Left's start)
    const { routes, warnings } = carriedOn(D([{ name: 'Left', x: -16, y: 8, heading: 0, segs: [{ kind: 'straight', studs: 48 }] },
      { name: 'Crossover', x: 0, y: 48, heading: 180, segs: [{ kind: 'curve', radius: 40, angle: -turn }, { kind: 'curve', radius: 40, angle: turn }] }]), 40);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Left starts 8 studs short of where Crossover joins it at -16, 0 \(studs\): it's built 11 studs longer/);
    expect(routePose(routes[0], 0)[1] / 8).toBeCloseTo(-3, 6);
    const e = routePose(routes[0], routeLength(routes[0]));
    expect(e[1] / 8).toBeCloseTo(56, 6);
  });
  it('not where the crossover ends within it, or right at its end', () => {
    for (const studs of [56, 64]) expect(carriedOn(D([left(studs), crossover]), 40).warnings).toEqual([]);
  });
  it('not track on in line after a gap, nor a track that runs on into another already', () => {
    const gap = D([left(32), { name: 'On', x: -16, y: 40, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }]);
    expect(carriedOn(gap, 40).warnings).toEqual([]);
    const joined = D([left(48), { name: 'More', x: -16, y: 48, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, crossover]);
    expect(carriedOn(joined, 40).warnings).toEqual([]);
    // (nor a branch that starts on a track a little on from another branch's start, the other way: a tandem three-way)
    const tandem = D([{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
      { name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }, { name: 'R', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }]);
    expect(carriedOn(tandem, 40).warnings).toEqual([]);
  });
});
