// Every warning the build gives has a design that brings it up, and a design like it that doesn't (warnings-*.test.ts,
// by what they're about): a warning that stopped firing, or fired on everything, would go unnoticed otherwise.
import { expect } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import type { Design, DRoute, PieceOptions } from '../src/app/design';

type Seg = DRoute['segs'][number];
export const S = (studs: number): Seg => ({ kind: 'straight', studs });
export const C = (radius: number, angle: number, more: Partial<Seg> = {}): Seg => ({ kind: 'curve', radius, angle, ...more } as Seg);
export const R = (name: string, x: number, y: number, heading: number, segs: Seg[], more: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading, segs, ...more });
export const D = (routes: DRoute[], options: Partial<PieceOptions> = {}, more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, routes, options, ...more });
/** an ordinary switch (LEGO's geometry), and a three-way */
export const SWITCH = () => [R('Straight', 0, 0, 0, [S(32)]), R('Branch', 0, 0, 0, [C(40, 36.8699), C(40, -14.3699)])];
export const THREE_WAY = () => [R('Straight', 0, 0, 0, [S(28)]), R('Left', 0, 0, 0, [C(40, 22.5), S(14)]), R('Right', 0, 0, 0, [C(40, -22.5), S(14)])];
export const MONO = { system: 'monorail' as const };

/** The design's warnings (and the build's result). */
export async function warningsOf(d: Design) {
  const w = await kernel();
  clearBuildCache();
  try { const b = buildDesign(w, structuredClone(d)); return { warnings: b.info.warnings as string[], issues: b.overlay.issues, pieces: b.pieces }; } finally { clearBuildCache(); }
}

/** The warning (what) comes up on the design, and not on the other one (clean), which builds too. */
export async function fires(what: RegExp, on: Design, clean: Design) {
  const a = await warningsOf(on);
  expect(a.warnings.filter((s) => what.test(s)), `on the design that should bring it up (its warnings: ${a.warnings.join(' | ') || 'none'})`).not.toHaveLength(0);
  const b = await warningsOf(clean);
  expect(b.warnings.filter((s) => what.test(s)), 'on the design that shouldn\'t').toHaveLength(0);
  expect(b.pieces.length).toBeGreaterThan(0);
  return a;
}
