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

import { planFreeTurning, planAnyway } from '../src/app/planner';
describe('free planning turns back for points behind', () => {
  it('reaches a point behind and to the side with curves of at least R24', () => {
    for (const t of [[-30, -20], [40, -60], [-60, 0]] as [number, number][]) {
      const segs = planFreeTurning({ x: 0, y: 0, heading: 0 }, t)!;
      expect(segs, String(t)).toBeDefined();
      const e = follow({ x: 0, y: 0, heading: 0 }, segs);
      expect(e.x).toBeCloseTo(t[0], 3); expect(e.y).toBeCloseTo(t[1], 3);
      for (const sg of segs) if (sg.kind === 'curve') expect(sg.radius).toBeGreaterThanOrEqual(24 - 1e-6);
    }
  });
  it('the red fallback never loops past 180', () => {
    for (const sg of planAnyway({ x: 0, y: 0, heading: 0 }, [-10, -40])) if (sg.kind === 'curve') expect(Math.abs(sg.angle)).toBeLessThanOrEqual(180);
  });
});

import { planAuto, plan as planOne, RADII } from '../src/app/planner';
describe('auto planner lays no sliver straights', () => {
  const p = { x: 0, y: 0, heading: 0 };
  const slivers = (segs: { kind: string; studs?: number }[]) => segs.filter((sg) => sg.kind === 'straight' && sg.studs! > 1e-6 && sg.studs! < 1 - 1e-6);
  const cleanExists = (t: [number, number]) => RADII.some((r) => planOne(p, t, r, 90, true));
  it('a sweep of targets on a grid', () => {
    let swept = 0;
    for (let x = -120; x <= 120; x += 3)
      for (let y = 4; y <= 140; y += 3) {
        const segs = planAuto(p, [x, y]);
        if (!segs || !cleanExists([x, y])) continue;
        swept++;
        expect(slivers(segs), `target ${x},${y}`).toEqual([]);
      }
    expect(swept).toBeGreaterThan(200);
  });
  it('snaps a target that has no clean plan to one that does, within 2 studs', () => {
    let snapped = 0;
    for (let x = -100; x <= 100; x += 1.5)
      for (let y = 10; y <= 120; y += 1.5) {
        const segs = planAuto(p, [x, y]);
        if (!segs) continue;
        const e = follow(p, segs);
        if (cleanExists([x, y]) || Math.hypot(e.x - x, e.y - y) < 1e-3) continue;
        snapped++;
        expect(Math.hypot(e.x - x, e.y - y)).toBeLessThanOrEqual(2 + 1e-6);
        expect(slivers(segs)).toEqual([]);
      }
    expect(snapped).toBeGreaterThan(0);
  });
});
