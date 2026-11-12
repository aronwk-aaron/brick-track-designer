// Studs keep a full stud apart (the setting, studsFullPitch; geom/studpitch.ts): with it on, no two studs on a part are
// closer than a stud's pitch, 8 mm (less a hair), on plain track, curves on ballast, a curved crossing and switches on
// ballast; off (the default), only that they never touch, as before.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { PITCH_SLACK } from '../src/geom/studpitch';
import { STUD } from '../src/geom/track';
import { studsOf } from './studs-apart.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** The closest two studs on one level of any part (mm), and how many studs in all. */
async function closest(d: Design) {
  const w = await kernel(), saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try {
    clearBuildCache();
    const b = buildDesign(w, d), o = { ...APP, ...d.options };
    let best = Infinity, n = 0;
    for (const p of b.pieces) {
      if (p.lego || !/track|switch-base|ballast/.test(p.name)) continue;
      for (const level of studsOf(w, p, { studD: 4.8, studFit: o.studFit, antistudFit: o.antistudFit }).studs) {
        n += level.length;
        for (let i = 0; i < level.length; i++) for (let j = i + 1; j < level.length; j++) best = Math.min(best, Math.hypot(level[i][0] - level[j][0], level[i][1] - level[j][1]));
      }
    }
    return { best, n };
  } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}
const on = (d: Design, more: Partial<PieceOptions> = {}): Design => ({ ...structuredClone(d), options: { ...d.options, ...more, studsFullPitch: true } });
const curve = (o: Partial<PieceOptions>): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }], options: { printBedX: 500, printBedY: 500, legoTrack: 'print', ...o } as Design['options'] });

describe('studs keep a full stud apart', { timeout: 600000 }, () => {
  for (const [name, d] of [
    ['Curve R40, 5.62°', TEMPLATES['Curve R40, 5.62°']],
    ['Curved crossing R56', TEMPLATES['Curved crossing R56']],
    ['a curve R40 on ballast, solid bed', curve({ ballast: 'ballast', sleepers: 'bed' })],
    ['a curve R40 on ballast with the buddy layer', curve({ ballast: 'buddy' })],
    ['Left switch (LEGO) on ballast', { ...TEMPLATES['Left switch (LEGO)'], options: { ...TEMPLATES['Left switch (LEGO)'].options, ballast: 'buddy' } } as Design],
  ] as [string, Design][]) it(name, async () => {
    const off = await closest(structuredClone(d)), full = await closest(on(d));
    expect(full.best, `${name}: closest two with it on`).toBeGreaterThanOrEqual(STUD - PITCH_SLACK - 0.02);
    expect(full.n).toBeGreaterThan(0);
    // (off: as before, never touching, some closer than a pitch where they were)
    expect(off.best).toBeGreaterThanOrEqual(5.28);
  });
  it('a curve\'s bed studs in rows along the track: each row spaced along its own line, so the inner rows lose a stud, not every other one', async () => {
    const d = { ...TEMPLATES['Narrow-gauge curve R65.4, 11.25° with 3.42 studs straight, on ballast'] }, off = await closest(structuredClone(d)), full = await closest(on(d));
    expect(full.best).toBeGreaterThanOrEqual(STUD - PITCH_SLACK - 0.02);
    expect(full.n).toBeGreaterThan(0.9 * off.n);
  });
});
