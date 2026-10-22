// Bridge guard rails and the dual-gauge third rail (straight.scad / curves.scad's guard_* and dual_*), per route.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { extraRails } from '../src/geom/extrarails';
import { Track } from '../src/geom/track';
import { type Design, type DRoute, toRoutes } from '../src/app/design';
import { buildDesign } from '../src/app/build';
import { cropRoutes } from '../src/app/tiles';
import { reversedRoute } from '../src/switch/reverse';
import { subRoute } from '../src/switch/pieces';
import { routeLength, type Route } from '../src/route/route';

const GUARD_X = 20 - 2.5 - 0.8 * 8; // guard_x at Ln4, the default gap
const design = (r: Partial<DRoute>, more: DRoute[] = []): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }], ...r }, ...more] });
const area = (p: number[][]) => Math.abs(p.reduce((a, [x, y], k) => { const [u, v] = p[(k + 1) % p.length]; return a + x * v - u * y; }, 0) / 2);
async function piece(rts: Route[], more: Partial<typeof CROSSING_DEFAULTS> = {}) {
  const s = new Scad(await kernel());
  return { s, m: crossingPiece(s, rts, { ...CROSSING_DEFAULTS, supports: false, ...more }) }; // (the breakaway supports are bodies of their own)
}
/** The studs on the bed: their centres, from a slice through them above the bed. */
function studs(m: ReturnType<typeof crossingPiece>): [number, number][] {
  return (m.slice(4.5).toPolygons() as number[][][]).filter((p) => p.length >= 20 && p.length <= 50 && Math.abs(area(p) - 19.3) < 1.5)
    .map((p) => [0, 1].map((k) => (Math.min(...p.map((q) => q[k])) + Math.max(...p.map((q) => q[k]))) / 2) as [number, number]);
}
/** The solids it's made of (not counting the kernel's empty slivers). */
const bodies = (m: ReturnType<typeof crossingPiece>) => m.decompose().filter((b) => b.volume() > 1).length;
/** Is there material at (x, y) at height z? */
const solidAt = (s: Scad, m: ReturnType<typeof crossingPiece>, x: number, y: number, z: number) => m.slice(z).intersect(s.square([0.4, 0.4], true).translate([x, y])).area() > 0.01;

