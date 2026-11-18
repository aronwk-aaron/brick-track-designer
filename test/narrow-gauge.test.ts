// Narrow gauge points (rails under 4 studs apart): two blades' plates, each on its own pin, don't fit side by side
// between the rails (they lay over each other, and on each other's pins: 26 mm3 of each in the bed's stud). As the
// reference's narrow-gauge switches and wye, both blades are on one plate, on one pin (switch/base.ts joinedPoints):
// one closes as the other opens. Moving blades: One is still the single-point switch.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES, toRoutes } from '../src/app/design';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import { routeLength, routePose } from '../src/route/route';
import { optionForm, type OptCtx } from '../src/app/settings';
import { OPTION_DEFAULTS } from '../src/app/design';

type W = Awaited<ReturnType<typeof kernel>>;
/** A piece's triangles as a solid again. */
const solid = (w: W, pos: Float32Array) => { const m = new w.Mesh({ numProp: 3, vertProperties: pos, triVerts: Uint32Array.from({ length: pos.length / 3 }, (_, k) => k) }); m.merge(); return new w.Manifold(m); };
const sw = (gaugeStuds: number, options: Design['options'] = {}, name = 'Narrow-gauge switch R48 left'): Design => ({ ...structuredClone(TEMPLATES[name]), gaugeStuds, options: { legoTrack: 'print', ...options } });
/** A solid turned about a point (degrees, anticlockwise from above). */
const turned = (m: InstanceType<W['Manifold']>, at: [number, number], a: number) => m.translate([-at[0], -at[1], 0]).rotate([0, 0, a]).translate([at[0], at[1], 0]);
/** How many rails stand on a points part: the pieces of it at the rail head's height (the bed's top is at 3.2, the rails' at 9.6). */
const railsOn = (m: InstanceType<W['Manifold']>) => m.slice(8.6).decompose().length;

describe('narrow gauge points', { timeout: 600000 }, () => {
  for (const name of ['Narrow-gauge switch R48 left', 'Narrow-gauge switch R36 right', 'Narrow-gauge wye R36']) for (const bladeStyle of ['sprung', 'simple'] as const) for (const ballast of ['none', 'ballast'] as const)
    it(`${name}, ${bladeStyle} blades${ballast === 'none' ? '' : ', on ballast'}: both blades on one plate, one closed as the other opens, clear of the track at both ends`, async () => {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, sw(2, { bladeStyle, ballast }, name));
      expect(b.info.warnings).toEqual([]);
      const points = b.pieces.filter((p) => /points(-[ab])?$/.test(p.name));
      expect(points.map((p) => p.name.replace(/^switch-/, ''))).toEqual(['points']);
      const fixed = w.Manifold.union(b.pieces.filter((p) => /^track|base/.test(p.name)).map((p) => solid(w, p.positions)));
      expect(fixed.volume()).toBeGreaterThan(1000);
      const m = solid(w, points[0].positions), t = points[0].turn!;
      // (one part, one body, a rail along each edge)
      expect(m.decompose().length).toBe(1);
      expect(railsOn(m)).toBe(2);
      expect(Math.abs(t.swing!)).toBeGreaterThan(1);
      // (clear of the track as assembled, over its swing and at its other end)
      for (const f of [0, 0.25, 0.5, 0.75, 1]) expect(turned(m, t.at, t.swing! * f).intersect(fixed).volume(), `turned ${f} of its swing`).toBeLessThan(0.05);
      // (at each end a blade lies closed on its stock rail: a degree further and it's in it)
      expect(turned(m, t.at, -Math.sign(t.swing!)).intersect(fixed).volume(), 'a degree past as assembled').toBeGreaterThan(0.5);
      expect(turned(m, t.at, t.swing! + Math.sign(t.swing!)).intersect(fixed).volume(), 'a degree past its other end').toBeGreaterThan(0.5);
      clearBuildCache();
    });
  it('Moving blades: One is the single-point switch still: one blade on its plate, the other rail fixed', async () => {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, sw(2, { pointBlades: 1 }));
    expect(b.info.warnings).toEqual([]);
    const points = b.pieces.filter((p) => /points(-[ab])?$/.test(p.name));
    expect(points.length).toBe(1);
    expect(railsOn(solid(w, points[0].positions))).toBe(1);
    const fixed = w.Manifold.union(b.pieces.filter((p) => /^track|base/.test(p.name)).map((p) => solid(w, p.positions)));
    expect(solid(w, points[0].positions).intersect(fixed).volume()).toBeLessThan(0.05);
    clearBuildCache();
  });
  it('3-stud gauge too; 4 studs and up keep a plate to each blade; on tines both blades as ever', async () => {
    const w = await kernel();
    clearBuildCache();
    const parts = (g: number, o: Design['options'] = {}) => buildDesign(w, sw(g, o)).pieces.filter((p) => /points(-[ab])?$/.test(p.name));
    const three = parts(3);
    expect(three.map((p) => p.name.replace(/^switch-/, ''))).toEqual(['points']);
    expect(railsOn(solid(w, three[0].positions))).toBe(2);
    expect(parts(4).map((p) => p.name.replace(/^switch-/, ''))).toEqual(['points-a', 'points-b']);
    clearBuildCache();
  });
  it('the Moving blades setting: Two can be had at narrow gauge, and says how', () => {
    let d: Design = sw(2);
    const f = optionForm(() => d).form.flatMap((s) => s.fields).find((x) => x.key === 'pointBlades')!;
    const c: OptCtx = { o: { ...OPTION_DEFAULTS }, ballast: false, fdb: true, switches: true };
    const two = f.choices!.find((ch) => ch.v === '2')!, one = f.choices!.find((ch) => ch.v === '1')!;
    expect(two.no?.(c)).toBeUndefined();
    expect(two.tip).toMatch(/Under 4 studs' gauge the two are on one plate/);
    expect(one.no?.(c)).toBeUndefined();
    d = sw(4);
    expect(two.no?.(c)).toBeUndefined();
  });
});

