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
}

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
  const st = segStarts(rt);
  let best = 1e6;
  rt.segments.forEach((sg, i) => {
    const v = segLat(routePose(rt, st[i]), sg, pt);
    if (v !== undefined && Math.abs(v) < Math.abs(best)) best = v;
  });
  return best;
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
