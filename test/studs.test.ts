import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { Scad } from '../src/geom/scad';
import { CROSSING_DEFAULTS, crossingPiece } from '../src/geom/crossing';
import { cutPiece } from '../src/geom/cutter';
import { Track } from '../src/geom/track';
import { findStuds, wholeStuds } from '../src/geom/studs';
import { PLATE_H } from '../src/geom/track';
import { toRoutes, type Design } from '../src/app/design';

describe('no split studs', { timeout: 120000 }, () => {
  it('a curve with studs along it, cut straight across them: none split; given back, each whole on one part', async () => {
    const s = new Scad(await kernel()), o = { ...CROSSING_DEFAULTS, curveStuds: 'follow' as const }, t = new Track(s, o);
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }] };
    const routes = toRoutes(d), body = crossingPiece(s, routes, o);
    const r = t.c.postD / 2, h = t.o.studH, studs = findStuds(s, body, r, h, PLATE_H, PLATE_H);
    expect(studs.length).toBeGreaterThan(20);
    // (a line on the grid, across the curve where its studs, in rows along it, are off the grid)
    const cut = cutPiece(s, t, body, routes, [{ p: [0, 120], d: [1, 0] }]);
    expect(cut.length).toBe(2);
    const split = (ps: typeof cut) => studs.filter((st) => ps.some((p) => {
      const a = p.slice(st.mid).intersect(s.w.CrossSection.circle(r + 0.05, 32).translate(st.c)).area();
      return a > 0.02 * Math.PI * r * r && a < 0.97 * Math.PI * r * r;
    })).length;
    expect(split(cut)).toBeGreaterThan(0);
    expect(split(wholeStuds(s, studs, cut, r, h))).toBe(0);
    // (given back whole: each on one part, none lost)
    const fixed = wholeStuds(s, studs, cut, r, h, true);
    expect(split(fixed)).toBe(0);
    // (and none lost: each stud whole on one part)
    const whole = (st: (typeof studs)[number]) => fixed.filter((p) => p.slice(st.mid).intersect(s.w.CrossSection.circle(r + 0.05, 32).translate(st.c)).area() >= 0.97 * Math.PI * r * r).length;
    for (const st of studs) expect(whole(st)).toBe(1);
  });
});
