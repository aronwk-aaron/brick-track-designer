// A wheel's flange through the points: LEGO's wheels' flanges hang 3.2 to 3.45 mm below the rail's top, just inside it
// (LDraw's 57878, 55423, 85489). Swept along both rails of each route through the points, set for that route, it
// must clear everything there: the blades' plates, the slider's posts, the pins, lips and bosses on the bed.
// (Rigid blades on track alone used to stand 1.7 under the rail's top: switch/context.ts SHALLOW_SLIDER.)
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchGeometry, switchPlan } from '../src/switch/base';

/**
 * the deepest flange (55423 on its bare tread), and its thickness with a little play (57878's is 1.2 at its tip).
 * open: what's asked of an open blade's back, behind its stock rail: half way along, where the rails have hardly
 * parted, a 3 mm throw leaves 1.4 there (rigid blades; prototype ones, planed, 1.0): the flange's tip goes through,
 * no more. (Blade throw sets it.)
 */
const FLANGE = { depth: 3.45, width: 1.5, open: 0.9, off: 0.05 };
const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25;
const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 256 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 130 }] };
const BR: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: -22.5 }, { kind: 'straight', length: 130 }] };
const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwAction: 'detent', bladeStyle: 'simple' };

/** How far into a flange's way each thing is (mm3), over both routes: [what, volume]. depth: the flange's. */
async function inTheWay(routes: Route[], spec: [number, number, number], o: Partial<BaseParams>, depth = FLANGE.depth) {
  const w = await kernel(), s = new Scad(w), plan = switchPlan(routes, [spec], { ...p, ...o }, 1), v = plan.sets[0], gm = switchGeometry(s, plan), G = plan.G;
  const base = gm.base(), thr = gm.throwPart(0), blades = gm.pointsParts(0), turns = gm.pointsTurns(0)!, spring = gm.springPart(0);
  const out: [string, number][] = [];
  for (const [k, at] of [[spec[0], 0], [spec[1], 1]] as [number, number][]) {
    // (the flange inside each rail of this route, from before the toe to past the heel)
    // (a hair off the rail's face: the swept band's and the rail's own facets differ by that on a curve)
    const bandOf = (off: number, wd: number) => sweepRoute(s, s.square([wd - FLANGE.off, depth + 2]).translate([off < 0 ? off + HEAD_HW + FLANGE.off : off - HEAD_HW - wd, RAIL_TOP - depth]), routes[k], Math.max(0, v.sToe - 8), v.sHeel + 4);
    const band = s.union([-G, G].map((off) => bandOf(off, FLANGE.width)));
    // (the blade this route runs on: blade 0 for the right-hand route; the other is open, behind its stock rail)
    const on = at === 0 ? 0 : 1, ids = [0, 1].filter((j) => j !== v.fixed);
    const turned = blades.map((m, j) => { const [cx, cy] = turns[j].at; return m.translate([-cx, -cy, 0]).rotate([0, 0, turns[j].swing * at]).translate([cx, cy, 0]); });
    turned.forEach((m, n) => { const j = ids[n], open = j !== on; out.push([`${open ? 'the open blade' : 'the blade'}, route ${k}`, (open ? bandOf(j === 0 ? -G : G, FLANGE.open) : band).intersect(m).volume()]); });
    for (const [what, m] of [['the slider', thr.translate([v.leverTravel * at, 0, 0])] as const, ['the bed', base] as const, ...(spring ? [['the spring', spring] as const] : [])]) out.push([`${what}, route ${k}`, band.intersect(m).volume()]);
  }
  return { out, plan, plateTop: v.fdb ? plan.g.bedTop + plan.p.pointClearance + (plan.p.bladeStyle === 'sprung' ? 3 : 1.6) : 0 };
}

