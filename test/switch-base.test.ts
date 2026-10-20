// The track-only switch base against switch.scad's switch_base(): volumes
// from OpenSCAD renders of the same routes and sets (pnpm parity switch-base
// writes the meshes; test/fixtures/switch-base-volumes.json keeps their
// volumes). The full comparison, column by column, is in scripts/parity.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchBase, switchPlan, type SetSpec } from '../src/switch/base';
import { setArcMode } from '../src/geom/sweep';
setArcMode('scad'); // (OpenSCAD's arc pieces, to compare mesh for mesh)

const vols = JSON.parse(readFileSync(new URL('./fixtures/switch-base-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
const lines = readFileSync(new URL('./fixtures/switch-sets.txt', import.meta.url), 'utf8').split('\n');
const cfg = (name: string) => {
  const i = lines.findIndex((l) => l.startsWith(`CFG ${name} `));
  const routes = (JSON.parse(lines[i + 1].slice(7)) as (['S', number] | ['A', number, number])[][]).map((segs, k): Route => ({
    id: String(k), start: [0, 0, 0],
    segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })),
  }));
  return { routes, sets: JSON.parse(lines[i + 2].slice(5)) as SetSpec[] };
};

describe('track-only switch base matches switch.scad', { timeout: 60000 }, () => {
  for (const [key, ref] of Object.entries(vols)) {
    const tubes = key.endsWith('-tubes'), name = key.replace(/-tubes$/, '');
    it(`${key}: volume ${ref}`, async () => {
      const { routes, sets } = cfg(name);
      const plan = switchPlan(routes, sets, { ...BASE_DEFAULTS, studGrip: tubes ? 'edges' : 'all' }, name.startsWith('right') ? -1 : 1);
      // (a three-way at R104 puts its second points set into the first one's:
      // switch.scad builds it with the parts clashing; here it's a warning)
      if (name === 'threeway-R104-arc') { expect(plan.warnings.join()).toMatch(/overlap/); return; }
      expect(plan.warnings.filter((w) => /overlap/.test(w))).toHaveLength(0);
      const v = switchBase(new Scad(await kernel()), plan).volume();
      // (the tube underside of a wye differs by 0.1%: OpenSCAD cuts the
      // frog's rails a little more there. On a three-way the first set's
      // rails are cut clear of the second set's heel bar and tines, which
      // switch.scad leaves in the way: up to 0.45% less. See PHASE3.md.)
      // (and the tube underside drops the tubes switch.scad leaves loose,
      // under gaps between ties or pockets: up to 2.5% less)
      if (name.startsWith('threeway') || tubes) {
        expect(v).toBeLessThan(ref);
        expect((ref - v) / ref).toBeLessThan(tubes ? 2.5e-2 : 5e-3);
      } else expect(Math.abs(v - ref) / ref).toBeLessThan(5e-5);
    });
  }
});
