// findStuds (geom/studs.ts) finds a stud by its outline at mid-height, its middle the middle of the outline's box. It
// took the mean of the outline's points, which is off where the outline has more points on one side (another solid's
// edge meeting the stud's wall): on 'Modular triple crossover R40' three studs on the branches' slanted sleepers came out
// 0.08 to 0.10 mm off, over the 0.08 allowed, weren't found, and a cut path at 17 studs went through them, leaving rings.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { studsCut } from './cutpaths.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

describe('studs found by their outline\'s box', { timeout: 600000 }, () => {
  it('the R40 triple crossover cut across at 17 studs: no stud is cut', async () => {
    const t = TEMPLATES['Modular triple crossover R40'];
    const d: Design = { ...structuredClone(t), options: { ...t.options, splitTrack: 'lengths' }, expert: { cutPaths: [{ id: 'c1', pts: [[-24, 17], [24, 17]] }] } } as Design;
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      clearBuildCache();
      const b = buildDesign(await kernel(), d);
      expect(studsCut(d, b)).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
