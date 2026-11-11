// The three-track crossover builds, within its time (templates.shared.ts): eight sets of points, in a worker of its own.
// And its cut paths (expert) don't cost more than the build they cut: a guard on the cut-path code's own time.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { templatesBuild } from './templates.shared';

describe('templates: the three-track crossover', { timeout: 900000 }, () => templatesBuild(['TrixBrix trackwork'], ['Crossover, three tracks, R104']));

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
describe('cut paths: what they add to a build\'s time', { timeout: 1800000 }, () => {
  /** The crossover built from nothing as the app builds it, s; plain: without its cut paths. */
  const timed = async (options: Partial<PieceOptions>, plain: boolean) => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d: Design = structuredClone(TEMPLATES['Crossover, three tracks, R104']);
      d.options = { ...d.options, ...options };
      if (plain) delete d.expert;
      clearBuildCache();
      const t0 = performance.now(), b = buildDesign(await kernel(), d);
      return { s: (performance.now() - t0) / 1000, b };
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  };
  // (its nine paths cut one piece of 390,000 triangles into ten parts: the cuts themselves, their joints, each part
  // out of the whole piece; without them the app cuts it itself. Measured on a desk machine, on sleepers: 24 to 33 s
  // without the paths and 31 to 34 with; 59 with before the part's plan was looked at only beside each path
  // (pathsplit.ts NEAR), which this would have caught. On ballast with a buddy strip (560,000 triangles): 26 and 24 s)
  for (const [what, options] of [['on sleepers', {}], ['on ballast with a buddy strip', { ballast: 'buddy' }]] as const)
    it(`the three-track crossover ${what}: cut by its paths in under 1.3 times the time it builds in without them, and 5 s`, async () => {
      const plain = await timed(options, true), cut = await timed(options, false);
      process.stdout.write(`CUT-PATH-TIME\t${what}\tplain_ms=${Math.round(plain.s * 1000)}\tcut_ms=${Math.round(cut.s * 1000)}\n`);
      expect(cut.b.info.warnings.filter((w) => /cut path/.test(w))).toEqual([]);
      expect(cut.b.pieces.length).toBeGreaterThan(plain.b.pieces.length);
      expect(cut.s, `${cut.s.toFixed(1)} s with its cut paths, ${plain.s.toFixed(1)} s without`).toBeLessThan(1.3 * plain.s + 5);
    });
});
