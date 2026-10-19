// Straight track pieces (straight.scad), track only for now.
import { Scad, T, R } from './scad';
import { STUD, Track, type TrackOptions, DEFAULTS } from './track';

export interface StraightOptions extends TrackOptions {
  lengthStuds: number;
  sleeperGapStuds: number;  // 2 = LEGO's
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

/** A track-only straight: rails, sleepers, end connectors, breakaway supports, stud sockets. */
export function straightTrackOnly(s: Scad, o: StraightOptions = STRAIGHT_DEFAULTS) {
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  const L = o.lengthStuds * STUD, endTrim = 4, supportZ = -0.02;
  const body = s.union([
    ...[-g, g].map((x) => t.railStraight(x, endTrim, L - endTrim)),
    ...sleeperYs(o).map((y) => T(t.sleeper(false), [0, y, 0])),
    T(t.fullEndpoint(true, true), [0, 4, 0]),
    T(R(t.fullEndpoint(true, true), [0, 0, 180]), [0, L - 4, 0]),
    t.startRailSupports(supportZ),
    T(t.endRailSupports(supportZ), [0, L, 0]),
    t.supportFooting(supportZ, 0, -1),
    t.supportFooting(supportZ, L, +1),
  ]);
  const sockets = [];
  for (let x = -c.sleeperLen / 2 - 4; x <= c.sleeperLen / 2 + 4 + 1e-9; x += STUD)
    for (let y = 4; y <= L + 1e-9; y += STUD)
      sockets.push(T(t.studSocket(o.studH + 0.21), [x, y, -0.01]));
  return s.difference(body, sockets);
}
