// Builds example crossing pieces into parity/out/crossing-*.stl, with their
// plan views, and checks a straight piece fits each route end.
import { mkdirSync, writeFileSync } from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { stlBytes } from '../src/geom/stl';
import type { Route } from '../src/route/route';
import { solve } from '../src/route/solver';
import { planSvg } from '../src/route/plan';
import { routeLength, routePose } from '../src/route/route';
import { STRAIGHT_DEFAULTS, straightTrackOnly } from '../src/geom/straight';
import { R, T } from '../src/geom/scad';

const S = (id: string, start: Route['start'], len: number): Route => ({ id, start, segments: [{ kind: 'straight', length: len }] });
const rad = (d: number) => (d * Math.PI) / 180;
export const EXAMPLES: Record<string, Route[]> = {
  'cross-90': [S('A', [0, -64, 0], 128), S('B', [64, 0, 90], 128)],
  'cross-22.5': [S('A', [0, -192, 0], 384), S('B', [192 * Math.sin(rad(22.5)), -192 * Math.cos(rad(22.5)), 22.5], 384)],
  'cross-on-curve': [{ id: 'C', start: [0, -96, 0], segments: [{ kind: 'arc', radius: 320, angle: 30 }] }, S('B', [96, 0, 90], 192)],
};
const w = await kernel(), s = new Scad(w);
mkdirSync('parity/out', { recursive: true });
// (without the breakaway supports, which overlap the next piece by design)
const straight = straightTrackOnly(s, { ...STRAIGHT_DEFAULTS, supports: false }), L = STRAIGHT_DEFAULTS.lengthStuds * 8;
const base = straight.intersect(T(straight, [0, L, 0])).volume();
for (const [name, routes] of Object.entries(EXAMPLES).filter(([n]) => process.argv.length <= 2 || process.argv.slice(2).some((a) => n.includes(a)))) {
  const t0 = performance.now();
  const sol = solve(routes);
  const m = crossingPiece(s, routes, undefined, sol);
  const ms = performance.now() - t0;
  writeFileSync(`parity/out/crossing-${name}.stl`, stlBytes(m.getMesh()));
  writeFileSync(`parity/out/crossing-${name}.svg`, planSvg(routes, sol));
  console.log(name, `${m.numTri()} tris, ${(m.volume() / 1000).toFixed(1)} cm3, genus ${m.genus()}, status ${m.status()}, ${ms.toFixed(0)} ms`);
  const bare = crossingPiece(s, routes, { ...CROSSING_DEFAULTS, supports: false }, sol);
  // A 16-stud straight joined to every route end: overlap should be what two
  // straights joined have (their breakaway supports), no more.
  const ends = routes.flatMap((rt) => [{ p: routePose(rt, 0), start: true }, { p: routePose(rt, routeLength(rt)), start: false }]);
  const over = ends.map(({ p, start }) => {
    const placed = start
      ? T(R(T(straight, [0, -L, 0]), [0, 0, p[2]]), [p[0], p[1], 0])
      : T(R(straight, [0, 0, p[2]]), [p[0], p[1], 0]);
    return bare.intersect(placed).volume();
  });
  console.log('  joints (mm3 overlap per end, two straights joined:', base.toFixed(2) + '):', over.map((v) => v.toFixed(2)).join(' '));
}
