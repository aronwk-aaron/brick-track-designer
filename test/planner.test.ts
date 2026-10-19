import { describe, expect, it } from 'vitest';
import { follow, planToPose } from '../src/app/planner';

const close = (a: { x: number; y: number; heading: number }, b: { x: number; y: number; heading: number }) => {
  expect(a.x).toBeCloseTo(b.x, 4); expect(a.y).toBeCloseTo(b.y, 4);
  expect(((a.heading - b.heading + 540) % 360) - 180).toBeCloseTo(0, 4);
};
describe('planToPose joins two poses', () => {
  const p = { x: 0, y: 0, heading: 0 };
  for (const q of [
    { x: -20, y: 60, heading: 45 },     // a curve and a straight
    { x: 16, y: 80, heading: 0 },       // parallel, offset: an S
    { x: -40, y: 40, heading: 90 },     // quarter turn
    { x: 30, y: 50, heading: -30 },
  ])
    it(`to ${JSON.stringify(q)}`, () => {
      const segs = planToPose(p, q, 24);
      expect(segs).toBeDefined();
      close(follow(p, segs!), q);
      for (const sg of segs!) if (sg.kind === 'curve') expect(sg.radius).toBeGreaterThanOrEqual(24 - 1e-6);
    });
  it('too tight: none', () => { expect(planToPose(p, { x: -5, y: 5, heading: 90 }, 24)).toBeUndefined(); });
});

import { planFree, MAX_RADIUS } from '../src/app/planner';
describe('free curves', () => {
  it('reach the point exactly', () => {
    for (const t of [[-10, 40], [6, 30], [-1, 200]] as [number, number][]) {
      const segs = planFree({ x: 0, y: 0, heading: 0 }, t)!;
      const e = follow({ x: 0, y: 0, heading: 0 }, segs);
      expect(e.x).toBeCloseTo(t[0], 4); expect(e.y).toBeCloseTo(t[1], 4);
      for (const sg of segs) if (sg.kind === 'curve') expect(sg.radius).toBeLessThanOrEqual(MAX_RADIUS);
    }
  });
  it('a very gentle bend is capped at R1000 and a straight', () => {
    const segs = planFree({ x: 0, y: 0, heading: 0 }, [-1, 200])!;
    expect(segs[0]).toMatchObject({ kind: 'curve', radius: 1000 });
    expect(segs[1].kind).toBe('straight');
  });
});
