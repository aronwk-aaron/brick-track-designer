// The switch on ballast against switch.scad (generate_ballast = true, labels
// off): volumes of OpenSCAD renders with its own routes for ballast
// (test/fixtures/switch-sets-ballast.txt, -ballast-volumes.json; pnpm
// parity switch-ballast compares the meshes).
import { setScadParity } from '../src/geom/track';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kernel, supportsOf } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { setArcMode } from '../src/geom/sweep';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchBase, switchPlan, type SetSpec } from '../src/switch/base';

setArcMode('scad');
setScadParity(true); // (the arm's end as switch.scad's; the underside is LEGO's design here, not switch.scad's sockets)
const vols = JSON.parse(readFileSync(new URL('./fixtures/switch-ballast-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
// (the anti-stud bottom is LEGO's design here: a tube only between four studs, and no socket at each stud, where
// switch.scad has a ring at every grid corner, those along the rim too, and a socket at every stud: against the
// volumes built here when that was changed, 0.36 to 0.41% (852 to 2449 mm3) less than the OpenSCAD renders'. The flat
// bottoms are switch.scad's still.)
const own = JSON.parse(readFileSync(new URL('./fixtures/switch-ballast-own-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
const lines = readFileSync(new URL('./fixtures/switch-sets-ballast.txt', import.meta.url), 'utf8').split('\n');
const cfg = (name: string) => {
  const i = lines.findIndex((l) => l.startsWith(`CFG ${name} `));
  const routes = (JSON.parse(lines[i + 1].slice(7)) as (['S', number] | ['A', number, number])[][]).map((segs, k): Route => ({
    id: String(k), start: [0, 0, 0],
    segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })),
  }));
  return { routes, sets: JSON.parse(lines[i + 2].slice(5)) as SetSpec[] };
};

describe('switch on ballast matches switch.scad', { timeout: 120000 }, () => {
  for (const [key, ref] of Object.entries(vols)) {
    const float = key.includes('float'), name = key.replace(/^ballast-(float-nobuddy-)?/, '');
    it(`${key}: volume ${ref}`, async () => {
      // (without the buddy the ballast's narrower and switch.scad's routes shorter: its own, where it has them)
      const { routes, sets } = float && lines.some((l) => l.startsWith(`CFG float-nobuddy-${name} `)) ? cfg(`float-nobuddy-${name}`) : cfg(name);
      const p = { ...BASE_DEFAULTS, generateBallast: true, ...(float ? { bottomStyle: 'float' as const, ballastBuddy: false } : {}) };
      // (with its breakaway supports unioned in, as switch.scad's: here they're carried with the base, not part of its solid)
      const base = switchBase(new Scad(await kernel()), switchPlan(routes, sets, p, name.startsWith('right') ? -1 : 1)), sp = supportsOf(base), v = (sp ? base.add(sp) : base).volume();
      // (the wye with the buddy differs by 0.04% where its two routes' buddies meet; the right switch and the
      // three-way on a float bottom by 0.006% and 0.011%, 14 and 41 mm3)
      const tol = name.startsWith('wye') && !float ? 6e-4 : float && /^(right|threeway)/.test(name) ? 2e-4 : 5e-5;
      if (float) expect(Math.abs(v - ref) / ref).toBeLessThan(tol);
      else { expect(Math.abs(v - own[key]) / own[key], `built ${v.toFixed(1)} mm3`).toBeLessThan(5e-5); expect(v).toBeLessThan(ref); expect((ref - v) / ref).toBeLessThan(0.012); }
    });
  }
});
