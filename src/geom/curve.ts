// Curved track pieces (curves.scad), track only for now.
import { Scad, T, R } from './scad';
import { STUD, PLATE_H, RAIL_PROFILE, Track, type TrackOptions, DEFAULTS } from './track';
import type { Vec2 } from './scad';

export interface CurveOptions extends TrackOptions {
  radiusStuds: number;
  segAng: number;        // degrees (22.5001 by default, as curves.scad)
  diverse: number;       // sleeper spacing (arc length x degrees per gap)
  antistudGrid: 'start' | 'end';
}

export const CURVE_DEFAULTS: CurveOptions = { ...DEFAULTS, radiusStuds: 40, segAng: 22.5001, diverse: 1800, antistudGrid: 'start' };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const arcDeg = (len: number, r: number) => deg(len / r);
/** OpenSCAD's round(): halves away from zero. */
const round = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
/** arc_fn(r): OpenSCAD $fn for an arc of radius r. */
const arcFn = (r: number) => Math.min(9 * r, 1800);
/** Fragments OpenSCAD's rotate_extrude uses for angle degrees at $fn. */
const fragments = (fn: number, angle: number) => Math.ceil(Math.max((fn * Math.abs(angle)) / 360, 1));

/** Sleeper angles along the arc (sleeper_angles in curves.scad). */
export function sleeperAngles(o: CurveOptions, t: Track): number[] {
  const r = o.radiusStuds * STUD, seg = o.segAng;
  const minPitch = t.c.sleeperW + STUD;
  const g = Math.min(round((r * seg) / o.diverse), Math.max(1, Math.floor(seg / arcDeg(minPitch, r))));
  return Array.from({ length: Math.max(0, g - 1) }, (_, i) => ((i + 1) * seg) / g);
}

/** Grid points under the piece (grid_pts in curves.scad), in the arc's frame. */
function gridPts(o: CurveOptions, w: number, off: number, m: number): Vec2[] {
  const R0 = o.radiusStuds * STUD, seg = o.segAng;
  const r0 = R0 - w / 2, r1 = R0 + w / 2;
  const u0 = Math.floor((r0 * Math.cos(rad(seg)) - R0) / STUD) - 1;
  const u1 = Math.ceil(w / 2 / STUD) + 1;
  const v1 = Math.ceil((r1 * Math.sin(rad(seg))) / STUD) + 1;
  const pts: Vec2[] = [];
  for (let i = u0; i <= u1; i++)
    for (let j = 0; j <= v1; j++) {
      const u = off + i * STUD, v = off + j * STUD;
      const p: Vec2 = o.antistudGrid === 'end'
        ? [(R0 + u) * Math.cos(rad(seg)) + v * Math.sin(rad(seg)), (R0 + u) * Math.sin(rad(seg)) - v * Math.cos(rad(seg))]
        : [R0 + u, v];
      const r = Math.hypot(p[0], p[1]), a = deg(Math.atan2(p[1], p[0]));
      if (r > r0 - m && r < r1 + m && a > -arcDeg(m, r0) && a < seg + arcDeg(m, r0)) pts.push(p);
    }
  return pts;
}

/** A track-only curve, turning left from the origin heading +y. */
export function curveTrackOnly(s: Scad, o: CurveOptions = CURVE_DEFAULTS) {
  const t = new Track(s, o), c = t.c, g = c.railOffset;
  const Rm = o.radiusStuds * STUD, seg = o.segAng, supportZ = -0.02;
  const segs = fragments(arcFn(Rm), seg);
  // Rails: the profile at R -+ g, swept round the centre, trimmed 4mm at each end.
  const rails = s.union([-g, g].map((x) =>
    s.polygon(RAIL_PROFILE.map(([px, py]) => [px + Rm + x, py] as Vec2)).revolve(segs, seg)));
  const trimW = c.sleeperLen + 2 * STUD;
  const trimmed = s.difference(T(rails, [0, 0, PLATE_H]), [
    T(s.cube([trimW, 4, 20]), [Rm - trimW / 2, 0, 0]),
    R(T(R(s.cube([trimW, 4, 20]), [0, 0, 180]), [Rm + trimW / 2, 0, 0]), [0, 0, seg]),
  ]);
  const body = s.union([
    trimmed,
    ...sleeperAngles(o, t).map((a) => R(T(t.sleeper(false), [Rm, 0, 0]), [0, 0, a])),
    T(t.fullEndpoint(true, true), [Rm, 4, 0]),
    R(T(R(t.fullEndpoint(true, true), [0, 0, 180]), [Rm, -4, 0]), [0, 0, seg]),
    T(t.startRailSupports(supportZ), [Rm, 0, 0]),
    R(T(t.endRailSupports(supportZ), [Rm, 0, 0]), [0, 0, seg]),
    T(t.supportFooting(supportZ, 0, -1), [Rm, 0, 0]),
    R(T(t.supportFooting(supportZ, 0, +1), [Rm, 0, 0]), [0, 0, seg]),
  ]);
  const w = c.sleeperLen + 4 * STUD;  // bottom layer: the buddy's width
  const turn = o.antistudGrid === 'end' ? seg : 0;
  const sockets = gridPts(o, w, STUD / 2, 4).map((p) => T(R(t.studSocket(o.studH + 0.21), [0, 0, turn]), [p[0], p[1], -0.01]));
  return T(s.difference(body, sockets), [-Rm, 0, 0]);
}
