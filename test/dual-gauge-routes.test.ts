// Mixed gauges on one track: a narrower track within a wider one (the narrow gauge of dual-gauge track drawn as a route
// of its own): leaving it on fixed rails (the reference's turnout), moved across it (its slide), and its points where
// the branch leaves on the shared rail's side. (A file of its own: its probes are many small solids, and one worker's
// kernel holds only so many.)
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, toRoutes } from '../src/app/design';
import { buildScope } from '../src/app/solidcache';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { type Route, routeLength } from '../src/route/route';
import { solve } from '../src/route/solver';
import { assembledProblems, solid } from './assembled.shared';

const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, FL = { depth: 3, width: 1.5, off: 0.05 };
const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** a route's rails' offset (mm): its own gauge's, else the 4-stud design's */
const G = (rt: Route) => (rt.gauge ?? 40) / 2;
const straight = (name: string, x: number, y: number, heading: number, studs: number, gaugeStuds?: number) => ({ name, x, y, heading, ...(gaugeStuds !== undefined && { gaugeStuds }), segs: [{ kind: 'straight' as const, studs }] });


// A narrower track within a wider one's end (route.ts hostedEnds): the narrow gauge leaving a dual-gauge track (the
// reference's turnout: no points, fixed rails) and moved across it (its slide). One end connector there, the wider
// track's, with a rail end for each narrow rail that isn't its own. A flange swept along every rail of both gauges;
// each wheel's tread carried all the way (some a millimetre of rail head or more under it at every 2 mm, or the gap short enough to roll over);
// joined to dual-gauge track it goes together, and the narrow gauge's flange passes over the joint.
describe('the narrow gauge leaving a dual-gauge track, and moved across it', { timeout: 600000 }, () => {
  /** (mm) a wheel's tread, out from its rail's gauge face; a gap in its support no longer than this is rolled over (a frog's, a flangeway's across a rail) */
  const TREAD = 4, GAP = 8;
  const std = (n: number) => straight('Standard', 0, 0, 0, n);
  const centred: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [std(20), { name: 'Narrow', x: 0, y: 0, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 36, angle: 33.75 }] }] };
  for (const [name, d] of [...['Dual gauge turnout R36 left', 'Dual gauge turnout R36 right', 'Dual gauge slide, centre to left', 'Dual gauge slide, centre to right'].map((n): [string, Design] => [n, TEMPLATES[n]]), ['the narrow gauge leaving from the middle (a centred dual-gauge track\'s)', centred]] as [string, Design][])
    it(`${name}: no warnings, a flange passes along every rail of both gauges, and every wheel is carried`, async () => {
      const w = await kernel(), s = new Scad(w), routes = toRoutes(d);
      clearBuildCache();
      const b = buildDesign(w, { ...structuredClone(d), options: { ...d.options, printBedX: 500, printBedY: 500 } });
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.length).toBe(1);
      expect(b.pieces[0].supports?.length ?? 0).toBeGreaterThan(0);
      const track = solid(w, b.pieces[0].positions)!;
      routes.forEach((rt, r) => {
        const g = G(rt), L = routeLength(rt);
        const band = (x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), rt, 1, L - 1);
        expect(band(-g, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
        expect(band(g, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
        // (each wheel's tread: from its rail's gauge face out, the top half millimetre: rail under it, or not for long)
        for (const sd of [-1, 1]) {
          // (its probes let go as it ends: solidcache.ts buildScope)
          const worst = buildScope(() => {
            let gap = 0, most = 0;
            for (let a = 5; a + 2 <= L - 5; a += 2) {
              const tread = sweepRoute(s, s.square([TREAD, 0.5]).translate([sd > 0 ? g - HEAD_HW : -g + HEAD_HW - TREAD, RAIL_TOP - 0.5]), rt, a, a + 2);
              gap = tread.intersect(track).volume() > 1 ? 0 : gap + 2; most = Math.max(most, gap);
            }
            return most;
          });
          expect(worst, `route ${r}'s ${sd < 0 ? 'left' : 'right'} wheel: ${worst} mm with no rail under its tread`).toBeLessThanOrEqual(GAP);
        }
      });
      expect(assembledProblems(w, b.pieces, { ...OPTION_DEFAULTS, ...d.options, printBedX: 500, printBedY: 500 })).toEqual([]);
      clearBuildCache();
    });
  for (const ballast of ['none', 'buddy'] as const)
    it(`a dual-gauge track, then the turnout${ballast === 'none' ? '' : ', on ballast'}: they go together, and the narrow gauge's flange passes over the joint and away`, async () => {
      const w = await kernel(), s = new Scad(w), t = TEMPLATES['Dual gauge turnout R36 left'];
      const d: Design = { ...t, options: { ...t.options, ballast }, routes: [{ name: 'Dual', x: 0, y: -16, heading: 0, dualGauge: true, dualShared: 'left', segs: [{ kind: 'straight', studs: 16 }] }, ...t.routes] };
      clearBuildCache();
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        const b = buildDesign(w, structuredClone(d)), routes = toRoutes(d);
        expect(b.info.warnings).toEqual([]);
        expect(b.pieces.filter((p) => !/ballast/.test(p.name)).length).toBe(2);
        const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
        const band = (r: number, x: number, sd: number, a: number, e: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], a, e);
        // (the narrow gauge: along the dual-gauge track inside its shared left rail and its third rail (4 right of the middle), then its own route)
        expect(band(0, -20, 1, 2, 128).intersect(track).volume(), 'the narrow gauge inside the shared rail').toBeLessThan(0.02);
        expect(band(0, 4, -1, 2, 128).intersect(track).volume(), 'the narrow gauge inside the third rail').toBeLessThan(0.02);
        for (const sd of [-1, 1]) expect(band(2, sd * 12, -sd, 0, routeLength(routes[2]) - 2).intersect(track).volume(), `the narrow gauge's own route, rail ${sd}`).toBeLessThan(0.02);
        // (the third rail carries on over the joint as the narrow track's right rail: rail head either side of it)
        for (const [r, x, a, e] of [[0, 4, 118, 126], [2, 12, 2, 10]] as [number, number, number, number][]) { const head = sweepRoute(s, s.square([1, 1]).translate([x - 0.5, RAIL_TOP - 1.5]), routes[r], a, e); expect(head.intersect(track).volume()).toBeGreaterThan(head.volume() * 0.95); }
        clearBuildCache();
        expect(assembledProblems(w, b.pieces, { ...APP, ...d.options })).toEqual([]);
      } finally { Object.assign(OPTION_DEFAULTS, saved); }
    });
  it('the solver: no points there, none refused; a narrow track starting on a standard one\'s middle elsewhere is still refused, and said', () => {
    for (const n of ['Dual gauge turnout R36 left', 'Dual gauge slide, centre to left']) { const sol = solve(toRoutes(TEMPLATES[n]), { gauge: 40, step: 0.5 }); expect(sol.splits).toEqual([]); expect(sol.refused).toBeUndefined(); }
    const sol = solve(toRoutes(centred), { gauge: 40, step: 0.5 });
    expect(sol.splits).toEqual([]); expect(sol.refused).toBeUndefined();
    const mid = solve(toRoutes({ ...centred, routes: [centred.routes[0], { ...centred.routes[1], y: 4 }] }), { gauge: 40, step: 0.5 });
    expect(mid.refused?.map((sp) => sp.routes)).toEqual([[0, 1]]);
  });
});

