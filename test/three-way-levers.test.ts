// A three-way with a lever to each blade (threeWayLevers 2, as the reference's triple switches: two levers at the same
// place, one each side, each working one blade on a slider of its own). The three routes are set by the two together:
// both blades closed, straight; the left one open, left; the right one open, right. Checked here: each route set, a
// wheel's flange passes (the sweep of flange-clearance.test.ts, along both rails of the route, the blades and sliders
// where that route has them); the blades clear of each other wherever each is (both open too, which sets no route);
// what's built (a slider and a lever a side, two detent dimples each); and that a three-way with one lever is as it was.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { sweepRoute } from '../src/geom/sweep';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, type SetSpec, switchGeometry, switchPlan } from '../src/switch/base';
import { assembledProblems } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

const FLANGE = { width: 1.5, open: 0.9, off: 0.05 };
const RAIL_TOP = 3.2 + 6.4, HEAD_HW = 1.25;
const arc = (id: string, radius: number, angle: number, on: number): Route => ({ id, start: [0, 0, 0], segments: [{ kind: 'arc', radius, angle }, { kind: 'straight', length: on }] });
const S: Route = { id: 'S', start: [0, 0, 0], segments: [{ kind: 'straight', length: 256 }] };
const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwAction: 'detent', bladeStyle: 'sprung', printBedX: 500, printBedY: 500 };
/** the two sets of a three-way with a lever to each blade: the left blade's (0), then the right one's */
const SPECS: SetSpec[] = [[0, 2, 12, undefined, 1, undefined, 0], [0, 2, 12, undefined, 1, undefined, 1]];
/** each route's setting: how far along its travel each set's slider is (0 as built: the left blade closed, the right one open) */
const SET: [string, number, [number, number]][] = [['right', 0, [0, 0]], ['straight', 1, [0, 1]], ['left', 2, [1, 1]]];

describe('a three-way with a lever to each blade', { timeout: 600000 }, () => {
  for (const [name, radius, o, depth] of [['R40, sprung blades', 320, {}, 3.09], ['R104, sprung blades', 832, {}, 3.09], ['R40, rigid blades', 320, { bladeStyle: 'simple' }, 3.45], ['R40, sprung blades on ballast', 320, { generateBallast: true }, 3.09]] as [string, number, Partial<BaseParams>, number][])
    it(`${name}: each of the three routes set, nothing in a flange's way; the blades clear of each other wherever they are`, async () => {
      const w = await kernel(), s = new Scad(w), routes = [arc('R', radius, -22.5, 80), S, arc('L', radius, 22.5, 80)];
      const plan = switchPlan(routes, SPECS, { ...p, ...o }, 1), gm = switchGeometry(s, plan), G = plan.G, v = plan.sets[0];
      expect(plan.warnings).toEqual([]);
      // (a set a blade: the left one's lever on the left, the right one's on the right, at the same place along the track)
      expect(plan.sets.map((x) => [x.fixed, x.throwDir])).toEqual([[1, -1], [0, 1]]);
      expect(plan.sets[0].throwY).toBeCloseTo(plan.sets[1].throwY, 6);
      expect(plan.sets[0].leverX).toBeCloseTo(-plan.sets[1].leverX, 6);
      const base = gm.base(), blades = [0, 1].map((k) => gm.pointsParts(k)), turns = [0, 1].map((k) => gm.pointsTurns(k)!), thr = [0, 1].map((k) => gm.throwPart(k));
      for (const k of [0, 1]) expect(blades[k]).toHaveLength(1);
      const at = (k: number, f: number) => { const [cx, cy] = turns[k][0].at; return blades[k][0].translate([-cx, -cy, 0]).rotate([0, 0, turns[k][0].swing * f]).translate([cx, cy, 0]); };
      for (const [what, r, pos] of SET) {
        const bandOf = (off: number, wd: number) => sweepRoute(s, s.square([wd - FLANGE.off, depth + 2]).translate([off < 0 ? off + HEAD_HW + FLANGE.off : off - HEAD_HW - wd, RAIL_TOP - depth]), routes[r], Math.max(0, v.sToe - 8), v.sHeel + 4);
        const band = s.union([-G, G].map((off) => bandOf(off, FLANGE.width)));
        // (blade 0, the left one, is open with its slider at 1; blade 1 with its slider at 0: an open blade's back lets a flange's tip by behind its stock rail)
        [0, 1].forEach((k) => { const open = k === 0 ? pos[0] === 1 : pos[1] === 0; expect((open ? bandOf(k === 0 ? -G : G, FLANGE.open) : band).intersect(at(k, pos[k])).volume(), `${open ? 'the open' : 'the closed'} ${k === 0 ? 'left' : 'right'} blade, set ${what}`).toBeLessThan(0.02); });
        [0, 1].forEach((k) => expect(band.intersect(thr[k].translate([plan.sets[k].leverTravel * pos[k], 0, 0])).volume(), `slider ${k}, set ${what}`).toBeLessThan(0.02));
        // (rigid blades' pins have a snap lip on top, 0.45 up into the deepest flange's way where a branch's wheel passes over
        // the other blade's pin, by the heel: 2.7 mm3, with one lever as with two: a fault of rigid blades on any three-way,
        // not of the levers; sprung blades turn on a stud under their plates, nothing above them)
        expect(band.intersect(base).volume(), `the bed, set ${what}`).toBeLessThan(o.bladeStyle === 'simple' && what !== 'straight' ? 2.8 : 0.02);
      }
      // (the blades wherever they are, both open too, clear of each other and of the other's slider)
      for (const f0 of [0, 0.5, 1]) for (const f1 of [0, 0.5, 1]) {
        expect(at(0, f0).intersect(at(1, f1)).volume(), `the blades, ${f0} and ${f1} along`).toBeLessThan(0.01);
        expect(at(0, f0).intersect(thr[1].translate([plan.sets[1].leverTravel * f1, 0, 0])).volume(), `the left blade and the right slider, ${f0} and ${f1} along`).toBeLessThan(0.01);
        expect(at(1, f1).intersect(thr[0].translate([plan.sets[0].leverTravel * f0, 0, 0])).volume(), `the right blade and the left slider, ${f0} and ${f1} along`).toBeLessThan(0.01);
      }
      // (the sliders never meet: each stops short of the middle)
      expect(thr[0].translate([plan.sets[0].leverTravel, 0, 0]).intersect(thr[1]).volume()).toBe(0);
    });

  it('as built: a blade, a slider and a lever each side, one switch; with one lever (the default) as it was', async () => {
    const w = await kernel();
    for (const name of ['Three-way switch (one throw)', 'Three-way R40']) {
      const d = TEMPLATES[name], one = buildDesign(w, { ...d, options: { ...d.options, threeWayLevers: 1 } }), two = buildDesign(w, { ...d, options: { ...d.options, threeWayLevers: 2 } });
      const moving = (b: typeof one) => b.pieces.map((q) => q.name).filter((n) => /points|throw|lever/.test(n)).map((n) => n.replace(/^switch-/, ''));
      expect(moving(one)).toEqual(name === 'Three-way R40' ? ['points-a', 'points-b', 'points-throw', 'points-lever'] : ['points-a', 'points-b', 'throw', 'lever']);
      expect(moving(two)).toEqual(name === 'Three-way R40' ? ['points1', 'points1-throw', 'points1-lever', 'points2', 'points2-throw', 'points2-lever'] : ['points1', 'throw1', 'lever1', 'points2', 'throw2', 'lever2']);
      expect(two.info.switches).toBe(1);
      expect(two.info.warnings).toEqual([]);
    }
    // (on tines under the bed there's one slider: the choice is left as one lever)
    const d = TEMPLATES['Three-way switch (one throw)'], tines = (n: 1 | 2) => buildDesign(w, { ...d, options: { ...d.options, mechStyle: 'tines', threeWayLevers: n } });
    expect(tines(2).pieces.map((q) => q.name)).toEqual(tines(1).pieces.map((q) => q.name));
  });
});

