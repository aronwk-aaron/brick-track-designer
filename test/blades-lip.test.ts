// The rigid blades held down by a lip over their fronts (bladeLip 'front', base.ts LIP_RIGID), as the
// sprung blades are: a lip on the bed leaning over each 1.6 plate's bevelled front, clear of it closed
// and open; the front free a little way up, then held, even pushed back by its pin's play; the lip's top
// under the plate's top; nothing in it hanging as printed; a plain pin. The default: the snap lip on
// the pin, no lip, as before. Prototype blades too (the lip filling the stock rail's undercut in front of
// the plate). Not rigid blades on ballast: their plates are kept off the stock rail's foot, a sliver at the
// front: no lip, and a note.
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, switchGeometry, switchPlan } from '../src/switch/base';
import { kernel } from '../src/geom/kernel';
import { type Man, R, Scad, T } from '../src/geom/scad';
import { HEAD_HW } from '../src/switch/context';
import { OPTION_DEFAULTS, TEMPLATES, upgradeDesign } from '../src/app/design';
import { hanging } from './assembly.shared';

const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 500 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 832, angle: 22.5 }, { kind: 'straight', length: 150 }] };
const p = { ...BASE_DEFAULTS, mechStyle: 'plates' as const, throwAction: 'detent' as const, bladeStyle: 'simple' as const, bladeLip: 'front' as const, generateBallast: true };

