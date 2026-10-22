// Routes: the path a track takes, as straight and arc segments from a start
// pose (switch.scad's route maths, ported).
//
// Units: mm and degrees. A pose is [x, y, heading]: heading 0 = +y, positive
// = turned left. Offsets across a route are positive to the right.

export type Segment =
  | { kind: 'straight'; length: number }
  | { kind: 'arc'; radius: number; angle: number }; // angle signed, + = left

export type Pose = [number, number, number];
export type Pt = [number, number];

export interface Route {
  id: string;
  start: Pose;
  segments: Segment[];
  /** (editor) a branch's lever side, if set per switch */
  throwSide?: 'auto' | 'left' | 'right';
  /**
   * (sleepers) the whole route this is a stretch of, so its sleepers fall where the whole route's do: where this one
   * starts along it (s0), its length (L), and whether each of its ends runs on into another route (in0, in1)
   */
  sleeperFrame?: { s0: number; L: number; in0: boolean; in1: boolean };
  /** (monorail) the beam's height off the baseplate, mm (left out: the settings' support height, or on the baseplate) */
  elev?: number;
  /** (monorail) its height at its end, mm, if it ramps (left out: level at elev) */
  elevEnd?: number;
  /** (editor) bridge guard rails and a dual-gauge third rail along it (geom/extrarails.ts); unset: none */
  extra?: ExtraRails;
}

export type RouteEnds = 'none' | 'start' | 'end' | 'both';
/**
 * A route's extra rails (straight.scad / curves.scad's guard_* and dual_*
 * settings), and which stretch of the route as drawn this route is, so a
 * route cut up (tiles, sections, a self-crossing) or turned round still has
 * them where they were and "start" / "end" still mean the drawn route's.
 */
export interface ExtraRails {
  guard: boolean;
  guardEnds: RouteEnds;     // which drawn ends the guard rails come to a point at
  guardGapStuds: number;    // gap from each running rail's head
  guardTaperStuds: number;  // each pointed end's length
  guardShape: 'straight' | 'curve';
  guardRampStuds: number;   // the point's nose ramp (0: none)
  dual: boolean;
  dualStuds: number;        // the narrow gauge (studs between its rails)
  dualShared: 'right' | 'left'; // the running rail both gauges use (right / left of the route as drawn)
  dualPlainEnds: RouteEnds; // drawn ends meeting plain track: the third rail stops short there
  /** arc lengths along the drawn route at this route's start and end (from > to: it runs the other way), and the drawn route's length */
  from: number; to: number; len: number;
  /** where along the drawn route they may run (clear of other routes), drawn arc lengths; unset: worked out from the routes in the piece */
  clear?: [number, number][];
}

/** The extra rails of a route's stretch s0..s1 (subRoute), or of it turned round. */
export function subExtra(x: ExtraRails | undefined, s0: number, s1: number): ExtraRails | undefined {
  if (!x) return undefined;
  const d = x.to >= x.from ? 1 : -1;
  return { ...x, from: x.from + d * s0, to: x.from + d * s1 };
}
export const reversedExtra = (x: ExtraRails | undefined): ExtraRails | undefined => (x ? { ...x, from: x.to, to: x.from } : undefined);

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sind = (d: number) => Math.sin(rad(d));
const cosd = (d: number) => Math.cos(rad(d));

export const segLength = (sg: Segment) => (sg.kind === 'straight' ? sg.length : (Math.abs(sg.angle) * Math.PI * sg.radius) / 180);
export const routeLength = (rt: Route) => rt.segments.reduce((a, sg) => a + segLength(sg), 0);

/** The first l of a segment. */
function subSeg(sg: Segment, l: number): Segment {
  return sg.kind === 'straight' ? { kind: 'straight', length: l } : { kind: 'arc', radius: sg.radius, angle: (Math.sign(sg.angle) * l * 180) / (Math.PI * sg.radius) };
}

/** The pose after following a segment from p (pose_after). */
export function poseAfter(p: Pose, sg: Segment): Pose {
  if (sg.kind === 'straight') return [p[0] - sg.length * sind(p[2]), p[1] + sg.length * cosd(p[2]), p[2]];
  const r = sg.radius, a = sg.angle, sn = Math.sign(a);
  const cx = p[0] - sn * r * cosd(p[2]), cy = p[1] - sn * r * sind(p[2]);
  return [cx + sn * r * cosd(p[2] + a), cy + sn * r * sind(p[2] + a), p[2] + a];
}

