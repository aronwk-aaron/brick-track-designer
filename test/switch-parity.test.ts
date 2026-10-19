// The solver against switch.scad: for each switch configuration in
// test/fixtures/switch-frogs.txt (made by scripts/switch-fixtures.sh), build
// the same routes, solve, and check the frogs land where switch.scad puts
// them (where one route's left rail meets the next route's right rail).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Route, Segment } from '../src/route/route';
import { solve } from '../src/route/solver';

interface Fixture { cfg: string; G: number; routes: (['S', number] | ['A', number, number])[][]; frogs: [number, number, [number, number]][]; checks: [number, number, number, number, number][] }

const fixtures: Fixture[] = readFileSync(new URL('./fixtures/switch-frogs.txt', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => {
    const m = /cfg = (".*?"), G = ([\d.]+), routes = (.*), frogs = (.*), checks = (.*)$/.exec(line)!;
    return { cfg: JSON.parse(m[1]), G: Number(m[2]), routes: JSON.parse(m[3]), frogs: JSON.parse(m[4]), checks: JSON.parse(m[5]) };
  });

const toRoute = (segs: Fixture['routes'][number], k: number): Route => ({
  id: String(k), start: [0, 0, 0],
  segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })),
});

describe('frogs match switch.scad', () => {
  for (const f of fixtures)
    it(f.cfg, () => {
      const sol = solve(f.routes.map(toRoute), { gauge: 2 * f.G, step: 0.5 });
      for (const [i, j, p] of f.frogs) {
        const c = sol.crossings.find((c) => c.a.route === i && c.a.side === -1 && c.b.route === j && c.b.side === 1
          && Math.hypot(c.point[0] - p[0], c.point[1] - p[1]) < 0.05);
        expect(c, `frog ${i}/${j} at ${p}`).toBeDefined();
      }
      // check rails: same route, same edge offset, same span (to 0.1mm, the fixture's rounding)
      expect(sol.checkRails.length, 'check rail count').toBe(f.checks.length);
      for (const [r, off, , s0, s1] of f.checks) {
        const c = sol.checkRails.find((c) => c.route === r && Math.abs(c.offset - off) < 0.01 && Math.abs(c.s0 - s0) < 0.1 && Math.abs(c.s1 - s1) < 0.1);
        expect(c, `check rail on route ${r} at ${off}, ${s0}..${s1}`).toBeDefined();
      }
    });
});
