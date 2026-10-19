// The points-set maths against switch.scad's own values (track only), from
// test/fixtures/switch-sets.txt (scripts/switch-set-fixtures.sh).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Route, Segment } from '../src/route/route';
import { pointsSet, SWITCH_DEFAULTS, switchGlobals } from '../src/switch/context';

interface Cfg { name: string; globals: number[]; routes: (['S', number] | ['A', number, number])[][]; sets: number[][]; values: unknown[][] }
const cfgs: Cfg[] = [];
for (const line of readFileSync(new URL('./fixtures/switch-sets.txt', import.meta.url), 'utf8').trim().split('\n')) {
  const [tag, ...rest] = line.split(' ');
  if (tag === 'CFG') cfgs.push({ name: rest[0], globals: JSON.parse(rest[1]), routes: [], sets: [], values: [] });
  else if (tag === 'ROUTES') cfgs[cfgs.length - 1].routes = JSON.parse(rest.join(' '));
  else if (tag === 'SETS') cfgs[cfgs.length - 1].sets = JSON.parse(rest.join(' '));
  else if (tag === 'SET') cfgs[cfgs.length - 1].values[Number(rest[0])] = JSON.parse(rest.slice(1).join(' '));
}
const toRoute = (segs: Cfg['routes'][number], k: number): Route => ({
  id: String(k), start: [0, 0, 0],
  segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })),
});
const close = (a: unknown, b: unknown, path: string) => {
  if (Array.isArray(b)) { expect(Array.isArray(a), path).toBe(true); (b as unknown[]).forEach((v, i) => close((a as unknown[])[i], v, `${path}[${i}]`)); }
  else expect(Math.abs((a as number) - (b as number)), `${path}: ${a} vs ${b}`).toBeLessThan(2e-5);
};
const NAMES = ['sHeel', 'toeY', 'sBpiv', 'pivotPt', 'throwAng', 'tineLen', 'yS', 'tineTip', 'throwTravel', 'leverTravel', 'postX',
  'pointsEndY', 'tipGap', 'throwDir', 'throwY', 'throwStockX', 'throwFaceX', 'leverAng', 'leverTipZ', 'throwEdgeX', 'leverMinD',
  'leverX', 'forkX', 'forkLipZ', 'forkTop', 'forkMouthHw', 'stepYa', 'stepYb', 'stepXo', 'armRect'] as const;

describe('switch globals match switch.scad (track only)', () => {
  it('layer, bed and lever heights', () => {
    const g = switchGlobals(SWITCH_DEFAULTS);
    close([g.G, g.layerZ0, g.layerTop, g.cavityTop, g.bedTop, g.leverPz, g.leverDa, g.bladeNeed], cfgs[0].globals, 'globals');
  });
});
describe('points sets match switch.scad (track only)', () => {
  for (const c of cfgs)
    it(c.name, () => {
      const routes = c.routes.map(toRoute);
      const dflt = c.name.startsWith('right') ? -1 : 1;
      c.sets.forEach((ps, k) => {
        const v = pointsSet(routes, { ra: ps[0], rb: ps[1], sToe: ps[2], tside: ps[3] }, SWITCH_DEFAULTS, dflt) as unknown as Record<string, unknown>;
        NAMES.forEach((n, i) => close(v[n], c.values[k][i], `set ${k} ${n}`));
      });
    });
});
