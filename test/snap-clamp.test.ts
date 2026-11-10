// The snap clamp (Points kept set by: Snap clamp; switch/snap.ts): a toggle on knife edges between rigid blades.
// Its spring's sizes are what its force is worked out from, so they're checked as built; it's clear of the track,
// the slider and the blades wherever the slider is; it prints as one flat part with its links loose in it; and
// where there's no room for it (sprung blades, a three-way, a switch stand) the points are as without it, and say so.
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchGeometry, switchPlan } from '../src/switch/base';
import { SNAP, snapGeo, snapHalf } from '../src/switch/snap';

const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 256 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 130 }] };
const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwAction: 'snap', bladeStyle: 'simple' };
const snapOpts = { bladeStyle: 'simple', throwAction: 'snap' } as const;

describe('the snap clamp\'s spring', () => {
  // (a left switch's rigid blades: the slider goes 1.97)
  const q = snapGeo(1.97, 0.3);
  it('is squeezed by far more than a print is out, at a strain PLA takes for good', () => {
    // (0.8 or more: the fits' slack, 0.3, changes its push by well under half; the over-centre spring's 0.35 is less than its rings' slack)
    expect(q.squeeze).toBeGreaterThan(0.8);
    expect(q.squeeze).toBeLessThan(1.2);
    // (the push, from the beams as built: F = squeeze E h t^3 / 12 / (arm^3 / 3 + arm^2 half))
    expect((q.squeeze * SNAP.E * SNAP.h * SNAP.t ** 3) / 12 / (SNAP.arm ** 3 / 3 + SNAP.arm ** 2 * q.half)).toBeCloseTo(SNAP.F, 6);
    // (well under 1%, at rest and squeezed most, the slider in the middle)
    expect(q.strainRest).toBeLessThan(0.005);
    expect(q.strainMid).toBeLessThan(0.006);
    expect(q.fMid).toBeGreaterThan(SNAP.F);
  });
  it('holds the slider with a quarter of a newton each way: enough to keep the blades over, little enough for a wheel to push', () => {
    expect(q.hold).toBeGreaterThan(0.2);
    expect(q.hold).toBeLessThan(0.4);
    // (the links lean no more than 13 degrees, whatever the travel: a longer throw gets longer links)
    for (const T of [1.5, 1.97, 3, 4]) expect(Math.asin(T / 2 / snapGeo(T, 0.3).link) * 180 / Math.PI).toBeLessThan(SNAP.rock + 1e-6);
  });
  it('is printed sprung shut: its fingers\' knives nearer the slider than they\'ll sit, by the squeeze', () => {
    const free = snapHalf(q, undefined), on = snapHalf(q, 1.97 / 2);
    const d = Math.hypot(on.head[0] - free.head[0], on.head[1] - free.head[1]);
    // (the bend put in all along, against the same worked out for small bends)
    expect(d).toBeGreaterThan(0.85 * q.squeeze);
    expect(d).toBeLessThan(1.15 * q.squeeze);
    expect(on.head[1] - free.head[1]).toBeGreaterThan(0.7);
  });
});

