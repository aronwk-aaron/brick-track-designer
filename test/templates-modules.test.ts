// The reference range's kit modules as templates of their own (src/app/templates-ref-kits.ts REF_MODULES): a base, a
// detach 1, each built alone: it builds, goes together (assembled.shared.ts), is one printed track part, and has the
// library's ends for that module on its edges (the pattern of templates-kits.test.ts, whose kits cut the same modules
// out of the whole switch).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, TEMPLATES } from '../src/app/design';
import { REF_MODULES } from '../src/app/templates-ref-kits';
import { assembledSuite } from './assembled.shared';
import { templatesBuild } from './templates.shared';

const NAMES = Object.keys(REF_MODULES);
describe('templates: the kits\' modules on their own', { timeout: 900000 }, () => templatesBuild(['TrixBrix trackwork'], NAMES));
describe('templates go together: the kits\' modules on their own', { timeout: 1800000 }, () => assembledSuite(['TrixBrix trackwork'], NAMES));

const APP = (globalThis as unknown as { APP_DEFAULTS: typeof OPTION_DEFAULTS }).APP_DEFAULTS;
const build = async (d: Design) => {
  const saved = { ...OPTION_DEFAULTS };
  Object.assign(OPTION_DEFAULTS, APP);
  try { clearBuildCache(); return buildDesign(await kernel(), structuredClone(d)); } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
};
/** a part's bed, studs: [x0, y0, x1, y1] of what's under the rails' height */
const bed = (p: { positions: Float32Array }) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 2] < 3) { b[0] = Math.min(b[0], p.positions[i] / 8); b[1] = Math.min(b[1], p.positions[i + 1] / 8); b[2] = Math.max(b[2], p.positions[i] / 8); b[3] = Math.max(b[3], p.positions[i + 1] / 8); } return b; };
/** A module's ends in its template's frame (studs; the library's are from each part's middle, y down), and how long it is up the plan. */
const ENDS = (hand: 1 | -1): Record<string, [ends: [number, number][], long: number]> => {
  const h = hand === 1 ? 'left' : 'right', m = (ends: [number, number][]): [number, number][] => ends.map(([x, y]) => [x * hand, y]);
  return {
    // (the library's base: the toe, the straight's end 16 on, the branch's 1 over there)
    [`Switch R104 base, ${h}`]: [m([[0, 0], [0, 16], [-1, 16]]), 16],
    // (its detach 1: the base's two ends, the straight's far end 24 on, the branch's 4 over 12 on)
    [`Switch R104 detach 1, ${h}`]: [m([[0, 16], [-1, 16], [0, 40], [-4, 28]]), 24],
    // (the compact base: the toe, the straight's end, the branch's at 22.5 degrees of R40, 3.04 over and 15.31 on)
    [`Switch R40 compact base, ${h}`]: [m([[0, 0], [0, 16], [-3.045, 15.307]]), 16],
  };
};

describe('a kit\'s module on its own is the library\'s module', { timeout: 900000 }, () => {
  for (const [name, [ends, long]] of Object.entries({ ...ENDS(1), ...ENDS(-1) })) it(`${name}: one track part, the library's ends on its edges; no warning`, async () => {
    const b = await build(TEMPLATES[name]);
    const parts = b.pieces.filter((p) => /^track\d*$|-base\d*$/.test(p.name)).map((p) => ({ name: p.name, box: bed(p) }));
    expect(parts.map((p) => p.name)).toHaveLength(1);
    const bx = parts[0].box, said = JSON.stringify(bx.map((v) => +v.toFixed(2)));
    // (each end on the part's edge, within 2 studs of it: a joint's reach, and a slanted end's corner)
    for (const [x, y] of ends) expect(x > bx[0] - 2 && x < bx[2] + 2 && y > bx[1] - 2 && y < bx[3] + 2 && Math.min(Math.abs(x - bx[0]), Math.abs(x - bx[2]), Math.abs(y - bx[1]), Math.abs(y - bx[3])) < 2, `${x}, ${y} on the edge of ${said}`).toBe(true);
    expect(Math.abs(bx[3] - bx[1] - long), `${long} studs long: ${said}`).toBeLessThan(2.2);
    expect(b.info.warnings).toEqual([]);
  });
  it('there is one for each hand', () => expect(NAMES).toHaveLength(6));
});
