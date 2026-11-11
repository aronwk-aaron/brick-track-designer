// Curved track pieces (curves.scad), track only for now.
import { Scad, T, R } from './scad';
import { STUD, PLATE_H, RAIL_PROFILE, Track, type TrackOptions, DEFAULTS } from './track';
import type { Vec2 } from './scad';
import { connectorUnderside, sleeperUnderside } from './underside';

export interface CurveOptions extends TrackOptions {
  radiusStuds: number;
  segAng: number;        // degrees (22.5001 by default, as curves.scad)
  diverse: number;       // sleeper spacing (arc length x degrees per gap)
}

export const CURVE_DEFAULTS: CurveOptions = { ...DEFAULTS, radiusStuds: 40, segAng: 22.5001, diverse: 1800 };

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

/** A track-only curve, turning left from the origin heading +y; underneath as LEGO's (each sleeper hollow with its tubes, each end a 1 x N plate's channel). */
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
    ...sleeperAngles(o, t).map((a) => R(T(t.sleeper(), [Rm, 0, 0]), [0, 0, a])),
    T(t.fullEndpoint(true), [Rm, 4, 0]),
    R(T(R(t.fullEndpoint(true), [0, 0, 180]), [Rm, -4, 0]), [0, 0, seg]),
    T(t.startRailSupports(supportZ), [Rm, 0, 0]),
    R(T(t.endRailSupports(supportZ), [Rm, 0, 0]), [0, 0, seg]),
    T(t.supportFooting(supportZ, 0, -1), [Rm, 0, 0]),
    R(T(t.supportFooting(supportZ, 0, +1), [Rm, 0, 0]), [0, 0, seg]),
  ]);
  const sl = sleeperUnderside(s, t, -c.sleeperLen / 2, c.sleeperLen / 2, o.sleeperWidthStuds).cut, cn = connectorUnderside(s, t);
  const under = s.w.CrossSection.union([...sleeperAngles(o, t).map((a) => sl.translate([Rm, 0]).rotate(a)), cn.translate([Rm, 4]), cn.rotate(180).translate([Rm, -4]).rotate(seg)]);
  return T(s.difference(body, [T(s.extrude(under, o.studH + 0.21), [0, 0, -0.01])]), [-Rm, 0, 0]);
}
