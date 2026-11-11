// Dual-gauge track parting into its two gauges (gauge-split.shared.ts): built as one piece of trackwork on fixed
// rails, no warnings; each gauge's flanges pass along its own rails all the way (the dual-gauge track's, then its own
// route's), every wheel carried but across a frog's gap; it goes together with the dual-gauge track before it.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, toRoutes } from '../src/app/design';
import { buildScope } from '../src/app/solidcache';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { assembledProblems, solid } from './assembled.shared';
import { flangeBand, SPLIT_FAMILY, splitDesign, splitName, type SplitSpec, TREAD_Z, treadGap } from './gauge-split.shared';

/**
 * (mm) a gap in a wheel's support no longer than this is rolled over (a frog's, a flangeway's across a rail). Where a
 * rail forks for the two gauges, one flangeway opens out of the other: the wheel that keeps to its rail is carried by
 * the rail that leaves until that's 3 mm aside (a millimetre of it still under the 4 mm tread), then by its own rail's
 * nose once that's a millimetre wide, a flangeway's 3 mm and one more aside: between 3 and 4 mm aside, which a curve of
 * radius R (mm) takes sqrt(8R) - sqrt(6R) to cover: 6 mm at R36, 7.5 at R56, 10 at R84, 11 at R104 (studs).
 */
const gapFor = (f: SplitSpec) => Math.max(8, 2 * Math.ceil((Math.sqrt(64 * Math.max(f.r, f.rn)) - Math.sqrt(48 * Math.max(f.r, f.rn)) + 1) / 2));
const ONLY = process.env.SPLIT_ONLY;

export function wheelsPass(name: string, f: SplitSpec, full: boolean) {
  it(`${name}: no warnings, each gauge's flanges pass along its rails, and every wheel is carried`, async () => {
    const w = await kernel(), s = new Scad(w), d = splitDesign(f), routes = toRoutes(d);
    clearBuildCache();
    const b = buildDesign(w, { ...structuredClone(d), options: { ...d.options, printBedX: 500, printBedY: 500 } });
    expect(b.info.warnings).toEqual([]);
    const faults: string[] = [];
    buildScope(() => {
      const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
      const top = track.slice(TREAD_Z);
      // (each gauge's rails: [route, left rail, right rail], offsets to the right of the route's middle)
      const k0 = f.alone ? 0 : 1, nd = f.layout === 'right' ? [-4, 20] : f.layout === 'left' ? [-20, 4] : [-12, 12];
      const ways: [string, number, number, number][] = [...(f.alone ? [] : [['standard, on the dual-gauge track', 0, -20, 20], ['narrow, on the dual-gauge track', 0, nd[0], nd[1]]] as [string, number, number, number][]),
        ['standard', k0, -20, 20], ['narrow', k0 + 1, -12, 12]];
      for (const [what, r, xl, xr] of ways) for (const [x, sd] of [[xl, 1], [xr, -1]]) {
        const rt = routes[r];
        const v = flangeBand(s, rt, x, sd).intersect(track).volume();
        if (v >= 0.02) faults.push(`${what}: its ${sd > 0 ? 'left' : 'right'} wheel's flange meets ${v.toFixed(2)} mm3 of track`);
        const [most, at] = treadGap(w, top, rt, x, sd);
        if (most > gapFor(f)) faults.push(`${what}: its ${sd > 0 ? 'left' : 'right'} wheel has no rail under it for ${most} mm (to ${at} mm along)`);
      }
    });
    expect(faults).toEqual([]);
    if (full) expect(assembledProblems(w, b.pieces, { ...OPTION_DEFAULTS, ...d.options, printBedX: 500, printBedY: 500 })).toEqual([]);
    clearBuildCache();
  });
}

describe('dual-gauge track parting into its two gauges', { timeout: 600000 }, () => {
  for (const f of SPLIT_FAMILY) { const n = splitName(f); if (!ONLY || new RegExp(ONLY).test(n)) wheelsPass(n, f, f.r === 40); }
  // (running together a while before they part, and with no dual-gauge track before)
  for (const layout of ['right', 'left', 'centre'] as const) for (const cs of ['a', 'b', 'c'] as const) for (const hand of ['left', 'right'] as const) {
    const f: SplitSpec = { layout, cs, hand, r: 40, rn: 36, lead: 8 }, n = splitName(f);
    if (!ONLY || new RegExp(ONLY).test(n)) wheelsPass(n, f, cs === 'a');
  }
  it('a narrow track started on the middle of a shared-rail dual-gauge end: said, with which way to move it; where the narrow gauge lies, nothing is said', async () => {
    const w = await kernel(), good = splitDesign({ layout: 'right', cs: 'c', hand: 'left', r: 40, rn: 36 });
    const off: Design = { ...good, routes: good.routes.map((r) => (r.name === 'Narrow' ? { ...r, x: 0 } : r)) };
    clearBuildCache();
    const b = buildDesign(w, structuredClone(off));
    expect(b.info.warnings).toEqual(["Narrow's rails don't line up with Dual's narrow gauge: move this end 1 stud to the right (its card's Move onto the narrow gauge does it)"]);
    expect(b.overlay.issues.map((q) => [q.at, q.text])).toEqual([[[0, 128], b.info.warnings[0]]]);
    clearBuildCache();
    const g = buildDesign(w, structuredClone(good));
    expect(g.info.warnings).toEqual([]); expect(g.overlay.issues).toEqual([]);
    clearBuildCache();
  });
  for (const layout of ['right', 'centre'] as const) { const f: SplitSpec = { layout, cs: 'c', hand: 'left', r: 40, rn: 36, alone: true }, n = splitName(f); if (!ONLY || new RegExp(ONLY).test(n)) wheelsPass(n, f, true); }
});
