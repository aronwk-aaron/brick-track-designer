// Writes plan views of example layouts to parity/out/plan-*.svg.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Route } from '../src/route/route';
import { solve } from '../src/route/solver';
import { planSvg } from '../src/route/plan';

const S = (id: string, start: Route['start'], len: number): Route => ({ id, start, segments: [{ kind: 'straight', length: len }] });
const rad = (d: number) => (d * Math.PI) / 180;
const examples: Record<string, Route[]> = {
  'left-switch-s': [S('S', [0, 0, 0], 256), { id: 'L', start: [0, 0, 0], segments: [{ kind: 'arc', radius: 320, angle: 36.8699 }, { kind: 'arc', radius: 320, angle: -14.3699 }] }],
  'cross-90': [S('A', [0, -96, 0], 192), S('B', [96, 0, 90], 192)],
  'cross-22.5': [S('A', [0, -160, 0], 320), S('B', [160 * Math.sin(rad(22.5)), -160 * Math.cos(rad(22.5)), 22.5], 320)],
  'cross-on-curve': [{ id: 'C', start: [0, -120, 0], segments: [{ kind: 'arc', radius: 320, angle: 45 }] }, S('B', [120, 0, 90], 300)],
  'three-tracks': [S('A', [0, -160, 0], 320), S('B', [160 * Math.sin(rad(22.5)), -160 * Math.cos(rad(22.5)), 22.5], 320), S('C', [-160 * Math.sin(rad(22.5)), -160 * Math.cos(rad(22.5)), -22.5], 320)],
};
mkdirSync('parity/out', { recursive: true });
for (const [name, routes] of Object.entries(examples)) {
  const sol = solve(routes);
  writeFileSync(`parity/out/plan-${name}.svg`, planSvg(routes, sol));
  console.log(name, `crossings ${sol.crossings.length}, grooves ${sol.grooves.length}, check rails ${sol.checkRails.length}, splits ${sol.splits.length}`);
}
