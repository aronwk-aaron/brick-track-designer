// A part's break-out supports are solids of their own, carried with the part (kernel.ts Supports), never part of its
// solid; and finished in one place (geom/supports.ts finishSupports): every one clear of the part, none far from it.
import { describe, expect, it } from 'vitest';
import { arena, flat, handlesIn, kernel, partBox, supportsOf } from '../src/geom/kernel';
import { Scad, M, R, T, type Man } from '../src/geom/scad';
import { finishSupports, support, SUPPORT_GAP, SUPPORT_REACH, type SupportNote } from '../src/geom/supports';
import { buildScope, clearSolids, SolidCache } from '../src/app/solidcache';
import { buildDesign, clearBuildCache, setSupportCheck } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { prints, solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const gone = (m: Man) => (m as unknown as { isDeleted(): boolean }).isDeleted();
const sv = (m: Man) => supportsOf(m)?.volume() ?? 0;

describe('a part\'s supports are carried with it', () => {
  it('joined to a part, a support is no part of its solid: the part\'s volume and triangles are its own, its box is with them', async () => {
    const s = new Scad(await kernel());
    const part = s.cube([10, 10, 2]), m = s.union([part, support(s, T(s.cube([1, 1, 3]), [12, 0, 0]))]);
    expect(m.volume()).toBeCloseTo(200, 6);
    expect(m.decompose()).toHaveLength(1);
    expect(sv(m)).toBeCloseTo(3, 6);
    expect(m.boundingBox().max).toEqual([13, 10, 3]);
    expect(partBox(m).max).toEqual([10, 10, 2]);
    // (a support that runs into the part is still not the part)
    const in2 = s.union([part, support(s, T(s.cube([1, 1, 3]), [9.5, 0, 0]))]);
    expect(in2.volume()).toBeCloseTo(200, 6);
    expect(sv(in2)).toBeCloseTo(3, 6);
  });
  it('moved as the part is moved, cut as it\'s cut, joined as parts are joined', async () => {
    const s = new Scad(await kernel());
    const m = s.union([s.cube([10, 10, 2]), support(s, T(s.cube([1, 1, 3]), [12, 0, 0]))]);
    const moved = M(R(T(m, [5, 0, 0]), [0, 0, 90]), [1, 0, 0]);
    expect(sv(moved)).toBeCloseTo(3, 6);
    expect(supportsOf(moved)!.boundingBox().min.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 17, 0]);
    // (a cut cuts both: the part's half and the support's)
    const low = s.intersection(m, T(s.cube([100, 100, 1]), [-50, -50, 0]));
    expect(low.volume()).toBeCloseTo(100, 6);
    expect(sv(low)).toBeCloseTo(1, 6);
    const less = s.difference(m, [T(s.cube([100, 100, 1]), [-50, -50, 0])]);
    expect(less.volume()).toBeCloseTo(100, 6);
    expect(sv(less)).toBeCloseTo(2, 6);
    const [a, b] = m.splitByPlane([0, 0, 1], 1);
    expect(sv(a) + sv(b)).toBeCloseTo(3, 6);
    expect(sv(m.trimByPlane([0, 0, 1], 2))).toBeCloseTo(1, 6);
    // (joined: both parts' supports)
    const two = s.union([m, T(m, [30, 0, 0])]);
    expect(two.volume()).toBeCloseTo(400, 6);
    expect(sv(two)).toBeCloseTo(6, 6);
    expect(sv(m.add(T(m, [30, 0, 0])))).toBeCloseTo(6, 6);
    // (the cutter's own supports cut nothing)
    const cutter = s.union([T(s.cube([2, 2, 10]), [0, 0, -1]), support(s, T(s.cube([2, 2, 10]), [4, 4, -1]))]);
    expect(s.difference(m, [cutter]).volume()).toBeCloseTo(200 - 8, 6);
  });
  it('taken apart into its bodies, each support goes with the body nearest it', async () => {
    const s = new Scad(await kernel());
    const m = s.union([s.cube([10, 10, 2]), support(s, T(s.cube([1, 1, 3]), [12, 0, 0]))]);
    const bs = s.union([m, T(R(m, [0, 0, 180]), [60, 0, 0])]).decompose();
    expect(bs).toHaveLength(2);
    for (const b of bs) { expect(b.volume()).toBeCloseTo(200, 6); expect(sv(b)).toBeCloseTo(3, 6); }
    // (and a flat copy has flat copies of them)
    expect(sv(flat(s.w, m))).toBeCloseTo(3, 6);
    expect(supportsOf(flat(s.w, m, false))).toBeUndefined();
  });
  it('owned with the part: kept by an arena and by a cache with it, deleted with it', async () => {
    const s = new Scad(await kernel());
    const kept = arena(s.w, () => T(s.union([s.cube([4, 4, 4]), support(s, T(s.cube([1, 1, 1]), [5, 0, 0]))]), [1, 1, 1]), (r) => [r]);
    expect(sv(kept)).toBeCloseTo(1, 6);
    expect(handlesIn({ a: [kept] }).has(supportsOf(kept)!)).toBe(true);
    const cache = new SolidCache(4);
    const got = buildScope(() => cache.get('k', () => s.union([s.cube([4, 4, 4]), support(s, T(s.cube([1, 1, 1]), [5, 0, 0]))])));
    const sp = supportsOf(got)!;
    expect(gone(sp)).toBe(false);
    expect(sp.volume()).toBeCloseTo(1, 6);
    cache.clear();
    expect(gone(got)).toBe(true);
    expect(gone(sp)).toBe(true);
    clearSolids();
  });
});

