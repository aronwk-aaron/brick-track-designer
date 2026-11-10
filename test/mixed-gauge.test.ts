// Mixed gauges: a route with a gauge of its own (DRoute.gaugeStuds; left out, the design's) in a design of another.
// Tracks of different gauges cross and run side by side: each one's rails at its own gauge, its flangeways cut through
// the other's rails, check rails at each one's own gauge, its sleepers and end connectors its own. Checked with a
// flange swept along every rail at that route's gauge (the narrow gauge's wheels are the same LEGO wheels on a
// narrower axle). Points between tracks of different gauges aren't built, and the build says where; points between
// routes of one gauge that isn't the design's are built at that gauge. A design without it is as it always was.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, readDesign, routeGaugeStuds, TEMPLATES, toRoutes } from '../src/app/design';
import { reversedRoute, mirrorRoute } from '../src/app/routeedits';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { railPoint, type Route, routeLength } from '../src/route/route';
import { solve } from '../src/route/solver';
import { assembledProblems, solid } from './assembled.shared';

const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, FL = { depth: 3, width: 1.5, off: 0.05 };
const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** a route's rails' offset (mm): its own gauge's, else the 4-stud design's */
const G = (rt: Route) => (rt.gauge ?? 40) / 2;
const straight = (name: string, x: number, y: number, heading: number, studs: number, gaugeStuds?: number) => ({ name, x, y, heading, ...(gaugeStuds !== undefined && { gaugeStuds }), segs: [{ kind: 'straight' as const, studs }] });
/** a standard straight up the middle, crossed at its middle at an angle by a track of another gauge */
const crossed = (deg: number, gaugeStuds: number, len = 32): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
  straight('Standard', 0, -len / 2, 0, len),
  straight('Other', (len / 2) * Math.sin((deg * Math.PI) / 180), (-len / 2) * Math.cos((deg * Math.PI) / 180), deg, len, gaugeStuds)] });

