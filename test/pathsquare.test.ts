// Cut path ends square to a branch (Settings › Cutting: handcuts.ts squarePathEnds), as a modular kit's sections are
// joined: the R104 switch's base cut at 16 studs, square to the straight and, across the branch, square to the branch.
import { describe, expect, it } from 'vitest';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { routeCrossings, squarePathEnds } from '../src/app/handcuts';
import { routePose } from '../src/route/route';

const sw = (name: string) => toRoutes(TEMPLATES[name]);
describe('cut path ends square to a branch', () => {
  it('the R104 left switch\'s base cut: its end over the branch turned square to the branch, from where it crosses the branch\'s centre line', () => {
    const rts = sw('Switch R104 left, base and detachable modules'), out = squarePathEnds([[-80, 128], [48, 128]], rts);
    expect(out.length).toBe(3);
    // (the corner on the branch's centre line, 16 studs up: R104 is 1.24 studs over there)
    const [e, c, b] = out, x = -(104 - Math.sqrt(104 * 104 - 16 * 16)) * 8;
    expect(c[0]).toBeCloseTo(x, 1); expect(c[1]).toBeCloseTo(128, 1);
    expect(b).toEqual([48, 128]);
    // (square to the branch there, 8.85 degrees: and as long as it was)
    const h = (Math.asin(16 / 104) * 180) / Math.PI, d = [e[0] - c[0], e[1] - c[1]], t = [-Math.sin((h * Math.PI) / 180), Math.cos((h * Math.PI) / 180)];
    expect(Math.abs(d[0] * t[0] + d[1] * t[1])).toBeLessThan(0.05);
    expect(Math.hypot(d[0], d[1])).toBeCloseTo(c[0] + 80, 1);
    expect(e[1]).toBeLessThan(128);
  });
  it('the right one: mirrored', () => {
    const out = squarePathEnds([[80, 128], [-48, 128]], sw('Switch R104 right, base and detachable modules'));
    expect(out.length).toBe(3);
    expect(out[1][0]).toBeCloseTo((104 - Math.sqrt(104 * 104 - 16 * 16)) * 8, 1);
    expect(out[0][1]).toBeLessThan(128);
  });
  it('the three-way: both ends, each over its branch', () => {
    const out = squarePathEnds([[-80, 128], [80, 128]], sw('Three-way R104, base and detachable modules'));
    expect(out.length).toBe(4);
    expect(out[0][1]).toBeLessThan(128); expect(out[3][1]).toBeLessThan(128);
  });
  it('left as drawn where the end run crosses track square (the straight first), or runs along it', () => {
    const rts = sw('Switch R104 left, base and detachable modules');
    expect(squarePathEnds([[48, 128], [20, 128]], rts)).toEqual([[48, 128], [20, 128]]);
    expect(squarePathEnds([[0, 224], [0, 336]], rts)).toEqual([[0, 224], [0, 336]]);
  });
  it('where a route crosses a stretch: on its centre line, and how far along the stretch', () => {
    // (12.5 studs up: the straight at the middle, the branch 0.76 studs to its left)
    const rts = sw('Switch R104 left, base and detachable modules'), xs = rts.map((rt) => routeCrossings(rt, [-40, 100], [40, 100]));
    expect(xs.map((x) => x.length)).toEqual([1, 1]);
    const mid = xs.flat().find((x) => Math.abs(x.t - 0.5) < 1e-3)!;
    expect(mid.s).toBeCloseTo(100, 1);
    for (const [k, x] of xs.entries()) expect(routePose(rts[k], x[0].s)[1]).toBeCloseTo(100, 1);
  });
});