describe('rigid blades with a lip over the front', () => {
  const cases: [string, typeof p | (Omit<typeof p, 'bladeStyle'> & { bladeStyle: 'prototype' })][] = [
    ['rigid, track alone', { ...p, generateBallast: false }], ['prototype, on ballast', { ...p, bladeStyle: 'prototype' }],
    ['prototype, track alone', { ...p, bladeStyle: 'prototype', generateBallast: false }]];
  for (const [name, q] of cases) it(`${name}: a lip over each plate's front, clear closed and open; the front can't lift; a plain pin; prints`, async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], q, 1), w = await kernel(), s = new Scad(w), gm = switchGeometry(s, plan), base = gm.base();
    expect(plan.sets[0].fdb!.map((f) => f.lip)).toEqual([true, true]);
    expect(plan.notes.join(' ')).not.toMatch(/lip/);
    const parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!, c = q.pointClearance, z1 = plan.g.bedTop + c + 1.6;
    for (const [k, m] of parts.entries()) {
      const t2 = turns[k], ends = t2.tilt!, yF = Math.min(ends[0][1], ends[1][1]);
      // (the plate's first 3 mm, where the lip is over it; back toward the pin: +y)
      const front = m.intersect(s.cube([400, 3 + Math.abs(ends[0][1] - ends[1][1]), 30]).translate([-200, yF - 1, -10]));
      expect(front.volume()).toBeGreaterThan(1);
      for (const a of [0, t2.swing]) {
        const turn = (x: Man) => T(R(T(x, [-t2.at[0], -t2.at[1], 0]), [0, 0, a]), [t2.at[0], t2.at[1], 0]);
        expect(s.intersection(turn(m), base).volume()).toBeLessThan(1e-3);
        // (room to move: free a little way up; then held, the lip over it (c across the 45 degree faces: c * sqrt 2 up,
        // with its plan view curve as it swings); and pushed back as far as its pin lets it (c), still held before it's
        // lifted its own thickness: it can't come out from under the lip)
        const hit = (dy: number) => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.4, 1.6].find((dz) => s.intersection(T(turn(front), [0, dy, dz]), base).volume() > 0.005);
        expect(s.intersection(T(turn(front), [0, 0, 0.1]), base).volume()).toBeLessThan(1e-3);
        expect(hit(0)).toBeLessThanOrEqual(1);
        expect(hit(c)).toBeDefined();
      }
      // (the lip: in front of the plate and over its bevel; its top under the plate's top (which the wheels' flanges pass
      // over already); nothing in it hanging as printed)
      const xs = ends.map((e) => e[0]), side = k === 0 ? 1 : -1, xStock = side * -plan.G + side * (HEAD_HW + 0.1);
      const x0 = side > 0 ? xStock : Math.min(...xs) - 1, x1 = side > 0 ? Math.max(...xs) + 1 : xStock;
      const lip = base.intersect(s.cube([x1 - x0, 6, 20]).translate([x0, yF - 4, plan.g.bedTop + 0.01]));
      const bb = lip.boundingBox();
      expect(bb.max[2]).toBeLessThanOrEqual(z1 - 0.1 + 1e-6);
      expect(bb.max[2]).toBeGreaterThan(z1 - 0.3);
      expect(bb.max[1]).toBeGreaterThan(yF + 0.5);                // (over the plate's bevel)
      expect(hanging(w, base.intersect(s.cube([x1 - x0, 6, 20]).translate([x0, yF - 4, plan.g.bedTop - 0.5])))).toBeLessThan(0.5);
      // (the plate's front bevelled: its top starts 1.4 back, its end 0.2 tall)
      const fb = front.boundingBox();
      expect(m.intersect(s.cube([400, 0.3, 30]).translate([-200, yF + 0.05, z1 - 0.5])).volume()).toBeLessThan(1e-3);
      expect(fb.min[2]).toBeCloseTo(plan.g.bedTop + c, 3);
    }
    // (a plain pin, 0.4 over the plate: no snap lip round its top)
    for (const f of plan.sets[0].fdb!) {
      const at = base.intersect(s.cube([7, 7, 0.2]).translate([f.pivot[0] - 3.5, f.pivot[1] - 3.5, z1 + 0.1]));
      expect(at.volume() / 0.2).toBeCloseTo(Math.PI * 4, 0);
      expect(base.intersect(s.cube([7, 7, 0.2]).translate([f.pivot[0] - 3.5, f.pivot[1] - 3.5, z1 + 0.45])).volume()).toBeLessThan(1e-3);
    }
  }, 240000);

  it('the default: the snap lip on the pin, no lip over the front, as before; old designs open with it', async () => {
    const q = { ...p, bladeLip: undefined };
    const plan = switchPlan([A, B], [[0, 1, 12]], q, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
    expect(plan.sets[0].fdb!.map((f) => f.lip)).toEqual([undefined, undefined]);
    expect(gm.pointsTurns(0)!.map((t2) => !!t2.tilt)).toEqual([false, false]);
    const z1 = plan.g.bedTop + q.pointClearance + 1.6, f = plan.sets[0].fdb![0];
    // (the snap lip: wider than the pin, just over the plate)
    expect(base.intersect(s.cube([7, 7, 0.2]).translate([f.pivot[0] - 3.5, f.pivot[1] - 3.5, z1 + 0.15])).volume() / 0.2).toBeGreaterThan(Math.PI * 4 + 1.5);
    expect(OPTION_DEFAULTS.bladeLip).toBe('pin');
    const old = TEMPLATES['Left switch (LEGO)'];
    expect(upgradeDesign(old)).toBe(old);
  }, 120000);

  it('rigid blades on ballast: no lip (nothing at the front to hold), the snap lip on the pin, and a note', async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], p, 1), gm = switchGeometry(new Scad(await kernel()), plan);
    expect(plan.sets[0].fdb!.map((f) => f.lip)).toEqual([undefined, undefined]);
    expect(plan.notes.join(' ')).toMatch(/rigid blades on ballast have no lip/);
    expect(gm.pointsTurns(0)!.map((t2) => !!t2.tilt)).toEqual([false, false]);
  }, 120000);

  it('the sprung blades keep their own lip, whatever the setting', async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], { ...p, bladeStyle: 'sprung', bladeLip: 'pin' }, 1);
    expect(plan.sets[0].fdb!.map((f) => f.lip)).toEqual([true, true]);
  }, 120000);
});
