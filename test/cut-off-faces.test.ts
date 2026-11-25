// A bed cut along a face of the piece (a tie's end on the stud grid) goes a stud on or back, if no stud is lost by it
// (build.ts bedCut, studs.ts studsLeft).
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad, T } from '../src/geom/scad';
import { facePlanes } from '../src/geom/cutter';
import { findStuds, studsLeft } from '../src/geom/studs';
import { planCuts } from '../src/app/tiles';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import type { Route } from '../src/route/route';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

describe('bed cuts off the faces of a piece', { timeout: 600000 }, () => {
  it('studs counted whole, partial or gone', async () => {
    const s = new Scad(await kernel()), r = 2.49;
    const body = s.union([s.cube([32, 8, 3.2]), ...[4, 12, 20, 28].map((x) => T(s.cylinder(1.8, r, r, 32), [x, 4, 3.2]))]);
    const studs = findStuds(s, body, r, 1.8, 3.2, 3.2, true);
    expect(studs).toHaveLength(4);
    const at = (x: number) => { const box = T(s.cube([x + 10, 40, 40]), [-10, -10, -10]); return [s.intersection(body, box), s.difference(body, [box])]; };
    expect(studsLeft(s, studs, at(16), r)).toEqual({ whole: 4, partial: 0 });
    expect(studsLeft(s, studs, at(12), r)).toEqual({ whole: 3, partial: 1 });
    expect(studsLeft(s, studs, [s.difference(body, [T(s.cube([8, 8, 4]), [8, 0, 3.2])])], r)).toEqual({ whole: 3, partial: 0 });
    const face = facePlanes(body);
    expect([face(0, 0), face(32, 0), face(16, 0), face(8, 1)]).toEqual([true, true, false, true]);
  });
  it('the places beside a cut are a stud off, and leave no part too long or too short', () => {
    const rt: Route = { id: 'S', start: [0, 0, 0], segments: [{ kind: 'straight', length: 512 }] };
    const p = planCuts([-56, -7, 56, 519], 256, 256, 0, 0, 0, [], [rt], 44);
    expect(p.ys.length).toBeGreaterThan(0);
    for (const w of p.beside!(p.ys, 0, 1)) expect(Math.abs(w - p.ys[0])).toBe(8);
    expect(p.beside!([40], 0, 1)).not.toContain(32);
  });
  it('narrow-gauge crossing: the cut along the ties\' ends at y 288 is moved to 296', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      clearBuildCache();
      const b = buildDesign(await kernel(), structuredClone(TEMPLATES['Narrow-gauge crossing 45° right over two standard tracks']) as Design);
      // (the piece on past it: its rail ends' tongues reach 4 mm back over the cut)
      const starts = b.pieces.map((p) => { const P = p.positions; let x0 = Infinity, x1 = -Infinity, y0 = Infinity; for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); } return { x0, x1, y0 }; })
        .filter((q) => Math.abs(q.x0 - 96) < 0.1 && Math.abs(q.x1 - 160) < 0.1).map((q) => Math.round(q.y0));
      expect(starts).toContain(292);
      expect(starts).not.toContain(284);
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
