// Straight track pieces (straight.scad), track only for now.
import { Scad, T, R } from './scad';
import { STUD, Track, type TrackOptions, DEFAULTS } from './track';
import { connectorUnderside, sleeperUnderside } from './underside';

export interface StraightOptions extends TrackOptions {
  lengthStuds: number;
  sleeperGapStuds: number;  // 2 = LEGO's
  supports?: boolean;       // breakaway print supports (default on)
}

export const STRAIGHT_DEFAULTS: StraightOptions = { ...DEFAULTS, lengthStuds: 16, sleeperGapStuds: 2 };

/** Sleeper centres (y), on the stud grid (sleeper_js in straight.scad). */
export function sleeperYs(o: StraightOptions): number[] {
  const sp = o.sleeperGapStuds + o.sleeperWidthStuds;
  const jMin = 1 + o.sleeperGapStuds + o.sleeperWidthStuds / 2;
  const jMax = o.lengthStuds - jMin;
  if (jMax < jMin) return [];
  const n = Math.floor((jMax - jMin) / sp) + 1;
  const j0 = jMin + Math.floor(((jMax - jMin) - (n - 1) * sp) / 2);
  return Array.from({ length: n }, (_, i) => (j0 + i * sp) * STUD);
}

/** A track-only straight: rails, sleepers, end connectors, breakaway supports; underneath as LEGO's (each sleeper hollow with its tubes, each end a 1 x N plate's channel). */
export function straightTrackOnly(s: Scad, o: StraightOptions = STRAIGHT_DEFAULTS) {
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  const L = o.lengthStuds * STUD, endTrim = 4, supportZ = -0.02;
  const body = s.union([
    ...[-g, g].map((x) => t.railStraight(x, endTrim, L - endTrim)),
    ...sleeperYs(o).map((y) => T(t.sleeper(), [0, y, 0])),
    T(t.fullEndpoint(true), [0, 4, 0]),
    T(R(t.fullEndpoint(true), [0, 0, 180]), [0, L - 4, 0]),
    ...(o.supports === false ? [] : [
      t.startRailSupports(supportZ),
      T(t.endRailSupports(supportZ), [0, L, 0]),
      t.supportFooting(supportZ, 0, -1),
      t.supportFooting(supportZ, L, +1),
    ]),
  ]);
  const sl = sleeperUnderside(s, t, -c.sleeperLen / 2, c.sleeperLen / 2, o.sleeperWidthStuds).cut, cn = connectorUnderside(s, t);
  const under = s.w.CrossSection.union([...sleeperYs(o).map((y) => sl.translate([0, y])), cn.translate([0, 4]), cn.rotate(180).translate([0, L - 4])]);
  return s.difference(body, [T(s.extrude(under, o.studH + 0.21), [0, 0, -0.01])]);
}
