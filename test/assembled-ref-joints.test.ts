// The TrixBrix range's sets cut where their pieces join go together (assembled.shared.ts), and no stud on any of their
// parts is left in part by a cut (the cuts at the joints run off the stud grid, square across slanted track).
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { REF_JOINTS } from '../src/app/templates-ref-joints';
import { kernel } from '../src/geom/kernel';
import { assembledSuite } from './assembled.shared';
import { partStuds } from './studs-apart.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

describe('templates go together: TrixBrix sets cut where their pieces join', { timeout: 3000000 }, () => {
  assembledSuite(['TrixBrix trackwork'], Object.keys(REF_JOINTS));
  for (const name of Object.keys(REF_JOINTS)) it(`${name}: no stud left in part`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES[name]));
      expect(b.pieces.filter((p) => /^track/.test(p.name)).flatMap((p) => partStuds(w, p, { studD: 4.8, studFit: 0.18 })).join('; ')).toBe('');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
