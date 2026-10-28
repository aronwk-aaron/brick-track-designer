// Templates in the Templates list build, with the app's own defaults (setup-defaults.ts APP_DEFAULTS): no warnings but
// the experimental notes, and the double slip's that its sprung blades have no lips (no room: the other sets' blades).
// (Split over files by group: the kernel wears out after a few big builds in one worker.)
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/** only: just these templates of the groups */
export function templatesBuild(groups: string[], only?: string[]) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) if (!only || only.includes(name)) it(`${g}: ${name} builds`, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const b = buildDesign(await kernel(), structuredClone(TEMPLATES[name]));
      expect(b.pieces.length).toBeGreaterThan(0);
      expect(b.info.warnings.filter((w) => !/experimental/.test(w) && !(/Double slip/.test(name) && /has no lip/.test(w)))).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
}