// (with the other settings, and in harder places: built with the app's defaults, and everything put together and moved
// (assembled.shared.ts: nothing overlaps, each blade follows its slider, each lever drives its own, every part goes in))
describe('a three-way with a lever to each blade goes together', { timeout: 900000 }, () => {
  const t = TEMPLATES['Three-way R40'], o = (more: Partial<PieceOptions>): Design => ({ ...t, options: { ...t.options, ...more } });
  const cases: [string, Design, RegExp?][] = [
    ['on ballast', o({ ballast: 'ballast' })], ['its levers on brackets', o({ throwStyle: 'bracket' })], ['with switch stands', o({ throwStyle: 'stand' })],
    ['rigid blades', o({ bladeStyle: 'simple' })], ['rigid, realistic blades with a lip over the front', o({ bladeStyle: 'prototype', bladeLip: 'front' })],
    // (two positions a lever, but the blades aren't one set between two stock rails: the levers click)
    ['a snap clamp asked for: left out, and said', o({ throwAction: 'snap' }), /click on their levers/],
    ['at 30° to the stud grid', { ...t, routes: t.routes.map((r) => ({ ...r, heading: 30 })) }],
    ['three tracks coming together (trailing points)', { ...t, routes: t.routes.map((r) => ({ ...r, heading: 180 })) }],
    ['a track alongside, 16 studs over', { ...t, routes: [...t.routes, { name: 'Beside', x: -16, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }] }],
  ];
  for (const [name, d, says] of cases) it(name, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(d));
      clearBuildCache();
      expect(b.pieces.filter((q) => /lever/.test(q.name))).toHaveLength(2);
      expect(b.info.warnings.filter((q) => !says?.test(q))).toEqual([]);
      if (says) expect(b.info.warnings.some((q) => says.test(q))).toBe(true);
      expect(assembledProblems(w, b.pieces, { ...APP, ...d.options }).join('; ')).toBe('');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('a track alongside 8 studs over, where the lever on that side has no room: said, with what to do', async () => {
    const b = buildDesign(await kernel(), { ...t, routes: [...t.routes, { name: 'Beside', x: -8, y: -8, heading: 0, segs: [{ kind: 'straight', studs: 24 }] }] });
    expect(b.info.warnings.join(' ')).toMatch(/the left lever of the three-way at 0, 0 \(studs\) is in the way of a train on another track: .* One lever/);
  });
});
