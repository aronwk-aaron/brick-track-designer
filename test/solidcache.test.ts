// The build's solids are owned and deleted (solidcache.ts, kernel.ts): the kernel's memory is only given back by
// hand, and every build once left its solids behind till the kernel ran out.
import { describe, expect, it } from 'vitest';
import { arena, handlesIn, kernel, recordInto, type Handle } from '../src/geom/kernel';
import { Scad, T, type Man } from '../src/geom/scad';
import { buildScope, clearSolids, jobScope, SolidCache } from '../src/app/solidcache';

const gone = (m: Man) => (m as unknown as { isDeleted(): boolean }).isDeleted();

describe('arena', () => {
  it('deletes what it made but what\'s kept, and nothing made before it', async () => {
    const s = new Scad(await kernel());
    const before = s.cube([1, 1, 1]);
    let inner: Man | undefined;
    const kept = arena(s.w, () => { inner = T(before, [1, 0, 0]); return s.union([before, inner]); }, (r) => [r]);
    expect(gone(inner!)).toBe(true);
    expect(gone(kept)).toBe(false);
    expect(gone(before)).toBe(false);
    expect(kept.volume()).toBeCloseTo(2, 6);
  });
  it('a solid made before and handed back by a call inside isn\'t the arena\'s to delete', async () => {
    const s = new Scad(await kernel());
    const made = new Set<Handle>();
    recordInto(made, () => {
      const a = s.cube([2, 2, 2]);
      // (a union of one thing: the kernel may hand the thing itself back)
      arena(s.w, () => { s.union([a]); }, () => []);
      expect(gone(a)).toBe(false);
      expect(a.volume()).toBeCloseTo(8, 6);
    });
    expect(made.size).toBeGreaterThan(0);
  });
  it('a kept solid comes out as it would with nothing deleted (worked out before the rest goes)', async () => {
    const s = new Scad(await kernel());
    const make = () => { let m = s.cube([10, 10, 10]); for (let k = 0; k < 6; k++) m = s.difference(m, [T(s.cylinder(12, 1.3, 1.3, 24), [1.5 * k + 1, 5, -1])]); return m; };
    const plain = make(), inArena = arena(s.w, make, (r) => [r]);
    expect(Array.from(inArena.getMesh().vertProperties)).toEqual(Array.from(plain.getMesh().vertProperties));
  });
  it('when it fails part way, what it made is left to whoever\'s recording outside', async () => {
    const s = new Scad(await kernel());
    const outer = new Set<Handle>();
    let m: Man | undefined;
    recordInto(outer, () => { try { arena(s.w, () => { m = s.cube([1, 1, 1]); throw new Error('no'); }, () => []); } catch { /* (as a part that failed to build) */ } });
    expect(gone(m!)).toBe(false);
    expect(outer.has(m as unknown as Handle)).toBe(true);
  });
});

describe('handlesIn', () => {
  it('finds the solids in arrays, objects, maps and sets, and nothing in plain data', async () => {
    const s = new Scad(await kernel());
    const a = s.cube([1, 1, 1]), b = s.cube([2, 2, 2]), c = s.square([1, 1]), d = s.cube([3, 3, 3]);
    const v = { parts: [a, { deep: [b] }], m: new Map<string, unknown>([['c', c]]), st: new Set([d]), n: 3, t: 'x', f: new Float32Array(3), again: a };
    expect(handlesIn(v)).toEqual(new Set([a, b, c, d]));
    expect(handlesIn({ n: [1, 2, { k: 'v' }] }).size).toBe(0);
  });
});

