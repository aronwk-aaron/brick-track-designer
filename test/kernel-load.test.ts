// A kernel that can't be loaded (offline, its file not kept by the browser) is said as that, not as a design the
// kernel broke on; and it's tried again the next time it's asked for.
import { expect, it } from 'vitest';
import { kernel, kernelBroke, KernelNotLoaded } from '../src/geom/kernel';

it('a kernel whose file can\'t be fetched: KernelNotLoaded (not a broken kernel), then loaded when it can be', { timeout: 60000 }, async () => {
  let err: unknown;
  try { await kernel('/no/such/place/manifold.wasm'); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(KernelNotLoaded);
  expect((err as Error).message).toMatch(/couldn't be loaded/);
  expect(kernelBroke(err)).toBe(false);
  const w = await kernel();
  expect(w.Manifold.cube([1, 2, 3]).volume()).toBeCloseTo(6, 6);
});
