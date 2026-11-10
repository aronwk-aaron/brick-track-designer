import { describe, expect, it } from 'vitest';
import type { DRoute } from '../src/app/design';
import { measureBetween, measurePoint } from '../src/app/measure';

const A: DRoute = { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }, { kind: 'curve', radius: 24, angle: 90 }] };
const B: DRoute = { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] };

describe('measuring', () => {
  it('snaps to a track end first, then to a centre line, else free', () => {
    expect(measurePoint([A, B], [0.3, 0.2], 1, [0, 0])).toMatchObject({ p: [0, 0], on: { name: 'A', at: 'end' } });
    const l = measurePoint([A, B], [0.4, 7.2], 1, [0, 7]);
    expect(l.on).toEqual({ name: 'A', at: 'line' }); expect(l.p[0]).toBeCloseTo(0, 3); expect(l.p[1]).toBeCloseTo(7.2, 1); expect(l.heading).toBeCloseTo(0, 3);
    expect(measurePoint([A, B], [8, 8], 1, [8, 8])).toEqual({ p: [8, 8] });
  });
  it('gives the distance in studs and mm, and the angle between the tracks', () => {
    const m = measureBetween({ p: [0, 5], heading: 0, on: { name: 'A', at: 'line' } }, { p: [16, 5], heading: 0, on: { name: 'B', at: 'line' } });
    expect(m).toMatchObject({ studs: 16, mm: 128, angle: 0, across: 16 });
    expect(m.text).toBe('16 studs (128 mm) · 0° between the tracks · 16 studs apart, side to side');
  });
  it('says the angle where the tracks cross, folded to 90 at most (a track has no direction)', () => {
    expect(measureBetween({ p: [0, 0], heading: 0 }, { p: [3, 4], heading: 135 }).angle).toBe(45);
    expect(measureBetween({ p: [0, 0], heading: 10 }, { p: [3, 4], heading: -170 }).angle).toBe(0);
    expect(measureBetween({ p: [0, 0], heading: 0 }, { p: [3, 4], heading: 90 })).toMatchObject({ studs: 5, mm: 40, angle: 90 });
  });
  it('with no track at a point: the distance only', () => {
    const m = measureBetween({ p: [0, 0] }, { p: [1, 0] });
    expect(m.angle).toBeUndefined(); expect(m.text).toBe('1 stud (8 mm)');
  });
});
