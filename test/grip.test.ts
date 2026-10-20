import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { T } from '../src/geom/scad';
import { routePose } from '../src/route/route';

// Count the underside's stud sockets (round, 5.0 across: a 24-gon) by size, in a slice just above the bottom.
const area = (p: number[][]) => Math.abs(p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2);
async function build(name: string, grip: 'edges' | 'all') {
  const tubes: [number, number][] = [];
  const m = crossingPiece(new Scad(await kernel()), toRoutes(TEMPLATES[name]), { ...CROSSING_DEFAULTS, grip }, undefined, tubes);
  const polys = m.slice(0.5).toPolygons() as number[][][];
  return { m, tubes, sockets: polys.filter((p) => Math.abs(area(p) - 12 * 2.5 ** 2 * Math.sin(Math.PI / 12)) < 0.5).length };
}

describe('underside grip', () => {
  it("'all' has a gripping socket at every stud", async () => {
    const b = await build('90° crossing', 'all');
    expect(b.sockets).toBeGreaterThan(150);
    expect(b.tubes).toHaveLength(0);
  });
  it("'edges' is hollow like a plate, with anti-stud tubes along the edges and every 4 studs", async () => {
    const b = await build('90° crossing', 'edges'), all = await build('90° crossing', 'all');
    // the cross's arms are 6 studs wide: tubes all round the hollow's edge, a few inside
    expect(b.tubes.length).toBeGreaterThan(40);
    expect(b.tubes.length).toBeLessThan(70);
    // sockets only under the end connectors (4 ends)
    expect(b.sockets).toBeLessThan(60);
    expect(b.m.volume()).toBeLessThan(all.m.volume());
    // every tube sits between four studs: at 8 + 8k in the start frame (route A starts at (0, -64) heading 0)
    for (const [x, y] of b.tubes) {
      expect(Math.abs(((x % 8) + 8) % 8)).toBeLessThan(1e-6);
      expect(Math.abs((((y + 64) % 8) + 8) % 8)).toBeLessThan(1e-6);
    }
  });
  // The piece must sit flat on a baseplate: no stud of the plate's grid
  // (4.8 x 1.8) may run into it, at the edges, the ends or anywhere.
  for (const name of Object.keys(TEMPLATES))
    for (const grip of ['edges', 'all'] as const)
      it(`${name}, grip ${grip}: sits on a baseplate's studs`, async () => {
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
});