// The reference's narrow gauge crossings at 22.5 and 33.75 degrees, and its double crossover (design.ts: the crossings'
// other track 26 and 20 studs long at the angle each is named for, through the straight's middle; the crossover's roads
// the R36 switch's branch out and back, 12 studs over in 40). Checked: where each track's ends are, and that a wheel's
// flange (as deep as the flangeways are cut: Flangeway depth, 3 mm) passes along both rails of every track through the crossing
// (narrow gauge: the rails 12 mm either side of the middle).
describe('narrow gauge crossings', { timeout: 300000 }, () => {
  const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25, G = 12, FL = { depth: 3, width: 1.5, off: 0.05 };
  const ends = (d: Design) => toRoutes(d).map((r) => [routePose(r, 0), routePose(r, routeLength(r))].map((q) => [q[0] / 8, q[1] / 8]));
  for (const [name, across, along, deg] of [['22.5° left', -4.975, 12.01, 22.5], ['22.5° right', 4.975, 12.01, -22.5], ['33.75° left', -5.556, 8.315, 33.75], ['33.75° right', 5.556, 8.315, -33.75]] as [string, number, number, number][])
    it(`Narrow-gauge crossing ${name}: the other track through the straight's middle at its angle, and a flange passes along every rail`, async () => {
      const d = TEMPLATES[`Narrow-gauge crossing ${name}`], w = await kernel(), s = new Scad(w), routes = toRoutes(d), [a, b] = ends(d);
      // (the straight up the middle, the other track's ends the same way off it each side: through its middle)
      expect(a[0][0]).toBeCloseTo(0, 6); expect(a[1][0]).toBeCloseTo(0, 6); expect(a[0][1]).toBeCloseTo(-a[1][1], 6);
      expect(b[1][0]).toBeCloseTo(across, 2); expect(b[1][1]).toBeCloseTo(along, 2);
      expect(b[0][0]).toBeCloseTo(-across, 2); expect(b[0][1]).toBeCloseTo(-along, 2);
      expect((Math.atan2(-(b[1][0] - b[0][0]), b[1][1] - b[0][1]) * 180) / Math.PI).toBeCloseTo(deg, 4);
      clearBuildCache();
      const built = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } });
      expect(built.info.warnings).toEqual([]);
      const track = w.Manifold.union(built.pieces.map((q) => solid(w, q.positions)));
      const band = (r: number, x: number, sd: number) => sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], 8, routeLength(routes[r]) - 8);
      routes.forEach((_, r) => {
        expect(band(r, -G, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
        expect(band(r, G, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
      });
      clearBuildCache();
    });
  it('Narrow-gauge double crossover R36: its roads end on the other track, and a flange passes along every rail through the crossing in the middle', async () => {
    const d = TEMPLATES['Narrow-gauge double crossover R36'], w = await kernel(), s = new Scad(w), routes = toRoutes(d), e = ends(d);
    expect(e[2][1][0]).toBeCloseTo(-6, 3); expect(e[2][1][1]).toBeCloseTo(20, 3); expect(e[3][1][0]).toBeCloseTo(6, 3); expect(e[3][1][1]).toBeCloseTo(20, 3);
    clearBuildCache();
    const built = buildDesign(w, { ...d, options: { ...d.options, printBedX: 500, printBedY: 500 } });
    expect(built.info.warnings).toEqual([]);
    expect(built.info.switches).toBe(4);
    // (the fixed track; the points' blades are at the ends, the sweep in the middle 16 studs)
    const track = w.Manifold.union(built.pieces.filter((q) => !/points|throw|lever/.test(q.name)).map((q) => solid(w, q.positions)));
    const band = (r: number, x: number, sd: number) => { const L = routeLength(routes[r]); return sweepRoute(s, s.square([FL.width - FL.off, FL.depth + 2]).translate([sd > 0 ? x + HEAD_HW + FL.off : x - HEAD_HW - FL.width, RAIL_TOP - FL.depth]), routes[r], L / 2 - 64, L / 2 + 64); };
    routes.forEach((_, r) => {
      expect(band(r, -G, 1).intersect(track).volume(), `route ${r}, inside its left rail`).toBeLessThan(0.02);
      expect(band(r, G, -1).intersect(track).volume(), `route ${r}, inside its right rail`).toBeLessThan(0.02);
    });
    clearBuildCache();
  });
});

// A 2-stud gauge's rails are 12 mm from the middle, the end connector's C-clip at 8: the support under the rail end over
// the clip reached in under it and printed as one with the part, footing and all (no break-out supports at all, and the
// footing in the next piece's end). None there now: the clip holds that rail end up (track.ts railOverClip).
describe('narrow gauge track ends', { timeout: 300000 }, () => {
  for (const ballast of ['none', 'buddy'] as const)
    it(`2-stud gauge track in two lengths${ballast === 'none' ? '' : ', on ballast'}: each end's supports break away, and the lengths go together`, async () => {
      const { goesTogether } = await import('./assembled.shared');
      const d: Design = { version: 1, gaugeStuds: 2, options: { legoTrack: 'print', ballast, splitTrack: 'lengths', pieceLengthStuds: 16 }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] };
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(d));
      expect(b.pieces.length).toBe(2);
      // (its supports apart from it: loose, to break away)
      for (const p of b.pieces) expect(p.supports?.length ?? 0, `${p.name}'s break-out supports`).toBeGreaterThan(0);
      clearBuildCache();
      await goesTogether('2-stud gauge track in two lengths', d);
    });
});
