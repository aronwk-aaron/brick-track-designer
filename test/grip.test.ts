import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATES, toRoutes } from '../src/app/design';
import { sitsOnStuds } from './grip.shared';

// Count the underside's stud sockets (square, 5.0 across: never round, they grip too hard) by size, in a slice just above the bottom.
const area = (p: number[][]) => Math.abs(p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2);
async function build(name: string, grip: 'edges' | 'all') {
  const tubes: [number, number][] = [];
  const m = crossingPiece(new Scad(await kernel()), toRoutes(TEMPLATES[name]), { ...CROSSING_DEFAULTS, grip }, undefined, tubes);
  const polys = m.slice(0.5).toPolygons() as number[][][];
  return { m, tubes, sockets: polys.filter((p) => p.length < 16 && Math.abs(area(p) - 5 * 5) < 0.5).length };
}

describe('underside grip', () => {
  it("'all' has a gripping socket at every stud", async () => {
    const b = await build('90° crossing', 'all');
    expect(b.sockets).toBeGreaterThan(150);
    expect(b.tubes).toHaveLength(0);
    // (and not one round)
    expect((b.m.slice(0.5).toPolygons() as number[][][]).filter((p) => p.length >= 16 && Math.abs(area(p) - 12 * 2.5 ** 2 * Math.sin(Math.PI / 12)) < 0.5)).toHaveLength(0);
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
  // The piece must sit flat on a baseplate: grip.shared.ts (the features in grip-features.test.ts)
  sitsOnStuds(['Crossings', 'Switches']);
});
