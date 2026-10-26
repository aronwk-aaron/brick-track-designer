// the sprung blades (bladeStyle 'sprung', switch/base.ts D4): on ballast, each
// blade a 3 mm plate on a stud with its rail on top, the spring's pocket
// underneath with its two beams and the supports for its roof (separate bits,
// broken out after printing). Clear of the base closed and open; track alone,
// simple blades instead, and said.
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/route/route';
import { BASE_DEFAULTS, switchGeometry, switchPlan } from '../src/switch/base';
import { kernel } from '../src/geom/kernel';
import { R, Scad, T } from '../src/geom/scad';

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

  it('track alone: simple blades, and a note why', () => {
    const plan = switchPlan([A, B], [[0, 1, 12]], { ...p, generateBallast: false }, 1);
    expect(plan.notes.join(' ')).toMatch(/sprung blades need ballast/);
  });
});
