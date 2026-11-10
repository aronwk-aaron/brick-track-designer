// The snap clamp (Points kept set by: Snap clamp; switch/snap.ts): a toggle on knife edges, between rigid
// blades or, with sprung ones, on the lever's arm. Its spring's sizes are what its force is worked out from, so
// they're checked as built; it's clear of the track, the slider and the blades wherever the slider is; it prints as
// one flat part with its links loose in it; and where there's no room or no use for it (a three-way, a switch
// stand, sprung blades with the lever on a bracket or on ballast) the points are as without it, and say so.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchGeometry, switchPlan } from '../src/switch/base';
import { SNAP, snapGeo, snapHalf } from '../src/switch/snap';

const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 256 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 130 }] };
const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwAction: 'snap', bladeStyle: 'simple' };

describe('the snap clamp\'s spring', () => {
  // (a left switch's rigid blades: the slider goes 1.97)
  const q = snapGeo(1.97, 0.3);
  it('is squeezed by far more than a print is out, at a strain PLA takes for good', () => {
    // (0.7 or more: a print 0.2 out changes its push by under a third; the spring before it was squeezed by 0.35, less than its rings' slack, 0.6)
    expect(q.squeeze).toBeGreaterThan(0.7);
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
    // (the links lean no more than 15 degrees, whatever the travel: a longer throw gets longer links)
    for (const T of [1.5, 1.97, 3, 4]) expect(Math.asin(T / 2 / snapGeo(T, 0.3).link) * 180 / Math.PI).toBeLessThan(SNAP.rock + 1e-6);
  });
  it('is printed sprung shut: its fingers\' knives nearer the slider than they\'ll sit, by the squeeze', () => {
    const free = snapHalf(q, undefined), on = snapHalf(q, 1.97 / 2);
    const d = Math.hypot(on.head[0] - free.head[0], on.head[1] - free.head[1]);
    // (the bend put in all along, against the same worked out for small bends)
    expect(d).toBeGreaterThan(0.85 * q.squeeze);
    expect(d).toBeLessThan(1.15 * q.squeeze);
    expect(on.head[1] - free.head[1]).toBeGreaterThan(0.6);
  });
});

describe('the snap clamp on a switch', { timeout: 600000 }, () => {
  const cases: [string, Partial<BaseParams>][] = [['rigid blades', {}], ['rigid blades on ballast', { generateBallast: true }], ['prototype blades', { bladeStyle: 'prototype' }],
    ['one moving blade', { pointBlades: 1 }], ['a nail switch', { throwNail: true }], ['sprung blades: on the lever\'s arm', { bladeStyle: 'sprung' }], ['sprung blades, the lever on the left', { bladeStyle: 'sprung' }]];
  for (const [name, o] of cases) it(`${name}: clear of the bed, the slider and the blades wherever the slider is, its links on the slider's post`, async () => {
    const plan = switchPlan([A, B], [[0, 1, 12, /left/.test(name) ? -1 : undefined]], { ...p, ...o }, 1), v = plan.sets[0], w = await kernel(), gm = switchGeometry(new Scad(w), plan);
    expect(v.snap?.on).toBe(o.bladeStyle === 'sprung' ? 'arm' : 'bed');
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
      // (between the blades: no higher than their plates, or by a layer, in the middle of the track where no flange runs; on the arm, well under the rails' tops)
      if (v.snap!.on === 'bed') expect(sp.boundingBox().max[2]).toBeLessThanOrEqual(Math.max(...blades.map((m) => m.boundingBox().min[2])) + 1.9);
      else expect(sp.boundingBox().max[2]).toBeLessThan(3.2 + 6.4 - 3);
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
    const cut = new Scad(w).cube([2, 1, 10]).translate([-SNAP.arm - 1, -0.5, -1]);
    expect(bodies[0].intersect(cut).volume() / SNAP.h).toBeCloseTo(SNAP.t, 1);
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(2 * q.half - 0.5);
    expect(bb.max[1] - bb.min[1]).toBeLessThan(2 * q.half + SNAP.t + 0.5);
    // (nothing thinner than 0.8, as drawn 0.78 across its beams' round ends' flats: shrunk by 0.36 all round, each body is still one)
    expect(pr.slice(1).offset(-0.36, 'Round', 2, 16).decompose().length).toBe(3);
  });
});
