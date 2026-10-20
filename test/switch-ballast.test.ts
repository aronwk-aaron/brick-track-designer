// The switch on ballast against switch.scad (generate_ballast = true, labels
// off): volumes of OpenSCAD renders with its own routes for ballast
// (test/fixtures/switch-sets-ballast.txt, -ballast-volumes.json; pnpm
// parity switch-ballast compares the meshes).
import { setScadParity } from '../src/geom/track';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { setArcMode } from '../src/geom/sweep';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchBase, switchPlan, type SetSpec } from '../src/switch/base';

setArcMode('scad');
setScadParity(true); // (and its square stud sockets, and the arm's end as switch.scad's)
const vols = JSON.parse(readFileSync(new URL('./fixtures/switch-ballast-volumes.json', import.meta.url), 'utf8')) as Record<string, number>;
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
      const { routes, sets } = cfg(name);
      const p = { ...BASE_DEFAULTS, generateBallast: true, ...(float ? { bottomStyle: 'float' as const, ballastBuddy: false } : {}) };
      const v = switchBase(new Scad(await kernel()), switchPlan(routes, sets, p, name.startsWith('right') ? -1 : 1)).volume();
      // (the wye with the buddy differs by 0.04% where its two routes' buddies meet)
      expect(Math.abs(v - ref) / ref).toBeLessThan(name.startsWith('wye') && !float ? 6e-4 : 5e-5);
    });
  }
});
