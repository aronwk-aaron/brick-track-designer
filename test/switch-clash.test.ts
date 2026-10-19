// The moving parts against the base and each other, in both positions (the
// OpenSCAD intersection suite, ported in scripts/clash.ts). Only the two
// designed contacts may overlap: the slider's tongue pressed between the
// spring tines (the preload), and the lever's detent bump riding over the
// ear between its dimples at the middle of the swing. The catches must hold.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Route, Segment } from '../src/route/route';
import type { SetSpec } from '../src/switch/base';
import { clashes } from '../scripts/clash';

const lines = readFileSync(new URL('./fixtures/switch-sets.txt', import.meta.url), 'utf8').split('\n');
const cfg = (name: string) => {
  const i = lines.findIndex((l) => l.startsWith(`CFG ${name} `));
  const routes = (JSON.parse(lines[i + 1].slice(7)) as (['S', number] | ['A', number, number])[][]).map((segs, k): Route => ({
    id: String(k), start: [0, 0, 0],
    segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })),
  }));
  return { routes, sets: JSON.parse(lines[i + 2].slice(5)) as SetSpec[] };
};

describe('switch moving parts: no clashes but the designed ones', () => {
  for (const name of ['left-R40-s_curve', 'right-R24-arc', 'wye-R40-arc', 'threeway-R40-arc'])
    it(name, async () => {
      const { routes, sets } = cfg(name);
      const r = await clashes(routes, sets, name.startsWith('right') ? -1 : 1);
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('catch')) expect(v, k).toBeGreaterThan(0.1);
        else if (k.startsWith('points x throw')) expect(v, k).toBeLessThan(3);        // tongue between the tines
        else if (k.startsWith('base x lever, middle')) expect(v, k).toBeLessThan(0.3); // detent bump over the ear
        else expect(v, k).toBeLessThan(1e-3);
      }
    }, 120000);
});
