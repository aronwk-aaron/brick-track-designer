// The track-only switch base against switch.scad's switch_base(): volumes
// from OpenSCAD renders of the same routes and sets (pnpm parity switch-base
// writes the meshes; test/fixtures/switch-base-volumes.json keeps their
// volumes). The full comparison, column by column, is in scripts/parity.ts.
import { setScadParity } from '../src/geom/track';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kernel, supportsOf } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchBase, switchPlan, type SetSpec } from '../src/switch/base';
import { setArcMode } from '../src/geom/sweep';
setArcMode('scad'); // (OpenSCAD's arc pieces, to compare mesh for mesh)
setScadParity(true); // (the arm's end as switch.scad's; the underside is LEGO's design here, not switch.scad's sockets)

const vols = JSON.parse(readFileSync(new URL('./fixtures/switch-base-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
// (the underside is LEGO's design here (hollow inside a wall, anti-stud tubes; no socket for a stud of its own), not
// switch.scad's square socket at every stud: against the volumes built here when that was changed, which are the
// OpenSCAD renders' less 7.9 to 11.8% (2821 to 9434 mm3) for its socket grid, and 0.1 to 1.3% (70 to 592 mm3) less
// than its tube underside (-tubes: no tubes here on the ties the base is cut through). The rest of the base is still
// switch.scad's.)
const own = JSON.parse(readFileSync(new URL('./fixtures/switch-base-own-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
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
      // (as switch.scad's, with its breakaway supports unioned in: here they're carried with the base, not part of its
      // solid; where one runs into the base, as at R24, switch.scad's are one with it)
      const base = switchBase(new Scad(await kernel()), plan), sp = supportsOf(base), v = (sp ? base.add(sp) : base).volume();
      expect(Math.abs(v - own[key]) / own[key], `built ${v.toFixed(1)} mm3`).toBeLessThan(5e-5);
      // (and by switch.scad's: hollow, so less than its socket grid, by no more than 14.5%; within 4% of its tube underside)
      expect(v).toBeLessThan(ref);
      expect((ref - v) / ref).toBeLessThan(tubes ? 4e-2 : 0.145);
    });
  }
});
