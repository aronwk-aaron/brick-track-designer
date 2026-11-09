// Auto off (or the 3D view hidden): each change works out only the plan's trackwork (buildDesign's planOnly), sent to
// early, then PLAN_ONLY thrown. None of the pieces built: a double slip's and a monorail's plan, the points and the
// levers, as the full build has them, without the kernel making the parts' solids (it made them all, and a double
// slip's plan took half a minute).
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache, PLAN_ONLY } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { kernel, type Wasm } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** The solids the kernel makes while f runs (each of the Manifold class's own calls: cube, extrude, hull, union, …). */
function solidsMade(w: Wasm, f: () => void) {
  const M = w.Manifold as unknown as Record<string, unknown>, saved = new Map<string, unknown>();
  let n = 0;
  for (const k of Object.getOwnPropertyNames(M)) {
    const d = Object.getOwnPropertyDescriptor(M, k);
    if (k === 'prototype' || !d || typeof d.value !== 'function' || !d.writable) continue;
    const g = d.value as (...a: unknown[]) => unknown;
    saved.set(k, g);
    M[k] = function (this: unknown, ...a: unknown[]) { n++; return g.apply(this, a); };
  }
  try { f(); } finally { for (const [k, g] of saved) M[k] = g; }
  return n;
}
/** The plan's trackwork, as early gets it (a copy: the full build adds to it after): planOnly, or a full build's. */
function plan(w: Wasm, name: string, planOnly: boolean) {
  let ov: Record<string, unknown> | undefined, thrown: unknown;
  const t0 = performance.now();
  const solids = solidsMade(w, () => {
    try { buildDesign(w, structuredClone(TEMPLATES[name]), undefined, (o) => { ov = JSON.parse(JSON.stringify(o)); }, { planOnly }); } catch (e) { thrown = e; }
  });
  return { ov: ov!, thrown, solids, ms: performance.now() - t0 };
}
const same = (ov: Record<string, unknown>) => JSON.stringify({ items: ov.items, splits: ov.splits, crossings: ov.crossings, checkRails: ov.checkRails, monoPoints: ov.monoPoints });

describe('the plan alone (Auto off)', { timeout: 600000 }, () => {
  for (const name of ['Double slip (22.5°)', 'Crossover (R40)', 'Monorail switch (experimental)', 'Helix (R104, two turns)'])
    it(`${name}: the plan's points and levers as the full build's, its parts not built`, async () => {
      const w = await kernel(), saved = { ...OPTION_DEFAULTS };
      Object.assign(OPTION_DEFAULTS, APP);
      try {
        clearBuildCache();
        const p = plan(w, name, true);
        expect(p.thrown).toBe(PLAN_ONLY);
        clearBuildCache();
        const full = plan(w, name, false);
        expect(full.thrown).toBeUndefined();
        expect(same(p.ov)).toBe(same(full.ov));
        if (/Monorail switch/.test(name)) expect((p.ov.monoPoints as unknown[]).length).toBe(1);
        // (next to none of the solids: at most the few a check of the points' throws against each other makes)
        expect(p.solids).toBeLessThan(full.solids / 20);
        expect(p.ms).toBeLessThan(full.ms);
      } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
    });
});
