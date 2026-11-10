// A three-way with a lever to each blade (threeWayLevers 2, as the reference's triple switches: two levers at the same
// place, one each side, each working one blade on a slider of its own). The three routes are set by the two together:
// both blades closed, straight; the left one open, left; the right one open, right. Checked here: each route set, a
// wheel's flange passes (the sweep of flange-clearance.test.ts, along both rails of the route, the blades and sliders
// where that route has them); the blades clear of each other wherever each is (both open too, which sets no route);
// what's built (a slider and a lever a side, two detent dimples each); and that a three-way with one lever is as it was.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache, type TrackworkItem } from '../src/app/build';
import { eachLever } from '../src/app/canvas';
import { followTrackwork } from '../src/app/twfollow';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { optionForm } from '../src/app/settings';
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
  for (const [name, radius, o, depth] of [['R40, sprung blades', 320, {}, 3.09], ['R104, sprung blades', 832, {}, 3.09], ['R40, rigid blades', 320, { bladeStyle: 'simple' }, 3.45], ['R40, sprung blades on ballast', 320, { generateBallast: true }, 3.09],
    // (Flange relief in sprung blades: the deepest flange, 3.45, over the plates each branch's wheels cross)
    ['R40, sprung blades with the flange relief', 320, { bladeRelief: true }, 3.45]] as [string, number, Partial<BaseParams>, number][])
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
        // (rigid blades' pins: a branch's flange passes over the other blade's pin by the heel, through a groove in its snap lip's top)
        expect(band.intersect(base).volume(), `the bed, set ${what}`).toBeLessThan(0.02);
      }
      // (rigid blades: each pin's snap lip still holds its blade: its overhang past the plate's hole (2 + the clearance) is there
      // all round under the flanges' groove, 0.2 thick: 0.2 mm3 and more of the 0.27 an uncut lip has)
      if (o.bladeStyle === 'simple') for (const k of [0, 1]) {
        const [cx, cy] = turns[k][0].at, c = plan.p.pointClearance, zt = plan.g.bedTop + c + 1.6;
        const over = base.intersect(s.cylinder(1, 3, 3, 48).subtract(s.cylinder(1, 2 + c, 2 + c, 48)).translate([cx, cy, zt]));
        expect(over.volume(), `pin ${k}'s lip`).toBeGreaterThan(0.2);
        // (and the groove's floor 3.5 under the rail's top, where the far branch's flange runs across the pin)
        expect(base.intersect(s.cylinder(2, 2.4, 2.4, 48).translate([cx, cy, RAIL_TOP - 3.5 + 0.01])).volume(), `pin ${k}'s top`).toBeLessThan(s.cylinder(0.49, 2, 2, 48).volume() * 0.75);
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

// Each of the two levers is moved on its own (dragged on the plan, or set in the Trackwork panel): they're at the one toe,
// so they share its edit (design.trackwork.throw, by the toe), each's own inside it by its side (each); the edit follows
// its track as any other (twfollow.ts), both levers' with it.
describe('a three-way\'s two levers, each moved on its own', { timeout: 600000 }, () => {
  const t = TEMPLATES['Three-way R40'], levers = (b: ReturnType<typeof buildDesign>) => (b.overlay.items as TrackworkItem[]).filter((it) => it.kind === 'throw').map((it) => it.lever!);
  it('one lever moved out: it alone moves; set back, both are where they were; an edit from before (one offset for both) still moves both', async () => {
    const w = await kernel(), b0 = buildDesign(w, structuredClone(t)), l0 = levers(b0);
    expect(l0.map((l) => l.blade)).toEqual(['left', 'right']);
    expect(l0.map((l) => l.edited)).toEqual([false, false]);
    const key = (b0.overlay.items as TrackworkItem[]).find((it) => it.kind === 'throw')!.key, out = l0[1].leverOffset + 16;
    // (the right one two studs further out)
    const e1 = eachLever(undefined, 'right', out);
    expect(e1).toEqual({ each: { right: { leverOffset: out } } });
    const b1 = buildDesign(w, { ...structuredClone(t), trackwork: { throw: { [key]: e1 } } }), l1 = levers(b1);
    expect(b1.info.warnings).toEqual([]);
    expect(l1[1].leverOffset).toBeCloseTo(out, 6); expect(l1[0].leverOffset).toBeCloseTo(l0[0].leverOffset, 6);
    expect(l1.map((l) => l.edited)).toEqual([false, true]);
    // (then the left one a stud out: the right one's kept)
    const e2 = eachLever(e1, 'left', l0[0].leverOffset + 8);
    expect(e2).toEqual({ each: { left: { leverOffset: l0[0].leverOffset + 8 }, right: { leverOffset: out } } });
    const l2 = levers(buildDesign(w, { ...structuredClone(t), trackwork: { throw: { [key]: e2 } } }));
    expect(l2[0].leverOffset).toBeCloseTo(l0[0].leverOffset + 8, 6); expect(l2[1].leverOffset).toBeCloseTo(out, 6);
    // (the right one set back: the left one's edit stays; then the left: nothing's left)
    const e3 = eachLever(e2, 'right', undefined);
    expect(e3).toEqual({ each: { left: { leverOffset: l0[0].leverOffset + 8 } } });
    expect(eachLever(e3, 'left', undefined)).toEqual({});
    // (an edit from before each had its own: one offset, both levers'; one of them moved then, the other keeps it)
    const lOld = levers(buildDesign(w, { ...structuredClone(t), trackwork: { throw: { [key]: { leverOffset: out } } } }));
    expect(lOld.map((l) => l.leverOffset)).toEqual([expect.closeTo(out, 6), expect.closeTo(out, 6)]);
    expect(eachLever({ leverOffset: out, side: 'left' }, 'left', 8)).toEqual({ each: { left: { leverOffset: 8 }, right: { leverOffset: out } } });
  });
  it('the edit follows the three-way when its tracks are moved', async () => {
    const w = await kernel(), d = structuredClone(t), b0 = buildDesign(w, d), key = (b0.overlay.items as TrackworkItem[]).find((it) => it.kind === 'throw')!.key;
    const out = levers(b0)[0].leverOffset + 16;
    d.trackwork = { throw: { [key]: eachLever(undefined, 'left', out) } };
    followTrackwork(d, b0.overlay.items as TrackworkItem[]);
    for (const r of d.routes) { r.x += 24; r.y += 8; }
    followTrackwork(d);
    const b1 = buildDesign(w, d), l1 = levers(b1);
    expect(Object.keys(d.trackwork!.throw!)).toEqual([(b1.overlay.items as TrackworkItem[]).find((it) => it.kind === 'throw')!.key]);
    expect(l1[0].leverOffset).toBeCloseTo(out, 6); expect(l1.map((l) => l.edited)).toEqual([true, false]);
  });
});

// Throw: Nail switch on a three-way: no levers; each blade on a short slider of its own under it (as with two levers,
// whatever Three-way switches worked by says: one slider's three positions have nothing to hold them without a lever),
// pushed over by a fingernail in the notch on its plate. The setting for the levers is greyed out, and says why.
describe('a three-way as nail switches', { timeout: 900000 }, () => {
  const t = TEMPLATES['Three-way R40'];
  for (const [name, more] of [['sprung blades, two levers set', {}], ['one lever set', { threeWayLevers: 1 }], ['rigid blades', { bladeStyle: 'simple' }], ['on ballast', { ballast: 'ballast' }]] as [string, Partial<PieceOptions>][]) it(`${name}: no levers, a slider under each blade, and it goes together`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel(), d: Design = { ...t, options: { ...t.options, throwStyle: 'nail', ...more } };
      clearBuildCache();
      const b = buildDesign(w, structuredClone(d));
      clearBuildCache();
      expect(b.info.warnings).toEqual([]);
      expect(b.pieces.map((q) => q.name).filter((n) => /points|throw|lever/.test(n))).toEqual(['points1', 'points1-throw', 'points2', 'points2-throw']);
      expect(b.info.switches).toBe(1);
      // (nothing for a lever on the plan)
      expect((b.overlay.items as TrackworkItem[]).filter((it) => it.kind === 'throw')).toEqual([]);
      expect(assembledProblems(w, b.pieces, { ...APP, ...d.options }).join('; ')).toBe('');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('Three-way switches worked by is greyed out with Throw: Nail switch, and says why', () => {
    const d: Design = { ...t, options: { ...t.options, throwStyle: 'nail' } }, f = optionForm(() => d).form.flatMap((sec) => sec.fields).find((x) => x.key === 'threeWayLevers')!;
    expect(f.off!({ o: { ...OPTION_DEFAULTS, ...d.options }, ballast: false, fdb: true, switches: true })).toMatch(/Nail switch/);
    expect(f.off!({ o: { ...OPTION_DEFAULTS, ...t.options }, ballast: false, fdb: true, switches: true })).toBeUndefined();
  });
});
