import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { TEMPLATES, toRoutes } from '../src/app/design';

// Count the underside's square holes by size, in a slice just above the bottom.
const area = (p: number[][]) => Math.abs(p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2);
async function holes(name: string, grip: 'edges' | 'all') {
  const m = crossingPiece(new Scad(await kernel()), toRoutes(TEMPLATES[name]), { ...CROSSING_DEFAULTS, grip });
  const polys = m.slice(0.5).toPolygons() as number[][][];
  return {
    grip: polys.filter((p) => Math.abs(area(p) - 5.0 ** 2) < 1).length,   // stud + 0.2 sockets
    loose: polys.filter((p) => Math.abs(area(p) - 5.8 ** 2) < 1).length,  // stud + 1.0 recesses
  };
}

describe('underside grip', () => {
  it("'all' grips at every stud", async () => {
    const h = await holes('90° crossing', 'all');
    expect(h.loose).toBe(0);
    expect(h.grip).toBeGreaterThan(150);
  });
  it("'edges' grips only along the edges, at least 4 studs apart, loose elsewhere", async () => {
    const h = await holes('90° crossing', 'edges');
    expect(h.grip).toBeGreaterThanOrEqual(12);   // the cross's 12 outer corners at least
    expect(h.grip).toBeLessThan(40);
    expect(h.loose).toBeGreaterThan(120);
  });
});
