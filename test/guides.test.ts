import { describe, expect, it } from 'vitest';
import { guidePoint } from '../src/app/guides';

const base = { scale: 10, snapPx: 10 };
describe('guides: where the pointer lands', () => {
  it('goes to the stud grid with nothing near', () => {
    expect(guidePoint({ ...base, p: [3.4, 7.6] })).toEqual({ point: [3, 8], guides: [] });
  });
  it('snaps onto the line straight on from another track\'s end, a whole stud along', () => {
    const r = guidePoint({ ...base, p: [0.4, 12.3], ends: [{ pose: { x: 0, y: 4, heading: 0 }, name: 'R3' }] });
    expect(r.point).toEqual([0, 12]);
    expect(r.guides[0].kind).toBe('tangent');
    expect(r.guides[0].label).toContain('R3');
  });
  it('does not snap to a line behind an end, or further off than the pixels say', () => {
    const e = [{ pose: { x: 0, y: 4, heading: 0 }, name: 'R3' }];
    expect(guidePoint({ ...base, p: [0.2, -5], ends: e }).guides).toEqual([]);
    expect(guidePoint({ ...base, p: [1.5, 12], ends: e }).guides).toEqual([]);
  });
  it('snaps 8 and 16 studs from a straight, either side, at the exact distance', () => {
    const st = [{ x: 0, y: 0, heading: 0, studs: 20, name: 'R1' }];
    for (const [px, want] of [[8.3, 8], [-15.7, 16], [-7.8, 8]] as const) {
      const r = guidePoint({ ...base, p: [px, 10.2], straights: st });
      expect(Math.abs(r.point[0])).toBeCloseTo(want, 6);
      expect(r.point[1]).toBe(10);
      expect(r.guides[0]).toMatchObject({ kind: 'parallel', value: want });
    }
  });
  it('works along a slanted straight too (the spacing is square to it)', () => {
    const st = [{ x: 0, y: 0, heading: 45, studs: 40, name: 'R1' }];
    const r = guidePoint({ ...base, p: [-18.4, -4.1], straights: st });
    const u = [-Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)];
    const s = -r.point[0] * u[1] + r.point[1] * u[0];
    expect(Math.abs(s)).toBeCloseTo(16, 6);
  });
  it('catches more pixels for a finger than a mouse, and fewer studs zoomed in', () => {
    const e = [{ pose: { x: 0, y: 0, heading: 0 }, name: 'R1' }];
    expect(guidePoint({ scale: 10, snapPx: 10, p: [1.5, 9], ends: e }).guides).toEqual([]);
    expect(guidePoint({ scale: 10, snapPx: 22, p: [1.5, 9], ends: e }).guides.length).toBe(1);
    expect(guidePoint({ scale: 40, snapPx: 22, p: [1.5, 9], ends: e }).guides).toEqual([]);
  });
  it('snaps straight on from where the track is laid from, to a whole stud, even at 22.5 degrees', () => {
    const r = guidePoint({ ...base, p: [-4.6, 11.4], from: { x: 0, y: 0, heading: 22.5 } });
    expect(r.guides[0].kind).toBe('length');
    const u = [-Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
    expect(Math.hypot(...r.point)).toBeCloseTo(Math.round(Math.hypot(...r.point)), 5);
    expect(r.point[0] / r.point[1]).toBeCloseTo(u[0] / u[1], 5);
  });
  it('snaps onto a usual radius (free curves), to a whole degree, and says R and degrees', () => {
    const r = guidePoint({ ...base, p: [-1.0, 8.3], from: { x: 0, y: 0, heading: 0 }, radii: [24, 32, 40] });
    // (a left turn of R32 about (-32, 0): 15 degrees on is at (-32 + 32cos(15), 32 sin(15)))
    expect(r.guides[0].kind).toBe('radius');
    expect(Math.hypot(r.point[0] + 32, r.point[1])).toBeCloseTo(32, 4);
    const ang = (Math.atan2(r.point[1], r.point[0] + 32) * 180) / Math.PI;
    expect(Math.abs(Math.round(ang) - ang)).toBeLessThan(1e-4);
    expect(r.guides[0].label).toMatch(/^R32/);
  });
  it('shows the direction of a new track from an empty point, in 22.5 degrees', () => {
    const r = guidePoint({ ...base, p: [-6.2, 6.0], from: { x: 0, y: 0, heading: NaN } });
    expect(r.guides[0]).toMatchObject({ kind: 'angle', value: 45 });
  });
  it('does nothing but the grid with Alt held', () => {
    const r = guidePoint({ ...base, off: true, p: [0.4, 12.3], ends: [{ pose: { x: 0, y: 4, heading: 0 }, name: 'R3' }], from: { x: 0, y: 0, heading: 0 } });
    expect(r).toEqual({ point: [0, 12], guides: [] });
  });
  it('the closest guide wins', () => {
    const r = guidePoint({ ...base, p: [8.05, 10], straights: [{ x: 0, y: 0, heading: 0, studs: 20, name: 'R1' }], ends: [{ pose: { x: 8.6, y: 4, heading: 0 }, name: 'R2' }] });
    expect(r.guides[0].kind).toBe('parallel');
  });
});
