// Templates in the Templates list build: no warnings but the experimental notes. (Split over files by group: the
// kernel wears out after a dozen big builds in one worker.)
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATE_GROUPS, TEMPLATES } from '../src/app/design';

export function templatesBuild(groups: string[]) {
  for (const [g, names] of TEMPLATE_GROUPS) if (groups.includes(g)) for (const name of names) it(`${g}: ${name} builds`, async () => {
    const b = buildDesign(await kernel(), structuredClone(TEMPLATES[name]));
    expect(b.pieces.length).toBeGreaterThan(0);
    expect(b.info.warnings.filter((w) => !/experimental/.test(w))).toEqual([]);
  });
}
