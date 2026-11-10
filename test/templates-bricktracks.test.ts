// BrickTracks' range builds (templates.shared.ts), and each part comes out as it's bought: the right BrickTracks piece in the
// parts list and nothing printed (the R104A curve aside, which the app doesn't know as a bought piece).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, legoParts } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { templatesBuild } from './templates.shared';

describe('templates: BrickTracks trackwork', { timeout: 600000 }, () => templatesBuild(['BrickTracks trackwork']));

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
/** a template built with the app's own settings (setup-defaults.ts) */
async function built(name: string) {
  const w = await kernel(), saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  clearBuildCache();
  try { return buildDesign(w, structuredClone(TEMPLATES[name])); } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
}
/** each template's bought parts, as the parts list has them */
const BOUGHT: Record<string, string[]> = {
  'Left switch (BrickTracks R104)': ['BrickTracks R104 switch left x1'],
  'Right switch (BrickTracks R104)': ['BrickTracks R104 switch right x1'],
  'Curve R56 (BrickTracks)': ['BrickTracks R56 x1'],
  'Curve R56, 22.5° (BrickTracks, as the parts library has it)': ['BrickTracks R56 x2'],
  'Curve R72 (BrickTracks)': ['BrickTracks R72 x1'],
  'Curve R88 (BrickTracks)': ['BrickTracks R88 x1'],
  'Curve R104 (BrickTracks)': ['BrickTracks R104 x1'],
  'Curve R120 (BrickTracks)': ['BrickTracks R120 x1'],
  'Curve R104B, siding (BrickTracks)': ['BrickTracks R104B x1'],
  'Straight, 8 studs (BrickTracks S08)': ['BrickTracks S08 x1'],
  'Straight, 4 studs (BrickTracks S04)': ['BrickTracks S04 x1'],
  'Straight, 1.6 studs (BrickTracks S01)': ['BrickTracks S01 x1'],
  'Siding R104 left (BrickTracks)': ['BrickTracks R104 switch left x1', 'BrickTracks R104 x1', 'BrickTracks R104B x1'],
  'Siding R104 right (BrickTracks)': ['BrickTracks R104 switch right x1', 'BrickTracks R104 x1', 'BrickTracks R104B x1'],
};
describe('BrickTracks parts come out as bought', { timeout: 600000 }, () => {
  for (const [name, want] of Object.entries(BOUGHT)) it(name, async () => {
    const b = await built(name);
    expect(b.pieces.filter((p) => !p.lego).map((p) => p.name), 'printed').toEqual([]);
    expect(legoParts(b.pieces).map((l) => `${l.part} x${l.qty}`).sort()).toEqual([...want].sort());
  });
  it('the R104A turnout curve prints: not a piece the app knows as bought', async () => {
    expect((await built('Curve R104A, turnout (BrickTracks)')).pieces.map((p) => !!p.lego)).toEqual([false]);
  });
});