describe('wheels\' flanges through the points', { timeout: 300000 }, () => {
  const cases: [string, Route[], [number, number, number], Partial<BaseParams>][] = [
    ['a left switch, rigid blades', [A, B], [0, 1, 12], {}], ['a right switch, rigid blades', [BR, A], [0, 1, 12], {}],
    ['prototype blades', [A, B], [0, 1, 12], { bladeStyle: 'prototype' }], ['one moving blade', [A, B], [0, 1, 12], { pointBlades: 1 }],
    ['rigid blades, lip over the front', [A, B], [0, 1, 12], { bladeStyle: 'prototype', bladeLip: 'front' }],
    ['rigid blades on ballast', [A, B], [0, 1, 12], { generateBallast: true }], ['an over-centre spring', [A, B], [0, 1, 12], { throwAction: 'overcentre' }],
  ];
  for (const [name, routes, spec, o] of cases) it(`${name}: nothing in a flange's way, either way set`, async () => {
    const r = await inTheWay(routes, spec, o);
    for (const [what, vol] of r.out) expect(vol, what).toBeLessThan(0.02);
    // (the plates' tops well under the flange: 3.8 under the rail's top on track alone)
    expect(RAIL_TOP - r.plateTop).toBeGreaterThan(FLANGE.depth + 0.3);
  });
  // (Flange relief in sprung blades, bladeRelief: a groove 0.4 deep in the plate's top, and through the lip's, where the flange runs)
  it('sprung blades with the flange relief: the deepest flange (3.45) clears them, either way set; the plate still 0.8 thick under the groove', async () => {
    for (const o of [{ bladeStyle: 'sprung' as const, bladeRelief: true }, { bladeStyle: 'sprung' as const, bladeRelief: true, generateBallast: true }, { bladeStyle: 'sprung' as const, bladeRelief: true, pointBlades: 1 as const }]) {
      const r = await inTheWay([A, B], [0, 1, 12], o);
      for (const [what, vol] of r.out) expect(vol, what).toBeLessThan(0.02);
      // (and without it the same flange rubs: the relief is what clears it)
      const flat = await inTheWay([A, B], [0, 1, 12], { ...o, bladeRelief: false });
      expect(Math.max(...flat.out.map(([, vol]) => vol))).toBeGreaterThan(1);
      // (under the groove's floor, 0.8 of plate everywhere: a slab that thick just under it is solid plate)
      const w = await kernel(), s = new Scad(w), gm = switchGeometry(s, r.plan), gf = switchGeometry(s, flat.plan);
      gm.pointsParts(0).forEach((m, k) => {
        // (the groove in plan: where the flat plate has top the relieved one hasn't, half way down the groove)
        // (behind the plate's front, which is bevelled back 2.4 under its lip: a wedge there with or without the groove)
        const zt = r.plateTop, all = gf.pointsParts(0)[k].slice(zt - 0.2).subtract(m.slice(zt - 0.2)), front = all.bounds().min[1] + 3;
        const groove = all.intersect(s.square([400, 400]).translate([-200, front]));
        expect(groove.area()).toBeGreaterThan(40);
        // (its floor 0.4 down, 3.5 under the rail's top; and plate under all of it from there to 0.8 further down)
        expect(RAIL_TOP - (zt - 0.4)).toBeCloseTo(3.5, 6);
        expect(groove.intersect(m.slice(zt - 0.39)).area()).toBeLessThan(groove.area() * 0.02);
        for (const z of [zt - 0.41, zt - 0.8, zt - 1.19]) expect(groove.intersect(m.slice(z)).area(), `plate under the groove at ${(zt - z).toFixed(2)} down`).toBeGreaterThan(groove.area() * 0.97); // (all but its edge by the toe, where the plate tapers)
      });
    }
  });
  it('sprung blades (the reference\'s 3 mm plate): their tops 3.1 under the rail\'s top, clear of a flange 3.1 deep; a deeper one rubs along them', async () => {
    for (const o of [{ bladeStyle: 'sprung' as const }, { bladeStyle: 'sprung' as const, generateBallast: true }]) {
      const r = await inTheWay([A, B], [0, 1, 12], o, 3.09);
      for (const [what, vol] of r.out) expect(vol, what).toBeLessThan(0.02);
      expect(RAIL_TOP - r.plateTop).toBeCloseTo(3.1, 6);
    }
  });
});