describe('finishSupports', () => {
  it('leaves a support that\'s clear of the part as built', async () => {
    const s = new Scad(await kernel()), notes: SupportNote[] = [];
    const m = s.union([s.cube([10, 10, 2]), support(s, T(s.cube([1, 4, 1.7]), [10.3, 0, 0])), support(s, T(s.cube([2, 2, 1]), [4, 4, 2.2]))]);
    const f = finishSupports(s.w, m, notes)!;
    expect(f.volume()).toBeCloseTo(6.8 + 4, 6);
    expect(notes).toEqual([]);
  });
  it('cuts one that runs into the part back to the gap, all round: never one with the part', async () => {
    const s = new Scad(await kernel()), notes: SupportNote[] = [];
    const part = s.cube([10, 10, 2]), m = s.union([part, support(s, T(s.cube([1, 4, 3]), [9.5, 0, 0]))]);
    const f = finishSupports(s.w, m, notes)!;
    expect(part.minGap(f, 1)).toBeGreaterThanOrEqual(SUPPORT_GAP);
    expect(part.minGap(f, 1)).toBeLessThan(SUPPORT_GAP + 0.05);
    expect(part.intersect(f).volume()).toBe(0);
    expect(f.volume()).toBeGreaterThan(5);
    expect(notes.map((n) => n.what)).toEqual(['cut']);
    expect(notes[0].before).toBeCloseTo(12, 6);
    expect(notes[0].after).toBeCloseTo(f.volume(), 6);
  });
  it('drops what no longer stands by the part: one inside it, a flake, one cut down to nothing much', async () => {
    const s = new Scad(await kernel()), notes: SupportNote[] = [];
    const m = s.union([s.cube([10, 10, 2]), support(s, T(s.cube([1, 1, 1]), [5, 5, 0.5])), support(s, T(s.cube([2, 2, 0.05]), [12, 5, 0])), support(s, T(s.cube([1.3, 1.3, 2]), [9, 0, 0]))]);
    expect(finishSupports(s.w, m, notes)).toBeUndefined();
    // (the flake isn't a support at all: not said)
    expect(notes.map((n) => n.what)).toEqual(['dropped', 'dropped']);
  });
  it('cuts off what stands further from the part than a rail end\'s supports do', async () => {
    const s = new Scad(await kernel()), notes: SupportNote[] = [];
    const part = s.cube([10, 10, 2]), m = s.union([part, support(s, T(s.cube([14, 2, 1]), [10.4, 4, 0]))]);
    const f = finishSupports(s.w, m, notes)!;
    expect(f.boundingBox().max[0]).toBeGreaterThan(10 + SUPPORT_REACH - 0.1);
    expect(f.boundingBox().max[0]).toBeLessThanOrEqual(10 + SUPPORT_REACH + 1e-6);
    expect(notes.map((n) => n.what)).toEqual(['cut']);
    // (one wholly beyond it: gone)
    expect(finishSupports(s.w, s.union([part, support(s, T(s.cube([2, 2, 1]), [20, 4, 0]))]))).toBeUndefined();
  });
});

describe('the build', { timeout: 300000 }, () => {
  it('a switch on sleepers: every support is one the build carried (none found by its size), and each file is its part and its supports', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    const loose: NonNullable<Parameters<typeof setSupportCheck>[0]> = [];
    try {
      const w = await kernel();
      clearBuildCache();
      setSupportCheck(loose);
      const b = buildDesign(w, structuredClone(TEMPLATES['Left switch (LEGO)']));
      expect(loose).toEqual([]);
      // (rail ends', and the sprung blades' pockets')
      expect(b.pieces.filter((p) => p.supports).map((p) => p.name).sort()).toEqual(['switch-base1', 'switch-base2', 'switch-points-a', 'switch-points-b']);
      for (const p of b.pieces) {
        expect(prints(w, p, APP.printBedX!, APP.printBedY!), p.name).toEqual([]);
        if (!p.supports) continue;
        const part = solid(w, p.positions)!, sup = solid(w, p.supports)!;
        expect(part.minGap(sup, 1), p.name).toBeGreaterThanOrEqual(SUPPORT_GAP - 0.001);
      }
    } finally { setSupportCheck(undefined); Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('a siding whose end\'s supports stood in the next track\'s ballast: cut back, loose, and still said to be supports', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES['Siding ending in a buffer stop']));
      const p = b.pieces.find((q) => q.name === 'track1')!;
      expect(prints(w, p, APP.printBedX!, APP.printBedY!)).toEqual([]);
      const part = solid(w, p.positions)!, sup = solid(w, p.supports!)!;
      expect(sup.decompose()).toHaveLength(3);
      expect(part.minGap(sup, 1)).toBeGreaterThanOrEqual(SUPPORT_GAP);
      // (it still prints there: nothing said)
      expect(b.info.warnings.filter((q) => /support/.test(q))).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
