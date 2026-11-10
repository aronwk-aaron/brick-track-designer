// A dual-gauge track's third rail through a crossing (geom/extrarails.ts DUAL_CROSS, geom/crossing.ts): it runs on where
// other track crosses it at 20 degrees or more, that track's flangeways cut through it and its own (the narrow gauge's
// wheels' flanges, inside it on the shared rail's side) through that track's rails. Checked with a flange swept along
// every rail of both tracks, both gauges. Through points it's still left out, and the build says so.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { solid } from './assembled.shared';

const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, G = 20, FL = { depth: 3, width: 1.5, off: 0.05 };
/** the third rail of a 2-stud gauge in a 4-stud one, the right-hand rail shared: 4 left of the middle; the narrow gauge's flange runs on its right */
const THIRD = -4;
const both: Design = { version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [
  { name: 'Dual', x: 0, y: -8, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 16 }] },
  { name: 'Dual2', x: 8, y: 0, heading: 90, dualGauge: true, segs: [{ kind: 'straight', studs: 16 }] }] };

describe('a dual-gauge track through a crossing', { timeout: 300000 }, () => {
  for (const [name, d, duals] of [['crossed square by a plain track', TEMPLATES['Dual gauge crossing 90°'], [0]], ['crossed at 45° by a plain track', TEMPLATES['Dual gauge crossing 45°'], [0]], ['crossed by another dual-gauge track', both, [0, 1]]] as [string, Design, number[]][])
    it(`${name}: the third rail runs through, and a flange passes along every rail of both gauges`, async () => {
      const w = await kernel(), s = new Scad(w);
      clearBuildCache();
      const b = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } }), routes = toRoutes(d);
      expect(b.info.warnings).toEqual([]);
      const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
      // (a flange's band beside a rail at x, on side sd of it, along a route short of its ends)
      const band = (r: number, x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], 10, routes[r].segments.reduce((t, sg) => t + (sg.kind === 'straight' ? sg.length : 0), 0) - 10);
      routes.forEach((_, r) => {
        expect(band(r, -G, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
        expect(band(r, G, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
        if (duals.includes(r)) expect(band(r, THIRD, 1).intersect(track).volume(), `route ${r}, the narrow gauge inside its third rail`).toBeLessThan(0.02);
      });
      // (the third rail is there in the crossing: rail between the other track's rails, on its line, at the rail's top)
      for (const r of duals) {
        const mid = routes[r].segments.reduce((t, sg) => t + (sg.kind === 'straight' ? sg.length : 0), 0) / 2;
        const rail = sweepRoute(s, s.square([1, 1]).translate([THIRD - 0.5, RAIL_TOP - 1.5]), routes[r], mid - 30, mid + 30);
        expect(rail.intersect(track).volume()).toBeGreaterThan(rail.volume() * 0.5);
      }
      clearBuildCache();
    });
  it('through a switch the third rail is left out, and the build says where and that narrow-gauge trains can\'t run there', async () => {
    const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', printBedX: 500, printBedY: 500 }, routes: [
      { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }] }] });
    expect(b.info.warnings.join(' ')).toMatch(/dual gauge isn't built through points.*the third rail of Dual is left out for \d+ studs at .* narrow-gauge trains can't run through there/);
    clearBuildCache();
  });
});
