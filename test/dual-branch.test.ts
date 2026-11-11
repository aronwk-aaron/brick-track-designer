// A narrow-gauge branch off dual-gauge track part way along, the dual-gauge track carrying on (app/dualbranch.ts): the
// narrow gauge's own points, one blade by its own rail, built where the branch leaves on the shared rail's side. Each
// gauge's flanges pass along its rails (the standard gauge's and the narrow gauge's along the dual-gauge track, the
// branch's), with the blade set one way or the other; every wheel carried; it goes together. Elsewhere (the branch
// away from the shared rail, the narrow gauge up the middle) the points aren't built and the build says so. (As the app
// builds them, the templates' rails are checked with the Features: assembled-features.test.ts)
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, type DRoute, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { reversedRoute } from '../src/app/routeedits';
import { buildScope } from '../src/app/solidcache';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { routeLength } from '../src/route/route';
import { assembledProblems, solid } from './assembled.shared';
import { flangeBand, TREAD_Z, treadGap } from './gauge-split.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const tpl = (hand: 'left' | 'right') => TEMPLATES[`Dual gauge track, narrow gauge branch R36 ${hand}`];
/** The branch drawn the other way (ending on the dual-gauge track), or the dual-gauge track drawn the other way (its shared rail the same one). */
const branchBack = (d: Design): Design => ({ ...d, routes: [d.routes[0], reversedRoute(d.routes[1])] });
const dualBack = (d: Design): Design => {
  const r = reversedRoute(d.routes[0]) as DRoute;
  return { ...d, routes: [{ ...r, dualShared: (d.routes[0].dualShared ?? 'right') === 'right' ? 'left' : 'right' }, d.routes[1]] };
};

/** (mm) with nothing under a wheel's tread no longer than this: a frog's gap, as the narrow-gauge switch's own */
const GAP = 8;

async function passes(name: string, d: Design) {
  const w = await kernel(), s = new Scad(w), routes = toRoutes(d), saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try {
    clearBuildCache();
    const b = buildDesign(w, structuredClone(d));
    expect(b.info.warnings, name).toEqual([]);
    expect(b.info.switches, name).toBe(1);
    const faults: string[] = [];
    buildScope(() => {
      const fixed = w.Manifold.union(b.pieces.filter((q) => !q.turn && !q.slide && !q.hinge).map((q) => solid(w, q.positions)!));
      const blades = b.pieces.filter((q) => q.turn);
      expect(blades.length, `${name}: one blade`).toBe(1);
      const tn = blades[0].turn!, m0 = solid(w, blades[0].positions)!;
      const set = [0, 1].map((f) => m0.translate([-tn.at[0], -tn.at[1], 0]).rotate([0, 0, (tn.swing ?? tn.by) * f]).translate([tn.at[0], tn.at[1], 0]));
      // (each gauge's rails on each drawn route: offsets to the right of its middle, as drawn; the dual-gauge route's narrow gauge on its shared rail's side)
      const sh = (d.routes[0].dualShared ?? 'right') === 'right' ? 1 : -1, nd = [sh * 20 - sh * 24, sh * 20].sort((a, c) => a - c);
      const ways: [string, number, number, number][] = [['standard gauge along the dual-gauge track', 0, -20, 20], ['narrow gauge along the dual-gauge track', 0, nd[0], nd[1]], ['the branch', 1, -12, 12]];
      for (const k of [0, 1]) {
        // (the track with the blade set one way: a flange passes one way or the other, and every wheel is carried)
        const track = fixed.add(set[k]), top = track.slice(TREAD_Z);
        for (const [what, r, xl, xr] of ways) for (const [x, sd] of [[xl, 1], [xr, -1]]) {
          const [most, at] = treadGap(w, top, routes[r], x, sd);
          if (most > GAP && (k === 1 || treadGap(w, fixed.add(set[1]).slice(TREAD_Z), routes[r], x, sd)[0] > GAP)) faults.push(`${what}: its ${sd > 0 ? 'left' : 'right'} wheel has no rail under it for ${most} mm (to ${at} mm along), the blade either way`);
        }
      }
      for (const [what, r, xl, xr] of ways) for (const [x, sd] of [[xl, 1], [xr, -1]]) {
        // (against the blade: the side of a flange away from its rail passes the back of an open blade, as any open blade's
        // (flange-clearance.test.ts), so the 0.9 mm of it by the rail, as dual-gauge-routes.test.ts has the narrow-gauge switch's own)
        const band = flangeBand(s, routes[r], x, sd), v = band.intersect(fixed).volume();
        const near = sweepRoute(s, s.square([0.9 - 0.05, 5]).translate([sd > 0 ? x + 1.25 + 0.05 : x - 1.25 - 0.9, 3.2 + 6.4 - 3]), routes[r], 1, routeLength(routes[r]) - 1), vb = set.map((m) => near.intersect(m).volume());
        if (v >= 0.5) faults.push(`${what}: its ${sd > 0 ? 'left' : 'right'} wheel's flange meets ${v.toFixed(2)} mm3 of track`);
        if (Math.min(...vb) >= 0.02) faults.push(`${what}: its ${sd > 0 ? 'left' : 'right'} wheel's flange meets the blade however it's set (${vb.map((q) => q.toFixed(2)).join(', ')} mm3)`);
      }
    });
    expect(faults, name).toEqual([]);
    clearBuildCache();
    expect(assembledProblems(w, b.pieces, { ...APP, ...d.options }), name).toEqual([]);
  } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}

describe('a narrow-gauge branch off dual-gauge track that carries on', { timeout: 900000 }, () => {
  for (const hand of ['left', 'right'] as const) {
    it(`${hand}: built as points, both gauges pass, it goes together`, () => passes(hand, tpl(hand)));
    it(`${hand}, the branch drawn to the dual-gauge track: the same`, () => passes(`${hand}, branch back`, branchBack(tpl(hand))));
    it(`${hand}, the dual-gauge track drawn the other way: the same`, () => passes(`${hand}, dual back`, dualBack(tpl(hand))));
  }
  it('the branch away from the shared rail, or the narrow gauge up the middle: not built, said, nothing else said, and it goes together', async () => {
    const w = await kernel(), t = tpl('right');
    const other: Design = { ...t, routes: [t.routes[0], { ...t.routes[1], segs: [{ kind: 'curve', radius: 36, angle: 33.75 }] }] };
    const centre: Design = { ...t, routes: [{ ...t.routes[0], dualShared: 'centre' }, { ...t.routes[1], x: 0 }] };
    for (const [d, re] of [[other, /^narrow-gauge points on dual-gauge track are built only where the branch leaves on the side of the rail both gauges share: the points of Dual \(2 studs\) and Branch \(2 studs\) at 1, 8 \(studs\) aren't built/], [centre, /here none is shared: the narrow gauge is up the middle/]] as [Design, RegExp][]) {
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        clearBuildCache();
        const b = buildDesign(w, structuredClone(d));
        expect(b.info.switches).toBe(0);
        expect(b.info.warnings.length, b.info.warnings.join('; ')).toBe(1);
        expect(b.info.warnings[0]).toMatch(re);
        clearBuildCache();
        expect(assembledProblems(w, b.pieces, { ...APP, ...d.options })).toEqual([]);
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    }
  });
});