describe('guard rails and dual gauge', { timeout: 60000 }, () => {
  it('a straight with guard rails: more rail, one body, studs clear of them; pointed ends where asked', async () => {
    const plain = await piece(toRoutes(design({})));
    const none = await piece(toRoutes(design({ guardRails: true })));
    const both = await piece(toRoutes(design({ guardRails: true, guardRailEnds: 'both' })));
    const start = await piece(toRoutes(design({ guardRails: true, guardRailEnds: 'start', guardRailTaperShape: 'curve' })));
    for (const p of [none, both, start]) {
      expect(p.m.volume()).toBeGreaterThan(plain.m.volume() + 500);
      expect(bodies(p.m)).toBe(1);
      const st = studs(p.m);
      expect(st.length).toBeGreaterThan(10);
      // (along the parallel guard rails; by a point, where they haven't spread out yet, studs can be nearer their line)
      for (const [x, y] of st) if (p === none || (y > 90 && y < 24 * 8 - 90)) expect(Math.abs(Math.abs(x) - GUARD_X)).toBeGreaterThanOrEqual(3 + 2.4 + 0.3 - 0.01);
    }
    // (the plain track has studs where the guard rails go)
    expect(studs(plain.m).some(([x]) => Math.abs(Math.abs(x) - 12) < 0.1)).toBe(true);
    const L = 24 * 8;
    // parallel guard rails right to the ends (into the connectors' rail ends), no point in the middle
    expect(solidAt(none.s, none.m, GUARD_X, 6, 7)).toBe(true);
    expect(solidAt(none.s, none.m, 0, 16, 5)).toBe(false);
    // pointed: the nose on the centre line just in from the end, ramped up from the bed; no guard rail at the end connector
    expect(solidAt(both.s, both.m, 0, 16, 5)).toBe(true);
    expect(solidAt(both.s, both.m, 0, L - 16, 5)).toBe(true);
    expect(solidAt(both.s, both.m, 0, 11, 8.5)).toBe(false);
    expect(solidAt(both.s, both.m, GUARD_X, 6, 7)).toBe(false);
    expect(solidAt(start.s, start.m, 0, 13, 5)).toBe(true); // (the curve's point spreads sooner)
    expect(solidAt(start.s, start.m, 0, L - 16, 5)).toBe(false);
    expect(solidAt(start.s, start.m, GUARD_X, L - 6, 7)).toBe(true);
  });

  it('on sleepers: the sleepers\' posts clear of the guard rails and the third rail', async () => {
    const rts = toRoutes(design({ guardRails: true, guardRailEnds: 'start', dualGauge: true }));
    const p = await piece(rts, { sleepers: 'sleepers' }), plain = await piece(toRoutes(design({})), { sleepers: 'sleepers' });
    expect(p.m.volume()).toBeGreaterThan(plain.m.volume() + 500);
    expect(bodies(p.m)).toBe(1);
    const st = studs(p.m);
    expect(st.length).toBeGreaterThan(10);
    for (const [x] of st) {
      expect(Math.abs(Math.abs(x) - GUARD_X)).toBeGreaterThanOrEqual(5.69);
      expect(Math.abs(x + 4)).toBeGreaterThanOrEqual(6.59);
    }
  });

  it('a curve with guard rails, both kinds of end: one body, studs clear', async () => {
    for (const ends of ['none', 'both'] as const) {
      const d = design({ segs: [{ kind: 'curve', radius: 40, angle: 22.5 }], guardRails: true, guardRailEnds: ends });
      const rts = toRoutes(d), p = await piece(rts), plain = await piece(toRoutes(design({ segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] })));
      expect(p.m.volume()).toBeGreaterThan(plain.m.volume() + 400);
      expect(bodies(p.m)).toBe(1);
      const ex = extraRails(p.s, new Track(p.s, CROSSING_DEFAULTS), rts, 0, false, false)!;
      expect(ex.xfs).toEqual(ends === 'none' ? [[-GUARD_X, GUARD_X], [-GUARD_X, GUARD_X]] : [[], []]);
      const st = studs(p.m);
      expect(st.length).toBeGreaterThan(5);
      for (const q of st) expect(ex.clearOf(q)).toBe(true);
      // (parallel all along: off the guard rails' radius by the clearance; the curve turns left about (-320, 0))
      if (ends === 'none') for (const [x, y] of st) expect(Math.abs(Math.abs(Math.hypot(x + 320, y) - 320) - GUARD_X)).toBeGreaterThanOrEqual(5.69);
    }
  });

  it('a dual-gauge straight: a third rail, one body, studs clear; rail ends but at plain ends', async () => {
    const plain = await piece(toRoutes(design({})));
    const rts = toRoutes(design({ dualGauge: true })), dual = await piece(rts);
    expect(dual.m.volume()).toBeGreaterThan(plain.m.volume() + 500);
    expect(bodies(dual.m)).toBe(1);
    // (the narrow gauge shares the right rail: its third rail 3 studs left of it, at x = -4)
    for (const [x] of studs(dual.m)) expect(Math.abs(x + 4)).toBeGreaterThanOrEqual(3.9 + 2.4 + 0.3 - 0.01);
    expect(solidAt(dual.s, dual.m, -4, 96, 8)).toBe(true);
    const ex = extraRails(dual.s, new Track(dual.s, CROSSING_DEFAULTS), rts, 0, false, false)!;
    expect(ex.xfs).toEqual([[-4], [4]]);
    // plain at the start: stops short there, no rail end in that connector
    const pl = toRoutes(design({ dualGauge: true, dualPlainEnds: 'start', dualShared: 'left' }));
    expect(extraRails(dual.s, new Track(dual.s, CROSSING_DEFAULTS), pl, 0, false, false)!.xfs).toEqual([[], [-4]]);
    // with guard rails as well (the .scad allows both): all the extra rail ends
    const gd = toRoutes(design({ dualGauge: true, guardRails: true }));
    expect(extraRails(dual.s, new Track(dual.s, CROSSING_DEFAULTS), gd, 0, false, false)!.xfs).toEqual([[-4, -GUARD_X, GUARD_X], [4, -GUARD_X, GUARD_X]]);
    expect(bodies((await piece(gd)).m)).toBe(1);
  });

  it('cut up or turned round, start and end still mean the drawn route\'s', async () => {
    const [rt] = toRoutes(design({ guardRails: true, guardRailEnds: 'start', dualGauge: true, dualPlainEnds: 'end' }));
    const L = routeLength(rt);
    const rev = reversedRoute(rt);
    expect(rev.extra).toMatchObject({ from: L, to: 0 });
    const p = await piece([rev]);
    // the point still at the drawn start (y = 0 end), the third rail still left of the drawn route (x = -4), stopping short at the drawn end
    expect(solidAt(p.s, p.m, 0, 16, 5)).toBe(true);
    expect(solidAt(p.s, p.m, 0, L - 16, 5)).toBe(false);
    expect(solidAt(p.s, p.m, -4, 96, 8)).toBe(true);
    expect(extraRails(p.s, new Track(p.s, CROSSING_DEFAULTS), [rev], 0, false, false)!.xfs).toEqual([[-GUARD_X, GUARD_X], [-4]]); // (its start is the drawn end: guard rail ends, no third rail end; its end the drawn start: no guard rails, the third rail's end)
    // a stretch of it, and a tile's crop, keep their place along the drawn route
    expect(subRoute(rev, 20, 50).extra).toMatchObject({ from: L - 20, to: L - 50, len: L });
    const cr = cropRoutes([rt], [-100, 60, 100, 120], 10, []);
    expect(cr.routes[0].extra).toMatchObject({ from: cr.ranges[0][0], to: cr.ranges[0][1], guardEnds: 'start' });
  });

  it('left out where another route crosses (a design built whole: one track piece)', async () => {
    const d = design({ segs: [{ kind: 'straight', studs: 48 }], y: -24, guardRails: true, guardRailEnds: 'both', dualGauge: true },
      [{ name: 'B', x: 24, y: 0, heading: 90, segs: [{ kind: 'straight', studs: 48 }] }]);
    const b = buildDesign(await kernel(), { ...d, options: { printBedX: 600, printBedY: 600 } });
    expect(b.info.warnings).toEqual([]);
    const plain = buildDesign(await kernel(), { ...d, routes: d.routes.map((r) => ({ ...r, guardRails: false, dualGauge: false })), options: { printBedX: 600, printBedY: 600 } });
    expect(b.pieces.map((p) => p.name)).toEqual(plain.pieces.map((p) => p.name));
    expect(b.info.volume).toBeGreaterThan(plain.info.volume + 1000);
    // (worked out on the whole design: A's rails stop a sleeper length either side of B)
    const rts = toRoutes(d), s = new Scad(await kernel());
    const ex = extraRails(s, new Track(s, CROSSING_DEFAULTS), rts, 0, false, false)!;
    expect(ex.clearOf([-4, 0])).toBe(true);
    expect(ex.clearOf([-4, -100])).toBe(false);
  });
});
