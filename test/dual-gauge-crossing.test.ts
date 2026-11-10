// A dual-gauge track's third rail through a crossing (geom/extrarails.ts DUAL_CROSS, geom/crossing.ts): it runs on where
// other track crosses it at 20 degrees or more, that track's flangeways cut through it and its own (the narrow gauge's
// wheels' flanges, inside it on the shared rail's side) through that track's rails. Checked with a flange swept along
// every rail of both tracks, both gauges. Through points it runs on where the branch leaves on its side and crosses it
// steeply enough (an R40 branch); elsewhere through points it's still left out, and the build says so.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, TEMPLATES, toRoutes } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { assembledProblems, solid } from './assembled.shared';

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
  // (through points: the third rail runs on where the branch leaves on its side (extrarails.ts clearStretches): it lies
  // between the blades' plates, which are kept clear of it (base.ts railsNear), and the branch's inner rail crosses it
  // past the blades at a fixed frog, flangeways cut both ways as at any crossing)
  for (const [name, sg] of [['Dual gauge switch R40 left', -1], ['Dual gauge switch R40 right', 1]] as [string, number][]) for (const blade of ['simple', 'sprung'] as const)
    it(`${name}, ${blade === 'simple' ? 'rigid' : 'sprung'} blades: the third rail runs through the points, a flange passes along every rail of both gauges, and it goes together`, async () => {
      const w = await kernel(), s = new Scad(w), t = TEMPLATES[name], d: Design = { ...t, options: { ...t.options, bladeStyle: blade, printBedX: 500, printBedY: 500 } };
      clearBuildCache();
      const b = buildDesign(w, structuredClone(d)), routes = toRoutes(d);
      // (sprung blades asked for: rigid ones there, and said: a sprung plate cut back clear of the third rail has no room for its spring)
      expect(b.info.warnings.filter((q) => !(blade === 'sprung' && /blades are rigid/.test(q)))).toEqual([]);
      if (blade === 'sprung') expect(b.info.warnings.join(' ')).toMatch(/blades are rigid/);
      expect(b.info.switches).toBe(1);
      const track = w.Manifold.union(b.pieces.filter((q) => !/points|throw|lever/.test(q.name)).map((q) => solid(w, q.positions)!));
      const L = (r: number) => routes[r].segments.reduce((a, sg2) => a + (sg2.kind === 'straight' ? sg2.length : (Math.abs(sg2.angle) * Math.PI * sg2.radius) / 180), 0);
      const band = (r: number, x: number, sd: number, s0 = 4) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], s0, L(r) - 4);
      // (the third rail there from the toe to the far end)
      const rail = sweepRoute(s, s.square([1, 1]).translate([sg * 4 - 0.5, RAIL_TOP - 1.5]), routes[0], 8, L(0) - 8);
      expect(rail.intersect(track).volume()).toBeGreaterThan(rail.volume() * 0.9);
      // (the narrow gauge's flange inside the third rail, all the way: clear of the track, and of the blades wherever they are)
      const narrow = band(0, sg * 4, -sg);
      expect(narrow.intersect(track).volume(), 'the narrow gauge inside its third rail').toBeLessThan(0.02);
      for (const q of b.pieces.filter((p2) => /points-[ab]/.test(p2.name))) {
        const m = solid(w, q.positions)!, tn = q.turn!, sw = tn.swing ?? tn.by;
        for (const f of [-1, 0, 1]) {
          const at = m.translate([-tn.at[0], -tn.at[1], 0]).rotate([0, 0, sw * f]).translate([tn.at[0], tn.at[1], 0]);
          expect(narrow.intersect(at).volume(), `${q.name} turned ${f}, in the narrow gauge's flange's way`).toBeLessThan(0.02);
          // (and the blade clear of the third rail itself, over its swing)
          if (f * Math.sign(tn.by || 1) >= 0 || tn.by === 0) expect(at.intersect(rail).volume(), `${q.name} turned ${f}, on the third rail`).toBeLessThan(0.02);
        }
      }
      // (past the blades, the fixed track: both gauges on the straight, the standard on the branch, over the frog at the third rail)
      for (const [what, v] of [['the straight, left rail', band(0, -G, 1, 110)], ['the straight, right rail', band(0, G, -1, 110)], ['the branch, left rail', band(1, -G, 1, 110)], ['the branch, right rail', band(1, G, -1, 110)]] as [string, ReturnType<typeof band>][])
        expect(v.intersect(track).volume(), what).toBeLessThan(0.02);
      expect(assembledProblems(w, b.pieces, { ...OPTION_DEFAULTS, ...d.options }).join('; ')).toBe('');
      clearBuildCache();
    });
  it('through points whose branch leaves on the shared rail\'s side, or too shallow (R104), the third rail is left out, and the build says where', async () => {
    for (const branch of [{ kind: 'curve' as const, radius: 40, angle: -33.75 }, { kind: 'curve' as const, radius: 104, angle: 22.5 }]) {
      const b = buildDesign(await kernel(), { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', printBedX: 500, printBedY: 500 }, routes: [
        { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [branch] }] });
      expect(b.info.warnings.join(' ')).toMatch(/dual gauge isn't built through points.*the third rail of Dual is left out for \d+ studs at .* narrow-gauge trains can't run through there/);
      clearBuildCache();
    }
  });
});

