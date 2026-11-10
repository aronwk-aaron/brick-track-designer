// Templates in the Templates list build, with the app's own defaults (setup-defaults.ts APP_DEFAULTS): no warnings but
// the experimental notes, the double slip's that its blades are rigid (no room for sprung plates beside the next sets'), and
// rigid blades on points at an angle to the baseplate grid (a sprung slider there would run over its studs).
// (Split over files by group: the kernel wears out after a few big builds in one worker.)
// Each within its time (BUDGET), and built again unchanged near enough at once: a guard against a build made slower.
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/**
 * Each template's time to build, from nothing (s): a few times what it takes on CI's runner (its shard's log has each
 * test's time), so a build 10 times slower fails, and a busy runner doesn't. The rest: BUDGET_SMALL.
 */
const BUDGET: Record<string, number> = {
  'Double slip (22.5°)': 90, 'Double slip (45°, R40)': 40, '22.5° crossing': 18, 'Three-way switch (tandem, two throws)': 20,
  'Oval (LEGO R40)': 25, 'Crossover (R40)': 40, 'Double crossover (R56)': 90, 'Yard ladder (R40)': 100, 'Wye with a crossover': 55,
  'Banked curve': 25, 'Helix (R104, two turns)': 130, 'Siding ending in a buffer stop': 55, 'Grade up at 2.5%': 15,
  // (the heavy layouts, a file of their own)
  'Yard (R56)': 150, 'Double-track return loop (turning right)': 350, 'Double-track return loop (turning left)': 350,
  // (the double slip with its levers outside, and the reference trackwork's bigger ones)
  'Double slip (22.5°, throws outside)': 60,
  'Double slip R40 45°': 40, 'Single slip R40 45°': 30, 'Double crossover R40': 40, 'T-junction core R56': 40, 'Star crossing 22.5°': 20,
  'Crossover, 4-stud gap, left': 20, 'Crossover, 4-stud gap, right': 20, 'Three-way, no gap': 20, 'Three-way, 2-stud gap': 20,
  'Curved switch R104 90° left': 20, 'Curved switch R104 90° right': 20,
};
const BUDGET_SMALL = 10;
/** only: just these templates of the groups */
export function templatesBuild(groups: string[], only?: string[]) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) if (!only || only.includes(name)) it(`${g}: ${name} builds`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      // (from nothing, as it's first built: what's waited for)
      clearBuildCache();
      const t0 = performance.now();
      const b = buildDesign(w, structuredClone(TEMPLATES[name]));
      const ms = performance.now() - t0;
      expect(ms / 1000, `${name}: built in ${(ms / 1000).toFixed(1)} s`).toBeLessThan(BUDGET[name] ?? BUDGET_SMALL);
      // (and again, nothing changed: every piece found built (a rebuild, or an edit elsewhere), not built again)
      const t1 = performance.now();
      const again = buildDesign(w, structuredClone(TEMPLATES[name]));
      const ms2 = performance.now() - t1;
      expect(ms2, `${name}: built again unchanged in ${(ms2 / 1000).toFixed(2)} s`).toBeLessThan(Math.max(1500, ms / 10));
      expect(again.pieces.length).toBe(b.pieces.length);
      expect(b.pieces.length).toBeGreaterThan(0);
      expect(b.info.warnings.filter((w) => !/experimental/.test(w) && !/at an angle to the baseplate grid/.test(w) && !(/Double slip/.test(name) && /blades are rigid/.test(w)) && !(/Helix/.test(name) && /stands over other track/.test(w)) && !(/X yard/.test(name) && /lever of the points at 67, 209|sprung blade's front has no lip|blades are rigid/.test(w)))).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
}
