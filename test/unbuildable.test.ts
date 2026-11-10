// What can't be built at all is turned away with a plain message before anything's worked out (build.ts unbuildable):
// the same track drawn twice ran the kernel out of memory, a flat curve of two full turns and a 100000-stud straight
// never finished building.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, MAX_TRACK_STUDS, unbuildable } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';
import { C, D, MONO, R, S } from './warnings.shared';

describe('designs that can\'t be built', { timeout: 120000 }, () => {
  it('the same track drawn twice (the same way, back along it, or a short one on a longer)', () => {
    expect(unbuildable(D([R('A', 0, 0, 0, [S(16)]), R('B', 0, 0, 0, [S(16)])]))).toMatch(/^A lies on top of B \(the same track drawn twice\): delete one of them$/);
    expect(unbuildable(D([R('A', 0, 0, 0, [S(16)]), R('B', 0, 16, 180, [S(16)])]))).toMatch(/A lies on top of B/);
    expect(unbuildable(D([R('A', 0, 0, 0, [S(64)]), R('B', 0, 16, 0, [S(16)])]))).toMatch(/B lies on top of A/);
    expect(unbuildable(D([R('A', 0, 0, 0, [C(40, 90)]), R('', 0, 0, 0, [C(40, 90)])]))).toMatch(/A lies on top of route 2/);
  });
  it('a route that runs along itself: a flat curve of more than a full turn', () => {
    expect(unbuildable(D([R('A', 0, 0, 0, [C(40, 720)])]))).toMatch(/^A runs along itself/);
    expect(unbuildable(D([R('A', 0, 0, 0, [C(40, 400)])]))).toMatch(/A runs along itself/);
    expect(unbuildable(D([R('A', 0, 0, 0, [S(32), C(40, 180), S(32), C(40, 180), S(32)])]))).toMatch(/A runs along itself/);
  });
  it('a table that\'s no shape is turned away; one saved without its shape is taken for what its numbers say, and builds', async () => {
    const line = D([R('A', 0, 0, 0, [S(32)])]);
    expect(unbuildable({ ...line, tables: [{ shape: 'rect', x: -8, y: -8, w: 16, h: 48 }, { name: 'B' } as never] })).toBe('table 2 (B) isn\'t a rectangle, a ring section or an outline: delete it and draw it again');
    // (as saved by hand, or by a version before tables had shapes: it failed the build outright, reading an outline it hasn't got)
    const d = { ...line, options: { legoTrack: 'print' as const }, tables: [{ x: -8, y: -8, w: 16, h: 24 }, { x: -8, y: 16, w: 16, h: 24 }] as never };
    expect(unbuildable(d)).toBeUndefined();
    const w = await kernel(), b = buildDesign(w, d);
    expect(b.pieces.filter((p) => /^track/.test(p.name)).length).toBe(2);
  });
  it('more track than can be built', () => {
    expect(unbuildable(D([R('A', 0, 0, 0, [S(100000)])]))).toBe(`100000 studs of track is more than can be built (${MAX_TRACK_STUDS} at most): check the lengths typed in`);
    expect(unbuildable(D([R('A', 0, 0, 0, [S(MAX_TRACK_STUDS / 2)]), R('B', 16, 0, 0, [S(MAX_TRACK_STUDS / 2)])]))).toBeUndefined();
  });
  it('nothing wrong with: a full circle, an oval in one route, a helix (its turns at other heights), a branch that runs along its route first, a route carrying on from another, tracks side by side, monorail', () => {
    for (const d of [
      D([R('A', 0, 0, 0, [C(40, 360)])]),
      D([R('A', 0, 0, 0, [S(32), C(40, 180), S(32), C(40, 180)])]),
      D([R('A', 0, 0, 0, [C(104, 720)], { monoHeight: 0, monoHeightEnd: 80 })]),
      D([R('A', 0, 0, 0, [S(64)]), R('B', 0, 0, 0, [S(8), C(40, 30)])]),
      D([R('A', 0, 0, 0, [S(32)]), R('B', 0, 32, 0, [S(32)])]),
      D([R('A', 0, 0, 0, [S(32)]), R('B', 8, 0, 0, [S(32)])]),
      D([R('A', 0, 0, 0, [S(32)], MONO), R('B', 0, 0, 0, [S(32)], MONO)]),
      D([R('A', 0, 0, 0, [S(32)]), R('Empty', 0, 0, 0, [])]),
    ]) expect(unbuildable(d)).toBeUndefined();
  });
  it('no template is turned away', () => {
    expect(Object.entries(TEMPLATES).filter(([, d]) => unbuildable(d)).map(([n]) => n)).toEqual([]);
  });
  it('the build says so, at once (and the plan alone too)', async () => {
    const w = await kernel();
    for (const d of [D([R('A', 0, 0, 0, [S(16)]), R('B', 0, 0, 0, [S(16)])]), D([R('A', 0, 0, 0, [C(40, 720)])]), D([R('A', 0, 0, 0, [S(100000)])])]) {
      const t0 = performance.now();
      expect(() => buildDesign(w, d)).toThrow(/lies on top of|runs along itself|more than can be built/);
      expect(() => buildDesign(w, d, undefined, undefined, { planOnly: true })).toThrow(/lies on top of|runs along itself|more than can be built/);
      expect(performance.now() - t0).toBeLessThan(2000);
    }
  });
});
