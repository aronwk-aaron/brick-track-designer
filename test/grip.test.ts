import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { sitsOnStuds } from './grip.shared';

// The underside's holes for a stud of its own (square or round, a stud and a little across: there must be none), in a slice just above the bottom.
const area = (p: number[][]) => Math.abs(p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2);
async function build(name: string, grip: 'edges' | 'all') {
  const tubes: [number, number][] = [];
  const m = crossingPiece(new Scad(await kernel()), toRoutes(TEMPLATES[name]), { ...CROSSING_DEFAULTS, grip }, undefined, tubes);
  const polys = m.slice(0.5).toPolygons() as number[][][];
  // (square, 5.0 or 5.8 across; round, 5.0 across: not the tubes' bores, 4.86 across)
  return { m, tubes, sockets: polys.filter((p) => (p.length < 16 && area(p) > 24 && area(p) < 35) || (p.length >= 16 && Math.abs(area(p) - 12 * 2.5 ** 2 * Math.sin(Math.PI / 12)) < 0.4)).length };
}

describe('underside grip', () => {
  it("'all' is hollow like a LEGO plate, a tube at every corner between four studs, and no socket", async () => {
    const b = await build('90° crossing', 'all'), e = await build('90° crossing', 'edges');
    expect(b.sockets).toBe(0);
    expect(b.tubes.length).toBeGreaterThan(e.tubes.length);
    // (more plastic than with thin posts between the tubes)
    expect(b.m.volume()).toBeGreaterThan(e.m.volume());
  });
  it("'edges' is hollow like a plate, with anti-stud tubes along the edges and every 4 studs", async () => {
    const b = await build('90° crossing', 'edges');
    // the cross's arms are 6 studs wide: tubes all round the hollow's edge, a few inside
    expect(b.tubes.length).toBeGreaterThan(40);
    expect(b.tubes.length).toBeLessThan(70);
    expect(b.sockets).toBe(0);
    // every tube sits between four studs: at 8 + 8k in the start frame (route A starts at (0, -64) heading 0)
    for (const [x, y] of b.tubes) {
      expect(Math.abs(((x % 8) + 8) % 8)).toBeLessThan(1e-6);
      expect(Math.abs((((y + 64) % 8) + 8) % 8)).toBeLessThan(1e-6);
    }
  });
  // The piece must sit flat on a baseplate: grip.shared.ts (the features in grip-features.test.ts)
  sitsOnStuds(['Crossings', 'Switches']);
});
