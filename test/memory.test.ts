// Many designs built in one process (as the page's worker builds an evening's edits): the kernel's memory, which only
// grows, stays within a bound. Each build once left its solids behind for the garbage collector, which never got to
// them in time: a dozen small builds took 2 GB of the kernel's 4, and it ran out ("memory access out of bounds").
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';

// (the kernel's memory, caught as it's set up: it isn't handed out otherwise)
let mem: WebAssembly.Memory | undefined;
const instantiate = WebAssembly.instantiate.bind(WebAssembly) as (...a: unknown[]) => Promise<unknown>;
(WebAssembly as unknown as { instantiate: unknown }).instantiate = async (...a: unknown[]) => {
  const r = (await instantiate(...a)) as { instance?: WebAssembly.Instance; exports?: WebAssembly.Exports };
  for (const v of Object.values((r.instance ?? (r as unknown as WebAssembly.Instance)).exports)) if (v instanceof WebAssembly.Memory) mem = v;
  return r;
};
const MB = () => (mem?.buffer.byteLength ?? 0) / 1e6;
// (a file's bytes summed up: compared as a number, not byte by byte (a mismatch's report would be the files themselves))
const sum = (d: Uint8Array) => { let h = 2166136261; for (const b of d) h = Math.imul(h ^ b, 16777619) >>> 0; return `${d.length}:${h}`; };

const NAMES = ['22.5° crossing', 'Left switch (LEGO)', 'Wye switch', 'Double slip (45°, R40)', 'Three-way switch (tandem, two throws)', 'Crossing on sleepers', 'Crossover (R40)'];
// (an edit: a route moved a stud, so nothing built before is found again)
const moved = (d: Design, k: number): Design => ({ ...structuredClone(d), routes: d.routes.map((r) => ({ ...structuredClone(r), x: r.x + k })) });

describe('the kernel\'s memory over many builds', { timeout: 900000 }, () => {
  it('stays within a bound: 5 rounds of 7 designs take no more than the first', async () => {
    const w = await kernel();
    expect(mem, 'the kernel\'s memory').toBeDefined();
    clearBuildCache();
    const after: number[] = [];
    for (let round = 0; round < 5; round++) {
      // (each design a little different each round, as edits are: the cache drops the old ones' pieces as it goes)
      for (const name of NAMES) expect(buildDesign(w, moved(TEMPLATES[name], round)).pieces.length).toBeGreaterThan(0);
      after.push(MB());
    }
    // (the first round's the biggest build's worth, and the cache's; the rest may add one step of growing, no more:
    // 35 builds left behind took 2.5 GB)
    expect(after[4], `MB after each round: ${after.map((v) => v.toFixed(0)).join(', ')}`).toBeLessThan(after[0] * 1.3 + 64);
    expect(after[4]).toBeLessThan(1200);
    clearBuildCache();
    // (and the same designs come out the same after all that: nothing still wanted was deleted)
    const a = buildDesign(w, structuredClone(TEMPLATES['Wye switch']));
    clearBuildCache();
    const b = buildDesign(w, structuredClone(TEMPLATES['Wye switch']));
    expect(b.pieces.map((p) => sum(p.stl))).toEqual(a.pieces.map((p) => sum(p.stl)));
    clearBuildCache();
  });
  it('a design built again and again unchanged is found built, and takes no more memory', async () => {
    const w = await kernel();
    clearBuildCache();
    const d = () => structuredClone(TEMPLATES['Crossover (R40)']);
    const first = buildDesign(w, d()), m0 = MB();
    for (let k = 0; k < 8; k++) {
      const t0 = performance.now(), again = buildDesign(w, d());
      expect(performance.now() - t0).toBeLessThan(3000);
      expect(again.pieces.map((p) => p.name)).toEqual(first.pieces.map((p) => p.name));
      expect(sum(again.pieces[0].stl)).toBe(sum(first.pieces[0].stl));
    }
    expect(MB()).toBeLessThanOrEqual(m0 * 1.2 + 32);
    clearBuildCache();
  });
});
