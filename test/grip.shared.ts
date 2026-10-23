// The piece must sit flat on a baseplate: no stud of the plate's grid (4.8 x 1.8) may run into it, at the edges, the
// ends or anywhere. Each template of the groups built as one piece, both grips. (Split over files by group: the
// kernel wears out after a couple of dozen builds in one worker.)
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad, T } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATE_GROUPS, TEMPLATES, toRoutes } from '../src/app/design';
import { routePose } from '../src/route/route';

export function sitsOnStuds(groups: string[]) {
  const names = TEMPLATE_GROUPS.filter(([g]) => groups.includes(g)).flatMap(([, ns]) => ns);
  for (const name of names)
    for (const grip of ['edges', 'all'] as const)
      it(`${name}, grip ${grip}: sits on a baseplate's studs`, { timeout: 60000 }, async () => {
        const w = await kernel(), s = new Scad(w), routes = toRoutes(TEMPLATES[name]);
        const m = crossingPiece(s, routes, { ...CROSSING_DEFAULTS, grip });
        const b = m.boundingBox(), p0 = routePose(routes[0], 0), h = (p0[2] * Math.PI) / 180;
        const studs = [];
        for (let i = -80; i <= 80; i++) for (let j = -80; j <= 80; j++) {
          const lx = 4 + 8 * i, ly = 4 + 8 * j;
          const x = p0[0] + lx * Math.cos(h) - ly * Math.sin(h), y = p0[1] + lx * Math.sin(h) + ly * Math.cos(h);
          if (x < b.min[0] - 4 || x > b.max[0] + 4 || y < b.min[1] - 4 || y > b.max[1] + 4) continue;
          studs.push(T(s.cylinder(1.8, 2.4, 2.4, 32), [x, y, 0]));
        }
        expect(m.intersect(w.Manifold.union(studs)).volume()).toBeLessThan(1e-3);
      });
}
