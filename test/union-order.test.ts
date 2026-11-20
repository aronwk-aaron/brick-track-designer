// A sound part comes out the same whichever order its solids are joined in. Built again with every union's solids in
// the opposite order (geom/scad.ts Scad.reversed, for this test only), each part of these designs has the volume and
// the box it had. Where two solids lie flush on each other (a bed's end on its end connector's back, a rail's cut end
// on the small block beside the left rail tongue) the kernel joins them one way or the other by the last digit, and
// the part differed with the order: by 15.7 mm3 on 'Switch R72 right', 1.0 on an R40 curve of the oval, 0.6 on
// 'Crossing 45° right' and 'Double turnout R56 and R40, right' (the last two designs here were the same already).
// Both are rooted now: the bed runs on 0.05 into its end connectors, the rails into that block as into their tongues
// (crossing.ts bedEnds, rooted). A design that fails here has another such pair of faces: find it by building it both
// ways and looking where the two differ, and root the one in the other; don't widen the tolerance.
// (The bodies themselves, not only their volumes: what only one of the two has, under BODY_TOL. On
// 'Yard R148, three tracks, right' track3 the two had the same volume to 0.2 mm3 and differed by 111 mm3 each way: a
// hole through its bed beside the seam of the fan, where the routes' beds start flush on the ladder's end (one order),
// four anti-stud tubes there instead (the other). Rooted too now: crossing.ts flushRoot)
// (Not yet the same both ways, and not here: where two tracks' ends lie side by side, one's end connector and bed
// against the next one's: 'Compact corner R56 left', 'Yard R148, three tracks, left'.)
import type { Manifold } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { Scad } from '../src/geom/scad';
import { solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const NAMES = ['Switch R72 right', 'Crossing 45° right', 'Oval (LEGO R40)', 'Double turnout R56 and R40, right', 'Wye R40, 8-stud spacing', 'Curve R40, 5.62°', 'Yard R148, three tracks, right'];
type Part = [name: string, volume: number, box: number[], body?: Manifold];
// (the two bodies cut level every 0.2 mm, off the round heights: what only one has at each, its area by 0.2, added up.
// Not the 3D booleans of the two: of two near-same solids they're not exact ('Double turnout R56 and R40, right' track5:
// 1.25 mm3 by them, 0.002 by the cuts). Under BODY_TOL: hairs of a tenth of a mm3 at the bottom's edges (0.12 on
// 'Switch R72 right' track1, 0.24 on the yard's track1) pass; a hole through a bed (178 mm3) doesn't)
const BODY_TOL = 0.5;
const bodyDiff = (A: Manifold, B: Manifold): [number, number, number] => {
  const a = A.boundingBox(), b = B.boundingBox(), z1 = Math.max(a.max[2], b.max[2]);
  let v = 0, worst = 0, wz = 0;
  for (let z = Math.min(a.min[2], b.min[2]) + 0.1137; z < z1; z += 0.2) {
    const sa = A.slice(z), sb = B.slice(z), x = sa.subtract(sb), y = sb.subtract(sa), ar = x.area() + y.area();
    v += ar * 0.2;
    if (ar > worst) { worst = ar; wz = z; }
    sa.delete(); sb.delete(); x.delete(); y.delete();
  }
  return [v, worst, wz];
};

describe('parts are the same whichever order their solids are joined in', { timeout: 1200000 }, () => {
  for (const name of NAMES)
    it(`${name}: every part's volume, box and body the same with every union reversed`, async () => {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const w = await kernel();
        const parts = (reversed: boolean): Part[] => {
          clearBuildCache();
          Scad.reversed = reversed;
          try {
            return buildDesign(w, structuredClone(TEMPLATES[name])).pieces.map((p) => {
              const m = p.positions?.length ? solid(w, p.positions) : undefined;
              if (!m) return [p.name, p.positions?.length ? -1 : 0, []];
              const bb = m.boundingBox(), v = m.volume();
              return [p.name, v, [...bb.min, ...bb.max], m];
            });
          } finally { Scad.reversed = false; }
        };
        const a = parts(false), b = parts(true);
        expect(b.map((p) => p[0])).toEqual(a.map((p) => p[0]));
        a.forEach(([n, v, box], k) => {
          expect(Math.abs(b[k][1] - v), `${n}'s volume: ${v.toFixed(2)} as built, ${b[k][1].toFixed(2)} reversed`).toBeLessThan(0.05);
          box.forEach((x, i) => expect(Math.abs(b[k][2][i] - x), `${n}'s box`).toBeLessThan(0.011));
          const A = a[k][3], B = b[k][3];
          if (A && B) {
            const [v, worst, z] = bodyDiff(A, B);
            expect(v, `${n}'s body: ${v.toFixed(2)} mm3 in only one of the two (most at z ${z.toFixed(2)}: ${worst.toFixed(2)} mm2)`).toBeLessThan(BODY_TOL);
          }
        });
        for (const p of [...a, ...b]) p[3]?.delete();
      } finally { Scad.reversed = false; Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
});