describe('the snap clamp on a switch', { timeout: 600000 }, () => {
  const cases: [string, Partial<BaseParams>][] = [['rigid blades', {}], ['rigid blades on ballast', { generateBallast: true }], ['prototype blades', { bladeStyle: 'prototype' }],
    ['one moving blade', { pointBlades: 1 }], ['a nail switch', { throwNail: true }]];
  for (const [name, o] of cases) it(`${name}: clear of the bed, the slider and the blades wherever the slider is, its links on the slider's post`, async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], { ...p, ...o }, 1), v = plan.sets[0], w = await kernel(), gm = switchGeometry(new Scad(w), plan);
    expect(v.snap).toBeDefined();
    expect(plan.notes.filter((n) => /snap/.test(n))).toEqual([]);
    const base = gm.base(), thr = gm.throwPart(0), blades = gm.pointsParts(0), turns = gm.pointsTurns(0)!, T = v.leverTravel;
    // (the slider and the bed are each one part still: its post on the bar, its pit and bosses in the bed)
    expect(thr.decompose().length).toBe(1);
    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      const sp = gm.springPart(0, at)!, sl = thr.translate([T * at, 0, 0]);
      expect(sp.intersect(base).volume(), `in the bed at ${at}`).toBeLessThan(0.01);
      expect(sp.intersect(sl).volume(), `in the slider at ${at}`).toBeLessThan(0.01);
      // (each link's notch on the post's knife)
      expect(sp.minGap(sl, 2), `off the slider's post at ${at}`).toBeLessThan(0.05);
      blades.forEach((m, k) => {
        const [cx, cy] = turns[k].at, turned = m.translate([-cx, -cy, 0]).rotate([0, 0, turns[k].swing * at]).translate([cx, cy, 0]);
        expect(sp.intersect(turned).volume(), `in blade ${k} at ${at}`).toBeLessThan(0.01);
      });
      // (under the flanges: no higher than the blades' plates)
      expect(sp.boundingBox().max[2]).toBeLessThanOrEqual(Math.max(...blades.map((m) => m.boundingBox().min[2])) + 1.7);
    }
  });
  it('prints flat as one part: the spring and its two links loose in it, 0.3 apart or more; its beams as its push is worked out from', async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], p, 1), w = await kernel(), gm = switchGeometry(new Scad(w), plan), pr = gm.springPrint(0)!;
    const bodies = pr.decompose().sort((a, b) => b.volume() - a.volume()), bb = pr.boundingBox(), q = snapGeo(plan.sets[0].leverTravel, plan.p.pointClearance);
    expect(bodies.length).toBe(3);
    expect(bb.min[2]).toBeCloseTo(0, 6);
    expect(bb.max[2]).toBeCloseTo(SNAP.h, 6);
    expect(bodies[1].volume()).toBeCloseTo(bodies[2].volume(), 3);
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) expect(bodies[i].minGap(bodies[j], 2)).toBeGreaterThan(0.29);
    // (the spine: 0.8 wide where it's cut across its middle, and as long as worked out)
    const cut = new Scad(w).cube([3, 1, 10]).translate([-SNAP.arm - 1.5, -0.5, -1]);
    expect(bodies[0].intersect(cut).volume() / SNAP.h).toBeCloseTo(SNAP.t, 1);
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(2 * q.half - 0.5);
    expect(bb.max[1] - bb.min[1]).toBeLessThan(2 * q.half + SNAP.t + 0.5);
    // (nothing thinner than 0.8, as drawn 0.78 across its beams' round ends' flats: shrunk by 0.36 all round, each body is still one)
    expect(pr.slice(1).offset(-0.36, 'Round', 2, 16).decompose().length).toBe(3);
  });

  const man = (w: Awaited<ReturnType<typeof kernel>>, P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
  const stl = (w: Awaited<ReturnType<typeof kernel>>, bytes: Uint8Array) => { const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = dv.getUint32(80, true), P = new Float32Array(n * 9); for (let t = 0; t < n; t++) for (let i = 0; i < 9; i++) P[t * 9 + i] = dv.getFloat32(84 + t * 50 + 12 + i * 4, true); return man(w, P); };
  const built = async (d: Design, o: object) => {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, { ...d, options: { ...d.options, ...o } as Design['options'] });
    const of = (re: RegExp) => b.pieces.filter((q) => re.test(q.name));
    return { w, b, springs: of(/-spring$/), throws: of(/-throw$/), blades: b.pieces.filter((q) => /points/.test(q.name) && !/spring/.test(q.name)), track: w.Manifold.union(b.pieces.filter((q) => !/points|throw|lever|bracket/.test(q.name)).map((q) => man(w, q.positions))) };
  };
  for (const name of ['Left switch (LEGO)', 'Right switch (LEGO)', 'Wye switch', 'Crossover (R40)', 'Double slip (45°, R40)']) it(`${name}: a clamp at each set of points, clear of everything, each a part that fits the bed`, async () => {
    const { w, b, springs, throws, blades, track } = await built(TEMPLATES[name], snapOpts);
    expect(springs.length).toBe(throws.length);
    expect(b.info.warnings.filter((x) => /snap clamp/.test(x))).toEqual([]);
    for (const sp of springs) {
      const m = man(w, sp.positions), pr = stl(w, sp.stl), bb = pr.boundingBox();
      expect(m.decompose().length, sp.name).toBe(3);
      expect(m.intersect(track).volume(), sp.name).toBeLessThan(0.01);
      for (const q of [...blades, ...throws]) expect(m.intersect(man(w, q.positions)).volume(), `${sp.name} in ${q.name}`).toBeLessThan(0.01);
      expect(Math.min(...throws.map((q) => m.minGap(man(w, q.positions), 2))), sp.name).toBeLessThan(0.05);
      // (as printed: on the bed, three bodies, small)
      expect(pr.decompose().length).toBe(3);
      expect(bb.min[2]).toBeCloseTo(0, 3);
      expect(Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1])).toBeLessThan(40);
    }
    // (the levers have no click of their own: the clamp holds the points)
  });
  it('sprung blades, a three-way, a switch stand: no room or no use for it, so built as without it, and said', async () => {
    for (const [name, o, why] of [['Left switch (LEGO)', { bladeStyle: 'sprung' }, /sprung blades' plates leave no room/], ['Three-way switch (one throw)', {}, /three positions: the snap clamp has two/],
      ['Left switch (LEGO)', { throwStyle: 'stand' }, /switch stand locks the points/]] as [string, object, RegExp][]) {
      const { b, springs } = await built(TEMPLATES[name], { ...snapOpts, ...o });
      expect(springs, name).toHaveLength(0);
      expect(b.info.warnings.filter((x) => why.test(x)), name).toHaveLength(1);
      const plain = await built(TEMPLATES[name], { ...snapOpts, ...o, throwAction: 'detent' });
      expect(b.pieces.map((q) => [q.name, q.positions.length])).toEqual(plain.b.pieces.map((q) => [q.name, q.positions.length]));
    }
  });
  it('the 22.5° double slip: its points too close for clamps, they keep their over-centre springs, and say so', async () => {
    const { b, springs, throws } = await built(TEMPLATES['Double slip (22.5°)'], { throwAction: 'snap' });
    expect(springs.length).toBe(throws.length);
    expect(b.info.warnings.filter((x) => /no room between a set of points' blades for the snap clamp/.test(x))).toHaveLength(1);
  });
});
