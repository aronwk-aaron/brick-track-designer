// the plate-style blade plates beside other track (switch/base.ts, fdbLayout): where
// another route's rail runs between a set of points' stock rails, each
// blade's plate is cut clear of it over the blade's whole swing, and its pin
// and the slider's post are moved so there's still 2 mm of plate round the
// pin's hole and round the post's; where the rail crosses a blade,
// or there's no such place, it's blocked (and said). The plan only: the
// built parts are checked in complex-layouts and the assembly suites.
import { describe, expect, it } from 'vitest';
import type { FdbBladeLayout } from '../src/switch/context';
import { type Pose, type Pt, railPoint, type Route } from '../src/route/route';
import { BASE_DEFAULTS, type BaseParams, switchPlan } from '../src/switch/base';
import { planPieces } from '../src/switch/pieces';
import { solve } from '../src/route/solver';
import { orient } from '../src/app/build';
import { TEMPLATES, toRoutes } from '../src/app/design';

const p: BaseParams = { ...BASE_DEFAULTS, mechStyle: 'plates', throwAction: 'detent', bladeStyle: 'simple' };
const straight = (id: string, start: Pose, length = 300): Route => ({ id, start, segments: [{ kind: 'straight', length }] });
// a left switch: the straight route right, the branch (R40, 22.5 degrees) left
const A = straight('A', [0, 0, 0]);
const B: Route = { id: 'B', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 22.5 }, { kind: 'straight', length: 150 }] };
const plan = (foreign: Route[] = []) => switchPlan([A, B], [[0, 1, 12]], p, 1, foreign);

const rot = (q: Pt, c: Pt, a: number): Pt => { const r = (a * Math.PI) / 180; return [c[0] + (q[0] - c[0]) * Math.cos(r) - (q[1] - c[1]) * Math.sin(r), c[1] + (q[0] - c[0]) * Math.sin(r) + (q[1] - c[1]) * Math.cos(r)]; };
/** The rims as the plate swings from closed to open: the least plate left round the pin's hole and round the post's (mm). */
function rims(f: FdbBladeLayout, b: number, three = false) {
  const pts = f.keep.flat(), pinR = 2 + p.pointClearance, w = 1.1 * Math.SQRT2 + p.pointClearance;
  const pin = Math.min(...pts.map((q) => Math.hypot(q[0] - f.pivot[0], q[1] - f.pivot[1]))) - pinR - f.hw;
  let post = Infinity;
  for (let k = 0; k <= 8; k++) {
    const a = ((b === 0 ? 1 : -1) * (three ? 2 : 1) * f.ang * k) / 8, P = rot(f.post, f.pivot, a), d0 = [f.pivot[0] - P[0], f.pivot[1] - P[1]], n = Math.hypot(d0[0], d0[1]), u = [d0[0] / n, d0[1] / n];
    for (const q of pts) {
      const d = [q[0] - P[0], q[1] - P[1]], al = d[0] * u[0] + d[1] * u[1], ac = d[0] * u[1] - d[1] * u[0];
      post = Math.min(post, Math.hypot(Math.max(-w - al, 0, al - w), Math.max(-w - ac, 0, ac - w)) - f.hw);
    }
  }
  return { pin, post };
}

describe("the plate-style blade plates beside other track", () => {
  it('nothing running past: the pins and posts where they always were', () => {
    for (const f of plan().sets[0].fdb!) {
      expect(f.blocked).toBeUndefined();
      expect([f.pivotIn, f.postIn, f.shift, f.keep.length]).toEqual([7, 6.25, 0, 0]);
    }
  });

  it('a rail 13 mm in from a blade, alongside it: the plate cut clear, its post moved in toward its rail, the rims kept', () => {
    // (a straight track whose right rail runs 13 in from blade 0, the straight route's left rail)
    const f = plan([straight('F', [-27, -40, 0])]).sets[0].fdb!;
    expect(f[0].blocked).toBeUndefined();
    expect(f[0].keep.length).toBeGreaterThan(0);
    expect(f[0].postIn).toBeLessThan(6.25);
    expect(f[0].pivotIn).toBe(7);
    const r = rims(f[0], 0);
    expect(r.pin).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(r.post).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(f[1].blocked).toBeUndefined();
  });

  it('a rail 11 mm in: no room for both rims, blocked', () => {
    expect(plan([straight('F', [-29, -40, 0])]).sets[0].fdb![0].blocked).toMatch(/no room/);
  });

  it('a rail crossing the blades between toe and heel: blocked', () => {
    for (const h of [-20, 20]) {
      // (a straight track at h degrees, placed so its left rail goes through (-20, 35): blade 0's rail, between toe and heel)
      const fr = straight('F', [0, 0, h]), q = railPoint(fr, 35 / Math.cos((h * Math.PI) / 180), -20);
      fr.start = [-20 - q[0], 35 - q[1], h];
      expect(plan([fr]).sets[0].fdb!.some((f) => /crosses the blade/.test(f.blocked ?? '')), `heading ${h}`).toBe(true);
    }
  });

  it("the tandem three-way template: the first branch's rail through the second points, their plates cut clear and a pin moved in", () => {
    const d = TEMPLATES['Three-way switch (tandem, two throws)'];
    expect(d.options?.mechStyle).toBeUndefined(); // (the default mechanism: the plate-style)
    const rs = orient(toRoutes(d)), sol = solve(rs, { gauge: (d.gaugeStuds + 1) * 8, step: 0.5 });
    const pc = planPieces(rs, sol.splits, { ...p, printBedX: 2000, printBedY: 2000 }, () => 0, () => undefined, true);
    expect(pc.warnings).toEqual([]);
    expect(pc.switches).toHaveLength(1);
    const sets = pc.switches[0].plan.sets;
    expect(sets).toHaveLength(2);
    const second = sets[1].fdb!;
    expect(second.every((f) => !f.blocked)).toBe(true);
    expect(second.every((f) => f.keep.length > 0)).toBe(true);
    expect(second[0].pivotIn).toBeLessThan(7);
    for (const [b, f] of second.entries()) {
      const r = rims(f, b);
      expect(r.pin, `blade ${b} pin`).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(r.post, `blade ${b} post`).toBeGreaterThanOrEqual(2 - 1e-6);
    }
  });
});
