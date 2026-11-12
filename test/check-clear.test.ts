// A check rail never runs over or into a set of points' moving parts: it stops CHECK_CLEAR (1 mm) short of the blades
// wherever they swing (geom/crossing.ts checkRails, cut back from the ends). Found: the R104 double slips' crossing check
// rails ran up to their next points' blades, 0.7 mm2 of rail within a millimetre of them.
// Looked at in plan: the track's rails at their webs' height in a band along each check rail the build drew, against
// each blade turned across its swing (and each slider slid across its travel), grown by the clearance.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const CLEAR = 1;

describe('check rails stop short of the points\' moving parts', { timeout: 600000 }, () => {
  for (const name of ['Double slip R104 left', 'Double slip R104 right', 'Double slip R40 45°', 'Single slip R40 45°']) it(name, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(TEMPLATES[name])), W = w.CrossSection;
      const rails = W.union(b.pieces.filter((p) => !p.lego && !p.turn && !p.slide && !p.hinge && /track|base/.test(p.name)).map((p) => solid(w, p.positions)!.slice(6.5)));
      const moving = b.pieces.filter((p) => p.turn?.swing || p.slide).map((p) => {
        const m = solid(w, p.positions)!, steps = p.turn?.swing ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
        return { name: p.name, cs: W.union(steps.map((f) => (p.turn?.swing ? m.translate([-p.turn.at[0], -p.turn.at[1], 0]).rotate([0, 0, p.turn.swing * f]).translate([p.turn.at[0], p.turn.at[1], 0])
          : m.translate([p.slide!.dir[0] * p.slide!.by * f, p.slide!.dir[1] * p.slide!.by * f, 0])).project())).offset(CLEAR, 'Round', 2, 16) };
      });
      const bad: string[] = [];
      for (const line of b.overlay.checkRails) {
        const band = W.union(line.slice(1).flatMap((q, j) => { const a = line[j], L = Math.hypot(q[0] - a[0], q[1] - a[1]); return L < 1e-6 ? [] : [W.square([L + 6, 5.2]).translate([-3, -2.6]).rotate((Math.atan2(q[1] - a[1], q[0] - a[0]) * 180) / Math.PI).translate(a)]; })).intersect(rails);
        for (const mv of moving) { const a = band.intersect(mv.cs).area(); if (a > 0.05) bad.push(`the check rail from ${line[0].map((v) => v.toFixed(0))} is within ${CLEAR} mm of ${mv.name}: ${a.toFixed(2)} mm2`); }
      }
      expect(bad).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
