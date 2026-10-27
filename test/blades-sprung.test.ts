// the sprung blades (bladeStyle 'sprung', switch/base.ts D4): each blade a 3 mm
// plate on a stud with its rail on top, the spring's pocket underneath with
// its two beams and the supports for its roof (separate bits, broken out
// after printing). Clear of the base closed and open. On track alone too:
// the bed at the sleepers' top, the slider in a groove through it between
// the underside's stud rows (context.ts D4_SLIDER), clear of the base both ways.
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, switchGeometry, switchPlan } from '../src/switch/base';
import { kernel } from '../src/geom/kernel';
import { type Man, R, Scad, T } from '../src/geom/scad';
import { PLATE_H } from '../src/switch/context';

const A: Route = { id: 'A', start: [0, 0, 0], segments: [{ kind: 'straight', length: 500 }] };
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 832, angle: 22.5 }, { kind: 'straight', length: 150 }] };
const p = { ...BASE_DEFAULTS, mechStyle: 'plates' as const, throwAction: 'detent' as const, bladeStyle: 'sprung' as const, generateBallast: true };

describe("the sprung blades", () => {
  it('a 3 mm plate under a 3 mm rail; the supports separate; clear of the base both ways', async () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], p, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
    const parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
    expect(parts.length).toBe(2);
    for (const [k, m] of parts.entries()) {
      const bb = m.boundingBox();
      expect(bb.max[2] - bb.min[2]).toBeGreaterThan(6);         // plate 3 + rail 3.1
      expect(m.decompose().length).toBe(3);                      // the blade, and the two supports in its pocket
      for (const a of [0, turns[k].swing]) {
        const at = T(R(T(m, [-turns[k].at[0], -turns[k].at[1], 0]), [0, 0, a]), [turns[k].at[0], turns[k].at[1], 0]);
        expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      }
    }
  }, 120000);

  it('a short blade (R40): the spring rooted in the plate (one body with it), its pocket short of the stud hole', async () => {
    const B40: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 150 }] };
    const plan = switchPlan([{ ...A, segments: [{ kind: 'straight', length: 300 }] }, B40], [[0, 1, 12]], { ...p, generateBallast: false }, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan);
    for (const m of gm.pointsParts(0)) {
      expect(m.decompose().length).toBe(3);                      // the blade with its beams, and the two supports
      const bb = m.boundingBox(), cut = m.slice(bb.min[2] + 0.5).toPolygons() as number[][][];
      // (no hole round the stud's that runs into the pocket: the stud's hole is a closed circle on its own)
      expect(cut.length).toBeGreaterThan(3);
    }
  }, 120000);

  it('track alone: the bed at the sleepers\' top, a 3 mm plate under a 3.1 rail; blades and slider clear of the base both ways', async () => {
    const q = { ...p, generateBallast: false };
    const plan = switchPlan([A, B], [[0, 1, 12]], q, 1), s = new Scad(await kernel()), gm = switchGeometry(s, plan), base = gm.base();
    expect(plan.notes.join(' ')).not.toMatch(/sprung/);
    expect(plan.g.bedTop).toBeCloseTo(PLATE_H, 6);
    const v = plan.sets[0], parts = gm.pointsParts(0), turns = gm.pointsTurns(0)!;
    expect(v.throwY % 8).toBeCloseTo(0, 6);                    // the slider between two stud rows
    expect(parts.length).toBe(2);
    for (const [k, m] of parts.entries()) {
      const bb = m.boundingBox();
      expect(bb.min[2]).toBeCloseTo(PLATE_H + p.pointClearance, 3);
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(3 + 3.1, 1);   // plate 3 + rail 3.1, up to the rail top
      expect(m.decompose().length).toBe(3);
      for (const a of [0, turns[k].swing]) {
        const at = T(R(T(m, [-turns[k].at[0], -turns[k].at[1], 0]), [0, 0, a]), [turns[k].at[0], turns[k].at[1], 0]);
        expect(s.intersection(at, base).volume()).toBeLessThan(1e-3);
      }
    }
    const thr = gm.throwPart(0);
    for (const dx of [0, v.leverTravel]) expect(s.intersection(T(thr, [dx, 0, 0]), base).volume()).toBeLessThan(1e-3);
    // (the slider over a baseplate's studs: clear of every stud under the base, wherever it is)
    const tb = thr.boundingBox(), studs: Man[] = [];
    for (let x = Math.floor(tb.min[0] / 8) * 8 - 4; x <= tb.max[0] + v.leverTravel + 4; x += 8)
      for (let y = Math.floor(tb.min[1] / 8) * 8 - 4; y <= tb.max[1] + 4; y += 8) studs.push(T(s.cylinder(1.8, 2.4, 2.4, 24), [x, y, 0]));
    for (const dx of [0, v.leverTravel]) expect(s.intersection(T(thr, [dx, 0, 0]), s.union(studs)).volume()).toBeLessThan(1e-3);
  }, 120000);
});
