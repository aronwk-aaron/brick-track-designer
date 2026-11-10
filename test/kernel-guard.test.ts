// The kernel's memory is watched (kernel.ts): with nearly all of its 4 GB taken the kernel doesn't fail, it crawls
// (a build "Building" for ten minutes, nothing said). A build that takes it past the limit is stopped with KernelFull,
// which goes all the way out as a broken kernel does (not as a part that failed to build), for the page to start again.
import { describe, expect, it } from 'vitest';
import { KERNEL_FULL, KernelFull, kernel, kernelBroke, kernelBytes, setKernelFull } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';
import { Scad } from '../src/geom/scad';
import { serveHelper, type FromHelper } from '../src/app/parallel';

describe('the kernel\'s memory watched', { timeout: 300000 }, () => {
  it('its size is known once it\'s loaded, and the limit leaves room under its 4 GB', async () => {
    await kernel();
    expect(kernelBytes()).toBeGreaterThan(1e6);
    expect(kernelBytes()).toBeLessThan(KERNEL_FULL);
    expect(KERNEL_FULL).toBeLessThan(4294901760 - 5e8);
  });
  it('what counts as the kernel\'s own failure', () => {
    expect(kernelBroke(new WebAssembly.RuntimeError('memory access out of bounds'))).toBe(true);
    expect(kernelBroke(5246120)).toBe(true); // (one of its own, thrown as a number)
    expect(kernelBroke(new KernelFull())).toBe(true);
    expect(kernelBroke(new Error('Draw some track'))).toBe(false);
    expect(kernelBroke({ cancelled: true })).toBe(false);
  });
  it('past the limit, the kernel\'s calls stop with KernelFull; under it again, they go on', async () => {
    const s = new Scad(await kernel());
    const was = setKernelFull(kernelBytes() - 1);
    try { expect(() => { for (let k = 0; k < 100; k++) s.cube([1, 1, 1]); }).toThrow(KernelFull); } finally { setKernelFull(was); }
    expect(() => { for (let k = 0; k < 100; k++) s.cube([1, 1, 1]); }).not.toThrow();
  });
  it('a build past the limit fails with KernelFull itself (track pieces, tiles: not a warning that a part failed), and builds after', async () => {
    const w = await kernel();
    for (const options of [{ splitTrack: 'lengths' as const }, { splitTrack: 'bed' as const }]) {
      clearBuildCache();
      const d = { ...structuredClone(TEMPLATES['Crossover (R40)']), options };
      const was = setKernelFull(kernelBytes() - 1);
      let err: unknown;
      try { buildDesign(w, d); } catch (e) { err = e; } finally { setKernelFull(was); }
      expect(err).toBeInstanceOf(KernelFull);
      clearBuildCache();
      const b = buildDesign(w, d);
      expect(b.pieces.length).toBeGreaterThan(3);
      expect(b.info.warnings.filter((x) => /failed to build/.test(x))).toEqual([]);
    }
    clearBuildCache();
  });
  it('a helper whose kernel is full says so as fatal (the build is started again elsewhere)', async () => {
    const w = await kernel();
    const said: FromHelper[] = [];
    const serve = serveHelper(w, (m) => said.push(m));
    // (two tracks 500 studs long: built in tiles, so it has jobs)
    const d = { version: 1 as const, gaugeStuds: 4, routes: [{ name: 'L', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs: 500 }] }, { name: 'R', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs: 500 }] }] };
    serve({ design: d });
    expect(said).toEqual([{ ready: true }]);
    const { buildJobs } = await import('../src/app/build');
    const key = buildJobs(w, d)[0].key;
    const was = setKernelFull(kernelBytes() - 1);
    try { serve({ run: key }); } finally { setKernelFull(was); }
    expect(said[1]).toMatchObject({ key, fatal: true });
    clearBuildCache();
  });
});