// Narrow-gauge points on dual-gauge track: the narrow gauge a route of its own within the standard one, sharing a
// rail, its branch leaving on the shared rail's side (solver.ts onDual). One moving blade, by the narrow gauge's own
// rail; the shared rail fixed. Standard-gauge flanges pass however the blade is set; the narrow gauge's go straight
// with it one way and off with it the other; every wheel carried; it goes together. On the other side, and with the
// narrow gauge up the middle, the points aren't built, and the build says so.
describe('narrow-gauge points on dual-gauge track', { timeout: 900000 }, () => {
  for (const hand of ['left', 'right'] as const)
    it(`the branch on the shared rail's side, ${hand}: built, both gauges' flanges pass, and it goes together`, async () => {
      const w = await kernel(), s = new Scad(w), d = TEMPLATES[`Dual gauge switch R36, narrow gauge branch, ${hand}`], routes = toRoutes(d);
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        clearBuildCache();
        const b = buildDesign(w, structuredClone(d));
        expect(b.info.warnings).toEqual([]);
        expect(b.info.switches).toBe(1);
        const fixed = w.Manifold.union(b.pieces.filter((q) => !q.turn && !q.slide && !q.hinge).map((q) => solid(w, q.positions)!));
        // (one moving blade, as assembled and swung over)
        const blades = b.pieces.filter((q) => q.turn);
        expect(blades.length).toBe(1);
        const tn = blades[0].turn!, m0 = solid(w, blades[0].positions)!, blade = [0, 1].map((f) => m0.translate([-tn.at[0], -tn.at[1], 0]).rotate([0, 0, (tn.swing ?? tn.by) * f]).translate([tn.at[0], tn.at[1], 0]));
        const band = (r: number, sd: number, wd = FL.width) => { const g = G(routes[r]); return sweepRoute(s, s.square([wd - FL.off, FL.depth + 2]).translate([sd < 0 ? -g + HEAD_HW + FL.off : g - HEAD_HW - wd, RAIL_TOP - FL.depth]), routes[r], 1, routeLength(routes[r]) - 1); };
        const own = hand === 'left' ? 1 : -1; // (the narrow gauge's own rail's side: the blade's)
        // (the standard gauge: clear of the track, and of the blade either way)
        for (const sd of [-1, 1]) { expect(band(0, sd).intersect(fixed).volume(), `standard gauge, rail ${sd}`).toBeLessThan(0.02); for (const m of blade) expect(band(0, sd).intersect(m).volume(), `standard gauge, rail ${sd}, the blade`).toBeLessThan(0.02); }
        // (the narrow gauge straight on: the shared rail's side clear always; its own rail's with the blade open (a flange's
        // tip past its back, as any open blade: flange-clearance.test.ts), shut the other way)
        expect(band(1, -own).intersect(fixed).volume()).toBeLessThan(0.02);
        for (const m of blade) expect(band(1, -own).intersect(m).volume()).toBeLessThan(0.02);
        expect(band(1, own).intersect(fixed).volume()).toBeLessThan(0.02);
        const straightAt = [0, 1].find((f) => band(1, own, 0.9).intersect(blade[f]).volume() < 0.02);
        expect(straightAt, 'the blade set for straight on').toBeDefined();
        expect(band(1, own).intersect(blade[1 - straightAt!]).volume(), 'the blade set for the branch turns the straight flange').toBeGreaterThan(10);
        // (the branch: its blade shut; the track as a narrow-gauge switch's own (0.42 mm3 at its frog's floor))
        expect(band(2, own).intersect(blade[1 - straightAt!]).volume()).toBeLessThan(0.02);
        for (const sd of [-1, 1]) expect(band(2, sd).intersect(fixed).volume(), `the branch, rail ${sd}`).toBeLessThan(0.5);
        // (every wheel carried: a millimetre of rail or blade under its tread, or not for more than 8 mm)
        routes.forEach((rt, r) => {
          const g = G(rt), L = routeLength(rt);
          for (const sd of [-1, 1]) {
            const worst = buildScope(() => {
              let gap = 0, most = 0;
              for (let a = 5; a + 2 <= L - 5; a += 2) {
                const tread = sweepRoute(s, s.square([4, 0.5]).translate([sd > 0 ? g - HEAD_HW : -g + HEAD_HW - 4, RAIL_TOP - 0.5]), rt, a, a + 2);
                gap = Math.max(tread.intersect(fixed).volume(), ...blade.map((m) => tread.intersect(m).volume())) > 1 ? 0 : gap + 2; most = Math.max(most, gap);
              }
              return most;
            });
            expect(worst, `route ${r}'s ${sd < 0 ? 'left' : 'right'} wheel: ${worst} mm with nothing under its tread`).toBeLessThanOrEqual(8);
          }
        });
        clearBuildCache();
        expect(assembledProblems(w, b.pieces, { ...APP, ...d.options })).toEqual([]);
      } finally { Object.assign(OPTION_DEFAULTS, saved); }
    });
  it('the branch on the other side, or the narrow gauge up the middle: not built, said, and what is built goes together', async () => {
    const w = await kernel(), t = TEMPLATES['Dual gauge switch R36, narrow gauge branch, left'];
    const other: Design = { ...t, routes: [t.routes[0], t.routes[1], { ...t.routes[2], segs: [{ kind: 'curve', radius: 36, angle: -33.75 }] }] };
    const centre: Design = { ...t, routes: [t.routes[0], { ...t.routes[1], x: 0 }, { ...t.routes[2], x: 0 }] };
    for (const [d, re] of [[other, /narrow-gauge points on dual-gauge track are built only where the branch leaves on the side of the rail both gauges share: the points of Narrow \(2 studs\) and Branch \(2 studs\) at -1, 0 \(studs\) aren't built/], [centre, /here none is shared: the narrow gauge is up the middle/]] as [Design, RegExp][]) {
      expect(solve(toRoutes(d), { gauge: 40, step: 0.5 }).splits).toEqual([]);
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        clearBuildCache();
        const b = buildDesign(w, structuredClone(d));
        expect(b.info.switches).toBe(0);
        expect(b.info.warnings.join(' ')).toMatch(re);
        clearBuildCache();
        expect(assembledProblems(w, b.pieces, { ...APP, ...d.options })).toEqual([]);
      } finally { Object.assign(OPTION_DEFAULTS, saved); }
    }
    // (and the same points with no standard track round them are built as they were)
    expect(solve(toRoutes({ ...t, routes: t.routes.slice(1) }), { gauge: 40, step: 0.5 }).splits.length).toBe(1);
  });
  it('dual-gauge track drawn as two routes (a narrow one within the standard one, sharing a rail or up the middle): no warnings, and it goes together', async () => {
    const { goesTogether } = await import('./assembled.shared');
    for (const x of [-1, 0]) {
      const d: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [straight('Standard', 0, 0, 0, 32), straight('Narrow', x, 0, 0, 32, 2)] };
      const w = await kernel();
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try { clearBuildCache(); const b = buildDesign(w, structuredClone(d)); expect(b.info.warnings).toEqual([]); expect(b.pieces.length).toBeGreaterThan(0); } finally { Object.assign(OPTION_DEFAULTS, saved); }
      await goesTogether(`dual gauge as two routes, the narrow one at ${x}`, d);
    }
  });
});