describe('a route\'s own gauge: the design', () => {
  it('is the design\'s where it has none, and a design without it is as it was', () => {
    const d = structuredClone(TEMPLATES['90° crossing']);
    expect(toRoutes(d).every((rt) => !('gauge' in rt))).toBe(true);
    // (set to the design's own: the same routes, nothing of its own)
    const same = { ...d, routes: d.routes.map((r) => ({ ...r, gaugeStuds: 4 })) };
    expect(toRoutes(same)).toEqual(toRoutes(d));
    const own = { ...d, routes: [d.routes[0], { ...d.routes[1], gaugeStuds: 2 }] };
    expect(toRoutes(own).map((rt) => rt.gauge)).toEqual([undefined, 24]);
    expect(own.routes.map((r) => routeGaugeStuds(own, r))).toEqual([4, 2]);
    // (a monorail has none, whatever's left on it)
    expect(routeGaugeStuds(own, { ...own.routes[1], system: 'monorail' })).toBe(4);
  });
  it('survives save and open, held to its range; what isn\'t a number is left out', () => {
    const d = structuredClone(TEMPLATES['Narrow gauge beside and across standard track']);
    expect(readDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const at = (v: unknown) => readDesign({ ...d, routes: [d.routes[0], { ...d.routes[1], gaugeStuds: v }] }).routes[1].gaugeStuds;
    expect(at(3)).toBe(3); expect(at(99)).toBe(10); expect(at(0)).toBe(2); expect(at(2.6)).toBe(3);
    expect(at('wide')).toBeUndefined(); expect(at(null)).toBeUndefined();
    // (an old design: no route has one, none is added)
    for (const name of ['90° crossing', 'Narrow-gauge crossing 90°', 'Dual gauge track']) expect(readDesign(JSON.parse(JSON.stringify(TEMPLATES[name]))).routes.every((r) => !('gaugeStuds' in r))).toBe(true);
  });
  it('goes with its route turned end for end, mirrored and copied', () => {
    const r = structuredClone(TEMPLATES['Narrow gauge beside and across standard track'].routes[1]);
    expect(reversedRoute(r).gaugeStuds).toBe(2);
    const m = structuredClone(r); mirrorRoute(m, 0); expect(m.gaugeStuds).toBe(2);
    expect(structuredClone(r).gaugeStuds).toBe(2);
  });
});

describe('a route\'s own gauge: the solver', () => {
  it('lays each route\'s rails, flangeways and check rails at its own gauge', () => {
    const d = crossed(30, 2), routes = toRoutes(d), sol = solve(routes, { gauge: 40, step: 0.5 });
    expect(sol.crossings.length).toBe(4);
    // (each crossing: on the standard route's rail 20 off its middle, on the narrow one's 12 off)
    for (const c of sol.crossings) {
      expect(Math.hypot(...railPoint(routes[0], c.a.s, c.a.side * 20).map((v, k) => v - c.point[k]))).toBeLessThan(0.01);
      expect(Math.hypot(...railPoint(routes[1], c.b.s, c.b.side * 12).map((v, k) => v - c.point[k]))).toBeLessThan(0.01);
    }
    // (both rails of each cut twice, by the other's two flangeways)
    for (const r of [0, 1]) for (const sd of [-1, 1]) expect(sol.grooves.filter((g) => g.route === r && g.side === sd).length).toBe(2);
    // (a check rail opposite each crossing, inside the other rail of each track, its inner face a flangeway in from its own rail's head)
    for (const r of [0, 1]) {
      const cr = sol.checkRails.filter((c) => c.route === r);
      expect(cr.length).toBe(4);
      for (const c of cr) expect(Math.min(Math.abs(c.offset), Math.abs(c.offset + c.width))).toBeCloseTo(G(routes[r]) - 1.25 - 3 - 1, 6);
    }
    // (and the same design at one gauge is solved as it was: the option's gauge)
    const one = toRoutes(crossed(30, 4));
    expect(solve(one, { gauge: 40, step: 0.5 })).toEqual(solve(one.map((rt) => ({ ...rt, gauge: 40 })), { gauge: 24, step: 0.5 }));
  });
  it('makes no points between routes of different gauges, and says which; between routes of one gauge it does', () => {
    const branch = (a?: number, b?: number): Design => ({ version: 1, gaugeStuds: 4, routes: [straight('Main', 0, 0, 0, 48, a), { name: 'Branch', x: 0, y: 8, heading: 0, ...(b !== undefined && { gaugeStuds: b }), segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] });
    const mixed = solve(toRoutes(branch(undefined, 2)), { gauge: 40, step: 0.5 });
    expect(mixed.splits).toEqual([]);
    expect(mixed.refused?.map((sp) => sp.routes)).toEqual([[0, 1]]);
    expect(mixed.near).toEqual([]);
    const narrow = solve(toRoutes(branch(2, 2)), { gauge: 40, step: 0.5 });
    expect(narrow.splits.map((sp) => sp.routes)).toEqual([[0, 1]]);
    expect(narrow.refused).toBeUndefined();
  });
});

describe('tracks of different gauges', { timeout: 600000 }, () => {
  const cases: [string, Design][] = [
    ...['90°', '45° left', '45° right'].map((n): [string, Design] => [`the reference's narrow-gauge crossing of standard track ${n}`, TEMPLATES[`Narrow-gauge crossing of standard track ${n}`]]),
    ['a narrow-gauge track across standard track at 30°', crossed(30, 2)],
    ['a 3-stud track across standard track at 60°', crossed(60, 3)],
    ['a broad-gauge (6-stud) track across standard track at 30°', crossed(30, 6, 40)],
  ];
  for (const [name, d] of cases) for (const ballast of ['none', 'buddy'] as const)
    it(`${name}${ballast === 'none' ? '' : ', on ballast'}: each track's rails at its own gauge, a flange passes along every rail, and it goes together`, async () => {
      const w = await kernel(), s = new Scad(w), routes = toRoutes(d), long = !/reference/.test(name);
      clearBuildCache();
      const o = { ...d.options, ballast, printBedX: 500, printBedY: 500 }, b = buildDesign(w, { ...structuredClone(d), options: o });
      expect(b.info.warnings).toEqual([]);
      expect(b.info.crossings).toBe(4);
      const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
      const band = (r: number, x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], 6, routeLength(routes[r]) - 6);
      routes.forEach((rt, r) => {
        const g = G(rt), L = routeLength(rt);
        expect(band(r, -g, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
        expect(band(r, g, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
        // (its rails there, at its own gauge: rail head on each line, by each end, and none where the design's gauge would have put it)
        for (const [a, e] of [[5, 9], [L - 9, L - 5]]) for (const sd of [-1, 1]) {
          const head = sweepRoute(s, s.square([1, 1]).translate([sd * g - 0.5, RAIL_TOP - 1.5]), rt, a, e);
          expect(head.intersect(track).volume(), `route ${r}'s rail at ${sd * g}`).toBeGreaterThan(head.volume() * 0.95);
          // (the reference's short pieces' ends are by the other track: looked for on the longer ones)
          if (g !== 20 && long) { const not = sweepRoute(s, s.square([1, 1]).translate([sd * 20 - 0.5, RAIL_TOP - 1.5]), rt, a, e); expect(not.intersect(track).volume(), `route ${r}: a rail at the design's gauge`).toBeLessThan(0.01); }
        }
        // (its end connectors its own: bed out to its own sleepers' ends, none beyond them)
        const hw = g + 12, bedIn = sweepRoute(s, s.square([1, 0.8]).translate([hw - 2, 2.2]), rt, 1, 3), bedOut = sweepRoute(s, s.square([1, 0.8]).translate([hw + 1, 2.2]), rt, 1, 3);
        expect(bedIn.intersect(track).volume()).toBeGreaterThan(bedIn.volume() * 0.9);
        if (ballast === 'none' && long) expect(bedOut.intersect(track).volume()).toBeLessThan(0.01);
      });
      // (check rails where the crossing is sharp, on both tracks, standing where the solver put them)
      if (/30°/.test(name)) {
        expect(b.info.checkRails).toBe(8);
        expect(b.overlay.checkRails.length).toBe(8);
        for (const pts of b.overlay.checkRails) { const q = pts[Math.floor(pts.length / 2)], probe = s.cube([0.6, 0.6, 1]).translate([q[0] - 0.3, q[1] - 0.3, RAIL_TOP - 2]); expect(probe.intersect(track).volume()).toBeGreaterThan(0.3); }
      }
      clearBuildCache();
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try { expect(assembledProblems(w, b.pieces, { ...APP, ...o })).toEqual([]); } finally { Object.assign(OPTION_DEFAULTS, saved); }
    });

  it('a narrow-gauge line beside and across standard track, as the app builds it: the standard straights bought, the narrow track never; a flange passes through the crossing on both', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel(), s = new Scad(w), d = structuredClone(TEMPLATES['Narrow gauge beside and across standard track']), routes = toRoutes(d);
      clearBuildCache();
      const b = buildDesign(w, d);
      expect(b.info.warnings).toEqual([]);
      const bought = b.pieces.filter((q) => q.lego);
      expect(bought.length).toBe(5);
      // (every bought piece on the standard track's line, x = 0: none of the narrow line 16 studs off it)
      for (const q of bought) { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < q.positions.length; i += 3) { x0 = Math.min(x0, q.positions[i]); x1 = Math.max(x1, q.positions[i]); } expect((x0 + x1) / 2).toBeCloseTo(0, 0); }
      const track = w.Manifold.union(b.pieces.filter((q) => !q.lego).map((q) => solid(w, q.positions)!));
      const sx = [routes[0], routes[1]].map((rt) => { const L = routeLength(rt); return [L / 2 - 40, L / 2 + 40]; }); // (the crossing: clear of the pieces' joints either side)
      routes.forEach((rt, r) => { for (const sd of [-1, 1]) {
        // (0.3 off the rail's head: the track is built in pieces, each swept along its own stretch of the route, its
        // rails' facets a hair (to 0.2 mm) off a sweep along the whole route's; so it is with one gauge)
        const x = sd * G(rt), off = 0.3, fl = sweepRoute(s, s.square([FL.width - off, FL.depth + 2]).translate([sd < 0 ? x + HEAD_HW + off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), rt, sx[r][0], sx[r][1]);
        expect(fl.intersect(track).volume(), `route ${r}, inside its rail at ${x}`).toBeLessThan(0.02);
      } });
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });

  it('points between tracks of different gauges aren\'t built: said, with where and which, and the rest is built', async () => {
    const w = await kernel();
    const d: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', printBedX: 500, printBedY: 500 }, routes: [straight('Main', 0, 0, 0, 48), { name: 'Branch', x: 0, y: 8, heading: 0, gaugeStuds: 2, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }] };
    clearBuildCache();
    const b = buildDesign(w, d);
    expect(b.info.switches).toBe(0);
    expect(b.info.warnings.length).toBe(1);
    expect(b.info.warnings[0]).toMatch(/^points between tracks of different gauges aren't built: Branch \(2 studs\) starts on Main \(4 studs\) at 0, 8 \(studs\)/);
    expect(b.pieces.length).toBeGreaterThan(0);
    // (not offered in the Trackwork panel as points taken out by hand, to put back)
    expect(b.overlay.items.filter((q) => q.kind === 'points')).toEqual([]);
    clearBuildCache();
  });

  it('points between two routes of one gauge that isn\'t the design\'s are built at that gauge', async () => {
    const w = await kernel(), s = new Scad(w), t = TEMPLATES['Narrow-gauge switch R36 left'];
    // (the narrow-gauge switch, in a standard-gauge design with a standard track beside it)
    const d: Design = { ...structuredClone(t), gaugeStuds: 4, routes: [...structuredClone(t.routes).map((r) => ({ ...r, gaugeStuds: 2 })), straight('Standard', -16, 0, 0, 24)] };
    clearBuildCache();
    const b = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } }), routes = toRoutes(d);
    clearBuildCache();
    const own = buildDesign(w, { ...structuredClone(t), options: { ...t.options, printBedX: 500, printBedY: 500 } });
    expect(b.info.warnings).toEqual(own.info.warnings);
    expect(b.info.switches).toBe(1);
    // (the same moving parts as the narrow-gauge design's switch: one blade, a throw, a lever)
    const moving = (ps: typeof b.pieces) => ps.map((q) => q.name.replace(/^[a-z]+\d*-/, '')).filter((n) => /^(a|b|throw|lever|spring)/.test(n)).sort();
    expect(moving(b.pieces)).toEqual(moving(own.pieces));
    // (the straight's rails at the narrow gauge past the points; the standard track's at its own)
    const track = w.Manifold.union(b.pieces.filter((q) => !/points|throw|lever|spring/.test(q.name)).map((q) => solid(w, q.positions)!));
    for (const [r, g] of [[0, 12], [2, 20]] as const) for (const sd of [-1, 1]) {
      const L = routeLength(routes[r]), head = sweepRoute(s, s.square([1, 1]).translate([sd * g - 0.5, RAIL_TOP - 1.5]), routes[r], L - 12, L - 6);
      expect(head.intersect(track).volume(), `route ${r}'s rail at ${sd * g}`).toBeGreaterThan(head.volume() * 0.95);
    }
    clearBuildCache();
  });
});