describe('the cache of solids', () => {
  it('keeps an entry\'s value, deletes the rest of its making, and deletes the value when it\'s dropped', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(10);
    let scrap: Man | undefined, calls = 0;
    const f = () => { calls++; scrap = s.cube([1, 1, 1]); return { m: s.union([scrap, T(scrap, [1, 0, 0])]) }; };
    const v = buildScope(() => c.get('a', f, true));
    expect(gone(scrap!)).toBe(true);
    expect(v.m.volume()).toBeCloseTo(2, 6);
    expect(buildScope(() => c.get('a', f, true))).toBe(v);
    expect(calls).toBe(1);
    c.clear();
    expect(gone(v.m)).toBe(true);
  });
  it('keeps the rest of an entry\'s making till its value has been worked out (not worked out just to delete it)', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(10);
    let scrap: Man | undefined;
    const v = buildScope(() => c.get('lazy', () => { scrap = s.cube([1, 1, 1]); return { used: T(scrap, [0, 0, 1]), unused: T(scrap, [0, 0, 2]) }; }));
    expect(gone(scrap!)).toBe(false);
    buildScope(() => { c.get('lazy', () => { throw new Error('made already'); }); v.used.volume(); });
    expect(gone(scrap!)).toBe(false); // (one of its solids still isn't worked out)
    buildScope(() => { v.unused.volume(); });
    expect(gone(scrap!)).toBe(true);
    expect(gone(v.used)).toBe(false);
    c.clear();
  });
  it('a build deletes what it made outside the cache when it ends, however it ends', async () => {
    const s = new Scad(await kernel());
    let a: Man | undefined, b: Man | undefined;
    buildScope(() => { a = s.cube([1, 1, 1]); });
    expect(gone(a!)).toBe(true);
    expect(() => buildScope(() => { b = s.cube([1, 1, 1]); throw new Error('stopped'); })).toThrow('stopped');
    expect(gone(b!)).toBe(true);
  });
  it('drops an entry not used for a few builds, and keeps one that is', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(10);
    const old = buildScope(() => c.get('old', () => s.cube([1, 1, 1]), true));
    const live = buildScope(() => c.get('live', () => s.cube([2, 2, 2]), true));
    for (let k = 0; k < 6; k++) buildScope(() => c.get('live', () => { throw new Error('made already'); }));
    expect(gone(old)).toBe(true);
    expect(gone(live)).toBe(false);
    c.clear();
  });
  it('drops the oldest entries over its size', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(2);
    const ms = buildScope(() => ['a', 'b', 'c'].map((k) => c.get(k, () => s.cube([1, 1, 1]), true)));
    expect(ms.map(gone)).toEqual([true, false, false]);
    c.clear();
  });
  it('an entry with another\'s solid in its value is used with it and dropped with it', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(10);
    const whole = buildScope(() => c.get('whole', () => s.cube([4, 4, 4]), true));
    // (a cut that left the piece whole: its parts, the piece itself)
    const parts = buildScope(() => { c.get('whole', () => whole); return c.get('parts', () => [whole], true); });
    // (the parts used build after build, the piece never asked for again: kept as long as they are)
    for (let k = 0; k < 6; k++) buildScope(() => c.get('parts', () => { throw new Error('made already'); }));
    expect(gone(whole)).toBe(false);
    expect(parts[0].volume()).toBeCloseTo(64, 6);
    c.clear();
    expect(gone(whole)).toBe(true);
  });
  it('a value with a solid the build made before it: the entry\'s from there, not deleted with the build', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    const c = new SolidCache(10);
    let mine: Man | undefined;
    const v = buildScope(() => { mine = s.cube([1, 2, 3]); return c.get('adopts', () => [mine!], true); });
    expect(gone(mine!)).toBe(false);
    expect(v[0].volume()).toBeCloseTo(6, 6);
    c.clear();
    expect(gone(mine!)).toBe(true);
  });
  it('a plan\'s solids are kept for its jobs till the next plan; a job deletes what it makes', async () => {
    const s = new Scad(await kernel());
    clearSolids();
    let planned: Man | undefined, inJob: Man | undefined;
    buildScope(() => { planned = s.cube([1, 1, 1]); }, true);
    expect(gone(planned!)).toBe(false);
    expect(jobScope(() => { inJob = T(planned!, [1, 0, 0]); return inJob.volume(); })).toBeCloseTo(1, 6);
    expect(gone(inJob!)).toBe(true);
    // (an ordinary build between leaves them)
    buildScope(() => { s.cube([1, 1, 1]); });
    expect(gone(planned!)).toBe(false);
    buildScope(() => { s.cube([1, 1, 1]); }, true);
    expect(gone(planned!)).toBe(true);
    clearSolids();
  });
});
