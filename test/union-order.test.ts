// A sound part comes out the same whichever order its solids are joined in. Built again with every union's solids in
// the opposite order (geom/scad.ts Scad.reversed, for this test only), each part of these designs has the volume and
// the box it had. Where two solids lie flush on each other (a bed's end on its end connector's back, a rail's cut end
// on the small block beside the left rail tongue) the kernel joins them one way or the other by the last digit, and
// the part differed with the order: by 15.7 mm3 on 'Switch R72 right', 1.0 on an R40 curve of the oval, 0.6 on
// 'Crossing 45° right' and 'Double turnout R56 and R40, right' (the last two designs here were the same already).
// Both are rooted now: the bed runs on 0.05 into its end connectors, the rails into that block as into their tongues
// (crossing.ts bedEnds, rooted). A design that fails here has another such pair of faces: find it by building it both
// ways and looking where the two differ, and root the one in the other; don't widen the tolerance.
// (Not yet the same both ways, and not here: where two tracks' ends lie side by side, one's end connector and bed
// against the next one's: 'Compact corner R56 left', 'Yard R148, three tracks, left'.)
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { Scad } from '../src/geom/scad';
import { solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const NAMES = ['Switch R72 right', 'Crossing 45° right', 'Oval (LEGO R40)', 'Double turnout R56 and R40, right', 'Wye R40, 8-stud spacing', 'Curve R40, 5.62°'];
type Part = [name: string, volume: number, box: number[]];

describe('parts are the same whichever order their solids are joined in', { timeout: 1200000 }, () => {
  for (const name of NAMES)
    it(`${name}: every part's volume and box the same with every union reversed`, async () => {
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
              const bb = m.boundingBox(), v = m.volume(); m.delete();
              return [p.name, v, [...bb.min, ...bb.max]];
            });
          } finally { Scad.reversed = false; }
        };
        const a = parts(false), b = parts(true);
        expect(b.map((p) => p[0])).toEqual(a.map((p) => p[0]));
        a.forEach(([n, v, box], k) => {
          expect(Math.abs(b[k][1] - v), `${n}'s volume: ${v.toFixed(2)} as built, ${b[k][1].toFixed(2)} reversed`).toBeLessThan(0.05);
          box.forEach((x, i) => expect(Math.abs(b[k][2][i] - x), `${n}'s box`).toBeLessThan(0.011));
        });
      } finally { Scad.reversed = false; Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
});