// The narrow gauge centred (dualShared: 'centre'): up the middle on two rails of its own, four rails in all, each 12 mm
// from the middle (a 2-stud gauge), where a narrow-gauge track's own rails are: over the end connector's peg and clip.
// A flange swept along all four rails, both gauges; each end's supports loose; lengths go together, on ballast too.
// Through a crossing they run on as a third rail does; through points they're left out, and said.
describe('dual gauge, the narrow gauge centred (four rails)', { timeout: 600000 }, () => {
  const N = 12, APP = (globalThis as { APP_DEFAULTS?: typeof OPTION_DEFAULTS }).APP_DEFAULTS!;
  const len = (rt: ReturnType<typeof toRoutes>[number]) => rt.segments.reduce((a, sg) => a + (sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180), 0);
  for (const ballast of ['none', 'buddy'] as const)
    it(`track in 16-stud lengths${ballast === 'none' ? '' : ', on ballast'}: four rails end to end, a flange passes along each, the supports break away, and it goes together`, async () => {
      const w = await kernel(), s = new Scad(w), t = TEMPLATES['Dual gauge track, narrow gauge centred'];
      const d: Design = { ...t, options: { ...t.options, legoTrack: 'print', ballast, sleepers: 'sleepers', splitTrack: 'lengths', pieceLengthStuds: 16 } };
      clearBuildCache();
      const b = buildDesign(w, structuredClone(d)), rt = toRoutes(d)[0], L = len(rt);
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.filter((p) => !/ballast/.test(p.name)).length).toBeGreaterThanOrEqual(4);
      for (const p of b.pieces.filter((q) => !/ballast/.test(q.name))) expect(p.supports?.length ?? 0, `${p.name}'s break-out supports`).toBeGreaterThan(0);
      const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
      const band = (x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), rt, 1, L - 1);
      for (const [what, x, sd] of [['the left running rail', -G, 1], ['the right running rail', G, -1], ['the narrow gauge\'s left rail', -N, 1], ['the narrow gauge\'s right rail', N, -1]] as [string, number, number][])
        expect(band(x, sd).intersect(track).volume(), `a flange inside ${what}`).toBeLessThan(0.02);
      // (the narrow gauge's rails there all the way, joints and all)
      for (const x of [-N, N]) {
        const rail = sweepRoute(s, s.square([1, 1]).translate([x - 0.5, RAIL_TOP - 1.5]), rt, 1, L - 1);
        expect(rail.intersect(track).volume(), `the narrow gauge's rail at ${x}`).toBeGreaterThan(rail.volume() * 0.97);
      }
      clearBuildCache();
      const saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try { expect(assembledProblems(w, b.pieces, { ...APP, ...d.options }).join('; ')).toBe(''); } finally { Object.assign(OPTION_DEFAULTS, saved); }
    });
  it('crossed square by a plain track: all four rails run through, and a flange passes along every rail of both gauges', async () => {
    const w = await kernel(), s = new Scad(w), d = TEMPLATES['Dual gauge crossing 90°, narrow gauge centred'];
    clearBuildCache();
    const b = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } }), routes = toRoutes(d);
    expect(b.info.warnings).toEqual([]);
    const track = w.Manifold.union(b.pieces.map((q) => solid(w, q.positions)!));
    const band = (r: number, x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], 10, len(routes[r]) - 10);
    routes.forEach((_, r) => {
      expect(band(r, -G, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
      expect(band(r, G, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
    });
    for (const [x, sd] of [[-N, 1], [N, -1]]) {
      expect(band(0, x, sd).intersect(track).volume(), `the narrow gauge inside its rail at ${x}`).toBeLessThan(0.02);
      const mid = len(routes[0]) / 2, rail = sweepRoute(s, s.square([1, 1]).translate([x - 0.5, RAIL_TOP - 1.5]), routes[0], mid - 30, mid + 30);
      expect(rail.intersect(track).volume()).toBeGreaterThan(rail.volume() * 0.5);
    }
    expect(assembledProblems(w, b.pieces, { ...OPTION_DEFAULTS, ...d.options }).join('; ')).toBe('');
    clearBuildCache();
  });
  it('through points its rails are left out, and the build says where; a narrow gauge under 2 studs narrower isn\'t built', async () => {
    const w = await kernel();
    const b = buildDesign(w, { version: 1, gaugeStuds: 4, options: { legoTrack: 'print', printBedX: 500, printBedY: 500 }, routes: [
      { name: 'Dual', x: 0, y: 0, heading: 0, dualGauge: true, dualShared: 'centre', segs: [{ kind: 'straight', studs: 40 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }] }] });
    expect(b.info.warnings.join(' ')).toMatch(/the narrow gauge centred isn't built through points.*the narrow gauge's rails of Dual are left out for \d+ studs at .* narrow-gauge trains can't run through there/);
    clearBuildCache();
    // (3 studs in a 4-stud track: its rails would be in the running rails: the track as it is without)
    const one = (o: object): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Dual', x: 0, y: 0, heading: 0, ...o, segs: [{ kind: 'straight', studs: 16 }] }] });
    const tris = (d: Design) => { clearBuildCache(); return buildDesign(w, d).pieces.map((p) => p.positions.length); };
    expect(tris(one({ dualGauge: true, dualShared: 'centre', dualGaugeStuds: 3 }))).toEqual(tris(one({})));
    expect(tris(one({ dualGauge: true, dualShared: 'centre', dualGaugeStuds: 2 }))).not.toEqual(tris(one({})));
    clearBuildCache();
  });
});