/** Arc length at the start of each segment. */
export function segStarts(rt: Route): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const sg of rt.segments) { out.push(acc); acc += segLength(sg); }
  return out;
}

/** The pose at arc length s along a route (route_pose); clamped to its ends. */
export function routePose(rt: Route, s: number): Pose {
  let p = rt.start;
  for (const sg of rt.segments) {
    const l = segLength(sg);
    if (s <= l) return poseAfter(p, subSeg(sg, Math.max(0, s)));
    s -= l;
    p = poseAfter(p, sg);
  }
  return p;
}

/** The point at arc length s, offset o to the right of the centre line (rail_point). */
export function railPoint(rt: Route, s: number, o: number): Pt {
  const p = routePose(rt, s);
  return [p[0] + o * cosd(p[2]), p[1] + o * sind(p[2])];
}

/** Signed offset (+ = right) of pt from a segment starting at pose p0, or undefined if pt isn't beside it. */
function segLat(p0: Pose, sg: Segment, pt: Pt): number | undefined {
  const dx = pt[0] - p0[0], dy = pt[1] - p0[1];
  const lx = dx * cosd(p0[2]) + dy * sind(p0[2]);
  const ly = -dx * sind(p0[2]) + dy * cosd(p0[2]);
  if (sg.kind === 'straight') return ly >= -0.01 && ly <= sg.length + 0.01 ? lx : undefined;
  const r = sg.radius, a = sg.angle;
  if (a > 0) {
    const phi = deg(Math.atan2(ly, lx + r));
    return phi >= -0.01 && phi <= a + 0.01 ? Math.hypot(lx + r, ly) - r : undefined;
  }
  const phi = deg(Math.atan2(ly, r - lx));
  return phi >= -0.01 && phi <= -a + 0.01 ? r - Math.hypot(lx - r, ly) : undefined;
}

/** Signed offset (+ = right) of pt from a route's centre line, on the segment it's nearest beside (route_lat); 1e6 if none. */
export function routeLat(rt: Route, pt: Pt): number {
  const sp = startPoses(rt);
  let best = 1e6;
  rt.segments.forEach((sg, i) => {
    const v = segLat(sp[i], sg, pt);
    if (v !== undefined && Math.abs(v) < Math.abs(best)) best = v;
  });
  return best;
}

// (each segment's start pose, kept per route: routeLat is called a great many
// times on the same routes; worked out again if the route is changed)
const startCache = new WeakMap<Route, { start: Pose; segments: Segment[]; n: number; poses: Pose[] }>();
function startPoses(rt: Route): Pose[] {
  const c = startCache.get(rt);
  if (c && c.start === rt.start && c.segments === rt.segments && c.n === rt.segments.length) return c.poses;
  const poses: Pose[] = [];
  let p = rt.start;
  for (const sg of rt.segments) { poses.push(p); p = poseAfter(p, sg); }
  startCache.set(rt, { start: rt.start, segments: rt.segments, n: rt.segments.length, poses });
  return poses;
}

/** Arc length along a route of the point on its centre line level with pt (route_s_of). */
export function routeSOf(rt: Route, pt: Pt, lo = 0, hi = -1, n = 40): number {
  const h = hi < 0 ? routeLength(rt) : hi, mid = (lo + h) / 2;
  if (n === 0) return mid;
  const p = routePose(rt, mid);
  const ahead = (pt[0] - p[0]) * -sind(p[2]) + (pt[1] - p[1]) * cosd(p[2]);
  return ahead > 0 ? routeSOf(rt, pt, mid, h, n - 1) : routeSOf(rt, pt, lo, mid, n - 1);
}

/** A route's rail at offset o, sampled every step mm: [s, x, y] points. */
export function railPolyline(rt: Route, o: number, step = 0.5): [number, number, number][] {
  const L = routeLength(rt), n = Math.max(1, Math.ceil(L / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = (L * i) / n;
    const p = railPoint(rt, s, o);
    return [s, p[0], p[1]];
  });
}
